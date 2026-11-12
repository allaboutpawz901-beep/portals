import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/orders — Create Order (A6). Takes the prefilled envelope
 * from a published product: { productVariantId, designPublicationId?,
 * quantity?, customerEmail? }. The unit price is the variant's set price
 * (the price the user published), never recomputed. Writes a real
 * erp_orders draft row + its order_items row, resolving the fulfillment
 * route (priority 1) for the supplier_catalog_variant_id.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      productVariantId?: string;
      designPublicationId?: string;
      quantity?: number;
      customerEmail?: string;
    };
    if (!body.productVariantId) {
      return apiError('productVariantId is required.', 422);
    }
    const quantity = Math.max(1, Math.floor(body.quantity ?? 1));
    const { data: variant, error: vErr } = await supabaseAdmin()
      .from('product_variants')
      .select('id,product_id,price,color,size,sku')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', body.productVariantId)
      .single();
    if (vErr || !variant) {
      return apiError(`No variant ${body.productVariantId}.`, 404);
    }
    const unitPrice = variant.price as number;
    const total = Math.round(unitPrice * quantity * 100) / 100;

    // Fulfillment route: chosen supplier priority 1 for this variant.
    const { data: routes } = await supabaseAdmin()
      .from('variant_fulfillment_routes')
      .select('supplier_catalog_variant_id,supplier_id,priority,cost_snapshot,lead_time_days')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('product_variant_id', body.productVariantId)
      .order('priority', { ascending: true })
      .limit(1);
    const route = routes?.[0];

    const orderNumber = `POD-${Date.now().toString(36).toUpperCase()}`;
    const { data: order, error: oErr } = await supabaseAdmin()
      .from('erp_orders')
      .insert({
        id: randomUUID(),
        tenant_id: DEFAULT_TENANT_ID,
        order_number: orderNumber,
        status: 'draft',
        fulfillment_method: 'POD',
        currency: 'USD',
        subtotal: total,
        total,
        customer_email: body.customerEmail ?? null,
        notes: `POD order from published variant ${variant.sku ?? variant.id}`,
      })
      .select('id,order_number,status,total')
      .single();
    if (oErr || !order) {
      return apiError(`Order insert failed: ${oErr?.message ?? 'unknown'}.`);
    }
    const { data: item, error: iErr } = await supabaseAdmin()
      .from('order_items')
      .insert({
        id: randomUUID(),
        order_id: order.id,
        tenant_id: DEFAULT_TENANT_ID,
        product_variant_id: body.productVariantId,
        design_publication_id: body.designPublicationId ?? null,
        supplier_catalog_variant_id: route?.supplier_catalog_variant_id ?? null,
        quantity,
        unit_price: unitPrice,
      })
      .select('id')
      .single();
    if (iErr || !item) {
      return apiError(`Order item insert failed: ${iErr?.message ?? 'unknown'}.`);
    }
    return NextResponse.json(
      {
        orderId: order.id,
        orderNumber: order.order_number,
        status: order.status,
        total: order.total,
        fulfillmentRoute: route
          ? {
              supplierCatalogVariantId: route.supplier_catalog_variant_id,
              costSnapshot: route.cost_snapshot,
              leadTimeDays: route.lead_time_days,
            }
          : null,
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to create order.');
  }
}
