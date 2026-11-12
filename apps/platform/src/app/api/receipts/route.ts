import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/receipts?customer_id=xxx */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  let query = supabaseAdmin()
    .from('receipts')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (customerId) query = query.eq('customer_id', customerId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/receipts — records a sales receipt (POS / instant payment). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    number: body.number || `SR-${Date.now()}`,
    customer_id: body.customer_id,
    receipt_date: body.receipt_date || new Date().toISOString().slice(0, 10),
    kind: body.kind || 'sale',
    amount: Number(body.amount) || 0,
    currency: body.currency || 'USD',
    method: body.method || 'cash',
    deposit_account_id: body.deposit_account_id || null,
    revenue_account_id: body.revenue_account_id || null,
    notes: body.notes || null,
  };
  const { data, error } = await supabaseAdmin().from('receipts').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
