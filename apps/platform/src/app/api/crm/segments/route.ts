import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/segments */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('crm_segments')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  // For each segment, get member count
  const withCounts = await Promise.all((data || []).map(async (seg) => {
    const { count } = await supabaseAdmin()
      .from('crm_segment_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('segment_id', seg.id);
    return { ...seg, member_count: count || 0 };
  }));

  return NextResponse.json({ data: withCounts });
}

/** POST /api/crm/segments */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await supabaseAdmin()
    .from('crm_segments')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      name: body.name,
      description: body.description || null,
      segment_type: body.segment_type || 'static',
      entity_type: body.entity_type || 'customer',
      definition: body.definition || {},
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
