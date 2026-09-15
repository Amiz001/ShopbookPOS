/**
 * Hard paywall. The only screen between a logged-in user and the app.
 *
 * There is deliberately no dismiss and no skip: entitlement is required to
 * reach the tabs, and app/index.tsx routes here whenever it is missing. The
 * one exit that is not a purchase is logging out, which staff need because a
 * cashier has no card and no authority to buy for the shop.
 *
 * The trial is granted by the STORE as an introductory offer, so "start free
 * trial" is a real purchase with a payment method attached that the store
 * bills automatically when the trial ends. Nothing here grants access on its
 * own — the entitlement still has to come back from the server.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PurchasesPackage } from 'react-native-purchases';
import { TOKENS } from '../../constants/tokens';
import { hapticFeedback } from '../../utils/haptics';
import { useAuthStore } from '../../stores/useAuthStore';
import { useBusinessStore } from '../../stores/useBusinessStore';
import { useEntitlementStore } from '../../stores/useEntitlementStore';
import { useIsBusinessOwner } from '../../hooks/useEntitlement';
import { fetchAppConfig, getCachedAppConfig } from '../../services/appConfig';
import { logPaywallEvent } from '../../services/paywallTelemetry';
import {
  getProPackages,
  getCachedProPackages,
  onProPackagesReady,
  purchasePackage,
  restorePurchases,
  hasProEntitlement,
  isTrialEligible,
} from '../../services/purchases';

const TRIAL_DAYS = 14;

/**
 * Apple bills the Sri Lanka storefront in USD, Google Play in LKR. Shop
 * owners think in rupees, so a non-LKR store price is converted for display
 * and rounded to the nearest 500 to match the published pricing.
 *
 * Rate drifts: 1 USD = 328 LKR on 2026-09-04. Update when it moves.
 */
const USD_TO_LKR = 328;

/**
 * The headline figure in rupees. Rounded to the nearest 500 so it matches the
 * price published on the website; a Play price is already in rupees and is
 * shown exactly as the store gives it.
 */
const rupeeAmount = (pkg: PurchasesPackage) =>
  pkg.product.currencyCode === 'LKR'
    ? pkg.product.price
    : Math.round((pkg.product.price * USD_TO_LKR) / 500) * 500;

const asRupees = (amount: number) => `Rs ${Math.round(amount).toLocaleString('en-US')}`;

const priceOf = (pkg: PurchasesPackage) =>
  pkg.product.currencyCode === 'LKR' ? pkg.product.priceString : asRupees(rupeeAmount(pkg));

/**
 * Per-month equivalent — Rs 3,000/month reads very differently to Rs 36,000/year.
 *
 * Derived from the rounded headline rather than the raw store price, so the
 * two figures on the card agree: 36,000 / 12 is exactly the 3,000 shown. Off
 * the raw price the rounding pulled quarterly and monthly to the same number
 * and the comparison between plans disappeared.
 */
const perMonthOf = (pkg: PurchasesPackage, months: number) => asRupees(rupeeAmount(pkg) / months);

/**
 * `anchor` is the list price the website strikes through (pos.shopbook.lk);
 * the saving and percentage are computed against the store's real price so
 * the card never claims a discount the store is not giving.
 */
const PLANS = [
  {
    packageId: '$rc_annual',
    label: '1 Year',
    months: 12,
    billing: 'billed yearly',
    per: 'year',
    anchor: 48000,
    badge: 'Best value',
  },
  {
    packageId: '$rc_three_month',
    label: '3 Months',
    months: 3,
    billing: 'billed quarterly',
    per: '3 months',
    anchor: 12000,
    badge: 'Most popular',
  },
  {
    packageId: '$rc_monthly',
    label: '1 Month',
    months: 1,
    billing: 'billed monthly',
    per: 'month',
    anchor: 5000,
    badge: 'Special offer',
  },
] as const;

/** Outcomes, not feature names — what the shop owner gets, in their words. */
const BENEFITS = [
  'Every sale backed up to the cloud, automatically',
  'Print receipts on a thermal printer, scan barcodes',
  'Staff log in with their own PIN; you see every sale',
  'Open the shop on a computer, export sales & profit reports',
];

export default function PaywallRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const isOwner = useIsBusinessOwner();
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);
  const logout = useAuthStore((s) => s.logout);

  const setFromSdk = useEntitlementStore((s) => s.setFromSdk);
  const refreshEntitlement = useEntitlementStore((s) => s.refresh);
  const isPro = useEntitlementStore((s) => s.isPro);

  const cachedPkgs = getCachedProPackages();
  const cachedConfig = getCachedAppConfig();

  const [packages, setPackages] = useState<PurchasesPackage[]>(cachedPkgs);
  const [busy, setBusy] = useState(false);
  const [iapEnabled, setIapEnabled] = useState(cachedConfig ? !!cachedConfig.iap_enabled : true);
  const [trialEligible, setTrialEligible] = useState(true);
  const [legal, setLegal] = useState({
    terms: cachedConfig?.terms_url ?? 'https://pos.shopbook.lk/terms',
    privacy: cachedConfig?.privacy_url ?? 'https://pos.shopbook.lk/privacy',
  });
  const [selectedId, setSelectedId] = useState<string>('$rc_annual');

  // Pro can arrive while this screen is open: a purchase on another device
  // (via the entitlement broadcast) or a late webhook after a purchase here.
  // Leave as soon as the server says so instead of waiting for a restart.
  useEffect(() => {
    if (isPro) router.replace('/(tabs)');
  }, [isPro, router]);

  useEffect(() => {
    return onProPackagesReady(() => {
      const fresh = getCachedProPackages();
      if (fresh.length > 0) setPackages(fresh);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    // A stale answer here strands an owner on "Owner account required".
    void refreshEntitlement(activeBusinessId);
    (async () => {
      const [pkgs, config] = await Promise.all([getProPackages(), fetchAppConfig()]);
      if (cancelled) return;

      setPackages(pkgs);
      setIapEnabled(!!config?.iap_enabled);
      if (config?.terms_url && config?.privacy_url) {
        setLegal({ terms: config.terms_url, privacy: config.privacy_url });
      }

      const annual = pkgs.find((p) => p.identifier === '$rc_annual');
      if (annual) setTrialEligible(await isTrialEligible(annual.product.identifier));

      logPaywallEvent('viewed', {
        businessId: activeBusinessId,
        metadata: { isOwner, packages: pkgs.length },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBusinessId, isOwner, refreshEntitlement]);

  const plans = useMemo(() => {
    const byId = new Map(packages.map((p) => [p.identifier, p]));
    return PLANS.map((plan) => ({ ...plan, pkg: byId.get(plan.packageId) }));
  }, [packages]);

  const selected = plans.find((p) => p.packageId === selectedId) ?? plans[0];
  const canPurchase = isOwner && iapEnabled && !!selected?.pkg;

  const selectPlan = (packageId: string, pkg?: PurchasesPackage) => {
    hapticFeedback.impactLight();
    setSelectedId(packageId);
    logPaywallEvent('plan_selected', {
      businessId: activeBusinessId,
      packageId,
      productId: pkg?.product.identifier,
    });
  };

  const handlePurchase = useCallback(async () => {
    if (!selected?.pkg || busy) return;
    hapticFeedback.impactMedium();
    setBusy(true);

    logPaywallEvent('purchase_started', {
      businessId: activeBusinessId,
      packageId: selected.packageId,
      productId: selected.pkg.product.identifier,
      metadata: { trialEligible },
    });

    try {
      const info = await purchasePackage(selected.pkg);
      if (hasProEntitlement(info)) {
        setFromSdk(info);
        hapticFeedback.notificationSuccess();
        logPaywallEvent('purchase_succeeded', {
          businessId: activeBusinessId,
          packageId: selected.packageId,
          productId: selected.pkg.product.identifier,
        });
        // The webhook lands within seconds; re-read so the server becomes
        // authoritative rather than leaving the SDK's optimistic unlock.
        setTimeout(() => void refreshEntitlement(activeBusinessId), 5000);
        router.replace('/(tabs)');
      }
    } catch (err: any) {
      const cancelled = !!err?.userCancelled;
      logPaywallEvent(cancelled ? 'purchase_cancelled' : 'purchase_failed', {
        businessId: activeBusinessId,
        packageId: selected.packageId,
        productId: selected.pkg.product.identifier,
        metadata: cancelled ? {} : { message: String(err?.message ?? err).slice(0, 300) },
      });
      if (!cancelled) Alert.alert('Purchase failed', err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }, [selected, busy, activeBusinessId, trialEligible, setFromSdk, refreshEntitlement, router]);

  const handleRestore = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    logPaywallEvent('restore_attempted', { businessId: activeBusinessId });
    try {
      const info = await restorePurchases();
      if (hasProEntitlement(info)) {
        setFromSdk(info);
        void refreshEntitlement(activeBusinessId);
        router.replace('/(tabs)');
      } else {
        Alert.alert('Nothing to restore', 'No previous subscription was found for this account.');
      }
    } catch (err: any) {
      Alert.alert('Restore failed', err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }, [busy, activeBusinessId, setFromSdk, refreshEntitlement, router]);

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You can sign back in at any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          logout();
          router.replace('/auth/number-input');
        },
      },
    ]);
  };

  const price = selected?.pkg ? priceOf(selected.pkg) : '—';
  const perMonth = selected?.pkg ? perMonthOf(selected.pkg, selected.months) : null;
  const storeOpen = iapEnabled && plans.some((p) => p.pkg);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <LinearGradient
          colors={['#2563EB', '#1E3A8A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <View style={[styles.bannerOrb, styles.bannerOrbLarge]} />
          <View style={[styles.bannerOrb, styles.bannerOrbSmall]} />
          <TouchableOpacity onPress={confirmLogout} hitSlop={12} style={styles.bannerLogout}>
            <Text style={styles.bannerLogoutText}>Log out</Text>
          </TouchableOpacity>
          <View style={styles.bannerTile}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={styles.bannerLogo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.bannerCopy}>
            <View style={styles.proPill}>
              <Ionicons name="diamond" size={11} color="#FDE68A" />
              <Text style={styles.proPillText}>SHOPBOOK POS PRO</Text>
            </View>
            <Text style={styles.heroTitle} maxFontSizeMultiplier={1.15}>
              Bill in seconds. Close the day in minutes.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.benefits}>
          {BENEFITS.map((line) => (
            <View key={line} style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={18} color="#D97706" />
              <Text style={styles.benefitText} maxFontSizeMultiplier={1.15}>
                {line}
              </Text>
            </View>
          ))}
        </View>

        {!isOwner && (
          <View style={styles.notice}>
            <Feather name="info" size={16} color={TOKENS.primary} />
            <Text style={styles.noticeText}>
              Only the shop owner can subscribe. Ask the owner of{' '}
              {activeBusiness?.name ?? 'your shop'} to activate Pro.
            </Text>
          </View>
        )}

        {!storeOpen ? (
          <View style={styles.notice}>
            <Feather name="clock" size={16} color={TOKENS.primary} />
            <Text style={styles.noticeText}>
              Subscriptions are opening soon. Please check back shortly.
            </Text>
          </View>
        ) : (
          <View style={styles.plans}>
            {plans.map((plan) => {
              if (!plan.pkg) return null;
              const active = plan.packageId === selectedId;
              const saving = plan.anchor - rupeeAmount(plan.pkg);
              const percentOff = Math.round((saving / plan.anchor) * 100);
              const badge =
                plan.packageId === '$rc_annual' && saving > 0
                  ? `${plan.badge} · ${percentOff}% off`
                  : plan.badge;
              return (
                <TouchableOpacity
                  key={plan.packageId}
                  activeOpacity={0.85}
                  onPress={() => selectPlan(plan.packageId, plan.pkg)}
                  style={[styles.planCard, active && styles.planCardActive]}
                >
                  <View style={[styles.badge, active && styles.badgeActive]}>
                    <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
                      {badge}
                    </Text>
                  </View>
                  <View style={styles.planRadio}>
                    {active ? (
                      <Ionicons name="checkmark-circle" size={22} color={TOKENS.primary} />
                    ) : (
                      <View style={styles.planRadioEmpty} />
                    )}
                  </View>
                  <View style={styles.planBody}>
                    <Text style={styles.planLabel}>{plan.label}</Text>
                    {saving > 0 && (
                      <View style={styles.savingRow}>
                        <Text style={styles.anchorPrice}>{asRupees(plan.anchor)}</Text>
                        <View style={styles.savingPill}>
                          <Text style={styles.savingText}>Save {asRupees(saving)}</Text>
                        </View>
                      </View>
                    )}
                    <Text style={styles.planBilling}>
                      {trialEligible
                        ? `Free ${TRIAL_DAYS} days · ${priceOf(plan.pkg)}/${plan.per}`
                        : `${priceOf(plan.pkg)} ${plan.billing}`}
                    </Text>
                  </View>
                  <View style={styles.planRight}>
                    <Text style={styles.planPerMonth}>{perMonthOf(plan.pkg, plan.months)}</Text>
                    <Text style={styles.planPerMonthUnit}>per month</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          activeOpacity={canPurchase ? 0.85 : 1}
          disabled={!canPurchase || busy}
          onPress={handlePurchase}
          style={[styles.cta, !canPurchase && styles.ctaDisabled]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.ctaText, !canPurchase && styles.ctaTextDisabled]}>
              {!isOwner
                ? 'Owner account required'
                : trialEligible
                  ? `Start ${TRIAL_DAYS}-day free trial`
                  : `Subscribe · ${price}`}
            </Text>
          )}
        </TouchableOpacity>

        {canPurchase && (
          <Text style={styles.finePrint} numberOfLines={3} maxFontSizeMultiplier={1.15}>
            {trialEligible
              ? `Free for ${TRIAL_DAYS} days, then ${price} ${selected?.billing}`
              : `${price} ${selected?.billing}`}
            {perMonth ? ` · about ${perMonth} a month` : ''}. Renews automatically; cancel any time
            in your store account.
          </Text>
        )}

        <View style={styles.footerLinks}>
          {isOwner && (
            <>
              <TouchableOpacity onPress={handleRestore} disabled={busy}>
                <Text style={styles.footerLink}>Restore purchase</Text>
              </TouchableOpacity>
              <Text style={styles.footerDot}>·</Text>
            </>
          )}
          <TouchableOpacity onPress={() => Linking.openURL(legal.terms)}>
            <Text style={styles.footerLink}>Terms</Text>
          </TouchableOpacity>
          <Text style={styles.footerDot}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL(legal.privacy)}>
            <Text style={styles.footerLink}>Privacy</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: TOKENS.background },
  scroll: { paddingHorizontal: 20, paddingBottom: 16, gap: 16 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 18,
    overflow: 'hidden',
  },
  bannerOrb: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' },
  bannerOrbLarge: { width: 220, height: 220, right: -70, top: -110 },
  bannerOrbSmall: { width: 120, height: 120, left: -40, bottom: -70 },
  bannerLogout: { position: 'absolute', top: 12, right: 14 },
  bannerLogoutText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  bannerTile: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerLogo: { width: 36, height: 40 },
  bannerCopy: { flex: 1, gap: 6, paddingTop: 10 },
  proPill: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  proPillText: { fontSize: 11, fontWeight: 'bold', color: '#FDE68A', letterSpacing: 1 },
  heroTitle: {
    fontSize: 21,
    fontWeight: 'bold',
    color: '#FFFFFF',
    lineHeight: 27,
  },

  benefits: { gap: 8 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  benefitText: { flex: 1, fontSize: 14, color: TOKENS.dark, lineHeight: 20 },

  plans: { gap: 10, paddingTop: 6 },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: TOKENS.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  planCardActive: { borderColor: TOKENS.primary, backgroundColor: TOKENS.lightBlue },
  badge: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeActive: { backgroundColor: TOKENS.primary },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: '#B45309' },
  badgeTextActive: { color: '#FFFFFF' },
  planRadio: { width: 22, alignItems: 'center' },
  planRadioEmpty: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: TOKENS.border,
  },
  planBody: { flex: 1, gap: 3 },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  anchorPrice: { fontSize: 12, color: TOKENS.muted, textDecorationLine: 'line-through' },
  savingPill: {
    backgroundColor: '#DCFCE7',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  savingText: { fontSize: 10, fontWeight: 'bold', color: '#166534' },
  planLabel: { fontSize: 16, fontWeight: 'bold', color: TOKENS.dark },
  planBilling: { fontSize: 12, color: TOKENS.muted },
  planRight: { alignItems: 'flex-end' },
  planPerMonth: { fontSize: 17, fontWeight: 'bold', color: TOKENS.dark },
  planPerMonthUnit: { fontSize: 11, color: TOKENS.muted },

  notice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: TOKENS.lightBlue,
    borderRadius: 12,
    padding: 12,
  },
  noticeText: { flex: 1, fontSize: 13, color: TOKENS.dark, lineHeight: 19 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
    backgroundColor: TOKENS.card,
    borderTopWidth: 1,
    borderTopColor: TOKENS.border,
  },
  cta: {
    backgroundColor: TOKENS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { backgroundColor: TOKENS.border },
  ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  ctaTextDisabled: { color: TOKENS.muted },
  // Reserve three lines: the text is two lines for some plans and three for
  // others, and without this the button and links jump on every selection.
  finePrint: {
    fontSize: 11,
    color: TOKENS.muted,
    textAlign: 'center',
    lineHeight: 16,
    minHeight: 48,
  },
  footerLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  footerLink: { fontSize: 12, color: TOKENS.primary, fontWeight: '600' },
  footerDot: { fontSize: 12, color: TOKENS.border },
});
