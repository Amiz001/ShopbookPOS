import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PermissionProvider } from '../hooks/usePermissionHandler';
import { useEffect, useState } from 'react';
import { startUploadQueueMonitor, setQueryInvalidator } from '../services/uploadQueue';
import { setOnSyncSuccess } from '../services/sync';
import { useSyncRefreshStore } from '../stores/useSyncRefreshStore';
import { setupNotificationListeners } from '../services/notificationService';
import { useForceUpdate } from '../hooks/useForceUpdate';
import { useEntitlementRealtime } from '../hooks/useEntitlement';
import { ForceUpdateScreen } from '../components/screens/ForceUpdateScreen';
import { CustomSplashScreen } from '../components/screens/CustomSplashScreen';
import { useAuthStore } from '../stores/useAuthStore';
import { useEntitlementStore } from '../stores/useEntitlementStore';
import { supabase } from '../services/supabaseClient';
import * as SplashScreen from 'expo-splash-screen';
import { configurePurchases, isProPackagesReady, onProPackagesReady } from '../services/purchases';
import { AppErrorBoundary, ErrorFallback } from '../components/common/AppErrorBoundary';
import { installCrashGuard } from '../services/crashGuard';
import type { ErrorBoundaryProps } from 'expo-router';

// Prevent native splash screen from hiding automatically on app startup
SplashScreen.preventAutoHideAsync().catch((err) => {
  console.warn('Failed to prevent native splash auto hide:', err);
});

// Never let an uncaught JS error terminate the process in release builds.
installCrashGuard();

// Configure RevenueCat immediately at startup so offerings are prefetched during splash
configurePurchases();

/** Route-level boundary: an error inside any screen shows a retry page, not a crash. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorFallback error={error} retry={retry} />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

const refreshSyncedData = () => {
  // Reset infinite-query pages so newest synced records appear from page 0
  queryClient.resetQueries();
  useSyncRefreshStore.getState().bump();
};

// Refresh all screens after background sync (broadcast, push, pull) or uploads
setOnSyncSuccess(refreshSyncedData);
setQueryInvalidator(refreshSyncedData);

function MainAppContent() {
  const { isLoading, isUpdateRequired, config, currentVersion, refetch } = useForceUpdate();
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSplashActive, setIsSplashActive] = useState(true);
  const [isPackagesReady, setIsPackagesReady] = useState(isProPackagesReady());

  const isPro = useEntitlementStore((s) => s.isPro);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const needsPackages = isLoggedIn && !isPro;

  // Pro unlock from another device, live on the paywall and in the tabs alike.
  useEntitlementRealtime();

  useEffect(() => {
    if (isProPackagesReady()) {
      setIsPackagesReady(true);
      return;
    }
    const unsub = onProPackagesReady(() => setIsPackagesReady(true));
    const timer = setTimeout(() => setIsPackagesReady(true), 2500);
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  // Monitor Zustand storage hydration status
  // Installs that predate Supabase Auth carry a zustand session but no token;
  // so does a session revoked server-side. Either way, back to login.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const lost = event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session);
      if (lost && useAuthStore.getState().isLoggedIn) useAuthStore.getState().logout();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const checkHydration = () => {
      if (useAuthStore.persist.hasHydrated() && useEntitlementStore.persist.hasHydrated()) {
        setIsHydrated(true);
      }
    };

    checkHydration();
    const unsubAuth = useAuthStore.persist.onFinishHydration(checkHydration);
    const unsubEntitlement = useEntitlementStore.persist.onFinishHydration(checkHydration);

    return () => {
      unsubAuth();
      unsubEntitlement();
    };
  }, []);

  return (
    <>
      {isUpdateRequired ? (
        <ForceUpdateScreen config={config} currentVersion={currentVersion} onRetry={refetch} />
      ) : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(modules)/auth/number-input" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(modules)/pos/cart" />
          <Stack.Screen name="(modules)/pos/catalog" />
          <Stack.Screen name="(modules)/pos/payment-tender" />
          <Stack.Screen name="(modules)/pos/search" />
          <Stack.Screen name="(modules)/stocks/scan" />
          <Stack.Screen name="(modules)/profile/business-details" />
          <Stack.Screen name="(modules)/profile/bluetooth-printer" />
          <Stack.Screen name="(modules)/profile/manage-businesses" />
          <Stack.Screen name="(modules)/profile/manage-staff" />
          <Stack.Screen name="(modules)/profile/active-devices" />
          <Stack.Screen name="(modules)/profile/premium-plans" />
          <Stack.Screen
            name="(modules)/paywall"
            options={{ headerShown: false, gestureEnabled: false }}
          />
        </Stack>
      )}

      {isSplashActive && (
        <CustomSplashScreen
          isReady={!isLoading && isHydrated && (!needsPackages || isPackagesReady)}
          onAnimationComplete={() => setIsSplashActive(false)}
        />
      )}
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Configure RevenueCat. Returns false until the SDK keys are provisioned,
    // which is the expected state before the stores approve the products.
    configurePurchases();

    // Start the NetInfo connectivity monitor for the offline upload queue
    startUploadQueueMonitor();

    // Configure push notification event handlers
    const cleanupNotifications = setupNotificationListeners(
      (notification) => {
        console.log('Foreground notification received:', notification.request.content);
      },
      (response) => {
        console.log('Notification clicked:', response.notification.request.content);
      }
    );

    return () => {
      cleanupNotifications();
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <StatusBar style="dark" />
          <PermissionProvider>
            <BottomSheetModalProvider>
              <AppErrorBoundary>
                <MainAppContent />
              </AppErrorBoundary>
            </BottomSheetModalProvider>
          </PermissionProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
