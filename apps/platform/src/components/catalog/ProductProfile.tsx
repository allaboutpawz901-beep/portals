'use client';
/**
 * ProductProfile — the ONE full-page profile for every catalog product.
 *
 * Mirrors PartyProfile (the customer profile) exactly in structure:
 *   • Top action bar — back link, breadcrumb, Archive / Edit / New variant
 *   • Profile card — product art, name, status pills, spec grid, stats card
 *   • Tabs — Product (overview) · Variants · Orders · Shipping · Pricing ·
 *     Associated designs
 *
 * Data flow (instant-render pattern, same as PartyProfile):
 *   1. Renders immediately from the `summary` prop (cached list row).
 *   2. Background-fetches the full record via useProduct(id) →
 *      GET /api/products/[id], which returns product + variants + orders +
 *      shipping + pricing + designs in one unified shape.
 */
import { useState } from 'react';
import {
  useProduct,
  fetchJson,
  type CatalogProductSummary,
  type ProductVariantRow,
} from '@/hooks/useCrmApi';
import { exportToCsv } from '@/lib/csvExport';
import ProductFormDrawer, { type ProductFormEditTarget } from './ProductFormDrawer';

type Tab = 'product' | 'variants' | 'orders' | 'shipping' | 'pricing' | 'designs';

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'product', label: 'Product' },
  { id: 'variants', label: 'Variants' },
  { id: 'orders', label: 'Orders' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'designs', label: 'Associated designs' },
];

/** Category icon by slug/name — used for the product tile. */
function categoryIcon(category: { name?: string; slug?: string } | null | undefined): string {
  const s = (category?.slug || category?.name || '').toLowerCase();
  if (s.includes('apparel') || s.includes('tee') || s.includes('shirt') || s.includes('outerwear')) return 'checkroom';
  if (s.includes('mug') || s.includes('tumbler')) return 'local_cafe';
  if (s.includes('cap') || s.includes('beanie') || s.includes('headwear')) return 'sports_baseball';
  if (s.includes('textile') || s.includes('cushion') || s.includes('blanket')) return 'bed';
  if (s.includes('wellness') || s.includes('self-care')) return 'spa';
  if (s.includes('digital')) return 'memory';
  if (s.includes('bundle')) return 'inventory_2';
  return 'category';
}

interface ProductProfileProps {
  productId: string;
  /** Instant-render summary from the cached list row. */
  summary?: CatalogProductSummary | null;
  /** Label for the back button — the screen the user traveled FROM. */
  backLabel?: string;
  onToast: (m: string) => void;
  onBack: () => void;
  onNavigate?: (d: string, s: string) => void;
}

export default function ProductProfile({ productId, summary, backLabel, onToast, onBack, onNavigate }: ProductProfileProps) {
  const { data: detail, loaded, refresh } = useProduct(productId);
  const [tab, setTab] = useState<Tab>('product');
  const [editOpen, setEditOpen] = useState(false);
  const [variantDrawerOpen, setVariantDrawerOpen] = useState(false);
  // New-variant drawer state
  const [vSku, setVSku] = useState('');
  const [vSize, setVSize] = useState('');
  const [vColor, setVColor] = useState('');
  const [vPrice, setVPrice] = useState('');
  const [vCompare, setVCompare] = useState('');
  const [vStock, setVStock] = useState('');
  const [saving, setSaving] = useState(false);

  const product = detail?.product;
  const variants = detail?.variants || [];
  const orders = detail?.orders || [];
  const stats = detail?.stats;
  const designs = detail?.designs || [];
  const shipping = detail?.shipping;

  // Instant-render fallback while the full record loads.
  const displayName = product?.name || summary?.name || 'Unnamed product';
  const displayStatus = product?.status || summary?.status || 'draft';
  const displayCategory = product?.category || summary?.category || null;
  const sampleMockup = designs.find(d => d.sample_mockup)?.sample_mockup || null;

  const editTarget: ProductFormEditTarget | null = product ? {
    id: product.id,
    name: product.name,
    description: product.description,
    status: product.status,
    category_id: product.category?.id || null,
    brand: product.brand,
    tags: product.tags,
    is_featured: product.is_featured,
    is_new: product.is_new,
    is_best_seller: product.is_best_seller,
    is_house_favorite: product.is_house_favorite,
    fulfillment_type: product.fulfillment_type,
  } : summary ? {
    id: summary.id,
    name: summary.name,
    description: summary.description,
    status: summary.status,
    category_id: summary.category?.id || null,
    brand: summary.brand,
    tags: summary.tags,
    is_featured: summary.is_featured,
    is_new: summary.is_new,
    is_best_seller: summary.is_best_seller,
    is_house_favorite: summary.is_house_favorite,
    fulfillment_type: summary.fulfillment_type,
  } : null;

  async function handleArchive() {
    if (!confirm(`Archive "${displayName}"? Variants and order history are kept.`)) return;
    const res = await fetchJson(`/api/products/${productId}`, { method: 'DELETE' });
    if (res.ok) { onToast('Product archived'); onBack(); }
    else onToast(`Archive failed: ${res.error}`);
  }

  function handlePrint() { window.print(); }

  /** REAL export — downloads the active tab's data as CSV. */
  function handleExport() {
    if (tab === 'variants' || (tab === 'pricing' && !product)) {
      exportToCsv(variants.map(v => ({
        sku: v.sku, size: v.size || '', color: v.color || '',
        price: v.price, compare_at: v.compare_at_price ?? '',
        status: v.status, stock: v.stock_quantity ?? '',
      })), [
        { key: 'sku', label: 'SKU' }, { key: 'size', label: 'Size' }, { key: 'color', label: 'Color' },
        { key: 'price', label: 'Price' }, { key: 'compare_at', label: 'Compare at' },
        { key: 'status', label: 'Status' }, { key: 'stock', label: 'Stock' },
      ], `${displayName}-variants`);
    } else if (tab === 'orders') {
      exportToCsv(orders.map(o => ({
        order_number: o.order_number, placed_at: o.placed_at ? o.placed_at.slice(0, 10) : '',
        customer: o.customer_name, destination: o.destination, status: o.status,
        qty: o.qty, line_total: o.line_total, order_total: o.order_total,
      })), [
        { key: 'order_number', label: 'Order' }, { key: 'placed_at', label: 'Placed' },
        { key: 'customer', label: 'Customer' }, { key: 'destination', label: 'Destination' },
        { key: 'status', label: 'Status' }, { key: 'qty', label: 'Qty' },
        { key: 'line_total', label: 'Product total' }, { key: 'order_total', label: 'Order total' },
      ], `${displayName}-orders`);
    } else if (tab === 'designs') {
      exportToCsv(designs.map(d => ({
        name: d.name, status: d.status, retail_price: d.retail_price ?? '',
        publications: d.publications, latest_published_at: d.latest_published_at ? d.latest_published_at.slice(0, 10) : '',
      })), [
        { key: 'name', label: 'Design' }, { key: 'status', label: 'Status' },
        { key: 'retail_price', label: 'Retail price' }, { key: 'publications', label: 'Publications' },
        { key: 'latest_published_at', label: 'Last published' },
      ], `${displayName}-designs`);
    } else {
      exportToCsv([{
        name: displayName, status: displayStatus,
        category: displayCategory?.name || '', brand: product?.brand || '',
        variants: stats?.variant_count ?? summary?.variant_count ?? 0,
        price_min: stats?.price_min ?? summary?.price_min ?? '',
        price_max: stats?.price_max ?? summary?.price_max ?? '',
        units_sold: stats?.units_sold ?? summary?.units_sold ?? 0,
        revenue: stats?.revenue ?? summary?.revenue ?? 0,
      }], [
        { key: 'name', label: 'Product' }, { key: 'status', label: 'Status' },
        { key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' },
        { key: 'variants', label: 'Variants' }, { key: 'price_min', label: 'Price min' },
        { key: 'price_max', label: 'Price max' }, { key: 'units_sold', label: 'Units sold' },
        { key: 'revenue', label: 'Revenue' },
      ], `${displayName}-summary`);
    }
    onToast(`Exported ${displayName} — file downloaded`);
  }

  async function handleAddVariant() {
    const priceNum = Number(vPrice);
    if (vPrice === '' || Number.isNaN(priceNum) || priceNum < 0) {
      onToast('Price is required (≥ 0)');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchJson(`/api/products/${productId}/variants`, {
        method: 'POST',
        body: JSON.stringify({
          sku: vSku.trim() || null,
          size: vSize.trim() || null,
          color: vColor.trim() || null,
          price: priceNum,
          compare_at_price: vCompare.trim() ? Number(vCompare) : null,
          stock_quantity: vStock.trim() ? Number(vStock) : null,
        }),
      });
      if (res.ok) {
        onToast('Variant created');
        setVariantDrawerOpen(false);
        setVSku(''); setVSize(''); setVColor(''); setVPrice(''); setVCompare(''); setVStock('');
        setTab('variants');
        refresh();
      } else {
        onToast(`Save failed: ${res.error}`);
      }
    } finally {
      setSaving(false);
    }
  }

  /** Inline variant edits (Pricing/Variants tabs) — PATCH /api/variants/[id]. */
  async function saveVariantField(v: ProductVariantRow, field: string, rawValue: string) {
    let value: unknown = rawValue;
    if (field === 'price' || field === 'compare_at_price' || field === 'stock_quantity') {
      value = rawValue === '' ? null : Number(rawValue);
      if (field === 'price' && (value === null || Number.isNaN(value as number) || (value as number) < 0)) {
        onToast('Price must be a number ≥ 0');
        return;
      }
    }
    const res = await fetchJson(`/api/variants/${v.id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) });
    if (res.ok) { onToast(`${v.sku}: ${field.replace('_', ' ')} updated`); refresh(); }
    else onToast(`Update failed: ${res.error}`);
  }

  return (
    <main className="flex flex-col h-full overflow-hidden bg-background">
      {/* ═══ TOP ACTION BAR ═══ */}
      <header className="h-14 px-6 flex items-center justify-between bg-white border-b border-surface-dim shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button className="flex items-center gap-1 text-primary font-semibold text-[13px] hover:underline shrink-0" onClick={onBack}>
            <span className="material-symbols-outlined text-[16px]">arrow_back_ios</span>{backLabel || 'Products'}
          </button>
          <span className="text-on-surface-variant text-[12px] truncate">/ {displayName}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button className="icon-btn" title="Print" onClick={handlePrint}><span className="material-symbols-outlined text-[18px]">print</span></button>
          <button className="icon-btn" title="Export tab data" onClick={handleExport}><span className="material-symbols-outlined text-[18px]">download</span></button>
          <button className="h-8 px-3 border border-error/60 text-error rounded bg-white text-[13px] font-semibold hover:bg-error-container" onClick={handleArchive}>Archive</button>
          <button className="h-8 px-3 border border-surface-dim rounded bg-white text-[13px] font-semibold hover:bg-surface-container" onClick={() => setEditOpen(true)}>Edit</button>
          <button
            className="h-8 px-3 bg-primary text-white text-[13px] font-semibold rounded hover:bg-primary-container flex items-center gap-1"
            onClick={() => setVariantDrawerOpen(true)}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>New variant
          </button>
        </div>
      </header>

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto p-6">
        {!loaded && !detail ? (
          <div className="flex items-center justify-center py-16 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-[32px] mr-2">progress_activity</span>
            Loading product…
          </div>
        ) : (
        <>
        {/* ── PROFILE CARD ── */}
        <div className="bg-white border border-surface-dim rounded-xl p-6 flex gap-6 mb-4">
          {/* Product art + name */}
          <div className="w-1/4 flex flex-col items-center justify-center text-center border-r border-surface-dim pr-6">
            <div className="w-20 h-20 rounded-xl bg-surface-container flex items-center justify-center mb-3 overflow-hidden shrink-0">
              {sampleMockup ? (
                <img src={sampleMockup} alt={`${displayName} mockup`} className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-[36px] text-on-surface-variant">{categoryIcon(displayCategory)}</span>
              )}
            </div>
            <h1 className="text-[20px] font-semibold mb-1 leading-tight">{displayName}</h1>
            <div className="text-[12px] text-on-surface-variant mb-3">{product?.slug || summary?.slug || ''}</div>
            <div className="flex items-center gap-2 mb-2 flex-wrap justify-center">
              <span className={`pill status role ${displayStatus === 'published' ? 'customer' : displayStatus === 'draft' ? 'contact' : 'vendor'}`}>{displayStatus}</span>
              {displayCategory && <span className="pill tag">{displayCategory.name}</span>}
              {product?.fulfillment_type && <span className="pill tag">{product.fulfillment_type}</span>}
              {(product?.is_best_seller ?? summary?.is_best_seller) && <span className="pill tag">Best seller</span>}
              {(product?.is_new ?? summary?.is_new) && <span className="pill tag">New</span>}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high"
                title="Start a design in the Studio"
                onClick={() => { if (onNavigate) { onNavigate('design', 'new-design'); onToast(`${displayName} — studio opened`); } }}
              >
                <span className="material-symbols-outlined text-[18px]">palette</span>
              </button>
              <button
                className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high"
                title="Add a variant"
                onClick={() => setVariantDrawerOpen(true)}
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
              </button>
            </div>
          </div>

          {/* Spec grid */}
          <div className="flex-1 grid grid-cols-2 gap-6 text-[13px]">
            <div className="space-y-4">
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">Category</div>
                {displayCategory ? displayCategory.name : <button className="text-primary hover:underline" onClick={() => setEditOpen(true)}>Add category</button>}
              </div>
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">Brand</div>
                {product?.brand ? <span>{product.brand}</span> : <button className="text-primary hover:underline" onClick={() => setEditOpen(true)}>Add brand</button>}
              </div>
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">Tags</div>
                {(product?.tags || summary?.tags || []).length > 0
                  ? <span className="flex flex-wrap gap-1">{(product?.tags || summary?.tags || []).map(t => <span key={t} className="pill tag">{t}</span>)}</span>
                  : <button className="text-primary hover:underline" onClick={() => setEditOpen(true)}>Add tags</button>}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">Price range</div>
                <span className="tabular-nums">
                  {stats?.price_min != null || summary?.price_min != null
                    ? (stats?.price_min ?? summary?.price_min) === (stats?.price_max ?? summary?.price_max)
                      ? money(stats?.price_min ?? summary?.price_min)
                      : `${money(stats?.price_min ?? summary?.price_min)} – ${money(stats?.price_max ?? summary?.price_max)}`
                    : '—'}
                </span>
              </div>
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">Fulfillment</div>
                <span className="capitalize">{product?.fulfillment_type || summary?.fulfillment_type || 'stocked'}</span>
              </div>
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">Updated</div>
                <span>{product?.updated_at ? `${daysSince(product.updated_at)}d ago · ${fmtDate(product.updated_at)}` : fmtDate(summary?.updated_at)}</span>
              </div>
            </div>
          </div>

          {/* Stats summary */}
          <div className="w-64 shrink-0 bg-[#eef5fa] rounded-lg p-4">
            <h3 className="font-semibold text-[14px] mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">inventory_2</span>
              Product summary
            </h3>
            <div className="mb-4">
              <div className="flex items-center gap-1 text-[12px] text-on-surface-variant mb-1"><span className="w-2 h-2 rounded-full bg-secondary"></span>Variants</div>
              <div className="text-[20px] font-semibold text-on-surface">
                {stats?.variant_count ?? summary?.variant_count ?? 0}
                <span className="text-[12px] font-normal text-on-surface-variant ml-1">
                  ({stats?.active_variant_count ?? summary?.active_variant_count ?? 0} active)
                </span>
              </div>
            </div>
            <div className="mb-4">
              <div className="flex items-center gap-1 text-[12px] text-on-surface-variant mb-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>Units sold</div>
              <div className="text-[20px] font-semibold text-on-surface">{stats?.units_sold ?? summary?.units_sold ?? 0}</div>
            </div>
            <div className="mb-4">
              <div className="flex items-center gap-1 text-[12px] text-on-surface-variant mb-1"><span className="w-2 h-2 rounded-full bg-primary"></span>Revenue</div>
              <div className="text-[20px] font-semibold text-on-surface">{money(stats?.revenue ?? summary?.revenue ?? 0)}</div>
            </div>
            <div className="pt-3 border-t border-surface-dim grid grid-cols-2 gap-2 text-[12px]">
              <div><div className="text-on-surface-variant">Orders</div><div className="font-semibold">{stats?.order_count ?? summary?.order_count ?? 0}</div></div>
              <div><div className="text-on-surface-variant">Designs</div><div className="font-semibold">{stats?.design_count ?? 0}</div></div>
              <div><div className="text-on-surface-variant">Published</div><div className="font-semibold">{fmtDate(product?.published_at)}</div></div>
              <div><div className="text-on-surface-variant">Added</div><div className="font-semibold">{fmtDate(product?.created_at ?? summary?.created_at)}</div></div>
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="border-b border-surface-dim mb-4 overflow-x-auto">
          <div className="flex items-center gap-6 min-w-max">
            {TABS.map(t => (
              <button key={t.id} className={`pb-3 text-[14px] tab-underline ${tab === t.id ? 'active' : 'text-on-surface-variant hover:text-on-surface'} flex items-center gap-2`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === 'variants' && variants.length > 0 && <span className="text-[11px] text-on-surface-variant">({variants.length})</span>}
                {t.id === 'orders' && orders.length > 0 && <span className="text-[11px] text-on-surface-variant">({orders.length})</span>}
                {t.id === 'designs' && designs.length > 0 && <span className="text-[11px] text-on-surface-variant">({designs.length})</span>}
              </button>
            ))}
          </div>
        </div>

        {/* ═══ TAB PANES ═══ */}

        {/* 1. Product — overview / details */}
        {tab === 'product' && (
          <div className="bg-white border border-surface-dim rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-[15px]">Product details</h3>
              <button className="h-8 px-3 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container flex items-center gap-1" onClick={() => setEditOpen(true)}>
                <span className="material-symbols-outlined text-[16px]">edit</span>Edit details
              </button>
            </div>
            <div className="grid grid-cols-2 gap-8 text-[13px]">
              <div className="space-y-5">
                <div>
                  <div className="font-semibold text-on-surface-variant mb-1">Description</div>
                  <p className="text-on-surface whitespace-pre-wrap">{product?.description || 'No description yet.'}</p>
                </div>
                <div>
                  <div className="font-semibold text-on-surface-variant mb-1">Short description</div>
                  <p className="text-on-surface">{product?.short_description || '—'}</p>
                </div>
                <div>
                  <div className="font-semibold text-on-surface-variant mb-1">Details</div>
                  <p className="text-on-surface whitespace-pre-wrap">{product?.details || '—'}</p>
                </div>
              </div>
              <div className="space-y-5">
                <div>
                  <div className="font-semibold text-on-surface-variant mb-1">Specifications</div>
                  <p className="text-on-surface whitespace-pre-wrap">{product?.specifications || '—'}</p>
                </div>
                <div>
                  <div className="font-semibold text-on-surface-variant mb-1">Directions</div>
                  <p className="text-on-surface whitespace-pre-wrap">{product?.directions || '—'}</p>
                </div>
                <div>
                  <div className="font-semibold text-on-surface-variant mb-1">Warnings</div>
                  <p className="text-on-surface whitespace-pre-wrap">{product?.warnings || '—'}</p>
                </div>
                <div>
                  <div className="font-semibold text-on-surface-variant mb-1">Record</div>
                  <div className="text-on-surface-variant text-[12px] space-y-1">
                    <div>ID: <span className="font-mono">{productId.slice(0, 8)}</span></div>
                    <div>Slug: {product?.slug || summary?.slug || '—'}</div>
                    <div>Owner: <span className="capitalize">{product?.owner_type || 'platform'}</span></div>
                    <div>Created: {fmtDate(product?.created_at ?? summary?.created_at)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. Variants */}
        {tab === 'variants' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <select className="h-8 px-3 border border-surface-dim rounded text-[13px] bg-white">
                  <option>All variants</option><option>Active</option><option>Inactive</option><option>Discontinued</option>
                </select>
              </div>
              <button className="h-8 px-3 bg-primary text-white text-[13px] font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => setVariantDrawerOpen(true)}>
                <span className="material-symbols-outlined text-[16px]">add</span>New variant
              </button>
            </div>
            {variants.length === 0 ? (
              <div className="bg-white border border-surface-dim rounded-xl p-10 text-center">
                <span className="material-symbols-outlined text-[40px] text-on-surface-variant/50">style</span>
                <h3 className="font-semibold text-[15px] mt-2">No variants yet</h3>
                <p className="text-[13px] text-on-surface-variant mt-1 mb-4">Variants are the size/color/SKU combinations customers buy.</p>
                <button className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container" onClick={() => setVariantDrawerOpen(true)}>Create first variant</button>
              </div>
            ) : (
              <div className="bg-white border border-surface-dim rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="data-table">
                    <thead className="sticky top-0 bg-white">
                      <tr>
                        <th>SKU</th><th>Size</th><th>Color</th>
                        <th className="text-right">Price</th><th className="text-right">Compare at</th>
                        <th>Stock</th><th>Status</th><th className="text-right">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variants.map(v => (
                        <tr key={v.id}>
                          <td className="font-mono text-[12px]">{v.sku}</td>
                          <td>{v.size || '—'}</td>
                          <td>
                            <span className="flex items-center gap-2">
                              {v.color ? <>
                                <span className="w-3 h-3 rounded-full border border-surface-dim inline-block" style={{ background: /^#/.test(v.color) ? v.color : 'transparent' }} />
                                {v.color}
                              </> : '—'}
                            </span>
                          </td>
                          <td className="text-right tabular-nums">{money(v.price)}</td>
                          <td className="text-right tabular-nums text-on-surface-variant">{money(v.compare_at_price)}</td>
                          <td>{v.stock_quantity != null ? v.stock_quantity : (v.in_stock == null ? '—' : v.in_stock ? 'In stock' : 'Out')}</td>
                          <td><span className={`pill status role ${v.status === 'active' ? 'customer' : 'contact'}`}>{v.status}</span></td>
                          <td className="text-right text-[11px] text-on-surface-variant">{fmtDate(v.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Orders */}
        {tab === 'orders' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-[13px] text-on-surface-variant">
                {orders.length} order{orders.length === 1 ? '' : 's'} contain this product · {stats?.units_sold ?? 0} units · {money(stats?.revenue ?? 0)} product revenue
              </div>
            </div>
            {orders.length === 0 ? (
              <div className="bg-white border border-surface-dim rounded-xl p-10 text-center">
                <span className="material-symbols-outlined text-[40px] text-on-surface-variant/50">receipt_long</span>
                <h3 className="font-semibold text-[15px] mt-2">No orders yet</h3>
                <p className="text-[13px] text-on-surface-variant mt-1">Orders that include a variant of this product appear here.</p>
              </div>
            ) : (
              <div className="bg-white border border-surface-dim rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="data-table">
                    <thead className="sticky top-0 bg-white">
                      <tr>
                        <th>Order</th><th>Placed</th><th>Customer</th><th>Destination</th>
                        <th className="text-right">Qty</th><th className="text-right">Product total</th>
                        <th className="text-right">Order total</th><th>Status</th><th>Shipping</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr key={o.id}>
                          <td className="font-mono text-[12px]">{o.order_number}</td>
                          <td className="text-[12px]">{fmtDate(o.placed_at)}</td>
                          <td>
                            <div className="text-[12px]">{o.customer_name}</div>
                            {o.customer_email && <div className="text-[11px] text-on-surface-variant">{o.customer_email}</div>}
                          </td>
                          <td className="text-[12px]">{o.destination}</td>
                          <td className="text-right tabular-nums">{o.qty}</td>
                          <td className="text-right tabular-nums">{money(o.line_total)}</td>
                          <td className="text-right tabular-nums">{money(o.order_total)}</td>
                          <td><span className={`pill status role ${o.status === 'paid' ? 'customer' : 'contact'}`}>{o.status}</span></td>
                          <td className="text-[11px] text-on-surface-variant">
                            {o.shipping_method || '—'}
                            {o.shipping_cost != null && <div>{money(o.shipping_cost)}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4. Shipping */}
        {tab === 'shipping' && (
          <div className="space-y-4">
            {/* Observed on orders */}
            <div className="bg-white border border-surface-dim rounded-xl p-6">
              <h3 className="font-semibold text-[15px] mb-1">Observed on orders</h3>
              <p className="text-[12px] text-on-surface-variant mb-4">Shipping methods customers actually chose on orders containing this product.</p>
              {(shipping?.observed || []).length === 0 ? (
                <div className="text-[13px] text-on-surface-variant py-4 text-center">No shipped orders yet.</div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Method</th><th className="text-right">Orders</th><th className="text-right">Avg cost</th><th>Last used</th></tr></thead>
                  <tbody>
                    {(shipping?.observed || []).map(m => (
                      <tr key={m.method}>
                        <td>{m.method}</td>
                        <td className="text-right tabular-nums">{m.orders}</td>
                        <td className="text-right tabular-nums">{money(m.avg_cost)}</td>
                        <td className="text-[12px] text-on-surface-variant">{fmtDate(m.last_used)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {/* Supplier rate card */}
            <div className="bg-white border border-surface-dim rounded-xl p-6">
              <h3 className="font-semibold text-[15px] mb-1">Supplier rate card</h3>
              <p className="text-[12px] text-on-surface-variant mb-4">
                Default shipping profiles by supplier. Link a supplier on the product to pin its rates here.
              </p>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="data-table">
                  <thead className="sticky top-0 bg-white"><tr><th>Supplier</th><th>Profile</th><th>Method</th><th>Origin</th><th className="text-right">First item</th><th className="text-right">Addl. item</th><th>Days</th></tr></thead>
                  <tbody>
                    {(shipping?.supplier_rates || []).map((r, i) => (
                      <tr key={`${r.supplier_name}-${r.profile_name}-${i}`}>
                        <td className="font-medium">{r.supplier_name}</td>
                        <td>{r.profile_name}</td>
                        <td>{r.method_name}</td>
                        <td className="text-[12px]">{r.origin_country || '—'}</td>
                        <td className="text-right tabular-nums">{money(r.first_item_cost)}</td>
                        <td className="text-right tabular-nums">{money(r.additional_item_cost)}</td>
                        <td className="text-[12px]">{r.min_days != null && r.max_days != null ? `${r.min_days}–${r.max_days}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 5. Pricing */}
        {tab === 'pricing' && (
          <div className="space-y-4">
            <div className="bg-white border border-surface-dim rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-[15px]">Variant price matrix</h3>
                  <p className="text-[12px] text-on-surface-variant mt-0.5">Edit inline — saves to product_variants the moment you leave the field.</p>
                </div>
                <div className="text-[12px] text-on-surface-variant">
                  Range {money(stats?.price_min)} – {money(stats?.price_max)}
                </div>
              </div>
              {variants.length === 0 ? (
                <div className="text-[13px] text-on-surface-variant py-4 text-center">No variants to price yet.</div>
              ) : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="data-table">
                    <thead className="sticky top-0 bg-white"><tr><th>SKU</th><th>Size</th><th>Color</th><th className="text-right">Price</th><th className="text-right">Compare at</th><th className="text-right">Effective discount</th></tr></thead>
                    <tbody>
                      {variants.map(v => {
                        const discount = v.compare_at_price && v.compare_at_price > v.price
                          ? Math.round((1 - v.price / v.compare_at_price) * 100) : null;
                        return (
                          <tr key={v.id}>
                            <td className="font-mono text-[12px]">{v.sku}</td>
                            <td>{v.size || '—'}</td>
                            <td>{v.color || '—'}</td>
                            <td className="text-right">
                              <input
                                className="w-20 h-7 px-2 border border-surface-dim rounded text-[12px] text-right tabular-nums"
                                defaultValue={v.price}
                                onBlur={e => { if (e.target.value !== String(v.price)) saveVariantField(v, 'price', e.target.value); }}
                                aria-label={`Price for ${v.sku}`}
                              />
                            </td>
                            <td className="text-right">
                              <input
                                className="w-20 h-7 px-2 border border-surface-dim rounded text-[12px] text-right tabular-nums"
                                defaultValue={v.compare_at_price ?? ''}
                                placeholder="—"
                                onBlur={e => { const cur = v.compare_at_price != null ? String(v.compare_at_price) : ''; if (e.target.value !== cur) saveVariantField(v, 'compare_at_price', e.target.value); }}
                                aria-label={`Compare-at price for ${v.sku}`}
                              />
                            </td>
                            <td className="text-right text-[12px]">{discount != null ? `${discount}% off` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Design retail prices */}
            <div className="bg-white border border-surface-dim rounded-xl p-6">
              <h3 className="font-semibold text-[15px] mb-1">Design retail prices</h3>
              <p className="text-[12px] text-on-surface-variant mb-4">Retail prices set on designs published onto this product.</p>
              {(detail?.pricing.design_prices || []).length === 0 ? (
                <div className="text-[13px] text-on-surface-variant py-4 text-center">No designs with retail prices.</div>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Design</th><th className="text-right">Retail price</th></tr></thead>
                  <tbody>
                    {(detail?.pricing.design_prices || []).map(d => (
                      <tr key={d.design_id}>
                        <td>{d.name}</td>
                        <td className="text-right tabular-nums">{money(d.retail_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 6. Associated designs */}
        {tab === 'designs' && (
          <div>
            {designs.length === 0 ? (
              <div className="bg-white border border-surface-dim rounded-xl p-10 text-center">
                <span className="material-symbols-outlined text-[40px] text-on-surface-variant/50">palette</span>
                <h3 className="font-semibold text-[15px] mt-2">No designs published on this product</h3>
                <p className="text-[13px] text-on-surface-variant mt-1 mb-4">Designs published from the Studio onto a variant appear here.</p>
                <button
                  className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container"
                  onClick={() => { if (onNavigate) { onNavigate('design', 'new-design'); onToast('Studio opened'); } }}
                >
                  Open the Studio
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {designs.map(d => (
                  <div key={d.id} className="bg-white border border-surface-dim rounded-xl overflow-hidden hover:border-primary/40 transition-colors">
                    <div className="aspect-square bg-surface-container flex items-center justify-center overflow-hidden">
                      {d.sample_mockup ? (
                        <img src={d.sample_mockup} alt={`${d.name} mockup`} className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-[40px] text-on-surface-variant/50">palette</span>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="font-medium text-[13px] truncate" title={d.name}>{d.name}</div>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`pill status role ${d.status === 'published' ? 'customer' : d.status === 'approved' ? 'supplier' : 'contact'}`}>{d.status}</span>
                        {d.product_type && <span className="pill tag">{d.product_type}</span>}
                      </div>
                      <div className="text-[11px] text-on-surface-variant mt-2 space-y-0.5">
                        {d.retail_price != null && <div>Retail {money(d.retail_price)}</div>}
                        <div>{d.publications} publication{d.publications === 1 ? '' : 's'}</div>
                        <div>Last published {fmtDate(d.latest_published_at)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>

      {/* Edit — the canonical ProductFormDrawer in editing mode */}
      <ProductFormDrawer
        open={editOpen}
        editing={editTarget}
        onClose={() => setEditOpen(false)}
        onSaved={() => { refresh(); }}
        onToast={onToast}
      />

      {/* New variant drawer */}
      {variantDrawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={() => setVariantDrawerOpen(false)} />
          <div className="drawer open" role="dialog" aria-label={`New variant for ${displayName}`} style={{ width: 480 }}>
            <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
              <div className="min-w-0">
                <h3 className="text-[16px] font-semibold">New variant</h3>
                <div className="text-[11px] text-on-surface-variant truncate">{displayName}</div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setVariantDrawerOpen(false)} aria-label="Close">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="nv-sku">SKU <span className="font-normal text-on-surface-variant">(auto if blank)</span></label>
                  <input id="nv-sku" className="field-input" placeholder="e.g. kin-keeper-mug-15oz" value={vSku} onChange={e => setVSku(e.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="nv-price">Price *</label>
                  <input id="nv-price" className="field-input" type="number" min="0" step="0.01" placeholder="24.00" value={vPrice} onChange={e => setVPrice(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="nv-size">Size</label>
                  <input id="nv-size" className="field-input" placeholder="e.g. XL / 15oz" value={vSize} onChange={e => setVSize(e.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="nv-color">Color</label>
                  <input id="nv-color" className="field-input" placeholder="e.g. White" value={vColor} onChange={e => setVColor(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="nv-compare">Compare-at price</label>
                  <input id="nv-compare" className="field-input" type="number" min="0" step="0.01" placeholder="—" value={vCompare} onChange={e => setVCompare(e.target.value)} />
                </div>
                <div>
                  <label className="field-label" htmlFor="nv-stock">Stock qty</label>
                  <input id="nv-stock" className="field-input" type="number" min="0" placeholder="—" value={vStock} onChange={e => setVStock(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-surface-dim flex justify-end gap-2 shrink-0">
              <button className="h-8 px-4 border border-surface-dim rounded text-[13px] hover:bg-surface-container-low" onClick={() => setVariantDrawerOpen(false)}>Cancel</button>
              <button
                className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-50"
                disabled={vPrice === '' || saving}
                onClick={handleAddVariant}
              >
                {saving ? 'Saving…' : 'Create variant'}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
