import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError, hexForColorName } from '@/lib/podServer';
import type { PlacementSpec } from '@/lib/podApi';
import {
  RENDERER_VERSION,
  blankViewFromTemplateRow,
  inputHash,
  type RenderRequest,
} from '@/lib/renderCore';

/**
 * POST /api/v1/designs/:id/print — queue the design's PRINT renders
 * (kind='print'): the full-size transparent PNG at 300 DPI per
 * (view, color) that the suppliers' fulfillment APIs consume.
 *
 * The print file is the contract output publish reads
 * (designs.print_file_path, set by the worker when a print render
 * succeeds). One design_renders row per linked view × garment color,
 * deduped on the unique index; the worker claims and renders them.
 *
 * Requires an INGESTED blank (stored base + hashes on the template rows)
 * — the hash contract needs base_sha256 even for print, so the queue
 * refuses honestly with what's missing instead of faking a file.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: design, error } = await supabaseAdmin()
      .from('designs')
      .select('id,supplier_catalog_product_id,garment_color,canvas_state,placement_spec')
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
    if (!productId) {
      return apiError('Design has no blank attached.', 422);
    }
    const { data: product } = await supabaseAdmin()
      .from('supplier_catalog_products')
      .select('canonical_product_id')
      .eq('id', productId)
      .single();
    const canonical = (product?.canonical_product_id as string | null) ?? null;
    if (!canonical) {
      return apiError('Blank has no canonical_product_id — print rendering is not possible.', 422);
    }

    // Linked views with print geometry (stored base or real inches from
    // ingestion). Un-ingested views are reported as blockers, never
    // silently dropped.
    const { data: templateRows, error: tErr } = await supabaseAdmin()
      .from('product_canvas_templates')
      .select(
        'canonical_product_id,view_angle,stored_base_path,stored_shading_path,stored_mask_path,base_sha256,shading_sha256,mask_sha256,px_per_inch,print_zone_x,print_zone_y,print_zone_width,print_zone_height,physical_width_inches,physical_height_inches,verified',
      )
      .eq('canonical_product_id', canonical)
      .eq('is_active', true)
      .order('view_angle');
    if (tErr) throw new Error(`product_canvas_templates: ${tErr.message}`);
    const rows = templateRows ?? [];
    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_INGESTED',
            message: 'This blank has no render contract rows yet — open it once to trigger ingestion, then retry.',
            requestId: crypto.randomUUID(),
          },
        },
        { status: 422 },
      );
    }

    const canvasState = (design.canvas_state ?? {}) as Record<string, unknown>;
    const placement = ((design.placement_spec as PlacementSpec | null) ??
      (canvasState.placement_spec as PlacementSpec | null) ?? { version: 1, layers: [] }) as PlacementSpec;

    const color = String(design.garment_color ?? 'default');
    const { data: canonRow } = await supabaseAdmin()
      .from('canonical_products')
      .select('render_colors')
      .eq('id', canonical)
      .single();
    const renderColors = (canonRow?.render_colors ?? {}) as Record<string, string>;
    let colorHex: string | null = null;
    for (const [name, hex] of Object.entries(renderColors)) {
      if (name.trim().toLowerCase() === color.trim().toLowerCase()) colorHex = String(hex);
    }
    colorHex = colorHex ?? hexForColorName(color);

    // Asset hashes — one unreadable asset blocks the whole print queue
    // (the print file must be complete to be publishable).
    const assetHashes: Record<string, string> = {};
    for (const layer of placement.layers ?? []) {
      if (!layer.assetId || assetHashes[layer.assetId]) continue;
      try {
        const { data: asset } = await supabaseAdmin()
          .from('design_assets')
          .select('bucket,storage_path')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('id', layer.assetId)
          .single();
        if (!asset?.storage_path) throw new Error(`asset ${layer.assetId} not found`);
        const bucket = String((asset as { bucket?: unknown }).bucket ?? 'design-assets');
        const blob = await supabaseAdmin().storage.from(bucket).download(String(asset.storage_path));
        if (!blob.data) throw new Error(`asset ${layer.assetId} unreadable`);
        assetHashes[layer.assetId] = createHash('sha256')
          .update(Buffer.from(await blob.data.arrayBuffer()))
          .digest('hex');
      } catch (e) {
        return apiError(
          `Print file needs every design asset readable: ${e instanceof Error ? e.message : 'asset failed'}.`,
          422,
        );
      }
    }

    const queued: { view: string; color: string; status: string }[] = [];
    const skipped: { view: string; reason: string }[] = [];
    for (const row of rows) {
      const view = String(row.view_angle);
      // A PRINT file is the design's layers at 300 DPI on a transparent
      // canvas — it never composites the base photo, so a stored base is
      // NOT required. Geometry-only rows (provider exposes no photo; real
      // inches on file) print fine. Skip only rows with no geometry at all.
      if (!row.base_sha256 && Number(row.physical_width_inches ?? 0) <= 0) {
        skipped.push({ view, reason: 'View has no print geometry — ingest first.' });
        continue;
      }
      try {
        const blank = blankViewFromTemplateRow(row as Record<string, unknown>);
        const req: RenderRequest = {
          designId: id,
          blankId: canonical,
          view: view as RenderRequest['view'],
          color,
          kind: 'print',
          placement,
          targetPxWidth: Math.round(blank.boxIn.wIn * 300),
        };
        const hash = inputHash(blank, req, assetHashes, colorHex ?? '');
        const { error: upErr } = await (supabaseAdmin().from as any)('design_renders')
          .upsert(
            [
              {
                tenant_id: DEFAULT_TENANT_ID,
                design_id: id,
                canonical_product_id: canonical,
                view_angle: view,
                color,
                kind: 'print',
                input_hash: hash,
                renderer_version: RENDERER_VERSION,
                storage_path: null,
                status: 'queued',
              },
            ],
            { onConflict: 'tenant_id,input_hash,kind,view_angle,color' },
          );
        if (upErr) throw new Error(upErr.message);
        queued.push({ view, color, status: 'queued' });
      } catch (e) {
        skipped.push({ view, reason: e instanceof Error ? e.message : 'queue failed' });
      }
    }
    if (queued.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NOTHING_QUEUED',
            message: 'No print render could be queued for this design.',
            requestId: crypto.randomUUID(),
          },
          skipped,
        },
        { status: 422 },
      );
    }
    // Trigger a worker claim pass (fire-and-forget — the response is the queue).
    void import('@/lib/renderWorker')
      .then((m) => m.processRenderQueue(5))
      .catch(() => undefined);
    return NextResponse.json({ queued, skipped, color }, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to queue print renders.');
  }
}
