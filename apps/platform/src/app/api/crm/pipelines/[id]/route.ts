import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** PATCH /api/crm/pipelines/[id] */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of ['name','description','is_default','currency','is_active']) {
    if (f in body) updates[f] = body[f];
  }
  const { data, error } = await supabaseAdmin().from('crm_pipelines').update(updates).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).select('*').single();
  if (error || !data) return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Pipeline not found', requestId: crypto.randomUUID() } }, { status: 400 });
  return NextResponse.json({ data });
}

/** DELETE /api/crm/pipelines/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin().from('crm_pipelines').delete().eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data: { id, deleted: true } });
}
