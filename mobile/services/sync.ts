import { Q } from '@nozbe/watermelondb';
import { synchronize } from '@nozbe/watermelondb/sync';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useAuthStore } from '../stores/useAuthStore';
import database from '@/components/data/db';
import { schema } from '@/components/data/db/schema';

import { supabase, supabaseKey, supabaseUrl } from './supabaseClient';

export { supabase };

let memoizedClientId = '';
export function getClientId(): string {
  if (!memoizedClientId) {
    memoizedClientId =
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  return memoizedClientId;
}

const PUSH_TABLE_ORDER = [
  'businesses',
  'employees',
  'products',
  'orders',
  'order_items',
  'inventory_logs',
] as const;

type SyncTableName = (typeof PUSH_TABLE_ORDER)[number];
type TableChanges = {
  created?: unknown[];
  updated?: unknown[];
  deleted?: unknown[];
};
type SyncChanges = Partial<Record<SyncTableName, TableChanges>>;

function tableHasChanges(slice: TableChanges | undefined): boolean {
  if (!slice) return false;
  return (
    (slice.created?.length ?? 0) > 0 ||
    (slice.updated?.length ?? 0) > 0 ||
    (slice.deleted?.length ?? 0) > 0
  );
}

type PullRecord = { id: string; created_at?: number; updated_at?: number };

/**
 * With sendCreatedAsUpdated, Watermelon expects every non-deleted remote row in
 * `updated`. Merge both buckets so creates/updates apply without diagnostic errors
 * when another device pushed the row or a deferred sync replays the same pull.
 */
function normalizePulledChanges(changes: SyncChanges): SyncChanges {
  const normalized: SyncChanges = { ...changes };

  for (const table of PUSH_TABLE_ORDER) {
    const slice = normalized[table];
    if (!slice) continue;

    const merged = new Map<string, PullRecord>();
    for (const raw of [...(slice.created ?? []), ...(slice.updated ?? [])] as PullRecord[]) {
      merged.set(raw.id, raw);
    }

    if (merged.size === 0 && !slice.deleted?.length) continue;

    normalized[table] = {
      ...slice,
      created: [],
      updated: Array.from(merged.values()),
    };
  }

  return normalized;
}

async function pushChangesInOrder(changes: SyncChanges, clientBusinessId: string): Promise<void> {
  for (const table of PUSH_TABLE_ORDER) {
    const slice = changes[table];
    if (!tableHasChanges(slice)) continue;

    const { error } = await supabase.rpc('push_watermelondb_changes', {
      changes: { [table]: slice },
      client_business_id: clientBusinessId,
    });
    if (error) throw new Error(`push ${table}: ${error.message}`);
  }
}

type PushRow = Record<string, unknown> & { id: string };

function rowsOf(slice: TableChanges | undefined): PushRow[] {
  return [...(slice?.created ?? []), ...(slice?.updated ?? [])] as PushRow[];
}

/** business_id of local parent rows, keyed by parent id. Deleted parents are absent. */
async function parentBusinessIds(
  table: 'orders' | 'products',
  ids: string[]
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const rows = await database
    .get(table)
    .query(Q.where('id', Q.oneOf(unique)))
    .fetch();
  return new Map(
    rows.map((r) => [
      r.id,
      String((r._raw as unknown as Record<string, unknown>).business_id ?? ''),
    ])
  );
}

/**
 * WatermelonDB pushes every dirty row in the local database, across all
 * businesses on this device. The server RPC is scoped to one business per
 * call and rejects a `businesses` row whose id is not that business, so a
 * single dirty row from another branch (or from a shop registered on this
 * phone under another account) made every sync fail with
 * "unauthorized business push". Split the push per business instead.
 *
 * Deletions carry only ids, so they are sent with every group; the server
 * deletes only rows that belong to the business it was called for.
 */
async function splitChangesByBusiness(
  changes: SyncChanges,
  activeBusinessId: string
): Promise<Map<string, SyncChanges>> {
  const [orderBiz, productBiz] = await Promise.all([
    parentBusinessIds(
      'orders',
      rowsOf(changes.order_items).map((r) => String(r.order_id ?? ''))
    ),
    parentBusinessIds(
      'products',
      rowsOf(changes.inventory_logs).map((r) => String(r.product_id ?? ''))
    ),
  ]);

  const businessOf = (table: SyncTableName, row: PushRow): string => {
    let bid: string | undefined;
    if (table === 'businesses') bid = row.id;
    else if (table === 'order_items') bid = orderBiz.get(String(row.order_id ?? ''));
    else if (table === 'inventory_logs') bid = productBiz.get(String(row.product_id ?? ''));
    else bid = row.business_id ? String(row.business_id) : undefined;
    return bid || activeBusinessId;
  };

  const groups = new Map<string, SyncChanges>();
  const bucket = (bid: string, table: SyncTableName, kind: 'created' | 'updated', row: PushRow) => {
    const group = groups.get(bid) ?? {};
    const slice = group[table] ?? { created: [], updated: [], deleted: [] };
    (slice[kind] ??= []).push(row);
    group[table] = slice;
    groups.set(bid, group);
  };

  let hasDeletes = false;
  for (const table of PUSH_TABLE_ORDER) {
    const slice = changes[table];
    if (!slice) continue;
    for (const row of (slice.created ?? []) as PushRow[])
      bucket(businessOf(table, row), table, 'created', row);
    for (const row of (slice.updated ?? []) as PushRow[])
      bucket(businessOf(table, row), table, 'updated', row);
    if (slice.deleted?.length) hasDeletes = true;
  }

  if (hasDeletes && !groups.has(activeBusinessId)) groups.set(activeBusinessId, {});
  // A deleted branch is identified by its own id, so it needs its own group
  // even when nothing else of it is dirty.
  for (const id of (changes.businesses?.deleted ?? []) as string[]) {
    if (!groups.has(id)) groups.set(id, {});
  }
  for (const group of groups.values()) {
    for (const table of PUSH_TABLE_ORDER) {
      const deleted = changes[table]?.deleted ?? [];
      if (deleted.length === 0) continue;
      const slice = group[table] ?? { created: [], updated: [] };
      group[table] = { ...slice, deleted };
    }
  }

  return groups;
}

function isPermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not a member|unauthorized|permission denied|42501/i.test(msg);
}

async function pushAllBusinesses(changes: SyncChanges, activeBusinessId: string): Promise<void> {
  const groups = await splitChangesByBusiness(changes, activeBusinessId);
  // Active business first so its failure surfaces before anything else.
  const ordered = [
    ...(groups.has(activeBusinessId) ? [activeBusinessId] : []),
    ...Array.from(groups.keys()).filter((bid) => bid !== activeBusinessId),
  ];

  for (const bid of ordered) {
    try {
      await pushChangesInOrder(groups.get(bid)!, bid);
    } catch (err) {
      // Rows for a business this account cannot access (left over from a
      // previous login on this phone) can never be pushed. Skipping them
      // lets Watermelon mark them synced instead of blocking every sync.
      if (bid !== activeBusinessId && isPermissionError(err)) {
        console.warn(`[Sync] Skipping unsyncable rows for business ${bid}:`, err);
        continue;
      }
      throw err;
    }
  }
}

/** Restore an existing Supabase session if present. Sync works without login via anon RPC. */
async function prepareSupabaseForSync(): Promise<void> {
  // Client runs anonymously with anon key. Authentication is enforced at the RPC layer by passing client_business_id.
}

let isSyncInProgress = false;
let hasPendingSyncRequest = false;
let currentSyncRun: Promise<SyncOutcome> | null = null;
let forceFullPullBusinessId: string | null = null;
let onSyncSuccess: (() => void) | null = null;

export type SyncOutcome =
  | { status: 'success' }
  /** Another sync was already running; this request was queued behind it. */
  | { status: 'deferred' }
  /** Nothing to do: backup is off, env is missing, or no business is selected. */
  | { status: 'skipped'; reason: 'backup_disabled' | 'env_missing' | 'no_business' }
  /** The pull/push actually ran and failed. `message` is the underlying error. */
  | { status: 'error'; message: string };

/** Register a callback to refresh React Query caches after a successful pull/push sync. */
export function setOnSyncSuccess(fn: () => void) {
  onSyncSuccess = fn;
}

/** Request a full pull for a business (e.g. after switching branches). */
export function requestFullPullForBusiness(businessId: string) {
  forceFullPullBusinessId = businessId;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Background-friendly sync. Returns `true` only when a pull/push completed.
 * Every other outcome (deferred, skipped, error) is `false`; use
 * `syncDatabaseNow()` when the caller needs to tell those apart.
 */
export async function syncDatabase(): Promise<boolean> {
  const outcome = await syncDatabaseDetailed();
  return outcome.status === 'success';
}

/**
 * User-initiated sync. If a sync is already running it waits for that run to
 * finish and then runs again, so the caller always gets a real outcome
 * instead of a "deferred" false negative.
 */
export async function syncDatabaseNow(): Promise<SyncOutcome> {
  if (currentSyncRun) {
    await currentSyncRun.catch(() => undefined);
  }
  return syncDatabaseDetailed();
}

async function syncDatabaseDetailed(): Promise<SyncOutcome> {
  const isBackupEnabled = useSettingsStore.getState().isBackupEnabled;
  if (!isBackupEnabled) {
    return { status: 'skipped', reason: 'backup_disabled' };
  }

  if (isSyncInProgress) {
    hasPendingSyncRequest = true;
    console.log('[Sync] Synchronization already in progress. Request deferred.');
    return { status: 'deferred' };
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('Sync skipped: Supabase environment variables are not configured.');
    return { status: 'skipped', reason: 'env_missing' };
  }

  isSyncInProgress = true;
  hasPendingSyncRequest = false;

  const runSync = async (): Promise<SyncOutcome> => {
    await prepareSupabaseForSync();

    const activeBusinessId = useAuthStore.getState().activeBusinessId;
    if (!activeBusinessId) {
      console.warn('Sync skipped: No active business ID selected.');
      return { status: 'skipped', reason: 'no_business' };
    }

    await synchronize({
      database,
      sendCreatedAsUpdated: true,
      pullChanges: async ({ lastPulledAt }) => {
        let effectiveLastPulledAt = lastPulledAt ?? 0;
        if (forceFullPullBusinessId === activeBusinessId) {
          effectiveLastPulledAt = 0;
          forceFullPullBusinessId = null;
        }

        const { data, error } = await supabase.rpc('pull_watermelondb_changes', {
          last_pulled_at: effectiveLastPulledAt,
          client_business_id: activeBusinessId,
        });
        if (error) throw new Error(`pull: ${error.message}`);
        return {
          changes: normalizePulledChanges(data.changes as SyncChanges),
          timestamp: data.timestamp,
        };
      },
      pushChanges: async ({ changes }) => {
        await pushAllBusinesses(changes as SyncChanges, activeBusinessId);

        // Broadcast sync trigger to other active terminals
        const hasChanges = Object.values(changes).some((slice) =>
          tableHasChanges(slice as TableChanges | undefined)
        );
        if (hasChanges) {
          console.log('[Sync] Local changes pushed. Broadcasting sync trigger...');
          supabase
            .channel(`sync:${activeBusinessId}`, { config: { private: true } })
            .send({
              type: 'broadcast',
              event: 'sync_trigger',
              payload: {
                senderId: getClientId(),
                businessId: activeBusinessId,
                timestamp: Date.now(),
              },
            })
            .catch((err) => console.error('[Sync] Broadcast failed:', err));
        }
      },
      migrationsEnabledAtVersion: schema.version,
    });
    console.log('Database synced successfully');
    return { status: 'success' };
  };

  const run = (async (): Promise<SyncOutcome> => {
    try {
      const outcome = await runSync();
      isSyncInProgress = false;

      if (outcome.status === 'success') {
        onSyncSuccess?.();
      }

      if (hasPendingSyncRequest) {
        hasPendingSyncRequest = false;
        console.log('[Sync] Running deferred synchronization request...');
        setTimeout(() => {
          syncDatabase();
        }, 50);
      }

      return outcome;
    } catch (error) {
      isSyncInProgress = false;
      hasPendingSyncRequest = false;
      console.error('Failed to sync database:', error);
      return { status: 'error', message: errorMessage(error) };
    } finally {
      currentSyncRun = null;
    }
  })();

  currentSyncRun = run;
  return run;
}
