import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/customers/[id] — single customer with related data */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: customer, error } = await supabaseAdmin()
    .from('crm_customers')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: error.message, requestId: crypto.randomUUID() } }, { status: 404 });
  }

  // Fetch related: notes, tasks, activity, segment memberships
  const [notesRes, tasksRes, activityRes, segmentsRes] = await Promise.all([
    supabaseAdmin().from('crm_notes').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(20),
    supabaseAdmin().from('crm_tasks').select('*').eq('customer_id', id).order('due_at', { ascending: true }).limit(20),
    supabaseAdmin().from('crm_activity').select('*').eq('customer_id', id).order('created_at', { ascending: false }).limit(20),
    supabaseAdmin().from('crm_segment_memberships').select('segment_id, segment:crm_segments(name, segment_type)').eq('customer_id', id),
  ]);

  return NextResponse.json({
    data: {
      ...customer,
      notes: notesRes.data || [],
      tasks: tasksRes.data || [],
      activity: activityRes.data || [],
      segments: (segmentsRes.data || []).map((s: any) => s.segment?.name).filter(Boolean),
    },
  });
}

/** PATCH /api/crm/customers/[id] — partial update */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  // Strip fields we don't allow updating directly
  const { id: _id, tenant_id: _tid, created_at: _ca, ...updates } = body;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from('crm_customers')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }

  return NextResponse.json({ data, warnings: [] });
}

/** DELETE /api/crm/customers/[id] — soft archive (sets archived_at) */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { error } = await supabaseAdmin()
    .from('crm_customers')
    .update({ archived_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  return NextResponse.json({ data: { id, archived: true } });
}
