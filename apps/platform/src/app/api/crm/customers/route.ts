import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/crm/customers
 * Query params: q (search), status, segment_id, lead_status, limit, cursor
 * Returns the customer list with computed balance/LTV from the row.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const status = searchParams.get('status');
  const lifecycleStage = searchParams.get('lifecycle_stage');
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

  let query = supabaseAdmin()
    .from('crm_customers')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%,phone.ilike.%${q}%`);
  }
  if (status && status !== 'all') {
    query = query.eq('lifecycle_status', status);
  }
  if (lifecycleStage && lifecycleStage !== 'all') {
    query = query.eq('lifecycle_stage', lifecycleStage);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  // Compute summary stats for KPI strip
  const total = data.length;
  const activeCount = data.filter(c => c.lifecycle_status === 'active').length;
  const openAR = data.reduce((s, c) => s + (Number(c.outstanding_balance) || 0), 0);
  const lifetimeValue = data.reduce((s, c) => s + (Number(c.lifetime_value) || 0), 0);

  return NextResponse.json({
    data,
    meta: {
      total,
      summary: { active: activeCount, open_ar: openAR, lifetime_value: lifetimeValue },
    },
  });
}

/**
 * POST /api/crm/customers
 * Creates a new customer. Required: at least first_name or company_name + email.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    customer_type: body.customer_type || 'Retail',
    lifecycle_stage: body.lifecycle_stage || 'lead',
    lifecycle_status: body.lifecycle_status || 'active',
    first_name: body.first_name || null,
    last_name: body.last_name || null,
    company_name: body.company_name || null,
    email: body.email || null,
    phone: body.phone || null,
    mobile_phone: body.mobile_phone || null,
    address_line1: body.address_line1 || null,
    city: body.city || null,
    state: body.state || null,
    postal_code: body.postal_code || null,
    country: body.country || 'US',
    lead_status: body.lead_status || 'new',
    outstanding_balance: body.outstanding_balance || 0,
    lifetime_value: body.lifetime_value || 0,
    is_active: true,
    marketing_email_opt_in: body.marketing_email_opt_in ?? true,
    transactional_email_opt_in: body.transactional_email_opt_in ?? true,
  };

  const { data, error } = await supabaseAdmin()
    .from('crm_customers')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, fields: { detail: error.details }, requestId: crypto.randomUUID() } }, { status: 400 });
  }

  return NextResponse.json({ data, warnings: [] }, { status: 201 });
}
