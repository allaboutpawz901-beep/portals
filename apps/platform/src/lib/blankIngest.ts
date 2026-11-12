import { createHash } from 'crypto';
import sharp from 'sharp';
import { supabaseAdmin } from './supabaseAdmin';
import { loadCategories, topNameOf } from './podServer';
import {
  printfulCatalogImages,
} from './printful';
import { printifyBlueprint, printifyBlueprintVariantsRaw } from './printify';
import type { ViewAngle } from './renderCore';

/**
 * Blank ingestion (Lane 4) — the supplier→canvas bridge.
 *
 * Every keeper blank must be DESIGNABLE: a color-accurate base photo per
 * view angle, stored in OUR storage (never hotlinked at render time),
 * with the print zone anchored on that photo in real inches. This module
 * harvests what the two supplier APIs already expose, normalizes it, and
 * writes the render contract rows (product_canvas_templates) the worker,
 * the preview queue and the publish gate all read:
 *
 *   Printify  — blueprint variants.json: per-color × per-position mockup
 *               photos + placeholder px bounds @ 300 DPI.
 *   Printful  — /v2/catalog-products/:id/images: the gallery per color ×
 *               placement; placement inches from print_specs.
 *
 * One template row per (canonical_product_id, view_angle): the photo
 * stored per view is the color-accurate image of the LIGHTEST color
 * (max luminance) — renders composite the design over it as-is (the
 * worker never tints an `ingest:` source). The row is written with BOTH
 * canonical_product_id (views/publish/preview readers) and
 * product_mapping_id (the worker's per-blank lookup) set to the
 * canonical id, verified=false — QA confirms the box via PATCH
 * /blanks/:id/views, which advances render_state.
 *
 * Idempotent: an ingested blank short-circuits unless { force }.
 */

const BASE_BUCKET = 'design-assets';
const MAX_PHOTO_WIDTH = 1600;
const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_IMAGES_PER_RUN = 40;

export interface IngestedView {
  view: ViewAngle;
  /** The color whose photo was stored (the lighest available). */
  color: string;
  storedPath: string;
  sha256: string;
  widthPx: number;
  heightPx: number;
  boxPx: { left: number; top: number; width: number; height: number };
  boxIn: { xIn: number; yIn: number; wIn: number; hIn: number };
  pxPerInch: number;
}

export interface IngestReport {
  blankId: string;
  canonicalId: string | null;
  supplier: string;
  alreadyIngested: boolean;
  ingested: IngestedView[];
  skipped: { source: string; reason: string }[];
  renderState: string;
  notes: string[];
}

/** Placement/position → the render contract's ViewAngle. Unknown → null. */
export function placementToView(position: string): ViewAngle | null {
  const p = position.toLowerCase().replace(/_(dtf|dtg|embroidery|sublimation|screen_print|screenprint|vinyl|cut_sew)$/i, '');
  switch (p) {
    case 'front':
    case 'left_chest':
    case 'right_chest':
    case 'chest':
    case 'pocket':
      return 'FRONT';
    case 'back':
      return 'BACK';
    case 'left_sleeve':
    case 'sleeve_left':
      return 'LEFT_SIDE';
    case 'right_sleeve':
    case 'sleeve_right':
      return 'RIGHT_SIDE';
    case 'label':
    case 'inside_label':
    case 'label_inside':
    case 'neck':
      return 'INSIDE_LABEL';
    case 'wrap':
    case 'all_over':
    case 'allover':
      return 'WRAPAROUND';
    case 'top_down':
      return 'TOP_DOWN';
    default:
      return null;
  }
}

/** 0..1 perceptual luminance of a hex color (Rec. 709). */
function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Whiteness score for a color name when no hex is known (Printify does
 * not expose hex on variants.json). Names beat nothing: 'white' ranks
 * highest, heathers/naturals next, anything with 'black' last.
 */
function whitenessByName(name: string): number {
  const n = name.toLowerCase();
  if (n.includes('white')) return 1;
  if (n.includes('natural') || n.includes('ash') || n.includes('ivory')) return 0.9;
  if (n.includes('silver') || n.includes('sand') || n.includes('cream')) return 0.8;
  if (n.includes('heather') || n.includes('grey') || n.includes('gray')) return 0.6;
  if (n.includes('black')) return 0;
  return 0.4;
}

/** Whiteness of a color: real hex luminance when known, name heuristics otherwise. */
function whiteness(name: string, hex: string | null): number {
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) return luminance(hex);
  return whitenessByName(name);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

/** One harvested color × position candidate. */
interface Harvested {
  color: string;
  colorHex: string | null;
  position: string;
  url: string;
}

/**
 * Download + normalize one supplier image: EXIF-rotate, cap width, KEEP
 * alpha (garment flats are transparent PNGs — the mockup keeps that
 * transparency), encode PNG. Returns bytes + dimensions.
 */
async function normalizeImage(url: string): Promise<{ buf: Buffer; width: number; height: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`image fetch ${res.status}`);
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length > 25 * 1024 * 1024) throw new Error('image over 25 MB');
    // Supplier catalog PNGs occasionally ship BROKEN alpha: the garment
    // region carries real RGB (a green jersey) with alpha=0 while the
    // "background" is white at ~70% alpha. Viewers that ignore the junk
    // alpha show a normal product photo; every alpha-honoring compositor
    // (sharp's composite, WebP viewers on dark backdrops) renders holes —
    // the stored base looked like a black silhouette in mockups. The base
    // of record must be an OPAQUE color-accurate photo, so the alpha
    // channel is dropped and the RGB matte kept (what every viewer shows).
    const pipeline = sharp(raw).rotate().removeAlpha();
    const meta = await pipeline.metadata();
    const width = meta.width ?? MAX_PHOTO_WIDTH;
    const resized = width > MAX_PHOTO_WIDTH
      ? pipeline.resize({ width: MAX_PHOTO_WIDTH, withoutEnlargement: true })
      : pipeline;
    const buf = await resized.png({ compressionLevel: 9 }).toBuffer();
    const outMeta = await sharp(buf).metadata();
    return { buf, width: outMeta.width ?? width, height: outMeta.height ?? meta.height ?? 0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Anchor the print zone on the photo — family heuristics, the same ones
 * the canvas uses client-side (printRect): a FRONT box is centered,
 * upper-middle; sleeves sit at the sides; labels at the neck. The box is
 * the REAL print inches scaled to the photo's pixel density. verified
 * stays false — PATCH /blanks/:id/views is the confirmation step.
 */
export function anchorZone(
  photoW: number,
  photoH: number,
  wIn: number,
  hIn: number,
  view: ViewAngle,
): { left: number; top: number; width: number; height: number } {
  // Photo density: the box should span a believable share of the garment.
  // Solve ppi from the photo: the FRONT print area is ~55% of photo width
  // for apparel; drinkware wrap is ~75%.
  const shareW = view === 'WRAPAROUND' ? 0.75 : view === 'INSIDE_LABEL' ? 0.28 : 0.55;
  const shareH = view === 'WRAPAROUND' ? 0.35 : view === 'INSIDE_LABEL' ? 0.12 : 0.55;
  const ppiCandidates = [photoW * shareW / wIn, photoH * shareH / hIn];
  const ppi = Math.max(...ppiCandidates.filter((p) => Number.isFinite(p) && p > 0), 1);
  const width = Math.min(Math.round(wIn * ppi), Math.round(photoW * 0.92));
  const height = Math.min(Math.round(hIn * ppi), Math.round(photoH * 0.92));
  let left: number;
  let top: number;
  if (view === 'LEFT_SIDE') {
    left = Math.round(photoW * 0.08);
    top = Math.round(photoH * 0.26);
  } else if (view === 'RIGHT_SIDE') {
    left = Math.round(photoW * 0.92 - width);
    top = Math.round(photoH * 0.26);
  } else if (view === 'INSIDE_LABEL') {
    left = Math.round((photoW - width) / 2);
    top = Math.round(photoH * 0.06);
  } else if (view === 'WRAPAROUND') {
    left = Math.round((photoW - width) / 2);
    top = Math.round(photoH * 0.3);
  } else {
    left = Math.round((photoW - width) / 2);
    top = Math.round(photoH * 0.18);
  }
  return { left, top, width, height };
}

/** Harvest Printify: color × position photos + placeholder inches. */
async function harvestPrintify(
  productId: string,
  notes: string[],
): Promise<{ harvested: Harvested[]; dims: Map<string, { wIn: number; hIn: number }> }> {
  const sb = supabaseAdmin();
  const { data: variantRows } = await sb
    .from('supplier_catalog_variants')
    .select('color,print_specs')
    .eq('supplier_catalog_product_id', productId)
    .limit(1000);
  let blueprintId: number | null = null;
  let providerId: number | null = null;
  for (const v of variantRows ?? []) {
    const specs = (v.print_specs ?? {}) as { blueprint_id?: number; provider_id?: number };
    if (!blueprintId && specs.blueprint_id) blueprintId = Number(specs.blueprint_id);
    if (!providerId && specs.provider_id) providerId = Number(specs.provider_id);
  }
  if (!blueprintId || !providerId) {
    throw new Error('Printify blank has no blueprint_id/provider_id on file (print_specs).');
  }
  // Live variants.json first; when the live API is unavailable (expired
  // token, network, rate limit) the STORED print_specs carry the same
  // placeholders the skeleton route serves — ingest proceeds from the
  // catalog instead of failing. The blank becomes designable with the
  // provider's own geometry + the stored mockup as the FRONT base.
  let payload: import('./printify').PrintifyVariantsPayload;
  try {
    payload = await printifyBlueprintVariantsRaw(blueprintId, providerId);
  } catch (liveErr) {
    notes.push(
      `Live Printify unavailable (${
        liveErr instanceof Error ? liveErr.message.slice(0, 140) : 'unknown error'
      }) — ingesting from stored print_specs + the stored mockup.`,
    );
    payload = { placeholders: [], variants: [] };
    for (const v of variantRows ?? []) {
      const specs = (v.print_specs ?? {}) as {
        placeholders?: { position?: string; width?: number; height?: number }[];
      };
      for (const p of specs.placeholders ?? []) {
        const pos = String(p.position ?? '');
        const w = Number(p.width ?? 0);
        const h = Number(p.height ?? 0);
        if (pos && w > 0 && h > 0) payload.placeholders!.push({ position: pos, width: w, height: h });
      }
    }
  }

  const dims = new Map<string, { wIn: number; hIn: number }>();
  const addPlaceholder = (position: unknown, width: unknown, height: unknown) => {
    const pos = String(position ?? '').toLowerCase();
    const w = Number(width ?? 0);
    const h = Number(height ?? 0);
    if (!pos || w <= 0 || h <= 0) return;
    const key = placementToView(pos);
    if (!key) return;
    const wIn = Math.round((w / 300) * 100) / 100;
    const hIn = Math.round((h / 300) * 100) / 100;
    if (!dims.has(key) || wIn * hIn > (dims.get(key)!.wIn * dims.get(key)!.hIn)) {
      dims.set(key, { wIn, hIn });
    }
  };
  for (const p of payload.placeholders ?? []) addPlaceholder(p.position, p.width, p.height);
  for (const v of payload.variants ?? []) {
    for (const p of (v as { placeholders?: { position?: string; width?: number; height?: number }[] }).placeholders ?? []) {
      addPlaceholder(p.position, p.width, p.height);
    }
  }

  // Color × position photos (same mapping the skeleton route uses).
  const variantById = new Map<number, string>();
  for (const v of payload.variants ?? []) {
    if (v.options?.color) variantById.set(v.id, v.options.color);
  }
  const harvested: Harvested[] = [];
  const seen = new Set<string>();
  const push = (color: string, position: string, url: string) => {
    const view = placementToView(position);
    if (!view || !url) return;
    const key = `${color}|${view}`;
    if (seen.has(key)) return;
    seen.add(key);
    harvested.push({ color, colorHex: null, position: String(position), url });
  };
  for (const img of payload.images ?? []) {
    const colors = new Set<string>();
    for (const vid of img.variant_ids ?? []) {
      const c = variantById.get(vid);
      if (c) colors.add(c);
    }
    if (colors.size === 0) colors.add('Default');
    for (const c of colors) push(c, img.position, img.url);
  }
  for (const v of payload.variants ?? []) {
    const color = v.options?.color;
    if (!color) continue;
    for (const img of v.images ?? []) push(color, img.position, img.url);
  }
  if (harvested.length === 0) {
    // Some blueprints expose no per-color variant images. Fall back to the
    // blueprint's own photos, then the product's stored mockup — one
    // color-accurate FRONT base beats no base at all.
    const fallbackUrls: string[] = [];
    try {
      const blueprint = await printifyBlueprint(blueprintId);
      for (const im of blueprint.images ?? []) if (im.src) fallbackUrls.push(im.src);
    } catch {
      /* blueprint fetch failed — the stored mockup below still applies */
    }
    const { data: prodRow } = await sb
      .from('supplier_catalog_products')
      .select('image_url')
      .eq('id', productId)
      .single();
    const stored = (prodRow?.image_url as string | null) ?? null;
    if (stored) fallbackUrls.push(stored);
    if (dims.has('FRONT')) {
      for (const url of fallbackUrls) {
        harvested.push({ color: 'Default', colorHex: null, position: 'front', url });
      }
      notes.push(
        `No per-color variant images on this blueprint — using ${fallbackUrls.length} blueprint/product photo(s) for FRONT.`,
      );
    } else {
      notes.push('Printify returned no per-color variant images and no placeholders.');
    }
  }
  return { harvested, dims };
}

/** Harvest Printful: color × placement gallery + placement inches. */
async function harvestPrintful(
  externalId: string,
  productId: string,
  notes: string[],
): Promise<{ harvested: Harvested[]; dims: Map<string, { wIn: number; hIn: number }> }> {
  const sb = supabaseAdmin();
  // Live gallery first; when the live API is unavailable the stored
  // mockup still gives a color-accurate FRONT base and the DB
  // placement_dimensions still give real inches — ingest proceeds
  // instead of failing.
  let images: Awaited<ReturnType<typeof printfulCatalogImages>>;
  try {
    images = await printfulCatalogImages(externalId);
  } catch (liveErr) {
    notes.push(
      `Live Printful unavailable (${
        liveErr instanceof Error ? liveErr.message.slice(0, 140) : 'unknown error'
      }) — ingesting from stored placement dimensions + the stored mockup.`,
    );
    images = [];
  }
  const harvested: Harvested[] = [];
  for (const set of images) {
    for (const img of set.images ?? []) {
      harvested.push({
        color: set.color,
        colorHex: set.primary_hex_color ?? null,
        position: img.placement,
        url: img.image_url,
      });
    }
  }
  // Placement inches: print_specs.placement_dimensions (per-variant rows),
  // largest box per view wins.
  const dims = new Map<string, { wIn: number; hIn: number }>();
  const { data: variantRows } = await sb
    .from('supplier_catalog_variants')
    .select('print_specs')
    .eq('supplier_catalog_product_id', productId)
    .limit(1000);
  for (const v of variantRows ?? []) {
    const specs = (v.print_specs ?? {}) as {
      placement_dimensions?: { placement?: string; width?: number; height?: number }[];
    };
    for (const d of specs.placement_dimensions ?? []) {
      const view = placementToView(String(d.placement ?? ''));
      const w = Number(d.width ?? 0);
      const h = Number(d.height ?? 0);
      if (!view || w <= 0 || h <= 0) continue;
      if (!dims.has(view) || w * h > dims.get(view)!.wIn * dims.get(view)!.hIn) {
        dims.set(view, { wIn: Math.round(w * 100) / 100, hIn: Math.round(h * 100) / 100 });
      }
    }
  }
  // Fallback: the live catalog product's placements (per-technique layers
  // do not carry inches for every technique). Cut-sew products (all-over
  // prints) expose NO placement_dimensions anywhere — without defaults
  // every view was skipped and the blank stayed undesignable. Assign the
  // standard per-view inches the archetypes use; rows keep verified=false
  // so the QA drag tool remains the corrector, and the note says so.
  if (dims.size === 0) {
    const DEFAULT_VIEW_IN: Record<string, { wIn: number; hIn: number }> = {
      FRONT: { wIn: 12, hIn: 16 },
      BACK: { wIn: 12, hIn: 16 },
      LEFT_SIDE: { wIn: 4, hIn: 3.5 },
      RIGHT_SIDE: { wIn: 4, hIn: 3.5 },
      INSIDE_LABEL: { wIn: 3, hIn: 3 },
    };
    const views = new Set<string>();
    for (const h of harvested) {
      const v = placementToView(h.position);
      if (v) views.add(v);
    }
    for (const view of views) {
      const d = DEFAULT_VIEW_IN[view];
      if (d) dims.set(view, d);
    }
    if (dims.size > 0) {
      notes.push(
        'Printful exposed no placement inches (cut-sew product) — standard per-view print sizes applied; confirm boxes in QA to mark verified.',
      );
    } else {
      notes.push('Printful placement inches unavailable and no mappable placements — zones use photo-relative anchoring.');
    }
  }
  if (harvested.length === 0) {
    // Live gallery empty/unavailable — the product's stored mockup is a
    // color-accurate FRONT base; one real base beats none.
    const { data: prodRow } = await sb
      .from('supplier_catalog_products')
      .select('image_url')
      .eq('id', productId)
      .single();
    const stored = (prodRow?.image_url as string | null) ?? null;
    if (stored && dims.has('FRONT')) {
      harvested.push({ color: 'Default', colorHex: null, position: 'front', url: stored });
      notes.push('No live gallery — using the stored product photo for FRONT.');
    } else {
      notes.push('Printful returned no gallery images for this product.');
    }
  }
  return { harvested, dims };
}

/** Top category name → the archetype class the template rows carry. */
function archetypeForTop(topName: string | null): string {
  switch (topName) {
    case 'Drinkware':
      return 'DRINKWARE';
    case 'Wall Art':
      return 'WALL_ART';
    case 'Technology':
      return 'TECHNOLOGY';
    default:
      return 'APPAREL';
  }
}

/** The flat mockup canvas geometry-only rows anchor on — must match the
 *  worker's MOCKUP_BASE_W/H (renderWorker.ts) so the fallback base and the
 *  print zone agree. */
const MOCKUP_CANVAS = { w: 450, h: 600 };

/**
 * The category chain for a node id, root → leaf (['Apparel', 'Bottoms']).
 * The categories list is flat with parent_id links.
 */
function categoryChain(
  nodes: { id: string; name: string; parent_id: string | null }[],
  id: string,
): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard < 10) {
    out.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    guard++;
  }
  return out;
}

/**
 * Ensure the blank has a canonical_products row + link. Most catalog rows
 * were canonicalized at sync time (3,000+); stragglers are provisioned
 * here — a canonical row is the render contract's join key and publish
 * reads it too. Returns the canonical id.
 */
async function ensureCanonicalProduct(product: {
  id: string;
  name: string;
  brand_name: string | null;
  category_id: string | null;
  image_url: string | null;
  canonical_product_id: string | null;
}): Promise<string> {
  if (product.canonical_product_id) return product.canonical_product_id;
  const sb = supabaseAdmin();
  const id = crypto.randomUUID();
  const skuSlug =
    product.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `blank-${id.slice(0, 8)}`;
  const { error } = await sb.from('canonical_products').insert({
    id,
    sku_slug: skuSlug,
    name: product.name,
    title: product.name,
    brand: product.brand_name,
    category: product.category_id,
    lifecycle: 'imported',
    visibility: 'hidden',
    render_state: 'missing_assets',
    render_colors: {},
  });
  if (error) throw new Error(`canonical_products insert: ${error.message}`);
  const { error: linkErr } = await sb
    .from('supplier_catalog_products')
    .update({ canonical_product_id: id })
    .eq('id', product.id);
  if (linkErr) throw new Error(`canonical link update: ${linkErr.message}`);
  return id;
}

/** Upsert one template row (check-then-write on canonical+view+is_active). */
async function upsertTemplateRow(
  canonicalId: string,
  view: ViewAngle,
  row: Record<string, unknown>,
  taxonomy: { categoryPath: string; archetypeClass: string },
): Promise<'inserted' | 'updated'> {
  const sb = supabaseAdmin();
  // category_path on per-blank rows is the node chain (e.g.
  // 'Apparel/Bottoms'), NEVER the bare top name — templatesForCategory(top)
  // returns every active row matching the top name exactly, so a bare top
  // name would double the archetype views for the whole category.
  const withTaxonomy = { ...row, category_path: taxonomy.categoryPath, archetype_class: taxonomy.archetypeClass };
  const { data: existing } = await sb
    .from('product_canvas_templates')
    .select('id')
    .eq('canonical_product_id', canonicalId)
    .eq('view_angle', view)
    .eq('is_active', true)
    .maybeSingle();
  if (existing) {
    const { error } = await sb
      .from('product_canvas_templates')
      .update(withTaxonomy)
      .eq('id', (existing as { id: string }).id);
    if (error) throw new Error(`template update: ${error.message}`);
    return 'updated';
  }
  const { error } = await sb.from('product_canvas_templates').insert({
    id: crypto.randomUUID(),
    canonical_product_id: canonicalId,
    // product_mapping_id carries an FK to a table we don't control —
    // left NULL; the worker's per-blank lookup falls back to
    // canonical_product_id (see renderWorker.loadTemplate).
    view_angle: view,
    is_active: true,
    ...withTaxonomy,
  });
  if (error) throw new Error(`template insert: ${error.message}`);
  return 'inserted';
}

/**
 * Ingest one blank. Idempotent; { force } re-harvests and re-stores.
 * Never throws for per-image failures — they land in skipped[].
 */
export async function ingestBlank(
  productId: string,
  opts?: { force?: boolean },
): Promise<IngestReport> {
  const sb = supabaseAdmin();
  const notes: string[] = [];
  const skipped: { source: string; reason: string }[] = [];

  const { data: product, error: pErr } = await sb
    .from('supplier_catalog_products')
    .select('id,name,brand_name,category_id,external_id,external_id_type,image_url,supplier_id,canonical_product_id')
    .eq('id', productId)
    .single();
  if (pErr || !product) throw new Error(`No blank ${productId}.`);
  // Canonical row is the contract's join key — provision one for stragglers.
  const canonicalId = await ensureCanonicalProduct(
    product as {
      id: string;
      name: string;
      brand_name: string | null;
      category_id: string | null;
      image_url: string | null;
      canonical_product_id: string | null;
    },
  );

  const { data: supplier } = await sb
    .from('suppliers')
    .select('name,slug')
    .eq('id', product.supplier_id as string)
    .single();
  const supplierSlug = String(supplier?.slug ?? '');
  if (supplierSlug !== 'printify' && supplierSlug !== 'printful') {
    throw new Error(`Blank ingestion supports printify and printful (got "${supplierSlug || 'unknown'}").`);
  }

  const { data: canonRow } = await sb
    .from('canonical_products')
    .select('render_state')
    .eq('id', canonicalId)
    .single();
  const prevState = String(canonRow?.render_state ?? 'missing_assets');

  // Idempotency: existing stored bases short-circuit.
  const { data: existingRows } = await sb
    .from('product_canvas_templates')
    .select('id,view_angle,stored_base_path')
    .eq('canonical_product_id', canonicalId)
    .eq('is_active', true);
  const withBase = (existingRows ?? []).filter((r) => Boolean(r.stored_base_path));
  if (withBase.length > 0 && !opts?.force) {
    return {
      blankId: productId,
      canonicalId,
      supplier: supplierSlug,
      alreadyIngested: true,
      ingested: [],
      skipped,
      renderState: prevState,
      notes: [`Already ingested (${withBase.length} views with stored bases).`],
    };
  }

  const externalId = String(product.external_id ?? '');
  if (!externalId) throw new Error('Blank has no external_id — cannot call the supplier catalog.');

  // Taxonomy for the template rows (category_path + archetype_class).
  // category_path must NEVER be the bare top name: templatesForCategory(top)
  // matches it exactly and would return per-blank rows alongside the
  // archetype rows, duplicating every view for the whole category.
  const nodes = await loadCategories();
  const topName = product.category_id ? topNameOf(nodes, product.category_id as string) : null;
  const chain = categoryChain(nodes, (product.category_id as string | null) ?? '');
  const categoryPath = chain.length > 1 ? chain.join('/') : `${topName ?? 'Apparel'}/(blank)`;
  const taxonomy = {
    categoryPath,
    archetypeClass: archetypeForTop(topName),
  };

  const { harvested, dims } =
    supplierSlug === 'printify'
      ? await harvestPrintify(productId, notes)
      : await harvestPrintful(externalId, productId, notes);

  // Group by view; pick the lighest color photo per view.
  const byView = new Map<ViewAngle, Harvested[]>();
  for (const h of harvested) {
    const view = placementToView(h.position);
    if (!view) {
      if (!skipped.some((s) => s.source === h.position)) {
        skipped.push({ source: h.position, reason: 'No view-angle mapping for this placement.' });
      }
      continue;
    }
    const list = byView.get(view) ?? [];
    list.push(h);
    byView.set(view, list);
  }

  const ingested: IngestedView[] = [];
  let processed = 0;
  for (const [view, candidates] of byView) {
    if (ingested.length >= 5) {
      skipped.push({ source: view, reason: 'View cap (5) reached for this run.' });
      continue;
    }
    const dim = dims.get(view);
    if (!dim) {
      skipped.push({ source: view, reason: 'No print dimensions for this placement.' });
      continue;
    }
    // Dedupe candidates by URL; rank by whiteness.
    const unique = new Map<string, Harvested>();
    for (const c of candidates) if (!unique.has(c.url)) unique.set(c.url, c);
    const ranked = [...unique.values()].sort(
      (a, b) => whiteness(b.color, b.colorHex) - whiteness(a.color, a.colorHex),
    );
    let done = false;
    for (const cand of ranked) {
      if (processed >= MAX_IMAGES_PER_RUN) {
        skipped.push({ source: view, reason: 'Image cap reached for this run.' });
        done = true;
        break;
      }
      try {
        processed += 1;
        const { buf, width, height } = await normalizeImage(cand.url);
        const sha = createHash('sha256').update(buf).digest('hex');
        const path = `canvas-blanks/${supplierSlug}/${slugify(externalId)}/${slugify(cand.color)}-${view}.png`;
        const { error: upErr } = await sb.storage
          .from(BASE_BUCKET)
          .upload(path, buf, { contentType: 'image/png', upsert: true });
        if (upErr) throw new Error(`storage upload: ${upErr.message}`);

        const boxPx = anchorZone(width, height, dim.wIn, dim.hIn, view);
        const ppi = boxPx.width / dim.wIn;
        const r2 = (n: number) => Math.round(n * 100) / 100;
        const row: Record<string, unknown> = {
          stored_base_path: `${BASE_BUCKET}/${path}`,
          base_sha256: sha,
          px_per_inch: Math.round(ppi * 10000) / 10000,
          print_zone_x: boxPx.left,
          print_zone_y: boxPx.top,
          print_zone_width: boxPx.width,
          print_zone_height: boxPx.height,
          physical_width_inches: dim.wIn,
          physical_height_inches: dim.hIn,
          verified: false,
          // The DB whitelists the source column (check constraint) —
          // 'manual' is the allowed value; provenance detail lives in
          // base_sha256 + the stored path (canvas-blanks/<supplier>/…).
          source: 'manual',
          mockup_image_url: (product.image_url as string | null) ?? null,
        };
        await upsertTemplateRow(canonicalId, view, row, taxonomy);
        ingested.push({
          view,
          color: cand.color,
          storedPath: `${BASE_BUCKET}/${path}`,
          sha256: sha,
          widthPx: width,
          heightPx: height,
          boxPx,
          boxIn: {
            xIn: r2(boxPx.left / ppi),
            yIn: r2(boxPx.top / ppi),
            wIn: dim.wIn,
            hIn: dim.hIn,
          },
          pxPerInch: Math.round(ppi * 10000) / 10000,
        });
        done = true;
        break;
      } catch (e) {
        skipped.push({
          source: `${view}/${cand.color}`,
          reason: e instanceof Error ? e.message : 'image failed',
        });
      }
    }
    if (!done && !skipped.some((s) => s.source === view)) {
      skipped.push({ source: view, reason: 'Every candidate image failed.' });
    }
  }

  // Geometry-only rows: Printify's catalog API exposes per-view print
  // inches (placeholders) but NO per-color photos for many blueprints —
  // mockups only materialize after a store product exists. Without a
  // photo the blank still must be DESIGNABLE: write the real per-blank
  // geometry (no stored_base_path) anchored on the flat 450×600 mockup
  // canvas the worker uses for its garment-color fallback. The render is
  // a flat base + design — honest, and geometrically the provider's own
  // numbers instead of the category archetype's guess.
  const rowedViews = new Set(ingested.map((v) => v.view));
  for (const [view, dim] of dims) {
    if (rowedViews.has(view) || ingested.length >= 5) continue;
    const boxPx = anchorZone(MOCKUP_CANVAS.w, MOCKUP_CANVAS.h, dim.wIn, dim.hIn, view);
    const ppi = boxPx.width / dim.wIn;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    try {
      await upsertTemplateRow(canonicalId, view, {
        px_per_inch: Math.round(ppi * 10000) / 10000,
        print_zone_x: boxPx.left,
        print_zone_y: boxPx.top,
        print_zone_width: boxPx.width,
        print_zone_height: boxPx.height,
        physical_width_inches: dim.wIn,
        physical_height_inches: dim.hIn,
        verified: false,
        source: 'manual',
        mockup_image_url: (product.image_url as string | null) ?? null,
      }, taxonomy);
      ingested.push({
        view,
        color: '(flat)',
        storedPath: '',
        sha256: '',
        widthPx: MOCKUP_CANVAS.w,
        heightPx: MOCKUP_CANVAS.h,
        boxPx,
        boxIn: {
          xIn: r2(boxPx.left / ppi),
          yIn: r2(boxPx.top / ppi),
          wIn: dim.wIn,
          hIn: dim.hIn,
        },
        pxPerInch: Math.round(ppi * 10000) / 10000,
      });
      notes.push(`${view}: geometry-only (provider exposes no photo) — renders on the flat garment-color base.`);
    } catch (e) {
      skipped.push({
        source: view,
        reason: e instanceof Error ? e.message : 'geometry row failed',
      });
    }
  }

  // Advance render_state missing_assets → unverified when every linked
  // view has a stored base (same transition as PATCH /blanks/:id/views).
  let renderState = prevState;
  if (ingested.length > 0 && prevState === 'missing_assets') {
    const { data: allRows } = await sb
      .from('product_canvas_templates')
      .select('stored_base_path')
      .eq('canonical_product_id', canonicalId)
      .eq('is_active', true);
    const all = allRows ?? [];
    if (all.length > 0 && all.every((r) => Boolean(r.stored_base_path))) {
      const { error: stErr } = await sb
        .from('canonical_products')
        .update({ render_state: 'unverified' })
        .eq('id', canonicalId);
      if (!stErr) renderState = 'unverified';
    }
  }

  return {
    blankId: productId,
    canonicalId,
    supplier: supplierSlug,
    alreadyIngested: false,
    ingested,
    skipped,
    renderState,
    notes,
  };
}

/** Ingest status for one blank (GET /blanks/:id/ingest). */
export async function blankIngestStatus(productId: string): Promise<{
  blankId: string;
  canonicalId: string | null;
  views: { view: string; hasBase: boolean; verified: boolean; source: string | null; boxIn: { wIn: number; hIn: number } | null }[];
  renderState: string;
} | null> {
  const sb = supabaseAdmin();
  const { data: product } = await sb
    .from('supplier_catalog_products')
    .select('canonical_product_id')
    .eq('id', productId)
    .single();
  const canonicalId = (product?.canonical_product_id as string | null) ?? null;
  if (!canonicalId) return null;
  const { data: canon } = await sb
    .from('canonical_products')
    .select('render_state')
    .eq('id', canonicalId)
    .single();
  const { data: rows } = await sb
    .from('product_canvas_templates')
    .select('view_angle,stored_base_path,verified,source,physical_width_inches,physical_height_inches')
    .eq('canonical_product_id', canonicalId)
    .eq('is_active', true)
    .order('view_angle');
  return {
    blankId: productId,
    canonicalId,
    renderState: String(canon?.render_state ?? 'missing_assets'),
    views: (rows ?? []).map((r) => ({
      view: String(r.view_angle),
      hasBase: Boolean(r.stored_base_path),
      verified: Boolean(r.verified),
      source: (r.source as string | null) ?? null,
      boxIn:
        Number(r.physical_width_inches) > 0
          ? { wIn: Number(r.physical_width_inches), hIn: Number(r.physical_height_inches) }
          : null,
    })),
  };
}
