import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/items — the Global Catalog listing rows (A8).
 * Reads the live `products` rows created by publish. ?status= filters
 * (e.g. published). Status comes from the row, never from local state —
 * a reload keeps the listing. Each item carries its supplier name, its
 * lowest variant price (the user's set price), and the design ids linked
 * through design_publications.
 */
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const status = params.get('status');
    const q = params.get('q')?.trim() || undefined;
    const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1), 100);
    let query = supabaseAdmin()
      .from('products')
      .select('id,name,slug,status,fulfillment_type,supplier_id,source_product_id,brand,created_at,published_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status) query = query.eq('status', status);
    if (q) query = query.ilike('name', `%${q}%`);
    const { data: products, error } = await query;
    if (error) throw new Error(`products: ${error.message}`);
    const rows = products ?? [];
    if (rows.length === 0) return NextResponse.json({ items: [], nextCursor: null });

    const productIds = rows.map((r) => r.id as string);
    const [{ data: variants }, { data: suppliers }] = await Promise.all([
      supabaseAdmin()
        .from('product_variants')
        .select('id,product_id,price,color,size,sku')
        .in('product_id', productIds),
      supabaseAdmin().from('suppliers').select('id,name,slug'),
    ]);
    const supplierMap = new Map((suppliers ?? []).map((s) => [s.id as string, s as { id: string; name: string; slug: string }]));
    const variantIds = (variants ?? []).map((v) => v.id as string);
    const [{ data: pubs }, { data: routes }] = await Promise.all([
      variantIds.length > 0
        ? supabaseAdmin()
            .from('design_publications')
            .select('design_id,product_variant_id,status,mockup_url')
            .in('product_variant_id', variantIds)
        : Promise.resolve({ data: [] as never[] }),
      variantIds.length > 0
        ? supabaseAdmin()
            .from('variant_fulfillment_routes')
            .select('product_variant_id,supplier_id,priority,cost_snapshot,lead_time_days,is_active')
            .in('product_variant_id', variantIds)
            .eq('is_active', true)
            .order('priority', { ascending: true })
        : Promise.resolve({ data: [] as never[] }),
    ]);
    const routesByVariant = new Map<string, { supplier: string; supplierSlug: string; priority: number; costSnapshot: number | null; leadTimeDays: number | null }[]>();
    for (const rt of routes ?? []) {
      const sup = rt.supplier_id ? supplierMap.get(rt.supplier_id as string) : undefined;
      const list = routesByVariant.get(rt.product_variant_id as string) ?? [];
      list.push({
        supplier: sup?.name ?? 'Unknown supplier',
        supplierSlug: sup?.slug ?? 'unknown',
        priority: rt.priority as number,
        costSnapshot: rt.cost_snapshot as number | null,
        leadTimeDays: rt.lead_time_days as number | null,
      });
      routesByVariant.set(rt.product_variant_id as string, list);
    }

    const variantsByProduct = new Map<string, { id: string; price: number; color: string | null; size: string | null; sku: string | null; routes: { supplier: string; supplierSlug: string; priority: number; costSnapshot: number | null; leadTimeDays: number | null }[] }[]>();
    for (const v of variants ?? []) {
      const list = variantsByProduct.get(v.product_id as string) ?? [];
      list.push({
        id: v.id as string,
        price: v.price as number,
        color: v.color as string | null,
        size: v.size as string | null,
        sku: v.sku as string | null,
        routes: routesByVariant.get(v.id as string) ?? [],
      });
      variantsByProduct.set(v.product_id as string, list);
    }
    const designsByProduct = new Map<string, { designId: string; status: string; mockupUrl: string | null }[]>();
    const variantToProduct = new Map((variants ?? []).map((v) => [v.id as string, v.product_id as string]));
    for (const p of pubs ?? []) {
      const pid = variantToProduct.get(p.product_variant_id as string);
      if (!pid) continue;
      const list = designsByProduct.get(pid) ?? [];
      list.push({ designId: p.design_id as string, status: p.status as string, mockupUrl: p.mockup_url as string | null });
      designsByProduct.set(pid, list);
    }

    return NextResponse.json({
      items: rows.map((r) => {
        const sup = r.supplier_id ? supplierMap.get(r.supplier_id as string) : undefined;
        const vs = variantsByProduct.get(r.id as string) ?? [];
        const prices = vs.map((v) => v.price).filter((p) => typeof p === 'number');
        return {
          id: r.id,
          name: r.name,
          slug: r.slug,
          status: r.status,
          fulfillmentType: r.fulfillment_type,
          supplier: sup?.name ?? null,
          supplierSlug: sup?.slug ?? null,
          sourceProductId: r.source_product_id,
          brand: r.brand,
          price: prices.length > 0 ? Math.min(...prices) : null,
          variantCount: vs.length,
          colors: [...new Set(vs.map((v) => v.color).filter(Boolean))],
          sizes: [...new Set(vs.map((v) => v.size).filter(Boolean))],
          variants: vs,
          designs: designsByProduct.get(r.id as string) ?? [],
          createdAt: r.created_at,
          publishedAt: r.published_at,
        };
      }),
      nextCursor: null,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list items.');
  }
}
