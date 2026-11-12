import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';
import { podLinesForOrder } from '@/lib/fulfillment';

/**
 * POST /api/v1/orders/:id/fulfillment-po — create the Fulfillment PO(s)
 * for an order, automatically, linked to the order.
 * One fulfillment_orders row per POD line's chosen route (priority 1).
 * Idempotent: a line that already has a PO for its route is skipped, not
 * duplicated. The print file (kind='print' render) is referenced on the
 * order line (design_file_snapshot_url) when it is ready; a line whose
 * print is not ready is reported, not blocked — the PO is created with
 * the route + cost and the print link follows when the render succeeds.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orderId } = await params;
  try {
    const { data: order, error } = await supabaseAdmin()
      .from('orders')
      .select('id,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', orderId)
      .single();
    if (error || !order) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No order ${orderId}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const lines = await podLinesForOrder(orderId);
    if (lines.length === 0) {
      return NextResponse.json({
        orderId,
        created: [],
        skipped: [],
        unroutable: [],
        message: 'No POD lines on this order — nothing to fulfill.',
      });
    }
    const created: Record<string, unknown>[] = [];
    const skipped: string[] = [];
    const unroutable: string[] = [];
    for (const line of lines) {
      if (!line.routeId || !line.supplierId) {
        unroutable.push(line.orderItemId);
        continue;
      }
      const { data: existing } = await supabaseAdmin()
        .from('fulfillment_orders')
        .select('id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('order_id', orderId)
        .eq('route_id', line.routeId)
        .maybeSingle();
      if (existing) {
        skipped.push(line.orderItemId);
        continue;
      }
      const { data: po, error: poErr } = await supabaseAdmin()
        .from('fulfillment_orders')
        .insert({
          id: randomUUID(),
          tenant_id: DEFAULT_TENANT_ID,
          order_id: orderId,
          supplier_id: line.supplierId,
          route_id: line.routeId,
          status: 'pending',
          cost: line.costSnapshot,
        })
        .select('id,order_id,supplier_id,route_id,status,cost,created_at')
        .single();
      if (poErr || !po) {
        return apiError(`Fulfillment PO insert failed: ${poErr?.message ?? 'unknown'}.`);
      }
      created.push(po);
      // Reference the print file on the fulfillment line when ready.
      if (line.printStatus === 'ready' && line.printStoragePath) {
        await supabaseAdmin()
          .from('order_items')
          .update({ design_file_snapshot_url: line.printStoragePath })
          .eq('id', line.orderItemId);
      }
    }
    return NextResponse.json({ orderId, created, skipped, unroutable }, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to create fulfillment PO.');
  }
}
