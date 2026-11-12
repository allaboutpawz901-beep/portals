'use client';
/**
 * DesignCategoryTable — renders when a Studio Catalog category is selected.
 *
 * TWO selection modes:
 *   - path (preferred): the REAL catalog tree path, e.g.
 *     ['Apparel', 'Women', 'T-Shirts'] — resolved unambiguously by the API.
 *     The screen also offers the node's REAL children as chips (with live
 *     keeper-product counts) so the user can drill deeper, and a clickable
 *     breadcrumb to go back up.
 *   - category/subcategory (legacy TOP_NAV links): kept for old tabs; the
 *     API no longer silently falls back — a subcategory that doesn't exist
 *     under the category returns an honest empty list.
 *
 * TWO view modes (user chooses):
 *   - Cards: ProductCard grid — images, prices, "Design this"
 *   - Table: our table with row checkboxes + three-dot quick-action menu
 *
 * Wired to REAL Printify products from /api/v1/blanks — real images, real
 * prices, real supplier data. Each item lets the user:
 *   - Select & design it → loads blank onto canvas + opens Design drawer
 *   - View product page (opens ProductPageScreen)
 *   - Preview (saves to Collection)
 *   - Save to Collection / My templates
 */
import { useEffect, useMemo, useState } from 'react';
import { listBlanks, type BlankCard, type CategoryNavNode } from '@/lib/podApi';
import ProductCard from './ProductCard';
import {
  useDesignCanvas,
  blankCardToCatalogProduct,
  findCatalogNode,
} from '@/lib/designCanvasStore';
import { exportToCsv } from '@/lib/csvExport';
import { catalogScreenIdForPath, type DomainKey } from '@/data/shellData';

interface DesignCategoryTableProps {
  /** The REAL catalog tree path (root → leaf), e.g. ['Apparel','Women']. */
  path?: string[];
  /** Legacy TOP_NAV category label — used when path is absent. */
  category: string;
  /** Optional legacy subcategory — 'Sweatshirts', etc. */
  subcategory?: string;
  onToast: (m: string) => void;
  onNavigate: (d: DomainKey, screenId: string) => void;
}

const money = (n: number | null) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function categoryIcon(category: string): string {
  const s = category.toLowerCase();
  if (s.includes('women') || s.includes('men') || s.includes('kids')) return 'checkroom';
  if (s.includes('accessor')) return 'diamond';
  if (s.includes('home')) return 'bed';
  if (s.includes('book')) return 'menu_book';
  if (s.includes('pdf')) return 'picture_as_pdf';
  return 'category';
}

export default function DesignCategoryTable({ path, category, subcategory, onToast, onNavigate }: DesignCategoryTableProps) {
  const [blanks, setBlanks] = useState<BlankCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  /** Honest meta from the API — matched:false means the requested node
   * doesn't exist (nothing was silently substituted). */
  const [unmatched, setUnmatched] = useState(false);

  // The real tree (for the node's children chips + keeper counts).
  const navCategories = useDesignCanvas((s) => s.navCategories);

  // Fetch real Printify products from /api/v1/blanks. `path` wins over the
  // legacy category/subcategory pair.
  const pathKey = path?.join('/') ?? null;
  useEffect(() => {
    let cancelled = false;
    const fetchBlanks = async () => {
      setLoading(true);
      setError(null);
      setUnmatched(false);
      try {
        const res = await listBlanks({
          ...(path ? { path, category: path[0] } : { category, subcategory }),
          limit: 100,
        });
        if (!cancelled) {
          setBlanks(res.items);
          setUnmatched(res.meta?.matched === false);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Failed to load products');
          setLoading(false);
        }
      }
    };
    fetchBlanks();
    return () => { cancelled = true; };
  }, [pathKey, category, subcategory]);

  // The current node in the real tree — its children become the drill-down
  // chips (with live keeper-product counts).
  const node: CategoryNavNode | null = useMemo(() => {
    if (!path || !navCategories) return null;
    return findCatalogNode(navCategories, path);
  }, [path, navCategories]);
  const children = useMemo(
    () =>
      (node?.children ?? []).filter((c) => (c.keeperProducts ?? c.totalProducts) > 0),
    [node],
  );

  // Display names: path mode shows the real node names; legacy mode keeps
  // the old labels.
  const crumbSegments: string[] = path ?? [category, ...(subcategory ? [subcategory] : [])];
  const title = path ? path[path.length - 1] : (subcategory || category);

  // Unique suppliers present in this category's products — drives the filter chips.
  const suppliers = useMemo(() => {
    const set = new Set<string>();
    blanks.forEach((b) => { if (b.supplier) set.add(b.supplier); });
    return [...set].sort();
  }, [blanks]);

  const filtered = useMemo(
    () => blanks.filter((b) => {
      // Supplier filter
      if (supplierFilter !== 'all' && b.supplier !== supplierFilter) return false;
      // Search filter
      if (!search) return true;
      return b.name.toLowerCase().includes(search.toLowerCase()) ||
        b.brand.toLowerCase().includes(search.toLowerCase()) ||
        b.supplier.toLowerCase().includes(search.toLowerCase());
    }),
    [blanks, search, supplierFilter],
  );

  const totalVariants = filtered.length;
  const avgPrice = filtered.length > 0
    ? filtered.reduce((s, b) => s + (b.baseCost || 0), 0) / filtered.length
    : 0;

  const loadBlank = useDesignCanvas((s) => s.loadBlank);
  const loadBlankDetail = useDesignCanvas((s) => s.loadBlankDetail);
  const saveToCollection = useDesignCanvas((s) => s.saveToCollection);
  const saveTemplate = useDesignCanvas((s) => s.saveTemplate);
  const openProductPage = useDesignCanvas((s) => s.openProductPage);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  }

  function handleSelectAndDesign(blank: BlankCard) {
    const family = blank.family;
    const blankKey = family === 'drinkware' ? 'mug' : family === 'books' ? 'book' : 'tee';
    loadBlank(blankKey);
    onNavigate('design', 'new-design');
    onToast(`"${blank.name}" loaded onto canvas — Design drawer opened.`);
  }

  function handlePreview(blank: BlankCard) {
    saveToCollection({ name: `${blank.name} — preview`, kind: 'preview' });
    onToast(`Preview saved to Collection: "${blank.name}".`);
  }

  function handleViewProductPage(blank: BlankCard) {
    // Set the product in the store (for instant render) and navigate.
    // The ProductPageScreen fetches the full detail via its own effect.
    // We do NOT call loadBlankDetail here — that sets canvas state.
    openProductPage(blankCardToCatalogProduct(blank, crumbSegments[0] || category, title));
    onNavigate('design', 'product-page');
  }

  function handleSaveAsTemplate(blank: BlankCard) {
    saveTemplate(blank.name);
    onToast(`"${blank.name}" saved as a template.`);
  }

  function handleExport() {
    exportToCsv(filtered.map((b) => ({
      name: b.name, brand: b.brand, supplier: b.supplier,
      price: b.baseCost ?? '', family: b.family, status: b.status,
    })), [
      { key: 'name', label: 'Product' }, { key: 'brand', label: 'Brand' },
      { key: 'supplier', label: 'Supplier' }, { key: 'price', label: 'Price' },
      { key: 'family', label: 'Family' }, { key: 'status', label: 'Status' },
    ], `studio-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${subcategory ? '-' + subcategory.toLowerCase().replace(/[^a-z0-9]+/g, '-') : ''}`);
    onToast(`Exported ${filtered.length} products`);
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Context breadcrumb — clickable in path mode (go back up the tree) */}
      <div className="flex items-center gap-2 text-body-sm text-on-surface-variant py-3 flex-wrap">
        <span className="material-symbols-outlined text-[18px]">grid_view</span>
        <span>Catalog</span>
        {crumbSegments.map((seg, i) => {
          const isLast = i === crumbSegments.length - 1;
          const clickable = !!path && !isLast && i > 0;
          return (
            <span key={`${seg}-${i}`} className="flex items-center gap-2">
              <span className="text-on-surface-variant/40">/</span>
              {clickable ? (
                <button
                  className="hover:text-primary hover:underline"
                  onClick={() => onNavigate('design', catalogScreenIdForPath(path!.slice(0, i + 1)))}
                >
                  {seg}
                </button>
              ) : (
                <span className={isLast ? 'text-on-surface font-medium' : 'text-on-surface-variant'}>{seg}</span>
              )}
            </span>
          );
        })}
      </div>

      {/* Page header — supplier is NOT at the top. Each card shows its own
          supplier (a category has products from multiple suppliers). */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-headline-lg">{title}</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {loading
              ? 'Loading…'
              : unmatched
                ? 'No such category in the catalog'
                : `${filtered.length} products · select and design, or drag to canvas`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Cards/Table toggle */}
          <div className="flex border border-surface-dim rounded overflow-hidden">
            <button
              className={`px-3 py-1.5 text-body-sm flex items-center gap-1 ${viewMode === 'cards' ? 'bg-primary text-white' : 'bg-white text-on-surface-variant hover:bg-surface-container-low'}`}
              onClick={() => setViewMode('cards')}
            >
              <span className="material-symbols-outlined text-[16px]">grid_view</span>
              Cards
            </button>
            <button
              className={`px-3 py-1.5 text-body-sm flex items-center gap-1 ${viewMode === 'table' ? 'bg-primary text-white' : 'bg-white text-on-surface-variant hover:bg-surface-container-low'}`}
              onClick={() => setViewMode('table')}
            >
              <span className="material-symbols-outlined text-[16px]">table_rows</span>
              Table
            </button>
          </div>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button
            className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1"
            onClick={() => onNavigate('design', 'studio-wizard')}
          >
            <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>Wizard
          </button>
        </div>
      </div>

      {/* Subcategory chips — the node's REAL children with live keeper
          counts. Clicking drills one level deeper (a routable screen). */}
      {path && children.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {children.map((c) => (
            <button
              key={c.id}
              className="h-7 px-3 rounded-full border border-surface-dim bg-white text-label-sm text-on-surface-variant hover:bg-surface-container-low hover:text-primary flex items-center gap-1"
              onClick={() => onNavigate('design', catalogScreenIdForPath([...path, c.name]))}
            >
              {c.name}
              <span className="text-[10px] font-bold text-on-surface-variant/70">{c.keeperProducts}</span>
            </button>
          ))}
        </div>
      )}

      {/* Supplier filter chips — the ONE place supplier names appear */}
      {suppliers.length > 1 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 max-w-sm">
            <span className="material-symbols-outlined absolute left-2 top-1.5 text-[16px] text-on-surface-variant">search</span>
            <input className="w-full h-8 pl-8 pr-3 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder={`Search ${subcategory || category}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              className={`px-2.5 py-1 text-label-sm rounded-full border transition-colors ${supplierFilter === 'all' ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface-variant border-surface-dim hover:bg-surface-container-low'}`}
              onClick={() => setSupplierFilter('all')}
            >
              All ({blanks.length})
            </button>
            {suppliers.map((s) => {
              const count = blanks.filter((b) => b.supplier === s).length;
              return (
                <button
                  key={s}
                  className={`px-2.5 py-1 text-label-sm rounded-full border transition-colors ${supplierFilter === s ? 'bg-primary text-white border-primary' : 'bg-white text-on-surface-variant border-surface-dim hover:bg-surface-container-low'}`}
                  onClick={() => setSupplierFilter(s)}
                >
                  {s} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {suppliers.length <= 1 && (
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 max-w-sm">
            <span className="material-symbols-outlined absolute left-2 top-1.5 text-[16px] text-on-surface-variant">search</span>
            <input className="w-full h-8 pl-8 pr-3 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder={`Search ${subcategory || category}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      )}

      {/* Content: Cards or Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
          <p className="mt-2">Loading {title} products from Printify…</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center text-error">
          <span className="material-symbols-outlined text-[32px]">error</span>
          <p className="mt-2">{error}</p>
        </div>
      ) : unmatched ? (
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-[32px]">search_off</span>
          <p className="mt-2 font-medium text-on-surface">No category “{title}” under {crumbSegments.slice(0, -1).join(' → ') || 'Catalog'}</p>
          <p className="text-body-sm mt-1">The catalog has no such node — nothing was substituted. Pick a real category from the sidebar.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-[32px]">search_off</span>
          <p className="mt-2">No {title} products found.</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* ── CARDS VIEW — his ProductCard component with real Printify images ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto">
          {filtered.map((blank) => (
            <ProductCard
              key={blank.id}
              card={blank}
              onDesign={() => handleSelectAndDesign(blank)}
              onView={() => handleViewProductPage(blank)}
              selected={selected.has(blank.id)}
              onToggleSelect={() => toggleRow(blank.id)}
            />
          ))}
        </div>
      ) : (
        /* ── TABLE VIEW — our table with quick actions ── */
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex-1 flex flex-col">
          <div className="overflow-auto flex-1">
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-3 py-2 w-8"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Supplier / Brand</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2">Family</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-2 py-2 w-10 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {filtered.map((blank) => (
                  <tr
                    key={blank.id}
                    className="hover:bg-surface-container-low cursor-pointer"
                    onClick={() => handleSelectAndDesign(blank)}
                  >
                    <td className="px-3 py-2" onClick={(e) => { e.stopPropagation(); }}>
                      <input type="checkbox" checked={selected.has(blank.id)} onChange={() => toggleRow(blank.id)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[15px] text-on-surface-variant">{categoryIcon(category)}</span>
                        </div>
                        <div className="min-w-0">
                          <button className="font-medium truncate text-left hover:text-primary hover:underline" onClick={(e) => { e.stopPropagation(); handleViewProductPage(blank); }}>
                            {blank.name}
                          </button>
                          <div className="text-[11px] text-on-surface-variant truncate">{blank.brand || blank.supplier}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[12px]">{blank.supplier} · {blank.brand || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[12px]">{money(blank.baseCost)}</td>
                    <td className="px-3 py-2 text-[12px]">{blank.family}</td>
                    <td className="px-3 py-2">
                      <span className={`pill status role ${blank.status === 'eligible' ? 'customer' : 'contact'}`}>{blank.status}</span>
                    </td>
                    <td className="px-2 py-2 text-right relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="w-7 h-7 rounded border border-surface-dim hover:bg-surface-container flex items-center justify-center mx-auto"
                        title="Quick actions"
                        onClick={(e) => { e.stopPropagation(); setRowMenuForId(rowMenuForId === blank.id ? null : blank.id); }}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                      {rowMenuForId === blank.id && (
                        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 230 }} onClick={(e) => e.stopPropagation()}>
                          <div className="menu-header">{blank.name}</div>
                          <button onClick={() => { setRowMenuForId(null); handleSelectAndDesign(blank); }}>
                            <span className="material-symbols-outlined">palette</span>Select &amp; design
                          </button>
                          <button onClick={() => { setRowMenuForId(null); handleViewProductPage(blank); }}>
                            <span className="material-symbols-outlined">inventory_2</span>View product page
                          </button>
                          <button onClick={() => { setRowMenuForId(null); handlePreview(blank); }}>
                            <span className="material-symbols-outlined">visibility</span>Preview
                          </button>
                          <div className="sep"></div>
                          <button onClick={() => { setRowMenuForId(null); handleSaveAsTemplate(blank); }}>
                            <span className="material-symbols-outlined">view_quilt</span>Save to My templates
                          </button>
                          <button onClick={() => { setRowMenuForId(null); saveToCollection({ name: blank.name, kind: 'product' }); onToast(`Saved "${blank.name}" to Collection.`); }}>
                            <span className="material-symbols-outlined">bookmark</span>Save to Collection
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-surface-dim text-[11px] text-on-surface-variant flex items-center justify-between">
            <span>{filtered.length} products</span>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span>{selected.size} selected</span>
                <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => {
                  selected.forEach((id) => {
                    const b = blanks.find((x) => x.id === id);
                    if (b) handleSaveAsTemplate(b);
                  });
                  setSelected(new Set());
                }}>
                  <span className="material-symbols-outlined text-[12px] align-middle">view_quilt</span>
                  Save as templates
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}
    </main>
  );
}
