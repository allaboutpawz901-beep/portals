'use client';
/**
 * CatalogProductsScreen — the global Catalog products list, wired to Supabase.
 * Real rows from the `products` table via /api/products (variant aggregates +
 * order rollups included). Row / name click → ProductProfile (the SAME profile
 * page every product opens — mirroring how every party opens PartyProfile).
 *
 * Row three-dot menu: quick actions WITHOUT losing list context — open
 * profile, edit, add variant, publish/unpublish, archive.
 */
import { useMemo, useState } from 'react';
import {
  useProducts,
  fetchJson,
  type CatalogProductSummary,
} from '@/hooks/useCrmApi';
import { exportToCsv } from '@/lib/csvExport';
import ProductProfile from './ProductProfile';
import ProductFormDrawer, { type ProductFormEditTarget } from './ProductFormDrawer';

interface CatalogProductsScreenProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
  /** Back label for the profile — the group the user came from. */
  backLabel?: string;
}

const money = (n: number | null) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Draft' },
  { id: 'archived', label: 'Archived' },
];

function categoryIcon(name: string | null | undefined): string {
  const s = (name || '').toLowerCase();
  if (s.includes('apparel') || s.includes('tee') || s.includes('shirt') || s.includes('outerwear')) return 'checkroom';
  if (s.includes('mug') || s.includes('tumbler')) return 'local_cafe';
  if (s.includes('cap') || s.includes('beanie') || s.includes('headwear')) return 'sports_baseball';
  if (s.includes('textile') || s.includes('cushion') || s.includes('blanket')) return 'bed';
  if (s.includes('wellness') || s.includes('self-care')) return 'spa';
  if (s.includes('digital')) return 'memory';
  if (s.includes('bundle')) return 'inventory_2';
  return 'category';
}

function editTargetFrom(p: CatalogProductSummary): ProductFormEditTarget {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    category_id: p.category?.id || null,
    brand: p.brand,
    tags: p.tags,
    is_featured: p.is_featured,
    is_new: p.is_new,
    is_best_seller: p.is_best_seller,
    is_house_favorite: p.is_house_favorite,
    fulfillment_type: p.fulfillment_type,
  };
}

export default function CatalogProductsScreen({ onToast, onNavigate, backLabel }: CatalogProductsScreenProps) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profileId, setProfileId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [rowEditId, setRowEditId] = useState<string | null>(null);

  // Client-side status filter on top of the cached list (search is debounced
  // by the API query param — we pass it straight through).
  const { data: products, loaded, refresh: refetch } = useProducts(search, 'all');

  const filtered = useMemo(
    () => tab === 'all' ? products : products.filter(p => p.status === tab),
    [products, tab],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: products.length };
    for (const t of STATUS_TABS) {
      if (t.id === 'all') continue;
      counts[t.id] = products.filter(p => p.status === t.id).length;
    }
    return counts;
  }, [products]);

  // Summary KPIs
  const totalVariants = filtered.reduce((s, p) => s + p.variant_count, 0);
  const totalUnits = filtered.reduce((s, p) => s + p.units_sold, 0);
  const totalRevenue = filtered.reduce((s, p) => s + p.revenue, 0);

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  }

  function handleExport() {
    exportToCsv(filtered.map(p => ({
      name: p.name, status: p.status, category: p.category?.name || '',
      brand: p.brand || '', variants: p.variant_count,
      price_min: p.price_min ?? '', price_max: p.price_max ?? '',
      units_sold: p.units_sold, revenue: p.revenue,
      updated: p.updated_at ? p.updated_at.slice(0, 10) : '',
    })), [
      { key: 'name', label: 'Product' }, { key: 'status', label: 'Status' },
      { key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' },
      { key: 'variants', label: 'Variants' }, { key: 'price_min', label: 'Price min' },
      { key: 'price_max', label: 'Price max' }, { key: 'units_sold', label: 'Units sold' },
      { key: 'revenue', label: 'Revenue' }, { key: 'updated', label: 'Updated' },
    ], 'catalog-products');
    onToast(`Exported ${filtered.length} products`);
  }

  /** Row quick action — publish/unpublish without opening the profile. */
  async function rowTogglePublish(p: CatalogProductSummary) {
    setRowMenuForId(null);
    const next = p.status === 'published' ? 'draft' : 'published';
    const res = await fetchJson(`/api/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
    onToast(res.ok ? `${p.name} → ${next}` : `Update failed: ${res.error}`);
    if (res.ok) refetch();
  }

  /** Row quick action — archive without opening the profile. */
  async function rowArchive(p: CatalogProductSummary) {
    setRowMenuForId(null);
    if (!confirm(`Archive "${p.name}"? Variants and order history are kept.`)) return;
    const res = await fetchJson(`/api/products/${p.id}`, { method: 'DELETE' });
    onToast(res.ok ? `Archived: ${p.name}` : `Archive failed: ${res.error}`);
    if (res.ok) refetch();
  }

  /** Bulk publish — PATCH status on every selected row. */
  async function bulkSetStatus(status: string) {
    const sel = [...selected];
    let done = 0;
    for (const id of sel) {
      const res = await fetchJson(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (res.ok) done++;
    }
    onToast(`${status} applied to ${done} of ${sel.length} products`);
    setSelected(new Set());
    refetch();
  }

  // ── PRODUCT PROFILE — full-page takeover, same pattern as PartyProfile ──
  if (profileId) {
    const p = products.find(x => x.id === profileId) || null;
    return (
      <ProductProfile
        productId={profileId}
        summary={p}
        backLabel={backLabel || 'Products'}
        onToast={onToast}
        onBack={() => setProfileId(null)}
        onNavigate={onNavigate}
      />
    );
  }

  const rowEditTarget = rowEditId ? (() => {
    const p = products.find(x => x.id === rowEditId);
    return p ? editTargetFrom(p) : null;
  })() : null;

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-headline-lg">Products</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            From Supabase products · {products.length} total · click a name to open the product profile
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => setShowCreate(true)}>
            <span className="material-symbols-outlined text-[16px]">add</span>New product
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Products</div>
          <div className="text-headline-sm tabular-nums">{filtered.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Variants</div>
          <div className="text-headline-sm tabular-nums">{totalVariants}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Units sold</div>
          <div className="text-headline-sm tabular-nums text-primary">{totalUnits}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Revenue</div>
          <div className="text-headline-sm tabular-nums text-secondary">{money(totalRevenue)}</div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 mb-3 border-b border-surface-dim">
        {STATUS_TABS.map(t => (
          <button key={t.id} className={`px-3 py-2 text-label-md tab-underline ${tab === t.id ? 'active' : 'text-on-surface-variant'}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="text-on-surface-variant">({tabCounts[t.id] || 0})</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <span className="material-symbols-outlined absolute left-2 top-1.5 text-[16px] text-on-surface-variant">search</span>
          <input className="w-full h-8 pl-8 pr-3 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search by name, brand, tag…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-3 py-2 w-8"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Variants</th>
                <th className="px-3 py-2 text-right">Units</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-2 py-2 w-10 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {!loaded && products.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-on-surface-variant/60">Fetching from Supabase…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-on-surface-variant">No products found.</td></tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => setProfileId(p.id)}>
                    <td className="px-3 py-2" onClick={e => { e.stopPropagation(); }}>
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleRow(p.id)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[15px] text-on-surface-variant">{categoryIcon(p.category?.name)}</span>
                        </div>
                        <div className="min-w-0">
                          {/* THE item name — opens the ProductProfile page */}
                          <button className="font-medium truncate text-left hover:text-primary hover:underline" onClick={e => { e.stopPropagation(); setProfileId(p.id); }}>
                            {p.name}
                          </button>
                          <div className="text-[11px] text-on-surface-variant truncate">
                            {p.brand || p.slug}
                            {p.is_best_seller && <span className="ml-1 text-secondary font-semibold">· Best seller</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[12px]">{p.category?.name || '—'}</td>
                    <td className="px-3 py-2">
                      <span className={`pill status role ${p.status === 'published' ? 'customer' : p.status === 'draft' ? 'contact' : 'vendor'}`}>{p.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[12px]">
                      {p.price_min == null ? '—' : p.price_min === p.price_max ? money(p.price_min) : `${money(p.price_min)}–${money(p.price_max)}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.variant_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.units_sold}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(p.revenue)}</td>
                    <td className="px-2 py-2 text-right relative">
                      <button
                        className="w-7 h-7 rounded border border-surface-dim hover:bg-surface-container flex items-center justify-center mx-auto"
                        title="Quick actions"
                        aria-label={`Quick actions for ${p.name}`}
                        onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === p.id ? null : p.id); }}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                      {rowMenuForId === p.id && (
                        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 210 }} onClick={e => e.stopPropagation()}>
                          <div className="menu-header">{p.name}</div>
                          <button onClick={() => { setRowMenuForId(null); setProfileId(p.id); }}><span className="material-symbols-outlined">inventory_2</span>Open profile</button>
                          <button onClick={() => { setRowMenuForId(null); setRowEditId(p.id); }}><span className="material-symbols-outlined">edit</span>Edit product</button>
                          <button onClick={() => rowTogglePublish(p)}>
                            <span className="material-symbols-outlined">{p.status === 'published' ? 'unpublished' : 'publish'}</span>
                            {p.status === 'published' ? 'Unpublish (draft)' : 'Publish'}
                          </button>
                          <div className="sep"></div>
                          <button className="danger" onClick={() => rowArchive(p)}><span className="material-symbols-outlined">archive</span>Archive</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-surface-dim text-[11px] text-on-surface-variant flex items-center justify-between">
          <span>{filtered.length} of {products.length} products</span>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span>{selected.size} selected</span>
              <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => bulkSetStatus('published')}>Publish</button>
              <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => bulkSetStatus('draft')}>Unpublish</button>
              <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => bulkSetStatus('archived')}>Archive</button>
            </div>
          )}
        </div>
      </div>

      {/* Click-away for the row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* Create — the canonical ProductFormDrawer */}
      <ProductFormDrawer
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={(_name, mode) => { refetch(); if (mode === 'created') setShowCreate(false); }}
        onToast={onToast}
      />

      {/* Edit from a row quick action — same canonical drawer, prefilled */}
      <ProductFormDrawer
        open={!!rowEditTarget}
        editing={rowEditTarget}
        onClose={() => setRowEditId(null)}
        onSaved={() => { refetch(); }}
        onToast={onToast}
      />
    </main>
  );
}
