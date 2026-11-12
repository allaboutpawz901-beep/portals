'use client';

/**
 * POD API client — the typed client for the contracts in
 * `pod-designer-api-contracts-v1-2026-11-07.md` §3.
 *
 * Every function here calls a real endpoint under `/api/v1`. There is no
 * mock fallback in this file: if the endpoint is not there yet the call
 * throws a `PodApiError` and the caller shows a loading/error state —
 * it never invents a product, a price, or a skeleton.
 *
 * Server owners (Zai): the routes. Browser owner (Muse): this client and
 * every screen that calls it.
 */

export type BlankFamily = 'tops' | 'books' | 'drinkware';

export interface PrintAreaPx {
  placement: string;
  widthPx: number;
  heightPx: number;
  dpi: number;
}

export interface BlankView {
  view: string;
  label: string;
  /** Stored provider skeleton (our storage) — never a supplier hotlink. */
  baseUrl: string;
  shadingUrl: string | null;
  maskUrl: string | null;
  boxPx: { left: number; top: number; width: number; height: number };
  boxIn: { xIn: number; yIn: number; wIn: number; hIn: number };
  pxPerInch: number;
  /** The mockup-canvas size boxPx live on (450×600 standard) — clients
   *  scale the box to the actually-loaded image's natural size. NULL on
   *  stored views: their coordinates are already image-native (1:1). */
  canvasPx?: { w: number; h: number } | null;
  /** 'stored' = our bucket via ingestion; 'archetype' = category skeleton. */
  source?: 'stored' | 'archetype' | string;
  verified: boolean;
}

export interface BlankVariantColor {
  name: string;
  hex: string;
  sku?: string;
}

export interface PrinterInfo {
  /** The printer behind this blank (keeper supplier). */
  name: string;
  slug: string;
  /** Base price flowing in from this printer (USD), or null if none on file. */
  baseCost: number | null;
  /** Live production time, e.g. { average: 3.3, unit: "business_days" } — null when the supplier's catalog API has none. */
  estimatedDelivery: { average: number; unit: string } | null;
}

/** One product card — the unit the top category nav lists. */
export interface BlankCard {
  id: string;
  canonicalProductId: string;
  name: string;
  brand: string;
  supplier: string;
  supplierSlug: string;
  /** All keeper suppliers carrying this same product (canonical group) —
   *  drives the "Printify" / "Printful" / "2 Suppliers" badge. */
  suppliers?: { name: string; slug: string }[];
  /** Convenience: suppliers.length when present. */
  supplierCount?: number;
  /** Variant count of the richest keeper row — "14 Variants" badge. */
  variantCount?: number;
  /** canonical_products.sku_slug — the card SKU line. */
  sku?: string | null;
  /** Cheapest in-stock cost, or the cheapest variant snapshot, or null. */
  baseCost: number | null;
  currency: string;
  family: BlankFamily;
  mockupThumbUrl: string;
  printAreas: PrintAreaPx[];
  status: string;
  fulfillment: 'POD';
  /** Cheapest production time across all keepers/providers for this
   *  canonical product — "3.2 days" / "2.5 business days" / null when no
   *  provider has filed a production_time_avg. Source: catalog_provider_facts
   *  .production_time_avg (min across providers), rolled up by canonical. */
  estShipping: string | null;
  /** Hidden = not eligible for search, not eligible for design.
   *  Toggled via the eye icon on each card / product page. */
  isHidden?: boolean;
  /** Units sold (real order velocity) — present only on sort=best_selling. */
  unitsSold?: number;
}

/** One blank, fully — what the product page and the canvas visualize. */
export interface BlankDetail extends BlankCard {
  views: BlankView[];
  variants: {
    colors: BlankVariantColor[];
    sizes: string[];
    printAreas: string[];
  };
  /** Print techniques available on this product (DTG, Embroidery, DTF,
   *  dye-sublimation…). Printful supplies these via the catalog API;
   *  Printify surfaces them from print_specs.placeholders[].decoration_method.
   *  Empty array when neither source has the data. */
  techniques: { key: string; label: string; isDefault: boolean }[];
  /** Full marketing description with features (fabric, fit, weight…) —
   *  verbatim text from the supplier's catalog API. Empty string when the
   *  supplier has none. */
  description: string;
  /** Which supplier's API filled the description ('printful' | 'printify' | ''). */
  descriptionSource: string;
  /** The print provider's own name (e.g. "Fulfill Engine", "Imagine Your
   *  Photos") when the supplier exposes it. Null when unknown — Printful
   *  has no separate provider concept (Printful IS the printer). */
  providerTitle: string | null;
  /** Cheapest in-stock shipping estimate (USD), or null. */
  shippingCost: number | null;
  /** Per-technique base pricing (Printful prices endpoint): DTG $9.44 /
   *  Embroidery $11.71 / DTF $10.92, with the discounted tier when one
   *  exists. Empty for suppliers without technique-level pricing — the
   *  page falls back to the single baseCost. */
  techniquePrices: { key: string; label: string; price: number; discountedPrice: number | null }[];
  /** Supplier mockup gallery per color (Printful images endpoint): real
   *  hex swatches + front/back/lifestyle images per color. Empty when the
   *  supplier doesn't expose one — the page keeps the archetype views. */
  gallery: { color: string; hex: string; images: { placement: string; url: string }[] }[];
  /** True when the Printful catalog API was called to fill in techniques,
   *  description, and real color hex codes. False for Printify/Cloudprinter
   *  or when the Printful fetch failed (the page renders with DB-only data). */
  printfulEnriched: boolean;
  guidelines: string;
  shippingFrom: string;
  deliveryEstimate: string;
  /** Every keeper printer carrying this same/similar product type. */
  printers: PrinterInfo[];
  /** Every keeper row carrying the SAME canonical product — the true
   *  cross-supplier comparison (Printify's row + Printful's row when both
   *  carry it). Cheapest first. Powers "Supplier Cost Comparison". */
  offers?: BlankOffer[];
  /** Render state of the canonical blank (missing_assets | unverified | render_ready) — drives blockers and the publish gate. */
  renderState?: string;
}

/** One supplier's offer for the same canonical product. */
export interface BlankOffer {
  blankId: string;
  supplier: string;
  supplierSlug: string;
  name: string;
  brand: string;
  cost: number | null;
  shipping: number | null;
  variantCount: number;
  imageUrl: string | null;
  estimatedDeliveryDays: number | null;
}

export interface PlacementLayer {
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

export interface PlacementSpec {
  version: 1;
  layers: PlacementLayer[];
}

export interface DesignSummary {
  id: string;
  projectId: string;
  name: string;
  blankId: string;
  status: string;
}

export interface RenderStatus {
  id: string;
  view: string;
  color: string;
  kind: 'mockup' | 'print';
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'stale';
  storagePath: string | null;
  /** Short-lived signed URL for succeeded renders (display the actual render). */
  url?: string | null;
  inputHash?: string;
  createdAt?: string;
}

export interface IngestReport {
  blankId: string;
  canonicalId: string | null;
  supplier: string;
  alreadyIngested: boolean;
  ingested: {
    view: string;
    color: string;
    storedPath: string;
    sha256: string;
    widthPx: number;
    heightPx: number;
    boxPx: { left: number; top: number; width: number; height: number };
    boxIn: { xIn: number; yIn: number; wIn: number; hIn: number };
    pxPerInch: number;
  }[];
  skipped: { source: string; reason: string }[];
  renderState: string;
  notes: string[];
}

export interface PriceQuote {
  /** Base price flowing in from the printer (USD). */
  cost: number;
  shippingTier: number;
  /** cost × 1.55 + shipping — a suggestion only. The user sets their price. */
  suggestedRetailPrice: number;
  marginAtSuggested: number;
  /** Price the user set on the card, if any — null until they set one. */
  userPrice: number | null;
  printer: { name: string; slug: string };
  estimatedDelivery: { average: number; unit: string } | null;
  currency: string;
}

/** One nav node from GET /api/v1/categories — diffed against all suppliers. */
export interface CategoryNavNode {
  id: string;
  name: string;
  slug: string;
  totalProducts: number;
  /** Products from keeper suppliers only — what the designer can list. */
  keeperProducts: number;
  suppliers: { id: string; name: string; slug: string; productCount: number }[];
  children: CategoryNavNode[];
}

export class PodApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PodApiError';
    this.status = status;
  }
}

async function podFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (e) {
    throw new PodApiError(0, `POD API unreachable (${path}): ${(e as Error).message}`);
  }
  if (!res.ok) {
    let message = `POD API ${res.status} on ${path}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      /* keep the status message */
    }
    throw new PodApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/** GET /api/v1/blanks — the card list for one top-nav category. */
export async function listBlanks(opts: {
  /** Unambiguous root→leaf names, e.g. ['Apparel', 'Women', 'T-Shirts'].
   * Wins over category/subcategory when both are given. */
  path?: string[];
  category: string;
  subcategory?: string;
  q?: string;
  cursor?: string;
  limit?: number;
  /** 'best_selling' sorts by real order velocity, then variant_count. */
  sort?: 'best_selling' | 'name';
  /** hidden=true → return ONLY hidden products (the "Hidden" view under
   *  My Products). Default (omitted) → exclude hidden products from
   *  search results. */
  hidden?: boolean;
}): Promise<{
  items: BlankCard[];
  nextCursor: string | null;
  meta?: {
    total: number;
    sort?: string;
    velocityCanonicals?: number;
    /** False when the requested category/path doesn't exist — items is
     * empty and nothing was silently substituted. */
    matched?: boolean;
    resolvedPath?: string[] | null;
  };
}> {
  const params = new URLSearchParams({
    category: opts.category,
  });
  if (opts.path && opts.path.length > 0) params.set('path', opts.path.join('/'));
  if (opts.subcategory) params.set('subcategory', opts.subcategory);
  if (opts.q) params.set('q', opts.q);
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.hidden) params.set('hidden', 'true');
  return podFetch<{
    items: BlankCard[];
    nextCursor: string | null;
    meta?: {
      total: number;
      sort?: string;
      velocityCanonicals?: number;
      matched?: boolean;
      resolvedPath?: string[] | null;
    };
  }>(`/api/v1/blanks?${params.toString()}`);
}

/** PATCH /api/v1/blanks/:id/hide — toggle is_hidden on a catalog product.
 *  Hidden = not eligible for search, not eligible for design. The card's
 *  eye icon calls this; the "Hidden" view under My Products lists them. */
export async function setBlankHidden(id: string, hidden: boolean): Promise<{ isHidden: boolean }> {
  return podFetch<{ id: string; isHidden: boolean; hidden: boolean }>(
    `/api/v1/blanks/${encodeURIComponent(id)}/hide`,
    { method: 'PATCH', body: JSON.stringify({ hidden }) },
  );
}

/** GET /api/v1/blanks/:id — one blank, fully (skeletons, cost, variants). */
export async function getBlank(id: string): Promise<BlankDetail> {
  return podFetch<BlankDetail>(`/api/v1/blanks/${encodeURIComponent(id)}`);
}

/* ── Design-canvas skeleton (Printify variants.json, live) ── */

/** One printable region from Printify's placeholders — exact px at 300 DPI. */
export interface SkeletonPlaceholder {
  position: string;
  width: number;
  height: number;
  dpi: number;
}

/** The mockup image set for one color, keyed by base position (front/back/…). */
export interface SkeletonVariantImages {
  color: string;
  images: Record<string, string>;
}

export interface BlankSkeleton {
  /** 'printify' = live variants.json; 'catalog' = DB placeholders + mockup. */
  source: 'printify' | 'catalog';
  placeholders: SkeletonPlaceholder[];
  variantImages: SkeletonVariantImages[];
  mockupUrl: string | null;
}

/** GET /api/v1/blanks/:id/skeleton — pills, per-color/view shell images,
 *  and print-area px bounds for the canvas bounding box. */
export async function getBlankSkeleton(id: string): Promise<BlankSkeleton> {
  return podFetch<BlankSkeleton>(`/api/v1/blanks/${encodeURIComponent(id)}/skeleton`);
}

/* ── Inspiration (Wikimedia Commons via the server) ── */

/** One inspiration image: thumb for the UI, full-res url for the AI engine. */
export interface InspirationImage {
  title: string;
  thumbUrl: string;
  url: string;
  width: number | null;
  height: number | null;
  pageUrl: string;
}

/** GET /api/v1/inspiration?q= — Commons image search (server-cached). */
export async function searchInspiration(q: string, limit = 12): Promise<InspirationImage[]> {
  const data = await podFetch<{ results: InspirationImage[]}>(
    `/api/v1/inspiration?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  return data.results;
}

/** POST /api/v1/designs — Start design: creates the draft design row. */
export async function createDesign(input: {
  name: string;
  blankId: string;
  supplierCatalogProductId?: string;
  garmentColor?: string;
  productType?: string;
}): Promise<DesignSummary> {
  return podFetch<DesignSummary>('/api/v1/designs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** GET /api/v1/designs/:id — reopen a design (canvas_state + placement). */
export async function getDesign(id: string): Promise<{
  design: DesignSummary & { canvasState: unknown; placementSpec: PlacementSpec | null };
}> {
  return podFetch(`/api/v1/designs/${encodeURIComponent(id)}`);
}

/** PATCH /api/v1/designs/:id — save a draft (placement_spec in inches). */
export async function saveDesign(
  id: string,
  patch: { placementSpec?: PlacementSpec; name?: string },
): Promise<DesignSummary> {
  return podFetch<DesignSummary>(`/api/v1/designs/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

/** POST /api/v1/designs/:id/preview — queue mockup renders for the design. */
export async function queuePreview(
  id: string,
  opts?: { views?: string[]; colors?: string[] },
): Promise<{ renders: RenderStatus[] }> {
  return podFetch(`/api/v1/designs/${encodeURIComponent(id)}/preview`, {
    method: 'POST',
    body: JSON.stringify(opts ?? {}),
  });
}

/** GET /api/v1/renders?designId= — poll the review grid. */
export async function listRenders(designId: string): Promise<{ renders: RenderStatus[] }> {
  return podFetch(`/api/v1/renders?designId=${encodeURIComponent(designId)}`);
}

/** POST /api/v1/blanks/:id/ingest — harvest the blank's color×view base
 * photos from the supplier catalog, store them, write contract rows.
 * Idempotent; { force } re-harvests. Safe to call before every preview. */
export async function ingestBlank(
  id: string,
  opts?: { force?: boolean },
): Promise<IngestReport> {
  return podFetch<IngestReport>(`/api/v1/blanks/${encodeURIComponent(id)}/ingest`, {
    method: 'POST',
    body: JSON.stringify({ force: opts?.force === true }),
  });
}

/** GET /api/v1/blanks/:id/ingest — which views are linked/verified. */
export async function blankIngestStatus(id: string): Promise<{
  blankId: string;
  canonicalId: string | null;
  renderState: string;
  views: { view: string; hasBase: boolean; verified: boolean; source: string | null; boxIn: { wIn: number; hIn: number } | null }[];
}> {
  return podFetch(`/api/v1/blanks/${encodeURIComponent(id)}/ingest`);
}

/** POST /api/v1/designs/:id/print — queue the 300-DPI print renders. */
export async function queuePrintRenders(
  id: string,
): Promise<{ queued: { view: string; color: string; status: string }[]; skipped: { view: string; reason: string }[]; color: string }> {
  return podFetch(`/api/v1/designs/${encodeURIComponent(id)}/print`, { method: 'POST' });
}

/** GET /api/v1/categories — the top nav, diffed against all suppliers. */
export async function listCategories(): Promise<{ categories: CategoryNavNode[] }> {
  return podFetch<{ categories: CategoryNavNode[] }>('/api/v1/categories');
}

/** GET /api/v1/designs/:id/price — base cost, printer, delivery, suggested price.
 * The suggestion is not the price: the user sets their own on the card. */
export async function getPrice(
  designId: string,
  opts?: { supplierSlug?: string },
): Promise<PriceQuote> {
  const params = opts?.supplierSlug
    ? `?supplierSlug=${encodeURIComponent(opts.supplierSlug)}`
    : '';
  return podFetch<PriceQuote>(`/api/v1/designs/${encodeURIComponent(designId)}/price${params}`);
}

/** POST /api/v1/designs/:id/publish — publish to a global listing. */
export async function publishDesign(
  id: string,
  body: {
    price: number;
    supplierSlug: string;
    fallbackSuppliers?: string[];
    variants: { color: string; size: string }[];
    categoryId?: string;
    categorySlug?: string;
    channels?: string[];
  },
  idempotencyKey: string,
): Promise<{
  productId: string;
  productUrl: string;
  mockupUrls: string[];
  price: number;
  status: string;
  supplier: { storeProductId?: string; status: string; warnings: string[] };
}> {
  return podFetch(`/api/v1/designs/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
}

/* ── Studio drawers B1–B7, B9 (additive, Nov 8) ── */

/** One row in design_assets — an upload, an AI generation, a shape, or a licensed image. */
export interface DesignAsset {
  id: string;
  kind: string;
  storagePath: string;
  bucket: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  prompt: string | null;
  provider: string | null;
  metadata: Record<string, unknown>;
  designId: string | null;
  createdAt: string;
  /** Signed preview URL (private bucket, 1h). Null when the file is gone. */
  url: string | null;
}

/** GET /api/v1/files — the user's real assets (kind / search). */
export async function listAssets(opts?: {
  kind?: string;
  q?: string;
  limit?: number;
}): Promise<{ assets: DesignAsset[] }> {
  const params = new URLSearchParams();
  if (opts?.kind) params.set('kind', opts.kind);
  if (opts?.q) params.set('q', opts.q);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return podFetch<{ assets: DesignAsset[] }>(`/api/v1/files${qs ? `?${qs}` : ''}`);
}

/** POST /api/v1/files — multipart upload into design_assets (B1, B4). */
export async function uploadFile(
  file: File,
  opts?: { designId?: string; kind?: 'upload' | 'image' | 'shape'; folder?: string; license?: string },
): Promise<{ asset: DesignAsset }> {
  const form = new FormData();
  form.append('file', file);
  if (opts?.designId) form.append('designId', opts.designId);
  if (opts?.kind) form.append('kind', opts.kind);
  if (opts?.folder) form.append('folder', opts.folder);
  if (opts?.license) form.append('license', opts.license);
  let res: Response;
  try {
    res = await fetch('/api/v1/files', { method: 'POST', body: form });
  } catch (e) {
    throw new PodApiError(0, `POD API unreachable (/api/v1/files): ${(e as Error).message}`);
  }
  if (!res.ok) {
    let message = `POD API ${res.status} on /api/v1/files`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      /* keep the status message */
    }
    throw new PodApiError(res.status, message);
  }
  return (await res.json()) as { asset: DesignAsset };
}

/** POST /api/v1/ai/generate — Pollinations art into design_assets (B2). */
export async function generateAiArt(input: {
  prompt: string;
  style?: string;
  designId?: string;
  width?: number;
  height?: number;
}): Promise<{ asset: DesignAsset }> {
  return podFetch<{ asset: DesignAsset }>('/api/v1/ai/generate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface DesignListItem {
  id: string;
  name: string;
  status: string;
  supplier_catalog_product_id: string | null;
  garment_color: string | null;
  product_type: string | null;
  retail_price: number | null;
  is_template: boolean;
  collection_id: string | null;
  publications: {
    id: string;
    status: string;
    mockup_url: string | null;
    product_variant_id: string | null;
  }[];
  created_at: string;
  updated_at: string;
}

/** GET /api/v1/designs — saved designs; template=true lists reusable templates (B6). */
export async function listDesigns(opts?: {
  template?: boolean;
  q?: string;
  status?: string;
  collectionId?: string;
  blankId?: string; // associated designs for one blank (supplier catalog product id)
  limit?: number;
}): Promise<{ items: DesignListItem[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (opts?.template) params.set('template', 'true');
  if (opts?.q) params.set('q', opts.q);
  if (opts?.status) params.set('status', opts.status);
  if (opts?.collectionId) params.set('collectionId', opts.collectionId);
  if (opts?.blankId) params.set('blankId', opts.blankId);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return podFetch<{ items: DesignListItem[]; nextCursor: string | null }>(
    `/api/v1/designs${qs ? `?${qs}` : ''}`,
  );
}

/** GET /api/v1/blanks/:id/price — the Pricing tab (server-computed). */
export async function getBlankPrice(id: string): Promise<PriceQuote> {
  return podFetch<PriceQuote>(`/api/v1/blanks/${encodeURIComponent(id)}/price`);
}

/** GET /api/v1/blanks/:id/orders — the Orders tab (real orders only). */
export interface BlankOrderRow {
  id: string;
  orderId: string;
  orderNumber: string | null;
  status: string | null;
  quantity: number;
  unitPrice: number;
  orderTotal: number | null;
  createdAt: string | null;
}
export async function getBlankOrders(
  id: string,
): Promise<{ orders: BlankOrderRow[] }> {
  return podFetch<{ orders: BlankOrderRow[] }>(
    `/api/v1/blanks/${encodeURIComponent(id)}/orders`,
  );
}

/** GET /api/v1/designs/:id with the full detail (product type, color, price). */
export async function getDesignDetail(id: string): Promise<{
  design: DesignSummary & {
    canvasState: unknown;
    placementSpec: PlacementSpec | null;
    garmentColor: string | null;
    productType: string | null;
    retailPrice: number | null;
  };
}> {
  return podFetch(`/api/v1/designs/${encodeURIComponent(id)}`);
}

/** PATCH /api/v1/designs/:id — mark or unmark a design as a reusable template (B6). */
export async function setDesignTemplate(
  id: string,
  isTemplate: boolean,
): Promise<DesignSummary> {
  return podFetch<DesignSummary>(`/api/v1/designs/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ isTemplate }),
  });
}

/**
 * "Use template" (B6): copy a template design's placement_spec onto the
 * current design. Same-type blanks only — a different product type is
 * refused, never silently re-applied.
 */
export async function applyTemplate(
  templateId: string,
  targetDesignId: string,
): Promise<DesignSummary> {
  const { design: tpl } = await getDesignDetail(templateId);
  if (!tpl.placementSpec || tpl.placementSpec.layers.length === 0) {
    throw new PodApiError(422, 'That template has no placement to copy.');
  }
  const { design: target } = await getDesignDetail(targetDesignId);
  if (
    tpl.productType &&
    target.productType &&
    tpl.productType !== target.productType
  ) {
    throw new PodApiError(
      422,
      `Template is for ${tpl.productType}, not ${target.productType} — same-type blanks only.`,
    );
  }
  return saveDesign(targetDesignId, { placementSpec: tpl.placementSpec });
}

/**
 * Append one layer to a design's placement_spec (B1/B3/B5/B7).
 * Reads the current spec, appends with the next z, saves via PATCH.
 */
export async function appendPlacementLayer(
  designId: string,
  layer: PlacementLayer,
): Promise<DesignSummary> {
  const { design } = await getDesign(designId);
  const spec: PlacementSpec = design.placementSpec ?? { version: 1, layers: [] };
  const maxZ = spec.layers.reduce((m, l) => Math.max(m, l.z), 0);
  const next: PlacementSpec = {
    version: 1,
    layers: [...spec.layers, { ...layer, z: maxZ + 1 }],
  };
  return saveDesign(designId, { placementSpec: next });
}

/** One persisted queue row (GET /api/v1/design-queue). */
export interface QueueItem {
  id: string;
  supplierCatalogProductId: string | null;
  designId: string | null;
  position: number;
  status: string;
  createdAt: string;
  name: string | null;
  brand: string | null;
  imageUrl: string | null;
}

/** GET /api/v1/design-queue — the persisted Design Queue (B9). */
export async function listQueue(): Promise<{ queue: QueueItem[] }> {
  return podFetch<{ queue: QueueItem[] }>('/api/v1/design-queue');
}

/** POST /api/v1/design-queue — enqueue a blank (B9). */
export async function enqueue(input: {
  supplierCatalogProductId?: string;
  designId?: string;
}): Promise<{ item: QueueItem }> {
  return podFetch<{ item: QueueItem }>('/api/v1/design-queue', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** PATCH /api/v1/design-queue — advance a row (queued → active → done). */
export async function updateQueueItem(
  id: string,
  status: 'queued' | 'active' | 'done',
): Promise<{ item: { id: string; status: string } }> {
  return podFetch('/api/v1/design-queue', {
    method: 'PATCH',
    body: JSON.stringify({ id, status }),
  });
}

/** DELETE /api/v1/design-queue?id= — remove a row from the queue. */
export async function removeQueueItem(id: string): Promise<{ removed: string }> {
  return podFetch<{ removed: string }>(`/api/v1/design-queue?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

/* ── Landing side D2–D5 + render worker (additive, Nov 8) ── */

/** One published listing in the finance-global listing (D2). */
export interface FinanceListing {
  productId: string;
  name: string;
  slug: string;
  status: string;
  fulfillmentType: string;
  publishedAt: string | null;
  designId: string | null;
  mockupUrl: string | null;
  price: number | null;
  variantCount: number;
  incomeAccountId: string | null;
  cogsAccountId: string | null;
}

/** GET /api/v1/finance/listings — published listings only; drafts never appear (D2). */
export async function listFinanceListings(): Promise<{ listings: FinanceListing[] }> {
  return podFetch<{ listings: FinanceListing[] }>('/api/v1/finance/listings');
}

/** One live inventory row (D3). POD rows carry onHand null + madeOnDemand. */
export interface InventoryApiRow {
  variantId: string;
  productId: string;
  product: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: number | null;
  fulfillmentType: string;
  trackInventory: boolean;
  madeOnDemand: boolean;
  onHand: number | null;
  inStock: boolean | null;
  reorderPoint: number | null;
  status: string;
}

/** GET /api/v1/inventory — live rows from products + product_variants (D3). */
export async function listInventory(): Promise<{
  rows: InventoryApiRow[];
  counts: { total: number; tracked: number; madeOnDemand: number };
}> {
  return podFetch('/api/v1/inventory');
}

/** One fulfillment PO (D4). */
export interface FulfillmentPO {
  id: string;
  orderId: string;
  orderStatus: string | null;
  orderTotal: number | null;
  customerName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierSlug: string | null;
  routeId: string | null;
  externalId: string | null;
  status: string;
  trackingNumber: string | null;
  cost: number | null;
  createdAt: string;
}

export interface PodOrderLineApi {
  orderItemId: string;
  orderId: string;
  productVariantId: string | null;
  designId: string | null;
  designPublicationId: string | null;
  quantity: number;
  unitPrice: number | null;
  routeId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  costSnapshot: number | null;
  leadTimeDays: number | null;
  printStoragePath: string | null;
  printStatus: 'ready' | 'pending' | 'missing';
}

/** GET /api/v1/orders/fulfillment — POs + POD orders still needing one (D4). */
export async function listFulfillmentQueue(): Promise<{
  purchaseOrders: FulfillmentPO[];
  needsPo: {
    orderId: string;
    orderStatus: string | null;
    orderTotal: number | null;
    customerName: string | null;
    lines: PodOrderLineApi[];
  }[];
}> {
  return podFetch('/api/v1/orders/fulfillment');
}

/** POST /api/v1/orders/:id/fulfillment-po — create the Fulfillment PO(s) for an order (D4). */
export async function createFulfillmentPOs(orderId: string): Promise<{
  orderId: string;
  created: Record<string, unknown>[];
  skipped: string[];
  unroutable: string[];
  message?: string;
}> {
  return podFetch(`/api/v1/orders/${encodeURIComponent(orderId)}/fulfillment-po`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

/** One design proof for a support ticket (D5). */
export interface TicketProof {
  designId: string;
  productName: string | null;
  view: string;
  color: string;
  storagePath: string;
  url: string | null;
}

/** GET /api/v1/support/tickets/:id/proof — the composited mockup for a ticket's POD order (D5). */
export async function getTicketProof(ticketId: string): Promise<{
  ticketId: string;
  subject: string | null;
  orderId: string | null;
  status: string | null;
  proofs: TicketProof[];
}> {
  return podFetch(`/api/v1/support/tickets/${encodeURIComponent(ticketId)}/proof`);
}

/** POST /api/v1/render-worker/claim — claim + render a batch of queued renders. */
export async function claimRenders(batchSize = 5): Promise<{
  claimed: number;
  succeeded: number;
  failed: number;
  requeued: number;
  results: { id: string; status: string; storagePath: string | null; error?: string }[];
}> {
  return podFetch('/api/v1/render-worker/claim', {
    method: 'POST',
    body: JSON.stringify({ batchSize }),
  });
}

/** GET /api/v1/render-worker/claim — queue depths. */
export async function getRenderQueueCounts(): Promise<{
  counts: { queued: number; running: number; succeeded: number; failed: number; stale: number };
}> {
  return podFetch('/api/v1/render-worker/claim');
}

/* ── Views A4–A9 (additive, Nov 8) ── */

/** One published listing row (GET /api/v1/items). */
export interface ItemRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  fulfillmentType: string | null;
  supplier: string | null;
  supplierSlug: string | null;
  sourceProductId: string | null;
  brand: string | null;
  price: number | null;
  variantCount: number;
  colors: string[];
  sizes: string[];
  variants: {
    id: string;
    price: number;
    color: string | null;
    size: string | null;
    sku: string | null;
    routes: {
      supplier: string;
      supplierSlug: string;
      priority: number;
      costSnapshot: number | null;
      leadTimeDays: number | null;
    }[];
  }[];
  designs: { designId: string; status: string; mockupUrl: string | null }[];
  createdAt: string;
  publishedAt: string | null;
}

/** GET /api/v1/items — live products rows; ?status=published for the Global Catalog list (A8). */
export async function listItems(opts?: {
  status?: string;
  q?: string;
  limit?: number;
}): Promise<{ items: ItemRow[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (opts?.status) params.set('status', opts.status);
  if (opts?.q) params.set('q', opts.q);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return podFetch<{ items: ItemRow[]; nextCursor: string | null }>(
    `/api/v1/items${qs ? `?${qs}` : ''}`,
  );
}

/** One store/channel row (GET /api/v1/stores). */
export interface StoreRow {
  id: string;
  code: string;
  name: string;
  channelType: string | null;
  active: boolean;
  liveProducts: number;
  status: string;
}

/** GET /api/v1/stores — the channels listings are live on (A6 My Stores). */
export async function listStores(): Promise<{ items: StoreRow[]; nextCursor: string | null }> {
  return podFetch<{ items: StoreRow[]; nextCursor: string | null }>('/api/v1/stores');
}

/** Studio defaults (GET/PATCH /api/v1/settings, section design_studio). */
export interface StudioSettings {
  default_supplier: string;
  price_markup: number;
  price_rule: string;
}

/** GET /api/v1/settings?section=design_studio — Studio defaults (A9). */
export async function getSettings(
  section = 'design_studio',
): Promise<{ section: string; data: Record<string, unknown>; updatedAt: string | null; isDefault: boolean }> {
  return podFetch(`/api/v1/settings?section=${encodeURIComponent(section)}`);
}

/** PATCH /api/v1/settings — save Studio defaults (A9). */
export async function saveSettings(
  section: string,
  data: Record<string, unknown>,
): Promise<{ section: string; data: Record<string, unknown>; updatedAt: string | null }> {
  return podFetch('/api/v1/settings', {
    method: 'PATCH',
    body: JSON.stringify({ section, data }),
  });
}

/** Designs & collections report aggregates (GET /api/v1/reports/designs). */
export interface DesignsReport {
  designsByStatus: { status: string; count: number }[];
  publicationsByStatus: { status: string; count: number }[];
  collections: { collectionId: string; designCount: number }[];
  unfiledDesigns: number;
  products: { total: number; published: number; publishedPod: number };
  designsWithOrders: {
    design: { id: string; name: string; status: string };
    orders: number;
    units: number;
    revenue: number;
  }[];
  totals: { designs: number; publications: number; orderItems: number; orderRevenue: number };
}

/** GET /api/v1/reports/designs — the report aggregates (A9). */
export async function getDesignsReport(): Promise<DesignsReport> {
  return podFetch<DesignsReport>('/api/v1/reports/designs');
}

/** POST /api/v1/orders — create an order draft from a published product (A6). */
export async function createOrder(input: {
  productVariantId: string;
  designPublicationId?: string;
  quantity?: number;
  customerEmail?: string;
}): Promise<{
  orderId: string;
  orderNumber: string;
  status: string;
  total: number;
  fulfillmentRoute: {
    supplierCatalogVariantId: string | null;
    costSnapshot: number | null;
    leadTimeDays: number | null;
  } | null;
}> {
  return podFetch('/api/v1/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
