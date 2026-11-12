import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * POST /api/products/[id]/variants — add a variant to a product.
 * Powers the "New variant" action on the ProductProfile Variants tab.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const sb = supabaseAdmin();

  // The product must exist
  const { data: product } = await sb
    .from('products').select('id,name').eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
  if (!product) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Product not found' } }, { status: 404 });

  const price = Number(body.price);
  if (body.price === undefined || body.price === null || Number.isNaN(price) || price < 0) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'price is required (≥ 0)' } }, { status: 400 });
  }

  // SKU: use the provided one, else derive from product name + size/color
  let sku = String(body.sku || '').trim();
  if (!sku) {
    const base = String(product.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 18) || 'variant';
    const suffix = [body.size, body.color].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 10) || 'std';
    const { data: existing } = await sb.from('product_variants')
      .select('sku').eq('tenant_id', DEFAULT_TENANT_ID).like('sku', `${base}-${suffix}%`);
    const taken = new Set((existing || []).map((r: any) => r.sku));
    sku = `${base}-${suffix}`;
    let n = 2;
    while (taken.has(sku)) sku = `${base}-${suffix}-${n++}`;
  } else {
    const { data: dupe } = await sb.from('product_variants')
      .select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('sku', sku).maybeSingle();
    if (dupe) return NextResponse.json({ error: { code: 'VALIDATION', message: `SKU "${sku}" already exists` } }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    // product_variants.id has no DB default — generate here.
    id: crypto.randomUUID(),
    tenant_id: DEFAULT_TENANT_ID,
    product_id: id,
    sku,
    size: body.size ? String(body.size) : null,
    color: body.color ? String(body.color) : null,
    price,
    compare_at_price: body.compare_at_price != null ? Number(body.compare_at_price) : null,
    is_active: body.is_active !== false,
    status: body.status || 'active',
    stock_quantity: body.stock_quantity != null ? Number(body.stock_quantity) : null,
    in_stock: body.in_stock != null ? !!body.in_stock : undefined,
  };
  if (insert.in_stock === undefined) delete insert.in_stock;

  const { data, error } = await sb.from('product_variants').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
  return NextResponse.json({ data });
}
