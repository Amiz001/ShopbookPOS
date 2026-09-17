'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from 'react';

const IDLE_RESET_MS = 100;
const SCAN_GAP_MS = 35;
const MIN_BARCODE_LENGTH = 4;

export type ScanHandler = (code: string) => void;

export type RestoreFieldValue = (element: Element, value: string) => void;

export interface ScanHandlerOptions {
  scanDestinationRefs?: RefObject<HTMLElement | null>[];
  restoreFieldValue?: RestoreFieldValue;
  /** While true, destination onChange handlers ignore intermediate keystrokes during a scan burst */
  scanInputLockRef?: RefObject<boolean>;
}

interface BufferEntry {
  char: string;
  timestamp: number;
}

interface ScanBuffer {
  entries: BufferEntry[];
  confirmed: boolean;
  consumed: boolean;
  burstStartElement: Element | null;
  burstStartValue: string | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

interface RegisteredHandler {
  handler: ScanHandler;
  scanDestinationRefs?: RefObject<HTMLElement | null>[];
  restoreFieldValue?: RestoreFieldValue;
  scanInputLockRef?: RefObject<boolean>;
}

interface ScannerContextValue {
  registerHandler: (registration: RegisteredHandler) => () => void;
}

const ScannerContext = createContext<ScannerContextValue | null>(null);

function isModifierKey(key: string) {
  return key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta';
}

function createEmptyBuffer(): ScanBuffer {
  return {
    entries: [],
    confirmed: false,
    consumed: false,
    burstStartElement: null,
    burstStartValue: null,
    idleTimer: null,
  };
}

function qualifiesAsScan(entries: BufferEntry[]): boolean {
  if (entries.length < MIN_BARCODE_LENGTH) return false;

  for (let i = 1; i < entries.length; i++) {
    const gap = entries[i].timestamp - entries[i - 1].timestamp;
    if (gap > SCAN_GAP_MS) return false;
  }

  return true;
}

function getBarcodeString(entries: BufferEntry[]): string {
  return entries.map((entry) => entry.char).join('');
}

function snapshotBurstStart(): Pick<ScanBuffer, 'burstStartElement' | 'burstStartValue'> {
  const burstStartElement = document.activeElement;
  if (
    burstStartElement instanceof HTMLInputElement ||
    burstStartElement instanceof HTMLTextAreaElement
  ) {
    return { burstStartElement, burstStartValue: burstStartElement.value };
  }
  return { burstStartElement, burstStartValue: null };
}

export function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function defaultRestoreFieldValue(element: Element, value: string) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    setNativeInputValue(element, value);
  }
}

/** Imperative DOM write first, then React state — bypasses same-value bailout on repeat scans */
export function applyScannedDestinationValue(
  ref: RefObject<HTMLInputElement | null>,
  code: string,
  setState: (value: string) => void
) {
  if (ref.current) {
    ref.current.value = code;
  }
  setState(code);
}

function isScanDestination(
  element: Element | null,
  scanDestinationRefs: RefObject<HTMLElement | null>[] | undefined
): boolean {
  if (!element || !scanDestinationRefs?.length) return false;
  return scanDestinationRefs.some((ref) => ref.current === element);
}

function lockDestinationInput(registration: RegisteredHandler | undefined) {
  if (!registration?.scanInputLockRef) return;
  registration.scanInputLockRef.current = true;
}

function unlockDestinationInput(registration: RegisteredHandler | undefined) {
  if (!registration?.scanInputLockRef) return;
  registration.scanInputLockRef.current = false;
}

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  const handlerStackRef = useRef<RegisteredHandler[]>([]);
  const bufferRef = useRef<ScanBuffer>(createEmptyBuffer());
  const processingBusyRef = useRef(false);

  const getActiveRegistration = useCallback(() => {
    return handlerStackRef.current[handlerStackRef.current.length - 1];
  }, []);

  const clearIdleTimer = useCallback(() => {
    const buffer = bufferRef.current;
    if (buffer.idleTimer) {
      clearTimeout(buffer.idleTimer);
      buffer.idleTimer = null;
    }
  }, []);

  const abortBurst = useCallback(
    (registration?: RegisteredHandler) => {
      clearIdleTimer();
      unlockDestinationInput(registration ?? getActiveRegistration());
      bufferRef.current = createEmptyBuffer();
    },
    [clearIdleTimer, getActiveRegistration]
  );

  /**
   * Single scan-completion path. Destination fill + business handler live in the
   * registered handler; this function only guards against double-fire and restores
   * non-destination fields that received leaked characters.
   */
  const completeScan = useCallback(
    (entries: BufferEntry[]) => {
      if (processingBusyRef.current || bufferRef.current.consumed) return;

      if (!qualifiesAsScan(entries)) {
        abortBurst();
        return;
      }

      processingBusyRef.current = true;
      bufferRef.current.consumed = true;
      clearIdleTimer();

      const registration = getActiveRegistration();
      const code = getBarcodeString(entries);
      const { burstStartElement, burstStartValue } = bufferRef.current;

      try {
        const burstWasOnDestination = isScanDestination(
          burstStartElement,
          registration?.scanDestinationRefs
        );

        if (
          burstStartElement instanceof HTMLInputElement &&
          burstStartValue !== null &&
          !burstWasOnDestination
        ) {
          const restore = registration?.restoreFieldValue ?? defaultRestoreFieldValue;
          restore(burstStartElement, burstStartValue);
        }

        registration?.handler(code);
      } finally {
        unlockDestinationInput(registration);
        processingBusyRef.current = false;
        bufferRef.current = createEmptyBuffer();
      }
    },
    [abortBurst, clearIdleTimer, getActiveRegistration]
  );

  const beginBurst = useCallback(() => {
    Object.assign(bufferRef.current, snapshotBurstStart());
    const registration = getActiveRegistration();
    if (isScanDestination(bufferRef.current.burstStartElement, registration?.scanDestinationRefs)) {
      lockDestinationInput(registration);
    }
  }, [getActiveRegistration]);

  const scheduleIdleFlush = useCallback(() => {
    clearIdleTimer();

    bufferRef.current.idleTimer = setTimeout(() => {
      if (bufferRef.current.consumed || processingBusyRef.current) return;
      completeScan([...bufferRef.current.entries]);
    }, IDLE_RESET_MS);
  }, [clearIdleTimer, completeScan]);

  const registerHandler = useCallback(
    (registration: RegisteredHandler) => {
      handlerStackRef.current.push(registration);
      abortBurst();

      return () => {
        const idx = handlerStackRef.current.indexOf(registration);
        if (idx !== -1) {
          handlerStackRef.current.splice(idx, 1);
        }
        abortBurst();
      };
    },
    [abortBurst]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isModifierKey(e.key)) return;

      const now = Date.now();
      const buffer = bufferRef.current;
      const entries = buffer.entries;
      const lastTimestamp = entries.length > 0 ? entries[entries.length - 1].timestamp : 0;
      const gapSinceLast = entries.length > 0 ? now - lastTimestamp : Infinity;

      if (e.key === 'Enter') {
        if (buffer.confirmed) {
          e.preventDefault();
        }

        if (entries.length > 0 && qualifiesAsScan(entries) && !buffer.consumed) {
          e.preventDefault();
          completeScan(entries);
        } else if (entries.length > 0) {
          abortBurst();
        }
        return;
      }

      if (e.key.length !== 1) return;

      if (entries.length > 0 && gapSinceLast > IDLE_RESET_MS) {
        abortBurst();
        beginBurst();
        bufferRef.current.entries.push({ char: e.key, timestamp: now });
        scheduleIdleFlush();
        return;
      }

      if (entries.length === 0) {
        beginBurst();
      }

      bufferRef.current.entries.push({ char: e.key, timestamp: now });
      const updatedEntries = bufferRef.current.entries;

      if (updatedEntries.length >= 3) {
        const lastThree = updatedEntries.slice(-3);
        const gap1 = lastThree[1].timestamp - lastThree[0].timestamp;
        const gap2 = lastThree[2].timestamp - lastThree[1].timestamp;
        if (gap1 <= SCAN_GAP_MS && gap2 <= SCAN_GAP_MS) {
          bufferRef.current.confirmed = true;
        }
      }

      if (bufferRef.current.confirmed) {
        e.preventDefault();
      }

      scheduleIdleFlush();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      abortBurst();
    };
  }, [abortBurst, beginBurst, completeScan, scheduleIdleFlush]);

  const value = useMemo(() => ({ registerHandler }), [registerHandler]);

  return <ScannerContext.Provider value={value}>{children}</ScannerContext.Provider>;
}

export function useRegisterScanHandler(
  handler: ScanHandler,
  enabled = true,
  options?: ScanHandlerOptions
) {
  const ctx = useContext(ScannerContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!ctx || !enabled) return;

    return ctx.registerHandler({
      handler: (code) => handlerRef.current(code),
      scanDestinationRefs: optionsRef.current?.scanDestinationRefs,
      restoreFieldValue: optionsRef.current?.restoreFieldValue,
      scanInputLockRef: optionsRef.current?.scanInputLockRef,
    });
  }, [ctx, enabled]);
}
