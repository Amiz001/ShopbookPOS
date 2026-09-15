import { Redirect, Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { BottomTabBar } from '../../components/common/BottomTabBar';
import { useTabBarVisible } from '../../hooks/useTabBarVisible';
import { useActiveDeviceTracker } from '../../hooks/useActiveDeviceTracker';
import { useBusinessSwitchSync } from '../../hooks/useBusinessSwitchSync';
import { useWatermelonSync } from '../../hooks/useWatermelonSync';
import { useAuthStore } from '../../stores/useAuthStore';
import { syncDatabase, supabase, getClientId } from '../../services/sync';
import { useEntitlementSync } from '../../hooks/useEntitlement';
import { useEntitlementStore } from '../../stores/useEntitlementStore';
import { ErrorFallback } from '../../components/common/AppErrorBoundary';
import type { ErrorBoundaryProps } from 'expo-router';

/** A tab screen that throws shows a retry page while the rest of the app keeps running. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorFallback error={error} retry={retry} />;
}

export default function TabLayout() {
  useActiveDeviceTracker();
  useBusinessSwitchSync();
  useWatermelonSync(); // Enable periodic background database sync
  useEntitlementSync(); // Keep server-backed Pro entitlement fresh

  // Closes the gate behind them: a subscription that lapses mid-session, or
  // is revoked server-side, bounces back to the paywall on the next refresh
  // rather than leaving the till open until the app is restarted.
  const isPro = useEntitlementStore((s) => s.isPro);
  const checkedAt = useEntitlementStore((s) => s.checkedAt);

  const { tabBarVisible } = useTabBarVisible();
  const translateY = useSharedValue(0);
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);

  // Subscribe to real-time sync trigger broadcasts for active business
  useEffect(() => {
    if (!activeBusinessId) return;

    const clientId = getClientId();
    const channel = supabase
      .channel(`sync:${activeBusinessId}`, { config: { private: true } })
      .on('broadcast', { event: 'sync_trigger' }, (payload) => {
        const data = payload.payload;
        if (data && data.senderId !== clientId && data.businessId === activeBusinessId) {
          console.log(
            `[Sync Broadcast] Received sync trigger from device: ${data.senderId}. Syncing...`
          );
          syncDatabase().catch((err) => console.error('Realtime sync failed:', err));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(
            `[Sync Broadcast] Subscribed to realtime sync channel: sync:${activeBusinessId}`
          );
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBusinessId]);

  useEffect(() => {
    translateY.value = withSpring(tabBarVisible ? 0 : 130);
  }, [tabBarVisible, translateY]);

  const tabBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const mapRouteToTab = (routeName: string): any => {
    if (routeName === 'index') return 'home';
    return routeName;
  };

  if (checkedAt !== null && !isPro) {
    return <Redirect href="/paywall" />;
  }

  return (
    <Tabs
      tabBar={(props) => {
        const routeName = props.state.routeNames[props.state.index];
        const activeTab = mapRouteToTab(routeName);
        return (
          <Animated.View
            style={[
              {
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 100,
              },
              tabBarAnimatedStyle,
            ]}
          >
            <BottomTabBar
              activeTab={activeTab}
              onTabPress={(tabId) => {
                const routeName =
                  tabId === 'home' ? 'index' : tabId === 'orders' ? 'insights' : tabId;
                props.navigation.navigate(routeName);
              }}
            />
          </Animated.View>
        );
      }}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="pos"
        options={{
          title: 'POS',
        }}
      />
      <Tabs.Screen
        name="stocks"
        options={{
          title: 'Stocks',
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
    </Tabs>
  );
}
