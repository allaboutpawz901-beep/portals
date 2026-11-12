import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/crm/payment-links?invoice_id=xxx — list links for an invoice.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const invoiceId = searchParams.get('invoice_id');
  let query = supabaseAdmin()
    .from('acct_payment_links')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(50);
  if (invoiceId) query = query.eq('invoice_id', invoiceId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/**
 * POST /api/crm/payment-links
 * Generates a shareable payment link row in acct_payment_links.
 * Body: { invoice_id?, entity_id?, kind?, amount?, title?, description? }
 *
 * The link URL is /pay/{public_token} — a hosted payment page the
 * customer visits to pay via Stripe (or whatever provider is wired).
 * The public_token is a random UUID; the URL is built from the
 * request origin so it's immediately copyable.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const publicToken = crypto.randomUUID();
  const amount = body.amount != null ? Number(body.amount) : null;

  // The store uses synthetic IDs like "DOC-1001" for documents and "P-1001"
  // for parties — not UUIDs. The acct_payment_links table has UUID FKs on
  // entity_id and invoice_id (entity_id is NOT NULL). When the caller
  // passes a non-UUID store ID, generate a placeholder UUID so the row
  // can be created. The public_token is the real shareable key; the
  // entity_id/invoice_id are for linking when real UUIDs exist.
  const isUuid = (v: unknown): v is string =>
    typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

  const safeEntityId = isUuid(body.entity_id) ? body.entity_id
    : isUuid(body.invoice_id) ? body.invoice_id
    : crypto.randomUUID(); // placeholder — NOT NULL constraint

  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: safeEntityId,
    kind: body.kind || 'payment',
    invoice_id: isUuid(body.invoice_id) ? body.invoice_id : null,
    title: body.title || 'Payment Request',
    description: body.description || null,
    amount,
    currency: 'USD',
    public_token: publicToken,
    provider: 'stripe',
    status: 'active',
    created_by: body.created_by || null,
  };

  const { data, error } = await supabaseAdmin()
    .from('acct_payment_links')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  // Build the shareable URL from the request origin.
  const origin = new URL(req.url).origin;
  const url = `${origin}/pay/${publicToken}`;

  return NextResponse.json({ data, url }, { status: 201 });
}
