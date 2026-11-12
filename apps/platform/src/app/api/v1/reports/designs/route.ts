import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/reports/designs — Designs & collections report (A9).
 * Aggregates real rows only: designs by status, publications by status,
 * collections (designs per collection_id), published POD products, and
 * orders per design (order_items → design_publication_id → design).
 * The screen drills from each aggregate into the underlying rows via
 * GET /api/v1/designs, GET /api/v1/items and GET /api/v1/orders.
 */
export async function GET() {
  try {
    const [
      { data: designs, error: dErr },
      { data: pubs, error: pErr },
      { data: products, error: prErr },
      { data: orderItems, error: oErr },
    ] = await Promise.all([
      supabaseAdmin()
        .from('designs')
        .select('id,name,status,collection_id,retail_price,updated_at')
        .eq('tenant_id', DEFAULT_TENANT_ID),
      supabaseAdmin()
        .from('design_publications')
        .select('id,design_id,status,product_variant_id,mockup_url,published_at')
        .eq('tenant_id', DEFAULT_TENANT_ID),
      supabaseAdmin()
        .from('products')
        .select('id,name,status,fulfillment_type')
        .eq('tenant_id', DEFAULT_TENANT_ID),
      supabaseAdmin()
        .from('order_items')
        .select('id,design_publication_id,quantity,unit_price')
        .eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    if (dErr) throw new Error(`designs: ${dErr.message}`);
    if (pErr) throw new Error(`design_publications: ${pErr.message}`);
    if (prErr) throw new Error(`products: ${prErr.message}`);
    if (oErr) throw new Error(`order_items: ${oErr.message}`);

    const countBy = (rows: { status?: string | null }[]) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.status ?? 'unknown', (m.get(r.status ?? 'unknown') ?? 0) + 1);
      return [...m.entries()].map(([status, count]) => ({ status, count }));
    };

    const collections = new Map<string, { collectionId: string; designCount: number }>();
    for (const d of designs ?? []) {
      if (!d.collection_id) continue;
      const c = collections.get(d.collection_id as string) ?? {
        collectionId: d.collection_id as string,
        designCount: 0,
      };
      c.designCount++;
      collections.set(d.collection_id as string, c);
    }

    const pubByDesign = new Map<string, typeof pubs>();
    for (const p of pubs ?? []) {
      const list = pubByDesign.get(p.design_id as string) ?? [];
      list.push(p);
      pubByDesign.set(p.design_id as string, list);
    }
    const pubIdToDesign = new Map((pubs ?? []).map((p) => [p.id as string, p.design_id as string]));
    const ordersByDesign = new Map<string, { orders: number; units: number; revenue: number }>();
    for (const oi of orderItems ?? []) {
      const designId = oi.design_publication_id ? pubIdToDesign.get(oi.design_publication_id as string) : undefined;
      if (!designId) continue;
      const agg = ordersByDesign.get(designId) ?? { orders: 0, units: 0, revenue: 0 };
      agg.orders++;
      agg.units += (oi.quantity as number) ?? 0;
      agg.revenue += ((oi.quantity as number) ?? 0) * ((oi.unit_price as number) ?? 0);
      ordersByDesign.set(designId, agg);
    }

    const designsWithOrders = (designs ?? [])
      .map((d) => ({ design: d, ...(ordersByDesign.get(d.id as string) ?? { orders: 0, units: 0, revenue: 0 }) }))
      .filter((r) => r.orders > 0)
      .sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      designsByStatus: countBy(designs ?? []),
      publicationsByStatus: countBy(pubs ?? []),
      collections: [...collections.values()],
      unfiledDesigns: (designs ?? []).filter((d) => !d.collection_id).length,
      products: {
        total: (products ?? []).length,
        published: (products ?? []).filter((p) => p.status === 'published').length,
        publishedPod: (products ?? []).filter(
          (p) => p.status === 'published' && p.fulfillment_type === 'POD',
        ).length,
      },
      designsWithOrders,
      totals: {
        designs: (designs ?? []).length,
        publications: (pubs ?? []).length,
        orderItems: (orderItems ?? []).length,
        orderRevenue: [...ordersByDesign.values()].reduce((s, a) => s + a.revenue, 0),
      },
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to build the designs report.');
  }
}
