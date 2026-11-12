import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/dependents?customer_id=xxx — dependents for a customer. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  let query = supabaseAdmin().from('crm_dependents').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name', { ascending: true });
  if (customerId) query = query.eq('primary_customer_id', customerId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/dependents. Required: primary_customer_id, name. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.primary_customer_id || !body.name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'primary_customer_id and name are required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    primary_customer_id: String(body.primary_customer_id),
    dependent_type: String(body.dependent_type || 'child'),
    name: String(body.name),
    date_of_birth: body.date_of_birth || null,
    attributes: body.attributes || null,
    notes: body.notes || null,
    photo_url: body.photo_url || null,
    is_active: true,
  };
  const { data, error } = await supabaseAdmin().from('crm_dependents').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
