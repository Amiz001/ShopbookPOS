'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useBusinessStore } from '../../stores/businessStore';
import { Package, History, CheckCircle, Lock } from 'lucide-react';
import { useUserPermissions } from '../../hooks/useUserPermissions';
import {
  useRegisterScanHandler,
  defaultRestoreFieldValue,
  applyScannedDestinationValue,
} from '../../contexts/ScannerContext';
import './stocks.css';

import { StocksTable } from '../../components/stocks/StocksTable';
import { AuditLogScroller } from '../../components/stocks/AuditLogScroller';
import { AdjustStockModal } from '../../components/stocks/AdjustStockModal';
import { RegisterProductModal } from '../../components/catalog/RegisterProductModal';
import {
  useProducts,
  useGetGlobalStockHistory,
  useAdjustStock,
  useAddProduct,
} from '../../hooks/useProducts';

interface DBProduct {
  id: string;
  name: string;
  price: number;
  category: string;
  icon: string;
  stockCount: number;
  lowStockAlert?: number;
  unitType?: string;
  costPrice?: number;
  quickCode?: string;
  barcode?: string;
}

export default function StocksPage() {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const { canPerform } = useUserPermissions();
  const canUpdateProducts = canPerform('update', 'products');

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchInputLockRef = useRef(false);

  const restoreStocksFieldValue = useCallback((element: Element, value: string) => {
    defaultRestoreFieldValue(element, value);
  }, []);

  useRegisterScanHandler(
    (code) => {
      applyScannedDestinationValue(searchInputRef, code, setSearchQuery);
      searchInputRef.current?.focus();
    },
    canUpdateProducts,
    {
      scanDestinationRefs: [searchInputRef],
      restoreFieldValue: restoreStocksFieldValue,
      scanInputLockRef: searchInputLockRef,
    }
  );

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inventory' | 'audit'>('inventory');

  // Stock Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<DBProduct | null>(null);

  // Add New Item Modal
  const [showAddModal, setShowAddModal] = useState(false);

  // React Query Hooks
  const {
    data: products = [],
    isLoading: loadingProducts,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useProducts(undefined, searchQuery);

  const { data: logs = [] } = useGetGlobalStockHistory(activeBusiness?.id || '0');
  const adjustStockMutation = useAdjustStock();
  const addProductMutation = useAddProduct();

  if (!canUpdateProducts) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '24px',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            padding: '48px 32px',
            maxWidth: '480px',
            width: '100%',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #fecaca',
            }}
          >
            <Lock size={28} color="var(--error)" />
          </div>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--dark)', margin: 0 }}>
            Inventory Operations Restricted
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6', margin: 0 }}>
            Cashier profiles are not authorized to create, update, or edit products in the catalog
            list.
          </p>
        </div>
      </div>
    );
  }

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 1500);
  };

  const handleAddProductSubmit = async (formData: any) => {
    try {
      await addProductMutation.mutateAsync(formData);
      triggerToast('New item added to catalog! 📦');
      setShowAddModal(false);
    } catch (err) {
      console.error('Failed to add product:', err);
      throw err;
    }
  };

  const handleAdjustSubmit = async (
    adjustType: 'in' | 'out',
    qtyNum: number,
    adjustReason: string
  ) => {
    if (!selectedProduct) return;

    adjustStockMutation.mutate(
      {
        productId: selectedProduct.id,
        quantity: qtyNum,
        type: adjustType,
        reason: adjustReason,
      },
      {
        onSuccess: () => {
          triggerToast(`Successfully logged ${adjustType.toUpperCase()} adjustment! 📈`);
          setShowAdjustModal(false);
          setSelectedProduct(null);
        },
        onError: (err) => {
          console.error('Failed to adjust inventory:', err);
        },
      }
    );
  };

  return (
    <div style={styles.container} className="fade-in">
      {/* Toast notification */}
      {toastMsg && (
        <div style={styles.toast}>
          <CheckCircle size={16} color="#ffffff" style={{ marginRight: '6px' }} />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Segmented tab navigation shown only on mobile/tablet viewports (< 1024px) */}
      <div className="stocks-tab-bar">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`stocks-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
        >
          <Package size={16} />
          <span>Product Inventory</span>
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`stocks-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
        >
          <History size={16} />
          <span>Recent Audit Log</span>
        </button>
      </div>

      <div style={styles.workspace} className="stocks-workspace">
        <div style={styles.tableSection}>
          <StocksTable
            filteredProducts={products}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            searchInputRef={searchInputRef}
            searchInputLockRef={searchInputLockRef}
            onAdjustStock={(p) => {
              setSelectedProduct(p);
              setShowAdjustModal(true);
            }}
            onAddItem={() => setShowAddModal(true)}
            activeTab={activeTab}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
          />
        </div>

        <AuditLogScroller logs={logs} activeTab={activeTab} />
      </div>

      <AdjustStockModal
        isOpen={showAdjustModal}
        product={selectedProduct}
        onClose={() => {
          setShowAdjustModal(false);
          setSelectedProduct(null);
        }}
        onSubmit={handleAdjustSubmit}
      />

      <RegisterProductModal
        isOpen={showAddModal}
        mode="create"
        product={null}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddProductSubmit}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '16px',
    gap: '16px',
    height: 'calc(100vh - 73px)',
    overflow: 'hidden',
    backgroundColor: 'var(--background)',
  },
  toast: {
    position: 'fixed',
    top: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'var(--success)',
    color: '#ffffff',
    padding: '12px 24px',
    borderRadius: '30px',
    fontWeight: 'bold',
    fontSize: '13px',
    zIndex: 99999,
    boxShadow: '0 10px 20px rgba(22, 163, 74, 0.25)',
  },
  workspace: {
    display: 'flex',
    flex: 1,
    height: '100%',
    overflow: 'hidden',
    gap: '16px',
  },
  tableSection: {
    flex: 3,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minWidth: 0,
  },
};
