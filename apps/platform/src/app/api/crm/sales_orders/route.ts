import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/sales_orders?customer_id=xxx — sales orders for a customer. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  let query = supabaseAdmin().from('sales_orders').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(100);
  if (customerId) query = query.eq('customer_id', customerId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/sales_orders. Required: customer_id. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.customer_id) return NextResponse.json({ error: { code: 'VALIDATION', message: 'customer_id is required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    number: body.number || `SO-${Date.now()}`,
    customer_id: String(body.customer_id),
    issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
    expected_date: body.expected_date || null,
    status: String(body.status || 'draft'),
    currency: String(body.currency || 'USD'),
    subtotal: Number(body.subtotal) || 0,
    tax_total: Number(body.tax_total) || 0,
    total: Number(body.total) || 0,
    notes: body.notes || null,
  };
  const { data, error } = await supabaseAdmin().from('sales_orders').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
