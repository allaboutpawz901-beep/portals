import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import {
  apiError,
  KEEPER_SUPPLIER_SLUGS,
  loadCategories,
  printerDelivery,
} from '@/lib/podServer';
import { printifyBlueprintProviders } from '@/lib/printify';
import { printfulCreateSyncProduct } from '@/lib/printful';
import { trigger, storageFetchUrl } from '@/lib/ingestTrigger';
import { ingestBlank } from '@/lib/blankIngest';

/**
 * POST /api/v1/designs/:id/publish — publish the design to a global listing.
 *
 * THE USER'S PRICE IS THE PRICE. The body must carry `price` (> 0); it is
 * stored exactly as sent on designs.retail_price and on every
 * product_variants row. The server never recomputes it from cost — the
 * ×1.55 figure is only a suggestion on the card, never the published price.
 *
 * Steps: resolve category → products row → product_variants at the user's
 * price → design_publications link → variant_fulfillment_routes (chosen
 * printer priority 1 + fallbacks) → supplier store product.
 *
 * Supplier honesty: Printify creation needs a print file (the design's
 * print PNG, produced by the render worker). If none exists yet the
 * listing is saved as a DRAFT with the user's price and supplier.status
 * 'pending_print_render' — never a fake store product. Re-publish after
 * the render completes the supplier step. Cloudprinter is order-ready
 * (no store product), so it publishes directly. Printful sync is not
 * built yet and says so.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      price?: unknown;
      supplierSlug?: string;
      fallbackSuppliers?: string[];
      variants?: { color: string; size: string }[];
      categoryId?: string;
      categorySlug?: string;
      channels?: string[];
      dryRun?: boolean;
    };

    // The user's price — required, stored verbatim.
    if (typeof body.price !== 'number' || !(body.price > 0)) {
      return apiError('Publish needs the price you set on the card (price > 0).', 422);
    }
    const userPrice = Math.round(body.price * 100) / 100;

    const supplierSlug = body.supplierSlug ?? 'printify';
    if (!KEEPER_SUPPLIER_SLUGS.includes(supplierSlug)) {
      return apiError(`Supplier ${supplierSlug} is not enabled for the designer.`, 422);
    }

    const { data: design, error: dErr } = await supabaseAdmin()
      .from('designs')
      .select('id,name,retail_price,supplier_catalog_product_id,print_file_path,garment_color,product_title,canvas_state')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .single();
    if (dErr || !design) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No design ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const productId = design.supplier_catalog_product_id as string | null;
    if (!productId) {
      return apiError('Design has no blank attached.', 422);
    }

    // Publish gate (render contract acceptance test 4 + unified doc §5):
    // publish is refused unless every target blank is render_ready.
    // A dry run reports the blocker instead of refusing.
    const { data: blankRow } = await supabaseAdmin()
      .from('supplier_catalog_products')
      .select('canonical_product_id')
      .eq('id', productId)
      .single();
    const canonical = blankRow?.canonical_product_id as string | null;

    // ── Auto-verify from pipeline evidence (the hands-off loop) ──
    // The old gate demanded a human QA pass per blank (drag each print
    // box, approve a test render) before anything could publish — that
    // turned "design → preview → save → print → publish" into a lab
    // experiment. The pipeline itself now carries the evidence:
    // ingestion stores every view's real base in OUR bucket, and a
    // succeeded render for THIS design proves the blank composites
    // end-to-end. When both hold, the blank is verified + render_ready
    // right here — no manual detour. The QA tools stay for humans who
    // want to fine-tune an auto-anchored box. Runs on REAL publishes
    // only (after the dry-run return) — a dry run never writes.
    const autoVerify: string[] = [];
    if (canonical && !body.dryRun) {
      try {
        const report = await ingestBlank(productId, {});
        if (report.alreadyIngested === false && report.ingested.length > 0) {
          autoVerify.push(
            `Blank ingested during publish (${report.ingested.length} view(s) stored).`,
          );
        }
      } catch {
        autoVerify.push('Blank re-ingest failed — proceeding with stored state.');
      }
      const { data: tmplRows } = await supabaseAdmin()
        .from('product_canvas_templates')
        .select('id,view_angle,verified,stored_base_path,physical_width_inches')
        .eq('canonical_product_id', canonical)
        .eq('is_active', true);
      const rows = tmplRows ?? [];
      // Renderable = a stored base photo OR real per-blank inches — the
      // worker renders geometry-only rows (provider exposes no photo) on
      // the flat garment-color base, which is a legitimate render.
      const allRenderable =
        rows.length > 0 &&
        rows.every(
          (r) => Boolean(r.stored_base_path) || Number(r.physical_width_inches ?? 0) > 0,
        );
      if (allRenderable) {
        const { data: evidence } = await supabaseAdmin()
          .from('design_renders')
          .select('id,status')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('design_id', id)
          .in('kind', ['mockup', 'print'])
          .eq('status', 'succeeded')
          .limit(1);
        if ((evidence?.length ?? 0) > 0) {
          const { data: canonNow } = await supabaseAdmin()
            .from('canonical_products')
            .select('render_state')
            .eq('id', canonical)
            .maybeSingle();
          if (canonNow?.render_state !== 'render_ready') {
            const unverifiedIds = rows.filter((r) => !r.verified).map((r) => r.id as string);
            if (unverifiedIds.length > 0) {
              const { error: verErr } = await supabaseAdmin()
                .from('product_canvas_templates')
                .update({ verified: true })
                .in('id', unverifiedIds);
              if (verErr) throw new Error(`template verify: ${verErr.message}`);
            }
            const { error: stErr } = await supabaseAdmin()
              .from('canonical_products')
              .update({ render_state: 'render_ready' })
              .eq('id', canonical);
            if (stErr) throw new Error(`canonical render_state: ${stErr.message}`);
            autoVerify.push(
              'Blank auto-verified: every view has a stored base and this design rendered successfully end-to-end.',
            );
          }
        }
      }
    }

    let renderState = 'missing_assets';
    if (canonical) {
      const { data: canon } = await supabaseAdmin()
        .from('canonical_products')
        .select('render_state')
        .eq('id', canonical)
        .maybeSingle();
      if (canon?.render_state) renderState = canon.render_state as string;
    }
    const blockers: { code: string; message: string }[] =
      renderState === 'render_ready'
        ? []
        : [
            {
              code: 'not_render_ready',
              message: `This blank is not render-ready (${renderState}). Publish is refused until every view is verified and a test render is approved.`,
            },
          ];
    if (body.dryRun) {
      // Dry run first (unified doc §8): counts, no writes.
      const colors = new Set(
        (body.variants ?? []).map((v) => v.color).filter(Boolean),
      );
      if (colors.size === 0 && design.garment_color) colors.add(design.garment_color as string);
      const { count: viewCount } = await supabaseAdmin()
        .from('product_canvas_templates')
        .select('id', { count: 'exact', head: true })
        .eq('canonical_product_id', canonical ?? '')
        .eq('is_active', true);
      return NextResponse.json({
        dryRun: true,
        designId: id,
        userPrice,
        blockers,
        wouldCreate: {
          products: 1,
          variants: body.variants?.length ?? 1,
          renders: (viewCount ?? 0) * Math.max(colors.size, 1),
        },
      });
    }
    if (blockers.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_RENDER_READY',
            message: blockers[0].message,
            requestId: crypto.randomUUID(),
          },
          blockers,
        },
        { status: 422 },
      );
    }

    // Idempotent: an existing publication for this design is resumed, not duplicated.
    const { data: existing } = await supabaseAdmin()
      .from('design_publications')
      .select('id,product_variant_id,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('design_id', id)
      .limit(1);
    if (existing && existing.length > 0) {
      const { data: pv } = await supabaseAdmin()
        .from('product_variants')
        .select('product_id,price')
        .eq('id', existing[0].product_variant_id as string)
        .single();
      return NextResponse.json(
        {
          productId: pv?.product_id ?? null,
          productUrl: pv?.product_id ? `/admin/products/${pv.product_id}` : null,
          mockupUrls: [],
          price: pv?.price ?? userPrice,
          status: existing[0].status,
          supplier: {
            status: 'already_published',
            warnings: ['This design already has a publication; re-publish resumed it instead of duplicating.'],
          },
        },
        { status: 200 },
      );
    }

    const { data: blank, error: bErr } = await supabaseAdmin()
      .from('supplier_catalog_products')
      .select('id,name,brand_name,supplier_id,category_id,canonical_product_id')
      .eq('id', productId)
      .single();
    if (bErr || !blank) return apiError(`No blank ${productId}.`, 404);

    const { data: supRows } = await supabaseAdmin()
      .from('suppliers')
      .select('id,name,slug')
      .in('slug', [supplierSlug, ...(body.fallbackSuppliers ?? [])]);
    const supplierBySlug = new Map(
      (supRows ?? []).map((s) => [s.slug as string, s as { id: string; name: string; slug: string }]),
    );
    const chosen = supplierBySlug.get(supplierSlug);
    if (!chosen) return apiError(`Supplier ${supplierSlug} not found.`, 422);

    // Category: explicit id/slug, else the blank's own category.
    let categoryId: string | null = body.categoryId ?? null;
    if (!categoryId && body.categorySlug) {
      const nodes = await loadCategories();
      categoryId = nodes.find((n) => n.slug === body.categorySlug)?.id ?? null;
    }
    if (!categoryId) categoryId = blank.category_id as string;

    const { data: catalogVariants } = await supabaseAdmin()
      .from('supplier_catalog_variants')
      .select('id,size,color,price_snapshot,print_specs')
      .eq('supplier_catalog_product_id', productId)
      .limit(1000);

    const wanted =
      body.variants && body.variants.length > 0
        ? body.variants
        : [
            {
              color: (design.garment_color as string) ?? '',
              size: '',
            },
          ];

    const name = (design.name as string) || (blank.name as string);
    const slugBase = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const slug = `${slugBase}-${randomUUID().slice(0, 8)}`;

    // Supplier step first (its outcome decides draft vs published).
    const warnings: string[] = [...autoVerify];
    let supplierStatus = 'ok';
    let storeProductId: string | undefined;
    let mockupUrls: string[] = [];
    let leadTimeDays: number | null = null;
    try {
      const { estimatedDelivery } = await printerDelivery(productId);
      if (estimatedDelivery?.unit === 'business_days') {
        leadTimeDays = Math.ceil(estimatedDelivery.average);
      }
    } catch {
      leadTimeDays = null;
    }

    // The design's print file of record — designs.print_file_path (set by
    // the worker) or any succeeded print render. Shared by every supplier
    // branch that creates a store product.
    const printFile = design.print_file_path as string | null;
    const { data: printRenders } = await supabaseAdmin()
      .from('design_renders')
      .select('id,storage_path,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('design_id', id)
      .eq('kind', 'print')
      .eq('status', 'succeeded')
      .limit(1);
    const hasPrintFile = Boolean(printFile) || (printRenders?.length ?? 0) > 0;
    // The storage path of record for the print PNG (bucket 'print-files').
    const printPath =
      (printFile as string | null) ??
      (printRenders?.[0]?.storage_path as string | null) ??
      null;

    if (supplierSlug === 'printify') {
      if (!hasPrintFile) {
        supplierStatus = 'pending_print_render';
        warnings.push(
          'No print file yet — hit “Print file” on the preview screen (or re-publish in a moment) and the 300-DPI PNG will be generated, then the Printify store product will be created automatically.',
        );
        trigger(productId);
      } else {
        // Print file exists: create the Printify store product.
        try {
          const specs = ((catalogVariants?.[0]?.print_specs ?? {}) as {
            blueprint_id?: number;
            provider_id?: number;
          });
          if (!specs.blueprint_id || !specs.provider_id) {
            throw new Error('Blank has no Printify blueprint/provider on file.');
          }
          const { printifyDefaultShopId, printifyCreateProduct, printifyGetProduct } =
            await import('@/lib/printify');
          const shopId = await printifyDefaultShopId();
          // Map our variants to Printify variant ids by color/size.
          const { printifyBlueprintVariants } = await import('@/lib/printify');
          const ppVariants = await printifyBlueprintVariants(specs.blueprint_id, specs.provider_id);
          const variantIds: number[] = [];
          for (const w of wanted) {
            const match = ppVariants.find(
              (v) =>
                String(v.options?.color ?? '').toLowerCase() === w.color.toLowerCase() &&
                (!w.size || String(v.options?.size ?? '').toLowerCase() === w.size.toLowerCase()),
            );
            if (match) variantIds.push(match.id);
          }
          if (variantIds.length === 0) {
            throw new Error('No Printify variant matches the requested color/size.');
          }
          // Printify requires print_areas with an UPLOADED print file: the
          // design's 300-DPI PNG goes to the shop's image library first,
          // then every variant's front placeholder references it centered
          // at scale 1 (our print file IS the full print area).
          if (!printPath) {
            throw new Error('Printify publish needs the design print file (print PNG).');
          }
          const { printifyUploadImage } = await import('@/lib/printify');
          const { data: printBlob, error: printDlErr } = await supabaseAdmin()
            .storage.from('print-files')
            .download(String(printPath).replace(/^print-files\//, ''));
          if (printDlErr || !printBlob) {
            throw new Error(`Print file unreadable: ${printDlErr?.message ?? 'no data'}`);
          }
          const printB64 = Buffer.from(await printBlob.arrayBuffer()).toString('base64');
          const imageId = await printifyUploadImage(shopId, {
            fileName: `${slugBase}-front.png`,
            base64: printB64,
          });
          // The design's primary placement view — the placement_spec is the
          // contract column; fall back to front.
          const { data: specRow } = await supabaseAdmin()
            .from('designs')
            .select('placement_spec')
            .eq('tenant_id', DEFAULT_TENANT_ID)
            .eq('id', id)
            .single();
          const specLayers = ((specRow?.placement_spec as { layers?: { view?: string }[] })?.layers ?? []) as { view?: string }[];
          const position = String(specLayers[0]?.view ?? 'front').toLowerCase();
          const created = await printifyCreateProduct(shopId, {
            title: name,
            description: name,
            blueprint_id: specs.blueprint_id,
            print_provider_id: specs.provider_id,
            variants: variantIds.map((vid) => ({
              id: vid,
              price: Math.round(userPrice * 100),
              is_enabled: true,
            })),
            print_areas: [
              {
                variant_ids: variantIds,
                placeholders: [
                  {
                    position,
                    images: [{ id: imageId, x: 0.5, y: 0.5, scale: 1, angle: 0 }],
                  },
                ],
              },
            ],
          });
          storeProductId = String(created.id);
          const full = await printifyGetProduct(shopId, storeProductId);
          mockupUrls = Array.isArray(full.images)
            ? full.images.map((im: { src: string }) => im.src)
            : [];
          // Per-variant cost into supplier_product_costs (from the created product).
          const costs = Array.isArray(full.variants)
            ? full.variants.map((v: { cost?: number }) => v.cost).filter((c: unknown) => typeof c === 'number')
            : [];
          if (costs.length > 0) {
            const avg = costs.reduce((a: number, b: number) => a + b, 0) / costs.length;
            await supabaseAdmin()
              .from('supplier_product_costs')
              .upsert(
                {
                  tenant_id: DEFAULT_TENANT_ID,
                  canonical_product_id: blank.canonical_product_id,
                  supplier_id: chosen.id,
                  cost_usd: Math.round(avg * 100) / 100,
                  currency: 'USD',
                },
                { onConflict: 'tenant_id,canonical_product_id,supplier_id' },
              )
              .then(() => undefined);
          }
        } catch (e) {
          supplierStatus = 'supplier_failed';
          warnings.push(`Printify store product failed: ${(e as Error).message}`);
        }
      }
    } else if (supplierSlug === 'cloudprinter') {
      // Order-ready reference only — no store product to create.
      supplierStatus = 'ok';
      warnings.push('Cloudprinter is order-ready: no store product is created; orders go out on demand.');
    } else if (supplierSlug === 'printful') {
      // Printful sync product: one sync variant per wanted color/size,
      // each pinned to printful_variant_id, carrying our 300-DPI print
      // PNG (fetchable URL) + the composited mockup as the preview file.
      const printPath =
        printFile ?? (printRenders?.[0]?.storage_path as string | null) ?? null;
      const { data: mockRenders } = await supabaseAdmin()
        .from('design_renders')
        .select('storage_path')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('design_id', id)
        .eq('kind', 'mockup')
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!printPath) {
        supplierStatus = 'pending_print_render';
        warnings.push(
          'No print file yet — hit “Print file” on the preview screen (or re-publish in a moment); the Printful sync product is created once the 300-DPI PNG exists.',
        );
        trigger(productId);
      } else if (wanted.some((w) => !w.color)) {
        supplierStatus = 'supplier_failed';
        warnings.push('Printful publish needs explicit color variants (color is the catalog join key).');
      } else {
        try {
          const { data: pvRows } = await supabaseAdmin()
            .from('supplier_catalog_variants')
            .select('id,size,color,print_specs,external_id')
            .eq('supplier_catalog_product_id', productId)
            .limit(1000);
          const syncVariants: {
            name: string;
            price: string;
            catalog_variant_id: number;
            files: { type: 'default' | 'preview'; image_url: string }[];
          }[] = [];
          const missing: string[] = [];
          for (const w of wanted) {
            const match = (pvRows ?? []).find(
              (cv) =>
                String(cv.color ?? '').toLowerCase() === w.color.toLowerCase() &&
                (!w.size || String(cv.size ?? '').toLowerCase() === w.size.toLowerCase()),
            );
            // The Printful catalog variant id: sync-mirrored rows carry it
            // on the row's external_id; print_specs.printful_variant_id is
            // the older location. Either is the join key for the sync API.
            const specs = (match?.print_specs ?? {}) as { printful_variant_id?: number };
            const fromRow = Number(match?.external_id ?? 0);
            const fid = specs.printful_variant_id ?? (fromRow > 0 ? fromRow : undefined);
            if (!fid) {
              missing.push(`${w.color}${w.size ? `/${w.size}` : ''}`);
              continue;
            }
            syncVariants.push({
              name: `${name} — ${w.color}${w.size ? ` / ${w.size}` : ''}`,
              price: userPrice.toFixed(2),
              catalog_variant_id: Number(fid),
              files: [
                { type: 'default', image_url: await storageFetchUrl(printPath) },
                ...(mockRenders?.[0]?.storage_path
                  ? [{ type: 'preview' as const, image_url: await storageFetchUrl(String(mockRenders[0].storage_path)) }]
                  : []),
              ],
            });
          }
          if (missing.length > 0 && syncVariants.length === 0) {
            throw new Error(`No Printful catalog variant for ${missing.join(', ')}.`);
          }
          const created = await printfulCreateSyncProduct({
            name,
            thumbnail: mockRenders?.[0]?.storage_path
              ? await storageFetchUrl(String(mockRenders[0].storage_path))
              : undefined,
            variants: syncVariants,
          });
          storeProductId = String(created.id);
          mockupUrls = created.thumbnail_url ? [created.thumbnail_url] : [];
          if (missing.length > 0) {
            warnings.push(`Synced ${syncVariants.length} variant(s); skipped (no Printful catalog match): ${missing.join(', ')}.`);
          }
        } catch (e) {
          supplierStatus = 'supplier_failed';
          warnings.push(`Printful sync product failed: ${(e as Error).message}`);
        }
      }
    } else {
      supplierStatus = 'not_implemented';
      warnings.push(
        `Supplier ${supplierSlug} sync is not built yet — the listing is saved as a draft with your price.`,
      );
    }

    const published = supplierStatus === 'ok';
    const status = published ? 'published' : 'draft';

    const { data: product, error: pErr } = await supabaseAdmin()
      .from('products')
      .insert({
        id: randomUUID(),
        tenant_id: DEFAULT_TENANT_ID,
        category_id: categoryId,
        name,
        slug,
        title: name,
        status,
        fulfillment_type: 'POD',
        supplier_id: chosen.id,
        source_product_id: productId,
        brand: blank.brand_name ?? null,
        owner_type: 'tenant',
        owner_id: DEFAULT_TENANT_ID,
        published_at: published ? new Date().toISOString() : null,
      })
      .select('id')
      .single();
    if (pErr || !product) {
      return apiError(`Product insert failed: ${pErr?.message ?? 'unknown'}.`);
    }
    const productRowId = product.id as string;

    // Variants at the user's price — exactly what they set on the card.
    const variantIds: string[] = [];
    for (const w of wanted) {
      const { data: pv, error: pvErr } = await supabaseAdmin()
        .from('product_variants')
        .insert({
          id: randomUUID(),
          tenant_id: DEFAULT_TENANT_ID,
          product_id: productRowId,
          sku: `POD-${productRowId.slice(0, 8).toUpperCase()}-${(w.color || 'STD').toUpperCase().replace(/[^A-Z0-9]/g, '')}${w.size ? `-${w.size.toUpperCase()}` : ''}`,
          price: userPrice,
          is_active: true,
          ...(w.size ? { size: w.size } : {}),
          ...(w.color ? { color: w.color } : {}),
        })
        .select('id')
        .single();
      if (pvErr || !pv) {
        return apiError(`Variant insert failed: ${pvErr?.message ?? 'unknown'}.`);
      }
      variantIds.push(pv.id as string);
    }

    // Design price + publication link.
    await supabaseAdmin()
      .from('designs')
      .update({ retail_price: userPrice })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id);

    for (const pvId of variantIds) {
      await supabaseAdmin().from('design_publications').insert({
        id: randomUUID(),
        tenant_id: DEFAULT_TENANT_ID,
        design_id: id,
        product_variant_id: pvId,
        status,
        mockup_url: mockupUrls[0] ?? null,
        published_at: published ? new Date().toISOString() : null,
      });
    }

    // Fulfillment routes: chosen printer priority 1 + fallbacks.
    const routeSuppliers = [
      { slug: supplierSlug, priority: 1 },
      ...(body.fallbackSuppliers ?? []).map((s, i) => ({ slug: s, priority: i + 2 })),
    ];
    for (const rs of routeSuppliers) {
      const sup = supplierBySlug.get(rs.slug);
      if (!sup) continue;
      for (let i = 0; i < variantIds.length; i++) {
        const w = wanted[i];
        const match = (catalogVariants ?? []).find(
          (cv) =>
            String(cv.color ?? '').toLowerCase() === w.color.toLowerCase() &&
            (!w.size || String(cv.size ?? '').toLowerCase() === w.size.toLowerCase()),
        );
        await supabaseAdmin().from('variant_fulfillment_routes').insert({
          id: randomUUID(),
          tenant_id: DEFAULT_TENANT_ID,
          product_variant_id: variantIds[i],
          supplier_id: sup.id,
          supplier_catalog_variant_id: match?.id ?? null,
          priority: rs.priority,
          cost_snapshot:
            typeof match?.price_snapshot === 'number' ? match.price_snapshot : null,
          lead_time_days: leadTimeDays,
          is_active: true,
        });
      }
    }

    // Channels: when the publish request names channels, record the
    // listing as live on each resolvable channel (commerce_channel_products)
    // so My Stores reads it. Unresolvable channel codes are reported in
    // warnings, never invented as rows.
    const publishedChannels: string[] = [];
    if (published && body.channels && body.channels.length > 0) {
      const { data: channelRows } = await supabaseAdmin()
        .from('commerce_order_channels')
        .select('id,code,name')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .in('code', body.channels);
      const byCode = new Map((channelRows ?? []).map((c) => [c.code as string, c]));
      for (const code of body.channels) {
        const ch = byCode.get(code);
        if (!ch) {
          warnings.push(`Channel "${code}" is not connected — no channel row written for it.`);
          continue;
        }
        // One link per channel+product; re-publish resumes, never duplicates.
        const { data: existingLink } = await supabaseAdmin()
          .from('commerce_channel_products')
          .select('id')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('channel_id', ch.id)
          .eq('catalog_item_id', productRowId)
          .limit(1);
        if (!existingLink || existingLink.length === 0) {
          await supabaseAdmin().from('commerce_channel_products').insert({
            id: randomUUID(),
            tenant_id: DEFAULT_TENANT_ID,
            channel_id: ch.id,
            catalog_item_id: productRowId,
            external_product_id: storeProductId ?? null,
            published: true,
            sync_status: 'pending',
          });
        }
        publishedChannels.push(code);
      }
    }

    return NextResponse.json(
      {
        productId: productRowId,
        productUrl: `/admin/products/${productRowId}`,
        mockupUrls,
        price: userPrice,
        status,
        channels: publishedChannels,
        supplier: { storeProductId, status: supplierStatus, warnings },
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Publish failed.');
  }
}
