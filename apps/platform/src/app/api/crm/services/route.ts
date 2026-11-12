import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/services — list bookable services. */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('crm_services').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name', { ascending: true });
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/services. Required: name, default_duration_minutes, default_price. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'name is required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    name: String(body.name),
    code: String(body.code || body.name.slice(0, 5).toUpperCase()),
    description: body.description || null,
    category: String(body.category || 'general'),
    service_category: String(body.service_category || 'general'),
    default_duration_minutes: Number(body.default_duration_minutes) || 30,
    default_price: Number(body.default_price) || 0,
    deposit_required: Boolean(body.deposit_required),
    default_deposit_amount: Number(body.default_deposit_amount) || 0,
    is_active: true,
    is_add_on: Boolean(body.is_add_on),
    parent_service_id: body.parent_service_id || null,
    bookable_online: Boolean(body.bookable_online ?? true),
    image_url: body.image_url || null,
  };
  const { data, error } = await supabaseAdmin().from('crm_services').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
