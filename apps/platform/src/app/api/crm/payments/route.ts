import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/crm/payments?customer_id=xxx
 * Returns payment_transactions for a customer, newest first.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');

  let query = supabaseAdmin()
    .from('payment_transactions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);

  if (customerId) query = query.eq('customer_id', customerId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data });
}

/**
 * POST /api/crm/payments
 * Records a payment — cash, check, card, Stripe (online), bank transfer, etc.
 * Links to an optional invoice_id; the caller marks the invoice Paid in the
 * client store. The row persists in payment_transactions so it flows into
 * accounting (deposit matching, AR aging, bank rec).
 *
 * Body: {
 *   customer_id, amount, provider, transaction_type?, status?, invoice_id?,
 *   deposit_account_id?, ar_account_id?, reference?, memo?, processed_at?
 * }
 *
 * `provider` = the payment method: 'cash' | 'check' | 'card' | 'stripe' |
 *              'bank_transfer' | 'ach' | 'paypal' | 'other'
 * `status`   = 'settled' (funds in bank / cash in hand) | 'pending' (Stripe
 *              not yet released) | 'failed'. Default: 'settled' — the common
 *              case when recording a payment you already received.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  const customerId = body.customer_id as string | undefined;
  const amount = Number(body.amount);
  const provider = body.provider as string | undefined;

  if (!customerId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'customer_id is required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  if (!amount || amount <= 0) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'amount must be > 0', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  if (!provider) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'provider (payment method) is required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  // provider_transaction_id = check #, Stripe charge ID, etc.
  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    customer_id: customerId,
    invoice_id: body.invoice_id || null,
    order_id: body.order_id || null,
    provider,
    provider_transaction_id: body.reference || null,
    transaction_type: body.transaction_type || 'payment',
    status: body.status || 'settled',
    amount,
    currency: body.currency || 'USD',
    deposit_account_id: body.deposit_account_id || null,
    ar_account_id: body.ar_account_id || null,
    metadata: body.memo ? { memo: body.memo } : {},
    processed_at: body.processed_at || new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin()
    .from('payment_transactions')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }

  return NextResponse.json({ data }, { status: 201 });
}
