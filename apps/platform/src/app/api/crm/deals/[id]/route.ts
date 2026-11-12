import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** PATCH /api/crm/deals/[id] — update a deal (move stage, change amount, etc.). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // Whitelist fields that can be updated on a deal.
  for (const f of ['name','stage_id','status','amount','probability','expected_close_date','source','lost_reason','won_at','lost_at','owner_staff_id','notes','customer_id','lead_id']) {
    if (f in body) updates[f] = body[f];
  }
  // If stage changed, update stage_entered_at.
  if ('stage_id' in body) updates.stage_entered_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin()
    .from('crm_deals')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Deal not found', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  return NextResponse.json({ data });
}

/** DELETE /api/crm/deals/[id] — remove a deal. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin()
    .from('crm_deals')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data: { id, deleted: true } });
}
