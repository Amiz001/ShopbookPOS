import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { BottomSheet } from '../../../common/BottomSheet';
import { ProductImage } from '../../../common/ProductImage';
import { useStockInProduct } from '../../../../hooks/useProducts';
import { TOKENS } from '../../../../constants/tokens';
import { styles } from '../styles';
import { OrderItemsList, OrderCardHeaderRight } from './OrderHistoryHelpers';
import { useTranslation } from '../../../../hooks/useTranslation';
import { money } from '../../../../utils/money';

interface ReportsBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  periodOrdersList: any[];
  hasNextPeriodOrders: boolean;
  fetchNextPeriodOrders: () => void;
  isFetchingNextPeriodOrders: boolean;
  productsList: any[];
  hasNextProducts: boolean;
  fetchNextProducts: () => void;
  isFetchingNextProducts: boolean;
  paymentMethod: 'all' | 'cash' | 'card' | 'bank';
  onPaymentMethodChange: (method: 'all' | 'cash' | 'card' | 'bank') => void;
  resolvedOrders: any[];
}

export const ReportsBottomSheet: React.FC<ReportsBottomSheetProps> = ({
  visible,
  onClose,
  periodOrdersList,
  hasNextPeriodOrders,
  fetchNextPeriodOrders,
  isFetchingNextPeriodOrders,
  productsList,
  hasNextProducts,
  fetchNextProducts,
  isFetchingNextProducts,
  paymentMethod,
  onPaymentMethodChange,
  resolvedOrders,
}) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { height: windowHeight } = useWindowDimensions();
  const { t } = useTranslation();

  const [reportsActiveTab, setReportsActiveTab] = useState<'orders' | 'inventory'>('orders');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [refillValues, setRefillValues] = useState<Record<string, string>>({});

  const stockInMutation = useStockInProduct();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('insights.reportsTitle')}
      maxHeight={windowHeight * 0.88}
    >
      <View style={{ height: windowHeight * 0.88 - 75 }}>
        {/* Premium Subheader Tabs */}
        <View style={styles.modalTabsRow}>
          <TouchableOpacity
            style={[styles.modalTab, reportsActiveTab === 'orders' && styles.modalTabActive]}
            onPress={() => setReportsActiveTab('orders')}
          >
            <Feather
              name="list"
              size={14}
              color={reportsActiveTab === 'orders' ? TOKENS.primary : TOKENS.muted}
            />
            <Text
              style={[
                styles.modalTabText,
                reportsActiveTab === 'orders' && styles.modalTabTextActive,
              ]}
            >
              {t('insights.tabOrderHistory')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modalTab, reportsActiveTab === 'inventory' && styles.modalTabActive]}
            onPress={() => setReportsActiveTab('inventory')}
          >
            <Feather
              name="plus-circle"
              size={14}
              color={reportsActiveTab === 'inventory' ? TOKENS.primary : TOKENS.muted}
            />
            <Text
              style={[
                styles.modalTabText,
                reportsActiveTab === 'inventory' && styles.modalTabTextActive,
              ]}
            >
              {t('insights.tabStockInRefills')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB CONTENT: ORDER HISTORY */}
        {reportsActiveTab === 'orders' && (
          <>
            {/* Payment Method Segmented Filter Row */}
            <View style={localStyles.filterRow}>
              {(['all', 'cash', 'card', 'bank'] as const).map((method) => {
                const isActive = paymentMethod === method;
                return (
                  <TouchableOpacity
                    key={method}
                    style={[localStyles.filterPill, isActive && localStyles.filterPillActive]}
                    activeOpacity={0.7}
                    onPress={() => onPaymentMethodChange(method)}
                  >
                    <Text
                      style={[
                        localStyles.filterPillText,
                        isActive && localStyles.filterPillTextActive,
                      ]}
                    >
                      {method.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Summary Bar */}
            {(() => {
              const filteredList = resolvedOrders.filter((o) =>
                paymentMethod === 'all'
                  ? true
                  : (o.paymentMethod || 'cash').toLowerCase() === paymentMethod
              );
              const count = filteredList.length;
              const totalSum = filteredList.reduce((acc, o) => acc + (o.totalAmount || 0), 0);

              return (
                <View style={localStyles.summaryBar}>
                  <View style={localStyles.summaryCol}>
                    <Text style={localStyles.summaryLabel}>
                      {t('insights.summaryTransactions')}
                    </Text>
                    <Text style={localStyles.summaryVal}>{count}</Text>
                  </View>
                  <View style={[localStyles.summaryCol, { alignItems: 'flex-end' }]}>
                    <Text style={localStyles.summaryLabel}>
                      {t('insights.summaryTotalRevenue')}
                    </Text>
                    <Text style={localStyles.summaryValSec}>
                      Rs. {totalSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>
              );
            })()}

            <FlashList
              data={periodOrdersList}
              keyExtractor={(item) => item.id}
              drawDistance={500}
              onEndReached={() => {
                if (hasNextPeriodOrders) {
                  fetchNextPeriodOrders();
                }
              }}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                isFetchingNextPeriodOrders ? (
                  <ActivityIndicator
                    size="small"
                    color={TOKENS.primary}
                    style={{ marginVertical: 16 }}
                  />
                ) : null
              }
              showsVerticalScrollIndicator={false}
              style={{ flex: 1, marginTop: 10 }}
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
              renderItem={({ item: order }) => {
                const isExpanded = expandedOrderId === order.id;
                const orderDate = new Date(order.createdAt);
                return (
                  <View style={styles.historyOrderCard}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      style={styles.historyCardHeader}
                      onPress={() => setExpandedOrderId(isExpanded ? null : order.id)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyInvoiceNum}>
                          {t('insights.invoiceLabel', { invoiceNo: order.invoiceNumber })}
                        </Text>
                        <Text style={styles.historyDateText}>
                          {orderDate.toLocaleDateString()} at {orderDate.toLocaleTimeString()}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Text style={styles.historyTotalAmount}>
                          Rs. {money(order.totalAmount)}
                        </Text>
                        <OrderCardHeaderRight orderId={order.id} isExpanded={isExpanded} />
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.historyItemsExpandedPanel}>
                        <View style={styles.expandedDivider} />
                        <OrderItemsList orderId={order.id} />
                      </View>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={localStyles.emptyStateContainer}>
                  <Feather
                    name="file-text"
                    size={48}
                    color="#D1D5DB"
                    style={{ marginBottom: 12 }}
                  />
                  <Text style={localStyles.emptyStateTitle}>{t('insights.noInvoicesFound')}</Text>
                  <Text style={localStyles.emptyStateSubtitle}>{t('insights.noInvoicesSub')}</Text>
                </View>
              }
            />
          </>
        )}

        {/* TAB CONTENT: STOCK-IN INVENTORY REFILL */}
        {reportsActiveTab === 'inventory' && (
          <FlashList
            data={productsList}
            keyExtractor={(item) => item.id}
            drawDistance={500}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1, marginTop: 10 }}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }}
            onEndReached={() => {
              if (hasNextProducts) {
                fetchNextProducts();
              }
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isFetchingNextProducts ? (
                <ActivityIndicator
                  size="small"
                  color={TOKENS.primary}
                  style={{ marginVertical: 16 }}
                />
              ) : null
            }
            ListHeaderComponent={
              <Text style={styles.refillSectionLabel}>{t('insights.refillSectionLabel')}</Text>
            }
            renderItem={({ item: prod }) => {
              const isExpanded = expandedProductId === prod.id;
              const val = refillValues[prod.id] || '';
              return (
                <View style={styles.historyOrderCard}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.refillCardHeader}
                    onPress={() => setExpandedProductId(isExpanded ? null : prod.id)}
                  >
                    <ProductImage
                      icon={prod.icon}
                      category={prod.category}
                      size={60}
                      style={styles.refillProductImage}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.refillProductName} numberOfLines={1}>
                        {prod.name}
                      </Text>
                      <Text style={styles.refillProductMeta} numberOfLines={1}>
                        {t('insights.codeLabel')} {prod.quickCode || prod.sku || '—'} |{' '}
                        {t('insights.priceLabel')} Rs. {prod.price}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text
                        style={[
                          styles.refillStockCount,
                          prod.stockCount <= 5 && { color: TOKENS.error },
                        ]}
                      >
                        {t('insights.stockLabel')} {prod.stockCount}
                      </Text>
                      <Feather
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={14}
                        color={TOKENS.muted}
                      />
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.historyItemsExpandedPanel}>
                      <View style={styles.expandedDivider} />

                      <View style={styles.refillInfoRow}>
                        <Text style={styles.refillCurrentStockLabel}>
                          {t('insights.currentStockLabel')}
                        </Text>
                        <Text
                          style={[
                            styles.refillCurrentStockValue,
                            prod.stockCount <= 5 && { color: TOKENS.error },
                          ]}
                        >
                          {prod.stockCount} {t('insights.unitsLabel')}
                        </Text>
                      </View>

                      <View style={styles.refillInputContainer}>
                        <TextInput
                          style={styles.refillInputInline}
                          placeholder={t('insights.refillPlaceholder')}
                          placeholderTextColor="#9CA3AF"
                          keyboardType="number-pad"
                          value={val}
                          onChangeText={(text) =>
                            setRefillValues({
                              ...refillValues,
                              [prod.id]: text,
                            })
                          }
                        />
                        <TouchableOpacity
                          style={styles.refillSubmitBtnInline}
                          activeOpacity={0.7}
                          onPress={() => {
                            const refillAmt = parseInt(val, 10);
                            if (isNaN(refillAmt) || refillAmt <= 0) {
                              Alert.alert(
                                t('insights.invalidQuantity'),
                                t('insights.invalidQuantityMsg')
                              );
                              return;
                            }
                            stockInMutation.mutate(
                              {
                                productId: prod.id,
                                quantity: refillAmt,
                                reason: 'Restock',
                              },
                              {
                                onSuccess: () => {
                                  queryClient.invalidateQueries({ queryKey: ['insights'] });
                                  Alert.alert(
                                    t('insights.stockInSuccess'),
                                    t('insights.stockInSuccessMsg')
                                  );
                                  // Reset expanded refill values
                                  setRefillValues({});
                                  setExpandedProductId(null);
                                },
                                onError: (err: any) => {
                                  Alert.alert(t('insights.refillFailed'), err.message);
                                },
                              }
                            );
                          }}
                        >
                          {stockInMutation.isPending ? (
                            <ActivityIndicator
                              size="small"
                              color="#fff"
                              style={{ marginRight: 4 }}
                            />
                          ) : (
                            <>
                              <Feather name="plus-circle" size={14} color="#fff" />
                              <Text style={styles.refillSubmitBtnInlineText}>
                                {t('insights.stockInBtn')}
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={localStyles.emptyStateContainer}>
                <Feather name="package" size={48} color="#D1D5DB" style={{ marginBottom: 12 }} />
                <Text style={localStyles.emptyStateTitle}>{t('insights.noProductsFound')}</Text>
                <Text style={localStyles.emptyStateSubtitle}>{t('insights.noProductsSub')}</Text>
              </View>
            }
          />
        )}
      </View>
    </BottomSheet>
  );
};

const localStyles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    gap: 4,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  filterPillActive: {
    backgroundColor: TOKENS.primary,
    boxShadow: '0px 2px 4px 0px rgba(37, 99, 235, 0.15)',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.card,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: TOKENS.border,
    boxShadow: '0px 2px 4px 0px rgba(0, 0, 0, 0.03)',
  },
  summaryCol: {
    gap: 2,
  },
  summaryLabel: {
    fontSize: 10,
    color: TOKENS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryVal: {
    fontSize: 16,
    fontWeight: '800',
    color: TOKENS.dark,
  },
  summaryValSec: {
    fontSize: 16,
    fontWeight: '800',
    color: TOKENS.success,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 24,
    marginTop: 32,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: TOKENS.dark,
    marginBottom: 4,
  },
  emptyStateSubtitle: {
    fontSize: 12,
    color: TOKENS.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
