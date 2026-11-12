import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const updates: Record<string, unknown> = {};
  for (const f of ['name','category','required_for_booking','requires_signature','expiration_days','is_active','body_template','body_format']) {
    if (f in body) updates[f] = body[f];
  }
  const { data, error } = await supabaseAdmin().from('crm_document_types').update(updates).eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID).select('*').single();
  if (error || !data) return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Document type not found', requestId: crypto.randomUUID() } }, { status: 400 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin().from('crm_document_types').delete().eq('id', id).eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data: { id, deleted: true } });
}
