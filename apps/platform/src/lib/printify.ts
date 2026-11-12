import { getIntegrationKey } from './supplierKeys';

/**
 * Minimal Printify client for the POD publish path.
 * Key resolves at runtime from integration_keys (PRINTIFY_API_KEY).
 * A missing key throws — the caller reports it, never fakes the call.
 */

const BASE = 'https://api.printify.com';

async function printifyFetch(path: string, init?: RequestInit): Promise<any> {
  const apiKey = await getIntegrationKey('PRINTIFY_API_KEY');
  if (!apiKey) throw new Error('Printify: no API key on file (PRINTIFY_API_KEY).');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Printify ${res.status} on ${path}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

export interface PrintifyProvider {
  id: number;
  title: string;
  decoration_methods?: string[];
  /** Estimated production time, e.g. { average: 3.3, unit: "business_days" }. */
  production_time?: { average: number; unit: string };
}

export async function printifyBlueprintProviders(
  blueprintId: number | string,
): Promise<PrintifyProvider[]> {
  const json = await printifyFetch(`/v1/catalog/blueprints/${blueprintId}/print_providers.json`);
  return Array.isArray(json) ? json : [];
}

export async function printifyBlueprintVariants(
  blueprintId: number | string,
  printProviderId: number | string,
): Promise<{ id: number; title: string; options?: { size?: string; color?: string } }[]> {
  const json = await printifyFetch(
    `/v1/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
  );
  return Array.isArray(json?.variants) ? json.variants : [];
}

/**
 * The RAW variants.json payload — everything the design-canvas skeleton
 * needs: `placeholders` (every printable region with its exact px bounds at
 * production DPI) and the image set — Printify exposes it as a TOP-LEVEL
 * `images` array (each image lists the variant_ids it shows) and as
 * `variants[].images` on some blueprints. Both carry the mockup URL for
 * every color × view angle — the canvas mutes them into skeleton shells.
 */
export interface PrintifyVariantsPayload {
  placeholders?: { position: string; height: number; width: number }[];
  images?: { position: string; url: string; is_default?: boolean; variant_ids?: number[] }[];
  variants?: {
    id: number;
    title: string;
    options?: { size?: string; color?: string };
    images?: { position: string; url: string; is_default?: boolean }[];
  }[];
}

export async function printifyBlueprintVariantsRaw(
  blueprintId: number | string,
  printProviderId: number | string,
): Promise<PrintifyVariantsPayload> {
  return printifyFetch(
    `/v1/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`,
  );
}

export async function printifyShops(): Promise<{ id: number; title: string }[]> {
  const json = await printifyFetch('/v1/shops.json');
  return Array.isArray(json) ? json : [];
}

export async function printifyDefaultShopId(): Promise<number> {
  const shops = await printifyShops();
  if (shops.length === 0) throw new Error('Printify: no shops on this account.');
  return shops[0].id;
}

/** Create the store product. Returns the created product incl. mockup images. */
export async function printifyCreateProduct(
  shopId: number,
  body: Record<string, unknown>,
): Promise<any> {
  return printifyFetch(`/v1/shops/${shopId}/products.json`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Upload a print file to the shop's image library. Printify's product
 * creation REQUIRES print_areas whose placeholder images reference an
 * uploaded image id — a print_areas-less product is rejected (8150).
 * Returns the image id.
 */
export async function printifyUploadImage(
  shopId: number,
  input: { fileName: string; base64: string; contentType?: string },
): Promise<number> {
  const json = await printifyFetch(`/v1/shops/${shopId}/uploads.json`, {
    method: 'POST',
    body: JSON.stringify({
      file_name: input.fileName,
      contents: input.base64,
      content_type: input.contentType ?? 'image/png',
    }),
  });
  const id = Number((json as { id?: number })?.id ?? 0);
  if (!id) throw new Error('Printify image upload returned no id.');
  return id;
}

export async function printifyGetProduct(shopId: number, productId: string): Promise<any> {
  return printifyFetch(`/v1/shops/${shopId}/products/${productId}.json`);
}

export interface PrintifyBlueprint {
  id: number;
  title: string;
  description: string;
  brand: string | null;
  model: string;
  images: { src: string }[];
  tags: string[];
  features: string[] | null;
  care_instructions: string[] | null;
}

/**
 * GET /v1/catalog/blueprints/{id}.json — the blueprint-level detail our
 * supplier_catalog_products mirror doesn't carry: description (HTML),
 * tags, features, care instructions. blueprint_id lives in the product's
 * print_specs (synced per-variant). Cached — the product page fires this
 * on every visit.
 */
const blueprintCache = new Map<string, { at: number; value: PrintifyBlueprint }>();
const BLUEPRINT_TTL_MS = 5 * 60 * 1000;

export async function printifyBlueprint(
  blueprintId: number | string,
): Promise<PrintifyBlueprint> {
  const key = String(blueprintId);
  const hit = blueprintCache.get(key);
  if (hit && Date.now() - hit.at < BLUEPRINT_TTL_MS) return hit.value;
  const json = await printifyFetch(`/v1/catalog/blueprints/${key}.json`);
  blueprintCache.set(key, { at: Date.now(), value: json });
  return json;
}
