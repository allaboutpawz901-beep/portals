import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/blanks/:id/orders — the Orders tab on the product page.
 * Real orders for this blank, resolved through the LIVE join path
 * (verified Nov 8 — the doc's path does not resolve: `products` has no
 * `canonical_product_id` column and `source_product_id` is NULL on every
 * row): order_items.supplier_catalog_variant_id →
 * supplier_catalog_variants.canonical_product_id; the order itself from
 * erp_orders (order_items.order_id). Returns [] when the blank has no
 * orders — never invented rows.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: product, error } = await supabaseAdmin()
      .from('supplier_catalog_products')
      .select('canonical_product_id')
      .eq('id', id)
      .single();
    if (error || !product?.canonical_product_id) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No blank ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const canonical = product.canonical_product_id as string;
    const { data: variants } = await supabaseAdmin()
      .from('supplier_catalog_variants')
      .select('id')
      .eq('canonical_product_id', canonical);
    const variantIds = (variants ?? []).map((v) => v.id as string);
    if (variantIds.length === 0) return NextResponse.json({ orders: [] });
    const { data: items } = await supabaseAdmin()
      .from('order_items')
      .select('id,order_id,product_variant_id,quantity,unit_price')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('supplier_catalog_variant_id', variantIds)
      .limit(100);
    const rows = items ?? [];
    if (rows.length === 0) return NextResponse.json({ orders: [] });
    const orderIds = [...new Set(rows.map((r) => r.order_id as string))];
    // All 32 live order_items point at `orders` (0 point at erp_orders).
    // `orders` has no order_number column — the id is the display key.
    const { data: orders } = await supabaseAdmin()
      .from('orders')
      .select('id,status,total,created_at')
      .in('id', orderIds);
    const byId = new Map((orders ?? []).map((o) => [o.id as string, o]));
    return NextResponse.json({
      orders: rows
        .map((r) => {
          const o = byId.get(r.order_id as string) as
            | { status?: string; total?: number; created_at?: string }
            | undefined;
          return {
            id: r.id,
            orderId: r.order_id,
            orderNumber: null,
            status: o?.status ?? null,
            quantity: r.quantity,
            unitPrice: r.unit_price,
            orderTotal: o?.total ?? null,
            createdAt: o?.created_at ?? null,
          };
        })
        // order_items has no date column — newest first by the order date.
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load orders.');
  }
}
