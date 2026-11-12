import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const STATUSES = new Set(['open', 'resolved']);

/**
 * PATCH /api/sellers/violations/[id] — open / resolve a violation
 * (stamps updated_at).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const status = body?.status;

  if (typeof status !== 'string' || !STATUSES.has(status)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: "status must be 'open' or 'resolved'", requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin()
    .from('seller_violations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `No violation with id ${id}`, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
