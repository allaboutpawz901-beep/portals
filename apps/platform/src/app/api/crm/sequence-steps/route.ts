import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/sequence-steps?sequence_id=xxx */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sequenceId = searchParams.get('sequence_id');
  let query = supabaseAdmin().from('crm_sequence_steps').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('step_no', { ascending: true });
  if (sequenceId) query = query.eq('sequence_id', sequenceId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/sequence-steps. Required: sequence_id, step_no, step_type. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.sequence_id || !body.step_type) return NextResponse.json({ error: { code: 'VALIDATION', message: 'sequence_id and step_type are required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    sequence_id: String(body.sequence_id),
    step_no: Number(body.step_no) || 1,
    delay_days: Number(body.delay_days) || 0,
    step_type: String(body.step_type),
    template_id: body.template_id || null,
    subject: body.subject || null,
    body: body.body || null,
    task_title: body.task_title || null,
  };
  const { data, error } = await supabaseAdmin().from('crm_sequence_steps').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
