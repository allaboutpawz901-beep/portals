import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  apiError,
  keeperSupplierIds,
  loadCategories,
  resolveCategoryIds,
} from '@/lib/podServer';

/**
 * GET /api/v1/rankings?kind=best|fast&dept=&limit= — RankingRow per the
 * unified doc §7. Source: real orders across the platform.
 *
 * VERIFIED JOIN PATH (live schema, Nov 8): the contract's stated path
 * order_items → product_variants → products → canonical_products does
 * NOT resolve — products has no canonical_product_id column and
 * products.source_product_id is NULL on every row. The working path is
 * order_items.supplier_catalog_variant_id →
 * supplier_catalog_variants.canonical_product_id, with the order date
 * from orders.created_at (order_items has no date column). This is the
 * same path the blanks list already uses for order velocity.
 *
 * Best selling sorts by units30d; Fast selling sorts by trendPct.
 * Status: hot ≥ +10%, rising ≥ +6%, steady below. trendPct is null when
 * prior30d is 0 (no baseline) — the UI shows "—", never a made-up trend.
 * When fewer than `limit` blanks have sales, the list fills with
 * zero-sales blanks ordered by variant_count (same fallback the blanks
 * list uses), so the wizard always has rows to show.
 */
export interface RankingRow {
  blankId: string;
  name: string;
  brand: string | null;
  department: string;
  supplierCatalogProductId: string | null;
  units30d: number;
  prior30d: number;
  trendPct: number | null;
  status: 'hot' | 'rising' | 'steady';
}

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error('paged query failed.');
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const kind = params.get('kind') ?? 'best';
    const dept = params.get('dept') ?? undefined;
    const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '20', 10) || 20, 1), 100);
    if (!['best', 'fast'].includes(kind)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: `Unknown ranking kind ${kind} (best|fast).`,
            requestId: crypto.randomUUID(),
          },
        },
        { status: 400 },
      );
    }

    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Orders in the 60-day window (order_items carries no date).
    const orders = await pageAll<{ id: string; created_at: string }>((from, to) =>
      supabaseAdmin()
        .from('orders')
        .select('id,created_at')
        .gte('created_at', d60.toISOString())
        .order('created_at', { ascending: false })
        .range(from, to)
        .then((r) => ({ data: (r.data ?? []) as { id: string; created_at: string }[], error: r.error })),
    );
    const orderDate = new Map(orders.map((o) => [o.id, new Date(o.created_at).getTime()]));
    const orderIds = orders.map((o) => o.id);
    const orders30d = orders.filter((o) => new Date(o.created_at) >= d30).length;

    // Order lines → canonical via supplier_catalog_variant_id.
    type Line = { order_id: string; supplier_catalog_variant_id: string | null; quantity: number };
    let lines: Line[] = [];
    if (orderIds.length > 0) {
      lines = await pageAll<Line>((from, to) =>
        supabaseAdmin()
          .from('order_items')
          .select('order_id,supplier_catalog_variant_id,quantity')
          .in('order_id', orderIds)
          .not('supplier_catalog_variant_id', 'is', null)
          .range(from, to)
          .then((r) => ({ data: (r.data ?? []) as Line[], error: r.error })),
      );
    }
    const variantIds = [...new Set(lines.map((l) => l.supplier_catalog_variant_id as string))];
    const canonOf = new Map<string, string>();
    for (let i = 0; i < variantIds.length; i += 500) {
      const chunk = variantIds.slice(i, i + 500);
      const { data, error } = await supabaseAdmin()
        .from('supplier_catalog_variants')
        .select('id,canonical_product_id')
        .in('id', chunk);
      if (error) throw new Error(`supplier_catalog_variants: ${error.message}`);
      for (const v of data ?? []) {
        if (v.canonical_product_id) canonOf.set(v.id as string, v.canonical_product_id as string);
      }
    }

    // Aggregate units per canonical per window.
    const sales = new Map<string, { units30d: number; prior30d: number }>();
    for (const l of lines) {
      const c = canonOf.get(l.supplier_catalog_variant_id as string);
      if (!c) continue;
      const t = orderDate.get(l.order_id);
      if (t == null) continue;
      const s = sales.get(c) ?? { units30d: 0, prior30d: 0 };
      if (t >= d30.getTime()) s.units30d += l.quantity ?? 0;
      else s.prior30d += l.quantity ?? 0;
      sales.set(c, s);
    }

    // Department filter: canonicals with a keeper catalog row in the
    // department's category subtree (same resolution as listBlanks).
    let deptCanonicals: Set<string> | null = null;
    let deptNote: string | null = null;
    if (dept) {
      const nodes = await loadCategories();
      const { ids } = resolveCategoryIds(nodes, dept);
      if (ids.size === 0) {
        return NextResponse.json({
          rows: [],
          meta: {
            kind,
            dept,
            limit,
            ordersInWindow: orders.length,
            orders30d,
            canonicalsWithSales: 0,
            note: `No category matches department "${dept}".`,
          },
        });
      }
      const catRows = await pageAll<{ canonical_product_id: string | null }>((from, to) =>
        supabaseAdmin()
          .from('supplier_catalog_products')
          .select('canonical_product_id')
          .in('category_id', [...ids])
          .range(from, to)
          .then((r) => ({
            data: (r.data ?? []) as { canonical_product_id: string | null }[],
            error: r.error,
          })),
      );
      deptCanonicals = new Set(
        catRows.map((r) => r.canonical_product_id).filter((c): c is string => Boolean(c)),
      );
    }

    // Variant-count ranking for the zero-sales fill.
    const keeperIds = await keeperSupplierIds();
    type CatRow = { id: string; canonical_product_id: string | null; variant_count: number };
    const catAll = await pageAll<CatRow>((from, to) =>
      supabaseAdmin()
        .from('supplier_catalog_products')
        .select('id,canonical_product_id,variant_count')
        .in('supplier_id', keeperIds)
        .range(from, to)
        .then((r) => ({ data: (r.data ?? []) as CatRow[], error: r.error })),
    );
    const firstKeeper = new Map<string, string>();
    const variantCount = new Map<string, number>();
    for (const row of catAll) {
      const c = row.canonical_product_id;
      if (!c) continue;
      if (!firstKeeper.has(c)) firstKeeper.set(c, row.id);
      variantCount.set(c, Math.max(variantCount.get(c) ?? 0, row.variant_count ?? 0));
    }

    const inDept = (c: string) => !deptCanonicals || deptCanonicals.has(c);
    const salesRows = [...sales.entries()]
      .filter(([c]) => inDept(c))
      .map(([c, s]) => ({ canonical: c, ...s }));
    const fillers = [...variantCount.entries()]
      .filter(([c]) => !sales.has(c) && inDept(c))
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => ({ canonical: c, units30d: 0, prior30d: 0 }));
    const picked = [...salesRows, ...fillers].slice(0, limit);

    // Enrich with the canonical's name/brand/department.
    const pickedIds = picked.map((p) => p.canonical);
    const names = new Map<string, { name: string; brand: string | null; category: string | null }>();
    if (pickedIds.length > 0) {
      const { data, error } = await supabaseAdmin()
        .from('canonical_products')
        .select('id,name,brand,category')
        .in('id', pickedIds);
      if (error) throw new Error(`canonical_products: ${error.message}`);
      for (const r of data ?? []) {
        names.set(r.id as string, {
          name: String(r.name ?? ''),
          brand: (r.brand as string | null) ?? null,
          category: (r.category as string | null) ?? null,
        });
      }
    }
    const nodes = await loadCategories();
    const deptNameBySlug = new Map(
      nodes.map((n) => [n.slug.toLowerCase(), n.name] as [string, string]),
    );
    const deptName = (slug: string | null) =>
      slug ? (deptNameBySlug.get(slug.toLowerCase()) ?? titleCaseSlug(slug)) : '—';

    const trendPct = (u: number, p: number): number | null =>
      p > 0 ? Math.round(((u - p) / p) * 1000) / 10 : null;
    const statusOf = (t: number | null): 'hot' | 'rising' | 'steady' =>
      t == null ? 'steady' : t >= 10 ? 'hot' : t >= 6 ? 'rising' : 'steady';

    const rows: RankingRow[] = picked
      .map((p) => {
        const info = names.get(p.canonical);
        const t = trendPct(p.units30d, p.prior30d);
        return {
          blankId: p.canonical,
          name: info?.name ?? '—',
          brand: info?.brand ?? null,
          department: deptName(info?.category ?? null),
          supplierCatalogProductId: firstKeeper.get(p.canonical) ?? null,
          units30d: p.units30d,
          prior30d: p.prior30d,
          trendPct: t,
          status: statusOf(t),
          _vc: variantCount.get(p.canonical) ?? 0,
        };
      })
      .sort((a, b) => {
        if (kind === 'fast') {
          const ta = a.trendPct ?? -Infinity;
          const tb = b.trendPct ?? -Infinity;
          if (tb !== ta) return tb - ta;
        }
        if (b.units30d !== a.units30d) return b.units30d - a.units30d;
        return b._vc - a._vc;
      })
      .map(({ _vc, ...r }) => r);

    const note =
      orders.length === 0
        ? 'No orders on the platform yet — the list ranks zero-sales blanks by variant count.'
        : orders30d === orders.length && sales.size > 0
          ? 'No orders in the prior 30 days — trend is not computable; Trend shows —.'
          : null;

    return NextResponse.json({
      rows,
      meta: {
        kind,
        dept: dept ?? null,
        limit,
        ordersInWindow: orders.length,
        orders30d,
        canonicalsWithSales: salesRows.length,
        note,
      },
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load rankings.');
  }
}
