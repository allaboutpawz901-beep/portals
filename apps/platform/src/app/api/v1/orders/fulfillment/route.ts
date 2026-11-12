import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';
import { podLinesForOrder } from '@/lib/fulfillment';

/**
 * GET /api/v1/orders/fulfillment — the dropship / POD fulfillment queue.
 * (a) Existing fulfillment_orders (the Fulfillment POs), with their order
 *     + supplier + status + cost.
 * (b) POD orders that still need a PO: their lines resolved to the chosen
 *     route (priority 1) + print-file status. A line with no route is
 *     listed with routeId null — reported, never guessed.
 */
export async function GET() {
  try {
    const { data: pos, error } = await supabaseAdmin()
      .from('fulfillment_orders')
      .select('id,order_id,supplier_id,route_id,supplier_order_external_id,status,tracking_number,cost,created_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const orderIds = [...new Set((pos ?? []).map((p) => p.order_id as string))];
    const { data: orders } = await supabaseAdmin()
      .from('orders')
      .select('id,status,total,created_at,customer_id')
      .in('id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000']);
    const orderById = new Map((orders ?? []).map((o) => [o.id as string, o]));
    const customerIds = [
      ...new Set((orders ?? []).map((o) => o.customer_id as string).filter(Boolean)),
    ];
    const { data: customers } = await supabaseAdmin()
      .from('customers')
      .select('id,firstName,lastName')
      .in('id', customerIds.length ? customerIds : ['00000000-0000-0000-0000-000000000000']);
    const customerName = (customerId: string | null): string | null => {
      if (!customerId) return null;
      const c = (customers ?? []).find((x) => (x.id as string) === customerId);
      if (!c) return null;
      return `${(c.firstName as string) ?? ''} ${(c.lastName as string) ?? ''}`.trim() || null;
    };
    const supplierIds = [...new Set((pos ?? []).map((p) => p.supplier_id as string).filter(Boolean))];
    const { data: suppliers } = await supabaseAdmin()
      .from('suppliers')
      .select('id,name,slug')
      .in('id', supplierIds.length ? supplierIds : ['00000000-0000-0000-0000-000000000000']);
    const supById = new Map((suppliers ?? []).map((s) => [s.id as string, s]));

    const purchaseOrders = (pos ?? []).map((p) => ({
      id: p.id,
      orderId: p.order_id,
      orderStatus: (orderById.get(p.order_id as string)?.status as string) ?? null,
      orderTotal: (orderById.get(p.order_id as string)?.total as number | null) ?? null,
      customerName: customerName((orderById.get(p.order_id as string)?.customer_id as string | null) ?? null),
      supplierId: p.supplier_id,
      supplierName: supById.get(p.supplier_id as string)?.name ?? null,
      supplierSlug: supById.get(p.supplier_id as string)?.slug ?? null,
      routeId: p.route_id,
      externalId: p.supplier_order_external_id,
      status: p.status,
      trackingNumber: p.tracking_number,
      cost: p.cost,
      createdAt: p.created_at,
    }));

    // POD orders missing a PO: scan recent orders for POD lines.
    const { data: recentOrders } = await supabaseAdmin()
      .from('orders')
      .select('id,status,total,created_at,customer_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(50);
    const poOrderIds = new Set(orderIds);
    const needsPo: {
      orderId: string;
      orderStatus: string | null;
      orderTotal: number | null;
      customerName: string | null;
      lines: Awaited<ReturnType<typeof podLinesForOrder>>;
    }[] = [];
    for (const o of recentOrders ?? []) {
      if (poOrderIds.has(o.id as string)) continue;
      const lines = await podLinesForOrder(o.id as string);
      if (lines.length > 0) {
        needsPo.push({
          orderId: o.id as string,
          orderStatus: o.status as string | null,
          orderTotal: o.total as number | null,
          customerName: customerName((o.customer_id as string | null) ?? null),
          lines,
        });
      }
    }

    return NextResponse.json({ purchaseOrders, needsPo });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load fulfillment queue.');
  }
}
