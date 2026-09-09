'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from '../stores/cartStore';
import { useAuthStore } from '../stores/authStore';
import { useBusinessStore } from '../../src/stores/businessStore';
import { useSettingsStore } from '../stores/settingsStore';
import {
  applyScannedDestinationValue,
  defaultRestoreFieldValue,
  useRegisterScanHandler,
} from '../contexts/ScannerContext';
import { useProducts, mapDBProduct, useFindProduct } from './useProducts';
import { useCreateOrder } from './useOrders';
import { useQueryClient } from '@tanstack/react-query';
import { useCartActions } from './useCartActions';
import { getBusinessTypeConfig, getCategoryLabel } from '../utils/businessTypeConfig';

export interface DBProduct {
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
  isFavorite?: boolean;
}

export function usePosBilling() {
  const router = useRouter();
  const {
    cart,
    addCartItem: baseAddCartItem,
    updateQuantity: baseUpdateQuantity,
    clearCart: baseClearCart,
  } = useCartActions();
  const customer = useCart((s) => s.customer);
  const customCustomers = useCart((s) => s.customCustomers) || [];
  const setCustomer = useCart((s) => s.setCustomer);
  const addCustomCustomer = useCart((s) => s.addCustomCustomer);
  const queryClient = useQueryClient();
  const { findProductByCodeOrName, findProductByBarcode } = useFindProduct();

  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const employeeName = useAuthStore((s) => s.employeeName);
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const posMode = useSettingsStore((s) => s.posMode);

  // States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'catalog'>('grid');

  // Reset selected category to 'All' when business changes
  useEffect(() => {
    setSelectedCategory('All');
  }, [activeBusiness?.id]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Normal Mode scanner & table active index
  const [scanQuery, setScanQuery] = useState('');
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);

  // Customer modal
  const [showCustModal, setShowCustModal] = useState(false);
  const [custModalTab, setCustModalTab] = useState<'search' | 'create'>('search');
  const [custSearchQuery, setCustSearchQuery] = useState('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');

  // Discount state
  const [discountType, setDiscountType] = useState<'none' | 'flat' | 'percent'>('none');
  const [discountVal, setDiscountVal] = useState(0);
  const [isEditingDiscount, setIsEditingDiscount] = useState(false);
  const [tempDiscount, setTempDiscount] = useState('0');
  const [tempDiscountType, setTempDiscountType] = useState<'flat' | 'percent'>('flat');

  // Tax/VAT state
  const [taxRate, setTaxRate] = useState(0); // Default 0%
  const [isEditingTax, setIsEditingTax] = useState(false);
  const [tempTaxRate, setTempTaxRate] = useState('0');

  // Payment Tender state
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'bank'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [bankName, setBankName] = useState('');
  const [cardDigits, setCardDigits] = useState('');
  const [paying, setPaying] = useState(false);
  const [isCustomBank, setIsCustomBank] = useState(false);

  // Completed Receipt Modal state
  const [showReceipt, setShowReceipt] = useState(false);
  const [latestOrder, setLatestOrder] = useState<any>(null);

  // Focus Refs
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanInputLockRef = useRef(false);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const taxInputRef = useRef<HTMLInputElement>(null);
  const cashReceivedRef = useRef<HTMLInputElement>(null);
  const cardDigitsRef = useRef<HTMLInputElement>(null);
  const bankNameRef = useRef<HTMLInputElement>(null);
  const custSearchInputRef = useRef<HTMLInputElement>(null);
  const custNameInputRef = useRef<HTMLInputElement>(null);
  const cardBrandSelectRef = useRef<HTMLSelectElement>(null);
  const bankNameSelectRef = useRef<HTMLSelectElement>(null);
  const settleBtnRef = useRef<HTMLButtonElement>(null);

  // React Query Hook
  const {
    data: products = [],
    isLoading: loadingProducts,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useProducts(selectedCategory === 'All' ? undefined : selectedCategory, searchQuery);

  const createOrderMutation = useCreateOrder();

  // Keep selectedRowIndex bounded by cart length
  useEffect(() => {
    if (cart.length === 0) {
      setSelectedRowIndex(0);
    } else if (selectedRowIndex >= cart.length) {
      setSelectedRowIndex(cart.length - 1);
    }
  }, [cart.length, selectedRowIndex]);

  // Autofocus scan input in normal mode
  useEffect(() => {
    if (posMode === 'normal') {
      scanInputRef.current?.focus();
    }
  }, [posMode]);

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 1500);
  };

  const addCartItem = (name: string, price: number, icon?: string, sku?: string, stock?: number) =>
    baseAddCartItem(name, price, icon, sku, stock, triggerToast);

  const updateQuantity = (id: string, delta: number) => baseUpdateQuantity(id, delta, triggerToast);

  const clearCart = (restoreStock: boolean = true) => baseClearCart(restoreStock);

  // Scan or search manual submit
  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let query = scanQuery.trim();
    if (!query) return;

    let scanQty = 1;
    if (query.includes('*')) {
      const parts = query.split('*');
      const parsedQty = parseInt(parts[0]);
      if (!isNaN(parsedQty) && parsedQty > 0) {
        scanQty = parsedQty;
        query = parts.slice(1).join('*').trim();
      }
    }

    const cleanQuery = query.toLowerCase();
    let matched = products.find(
      (p) => p.barcode === query || p.quickCode === query || p.name.toLowerCase() === cleanQuery
    );

    if (!matched) {
      try {
        const matches = await findProductByCodeOrName(query);
        if (matches.length > 0) {
          matched = mapDBProduct(matches[0]);
        }
      } catch (err) {
        console.error('Barcode scan database lookup failed:', err);
      }
    }

    if (matched) {
      if (matched.stockCount <= 0) {
        triggerToast(`Out of stock: ${matched.name} ⚠️`);
        return;
      }
      for (let i = 0; i < scanQty; i++) {
        await addCartItem(
          matched.name,
          matched.price,
          matched.icon,
          matched.barcode || matched.id,
          matched.stockCount
        );
      }
      triggerToast(`Added ${scanQty}x ${matched.name} 🛒`);
      setScanQuery('');
      setSelectedRowIndex(cart.length);
    } else {
      triggerToast(`Item code "${query}" not found ⚠️`);
    }
  };

  // Hardware Scanner Hook capture
  const restorePosFieldValue = useCallback((element: Element, value: string) => {
    if (element === scanInputRef.current) {
      if (scanInputLockRef.current) return;
      setScanQuery(value);
      return;
    }
    if (element === discountInputRef.current) {
      setTempDiscount(value);
      return;
    }
    if (element === taxInputRef.current) {
      setTempTaxRate(value);
      return;
    }
    if (element === cashReceivedRef.current) {
      setCashReceived(value);
      return;
    }
    if (element === cardDigitsRef.current) {
      setCardDigits(value);
      return;
    }
    if (element === bankNameRef.current) {
      setBankName(value);
      return;
    }
    defaultRestoreFieldValue(element, value);
  }, []);

  const handleHardwareScan = async (barcode: string) => {
    applyScannedDestinationValue(scanInputRef, barcode, setScanQuery);
    let matched = products.find((p) => p.barcode === barcode || p.quickCode === barcode);

    if (!matched) {
      try {
        const matches = await findProductByBarcode(barcode);
        if (matches.length > 0) {
          matched = mapDBProduct(matches[0]);
        }
      } catch (err) {
        console.error('Hardware scan database lookup failed:', err);
      }
    }

    if (matched) {
      if (matched.stockCount <= 0) {
        triggerToast(`Out of stock: ${matched.name} ⚠️`);
        return;
      }
      await addCartItem(
        matched.name,
        matched.price,
        matched.icon,
        matched.barcode || matched.id,
        matched.stockCount
      );
      triggerToast(`Added ${matched.name} 🛒`);
      setSelectedRowIndex(cart.length);
    } else {
      triggerToast(`Barcode "${barcode}" not in catalog ⚠️`);
    }
  };

  useRegisterScanHandler(handleHardwareScan, true, {
    scanDestinationRefs: [scanInputRef],
    restoreFieldValue: restorePosFieldValue,
    scanInputLockRef,
  });

  // Categories list based on active business type
  const categories = useMemo(() => {
    const config = getBusinessTypeConfig(activeBusiness?.category);
    return ['All', ...config.categories.map((c) => getCategoryLabel(c, activeBusiness?.category))];
  }, [activeBusiness?.category]);

  // Query is already filtered at database level
  const filteredProducts = products;

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    if (discountType === 'flat') return discountVal;
    if (discountType === 'percent') return (subtotal * discountVal) / 100;
    return 0;
  }, [subtotal, discountType, discountVal]);

  const taxAmount = useMemo(() => {
    return ((subtotal - discountAmount) * taxRate) / 100;
  }, [subtotal, discountAmount, taxRate]);

  const totalAmount = useMemo(() => {
    return Math.max(0, subtotal - discountAmount + taxAmount);
  }, [subtotal, discountAmount, taxAmount]);

  const changeDue = useMemo(() => {
    const cash = parseFloat(cashReceived) || 0;
    return Math.max(0, cash - totalAmount);
  }, [cashReceived, totalAmount]);

  const handlePaymentMethodChange = (method: 'cash' | 'card' | 'bank') => {
    setPaymentMethod(method);
    setBankName('');
    setIsCustomBank(false);
    setCardDigits('');
    setTimeout(() => {
      if (method === 'cash') cashReceivedRef.current?.focus();
      else if (method === 'card') cardBrandSelectRef.current?.focus();
      else if (method === 'bank') bankNameSelectRef.current?.focus();
    }, 50);
  };

  const isPaymentValid = useMemo(() => {
    if (cart.length === 0) return false;
    if (paymentMethod === 'cash') {
      const cash = parseFloat(cashReceived);
      return !isNaN(cash) && cash >= totalAmount;
    }
    if (paymentMethod === 'card') {
      return bankName !== '' && cardDigits.length === 4 && /^\d+$/.test(cardDigits);
    }
    if (paymentMethod === 'bank') {
      return bankName.trim() !== '';
    }
    return false;
  }, [cart, paymentMethod, cashReceived, bankName, cardDigits, totalAmount]);

  const validatePayment = () => {
    if (cart.length === 0) {
      triggerToast('Cart is empty! 🛒');
      return false;
    }
    if (paymentMethod === 'cash') {
      const cash = parseFloat(cashReceived);
      if (isNaN(cash) || cash < totalAmount) {
        alert(
          `Insufficient Tender: Cash received (Rs. ${isNaN(cash) ? 0 : cash}) must be at least the total amount (Rs. ${totalAmount.toLocaleString()})`
        );
        return false;
      }
    } else if (paymentMethod === 'card') {
      if (!bankName) {
        alert('Card Brand/Bank Required: Please select a card brand or bank.');
        return false;
      }
      if (!cardDigits || cardDigits.length !== 4 || !/^\d+$/.test(cardDigits)) {
        alert('Card Number Required: Please enter the last 4 digits of the card.');
        return false;
      }
    } else if (paymentMethod === 'bank') {
      if (!bankName.trim()) {
        alert('Beneficiary Bank Name Required: Please select or type the bank name.');
        return false;
      }
    }
    return true;
  };

  // Settle Checkout & save to WatermelonDB
  const handleConfirmCheckout = async () => {
    if (!validatePayment()) return;
    setPaying(true);

    try {
      const activeBiz = useBusinessStore.getState().activeBusiness;

      const res = await createOrderMutation.mutateAsync({
        totalAmount,
        businessId: activeBiz.id,
        paymentMethod,
        bankName: paymentMethod === 'card' || paymentMethod === 'bank' ? bankName : undefined,
        cardLastFour: paymentMethod === 'card' ? cardDigits.slice(-4) : undefined,
        discountType,
        discountValue: discountAmount,
        taxRate,
        taxValue: taxAmount,
        cart: cart.map((c) => ({
          name: c.name,
          price: c.price,
          quantity: c.quantity,
        })),
      });

      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const timeStr = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const formattedDateStr = `${day}/${month}/${year} ${timeStr}`;
      const cashTendered =
        paymentMethod === 'cash' ? parseFloat(cashReceived) || totalAmount : undefined;

      setLatestOrder({
        invoiceNumber: res.invoiceNumber,
        totalAmount,
        paymentMethod,
        bankName: paymentMethod === 'card' || paymentMethod === 'bank' ? bankName : undefined,
        cardLastFour: paymentMethod === 'card' ? cardDigits.slice(-4) : undefined,
        discountType,
        subtotal,
        discountAmount,
        discountValue: discountAmount,
        taxAmount,
        taxValue: taxAmount,
        taxRate,
        customer: customer ? { ...customer } : null,
        items: [...cart],
        dateStr: formattedDateStr,
        date: formattedDateStr,
        cashierName: employeeName || 'Cashier',
        cashReceived: cashTendered,
        changeDue: changeDue,
      });

      triggerToast('Invoice completed successfully! 📑');
      setShowReceipt(true);
      clearCart(false);
    } catch (err) {
      console.error('Failed to complete sale checkout:', err);
    } finally {
      setPaying(false);
    }
  };

  const resetAllState = () => {
    clearCart();
    setCustomer(null);
    setDiscountType('none');
    setDiscountVal(0);
    setPaymentMethod('cash');
    setCashReceived('');
    setBankName('');
    setCardDigits('');
    setIsCustomBank(false);
    setSelectedRowIndex(0);
    setScanQuery('');
    if (posMode === 'normal') {
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  };

  const handleSaveDiscount = () => {
    const val = parseFloat(tempDiscount);
    if (!isNaN(val) && val >= 0) {
      if (tempDiscountType === 'percent' && val > 100) {
        triggerToast('Percentage discount cannot exceed 100% ⚠️');
        return;
      }
      setDiscountType(tempDiscountType);
      setDiscountVal(val);
      setIsEditingDiscount(false);
      triggerToast(
        `Discount set to ${tempDiscountType === 'percent' ? `${val}%` : `Rs. ${val}`} 🏷️`
      );
      if (posMode === 'normal') setTimeout(() => scanInputRef.current?.focus(), 50);
    } else {
      triggerToast('Invalid discount value ⚠️');
    }
  };

  const handleSaveTax = () => {
    const val = parseFloat(tempTaxRate);
    if (!isNaN(val) && val >= 0) {
      if (val > 100) {
        triggerToast('Tax rate cannot exceed 100% ⚠️');
        return;
      }
      setTaxRate(val);
      setIsEditingTax(false);
      triggerToast(`Tax rate set to ${val}% 📊`);
      if (posMode === 'normal') setTimeout(() => scanInputRef.current?.focus(), 50);
    } else {
      triggerToast('Invalid tax rate ⚠️');
    }
  };

  const handleCreateCustomer = async (name: string, phone: string, email: string) => {
    const newCust = { name, phone, email };
    addCustomCustomer(newCust);
    setCustomer(newCust);
    triggerToast(`Customer ${name} attached! 👤`);
  };

  // Submit checkout refs to bypass stale state closures inside useEffect hook
  const checkoutConfirmRef = useRef(handleConfirmCheckout);
  const resetAllStateRef = useRef(resetAllState);
  const handleSaveTaxRef = useRef(handleSaveTax);
  const handleSaveDiscountRef = useRef(handleSaveDiscount);
  const updateQuantityRef = useRef(updateQuantity);
  const handlePaymentMethodChangeRef = useRef(handlePaymentMethodChange);
  const triggerToastRef = useRef(triggerToast);

  useEffect(() => {
    checkoutConfirmRef.current = handleConfirmCheckout;
    resetAllStateRef.current = resetAllState;
    handleSaveTaxRef.current = handleSaveTax;
    handleSaveDiscountRef.current = handleSaveDiscount;
    updateQuantityRef.current = updateQuantity;
    handlePaymentMethodChangeRef.current = handlePaymentMethodChange;
    triggerToastRef.current = triggerToast;
  });

  const stateRef = useRef({
    cart,
    selectedRowIndex,
    showCustModal,
    showReceipt,
    discountVal,
    discountType,
    taxRate,
    paymentMethod,
    custModalTab,
    posMode,
    isEditingDiscount,
    isEditingTax,
    isCustomBank,
    bankName,
  });

  useEffect(() => {
    stateRef.current = {
      cart,
      selectedRowIndex,
      showCustModal,
      showReceipt,
      discountVal,
      discountType,
      taxRate,
      paymentMethod,
      custModalTab,
      posMode,
      isEditingDiscount,
      isEditingTax,
      isCustomBank,
      bankName,
    };
  }, [
    cart,
    selectedRowIndex,
    showCustModal,
    showReceipt,
    discountVal,
    discountType,
    taxRate,
    paymentMethod,
    custModalTab,
    posMode,
    isEditingDiscount,
    isEditingTax,
    isCustomBank,
    bankName,
  ]);

  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      const state = stateRef.current;

      if (e.key === 'Escape') {
        setShowCustModal(false);
        setShowReceipt(false);
        setIsEditingDiscount(false);
        setIsEditingTax(false);
        if (state.posMode === 'normal') {
          setTimeout(() => scanInputRef.current?.focus(), 50);
        }
        return;
      }

      if (state.showReceipt && e.key === 'Enter') {
        e.preventDefault();
        setShowReceipt(false);
        resetAllStateRef.current();
        return;
      }

      if (state.showCustModal) {
        if (e.key === 'Tab') {
          e.preventDefault();
          setCustModalTab((prev) => (prev === 'search' ? 'create' : 'search'));
        }
        return;
      }

      const activeEl = document.activeElement;
      const isTyping =
        activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

      if (state.posMode === 'normal') {
        if (e.key === 'F2' || (e.key === '/' && !isTyping)) {
          e.preventDefault();
          scanInputRef.current?.focus();
          return;
        }

        if (e.key === 'F3') {
          e.preventDefault();
          setShowCustModal(true);
          return;
        }

        if (e.key === 'F4') {
          e.preventDefault();
          const next =
            state.paymentMethod === 'cash'
              ? 'card'
              : state.paymentMethod === 'card'
                ? 'bank'
                : 'cash';
          handlePaymentMethodChangeRef.current(next);
          return;
        }

        if (e.key === 'F6') {
          e.preventDefault();
          if (!state.isEditingDiscount) {
            setTempDiscount(state.discountVal.toString());
            setTempDiscountType(state.discountType === 'none' ? 'flat' : state.discountType);
            setIsEditingDiscount(true);
            setTimeout(() => discountInputRef.current?.focus(), 50);
          } else {
            setTempDiscountType((prev) => (prev === 'flat' ? 'percent' : 'flat'));
          }
          return;
        }

        if (e.key === 'F7') {
          e.preventDefault();
          if (!state.isEditingTax) {
            setTempTaxRate(state.taxRate.toString());
            setIsEditingTax(true);
            setTimeout(() => taxInputRef.current?.focus(), 50);
          } else {
            handleSaveTaxRef.current();
          }
          return;
        }

        if (e.key === 'F8') {
          e.preventDefault();
          if (state.paymentMethod === 'cash') {
            cashReceivedRef.current?.focus();
          } else if (state.paymentMethod === 'card') {
            cardBrandSelectRef.current?.focus();
          } else if (state.paymentMethod === 'bank') {
            bankNameSelectRef.current?.focus();
          }
          return;
        }

        if (e.key === 'F9') {
          e.preventDefault();
          if (state.paymentMethod === 'card') {
            if (state.isCustomBank) {
              bankNameRef.current?.focus();
            } else {
              cardDigitsRef.current?.focus();
            }
          } else if (state.paymentMethod === 'bank' && state.isCustomBank) {
            bankNameRef.current?.focus();
          }
          return;
        }

        if (e.key === 'F10') {
          e.preventDefault();
          checkoutConfirmRef.current();
          return;
        }

        if (e.key === 'Enter') {
          if (activeEl === cashReceivedRef.current || activeEl === cardDigitsRef.current) {
            e.preventDefault();
            checkoutConfirmRef.current();
            return;
          }
          if (activeEl === bankNameRef.current) {
            e.preventDefault();
            if (state.paymentMethod === 'card') {
              cardDigitsRef.current?.focus();
            } else {
              checkoutConfirmRef.current();
            }
            return;
          }
        }

        if (
          e.key === 'F12' ||
          ((e.ctrlKey || e.metaKey) && (e.key === 'Backspace' || e.key === 'Delete'))
        ) {
          e.preventDefault();
          if (state.cart.length > 0 && confirm('Clear active invoice transaction?')) {
            resetAllStateRef.current();
            triggerToast('Transaction cleared');
          }
          return;
        }

        const isFocusOnScanner = activeEl === scanInputRef.current;
        if ((!isTyping || isFocusOnScanner) && state.cart.length > 0) {
          const item = state.cart[state.selectedRowIndex];

          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedRowIndex((prev) => Math.max(0, prev - 1));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedRowIndex((prev) => Math.min(state.cart.length - 1, prev + 1));
          } else if ((e.key === '+' || e.key === '=') && (!isTyping || isFocusOnScanner)) {
            e.preventDefault();
            if (item) {
              updateQuantityRef.current(item.id, 1);
              triggerToastRef.current(`Increased ${item.name} quantity 🛒`);
            }
          } else if (e.key === '-' && (!isTyping || isFocusOnScanner)) {
            e.preventDefault();
            if (item) {
              updateQuantityRef.current(item.id, -1);
              triggerToastRef.current(`Decreased ${item.name} quantity 🛒`);
            }
          } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isTyping) {
            e.preventDefault();
            if (item) {
              updateQuantityRef.current(item.id, -item.quantity);
              triggerToastRef.current(`Removed ${item.name} from cart`);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []);

  return {
    cart,
    customer,
    customCustomers,
    products,
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
    cardDigitsRef,
    bankNameRef,
    custSearchInputRef,
    custNameInputRef,
    cardBrandSelectRef,
    bankNameSelectRef,
    settleBtnRef,
    triggerToast,
    addCartItem,
    updateQuantity,
    setCustomer,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}
