import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/staff — active staff for assignment pickers */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('crm_staff')
    .select('id, display_name, role, email')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('display_name', { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}
