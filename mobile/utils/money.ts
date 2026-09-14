/**
 * Null-safe money formatting.
 *
 * A row synced from another device or an older build can carry a null or
 * undefined amount. Calling `.toLocaleString()` on that throws inside render,
 * and in a release build an uncaught render error takes the whole app down.
 * Every screen that prints an amount goes through here instead.
 */
export function toAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** "1,250" style. */
export function money(value: unknown): string {
  return toAmount(value).toLocaleString();
}

/** "1250.00" style, for receipts. */
export function moneyFixed(value: unknown, digits = 2): string {
  return toAmount(value).toFixed(digits);
}
