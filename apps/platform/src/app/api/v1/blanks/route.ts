import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import {
  apiError,
  cheapestCosts,
  cheapestProductionTimes,
  familyForTopCategory,
  keeperSupplierIds,
  loadCategories,
  minVariantSnapshots,
  resolveCategoryIds,
  resolveCategoryPath,
  templatePrintAreas,
  templatesForCategory,
  topNameOf,
} from '@/lib/podServer';

/**
 * GET /api/v1/blanks?path=Apparel/Women/T-Shirts —OR—
 *            ?category=Women&subcategory=T-Shirts&q=&limit=&cursor=&sort=
 *
 * The product card list for one catalog node — ONE CARD PER PRODUCT,
 * grouped by canonical_product_id. When two keepers carry the same
 * product (Printify's "Unisex Jersey Muscle Tank" + Printful's "Unisex
 * Muscle Shirt | Bella + Canvas 3483" → same canonical), the card shows
 * the best price across suppliers and a "2 Suppliers" badge, and the
 * card id is the cheapest keeper's row so "Design this" keeps working.
 *
 * Card fields per the approved design: image, title, SKU, variant count,
 * best price, suppliers list. `cursor` is an opaque offset.
 */
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const category = params.get('category') ?? 'Men';
    const subcategory = params.get('subcategory') ?? undefined;
    const pathParam = params.get('path') ?? undefined;
    const q = params.get('q')?.trim() || undefined;
    const sort = params.get('sort') ?? 'name';
    const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(params.get('cursor') ?? '0', 10) || 0, 0);
    /** hidden=true → return ONLY hidden products (the "Hidden" view).
     *  hidden=false (default) → EXCLUDE hidden products from search results.
     *  Hidden = not eligible for search, not eligible for design. */
    const hidden = params.get('hidden') === 'true';

    const [nodes, keeperIds] = await Promise.all([loadCategories(), keeperSupplierIds()]);

    // Hidden view: when hidden=true AND category=All, skip category
    // resolution entirely — just query is_hidden=true across all keepers.
    // This avoids the massive .in('category_id', [...allIds]) that times
    // out when the catalog has thousands of categories.
    const isHiddenAllView = hidden && category === 'All' && !subcategory && !pathParam;

    // category=All covers every department (the Best Selling wizard).
    const resolution = isHiddenAllView
      ? { ids: null as Set<string> | null, topName: null, resolvedPath: ['All'] as string[] }
      : pathParam
        ? resolveCategoryPath(nodes, pathParam.split('/'))
        : category === 'All'
          ? {
              ids: new Set(nodes.map((n) => n.id)),
              topName: null,
              resolvedPath: ['All'] as string[],
            }
          : resolveCategoryIds(nodes, category, subcategory);
    const { ids, topName, resolvedPath } = resolution;
    if (!isHiddenAllView && ids && ids.size === 0) {
      return NextResponse.json({
        items: [],
        nextCursor: null,
        meta: {
          category,
          subcategory: subcategory ?? null,
          path: pathParam ?? null,
          matched: false,
          resolvedPath: null,
          topCategory: topName,
          total: 0,
          sort,
          velocityCanonicals: 0,
          tenantId: DEFAULT_TENANT_ID,
        },
      });
    }

    // Best-selling: real order velocity — order_items quantity summed per
    // canonical product (via supplier_catalog_variant_id).
    let velocity = new Map<string, number>();
    if (sort === 'best_selling') {
      const { data: lines } = await supabaseAdmin()
        .from('order_items')
        .select('supplier_catalog_variant_id,quantity')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .not('supplier_catalog_variant_id', 'is', null)
        .limit(10000);
      const variantIds = [...new Set((lines ?? []).map((l) => l.supplier_catalog_variant_id as string))];
      if (variantIds.length > 0) {
        const { data: vars } = await supabaseAdmin()
          .from('supplier_catalog_variants')
          .select('id,canonical_product_id')
          .in('id', variantIds);
        const canonOf = new Map((vars ?? []).map((v) => [v.id as string, v.canonical_product_id as string]));
        for (const l of lines ?? []) {
          const c = canonOf.get(l.supplier_catalog_variant_id as string);
          if (c) velocity.set(c, (velocity.get(c) ?? 0) + (l.quantity as number ?? 0));
        }
      }
    }

    // Fetch EVERY keeper row in the resolved subtree (paged; keeper cards
    // max out around ~2.2k rows for the whole Apparel tree — cheap). We
    // group by canonical in memory, so the DB window must cover the whole
    // node, not one page of it.
    type Row = {
      id: string;
      name: string;
      brand_name: string | null;
      supplier_id: string;
      canonical_product_id: string | null;
      variant_count: number | null;
      image_url: string | null;
      is_hidden: boolean | null;
    };
    const allRows: Row[] = [];
    for (let from = 0; ; from += 1000) {
      let query = supabaseAdmin()
        .from('supplier_catalog_products')
        .select('id,name,brand_name,supplier_id,canonical_product_id,variant_count,image_url,is_hidden')
        .in('supplier_id', keeperIds)
        .eq('is_hidden', hidden)
        .order('name', { ascending: true })
        .range(from, from + 999);
      // Skip the category_id filter for the Hidden-all view (no category
      // context — just list every hidden product across all categories).
      if (!isHiddenAllView && ids) query = query.in('category_id', [...ids]);
      if (q) query = query.ilike('name', `%${q}%`);
      const { data, error } = await query;
      if (error) throw new Error(`supplier_catalog_products: ${error.message}`);
      allRows.push(...((data ?? []) as unknown as Row[]));
      if (!data || data.length < 1000) break;
      if (allRows.length >= 8000) break; // hard cap — grouped view stays honest
    }

    const supplierIds = [...new Set(allRows.map((r) => r.supplier_id).filter(Boolean))];
    const supplierMap = new Map<string, { name: string; slug: string }>();
    if (supplierIds.length > 0) {
      const { data: suppliers, error: supErr } = await supabaseAdmin()
        .from('suppliers')
        .select('id,name,slug')
        .in('id', supplierIds);
      if (supErr) throw new Error(`suppliers: ${supErr.message}`);
      for (const s of suppliers ?? []) supplierMap.set(s.id, { name: s.name, slug: s.slug });
    }

    const canonicalIds = [...new Set(allRows.map((r) => r.canonical_product_id).filter(Boolean))] as string[];
    // PostgREST caps URL length — .in() with ~900 UUIDs is a Bad Request.
    // Chunk every canonical-scoped lookup and merge the results.
    const chunk = <T,>(arr: T[], size = 150): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };
    const [costs, snapshots, canonRows, prodTimes] = await Promise.all([
      (async () => {
        const m = new Map<string, { cost: number; shipping: number; supplier: string }>();
        for (const part of chunk(canonicalIds)) {
          for (const [k, v] of await cheapestCosts(part)) m.set(k, v);
        }
        return m;
      })(),
      (async () => {
        const m = new Map<string, number>();
        for (const part of chunk(canonicalIds)) {
          for (const [k, v] of await minVariantSnapshots(part)) m.set(k, v);
        }
        return m;
      })(),
      (async () => {
        const rows: { id: string; sku_slug: string | null }[] = [];
        for (const part of chunk(canonicalIds)) {
          const { data, error } = await supabaseAdmin()
            .from('canonical_products')
            .select('id,sku_slug')
            .in('id', part);
          if (error) throw new Error(`canonical_products: ${error.message}`);
          rows.push(...((data ?? []) as { id: string; sku_slug: string | null }[]));
        }
        return rows;
      })(),
      // Per-supplier_catalog_products.id production time (min across
      // providers). Rolled up to canonical below so each card shows the
      // FASTEST keeper that carries the product — "3.2 days", real data
      // from catalog_provider_facts.production_time_avg.
      (async () => {
        const rowIds = allRows.map((r) => r.id);
        const m = new Map<string, { days: number; unit: string }>();
        for (const part of chunk(rowIds, 200)) {
          for (const [k, v] of await cheapestProductionTimes(part)) m.set(k, v);
        }
        return m;
      })(),
    ]);
    const skuOf = new Map(canonRows.map((c) => [c.id, c.sku_slug]));

    // Roll per-row production time up to canonical_product_id — min across
    // every keeper row in the group. Orphan rows (no canonical) map their
    // own production time straight through. Format matches the user's
    // approved card: "3.2 days" / "2.5 business days" / null when no
    // provider has filed a production_time_avg.
    const prodByCanonical = new Map<string, { days: number; unit: string }>();
    for (const r of allRows) {
      const pt = prodTimes.get(r.id);
      if (!pt) continue;
      const key = r.canonical_product_id ?? `__orphan_${r.id}`;
      const cur = prodByCanonical.get(key);
      if (!cur || pt.days < cur.days) prodByCanonical.set(key, pt);
    }
    const formatEstShipping = (canonical: string | null, rowId: string): string | null => {
      const pt = canonical
        ? prodByCanonical.get(canonical)
        : prodByCanonical.get(`__orphan_${rowId}`);
      if (!pt) return null;
      // unit comes in as "business_days" — surface as "days" on the card
      // so it reads "3.2 days" exactly like the approved design.
      const unit = pt.unit === 'business_days' ? 'days' : pt.unit;
      return `${pt.days % 1 === 0 ? pt.days : pt.days.toFixed(1)} ${unit}`;
    };

    // ── Group by canonical: one card per PRODUCT ──
    const groups = new Map<string, Row[]>();
    const orphans: Row[] = [];
    for (const r of allRows) {
      if (r.canonical_product_id) {
        const g = groups.get(r.canonical_product_id) ?? [];
        g.push(r);
        groups.set(r.canonical_product_id, g);
      } else {
        orphans.push(r);
      }
    }

    const [templates] = await Promise.all([templatesForCategory(topName)]);
    const family = familyForTopCategory(topName);
    const printAreas = templatePrintAreas(templates);
    const status = templates.length > 0 ? 'unverified' : 'skeleton_pending';

    const buildCard = (rowsInGroup: Row[], canonical: string | null) => {
      // Rank each keeper row: cheapest cost wins; ties break on variant
      // count, then name — deterministic so the card never flickers.
      const ranked = [...rowsInGroup].sort((a, b) => {
        const ca = a.canonical_product_id ? costs.get(a.canonical_product_id)?.cost ?? snapshots.get(a.canonical_product_id) ?? null : null;
        const cb = b.canonical_product_id ? costs.get(b.canonical_product_id)?.cost ?? snapshots.get(b.canonical_product_id) ?? null : null;
        if (ca != null && cb != null && ca !== cb) return ca - cb;
        if (ca != null && cb == null) return -1;
        if (ca == null && cb != null) return 1;
        const va = a.variant_count ?? 0;
        const vb = b.variant_count ?? 0;
        if (vb !== va) return vb - va;
        return a.name.localeCompare(b.name);
      });
      const primary = ranked[0];
      const suppliers = [...new Map(ranked.map((r) => {
        const s = supplierMap.get(r.supplier_id);
        return [s?.slug ?? r.supplier_id, { name: s?.name ?? 'Unknown supplier', slug: s?.slug ?? 'unknown' }];
      })).entries()].map(([, v]) => v).sort((a, b) => a.name.localeCompare(b.name));
      const variantCount = Math.max(...ranked.map((r) => r.variant_count ?? 0));
      const image = ranked.map((r) => r.image_url).find(Boolean) ?? null;
      return {
        id: primary.id,
        canonicalProductId: canonical,
        name: primary.name,
        brand: primary.brand_name ?? 'Generic brand',
        supplier: supplierMap.get(primary.supplier_id)?.name ?? 'Unknown supplier',
        supplierSlug: supplierMap.get(primary.supplier_id)?.slug ?? 'unknown',
        suppliers,
        supplierCount: suppliers.length,
        variantCount,
        sku: canonical ? skuOf.get(canonical) ?? null : null,
        baseCost: canonical ? costs.get(canonical)?.cost ?? snapshots.get(canonical) ?? null : null,
        currency: 'USD',
        family,
        mockupThumbUrl: image ?? '',
        printAreas,
        status,
        fulfillment: 'POD' as const,
        estShipping: formatEstShipping(canonical, primary.id),
        isHidden: primary.is_hidden ?? false,
        ...(sort === 'best_selling' ? { unitsSold: velocity.get(canonical ?? '') ?? 0 } : {}),
      };
    };
    const cards: ReturnType<typeof buildCard>[] = [];
    for (const [canonical, rowsInGroup] of groups) cards.push(buildCard(rowsInGroup, canonical));
    // ── Orphan grouping ──
    // Rows without a canonical_product_id used to become ONE CARD EACH,
    // so the same product ingested from multiple suppliers (or the same
    // supplier twice) showed as duplicate cards — "aprons randomly and
    // not grouped". Group orphans by normalized name first; each group
    // becomes ONE card (buildCard ranks rows within the group — cheapest
    // first — exactly like canonical groups).
    const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const orphanGroups = new Map<string, Row[]>();
    for (const r of orphans) {
      const key = norm(r.name);
      const g = orphanGroups.get(key) ?? [];
      g.push(r);
      orphanGroups.set(key, g);
    }
    for (const [, rowsInGroup] of orphanGroups) {
      cards.push(buildCard(rowsInGroup, null));
    }

    // Sort the grouped list, then paginate in memory.
    cards.sort((a, b) => {
      if (sort === 'best_selling') {
        const va = velocity.get(a.canonicalProductId ?? '') ?? 0;
        const vb = velocity.get(b.canonicalProductId ?? '') ?? 0;
        if (vb !== va) return vb - va;
        if (b.variantCount !== a.variantCount) return b.variantCount - a.variantCount;
      }
      return a.name.localeCompare(b.name);
    });
    const page = cards.slice(offset, offset + limit);
    const total = cards.length;

    return NextResponse.json({
      items: page,
      nextCursor: offset + page.length < total ? String(offset + page.length) : null,
      meta: {
        category,
        subcategory: subcategory ?? null,
        path: pathParam ?? null,
        matched: true,
        resolvedPath,
        topCategory: topName,
        total,
        sort,
        velocityCanonicals: velocity.size,
        tenantId: DEFAULT_TENANT_ID,
      },
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load blanks.');
  }
}
