import { Platform, Alert } from 'react-native';
import * as Print from 'expo-print';
import { useSettingsStore } from '../stores/useSettingsStore';
import { buildThermalReceiptHtml, BuildThermalReceiptOptions } from './thermalReceiptHtml';

// Dynamically load RNBluetoothClassic ONLY on Android.
// On iOS, Bluetooth Classic (SPP) is not supported for generic thermal printers,
// and initializing it without MFi protocols crashes the Swift runtime on release builds.
let RNBluetoothClassic: any = null;
if (Platform.OS === 'android') {
  try {
    RNBluetoothClassic = require('react-native-bluetooth-classic').default;
  } catch (e) {
    console.warn('react-native-bluetooth-classic could not be imported.', e);
  }
}

/**
 * Formats a single line of receipt with left and right columns.
 * Smartly wraps the left column if the total length exceeds the character limit
 * to avoid overrunning the price.
 */
export function formatLine(left: string, right: string, width = 32): string {
  const leftSpace = width - right.length;
  if (left.length <= leftSpace) {
    const pad = leftSpace - left.length;
    return left + ' '.repeat(pad) + right + '\n';
  } else {
    // If the left side is too long, wrap the remainder to the next line
    const fitLength = leftSpace - 1;
    const line1 = left.slice(0, fitLength);
    const line2 = left.slice(fitLength).trim();
    const line2Formatted = line2.length > 0 ? '  ' + line2.slice(0, width - 2) + '\n' : '';
    return line1 + ' '.repeat(width - line1.length - right.length) + right + '\n' + line2Formatted;
  }
}

/**
 * Converts invoice options to raw ESC/POS command sequences.
 */
export function buildThermalReceiptText(opts: BuildThermalReceiptOptions, width = 32): string {
  let text = '';

  // 1. Initialize printer (ESC @)
  text += '\x1B\x40';

  // 2. Center Align for Business Header
  text += '\x1B\x61\x01';

  // Double-height & double-width for business name (GS ! 17)
  text += '\x1D\x21\x11';
  text += `${opts.businessName}\n`;
  text += '\x1D\x21\x00'; // Reset size

  text += `${opts.category}\n`;
  text += `${opts.address}\n`;
  if (opts.phone) {
    text += `Tel: ${opts.phone}\n`;
  }

  // Dashed separator (Left Align)
  text += '\x1B\x61\x00';
  text += '-'.repeat(width) + '\n';

  // Metadata details
  text += formatLine('Cashier:', opts.cashierLabel, width);
  if (opts.invoiceLabel) {
    text += formatLine('Invoice:', opts.invoiceLabel, width);
  }
  text += formatLine('Date:', opts.dateStr, width);
  if (opts.paymentMethod) {
    text += formatLine('Payment:', opts.paymentMethod.toUpperCase(), width);
  }
  if (opts.status) {
    text += formatLine('Status:', opts.status.toUpperCase(), width);
  }

  // Dashed separator
  text += '-'.repeat(width) + '\n';

  // Cart items
  for (const item of opts.items) {
    text += formatLine(`${item.quantity}x ${item.name}`, `Rs. ${item.lineTotal.toFixed(2)}`, width);
  }

  // Dashed separator
  text += '-'.repeat(width) + '\n';

  // Financial summary calculations
  text += formatLine('Subtotal:', `Rs. ${opts.subtotal.toFixed(2)}`, width);
  text += formatLine(opts.taxLabel || 'Tax:', `Rs. ${opts.tax.toFixed(2)}`, width);
  if (opts.discount && opts.discount > 0) {
    text += formatLine(
      opts.discountLabel || 'Discount:',
      `-Rs. ${opts.discount.toFixed(2)}`,
      width
    );
  }

  // Dashed separator
  text += '-'.repeat(width) + '\n';

  // Grand Total - double height (GS ! 1)
  text += '\x1B\x61\x01'; // Center align
  text += '\x1D\x21\x01'; // Double height
  text += `TOTAL: Rs. ${opts.grandTotal.toFixed(2)}\n`;
  text += '\x1D\x21\x00'; // Normal size

  // Footer separator & note
  text += '-'.repeat(width) + '\n';
  text += 'Thank you for visiting!\n';
  text += 'Powered by Shopbook POS\n';

  if (opts.barcodeLine) {
    text += `\n${opts.barcodeLine}\n`;
  }

  // Feed paper so it can be cleanly torn (5 newlines)
  text += '\n\n\n\n\n';

  return text;
}

/**
 * Triggers standard system printing using expo-print.
 */
export async function triggerSystemPrint(opts: BuildThermalReceiptOptions): Promise<void> {
  try {
    const html = buildThermalReceiptHtml(opts);
    await Print.printAsync({ html });
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.error('System print error:', error);

    // Suppress showing an alert if printing was canceled/dismissed by the user
    const isCancel =
      errMsg.includes('Printing did not complete') ||
      errMsg.toLowerCase().includes('cancel') ||
      errMsg.toLowerCase().includes('dismissed');

    if (isCancel) {
      console.log('System print canceled by user.');
      return;
    }

    Alert.alert('System Print Error', 'Could not complete printing operation.');
  }
}

/**
 * Main print coordinator: prints to the paired Bluetooth thermal printer if available,
 * otherwise alerts the user and falls back to standard system print.
 */
export async function printReceipt(opts: BuildThermalReceiptOptions): Promise<void> {
  const pairedPrinter = useSettingsStore.getState().pairedPrinter;

  // If no printer is paired/connected, prompt fallback
  if (!pairedPrinter || Platform.OS === 'web' || !RNBluetoothClassic) {
    Alert.alert(
      'No Bluetooth Printer Paired',
      'No Bluetooth thermal printer is set up in settings. Connect one in Settings/Profile, or print via system print instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'System Print',
          onPress: () => triggerSystemPrint(opts),
        },
      ]
    );
    return;
  }

  try {
    // Attempt Bluetooth connection and write
    const device = await RNBluetoothClassic.connectToDevice(pairedPrinter.address);
    const textData = buildThermalReceiptText(opts, 32);
    await device.write(textData, 'utf-8');
  } catch (error) {
    console.warn('Bluetooth print error:', error);
    Alert.alert(
      'Printer Connection Failed',
      `Could not communicate with your thermal printer "${pairedPrinter.name}". Would you like to use System Print instead?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Try Again',
          onPress: () => printReceipt(opts),
        },
        {
          text: 'System Print',
          onPress: () => triggerSystemPrint(opts),
        },
      ]
    );
  }
}
