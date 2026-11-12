import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/leads — pipeline list */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const q = searchParams.get('q')?.trim();

  let query = supabaseAdmin()
    .from('crm_leads')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }
  if (q) {
    query = query.or(`contact_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  return NextResponse.json({ data, meta: { total: data.length } });
}

/** POST /api/crm/leads — create lead */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    contact_name: body.contact_name || null,
    email: body.email || null,
    phone: body.phone || null,
    lead_source: body.lead_source || 'manual',
    lead_type: body.lead_type || 'retail',
    status: body.status || 'new',
    notes: body.notes || null,
    first_contact_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin()
    .from('crm_leads')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
