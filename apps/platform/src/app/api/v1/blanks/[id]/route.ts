import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  apiError,
  cheapestCosts,
  cheapestProductionTimes,
  familyForTopCategory,
  hexForColorName,
  KEEPER_SUPPLIER_SLUGS,
  keeperSupplierIds,
  loadCategories,
  minVariantSnapshots,
  normalizeName,
  printerDelivery,
  templateGeometry,
  templatesForCategory,
  topNameOf,
} from '@/lib/podServer';
import {
  isPrintfulCatalogProduct,
  printfulCatalogProduct,
  printfulCatalogPrices,
  printfulCatalogImages,
  type PrintfulCatalogProduct,
} from '@/lib/printful';
import { storageFetchUrl } from '@/lib/ingestTrigger';
import { blankDetailCacheGet, blankDetailCacheSet } from '@/lib/blankDetailCache';

/**
 * GET /api/v1/blanks/:id — one blank, fully.
 * Product row + real variant colors/sizes from supplier_catalog_variants +
 * real print-area px from the variants' print_specs placeholders + the
 * archetype skeleton views from product_canvas_templates + the cheapest
 * in-stock cost. Color hex comes from a name map; unknown names return null.
 *
 * The aggregate is ~20 Supabase roundtrips + supplier enrichments, so the
 * response is cached (5 min TTL). Writers that change the render contract
 * (ingest, view QA) bust the entry via blankDetailCacheBust.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const cached = blankDetailCacheGet(id);
    if (cached) return NextResponse.json(cached);
    const { data: product, error } = await supabaseAdmin()
      .from('supplier_catalog_products')
      .select(
        'id,name,brand_name,supplier_id,category_id,canonical_product_id,variant_count,image_url,external_id,external_id_type',
      )
      .eq('id', id)
      .single();
    if (error || !product) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No blank ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }

    const nodes = await loadCategories();
    const topName = topNameOf(nodes, product.category_id as string);
    const family = familyForTopCategory(topName);
    const canonical = product.canonical_product_id as string | null;

    const supplier = await supabaseAdmin()
      .from('suppliers')
      .select('name,slug')
      .eq('id', product.supplier_id as string)
      .single();
    // Drops are excluded from the designer (keeper rule) — not offered here.
    if (!supplier.data || !KEEPER_SUPPLIER_SLUGS.includes(supplier.data.slug as string)) {
      return NextResponse.json(
        { error: { code: 'SUPPLIER_EXCLUDED', message: 'This product’s supplier is not enabled for the designer.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }

    const [{ data: variants }, costs, snapshots, templates, ownTemplates, productionTimes] = await Promise.all([
      supabaseAdmin()
        .from('supplier_catalog_variants')
        .select('size,color,print_specs,price_snapshot')
        .eq('supplier_catalog_product_id', id)
        .limit(1000),
      canonical ? cheapestCosts([canonical]) : Promise.resolve(new Map()),
      canonical ? minVariantSnapshots([canonical]) : Promise.resolve(new Map()),
      templatesForCategory(topName),
      // The blank's OWN ingested render-contract rows (canonical_product_id
      // match). When at least one carries a stored base, these views win
      // over the category archetype — the canvas then edits on the same
      // color-accurate, stored-in-our-bucket base the render worker uses.
      canonical
        ? supabaseAdmin()
            .from('product_canvas_templates')
            .select('*')
            .eq('canonical_product_id', canonical)
            .eq('is_active', true)
            .order('view_angle')
        : Promise.resolve({ data: [] } as { data: never[] }),
      // Production time for THIS row — min across every provider that
      // carries it. Drives the Est. Shipping box on the card / product
      // page header. Source: catalog_provider_facts.production_time_avg.
      cheapestProductionTimes([id]),
    ]);

    // Format "3.2 days" / "2.5 business days" / null — symmetric with the
    // blanks list route's formatter so the card and the product page agree.
    const prodTime = productionTimes.get(id) ?? null;
    const formatEstShipping = (_rowId: string): string | null => {
      if (!prodTime) return null;
      const unit = prodTime.unit === 'business_days' ? 'days' : prodTime.unit;
      const days = prodTime.days;
      return `${days % 1 === 0 ? days : days.toFixed(1)} ${unit}`;
    };

    const colors = new Map<string, { name: string; hex: string | null }>();
    const sizes = new Set<string>();
    const areaByPlacement = new Map<string, { placement: string; widthPx: number; heightPx: number; dpi: number }>();
    // Per-placement decoration method (DTG/DTF/embroidery/dye-sublimation) —
    // Printify stores this in print_specs.placeholders[].decoration_method.
    // Printful doesn't carry it in our DB mirror (print_specs is empty),
    // so the Printful enrichment below fills it from the catalog API.
    const techniquesFromSpecs = new Map<string, string>();
    // The print provider's own title (e.g. "Fulfill Engine") when present.
    let providerTitle: string | null = null;
    for (const v of variants ?? []) {
      if (v.color) {
        const name = String(v.color);
        if (!colors.has(name)) colors.set(name, { name, hex: hexForColorName(name) });
      }
      if (v.size) sizes.add(String(v.size));
      const specs = (v.print_specs as any) ?? {};
      if (specs.provider_title && !providerTitle) providerTitle = String(specs.provider_title);
      const placeholders = specs.placeholders;
      if (Array.isArray(placeholders)) {
        for (const p of placeholders) {
          const placement = String(p.position ?? 'front');
          if (!areaByPlacement.has(placement)) {
            areaByPlacement.set(placement, {
              placement,
              widthPx: Number(p.width ?? 0),
              heightPx: Number(p.height ?? 0),
              dpi: 300,
            });
          }
          const dm = p.decoration_method ? String(p.decoration_method) : null;
          if (dm && !techniquesFromSpecs.has(dm)) {
            techniquesFromSpecs.set(dm, dm.toUpperCase());
          }
        }
      }
    }

    // Views: per-blank ingested rows first (stored bases OR geometry-only
    // rows with real provider inches), archetype rows only as the fallback
    // when nothing is ingested yet.
    const ownRows = (ownTemplates as { data: Record<string, unknown>[] }).data ?? [];
    const ownRenderable = ownRows.filter(
      (t) => Boolean(t.stored_base_path) || Number(t.physical_width_inches ?? 0) > 0,
    );
    let views: unknown[];
    if (ownRenderable.length > 0) {
      views = await Promise.all(
        ownRenderable.map(async (t) => {
          let baseUrl: string | null = null;
          if (t.stored_base_path) {
            try {
              baseUrl = await storageFetchUrl(String(t.stored_base_path));
            } catch {
              baseUrl = (t.mockup_image_url as string | null) ?? null;
            }
          } else {
            // Geometry-only row: no photo exists — the catalog image stands in.
            baseUrl = (t.mockup_image_url as string | null) ?? null;
          }
          const zoneX = Number(t.print_zone_x ?? 0);
          const zoneY = Number(t.print_zone_y ?? 0);
          const zoneW = Number(t.print_zone_width ?? 0);
          const zoneH = Number(t.print_zone_height ?? 0);
          const wIn = Number(t.physical_width_inches ?? 0);
          const hIn = Number(t.physical_height_inches ?? 0);
          const ppi = Number(t.px_per_inch ?? 0) || (zoneW > 0 && wIn > 0 ? zoneW / wIn : 300);
          const r2 = (n: number) => Math.round(n * 100) / 100;
          return {
            view: String(t.view_angle),
            label: String(t.view_angle),
            baseUrl,
            shadingUrl: (t.stored_shading_path as string | null) ?? null,
            maskUrl: (t.displacement_map_url as string | null) ?? null,
            boxPx: { left: zoneX, top: zoneY, width: zoneW, height: zoneH },
            boxIn: {
              xIn: r2(zoneX / ppi),
              yIn: r2(zoneY / ppi),
              wIn: wIn > 0 ? wIn : r2(zoneW / ppi),
              hIn: hIn > 0 ? hIn : r2(zoneH / ppi),
            },
            pxPerInch: ppi,
            // Stored-view coordinates are ALREADY in the stored image's own
            // pixel space (canvasPx null → 1:1). Geometry-only rows anchor
            // on the 450×600 flat mockup canvas and display over the
            // catalog image — clients scale the box from that space.
            canvasPx: t.stored_base_path ? null : { w: 450, h: 600 },
            source: 'stored',
            verified: Boolean(t.verified),
          };
        }),
      );
    } else {
      views = templates.map((t) => {
        const geo = templateGeometry(t);
        return {
          view: String(t.view_angle),
          label: String(t.view_angle),
          baseUrl: t.mockup_image_url as string,
          shadingUrl: null,
          maskUrl: (t.displacement_map_url as string | null) ?? null,
          boxPx: geo.boxPx,
          boxIn: geo.boxIn,
          // Archetype template — real geometry, not verified per product.
          pxPerInch: geo.pxPerInch,
          // The canvas the boxPx live on — clients scale to the loaded image.
          canvasPx: geo.canvasPx,
          source: 'archetype',
          verified: false,
        };
      });
    }

    const costRow = canonical ? costs.get(canonical) : undefined;
    const snapshot = canonical ? snapshots.get(canonical) : undefined;

    // ── Supplier catalog enrichment — SYMMETRIC contract ──
    // Our DB mirror carries only what the one-time sync captured. Each
    // keeper supplier fills the SAME response shape from its own catalog
    // API; what a supplier can't provide stays null/empty (never invented):
    //
    //   field            Printful (v2 catalog API)     Printify (print_specs / blueprints API)
    //   techniques       techniques[]                  placeholders[].decoration_method
    //   description      description (plain text)      blueprints/{id}.description (HTML → text)
    //   color hex        colors[] / images hex         name→hex map (no hex in Printify's API)
    //   techniquePrices  prices endpoint (per tech)    — (single base cost)
    //   gallery          images endpoint (per color)   — (archetype views only)
    //   providerTitle    — (Printful IS the printer)   print_specs.provider_title
    //   printAreas       — (v2 API exposes no px dims) placeholders[] (exact px)
    //
    // Every fetch is non-fatal — a failed call degrades that field only.
    let techniques: { key: string; label: string; isDefault: boolean }[] = [];
    let description = '';
    let printfulEnriched = false;
    // Per-technique pricing (Printful): DTG $9.44 / Embroidery $11.71 / DTF
    // $10.92 — plus the discounted tier (Printful Growth). Empty for
    // suppliers without technique-level pricing.
    let techniquePrices: { key: string; label: string; price: number; discountedPrice: number | null }[] = [];
    // Supplier mockup gallery per color (Printful images endpoint): the
    // per-color swatches with real hex + the front/back/lifestyle images
    // Printful's own product page shows.
    let gallery: { color: string; hex: string; images: { placement: string; url: string }[] }[] = [];
    // Which supplier's API filled description ('printful' | 'printify' | '').
    let descriptionSource = '';

    if (
      isPrintfulCatalogProduct(product.external_id_type as string | null) &&
      product.external_id
    ) {
      try {
        const pf: PrintfulCatalogProduct = await printfulCatalogProduct(
          product.external_id as string,
        );
        techniques = (pf.techniques ?? []).map((t) => ({
          key: t.key,
          label: t.display_name,
          isDefault: Boolean(t.is_default),
        }));
        description = String(pf.description ?? '');
        descriptionSource = 'printful';
        // Replace guessed hex with Printful's real hex codes (name → value).
        const pfHexByName = new Map(
          (pf.colors ?? []).map((c) => [c.name.toLowerCase(), c.value]),
        );
        for (const [name, entry] of colors) {
          const realHex = pfHexByName.get(name.toLowerCase());
          if (realHex) entry.hex = realHex;
        }
        // Printful sizes arrive as e.g. ["S","M","L",…] — merge any we lack.
        for (const s of pf.sizes ?? []) sizes.add(String(s));
        printfulEnriched = true;

        // Per-technique prices + gallery — additive, each guarded so one
        // failed endpoint never kills the other enrichments.
        try {
          const prices = await printfulCatalogPrices(product.external_id as string);
          const productLevel = Array.isArray(prices.product) ? prices.product : [];
          techniquePrices = productLevel.map((t) => ({
            key: t.technique_key,
            label: t.technique_display_name,
            price: Number(t.price),
            discountedPrice:
              t.discounted_price != null && Number(t.discounted_price) !== Number(t.price)
                ? Number(t.discounted_price)
                : null,
          }));
          if (techniquePrices.length === 0 && prices.variants?.[0]?.techniques) {
            // Product-level missing — derive from the first variant's set.
            techniquePrices = prices.variants[0].techniques.map((t) => ({
              key: t.technique_key,
              label: t.technique_display_name,
              price: Number(t.price),
              discountedPrice:
                t.discounted_price != null && Number(t.discounted_price) !== Number(t.price)
                  ? Number(t.discounted_price)
                  : null,
            }));
          }
        } catch {
          techniquePrices = [];
        }
        try {
          const imgSets = await printfulCatalogImages(product.external_id as string);
          // One gallery entry per color (first image set per color name),
          // ordered as Printful returns them. Printful returns EVERY mockup
          // style per color (hundreds) — cap each color at 12 images so the
          // payload stays sane; the gallery shows the first 8 anyway.
          const MAX_PER_COLOR = 12;
          const byColor = new Map<string, { color: string; hex: string; images: { placement: string; url: string }[] }>();
          for (const set of imgSets) {
            if (!byColor.has(set.color)) {
              byColor.set(set.color, {
                color: set.color,
                hex: set.primary_hex_color || pfHexByName.get(set.color.toLowerCase()) || '',
                images: (set.images ?? [])
                  .slice(0, MAX_PER_COLOR)
                  .map((i) => ({ placement: i.placement, url: i.image_url })),
              });
            }
          }
          gallery = [...byColor.values()];
        } catch {
          gallery = [];
        }
      } catch {
        // Catalog API unreachable or key missing — fall through to DB-only.
        printfulEnriched = false;
      }
    }

    // Printify: techniques + providerTitle come from print_specs (parsed
    // above). Description comes from the blueprint API via the blueprint_id
    // in print_specs — the mirror doesn't carry it.
    if (techniques.length === 0 && techniquesFromSpecs.size > 0) {
      techniques = [...techniquesFromSpecs.entries()].map(([key, label], i) => ({
        key,
        label,
        isDefault: i === 0,
      }));
    }
    if (!description) {
      const blueprintId = (() => {
        for (const v of variants ?? []) {
          const bid = (v.print_specs as any)?.blueprint_id;
          if (bid) return bid as number | string;
        }
        return null;
      })();
      if (blueprintId) {
        try {
          const { printifyBlueprint } = await import('@/lib/printify');
          const bp = await printifyBlueprint(blueprintId);
          // Blueprint description is HTML — strip tags for the text block.
          description = String(bp.description ?? '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          descriptionSource = description ? 'printify' : '';
        } catch {
          description = '';
        }
      }
    }

    // Every keeper printer carrying this same/similar product type:
    // same normalized name inside the same top category, one row per
    // supplier, each with its own base cost + live production time.
    let printers: {
      name: string;
      slug: string;
      baseCost: number | null;
      estimatedDelivery: { average: number; unit: string } | null;
    }[] = [];
    let deliveryEstimate = '';
    try {
      const keeperIds = await keeperSupplierIds();
      // Same/similar product type across keepers. The product TYPE is what
      // the navigation categories architect, so the signals are: exact
      // product name (3) > same category name (2). A Printful "Full Zip
      // Hoodie" is the same type as a Printify zip hoodie even though the
      // style names never match word-for-word.
      const selfCatName = normalizeName(
        nodes.find((n) => n.id === (product.category_id as string))?.name ?? '',
      );
      // PostgREST caps at 1000 rows/request — page through the same-type
      // set instead of one big fetch (the old fetch silently saw only the
      // first 1000 keeper rows, which is why printers came back empty).
      type SiblingRow = {
        id: string;
        name: string;
        supplier_id: string;
        canonical_product_id: string | null;
        category_id: string;
      };
      const fetchPages = async (
        build: (from: number, to: number) => PromiseLike<{ data: SiblingRow[] | null; error: unknown }>,
      ): Promise<SiblingRow[]> => {
        const out: SiblingRow[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await build(from, from + 999);
          if (error) throw new Error('siblings query failed.');
          out.push(...(data ?? []));
          if (!data || data.length < 1000) break;
        }
        return out;
      };
      const sameCatIds = nodes
        .filter(
          (n) =>
            normalizeName(n.name) === selfCatName &&
            selfCatName !== '' &&
            topNameOf(nodes, n.id) === topName,
        )
        .map((n) => n.id);
      const [exactRows, sameCatRows] = await Promise.all([
        supabaseAdmin()
          .from('supplier_catalog_products')
          .select('id,name,supplier_id,canonical_product_id,category_id')
          .eq('name', product.name as string)
          .in('supplier_id', keeperIds)
          .then((r) => (r.data ?? []) as unknown as SiblingRow[]),
        sameCatIds.length > 0
          ? fetchPages((from, to) =>
              supabaseAdmin()
                .from('supplier_catalog_products')
                .select('id,name,supplier_id,canonical_product_id,category_id')
                .in('category_id', sameCatIds)
                .in('supplier_id', keeperIds)
                .range(from, to)
                .then((r) => ({
                  data: (r.data ?? []) as unknown as SiblingRow[],
                  error: r.error,
                })),
            )
          : Promise.resolve([] as SiblingRow[]),
      ]);
      const selfNorm = normalizeName(product.name as string);
      const scored: { row: SiblingRow; score: number }[] = [];
      for (const s of exactRows) {
        if (s.id !== id) scored.push({ row: s, score: 3 });
      }
      for (const s of sameCatRows) {
        if (s.id === id) continue;
        if (normalizeName(s.name) === selfNorm) continue; // already scored
        scored.push({ row: s, score: 2 });
      }
      scored.sort((a, b) => b.score - a.score);
      const bySupplier = new Map<string, SiblingRow>();
      for (const { row } of scored) {
        if (!bySupplier.has(row.supplier_id)) bySupplier.set(row.supplier_id, row);
      }
      const matches = [...bySupplier.values()].slice(0, 5);
      const matchCanonicals = matches
        .map((m) => m.canonical_product_id)
        .filter((c): c is string => Boolean(c));
      const [matchCosts, matchSnaps] = await Promise.all([
        cheapestCosts(matchCanonicals),
        minVariantSnapshots(matchCanonicals),
      ]);
      const { data: supData } = await supabaseAdmin()
        .from('suppliers')
        .select('id,name,slug')
        .in('id', matches.map((m) => m.supplier_id));
      const supRows = new Map<string, { id: string; name: string; slug: string }>(
        ((supData ?? []) as { id: string; name: string; slug: string }[]).map((s) => [s.id, s]),
      );
      printers = await Promise.all(
        matches.map(async (m) => {
          const sup = supRows.get(m.supplier_id);
          const c = m.canonical_product_id;
          const { estimatedDelivery } = await printerDelivery(m.id);
          // This blank's own printer shows THIS product's base cost, not
          // the matched sibling's — the price on the card is for this blank.
          const isSelf = (sup?.slug ?? '') === (supplier.data?.slug ?? '');
          return {
            name: sup?.name ?? 'Unknown supplier',
            slug: sup?.slug ?? 'unknown',
            baseCost: isSelf
              ? (costRow?.cost ?? snapshot ?? null)
              : c
                ? (matchCosts.get(c)?.cost ?? matchSnaps.get(c) ?? null)
                : null,
            estimatedDelivery,
          };
        }),
      );
      // The blank's own printer is always on the card, even when no
      // same-type sibling exists for it.
      if (!printers.some((p) => p.slug === (supplier.data?.slug ?? ''))) {
        const { estimatedDelivery } = await printerDelivery(id);
        printers.unshift({
          name: supplier.data?.name ?? 'Unknown supplier',
          slug: supplier.data?.slug ?? 'unknown',
          baseCost: costRow?.cost ?? snapshot ?? null,
          estimatedDelivery,
        });
      }
      const { estimatedDelivery: selfDelivery } = await printerDelivery(id);
      if (selfDelivery) {
        deliveryEstimate = `≈${selfDelivery.average} ${selfDelivery.unit.replace(/_/g, ' ')}`;
      }
    } catch {
      // Printers list is additive — a failed lookup never blocks the detail.
      printers = [];
    }

    // Render state of the canonical blank — drives blockers and the
    // publish gate. Missing rows read as missing_assets (the column default).
    let renderState = 'missing_assets';
    if (canonical) {
      const { data: canon } = await supabaseAdmin()
        .from('canonical_products')
        .select('render_state')
        .eq('id', canonical)
        .maybeSingle();
      if (canon?.render_state) renderState = canon.render_state as string;
    }

    // ── Offers: every keeper row carrying the SAME canonical product ──
    // The true cross-supplier comparison for this exact product (Printify's
    // row + Printful's row when both carry it), each with its own cost,
    // variant count, delivery estimate and image. What powers the product
    // page's "Supplier Cost Comparison" box and the "2 Suppliers" badge.
    let offers: {
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
    }[] = [];
    if (canonical) {
      try {
        const keeperIdList = await keeperSupplierIds();
        const [siblingRes, costRes, snapRes] = await Promise.all([
          supabaseAdmin()
            .from('supplier_catalog_products')
            .select('id,name,brand_name,supplier_id,variant_count,image_url')
            .eq('canonical_product_id', canonical)
            .in('supplier_id', keeperIdList),
          // Per-SUPPLIER cost rows for this canonical (in-stock first).
          supabaseAdmin()
            .from('supplier_product_costs')
            .select('supplier_name,base_cost_usd,shipping_estimate_usd,is_in_stock')
            .eq('canonical_product_id', canonical),
          // Per-PRODUCT variant price fallback.
          supabaseAdmin()
            .from('supplier_catalog_variants')
            .select('supplier_catalog_product_id,price_snapshot')
            .eq('canonical_product_id', canonical)
            .not('price_snapshot', 'is', null)
            .limit(2000),
        ]);
        const costBySupplier = new Map<string, { cost: number; shipping: number | null }>();
        for (const c of costRes.data ?? []) {
          const name = String(c.supplier_name);
          const prev = costBySupplier.get(name);
          if (!prev || (c.is_in_stock && true)) {
            costBySupplier.set(name, {
              cost: Number(c.base_cost_usd),
              shipping: c.shipping_estimate_usd != null ? Number(c.shipping_estimate_usd) : null,
            });
          }
        }
        const snapByProduct = new Map<string, number>();
        for (const v of snapRes.data ?? []) {
          const pid = v.supplier_catalog_product_id as string;
          const price = Number(v.price_snapshot);
          if (!snapByProduct.has(pid) || price < (snapByProduct.get(pid) ?? Infinity)) {
            snapByProduct.set(pid, price);
          }
        }
        const sibIds = [...new Set((siblingRes.data ?? []).map((s) => s.supplier_id as string))];
        const { data: sibSups } = sibIds.length
          ? await supabaseAdmin().from('suppliers').select('id,name,slug').in('id', sibIds)
          : { data: [] as { id: string; name: string; slug: string }[] };
        const sibSupMap = new Map((sibSups ?? []).map((s) => [s.id, s]));
        offers = await Promise.all(
          (siblingRes.data ?? []).map(async (s) => {
            const sup = sibSupMap.get(s.supplier_id as string);
            const supplierName = sup?.name ?? 'Unknown supplier';
            const perSupplier = costBySupplier.get(supplierName);
            return {
              blankId: s.id as string,
              supplier: supplierName,
              supplierSlug: sup?.slug ?? 'unknown',
              name: s.name as string,
              brand: (s.brand_name as string) ?? 'Generic brand',
              cost: perSupplier?.cost ?? snapByProduct.get(s.id as string) ?? null,
              shipping: perSupplier?.shipping ?? null,
              variantCount: (s.variant_count as number) ?? 0,
              imageUrl: (s.image_url as string) ?? null,
              estimatedDeliveryDays: null,
            };
          }),
        );
        // Cheapest first — the card's "best price" is offers[0].
        offers.sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
      } catch {
        offers = [];
      }
    }

    const responseBody = {
      id: product.id,
      canonicalProductId: canonical,
      name: product.name,
      brand: product.brand_name ?? 'Generic brand',
      supplier: supplier.data?.name ?? 'Unknown supplier',
      supplierSlug: supplier.data?.slug ?? 'unknown',
      baseCost: costRow?.cost ?? snapshot ?? null,
      currency: 'USD',
      family,
      mockupThumbUrl: product.image_url,
      printAreas: [...areaByPlacement.values()],
      status: templates.length > 0 ? 'unverified' : 'skeleton_pending',
      fulfillment: 'POD',
      estShipping: formatEstShipping(product.id),
      renderState,
      views,
      variants: {
        colors: [...colors.values()],
        sizes: [...sizes].sort(),
        printAreas: [...areaByPlacement.keys()],
      },
      // Supplier catalog enrichment — the data the DB mirror doesn't carry
      // but the supplier's own product page shows. SYMMETRIC contract: each
      // keeper supplier fills the same shape from its own API (see the
      // table in the enrichment block above); what a supplier can't
      // provide stays null/empty — never invented.
      techniques,
      description,
      descriptionSource,
      providerTitle,
      shippingCost: costRow?.shipping ?? null,
      techniquePrices,
      gallery,
      printfulEnriched,
      guidelines: '',
      shippingFrom: costRow?.supplier ?? '',
      deliveryEstimate,
      printers,
      offers,
    };
    blankDetailCacheSet(id, responseBody);
    return NextResponse.json(responseBody);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load blank.');
  }
}
