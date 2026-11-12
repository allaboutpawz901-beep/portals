import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/v1/support/overview — real support operation metrics.
 *
 * Every number comes from support_tickets (+ crm_staff for assignee names):
 *   KPIs     — open tickets, median first response, CSAT, SLA attainment
 *   volume   — tickets created per day, last 7 days
 *   channels — share by source_channel
 *   priority — open/urgent+high tickets (real rows, real requesters)
 */
export async function GET() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  const [ticketsRes, staffRes] = await Promise.all([
    supabaseAdmin()
      .from('support_tickets')
      .select(`
        id, ticket_ref, subject, status, priority, source_channel, created_at,
        first_public_reply_at, resolution_due_at, resolved_at, closed_at, csat_score,
        requester_name, requester_email, assigned_staff_id, deleted_at, spam_flag
      `)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(2000),
    supabaseAdmin()
      .from('crm_staff')
      .select('id, display_name, first_name, last_name')
      .eq('tenant_id', DEFAULT_TENANT_ID),
  ]);

  if (ticketsRes.error) {
    return NextResponse.json({ error: ticketsRes.error.message }, { status: 400 });
  }

  const tickets = (ticketsRes.data || []) as Array<Record<string, unknown>>;
  const staff = (staffRes.data || []) as Array<{ id: string; display_name: string | null; first_name: string | null; last_name: string | null }>;
  const staffById = new Map(staff.map((s) => [s.id, s.display_name || [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Staff']));

  const OPEN = new Set(['open', 'new', 'pending', 'in_progress', 'escalated', 'on_hold']);
  const open = tickets.filter((t) => OPEN.has(String(t.status)) && !t.resolved_at && !t.closed_at);
  const resolved = tickets.filter((t) => t.resolved_at || t.closed_at || String(t.status) === 'resolved' || String(t.status) === 'closed');

  // Median first response (minutes) over tickets with a first public reply.
  const frMinutes = tickets
    .filter((t) => t.first_public_reply_at)
    .map((t) => (new Date(String(t.first_public_reply_at)).getTime() - new Date(String(t.created_at)).getTime()) / 60_000)
    .filter((m) => m >= 0)
    .sort((a, b) => a - b);
  const medianFr = frMinutes.length ? frMinutes[Math.floor(frMinutes.length / 2)] : null;
  const fmtFr = (m: number) => (m < 60 ? `${Math.round(m)}m ${Math.round((m % 1) * 60)}s` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`);

  // CSAT: average of answered scores.
  const csatVals = tickets.map((t) => Number(t.csat_score)).filter((n) => Number.isFinite(n) && n > 0);
  const csat = csatVals.length ? (csatVals.reduce((a, b) => a + b, 0) / csatVals.length) * 20 : null; // 1..5 → %

  // SLA attainment: resolutions before resolution_due_at / resolutions with a due date.
  const slaData = resolved.filter((t) => t.resolution_due_at);
  const slaMet = slaData.filter((t) => new Date(String(t.resolved_at || t.closed_at)) <= new Date(String(t.resolution_due_at))).length;
  const sla = slaData.length ? (slaMet / slaData.length) * 100 : null;

  // Volume: last 7 days by local day.
  const days: Array<{ day: string; label: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toLocaleDateString('en-CA');
    days.push({ day: key, label: d.toLocaleDateString('en-US', { weekday: 'short' }), count: 0 });
  }
  const dayIdx = new Map(days.map((d, i) => [d.day, i]));
  for (const t of tickets) {
    const key = new Date(String(t.created_at)).toLocaleDateString('en-CA');
    const i = dayIdx.get(key);
    if (i != null) days[i].count += 1;
  }

  // Channels share.
  const channelCounts = new Map<string, number>();
  for (const t of tickets) {
    const c = String(t.source_channel || 'unknown');
    channelCounts.set(c, (channelCounts.get(c) || 0) + 1);
  }
  const totalTickets = tickets.length || 1;
  const channels = [...channelCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label: label.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      count,
      pct: Math.round((count / totalTickets) * 100),
    }));

  // Priority tickets: open, ordered urgent → high → normal.
  const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const priority = open
    .sort((a, b) => (priorityRank[String(a.priority)] ?? 9) - (priorityRank[String(b.priority)] ?? 9) || new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime())
    .slice(0, 8)
    .map((t) => ({
      id: String(t.ticket_ref || t.id),
      subject: String(t.subject || '(no subject)'),
      requester: String(t.requester_name || t.requester_email || '—'),
      priority: String(t.priority || 'normal'),
      status: String(t.status || 'open'),
      assignee: t.assigned_staff_id ? staffById.get(String(t.assigned_staff_id)) || null : null,
      created_at: String(t.created_at),
    }));

  return NextResponse.json({
    kpis: {
      openTickets: open.length,
      totalTickets: tickets.length,
      resolvedCount: resolved.length,
      firstResponse: medianFr != null ? fmtFr(medianFr) : null,
      firstResponseMinutes: medianFr,
      csat: csat != null ? Math.round(csat * 10) / 10 : null,
      csatResponses: csatVals.length,
      sla: sla != null ? Math.round(sla * 10) / 10 : null,
    },
    volume: days,
    channels,
    priority,
  });
}
