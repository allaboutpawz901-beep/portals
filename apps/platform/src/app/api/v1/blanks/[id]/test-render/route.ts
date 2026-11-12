import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import {
  apiError,
  hexForColorName,
  loadCategories,
  templatesForCategory,
  topNameOf,
} from '@/lib/podServer';
import {
  RENDERER_VERSION,
  blankViewFromTemplateRow,
  canonicalJSON,
  inputHash,
  type RenderRequest,
} from '@/lib/renderCore';
import type { PlacementSpec } from '@/lib/podApi';

/**
 * POST /api/v1/blanks/:id/test-render — queue a test grid for a chosen
 * design on this blank (Lane 5). Body: { designId, views?, colors? }.
 * One design_renders row per (view, color, kind=mockup), deduped on the
 * unique index, exactly like POST /designs/:id/preview. The render
 * worker claims the rows; this endpoint never renders inline. The
 * approval gate (approve-render) reads these rows back: a test render
 * counts as approved only once a row reaches status 'succeeded'.
 * :id is a canonical_product_id or a supplier_catalog_product id.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      designId?: unknown;
      views?: unknown;
      colors?: unknown;
    };
    const designId = typeof body.designId === 'string' ? body.designId : '';
    if (!designId) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: 'test-render needs { designId }.',
            requestId: crypto.randomUUID(),
          },
        },
        { status: 400 },
      );
    }
    const { data: design, error: dErr } = await supabaseAdmin()
      .from('designs')
      .select('id,supplier_catalog_product_id,garment_color,canvas_state')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', designId)
      .single();
    if (dErr || !design) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No design ${designId}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }

    // Resolve the blank to its canonical id.
    let canonical: string | null = null;
    let categoryId: string | null = null;
    const { data: canon } = await supabaseAdmin()
      .from('canonical_products')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (canon) {
      canonical = canon.id as string;
    } else {
      const { data: product } = await supabaseAdmin()
        .from('supplier_catalog_products')
        .select('category_id,canonical_product_id')
        .eq('id', id)
        .maybeSingle();
      if (!product || !product.canonical_product_id) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: `No blank ${id}.`, requestId: crypto.randomUUID() } },
          { status: 404 },
        );
      }
      canonical = product.canonical_product_id as string;
      categoryId = product.category_id as string | null;
    }
    if (!categoryId) {
      const { data: cat } = await supabaseAdmin()
        .from('supplier_catalog_products')
        .select('category_id')
        .eq('canonical_product_id', canonical)
        .limit(1)
        .maybeSingle();
      categoryId = (cat?.category_id as string | null) ?? null;
    }

    let views: string[] = Array.isArray(body.views) ? body.views.map(String) : [];
    // Prefer the blank's own linked views; fall back to the archetype set.
    // Full rows (not just view_angle) — the hash needs the stored base sha.
    const { data: linked } = await supabaseAdmin()
      .from('product_canvas_templates')
      .select(
        'canonical_product_id,view_angle,stored_base_path,stored_shading_path,stored_mask_path,base_sha256,shading_sha256,mask_sha256,px_per_inch,print_zone_x,print_zone_y,print_zone_width,print_zone_height,verified',
      )
      .eq('canonical_product_id', canonical)
      .eq('is_active', true);
    const linkedRows = linked ?? [];
    const linkedViews = linkedRows.map((v) => String(v.view_angle));
    if (views.length === 0) views = linkedViews;
    if (views.length === 0 && categoryId) {
      const nodes = await loadCategories();
      const templates = await templatesForCategory(topNameOf(nodes, categoryId));
      views = templates.map((t) => String(t.view_angle));
    }
    // Defensive dedupe: duplicate view rows must not put two cells with the
    // same conflict key into one upsert.
    views = [...new Set(views)];
    if (views.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_VIEWS',
            message: 'No skeleton views for this blank.',
            requestId: crypto.randomUUID(),
          },
        },
        { status: 400 },
      );
    }
    if (linkedViews.length > 0) views = views.filter((v) => linkedViews.includes(v));

    const colors: string[] =
      Array.isArray(body.colors) && body.colors.length > 0
        ? body.colors.map(String)
        : [String(design.garment_color ?? 'default')];
    const canvasState = (design.canvas_state ?? {}) as Record<string, unknown>;
    const placement = (canvasState.placement_spec ?? { version: 1, layers: [] }) as PlacementSpec;

    // Hash inputs (same reconciliation as the preview route): full
    // contract formula when a stored base exists, namespaced 'skeleton'
    // hash when it does not. RENDERER_VERSION is single-sourced from
    // renderCore — never a local copy.
    const assetHashes: Record<string, string> = {};
    for (const layer of placement.layers ?? []) {
      if (!layer.assetId || assetHashes[layer.assetId]) continue;
      try {
        assetHashes[layer.assetId] = await hashDesignAsset(layer.assetId);
      } catch {
        assetHashes[layer.assetId] = '';
      }
    }
    const colorHexes: Record<string, string | null> = {};
    for (const color of colors) {
      let hex: string | null = null;
      const { data: canonRow } = await supabaseAdmin()
        .from('canonical_products')
        .select('render_colors')
        .eq('id', canonical)
        .single();
      const renderColors = (canonRow?.render_colors ?? {}) as Record<string, string>;
      for (const [name, h] of Object.entries(renderColors)) {
        if (name.trim().toLowerCase() === color.trim().toLowerCase()) hex = String(h);
      }
      colorHexes[color] = hex ?? hexForColorName(color);
    }

    const rows: Record<string, unknown>[] = [];
    const skipped: { view: string; color: string; reason: string }[] = [];
    for (const view of views) {
      for (const color of colors) {
        const missingAsset = (placement.layers ?? []).some(
          (l) => l.assetId && assetHashes[l.assetId] === '',
        );
        if (missingAsset) {
          skipped.push({ view, color, reason: 'A design asset could not be read for hashing.' });
          continue;
        }
        const row = linkedRows.find((r) => String(r.view_angle) === view);
        let hash: string;
        if (row && row.base_sha256) {
          try {
            const blank = blankViewFromTemplateRow(row as Record<string, unknown>);
            const req: RenderRequest = {
              designId,
              blankId: canonical ?? '',
              view: view as RenderRequest['view'],
              color,
              kind: 'mockup',
              placement,
              targetPxWidth: 800,
            };
            hash = inputHash(blank, req, assetHashes, colorHexes[color] ?? '');
          } catch (e) {
            skipped.push({
              view,
              color,
              reason: e instanceof Error ? e.message : 'Could not hash this cell.',
            });
            continue;
          }
        } else {
          const assetPart = Object.entries(assetHashes)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([, h]) => h)
            .join(',');
          hash = createHash('sha256')
            .update(
              [
                RENDERER_VERSION,
                'skeleton',
                view,
                color,
                'mockup',
                canonicalJSON(placement),
                assetPart,
                '800',
              ].join('|'),
            )
            .digest('hex');
        }
        rows.push({
          tenant_id: DEFAULT_TENANT_ID,
          design_id: designId,
          canonical_product_id: canonical,
          view_angle: view,
          color,
          kind: 'mockup',
          input_hash: hash,
          renderer_version: RENDERER_VERSION,
          storage_path: null,
          status: 'queued',
        });
      }
    }
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'QUEUE_FAILED',
            message: 'No cells could be queued.',
            requestId: crypto.randomUUID(),
          },
          skipped,
        },
        { status: 422 },
      );
    }
    const { data, error: insErr } = await (supabaseAdmin().from as any)('design_renders')
      .upsert(rows, { onConflict: 'tenant_id,input_hash,kind,view_angle,color' })
      .select('id,view_angle,color,kind,status,storage_path');
    if (insErr) throw new Error(`design_renders upsert: ${insErr.message}`);
    void import('@/lib/renderWorker')
      .then((m) => m.processRenderQueue(5))
      .catch(() => undefined);
    return NextResponse.json(
      { blankId: canonical, designId, renders: data ?? [], skipped },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to queue the test render.');
  }
}

/** sha256 hex of a design asset's stored bytes (mirrors the renders route). */
async function hashDesignAsset(assetId: string): Promise<string> {
  const { data: asset, error } = await supabaseAdmin()
    .from('design_assets')
    .select('id,bucket,storage_path')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', assetId)
    .single();
  if (error || !asset) throw new Error(`asset ${assetId} not found`);
  const bucket = String((asset as { bucket?: unknown }).bucket ?? 'design-assets');
  const path = String((asset as { storage_path?: unknown }).storage_path ?? '');
  if (!path) throw new Error(`asset ${assetId} has no storage_path`);
  const { data: blob, error: dlErr } = await supabaseAdmin()
    .storage.from(bucket)
    .download(path);
  if (dlErr || !blob) throw new Error(`asset ${assetId} unreadable: ${dlErr?.message ?? 'no data'}`);
  const buf = Buffer.from(await blob.arrayBuffer());
  return createHash('sha256').update(buf).digest('hex');
}
