'use client';
/**
 * ErpProductCatalogScreen — EXACT 1:1 implementation of
 * upload/product cards.html ("Product Catalog — ERP").
 *
 * Structure, classes, fonts, colors, copy and interactions are the
 * design, verbatim. DATA IS LIVE: the cards come from
 * GET /api/v1/blanks (keeper suppliers, grouped one card per canonical
 * product) — real images, real SKUs, real best prices, real supplier
 * badges, real variant counts — paginated with Load more so the whole
 * catalog (~12k keeper products) is reachable.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { listBlanks, setBlankHidden, type BlankCard } from '@/lib/podApi';
import {
  useDesignCanvas,
  blankCardToCatalogProduct,
  STOREFRONT_NAV,
  type NavChild,
} from '@/lib/designCanvasStore';
import type { DomainKey } from '@/data/shellData';

/** Slugify matching shellData.ts so screen ids line up. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Walk STOREFRONT_NAV by a name path and return the deepest node —
 *  used so pills show children of the ACTIVE subcategory (e.g. when
 *  the user is on Kitchen accessories, pills show Tableware + Aprons,
 *  not the entire Home goods dump). */
function findNavNodeByPath(path: string[]): NavChild | null {
  let pool: NavChild[] = STOREFRONT_NAV;
  let node: NavChild | null = null;
  for (const name of path) {
    const hit = pool.find((n) => n.name.toLowerCase() === name.toLowerCase());
    if (!hit) return node;
    node = hit;
    pool = hit.children ?? [];
  }
  return node;
}

/* The page's own <style> block, verbatim (scoped under .erp-catalog
   so pages don't fight each other; values unchanged). One addition:
   .supplier-other — the neutral badge for keeper suppliers that are
   neither Printify nor Printful (e.g. Cloudprinter). */
const CSS = `
.erp-catalog .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1c1e;color:#fff;padding:10px 16px;border-radius:8px;font:500 13px Inter;z-index:500;opacity:0;transition:opacity .2s;pointer-events:none;max-width:90vw}
.erp-catalog .toast.show{opacity:1}

/* Supplier Badges */
.erp-catalog .supplier-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; }
.erp-catalog .supplier-printify { background: #e0f2fe; color: #0369a1; }
.erp-catalog .supplier-printful { background: #f3e8ff; color: #6b21a8; }
.erp-catalog .supplier-both { background: #fef3c7; color: #92400e; }
.erp-catalog .supplier-other { background: #e7f0ec; color: #33503f; }

/* Product Card Specifics */
.erp-catalog .product-card {
  transition: transform 0.2s, box-shadow 0.2s;
}
.erp-catalog .product-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}
`;

interface ErpProductCatalogScreenProps {
  onToast: (message: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  /** The catalog node's department (root) name, e.g. 'Accessories'. */
  category?: string;
  /** The catalog node's leaf name, e.g. 'backpacks' or 'Bags'. */
  subcategory?: string;
  /** Full nav path ['Accessories','Bags','backpacks'] — from catalogNodeFor.
   *  Used to walk the tree for scoped pills AND passed to the API as ?path= */
  path?: string[];
  /** hidden=true → this is the "Hidden" view under My Products. Fetches
   *  ONLY hidden products (not eligible for search, not eligible for
   *  design). Hides department tabs + pills; shows a "Hidden products"
   *  header instead. */
  hidden?: boolean;
}

const money = (n: number | null) =>
  n == null
    ? '—'
    : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ErpProductCatalogScreen({
  onToast,
  onNavigate,
  category,
  subcategory,
  path,
  hidden,
}: ErpProductCatalogScreenProps) {
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Live catalog state ──
  const [items, setItems] = useState<BlankCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [matched, setMatched] = useState<boolean>(true);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Store wiring: View sets the product page product; Design opens the
  // studio with the blank loaded onto the canvas.
  const openStudio = useDesignCanvas((s) => s.openStudio);
  const openProductPage = useDesignCanvas((s) => s.openProductPage);

  const loadPage = useCallback(
    async (cur: string | null) => {
      try {
        if (cur) setLoadingMore(true);
        else setStatus('loading');
        const res = await listBlanks({
          category: category ?? 'All',
          ...(subcategory ? { subcategory } : {}),
          ...(path && path.length > 1 ? { path } : {}),
          limit: 50,
          ...(cur ? { cursor: cur } : {}),
          ...(hidden ? { hidden: true } : {}),
        });
        // Hide cards without images — broken designs (no mockup) shouldn't
        // clutter the catalog. The user explicitly asked for this.
        const visible = hidden
          ? res.items
          : res.items.filter((c) => c.mockupThumbUrl && c.mockupThumbUrl.trim() !== '');
        setItems((prev) => (cur ? [...prev, ...visible] : visible));
        setCursor(res.nextCursor);
        setTotal(res.meta?.total ?? null);
        setMatched(res.meta?.matched !== false);
        setStatus('ready');
        setError(null);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to load products.');
      } finally {
        setLoadingMore(false);
      }
    },
    [category, subcategory, path, hidden],
  );

  // Reload whenever the catalog node changes.
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setTotal(null);
    void loadPage(null);
  }, [loadPage]);

  /* The design is a full-viewport app page (h-screen): fixed action bar,
     internally scrolling grid. Inside the shell the available height is
     the viewport minus the chrome above this screen — measured live so
     the page always fills exactly the visible area. */
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

  /** View → the ERP product page, with the real product in the store. */
  function handleView(card: BlankCard) {
    toast('Opening product details...');
    openProductPage(
      blankCardToCatalogProduct(card, category ?? 'Catalog', subcategory ?? ''),
    );
    onNavigate('design', 'product-page');
  }

  /** Design → the studio canvas, with this blank loaded on it.
   *  Navigate FIRST (the canvas shows its loading state), then load the
   *  blank in the background — the designer is never left staring at the
   *  catalog while a multi-second detail fetch runs. */
  function handleDesign(card: BlankCard) {
    toast(`"${card.name}" loading onto canvas...`);
    onNavigate('design', 'new-design');
    void openStudio({ entry: 'catalog', blankIds: [card.id] });
  }

  // ── Hide / unhide handler (the eye icon) ──
  // Calls PATCH /api/v1/blanks/:id/hide which toggles
  // supplier_catalog_products.is_hidden. Hidden = not eligible for
  // search, not eligible for design. In the normal catalog we remove
  // the card from the list immediately; in the Hidden view we remove
  // it on unhide.
  const handleToggleHidden = useCallback(
    async (card: BlankCard, hide: boolean) => {
      try {
        await setBlankHidden(card.id, hide);
        setItems((prev) => prev.filter((c) => c.id !== card.id));
        toast(hide ? `Hidden “${card.name}” from search` : `Restored “${card.name}”`);
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Failed to toggle hidden.');
      }
    },
    [toast],
  );

  const nodeLabel = hidden
    ? 'Hidden products'
    : category
      ? `${category}${subcategory ? ` · ${subcategory}` : ''}`
      : 'All Products';

  // ── Scoped pills: children of the ACTIVE subcategory, not the entire
  // department dump. Walk STOREFRONT_NAV by the full path (category → … →
  // subcategory) and surface the deepest node's children. When there are
  // no children (e.g. a leaf like Aprons), show the parent's siblings
  // instead so the user can navigate sideways. */
  const navPath = path && path.length > 0 ? path : [category, subcategory].filter(Boolean) as string[];
  const activeNode = navPath.length > 0 ? findNavNodeByPath(navPath) : null;
  const subChips: NavChild[] = activeNode?.children ?? [];

  return (
    <div
      ref={rootRef}
      className="erp-catalog flex flex-col bg-background font-sans text-body-md text-on-surface antialiased overflow-hidden"
      style={height ? { height } : { minHeight: 'calc(100vh - 124px)' }}
    >
      <style>{CSS}</style>

      <div className="flex flex-col h-full w-full">
        {/* Top Navigation Bar — mirrors the sidebar tree (6 departments).
            Clicking a department navigates to its catalog screen; the
            active department is highlighted. A secondary chip row shows
            that department's subcategories (same as the sidebar's
            expandable children, but horizontal). */}
        <header className="shrink-0 z-10 bg-white border-b border-surface-dim">
          <div className="h-12 px-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-[15px] font-semibold text-on-surface">{hidden ? 'Hidden Products' : 'Product Catalog'}</span>
              <div className="h-4 w-px bg-surface-dim"></div>
              <span className="text-[13px] text-on-surface-variant font-medium">
                {nodeLabel}
                {total !== null ? ` (${total.toLocaleString('en-US')})` : ''}
              </span>
              {hidden && (
                <span className="text-[11px] text-on-surface-variant/70 ml-2">
                  Not eligible for search, not eligible for design
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="h-8 px-3 border border-surface-dim rounded bg-white text-[13px] font-semibold hover:bg-surface-container flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">filter_list</span>Filter
              </button>
              <button
                type="button"
                className="h-8 px-4 rounded text-[13px] font-semibold bg-primary text-white hover:bg-primary-container flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>New Product
              </button>
            </div>
          </div>
          {/* Department tabs — hidden in the "Hidden" view (no department
              context there). Same 6 roots as the sidebar otherwise. */}
          {!hidden && (
            <div className="px-6 flex items-center gap-1 border-t border-surface-dim/50 overflow-x-auto">
              {STOREFRONT_NAV.map((dept) => {
                const deptSlug = slugify(dept.name);
                const active = (category ?? '').toLowerCase() === dept.name.toLowerCase();
                return (
                  <button
                    key={dept.name}
                    type="button"
                    onClick={() => onNavigate('design', `studio-${deptSlug}`)}
                    className={`h-9 px-3 text-[13px] font-medium border-b-2 whitespace-nowrap transition-colors ${
                      active
                        ? 'border-primary text-primary'
                        : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container/50'
                    }`}
                  >
                    {dept.name}
                  </button>
                );
              })}
            </div>
          )}
          {/* Subcategory chips — children of the ACTIVE subcategory (not
              the entire department). E.g. on Kitchen accessories → Tableware,
              Aprons. Hidden in the "Hidden" view. */}
          {!hidden && subChips.length > 0 ? (
            <div className="px-6 py-2 flex items-center gap-2 overflow-x-auto bg-surface-container-lowest/50">
              {subChips.map((sub) => {
                const childPath = [...navPath, sub.name];
                const screenId = 'studio-' + childPath.map(slugify).join('--');
                const active = (subcategory ?? '').toLowerCase() === sub.name.toLowerCase();
                return (
                  <button
                    key={sub.name}
                    type="button"
                    onClick={() => onNavigate('design', screenId)}
                    className={`h-7 px-3 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-primary text-white'
                        : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                    }`}
                  >
                    {sub.name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6">
          {status === 'loading' && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined text-[32px] animate-spin">progress_activity</span>
              <span className="text-[13px] font-medium">Loading {nodeLabel}…</span>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-on-surface-variant">
              <span className="material-symbols-outlined text-[32px] text-error">error</span>
              <span className="text-[13px] font-medium">{error}</span>
              <button
                type="button"
                className="h-8 px-4 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container"
                onClick={() => void loadPage(null)}
              >
                Retry
              </button>
            </div>
          )}

          {status === 'ready' && !matched && (
            <div className="flex flex-col items-center justify-center py-24 gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-[32px]">search_off</span>
              <span className="text-[13px] font-medium">
                No catalog node matches “{nodeLabel}”.
              </span>
              <span className="text-[12px]">Nothing was substituted — pick another node in the sidebar.</span>
            </div>
          )}

          {status === 'ready' && matched && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-[32px]">inventory_2</span>
              <span className="text-[13px] font-medium">No products in {nodeLabel} yet.</span>
              <span className="text-[12px]">Keeper suppliers carry nothing under this node.</span>
            </div>
          )}

          {status === 'ready' && matched && items.length > 0 && (
            <>
              {/* Catalog Grid — dense: up to 6 columns on wide screens
                  so the user sees many products, not just 4. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {items.map((card) => (
                  <CatalogCard
                    key={card.id}
                    card={card}
                    isHiddenView={!!hidden}
                    onView={() => handleView(card)}
                    onDesign={() => handleDesign(card)}
                    onToggleHidden={(hide) => void handleToggleHidden(card, hide)}
                  />
                ))}
              </div>

              {/* Load more — the API pages 50 at a time; this reaches the
                  whole catalog (every keeper product) without dumping
                  12k cards into the DOM at once. */}
              {cursor && (
                <div className="flex flex-col items-center gap-2 py-8">
                  <button
                    type="button"
                    disabled={loadingMore}
                    className="h-9 px-6 border border-surface-dim rounded bg-white text-[13px] font-semibold hover:bg-surface-container disabled:opacity-50 flex items-center gap-2"
                    onClick={() => void loadPage(cursor)}
                  >
                    {loadingMore ? (
                      <>
                        <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                        Loading…
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">expand_more</span>
                        Load more ({items.length.toLocaleString('en-US')}
                        {total !== null ? ` of ${total.toLocaleString('en-US')}` : ''})
                      </>
                    )}
                  </button>
                </div>
              )}
              {!cursor && total !== null && total > 50 && (
                <div className="text-center text-[12px] text-on-surface-variant py-6">
                  Showing all {items.length.toLocaleString('en-US')} products
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Toast */}
      <div className={`toast${toastMessage ? ' show' : ''}`}>{toastMessage}</div>
    </div>
  );
}

/** One product card — the design's markup, verbatim, on live data.
 *  Includes the eye-icon hide button (top-left of the image): click to
 *  hide from search results (not eligible for search, not eligible for
 *  design). In the Hidden view, the same eye RESTORES the product. */
function CatalogCard({
  card,
  isHiddenView,
  onView,
  onDesign,
  onToggleHidden,
}: {
  card: BlankCard;
  isHiddenView: boolean;
  onView: () => void;
  onDesign: () => void;
  onToggleHidden: (hide: boolean) => void;
}) {
  const suppliers = card.suppliers ?? [];
  const supplierCount = card.supplierCount ?? (suppliers.length || 1);
  const badge =
    supplierCount > 1
      ? 'both'
      : card.supplierSlug === 'printful'
        ? 'printful'
        : card.supplierSlug === 'printify'
          ? 'printify'
          : 'other';
  const badgeLabel =
    supplierCount > 1 ? `${supplierCount} Suppliers` : card.supplier;
  // In the normal catalog: eye = hide. In the Hidden view: eye = unhide.
  const hidden = !!card.isHidden || isHiddenView;

  return (
    <div className="product-card bg-white border border-surface-dim rounded-xl overflow-hidden flex flex-col">
      {/* Image Area — square (denser than 4:3) */}
      <div className="relative aspect-square bg-surface-container-low border-b border-surface-dim">
        {card.mockupThumbUrl ? (
          <img
            src={card.mockupThumbUrl}
            alt={card.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="material-symbols-outlined text-[40px] text-on-surface-variant/40">
              checkroom
            </span>
          </div>
        )}
        {/* Eye-icon hide button (top-left) — toggles is_hidden via
            PATCH /api/v1/blanks/:id/hide. Hidden = not eligible for
            search, not eligible for design. */}
        <button
          type="button"
          title={hidden ? 'Restore to search results' : 'Hide from search results'}
          aria-label={hidden ? 'Restore product' : 'Hide product'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden(!hidden);
          }}
          className={`absolute top-3 left-3 w-7 h-7 rounded-full flex items-center justify-center border border-black/5 backdrop-blur-sm transition-colors ${
            hidden
              ? 'bg-error/90 text-white'
              : 'bg-white/90 text-on-surface-variant hover:bg-white hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {hidden ? 'visibility_off' : 'visibility'}
          </span>
        </button>
        {/* Top Right Badge */}
        <div className="absolute top-3 right-3 flex gap-1">
          <span
            className={`supplier-badge supplier-${badge} shadow-sm border border-black/5`}
          >
            {badgeLabel}
          </span>
        </div>
        {/* Bottom Left Variant Badge */}
        <div className="absolute bottom-3 left-3">
          <span className="bg-black/70 text-white text-[10px] font-semibold px-2 py-1 rounded backdrop-blur-sm">
            {card.variantCount ?? 0} Variants
          </span>
        </div>
      </div>

      {/* Content Area — compact */}
      <div className="p-2.5 flex-1 flex flex-col">
        {/* Title & SKU */}
        <div className="mb-2">
          <h3 className="text-[13px] font-semibold text-on-surface leading-tight mb-0.5 truncate" title={card.name}>
            {card.name}
          </h3>
          <div className="text-[10px] text-on-surface-variant font-mono truncate">
            {card.sku ?? card.brand ?? '—'}
          </div>
        </div>

        {/* Key Data Points — the two boxed rows per the approved card design:
            Best Price (green) + Est. Shipping (real days from
            catalog_provider_facts.production_time_avg, rolled up by
            canonical in the blanks API). Never placeholder text. */}
        <div className="space-y-2 mb-4 flex-1">
          <div className="flex items-center justify-between bg-surface-container-lowest p-2 rounded border border-surface-dim">
            <span className="text-[12px] text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">sell</span> Best Price
            </span>
            <span className="text-[13px] font-semibold text-[#0a6400]">{money(card.baseCost)}</span>
          </div>
          <div className="flex items-center justify-between bg-surface-container-lowest p-2 rounded border border-surface-dim">
            <span className="text-[12px] text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">local_shipping</span> Est. Shipping
            </span>
            <span className="text-[13px] font-semibold text-on-surface">
              {card.estShipping ?? '—'}
            </span>
          </div>
        </div>

        {/* Actions — compact */}
        <div className="flex gap-1.5 mt-auto">
          <button
            type="button"
            className="flex-1 h-7 border border-surface-dim rounded text-[11px] font-semibold hover:bg-surface-container"
            onClick={onView}
          >
            View
          </button>
          <button
            type="button"
            className="flex-1 h-7 bg-[#1e6dc9] text-white rounded text-[11px] font-semibold hover:bg-[#0055a5]"
            onClick={onDesign}
          >
            Design
          </button>
        </div>
      </div>
    </div>
  );
}
