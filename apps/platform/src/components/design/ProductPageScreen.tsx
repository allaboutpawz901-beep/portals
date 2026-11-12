'use client';
/**
 * ProductPageScreen — the approved product page design
 * (upload/erp product page.html), wired to REAL data from
 * GET /api/v1/blanks/[id] (supplier catalog + offers + gallery) and
 * GET /api/v1/designs?blankId=… (previous designs).
 *
 * Layout: sticky action bar → 3-column main (gallery | info | order
 * summary) → fulfillment network status bar → 6 tabs (Details, Variants
 * & Inventory, Supplier Costs, Fulfillment Routing, Mockups, Reviews).
 *
 * Design buttons are blue (#1e6dc9) per the approved design; the
 * platform green (#0a6400) stays for prices/profit and active states.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  getBlankPrice,
  listDesigns,
  type BlankDetail,
  type BlankOffer,
  type DesignListItem,
  type PriceQuote,
} from '@/lib/podApi';
import { useDesignCanvas, type CatalogProduct } from '@/lib/designCanvasStore';
import type { DomainKey } from '@/data/shellData';
import { ProductThumb } from './ProductCard';

interface ProductPageScreenProps {
  onToast: (msg: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}

type Tab = 'details' | 'variants' | 'pricing' | 'fulfillment' | 'mockups' | 'reviews';

const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'Product Details' },
  { id: 'variants', label: 'Variants & Inventory' },
  { id: 'pricing', label: 'Supplier Costs' },
  { id: 'fulfillment', label: 'Fulfillment Routing' },
  { id: 'mockups', label: 'Mockups' },
  { id: 'reviews', label: 'Reviews' },
];

const BLUE = '#1e6dc9';
const BLUE_DARK = '#0055a5';

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Supplier badge — same palette as the card. */
function OfferBadge({ slug, name }: { slug: string; name: string }) {
  const isPrintify = slug.toLowerCase().includes('printify');
  return (
    <span
      className="supplier-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        background: isPrintify ? '#e0f2fe' : '#f3e8ff',
        color: isPrintify ? '#0369a1' : '#6b21a8',
      }}
    >
      {name}
    </span>
  );
}

export default function ProductPageScreen({ onToast, onNavigate }: ProductPageScreenProps) {
  const storeProduct = useDesignCanvas((s) => s.productPage);
  const blankDetail = useDesignCanvas((s) => s.blankDetail);
  const loadBlankDetail = useDesignCanvas((s) => s.loadBlankDetail);
  const startDesign = useDesignCanvas((s) => s.startDesign);
  const loadBlankFromDetail = useDesignCanvas((s) => s.loadBlankFromDetail);
  const saveToCollection = useDesignCanvas((s) => s.saveToCollection);
  const openStudio = useDesignCanvas((s) => s.openStudio);

  useEffect(() => {
    if (storeProduct?.id) void loadBlankDetail(storeProduct.id).catch(() => {});
  }, [storeProduct?.id, loadBlankDetail]);

  const [tab, setTab] = useState<Tab>('details');
  const [activeImg, setActiveImg] = useState(0);
  const [prevDesigns, setPrevDesigns] = useState<DesignListItem[] | null>(null);
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [color, setColor] = useState<string>('');
  const [size, setSize] = useState<string>('');
  const [printAreaIdx, setPrintAreaIdx] = useState(0);
  const [retail, setRetail] = useState<string>('');

  // Per-product derived state resets when the product changes.
  useEffect(() => {
    setTab('details');
    setActiveImg(0);
    setPrevDesigns(null);
    setQuote(null);
    setPrintAreaIdx(0);
    setRetail('');
    setColor('');
    setSize('');
  }, [storeProduct?.id]);

  // Previous designs + price suggestion for this blank.
  useEffect(() => {
    if (!blankDetail) return;
    void listDesigns({ blankId: blankDetail.id, limit: 12 })
      .then((r) => setPrevDesigns(r.items))
      .catch(() => setPrevDesigns([]));
    void getBlankPrice(blankDetail.id)
      .then((q) => {
        setQuote(q);
        if (!retail) setRetail(q.suggestedRetailPrice != null ? q.suggestedRetailPrice.toFixed(2) : '');
      })
      .catch(() => setQuote(null));
  }, [blankDetail?.id, retail]);

  useEffect(() => {
    if (blankDetail) {
      if (!color && blankDetail.variants.colors.length > 0) setColor(blankDetail.variants.colors[0].name);
      if (!size && blankDetail.variants.sizes.length > 0) setSize(blankDetail.variants.sizes[0]);
    }
  }, [blankDetail, color, size]);

  const product: CatalogProduct = storeProduct ?? ({} as CatalogProduct);
  const d: BlankDetail | null = blankDetail;
  const displayName = d?.name || product.name || 'Unnamed product';
  const brand = d?.brand || product.brand || '—';
  const offers: BlankOffer[] = d?.offers ?? [];
  const suppliers = d?.suppliers ?? (d ? [{ name: d.supplier, slug: d.supplierSlug }] : []);
  const isMulti = offers.length >= 2;
  const baseCost = offers[0]?.cost ?? d?.baseCost ?? null;
  const activeSupplier = offers[0]?.supplier ?? d?.supplier ?? '—';

  // Gallery images: supplier gallery first, then the blank's own views,
  // then the card thumb.
  const galleryImages = useMemo(() => {
    const imgs: { url: string; label: string; supplier?: string }[] = [];
    if (d?.gallery) {
      for (const g of d.gallery) {
        for (const im of g.images.slice(0, 2)) {
          imgs.push({ url: im.url, label: `${g.color} · ${im.placement}`, supplier: d.supplier });
        }
      }
    }
    for (const v of d?.views ?? []) {
      if (v.baseUrl) imgs.push({ url: v.baseUrl, label: v.label || v.view, supplier: d?.supplier });
    }
    if (imgs.length === 0 && d?.mockupThumbUrl) {
      imgs.push({ url: d.mockupThumbUrl, label: 'Product', supplier: d?.supplier });
    }
    return imgs.slice(0, 12);
  }, [d]);

  const thumbs = galleryImages.slice(0, 4);
  const mainImage = galleryImages[Math.min(activeImg, Math.max(galleryImages.length - 1, 0))];

  // Print areas — real inches from the views' print boxes.
  const printAreas = useMemo(() => {
    const seen = new Map<string, { placement: string; wIn: number | null; hIn: number | null }>();
    for (const v of d?.views ?? []) {
      if (!seen.has(v.view)) {
        seen.set(v.view, {
          placement: v.label || v.view,
          wIn: v.boxIn ? Math.round(v.boxIn.wIn * 10) / 10 : null,
          hIn: v.boxIn ? Math.round(v.boxIn.hIn * 10) / 10 : null,
        });
      }
    }
    if (seen.size === 0) {
      for (const a of d?.variants.printAreas ?? []) {
        seen.set(a, { placement: a, wIn: null, hIn: null });
      }
    }
    return [...seen.values()];
  }, [d]);

  const selectedPrintArea = printAreas[Math.min(printAreaIdx, Math.max(printAreas.length - 1, 0))];

  // Live profit calc — retail minus the ACTIVE supplier's cost.
  const retailNum = parseFloat(retail);
  const profit =
    retailNum != null && !isNaN(retailNum) && baseCost != null ? retailNum - baseCost : null;

  function handleDesignNow() {
    if (!d) {
      onToast('Still loading this product — one moment.');
      return;
    }
    void (async () => {
      try {
        await startDesign(d);
        onNavigate('design', 'new-design');
        onToast(`${d.name} loaded — draft design created.`);
      } catch {
        loadBlankFromDetail(d);
        onNavigate('design', 'new-design');
        onToast(`${d.name} loaded (draft not saved — offline).`);
      }
    })();
  }

  function handleDownload() {
    if (!d) return;
    if (prevDesigns && prevDesigns.length > 0) {
      onToast('Opening print file for the latest design…');
      void fetch(`/api/v1/designs/${prevDesigns[0].id}/print`, { method: 'POST' })
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error?.message || 'print failed');
          onToast('Print render queued — check Renders shortly.');
        })
        .catch((e: Error) => onToast(e.message));
    } else {
      onToast('No design on this product yet — hit Design Now first.');
    }
  }

  function handlePrint() {
    window.print();
  }

  function handleSaveCollection() {
    if (!d) return;
    void saveToCollection(product).then(() => onToast(`Saved "${displayName}" to Collection.`));
  }

  const techniques = d?.techniques ?? [];
  const chips: string[] = [];
  if (/\bunisex\b/i.test(displayName)) chips.push('Unisex');
  if (d?.family) chips.push(d.family === 'apparel' ? 'Apparel' : d.family);
  for (const t of techniques.slice(0, 2)) chips.push(t.label);

  return (
    <main className="flex flex-col h-full overflow-hidden bg-background">
      {/* ═══ TOP ACTION BAR (approved design: back, name, Download/Print/Edit, blue Design Now) ═══ */}
      <header className="h-14 px-6 flex items-center justify-between bg-white border-b border-surface-dim shrink-0 z-10">
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="flex items-center gap-1 text-primary font-semibold text-[13px] hover:underline"
            onClick={() => onNavigate('design', 'studio-my-library')}
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back_ios</span>Products
          </button>
          <div className="h-4 w-px bg-surface-dim" />
          <span className="text-[13px] text-on-surface-variant font-medium truncate max-w-[320px]">
            {displayName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-8 px-3 border border-surface-dim rounded bg-white text-[13px] font-semibold hover:bg-surface-container flex items-center gap-1"
            onClick={handleDownload}
          >
            <span className="material-symbols-outlined text-[16px]">download</span>Download
          </button>
          <button
            type="button"
            className="h-8 px-3 border border-surface-dim rounded bg-white text-[13px] font-semibold hover:bg-surface-container flex items-center gap-1"
            onClick={handlePrint}
          >
            <span className="material-symbols-outlined text-[16px]">print</span>Print
          </button>
          <button
            type="button"
            className="h-8 px-3 border border-surface-dim rounded bg-white text-[13px] font-semibold hover:bg-surface-container flex items-center gap-1"
            onClick={handleSaveCollection}
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>Save to Collection
          </button>
          <div className="w-px h-4 bg-surface-dim mx-1" />
          <button
            type="button"
            className="h-8 px-4 rounded text-[13px] font-semibold text-white hover:opacity-90 flex items-center gap-1"
            style={{ background: BLUE }}
            onClick={handleDesignNow}
          >
            <span className="material-symbols-outlined text-[18px]">palette</span>Design Now
          </button>
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {!d ? (
          <div className="flex items-center justify-center h-full text-on-surface-variant text-[14px]">
            Loading {displayName}…
          </div>
        ) : (
          <div className="max-w-[1500px] mx-auto p-6">
            {/* ═══ MAIN LAYOUT: gallery | info | summary ═══ */}
            <div className="flex gap-6 mb-6">
              {/* ── Column 1: Gallery & Previous Designs ── */}
              <div className="w-[340px] shrink-0 space-y-4">
                <div className="w-full h-[340px] bg-surface-container-low rounded-xl border border-surface-dim flex items-center justify-center overflow-hidden">
                  {mainImage ? (
                    <img src={mainImage.url} alt={displayName} className="object-cover w-full h-full" />
                  ) : (
                    <ProductThumb name={displayName} imageUrl={d.mockupThumbUrl} style={{ width: '100%', height: '100%' }} />
                  )}
                </div>
                {thumbs.length > 1 && (
                  <div className="grid grid-cols-4 gap-2">
                    {thumbs.map((t, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => setActiveImg(i)}
                        className={`aspect-square bg-surface-container-low rounded-lg overflow-hidden cursor-pointer ${
                          i === activeImg ? 'border-2 border-primary' : 'border border-surface-dim hover:border-outline'
                        }`}
                      >
                        <img src={t.url} alt={`${displayName} ${i + 1}`} className="object-cover w-full h-full" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Previous designs — real saved designs for this blank */}
                <div className="bg-surface-container-lowest border border-surface-dim rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider">
                      Previous Designs
                    </span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(prevDesigns ?? []).slice(0, 6).map((des, i) => (
                      <button
                        key={des.id}
                        type="button"
                        title={des.name}
                        onClick={() => {
                          void openStudio({ entry: 'catalog', designId: des.id, view: 'design' })
                            .then(() => onNavigate('design', 'new-design'))
                            .catch(() => onToast('Could not open that design.'));
                        }}
                        className="w-12 h-12 shrink-0 rounded-lg border border-surface-dim bg-white flex items-center justify-center cursor-pointer hover:border-outline"
                      >
                        <span className="text-[10px] font-bold text-on-surface-variant">V{i + 1}</span>
                      </button>
                    ))}
                    {prevDesigns === null && (
                      <span className="text-[12px] text-on-surface-variant py-3">Loading designs…</span>
                    )}
                    {prevDesigns !== null && prevDesigns.length === 0 && (
                      <span className="text-[12px] text-on-surface-variant py-3">No designs yet</span>
                    )}
                    <button
                      type="button"
                      onClick={handleDesignNow}
                      className="w-12 h-12 shrink-0 rounded-lg border border-dashed border-surface-dim bg-white flex items-center justify-center cursor-pointer hover:border-primary text-on-surface-variant"
                      aria-label="New design for this product"
                    >
                      <span className="material-symbols-outlined text-[16px]">add</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Column 2: Product Info, Print Areas, Suppliers ── */}
              <div className="flex-1 space-y-6 min-w-0">
                <div>
                  <h1 className="text-[28px] font-semibold text-on-surface leading-tight mb-1">{displayName}</h1>
                  <div className="text-[14px] text-on-surface-variant mb-3">
                    {brand} • {isMulti ? `Multi-Supplier Product (${offers.length} suppliers)` : `${d.supplier} Product`}
                  </div>
                  {chips.length > 0 && (
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                      {chips.map((c) => (
                        <span key={c} className="bg-surface-container text-on-surface px-2.5 py-1 rounded text-[11px] font-semibold">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[13px] text-on-surface-variant leading-relaxed">
                    {d.description ||
                      `${displayName} by ${brand}, fulfilled on demand by ${activeSupplier}. Base cost ${money(
                        baseCost,
                      )} per unit; retail price and profit are set on the right.`}
                  </p>
                </div>

                {/* Print areas */}
                {printAreas.length > 0 && (
                  <div>
                    <h3 className="text-[14px] font-semibold text-on-surface mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-outline">crop</span> Available Print Areas
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      {printAreas.map((a, i) => {
                        const active = i === printAreaIdx;
                        return (
                          <button
                            type="button"
                            key={a.placement}
                            onClick={() => setPrintAreaIdx(i)}
                            className="flex flex-col items-center justify-center gap-0.5 rounded-md transition-all"
                            style={{
                              border: active ? '2px solid #0a6400' : '1px dashed #becab6',
                              background: active ? '#f0fdf4' : '#faf9fc',
                              padding: 8,
                              height: 80,
                              cursor: 'pointer',
                            }}
                          >
                            <span
                              className="material-symbols-outlined text-[24px] mb-0.5"
                              style={{ color: active ? '#0a6400' : '#6f7a69' }}
                            >
                              {active ? 'check_circle' : 'radio_button_unchecked'}
                            </span>
                            <span className="text-[12px] font-semibold text-on-surface capitalize">{a.placement}</span>
                            {a.wIn != null && a.hIn != null && (
                              <span className="text-[10px] text-on-surface-variant">
                                {a.wIn}&quot; x {a.hIn}&quot;
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Supplier cost comparison — the REAL offers */}
                {offers.length > 0 && (
                  <div className="bg-white border border-surface-dim rounded-xl p-4">
                    <div className="font-semibold text-on-surface mb-3 flex items-center gap-2 text-[14px]">
                      <span className="material-symbols-outlined text-[18px] text-primary">compare_arrows</span>
                      Supplier Cost Comparison
                    </div>
                    <div className="space-y-2">
                      {offers.map((o, i) => (
                        <div
                          key={o.blankId}
                          className="flex items-center justify-between bg-surface-container-lowest border border-surface-dim p-2.5 rounded"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <OfferBadge slug={o.supplierSlug} name={o.supplier} />
                            <span className="text-[12px] text-on-surface-variant truncate">{o.brand}</span>
                            {i === 0 && (
                              <span className="text-[10px] font-semibold text-primary shrink-0">Best price</span>
                            )}
                          </div>
                          <span className="font-semibold text-[15px] shrink-0">{money(o.cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Column 3: Order Summary ── */}
              <div className="w-[320px] shrink-0">
                <div className="bg-white border border-surface-dim rounded-xl p-5 shadow-sm sticky top-6">
                  <h2 className="text-[16px] font-semibold text-on-surface mb-4 border-b border-surface-dim pb-2">
                    Order Summary
                  </h2>

                  <div className="space-y-3 text-[13px] mb-5">
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Base Supplier Cost</span>
                      <span className="font-medium">{money(baseCost)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant">Selected Variant</span>
                      <span className="font-medium truncate max-w-[140px]">
                        {color || '—'} / {size || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Print Area</span>
                      <span className="font-medium text-primary truncate max-w-[140px]">
                        {selectedPrintArea
                          ? `${selectedPrintArea.placement}${
                              selectedPrintArea.wIn != null ? ` (${selectedPrintArea.wIn}"×${selectedPrintArea.hIn}")` : ''
                            }`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Active Supplier</span>
                      <span className="font-medium text-primary">{activeSupplier}</span>
                    </div>
                  </div>

                  {/* Color + size pickers */}
                  {d.variants.colors.length > 0 && (
                    <div className="mb-4">
                      <div className="text-[12px] font-semibold text-on-surface-variant mb-2">Color</div>
                      <div className="flex gap-3 flex-wrap">
                        {d.variants.colors.slice(0, 12).map((c) => (
                          <button
                            type="button"
                            key={c.name}
                            title={c.name}
                            onClick={() => setColor(c.name)}
                            className="color-swatch"
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              border: c.name === color ? '2px solid #0a6400' : '1px solid #dad9dd',
                              background: c.hex || '#eee',
                              cursor: 'pointer',
                              position: 'relative',
                            }}
                            aria-label={c.name}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {d.variants.sizes.length > 0 && (
                    <div className="mb-5">
                      <div className="text-[12px] font-semibold text-on-surface-variant mb-2">Size</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {d.variants.sizes.map((s) => (
                          <button
                            type="button"
                            key={s}
                            onClick={() => setSize(s)}
                            className="h-7 min-w-[32px] px-2 border rounded text-[12px] font-semibold"
                            style={{
                              borderColor: s === size ? '#0a6400' : '#dad9dd',
                              background: s === size ? '#0a6400' : '#fff',
                              color: s === size ? '#fff' : '#1a1c1e',
                              cursor: 'pointer',
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Editable retail price */}
                  <div className="bg-surface-container-lowest border border-surface-dim rounded-lg p-4 mb-5">
                    <label htmlFor="retailPriceInput" className="block text-[12px] font-semibold text-on-surface-variant mb-1">
                      Set Retail Price
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-medium">$</span>
                      <input
                        id="retailPriceInput"
                        type="number"
                        step="0.01"
                        min="0"
                        value={retail}
                        onChange={(e) => setRetail(e.target.value)}
                        className="w-full h-10 pl-7 pr-3 border border-surface-dim rounded text-[18px] font-semibold focus:outline-none focus:border-primary bg-white"
                      />
                    </div>
                    {quote?.suggestedRetailPrice != null && (
                      <div className="text-[11px] text-on-surface-variant mt-1">
                        Suggested: ${quote.suggestedRetailPrice.toFixed(2)} (cost ×1.55 + shipping)
                      </div>
                    )}
                  </div>

                  {/* Profit calculation */}
                  <div className="flex justify-between items-center mb-5">
                    <span className="text-[13px] text-on-surface-variant">Est. Profit per unit</span>
                    <span
                      className="text-[20px] font-semibold"
                      style={{ color: profit != null && profit >= 0 ? '#0a6400' : '#ba1a1a' }}
                    >
                      {profit == null ? '—' : profit >= 0 ? `$${profit.toFixed(2)}` : `-$${Math.abs(profit).toFixed(2)}`}
                    </span>
                  </div>

                  {/* Main action */}
                  <button
                    type="button"
                    className="w-full h-10 text-white text-[14px] font-semibold rounded-lg flex items-center justify-center gap-2 mb-3 hover:opacity-90"
                    style={{ background: BLUE }}
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

            {/* ═══ Fulfillment Network Status bar ═══ */}
            <div className="bg-white border border-surface-dim rounded-xl p-4 mb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-primary">verified</span>
                  Fulfillment Network Status
                </h3>
                <button
                  type="button"
                  className="text-[12px] text-primary hover:underline"
                  onClick={() => onNavigate('settings', 'set-integrations')}
                >
                  Manage providers
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-surface-container-low p-3 rounded-lg border border-surface-dim flex flex-col gap-1">
                  <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">Suppliers</span>
                  <span className="font-semibold text-[13px] text-on-surface">
                    {suppliers.length} active{suppliers.length > 1 ? ' (multi-source)' : ''}
                  </span>
                </div>
                <div className="bg-surface-container-low p-3 rounded-lg border border-surface-dim flex flex-col gap-1">
                  <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">Lowest price</span>
                  <span className="font-semibold text-[13px] text-on-surface">
                    {offers[0] ? `${offers[0].supplier} (${money(offers[0].cost)})` : `${activeSupplier} (${money(baseCost)})`}
                  </span>
                </div>
                <div className="bg-surface-container-low p-3 rounded-lg border border-surface-dim flex flex-col gap-1">
                  <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">Variants</span>
                  <span className="font-semibold text-[13px] text-on-surface">{d.variantCount ?? d.variants.sizes.length} options</span>
                </div>
                <div className="bg-surface-container-low p-3 rounded-lg border border-surface-dim flex flex-col gap-1">
                  <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-semibold">Est. delivery</span>
                  <span className="font-semibold text-[13px] text-on-surface">{d.deliveryEstimate || '—'}</span>
                </div>
              </div>
            </div>

            {/* ═══ Tabs ═══ */}
            <div className="border-b border-surface-dim mb-6 overflow-x-auto">
              <div className="flex items-center gap-8 min-w-max px-2">
                {TABS.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className="pb-3 text-[14px]"
                    style={{
                      borderBottom: `2px solid ${tab === t.id ? '#0a6400' : 'transparent'}`,
                      color: tab === t.id ? '#0a6400' : '#5a6355',
                      fontWeight: tab === t.id ? 600 : 400,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Tab 1: Product Details ── */}
            {tab === 'details' && (
              <div className="bg-white border border-surface-dim rounded-xl p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-[13px]">
                  <div className="md:col-span-2 space-y-10">
                    <div>
                      <h3 className="font-semibold text-[18px] mb-4 text-on-surface">About this product</h3>
                      <ul className="list-disc pl-5 space-y-2 text-on-surface-variant mb-5">
                        <li>Brand: {brand}</li>
                        <li>Supplier: {activeSupplier}{isMulti ? ` (+${offers.length - 1} more)` : ''}</li>
                        <li>Base cost: {money(baseCost)} per unit</li>
                        {d.techniques.length > 0 && (
                          <li>Print techniques: {d.techniques.map((t) => t.label).join(', ')}</li>
                        )}
                        {d.variants.sizes.length > 0 && <li>Sizes: {d.variants.sizes.join(', ')}</li>}
                        {d.providerTitle && <li>Print provider: {d.providerTitle}</li>}
                      </ul>
                      <p className="text-on-surface leading-relaxed">
                        {d.description ||
                          'Full marketing copy for this product is on file with the supplier and will appear here once ingested.'}
                      </p>
                    </div>

                    {d.techniquePrices.length > 0 && (
                      <div>
                        <h3 className="font-semibold text-[18px] mb-5 text-on-surface">Pricing by Technique</h3>
                        <div className="grid grid-cols-2 gap-8">
                          {d.techniquePrices.map((tp) => (
                            <div key={tp.key} className="flex gap-4">
                              <span className="material-symbols-outlined text-[28px] text-outline">dry_cleaning</span>
                              <div>
                                <h4 className="font-semibold text-on-surface text-[14px] mb-1">{tp.label}</h4>
                                <p className="text-on-surface-variant text-[13px]">
                                  {money(tp.price)} base
                                  {tp.discountedPrice != null && tp.discountedPrice !== tp.price && (
                                    <> · {money(tp.discountedPrice)} discounted tier</>
                                  )}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold text-[18px] mb-4 text-on-surface">Colors ({d.variants.colors.length})</h3>
                    <div className="flex flex-wrap gap-3 mb-6">
                      {d.variants.colors.slice(0, 24).map((c) => (
                        <div key={c.name} className="flex flex-col items-center gap-1" title={c.name}>
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              border: '1px solid #dad9dd',
                              background: c.hex || '#eee',
                            }}
                          />
                          <span className="text-[10px] text-on-surface-variant max-w-[52px] truncate">{c.name}</span>
                        </div>
                      ))}
                      {d.variants.colors.length === 0 && (
                        <span className="text-on-surface-variant text-[12px]">No colors on file.</span>
                      )}
                    </div>

                    <h3 className="font-semibold text-[18px] mb-4 text-on-surface">Sizes</h3>
                    <div className="flex flex-wrap gap-2 mb-6">
                      {d.variants.sizes.map((s) => (
                        <span key={s} className="border border-surface-dim rounded px-2 py-1 text-[12px]">
                          {s}
                        </span>
                      ))}
                      {d.variants.sizes.length === 0 && (
                        <span className="text-on-surface-variant text-[12px]">No sizes on file.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab 2: Variants & Inventory ── */}
            {tab === 'variants' && (
              <div className="bg-white border border-surface-dim rounded-xl p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] text-on-surface-variant">
                      {d.variantCount ?? 0} variants across {d.variants.colors.length} colors × {d.variants.sizes.length} sizes
                    </span>
                  </div>
                </div>

                {d.variants.colors.length > 0 && (
                  <div className="bg-surface-container-lowest border border-surface-dim rounded-lg p-5 mb-6">
                    <div className="text-[13px] font-semibold text-on-surface-variant mb-3">
                      Colors ({d.variants.colors.length} on file)
                    </div>
                    <div className="flex gap-4 flex-wrap">
                      {d.variants.colors.map((c) => (
                        <div
                          key={c.name}
                          className="color-swatch"
                          title={c.name}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            border: c.name === color ? '2px solid #0a6400' : '1px solid #dad9dd',
                            background: c.hex || '#eee',
                            cursor: 'pointer',
                          }}
                          onClick={() => setColor(c.name)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <table className="w-full text-[13px]">
                  <thead className="bg-surface-container-low text-on-surface-variant">
                    <tr>
                      <th className="py-3 border-b border-surface-dim text-left px-3">Color</th>
                      <th className="py-3 border-b border-surface-dim text-left px-3">Sizes</th>
                      <th className="py-3 border-b border-surface-dim text-left px-3">Active Supplier</th>
                      <th className="py-3 border-b border-surface-dim text-right px-3">Cost</th>
                      <th className="py-3 border-b border-surface-dim text-right px-3">Retail</th>
                      <th className="py-3 border-b border-surface-dim text-center px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.variants.colors.slice(0, 20).map((c, i) => (
                      <tr key={c.name} className={i % 2 === 1 ? 'bg-surface-container-lowest' : ''}>
                        <td className="py-3 px-3 border-b border-surface-dim">
                          <div className="flex items-center gap-2">
                            <div
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                border: '1px solid #dad9dd',
                                background: c.hex || '#eee',
                              }}
                            />
                            {c.name}
                          </div>
                        </td>
                        <td className="py-3 px-3 border-b border-surface-dim text-on-surface-variant">
                          {d.variants.sizes.slice(0, 8).join(', ')}
                          {d.variants.sizes.length > 8 ? ` +${d.variants.sizes.length - 8}` : ''}
                        </td>
                        <td className="py-3 px-3 border-b border-surface-dim">
                          <OfferBadge slug={offers[0]?.supplierSlug ?? d.supplierSlug} name={activeSupplier} />
                        </td>
                        <td className="py-3 px-3 border-b border-surface-dim text-right tabular-nums">{money(baseCost)}</td>
                        <td className="py-3 px-3 border-b border-surface-dim text-right tabular-nums">
                          {retailNum != null && !isNaN(retailNum) ? money(retailNum) : '—'}
                        </td>
                        <td className="py-3 px-3 border-b border-surface-dim text-center">
                          <span className="bg-primary-container text-on-primary-container px-2 py-0.5 rounded text-[10px] font-semibold">
                            Active
                          </span>
                        </td>
                      </tr>
                    ))}
                    {d.variants.colors.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-on-surface-variant">
                          No variant colors on file for this product yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Tab 3: Supplier Costs ── */}
            {tab === 'pricing' && (
              <div className="bg-white border border-surface-dim rounded-xl p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-[20px] font-semibold mb-2">Supplier Cost Breakdown</h2>
                    <p className="text-[14px] text-on-surface-variant">
                      Base costs and shipping across every supplier carrying this exact product.
                    </p>
                  </div>
                </div>

                <table className="w-full text-[13px] border border-surface-dim rounded-lg overflow-hidden mb-6">
                  <thead className="bg-surface-container-low">
                    <tr>
                      <th className="py-4 px-3 text-left">Supplier</th>
                      <th className="py-4 px-3 text-left">Product name</th>
                      <th className="py-4 px-3 text-right">Base Cost</th>
                      <th className="py-4 px-3 text-right">Shipping (US)</th>
                      <th className="py-4 px-3 text-right">Variants</th>
                      <th className="py-4 px-3 text-center">Routing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((o, i) => (
                      <tr key={o.blankId} className={i % 2 === 1 ? 'bg-surface-container-lowest' : ''}>
                        <td className="py-4 px-3">
                          <div className="flex items-center gap-2">
                            <OfferBadge slug={o.supplierSlug} name={o.supplier} />
                            {i === 0 && (
                              <span className="text-[11px] font-semibold text-primary">Primary (cheapest)</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-3 text-on-surface-variant">{o.name}</td>
                        <td className="py-4 px-3 text-right tabular-nums font-semibold">{money(o.cost)}</td>
                        <td className="py-4 px-3 text-right tabular-nums">{o.shipping != null ? money(o.shipping) : '—'}</td>
                        <td className="py-4 px-3 text-right tabular-nums">{o.variantCount}</td>
                        <td className="py-4 px-3 text-center">
                          <span className="text-[12px] text-on-surface-variant">{i === 0 ? 'Primary' : 'Backup'}</span>
                        </td>
                      </tr>
                    ))}
                    {offers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-on-surface-variant">
                          One supplier ({activeSupplier}) carries this product — {money(baseCost)} base cost.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                {offers.length > 1 && (
                  <div className="bg-surface-container-low p-5 rounded-lg border border-surface-dim flex items-start gap-4">
                    <span className="material-symbols-outlined text-[24px] text-primary">info</span>
                    <div className="text-[14px] text-on-surface leading-relaxed">
                      <strong>Smart Routing Active:</strong> Orders route to{' '}
                      <strong>{offers[0].supplier}</strong> by default (lowest base cost
                      {offers[0].shipping != null ? ` + ${money(offers[0].shipping)} shipping` : ''}). Backup:{' '}
                      {offers.slice(1).map((o) => o.supplier).join(', ')}.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab 4: Fulfillment Routing ── */}
            {tab === 'fulfillment' && (
              <div className="bg-white border border-surface-dim rounded-xl p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-[20px] font-semibold mb-2">Fulfillment Routing</h2>
                    <p className="text-[14px] text-on-surface-variant">
                      Where your orders for this product are routed and printed.
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  {(offers.length > 0
                    ? offers.map((o) => ({
                        name: o.supplier,
                        slug: o.supplierSlug,
                        detail: o.name,
                        cost: o.cost,
                        delivery: o.estimatedDeliveryDays,
                      }))
                    : (d.printers ?? []).map((p) => ({
                        name: p.name,
                        slug: p.slug,
                        detail: 'Same product type',
                        cost: p.baseCost,
                        delivery: p.estimatedDelivery?.average ?? null,
                      }))
                  ).map((p, i) => (
                    <div
                      key={`${p.slug}-${i}`}
                      className="border border-surface-dim rounded-lg p-5 flex items-center justify-between"
                      style={{ opacity: i === 0 ? 1 : 0.6 }}
                    >
                      <div className="flex items-center gap-5 min-w-0">
                        <div
                          className="w-12 h-12 bg-surface-container rounded-lg flex items-center justify-center font-bold shrink-0"
                          style={{ color: i === 0 ? '#0a6400' : '#5a6355', fontSize: 16 }}
                        >
                          {p.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-[15px] truncate">{p.name}</div>
                          <div className="text-[13px] text-on-surface-variant truncate">
                            {i === 0 ? 'Primary Routing' : 'Backup Routing'} • {p.detail}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-8 text-[14px] shrink-0">
                        <div className="text-right">
                          <div className="text-on-surface-variant text-[12px]">Base cost</div>
                          <div className="font-semibold">{money(p.cost)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-on-surface-variant text-[12px]">Est. delivery</div>
                          <div className="font-semibold">{p.delivery != null ? `${p.delivery} days` : d.deliveryEstimate || '—'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {offers.length === 0 && (d.printers ?? []).length === 0 && (
                    <div className="py-6 text-center text-on-surface-variant text-[14px]">
                      No routing info on file yet — supplier APIs are being synced.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab 5: Mockups ── */}
            {tab === 'mockups' && (
              <div>
                <div className="flex items-center justify-between mb-5 px-2">
                  <div className="text-[14px] text-on-surface-variant">
                    Showing mockups for <strong className="text-on-surface">{displayName}</strong>
                  </div>
                </div>
                {galleryImages.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {galleryImages.map((im, i) => (
                      <div key={i} className="bg-white border border-surface-dim rounded-lg overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                        <div className="aspect-[4/5] bg-surface-container-low relative">
                          <span
                            className="absolute top-3 right-3 text-white text-[10px] font-bold px-2 py-1 rounded"
                            style={{ background: '#1a1c1e' }}
                          >
                            {(im.supplier ?? d.supplier).toUpperCase()}
                          </span>
                          <img src={im.url} alt={im.label} className="w-full h-full object-cover" />
                        </div>
                        <div className="p-4 border-t border-surface-dim">
                          <div className="text-[13px] font-semibold text-on-surface leading-tight mb-1 capitalize">
                            {im.label}
                          </div>
                          <div className="text-[12px] text-on-surface-variant mb-3">{brand}</div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="flex-1 h-8 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container"
                              onClick={() => setActiveImg(i)}
                            >
                              View
                            </button>
                            <button
                              type="button"
                              className="flex-1 h-8 text-white rounded text-[12px] font-semibold hover:opacity-90"
                              style={{ background: BLUE_DARK }}
                              onClick={handleDesignNow}
                            >
                              Design
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white border border-surface-dim rounded-xl p-10 text-center text-on-surface-variant">
                    No mockup images on file for this product yet — ingest runs when the product is first opened.
                  </div>
                )}
              </div>
            )}

            {/* ── Tab 6: Reviews ── */}
            {tab === 'reviews' && (
              <div className="bg-white border border-surface-dim rounded-xl p-10 text-center">
                <span className="material-symbols-outlined text-[40px] text-outline">reviews</span>
                <h3 className="font-semibold text-[16px] mt-3 mb-1">No reviews yet</h3>
                <p className="text-[13px] text-on-surface-variant">
                  Reviews land here once this product starts selling and the storefront review feed is connected.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
