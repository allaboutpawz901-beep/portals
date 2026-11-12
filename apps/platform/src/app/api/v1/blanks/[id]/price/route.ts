import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import {
  apiError,
  cheapestCosts,
  minVariantSnapshots,
  printerDelivery,
} from '@/lib/podServer';

/**
 * GET /api/v1/blanks/:id/price — the Pricing tab on the product page.
 * Same numbers as GET /api/v1/designs/:id/price, but for a blank with no
 * design yet: base cost flowing in from the printer, the printer, its
 * live production time, and the suggested retail (cost × markup +
 * shipping — a suggestion only; the user sets their price on the card).
 * Prices are computed on the server, never in the client.
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
    const costs = await cheapestCosts([canonical]);
    const snapshots = await minVariantSnapshots([canonical]);
    const costRow = costs.get(canonical);
    const cost = costRow?.cost ?? snapshots.get(canonical);
    if (cost === undefined) {
      return NextResponse.json(
        { error: { code: 'NO_COST', message: 'No cost on file for this blank.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const shipping = costRow?.shipping ?? 0;
    let markup = 1.55;
    try {
      const { data: settings } = await supabaseAdmin()
        .from('tenant_settings')
        .select('data')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('section', 'design_studio')
        .maybeSingle();
      const stored = (settings?.data as { price_markup?: unknown } | null)?.price_markup;
      if (typeof stored === 'number' && stored > 0) markup = stored;
    } catch {
      markup = 1.55;
    }
    const suggestedRetailPrice = Math.round((cost * markup + shipping) * 100) / 100;
    const { printer, estimatedDelivery } = await printerDelivery(id);
    return NextResponse.json({
      cost,
      shippingTier: shipping,
      suggestedRetailPrice,
      marginAtSuggested:
        Math.round((suggestedRetailPrice - cost - shipping) * 100) / 100,
      printer,
      estimatedDelivery,
      currency: 'USD',
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to price blank.');
  }
}
