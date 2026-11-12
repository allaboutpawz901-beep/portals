import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { apiError, KEEPER_SUPPLIER_SLUGS } from '@/lib/podServer';
import { printifyBlueprintVariantsRaw } from '@/lib/printify';
import { trigger } from '@/lib/ingestTrigger';

/**
 * Lazy-first ingestion: opening a blank with no stored base photos kicks
 * the harvest (fire-and-forget, shared trigger with the publish route)
 * so the NEXT open — and the first preview — render the real product.
 */

/**
 * GET /api/v1/blanks/:id/skeleton — the design-canvas skeleton for a blank.
 *
 * Printify's variants.json is the source of truth for what a canvas can
 * show: `placeholders` lists every printable region (front, back,
 * left_sleeve, right_sleeve, neck…) with its exact px bounds at production
 * DPI (300 for virtually all apparel), and `variants[].images` carries the
 * mockup image URL for every color × view angle. Those become:
 *   - the canvas pills (placeholders → Front / Back / Sleeve L / Sleeve R)
 *   - the muted skeleton shell (the per-color/view image, CSS-muted client-side)
 *   - the bounding box (print-area px → inches at the placeholder's DPI)
 *
 * The blueprint_id + provider_id come from the stored print_specs. When the
 * live Printify call is impossible (no API key / network), the endpoint
 * still answers from the catalog: DB placeholders + the product mockup —
 * the canvas is never blocked, and `source` says which system answered.
 */

export interface SkeletonPlaceholder {
  position: string;
  width: number;
  height: number;
  dpi: number;
}

export interface SkeletonVariantImages {
  color: string;
  images: Record<string, string>;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; body: unknown }>();

function cacheGet(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.body;
}

/** Strip Printify technique suffixes: front_dtf → front. */
function basePosition(position: string): string {
  return position
    .toLowerCase()
    .replace(/_(dtf|dtg|embroidery|sublimation|screen_print|screenprint|vinyl|cut_sew)$/i, '');
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const cached = cacheGet(id);
    if (cached) return NextResponse.json(cached);

    // Product + supplier (keeper gate — same rule as the detail route).
    const { data: product, error: prodErr } = await supabaseAdmin()
      .from('supplier_catalog_products')
      .select('id,name,image_url,supplier_id')
      .eq('id', id)
      .single();
    if (prodErr || !product) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No blank ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const { data: supplier } = await supabaseAdmin()
      .from('suppliers')
      .select('name,slug')
      .eq('id', product.supplier_id as string)
      .single();
    if (!supplier || !KEEPER_SUPPLIER_SLUGS.includes(supplier.slug as string)) {
      return NextResponse.json(
        { error: { code: 'SUPPLIER_EXCLUDED', message: 'This product’s supplier is not enabled for the designer.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }

    // Variants: print_specs placeholders (always present) + blueprint ids.
    const { data: variantRows } = await supabaseAdmin()
      .from('supplier_catalog_variants')
      .select('color,print_specs')
      .eq('supplier_catalog_product_id', id)
      .limit(1000);

    // DB placeholders — from every variant's stored print_specs.
    const dbPlaceholders = new Map<string, SkeletonPlaceholder>();
    let blueprintId: number | null = null;
    let providerId: number | null = null;
    const colors: string[] = [];
    for (const v of variantRows ?? []) {
      if (v.color && !colors.includes(String(v.color))) colors.push(String(v.color));
      const specs = (v.print_specs ?? {}) as {
        blueprint_id?: number;
        provider_id?: number;
        placeholders?: { position?: string; width?: number; height?: number }[];
      };
      if (!blueprintId && specs.blueprint_id) blueprintId = specs.blueprint_id;
      if (!providerId && specs.provider_id) providerId = specs.provider_id;
      for (const p of specs.placeholders ?? []) {
        const position = String(p.position ?? '').toLowerCase();
        if (!position || dbPlaceholders.has(position)) continue;
        dbPlaceholders.set(position, {
          position,
          width: Number(p.width ?? 0),
          height: Number(p.height ?? 0),
          dpi: 300,
        });
      }
    }

    // Live Printify: placeholders + per-color/view variant images.
    if (supplier.slug === 'printify' && blueprintId && providerId) {
      try {
        const payload = await printifyBlueprintVariantsRaw(blueprintId, providerId);
        const placeholders: SkeletonPlaceholder[] = [];
        const seen = new Set<string>();
        // Printify ships placeholders two ways: a top-level array, or
        // per-variant (variant[].placeholders, often differing per variant —
        // e.g. live back_dtf 3312×3864 vs the ingested 3600×4200 snapshot).
        // Aggregate both, first occurrence wins.
        const addPlaceholder = (position: unknown, width: unknown, height: unknown) => {
          const pos = String(position ?? '').toLowerCase();
          if (!pos || seen.has(pos)) return;
          const w = Number(width ?? 0);
          const h = Number(height ?? 0);
          if (w <= 0 || h <= 0) return;
          seen.add(pos);
          placeholders.push({ position: pos, width: w, height: h, dpi: 300 });
        };
        for (const p of payload.placeholders ?? []) {
          addPlaceholder(p.position, p.width, p.height);
        }
        for (const v of payload.variants ?? []) {
          for (const p of (v as { placeholders?: { position?: string; width?: number; height?: number }[] }).placeholders ?? []) {
            addPlaceholder(p.position, p.width, p.height);
          }
        }
        // Variant images — Printify exposes them two ways and both are
        // mapped: a TOP-LEVEL images[] (each entry lists the variant_ids it
        // shows → variant → color) and per-variant images[]. One entry per
        // color, images keyed by base position (front / back / sleeve…).
        const variantById = new Map<number, string>();
        for (const v of payload.variants ?? []) {
          if (v.options?.color) variantById.set(v.id, v.options.color);
        }
        const byColor = new Map<string, Record<string, string>>();
        const addImage = (color: string, position: string, url: string) => {
          const pos = basePosition(position || 'front');
          if (!pos || !url) return;
          const images = byColor.get(color) ?? {};
          if (!images[pos]) images[pos] = url;
          byColor.set(color, images);
        };
        // Top-level images: variant_ids → color(s).
        for (const img of payload.images ?? []) {
          const colors = new Set<string>();
          for (const vid of img.variant_ids ?? []) {
            const c = variantById.get(vid);
            if (c) colors.add(c);
          }
          if (colors.size === 0) colors.add('__default__');
          for (const c of colors) addImage(c, img.position, img.url);
        }
        // Per-variant images (some blueprints).
        for (const v of payload.variants ?? []) {
          const color = v.options?.color;
          if (!color) continue;
          for (const img of v.images ?? []) addImage(color, img.position, img.url);
        }
        const variantImages: SkeletonVariantImages[] = [...byColor.entries()]
          .filter(([color]) => color !== '__default__' || byColor.size === 1)
          .filter(([, images]) => Object.keys(images).length > 0)
          .map(([color, images]) => ({ color, images }));

        const body = {
          source: 'printify' as const,
          placeholders: placeholders.length > 0 ? placeholders : [...dbPlaceholders.values()],
          variantImages,
          mockupUrl: (product.image_url as string | null) ?? null,
        };
        cache.set(id, { at: Date.now(), body });
        trigger(id);
        return NextResponse.json(body);
      } catch {
        // No key / Printify down — fall through to the catalog skeleton.
      }
    }

    // Catalog fallback: DB placeholders + the product mockup as the only view.
    const body = {
      source: 'catalog' as const,
      placeholders: [...dbPlaceholders.values()],
      variantImages:
        colors.length > 0 && product.image_url
          ? [{ color: colors[0], images: { front: product.image_url as string } }]
          : [],
      mockupUrl: (product.image_url as string | null) ?? null,
    };
    cache.set(id, { at: Date.now(), body });
    trigger(id);
    return NextResponse.json(body);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load the blank skeleton.');
  }
}
