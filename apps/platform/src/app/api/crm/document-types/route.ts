import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/document-types — list document types. */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('crm_document_types').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name', { ascending: true });
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/document-types. Required: name, category. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'name is required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    name: String(body.name),
    category: String(body.category || 'general'),
    required_for_booking: Boolean(body.required_for_booking),
    requires_signature: Boolean(body.requires_signature),
    expiration_days: Number(body.expiration_days) || null,
    is_active: true,
    body_template: body.body_template || null,
    body_format: body.body_format || null,
    version: 1,
  };
  const { data, error } = await supabaseAdmin().from('crm_document_types').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
