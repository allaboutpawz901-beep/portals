import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/calls?customer_id=xxx&lead_id=xxx — call log. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  const leadId = searchParams.get('lead_id');
  let query = supabaseAdmin().from('crm_calls').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('started_at', { ascending: false });
  if (customerId) query = query.eq('customer_id', customerId);
  if (leadId) query = query.eq('lead_id', leadId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/calls. Required: direction, started_at. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    direction: String(body.direction || 'outbound'),
    from_number: body.from_number || null,
    to_number: body.to_number || null,
    customer_id: body.customer_id || null,
    lead_id: body.lead_id || null,
    deal_id: body.deal_id || null,
    staff_id: body.staff_id || null,
    status: String(body.status || 'completed'),
    disposition: body.disposition || null,
    started_at: body.started_at || new Date().toISOString(),
    answered_at: body.answered_at || null,
    ended_at: body.ended_at || null,
    duration_seconds: Number(body.duration_seconds) || null,
    recording_url: body.recording_url || null,
    transcript: body.transcript || null,
    notes: body.notes || null,
    provider: body.provider || null,
    provider_call_id: body.provider_call_id || null,
  };
  const { data, error } = await supabaseAdmin().from('crm_calls').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
