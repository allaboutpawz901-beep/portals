import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * PATCH /api/variants/[id] — edit a single variant.
 * Powers inline price/status/stock edits on the ProductProfile Variants and
 * Pricing tabs.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const sb = supabaseAdmin();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.sku !== undefined) updates.sku = String(body.sku).trim();
  if (body.size !== undefined) updates.size = body.size;
  if (body.color !== undefined) updates.color = body.color;
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (Number.isNaN(price) || price < 0) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'price must be ≥ 0' } }, { status: 400 });
    }
    updates.price = price;
  }
  if (body.compare_at_price !== undefined) {
    updates.compare_at_price = body.compare_at_price === null || body.compare_at_price === ''
      ? null
      : Number(body.compare_at_price);
  }
  if (body.is_active !== undefined) updates.is_active = !!body.is_active;
  if (body.status !== undefined) {
    const allowed = ['active', 'inactive', 'discontinued'];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: `status must be one of ${allowed.join(', ')}` } }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (body.stock_quantity !== undefined) {
    updates.stock_quantity = body.stock_quantity === null || body.stock_quantity === ''
      ? null
      : Number(body.stock_quantity);
  }
  if (body.in_stock !== undefined) updates.in_stock = !!body.in_stock;
  if (body.reorder_level !== undefined) {
    updates.reorder_level = body.reorder_level === null || body.reorder_level === ''
      ? null
      : Number(body.reorder_level);
  }

  const { data, error } = await sb
    .from('product_variants')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
  return NextResponse.json({ data });
}
