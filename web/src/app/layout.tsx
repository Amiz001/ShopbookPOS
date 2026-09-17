'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '../stores/authStore';
import { useEntitlementStore } from '../stores/useEntitlementStore';
import { useSettingsStore } from '../stores/settingsStore';
import { startUploadQueueMonitor } from '@/services/uploadQueue';
import { useSyncStore } from '../stores/syncStore';
import { useLocalDataCheck } from '../hooks/useLocalDataCheck';
import { useAppAuthGuard } from '../hooks/useAppAuthGuard';
import { useAppSync } from '../hooks/useAppSync';
import SyncBlocker from '../components/layout/SyncBlocker';
import ProBlocker from '../components/layout/ProBlocker';
import { useEntitlement } from '../hooks/useEntitlement';
import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from '../components/layout/Sidebar';
import { MobileNavbar } from '../components/layout/MobileNavbar';
import { Header } from '../components/layout/Header';
import { WifiOff } from 'lucide-react';
import { MobileBlocker } from '../components/layout/MobileBlocker';
import {
  useActiveDeviceTracker,
  deleteCurrentDeviceSession,
} from '../hooks/useActiveDeviceTracker';
import { useTranslation } from '@/hooks/useTranslation';
import { ScannerProvider } from '../contexts/ScannerContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const language = useSettingsStore((s) => s.language) || 'en';
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <html lang={language}>
      <head>
        <title>Shopbook POS Web</title>
        <meta name="description" content="premium web point of sale" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" href="/favicon.png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <meta name="keywords" content="shopbook, pos, point of sale, retail pos" />
        <meta name="author" content="Pasan Pahasara Dewapriya" />
        <meta name="robots" content="index, follow" />
      </head>
      <body className="antialiased">
        {/* Mobile viewport blocker screen */}
        <MobileBlocker />

        {/* Regular Application Layout */}
        <div className="app-layout-wrapper">
          <QueryClientProvider client={queryClient}>
            <ScannerProvider>
              <RootLayoutContent>{children}</RootLayoutContent>
            </ScannerProvider>
          </QueryClientProvider>
        </div>
      </body>
    </html>
  );
}

function RootLayoutContent({ children }: { children: React.ReactNode }) {
  const { isPro, isResolved, status, refetch } = useEntitlement();
  useActiveDeviceTracker(isPro);
  const pathname = usePathname();
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const { t } = useTranslation();

  const handleLogout = async () => {
    try {
      await deleteCurrentDeviceSession();
    } catch (e) {
      console.warn('Error clearing device session:', e);
    }
    useEntitlementStore.getState().reset();
    logout();
    router.push('/auth');
  };

  const posMode = useSettingsStore((s) => s.posMode);
  const setPosMode = useSettingsStore((s) => s.setPosMode);
  const sidebarVisible = useSettingsStore((s) => s.sidebarVisible);
  const setSidebarVisible = useSettingsStore((s) => s.setSidebarVisible);

  const { isSyncing: syncing, syncSuccess, hasCompletedInitialSync } = useSyncStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Custom Hooks for State & Routing Guards
  const { hydrated, isLoggedIn, activeBusiness } = useAppAuthGuard();
  const { handleSync } = useAppSync(hydrated, isPro);
  const hasLocalData = useLocalDataCheck();

  // Network connection status watcher
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      if (isPro) {
        handleSync(); // Auto sync when connection is restored
      }
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initialize background upload queue monitor only if Pro
    if (isPro) {
      startUploadQueueMonitor();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [hydrated, isLoggedIn, isPro]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  const getHeaderInfo = () => {
    if (pathname.startsWith('/stocks')) {
      return {
        title: t('layout.pageTitles.stocksTitle'),
        subtitle: t('layout.pageTitles.stocksSubtitle'),
      };
    }
    switch (pathname) {
      case '/':
      case '/pos':
        return {
          title: t('layout.pageTitles.posTitle'),
          subtitle: t('layout.pageTitles.posSubtitle'),
        };

      case '/history':
        return {
          title: t('layout.pageTitles.historyTitle'),
          subtitle: t('layout.pageTitles.historySubtitle'),
        };
      case '/insights':
        return {
          title: t('layout.pageTitles.insightsTitle'),
          subtitle: t('layout.pageTitles.insightsSubtitle'),
        };
      case '/profile':
        return {
          title: t('layout.pageTitles.profileTitle'),
          subtitle: t('layout.pageTitles.profileSubtitle'),
        };
      default:
        return null;
    }
  };

  if (!hydrated) {
    return (
      <div
        style={{
          backgroundColor: '#f9fafb',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid #e5e7eb',
              borderTopColor: '#2563eb',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <div
            style={{
              color: '#6b7280',
              fontSize: '13px',
              fontWeight: '600',
              letterSpacing: '0.5px',
            }}
          >
            {t('layout.initializingPos')}
          </div>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!isLoggedIn) {
    if (pathname === '/auth') {
      return children;
    }
    return <div style={{ backgroundColor: '#f9fafb', height: '100vh' }} />;
  }

  if (pathname === '/auth') {
    return <div style={{ backgroundColor: '#f9fafb', height: '100vh' }} />;
  }

  // -------------------------------------------------------------
  // PRO ENTITLEMENT GATE (Strict Fail-Closed, Zero-Flash Architecture)
  // Web access is itself a Pro feature. Never mount or leak the POS UI
  // until valid entitlement is confirmed.
  // -------------------------------------------------------------
  if (status === 'BLOCKED' || (isResolved && !isPro)) {
    return <ProBlocker businessName={activeBusiness?.name} />;
  }

  if (status === 'INITIALIZING' || (!isPro && !isResolved)) {
    return (
      <div
        style={{
          backgroundColor: '#f9fafb',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid #e5e7eb',
              borderTopColor: '#2563eb',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <div
            style={{
              color: '#6b7280',
              fontSize: '13px',
              fontWeight: '600',
              letterSpacing: '0.5px',
            }}
          >
            Verifying Shopbook Pro access...
          </div>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (status === 'NETWORK_ERROR' && !isPro) {
    return (
      <div
        style={{
          backgroundColor: '#f9fafb',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'Inter, system-ui, sans-serif',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: '20px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)',
            padding: '40px 32px',
            maxWidth: '440px',
            width: '100%',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }}>
            Unable to verify subscription
          </h2>
          <p style={{ fontSize: '14px', lineHeight: '22px', color: '#64748b', margin: '0 0 24px' }}>
            Could not connect to verify your Shopbook Pro status. Please check your internet
            connection and try again.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => void refetch()}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '12px 22px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry Connection
            </button>
            <button
              onClick={handleLogout}
              style={{
                backgroundColor: '#f8fafc',
                color: '#475569',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '12px 22px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (
    !activeBusiness ||
    activeBusiness.id === '0' ||
    (!hasCompletedInitialSync && hasLocalData === false)
  ) {
    return (
      <SyncBlocker
        activeBusiness={activeBusiness}
        syncSuccess={syncSuccess}
        syncing={syncing}
        handleSync={handleSync}
      />
    );
  }

  const headerInfo = getHeaderInfo();
  const showSidebar = sidebarVisible;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column' }}>
      <MobileNavbar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        syncing={syncing}
        handleSync={handleSync}
      />

      {/* Sidebar drawer overlay */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {showSidebar && (
          <Sidebar
            sidebarCollapsed={sidebarCollapsed}
            toggleSidebarCollapsed={toggleSidebarCollapsed}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            syncing={syncing}
            syncSuccess={syncSuccess}
            handleSync={handleSync}
          />
        )}

        <div
          style={{
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            minWidth: 0,
            height: '100vh',
            overflow: 'hidden',
          }}
        >
          <Header
            headerInfo={headerInfo}
            pathname={pathname}
            sidebarVisible={sidebarVisible}
            setSidebarVisible={setSidebarVisible}
            posMode={posMode}
            setPosMode={setPosMode}
          />

          {/* Main workspace contents */}
          <main className="main-content">
            {!isOnline && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  borderBottom: '1px solid #fee2e2',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  color: '#991b1b',
                  fontSize: '13px',
                  fontWeight: '500',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  flexShrink: 0,
                  zIndex: 20,
                  lineHeight: '1.4',
                }}
              >
                <WifiOff size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <strong style={{ color: '#b91c1c' }}>
                    Network Connection Unstable / Offline:
                  </strong>{' '}
                  Cloud replication is paused. Transactions are stored in the local database, but
                  please restore connection to prevent data loss or sync delays.
                </div>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
