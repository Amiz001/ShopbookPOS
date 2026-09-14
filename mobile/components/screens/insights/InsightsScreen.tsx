import { Feather } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TOKENS } from '../../../constants/tokens';
import { useBusinessInsights, useInsightsExport } from '../../../hooks/useInsights';
import { useProducts } from '../../../hooks/useProducts';
import { useGetPeriodOrders } from '../../../hooks/useOrders';
import { syncDatabase } from '../../../services/sync';
import { BottomSheet } from '../../common/BottomSheet';
import { ScreenWrapper } from '../../common/ScreenWrapper';
import { useActiveBusiness } from '../../../hooks/useActiveBusiness';
import { PremiumUpgradeModal } from '../../common/PremiumUpgradeModal';
import * as Print from 'expo-print';
import { buildReportHtml, buildReportCsv, ReportType } from '../../../utils/reportTemplates';
import { styles } from './styles';
import { PdfStatementModal } from './components/PdfStatementModal';
import { CsvLedgerModal } from './components/CsvLedgerModal';
import { DateRangeModal } from './components/DateRangeModal';
import { LowStockBottomSheet } from './components/LowStockBottomSheet';
import { ReportsBottomSheet } from './components/ReportsBottomSheet';
import { hapticFeedback } from '../../../utils/haptics';
import { useTranslation } from '../../../hooks/useTranslation';
import { useIsPro } from '../../../hooks/useEntitlement';
import { money } from '../../../utils/money';

export const InsightsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const router = useRouter();
  const activeBiz = useActiveBusiness();
  const { t } = useTranslation();

  const isPremium = useIsPro();
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState('This feature');

  // Period filters
  const [period, setPeriod] = useState<
    'daily' | 'yesterday' | 'weekly' | 'monthly' | 'yearly' | 'custom'
  >('monthly');
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'all' | 'cash' | 'card' | 'bank'>('all');

  // Custom resolved dates
  const [resolvedStartDate, setResolvedStartDate] = useState<Date | null>(null);
  const [resolvedEndDate, setResolvedEndDate] = useState<Date | null>(null);

  // Simulated export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState<'PDF' | 'CSV' | null>(null);
  const [exportResultModal, setExportResultModal] = useState(false);

  // PDF Statement selection states
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('best_sellers');

  // CSV Statement selection states
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [selectedCsvReportType, setSelectedCsvReportType] = useState<ReportType>('best_sellers');

  // Low stock details drawer
  const [isLowStockModalOpen, setIsLowStockModalOpen] = useState(false);

  // Reports Drawer states
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);

  const { data: stats, isLoading } = useBusinessInsights(
    activeBiz.id,
    period,
    resolvedStartDate,
    resolvedEndDate
  );

  const { fetchReportData } = useInsightsExport(activeBiz.id);

  const {
    data: productsList = [],
    fetchNextPage: fetchNextProducts,
    hasNextPage: hasNextProducts,
    isFetchingNextPage: isFetchingNextProducts,
  } = useProducts(undefined, undefined, undefined);

  const {
    data: periodOrdersList = [],
    fetchNextPage: fetchNextPeriodOrders,
    hasNextPage: hasNextPeriodOrders,
    isFetchingNextPage: isFetchingNextPeriodOrders,
  } = useGetPeriodOrders(period, resolvedStartDate, resolvedEndDate, paymentMethod);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncDatabase = async () => {
    if (!isPremium) {
      hapticFeedback.notificationWarning();
      setPremiumFeatureName('Cloud database sync');
      setPremiumModalVisible(true);
      return;
    }
    hapticFeedback.impactMedium();
    setIsSyncing(true);
    try {
      const result = await syncDatabase();
      if (result) {
        hapticFeedback.notificationSuccess();
        queryClient.invalidateQueries({ queryKey: ['insights'] });
        Alert.alert(t('insights.syncSuccessTitle'), t('insights.syncSuccess'));
      } else {
        hapticFeedback.notificationWarning();
        Alert.alert(t('insights.syncSkippedTitle'), t('insights.syncSkipped'));
      }
    } catch (err: any) {
      hapticFeedback.notificationError();
      Alert.alert(t('insights.syncFailedTitle'), err.message || t('insights.syncFailed'));
    } finally {
      setIsSyncing(false);
    }
  };

  const chartTitle = React.useMemo(() => {
    switch (period) {
      case 'daily':
        return t('insights.chartHourlyToday');
      case 'yesterday':
        return t('insights.chartHourlyYesterday');
      case 'weekly':
        return t('insights.chartWeekday');
      case 'monthly':
        return t('insights.chartWeek');
      case 'yearly':
        return t('insights.chartMonth');
      case 'custom':
        return t('insights.chartDate');
      default:
        return t('insights.chartDefault');
    }
  }, [period, t]);

  const handleExport = (type: 'PDF' | 'CSV') => {
    if (!isPremium) {
      setPremiumFeatureName('PDF/CSV reports export');
      setPremiumModalVisible(true);
      return;
    }
    if (type === 'PDF') {
      setIsPdfModalOpen(true);
    } else {
      setIsCsvModalOpen(true);
    }
  };

  const handleGenerateCsvReport = async (reportType: ReportType) => {
    if (!isPremium) {
      setIsCsvModalOpen(false);
      setPremiumFeatureName('CSV ledger reports export');
      setPremiumModalVisible(true);
      return;
    }
    setIsCsvModalOpen(false);
    hapticFeedback.impactMedium();
    setIsExporting(true);
    setExportType('CSV');
    try {
      // 1. Fetch reporting dataset via custom hook
      const { business, orders, orderItems, products } = await fetchReportData(
        period,
        resolvedStartDate,
        resolvedEndDate
      );

      // 2. Generate Report CSV
      const csvText = buildReportCsv(reportType, {
        business: {
          name: (business as any).name || 'Store',
          category: (business as any).category,
          address: (business as any).address,
          phone: (business as any).phone,
        },
        orders,
        orderItems,
        products,
      });

      // 3. Share the CSV text
      await Share.share({
        message: csvText,
        title: `${(business as any).name || 'Store'} - CSV Ledger Report`,
      });
      hapticFeedback.notificationSuccess();
    } catch (err: any) {
      hapticFeedback.notificationError();
      Alert.alert(
        t('insights.reportExportFailed'),
        err.message || t('insights.reportExportFailedCsv')
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleGeneratePdfReport = async (reportType: ReportType) => {
    if (!isPremium) {
      setIsPdfModalOpen(false);
      setPremiumFeatureName('PDF statement reports export');
      setPremiumModalVisible(true);
      return;
    }
    setIsPdfModalOpen(false);
    hapticFeedback.impactMedium();
    setIsExporting(true);
    setExportType('PDF');
    try {
      // 1. Fetch reporting dataset via custom hook
      const { business, orders, orderItems, products } = await fetchReportData(
        period,
        resolvedStartDate,
        resolvedEndDate
      );

      // 2. Generate Report HTML
      const html = buildReportHtml(reportType, {
        business: {
          name: (business as any).name || 'Store',
          category: (business as any).category,
          address: (business as any).address,
          phone: (business as any).phone,
        },
        orders,
        orderItems,
        products,
      });

      // 3. Trigger System Printing (allows Save as PDF natively)
      await Print.printAsync({ html });
      hapticFeedback.notificationSuccess();
    } catch (err: any) {
      hapticFeedback.notificationError();
      Alert.alert(
        t('insights.reportExportFailed'),
        err.message || t('insights.reportExportFailedPdf')
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    try {
      const content =
        exportType === 'CSV'
          ? `Shopbook POS - Tabular CSV Statement for ${activeBiz.name}\nGross Revenue: Rs. ${money(stats?.grossRevenue)}\nTotal Orders: ${stats?.ordersCount}`
          : `Shopbook POS - Premium PDF Invoice statement for ${activeBiz.name}\nGenerated on Sri Lanka Helplines.`;
      await Share.share({
        message: content,
      });
      setExportResultModal(false);
    } catch (err: any) {
      Alert.alert(t('insights.shareFailed'), err.message);
    }
  };

  const handleApplyCalendarRange = (start: Date | null, end: Date | null) => {
    setResolvedStartDate(start);
    setResolvedEndDate(end);
    setIsCustomModalOpen(false);
    if (start && end) {
      setPeriod('custom');
    } else {
      setPeriod('monthly');
    }
  };

  return (
    <ScreenWrapper noPaddingBottom style={styles.container}>
      {/* Dashboard Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={() => router.push('/')}
        >
          <Feather name="chevron-left" size={24} color={TOKENS.dark} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrapper}>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            Business Insights
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1} ellipsizeMode="tail">
            {isSyncing ? t('insights.headerSubSyncing') : t('insights.headerSubDefault')}
          </Text>
        </View>

        <View style={styles.headerActionsWrapper}>
          <TouchableOpacity
            style={styles.headerTextBtn}
            activeOpacity={0.7}
            onPress={() => setIsReportsModalOpen(true)}
          >
            <Feather name="bar-chart-2" size={15} color={TOKENS.primary} />
            <Text style={styles.headerTextBtnLabel}>{t('insights.headerReportsBtn')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerIconBtn, isSyncing && styles.headerTextBtnDisabled]}
            activeOpacity={0.7}
            onPress={handleSyncDatabase}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color={TOKENS.primary} />
            ) : (
              <Feather name="refresh-cw" size={15} color={TOKENS.primary} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Insights Panel Scroll */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
      >
        {/* Period Selector pills - Horizontal ScrollView */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.periodPillsScroll}
          contentContainerStyle={styles.periodPillsRow}
        >
          <TouchableOpacity
            style={[styles.periodPill, period === 'daily' && styles.periodPillActive]}
            onPress={() => {
              hapticFeedback.selection();
              setPeriod('daily');
            }}
          >
            <Text
              style={[styles.periodPillText, period === 'daily' && styles.periodPillTextActive]}
            >
              {t('insights.periodToday')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.periodPill, period === 'yesterday' && styles.periodPillActive]}
            onPress={() => {
              hapticFeedback.selection();
              setPeriod('yesterday');
            }}
          >
            <Text
              style={[styles.periodPillText, period === 'yesterday' && styles.periodPillTextActive]}
            >
              {t('insights.periodYesterday')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.periodPill, period === 'weekly' && styles.periodPillActive]}
            onPress={() => {
              hapticFeedback.selection();
              setPeriod('weekly');
            }}
          >
            <Text
              style={[styles.periodPillText, period === 'weekly' && styles.periodPillTextActive]}
            >
              {t('insights.periodWeekly')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.periodPill, period === 'monthly' && styles.periodPillActive]}
            onPress={() => {
              hapticFeedback.selection();
              setPeriod('monthly');
            }}
          >
            <Text
              style={[styles.periodPillText, period === 'monthly' && styles.periodPillTextActive]}
            >
              {t('insights.periodMonthly')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.periodPill, period === 'yearly' && styles.periodPillActive]}
            onPress={() => {
              hapticFeedback.selection();
              setPeriod('yearly');
            }}
          >
            <Text
              style={[styles.periodPillText, period === 'yearly' && styles.periodPillTextActive]}
            >
              {t('insights.periodYearly')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.periodPill, period === 'custom' && styles.periodPillActive]}
            onPress={() => setIsCustomModalOpen(true)}
          >
            <Text
              style={[styles.periodPillText, period === 'custom' && styles.periodPillTextActive]}
            >
              {t('insights.periodCustom')}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Loading Spinner */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={TOKENS.primary} />
            <Text style={styles.loadingText}>{t('insights.computingSales')}</Text>
          </View>
        ) : (
          <>
            {/* KPI Cards Grid */}
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <View style={[styles.kpiIconCircle, { backgroundColor: '#E8FDF0' }]}>
                  <Feather name="trending-up" size={16} color="#10B981" />
                </View>
                <Text style={styles.kpiLabel}>{t('insights.kpiGrossSales')}</Text>
                <Text style={styles.kpiValue}>Rs. {money(stats?.grossRevenue)}</Text>
              </View>

              <View style={styles.kpiCard}>
                <View style={[styles.kpiIconCircle, { backgroundColor: '#EFF6FF' }]}>
                  <Feather name="file-text" size={16} color={TOKENS.primary} />
                </View>
                <Text style={styles.kpiLabel}>{t('insights.kpiTransactions')}</Text>
                <Text style={styles.kpiValue}>{stats?.ordersCount}</Text>
              </View>

              <View style={styles.kpiCard}>
                <View style={[styles.kpiIconCircle, { backgroundColor: '#FEF7E0' }]}>
                  <Feather name="shopping-bag" size={16} color="#B06000" />
                </View>
                <Text style={styles.kpiLabel}>{t('insights.kpiAvgBasket')}</Text>
                <Text style={styles.kpiValue}>
                  Rs. {Math.round(stats?.avgTicket || 0).toLocaleString()}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.kpiCard}
                activeOpacity={0.7}
                onPress={() => {
                  if (
                    (stats?.lowStockCount && stats.lowStockCount > 0) ||
                    (stats?.outOfStockCount && stats.outOfStockCount > 0)
                  ) {
                    setIsLowStockModalOpen(true);
                  } else {
                    Alert.alert(t('insights.allStockNormal'), t('insights.allStockNormalMsg'));
                  }
                }}
              >
                <View style={[styles.kpiIconCircle, { backgroundColor: '#FCE8E6' }]}>
                  <Feather name="alert-triangle" size={16} color={TOKENS.error} />
                </View>
                <Text style={styles.kpiLabel}>{t('insights.kpiStockAlerts')}</Text>
                <Text
                  style={[
                    styles.kpiValue,
                    ((stats?.lowStockCount || 0) > 0 || (stats?.outOfStockCount || 0) > 0) && {
                      color: TOKENS.error,
                    },
                  ]}
                >
                  {(stats?.lowStockCount || 0) + (stats?.outOfStockCount || 0)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Simulated Live Bar Chart */}
            <View style={styles.chartWrapper}>
              <Text style={styles.sectionTitle}>{chartTitle}</Text>
              <View style={styles.barGraphRow}>
                {stats?.chartData.map((item, index) => {
                  const maxVal = Math.max(...stats.chartData.map((c) => c.value), 1000);
                  const pct = Math.min((item.value / maxVal) * 100, 100);
                  return (
                    <View key={index} style={styles.barGraphCol}>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { height: `${pct}%` }]} />
                      </View>
                      <Text style={styles.barLabel}>{item.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Sync database helper card if sales count is zero */}
            {stats?.ordersCount === 0 && (
              <View style={styles.seederContainer}>
                <Feather name="refresh-cw" size={24} color={TOKENS.muted} />
                <Text style={styles.seederText}>{t('insights.noSalesText')}</Text>
                <TouchableOpacity
                  style={styles.seederBtn}
                  activeOpacity={0.8}
                  onPress={handleSyncDatabase}
                  disabled={isSyncing}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {isSyncing && <ActivityIndicator size="small" color="#fff" />}
                    <Text style={styles.seederBtnText}>
                      {isSyncing ? t('insights.syncingBtn') : t('insights.syncDbNow')}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Best Sellers Section */}
            {stats?.bestSellers.length! > 0 && (
              <View style={styles.statsSection}>
                <Text style={styles.sectionTitle}>{t('insights.bestSellers')}</Text>
                <View style={styles.statsCardList}>
                  {stats?.bestSellers.map((item, index) => (
                    <View key={index} style={styles.statListItem}>
                      <View
                        style={[
                          styles.rankCircle,
                          index === 0 && styles.rankGold,
                          index === 1 && styles.rankSilver,
                          index === 2 && styles.rankBronze,
                        ]}
                      >
                        <Text style={styles.rankText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.statItemName}>{item.name}</Text>
                      <Text style={styles.statItemQty}>
                        {item.quantity} {t('insights.units')}
                      </Text>
                      <Text style={styles.statItemRevenue}>Rs. {money(item.revenue)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Slow Movers Section */}
            {stats?.slowMovers.length! > 0 && (
              <View style={styles.statsSection}>
                <Text style={styles.sectionTitle}>{t('insights.slowMovers')}</Text>
                <View style={styles.statsCardList}>
                  {stats?.slowMovers.map((item, index) => (
                    <View key={index} style={styles.statListItem}>
                      <View style={[styles.rankCircle, { backgroundColor: '#F3F4F6' }]}>
                        <Text style={[styles.rankText, { color: TOKENS.muted }]}>{index + 1}</Text>
                      </View>
                      <Text style={styles.statItemName}>{item.name}</Text>
                      <Text style={styles.statItemQty}>
                        {item.quantity} {t('insights.units')}
                      </Text>
                      <Text style={styles.statItemRevenue}>Rs. {money(item.revenue)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Export Actions Section */}
            {stats?.ordersCount! > 0 && (
              <View style={styles.exportSection}>
                <Text style={styles.sectionTitle}>{t('insights.exportSection')}</Text>
                <View style={styles.exportButtonsRow}>
                  <TouchableOpacity
                    style={[styles.exportCardBtn, styles.exportPdfCard]}
                    activeOpacity={0.8}
                    onPress={() => handleExport('PDF')}
                  >
                    <View style={styles.exportIconBadgePdf}>
                      <Feather name="file-text" size={18} color="#EF4444" />
                    </View>
                    <Text style={styles.exportPdfTextTitle}>{t('insights.exportPdf')}</Text>
                    <Text style={styles.exportCardSubtitle}>{t('insights.exportPdfSub')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.exportCardBtn, styles.exportCsvCard]}
                    activeOpacity={0.8}
                    onPress={() => handleExport('CSV')}
                  >
                    <View style={styles.exportIconBadgeCsv}>
                      <Feather name="grid" size={18} color="#10B981" />
                    </View>
                    <Text style={styles.exportCsvTextTitle}>{t('insights.exportCsv')}</Text>
                    <Text style={styles.exportCardSubtitle}>{t('insights.exportCsvSub')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Manual Sync Database Button at the bottom */}
            <View style={styles.syncDatabaseSection}>
              <TouchableOpacity
                style={styles.syncDatabaseBtn}
                activeOpacity={0.8}
                onPress={handleSyncDatabase}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                ) : (
                  <Feather name="refresh-cw" size={16} color="#fff" style={{ marginRight: 8 }} />
                )}
                <Text style={styles.syncDatabaseBtnText}>
                  {isSyncing ? t('insights.syncingDatabase') : t('insights.syncDbNow')}
                </Text>
              </TouchableOpacity>
              <Text style={styles.syncDatabaseHelpText}>{t('insights.syncDbHelpText')}</Text>
            </View>
          </>
        )}
      </ScrollView>

      <DateRangeModal
        visible={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        resolvedStartDate={resolvedStartDate}
        resolvedEndDate={resolvedEndDate}
        onApply={handleApplyCalendarRange}
      />

      <LowStockBottomSheet
        visible={isLowStockModalOpen}
        onClose={() => setIsLowStockModalOpen(false)}
        lowStockItems={stats?.lowStockItems}
        outOfStockItems={stats?.outOfStockItems}
      />

      <ReportsBottomSheet
        visible={isReportsModalOpen}
        onClose={() => setIsReportsModalOpen(false)}
        periodOrdersList={periodOrdersList}
        hasNextPeriodOrders={hasNextPeriodOrders}
        fetchNextPeriodOrders={fetchNextPeriodOrders}
        isFetchingNextPeriodOrders={isFetchingNextPeriodOrders}
        productsList={productsList}
        hasNextProducts={hasNextProducts}
        fetchNextProducts={fetchNextProducts}
        isFetchingNextProducts={isFetchingNextProducts}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        resolvedOrders={stats?.resolvedOrders || []}
      />

      {/* Export Progress Modal */}
      <Modal visible={isExporting} transparent={true} animationType="fade">
        <View style={styles.modalOverlayCenter}>
          <View style={styles.exportProgressCard}>
            <ActivityIndicator size="large" color={TOKENS.primary} />
            <Text style={styles.exportProgressText}>
              {t('insights.exportProgressText', { type: exportType || '' })}
            </Text>
          </View>
        </View>
      </Modal>

      {/* Export Result Success Sheet */}
      <BottomSheet
        visible={exportResultModal}
        onClose={() => setExportResultModal(false)}
        title={t('insights.exportSuccessTitle', { type: exportType || '' })}
      >
        <View style={{ alignItems: 'center', gap: 16 }}>
          <View style={styles.successIconCircle}>
            <Feather name="check" size={28} color="#fff" />
          </View>

          <Text style={styles.successSubtitle}>
            {t('insights.exportSuccessSubtitle', { name: activeBiz.name })}
          </Text>

          <View style={styles.successActions}>
            <TouchableOpacity
              style={styles.shareReportBtn}
              activeOpacity={0.8}
              onPress={handleShare}
            >
              <Feather name="share-2" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.shareReportBtnText}>{t('insights.shareStatement')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.dismissBtn} onPress={() => setExportResultModal(false)}>
              <Text style={styles.dismissBtnText}>{t('insights.dismiss')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>
      <PremiumUpgradeModal
        visible={premiumModalVisible}
        onClose={() => setPremiumModalVisible(false)}
        featureName={premiumFeatureName}
      />

      <PdfStatementModal
        visible={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        selectedReportType={selectedReportType}
        onSelectReportType={setSelectedReportType}
        onGenerateReport={handleGeneratePdfReport}
      />

      <CsvLedgerModal
        visible={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        selectedReportType={selectedCsvReportType}
        onSelectReportType={setSelectedCsvReportType}
        onGenerateReport={handleGenerateCsvReport}
      />
    </ScreenWrapper>
  );
};
