import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/bills?vendor_id=xxx — AP bills for a vendor. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vendorId = searchParams.get('vendor_id');
  let query = supabaseAdmin().from('bills').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(100);
  if (vendorId) query = query.eq('vendor_id', vendorId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/bills. Required: vendor_id, issue_date. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.vendor_id) return NextResponse.json({ error: { code: 'VALIDATION', message: 'vendor_id is required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    number: body.number || `BILL-${Date.now()}`,
    vendor_id: String(body.vendor_id),
    issue_date: body.issue_date || new Date().toISOString().slice(0, 10),
    due_date: body.due_date || null,
    status: String(body.status || 'draft'),
    currency: String(body.currency || 'USD'),
    exchange_rate: Number(body.exchange_rate) || 1,
    subtotal: Number(body.subtotal) || 0,
    tax_total: Number(body.tax_total) || 0,
    total: Number(body.total) || 0,
    amount_paid: Number(body.amount_paid) || 0,
    notes: body.notes || null,
  };
  const { data, error } = await supabaseAdmin().from('bills').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
