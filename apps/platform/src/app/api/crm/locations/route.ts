import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/locations — list business locations. */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('crm_locations').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name', { ascending: true });
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/locations. Required: name, country, timezone. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'name is required', requestId: crypto.randomUUID() } }, { status: 400 });
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    name: String(body.name),
    code: String(body.code || body.name.slice(0, 3).toUpperCase()),
    address_line1: body.address_line1 || '',
    address_line2: body.address_line2 || null,
    city: body.city || '',
    state: body.state || '',
    postal_code: body.postal_code || '',
    country: String(body.country || 'US'),
    phone: body.phone || null,
    email: body.email || null,
    timezone: String(body.timezone || 'America/Chicago'),
    is_active: true,
  };
  const { data, error } = await supabaseAdmin().from('crm_locations').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
