import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError, hexForColorName, loadCategories, templatesForCategory, topNameOf } from '@/lib/podServer';
import type { PlacementSpec } from '@/lib/podApi';
import {
  RENDERER_VERSION,
  blankViewFromTemplateRow,
  canonicalJSON,
  inputHash,
  type RenderRequest,
} from '@/lib/renderCore';

/**
 * POST /api/v1/designs/:id/preview — queue mockup renders for the design.
 * Body: { views?: string[], colors?: string[] }. One design_renders row per
 * (view, color, kind=mockup), status queued, deduped on the unique index.
 * The render worker claims queued rows; this endpoint never renders inline.
 *
 * Hash (reconciled with the render contract §3 and the renders route):
 * RENDERER_VERSION is single-sourced from renderCore. When the blank has
 * a stored base photo, the hash is the full contract formula via
 * renderCore.inputHash. When it does not (no ingest yet), the worker
 * renders an honest skeleton on a flat garment-color canvas, and the hash
 * is namespaced 'skeleton' so it can never collide with a real render —
 * when the real base lands, the hash changes and a real render is queued.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { data: design, error } = await supabaseAdmin()
      .from('designs')
      .select('id,supplier_catalog_product_id,garment_color,canvas_state')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .single();
    if (error || !design) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No design ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const productId = design.supplier_catalog_product_id as string | null;
    let views: string[] = Array.isArray(body.views) ? body.views : [];
    let canonical: string | null = null;
    if (productId) {
      const { data: product } = await supabaseAdmin()
        .from('supplier_catalog_products')
        .select('category_id,canonical_product_id')
        .eq('id', productId)
        .single();
      if (product) {
        canonical = (product.canonical_product_id as string | null) ?? null;
        const nodes = await loadCategories();
        const templates = await templatesForCategory(topNameOf(nodes, product.category_id as string));
        const templateViews = templates.map((t) => String(t.view_angle));
        if (views.length === 0) views = templateViews;
        views = views.filter((v) => templateViews.includes(v));
      }
    }
    // Defensive dedupe: duplicate view rows (archetype + per-blank overlap)
    // would put two cells with the same conflict key into one upsert.
    views = [...new Set(views)];
    if (views.length === 0) {
      return NextResponse.json(
        { error: { code: 'NO_VIEWS', message: 'No skeleton views for this blank.', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    const colors: string[] = Array.isArray(body.colors) && body.colors.length > 0
      ? body.colors.map(String)
      : [String(design.garment_color ?? 'default')];
    const canvasState = (design.canvas_state ?? {}) as Record<string, unknown>;
    const placement = (canvasState.placement_spec ?? { version: 1, layers: [] }) as PlacementSpec;

    // Template rows for this blank (stored base photos, when ingest has
    // landed them) + color hexes + per-asset hashes for the hash inputs.
    const templateRows: Record<string, unknown>[] = [];
    if (canonical) {
      const { data } = await supabaseAdmin()
        .from('product_canvas_templates')
        .select(
          'canonical_product_id,view_angle,stored_base_path,stored_shading_path,stored_mask_path,base_sha256,shading_sha256,mask_sha256,px_per_inch,print_zone_x,print_zone_y,print_zone_width,print_zone_height,verified',
        )
        .eq('canonical_product_id', canonical)
        .eq('is_active', true);
      templateRows.push(...(data ?? []));
    }
    const assetHashes: Record<string, string> = {};
    for (const layer of placement.layers ?? []) {
      if (!layer.assetId || assetHashes[layer.assetId]) continue;
      try {
        assetHashes[layer.assetId] = await hashDesignAsset(layer.assetId);
      } catch {
        // An unreadable asset blocks only its cells (reported below);
        // the rest of the batch still queues.
        assetHashes[layer.assetId] = '';
      }
    }
    const colorHexes: Record<string, string | null> = {};
    for (const color of colors) {
      let hex: string | null = null;
      if (canonical) {
        const { data: canonRow } = await supabaseAdmin()
          .from('canonical_products')
          .select('render_colors')
          .eq('id', canonical)
          .single();
        const renderColors = (canonRow?.render_colors ?? {}) as Record<string, string>;
        for (const [name, h] of Object.entries(renderColors)) {
          if (name.trim().toLowerCase() === color.trim().toLowerCase()) hex = String(h);
        }
      }
      colorHexes[color] = hex ?? hexForColorName(color);
    }

    const rows: Record<string, unknown>[] = [];
    const skipped: { view: string; color: string; reason: string }[] = [];
    for (const view of views) {
      for (const color of colors) {
        // An asset that could not be hashed blocks this cell, never the batch.
        const missingAsset = (placement.layers ?? []).some(
          (l) => l.assetId && assetHashes[l.assetId] === '',
        );
        if (missingAsset) {
          skipped.push({ view, color, reason: 'A design asset could not be read for hashing.' });
          continue;
        }
        const row = templateRows.find((r) => String(r.view_angle) === view);
        let hash: string;
        if (row && row.base_sha256) {
          // Real path: full contract formula. A bad color hex or a view
          // mismatch skips only this cell.
          try {
            const blank = blankViewFromTemplateRow(row);
            const req: RenderRequest = {
              designId: id,
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
          // Skeleton path: no stored base photo yet. Namespaced so it can
          // never collide with a real render's hash.
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
          design_id: id,
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
    // Trigger a worker claim pass for the queued rows (fire-and-forget —
    // the response is the queue, not the render).
    void import('@/lib/renderWorker')
      .then((m) => m.processRenderQueue(5))
      .catch(() => undefined);
    return NextResponse.json({ renders: data ?? [], skipped }, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to queue preview.');
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
