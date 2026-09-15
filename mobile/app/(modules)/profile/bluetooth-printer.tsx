import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  PermissionsAndroid,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TOKENS } from '../../../constants/tokens';
import { useSettingsStore } from '../../../stores/useSettingsStore';
import { getTopSafeInset } from '../../../utils/safeArea';
import { useBusinessStore } from '../../../stores/useBusinessStore';
import Barcode from 'react-native-barcode-svg';
import { hapticFeedback } from '@/utils/haptics';
import { useTranslation } from '../../../hooks/useTranslation';
import { useIsPro } from '../../../hooks/useEntitlement';

export type BluetoothDevice = {
  name?: string;
  address: string;
  [key: string]: any;
};

// Only load RNBluetoothClassic on Android to prevent iOS Swift fatal crashes on release builds
const getRNBluetoothClassic = () => {
  if (Platform.OS === 'android') {
    try {
      return require('react-native-bluetooth-classic').default;
    } catch (e) {
      console.warn('react-native-bluetooth-classic could not be imported.', e);
      return null;
    }
  }
  return null;
};

export default function BluetoothPrinterRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const pairedPrinter = useSettingsStore((s) => s.pairedPrinter);
  const setPairedPrinter = useSettingsStore((s) => s.setPairedPrinter);
  const isPremium = useIsPro();
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);

  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectingDevice, setConnectingDevice] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);

  // Virtual test print preview sheet
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleStartScan = async () => {
    if (!isPremium) {
      hapticFeedback.notificationWarning();
      setPremiumModalVisible(true);
      return;
    }
    setIsScanning(true);
    setDevices([]);
    hapticFeedback.impactLight();

    try {
      if (Platform.OS === 'ios') {
        setIsScanning(false);
        Alert.alert(
          'Bluetooth Thermal Printer',
          'Direct Bluetooth Classic (SPP) scanning is supported on Android devices. On iOS, you can print receipts seamlessly using AirPrint / System Print from the checkout screen.'
        );
        return;
      }

      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        if (
          granted['android.permission.ACCESS_FINE_LOCATION'] ===
            PermissionsAndroid.RESULTS.DENIED ||
          granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.DENIED
        ) {
          hapticFeedback.notificationWarning();
          triggerToast('Bluetooth permissions are required to scan.');
          setIsScanning(false);
          return;
        }
      }

      const btc = getRNBluetoothClassic();
      if (!btc) {
        setIsScanning(false);
        triggerToast('Bluetooth printing is not available on this device.');
        return;
      }

      const isEnabled = await btc.isBluetoothEnabled();
      if (!isEnabled) {
        hapticFeedback.notificationWarning();
        Alert.alert(
          'Bluetooth Disabled',
          'Please enable Bluetooth in your device settings to scan for thermal printers.'
        );
        setIsScanning(false);
        return;
      }

      const bonded = await btc.getBondedDevices();
      setDevices(bonded);

      if (bonded.length === 0) {
        hapticFeedback.notificationWarning();
        triggerToast('No paired Bluetooth devices found.');
      } else {
        hapticFeedback.notificationSuccess();
        triggerToast(`Found ${bonded.length} paired Bluetooth device(s)`);
      }
    } catch (err) {
      console.warn(err);
      hapticFeedback.notificationError();
      triggerToast('Failed to scan for Bluetooth devices.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnectDevice = async (device: BluetoothDevice) => {
    setConnectingDevice(device.address);
    hapticFeedback.impactMedium();

    const btc = getRNBluetoothClassic();
    if (!btc) {
      triggerToast('Bluetooth printer module is unavailable.');
      setConnectingDevice(null);
      return;
    }

    try {
      const isConnected = await btc.connectToDevice(device.address);

      if (isConnected) {
        hapticFeedback.notificationSuccess();
        setPairedPrinter({ name: device.name || 'Unknown Printer', address: device.address });
        triggerToast(`Connected to ${device.name}`);
      } else {
        hapticFeedback.notificationError();
        triggerToast(`Failed to connect to ${device.name}`);
      }
    } catch (err) {
      console.warn(err);
      hapticFeedback.notificationError();
      triggerToast('Connection error occurred.');
    } finally {
      setConnectingDevice(null);
    }
  };

  const handleDisconnect = () => {
    hapticFeedback.notificationWarning();
    Alert.alert('Disconnect Printer', 'Are you sure you want to disconnect this thermal printer?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          hapticFeedback.impactMedium();
          setPairedPrinter(null);
          setDevices([]);
          triggerToast('Printer disconnected');
        },
      },
    ]);
  };

  const handlePrintTestPage = async () => {
    if (!pairedPrinter) {
      hapticFeedback.notificationWarning();
      Alert.alert('No Printer', 'Please pair a thermal printer first.');
      return;
    }
    hapticFeedback.impactLight();
    setShowReceiptPreview(true);
  };

  const executePhysicalPrint = async () => {
    if (!pairedPrinter) {
      hapticFeedback.notificationWarning();
      Alert.alert('No Printer', 'No printer connected.');
      return;
    }

    const btc = getRNBluetoothClassic();
    if (!btc) {
      hapticFeedback.notificationWarning();
      Alert.alert(
        'Printer Unavailable',
        'Bluetooth printer module is not available on this device.'
      );
      return;
    }

    try {
      const device = await btc.connectToDevice(pairedPrinter.address);

      // Build ESC/POS payload
      let receiptText = '';
      receiptText += '\x1B\x40'; // Initialize
      receiptText += '\x1B\x61\x01'; // Center align
      receiptText += '\x1D\x21\x00'; // Normal size

      receiptText += `\n${activeBusiness.name}\n`;
      receiptText += `${activeBusiness.address}\n`;
      receiptText += `Tel: ${activeBusiness.phone}\n`;

      receiptText += '--------------------------------\n';
      receiptText += '*** TEST PRINT RECEIPT ***\n';
      receiptText += '--------------------------------\n';

      receiptText += '\x1B\x61\x00'; // Left align
      receiptText += '1x Anchor Milk 1L       Rs. 680\n';
      receiptText += '2x Marie Biscuits       Rs. 360\n';

      receiptText += '--------------------------------\n';
      receiptText += 'Subtotal               Rs. 1040\n';
      receiptText += 'Tax                      Rs. 83\n';

      receiptText += '\x1B\x61\x01'; // Center align
      receiptText += '\x1D\x21\x11'; // Double size
      receiptText += 'TOTAL       Rs. 1123\n';
      receiptText += '\x1D\x21\x00'; // Normal size
      receiptText += '\x1B\x61\x01'; // Center align
      receiptText += '--------------------------------\n';

      receiptText += '\nThank you for visiting!\n';
      receiptText += 'Powered by Shopbook POS\n\n\n\n';

      // Write data to printer
      await device.write(receiptText, 'utf-8');

      hapticFeedback.notificationSuccess();
      setShowReceiptPreview(false);
      triggerToast('Receipt sent to physical printer! 🖨️');
    } catch (error) {
      console.warn('Print error', error);
      hapticFeedback.notificationError();
      Alert.alert('Print Error', 'Could not communicate with the printer.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: getTopSafeInset(insets) }]}>
      {/* Toast Notification */}
      {toastMessage && (
        <View style={styles.toastContainer}>
          <Feather name="check-circle" size={16} color={TOKENS.card} />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={() => router.push('/profile')}
        >
          <Feather name="chevron-left" size={22} color={TOKENS.dark} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Printer Setup</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scrollWrapper}>
        {/* Connection status section */}
        {pairedPrinter ? (
          <View style={styles.pairedCard}>
            <View style={styles.pairedIconBox}>
              <Feather name="printer" size={28} color="#137333" />
            </View>
            <View style={styles.pairedInfo}>
              <Text style={styles.pairedTitle}>{pairedPrinter.name}</Text>
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>{t('printer.connectedAndReady')}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
              <Text style={styles.disconnectBtnText}>{t('printer.disconnectBtn')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noPrinterCard}>
            <View style={styles.noPrinterIconBox}>
              <Feather name="printer" size={32} color={TOKENS.muted} />
            </View>
            <Text style={styles.noPrinterTitle}>{t('printer.noDevicesFound')}</Text>
            <Text style={styles.noPrinterSub}>
              Connect a Bluetooth 58mm or 80mm ESC/POS thermal printer to generate instant paper
              bills.
            </Text>
          </View>
        )}

        {/* Action Panel */}
        {pairedPrinter && (
          <View style={styles.actionPanel}>
            <Text style={styles.sectionTitle}>Printer Actions</Text>
            <TouchableOpacity style={styles.actionRowBtn} onPress={handlePrintTestPage}>
              <View style={[styles.actionIconCircle, { backgroundColor: TOKENS.lightBlue }]}>
                <Feather name="file-text" size={18} color={TOKENS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionRowTitle}>{t('printer.testPrintBtn')}</Text>
                <Text style={styles.actionRowSub}>
                  Send test invoice layout to verify print alignments
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={TOKENS.muted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Scan section */}
        <View style={styles.scanSection}>
          <View style={styles.scanHeader}>
            <Text style={styles.sectionTitle}>{t('printer.availableDevices')}</Text>
            {isScanning && <ActivityIndicator size="small" color={TOKENS.primary} />}
          </View>

          {!isScanning && devices.length === 0 && (
            <TouchableOpacity style={styles.scanBtn} activeOpacity={0.8} onPress={handleStartScan}>
              <Feather name="search" size={16} color={TOKENS.card} />
              <Text style={styles.scanBtnText}>{t('printer.scanPrinterBtn')}</Text>
            </TouchableOpacity>
          )}

          {isScanning && (
            <View style={styles.scanningBox}>
              <Text style={styles.scanningText}>{t('printer.scanningText')}</Text>
              <Text style={styles.scanningSub}>
                Make sure your receipt printer is switched on and discoverable.
              </Text>
            </View>
          )}

          {!isScanning && devices.length > 0 && (
            <View style={styles.deviceList}>
              {devices.map((device) => {
                const isConnecting = connectingDevice === device.name;
                return (
                  <TouchableOpacity
                    key={device.address}
                    style={styles.deviceRow}
                    disabled={connectingDevice !== null}
                    onPress={() => handleConnectDevice(device)}
                  >
                    <View style={styles.deviceIconCircle}>
                      <Ionicons name="bluetooth" size={18} color={TOKENS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.deviceName}>{device.name || 'Unknown Device'}</Text>
                      <Text style={styles.deviceDetails}>{device.address}</Text>
                    </View>
                    {isConnecting ? (
                      <ActivityIndicator size="small" color={TOKENS.primary} />
                    ) : (
                      <Text style={styles.connectLink}>Pair Device</Text>
                    )}
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity style={styles.rescanBtn} onPress={handleStartScan}>
                <Feather name="refresh-cw" size={14} color={TOKENS.primary} />
                <Text style={styles.rescanText}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* VIRTUAL RECEIPT PREVIEW MODAL */}
      <Modal
        visible={showReceiptPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReceiptPreview(false)}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>{t('printer.testReceiptTitle')}</Text>
              <TouchableOpacity onPress={() => setShowReceiptPreview(false)}>
                <Feather name="x" size={20} color={TOKENS.dark} />
              </TouchableOpacity>
            </View>

            {/* Simulated Receipt Feed */}
            <ScrollView style={styles.receiptScroll} contentContainerStyle={styles.receiptContent}>
              {activeBusiness.logoUri ? (
                <View style={styles.receiptLogoWrapper}>
                  {activeBusiness.logoUri.length <= 2 ? (
                    <Text style={{ fontSize: 32 }}>{activeBusiness.logoUri}</Text>
                  ) : (
                    <Image source={{ uri: activeBusiness.logoUri }} style={styles.receiptLogoImg} />
                  )}
                </View>
              ) : (
                <Text style={styles.receiptLogoText}>★ SHOPBOOK POS ★</Text>
              )}

              <Text style={styles.receiptStoreName}>{activeBusiness.name}</Text>
              <Text style={styles.receiptStoreSub}>{activeBusiness.category}</Text>
              <Text style={styles.receiptStoreSub}>{activeBusiness.address}</Text>
              <Text style={styles.receiptStoreSub}>Tel: {activeBusiness.phone}</Text>

              <Text style={styles.dashedSeparator}>- - - - - - - - - - - - - - - -</Text>
              <Text style={[styles.receiptStoreSub, { fontWeight: 'bold', textAlign: 'center' }]}>
                *** TEST PRINT RECEIPT ***
              </Text>
              <Text style={styles.receiptStoreSub}>Printer: {pairedPrinter?.name}</Text>
              <Text style={styles.receiptStoreSub}>Status: ONLINE</Text>
              <Text style={styles.dashedSeparator}>- - - - - - - - - - - - - - - -</Text>

              <View style={styles.receiptItemRow}>
                <Text style={styles.receiptItemName}>1x Anchor Milk 1L</Text>
                <Text style={styles.receiptItemPrice}>Rs. 680.00</Text>
              </View>

              <View style={styles.receiptItemRow}>
                <Text style={styles.receiptItemName}>2x Marie Biscuits</Text>
                <Text style={styles.receiptItemPrice}>Rs. 360.00</Text>
              </View>

              <Text style={styles.dashedSeparator}>- - - - - - - - - - - - - - - -</Text>

              <View style={styles.receiptTotalRow}>
                <Text style={styles.receiptTotalLabel}>Subtotal</Text>
                <Text style={styles.receiptTotalVal}>Rs. 1,040.00</Text>
              </View>

              <View style={styles.receiptTotalRow}>
                <Text style={styles.receiptTotalLabel}>Standard Tax (8%)</Text>
                <Text style={styles.receiptTotalVal}>Rs. 83.20</Text>
              </View>

              <View style={[styles.receiptTotalRow, { marginTop: 4 }]}>
                <Text style={[styles.receiptTotalLabel, { fontWeight: 'bold', fontSize: 15 }]}>
                  TOTAL
                </Text>
                <Text style={[styles.receiptTotalVal, { fontWeight: 'bold', fontSize: 15 }]}>
                  Rs. 1,123.20
                </Text>
              </View>

              <Text style={styles.dashedSeparator}>- - - - - - - - - - - - - - - -</Text>

              <Text style={[styles.receiptStoreSub, { textAlign: 'center', fontStyle: 'italic' }]}>
                Thank you for visiting!
              </Text>
              <Text style={[styles.receiptStoreSub, { textAlign: 'center' }]}>
                Powered by Shopbook POS
              </Text>

              <View style={styles.barcodeBox}>
                <Barcode
                  value="0192381"
                  format="CODE128"
                  singleBarWidth={1.8}
                  height={40}
                  maxWidth={200}
                />
                <Text style={styles.barcodeText}>0192381</Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.printActionBtn}
              activeOpacity={0.8}
              onPress={executePhysicalPrint}
            >
              <Feather name="printer" size={16} color={TOKENS.card} />
              <Text style={styles.printActionBtnText}>{t('printer.sendToPrinter')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

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
    position: 'absolute',
    left: 60,
    right: 60,
    textAlign: 'center',
  },
  scrollWrapper: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  pairedCard: {
    backgroundColor: TOKENS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TOKENS.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pairedIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E6F4EA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pairedInfo: {
    flex: 1,
  },
  pairedTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: TOKENS.dark,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#137333',
  },
  onlineText: {
    fontSize: 11,
    color: '#137333',
    fontWeight: 'bold',
  },
  disconnectBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TOKENS.border,
  },
  disconnectBtnText: {
    color: TOKENS.error,
    fontSize: 12,
    fontWeight: 'bold',
  },
  noPrinterCard: {
    backgroundColor: TOKENS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TOKENS.border,
    padding: 24,
    alignItems: 'center',
  },
  noPrinterIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  noPrinterTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TOKENS.dark,
  },
  noPrinterSub: {
    fontSize: 12,
    color: TOKENS.muted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  actionPanel: {
    backgroundColor: TOKENS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TOKENS.border,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: TOKENS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  actionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionRowTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TOKENS.dark,
  },
  actionRowSub: {
    fontSize: 11,
    color: TOKENS.muted,
    marginTop: 2,
  },
  scanSection: {
    backgroundColor: TOKENS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TOKENS.border,
    padding: 16,
    gap: 12,
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TOKENS.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  scanBtnText: {
    color: TOKENS.card,
    fontSize: 14,
    fontWeight: 'bold',
  },
  scanningBox: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  scanningText: {
    fontSize: 13,
    fontWeight: '600',
    color: TOKENS.dark,
  },
  scanningSub: {
    fontSize: 11,
    color: TOKENS.muted,
    textAlign: 'center',
    marginTop: 6,
  },
  deviceList: {
    gap: 12,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  deviceIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: TOKENS.lightBlue,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: TOKENS.dark,
  },
  deviceDetails: {
    fontSize: 11,
    color: TOKENS.muted,
    marginTop: 2,
  },
  connectLink: {
    fontSize: 12,
    fontWeight: 'bold',
    color: TOKENS.primary,
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 4,
  },
  rescanText: {
    color: TOKENS.primary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  // Preview modal styles
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  previewCard: {
    backgroundColor: TOKENS.card,
    width: '100%',
    borderRadius: 24,
    padding: 20,
    maxHeight: '85%',
    boxShadow: '0px 10px 15px 0px rgba(0, 0, 0, 0.25)',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.border,
    paddingBottom: 12,
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: TOKENS.dark,
  },
  receiptScroll: {
    backgroundColor: '#FDFDFD',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    flexGrow: 0,
  },
  receiptContent: {
    alignItems: 'stretch',
    paddingBottom: 24,
  },
  receiptLogoWrapper: {
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  receiptLogoImg: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
  },
  receiptInitialsText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  receiptLogoText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#000',
    marginBottom: 8,
    letterSpacing: 2,
  },
  receiptStoreName: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#000',
  },
  receiptStoreSub: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    textAlign: 'center',
    color: '#444',
    marginTop: 2,
  },
  dashedSeparator: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    textAlign: 'center',
    color: '#000',
    marginVertical: 8,
  },
  receiptItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  receiptItemName: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: '#000',
  },
  receiptItemPrice: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: '#000',
  },
  receiptTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
  receiptTotalLabel: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: '#000',
  },
  receiptTotalVal: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    color: '#000',
  },
  barcodeBox: {
    alignItems: 'center',
    marginTop: 20,
    gap: 4,
  },

  barcodeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    color: '#666',
  },
  printActionBtn: {
    backgroundColor: TOKENS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
  },
  printActionBtnText: {
    color: TOKENS.card,
    fontWeight: 'bold',
    fontSize: 14,
  },
});
