'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, UploadCloud, Loader2 } from 'lucide-react';
import { deleteUploadThingFile } from '../../services/uploadQueue';
import { useBusinessStore } from '../../stores/businessStore';
import {
  getBusinessTypeConfig,
  getCategoryEmoji,
  getCategoryLabel,
} from '../../utils/businessTypeConfig';
import {
  applyScannedDestinationValue,
  defaultRestoreFieldValue,
  useRegisterScanHandler,
} from '../../contexts/ScannerContext';
import { useFindProduct } from '../../hooks/useProducts';
import { useTranslation } from '../../hooks/useTranslation';
import { SideDrawer } from '../common/SideDrawer';

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
  isFavorite: boolean;
}

interface RegisterProductModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  product: DBProduct | null;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    price: number;
    costPrice: number;
    stockCount: number;
    lowStockAlert: number;
    unitType: string;
    category: string;
    quickCode: string;
    barcode: string;
    icon: string;
  }) => Promise<void>;
}

export const RegisterProductModal: React.FC<RegisterProductModalProps> = ({
  isOpen,
  mode,
  product,
  onClose,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const activeBusiness = useBusinessStore((s) => s.activeBusiness);
  const { checkDuplicateCodes, generateUniqueBarcode } = useFindProduct();
  const config = getBusinessTypeConfig(activeBusiness?.category);
  const CATEGORIES = config.categories;
  const UNIT_TYPES = config.unitTypes;

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stockCount, setStockCount] = useState('');
  const [lowStockAlert, setLowStockAlert] = useState('5');
  const [unitType, setUnitType] = useState(config.defaultUnitType);
  const [category, setCategory] = useState(config.defaultCategory);
  const [quickCode, setQuickCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [icon, setIcon] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputLockRef = useRef(false);

  const restoreModalFieldValue = useCallback((element: Element, value: string) => {
    defaultRestoreFieldValue(element, value);
  }, []);

  useRegisterScanHandler(
    (code) => {
      applyScannedDestinationValue(barcodeInputRef, code, setBarcode);
      barcodeInputRef.current?.focus();
    },
    isOpen,
    {
      scanDestinationRefs: [barcodeInputRef],
      restoreFieldValue: restoreModalFieldValue,
      scanInputLockRef: barcodeInputLockRef,
    }
  );

  // Sync form states with product or defaults when opened
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && product) {
        setName(product.name);
        setPrice(product.price.toString());
        setCostPrice(product.costPrice ? product.costPrice.toString() : '');
        setStockCount(product.stockCount.toString());
        setLowStockAlert(product.lowStockAlert ? product.lowStockAlert.toString() : '5');
        setUnitType(product.unitType || config.defaultUnitType);
        setCategory(product.category || config.defaultCategory);
        setQuickCode(product.quickCode || '');
        setBarcode(product.barcode || '');
        setIcon(product.icon || '');
      } else {
        setName('');
        setPrice('');
        setCostPrice('');
        setStockCount('');
        setLowStockAlert('5');
        setUnitType(config.defaultUnitType);
        setCategory(config.defaultCategory);
        setQuickCode('');
        setBarcode('');
        setIcon('');
      }
      setSubmitting(false);
      setUploadingImage(false);
    }
  }, [isOpen, mode, product, config.defaultCategory, config.defaultUnitType]);

  const readAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side file size validation (Max 4MB)
    if (file.size > 4 * 1024 * 1024) {
      alert('Image size exceeds the 4MB limit. Please choose a smaller image.');
      return;
    }

    // Convert to Base64 data URL for instant offline preview & local DB saving
    try {
      const base64 = await readAsBase64(file);
      setIcon(base64);
    } catch (err) {
      console.error('Failed to convert image to base64:', err);
      alert('Failed to process image file.');
    }
  };

  const handleRemoveImage = async () => {
    if (icon.startsWith('http')) {
      await deleteUploadThingFile(icon);
    }
    setIcon('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price || !stockCount) {
      alert('Please enter product name, selling price, and stock quantity.');
      return;
    }

    if (!quickCode && !barcode) {
      alert('Please enter at least either a Quick Code or a Barcode.');
      return;
    }

    // Uniqueness validation for barcode and quick code using custom hook
    if (barcode || quickCode) {
      try {
        const dupResult = await checkDuplicateCodes({
          barcode,
          quickCode,
          excludeProductId: mode === 'edit' && product ? product.id : undefined,
        });

        if (dupResult) {
          const { barcodeDuplicate, quickCodeDuplicate } = dupResult;
          if (barcodeDuplicate) {
            alert(
              `The barcode "${barcode}" is already in use by product "${barcodeDuplicate.name}". Barcodes must be unique!`
            );
            return;
          }
          if (quickCodeDuplicate) {
            alert(
              `The Quick Code "${quickCode}" is already in use by product "${quickCodeDuplicate.name}". Quick Codes must be unique!`
            );
            return;
          }
        }
      } catch (err) {
        console.error('Failed to validate unique barcode/quick code:', err);
      }
    }

    const priceNum = parseFloat(price);
    const costPriceNum = parseFloat(costPrice) || priceNum * 0.8;
    const stockCountNum = parseInt(stockCount) || 0;
    const lowStockAlertNum = parseInt(lowStockAlert) || 5;

    setSubmitting(true);
    try {
      // Use icon url/base64 if available, otherwise get category default emoji
      const finalIcon = icon || getCategoryEmoji(category, activeBusiness?.category);

      await onSubmit({
        name,
        price: priceNum,
        costPrice: costPriceNum,
        stockCount: stockCountNum,
        lowStockAlert: lowStockAlertNum,
        unitType,
        category,
        quickCode,
        barcode,
        icon: finalIcon,
      });
      onClose();
    } catch (err) {
      console.error('Failed to submit product:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const drawerFooter = (
    <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'flex-end' }}>
      <button type="button" onClick={onClose} style={styles.cancelBtn} disabled={submitting}>
        {t('common.cancel')}
      </button>
      <button
        type="submit"
        form="register-product-form"
        disabled={submitting || uploadingImage}
        style={styles.modalSubmitBtn}
      >
        {submitting ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Loader2 size={16} className="animate-spin" />
            <span>{t('common.loading')}</span>
          </div>
        ) : (
          <span>
            {mode === 'create' ? t('catalog.saveProductToCatalog') : t('catalog.editProduct')}
          </span>
        )}
      </button>
    </div>
  );

  return (
    <>
      <SideDrawer
        isOpen={isOpen}
        onClose={onClose}
        title={mode === 'create' ? t('catalog.addProduct') : t('catalog.editProduct')}
        subtitle={mode === 'create' ? t('catalog.addProductSub') : t('catalog.editProductSub')}
        maxWidth="600px"
        footer={drawerFooter}
      >
        <form id="register-product-form" onSubmit={handleSubmit} style={styles.modalForm}>
          <div style={styles.modalBody}>
            {/* Top Section: Name, Barcode, Quick Code on left; Image on right */}
            <div style={styles.topSection}>
              {/* Left Column (Inputs) */}
              <div style={styles.topLeftCol}>
                {/* Row 1: Product Name */}
                <div style={styles.modalInputGroup}>
                  <label style={styles.modalLabel}>{t('catalog.productName')} *</label>
                  <input
                    type="text"
                    placeholder="e.g. Anchor Milk Powder 400g"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={styles.modalInput}
                    required
                  />
                </div>

                {/* Row 2: Barcode & Quick Code */}
                <div style={styles.topSubGrid}>
                  <div style={styles.modalInputGroup}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <label style={styles.modalLabel}>{t('catalog.barcode')}</label>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const uniqueCode = await generateUniqueBarcode();
                            setBarcode(uniqueCode);
                          } catch (err) {
                            console.error(err);
                            alert('Failed to generate a unique barcode. Please try again.');
                          }
                        }}
                        style={styles.labelActionBtn}
                        title="Auto-generate standard retail EAN-13 barcode"
                      >
                        {t('catalog.autoGen')}
                      </button>
                    </div>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        placeholder="e.g. 47900101"
                        value={barcode}
                        onChange={(e) => {
                          if (barcodeInputLockRef.current) return;
                          setBarcode(e.target.value);
                        }}
                        style={styles.modalInput}
                      />
                    </div>
                  </div>

                  <div style={styles.modalInputGroup}>
                    <label style={styles.modalLabel}>{t('catalog.quickCode')}</label>
                    <input
                      type="text"
                      maxLength={5}
                      placeholder="e.g. 2016"
                      value={quickCode}
                      onChange={(e) => setQuickCode(e.target.value.slice(0, 5))}
                      style={styles.modalInput}
                    />
                  </div>
                </div>
              </div>

              {/* Right Column (Image) */}
              <div style={styles.topRightCol}>
                <label style={styles.modalLabel}>{t('catalog.productImage')}</label>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />

                {icon ? (
                  <div style={styles.compactImagePreviewContainer}>
                    {icon.startsWith('http') ||
                    icon.startsWith('data:') ||
                    icon.startsWith('blob:') ? (
                      <img src={icon} alt="Preview" style={styles.compactImagePreview} />
                    ) : (
                      <div style={styles.compactEmojiFallbackPreview}>{icon}</div>
                    )}

                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      style={styles.compactRemoveBtn}
                      title="Remove Image"
                    >
                      <X size={10} />
                    </button>

                    {uploadingImage && (
                      <div style={styles.compactUploadingOverlay}>
                        <Loader2 size={14} className="spin-anim" style={{ color: '#ffffff' }} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={() => !uploadingImage && fileInputRef.current?.click()}
                    style={styles.compactUploadPlaceholder}
                    title="Upload Product Image"
                  >
                    <UploadCloud size={20} color="var(--primary)" />
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--muted)',
                        fontWeight: '600',
                        marginTop: '4px',
                      }}
                    >
                      {t('catalog.uploadImage')}
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '2px' }}>
                      (Max 4MB)
                    </span>

                    {uploadingImage && (
                      <div style={styles.compactUploadingOverlay}>
                        <Loader2 size={14} className="spin-anim" style={{ color: '#ffffff' }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={styles.divider} />

            {/* Grid 2 Columns - Category & Unit Type dropdowns */}
            <div style={styles.gridTwo}>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>{t('catalog.category')}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={styles.select}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {getCategoryLabel(cat, activeBusiness?.category)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>{t('catalog.unitType')}</label>
                <select
                  value={unitType}
                  onChange={(e) => setUnitType(e.target.value)}
                  style={styles.select}
                >
                  {UNIT_TYPES.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Grid 2 Columns Price */}
            <div style={styles.gridTwo}>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>{t('catalog.price')} (Rs.) *</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  style={styles.modalInput}
                  required
                />
              </div>

              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>{t('catalog.costPrice')} (Rs.)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  style={styles.modalInput}
                />
              </div>
            </div>

            {/* Grid 2 Columns Stock */}
            <div style={styles.gridTwo}>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>{t('catalog.stockQuantity')} *</label>
                <input
                  type="number"
                  placeholder="e.g. 50"
                  value={stockCount}
                  onChange={(e) => setStockCount(e.target.value)}
                  style={styles.modalInput}
                  required
                />
              </div>

              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>{t('catalog.lowStockAlert')}</label>
                <input
                  type="number"
                  placeholder="e.g. 5"
                  value={lowStockAlert}
                  onChange={(e) => setLowStockAlert(e.target.value)}
                  style={styles.modalInput}
                />
              </div>
            </div>
          </div>
        </form>
      </SideDrawer>
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(4px)',
    padding: '16px',
    overflowY: 'auto',
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '90vh',
  },
  modalHeader: {
    padding: '18px 24px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  modalTitle: {
    fontSize: '16px',
    fontWeight: '700',
    color: 'var(--dark)',
    margin: 0,
  },
  modalSubtitle: {
    fontSize: '11px',
    color: 'var(--muted)',
    marginTop: '4px',
    marginRight: '20px',
    lineHeight: '1.4',
  },
  modalCloseBtn: {
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--muted)',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  modalForm: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
  },
  modalBody: {
    padding: '0',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flex: 1,
  },
  modalFooter: {
    padding: '12px 0 0 0',
    borderTop: '1px solid var(--border)',
    backgroundColor: '#ffffff',
    flexShrink: 0,
  },
  modalInputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  modalLabel: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--dark)',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap',
  },
  modalInput: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    fontSize: '13px',
    outline: 'none',
    backgroundColor: '#ffffff',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    fontSize: '13px',
    outline: 'none',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  gridTwo: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--border)',
    margin: '2px 0 6px 0',
    width: '100%',
  },
  modalSubmitBtn: {
    width: '100%',
    padding: '10px 18px',
    borderRadius: '8px',
    backgroundColor: 'var(--primary)',
    color: '#ffffff',
    border: 'none',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  topSection: {
    display: 'flex',
    gap: '14px',
    alignItems: 'flex-start',
  },
  topLeftCol: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  topRightCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flexShrink: 0,
  },
  topSubGrid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 0.8fr',
    gap: '10px',
  },
  compactUploadPlaceholder: {
    width: '104px',
    height: '104px',
    borderRadius: '8px',
    border: '1.5px dashed var(--border)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    cursor: 'pointer',
    backgroundColor: '#fafafa',
    transition: 'all 0.2s ease',
    position: 'relative',
  },
  compactImagePreviewContainer: {
    width: '104px',
    height: '104px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    position: 'relative',
    backgroundColor: '#fafafa',
  },
  compactImagePreview: {
    width: '100%',
    height: '100%',
    borderRadius: '8px',
    objectFit: 'cover',
  },
  compactEmojiFallbackPreview: {
    fontSize: '20px',
  },
  compactRemoveBtn: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    backgroundColor: 'var(--error)',
    color: '#ffffff',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
  },
  compactUploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  barcodeScanBtn: {
    position: 'absolute',
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  labelActionBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--primary)',
    fontSize: '10px',
    fontWeight: '700',
    cursor: 'pointer',
    padding: '0 4px',
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    transition: 'color 0.2s ease',
  },
  cancelBtn: {
    padding: '10px 18px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    backgroundColor: '#ffffff',
    color: 'var(--dark)',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
};
