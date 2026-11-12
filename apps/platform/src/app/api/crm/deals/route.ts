import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/deals?customer_id=xxx&lead_id=xxx&pipeline_id=xxx
 *  Deals in the sales pipeline, optionally scoped to a customer, lead, or pipeline. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  const leadId = searchParams.get('lead_id');
  const pipelineId = searchParams.get('pipeline_id');
  let query = supabaseAdmin()
    .from('crm_deals')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(200);
  if (customerId) query = query.eq('customer_id', customerId);
  if (leadId) query = query.eq('lead_id', leadId);
  if (pipelineId) query = query.eq('pipeline_id', pipelineId);
  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data });
}

/** POST /api/crm/deals — create a deal.
 *  Required: name, pipeline_id, stage_id, amount.
 *  Status defaults to 'open', currency defaults to 'USD',
 *  stage_entered_at defaults to now(). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  // NOT NULL fields: name, pipeline_id, stage_id, status, amount, currency
  if (!body.name) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'name is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.pipeline_id) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'pipeline_id is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.stage_id) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'stage_id is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    deal_number: body.deal_number || `DEAL-${Date.now()}`,
    name: String(body.name),
    pipeline_id: String(body.pipeline_id),
    stage_id: String(body.stage_id),
    status: String(body.status || 'open'),
    customer_id: body.customer_id || null,
    lead_id: body.lead_id || null,
    owner_staff_id: body.owner_staff_id || null,
    amount: Number(body.amount) || 0,
    currency: String(body.currency || 'USD'),
    probability: Number(body.probability) || 0,
    expected_close_date: body.expected_close_date || null,
    source: body.source || null,
    notes: body.notes || null,
    stage_entered_at: new Date().toISOString(),
    created_by: body.created_by || null,
  };
  const { data, error } = await supabaseAdmin()
    .from('crm_deals')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data }, { status: 201 });
}
