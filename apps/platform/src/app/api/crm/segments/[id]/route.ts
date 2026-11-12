import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/crm/segments/[id]
 * Segment + its ACTIVE members (exited_at IS NULL) joined with crm_customers.
 * Two queries (memberships, then customers `.in('id', ids)`) merged in JS —
 * avoids cross-table join quirks and keeps the response tenant-scoped.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: segment, error } = await supabaseAdmin()
    .from('crm_segments')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();

  if (error || !segment) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: error?.message || 'Segment not found', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  // Active memberships only — exited rows don't count as members.
  const { data: memberships, error: mErr } = await supabaseAdmin()
    .from('crm_segment_memberships')
    .select('id, customer_id, entered_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('segment_id', id)
    .is('exited_at', null)
    .order('entered_at', { ascending: false });

  if (mErr) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: mErr.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }

  const ids = (memberships || []).map(m => m.customer_id).filter(Boolean);
  const customers: { id: string; first_name: string | null; last_name: string | null; company_name: string | null; email: string | null }[] = [];

  if (ids.length > 0) {
    const { data: custs, error: cErr } = await supabaseAdmin()
      .from('crm_customers')
      .select('id, first_name, last_name, company_name, email')
      .in('id', ids);
    if (cErr) {
      return NextResponse.json(
        { error: { code: 'INTERNAL', message: cErr.message, requestId: crypto.randomUUID() } },
        { status: 500 },
      );
    }
    customers.push(...(custs || []));
  }

  const byId = new Map(customers.map(c => [c.id, c]));
  const members = (memberships || [])
    .map(m => {
      const c = byId.get(m.customer_id);
      if (!c) return null; // membership pointing at a deleted customer — skip
      return {
        membership_id: m.id,
        customer_id: m.customer_id,
        entered_at: m.entered_at,
        first_name: c.first_name,
        last_name: c.last_name,
        company_name: c.company_name,
        email: c.email,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  return NextResponse.json({ data: { ...segment, members } });
}

/**
 * PATCH /api/crm/segments/[id]
 * Updates ONLY the provided fields among name / description / segment_type /
 * is_active (whitelisted — never trusts arbitrary body keys). Returns the row.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const updates: Partial<{ name: string; description: string | null; segment_type: string; is_active: boolean }> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Name is required', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    updates.name = name;
  }
  if (body.description !== undefined) {
    updates.description = body.description === null || body.description === '' ? null : String(body.description);
  }
  if (body.segment_type !== undefined) {
    const segmentType = String(body.segment_type).trim();
    if (!segmentType) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'segment_type cannot be empty', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    updates.segment_type = segmentType;
  }
  if (body.is_active !== undefined) {
    updates.is_active = !!body.is_active;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'No updatable fields provided (name, description, segment_type, is_active)', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin()
    .from('crm_segments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

/**
 * DELETE /api/crm/segments/[id]
 * Deletes the segment's memberships first, then the segment itself.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { error: mErr } = await supabaseAdmin()
    .from('crm_segment_memberships')
    .delete()
    .eq('segment_id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  if (mErr) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: mErr.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }

  const { error } = await supabaseAdmin()
    .from('crm_segments')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: { id } });
}
