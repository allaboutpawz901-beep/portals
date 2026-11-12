import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/notes?customer_id=xxx */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');

  let query = supabaseAdmin()
    .from('crm_notes')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);

  if (customerId) query = query.eq('customer_id', customerId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/** POST /api/crm/notes */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await supabaseAdmin()
    .from('crm_notes')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      customer_id: body.customer_id || null,
      body: body.body,
      note_type: body.note_type || 'general',
      is_pinned: body.is_pinned || false,
      created_by: body.created_by || null,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
