import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, ShieldAlert } from 'lucide-react';

interface ScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [detectorUnsupported, setDetectorUnsupported] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<any>(null);

  useEffect(() => {
    // Start camera stream on mount
    async function startCamera() {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setHasPermission(false);
        setErrorMsg(
          'Camera access is not supported or blocked in this browser context. Please use a secure connection (HTTPS) or localhost.'
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setHasPermission(true);
        startScanning();
      } catch (err: any) {
        console.error('Camera access error:', err);
        setHasPermission(false);
        setErrorMsg(
          'Webcam permission denied or camera not found. Please ensure camera access is enabled.'
        );
      }
    }

    startCamera();

    return () => {
      // Clean up stream & intervals on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

  const startScanning = () => {
    // Check for native BarcodeDetector support
    const hasNativeDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window;

    if (hasNativeDetector) {
      const barcodeDetector = new (window as any).BarcodeDetector({
        formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
      });

      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            if (code) {
              onScan(code);
            }
          }
        } catch (err) {
          // Native detector error, fallback silently
        }
      }, 500);
    } else {
      // No in-browser barcode decoder (Safari/Firefox). Tell the user instead of
      // showing a viewfinder that silently never scans.
      setDetectorUnsupported(true);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={18} color="var(--primary)" />
            <h3 style={styles.title}>Webcam Viewfinder</h3>
          </div>
          <button onClick={onClose} style={styles.closeBtn}>
            <X size={16} />
          </button>
        </div>

        <div style={styles.viewfinder}>
          {hasPermission === true ? (
            <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
          ) : hasPermission === false ? (
            <div style={styles.errorBox}>
              <ShieldAlert size={36} color="var(--warning)" />
              <p style={styles.errorText}>{errorMsg}</p>
            </div>
          ) : (
            <div style={styles.loadingBox}>
              <div style={styles.spinner} />
              <p style={styles.loadingText}>Initializing camera feed...</p>
            </div>
          )}

          {/* Scanning box indicator overlay */}
          <div style={styles.scanTarget}>
            <div style={{ ...styles.corner, ...styles.topLeft }} />
            <div style={{ ...styles.corner, ...styles.topRight }} />
            <div style={{ ...styles.corner, ...styles.bottomLeft }} />
            <div style={{ ...styles.corner, ...styles.bottomRight }} />
            <div style={styles.laserLine} />
          </div>
        </div>

        <div style={styles.footer}>
          {detectorUnsupported ? (
            <p style={{ ...styles.footerText, color: 'var(--warning)' }}>
              Camera scanning isn’t supported in this browser. Use Chrome or Edge, a USB scanner, or
              type the code manually.
            </p>
          ) : (
            <p style={styles.footerText}>Align a product barcode or QR code inside the viewport.</p>
          )}
          <span style={styles.hardwareTip}>
            Tip: Physical USB scanners are supported directly on the invoice screen without opening
            the camera.
          </span>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(4px)',
  },
  container: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: '#ffffff',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: '15px',
    fontWeight: 'bold',
    color: 'var(--dark)',
  },
  closeBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '14px',
    backgroundColor: '#f3f4f6',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--muted)',
  },
  viewfinder: {
    height: '260px',
    backgroundColor: '#111827',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  errorBox: {
    padding: '24px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  errorText: {
    color: '#9ca3af',
    fontSize: '12px',
    lineHeight: '1.6',
  },
  loadingBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid rgba(255,255,255,0.2)',
    borderTopColor: '#ffffff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: '12px',
  },
  scanTarget: {
    position: 'absolute',
    width: '240px',
    height: '140px',
    pointerEvents: 'none',
  },
  corner: {
    position: 'absolute',
    width: '20px',
    height: '20px',
    borderColor: 'var(--yellow)',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTop: '3px solid var(--yellow)',
    borderLeft: '3px solid var(--yellow)',
  },
  topRight: {
    top: 0,
    right: 0,
    borderTop: '3px solid var(--yellow)',
    borderRight: '3px solid var(--yellow)',
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottom: '3px solid var(--yellow)',
    borderLeft: '3px solid var(--yellow)',
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottom: '3px solid var(--yellow)',
    borderRight: '3px solid var(--yellow)',
  },
  laserLine: {
    position: 'absolute',
    left: '6px',
    right: '6px',
    height: '2px',
    backgroundColor: 'var(--yellow)',
    boxShadow: '0 0 8px var(--yellow)',
    animation: 'scan-laser 2.5s ease-in-out infinite',
  },
  footer: {
    padding: '16px 20px',
    backgroundColor: 'var(--background)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    textAlign: 'center',
  },
  footerText: {
    fontSize: '12px',
    color: 'var(--dark)',
    fontWeight: '600',
  },
  hardwareTip: {
    fontSize: '10px',
    color: 'var(--muted)',
    lineHeight: '1.4',
  },
};
