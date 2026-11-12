import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/tasks?customer_id=xxx&status=open */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  const status = searchParams.get('status');

  let query = supabaseAdmin()
    .from('crm_tasks')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('due_at', { ascending: true })
    .limit(100);

  if (customerId) query = query.eq('customer_id', customerId);
  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/** POST /api/crm/tasks */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { data, error } = await supabaseAdmin()
    .from('crm_tasks')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      customer_id: body.customer_id || null,
      lead_id: body.lead_id || null,
      title: body.title,
      description: body.description || null,
      task_type: body.task_type || 'follow_up',
      priority: body.priority || 'medium',
      status: body.status || 'open',
      due_at: body.due_at || null,
      assigned_to: body.assigned_to || null,
      created_by: body.created_by || null,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
