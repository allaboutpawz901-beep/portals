import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/stats — KPI strip for CRM Overview */
export async function GET() {
  const [customersRes, leadsRes, segmentsRes, notesRes, tasksRes, tagsRes] = await Promise.all([
    supabaseAdmin().from('crm_customers').select('id, lifecycle_status, outstanding_balance, lifetime_value, total_visits, last_activity_at, archived_at').eq('tenant_id', DEFAULT_TENANT_ID),
    supabaseAdmin().from('crm_leads').select('id, status, lead_source').eq('tenant_id', DEFAULT_TENANT_ID),
    supabaseAdmin().from('crm_segments').select('id, is_active').eq('tenant_id', DEFAULT_TENANT_ID),
    supabaseAdmin().from('crm_notes').select('id').eq('tenant_id', DEFAULT_TENANT_ID),
    supabaseAdmin().from('crm_tasks').select('id, status').eq('tenant_id', DEFAULT_TENANT_ID),
    supabaseAdmin().from('crm_tags').select('id').eq('tenant_id', DEFAULT_TENANT_ID),
  ]);

  const customers = customersRes.data || [];
  const leads = leadsRes.data || [];
  const tasks = tasksRes.data || [];

  const activeCustomers = customers.filter(c => c.lifecycle_status === 'active' && !c.archived_at);
  const openAR = activeCustomers.reduce((s, c) => s + (Number(c.outstanding_balance) || 0), 0);
  const lifetimeValue = activeCustomers.reduce((s, c) => s + (Number(c.lifetime_value) || 0), 0);
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString();
  const atRisk = activeCustomers.filter(c => {
    if (!c.last_activity_at) return true;
    return c.last_activity_at < thirtyDaysAgo;
  }).length;
  const openLeads = leads.filter(l => l.status === 'new' || l.status === 'contacted' || l.status === 'qualified').length;
  const openTasks = tasks.filter(t => t.status === 'open' || t.status === 'in_progress').length;

  return NextResponse.json({
    data: {
      total_customers: customers.filter(c => !c.archived_at).length,
      active_customers: activeCustomers.length,
      total_leads: leads.length,
      open_leads: openLeads,
      total_segments: (segmentsRes.data || []).filter(s => s.is_active).length,
      total_notes: notesRes.data?.length || 0,
      open_tasks: openTasks,
      total_tags: tagsRes.data?.length || 0,
      open_ar: openAR,
      lifetime_value: lifetimeValue,
      at_risk: atRisk,
    },
  });
}
