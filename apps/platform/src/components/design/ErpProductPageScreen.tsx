'use client';
/**
 * ErpProductPageScreen — EXACT 1:1 implementation of
 * upload/erp product page.html ("Product Details — Classic Unisex
 * Heavyweight Tee").
 *
 * Structure, classes, fonts, colors, copy and interactions are the
 * design, verbatim. Data lives in src/data/erpCatalogData.ts.
 * Interactions per the design's <script>: tabs, print-area selection,
 * live profit calculation, toast.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBlank, type BlankDetail } from '@/lib/podApi';
import { useDesignCanvas } from '@/lib/designCanvasStore';
import {
  PRODUCT,
  PRODUCT_DETAILS,
  PRODUCT_FULFILLMENT,
  PRODUCT_MAIN_IMAGE,
  PRODUCT_MOCKUPS,
  PRODUCT_REVIEWS,
  PRODUCT_SUPPLIER_COSTS,
  PRODUCT_THUMBS,
  PRODUCT_VARIANTS,
} from '@/data/erpCatalogData';
import type { DomainKey } from '@/data/shellData';

type Tab = 'details' | 'variants' | 'pricing' | 'fulfillment' | 'mockups' | 'reviews';

const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'Product Details' },
  { id: 'variants', label: 'Variants & Inventory' },
  { id: 'pricing', label: 'Supplier Costs' },
  { id: 'fulfillment', label: 'Fulfillment Routing' },
  { id: 'mockups', label: 'Mockups' },
  { id: 'reviews', label: 'Reviews' },
];

/* The page's own <style> block, verbatim — scoped under .erp-pp so
   sibling pages don't fight; values unchanged. The button-standard
   rules restore the design's exact values (font-semibold, rounded,
   px-4) where the app-wide button standard would override them. */
const CSS = `
.erp-pp .hidden-imp{display:none!important}
.erp-pp .tab-underline{border-bottom:2px solid transparent}
.erp-pp .tab-underline.active{border-bottom-color:#0a6400;color:#0a6400;font-weight:600}
.erp-pp .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1c1e;color:#fff;padding:10px 16px;border-radius:8px;font:500 13px Inter;z-index:500;opacity:0;transition:opacity .2s;pointer-events:none;max-width:90vw}
.erp-pp .toast.show{opacity:1}
.erp-pp .icon-btn{width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;color:#5a6355;cursor:pointer;border:1px solid transparent;}
.erp-pp .icon-btn:hover{background:#f4f3f7;color:#1a1c1e;border-color:#dad9dd;}

/* Product Specific CSS */
.erp-pp .color-swatch { width: 24px; height: 24px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; position: relative; }
.erp-pp .color-swatch.active { border-color: #0a6400; }
.erp-pp .color-swatch.active::after { content: ''; position: absolute; inset: 2px; border-radius: 50%; border: 2px solid #fff; }
.erp-pp .mockup-card { border: 1px solid #dad9dd; border-radius: 8px; overflow: hidden; transition: box-shadow 0.2s; }
.erp-pp .mockup-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.erp-pp .rating-bar { height: 8px; background: #eeedf1; border-radius: 4px; overflow: hidden; }
.erp-pp .rating-bar-fill { height: 100%; background: #f59e0b; }

/* Supplier Comparison Specific */
.erp-pp .supplier-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.erp-pp .supplier-printify { background: #e0f2fe; color: #0369a1; }
.erp-pp .supplier-printful { background: #f3e8ff; color: #6b21a8; }
.erp-pp .supplier-other { background: #e7f0ec; color: #33503f; }

/* Design Area Preview */
.erp-pp .print-area-box { border: 1px dashed #becab6; background: #faf9fc; border-radius: 6px; padding: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80px; cursor: pointer; transition: all 0.2s; }
.erp-pp .print-area-box:hover { border-color: #0a6400; background: #f0fdf4; }
.erp-pp .print-area-box.active { border: 2px solid #0a6400; background: #f0fdf4; }

/* Table links (design's action-link) */
.erp-pp .action-link { color: #0a6400; font-weight: 600; font-size: 12px; cursor: pointer; }
.erp-pp .action-link:hover { text-decoration: underline; }

/* Restore the design's exact button values where the app-wide button
   standard would override them (semibold, 4px radius, px-4). */
.erp-pp button.h-8 { font-weight: 600 !important; gap: 4px !important; }
.erp-pp button.h-8.rounded { border-radius: 4px !important; }
.erp-pp button.h-8.px-4 { padding: 0 16px !important; }
.erp-pp select.h-8 { padding: 0 8px !important; border-radius: 4px !important; font-weight: 400 !important; gap: normal !important; }
.erp-pp select.h-9 { padding: 0 12px !important; border-radius: 4px !important; font-weight: 400 !important; }
/* The pricing table is the tall one (py-4 rows, centered Routing column). */
.erp-pp table.data-table.border th, .erp-pp table.data-table.border td { padding-top: 16px !important; padding-bottom: 16px !important; }
.erp-pp table.data-table thead th { background-color: #ffffff !important; }
.erp-pp table.data-table.border thead th { background-color: #f4f3f7 !important; }
.erp-pp table.data-table thead th.text-center { text-align: center !important; }
/* The Size Guide table is the design's own plain table — title case,
   centered, 13px, py-3 — not the platform's uppercase list standard. */
.erp-pp table.w-full thead th {
  text-transform: none !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  letter-spacing: normal !important;
  text-align: center !important;
  color: #5a6355 !important;
  background-color: #f4f3f7 !important;
  padding-top: 12px !important;
  padding-bottom: 12px !important;
}
.erp-pp table.w-full tbody td {
  padding-top: 12px !important;
  padding-bottom: 12px !important;
  border-bottom-color: #dad9dd !important;
}
.erp-pp table.w-full tbody tr:last-child td {
  border-bottom: none !important;
}
`;

interface ErpProductPageScreenProps {
  onToast: (message: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}

export default function ErpProductPageScreen({
  onToast,
  onNavigate,
}: ErpProductPageScreenProps) {
  const [tab, setTab] = useState<Tab>('details');
  const [printAreaIdx, setPrintAreaIdx] = useState(0);
  const [retail, setRetail] = useState(PRODUCT.summary.retailPrice);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── LIVE PRODUCT DATA ──
  // The catalog's View button sets the product in the store
  // (openProductPage) — carrying the CARD's live fields (image, price,
  // SKU, supplier) so this page renders the real product the instant
  // View is clicked. GET /api/v1/blanks/:id then enriches: full costs,
  // variants, offers, delivery. The design data below stays as the
  // fallback ONLY when the page is opened directly with no product set.
  const productPage = useDesignCanvas((s) => s.productPage);
  const openStudio = useDesignCanvas((s) => s.openStudio);
  const [detail, setDetail] = useState<BlankDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailNonce, setDetailNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!productPage?.id) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }
    setDetailLoading(true);
    setDetailError(null);
    getBlank(productPage.id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null);
          setDetailError('Full details are unavailable right now.');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productPage?.id, detailNonce]);

  // Seed the retail input from the REAL price the moment the product is
  // set (card price now) — the tee's $24.99 never lands on a backpack.
  // Re-seeds only on product change; user edits in between stick.
  useEffect(() => {
    if (!productPage) {
      setRetail(PRODUCT.summary.retailPrice);
      return;
    }
    const p = productPage.price;
    if (p != null && p > 0) setRetail((p * 1.5).toFixed(2));
  }, [productPage?.id, productPage?.price]);

  const money = (n: number | null) =>
    n == null
      ? '—'
      : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // A real product is set — the tee mock must NEVER bleed through.
  const live = Boolean(productPage);
  const title = detail?.name ?? productPage?.name ?? PRODUCT.title;
  const subtitle = detail
    ? `${detail.brand} • ${detail.supplierCount && detail.supplierCount > 1 ? `Multi-Supplier Product (${detail.supplierCount} offers)` : detail.supplier}`
    : productPage
      ? `${productPage.brand} • ${
          productPage.supplierCount && productPage.supplierCount > 1
            ? `Multi-Supplier Product (${productPage.supplierCount} offers)`
            : productPage.supplier ?? '—'
        }`
      : PRODUCT.subtitle;
  const tags = detail
    ? [detail.brand, ...(detail.techniques ?? []).slice(0, 2).map((t) => t.label), 'POD'].filter(Boolean)
    : productPage
      ? [productPage.brand, productPage.supplier, 'POD'].filter(Boolean)
      : PRODUCT.tags;
  const description = detail?.description || (live ? '' : PRODUCT.description);

  // Gallery — real supplier images per color (Printful images endpoint),
  // else the card thumbnail (instant, from the catalog card), else the
  // design's photos (only when no real product is set).
  const cardImg = productPage?.img;
  const galleryImages = useMemo(() => {
    const urls: string[] = [];
    for (const g of detail?.gallery ?? []) {
      for (const img of g.images) {
        if (img.url && !urls.includes(img.url)) urls.push(img.url);
      }
    }
    if (urls.length === 0 && detail?.mockupThumbUrl) urls.push(detail.mockupThumbUrl);
    if (urls.length === 0 && cardImg) urls.push(cardImg);
    return urls;
  }, [detail, cardImg]);
  const mainImage = galleryImages[0] ?? productPage?.img ?? PRODUCT_MAIN_IMAGE;
  const thumbAt = (i: number) =>
    galleryImages[i] ??
    galleryImages[0] ??
    productPage?.img ??
    (live ? undefined : PRODUCT_THUMBS[i]) ??
    PRODUCT_MAIN_IMAGE;

  // Print areas — real placements + physical sizes at 300 DPI; the
  // card's eligibility string covers the instant-render window.
  const printAreaList =
    detail && (detail.printAreas?.length > 0 || (detail.variants?.printAreas?.length ?? 0) > 0)
      ? detail.printAreas.length > 0
        ? detail.printAreas.map((p) => ({
            label: p.placement,
            size: `${Math.round(p.widthPx / 300)}" × ${Math.round(p.heightPx / 300)}"`,
          }))
        : detail.variants.printAreas.map((p) => ({ label: p, size: '' }))
      : productPage?.eligibility
        ? productPage.eligibility
            .split(' / ')
            .filter(Boolean)
            .map((p) => ({
              label: p.replace(/_(dtf|dtg|embroidery|sublimation|screen_print|screenprint|vinyl|cut_sew)$/i, ''),
              size: '',
            }))
        : PRODUCT.printAreas;

  const cardBadge =
    productPage?.supplierSlug === 'printful'
      ? 'printful'
      : productPage?.supplierSlug === 'printify'
        ? 'printify'
        : 'other';

  // Cross-supplier offers — the real comparison rows; the card's own
  // supplier + price covers the instant-render window.
  const offers =
    detail?.offers && detail.offers.length > 0
      ? detail.offers.map((o) => ({
          badge:
            o.supplierSlug === 'printful' ? 'printful' : o.supplierSlug === 'printify' ? 'printify' : 'other',
          badgeLabel: o.supplier,
          label: o.name || o.supplier,
          price: o.cost != null ? money(o.cost) : '—',
        }))
      : productPage
        ? [
            {
              badge: cardBadge,
              badgeLabel: productPage.supplier ?? 'Supplier',
              label: productPage.brand || productPage.supplier || 'Supplier',
              price: productPage.price != null ? money(productPage.price) : '—',
            },
          ]
        : PRODUCT.offers;

  const summary = {
    baseCost: detail
      ? money(detail.baseCost)
      : productPage
        ? productPage.price != null
          ? money(productPage.price)
          : '—'
        : PRODUCT.summary.baseCost,
    selectedVariant:
      detail?.variants?.colors?.[0] && detail?.variants?.sizes?.[0]
        ? `${detail.variants.colors[0].name} / ${detail.variants.sizes[0]}`
        : detail?.variants?.colors?.[0]?.name ??
          (productPage
            ? productPage.variantCount
              ? `${productPage.variantCount} variants`
              : '—'
            : PRODUCT.summary.selectedVariant),
    printArea:
      detail?.variants?.printAreas?.[0] ??
      (productPage ? (productPage.eligibility?.split(' / ')[0] ?? '—') : PRODUCT.summary.printArea),
    activeSupplier: detail?.supplier ?? productPage?.supplier ?? PRODUCT.summary.activeSupplier,
  };

  // Fulfillment network — real computable facts from the offers/printers.
  const fulfillmentNetwork = (() => {
    if (detail) {
      const of = detail.offers ?? [];
      const cheapest = of.find((o) => o.cost != null);
      const fastest = [...of].sort(
        (a, b) => (a.estimatedDeliveryDays ?? 99) - (b.estimatedDeliveryDays ?? 99),
      )[0];
      return [
        {
          label: 'Best quality',
          value: detail.providerTitle ?? detail.printers?.[0]?.name ?? '—',
        },
        {
          label: 'Lowest price',
          value: cheapest ? `${cheapest.supplier} (${money(cheapest.cost)})` : '—',
        },
        {
          label: 'Most shipping options',
          value: detail.shippingFrom ? `Ships from ${detail.shippingFrom}` : `${detail.printers?.length ?? 0} printers`,
        },
        {
          label: 'Fastest delivery',
          value:
            fastest?.estimatedDeliveryDays != null
              ? `${fastest.supplier} (${fastest.estimatedDeliveryDays} days)`
              : detail.deliveryEstimate || '—',
        },
      ];
    }
    if (productPage) {
      return [
        { label: 'Best quality', value: productPage.supplier ?? '—' },
        {
          label: 'Lowest price',
          value:
            productPage.price != null
              ? `${productPage.supplier ?? ''} (${money(productPage.price)})`.trim()
              : '—',
        },
        { label: 'Most shipping options', value: detailLoading ? 'Loading…' : '—' },
        { label: 'Fastest delivery', value: detailLoading ? 'Loading…' : '—' },
      ];
    }
    return PRODUCT.fulfillmentNetwork;
  })();

  // Details tab — real description + techniques when present; honest
  // card facts during the load window (never the tee copy).
  const aboutBullets = detail
    ? [
        `Brand: ${detail.brand}`,
        ...(detail.techniques ?? []).slice(0, 3).map((t) => `Print technique: ${t.label}${t.isDefault ? ' (default)' : ''}`),
        detail.providerTitle ? `Print provider: ${detail.providerTitle}` : `Fulfilled by ${detail.supplier}`,
      ].filter(Boolean)
    : productPage
      ? [
          `Brand: ${productPage.brand}`,
          `Fulfilled by ${productPage.supplier ?? 'the supplier'}`,
          productPage.variantCount ? `${productPage.variantCount} variants available` : '',
          productPage.eligibility ? `Print areas: ${productPage.eligibility}` : '',
          productPage.sku ? `SKU: ${productPage.sku}` : '',
        ].filter(Boolean)
      : PRODUCT_DETAILS.aboutBullets;
  const aboutParagraph =
    detail?.description ||
    (productPage
      ? detailLoading
        ? 'Loading the supplier’s product description…'
        : 'No description on file from this supplier yet.'
      : PRODUCT_DETAILS.aboutParagraph);

  // Variants tab — real colors + sizes (empty + honest labels while
  // the detail loads; mock colors only for a direct no-product visit).
  const colors =
    detail?.variants?.colors?.length
      ? detail.variants.colors.map((c) => ({
          name: c.name,
          hex: c.hex || '#cccccc',
          bordered: (c.hex || '').toLowerCase() === '#ffffff',
        }))
      : live
        ? []
        : PRODUCT_VARIANTS.colors;
  const sizes = detail?.variants?.sizes?.length ? detail.variants.sizes : null;
  const variantRows = detail
    ? (sizes ?? ['One size']).slice(0, 8).map((s, i) => {
        const c = colors[i % Math.max(colors.length, 1)];
        return {
          color: c?.hex ?? '#cccccc',
          bordered: (c?.hex ?? '').toLowerCase() === '#ffffff',
          variant: `${c?.name ?? 'Default'} / ${s}`,
          sku: `${(detail.sku ?? detail.canonicalProductId ?? 'UNKNOWN').slice(0, 6).toUpperCase()}-${s}`,
          supplier: detail.supplier,
          supplierBadge:
            detail.supplierSlug === 'printful' ? ('printful' as const) : ('printify' as const),
          cost: detail.baseCost != null ? money(detail.baseCost) : '—',
          retail: `$${retail}`,
        };
      })
    : live
      ? []
      : PRODUCT_VARIANTS.rows;
  const activeVariantsLabel = detail
    ? `Showing ${variantRows.length} of ${detail.variantCount ?? variantRows.length} active variants`
    : productPage
      ? detailLoading
        ? 'Loading variants…'
        : 'Variant details unavailable'
      : PRODUCT_VARIANTS.activeVariantsLabel;
  const colorsLabel = detail
    ? `Colors (${colors.length} active)`
    : productPage
      ? detailLoading
        ? 'Colors (loading…)'
        : 'Colors unavailable'
      : PRODUCT_VARIANTS.colorsLabel;

  // Supplier costs tab — real offers; the card's own supplier + price
  // covers the instant-render window.
  const supplierCostRows =
    detail?.offers && detail.offers.length > 0
      ? detail.offers.map((o, i) => ({
          badge:
            o.supplierSlug === 'printful'
              ? ('printful' as const)
              : ('printify' as const),
          badgeLabel: o.supplier,
          label: o.name || o.supplier,
          statusIcon: i === 0 ? 'verified' : 'check_circle',
          statusText: i === 0 ? 'Best price' : 'Connected',
          statusPrimary: i === 0,
          baseCost: o.cost != null ? money(o.cost) : '—',
          shipping: o.shipping != null ? money(o.shipping) : '—',
          production: o.estimatedDeliveryDays != null ? `${o.estimatedDeliveryDays} Days` : '—',
          routing: [i === 0 ? 'Primary' : 'Backup', i === 0 ? 'Backup' : 'Primary'],
          shaded: i % 2 === 1,
        }))
      : productPage
        ? [
            {
              badge: cardBadge as 'printful' | 'printify' | 'other',
              badgeLabel: productPage.supplier ?? 'Supplier',
              label: productPage.brand || productPage.supplier || 'Supplier',
              statusIcon: 'check_circle',
              statusText: detailLoading ? 'Loading…' : 'Connected',
              statusPrimary: true,
              baseCost: productPage.price != null ? money(productPage.price) : '—',
              shipping: '—',
              production: '—',
              routing: ['Primary'],
              shaded: false,
            },
          ]
        : PRODUCT_SUPPLIER_COSTS.rows;

  // Fulfillment tab — real printers (empty + the page-wide loading
  // banner while the detail loads; mock providers only for a direct
  // no-product visit).
  const providers =
    detail?.printers && detail.printers.length > 0
      ? detail.printers.map((p, i) => ({
          initials: p.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
          name: p.name,
          note: `${i === 0 ? 'Primary Routing' : 'Backup Routing'}${
            p.estimatedDelivery ? ` • ${p.estimatedDelivery.average} ${p.estimatedDelivery.unit.replace('_', ' ')} avg production` : ''
          }`,
          production: p.estimatedDelivery ? `${p.estimatedDelivery.average} days` : '—',
          locations: '—',
          dimmed: i !== 0,
        }))
      : live
        ? []
        : PRODUCT_FULFILLMENT.providers;

  // Mockups tab — the real gallery images (the card photo covers the
  // instant-render window; mock cards only for a direct no-product visit).
  const mockupCards =
    galleryImages.length > 0
      ? galleryImages.slice(0, 8).map((url, i) => ({
          tag: (detail?.supplier ?? productPage?.supplier ?? 'SUPPLIER').toUpperCase(),
          imageUrl: url,
          title: `${title} — view ${i + 1}`,
          subtitle: detail?.brand ?? productPage?.brand ?? '',
        }))
      : live
        ? []
        : PRODUCT_MOCKUPS.cards;

  /** Design Now — the real wiring: open the studio with THIS blank
   *  loaded onto the canvas. Navigate FIRST (the canvas shows its
   *  loading state), then load the blank in the background — the click
   *  is never blocked on a multi-second detail fetch. */
  function handleDesignNow() {
    toast('Opening Design Studio...');
    onNavigate('design', 'new-design');
    if (productPage?.id) {
      void openStudio({ entry: 'catalog', blankIds: [productPage.id] });
    }
  }

  /* The design is a full-viewport app page (h-screen): sticky action bar,
     internally scrolling content. Inside the shell the available height is
     the viewport minus the chrome above this screen — measured live so the
     page always fills exactly the visible area. */
  const rootRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      if (rootRef.current) {
        setHeight(window.innerHeight - rootRef.current.getBoundingClientRect().top);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /** The design's toast(): show for 2s. */
  const toast = useCallback((m: string) => {
    setToastMessage(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(''), 2000);
  }, []);

  /* Dynamic Pricing Logic — verbatim from the design's script, on the
     LIVE base cost when a real product is loaded. */
  const baseCost = detail?.baseCost ?? productPage?.price ?? PRODUCT.baseCostNumber;
  const retailNum = parseFloat(retail);
  let profitText = '$0.00';
  let profitError = false;
  if (!isNaN(retailNum) && retailNum >= baseCost) {
    profitText = `$${(retailNum - baseCost).toFixed(2)}`;
  } else if (retailNum < baseCost) {
    profitText = `-$${(baseCost - retailNum).toFixed(2)}`;
    profitError = true;
  }

  return (
    <div
      ref={rootRef}
      className="erp-pp flex flex-col bg-background font-sans text-body-md text-on-surface antialiased overflow-hidden"
      style={height ? { height } : { minHeight: 'calc(100vh - 124px)' }}
    >
      <style>{CSS}</style>

      <div className="flex flex-col h-full w-full">
        {/* Top Action Bar (Sticky Header) */}
        <header className="h-14 px-6 flex items-center justify-between bg-white border-b border-surface-dim shrink-0 z-10">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex items-center gap-1 text-primary font-semibold text-[13px] hover:underline"
              onClick={() => onNavigate('design', 'product-catalog')}
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back_ios</span>Products
            </button>
            <div className="h-4 w-px bg-surface-dim"></div>
            <span className="text-[13px] text-on-surface-variant font-medium">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* PERSISTENT ACTIONS */}
            <button
              type="button"
              className="h-8 px-3 border border-surface-dim rounded bg-white text-[13px] font-semibold hover:bg-surface-container flex items-center gap-1"
              onClick={() => toast('Downloading print file...')}
            >
              <span className="material-symbols-outlined text-[16px]">download</span>Download
            </button>
            <button
              type="button"
              className="h-8 px-3 border border-surface-dim rounded bg-white text-[13px] font-semibold hover:bg-surface-container flex items-center gap-1"
              onClick={() => toast('Opening print view...')}
            >
              <span className="material-symbols-outlined text-[16px]">print</span>Print
            </button>
            <button
              type="button"
              className="h-8 px-3 border border-surface-dim rounded bg-white text-[13px] font-semibold hover:bg-surface-container flex items-center gap-1"
              onClick={() => toast('Opening product editor...')}
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>Edit
            </button>
            <div className="w-px h-4 bg-surface-dim mx-1"></div>
            <button
              type="button"
              className="h-8 px-4 rounded text-[13px] font-semibold bg-[#1e6dc9] text-white hover:bg-[#0055a5] flex items-center gap-1"
              onClick={() => void handleDesignNow()}
            >
              <span className="material-symbols-outlined text-[18px]">palette</span>Design Now
            </button>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1500px] mx-auto p-6">
            {/* Detail enrichment status — honest, page-wide. The card data
                above renders instantly; this says what's still coming. */}
            {live && detailLoading && (
              <div className="flex items-center gap-2 text-[12px] text-on-surface-variant bg-surface-container-lowest border border-surface-dim rounded-lg px-3 py-2 mb-4">
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                Loading full details from {productPage?.supplier ?? 'the supplier'}…
              </div>
            )}
            {live && detailError && (
              <div className="flex items-center justify-between gap-3 text-[12px] text-error bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                <span>{detailError} The card data above is live.</span>
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => setDetailNonce((n) => n + 1)}
                >
                  Retry
                </button>
              </div>
            )}
            {/* MAIN LAYOUT: Left Gallery, Center Info, Right Summary Box */}
            <div className="flex gap-6 mb-6">
              {/* Column 1: Gallery & Previous Designs */}
              <div className="w-[340px] shrink-0 space-y-4">
                {/* Main Image */}
                <div className="w-full h-[340px] bg-surface-container-low rounded-xl border border-surface-dim flex items-center justify-center overflow-hidden">
                  <img src={mainImage} alt="Product" className="object-cover w-full h-full" />
                </div>

                {/* Thumbnails */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="aspect-square bg-surface-container-low rounded-lg border-2 border-primary overflow-hidden cursor-pointer">
                    <img src={thumbAt(0)} alt="" className="object-cover w-full h-full" />
                  </div>
                  <div className="aspect-square bg-surface-container-low rounded-lg border border-surface-dim overflow-hidden cursor-pointer hover:border-outline">
                    <img src={thumbAt(1)} alt="" className="object-cover w-full h-full" />
                  </div>
                  <div className="aspect-square bg-surface-container-low rounded-lg border border-surface-dim overflow-hidden cursor-pointer hover:border-outline">
                    <img src={thumbAt(2)} alt="" className="object-cover w-full h-full" />
                  </div>
                  <div className="aspect-square bg-surface-container-low rounded-lg border border-surface-dim overflow-hidden cursor-pointer hover:border-outline">
                    <img src={thumbAt(3)} alt="" className="object-cover w-full h-full" />
                  </div>
                </div>

                {/* PREVIOUS DESIGNS SWITCHER */}
                <div className="bg-surface-container-lowest border border-surface-dim rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider">
                      Previous Designs
                    </span>
                    <a href="#" className="text-[11px] text-primary hover:underline" onClick={(e) => e.preventDefault()}>
                      View All
                    </a>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <div className="w-12 h-12 shrink-0 rounded-lg border-2 border-primary bg-white flex items-center justify-center cursor-pointer">
                      <span className="text-[10px] font-bold text-primary">V1</span>
                    </div>
                    <div className="w-12 h-12 shrink-0 rounded-lg border border-surface-dim bg-white flex items-center justify-center cursor-pointer hover:border-outline">
                      <span className="text-[10px] font-bold text-on-surface-variant">V2</span>
                    </div>
                    <div className="w-12 h-12 shrink-0 rounded-lg border border-surface-dim bg-white flex items-center justify-center cursor-pointer hover:border-outline">
                      <span className="text-[10px] font-bold text-on-surface-variant">V3</span>
                    </div>
                    <div className="w-12 h-12 shrink-0 rounded-lg border border-dashed border-surface-dim bg-white flex items-center justify-center cursor-pointer hover:border-primary text-on-surface-variant">
                      <span className="material-symbols-outlined text-[16px]">add</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 2: Product Info, Print Areas, Suppliers */}
              <div className="flex-1 space-y-6">
                {/* Title & Desc */}
                <div>
                  <h1 className="text-[28px] font-semibold text-on-surface leading-tight mb-1">
                    {title}
                  </h1>
                  <div className="text-[14px] text-on-surface-variant mb-3">{subtitle}</div>
                  <div className="flex items-center gap-2 mb-4">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="bg-surface-container text-on-surface px-2.5 py-1 rounded text-[11px] font-semibold"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <p className="text-[13px] text-on-surface-variant leading-relaxed">
                    {description}
                  </p>
                </div>

                {/* PRINT AREAS */}
                <div>
                  <h3 className="text-[14px] font-semibold text-on-surface mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-outline">crop</span>{' '}
                    Available Print Areas
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {printAreaList.map((area, i) => {
                      const active = i === printAreaIdx;
                      return (
                        <button
                          type="button"
                          key={area.label}
                          className={`print-area-box${active ? ' active' : ''}`}
                          onClick={() => setPrintAreaIdx(i)}
                        >
                          <span
                            className={`material-symbols-outlined text-[24px] mb-1 ${
                              active ? 'text-primary' : 'text-outline'
                            }`}
                          >
                            {active ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                          <span className="text-[12px] font-semibold text-on-surface">{area.label}</span>
                          <span className="text-[10px] text-on-surface-variant">{area.size}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Supplier Costs */}
                <div className="bg-white border border-surface-dim rounded-xl p-4">
                  <div className="font-semibold text-on-surface mb-3 flex items-center gap-2 text-[14px]">
                    <span className="material-symbols-outlined text-[18px] text-primary">
                      compare_arrows
                    </span>
                    Supplier Cost Comparison
                  </div>
                  {offers.map((offer, i) => (
                    <div
                      key={offer.label}
                      className={`flex items-center justify-between bg-surface-container-lowest border border-surface-dim p-2.5 rounded${
                        i === 0 ? ' mb-2' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`supplier-badge supplier-${offer.badge}`}>
                          {offer.badgeLabel}
                        </span>
                        <span className="text-[12px] text-on-surface-variant">{offer.label}</span>
                      </div>
                      <span className="font-semibold text-[15px]">{offer.price}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Column 3: SUMMARY BOX */}
              <div className="w-[320px] shrink-0">
                <div className="bg-white border border-surface-dim rounded-xl p-5 shadow-sm sticky top-6">
                  <h2 className="text-[16px] font-semibold text-on-surface mb-4 border-b border-surface-dim pb-2">
                    Order Summary
                  </h2>

                  <div className="space-y-3 text-[13px] mb-6">
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Base Supplier Cost</span>
                      <span className="font-medium">{summary.baseCost}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Selected Variant</span>
                      <span className="font-medium">{summary.selectedVariant}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Print Area</span>
                      <span className="font-medium text-primary">{summary.printArea}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Active Supplier</span>
                      <span className="font-medium text-primary">{summary.activeSupplier}</span>
                    </div>
                  </div>

                  {/* EDITABLE RETAIL PRICE */}
                  <div className="bg-surface-container-lowest border border-surface-dim rounded-lg p-4 mb-6">
                    <label
                      htmlFor="retailPriceInput"
                      className="block text-[12px] font-semibold text-on-surface-variant mb-1"
                    >
                      Set Retail Price
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-medium">
                        $
                      </span>
                      <input
                        type="number"
                        id="retailPriceInput"
                        value={retail}
                        step="0.01"
                        onChange={(e) => setRetail(e.target.value)}
                        className="w-full h-10 pl-7 pr-3 border border-surface-dim rounded text-[18px] font-semibold focus:outline-none focus:border-primary bg-white"
                      />
                    </div>
                  </div>

                  {/* PROFIT CALCULATION */}
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-[13px] text-on-surface-variant">Est. Profit per unit</span>
                    <span
                      className={`text-[20px] font-semibold ${profitError ? 'text-error' : 'text-primary'}`}
                    >
                      {profitText}
                    </span>
                  </div>

                  {/* MAIN ACTION */}
                  <button
                    type="button"
                    className="w-full h-10 bg-[#1e6dc9] text-white text-[14px] font-semibold rounded-lg hover:bg-[#0055a5] flex items-center justify-center gap-2 mb-3"
                    onClick={handleDesignNow}
                  >
                    <span className="material-symbols-outlined text-[20px]">palette</span>Design Now
                  </button>

                  <div className="text-[11px] text-center text-on-surface-variant mt-2">
                    Changes to design or price will apply to all active sales channels.
                  </div>
                </div>
              </div>
            </div>

            {/* Trusted Network Bar (Full Width below main layout) */}
            <div className="bg-white border border-surface-dim rounded-xl p-4 mb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">verified</span>
                  Fulfillment Network Status
                </h3>
                <a
                  href="#"
                  className="text-[12px] text-primary hover:underline"
                  onClick={(e) => e.preventDefault()}
                >
                  Manage providers
                </a>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {fulfillmentNetwork.map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-surface-container-low p-3 rounded-lg border border-surface-dim flex flex-col gap-1"
                  >
                    <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">
                      {stat.label}
                    </span>
                    <span className="font-semibold text-[13px] text-on-surface">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs Navigation */}
            <div className="border-b border-surface-dim mb-6 overflow-x-auto">
              <div className="flex items-center gap-8 min-w-max px-2">
                {TABS.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className={`pb-3 text-[14px] tab-underline${
                      tab === t.id ? ' active' : ' text-on-surface-variant hover:text-on-surface'
                    }`}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ═══════════ TAB CONTENT ═══════════ */}

            {/* 1. Product Details */}
            {tab === 'details' && (
              <div className="bg-white border border-surface-dim rounded-xl p-8">
                <div className="grid grid-cols-3 gap-12 text-[13px]">
                  <div className="col-span-2 space-y-10">
                    <div>
                      <h3 className="font-semibold text-[18px] mb-4 text-on-surface">
                        About this product
                      </h3>
                      <ul className="list-disc pl-5 space-y-2 text-on-surface-variant mb-5">
                        {aboutBullets.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                      <p className="text-on-surface leading-relaxed">
                        {aboutParagraph}
                      </p>
                    </div>

                    <div>
                      <h3 className="font-semibold text-[18px] mb-5 text-on-surface">Key Features</h3>
                      <div className="grid grid-cols-2 gap-8">
                        {PRODUCT_DETAILS.keyFeatures.map((f) => (
                          <div className="flex gap-4" key={f.title}>
                            <span className="material-symbols-outlined text-[28px] text-outline">
                              {f.icon}
                            </span>
                            <div>
                              <h4 className="font-semibold text-on-surface text-[14px] mb-1">
                                {f.title}
                              </h4>
                              <p className="text-on-surface-variant text-[13px]">{f.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-[18px] mb-4 text-on-surface">
                        Care Instructions
                      </h3>
                      <div className="flex gap-5 mb-4 text-on-surface-variant">
                        {PRODUCT_DETAILS.careIcons.map((c) => (
                          <span
                            key={c.icon}
                            className="material-symbols-outlined text-[28px]"
                            title={c.title}
                          >
                            {c.icon}
                          </span>
                        ))}
                      </div>
                      <p className="text-on-surface-variant text-[13px]">
                        {PRODUCT_DETAILS.careText}
                      </p>
                    </div>
                  </div>

                  <div className="col-span-1">
                    <h3 className="font-semibold text-[18px] mb-4 text-on-surface">Size Guide</h3>
                    <div className="border border-surface-dim rounded-lg overflow-hidden mb-3">
                      <table className="w-full text-[13px] text-center">
                        <thead className="bg-surface-container-low text-on-surface-variant">
                          <tr>
                            <th className="py-3 border-b border-surface-dim border-r">Size</th>
                            <th className="py-3 border-b border-surface-dim border-r">Chest (in)</th>
                            <th className="py-3 border-b border-surface-dim">Length (in)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {PRODUCT_DETAILS.sizeGuide.rows.map((r) => (
                            <tr
                              key={r.size}
                              className={`${r.shaded ? 'bg-surface-container-lowest ' : ''}${
                                r.size === '2XL' ? '' : 'border-b border-surface-dim'
                              }`}
                            >
                              <td className="py-3 border-r">{r.size}</td>
                              <td className="py-3 border-r">{r.chest}</td>
                              <td className="py-3">{r.length}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[12px] text-on-surface-variant">
                      {PRODUCT_DETAILS.sizeGuide.note}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Variants & Inventory */}
            {tab === 'variants' && (
              <div className="bg-white border border-surface-dim rounded-xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="h-9 px-4 border border-surface-dim rounded text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container"
                    >
                      Bulk Edit
                    </button>
                    <button
                      type="button"
                      className="h-9 px-4 border border-surface-dim rounded text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container"
                    >
                      Update Inventory
                    </button>
                  </div>
                  <div className="text-[13px] text-on-surface-variant">
                    {activeVariantsLabel}
                  </div>
                </div>

                <div className="bg-surface-container-lowest border border-surface-dim rounded-lg p-5 mb-6">
                  <div className="text-[13px] font-semibold text-on-surface-variant mb-3">
                    {colorsLabel}
                  </div>
                  <div className="flex gap-4">
                    {colors.map((c, i) => (
                      <div
                        key={c.name}
                        className={`color-swatch${i === 0 ? ' active' : ''}`}
                        style={{
                          background: c.hex,
                          border: c.bordered ? '1px solid #dad9dd' : undefined,
                        }}
                        title={c.name}
                      ></div>
                    ))}
                  </div>
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-8">
                        <input type="checkbox" className="accent-primary" />
                      </th>
                      <th>Variant</th>
                      <th>SKU</th>
                      <th>Active Supplier</th>
                      <th className="text-right">Cost</th>
                      <th className="text-right">Retail</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantRows.map((row) => (
                      <tr key={row.sku}>
                        <td>
                          <input type="checkbox" className="accent-primary" defaultChecked />
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full border border-surface-dim"
                              style={{ background: row.color }}
                            ></div>
                            {row.variant}
                          </div>
                        </td>
                        <td className="font-mono text-[12px] text-on-surface-variant">{row.sku}</td>
                        <td>
                          <span className={`supplier-badge supplier-${row.supplierBadge}`}>
                            {row.supplier}
                          </span>
                        </td>
                        <td className="text-right tabular-nums">{row.cost}</td>
                        <td className="text-right tabular-nums">{row.retail}</td>
                        <td>
                          <span className="bg-primary-container text-on-primary-container px-2 py-0.5 rounded text-[10px] font-semibold">
                            Active
                          </span>
                        </td>
                        <td className="text-right">
                          <a
                            href="#"
                            className="action-link"
                            onClick={(e) => e.preventDefault()}
                          >
                            Edit
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-surface-container-low font-semibold">
                      <td colSpan={4} className="text-right">
                        Total Active Variants
                      </td>
                      <td colSpan={4} className="text-left pl-6">
                        {detail?.variantCount ??
                          productPage?.variantCount ??
                          (live ? '—' : PRODUCT_VARIANTS.totalActiveVariants)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* 3. Supplier Costs */}
            {tab === 'pricing' && (
              <div className="bg-white border border-surface-dim rounded-xl p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-[20px] font-semibold mb-2">
                      {PRODUCT_SUPPLIER_COSTS.heading}
                    </h2>
                    <p className="text-[14px] text-on-surface-variant">
                      {PRODUCT_SUPPLIER_COSTS.subheading}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container"
                  >
                    Auto-Route Cheapest
                  </button>
                </div>

                <table className="data-table border border-surface-dim rounded-lg overflow-hidden mb-6">
                  <thead className="bg-surface-container-low">
                    <tr>
                      <th className="py-4">Supplier</th>
                      <th className="py-4">Network Status</th>
                      <th className="text-right py-4">Base Cost (S-2XL)</th>
                      <th className="text-right py-4">Shipping (US)</th>
                      <th className="text-right py-4">Avg. Production Time</th>
                      <th className="text-center py-4">Routing Priority</th>
                      <th className="text-right py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierCostRows.map((row) => (
                      <tr key={row.label} className={row.shaded ? 'bg-surface-container-lowest' : ''}>
                        <td className="py-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`supplier-badge supplier-${row.badge} text-[13px] py-1 px-3`}
                            >
                              {row.badgeLabel}
                            </span>
                            <span className="text-[13px] text-on-surface-variant">{row.label}</span>
                          </div>
                        </td>
                        <td className="py-4">
                          <div
                            className={`flex items-center gap-1 text-[13px] ${
                              row.statusPrimary ? 'text-primary' : 'text-on-surface-variant'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {row.statusIcon}
                            </span>
                            {row.statusText}
                          </div>
                        </td>
                        <td className="text-right tabular-nums font-semibold text-[14px] py-4">
                          {row.baseCost}
                        </td>
                        <td className="text-right tabular-nums text-[14px] py-4">{row.shipping}</td>
                        <td className="text-right tabular-nums text-[14px] py-4">{row.production}</td>
                        <td className="text-center py-4">
                          <select className="h-8 border border-surface-dim rounded text-[13px] px-2 bg-white focus:outline-none focus:border-primary">
                            {row.routing.map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td className="text-right py-4">
                          <a href="#" className="action-link" onClick={(e) => e.preventDefault()}>
                            Edit Rules
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="bg-surface-container-low p-5 rounded-lg border border-surface-dim flex items-start gap-4">
                  <span className="material-symbols-outlined text-[24px] text-primary">info</span>
                  <div className="text-[14px] text-on-surface leading-relaxed">
                    {live ? (
                      <>
                        <strong>Smart Routing:</strong>{' '}
                        {offers.length > 1
                          ? `Orders auto-route to the cheapest of ${offers.length} supplier offers for this product.`
                          : `This product currently routes to ${productPage?.supplier ?? 'its supplier'}.`}
                      </>
                    ) : (
                      <>
                        <strong>Smart Routing Active:</strong> Orders for White variants will route to{' '}
                        <strong>Printify</strong> for lower costs. Orders for Black and Green variants
                        will route to <strong>Printful</strong> for faster production times and higher
                        quality control.
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 4. Fulfillment & Providers */}
            {tab === 'fulfillment' && (
              <div className="bg-white border border-surface-dim rounded-xl p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-[20px] font-semibold mb-2">{PRODUCT_FULFILLMENT.heading}</h2>
                    <p className="text-[14px] text-on-surface-variant">
                      {PRODUCT_FULFILLMENT.subheading}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="h-9 px-4 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container"
                  >
                    + Add Provider
                  </button>
                </div>

                <div className="space-y-4">
                  {providers.map((p) => (
                    <div
                      key={p.name}
                      className={`border border-surface-dim rounded-lg p-5 flex items-center justify-between${
                        p.dimmed ? ' opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-center gap-5">
                        <div
                          className={`w-12 h-12 bg-surface-container rounded-lg flex items-center justify-center font-bold text-[16px] ${
                            p.dimmed ? 'text-on-surface-variant' : 'text-primary'
                          }`}
                        >
                          {p.initials}
                        </div>
                        <div>
                          <div className="font-semibold text-[15px]">{p.name}</div>
                          <div className="text-[13px] text-on-surface-variant">{p.note}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-8 text-[14px]">
                        <div className="text-right">
                          <div className="text-on-surface-variant text-[12px]">Avg. Production</div>
                          <div className="font-semibold">{p.production}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-on-surface-variant text-[12px]">Locations</div>
                          <div className="font-semibold">{p.locations}</div>
                        </div>
                        <button type="button" className="icon-btn">
                          <span className="material-symbols-outlined">more_vert</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Mockups */}
            {tab === 'mockups' && (
              <div>
                <div className="flex items-center justify-between mb-5 px-2">
                  <div className="text-[14px] text-on-surface-variant">
                    Showing mockups for{' '}
                    <strong className="text-on-surface">{title}</strong>
                  </div>
                  <div className="flex items-center gap-2">
                    <select className="h-9 pl-3 pr-8 border border-surface-dim rounded text-[13px] bg-white appearance-none focus:outline-none focus:border-primary">
                      {PRODUCT_MOCKUPS.colorOptions.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-6">
                  {mockupCards.map((m) => (
                    <div key={m.title} className="mockup-card bg-white flex flex-col">
                      <div className="aspect-[4/5] bg-surface-container-low relative">
                        <span className="absolute top-3 right-3 bg-[#1a1c1e] text-white text-[10px] font-bold px-2 py-1 rounded">
                          {m.tag}
                        </span>
                        <img src={m.imageUrl} alt={m.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-4 border-t border-surface-dim flex-1 flex flex-col justify-between">
                        <div className="mb-3">
                          <div className="text-[13px] font-semibold text-on-surface leading-tight mb-1">
                            {m.title}
                          </div>
                          <div className="text-[12px] text-on-surface-variant">{m.subtitle}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="flex-1 h-8 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container"
                            onClick={() => toast('Opening design editor...')}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="flex-1 h-8 bg-primary text-white rounded text-[12px] font-semibold hover:bg-primary-container"
                            onClick={() => toast('Opening design editor...')}
                          >
                            Design
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. Reviews */}
            {tab === 'reviews' && (
              <div className="bg-white border border-surface-dim rounded-xl p-8">
                <div className="flex gap-12">
                  <div className="w-72 shrink-0">
                    <div className="flex items-end gap-3 mb-3">
                      <div className="text-[48px] font-bold leading-none text-on-surface">
                        {PRODUCT_REVIEWS.score}
                      </div>
                      <div className="flex text-yellow-400 mb-1">
                        {PRODUCT_REVIEWS.starIcons.map((s, i) => (
                          <span
                            key={i}
                            className="material-symbols-outlined text-[24px]"
                            style={
                              s === 'star' ? { fontVariationSettings: "'FILL' 1" } : undefined
                            }
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-[13px] text-on-surface-variant mb-8">
                      {PRODUCT_REVIEWS.basedOn}
                    </div>

                    <button
                      type="button"
                      className="w-full h-10 bg-primary text-white text-[14px] font-semibold rounded hover:bg-primary-container mb-8"
                    >
                      Write a Review
                    </button>

                    <div className="space-y-3">
                      {PRODUCT_REVIEWS.ratingBars.map((bar) => (
                        <div key={bar.label} className="flex items-center text-[13px] gap-3">
                          <span className="w-16 text-on-surface-variant">{bar.label}</span>
                          <div className="flex-1 rating-bar">
                            <div className="rating-bar-fill" style={{ width: bar.width }}></div>
                          </div>
                          <span className="w-8 text-right font-medium">{bar.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 space-y-8">
                    <div className="flex items-center justify-between mb-2 pb-4 border-b border-surface-dim">
                      <div className="flex gap-2">
                        {PRODUCT_REVIEWS.filters.map((f, i) => (
                          <button
                            type="button"
                            key={f}
                            className={
                              i === 0
                                ? 'px-4 py-1.5 bg-surface-container border border-surface-dim rounded-full text-[12px] font-semibold'
                                : 'px-4 py-1.5 hover:bg-surface-container rounded-full text-[12px] text-on-surface-variant'
                            }
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-[12px] text-on-surface-variant">
                        <span>Sort by:</span>
                        <select className="bg-transparent font-semibold text-on-surface outline-none">
                          {PRODUCT_REVIEWS.sortOptions.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {PRODUCT_REVIEWS.reviews.map((review) => (
                      <div key={review.title} className="border-b border-surface-dim pb-6">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="flex text-yellow-400">
                              {review.stars.map((s, i) => (
                                <span
                                  key={i}
                                  className="material-symbols-outlined text-[18px]"
                                  style={{ fontVariationSettings: "'FILL' 1" }}
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                            <span className="font-semibold text-[14px] text-on-surface">
                              {review.title}
                            </span>
                            {review.verified && (
                              <span className="bg-surface-container px-2 py-0.5 rounded text-[11px] text-on-surface-variant flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">
                                  verified
                                </span>
                                Verified Purchase
                              </span>
                            )}
                          </div>
                          <span className="text-[13px] text-on-surface-variant">{review.date}</span>
                        </div>
                        <p className="text-[14px] text-on-surface mb-3">{review.text}</p>
                        <div className="text-[12px] text-on-surface-variant flex items-center gap-2">
                          <span>{review.author}</span> • <span>{review.meta}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Toast */}
      <div className={`toast${toastMessage ? ' show' : ''}`}>{toastMessage}</div>
    </div>
  );
}
