import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/sequences — list email/message sequences. */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('crm_sequences').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/sequences — create a sequence. Required: name. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'name is required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    name: String(body.name),
    mailbox_id: body.mailbox_id || null,
    stop_on_reply: Boolean(body.stop_on_reply),
    send_window_start: body.send_window_start || null,
    send_window_end: body.send_window_end || null,
    timezone: String(body.timezone || 'America/Chicago'),
    weekdays_only: Boolean(body.weekdays_only ?? true),
    is_active: true,
    purpose: body.purpose || null,
  };
  const { data, error } = await supabaseAdmin().from('crm_sequences').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
