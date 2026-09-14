import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as Print from 'expo-print';
import Barcode from 'react-native-barcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenWrapper } from '../common/ScreenWrapper';
import { TOKENS } from '../../constants/tokens';
import { DBOrder, useGetOrderItems, useGetOrders } from '../../hooks/useOrders';
import { useStaff } from '../../hooks/useStaff';
import {
  formatStaffDisplayLine,
  getCashierNameFromInvoice,
  getInvoiceBarcodeValue,
  getInvoiceLabel,
} from '../../utils/orderInvoice';
import { buildThermalReceiptHtml } from '../../utils/thermalReceiptHtml';
import { printReceipt } from '../../utils/printThermalReceipt';
import { BottomSheet } from '../common/BottomSheet';
import { useActiveBusiness } from '../../hooks/useActiveBusiness';
import { useSyncRefreshStore } from '../../stores/useSyncRefreshStore';
import { PremiumUpgradeModal } from '../common/PremiumUpgradeModal';
import { useIsPro } from '../../hooks/useEntitlement';
import { money, moneyFixed } from '../../utils/money';

const CARD_GAP = 12;
const INNER_TEXT_GAP = 4;

const THERMAL_FONT = Platform.select({
  ios: 'Courier',
  android: 'monospace',
  default: 'monospace',
});

function OrderCardSeparator() {
  return <View style={{ height: CARD_GAP }} />;
}

export const OrderHistoryScreen: React.FC<{ isTab?: boolean }> = ({ isTab = false }) => {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();

  const isPremium = useIsPro();
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);

  const activeBiz = useActiveBusiness();
  const syncRefreshVersion = useSyncRefreshStore((s) => s.version);

  const {
    data: orders = [],
    isLoading: ordersLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useGetOrders();
  const { data: staffList = [] } = useStaff(activeBiz.id ?? '');
  const [selectedOrder, setSelectedOrder] = useState<DBOrder | null>(null);

  // Fetch items for the selected order
  const { data: orderItems = [], isLoading: itemsLoading } = useGetOrderItems(selectedOrder?.id);

  const subtotal = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [orderItems]);

  const { tax, taxLabel } = useMemo(() => {
    if (!selectedOrder) return { tax: 0, taxLabel: 'Tax' };
    if (typeof selectedOrder.taxValue === 'number' && typeof selectedOrder.taxRate === 'number') {
      const taxRate = selectedOrder.taxRate;
      return { tax: selectedOrder.taxValue, taxLabel: taxRate > 0 ? `Tax (${taxRate}%)` : 'Tax' };
    }
    return { tax: Math.round(subtotal * 0.08), taxLabel: 'Standard Tax (8%)' };
  }, [selectedOrder, subtotal]);

  const { discount, discountLabel } = useMemo(() => {
    if (!selectedOrder) return { discount: 0, discountLabel: 'Discount' };
    let calcDiscount = 0;
    let label = 'Discount';
    if (
      selectedOrder.discountType === 'percentage' &&
      typeof selectedOrder.discountValue === 'number'
    ) {
      calcDiscount = subtotal * (selectedOrder.discountValue / 100);
      label = `Discount (${selectedOrder.discountValue}%)`;
    } else if (
      selectedOrder.discountType === 'flat' &&
      typeof selectedOrder.discountValue === 'number'
    ) {
      calcDiscount = selectedOrder.discountValue;
      label = 'Discount';
    } else {
      // Fallback for older orders or when fields are missing
      calcDiscount = Math.max(0, subtotal + tax - selectedOrder.totalAmount);
      label = 'Discount';
    }
    return { discount: calcDiscount, discountLabel: label };
  }, [selectedOrder, subtotal, tax]);

  /** Receipt scroll area: grow with content until ~92% screen; then scrolls inside. */
  const receiptScrollMaxHeight = useMemo(() => {
    const maxSheet = windowHeight * 0.92;
    const dragBlock = 19;
    const headerBlock = 60;
    const footerBlock = 72;
    const sheetPadTop = 16;
    const sheetPadBottom = Math.max(insets.bottom, 16);
    const chrome = sheetPadTop + dragBlock + headerBlock + footerBlock + sheetPadBottom + 8;
    return Math.max(160, maxSheet - chrome);
  }, [windowHeight, insets.bottom]);

  const receiptSheetMaxHeight = useMemo(() => Math.round(windowHeight * 0.92), [windowHeight]);

  const invoiceBarcodeValue = useMemo(() => {
    if (!selectedOrder) return '0';
    return getInvoiceBarcodeValue(selectedOrder.invoiceNumber, selectedOrder.id);
  }, [selectedOrder]);

  const staffLabelFromInvoice = useCallback(
    (invoiceNumber: string) =>
      formatStaffDisplayLine(getCashierNameFromInvoice(invoiceNumber), staffList),
    [staffList]
  );

  const renderOrderItem = useCallback(
    ({ item: order }: { item: DBOrder }) => (
      <TouchableOpacity
        style={styles.orderCard}
        activeOpacity={0.75}
        onPress={() => setSelectedOrder(order)}
      >
        <View style={styles.orderHeader}>
          <View style={styles.invoiceWrapper}>
            <Text style={styles.invoiceNumber} numberOfLines={1}>
              {getInvoiceLabel(order.invoiceNumber)}
            </Text>
            <Text style={styles.cashierName} numberOfLines={2}>
              {staffLabelFromInvoice(order.invoiceNumber)}
            </Text>
          </View>

          <View style={styles.paidBadge}>
            <Text style={styles.paidBadgeText}>{order.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.dividerLine} />

        {order.paymentMethod === 'card' && (
          <View style={styles.paymentInfoRow}>
            <Feather name="credit-card" size={12} color={TOKENS.muted} />
            <Text style={styles.paymentInfoText}>
              Card · {order.bankName} (•••• {order.cardLastFour})
            </Text>
          </View>
        )}

        <View style={styles.orderFooter}>
          <Text style={styles.orderDate}>
            {new Date(order.createdAt).toLocaleDateString()} ·{' '}
            {new Date(order.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
          <Text style={styles.orderTotal}>Rs. {money(order.totalAmount)}</Text>
        </View>
      </TouchableOpacity>
    ),
    [staffLabelFromInvoice]
  );

  const handleShareInvoice = async () => {
    if (!selectedOrder) return;
    try {
      const itemsListText = orderItems
        .map(
          (item) => `• ${item.quantity} × ${item.name} - Rs. ${money(item.price * item.quantity)}`
        )
        .join('\n');

      const message = `
=================================
       ${(activeBiz.name ?? '').toUpperCase()}
       ${activeBiz.category}
       ${activeBiz.address || 'Sri Lanka'}
=================================
Invoice: ${selectedOrder.invoiceNumber}
Date: ${new Date(selectedOrder.createdAt).toLocaleString()}
Status: ${(selectedOrder.status ?? 'paid').toUpperCase()}
---------------------------------
Items:
${itemsListText}
---------------------------------
Subtotal: Rs. ${money(subtotal)}
${taxLabel}: Rs. ${money(tax)}
${discountLabel}: Rs. ${money(discount)}
---------------------------------
Total Amount: Rs. ${money(selectedOrder.totalAmount)}
=================================
Thank you for shopping with us!
`;

      await Share.share({
        message,
        title: `Invoice ${selectedOrder.invoiceNumber}`,
      });
    } catch (error: any) {
      Alert.alert('Error Sharing', error.message);
    }
  };

  const buildHistoryReceiptHtml = useCallback(() => {
    if (!selectedOrder) return '';
    const invoiceLabel = getInvoiceLabel(selectedOrder.invoiceNumber);
    const cashierLabel = staffLabelFromInvoice(selectedOrder.invoiceNumber);
    const items = orderItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      lineTotal: item.price * item.quantity,
    }));
    return buildThermalReceiptHtml({
      logoUri: activeBiz.logoUri,
      businessName: activeBiz.name,
      category: activeBiz.category,
      address: activeBiz.address || 'Sri Lanka',
      phone: activeBiz.phone,
      cashierLabel,
      invoiceLabel,
      dateStr: new Date(selectedOrder.createdAt).toLocaleString(),
      status: selectedOrder.status.toUpperCase(),
      items,
      subtotal,
      tax,
      taxLabel,
      discount,
      discountLabel,
      grandTotal: selectedOrder.totalAmount,
      barcodeLine: getInvoiceBarcodeValue(selectedOrder.invoiceNumber, selectedOrder.id),
    });
  }, [
    activeBiz.address,
    activeBiz.category,
    activeBiz.logoUri,
    activeBiz.name,
    activeBiz.phone,
    discount,
    discountLabel,
    orderItems,
    selectedOrder,
    staffLabelFromInvoice,
    subtotal,
    tax,
    taxLabel,
  ]);

  const handlePrintReceipt = async () => {
    if (!selectedOrder) return;
    if (!isPremium) {
      setPremiumModalVisible(true);
      return;
    }
    if (itemsLoading) {
      Alert.alert('Please wait', 'Receipt lines are still loading.');
      return;
    }

    const invoiceLabel = getInvoiceLabel(selectedOrder.invoiceNumber);
    const cashierLabel = staffLabelFromInvoice(selectedOrder.invoiceNumber);
    const items = orderItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      lineTotal: item.price * item.quantity,
    }));

    const printOptions = {
      logoUri: activeBiz.logoUri,
      businessName: activeBiz.name,
      category: activeBiz.category,
      address: activeBiz.address || 'Sri Lanka',
      phone: activeBiz.phone,
      cashierLabel,
      invoiceLabel,
      dateStr: new Date(selectedOrder.createdAt).toLocaleString(),
      status: selectedOrder.status.toUpperCase(),
      items,
      subtotal,
      tax,
      taxLabel,
      discount,
      discountLabel,
      grandTotal: selectedOrder.totalAmount,
      barcodeLine: getInvoiceBarcodeValue(selectedOrder.invoiceNumber, selectedOrder.id),
      paymentMethod: selectedOrder.paymentMethod,
    };

    await printReceipt(printOptions);
  };

  return (
    <ScreenWrapper noPaddingBottom style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {!isTab && (
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.7}
            onPress={() => router.back()}
          >
            <Feather name="chevron-left" size={24} color={TOKENS.dark} />
          </TouchableOpacity>
        )}

        <View style={[styles.headerTitleWrapper, !isTab ? { marginLeft: 12 } : { marginLeft: 4 }]}>
          <Text style={styles.headerTitle}>Order History</Text>
          <Text style={styles.headerSubtitle}>Completed Sales Logs</Text>
        </View>

        <View style={{ width: 36 }} />
      </View>

      {/* Orders List */}
      {ordersLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TOKENS.primary} />
          <Text style={styles.loadingText}>Fetching order logs...</Text>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={64} color={TOKENS.muted} />
          <Text style={styles.emptyTitle}>No orders placed yet</Text>
          <Text style={styles.emptySub}>Transactions completed from POS will appear here.</Text>
        </View>
      ) : (
        <FlashList
          key={`orders-${syncRefreshVersion}`}
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderItem}
          drawDistance={500}
          style={styles.scrollWrapper}
          onEndReached={() => {
            if (hasNextPage) {
              fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage ? (
              <ActivityIndicator
                size="small"
                color={TOKENS.primary}
                style={{ marginVertical: 16 }}
              />
            ) : null
          }
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={OrderCardSeparator}
        />
      )}

      {/* Invoice Detail Bottom Sheet */}
      <BottomSheet
        visible={selectedOrder !== null}
        onClose={() => setSelectedOrder(null)}
        title="Receipt Invoice"
        contentPaddingHorizontal={0}
        contentPaddingTop={16}
        maxHeight={receiptSheetMaxHeight}
      >
        <View style={styles.invoiceSheetInner}>
          {selectedOrder && (
            <ScrollView
              style={[styles.receiptScroll, { maxHeight: receiptScrollMaxHeight }]}
              contentContainerStyle={styles.receiptScrollContent}
              showsVerticalScrollIndicator
              bounces
              nestedScrollEnabled
            >
              {/* Thermal receipt preview — matches PaymentTender / expo-print layout */}
              <View style={styles.thermalPaper}>
                {activeBiz.logoUri ? (
                  activeBiz.logoUri.length <= 2 ? (
                    <Text style={styles.thermalLogoEmoji}>{activeBiz.logoUri}</Text>
                  ) : (
                    <Image source={{ uri: activeBiz.logoUri }} style={styles.thermalLogoImg} />
                  )
                ) : (
                  <Text style={styles.thermalMiniPos}>★ SHOPBOOK POS ★</Text>
                )}

                <Text style={styles.thermalHeaderTitle}>{activeBiz.name}</Text>
                <Text style={styles.thermalCenterMuted}>{activeBiz.category}</Text>
                <Text style={styles.thermalCenterMuted}>{activeBiz.address || 'Sri Lanka'}</Text>
                {activeBiz.phone ? (
                  <Text style={styles.thermalCenterMuted}>Tel: {activeBiz.phone}</Text>
                ) : null}

                <View style={styles.thermalRule} />

                <View style={styles.thermalRow}>
                  <Text style={styles.thermalRowLeft}>Cashier</Text>
                  <Text style={styles.thermalRowRight} numberOfLines={2}>
                    {staffLabelFromInvoice(selectedOrder.invoiceNumber)}
                  </Text>
                </View>
                <View style={styles.thermalRow}>
                  <Text style={styles.thermalRowLeft}>Invoice</Text>
                  <Text style={styles.thermalRowRight}>
                    {getInvoiceLabel(selectedOrder.invoiceNumber)}
                  </Text>
                </View>
                <View style={styles.thermalRow}>
                  <Text style={styles.thermalRowLeft}>Date</Text>
                  <Text style={styles.thermalRowRight}>
                    {new Date(selectedOrder.createdAt).toLocaleString()}
                  </Text>
                </View>
                <View style={styles.thermalRow}>
                  <Text style={styles.thermalRowLeft}>Status</Text>
                  <Text style={styles.thermalRowRightBold}>
                    {selectedOrder.status.toUpperCase()}
                  </Text>
                </View>

                <View style={styles.thermalRule} />

                {itemsLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={TOKENS.primary}
                    style={{ marginVertical: 12 }}
                  />
                ) : (
                  orderItems.map((item) => (
                    <View key={item.id} style={styles.thermalRow}>
                      <Text style={styles.thermalRowLeft} numberOfLines={3}>
                        {item.quantity}x {item.name}
                      </Text>
                      <Text style={styles.thermalRowRight}>
                        Rs. {moneyFixed(item.price * item.quantity)}
                      </Text>
                    </View>
                  ))
                )}

                <View style={styles.thermalRule} />

                <View style={styles.thermalRow}>
                  <Text style={styles.thermalSummaryBold}>Subtotal</Text>
                  <Text style={styles.thermalSummaryBold}>Rs. {moneyFixed(subtotal)}</Text>
                </View>
                <View style={styles.thermalRow}>
                  <Text style={styles.thermalRowLeft}>{taxLabel}</Text>
                  <Text style={styles.thermalRowRight}>Rs. {moneyFixed(tax)}</Text>
                </View>
                {discount > 0 ? (
                  <View style={styles.thermalRow}>
                    <Text style={styles.thermalRowLeft}>{discountLabel}</Text>
                    <Text style={styles.thermalRowRight}>- Rs. {moneyFixed(discount)}</Text>
                  </View>
                ) : null}

                <View style={[styles.thermalRow, { marginTop: 6 }]}>
                  <Text style={styles.thermalTotalLabel}>TOTAL</Text>
                  <Text style={styles.thermalTotalValue}>
                    Rs. {moneyFixed(selectedOrder.totalAmount)}
                  </Text>
                </View>

                <View style={styles.thermalRule} />

                <Text style={styles.thermalFooterCenter}>Thank you for visiting!</Text>
                <Text style={styles.thermalFooterCenter}>Powered by Shopbook POS</Text>
                <View style={styles.thermalBarcodeBox}>
                  <Barcode
                    value={invoiceBarcodeValue}
                    format="CODE128"
                    singleBarWidth={1.8}
                    height={42}
                    maxWidth={280}
                  />
                  <Text style={styles.thermalBarcodeCaption}>{invoiceBarcodeValue}</Text>
                </View>
              </View>
            </ScrollView>
          )}

          {/* Actions Footer */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.actionBtnOutline}
              activeOpacity={0.8}
              onPress={handleShareInvoice}
            >
              <Feather name="share-2" size={16} color={TOKENS.primary} />
              <Text style={styles.actionBtnOutlineText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtnShare, itemsLoading && styles.actionBtnDisabled]}
              activeOpacity={0.8}
              onPress={handlePrintReceipt}
              disabled={itemsLoading}
            >
              <Feather name="printer" size={16} color={TOKENS.card} />
              <Text style={styles.actionBtnText}>Print receipt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>
      <PremiumUpgradeModal
        visible={premiumModalVisible}
        onClose={() => setPremiumModalVisible(false)}
        featureName="Invoice printing"
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TOKENS.background,
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
  headerTitleWrapper: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TOKENS.dark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: TOKENS.muted,
    marginTop: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: TOKENS.muted,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TOKENS.dark,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 13,
    color: TOKENS.muted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  scrollWrapper: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  orderCard: {
    backgroundColor: TOKENS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TOKENS.border,
    padding: 16,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  invoiceWrapper: {
    flex: 1,
    marginRight: 12,
    gap: INNER_TEXT_GAP,
    minWidth: 0,
  },
  invoiceNumber: {
    fontSize: 15,
    fontWeight: 'bold',
    color: TOKENS.dark,
  },
  cashierName: {
    fontSize: 12,
    color: TOKENS.muted,
    lineHeight: 16,
  },
  paidBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    flexShrink: 0,
  },
  paidBadgeText: {
    color: '#047857',
    fontSize: 10,
    fontWeight: 'bold',
  },
  dividerLine: {
    height: 1,
    backgroundColor: TOKENS.border,
    marginBottom: 12,
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderDate: {
    fontSize: 12,
    color: TOKENS.muted,
  },
  orderTotal: {
    fontSize: 15,
    fontWeight: 'bold',
    color: TOKENS.primary,
  },
  invoiceSheetInner: {
    flexDirection: 'column',
  },
  receiptScroll: {
    flexGrow: 0,
  },
  receiptScrollContent: {
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 16,
  },
  thermalPaper: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: '90%',
    backgroundColor: TOKENS.card,
    borderWidth: 1,
    borderColor: TOKENS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  thermalLogoEmoji: {
    fontSize: 36,
    textAlign: 'center',
    marginBottom: 6,
  },
  thermalLogoImg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignSelf: 'center',
    marginBottom: 6,
  },
  thermalMiniPos: {
    fontFamily: THERMAL_FONT,
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 2,
    color: '#000',
    marginBottom: 8,
  },
  thermalHeaderTitle: {
    fontFamily: THERMAL_FONT,
    fontSize: 17,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#000',
    marginTop: 4,
  },
  thermalCenterMuted: {
    fontFamily: THERMAL_FONT,
    fontSize: 13,
    color: '#444',
    textAlign: 'center',
    marginTop: 2,
  },
  thermalRule: {
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#000',
    marginVertical: 10,
  },
  thermalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginVertical: 3,
  },
  thermalRowLeft: {
    fontFamily: THERMAL_FONT,
    fontSize: 13,
    color: '#000',
    flex: 1,
    minWidth: 0,
  },
  thermalRowRight: {
    fontFamily: THERMAL_FONT,
    fontSize: 13,
    color: '#000',
    fontWeight: '600',
    flexShrink: 0,
    maxWidth: '52%',
    textAlign: 'right',
  },
  thermalRowRightBold: {
    fontFamily: THERMAL_FONT,
    fontSize: 13,
    fontWeight: 'bold',
    color: '#047857',
    flexShrink: 0,
    maxWidth: '52%',
    textAlign: 'right',
  },
  thermalSummaryBold: {
    fontFamily: THERMAL_FONT,
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000',
  },
  thermalTotalLabel: {
    fontFamily: THERMAL_FONT,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000',
  },
  thermalTotalValue: {
    fontFamily: THERMAL_FONT,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  thermalFooterCenter: {
    fontFamily: THERMAL_FONT,
    fontSize: 13,
    color: '#333',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 10,
  },
  thermalBarcodeBox: {
    alignItems: 'center',
    alignSelf: 'stretch',
    marginTop: 14,
  },
  thermalBarcodeCaption: {
    fontFamily: THERMAL_FONT,
    fontSize: 11,
    color: '#555',
    textAlign: 'center',
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: TOKENS.card,
    borderTopWidth: 1,
    borderTopColor: TOKENS.border,
  },
  actionBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.lightBlue,
    borderWidth: 1,
    borderColor: TOKENS.accentBlue,
    height: 48,
    borderRadius: 24,
    gap: 8,
  },
  actionBtnOutlineText: {
    color: TOKENS.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionBtnShare: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.primary,
    height: 48,
    borderRadius: 24,
    gap: 8,
    boxShadow: `0px 4px 6px 0px ${TOKENS.primary}4D`,
  },
  actionBtnDisabled: {
    opacity: 0.45,
  },
  actionBtnText: {
    color: TOKENS.card,
    fontSize: 14,
    fontWeight: 'bold',
  },
  paymentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: TOKENS.border,
    alignSelf: 'flex-start',
  },
  paymentInfoText: {
    fontSize: 12,
    color: TOKENS.muted,
    fontWeight: '500',
  },
});
