'use client';

import React, { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Search, Plus } from 'lucide-react';
import { ProductImage } from '../ProductImage';
import { useVirtualizer } from '@tanstack/react-virtual';

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

interface StocksTableProps {
  filteredProducts: DBProduct[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onAdjustStock: (product: DBProduct) => void;
  onAddItem: () => void;
  activeTab: 'inventory' | 'audit';
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  searchInputLockRef?: React.RefObject<boolean>;
}

export const StocksTable: React.FC<StocksTableProps> = ({
  filteredProducts,
  searchQuery,
  setSearchQuery,
  onAdjustStock,
  onAddItem,
  activeTab,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  searchInputRef,
  searchInputLockRef,
}) => {
  const router = useRouter();
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredProducts.length,
    getScrollElement: () => tableWrapperRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  // Seamless Infinite Scroll Trigger
  React.useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;

    if (
      lastItem.index >= filteredProducts.length - 2 &&
      hasNextPage &&
      !isFetchingNextPage &&
      fetchNextPage
    ) {
      fetchNextPage();
    }
  }, [virtualItems, filteredProducts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize -
        (virtualItems[virtualItems.length - 1].start + virtualItems[virtualItems.length - 1].size)
      : 0;

  return (
    <div
      style={styles.tablePane}
      className={`stocks-table-pane ${activeTab === 'inventory' ? 'active-pane' : 'hidden-pane'}`}
    >
      {/* Query bar */}
      <div style={styles.queryBar} className="stocks-query-bar">
        <div style={styles.searchBox}>
          <Search size={16} color="var(--muted)" />
          <input
            type="text"
            ref={searchInputRef}
            placeholder="Search products by name, category, barcode..."
            value={searchQuery}
            onChange={(e) => {
              if (searchInputLockRef?.current) return;
              setSearchQuery(e.target.value);
            }}
            style={styles.searchInput}
          />
        </div>
        <button onClick={onAddItem} style={styles.addBtn}>
          <Plus size={14} />
          <span>Add New Item</span>
        </button>
      </div>

      {/* Table Container */}
      <div ref={tableWrapperRef} style={styles.tableWrapper} className="stocks-table-wrapper">
        <table style={styles.table}>
          <thead>
            <tr style={styles.thRow}>
              <th style={styles.th} colSpan={2}>
                Product Name
              </th>
              <th style={styles.th}>Category</th>
              <th style={styles.th}>Quick Code</th>
              <th style={styles.th}>Retail Price</th>
              <th style={styles.th}>Cost Price</th>
              <th style={styles.th}>Current Stock</th>
              <th style={styles.th}>Alert Level</th>
              <th style={{ ...styles.th, width: '100px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paddingTop > 0 && (
              <tr
                style={{ height: `${paddingTop}px`, pointerEvents: 'none' }}
                aria-hidden="true"
                tabIndex={-1}
              >
                <td
                  colSpan={9}
                  aria-hidden="true"
                  tabIndex={-1}
                  style={{ padding: 0, border: 'none', background: 'transparent' }}
                />
              </tr>
            )}

            {virtualItems.map((virtualRow) => {
              const p = filteredProducts[virtualRow.index];
              if (!p) return null;
              const isOut = p.stockCount <= 0;
              const isLow = p.lowStockAlert && p.stockCount <= p.lowStockAlert;
              return (
                <tr
                  key={p.id}
                  style={{ ...styles.tr, cursor: 'pointer' }}
                  className="stocks-table-row"
                  onMouseEnter={() => router.prefetch(`/stocks/${p.id}`)}
                  onClick={() => router.push(`/stocks/${p.id}`)}
                >
                  <td style={styles.td}>
                    <ProductImage
                      icon={p.icon}
                      size={32}
                      style={{ border: 'none', borderRadius: '6px' }}
                    />
                  </td>
                  <td style={styles.td}>
                    <div style={{ fontWeight: 'bold', color: 'var(--dark)' }}>{p.name}</div>
                    {p.barcode && (
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                        Barcode: {p.barcode}
                      </div>
                    )}
                  </td>
                  <td style={styles.td}>{p.category}</td>
                  <td style={styles.td}>{p.quickCode ? `#${p.quickCode}` : '-'}</td>
                  <td style={styles.td}>Rs. {p.price.toLocaleString()}</td>
                  <td style={styles.td}>Rs. {p.costPrice ? p.costPrice.toLocaleString() : '0'}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        ...styles.stockIndicator,
                        backgroundColor: isOut ? '#FEE2E2' : isLow ? '#FFEDD5' : '#DCFCE7',
                        color: isOut ? '#DC2626' : isLow ? '#D97706' : '#15803D',
                      }}
                    >
                      {p.stockCount} {p.unitType || 'Units'}
                    </span>
                  </td>
                  <td style={styles.td}>{p.lowStockAlert ? `${p.lowStockAlert} Units` : '-'}</td>
                  <td style={{ ...styles.td, textAlign: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdjustStock(p);
                      }}
                      style={styles.adjustRowBtn}
                    >
                      Adjust Stock
                    </button>
                  </td>
                </tr>
              );
            })}

            {paddingBottom > 0 && (
              <tr
                style={{ height: `${paddingBottom}px`, pointerEvents: 'none' }}
                aria-hidden="true"
                tabIndex={-1}
              >
                <td
                  colSpan={9}
                  aria-hidden="true"
                  tabIndex={-1}
                  style={{ padding: 0, border: 'none', background: 'transparent' }}
                />
              </tr>
            )}

            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 0 }}>
                  <div style={styles.emptyContainer}>
                    <Package size={36} color="var(--muted)" style={{ marginBottom: '8px' }} />
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '600' }}>
                      No matching products found
                    </h4>
                    <p style={{ margin: 0, fontSize: '13px' }}>
                      {searchQuery
                        ? 'No inventory items match your search query.'
                        : 'Add your first product to start tracking inventory.'}{' '}
                    </p>
                  </div>
                </td>
              </tr>
            )}

            {isFetchingNextPage && (
              <tr style={styles.loadingRow}>
                <td colSpan={9} style={styles.loadingTd}>
                  <div style={styles.tableSpinner} />
                  <span>Loading more inventory records...</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  tablePane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    gap: '16px',
  },
  queryBar: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor: '#ffffff',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
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
  tableWrapper: {
    flex: 1,
    overflowY: 'auto',
    backgroundColor: '#ffffff',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow)',
    marginBottom: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  thRow: {
    borderBottom: '1px solid var(--border)',
    backgroundColor: 'var(--background)',
    position: 'sticky',
    top: 0,
    zIndex: 2,
  },
  th: {
    padding: '10px 10px',
    textAlign: 'left',
    fontWeight: '700',
    color: '#475569',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #f3f4f6',
    transition: 'background-color 0.15s ease',
  },
  td: {
    padding: '7px 10px',
    verticalAlign: 'middle',
  },
  stockIndicator: {
    fontSize: '11px',
    fontWeight: 'bold',
    padding: '4px 10px',
    borderRadius: '20px',
  },
  adjustRowBtn: {
    padding: '5px 10px',
    borderRadius: '12px',
    border: '1px solid var(--accent-blue)',
    backgroundColor: 'var(--light-blue)',
    color: 'var(--primary)',
    fontWeight: 'bold',
    fontSize: '10px',
    cursor: 'pointer',
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '9px 16px',
    borderRadius: 'var(--radius-lg)',
    border: 'none',
    background: 'var(--primary)',
    color: '#ffffff',
    fontWeight: '700',
    fontSize: '12px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    boxShadow: 'var(--shadow)',
    transition: 'opacity 0.15s',
  },
  emptyContainer: {
    padding: '64px',
    textAlign: 'center',
    color: 'var(--muted)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  loadingRow: {
    backgroundColor: '#f8fafc',
  },
  loadingTd: {
    padding: '16px',
    textAlign: 'center',
    fontSize: '12px',
    color: 'var(--muted)',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
  },
  tableSpinner: {
    width: '14px',
    height: '14px',
    border: '2px solid var(--border)',
    borderTopColor: 'var(--primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
