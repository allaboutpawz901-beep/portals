import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/crm/appointments/lookups — the pickers for the appointment create
 * dialog in one call: customers, staff, services, resources.
 * Resources belong to the appointments DDL — tolerated missing (empty list)
 * until the migration is applied.
 */
export async function GET() {
  const [custRes, staffRes, svcRes, resRes] = await Promise.all([
    supabaseAdmin()
      .from('crm_customers')
      .select('id, preferred_name, first_name, last_name, company_name, email, phone')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .is('archived_at', null)
      .limit(300),
    supabaseAdmin()
      .from('crm_staff')
      .select('id, display_name, first_name, last_name, color_label, is_service_staff')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true)
      .limit(100),
    supabaseAdmin()
      .from('crm_services')
      .select('id, name, default_duration_minutes, default_price, is_active, bookable_online')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .limit(200),
    supabaseAdmin()
      .from('crm_appointment_resources')
      .select('id, name, resource_type, capacity')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true)
      .limit(100),
  ]);

  const resourceErr = resRes.error;
  const resourcesPending = !!resourceErr && /crm_appointment_resources/.test(`${resourceErr.message} ${resourceErr.details || ''}`);

  return NextResponse.json({
    customers: custRes.data || [],
    staff: staffRes.data || [],
    services: (svcRes.data || []).filter((s: { is_active: boolean | null }) => s.is_active !== false),
    resources: resRes.data || [],
    meta: { resourcesPending },
  });
}
