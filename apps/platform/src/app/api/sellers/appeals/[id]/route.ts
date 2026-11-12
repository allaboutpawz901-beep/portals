import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const DECIDABLE = new Set(['granted', 'denied', 'pending']);

/**
 * PATCH /api/sellers/appeals/[id] — decide (or revert) an appeal.
 *
 *   { status: 'granted' | 'denied', decision?, decided_by? }
 *     → stamps decision (defaults to the status), decided_at = now.
 *     → when granted, the linked violation is also resolved.
 *
 *   { status: 'pending' }  (revert)
 *     → clears decision / decided_by / decided_at (null). The linked
 *       violation is intentionally left untouched — un-resolving enforcement
 *       records is an explicit act, not a side effect of a queue revert.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const status = body?.status;

  if (typeof status !== 'string' || !DECIDABLE.has(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: "status must be 'granted', 'denied' or 'pending'", requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'pending') {
    updates.decision = null;
    updates.decided_by = null;
    updates.decided_at = null;
  } else {
    updates.decision = typeof body?.decision === 'string' && body.decision.trim() ? body.decision.trim() : status;
    updates.decided_by = typeof body?.decided_by === 'string' && body.decided_by.trim() ? body.decided_by.trim() : null;
    updates.decided_at = new Date().toISOString();
  }

  const { data: appeal, error } = await supabaseAdmin()
    .from('seller_appeals')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!appeal) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `No appeal with id ${id}`, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  // Granted appeal → the linked violation is resolved.
  if (status === 'granted' && appeal.violation_id) {
    const { error: vError } = await supabaseAdmin()
      .from('seller_violations')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .eq('id', appeal.violation_id)
      .eq('tenant_id', DEFAULT_TENANT_ID);
    if (vError) {
      // The appeal itself was decided; report the violation miss without
      // failing the whole request.
      return NextResponse.json({ data: appeal, warning: { code: 'VIOLATION_UPDATE_FAILED', message: vError.message } });
    }
  }

  return NextResponse.json({ data: appeal });
}
