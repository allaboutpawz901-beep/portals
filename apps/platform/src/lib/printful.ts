import { getIntegrationKey } from './supplierKeys';

/**
 * Printful catalog API client — fetches the product detail data our DB
 * mirror doesn't carry: techniques (DTG/Embroidery/DTF), full description
 * with features, colors with real hex codes (not name→hex guesses),
 * per-placement print geometry + thread colors, and product options
 * (embroidery unlimited_color, lifelike, etc.).
 *
 * The DB row for a Printful product carries `external_id` (the Printful
 * catalog product id, e.g. "438" for Gildan 5000) and
 * `external_id_type = "printful_catalog_product"` — that's the join key.
 *
 * Key resolves at runtime from integration_keys (PRINTFUL_API_KEY).
 * A missing key throws — the caller reports it, never fakes the call.
 */

const BASE = 'https://api.printful.com';

async function printfulFetch<T>(path: string): Promise<T> {
  const apiKey = await getIntegrationKey('PRINTFUL_API_KEY');
  if (!apiKey) throw new Error('Printful: no API key on file (PRINTFUL_API_KEY).');
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printful ${res.status} on ${path}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/** 5-minute in-memory cache — catalog product detail rarely changes and
 *  the product page fires this on every visit. */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export interface PrintfulTechnique {
  key: string;
  display_name: string;
  is_default: boolean;
}

export interface PrintfulColor {
  name: string;
  value: string; // hex, e.g. "#f3f3f3"
}

export interface PrintfulPlacementLayer {
  type: string;
  layer_options?: {
    name: string;
    techniques: string[];
    type: string;
    values?: Record<string, string>;
  }[];
}

export interface PrintfulPlacement {
  placement: string;
  technique: string;
  layers: PrintfulPlacementLayer[];
  placement_options?: {
    name: string;
    techniques: string[];
    type: string;
    values: unknown[];
  }[];
  conflicting_placements?: string[];
}

export interface PrintfulProductOption {
  name: string;
  techniques: string[];
  type: string;
  values: unknown;
}

export interface PrintfulCatalogProduct {
  id: number;
  type: string;
  main_category_id: number;
  name: string;
  brand: string | null;
  model: string;
  image: string;
  variant_count: number;
  is_discontinued: boolean;
  description: string;
  sizes: string[];
  colors: PrintfulColor[];
  techniques: PrintfulTechnique[];
  placements: PrintfulPlacement[];
  product_options: PrintfulProductOption[];
}

interface PrintfulCatalogProductResponse {
  data: PrintfulCatalogProduct;
}

/**
 * GET /v2/catalog-products/{id} — one Printful catalog product, fully.
 * The response carries the data our DB mirror doesn't: techniques,
 * description, colors with hex, placements (per-technique print geometry
 * + thread colors), and product options.
 */
export async function printfulCatalogProduct(
  externalId: string | number,
): Promise<PrintfulCatalogProduct> {
  return cached(`printful:product:${externalId}`, async () => {
    const json = await printfulFetch<PrintfulCatalogProductResponse>(
      `/v2/catalog-products/${externalId}`,
    );
    return json.data;
  });
}

/** Per-technique price for one variant: DTG $9.44 / Embroidery $11.71 / DTF $10.92. */
export interface PrintfulVariantTechniquePrice {
  technique_key: string;
  technique_display_name: string;
  price: string;
  discounted_price: string;
}

export interface PrintfulVariantPrice {
  id: number;
  techniques: PrintfulVariantTechniquePrice[];
}

export interface PrintfulPrices {
  currency: string;
  product?: PrintfulVariantTechniquePrice[];
  variants: PrintfulVariantPrice[];
  /** Volume tiers — the first (lowest) tier is the "Growth" price on Printful's page. */
  discount_tiers: {
    min_quantity: number;
    max_quantity: number | null;
    techniques?: { technique_key: string; price: string; discounted_price: string }[];
    prices?: Record<string, string>;
  }[];
}

/**
 * GET /v2/catalog-products/{id}/prices — per-variant, per-technique prices
 * with volume discount tiers. `product` carries the product-level price per
 * technique; `variants[]` the per-variant breakdown; `discount_tiers` the
 * Growth-style tiered pricing (first tier = discounted price on the page).
 */
export async function printfulCatalogPrices(
  externalId: string | number,
): Promise<PrintfulPrices> {
  return cached(`printful:prices:${externalId}`, async () => {
    const json = await printfulFetch<{ data: PrintfulPrices }>(
      `/v2/catalog-products/${externalId}/prices`,
    );
    return json.data;
  });
}

export interface PrintfulCatalogImageSet {
  catalog_variant_id: number;
  color: string;
  primary_hex_color: string;
  secondary_hex_color: string | null;
  images: {
    placement: string;
    image_url: string;
    background_color: string | null;
    background_image: string | null;
    mockup_style_id: number;
  }[];
}

/**
 * GET /v2/catalog-products/{id}/images — the mockup gallery per color ×
 * placement (front flat, back flat, lifestyle, model shots…). Also the
 * authoritative per-color hex (primary_hex_color).
 */
export async function printfulCatalogImages(
  externalId: string | number,
): Promise<PrintfulCatalogImageSet[]> {
  return cached(`printful:images:${externalId}`, async () => {
    const json = await printfulFetch<{ data: PrintfulCatalogImageSet[] }>(
      `/v2/catalog-products/${externalId}/images`,
    );
    return Array.isArray(json.data) ? json.data : [];
  });
}

/** Whether a product row's external_id maps to a Printful catalog product. */
export function isPrintfulCatalogProduct(externalIdType: string | null | undefined): boolean {
  return (externalIdType ?? '').toLowerCase() === 'printful_catalog_product';
}

// ── Sync products (the publish path) ────────────────────────────────────
// A sync product connects a store product to a Printful catalog product:
// each sync variant pins a catalog_variant_id and carries the print
// files. The print file of record (our render worker's 300-DPI PNG) is
// passed as a fetchable URL; `preview` carries the composited mockup.

async function printfulWrite<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
  const apiKey = await getIntegrationKey('PRINTFUL_API_KEY');
  if (!apiKey) throw new Error('Printful: no API key on file (PRINTFUL_API_KEY).');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printful ${res.status} on ${method} ${path}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export interface PrintfulSyncFileInput {
  type: 'default' | 'preview' | 'back' | 'label';
  /** Placement this file belongs to (front / back / label…). */
  place?: string;
  /** Publicly fetchable URL of the file (print PNG or mockup preview). */
  image_url: string;
}

export interface PrintfulSyncVariantInput {
  name: string;
  sku?: string;
  /** Retail price in USD (string per Printful's API). */
  price?: string;
  /** Printful catalog variant id (printful_variant_id on our rows). */
  catalog_variant_id: number;
  files: PrintfulSyncFileInput[];
}

export interface PrintfulSyncProductCreated {
  id: number;
  external_id?: string;
  name: string;
  status?: string;
  thumbnail_url?: string;
  variants?: { id: number; name: string; retail_price?: string }[];
}

/**
 * POST /v2/sync-products — create the store product. No `position` is
 * sent on print files: our print PNG is a full print-area image, so
 * Printful's default centering is exactly right. Returns the created
 * sync product (id + thumbnail). store_id is required by the endpoint —
 * resolve the account's default store when the caller omits it.
 */
export async function printfulCreateSyncProduct(input: {
  name: string;
  thumbnail?: string;
  storeId?: number;
  variants: PrintfulSyncVariantInput[];
}): Promise<PrintfulSyncProductCreated> {
  const storeId = input.storeId ?? (await printfulDefaultStoreId());
  const body = {
    store_id: storeId,
    sync_product: {
      name: input.name,
      ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}),
      is_ignored: false,
    },
    sync_variants: input.variants.map((v) => ({
      name: v.name,
      ...(v.sku ? { sku: v.sku } : {}),
      ...(v.price ? { price: v.price } : {}),
      is_ignored: false,
      catalog_variant_id: v.catalog_variant_id,
      files: v.files,
    })),
  };
  const json = await printfulWrite<{ data: PrintfulSyncProductCreated }>(
    `/v2/sync-products?store_id=${storeId}`,
    body,
  );
  return json.data;
}

interface PrintfulStore {
  id: number;
  name: string;
  platform?: string;
}

/** GET /stores — the account's Printful stores. */
export async function printfulStores(): Promise<PrintfulStore[]> {
  const json = await printfulFetch<{ data?: PrintfulStore[] } | PrintfulStore[]>('/stores');
  const list = Array.isArray(json) ? json : (json.data ?? []);
  return list;
}

/** The first store on the account — the sync-product default. */
export async function printfulDefaultStoreId(): Promise<number> {
  const stores = await printfulStores();
  if (stores.length === 0) throw new Error('Printful: no stores on this account.');
  return stores[0].id;
}
