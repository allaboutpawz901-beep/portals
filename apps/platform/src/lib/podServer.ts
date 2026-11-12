import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * Shared server helpers for the /api/v1 POD routes. All reads go through
 * the live Supabase project (pcwwvfgxnrglmmpbfqhf) — supplier_catalog_products
 * (24,763 rows), supplier_catalog_variants, supplier_product_costs,
 * product_canvas_templates, categories, suppliers, designs.
 *
 * Nothing here invents data. A missing cost, skeleton, or variant comes
 * back null/empty and the caller says so.
 */

export { DEFAULT_TENANT_ID };

/**
 * Tiny in-memory TTL cache for the slow, rarely-changing lookups.
 * The Supabase round trip through this VM's proxy runs 1–4s (spiking to
 * 10s+), and the catalog fires loadCategories + keeper ids + templates on
 * every call — so an uncached catalog visit costs 10–90s. The category
 * tree, keeper suppliers, archetype templates and the catalog pair list
 * change rarely; a 5-minute cache makes the catalog load in ~2s while
 * staying fresh enough for this data. Costs, variants and blanks are
 * NEVER cached here — they are live on every call.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  level: number;
}

export async function loadCategories(): Promise<CategoryNode[]> {
  return cached('categories', async () => {
    const { data, error } = await supabaseAdmin()
      .from('categories')
      .select('id,name,slug,parent_id,level')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw new Error(`categories: ${error.message}`);
    return (data ?? []) as CategoryNode[];
  });
}

function descendantsOf(nodes: CategoryNode[], rootIds: Set<string>): Set<string> {
  const byParent = new Map<string, CategoryNode[]>();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    const list = byParent.get(n.parent_id) ?? [];
    list.push(n);
    byParent.set(n.parent_id, list);
  }
  const out = new Set<string>(rootIds);
  const stack = [...rootIds];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of byParent.get(id) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return out;
}

/** The result of resolving a user-facing category selection to DB ids. */
export interface CategoryResolution {
  ids: Set<string>;
  topName: string | null;
  /** The node names that actually resolved, root → leaf. Null = no match. */
  resolvedPath: string[] | null;
}

/**
 * Resolve a full category path (e.g. ['Apparel', 'Women', 'T-Shirts']) by
 * walking the tree root → leaf, matching each segment by normalized name
 * or slug. Unambiguous at every step — unlike name-only matching, which
 * can't tell Men>Hoodies apart from Women>Hoodies.
 */
export function resolveCategoryPath(
  nodes: CategoryNode[],
  segments: string[],
): CategoryResolution {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const clean = segments.map((s) => s?.trim()).filter(Boolean);
  if (clean.length === 0) return { ids: new Set(), topName: null, resolvedPath: null };

  const byParent = new Map<string | null, CategoryNode[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parent_id ?? null) ?? [];
    list.push(n);
    byParent.set(n.parent_id ?? null, list);
  }
  const match = (pool: CategoryNode[], seg: string) =>
    pool.find((n) => norm(n.name) === norm(seg) || norm(n.slug) === norm(seg));

  // Walk: roots first, then children of the previous match.
  let current = match(byParent.get(null) ?? [], clean[0]);
  const path: string[] = [];
  if (current) path.push(current.name);
  for (let i = 1; current && i < clean.length; i++) {
    current = match(byParent.get(current.id) ?? [], clean[i]);
    if (current) path.push(current.name);
  }
  if (!current || path.length !== clean.length) {
    return { ids: new Set(), topName: null, resolvedPath: null };
  }
  return {
    ids: descendantsOf(nodes, new Set([current.id])),
    topName: topNameOf(nodes, current.id),
    resolvedPath: path,
  };
}

/**
 * Resolve the designer's top-nav selection (category + subcategory) to the
 * category ids it covers. Category matches by slug or name; subcategory
 * matches by name inside the category subtree. NOTHING FALLS BACK SILENTLY:
 * a subcategory that doesn't exist under the selected category resolves to
 * an EMPTY set (the caller returns an empty list and says so) — the old
 * whole-category fallback is what showed baby bodysuits under
 * Women → Sweatshirts.
 */
export function resolveCategoryIds(
  nodes: CategoryNode[],
  category: string,
  subcategory?: string,
): CategoryResolution {
  // Compare on letters+digits only, so 'Home Living' matches
  // 'Home & Living' (slug home-and-living) and 'Kids' matches 'Kids'.
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const catRoots = nodes.filter(
    (n) => norm(n.slug) === norm(category) || norm(n.name) === norm(category),
  );
  if (catRoots.length === 0) return { ids: new Set(), topName: null, resolvedPath: null };
  const topName = topNameOf(nodes, catRoots[0].id);
  if (subcategory) {
    const subRoots = nodes.filter(
      (n) => norm(n.name) === norm(subcategory) || norm(n.slug) === norm(subcategory),
    );
    const catIds = descendantsOf(nodes, new Set(catRoots.map((c) => c.id)));
    const inScope = subRoots.filter((n) => catIds.has(n.id));
    if (inScope.length > 0) {
      return {
        ids: descendantsOf(nodes, new Set(inScope.map((n) => n.id))),
        topName,
        resolvedPath: [catRoots[0].name, ...inScope.map((n) => n.name)],
      };
    }
    // No such subcategory under this category — empty, honestly.
    return { ids: new Set(), topName, resolvedPath: null };
  }
  return {
    ids: descendantsOf(nodes, new Set(catRoots.map((c) => c.id))),
    topName,
    resolvedPath: [catRoots[0].name],
  };
}

export function topNameOf(nodes: CategoryNode[], id: string): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(id);
  let guard = 0;
  while (cur?.parent_id && guard < 10) {
    cur = byId.get(cur.parent_id);
    guard++;
  }
  return cur?.name ?? null;
}

/** The shell's three blank families, mapped from the top category. */
export function familyForTopCategory(topName: string | null): 'tops' | 'books' | 'drinkware' {
  if (topName === 'Drinkware') return 'drinkware';
  if (topName === 'Apparel') return 'tops';
  // Everything else (Home & Living, Wall Art, Technology, …) is a flat good.
  return 'books';
}

/**
 * Keeper suppliers only (Jaizon's rule): Printful / Printify / Cloudprinter
 * flow into the designer. Drops (Gooten, SpreadConnect, Teemill, Prodigi,
 * Gelato) are key-entry only in the catalog and never offered here.
 */
export const KEEPER_SUPPLIER_SLUGS = ['printful', 'printify', 'cloudprinter'];

export async function keeperSupplierIds(): Promise<string[]> {
  return cached('keeper-supplier-ids', async () => {
    const { data, error } = await supabaseAdmin()
      .from('suppliers')
      .select('id')
      .in('slug', KEEPER_SUPPLIER_SLUGS);
    if (error) throw new Error(`suppliers: ${error.message}`);
    return (data ?? []).map((s) => s.id as string);
  });
}

/** Cheapest in-stock cost per canonical product id. */
export async function cheapestCosts(
  canonicalIds: string[],
): Promise<Map<string, { cost: number; shipping: number; supplier: string }>> {
  const out = new Map<string, { cost: number; shipping: number; supplier: string }>();
  if (canonicalIds.length === 0) return out;
  const { data, error } = await supabaseAdmin()
    .from('supplier_product_costs')
    .select('canonical_product_id,supplier_name,base_cost_usd,shipping_estimate_usd,is_in_stock')
    .in('canonical_product_id', canonicalIds)
    .eq('is_in_stock', true)
    .order('base_cost_usd', { ascending: true });
  if (error) throw new Error(`supplier_product_costs: ${error.message}`);
  for (const row of data ?? []) {
    const id = row.canonical_product_id as string;
    if (!out.has(id)) {
      out.set(id, {
        cost: Number(row.base_cost_usd),
        shipping: Number(row.shipping_estimate_usd ?? 0),
        supplier: String(row.supplier_name),
      });
    }
  }
  return out;
}

/**
 * Cheapest production time per supplier_catalog_products id (NOT canonical).
 * Reads catalog_provider_facts.production_time_avg — the real per-printer
 * lead time Printify/Printful publish (e.g. Printify Choice Miami = 2.1
 * business_days, MWW On Demand Hendersonville = 2.5). One row per
 * (catalog_product_id, provider) — we keep the MIN across providers, so
 * the card shows the fastest keeper that actually carries the product.
 *
 * Returns Map<catalog_product_id, { days: number, unit: string }> — keyed
 * by the supplier_catalog_products row id so the caller can roll it up to
 * canonical_product_id alongside the keeper rows it already fetched.
 */
export async function cheapestProductionTimes(
  catalogProductIds: string[],
): Promise<Map<string, { days: number; unit: string }>> {
  const out = new Map<string, { days: number; unit: string }>();
  if (catalogProductIds.length === 0) return out;
  // PostgREST caps URL length — chunk to stay well under it.
  const chunk = <T,>(arr: T[], size = 200): T[][] => {
    const r: T[][] = [];
    for (let i = 0; i < arr.length; i += size) r.push(arr.slice(i, i + size));
    return r;
  };
  for (const part of chunk(catalogProductIds)) {
    const { data, error } = await supabaseAdmin()
      .from('catalog_provider_facts')
      .select('catalog_product_id,production_time_avg,production_time_unit')
      .in('catalog_product_id', part)
      .not('production_time_avg', 'is', null)
      .order('production_time_avg', { ascending: true });
    if (error) throw new Error(`catalog_provider_facts: ${error.message}`);
    for (const row of data ?? []) {
      const id = row.catalog_product_id as string;
      // order asc means the first row per id is the min — skip the rest.
      if (!out.has(id)) {
        out.set(id, {
          days: Number(row.production_time_avg),
          unit: String(row.production_time_unit ?? 'business_days'),
        });
      }
    }
  }
  return out;
}

/** Minimum variant price_snapshot per canonical product id (cost fallback). */
export async function minVariantSnapshots(
  canonicalIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (canonicalIds.length === 0) return out;
  const { data, error } = await supabaseAdmin()
    .from('supplier_catalog_variants')
    .select('canonical_product_id,price_snapshot')
    .in('canonical_product_id', canonicalIds)
    .not('price_snapshot', 'is', null);
  if (error) throw new Error(`supplier_catalog_variants: ${error.message}`);
  // Min is taken in JS — ordering the whole filtered set in the DB on an
  // unindexed column is what made this call slow.
  for (const row of data ?? []) {
    const id = row.canonical_product_id as string;
    const price = Number(row.price_snapshot);
    if (!out.has(id) || price < (out.get(id) ?? Infinity)) out.set(id, price);
  }
  return out;
}

/** Active archetype skeleton templates for a top category (e.g. 'Apparel'). */
export async function templatesForCategory(topName: string | null): Promise<any[]> {
  if (!topName) return [];
  return cached(`templates:${topName}`, async () => {
    const { data, error } = await supabaseAdmin()
      .from('product_canvas_templates')
      .select('*')
      .eq('category_path', topName)
      .eq('is_active', true)
      .order('view_angle');
    if (error) throw new Error(`product_canvas_templates: ${error.message}`);
    return data ?? [];
  });
}

/**
 * The standard mockup canvas the archetype template geometry lives on.
 * Clients scale boxPx from this space to the actual loaded image's natural
 * size (Printify mockups are ~1000px, not 450×600).
 */
export const MOCKUP_CANVAS_PX = { w: 450, h: 600 };

/**
 * Template geometry, decoded from the real stored rows — ONE coordinate
 * system, the render contract's (§3): print_zone_* are px on the mockup
 * canvas and px_per_inch maps those px to physical inches. The old version
 * mixed systems (zone offsets in canvas px but width/height as production
 * px at 300 DPI), which drew boxes 12× larger than the mockup.
 */
export function templateGeometry(t: any): {
  boxIn: { xIn: number; yIn: number; wIn: number; hIn: number };
  boxPx: { left: number; top: number; width: number; height: number };
  pxPerInch: number;
  canvasPx: { w: number; h: number };
} {
  const zoneX = Number(t.print_zone_x ?? 0);
  const zoneY = Number(t.print_zone_y ?? 0);
  const zoneW = Number(t.print_zone_width ?? 0);
  const zoneH = Number(t.print_zone_height ?? 0);
  const physW = Number(t.physical_width_inches ?? 0);
  const physH = Number(t.physical_height_inches ?? 0);
  const ppi =
    t.px_per_inch != null && Number(t.px_per_inch) > 0
      ? Number(t.px_per_inch)
      : zoneW > 0 && physW > 0
        ? zoneW / physW
        : 300;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    boxIn: {
      xIn: r2(ppi > 0 ? zoneX / ppi : 0),
      yIn: r2(ppi > 0 ? zoneY / ppi : 0),
      wIn: physW > 0 ? physW : r2(ppi > 0 ? zoneW / ppi : 0),
      hIn: physH > 0 ? physH : r2(ppi > 0 ? zoneH / ppi : 0),
    },
    boxPx: { left: zoneX, top: zoneY, width: zoneW, height: zoneH },
    pxPerInch: ppi,
    canvasPx: { ...MOCKUP_CANVAS_PX },
  };
}

/** Card-level print areas for a category's templates (physical × 300 DPI). */
export function templatePrintAreas(templates: any[]): {
  placement: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
}[] {
  return templates.map((t) => ({
    placement: String(t.view_angle),
    widthPx: Math.round(Number(t.physical_width_inches ?? 0) * 300),
    heightPx: Math.round(Number(t.physical_height_inches ?? 0) * 300),
    dpi: 300,
  }));
}
const COLOR_HEX: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  maroon: '#800000',
  navy: '#000080',
  'midnight navy': '#191970',
  'heavy metal': '#3a3a3a',
  forest: '#228b22',
  'kelly green': '#4cbb17',
  'irish green': '#00985f',
  ash: '#d3d3d3',
  'dark heather': '#3a3a3a',
  red: '#ff0000',
  royal: '#4169e1',
  'royal blue': '#4169e1',
  'forest green': '#228b22',
  green: '#008000',
  'lime shock': '#ccff00',
  yellow: '#ffff00',
  gold: '#ffd700',
  orange: '#ffa500',
  pink: '#ffc0cb',
  'hot pink': '#ff69b4',
  purple: '#800080',
  violet: '#8f00ff',
  grey: '#808080',
  gray: '#808080',
  'heather grey': '#b0b0b0',
  'heather gray': '#b0b0b0',
  charcoal: '#36454f',
  brown: '#a52a2a',
  tan: '#d2b48c',
  beige: '#f5f5dc',
  cream: '#fffdd0',
  'light blue': '#add8e6',
  'sky blue': '#87ceeb',
  teal: '#008080',
  turquoise: '#40e0d0',
  burgundy: '#800020',
  'dark green': '#013220',
  'dark grey': '#a9a9a9',
  'dark gray': '#a9a9a9',
  silver: '#c0c0c0',
  'military green': '#4b5320',
  khaki: '#c3b091',
  coral: '#ff7f50',
  lavender: '#e6e6fa',
  mint: '#98ff98',
  sand: '#c2b280',
  natural: '#e8dcc4',
  'athletic heather': '#9aa0a6',
  'sport grey': '#9aa0a6',
  'sport gray': '#9aa0a6',
};

export function hexForColorName(name: string): string | null {
  return COLOR_HEX[name.trim().toLowerCase()] ?? null;
}

/**
 * Every (category_id, supplier_id) pair in the catalog. Supabase caps a
 * single REST request at 1,000 rows, so this pages through the whole table.
 */
export async function allCatalogPairs(): Promise<
  { category_id: string; supplier_id: string }[]
> {
  // 25 paginated round trips uncached — the categories endpoint's slow call.
  return cached('catalog-pairs', async () => {
    const out: { category_id: string; supplier_id: string }[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseAdmin()
        .from('supplier_catalog_products')
        .select('category_id,supplier_id')
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`supplier_catalog_products: ${error.message}`);
      out.push(...((data ?? []) as { category_id: string; supplier_id: string }[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  });
}

/** Normalize a product name for same/similar-type matching across suppliers. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The printer behind a product + its estimated production time.
 * Printify: live from the catalog providers endpoint (production_time).
 * Printful / Cloudprinter: no per-product production time in their catalog
 * APIs, so estimatedDelivery comes back null — the UI says so, never invents.
 */
export async function printerDelivery(productId: string): Promise<{
  printer: { name: string; slug: string };
  estimatedDelivery: { average: number; unit: string } | null;
}> {
  const { data: product } = await supabaseAdmin()
    .from('supplier_catalog_products')
    .select('supplier_id')
    .eq('id', productId)
    .single();
  let printer = { name: 'Unknown supplier', slug: 'unknown' };
  if (product?.supplier_id) {
    const { data: sup } = await supabaseAdmin()
      .from('suppliers')
      .select('name,slug')
      .eq('id', product.supplier_id as string)
      .single();
    if (sup) printer = { name: sup.name as string, slug: sup.slug as string };
  }
  if (printer.slug !== 'printify') return { printer, estimatedDelivery: null };
  try {
    const { data: variants } = await supabaseAdmin()
      .from('supplier_catalog_variants')
      .select('print_specs')
      .eq('supplier_catalog_product_id', productId)
      .limit(1);
    const specs = (variants?.[0]?.print_specs ?? {}) as {
      blueprint_id?: number;
      provider_id?: number;
    };
    if (!specs.blueprint_id) return { printer, estimatedDelivery: null };
    const { printifyBlueprintProviders } = await import('./printify');
    const providers = await printifyBlueprintProviders(specs.blueprint_id);
    const match = specs.provider_id
      ? providers.find((p) => p.id === specs.provider_id)
      : providers[0];
    const pt = match?.production_time;
    return {
      printer,
      estimatedDelivery: pt ? { average: pt.average, unit: pt.unit } : null,
    };
  } catch {
    return { printer, estimatedDelivery: null };
  }
}

export function apiError(message: string, status = 500) {
  return Response.json(
    { error: { code: 'INTERNAL', message, requestId: crypto.randomUUID() } },
    { status },
  );
}
