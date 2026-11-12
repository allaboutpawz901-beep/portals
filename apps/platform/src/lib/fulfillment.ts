import { supabaseAdmin, DEFAULT_TENANT_ID } from './supabaseAdmin';

/**
 * POD order-line resolution (D4). One order line for a POD product resolves
 * to its fulfillment route (variant_fulfillment_routes, chosen supplier
 * priority 1) and its print file (the kind='print' render from
 * design_renders, succeeded). A line with no route or no print file is
 * reported, never guessed.
 */

export interface PodOrderLine {
  orderItemId: string;
  orderId: string;
  productVariantId: string | null;
  designId: string | null;
  designPublicationId: string | null;
  quantity: number;
  unitPrice: number | null;
  routeId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  costSnapshot: number | null;
  leadTimeDays: number | null;
  printStoragePath: string | null;
  printStatus: 'ready' | 'pending' | 'missing';
}

export async function podLinesForOrder(orderId: string): Promise<PodOrderLine[]> {
  const { data: items, error } = await supabaseAdmin()
    .from('order_items')
    .select('id,product_variant_id,design_publication_id,quantity,unit_price')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('order_id', orderId);
  if (error) throw new Error(`order_items: ${error.message}`);
  const lines: PodOrderLine[] = [];
  for (const item of items ?? []) {
    const variantId = item.product_variant_id as string | null;
    if (!variantId) continue;
    const { data: variant } = await supabaseAdmin()
      .from('product_variants')
      .select('product_id')
      .eq('id', variantId)
      .single();
    if (!variant) continue;
    const { data: product } = await supabaseAdmin()
      .from('products')
      .select('fulfillment_type')
      .eq('id', variant.product_id as string)
      .single();
    if (product?.fulfillment_type !== 'POD') continue;

    // Design via the publication link on the order line.
    let designId: string | null = null;
    const pubId = item.design_publication_id as string | null;
    if (pubId) {
      const { data: pub } = await supabaseAdmin()
        .from('design_publications')
        .select('design_id')
        .eq('id', pubId)
        .single();
      designId = (pub?.design_id as string | null) ?? null;
    }

    // Chosen route: priority 1, active.
    const { data: routes } = await supabaseAdmin()
      .from('variant_fulfillment_routes')
      .select('id,supplier_id,cost_snapshot,lead_time_days')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('product_variant_id', variantId)
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .limit(1);
    const route = routes?.[0];
    let supplierName: string | null = null;
    if (route?.supplier_id) {
      const { data: sup } = await supabaseAdmin()
        .from('suppliers')
        .select('name')
        .eq('id', route.supplier_id as string)
        .single();
      supplierName = (sup?.name as string | null) ?? null;
    }

    // Print file: the succeeded kind='print' render for the design.
    let printStoragePath: string | null = null;
    let printStatus: PodOrderLine['printStatus'] = 'missing';
    if (designId) {
      const { data: renders } = await supabaseAdmin()
        .from('design_renders')
        .select('storage_path,status')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('design_id', designId)
        .eq('kind', 'print')
        .order('created_at', { ascending: false })
        .limit(1);
      const render = renders?.[0];
      if (render?.status === 'succeeded' && render.storage_path) {
        printStoragePath = render.storage_path as string;
        printStatus = 'ready';
      } else if (render) {
        printStatus = 'pending';
      }
    }

    lines.push({
      orderItemId: item.id as string,
      orderId,
      productVariantId: variantId,
      designId,
      designPublicationId: pubId,
      quantity: (item.quantity as number) ?? 1,
      unitPrice: (item.unit_price as number | null) ?? null,
      routeId: (route?.id as string | null) ?? null,
      supplierId: (route?.supplier_id as string | null) ?? null,
      supplierName,
      costSnapshot: (route?.cost_snapshot as number | null) ?? null,
      leadTimeDays: (route?.lead_time_days as number | null) ?? null,
      printStoragePath,
      printStatus,
    });
  }
  return lines;
}
