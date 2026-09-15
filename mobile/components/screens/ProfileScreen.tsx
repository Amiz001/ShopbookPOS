import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenWrapper } from '../common/ScreenWrapper';
import { TOKENS } from '../../constants/tokens';
import { cartState } from '../data/cartState';
import { useActiveBusiness } from '../../hooks/useActiveBusiness';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { syncDatabaseNow } from '../../services/sync';
import { useUserPermissions } from '../../hooks/useUserPermissions';
import { BusinessAvatar } from '../common/BusinessAvatar';
import { deleteCurrentDeviceSession } from '../../hooks/useActiveDeviceTracker';
import { PremiumUpgradeModal } from '../common/PremiumUpgradeModal';
import { HelpSupportModal } from '../common/HelpSupportModal';
import { LanguageSwitcherModal } from '../common/LanguageSwitcherModal';
import { hapticFeedback } from '../../utils/haptics';
import { useTranslation } from '../../hooks/useTranslation';
import { useIsPro, useSubscriptionSummary, useIsBusinessOwner } from '../../hooks/useEntitlement';
import { useAuthStore } from '../../stores/useAuthStore';
import { deleteAccount } from '../../services/account';

export const ProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pairedPrinter = useSettingsStore((s) => s.pairedPrinter);
  const isPremium = useIsPro();

  const { t, language } = useTranslation();
  const subscription = useSubscriptionSummary();
  const isOwner = useIsBusinessOwner();
  const userPhone = useAuthStore((s) => s.userPhone);
  const activeBusinessId = useAuthStore((s) => s.activeBusinessId);

  // Shown under "Premium Plans" so the current plan and its renewal date are
  // visible from Profile, rather than only after opening the screen.
  const subscriptionLine = !subscription.isPro
    ? t('profile.premiumSub')
    : [
        subscription.planName ? `${subscription.planName} plan` : 'Subscribed',
        subscription.isTrial ? 'free trial' : null,
        subscription.expiresAt
          ? `${subscription.willRenew ? 'renews' : 'ends'} ${new Date(
              subscription.expiresAt
            ).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');

  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState('');

  const activeBusiness = useActiveBusiness();

  // Help & Support Modal state
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 1500);
  };

  const checkPremiumAction = (featureName: string, action: () => void) => {
    if (isPremium) {
      action();
    } else {
      setPremiumFeatureName(featureName);
      setPremiumModalVisible(true);
    }
  };

  const { canPerform, role: userRole } = useUserPermissions();

  // Two confirmations on purpose: this wipes every shop registered to the
  // owner's phone on the server and on the device, and nothing restores it.
  const confirmDeleteAccount = () => {
    hapticFeedback.notificationWarning();
    if (!activeBusinessId || !userPhone) return;

    Alert.alert(t('profile.deleteAccountTitle'), t('profile.deleteAccountMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.deleteAccountContinue'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('profile.deleteAccountFinalTitle'), t('profile.deleteAccountFinalMsg'), [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('profile.deleteAccountConfirm'),
              style: 'destructive',
              onPress: async () => {
                try {
                  await deleteCurrentDeviceSession();
                  await deleteAccount(activeBusinessId);
                  cartState.logout();
                  router.replace('/auth/number-input');
                } catch (err: any) {
                  Alert.alert(
                    t('profile.deleteAccountFailedTitle'),
                    err?.message || t('profile.deleteAccountFailedMsg')
                  );
                }
              },
            },
          ]);
        },
      },
    ]);
  };

  return (
    <ScreenWrapper noPaddingBottom style={styles.container}>
      {/* Toast Notification */}
      {toastMessage && (
        <View style={styles.toastContainer}>
          <Feather name="check-circle" size={16} color={TOKENS.card} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Header exactly matching theme */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={() => router.push('/')}
        >
          <Feather name="chevron-left" size={22} color={TOKENS.dark} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Profile Settings</Text>

        <View style={styles.headerRightActions}>
          <View style={styles.placeholderWidth} />
        </View>
      </View>

      {/* Scrollable Settings Panel */}
      <ScrollView
        style={styles.scrollWrapper}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar Card Glassmorphic Premium */}
        <View style={styles.avatarCard}>
          <BusinessAvatar
            logoUri={activeBusiness?.logoUri}
            name={activeBusiness?.name || 'SP'}
            size={72}
          />

          <Text style={styles.partnerName}>
            {activeBusiness?.name || t('profile.partnerStore')}
          </Text>
          <Text style={styles.partnerPlan}>
            🛡️{' '}
            {userRole === 'admin'
              ? t('profile.adminPrivilege')
              : userRole === 'manager'
                ? t('profile.managerPrivilege')
                : t('profile.cashierPrivilege')}
          </Text>

          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>
              {userRole === 'admin'
                ? t('profile.adminStatusActive')
                : userRole === 'manager'
                  ? t('profile.managerStatusActive')
                  : t('profile.cashierStatusActive')}
            </Text>
          </View>
        </View>

        {/* Setting options list group */}
        <View style={styles.optionsGroup}>
          <Text style={styles.groupHeader}>{t('profile.groupBusiness')}</Text>

          {/* Option: Shop Details */}
          <TouchableOpacity
            style={styles.optionRow}
            activeOpacity={0.7}
            onPress={() => {
              hapticFeedback.selection();
              router.push('/profile/business-details');
            }}
          >
            <View style={[styles.optionIconBox, { backgroundColor: '#E8F0FE' }]}>
              <Feather name="home" size={18} color={TOKENS.primary} />
            </View>
            <View style={styles.optionTextWrapper}>
              <Text style={styles.optionTitle}>{t('profile.storeDetailsTitle')}</Text>
              <Text style={styles.optionSubtitle}>
                {userRole === 'cashier'
                  ? t('profile.storeDetailsSubStaff')
                  : t('profile.storeDetailsSubAdmin')}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={TOKENS.muted} />
          </TouchableOpacity>

          {/* Option: Business Management */}
          <TouchableOpacity
            style={styles.optionRow}
            activeOpacity={0.7}
            onPress={() => {
              hapticFeedback.selection();
              checkPremiumAction('Multiple branch management', () =>
                router.push('/profile/manage-businesses')
              );
            }}
          >
            <View style={[styles.optionIconBox, { backgroundColor: '#FEF7E0' }]}>
              <Feather name="briefcase" size={18} color="#B06000" />
            </View>
            <View style={styles.optionTextWrapper}>
              <Text style={styles.optionTitle}>{t('profile.businessMgmtTitle')}</Text>
              <Text style={styles.optionSubtitle}>
                {userRole === 'cashier'
                  ? t('profile.businessMgmtSubStaff')
                  : t('profile.businessMgmtSubAdmin')}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={TOKENS.muted} />
          </TouchableOpacity>

          {/* Option: Bluetooth Printer Setup */}
          <TouchableOpacity
            style={styles.optionRow}
            activeOpacity={0.7}
            onPress={() => {
              hapticFeedback.selection();
              checkPremiumAction('Bluetooth thermal printer printing', () =>
                router.push('/profile/bluetooth-printer')
              );
            }}
          >
            <View style={[styles.optionIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Feather name="printer" size={18} color={TOKENS.primary} />
            </View>
            <View style={styles.optionTextWrapper}>
              <Text style={styles.optionTitle}>{t('profile.printerTitle')}</Text>
              <Text style={styles.optionSubtitle}>
                {pairedPrinter
                  ? t('profile.printerSubConnected', { printer: pairedPrinter.name })
                  : t('profile.printerSubScan')}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={TOKENS.muted} />
          </TouchableOpacity>

          {/* Option: Active Devices */}
          <TouchableOpacity
            style={styles.optionRow}
            activeOpacity={0.7}
            onPress={() => {
              hapticFeedback.selection();
              checkPremiumAction('Active devices monitoring', () =>
                router.push('/profile/active-devices')
              );
            }}
          >
            <View style={[styles.optionIconBox, { backgroundColor: '#E8F0FE' }]}>
              <Feather name="smartphone" size={18} color={TOKENS.primary} />
            </View>
            <View style={styles.optionTextWrapper}>
              <Text style={styles.optionTitle}>{t('profile.devicesTitle')}</Text>
              <Text style={styles.optionSubtitle}>{t('profile.devicesSub')}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={TOKENS.muted} />
          </TouchableOpacity>

          {/* Option: Staff Management (Hidden for Manager & Cashier!) */}
          {canPerform('create', 'staff') && (
            <TouchableOpacity
              style={styles.optionRow}
              activeOpacity={0.7}
              onPress={() => {
                hapticFeedback.selection();
                checkPremiumAction('Staff accounts management', () =>
                  router.push('/profile/manage-staff')
                );
              }}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#E6F4EA' }]}>
                <Feather name="users" size={18} color="#137333" />
              </View>
              <View style={styles.optionTextWrapper}>
                <Text style={styles.optionTitle}>{t('profile.staffTitle')}</Text>
                <Text style={styles.optionSubtitle}>{t('profile.staffSub')}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={TOKENS.muted} />
            </TouchableOpacity>
          )}

          {/* Option: Premium Plans Setup (Hidden for Manager & Cashier!) */}
          {canPerform('create', 'settings') && (
            <TouchableOpacity
              style={styles.optionRow}
              activeOpacity={0.7}
              onPress={() => {
                hapticFeedback.selection();
                router.push('/profile/premium-plans');
              }}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="diamond" size={18} color="#D97706" />
              </View>
              <View style={styles.optionTextWrapper}>
                <Text style={styles.optionTitle}>{t('profile.premiumTitle')}</Text>
                <Text style={styles.optionSubtitle}>{subscriptionLine}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={TOKENS.muted} />
            </TouchableOpacity>
          )}

          {/* Option: Language Selector */}
          <TouchableOpacity
            style={styles.optionRow}
            activeOpacity={0.7}
            onPress={() => {
              hapticFeedback.selection();
              setIsLanguageModalOpen(true);
            }}
          >
            <View style={[styles.optionIconBox, { backgroundColor: '#F1F5F9' }]}>
              <Feather name="globe" size={18} color="#475569" />
            </View>
            <View style={styles.optionTextWrapper}>
              <Text style={styles.optionTitle}>{t('profile.languageTitle')}</Text>
              <Text style={styles.optionSubtitle}>
                {language === 'si'
                  ? 'සිංහල (Sinhala)'
                  : language === 'ta'
                    ? 'தமிழ் (Tamil)'
                    : 'English (US)'}
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={TOKENS.muted} />
          </TouchableOpacity>
        </View>

        {/* Option Group: Sync & Backup (Hidden for Cashier!) */}
        {canPerform('read', 'sync') && (
          <View style={styles.optionsGroup}>
            <Text style={styles.groupHeader}>{t('profile.groupSync')}</Text>

            {/* Option: Manual Sync */}
            <TouchableOpacity
              style={styles.optionRow}
              activeOpacity={0.7}
              onPress={async () => {
                hapticFeedback.impactMedium();
                checkPremiumAction('Manual database synchronization', async () => {
                  triggerToast(t('profile.syncing'));
                  const outcome = await syncDatabaseNow();
                  if (outcome.status === 'success') {
                    hapticFeedback.notificationSuccess();
                    triggerToast(t('profile.syncSuccess'));
                  } else if (outcome.status === 'skipped') {
                    hapticFeedback.notificationWarning();
                    const reasonKey =
                      outcome.reason === 'backup_disabled'
                        ? 'profile.syncSkippedBackupOff'
                        : outcome.reason === 'no_business'
                          ? 'profile.syncSkippedNoBusiness'
                          : 'profile.syncSkippedEnvMissing';
                    Alert.alert(t('profile.syncSkipped'), t(reasonKey));
                  } else if (outcome.status === 'error') {
                    hapticFeedback.notificationError();
                    Alert.alert(
                      t('profile.syncFailed'),
                      outcome.message || t('profile.syncFailedMsg')
                    );
                  } else {
                    // 'deferred' cannot happen from syncDatabaseNow, but keep the UI honest.
                    hapticFeedback.notificationWarning();
                    triggerToast(t('profile.syncing'));
                  }
                });
              }}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#E6F4EA' }]}>
                <Feather name="refresh-cw" size={18} color="#137333" />
              </View>
              <View style={styles.optionTextWrapper}>
                <Text style={styles.optionTitle}>{t('profile.syncTitle')}</Text>
                <Text style={styles.optionSubtitle}>{t('profile.syncSub')}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={TOKENS.muted} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.optionsGroup}>
          <Text style={styles.groupHeader}>{t('profile.groupSupport')}</Text>

          {/* Option: Help */}
          <TouchableOpacity
            style={styles.optionRow}
            activeOpacity={0.7}
            onPress={() => {
              hapticFeedback.selection();
              setIsHelpModalOpen(true);
            }}
          >
            <View style={[styles.optionIconBox, { backgroundColor: '#F3F4F6' }]}>
              <Feather name="help-circle" size={18} color={TOKENS.dark} />
            </View>
            <View style={styles.optionTextWrapper}>
              <Text style={styles.optionTitle}>{t('profile.helpTitle')}</Text>
              <Text style={styles.optionSubtitle}>{t('profile.helpSub')}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={TOKENS.muted} />
          </TouchableOpacity>

          {/* Option: Disconnect Signout */}
          <TouchableOpacity
            style={styles.optionRow}
            activeOpacity={0.7}
            onPress={() => {
              hapticFeedback.notificationWarning();
              Alert.alert(t('profile.disconnectConfirmTitle'), t('profile.disconnectConfirmMsg'), [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('profile.signOutTitle'),
                  style: 'destructive',
                  onPress: async () => {
                    hapticFeedback.notificationSuccess();
                    await deleteCurrentDeviceSession();
                    cartState.logout();
                    triggerToast(t('profile.profileLoggedOut'));
                    router.replace('/auth/number-input');
                  },
                },
              ]);
            }}
          >
            <View style={[styles.optionIconBox, { backgroundColor: '#FCE8E6' }]}>
              <Feather name="log-out" size={18} color={TOKENS.error} />
            </View>
            <View style={styles.optionTextWrapper}>
              <Text style={[styles.optionTitle, { color: TOKENS.error }]}>
                {t('profile.signOutTitle')}
              </Text>
              <Text style={styles.optionSubtitle}>{t('profile.signOutSub')}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={TOKENS.muted} />
          </TouchableOpacity>

          {/* Option: Delete account and data (owner only, Play requirement) */}
          {isOwner && (
            <TouchableOpacity
              style={styles.optionRow}
              activeOpacity={0.7}
              onPress={confirmDeleteAccount}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#FCE8E6' }]}>
                <Feather name="trash-2" size={18} color={TOKENS.error} />
              </View>
              <View style={styles.optionTextWrapper}>
                <Text style={[styles.optionTitle, { color: TOKENS.error }]}>
                  {t('profile.deleteAccountTitle')}
                </Text>
                <Text style={styles.optionSubtitle}>{t('profile.deleteAccountSub')}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={TOKENS.muted} />
            </TouchableOpacity>
          )}
        </View>
        {/* Footer info: Made in Sri Lanka & App Version */}
        <View style={styles.footerContainer}>
          <Text style={styles.versionText}>{t('profile.appVersion')}</Text>
          <Text style={styles.madeInText}>Made in 🇱🇰 with ❤️</Text>
        </View>
      </ScrollView>

      {/* Help & Customer Support Bottom Sheet */}
      <HelpSupportModal visible={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />

      <PremiumUpgradeModal
        visible={premiumModalVisible}
        onClose={() => setPremiumModalVisible(false)}
        featureName={premiumFeatureName}
      />

      {/* Language Switcher Bottom Sheet Component */}
      <LanguageSwitcherModal
        visible={isLanguageModalOpen}
        onClose={() => setIsLanguageModalOpen(false)}
        onSelectLanguage={(name) => triggerToast(`${name} set successfully!`)}
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.background,
  },
  toastContainer: {
    position: 'absolute',
    top: 90,
    alignSelf: 'center',
    backgroundColor: TOKENS.success,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    zIndex: 999,
    boxShadow: '0px 2px 4px 0px rgba(0, 0, 0, 0.15)',
  },
  toastText: {
    color: TOKENS.card,
    fontSize: 13,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.border,
    backgroundColor: TOKENS.card,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TOKENS.dark,
  },
  placeholderWidth: {
    width: 36,
  },
  scrollWrapper: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  avatarCard: {
    backgroundColor: TOKENS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TOKENS.border,
    padding: 20,
    alignItems: 'center',
    boxShadow: '0px 2px 4px 0px rgba(0, 0, 0, 0.02)',
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: TOKENS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0px 4px 6px 0px ${TOKENS.primary}33`,
  },
  avatarInitials: {
    fontSize: 26,
    fontWeight: 'bold',
    color: TOKENS.card,
  },
  partnerName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: TOKENS.dark,
    marginTop: 14,
  },
  partnerPlan: {
    fontSize: 12,
    color: TOKENS.muted,
    marginTop: 4,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
    marginTop: 12,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#137333',
  },
  activeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#137333',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: TOKENS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statVal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: TOKENS.primary,
  },
  statLabel: {
    fontSize: 11,
    color: TOKENS.muted,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: TOKENS.border,
  },
  optionsGroup: {
    gap: 8,
  },
  groupHeader: {
    fontSize: 12,
    fontWeight: 'bold',
    color: TOKENS.muted,
    letterSpacing: 0.5,
    marginLeft: 4,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TOKENS.border,
    padding: 12,
  },
  optionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionTextWrapper: {
    flex: 1,
    marginRight: 8,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TOKENS.dark,
  },
  optionSubtitle: {
    fontSize: 11,
    color: TOKENS.muted,
    marginTop: 4,
    lineHeight: 14,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  switchButton: {
    width: 46,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  switchButtonActive: {
    backgroundColor: TOKENS.primary,
  },
  switchButtonInactive: {
    backgroundColor: '#D1D5DB',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    boxShadow: '0px 1px 1.5px 0px rgba(0, 0, 0, 0.2)',
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  switchThumbInactive: {
    alignSelf: 'flex-start',
  },
  footerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    marginBottom: 8,
    gap: 4,
  },
  madeInText: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.muted,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.muted,
    opacity: 0.7,
  },
});
