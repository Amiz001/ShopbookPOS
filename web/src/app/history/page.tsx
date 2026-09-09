'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  useRegisterScanHandler,
  defaultRestoreFieldValue,
  applyScannedDestinationValue,
} from '../../contexts/ScannerContext';
import { useAuthStore } from '../../stores/authStore';
import { useBusinessStore } from '../../stores/businessStore';
import { Search, CheckCircle, FileSpreadsheet, FileText } from 'lucide-react';

import { InvoiceListTable } from '../../components/history/InvoiceListTable';
import { InvoiceDetailModal } from '../../components/history/InvoiceDetailModal';
import {
  useGetPaginatedOrders,
  useGetOrderItems,
  useVoidOrder,
  useGetAllOrders,
} from '../../hooks/useOrders';
import { useUserPermissions } from '../../hooks/useUserPermissions';
import { buildReportHtml } from '../../utils/reportTemplates';

interface OrderRecord {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  paymentMethod: string;
  status: string; // paid / voided
  discountType?: string;
  discountValue: number;
  taxValue: number;
  taxRate: number;
  createdAt: number;
  dateStr: string;
  cashierName: string;
  bankName?: string;
  cardLastFour?: string;
}

interface OrderItemRecord {
  id: string;
  productId?: string;
  name: string;
  quantity: number;
  price: number;
}

export default function OrderHistoryPage() {
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const employeeName = useAuthStore((s) => s.employeeName);
  const { isRoleAtLeast } = useUserPermissions();
  const canExport = isRoleAtLeast('manager'); // Only manager & admin can export reports

  // States
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchInputLockRef = useRef(false);

  const restoreHistoryFieldValue = useCallback((element: Element, value: string) => {
    defaultRestoreFieldValue(element, value);
  }, []);

  useRegisterScanHandler(
    (code) => {
      applyScannedDestinationValue(searchInputRef, code, setSearchQuery);
      searchInputRef.current?.focus();
    },
    true,
    {
      scanDestinationRefs: [searchInputRef],
      restoreFieldValue: restoreHistoryFieldValue,
      scanInputLockRef: searchInputLockRef,
    }
  );

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Reset to page 1 when search query changes
  React.useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  // Detail Modal States
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  // React Query Hooks
  const { data: paginatedData, isLoading: loading } = useGetPaginatedOrders(
    page,
    pageSize,
    searchQuery
  );
  const orders = paginatedData?.orders || [];
  const totalCount = paginatedData?.totalCount || 0;
  const totalPages = paginatedData?.totalPages || 1;

  const { fetchAllOrders } = useGetAllOrders();

  const mappedOrders: OrderRecord[] = useMemo(() => {
    return orders.map((o) => ({
      id: o.id,
      invoiceNumber: o.invoiceNumber,
      totalAmount: o.totalAmount,
      paymentMethod: o.paymentMethod || 'cash',
      status: o.status || 'paid',
      discountType: o.discountType || 'none',
      discountValue: o.discountValue || 0,
      taxValue: o.taxValue || 0,
      taxRate: o.taxRate || 0,
      createdAt: o.createdAt,
      dateStr: new Date(o.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
      cashierName: o.cashierName || employeeName || 'Cashier',
      bankName: o.bankName || '',
      cardLastFour: o.cardLastFour || '',
    }));
  }, [orders, employeeName]);

  const { data: orderItems = [] } = useGetOrderItems(selectedOrder?.id);
  const voidOrderMutation = useVoidOrder();

  // Trigger Toast notification
  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 1500);
  };

  // View Receipt detail click
  const handleViewReceipt = (order: OrderRecord) => {
    setSelectedOrder(order);
    setShowReceipt(true);
  };

  // Void Invoice
  const handleVoidInvoice = async () => {
    if (!selectedOrder) return;
    if (selectedOrder.status === 'voided') {
      alert('This invoice has already been voided.');
      return;
    }
    if (
      !confirm(
        `Are you sure you want to VOID invoice ${selectedOrder.invoiceNumber}? This will revert product stock counts.`
      )
    )
      return;

    voidOrderMutation.mutate(
      {
        orderId: selectedOrder.id,
        invoiceNumber: selectedOrder.invoiceNumber,
      },
      {
        onSuccess: () => {
          triggerToast(`Invoice ${selectedOrder.invoiceNumber} voided! 🚫`);
          setShowReceipt(false);
          setSelectedOrder(null);
        },
        onError: (err) => {
          console.error('Failed to void invoice:', err);
          alert('Failed to void invoice due to internal storage error.');
        },
      }
    );
  };

  const handleCopyReceiptText = () => {
    if (!selectedOrder) return;

    const itemsText = orderItems
      .map(
        (item) =>
          `• ${item.quantity} x ${item.name} - Rs. ${(item.price * item.quantity).toLocaleString()}`
      )
      .join('\n');

    const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const shareContent = `
=================================
       ${activeBusiness?.name?.toUpperCase() || 'SHOPBOOK PARTNER'}
       ${activeBusiness?.category || 'Retail POS'}
       ${activeBusiness?.address || 'Sri Lanka'}
=================================
Invoice: ${selectedOrder.invoiceNumber}
Date: ${selectedOrder.dateStr}
Status: ${selectedOrder.status.toUpperCase()}
Cashier: ${selectedOrder.cashierName}
---------------------------------
Items:
${itemsText}
---------------------------------
Subtotal: Rs. ${subtotal.toLocaleString()}
Discount: Rs. ${selectedOrder.discountValue.toLocaleString()}
VAT Tax (${selectedOrder.taxRate}%): Rs. ${selectedOrder.taxValue.toLocaleString()}
---------------------------------
Total Amount: Rs. ${selectedOrder.totalAmount.toLocaleString()}
Payment Tender: ${selectedOrder.paymentMethod.toUpperCase()} ${(selectedOrder.paymentMethod === 'card' || selectedOrder.paymentMethod === 'bank') && selectedOrder.bankName ? `\nPayment Info: ${selectedOrder.bankName} ${selectedOrder.cardLastFour ? `(**** ${selectedOrder.cardLastFour})` : ''}` : ''}
=================================
Thank you for shopping with us!
`;

    navigator.clipboard.writeText(shareContent);
    triggerToast('Receipt text copied to clipboard! 📋');
  };

  const handleExportExcel = async () => {
    if (isExporting) return;
    try {
      setIsExporting(true);
      const data = await fetchAllOrders(searchQuery);
      if (data.orders.length === 0) {
        alert('No transaction records to export.');
        return;
      }

      const headers = [
        'Invoice Number',
        'Date & Time',
        'Cashier',
        'Payment Method',
        'Bank/Brand',
        'Card Last 4',
        'Status',
        'Discount Type',
        'Discount Value (Rs.)',
        'Tax Value (Rs.)',
        'Total Amount (Rs.)',
      ];

      const rows = data.orders.map((o) => [
        o.invoiceNumber,
        o.dateStr,
        o.cashierName,
        o.paymentMethod.toUpperCase(),
        o.bankName || '',
        o.cardLastFour ? `'${o.cardLastFour}` : '',
        o.status.toUpperCase(),
        (o.discountType || 'NONE').toUpperCase(),
        o.discountValue.toString(),
        o.taxValue.toString(),
        o.totalAmount.toString(),
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.map((val) => `"${val.replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `Invoice_Sales_Report_${new Date().toISOString().slice(0, 10)}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerToast('Sales ledger report exported to CSV/Excel! 📊');
    } catch (err: any) {
      console.error('Failed to export Excel:', err);
      alert('Failed to generate Excel export: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (isExporting) return;
    if (!activeBusiness || activeBusiness.id === '0') {
      alert('No active business found. Please select a business branch first.');
      return;
    }

    try {
      setIsExporting(true);
      const data = await fetchAllOrders(searchQuery);
      if (data.orders.length === 0) {
        alert('No transaction records to export.');
        return;
      }

      const reportData = {
        business: {
          name: activeBusiness.name || 'Store',
          category: activeBusiness.category,
          address: activeBusiness.address,
          phone: activeBusiness.phone,
        },
        orders: data.orders,
        orderItems: data.orderItems,
        products: data.products,
      };

      const html = buildReportHtml('invoice_sales', reportData);

      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setIsExporting(false);
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }, 600);
      }
    } catch (err: any) {
      console.error('Failed to export PDF:', err);
      alert('Failed to generate PDF report: ' + err.message);
      setIsExporting(false);
    }
  };

  return (
    <div style={styles.workspace} className="fade-in">
      {toastMsg && (
        <div style={styles.toast}>
          <CheckCircle size={16} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Filter panel */}
      <div style={styles.filterRow}>
        <div style={styles.searchBox}>
          <Search size={18} color="var(--muted)" />
          <input
            type="text"
            ref={searchInputRef}
            placeholder="Search by invoice number, payment method, or status..."
            value={searchQuery}
            onChange={(e) => {
              if (searchInputLockRef.current) return;
              setSearchQuery(e.target.value);
            }}
            style={styles.searchInput}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {mappedOrders.length > 0 && (
            <span
              style={{
                fontSize: '12px',
                color: 'var(--muted)',
                fontWeight: '500',
                marginRight: canExport ? '8px' : '0',
              }}
            >
              Showing {mappedOrders.length} sales records
            </span>
          )}
          {canExport && (
            <>
              <button
                onClick={handleExportExcel}
                style={{
                  ...styles.actionBtn,
                  opacity: isExporting ? 0.6 : 1,
                  cursor: isExporting ? 'not-allowed' : 'pointer',
                }}
                disabled={isExporting}
              >
                <FileSpreadsheet size={15} />
                <span>{isExporting ? 'Exporting...' : 'Excel Export'}</span>
              </button>
              <button
                onClick={handleExportPDF}
                style={{
                  ...styles.actionBtn,
                  opacity: isExporting ? 0.6 : 1,
                  cursor: isExporting ? 'not-allowed' : 'pointer',
                }}
                disabled={isExporting}
              >
                <FileText size={15} />
                <span>{isExporting ? 'Preparing PDF...' : 'PDF Report'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      <InvoiceListTable
        loading={loading}
        filteredOrders={mappedOrders}
        onViewReceipt={handleViewReceipt}
        page={page}
        pageSize={pageSize}
        setPage={setPage}
        setPageSize={setPageSize}
        totalCount={totalCount}
        totalPages={totalPages}
      />

      <InvoiceDetailModal
        isOpen={showReceipt}
        order={selectedOrder}
        items={orderItems}
        activeBusiness={activeBusiness}
        onClose={() => {
          setShowReceipt(false);
          setSelectedOrder(null);
        }}
        onVoid={handleVoidInvoice}
        onCopyText={handleCopyReceiptText}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  workspace: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    height: 'calc(100vh - 73px)',
    overflow: 'hidden',
  },
  filterRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  searchBox: {
    flex: 1,
    maxWidth: '480px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#ffffff',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '10px 14px',
    boxShadow: 'var(--shadow)',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '13px',
    color: 'var(--dark)',
  },
  toast: {
    position: 'fixed',
    top: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'var(--dark)',
    color: '#ffffff',
    padding: '12px 24px',
    borderRadius: '30px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontWeight: 'bold',
    fontSize: '13px',
    zIndex: 99999,
    boxShadow: 'var(--shadow-lg)',
  },
  loadMoreContainer: {
    display: 'flex',
    justifyContent: 'center',
    margin: '8px 0 16px 0',
  },
  loadMoreBtn: {
    padding: '8px 20px',
    borderRadius: '20px',
    border: '1px solid var(--border)',
    backgroundColor: '#ffffff',
    color: 'var(--primary)',
    fontWeight: 'bold',
    fontSize: '12px',
    cursor: 'pointer',
    boxShadow: 'var(--shadow)',
    transition: 'background-color 0.2s',
  },
  actionBtn: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    backgroundColor: '#ffffff',
    color: 'var(--dark)',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    boxShadow: 'var(--shadow)',
    transition: 'background-color 0.2s',
  },
};
