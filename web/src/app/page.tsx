'use client';

import React from 'react';
import { CheckCircle } from 'lucide-react';
import { usePosBilling } from '../hooks/usePosBilling';
import './page.css';

import { DenseCartTable } from '../components/pos/DenseCartTable';
import { TabletCartScroller } from '../components/pos/TabletCartScroller';
import { TotalsSummary } from '../components/pos/TotalsSummary';
import { SettlementCard } from '../components/pos/SettlementCard';
import { CustomerModal } from '../components/pos/CustomerModal';
import { CatalogView } from '../components/pos/CatalogView';
import { ReceiptModal } from '../components/pos/ReceiptModal';
import { useThermalPrinter } from '../hooks/useThermalPrinter';
import { SettlementModal } from '../components/pos/SettlementModal';

export default function PosBillingPage() {
  const [showPaymentModal, setShowPaymentModal] = React.useState(false);
  // Single shared printer-status source (self-healing live probe) for the
  // always-on status pill and the receipt modal.
  const thermal = useThermalPrinter();
  const {
    cart,
    customer,
    customCustomers,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    viewMode,
    setViewMode,
    toastMsg,
    scanQuery,
    setScanQuery,
    selectedRowIndex,
    setSelectedRowIndex,
    showCustModal,
    setShowCustModal,
    discountType,
    discountVal,
    isEditingDiscount,
    setIsEditingDiscount,
    tempDiscount,
    setTempDiscount,
    tempDiscountType,
    setTempDiscountType,
    taxRate,
    isEditingTax,
    setIsEditingTax,
    tempTaxRate,
    setTempTaxRate,
    paymentMethod,
    cashReceived,
    setCashReceived,
    bankName,
    setBankName,
    cardDigits,
    setCardDigits,
    paying,
    isCustomBank,
    setIsCustomBank,
    showReceipt,
    setShowReceipt,
    latestOrder,
    activeBusiness,
    posMode,
    subtotal,
    discountAmount,
    taxAmount,
    totalAmount,
    changeDue,
    categories,
    filteredProducts,
    isPaymentValid,
    handleScanSubmit,
    handleConfirmCheckout,
    resetAllState,
    handleSaveDiscount,
    handleSaveTax,
    handleCreateCustomer,
    handlePaymentMethodChange,
    scanInputRef,
    scanInputLockRef,
    discountInputRef,
    taxInputRef,
    cashReceivedRef,
    cardBrandSelectRef,
    cardDigitsRef,
    bankNameSelectRef,
    bankNameRef,
    settleBtnRef,
    addCartItem,
    triggerToast,
    updateQuantity,
    setCustomer,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePosBilling();

  return (
    <div className="unified-pos-workspace fade-in">
      <div className="pos-grid-container">
        {/* Left Panel: Catalog OR Dense Scanned Cart Table */}
        <div className="pos-left-pane">
          {posMode === 'tablet' ? (
            <CatalogView
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              viewMode={viewMode}
              setViewMode={setViewMode}
              categories={categories}
              selectedCategory={selectedCategory}
              setSelectedCategory={setSelectedCategory}
              filteredProducts={filteredProducts}
              addCartItem={addCartItem}
              triggerToast={triggerToast}
              hasNextPage={hasNextPage}
              fetchNextPage={fetchNextPage}
              isFetchingNextPage={isFetchingNextPage}
            />
          ) : (
            <DenseCartTable
              cart={cart}
              selectedRowIndex={selectedRowIndex}
              setSelectedRowIndex={setSelectedRowIndex}
              scanQuery={scanQuery}
              setScanQuery={setScanQuery}
              handleScanSubmit={handleScanSubmit}
              scanInputRef={scanInputRef}
              scanInputLockRef={scanInputLockRef}
            />
          )}
        </div>

        {/* Right Panel: Persistent Invoice summaries & payment settlement details */}
        <div className="pos-right-pane">
          <div className="pane-title-bar">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 className="pane-title">Checkout Summary</h3>
                <span
                  onClick={() => thermal.refresh()}
                  title={
                    thermal.canPrint
                      ? thermal.activeTransport === 'bridge'
                        ? 'Printing via the local print agent. Click to re-check.'
                        : 'Direct thermal printer connected. Click to re-check.'
                      : 'No direct printer detected — receipts use the system print dialog. Click to re-check (e.g. after plugging in the printer or starting the agent).'
                  }
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    backgroundColor: thermal.canPrint ? '#dcfce7' : '#fef3c7',
                    color: thermal.canPrint ? '#15803d' : '#b45309',
                  }}
                >
                  {thermal.canPrint
                    ? thermal.activeTransport === 'bridge'
                      ? '🖨 Agent ready'
                      : '🖨 Printer ready'
                    : '🖨 System print'}
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Clear entire cart invoice?')) {
                      resetAllState();
                      triggerToast('Cart cleared');
                    }
                  }}
                  className="clear-btn"
                >
                  Clear Cart
                </button>
              )}
            </div>
          </div>

          <div className="right-body-container">
            <div className="right-body-scrollable">
              {posMode === 'tablet' && (
                <TabletCartScroller cart={cart} updateQuantity={updateQuantity} />
              )}

              {/* Customer Lookup Profile */}
              <div style={{ marginBottom: '12px', marginTop: posMode === 'tablet' ? 'auto' : 0 }}>
                {customer ? (
                  <div className="customer-status-card">
                    <div>
                      <h4 style={{ margin: 0, fontSize: '13px' }}>{customer.name}</h4>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        {customer.phone}
                      </span>
                    </div>
                    <button onClick={() => setCustomer(null)} className="remove-customer-btn">
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCustModal(true)}
                    className="attach-cust-btn-compact"
                  >
                    <span>Attach Customer {posMode === 'normal' ? '[F3]' : ''}</span>
                  </button>
                )}
              </div>

              <TotalsSummary
                subtotal={subtotal}
                discountAmount={discountAmount}
                discountVal={discountVal}
                discountType={discountType}
                taxAmount={taxAmount}
                taxRate={taxRate}
                totalAmount={totalAmount}
                isEditingDiscount={isEditingDiscount}
                setIsEditingDiscount={setIsEditingDiscount}
                isEditingTax={isEditingTax}
                setIsEditingTax={setIsEditingTax}
                tempDiscount={tempDiscount}
                setTempDiscount={setTempDiscount}
                tempDiscountType={tempDiscountType}
                setTempDiscountType={setTempDiscountType}
                tempTaxRate={tempTaxRate}
                setTempTaxRate={setTempTaxRate}
                handleSaveDiscount={handleSaveDiscount}
                handleSaveTax={handleSaveTax}
                discountInputRef={discountInputRef}
                taxInputRef={taxInputRef}
                posMode={posMode}
              />
            </div>

            <div className="right-body-fixed-footer">
              {posMode === 'tablet' ? (
                <button
                  disabled={cart.length === 0}
                  onClick={() => setShowPaymentModal(true)}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '8px',
                    backgroundColor: cart.length === 0 ? '#cbd5e1' : 'var(--primary)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: cart.length === 0 ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.25)',
                    transition: 'all 0.2s',
                  }}
                  className="proceed-settlement-btn"
                >
                  Proceed to Payment (Rs. {totalAmount.toLocaleString()})
                </button>
              ) : (
                <SettlementCard
                  paymentMethod={paymentMethod}
                  handlePaymentMethodChange={handlePaymentMethodChange}
                  cashReceived={cashReceived}
                  setCashReceived={setCashReceived}
                  totalAmount={totalAmount}
                  changeDue={changeDue}
                  isCustomBank={isCustomBank}
                  setIsCustomBank={setIsCustomBank}
                  bankName={bankName}
                  setBankName={setBankName}
                  cardDigits={cardDigits}
                  setCardDigits={setCardDigits}
                  paying={paying}
                  cartLength={cart.length}
                  isPaymentValid={isPaymentValid}
                  handleConfirmCheckout={handleConfirmCheckout}
                  posMode={posMode}
                  cashReceivedRef={cashReceivedRef}
                  cardBrandSelectRef={cardBrandSelectRef}
                  cardDigitsRef={cardDigitsRef}
                  bankNameSelectRef={bankNameSelectRef}
                  bankNameRef={bankNameRef}
                  settleBtnRef={settleBtnRef}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <CustomerModal
        isOpen={showCustModal}
        onClose={() => setShowCustModal(false)}
        customers={customCustomers}
        onAttachCustomer={setCustomer}
        onRegisterCustomer={handleCreateCustomer}
        posMode={posMode}
        scanInputRef={scanInputRef}
      />

      <SettlementModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        paymentMethod={paymentMethod}
        handlePaymentMethodChange={handlePaymentMethodChange}
        cashReceived={cashReceived}
        setCashReceived={setCashReceived}
        totalAmount={totalAmount}
        changeDue={changeDue}
        isCustomBank={isCustomBank}
        setIsCustomBank={setIsCustomBank}
        bankName={bankName}
        setBankName={setBankName}
        cardDigits={cardDigits}
        setCardDigits={setCardDigits}
        paying={paying}
        cartLength={cart.length}
        isPaymentValid={isPaymentValid}
        handleConfirmCheckout={handleConfirmCheckout}
        posMode={posMode}
        cashReceivedRef={cashReceivedRef}
        cardBrandSelectRef={cardBrandSelectRef}
        cardDigitsRef={cardDigitsRef}
        bankNameSelectRef={bankNameSelectRef}
        bankNameRef={bankNameRef}
        settleBtnRef={settleBtnRef}
      />

      <ReceiptModal
        isOpen={showReceipt}
        order={latestOrder}
        items={latestOrder?.items || []}
        activeBusiness={activeBusiness}
        changeDue={latestOrder?.changeDue || 0}
        posMode={posMode}
        thermal={thermal}
        onClose={() => {
          setShowReceipt(false);
          resetAllState();
        }}
      />

      {toastMsg && (
        <div className="toast-popup">
          <CheckCircle size={16} />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
