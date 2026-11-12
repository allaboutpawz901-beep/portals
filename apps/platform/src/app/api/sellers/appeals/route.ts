import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/sellers/appeals — every appeal, newest first, with the linked
 * violation's type/severity/status joined in JS (small tables — a map lookup
 * beats a nested Supabase select and keeps the row shape flat for the UI).
 */
export async function GET() {
  const sb = supabaseAdmin();

  const [appealsRes, violationsRes] = await Promise.all([
    sb.from('seller_appeals')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false }),
    sb.from('seller_violations')
      .select('id, violation_type, severity, status')
      .eq('tenant_id', DEFAULT_TENANT_ID),
  ]);

  if (appealsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: appealsRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  if (violationsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: violationsRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  const violationById = new Map((violationsRes.data || []).map(v => [v.id, v]));
  const data = (appealsRes.data || []).map(a => {
    const v = violationById.get(a.violation_id);
    return {
      ...a,
      violation_type: v?.violation_type ?? null,
      violation_severity: v?.severity ?? null,
      violation_status: v?.status ?? null,
    };
  });

  return NextResponse.json({ data });
}
