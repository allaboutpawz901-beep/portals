import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/sellers/[id] — full seller dossier by seller_id. The profile may
 * be null (seller exists only in enforcement data); violations, appeals and
 * posts are returned regardless.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const [profileRes, violationsRes, appealsRes, postsRes] = await Promise.all([
    sb.from('seller_self_serve_profiles')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('seller_id', id)
      .maybeSingle(),
    sb.from('seller_violations')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('seller_id', id)
      .order('created_at', { ascending: false }),
    sb.from('seller_appeals')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('seller_id', id)
      .order('created_at', { ascending: false }),
    sb.from('seller_social_posts')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('seller_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (profileRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: profileRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  if (violationsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: violationsRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  if (appealsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: appealsRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  if (postsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: postsRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      profile: profileRes.data ?? null,
      violations: violationsRes.data || [],
      appeals: appealsRes.data || [],
      posts: postsRes.data || [],
    },
  });
}

/** Profile fields a PATCH may touch — everything else is rejected. */
const PATCHABLE = new Set([
  'legal_name', 'display_name', 'applicant_type', 'tax_form_status',
  'tax_form_prompted_at', 'tax_form_received_at', 'tax_form_ticket_ref',
  'completion_ticket_ref', 'recorded_earnings', 'case_id',
  'payout_name_match', 'shipping_template', 'warehouse', 'return_address',
  'categories', 'owners', 'stripe_account_id', 'user_id',
]);

/** Real CHECK vocabularies (probed against Supabase). */
const TAX_FORM_STATUSES = new Set(['received', 'not_required']);

/**
 * PATCH /api/sellers/[id] — update the profile for this seller_id.
 * applicant_type accepts the friendly aliases ('individual'/'business') and
 * maps them to the table's vocabulary. Setting tax_form_status='received'
 * stamps tax_form_received_at when the caller didn't supply one.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'JSON body required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (PATCHABLE.has(k) && v !== undefined) updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'No updatable profile fields provided', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // friendly → real applicant_type vocabulary
  if (updates.applicant_type === 'individual') updates.applicant_type = 'individual_seller';
  if (updates.applicant_type === 'business') updates.applicant_type = 'business_seller';
  if (updates.tax_form_status !== undefined && !TAX_FORM_STATUSES.has(String(updates.tax_form_status))) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `tax_form_status must be one of: ${[...TAX_FORM_STATUSES].join(', ')}`, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  updates.updated_at = new Date().toISOString();
  if (updates.tax_form_status === 'received' && !updates.tax_form_received_at) {
    updates.tax_form_received_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin()
    .from('seller_self_serve_profiles')
    .update(updates)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('seller_id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `No seller profile for seller_id ${id} — this seller exists only in enforcement data`, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}
