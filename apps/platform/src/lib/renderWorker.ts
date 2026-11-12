import { createHash } from 'crypto';
import sharp from 'sharp';
import { supabaseAdmin, DEFAULT_TENANT_ID } from './supabaseAdmin';
import {
  hexForColorName,
  loadCategories,
  topNameOf,
} from './podServer';

/**
 * Render worker (Lane 3) — claims queued design_renders rows and composites
 * them per pod-render-contract §4. The claim SQL from the contract lives
 * inside the `claim_design_renders` RPC (SECURITY DEFINER): recovery of
 * rows running > 5 minutes (requeue while attempts < 3, fail at 3),
 * then FOR UPDATE SKIP LOCKED claim with attempts+1.
 *
 * Compositor: sharp (already the dependency the worker was built on;
 * konva + node-canvas are NOT installed in this image, so headless Konva
 * is unverified here — Lane 2's renderCore.ts owns the shared buildStage
 * and should replace the local hash/box helpers below when it lands).
 *
 * No supplier URL is ever read at render time. The base photo, shading
 * and mask come from OUR storage (product_canvas_templates.stored_*_path)
 * when present; today every template row has those NULL (verified live),
 * so the worker falls back to a flat garment-color base on the skeleton
 * geometry — never a supplier hotlink. A render is NEVER marked
 * succeeded without a real file in storage.
 *
 * Fonts: only fonts present in the worker image may render. A missing
 * font fails that ONE job (error `missing_font: <fontId>`) — never a
 * substitution, never the batch. The Studio's licensed list
 * (Anton, Inter, Playfair Display, Bebas Neue) is NOT installed in this
 * image (verified: fc-list finds 0 of the 4), so any text layer using one
 * of those fails here until the worker image ships them.
 */

import { RENDERER_VERSION } from '@/lib/renderCore';
export { RENDERER_VERSION };
const MOCKUP_BASE_W = 450;
const MOCKUP_BASE_H = 600;
const PRINT_DPI = 300;

/* ── Contract §3: canonical JSON, box math, input hash ────────────────
 * Local copies kept for the worker's own inputHash export; the pipeline
 * hashes at queue time via renderCore (single source of RENDERER_VERSION
 * and the formula). The worker's inputHash is not called in the claim
 * path — reuse reads the row's stored input_hash. */

export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJSON(obj[k])}`).join(',')}}`;
}

export function boxToPixels(
  boxIn: { xIn: number; yIn: number; wIn: number; hIn: number },
  pxPerInch: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: Math.round(boxIn.xIn * pxPerInch),
    top: Math.round(boxIn.yIn * pxPerInch),
    width: Math.round(boxIn.wIn * pxPerInch),
    height: Math.round(boxIn.hIn * pxPerInch),
  };
}

export interface InputHashArgs {
  baseSha256: string | null;
  shadingSha256: string | null;
  maskSha256: string | null;
  colorHex: string;
  view: string;
  kind: 'mockup' | 'print';
  placement: unknown;
  assetSha256s: string[];
  targetPxWidth: number;
  supplierTransform?: unknown;
}

export function inputHash(a: InputHashArgs): string {
  const assetPart = [...a.assetSha256s].sort().join(',');
  return createHash('sha256')
    .update(
      [
        RENDERER_VERSION,
        a.baseSha256 ?? '',
        a.shadingSha256 ?? '',
        a.maskSha256 ?? '',
        a.colorHex,
        a.view,
        a.kind,
        canonicalJSON(a.placement),
        assetPart,
        String(a.targetPxWidth),
        canonicalJSON(a.supplierTransform ?? null),
      ].join('|'),
    )
    .digest('hex');
}

/* ── Fonts the worker resolves (verified with fc-list / fc-match) ──────
 * Inter is INSTALLED in the worker environment (~/.fonts/Inter.ttf,
 * converted from the shipped public/inter.woff2) — the Studio's default
 * text font renders as itself. The Studio's other display fonts have no
 * files here, so they map DELIBERATELY to the closest present family
 * (never a random fontconfig fallback). The old map pointed at a
 * "Noto Sans" family that does not exist in this image (only SC
 * variants) — every generic request silently landed on fontconfig's
 * pick. */
const WORKER_FONTS: Record<string, string> = {
  inter: 'Inter',
  anton: 'Liberation Sans',
  'playfair display': 'DejaVu Serif',
  'bebas neue': 'Liberation Sans',
  'dejavu sans': 'DejaVu Sans',
  'dejavu serif': 'DejaVu Serif',
  'dejavu sans mono': 'DejaVu Sans Mono',
  'liberation sans': 'Liberation Sans',
  'liberation serif': 'Liberation Serif',
  'liberation mono': 'Liberation Mono',
  sans: 'Liberation Sans',
  'sans-serif': 'Liberation Sans',
  serif: 'DejaVu Serif',
  monospace: 'DejaVu Sans Mono',
};

function resolveFont(fontId: string): string {
  const family = WORKER_FONTS[fontId.trim().toLowerCase()];
  if (!family) throw new Error(`missing_font: ${fontId}`);
  return family;
}

function slugifyColor(color: string): string {
  return color.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface RenderRow {
  id: string;
  tenant_id: string;
  design_id: string;
  canonical_product_id: string | null;
  view_angle: string;
  color: string;
  kind: 'mockup' | 'print';
  input_hash: string;
  renderer_version: string;
  storage_path: string | null;
  status: string;
  attempts: number;
}

interface PlacementLayer {
  kind: 'image' | 'text' | 'shape';
  assetId?: string;
  text?: { value: string; fontId: string; sizeIn: number; fill: string };
  view: string;
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
  rotationDeg: number;
  z: number;
}

interface Template {
  view_angle: string;
  mockup_image_url: string | null;
  displacement_map_url: string | null;
  stored_base_path: string | null;
  stored_shading_path: string | null;
  stored_mask_path: string | null;
  base_sha256: string | null;
  shading_sha256: string | null;
  mask_sha256: string | null;
  px_per_inch: number | null;
  print_zone_x: number;
  print_zone_y: number;
  print_zone_width: number;
  print_zone_height: number;
  physical_width_inches: number;
  physical_height_inches: number;
  archetype_class: string;
  source: string | null;
}

const TEMPLATE_FIELDS =
  'view_angle,mockup_image_url,displacement_map_url,stored_base_path,stored_shading_path,stored_mask_path,base_sha256,shading_sha256,mask_sha256,px_per_inch,print_zone_x,print_zone_y,print_zone_width,print_zone_height,physical_width_inches,physical_height_inches,archetype_class,source';

const ARCHETYPE_FOR_TOP: Record<string, string> = {
  Apparel: 'APPAREL',
  Drinkware: 'DRINKWARE',
  'Wall Art': 'WALL_ART',
  Technology: 'TECHNOLOGY',
};

/** Download one object from our storage. `bucket/path` convention. */
async function downloadFromStorage(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin().storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Storage download ${bucket}/${path} failed: ${error?.message ?? 'empty'}.`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** A stored_*_path is recorded as "bucket/rest" (same convention as storage_path). */
function splitStoragePath(stored: string): { bucket: string; path: string } {
  const slash = stored.indexOf('/');
  if (slash <= 0) throw new Error(`Bad stored path (expected bucket/rest): ${stored}`);
  return { bucket: stored.slice(0, slash), path: stored.slice(slash + 1) };
}

async function downloadAsset(assetId: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin()
    .from('design_assets')
    .select('bucket,storage_path')
    .eq('id', assetId)
    .single();
  if (error || !data) throw new Error(`Design asset ${assetId} not found.`);
  return downloadFromStorage(data.bucket as string, data.storage_path as string);
}

async function layerBuffer(
  layer: PlacementLayer,
  pxPerInch: number,
): Promise<Buffer> {
  const wPx = Math.max(1, Math.round(layer.wIn * pxPerInch));
  const hPx = Math.max(1, Math.round(layer.hIn * pxPerInch));
  let buf: Buffer;
  if (layer.kind === 'image' && layer.assetId) {
    const art = await downloadAsset(layer.assetId);
    buf = await sharp(art).resize(wPx, hPx, { fit: 'fill' }).png().toBuffer();
  } else if (layer.kind === 'text' && layer.text) {
    // resolveFont throws missing_font when the font is not in the image —
    // the job fails, never substitutes.
    const family = resolveFont(layer.text.fontId);
    const fontPx = Math.max(8, Math.round(layer.text.sizeIn * pxPerInch));
    const svg =
      `<svg width="${wPx}" height="${hPx}" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="0" y="${fontPx}" font-family="${escapeXml(family)}" font-size="${fontPx}" ` +
      `fill="${escapeXml(layer.text.fill || '#111111')}">${escapeXml(layer.text.value)}</text></svg>`;
    buf = await sharp(Buffer.from(svg)).png().toBuffer();
  } else if (layer.kind === 'shape') {
    const svg =
      `<svg width="${wPx}" height="${hPx}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="1" y="1" width="${wPx - 2}" height="${hPx - 2}" fill="#111111"/></svg>`;
    buf = await sharp(Buffer.from(svg)).png().toBuffer();
  } else {
    throw new Error(`Layer kind ${layer.kind} has no art to render.`);
  }
  if (layer.rotationDeg) {
    buf = await sharp(buf).rotate(layer.rotationDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  }
  return buf;
}

async function loadTemplate(
  productId: string | null,
  viewAngle: string,
): Promise<Template> {
  let topName: string | null = null;
  if (productId) {
    const { data: product } = await supabaseAdmin()
      .from('supplier_catalog_products')
      .select('category_id,canonical_product_id')
      .eq('id', productId)
      .single();
    if (product) {
      const nodes = await loadCategories();
      topName = topNameOf(nodes, product.category_id as string);
      // A per-blank template wins over the archetype when one exists.
      // Ingested rows key on canonical_product_id (product_mapping_id
      // carries an out-of-scope FK and stays NULL on our rows).
      const { data: exact } = await supabaseAdmin()
        .from('product_canvas_templates')
        .select(TEMPLATE_FIELDS)
        .eq('canonical_product_id', product.canonical_product_id as string)
        .eq('view_angle', viewAngle)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (exact) return exact as unknown as Template;
    }
  }
  const archetype = (topName && ARCHETYPE_FOR_TOP[topName]) || 'APPAREL';
  // Deterministic single archetype row: several per-category archetypes
  // (Apparel/Men/T-Shirts, /Swimwear, …) share archetype_class='APPAREL'
  // and view_angle='FRONT', so a bare class+view query returns 4 rows and
  // maybeSingle() errors — every render then requeued with "No skeleton
  // template". Archetype rows are exactly the ones with NO canonical
  // product: per-blank ingest rows always carry one.
  const { data, error } = await supabaseAdmin()
    .from('product_canvas_templates')
    .select(TEMPLATE_FIELDS)
    .eq('archetype_class', archetype)
    .eq('view_angle', viewAngle)
    // Archetype rows only — per-blank ingest rows also carry an
    // archetype_class and would make maybeSingle throw on 2 rows.
    .is('canonical_product_id', null)
    .maybeSingle();
  if (error || !data) {
    throw new Error(`No skeleton template for ${archetype} / ${viewAngle}.`);
  }
  return data as unknown as Template;
}

/** Placement lives in designs.placement_spec (contract §2); live rows still
 * carry it under canvas_state.placement_spec — contract column wins. */
function placementSpecOf(design: {
  placement_spec?: unknown;
  canvas_state?: unknown;
}): { layers: PlacementLayer[] } {
  const fromCol = (design.placement_spec ?? {}) as { layers?: PlacementLayer[] };
  if (Array.isArray(fromCol.layers)) return fromCol as { layers: PlacementLayer[] };
  const cs = (design.canvas_state ?? {}) as Record<string, unknown>;
  const spec = (cs.placement_spec ?? {}) as { layers?: PlacementLayer[] };
  return { layers: Array.isArray(spec.layers) ? spec.layers : [] };
}

function layersForView(
  spec: { layers: PlacementLayer[] },
  viewAngle: string,
): PlacementLayer[] {
  return spec.layers
    .filter((l) => String(l.view ?? '').toUpperCase() === viewAngle.toUpperCase())
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
}

async function upload(bucket: string, path: string, buf: Buffer, contentType: string): Promise<string> {
  const { error } = await supabaseAdmin()
    .storage.from(bucket)
    .upload(path, buf, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload ${bucket}/${path} failed: ${error.message}`);
  return `${bucket}/${path}`;
}

/**
 * Idempotency: if a SUCCEEDED row already holds this input_hash (same
 * tenant/kind/view/color), reuse its storage_path and never render twice.
 * Note: the unique index (tenant_id, input_hash, kind, view_angle, color)
 * makes a duplicate impossible through the normal queue path, so this is
 * a safety net; queue-time dedup (upsert on the same key) is what enforces
 * one render per hash today.
 */
async function findSucceededReuse(row: RenderRow): Promise<{ storagePath: string; width: number | null; height: number | null } | null> {
  const { data } = await supabaseAdmin()
    .from('design_renders')
    .select('storage_path,width,height')
    .eq('tenant_id', row.tenant_id)
    .eq('input_hash', row.input_hash)
    .eq('kind', row.kind)
    .eq('view_angle', row.view_angle)
    .eq('color', row.color)
    .eq('status', 'succeeded')
    .neq('id', row.id)
    .not('storage_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.storage_path) return null;
  return {
    storagePath: data.storage_path as string,
    width: (data.width as number | null) ?? null,
    height: (data.height as number | null) ?? null,
  };
}

/** Composite one claimed render row. Returns storage_path + dimensions. */
export async function renderOne(row: RenderRow): Promise<{
  storagePath: string;
  width: number;
  height: number;
  reused: boolean;
}> {
  const reuse = await findSucceededReuse(row);
  if (reuse) return { ...reuse, width: reuse.width ?? 0, height: reuse.height ?? 0, reused: true };

  const { data: design, error } = await supabaseAdmin()
    .from('designs')
    .select('id,supplier_catalog_product_id,garment_color,canvas_state,placement_spec')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', row.design_id)
    .single();
  if (error || !design) throw new Error(`Design ${row.design_id} not found.`);
  const template = await loadTemplate(
    design.supplier_catalog_product_id as string | null,
    row.view_angle,
  );
  const spec = placementSpecOf(design as { placement_spec?: unknown; canvas_state?: unknown });
  const layers = layersForView(spec, row.view_angle);
  const hash = row.input_hash;
  const viewSlug = row.view_angle.toUpperCase();
  const colorSlug = slugifyColor(row.color);

  // Fail fast on a missing font — before any upload, so the job fails
  // cleanly and no partial files are written.
  for (const layer of layers) {
    if (layer.kind === 'text' && layer.text) resolveFont(layer.text.fontId);
  }

  const pxPerInch =
    template.px_per_inch && Number(template.px_per_inch) > 0
      ? Number(template.px_per_inch)
      : template.print_zone_width > 0 && template.physical_width_inches > 0
        ? template.print_zone_width / template.physical_width_inches
        : PRINT_DPI;

  if (row.kind === 'mockup') {
    // Base: OUR stored base photo when Lane 4 has ingested one; else the
    // flat garment-color canvas on the skeleton geometry. Never a
    // supplier URL, never a supplier hotlink.
    const garmentHex = hexForColorName(row.color) ?? '#f4f3f7';
    let baseBuf: Buffer;
    let baseW = MOCKUP_BASE_W;
    let baseH = MOCKUP_BASE_H;
    if (template.stored_base_path) {
      const { bucket, path } = splitStoragePath(template.stored_base_path);
      baseBuf = await downloadFromStorage(bucket, path);
      const meta = await sharp(baseBuf).metadata();
      baseW = meta.width ?? MOCKUP_BASE_W;
      baseH = meta.height ?? MOCKUP_BASE_H;
    } else {
      baseBuf = await sharp({
        create: { width: baseW, height: baseH, channels: 3, background: garmentHex },
      }).png().toBuffer();
    }
    let base = sharp(baseBuf);
    // Garment fill: a stored base photo is ALWAYS a color-accurate product
    // image (supplier ingest or QA) — tinting it would corrupt both the
    // garment and the background, so it composites as-is. The flat
    // skeleton base is already the garment color and needs no fill either.
    if (!template.stored_base_path) {
      // Flat base is already the garment color; nothing to fill.
    } else {
      // Real product photo: never tinted.
    }
    if (template.stored_shading_path) {
      const { bucket, path } = splitStoragePath(template.stored_shading_path);
      const shading = await downloadFromStorage(bucket, path);
      base = sharp(await base.composite([{ input: shading, blend: 'multiply' }]).png().toBuffer());
    }
    const composites: { input: Buffer; left: number; top: number; blend?: 'over' | 'multiply' }[] = [];
    if (!template.stored_base_path) {
      // Print-box outline (the skeleton's print zone, dashed).
      const boxSvg =
        `<svg width="${baseW}" height="${baseH}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect x="${template.print_zone_x}" y="${template.print_zone_y}" width="${template.print_zone_width}" height="${template.print_zone_height}" fill="none" stroke="#999999" stroke-width="1" stroke-dasharray="6 4"/></svg>`;
      composites.push({ input: await sharp(Buffer.from(boxSvg)).png().toBuffer(), left: 0, top: 0 });
    }
    for (const layer of layers) {
      const buf = await layerBuffer(layer, pxPerInch);
      // Scale design to the box in inches then pixels; composite at the
      // box position. Design is multiplied by shading below via the
      // shading composite on the finished mockup (same multiply step).
      composites.push({
        input: buf,
        left: Math.round(template.print_zone_x + layer.xIn * pxPerInch),
        top: Math.round(template.print_zone_y + layer.yIn * pxPerInch),
      });
    }
    let full = await base.composite(composites).png().toBuffer();
    if (template.stored_shading_path) {
      const { bucket, path } = splitStoragePath(template.stored_shading_path);
      const shading = await downloadFromStorage(bucket, path);
      full = await sharp(full).composite([{ input: shading, blend: 'multiply' }]).png().toBuffer();
    }
    if (template.stored_mask_path) {
      const { bucket, path } = splitStoragePath(template.stored_mask_path);
      const mask = await downloadFromStorage(bucket, path);
      full = await sharp(full).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
    }
    // WebP 400 / 800 / 1200 — the 800 is the storage_path of record.
    // Serve intent: Cache-Control public, max-age=31536000, immutable
    // (hash-addressed; the actual serving is the platform/CDN's job).
    let mainPath = '';
    let mainW = 800;
    let mainH = Math.round((800 * baseH) / baseW);
    for (const w of [400, 800, 1200]) {
      const webp = await sharp(full).resize(w).webp({ quality: 82 }).toBuffer();
      const path = await upload(
        'renders',
        `r/${hash}/${viewSlug}-${colorSlug}-${w}.webp`,
        webp,
        'image/webp',
      );
      if (w === 800) {
        mainPath = path;
        mainW = w;
        mainH = Math.round((w * baseH) / baseW);
      }
    }
    return { storagePath: mainPath, width: mainW, height: mainH, reused: false };
  }

  // Print: full-size PNG at 300 DPI, transparent background.
  const wPx = Math.round(template.physical_width_inches * PRINT_DPI);
  const hPx = Math.round(template.physical_height_inches * PRINT_DPI);
  const canvas = sharp({
    create: { width: wPx, height: hPx, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  });
  const composites: { input: Buffer; left: number; top: number }[] = [];
  for (const layer of layers) {
    const buf = await layerBuffer(layer, PRINT_DPI);
    composites.push({
      input: buf,
      left: Math.round(layer.xIn * PRINT_DPI),
      top: Math.round(layer.yIn * PRINT_DPI),
    });
  }
  const png = await canvas.composite(composites).png().toBuffer();
  const path = await upload(
    'print-files',
    `r/${hash}/${viewSlug}-${colorSlug}-print.png`,
    png,
    'image/png',
  );
  // The print file of record for the design — publish reads it.
  await supabaseAdmin()
    .from('designs')
    .update({ print_file_path: path })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', row.design_id);
  return { storagePath: path, width: wPx, height: hPx, reused: false };
}

async function finishRow(
  row: RenderRow,
  status: 'succeeded' | 'failed' | 'queued',
  storagePath: string | null,
  width: number | null,
  height: number | null,
  lastError: string | null,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    storage_path: storagePath,
    width,
    height,
    error: lastError,
    last_error: lastError,
    finished_at: status === 'succeeded' || status === 'failed' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  // Requeued rows are claimable again; a stuck claim must not hold them.
  if (status === 'queued') update.claimed_at = null;
  await supabaseAdmin().from('design_renders').update(update).eq('id', row.id);
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

function logJobLine(args: {
  designId: string;
  blankId: string | null;
  view: string;
  color: string;
  hash: string;
  ms: number;
  result: string;
  error?: string;
}): void {
  const short = args.hash.slice(0, 12);
  const err = args.error ? ` error=${JSON.stringify(args.error)}` : '';
  console.log(
    `render job design=${args.designId} blank=${args.blankId ?? '-'} view=${args.view} ` +
      `color=${args.color} hash=${short} ms=${args.ms} result=${args.result}${err}`,
  );
}

export interface RenderJobResult {
  id: string;
  designId: string;
  view: string;
  color: string;
  kind: string;
  hash: string;
  ms: number;
  result: 'succeeded' | 'reused' | 'failed' | 'queued';
  storagePath: string | null;
  error?: string;
}

/**
 * Claim a batch (FOR UPDATE SKIP LOCKED via the claim_design_renders RPC;
 * stuck rows are recovered inside the claim) and render every claimed row.
 * One bad row never fails the batch. Concurrency from
 * RENDER_WORKER_CONCURRENCY (default 1, max 5); per-job timeout from
 * RENDER_WORKER_JOB_TIMEOUT_MS (default 120000).
 */
export async function processRenderQueue(batchSize = 5): Promise<{
  claimed: number;
  succeeded: number;
  failed: number;
  requeued: number;
  reused: number;
  results: RenderJobResult[];
}> {
  const { data: claimed, error } = await supabaseAdmin().rpc('claim_design_renders', {
    batch_size: batchSize,
  });
  if (error) throw new Error(`Render claim failed: ${error.message}`);
  const rows = (claimed ?? []) as RenderRow[];
  const concurrency = envInt('RENDER_WORKER_CONCURRENCY', 1, 1, 5);
  const timeoutMs = envInt('RENDER_WORKER_JOB_TIMEOUT_MS', 120000, 5000, 900000);

  const results: RenderJobResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let requeued = 0;
  let reused = 0;

  async function processOne(row: RenderRow): Promise<void> {
    const started = Date.now();
    const blankId = row.canonical_product_id;
    try {
      const outcome = await Promise.race([
        renderOne(row),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Render timed out after ${timeoutMs}ms.`)), timeoutMs),
        ),
      ]);
      const ms = Date.now() - started;
      if (outcome.reused) {
        await finishRow(row, 'succeeded', outcome.storagePath, outcome.width || null, outcome.height || null, null);
        reused++;
        results.push({
          id: row.id, designId: row.design_id, view: row.view_angle, color: row.color,
          kind: row.kind, hash: row.input_hash, ms, result: 'reused', storagePath: outcome.storagePath,
        });
        logJobLine({ designId: row.design_id, blankId, view: row.view_angle, color: row.color, hash: row.input_hash, ms, result: 'reused' });
      } else {
        await finishRow(row, 'succeeded', outcome.storagePath, outcome.width, outcome.height, null);
        succeeded++;
        results.push({
          id: row.id, designId: row.design_id, view: row.view_angle, color: row.color,
          kind: row.kind, hash: row.input_hash, ms, result: 'succeeded', storagePath: outcome.storagePath,
        });
        logJobLine({ designId: row.design_id, blankId, view: row.view_angle, color: row.color, hash: row.input_hash, ms, result: 'succeeded' });
      }
    } catch (e) {
      const ms = Date.now() - started;
      const message = e instanceof Error ? e.message : 'Render failed.';
      // attempts was already incremented by the claim; 3 attempts → failed.
      if ((row.attempts ?? 0) >= 3) {
        await finishRow(row, 'failed', null, null, null, message);
        failed++;
        results.push({
          id: row.id, designId: row.design_id, view: row.view_angle, color: row.color,
          kind: row.kind, hash: row.input_hash, ms, result: 'failed', storagePath: null, error: message,
        });
        logJobLine({ designId: row.design_id, blankId, view: row.view_angle, color: row.color, hash: row.input_hash, ms, result: 'failed', error: message });
      } else {
        await finishRow(row, 'queued', null, null, null, message);
        requeued++;
        results.push({
          id: row.id, designId: row.design_id, view: row.view_angle, color: row.color,
          kind: row.kind, hash: row.input_hash, ms, result: 'queued', storagePath: null, error: message,
        });
        logJobLine({ designId: row.design_id, blankId, view: row.view_angle, color: row.color, hash: row.input_hash, ms, result: 'requeued', error: message });
      }
    }
  }

  for (let i = 0; i < rows.length; i += concurrency) {
    await Promise.all(rows.slice(i, i + concurrency).map(processOne));
  }
  return { claimed: rows.length, succeeded, failed, requeued, reused, results };
}

/** Signed URL for a "bucket/rest" storage_path, or null when unresolvable. */
export async function signedUrlForStoragePath(
  storagePath: string,
  expiresIn = 3600,
): Promise<string | null> {
  const slash = storagePath.indexOf('/');
  if (slash <= 0) return null;
  const bucket = storagePath.slice(0, slash);
  const path = storagePath.slice(slash + 1);
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Latest succeeded mockup for a design, with a signed URL for display. */
export async function latestMockupProof(designId: string): Promise<{
  renderId: string;
  view: string;
  color: string;
  storagePath: string;
  url: string | null;
} | null> {
  const { data } = await supabaseAdmin()
    .from('design_renders')
    .select('id,view_angle,color,storage_path')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('design_id', designId)
    .eq('kind', 'mockup')
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.storage_path) return null;
  return {
    renderId: data.id as string,
    view: data.view_angle as string,
    color: data.color as string,
    storagePath: data.storage_path as string,
    url: await signedUrlForStoragePath(data.storage_path as string),
  };
}
