import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/sellers — the seller list = UNION of
 *   (a) seller_self_serve_profiles rows, and
 *   (b) distinct seller_ids that appear in seller_violations / seller_appeals
 *       but have no profile row (labeled "from enforcement data" downstream).
 *
 * Each item carries enforcement counters (open_violations, pending_appeals)
 * computed in JS from the two enforcement tables. ?q= filters on names.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  const sb = supabaseAdmin();

  const [profilesRes, violationsRes, appealsRes] = await Promise.all([
    sb.from('seller_self_serve_profiles')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false }),
    sb.from('seller_violations')
      .select('seller_id, status, created_at')
      .eq('tenant_id', DEFAULT_TENANT_ID),
    sb.from('seller_appeals')
      .select('seller_id, status, created_at')
      .eq('tenant_id', DEFAULT_TENANT_ID),
  ]);

  if (profilesRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: profilesRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  if (violationsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: violationsRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  if (appealsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: appealsRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  const profiles = profilesRes.data || [];
  const violations = violationsRes.data || [];
  const appeals = appealsRes.data || [];

  // Per-seller enforcement aggregates
  const openViolations = new Map<string, number>();
  const pendingAppeals = new Map<string, number>();
  const enforcementFirstSeen = new Map<string, string>();
  const track = (sellerId: string, createdAt: string) => {
    const prev = enforcementFirstSeen.get(sellerId);
    if (!prev || createdAt < prev) enforcementFirstSeen.set(sellerId, createdAt);
  };
  for (const v of violations) {
    if (v.status === 'open') openViolations.set(v.seller_id, (openViolations.get(v.seller_id) || 0) + 1);
    track(v.seller_id, v.created_at || '');
  }
  for (const a of appeals) {
    if (a.status === 'pending') pendingAppeals.set(a.seller_id, (pendingAppeals.get(a.seller_id) || 0) + 1);
    track(a.seller_id, a.created_at || '');
  }

  const items: SellerListItem[] = [];
  const seen = new Set<string>();

  // (a) profiled sellers
  for (const p of profiles) {
    seen.add(p.seller_id);
    items.push({
      id: p.seller_id, // additive alias of seller_id — satisfies the shared useList { id } constraint
      seller_id: p.seller_id,
      profile_id: p.id,
      display_name: p.display_name ?? null,
      legal_name: p.legal_name ?? null,
      applicant_type: p.applicant_type ?? null,
      tax_form_status: p.tax_form_status ?? null,
      recorded_earnings: p.recorded_earnings ?? null,
      created_at: p.created_at ?? null,
      open_violations: openViolations.get(p.seller_id) || 0,
      pending_appeals: pendingAppeals.get(p.seller_id) || 0,
      has_profile: true,
    });
  }

  // (b) sellers that only exist in enforcement data
  const enforcementOnly = new Set<string>([
    ...violations.map(v => v.seller_id),
    ...appeals.map(a => a.seller_id),
  ]);
  for (const sellerId of enforcementOnly) {
    if (seen.has(sellerId)) continue;
    items.push({
      id: sellerId,
      seller_id: sellerId,
      profile_id: null,
      display_name: null,
      legal_name: null,
      applicant_type: null,
      tax_form_status: null,
      recorded_earnings: null,
      created_at: enforcementFirstSeen.get(sellerId) || null,
      open_violations: openViolations.get(sellerId) || 0,
      pending_appeals: pendingAppeals.get(sellerId) || 0,
      has_profile: false,
    });
  }

  const filtered = q
    ? items.filter(i => `${i.display_name || ''} ${i.legal_name || ''}`.toLowerCase().includes(q))
    : items;

  // Profiled sellers first, then newest first
  filtered.sort((a, b) =>
    (Number(b.has_profile) - Number(a.has_profile)) ||
    (b.created_at || '').localeCompare(a.created_at || ''),
  );

  return NextResponse.json({ data: filtered });
}

/**
 * POST /api/sellers — create a seller (the fully working create flow).
 *
 * Real schema chain (probed against Supabase):
 *   1. `sellers` row — canonical seller record. NOT NULL: tenant_id,
 *      seller_type ('marketplace' — the table's only admitted value),
 *      legal_name, display_name, slug. status defaults to 'applied'
 *      (the onboarding queue state).
 *   2. `seller_self_serve_profiles` row — FK seller_id → sellers.id,
 *      user_id NOT NULL (fresh uuid = the applicant's app account),
 *      applicant_type CHECK ('individual_seller' | 'business_seller'),
 *      tax_form_status CHECK ('received' | 'not_required' — a brand-new
 *      seller is below the reporting threshold, so 'not_required').
 *
 * Friendly aliases are mapped: applicant_type 'individual' →
 * 'individual_seller', 'business' → 'business_seller'.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const legalName = typeof body?.legal_name === 'string' ? body.legal_name.trim() : '';
  if (!legalName) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'legal_name is required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  const displayName = typeof body?.display_name === 'string' && body.display_name.trim() ? body.display_name.trim() : null;
  const applicantType =
    body?.applicant_type === 'business' || body?.applicant_type === 'business_seller'
      ? 'business_seller'
      : 'individual_seller';

  const sb = supabaseAdmin();

  // 1. canonical sellers row (FK target for the profile and social posts)
  const slugBase = legalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'seller';
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 8)}`;
  const { data: sellerRow, error: sellerError } = await sb
    .from('sellers')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      seller_type: 'marketplace',
      legal_name: legalName,
      display_name: displayName || legalName,
      slug,
    })
    .select('*')
    .single();

  if (sellerError) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: sellerError.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // 2. self-serve profile row
  const { data: profile, error: profileError } = await sb
    .from('seller_self_serve_profiles')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      seller_id: sellerRow.id,
      user_id: crypto.randomUUID(),
      legal_name: legalName,
      display_name: displayName,
      applicant_type: applicantType,
      tax_form_status: 'not_required',
    })
    .select('*')
    .single();

  if (profileError) {
    // roll the canonical row back so a failed profile leaves no orphan seller
    await sb.from('sellers').delete().eq('id', sellerRow.id);
    return NextResponse.json({ error: { code: 'VALIDATION', message: profileError.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }

  return NextResponse.json({ data: profile }, { status: 201 });
}

/** Shape returned by GET /api/sellers (the client mirror lives in useSellersApi). */
interface SellerListItem {
  id: string;
  seller_id: string;
  profile_id: string | null;
  display_name: string | null;
  legal_name: string | null;
  applicant_type: string | null;
  tax_form_status: string | null;
  recorded_earnings: number | null;
  created_at: string | null;
  open_violations: number;
  pending_appeals: number;
  has_profile: boolean;
}
