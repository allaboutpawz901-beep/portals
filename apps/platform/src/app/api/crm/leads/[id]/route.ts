import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { id: _id, tenant_id: _tid, created_at: _ca, ...updates } = body;
  updates.updated_at = new Date().toISOString();

  // If status is 'converted', set conversion_date and create a customer
  if (updates.status === 'converted' && !updates.conversion_date) {
    updates.conversion_date = new Date().toISOString();
  }

  const { data: lead, error } = await supabaseAdmin()
    .from('crm_leads')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // If converted and no customer_id yet, create a customer from the lead
  if (lead.status === 'converted' && !lead.customer_id) {
    const [first, ...rest] = (lead.contact_name || '').split(' ');
    const { data: newCustomer, error: custError } = await supabaseAdmin()
      .from('crm_customers')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        first_name: first || null,
        last_name: rest.join(' ') || null,
        email: lead.email,
        phone: lead.phone,
        country: 'US',
        customer_type: 'Retail',
        lifecycle_stage: 'new_customer',
        lifecycle_status: 'active',
        lead_status: 'converted',
        first_contact_at: lead.first_contact_at,
        is_active: true,
      })
      .select('*')
      .single();

    if (custError) {
      console.error('[crm/leads/convert] customer insert error:', custError);
      return NextResponse.json({
        data: lead,
        conversion_error: { message: custError.message, code: custError.code, details: custError.details },
      });
    }

    if (newCustomer) {
      await supabaseAdmin()
        .from('crm_leads')
        .update({ customer_id: newCustomer.id })
        .eq('id', id);
      return NextResponse.json({ data: { ...lead, customer_id: newCustomer.id }, converted_customer: newCustomer });
    }
  }

  return NextResponse.json({ data: lead });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin()
    .from('crm_leads')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data: { id, deleted: true } });
}
