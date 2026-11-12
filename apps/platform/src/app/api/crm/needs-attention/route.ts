import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/needs-attention — open attention flags (status != 'resolved') */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('crm_needs_attention')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .neq('status', 'resolved')
    .order('due_by', { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}
