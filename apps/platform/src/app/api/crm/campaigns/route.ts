import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/campaigns — list campaigns. */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('crm_campaigns').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/campaigns — create a campaign. Required: name, campaign_type, channel. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'name is required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    name: String(body.name),
    campaign_type: String(body.campaign_type || 'email'),
    status: String(body.status || 'draft'),
    channel: String(body.channel || 'email'),
    template_id: body.template_id || null,
    segment_definition: body.segment_definition || null,
    scheduled_at: body.scheduled_at || null,
    created_by: body.created_by || null,
  };
  const { data, error } = await supabaseAdmin().from('crm_campaigns').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
