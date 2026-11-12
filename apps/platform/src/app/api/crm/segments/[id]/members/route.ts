import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * POST /api/crm/segments/[id]/members — body { customer_id }
 * Adds a customer to the segment (new active membership, entered_at = now).
 * Idempotent: if an active membership already exists it is returned as-is,
 * so double-clicks and races can't create duplicates.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const customerId = body?.customer_id;

  if (!customerId || typeof customerId !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'customer_id is required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  // Segment must exist in this tenant.
  const { data: segment, error: segErr } = await supabaseAdmin()
    .from('crm_segments')
    .select('id, name')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();

  if (segErr || !segment) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: segErr?.message || 'Segment not found', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  // Already an active member? Return the existing membership (no duplicate).
  const { data: existing } = await supabaseAdmin()
    .from('crm_segment_memberships')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('segment_id', id)
    .eq('customer_id', customerId)
    .is('exited_at', null)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ data: existing }, { status: 201 });
  }

  const { data, error } = await supabaseAdmin()
    .from('crm_segment_memberships')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      segment_id: id,
      customer_id: customerId,
      entered_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data }, { status: 201 });
}

/**
 * DELETE /api/crm/segments/[id]/members — body { customer_id }
 * Soft exit: stamps exited_at = now on the ACTIVE membership.
 * The row is kept for history; the customer stops counting as a member.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const customerId = body?.customer_id;

  if (!customerId || typeof customerId !== 'string') {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'customer_id is required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from('crm_segment_memberships')
    .update({ exited_at: now })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('segment_id', id)
    .eq('customer_id', customerId)
    .is('exited_at', null)
    .select('id');

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }

  // data.length === 0 means the customer wasn't an active member — still a
  // success from the UI's point of view (the end state is what it wanted).
  return NextResponse.json({ data: { segment_id: id, customer_id: customerId, exited_at: now, updated: data?.length || 0 } });
}
