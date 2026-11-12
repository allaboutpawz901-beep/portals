import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/waitlist?customer_id=xxx — waitlist entries. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  let query = supabaseAdmin().from('crm_waitlist').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false });
  if (customerId) query = query.eq('customer_id', customerId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/waitlist. Required: customer_id, service_id, requested_start_at, requested_end_at. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.customer_id || !body.service_id) return NextResponse.json({ error: { code: 'VALIDATION', message: 'customer_id and service_id are required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    customer_id: String(body.customer_id),
    dependent_id: body.dependent_id || null,
    service_id: String(body.service_id),
    location_id: body.location_id || null,
    preferred_staff_id: body.preferred_staff_id || null,
    requested_start_at: body.requested_start_at || new Date().toISOString(),
    requested_end_at: body.requested_end_at || null,
    priority: String(body.priority || 'normal'),
    status: String(body.status || 'waiting'),
    expires_at: body.expires_at || null,
    notes: body.notes || null,
  };
  const { data, error } = await supabaseAdmin().from('crm_waitlist').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
