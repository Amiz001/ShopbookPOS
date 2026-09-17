import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, fireEvent, act } from '@testing-library/react';
import {
  ScannerProvider,
  useRegisterScanHandler,
  applyScannedDestinationValue,
} from '../../contexts/ScannerContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return <ScannerProvider>{children}</ScannerProvider>;
}

function fireScanKey(key: string, input?: HTMLInputElement) {
  const notPrevented = fireEvent.keyDown(window, { key });
  if (notPrevented !== false && input && document.activeElement === input && key.length === 1) {
    input.value += key;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

describe('ScannerContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should trigger scan callback on rapid key strokes ending with Enter', () => {
    const mockOnScan = vi.fn();
    let fakeTime = 1000000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

    renderHook(() => useRegisterScanHandler(mockOnScan), { wrapper });

    for (const char of '47900101') {
      fakeTime += 10;
      fireEvent.keyDown(window, { key: char });
    }
    fakeTime += 10;
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(mockOnScan).toHaveBeenCalledWith('47900101');
    nowSpy.mockRestore();
  });

  test('should flush scan on idle timeout when scanner sends no Enter', () => {
    const mockOnScan = vi.fn();
    vi.useFakeTimers();
    let fakeTime = 2000000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

    renderHook(() => useRegisterScanHandler(mockOnScan), { wrapper });

    for (const char of '47900101') {
      fakeTime += 10;
      fireEvent.keyDown(window, { key: char });
    }

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockOnScan).toHaveBeenCalledWith('47900101');
    nowSpy.mockRestore();
    vi.useRealTimers();
  });

  test('should ignore slow manual typing', () => {
    const mockOnScan = vi.fn();
    renderHook(() => useRegisterScanHandler(mockOnScan), { wrapper });

    let fakeTime = 3000000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      fakeTime += 100;
      return fakeTime;
    });

    for (const char of '47900101') {
      fireEvent.keyDown(window, { key: char });
    }
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(mockOnScan).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  test('should not double-fire when both Enter and idle timeout could complete', () => {
    const mockOnScan = vi.fn();
    vi.useFakeTimers();
    let fakeTime = 6000000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

    renderHook(() => useRegisterScanHandler(mockOnScan), { wrapper });

    for (const char of '47900101') {
      fakeTime += 10;
      fireEvent.keyDown(window, { key: char });
    }
    fakeTime += 10;
    fireEvent.keyDown(window, { key: 'Enter' });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockOnScan).toHaveBeenCalledTimes(1);
    nowSpy.mockRestore();
    vi.useRealTimers();
  });

  test('should prefer the newest registered handler (stack override)', () => {
    const outerHandler = vi.fn();
    const innerHandler = vi.fn();
    let fakeTime = 7000000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

    const { rerender } = renderHook(
      ({ active }: { active: 'outer' | 'both' }) => {
        useRegisterScanHandler(outerHandler, active === 'outer' || active === 'both');
        useRegisterScanHandler(innerHandler, active === 'both');
      },
      { wrapper, initialProps: { active: 'both' as 'outer' | 'both' } }
    );

    for (const char of '47900101') {
      fakeTime += 10;
      fireEvent.keyDown(window, { key: char });
    }
    fakeTime += 10;
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(innerHandler).toHaveBeenCalledWith('47900101');
    expect(outerHandler).not.toHaveBeenCalled();

    innerHandler.mockClear();
    outerHandler.mockClear();
    rerender({ active: 'outer' });

    for (const char of '12345678') {
      fakeTime += 10;
      fireEvent.keyDown(window, { key: char });
    }
    fakeTime += 10;
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(outerHandler).toHaveBeenCalledWith('12345678');
    nowSpy.mockRestore();
  });

  test('should fully replace destination field on consecutive scans (Bug 1)', () => {
    const destinationRef = { current: null as HTMLInputElement | null };
    const lockRef = { current: false };
    const input = document.createElement('input');
    document.body.appendChild(input);
    destinationRef.current = input;
    input.focus();

    let fakeTime = 8000000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

    renderHook(
      () => {
        const [value, setValue] = React.useState('');

        useRegisterScanHandler(
          (code) => {
            applyScannedDestinationValue(destinationRef, code, setValue);
          },
          true,
          {
            scanDestinationRefs: [destinationRef],
            scanInputLockRef: lockRef,
          }
        );

        return value;
      },
      { wrapper }
    );

    for (const char of '11112222') {
      fakeTime += 10;
      fireScanKey(char, input);
    }
    fakeTime += 10;
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(input.value).toBe('11112222');

    for (const char of '99998888') {
      fakeTime += 10;
      fireScanKey(char, input);
    }
    fakeTime += 10;
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(input.value).toBe('99998888');
    document.body.removeChild(input);
    nowSpy.mockRestore();
  });

  test('should resync DOM when repeat scan matches React state (Round 3)', () => {
    const destinationRef = { current: null as HTMLInputElement | null };
    const lockRef = { current: false };
    const input = document.createElement('input');
    document.body.appendChild(input);
    destinationRef.current = input;
    input.focus();

    let fakeTime = 8500000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);
    const setValue = vi.fn();

    renderHook(
      () => {
        useRegisterScanHandler(
          (code) => {
            applyScannedDestinationValue(destinationRef, code, setValue);
          },
          true,
          {
            scanDestinationRefs: [destinationRef],
            scanInputLockRef: lockRef,
          }
        );
      },
      { wrapper }
    );

    for (const char of 'ABC123') {
      fakeTime += 10;
      fireScanKey(char, input);
    }
    fakeTime += 10;
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(input.value).toBe('ABC123');

    input.value = 'ABC123AB';
    setValue.mockClear();

    for (const char of 'ABC123') {
      fakeTime += 10;
      fireScanKey(char, input);
    }
    fakeTime += 10;
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(input.value).toBe('ABC123');
    expect(setValue).toHaveBeenCalledWith('ABC123');

    document.body.removeChild(input);
    nowSpy.mockRestore();
  });

  test('should restore unrelated field snapshot on confirmation (Bug 2)', () => {
    const unrelatedInput = document.createElement('input');
    document.body.appendChild(unrelatedInput);
    unrelatedInput.value = 'John';
    unrelatedInput.focus();

    let fakeTime = 9000000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

    renderHook(() => useRegisterScanHandler(vi.fn()), { wrapper });

    for (const char of '47900101') {
      fakeTime += 10;
      fireScanKey(char, unrelatedInput);
    }
    fakeTime += 10;
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(unrelatedInput.value).toBe('John');
    document.body.removeChild(unrelatedInput);
    nowSpy.mockRestore();
  });

  test('should reset in-flight buffer when handler unregisters', () => {
    const mockOnScan = vi.fn();
    vi.useFakeTimers();
    let fakeTime = 10000000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

    const { unmount } = renderHook(() => useRegisterScanHandler(mockOnScan), { wrapper });

    fakeTime += 10;
    fireEvent.keyDown(window, { key: '4' });
    fakeTime += 10;
    fireEvent.keyDown(window, { key: '7' });
    unmount();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(mockOnScan).not.toHaveBeenCalled();
    nowSpy.mockRestore();
    vi.useRealTimers();
  });

  test('should fire completion exactly once per rapid repeat scan (Round 4)', () => {
    const mockOnScan = vi.fn();
    const destinationRef = { current: null as HTMLInputElement | null };
    const lockRef = { current: false };
    const input = document.createElement('input');
    document.body.appendChild(input);
    destinationRef.current = input;
    input.focus();

    let fakeTime = 11000000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

    renderHook(
      () =>
        useRegisterScanHandler(
          (code) => {
            applyScannedDestinationValue(destinationRef, code, () => {});
            mockOnScan(code);
          },
          true,
          {
            scanDestinationRefs: [destinationRef],
            scanInputLockRef: lockRef,
          }
        ),
      { wrapper }
    );

    const scanBarcode = (barcode: string) => {
      for (const char of barcode) {
        fakeTime += 10;
        fireScanKey(char, input);
      }
      fakeTime += 10;
      fireEvent.keyDown(window, { key: 'Enter' });
    };

    for (let i = 0; i < 10; i++) {
      scanBarcode('ABC123');
    }

    expect(mockOnScan).toHaveBeenCalledTimes(10);
    expect(input.value).toBe('ABC123');
    expect(lockRef.current).toBe(false);

    mockOnScan.mockClear();
    scanBarcode('999888');
    scanBarcode('ABC123');
    scanBarcode('999888');

    expect(mockOnScan).toHaveBeenCalledTimes(3);
    expect(mockOnScan.mock.calls).toEqual([['999888'], ['ABC123'], ['999888']]);
    expect(input.value).toBe('999888');

    document.body.removeChild(input);
    nowSpy.mockRestore();
  });
});
