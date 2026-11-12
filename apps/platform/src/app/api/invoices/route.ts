import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/invoices?customer_id=xxx
 * Returns invoices for a customer, newest first.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');

  let query = supabaseAdmin()
    .from('invoices')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('createdAt', { ascending: false })
    .limit(100);

  if (customerId) query = query.eq('customerId', customerId);

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
 * POST /api/invoices
 * Creates an invoice (with optional line items) in the real Supabase
 * invoices table. This is where DocumentEngine.save() persists —
 * not the client-side platformStore.
 *
 * Body: {
 *   customerId, number, status, subtotal, total, balanceDue, dueDate,
 *   notes?, currency?, items?: [{ description, quantity, unitPrice, totalPrice }]
 * }
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

  const customerId = body.customerId as string | undefined;
  if (!customerId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'customerId is required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  const subtotal = Number(body.subtotal) || 0;
  const total = Number(body.total) || subtotal;
  const amountPaid = Number(body.amount_paid) || 0;
  const balanceDue = body.balanceDue != null ? Number(body.balanceDue) : (total - amountPaid);

  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    customerId,
    bookingId: body.bookingId || null,
    number: body.number || `INV-${Date.now()}`,
    status: body.status || 'OPEN',
    subtotal,
    depositPaid: body.depositPaid || 0,
    balanceDue,
    total,
    amount_paid: amountPaid,
    currency: body.currency || 'USD',
    dueDate: body.dueDate || null,
    notes: body.notes || null,
  };

  const { data, error } = await supabaseAdmin()
    .from('invoices')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }

  // Insert line items if provided
  const items = body.items as Array<Record<string, unknown>> | undefined;
  if (items && items.length > 0 && data) {
    const itemRows = items.map((item) => ({
      tenant_id: DEFAULT_TENANT_ID,
      invoiceId: data.id,
      description: String(item.description || ''),
      quantity: Number(item.quantity) || 1,
      unitPrice: String(item.unitPrice || '0'),
      totalPrice: String(item.totalPrice || '0'),
    }));
    await supabaseAdmin().from('invoice_items').insert(itemRows);
  }

  return NextResponse.json({ data }, { status: 201 });
}
