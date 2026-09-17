import {
  Cashdraw,
  Cut,
  dotsPerMm,
  Feed,
  Line,
  Printer,
  PRINTER_PROFILES,
  render,
  Row,
  Table,
  Text,
  type TextRasterizer,
} from '@angadie/chittie';
import { buildReceiptModel, formatMoney, type ReceiptModelInput } from './receiptModel';

/** '58mm' (32 cols) | '80mm' (48 cols) | the 300-DPI variants. */
export type PrinterProfile = keyof typeof PRINTER_PROFILES;

export type RenderReceiptParams = ReceiptModelInput & {
  profile?: PrinterProfile;
  /** When true, prepend a cash-drawer kick so the drawer opens as the receipt prints. */
  openCashDrawer?: boolean;
  /** Drawer connector pin, as ESC/POS numbers it: 0 = pin 2, 1 = pin 5. */
  cashDrawerDevice?: number;
};

const DEFAULT_PROFILE: PrinterProfile = '80mm';

/**
 * Line-feed pitch in dots. A 203-DPI printer's own default is 30 dots (Epson's
 * ESC 3 reference) while font A is 24 dots tall, so leaving it unset spends 6
 * dots of blank paper on every line. 24 is flush — and it also matches the
 * 24-dot band a rasterized Sinhala/Tamil row prints as, so a mixed-script
 * receipt keeps every row the same physical height. Below ~22 the lines start
 * to touch. A taller line is safe: the printer feeds the character height
 * instead, which is what keeps the double-height total from being clipped.
 */
const LINE_SPACING_DOTS = 24;

/** Vertical spacing in millimetres, converted to dots per the profile's DPI. */
const SPACING_MM = {
  beforeFooter: 1,
  beforeCut: 2,
} as const;

const feedDots = (mm: number, dpi: number) => Math.round(mm * dotsPerMm(dpi));

/** Blank characters kept between a label and its amount, so they never touch. */
const GAP = 1;
/** Width of the quantity column on an item line ('12x'). */
const QUANTITY_WIDTH = 3;

/**
 * Character magnification for the business name. Double width halves the
 * characters that fit — 16 on a 58mm roll — so a long name wraps rather than
 * overruns; that is the trade for a name the customer can read at a glance.
 */
const NAME_SIZE = { width: 2, height: 2 } as const;

/** Font fallback chain handed to the rasterizer for non-Latin runs. */
const FONT_FAMILIES = ['Noto Sans Sinhala', 'Noto Sans Tamil', 'sans-serif'];

/**
 * Browser rasterizer — shapes Sinhala/Tamil/etc. via the OS fonts so non-Latin
 * receipts print correctly (a code page can't represent them, and chittie throws
 * rather than printing "?"). Only invoked for text a code page can't carry;
 * Latin/English never touches it, so Node previews and tests need no canvas.
 * Every measurement comes from chittie: it sizes `fontSize` in dots for the
 * printer's DPI, so a glyph is the same physical size on 203 and 300 DPI.
 */
export const browserRasterizer: TextRasterizer = {
  rasterize(text, { fontSize = 20, maxWidth = 576, bold = false, fontFamilies } = {}) {
    if (typeof document === 'undefined') {
      throw new Error('thermalReceipt: non-Latin text needs a browser canvas (no document here)');
    }
    const stack = (fontFamilies ?? FONT_FAMILIES).map((f) => `"${f}"`).join(',');
    const font = `${bold ? 'bold ' : ''}${fontSize}px ${stack}`;
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = font;
    const m = probe.measureText(text);
    const ascent = Math.ceil(m.actualBoundingBoxAscent || fontSize * 0.8);
    const descent = Math.ceil(m.actualBoundingBoxDescent || fontSize * 0.22);
    const w = Math.min(Math.ceil(m.width) + 4, maxWidth);
    const h = Math.min(ascent + descent + 2, fontSize);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, 2, ascent + 1);
    return ctx.getImageData(0, 0, w, h) as unknown as ImageData;
  },
};

export function buildReceiptElement(params: RenderReceiptParams) {
  const { columns, dpi } = PRINTER_PROFILES[params.profile ?? DEFAULT_PROFILE];
  const m = buildReceiptModel(params);

  return (
    <Printer width={columns}>
      {params.openCashDrawer ? <Cashdraw device={params.cashDrawerDevice ?? 0} /> : null}
      {/* The shop name is what the customer identifies the receipt by, so it is
          the one thing printed larger than body text. The address and phone drop
          to font B so the name has something to contrast against. */}
      <Text align="center" size={NAME_SIZE}>
        {m.businessName}
      </Text>
      <Text align="center" small>
        {m.businessAddress}
      </Text>
      {m.businessPhone ? (
        <Text align="center" small>
          Tel: {m.businessPhone}
        </Text>
      ) : null}

      <Row gap={GAP} left="Invoice" right={m.invoiceNumber} />
      {/* One row, not two: a date and a time are one fact about the sale. */}
      <Row gap={GAP} left="Date" right={m.time ? `${m.date} ${m.time}` : m.date} />
      {/* A paid sale is what a receipt already means. Only a void or a refund
          is worth a line — and then it needs to be impossible to miss. */}
      {m.notableStatus ? <Row gap={GAP} left="Status" right={m.notableStatus} /> : null}

      <Line />

      {/* Quantity, name and amount each get their own column, so a long product
          name wraps under the name rather than under the quantity, and never
          runs into the amount. 'auto' sizes the amount column to the widest
          amount on this receipt, so a narrow roll spends its characters on the
          product name instead of on padding. */}
      <Table
        gap={GAP}
        columns={[{ width: QUANTITY_WIDTH }, {}, { width: 'auto', align: 'right' }]}
        rows={m.items.map((it) => [`${it.quantity}x`, it.name, formatMoney(it.lineTotal)])}
      />

      <Line />

      <Row gap={GAP} left="Subtotal" right={formatMoney(m.subtotal)} />
      {m.discount ? (
        <>
          <Row gap={GAP} left={m.discount.label} right={`- ${formatMoney(m.discount.amount)}`} />
          <Row gap={GAP} left="Net Subtotal" right={formatMoney(m.discount.netSubtotal)} />
        </>
      ) : null}
      {m.tax ? <Row gap={GAP} left={m.tax.label} right={formatMoney(m.tax.amount)} /> : null}

      {/* Double height is what separates the total from the numbers above it —
          it needs no rule of its own, and a rule would only cost a line. */}
      <Row gap={GAP} height={2} left="TOTAL" right={formatMoney(m.total)} />

      <Row gap={GAP} left="Payment" right={m.paymentMethod.toUpperCase()} />
      {m.cashTendered !== null ? (
        <>
          <Row gap={GAP} left="Cash Tendered" right={formatMoney(m.cashTendered)} />
          <Row gap={GAP} left="Change Due" right={formatMoney(m.changeDue ?? 0)} />
        </>
      ) : null}
      {m.cardLabel ? <Row gap={GAP} left="Card / Bank" right={m.cardLabel} /> : null}
      {m.bankName ? <Row gap={GAP} left="Bank" right={m.bankName} /> : null}

      <Feed dots={feedDots(SPACING_MM.beforeFooter, dpi)} />

      {m.footer.map((line, i) => (
        <Text key={i} align="center" small>
          {line}
        </Text>
      ))}

      <Feed dots={feedDots(SPACING_MM.beforeCut, dpi)} />

      <Cut />
    </Printer>
  );
}

const renderOpts = (profile: PrinterProfile) => {
  const { dotWidth, dpi } = PRINTER_PROFILES[profile];
  return {
    lineSpacing: LINE_SPACING_DOTS,
    dotWidth,
    dpi,
    fontFamilies: FONT_FAMILIES,
    rasterizer: browserRasterizer,
    codepage: 'cp437' as const,
  };
};

export async function renderReceiptBytes(params: RenderReceiptParams): Promise<Uint8Array> {
  return render(buildReceiptElement(params), renderOpts(params.profile ?? DEFAULT_PROFILE));
}

/** ESC/POS bytes that just kick the cash drawer (no print), for an on-demand open. */
export async function renderCashDrawerBytes(
  device = 0,
  profile: PrinterProfile = DEFAULT_PROFILE
): Promise<Uint8Array> {
  return render(
    <Printer width={PRINTER_PROFILES[profile].columns}>
      <Cashdraw device={device} />
    </Printer>,
    renderOpts(profile)
  );
}

/** Minimal sample receipt used to verify printer alignment from settings. */
export function renderTestReceiptBytes(
  activeBusiness: ReceiptModelInput['activeBusiness'],
  profile: PrinterProfile = DEFAULT_PROFILE
): Promise<Uint8Array> {
  return renderReceiptBytes({
    order: {
      invoiceNumber: 'TEST-PRINT',
      totalAmount: 1123.2,
      paymentMethod: 'cash',
      discountValue: 0,
      taxValue: 83.2,
      taxRate: 8,
      dateStr: new Date().toLocaleString('en-GB'),
      cashierName: 'Test',
      status: 'paid',
      cashReceived: 1200,
    },
    items: [
      { name: 'Anchor Milk 1L', price: 680, quantity: 1 },
      { name: 'Marie Biscuits', price: 180, quantity: 2 },
    ],
    activeBusiness,
    changeDue: 76.8,
    profile,
  });
}
