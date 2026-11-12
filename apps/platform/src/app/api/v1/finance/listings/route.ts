import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/finance/listings — the finance-global listing.
 * Reads the SAME products row + design_publications link publish writes.
 * A listing is public only when products.status = 'published' AND a
 * design_publications row exists for one of its variants. Drafts never
 * appear here. One row per published listing, with the price the user set.
 */
export async function GET() {
  try {
    const { data: products, error } = await supabaseAdmin()
      .from('products')
      .select(
        'id,name,slug,status,fulfillment_type,published_at,income_account_id,cogs_account_id,supplier_id,source_product_id',
      )
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    if (error) throw new Error(error.message);

    const productIds = (products ?? []).map((p) => p.id as string);
    const { data: variants } = await supabaseAdmin()
      .from('product_variants')
      .select('id,product_id,price,color,size,sku')
      .in('product_id', productIds.length ? productIds : ['00000000-0000-0000-0000-000000000000']);
    const variantIds = (variants ?? []).map((v) => v.id as string);
    const { data: pubs } = await supabaseAdmin()
      .from('design_publications')
      .select('product_variant_id,design_id,status,mockup_url,published_at')
      .in('product_variant_id', variantIds.length ? variantIds : ['00000000-0000-0000-0000-000000000000']);

    const pubByVariant = new Map(
      (pubs ?? []).map((p) => [p.product_variant_id as string, p]),
    );
    const variantsByProduct = new Map<string, typeof variants>();
    for (const v of variants ?? []) {
      const list = variantsByProduct.get(v.product_id as string) ?? [];
      list.push(v);
      variantsByProduct.set(v.product_id as string, list);
    }

    const listings: {
      productId: unknown;
      name: unknown;
      slug: unknown;
      status: unknown;
      fulfillmentType: unknown;
      publishedAt: unknown;
      designId: unknown;
      mockupUrl: unknown;
      price: unknown;
      variantCount: number;
      incomeAccountId: unknown;
      cogsAccountId: unknown;
    }[] = [];
    for (const p of products ?? []) {
      const vs = variantsByProduct.get(p.id as string) ?? [];
      // Only listed when a publication link exists for at least one variant.
      const linked = vs.filter((v) => pubByVariant.has(v.id as string));
      if (linked.length === 0) continue;
      const pub = pubByVariant.get(linked[0].id as string)!;
      listings.push({
        productId: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        fulfillmentType: p.fulfillment_type,
        publishedAt: p.published_at,
        designId: pub.design_id,
        mockupUrl: pub.mockup_url,
        price: linked[0].price,
        variantCount: linked.length,
        incomeAccountId: p.income_account_id,
        cogsAccountId: p.cogs_account_id,
      });
    }
    return NextResponse.json({ listings });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load finance listings.');
  }
}
