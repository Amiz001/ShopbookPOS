import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Scanner } from '../../components/Scanner';

describe('Scanner Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset navigator.mediaDevices to a clean writable mock
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  // ─── Camera permission states ─────────────────────────────────────

  test('should render viewfinder loader when camera permissions are pending', async () => {
    (navigator.mediaDevices.getUserMedia as any).mockReturnValue(new Promise(() => {})); // never resolves

    render(<Scanner onScan={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Initializing camera feed...')).toBeInTheDocument();
  });

  test('should render video element when camera permission is granted', async () => {
    const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
    (navigator.mediaDevices.getUserMedia as any).mockResolvedValue(mockStream);

    render(<Scanner onScan={vi.fn()} onClose={vi.fn()} />);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByText('Initializing camera feed...')).not.toBeInTheDocument();
  });

  test('should show error warning when camera permission is denied', async () => {
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(new Error('Permission Denied'));

    render(<Scanner onScan={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByText(/Webcam permission denied/)).toBeInTheDocument();
  });

  test('should show error when navigator.mediaDevices is undefined', async () => {
    // Simulate environments without camera support (e.g., non-HTTPS)
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    render(<Scanner onScan={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByText(/Camera access is not supported/)).toBeInTheDocument();
  });

  test('should call onClose when close button is clicked', async () => {
    (navigator.mediaDevices.getUserMedia as any).mockReturnValue(new Promise(() => {}));
    const onClose = vi.fn();

    render(<Scanner onScan={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // ─── Native BarcodeDetector scanning ─────────────────────────────

  test('should construct BarcodeDetector with correct formats when available', async () => {
    const onScan = vi.fn();
    const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
    (navigator.mediaDevices.getUserMedia as any).mockResolvedValue(mockStream);

    const mockDetect = vi.fn().mockResolvedValue([]);
    const MockDetector = vi.fn().mockImplementation(function (this: any) {
      this.detect = mockDetect;
    });
    (window as any).BarcodeDetector = MockDetector;

    try {
      render(<Scanner onScan={onScan} onClose={vi.fn()} />);

      // Wait for startCamera to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // BarcodeDetector should have been constructed with the supported formats
      expect(MockDetector).toHaveBeenCalledWith({
        formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
      });
    } finally {
      delete (window as any).BarcodeDetector;
    }
  });

  test('should call onScan when native BarcodeDetector detects a barcode', async () => {
    const onScan = vi.fn();
    const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
    (navigator.mediaDevices.getUserMedia as any).mockResolvedValue(mockStream);

    const mockDetect = vi.fn().mockResolvedValue([{ rawValue: 'barcode-123' }]);
    const MockDetector = vi.fn().mockImplementation(function (this: any) {
      this.detect = mockDetect;
    });
    (window as any).BarcodeDetector = MockDetector;

    let intervalCb: any;
    const originalSetInterval = window.setInterval;
    window.setInterval = vi.fn().mockImplementation((cb: any) => {
      intervalCb = cb;
      return 123;
    }) as any;
    const originalClearInterval = window.clearInterval;
    const clearIntervalSpy = vi.fn();
    window.clearInterval = clearIntervalSpy as any;

    try {
      const { unmount } = render(<Scanner onScan={onScan} onClose={vi.fn()} />);

      // Wait for startCamera to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(window.setInterval).toHaveBeenCalled();

      const videoEl = document.querySelector('video');
      if (videoEl) {
        Object.defineProperty(videoEl, 'readyState', { value: 2, configurable: true });
      }

      await act(async () => {
        await intervalCb();
      });

      expect(mockDetect).toHaveBeenCalled();
      expect(onScan).toHaveBeenCalledWith('barcode-123');

      unmount();
      expect(clearIntervalSpy).toHaveBeenCalledWith(123);
    } finally {
      window.setInterval = originalSetInterval;
      window.clearInterval = originalClearInterval;
      delete (window as any).BarcodeDetector;
    }
  });

  test('shows an unsupported notice when BarcodeDetector is unavailable', async () => {
    const onScan = vi.fn();
    const mockStream = { getTracks: () => [{ stop: vi.fn() }] };
    (navigator.mediaDevices.getUserMedia as any).mockResolvedValue(mockStream);

    // Ensure BarcodeDetector is NOT on window
    delete (window as any).BarcodeDetector;

    const { findByText } = render(<Scanner onScan={onScan} onClose={vi.fn()} />);

    // Instead of silently doing nothing, the user is told and pointed elsewhere.
    expect(await findByText(/Use Chrome or Edge/i)).toBeInTheDocument();
  });
});
