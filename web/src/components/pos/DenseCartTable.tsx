'use client';

import React from 'react';
import { Search, ShoppingBag } from 'lucide-react';
import { ProductImage } from '../ProductImage';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  icon?: string;
  sku?: string;
  maxStock?: number;
}

interface DenseCartTableProps {
  cart: CartItem[];
  selectedRowIndex: number;
  setSelectedRowIndex: (index: number) => void;
  scanQuery: string;
  setScanQuery: (val: string) => void;
  handleScanSubmit: (e: React.FormEvent) => void;
  scanInputRef: React.RefObject<HTMLInputElement | null>;
  scanInputLockRef?: React.RefObject<boolean>;
}

export const DenseCartTable: React.FC<DenseCartTableProps> = ({
  cart,
  selectedRowIndex,
  setSelectedRowIndex,
  scanQuery,
  setScanQuery,
  handleScanSubmit,
  scanInputRef,
  scanInputLockRef,
}) => {
  return (
    <div style={styles.normalTablePanel}>
      {/* Scanner manual entry input field */}
      <form onSubmit={handleScanSubmit} style={styles.scannerBar}>
        <div style={styles.scannerInputBox}>
          <Search size={18} color="var(--muted)" />
          <input
            ref={scanInputRef}
            type="text"
            placeholder="Scan product barcode or type Quick-Code... (Press [/] or [F2])"
            value={scanQuery}
            onChange={(e) => {
              if (scanInputLockRef?.current) return;
              setScanQuery(e.target.value);
            }}
            style={styles.scannerInput}
          />
        </div>
        <button type="submit" style={styles.scannerBtn}>
          Add Item
        </button>
      </form>

      {/* Dense products grid table */}
      <div style={styles.denseTableWrapper}>
        <table style={styles.posTable}>
          <thead>
            <tr style={styles.posHeaderRow}>
              <th style={{ ...styles.posTh, width: '40px' }}>#</th>
              <th style={{ ...styles.posTh, width: '120px' }}>SKU/Code</th>
              <th style={styles.posTh}>Product Name</th>
              <th style={{ ...styles.posTh, width: '90px', textAlign: 'right' }}>Price</th>
              <th style={{ ...styles.posTh, width: '80px', textAlign: 'center' }}>Qty</th>
              <th style={{ ...styles.posTh, width: '100px', textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {cart.map((item, index) => {
              const isSelected = index === selectedRowIndex;
              return (
                <tr
                  key={item.id}
                  onClick={() => setSelectedRowIndex(index)}
                  style={{
                    ...styles.posBodyRow,
                    ...(isSelected ? styles.posRowActive : {}),
                  }}
                >
                  <td style={styles.posTd}>{index + 1}</td>
                  <td style={styles.posTd}>{item.sku?.substring(0, 10) || 'General'}</td>
                  <td style={{ ...styles.posTd, fontWeight: 'bold' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ProductImage
                        icon={item.icon}
                        size={28}
                        style={{ border: 'none', borderRadius: '4px' }}
                      />
                      <span>{item.name}</span>
                    </div>
                  </td>
                  <td style={{ ...styles.posTd, textAlign: 'right' }}>
                    Rs. {item.price.toLocaleString()}
                  </td>
                  <td style={{ ...styles.posTd, textAlign: 'center' }}>
                    <span style={styles.qtyBadge}>{item.quantity}</span>
                  </td>
                  <td style={{ ...styles.posTd, textAlign: 'right', fontWeight: 'bold' }}>
                    Rs. {(item.price * item.quantity).toLocaleString()}
                  </td>
                </tr>
              );
            })}

            {cart.length === 0 && (
              <tr>
                <td colSpan={6} style={styles.emptyTableTd}>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '40px 0',
                    }}
                  >
                    <ShoppingBag size={80} color="#cbd5e1" style={{ marginBottom: '16px' }} />
                    <h3
                      style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#475569' }}
                    >
                      Transaction Empty
                    </h3>
                    <p
                      style={{
                        margin: '6px 0 0 0',
                        fontSize: '13px',
                        color: '#64748b',
                        textAlign: 'center',
                        maxWidth: '300px',
                        lineHeight: '1.4',
                      }}
                    >
                      Scan product barcode or type a quick-code to begin checkout.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Cheat sheet keyboard guide */}
      <div style={styles.cheatSheetBar}>
        <span style={styles.cheatChip}>
          <b>[↑/↓]</b> Select row
        </span>
        <span style={styles.cheatChip}>
          <b>[+]</b> Qty+
        </span>
        <span style={styles.cheatChip}>
          <b>[-]</b> Qty-
        </span>
        <span style={styles.cheatChip}>
          <b>[Del]</b> Delete
        </span>
        <span style={styles.cheatChip}>
          <b>[F2]</b> Focus Scan
        </span>
        <span style={styles.cheatChip}>
          <b>[F3]</b> Customer
        </span>
        <span style={styles.cheatChip}>
          <b>[F4]</b> Pay Method
        </span>
        <span style={styles.cheatChip}>
          <b>[F6]</b> Discount
        </span>
        <span style={styles.cheatChip}>
          <b>[F7]</b> Tax Rate
        </span>
        <span style={styles.cheatChip}>
          <b>[F8]</b> Card Brand / Bank / Cash
        </span>
        <span style={styles.cheatChip}>
          <b>[F9]</b> Card Number
        </span>
        <span style={styles.cheatChip}>
          <b>[F10]</b> Print Invoice
        </span>
        <span style={styles.cheatChip}>
          <b>[F12 / Ctrl+⌫]</b> Clear Cart
        </span>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  normalTablePanel: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100%',
    overflow: 'hidden',
  },
  scannerBar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
    flexShrink: 0,
  },
  scannerInputBox: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#ffffff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    boxShadow: 'var(--shadow)',
  },
  scannerInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '13px',
    color: 'var(--dark)',
  },
  scannerBtn: {
    padding: '10px 20px',
    borderRadius: 'var(--radius)',
    backgroundColor: 'var(--primary)',
    color: '#ffffff',
    border: 'none',
    fontWeight: 'bold',
    fontSize: '13px',
    cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(37, 99, 235, 0.2)',
  },
  denseTableWrapper: {
    flex: 1,
    overflowY: 'auto',
    backgroundColor: '#ffffff',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow)',
    minHeight: 0,
  },
  posTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
    textAlign: 'left',
  },
  posHeaderRow: {
    borderBottom: '2px solid var(--border)',
    backgroundColor: 'var(--background)',
    position: 'sticky',
    top: 0,
    zIndex: 1,
  },
  posTh: {
    padding: '12px 16px',
    fontWeight: 'bold',
    color: 'var(--muted)',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  posBodyRow: {
    borderBottom: '1px solid #f3f4f6',
    cursor: 'pointer',
    transition: 'background-color 0.15s ease',
  },
  posRowActive: {
    backgroundColor: 'var(--light-blue) !important',
  },
  posTd: {
    padding: '12px 16px',
    verticalAlign: 'middle',
  },
  qtyBadge: {
    fontWeight: 'bold',
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: '#f1f5f9',
    border: '1px solid var(--border)',
    fontSize: '12px',
  },
  emptyTableTd: {
    padding: '64px',
    textAlign: 'center',
    color: 'var(--muted)',
  },
  cheatSheetBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  cheatChip: {
    fontSize: '10px',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    padding: '3px 8px',
    borderRadius: '4px',
    border: '1px solid var(--border)',
  },
};
