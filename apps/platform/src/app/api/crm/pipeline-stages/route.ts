import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/pipeline-stages?pipeline_id=xxx — stages for a pipeline. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pipelineId = searchParams.get('pipeline_id');
  let query = supabaseAdmin().from('crm_pipeline_stages').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('sort_order', { ascending: true });
  if (pipelineId) query = query.eq('pipeline_id', pipelineId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/pipeline-stages — create a stage. Required: pipeline_id, name, sort_order. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.pipeline_id || !body.name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'pipeline_id and name are required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    pipeline_id: String(body.pipeline_id),
    name: String(body.name),
    sort_order: Number(body.sort_order) || 0,
    probability: Number(body.probability) || 0,
    stage_kind: String(body.stage_kind || 'open'),
    rotting_days: body.rotting_days || null,
  };
  const { data, error } = await supabaseAdmin().from('crm_pipeline_stages').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
