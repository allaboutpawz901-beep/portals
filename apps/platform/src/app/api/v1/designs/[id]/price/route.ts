import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import {
  apiError,
  cheapestCosts,
  minVariantSnapshots,
  printerDelivery,
} from '@/lib/podServer';

/**
 * GET /api/v1/designs/:id/price — what the card shows before publish:
 *   cost                 — the base price flowing in from the printer (USD)
 *   printer              — who's providing it (name + slug)
 *   estimatedDelivery    — the printer's production time (live, or null)
 *   suggestedRetailPrice — cost × 1.55 + shipping, a SUGGESTION only.
 * The user sets their own price on the card before publishing; the
 * database never dictates it and publish stores exactly the price the
 * user sends, never a recomputed one.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: design, error } = await supabaseAdmin()
      .from('designs')
      .select('id,supplier_catalog_product_id,retail_price')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .single();
    if (error || !design) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No design ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const productId = design.supplier_catalog_product_id as string | null;
    if (!productId) {
      return NextResponse.json(
        { error: { code: 'NO_COST', message: 'Design has no blank attached.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const { data: product, error: prodErr } = await supabaseAdmin()
      .from('supplier_catalog_products')
      .select('canonical_product_id')
      .eq('id', productId)
      .single();
    if (prodErr || !product?.canonical_product_id) {
      return NextResponse.json(
        { error: { code: 'NO_COST', message: 'Blank has no canonical product.', requestId: crypto.randomUUID() } },
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
    // Suggestion markup from the Studio settings (tenant_settings,
    // section 'design_studio', key price_markup) — default 1.55. Still a
    // suggestion only: the user sets the price on the card.
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
    const { printer, estimatedDelivery } = await printerDelivery(productId);
    return NextResponse.json({
      cost,
      shippingTier: shipping,
      suggestedRetailPrice,
      marginAtSuggested:
        Math.round((suggestedRetailPrice - cost - shipping) * 100) / 100,
      userPrice:
        typeof design.retail_price === 'number' ? design.retail_price : null,
      printer,
      estimatedDelivery,
      currency: 'USD',
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to price design.');
  }
}
