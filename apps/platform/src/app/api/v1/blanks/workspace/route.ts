import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError, keeperSupplierIds } from '@/lib/podServer';

/**
 * GET /api/v1/blanks/workspace — the blank workspace queue (Lane 5).
 * Canonical products with render_state, lifecycle, render colors, and
 * per-blank view verification counts + studio eligibility.
 *
 *   ?state=missing_assets|unverified|render_ready — filter by render state.
 *   ?ids=<csv of canonical_product_id> — eligibility lookup for one page
 *     of catalog rows (the CatalogList calls this after listBlanks).
 *   ?limit=&cursor= — pagination (offset cursor, default 50, max 100).
 *
 * Eligibility (unified doc §7): eligible = render_state render_ready +
 * at least one keeper-supplier offer + not discontinued. review =
 * missing_assets / unverified / default geometry / no offer.
 * discontinued = lifecycle archived. There is no 'discontinued' lifecycle
 * value in the live enum (imported, categorized, designed, ready,
 * archived) — archived is the discontinued marker.
 *
 * Nothing here invents data: a blank with no linked template rows reports
 * views.total 0, and a blank with no keeper catalog row reports offers 0.
 */

export type EligibilityStatus = 'eligible' | 'review' | 'discontinued';

export interface WorkspaceBlank {
  canonicalProductId: string;
  name: string;
  brand: string | null;
  category: string | null;
  lifecycle: string | null;
  renderState: string;
  renderColors: Record<string, string>;
  views: { total: number; verified: number; withAssets: number };
  offers: number;
  eligibility: { status: EligibilityStatus; reasons: string[] };
}

export function eligibilityFor(row: {
  renderState: string;
  lifecycle: string | null;
  viewsTotal: number;
  viewsVerified: number;
  viewsWithAssets: number;
  offers: number;
}): { status: EligibilityStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (row.lifecycle === 'archived') {
    return { status: 'discontinued', reasons: ['Lifecycle is archived.'] };
  }
  if (row.renderState === 'missing_assets') reasons.push('No render assets yet.');
  if (row.renderState === 'unverified') reasons.push('Render assets unverified.');
  // Default geometry is a review reason only while the blank is unapproved.
  // Once render_ready, every view is verified and a test render succeeded,
  // so the geometry is proven — approval outranks provenance. (Without
  // this, a manually verified blank could never graduate to eligible.)
  if (
    row.renderState !== 'render_ready' &&
    row.viewsTotal > 0 &&
    row.viewsWithAssets === 0
  ) {
    reasons.push('Print geometry is the default archetype, not measured for this blank.');
  }
  if (row.offers === 0) reasons.push('No keeper supplier offer.');
  if (
    row.renderState === 'render_ready' &&
    row.offers > 0 &&
    reasons.length === 0
  ) {
    return { status: 'eligible', reasons: [] };
  }
  return { status: 'review', reasons };
}

async function stateCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {
    missing_assets: 0,
    unverified: 0,
    render_ready: 0,
  };
  for (const state of Object.keys(counts)) {
    const { count } = await supabaseAdmin()
      .from('canonical_products')
      .select('id', { count: 'exact', head: true })
      .eq('render_state', state);
    counts[state] = count ?? 0;
  }
  return counts;
}

export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const state = params.get('state') ?? undefined;
    const idsParam = params.get('ids') ?? undefined;
    const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1), 100);
    const offset = Math.max(parseInt(params.get('cursor') ?? '0', 10) || 0, 0);

    if (state && !['missing_assets', 'unverified', 'render_ready'].includes(state)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: `Unknown render state ${state}.`,
            requestId: crypto.randomUUID(),
          },
        },
        { status: 400 },
      );
    }

    const ids = idsParam
      ? [...new Set(idsParam.split(',').map((s) => s.trim()).filter(Boolean))]
      : [];

    let query = supabaseAdmin()
      .from('canonical_products')
      .select('id,name,brand,category,lifecycle,render_state,render_colors', { count: 'exact' })
      .order('name', { ascending: true });
    if (state) query = query.eq('render_state', state);
    if (ids.length > 0) query = query.in('id', ids);
    const { data: blanks, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw new Error(`canonical_products: ${error.message}`);
    const rows = blanks ?? [];
    const canonicalIds = rows.map((r) => r.id as string);

    // Per-blank view verification counts (linked, active template rows).
    const viewCounts = new Map<string, { total: number; verified: number; withAssets: number }>();
    if (canonicalIds.length > 0) {
      for (let from = 0; ; from += 1000) {
        const { data, error: vErr } = await supabaseAdmin()
          .from('product_canvas_templates')
          .select('canonical_product_id,verified,stored_base_path')
          .in('canonical_product_id', canonicalIds)
          .eq('is_active', true)
          .range(from, from + 999);
        if (vErr) throw new Error(`product_canvas_templates: ${vErr.message}`);
        for (const v of data ?? []) {
          const id = v.canonical_product_id as string;
          const c = viewCounts.get(id) ?? { total: 0, verified: 0, withAssets: 0 };
          c.total += 1;
          if (v.verified) c.verified += 1;
          if (v.stored_base_path) c.withAssets += 1;
          viewCounts.set(id, c);
        }
        if (!data || data.length < 1000) break;
      }
    }

    // Keeper-supplier offers per canonical (a catalog row = an offer).
    const offerCounts = new Map<string, number>();
    if (canonicalIds.length > 0) {
      const keeperIds = await keeperSupplierIds();
      for (let from = 0; ; from += 1000) {
        const { data, error: oErr } = await supabaseAdmin()
          .from('supplier_catalog_products')
          .select('canonical_product_id')
          .in('canonical_product_id', canonicalIds)
          .in('supplier_id', keeperIds)
          .range(from, from + 999);
        if (oErr) throw new Error(`supplier_catalog_products: ${oErr.message}`);
        for (const o of data ?? []) {
          const id = o.canonical_product_id as string;
          offerCounts.set(id, (offerCounts.get(id) ?? 0) + 1);
        }
        if (!data || data.length < 1000) break;
      }
    }

    const items: WorkspaceBlank[] = rows.map((r) => {
      const id = r.id as string;
      const views = viewCounts.get(id) ?? { total: 0, verified: 0, withAssets: 0 };
      const renderState = String(r.render_state ?? 'missing_assets');
      const eligibility = eligibilityFor({
        renderState,
        lifecycle: (r.lifecycle as string | null) ?? null,
        viewsTotal: views.total,
        viewsVerified: views.verified,
        viewsWithAssets: views.withAssets,
        offers: offerCounts.get(id) ?? 0,
      });
      return {
        canonicalProductId: id,
        name: String(r.name ?? ''),
        brand: (r.brand as string | null) ?? null,
        category: (r.category as string | null) ?? null,
        lifecycle: (r.lifecycle as string | null) ?? null,
        renderState,
        renderColors: (r.render_colors ?? {}) as Record<string, string>,
        views,
        offers: offerCounts.get(id) ?? 0,
        eligibility,
      };
    });

    const total = count ?? 0;
    const nextCursor = offset + rows.length < total ? String(offset + rows.length) : null;
    return NextResponse.json({
      items,
      nextCursor,
      meta: {
        state: state ?? null,
        total,
        counts: await stateCounts(),
        tenantId: DEFAULT_TENANT_ID,
      },
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load the blank workspace.');
  }
}
