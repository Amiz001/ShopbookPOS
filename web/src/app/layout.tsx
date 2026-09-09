'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSettingsStore } from '../stores/settingsStore';
import { startUploadQueueMonitor } from '@/services/uploadQueue';
import { useSyncStore } from '../stores/syncStore';
import { useLocalDataCheck } from '../hooks/useLocalDataCheck';
import { useAppAuthGuard } from '../hooks/useAppAuthGuard';
import { useAppSync } from '../hooks/useAppSync';
import SyncBlocker from '../components/layout/SyncBlocker';
import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from '../components/layout/Sidebar';
import { MobileNavbar } from '../components/layout/MobileNavbar';
import { Header } from '../components/layout/Header';
import { WifiOff } from 'lucide-react';
import { MobileBlocker } from '../components/layout/MobileBlocker';
import { useActiveDeviceTracker } from '../hooks/useActiveDeviceTracker';
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
  useActiveDeviceTracker();
  const pathname = usePathname();
  const { t } = useTranslation();

  const posMode = useSettingsStore((s) => s.posMode);
  const setPosMode = useSettingsStore((s) => s.setPosMode);
  const sidebarVisible = useSettingsStore((s) => s.sidebarVisible);
  const setSidebarVisible = useSettingsStore((s) => s.setSidebarVisible);

  const { isSyncing: syncing, syncSuccess, hasCompletedInitialSync } = useSyncStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Custom Hooks for State & Routing Guards
  const { hydrated, isLoggedIn, activeBusiness } = useAppAuthGuard();
  const { handleSync } = useAppSync(hydrated);
  const hasLocalData = useLocalDataCheck();

  // Network connection status watcher
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      handleSync(); // Auto sync when connection is restored
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initialize background upload queue monitor
    startUploadQueueMonitor();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [hydrated, isLoggedIn]);

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

  if (
    isLoggedIn &&
    pathname !== '/auth' &&
    (!activeBusiness ||
      activeBusiness.id === '0' ||
      (!hasCompletedInitialSync && hasLocalData === false))
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

  if (pathname === '/auth') {
    return <div style={{ backgroundColor: '#f9fafb', height: '100vh' }} />;
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
