import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/sellers/feed — every seller_social_post, newest first, with the
 * seller display name joined in JS. Posts FK to the canonical `sellers` table;
 * the self-serve profile supplies the preferred name when it exists. Posts
 * for sellers without a profile get seller_name: null and the UI labels them
 * "from enforcement data".
 */
export async function GET() {
  const sb = supabaseAdmin();

  const [postsRes, profilesRes, sellersRes] = await Promise.all([
    sb.from('seller_social_posts')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false }),
    sb.from('seller_self_serve_profiles')
      .select('seller_id, display_name, legal_name')
      .eq('tenant_id', DEFAULT_TENANT_ID),
    sb.from('sellers')
      .select('id, display_name, legal_name')
      .eq('tenant_id', DEFAULT_TENANT_ID),
  ]);

  if (postsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: postsRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  if (profilesRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: profilesRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  if (sellersRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: sellersRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  const profileBySeller = new Map((profilesRes.data || []).map(p => [p.seller_id, p]));
  const sellerById = new Map((sellersRes.data || []).map(s => [s.id, s]));
  const data = (postsRes.data || []).map(p => {
    const profile = profileBySeller.get(p.seller_id);
    const seller = sellerById.get(p.seller_id);
    return {
      ...p,
      seller_name: (profile ? (profile.display_name || profile.legal_name) : null)
        || (seller ? (seller.display_name || seller.legal_name) : null),
      seller_has_profile: !!profile,
    };
  });

  return NextResponse.json({ data });
}

const NETWORKS = new Set(['instagram', 'facebook', 'tiktok', 'x']);

/** POST /api/sellers/feed — publish a post for a seller (payload { title, note }). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const sellerId = typeof body?.seller_id === 'string' ? body.seller_id.trim() : '';
  const network = typeof body?.network === 'string' ? body.network.trim().toLowerCase() : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const note = typeof body?.note === 'string' ? body.note : '';

  if (!sellerId || !network || !title) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'seller_id, network and title are required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  if (!NETWORKS.has(network)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: `network must be one of: ${[...NETWORKS].join(', ')}`, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin()
    .from('seller_social_posts')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      seller_id: sellerId,
      network,
      payload: { title, note },
      // The table's status CHECK constraint only admits 'published'
      // (probed against the real DB — 'posted' is rejected).
      status: 'published',
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }
  return NextResponse.json({ data }, { status: 201 });
}

/**
 * DELETE /api/sellers/feed?id=<postId> — remove a post from the feed
 * (takedown / cleanup). The id travels as a query param so this stays on the
 * one feed route file.
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || '';
  if (!id) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'id query param is required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin()
    .from('seller_social_posts')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `No post with id ${id}`, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data: { id, deleted: true } });
}
