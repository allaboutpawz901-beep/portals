import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { blankDetailCacheBust } from '@/lib/blankDetailCache';
import {
  apiError,
  loadCategories,
  templatesForCategory,
  topNameOf,
} from '@/lib/podServer';

/**
 * GET /api/v1/blanks/:id/views — the blank's render contract rows.
 * :id is a canonical_product_id; a supplier_catalog_product id is also
 * accepted and resolved to its canonical. Returns the linked
 * product_canvas_templates rows (view, box px/in, px_per_inch, stored
 * paths, verified, source, provenance: measured vs default). When the
 * blank has no linked rows yet (Lane 4 ingest has not run), the response
 * falls back to the category archetype geometry with linked:false and
 * provenance 'default' — never presented as the blank's own contract.
 *
 * PATCH /api/v1/blanks/:id/views — confirm or edit a view's print box.
 * Body: { view, box: { left, top, width, height }, pxPerInch? }.
 * Sets verified=true on the linked row and, when every linked view now
 * has assets, advances render_state missing_assets → unverified.
 * A view with no linked row is refused (404 NO_VIEW): the archetype
 * fallback cannot be verified as the blank's own geometry.
 */

export interface BlankViewContract {
  view: string;
  boxPx: { left: number; top: number; width: number; height: number };
  boxIn: { xIn: number; yIn: number; wIn: number; hIn: number };
  pxPerInch: number;
  storedBasePath: string | null;
  storedShadingPath: string | null;
  storedMaskPath: string | null;
  baseSha256: string | null;
  shadingSha256: string | null;
  maskSha256: string | null;
  verified: boolean;
  verifiedAt: string | null;
  source: string | null;
  /** 'measured' = a stored asset backs this view; 'default' = archetype geometry. */
  provenance: 'measured' | 'default';
}

async function resolveCanonical(id: string): Promise<{
  canonicalId: string;
  name: string;
  renderState: string;
  categoryId: string | null;
} | null> {
  const { data: canon } = await supabaseAdmin()
    .from('canonical_products')
    .select('id,name,render_state')
    .eq('id', id)
    .maybeSingle();
  if (canon) {
    // Category for the archetype fallback comes from a keeper catalog row.
    const { data: cat } = await supabaseAdmin()
      .from('supplier_catalog_products')
      .select('category_id')
      .eq('canonical_product_id', canon.id as string)
      .limit(1)
      .maybeSingle();
    return {
      canonicalId: canon.id as string,
      name: String(canon.name ?? ''),
      renderState: String(canon.render_state ?? 'missing_assets'),
      categoryId: (cat?.category_id as string | null) ?? null,
    };
  }
  const { data: product } = await supabaseAdmin()
    .from('supplier_catalog_products')
    .select('id,name,category_id,canonical_product_id')
    .eq('id', id)
    .maybeSingle();
  if (!product || !product.canonical_product_id) return null;
  const { data: canon2 } = await supabaseAdmin()
    .from('canonical_products')
    .select('id,name,render_state')
    .eq('id', product.canonical_product_id as string)
    .maybeSingle();
  if (!canon2) return null;
  return {
    canonicalId: canon2.id as string,
    name: String(canon2.name ?? product.name ?? ''),
    renderState: String(canon2.render_state ?? 'missing_assets'),
    categoryId: (product.category_id as string | null) ?? null,
  };
}

function contractView(t: Record<string, unknown>): BlankViewContract {
  // Render contract §3: boxPx is the print zone in PHOTO pixels and
  // boxIn is px / pxPerInch. The stored px_per_inch is the photo density
  // (zone px ÷ physical inches, e.g. 300px ÷ 12in = 25) — NOT the 300-DPI
  // print density the Studio detail endpoint uses for its own boxPx.
  // Mixing the two systems (print px ÷ 25) would give 144-inch boxes.
  const zoneX = Number(t.print_zone_x ?? 0);
  const zoneY = Number(t.print_zone_y ?? 0);
  const zoneW = Number(t.print_zone_width ?? 0);
  const zoneH = Number(t.print_zone_height ?? 0);
  const physW = Number(t.physical_width_inches ?? 0);
  const physH = Number(t.physical_height_inches ?? 0);
  const ppi =
    t.px_per_inch != null
      ? Number(t.px_per_inch)
      : zoneW > 0 && physW > 0
        ? zoneW / physW
        : 300;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    view: String(t.view_angle),
    boxPx: { left: zoneX, top: zoneY, width: zoneW, height: zoneH },
    boxIn: {
      xIn: r2(ppi > 0 ? zoneX / ppi : 0),
      yIn: r2(ppi > 0 ? zoneY / ppi : 0),
      wIn: physW > 0 ? physW : r2(ppi > 0 ? zoneW / ppi : 0),
      hIn: physH > 0 ? physH : r2(ppi > 0 ? zoneH / ppi : 0),
    },
    pxPerInch: ppi,
    storedBasePath: (t.stored_base_path as string | null) ?? null,
    storedShadingPath: (t.stored_shading_path as string | null) ?? null,
    storedMaskPath: (t.stored_mask_path as string | null) ?? null,
    baseSha256: (t.base_sha256 as string | null) ?? null,
    shadingSha256: (t.shading_sha256 as string | null) ?? null,
    maskSha256: (t.mask_sha256 as string | null) ?? null,
    verified: Boolean(t.verified),
    verifiedAt: (t.verified_at as string | null) ?? null,
    source: (t.source as string | null) ?? null,
    provenance: t.stored_base_path ? 'measured' : 'default',
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const blank = await resolveCanonical(id);
    if (!blank) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No blank ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const { data: linked, error } = await supabaseAdmin()
      .from('product_canvas_templates')
      .select('*')
      .eq('canonical_product_id', blank.canonicalId)
      .eq('is_active', true)
      .order('view_angle');
    if (error) throw new Error(`product_canvas_templates: ${error.message}`);

    if ((linked ?? []).length > 0) {
      return NextResponse.json({
        blankId: blank.canonicalId,
        name: blank.name,
        renderState: blank.renderState,
        linked: true,
        views: (linked ?? []).map((t) => contractView(t as Record<string, unknown>)),
      });
    }

    // No per-blank contract rows: archetype fallback, clearly marked.
    const nodes = await loadCategories();
    const topName = blank.categoryId ? topNameOf(nodes, blank.categoryId) : null;
    const archetypes = await templatesForCategory(topName);
    return NextResponse.json({
      blankId: blank.canonicalId,
      name: blank.name,
      renderState: blank.renderState,
      linked: false,
      note: 'No per-blank render contract rows yet — showing the category archetype geometry (unverified, default).',
      views: archetypes.map((t) => contractView(t as Record<string, unknown>)),
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load blank views.');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      view?: unknown;
      box?: { left?: unknown; top?: unknown; width?: unknown; height?: unknown };
      pxPerInch?: unknown;
    };
    const view = typeof body.view === 'string' ? body.view : '';
    const box = body.box ?? {};
    const nums = ['left', 'top', 'width', 'height'].map((k) =>
      Number((box as Record<string, unknown>)[k]),
    );
    if (!view || nums.some((n) => !Number.isFinite(n) || n < 0)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'PATCH needs { view, box: { left, top, width, height } } in pixels.',
            requestId: crypto.randomUUID(),
          },
        },
        { status: 400 },
      );
    }
    const blank = await resolveCanonical(id);
    if (!blank) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No blank ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const { data: row, error } = await supabaseAdmin()
      .from('product_canvas_templates')
      .select('id,view_angle')
      .eq('canonical_product_id', blank.canonicalId)
      .eq('view_angle', view)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new Error(`product_canvas_templates: ${error.message}`);
    if (!row) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_VIEW',
            message: `No render contract row for this blank's ${view} view — ingest must link it first. The archetype fallback cannot be verified as this blank's geometry.`,
            requestId: crypto.randomUUID(),
          },
        },
        { status: 404 },
      );
    }
    const patch: Record<string, unknown> = {
      print_zone_x: Math.round(nums[0]),
      print_zone_y: Math.round(nums[1]),
      print_zone_width: Math.round(nums[2]),
      print_zone_height: Math.round(nums[3]),
      verified: true,
      verified_at: new Date().toISOString(),
    };
    if (typeof body.pxPerInch === 'number' && body.pxPerInch > 0) {
      patch.px_per_inch = body.pxPerInch;
    }
    const { error: updErr } = await supabaseAdmin()
      .from('product_canvas_templates')
      .update(patch)
      .eq('id', row.id as string);
    if (updErr) throw new Error(`product_canvas_templates update: ${updErr.message}`);

    // Transition: missing_assets → unverified when every linked view has assets.
    let renderState = blank.renderState;
    if (renderState === 'missing_assets') {
      const { data: views } = await supabaseAdmin()
        .from('product_canvas_templates')
        .select('stored_base_path')
        .eq('canonical_product_id', blank.canonicalId)
        .eq('is_active', true);
      const all = views ?? [];
      if (all.length > 0 && all.every((v) => Boolean(v.stored_base_path))) {
        const { error: stErr } = await supabaseAdmin()
          .from('canonical_products')
          .update({ render_state: 'unverified' })
          .eq('id', blank.canonicalId);
        if (!stErr) renderState = 'unverified';
      }
    }

    const { data: updated } = await supabaseAdmin()
      .from('product_canvas_templates')
      .select('*')
      .eq('id', row.id as string)
      .single();
    // The QA drag rewrote the render contract — drop the cached detail.
    blankDetailCacheBust(id);
    return NextResponse.json({
      blankId: blank.canonicalId,
      renderState,
      view: contractView((updated ?? {}) as Record<string, unknown>),
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to confirm the print box.');
  }
}
