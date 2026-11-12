import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/documents?customer_id=xxx — customer documents. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  let query = supabaseAdmin().from('crm_documents').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('uploaded_at', { ascending: false });
  if (customerId) query = query.eq('customer_id', customerId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/documents. Required: name, customer_id. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'name is required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    customer_id: body.customer_id || null,
    document_type_id: body.document_type_id || null,
    name: String(body.name),
    status: String(body.status || 'pending'),
    storage_path: body.storage_path || null,
    mime_type: body.mime_type || null,
    file_size_bytes: Number(body.file_size_bytes) || null,
    uploaded_by: body.uploaded_by || null,
    uploaded_at: new Date().toISOString(),
    issued_at: body.issued_at || null,
    expires_at: body.expires_at || null,
    metadata: body.metadata || null,
    order_id: body.order_id || null,
    dependent_id: body.dependent_id || null,
  };
  const { data, error } = await supabaseAdmin().from('crm_documents').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
