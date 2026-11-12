import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/inventory — the live inventory list.
 * Rows come from products + product_variants (the real stock: stock_quantity,
 * in_stock, reorder_level). trackInventory is true for stocked products;
 * POD products (fulfillment_type = 'POD') are trackInventory = false and
 * are flagged madeOnDemand — they carry no stock row, no on-hand number,
 * and the screen hides Adjust stock / Cycle count for them.
 */
export async function GET() {
  try {
    const { data: products, error } = await supabaseAdmin()
      .from('products')
      .select('id,name,slug,status,fulfillment_type,supplier_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('name');
    if (error) throw new Error(error.message);
    const productIds = (products ?? []).map((p) => p.id as string);
    const { data: variants } = await supabaseAdmin()
      .from('product_variants')
      .select('id,product_id,sku,size,color,price,stock_quantity,in_stock,reorder_level,is_active')
      .in('product_id', productIds.length ? productIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('is_active', true);

    const byProduct = new Map<string, { id: string; name: string; fulfillment_type: string | null; status: string }>();
    for (const p of products ?? []) byProduct.set(p.id as string, p as { id: string; name: string; fulfillment_type: string | null; status: string });
    const rows = (variants ?? []).map((v) => {
      const p = byProduct.get(v.product_id as string);
      const isPod = p?.fulfillment_type === 'POD';
      return {
        variantId: v.id,
        productId: v.product_id,
        product: p?.name ?? 'Unknown product',
        sku: v.sku ?? '',
        size: v.size,
        color: v.color,
        price: v.price,
        fulfillmentType: p?.fulfillment_type ?? 'Stock',
        trackInventory: !isPod,
        madeOnDemand: isPod,
        // No on-hand number for POD — null, never 0-as-stock.
        onHand: isPod ? null : (v.stock_quantity ?? 0),
        inStock: isPod ? null : Boolean(v.in_stock),
        reorderPoint: isPod ? null : (v.reorder_level ?? 0),
        status: p?.status ?? 'draft',
      };
    });
    return NextResponse.json({
      rows,
      counts: {
        total: rows.length,
        tracked: rows.filter((r) => r.trackInventory).length,
        madeOnDemand: rows.filter((r) => r.madeOnDemand).length,
      },
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load inventory.');
  }
}
