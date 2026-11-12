import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError, hexForColorName } from '@/lib/podServer';
import {
  blankViewFromTemplateRow,
  inputHash,
  isViewAngle,
  RENDERER_VERSION,
  type BlankView,
  type RenderRequest,
} from '@/lib/renderCore';

const errBody = (code: string, message: string, status: number) =>
  NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );

interface RenderRow {
  id: string;
  view_angle: string;
  color: string;
  kind: 'mockup' | 'print';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'stale';
  storage_path: string | null;
  input_hash: string;
  created_at: string;
}

/** Map a design_renders row to the client's RenderStatus shape (+ hash). */
function mapRow(r: RenderRow) {
  return {
    id: r.id,
    view: r.view_angle,
    color: r.color,
    kind: r.kind,
    status: r.status,
    storagePath: r.storage_path,
    inputHash: r.input_hash,
    createdAt: r.created_at,
  };
}

const SELECT_COLS =
  'id,view_angle,color,kind,status,storage_path,input_hash,created_at';

/**
 * GET /api/v1/renders?designId= — the review grid poll (contract §6).
 * Returns the design's render rows, newest first. The worker updates
 * status/storage_path as it completes; the grid re-polls while any row is
 * queued/running. Succeeded rows carry a short-lived signed `url` (the
 * storage_path is `bucket/path`; the studio displays the actual render
 * from it).
 */
export async function GET(req: NextRequest) {
  try {
    const designId = new URL(req.url).searchParams.get('designId');
    if (!designId) {
      return errBody('VALIDATION', 'designId is required.', 400);
    }
    const { data, error } = await (supabaseAdmin().from as any)('design_renders')
      .select(SELECT_COLS)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('design_id', designId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(`design_renders: ${error.message}`);
    const mapped = await Promise.all(
      ((data ?? []) as RenderRow[]).map(async (r) => ({
        ...mapRow(r),
        url: await renderUrl(r.storage_path),
      })),
    );
    return NextResponse.json({ renders: mapped });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list renders.');
  }
}

/** Signed URL (1h) for a succeeded render's `bucket/path` storage_path. */
async function renderUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null;
  const slash = storagePath.indexOf('/');
  if (slash <= 0) return null;
  const bucket = storagePath.slice(0, slash);
  const path = storagePath.slice(slash + 1);
  try {
    const { data } = await supabaseAdmin()
      .storage.from(bucket)
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

// ── POST /api/v1/renders — queue render rows (contract §6, Lane 7). ──

interface QueueItem {
  blankId: string;
  view: string;
  color: string;
  kind: 'mockup' | 'print';
  placement: RenderRequest['placement'];
  targetPxWidth?: number;
  supplierTransform?: RenderRequest['supplierTransform'];
}

interface QueueError {
  index: number;
  code: string;
  message: string;
}

/** Resolve a color name to its hex for the hash. render_colors first, then the known-name table. */
async function resolveColorHex(blankId: string, color: string): Promise<string | null> {
  const { data: product } = await supabaseAdmin()
    .from('canonical_products')
    .select('render_colors')
    .eq('id', blankId)
    .single();
  const colors = (product?.render_colors ?? {}) as Record<string, string>;
  for (const [name, hex] of Object.entries(colors)) {
    if (name.trim().toLowerCase() === color.trim().toLowerCase()) return String(hex);
  }
  return hexForColorName(color);
}

/** sha256 hex of a design asset's stored bytes (the hash inputHash needs).
 * The asset row carries no hash column, so the bytes are read from storage
 * and hashed at queue time — never invented, never the storage path. */
async function hashDesignAsset(assetId: string): Promise<string> {
  const { data: asset, error } = await supabaseAdmin()
    .from('design_assets')
    .select('id,bucket,storage_path')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', assetId)
    .single();
  if (error || !asset) throw new Error(`asset ${assetId} not found`);
  const bucket = String((asset as any).bucket ?? 'design-assets');
  const path = String((asset as any).storage_path ?? '');
  if (!path) throw new Error(`asset ${assetId} has no storage_path`);
  const { data: blob, error: dlErr } = await supabaseAdmin()
    .storage.from(bucket)
    .download(path);
  if (dlErr || !blob) throw new Error(`asset ${assetId} unreadable: ${dlErr?.message ?? 'no data'}`);
  const buf = Buffer.from(await blob.arrayBuffer());
  return createHash('sha256').update(buf).digest('hex');
}

async function queueOne(
  designId: string,
  item: QueueItem,
  index: number,
): Promise<{ row: ReturnType<typeof mapRow> & { reused: boolean; templateVerified: boolean } } | { error: QueueError }> {
  const fail = (code: string, message: string) => ({ error: { index, code, message } });
  try {
    if (!item.blankId || typeof item.blankId !== 'string') {
      return fail('VALIDATION', 'blankId is required.');
    }
    if (!isViewAngle(item.view)) {
      return fail('VALIDATION', `view must be one of FRONT, BACK, LEFT_SIDE, RIGHT_SIDE, WRAPAROUND, TOP_DOWN, INSIDE_LABEL.`);
    }
    if (item.kind !== 'mockup' && item.kind !== 'print') {
      return fail('VALIDATION', `kind must be 'mockup' or 'print'.`);
    }
    if (!item.color || typeof item.color !== 'string') {
      return fail('VALIDATION', 'color is required.');
    }
    if (!item.placement || item.placement.version !== 1 || !Array.isArray(item.placement.layers)) {
      return fail('VALIDATION', 'placement must be a PlacementSpec (version 1, layers array).');
    }
    if (item.supplierTransform) {
      const t = item.supplierTransform;
      if (
        !Number.isFinite(t.offsetXIn) ||
        !Number.isFinite(t.offsetYIn) ||
        !Number.isFinite(t.scale) ||
        t.scale <= 0
      ) {
        return fail('VALIDATION', 'supplierTransform needs finite offsetXIn/offsetYIn and scale > 0.');
      }
    }

    // The render contract's BlankView: one product_canvas_templates row for
    // this blank + view. No row, or no stored base photo, means the render
    // cannot be computed — queueing it would produce a fake mockup.
    const { data: tpl, error: tplErr } = await supabaseAdmin()
      .from('product_canvas_templates')
      .select(
        'canonical_product_id,view_angle,stored_base_path,stored_shading_path,stored_mask_path,base_sha256,shading_sha256,mask_sha256,px_per_inch,print_zone_x,print_zone_y,print_zone_width,print_zone_height,verified',
      )
      .eq('canonical_product_id', item.blankId)
      .eq('view_angle', item.view)
      .eq('is_active', true)
      .single();
    if (tplErr || !tpl) {
      return fail(
        'NO_TEMPLATE',
        `No product_canvas_templates row for blank ${item.blankId} view ${item.view}. Assets have not been ingested for this blank.`,
      );
    }
    let blank: BlankView;
    try {
      blank = blankViewFromTemplateRow(tpl as Record<string, unknown>);
    } catch (e) {
      return fail('NO_TEMPLATE', e instanceof Error ? e.message : 'Template row is unusable.');
    }
    if (!blank.basePath || !blank.baseSha256) {
      return fail(
        'NO_BASE_ASSET',
        `Template for blank ${item.blankId} view ${item.view} has no stored base photo (stored_base_path/base_sha256 empty). Ingest the base image before queueing renders.`,
      );
    }

    const colorHex = await resolveColorHex(item.blankId, item.color);
    if (!colorHex) {
      return fail(
        'COLOR_HEX_UNKNOWN',
        `No hex for color "${item.color}" — canonical_products.render_colors has no entry and the name is not a known color.`,
      );
    }

    const targetPxWidth =
      typeof item.targetPxWidth === 'number'
        ? Math.floor(item.targetPxWidth)
        : item.kind === 'print'
          ? Math.round(blank.boxIn.wIn * 300)
          : 1200;
    if (!Number.isFinite(targetPxWidth) || targetPxWidth <= 0 || targetPxWidth > 10000) {
      return fail('VALIDATION', 'targetPxWidth must be a positive integer (max 10000).');
    }

    const req: RenderRequest = {
      designId,
      blankId: item.blankId,
      view: item.view,
      color: item.color,
      kind: item.kind,
      placement: item.placement,
      targetPxWidth,
      supplierTransform: item.supplierTransform,
    };
    const assetIds = Array.from(
      new Set(
        (item.placement.layers ?? [])
          .map((l) => l.assetId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    const assetSha256: Record<string, string> = {};
    for (const id of assetIds) {
      try {
        assetSha256[id] = await hashDesignAsset(id);
      } catch (e) {
        return fail('ASSET_UNREADABLE', e instanceof Error ? e.message : `asset ${id} unreadable`);
      }
    }

    let hash: string;
    try {
      hash = inputHash(blank, req, assetSha256, colorHex);
    } catch (e) {
      return fail('HASH_FAILED', e instanceof Error ? e.message : 'inputHash failed');
    }

    // Idempotent reuse: a succeeded row with the same hash already rendered
    // this exact output — return its storage_path, never render twice.
    const { data: existing } = await (supabaseAdmin().from as any)('design_renders')
      .select(SELECT_COLS)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('input_hash', hash)
      .eq('kind', item.kind)
      .eq('view_angle', item.view)
      .eq('color', item.color)
      .order('created_at', { ascending: false })
      .limit(1);
    const hit = (existing?.[0] ?? null) as RenderRow | null;
    if (hit && hit.status === 'succeeded' && hit.storage_path) {
      return {
        row: { ...mapRow(hit), reused: true, templateVerified: blank.verified },
      };
    }
    if (hit) {
      // Same hash already queued/running — the one row covers both callers.
      return {
        row: { ...mapRow(hit), reused: true, templateVerified: blank.verified },
      };
    }

    const { data: inserted, error: insErr } = await (supabaseAdmin().from as any)('design_renders')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        design_id: designId,
        canonical_product_id: item.blankId,
        view_angle: item.view,
        color: item.color,
        kind: item.kind,
        input_hash: hash,
        renderer_version: RENDERER_VERSION,
        storage_path: null,
        status: 'queued',
      })
      .select(SELECT_COLS)
      .single();
    if (insErr) {
      // Unique-index race: a concurrent queue won — re-read and reuse.
      if (String((insErr as any).code) === '23505') {
        const { data: raced } = await (supabaseAdmin().from as any)('design_renders')
          .select(SELECT_COLS)
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('input_hash', hash)
          .eq('kind', item.kind)
          .eq('view_angle', item.view)
          .eq('color', item.color)
          .limit(1);
        if (raced?.[0]) {
          return {
            row: { ...mapRow(raced[0] as RenderRow), reused: true, templateVerified: blank.verified },
          };
        }
      }
      throw new Error(`design_renders insert: ${insErr.message}`);
    }
    return {
      row: { ...mapRow(inserted as RenderRow), reused: false, templateVerified: blank.verified },
    };
  } catch (err) {
    return fail('INTERNAL', err instanceof Error ? err.message : 'Failed to queue render.');
  }
}

/**
 * POST /api/v1/renders — queue render rows (contract §6, Lane 7).
 * Body (one row): { designId, blankId, view, color, kind, placement,
 *   targetPxWidth?, supplierTransform? }
 * Body (batch): { designId, renders: [ { blankId, view, color, kind,
 *   placement, targetPxWidth?, supplierTransform? }, ... ] }
 * The input_hash is computed via renderCore from the blank's stored template
 * row (never a supplier URL), the resolved color hex, and the sha256 of
 * every referenced design asset's stored bytes. A succeeded row with the
 * same hash is reused (storage_path returned, reused: true) — never render
 * twice. Rows that cannot be queued (no template, no base asset, unknown
 * color hex, unreadable asset) are reported per-item in `errors` and do
 * not fail the batch. This endpoint queues only; the worker claims rows
 * separately (POST /api/v1/render-worker/claim).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      designId?: unknown;
      renders?: unknown;
      blankId?: unknown;
      view?: unknown;
      color?: unknown;
      kind?: unknown;
      placement?: unknown;
      targetPxWidth?: unknown;
      supplierTransform?: unknown;
    };
    const designId = typeof body.designId === 'string' ? body.designId : '';
    if (!designId) return errBody('VALIDATION', 'designId is required.', 400);

    const { data: design, error: dErr } = await supabaseAdmin()
      .from('designs')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', designId)
      .single();
    if (dErr || !design) {
      return errBody('NOT_FOUND', `No design ${designId}.`, 404);
    }

    const items: QueueItem[] = Array.isArray(body.renders)
      ? (body.renders as QueueItem[])
      : [
          {
            blankId: body.blankId as string,
            view: body.view as string,
            color: body.color as string,
            kind: body.kind as 'mockup' | 'print',
            placement: body.placement as QueueItem['placement'],
            targetPxWidth: body.targetPxWidth as number | undefined,
            supplierTransform: body.supplierTransform as QueueItem['supplierTransform'],
          },
        ];
    if (items.length === 0) return errBody('VALIDATION', 'renders must not be empty.', 400);
    if (items.length > 50) return errBody('VALIDATION', 'At most 50 renders per request.', 400);

    const renders: Array<ReturnType<typeof mapRow> & { reused: boolean; templateVerified: boolean }> = [];
    const errors: QueueError[] = [];
    for (let i = 0; i < items.length; i++) {
      const res = await queueOne(designId, items[i], i);
      if ('error' in res) errors.push(res.error);
      else renders.push(res.row);
    }
    if (renders.length === 0) {
      return NextResponse.json(
        { error: { code: 'QUEUE_FAILED', message: 'No renders could be queued.', requestId: crypto.randomUUID() }, errors },
        { status: 422 },
      );
    }
    return NextResponse.json({ renders, errors }, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to queue renders.');
  }
}
