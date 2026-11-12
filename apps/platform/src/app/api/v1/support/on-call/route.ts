import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * /api/v1/support/on-call — SUPPORT availability (who's on call), NOT staff
 * scheduling. Backed by the real tables:
 *
 *   support_teams        — the teams (General Support, Billing & Payments, …)
 *   support_team_members — is_available flag, role, max_concurrent per agent
 *   crm_staff            — agent identities (resolved best-effort; members
 *                          pointing at missing staff degrade to a short-id
 *                          label — never invented names)
 *   support_business_hours — the tenant schedule (within-hours check)
 *   support_tickets      — live open-ticket load per agent
 *
 * GET  → teams with members: on-call state, open load, within business hours
 * PATCH { member_id, is_available } → flip an agent's on-call availability
 */
const TZ = 'America/Chicago';

const OPEN_STATUSES = new Set(['open', 'new', 'pending', 'in_progress', 'escalated']);

interface BHPattern { start: string; end: string }
type BHSchedule = Partial<Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', BHPattern[]>>;

function withinBusinessHours(schedule: BHSchedule | null, timezone: string | null): boolean {
  if (!schedule) return true; // no schedule configured → treat as 24/7
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone || TZ }));
  const key = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[now.getDay()];
  const patterns = schedule[key] || [];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMin = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  return patterns.some((p) => minutes >= toMin(p.start) && minutes < toMin(p.end));
}

export async function GET() {
  const [teamsRes, membersRes, staffRes, ticketsRes, bhRes] = await Promise.all([
    supabaseAdmin()
      .from('support_teams')
      .select('id, name, code, description, is_active')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('name'),
    supabaseAdmin()
      .from('support_team_members')
      .select('id, team_id, staff_id, role, is_available, max_concurrent')
      .eq('tenant_id', DEFAULT_TENANT_ID),
    supabaseAdmin()
      .from('crm_staff')
      .select('id, display_name, first_name, last_name, email, image_url, role')
      .eq('tenant_id', DEFAULT_TENANT_ID),
    supabaseAdmin()
      .from('support_tickets')
      .select('assigned_staff_id, status, resolved_at, closed_at, deleted_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .is('deleted_at', null),
    supabaseAdmin()
      .from('support_business_hours')
      .select('id, name, timezone, schedule, is_default, is_active')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .limit(1),
  ]);

  if (teamsRes.error) return NextResponse.json({ error: teamsRes.error.message }, { status: 400 });

  const teams = teamsRes.data || [];
  const members = (membersRes.data || []) as Array<{ id: string; team_id: string; staff_id: string; role: string | null; is_available: boolean; max_concurrent: number | null }>;
  const staff = (staffRes.data || []) as Array<{ id: string; display_name: string | null; first_name: string | null; last_name: string | null; email: string | null; image_url: string | null; role: string | null }>;
  const tickets = (ticketsRes.data || []) as Array<{ assigned_staff_id: string | null; status: string; resolved_at: string | null; closed_at: string | null }>;

  // Open-ticket load per staff id.
  const load = new Map<string, number>();
  for (const t of tickets) {
    if (!t.assigned_staff_id) continue;
    if (t.resolved_at || t.closed_at || OPEN_STATUSES.has(t.status) === false) continue;
    load.set(t.assigned_staff_id, (load.get(t.assigned_staff_id) || 0) + 1);
  }

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const bh = (bhRes.data || [])[0] as { id: string; name: string; timezone: string; schedule: BHSchedule | null; is_default: boolean } | undefined;
  const inHours = bh ? withinBusinessHours(bh.schedule, bh.timezone) : true;

  const teamCards = teams.map((team) => {
    const teamMembers = members.filter((m) => m.team_id === team.id);
    const enriched = teamMembers.map((m) => {
      const s = staffById.get(m.staff_id);
      const name = s ? (s.display_name || [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Agent') : `Agent ${m.staff_id.slice(0, 8)}`;
      return {
        member_id: m.id,
        staff_id: m.staff_id,
        name,
        resolved: !!s,
        title: s?.role || null,
        email: s?.email || null,
        member_role: m.role || 'agent',
        max_concurrent: m.max_concurrent,
        is_available: m.is_available,
        open_tickets: load.get(m.staff_id) || 0,
      };
    });
    const onCall = enriched.filter((m) => m.is_available);
    return {
      id: team.id,
      name: team.name,
      code: team.code,
      description: team.description,
      is_active: team.is_active,
      members: enriched,
      on_call_count: onCall.length,
      total_load: enriched.reduce((sum, m) => sum + m.open_tickets, 0),
    };
  });

  const onCallNow = teamCards.flatMap((t) => t.members.filter((m) => m.is_available).map((m) => ({ ...m, team: t.name })));

  return NextResponse.json({
    within_business_hours: inHours,
    business_hours: bh ? { name: bh.name, timezone: bh.timezone, schedule: bh.schedule } : null,
    teams: teamCards,
    on_call: onCallNow,
    meta: {
      teams: teams.length,
      members: members.length,
      agents_resolved: members.filter((m) => staffById.has(m.staff_id)).length,
    },
  });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const memberId = body.member_id as string | undefined;
  if (!memberId || typeof body.is_available !== 'boolean') {
    return NextResponse.json({ error: 'member_id and boolean is_available are required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from('support_team_members')
    .update({ is_available: body.is_available, updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('id, staff_id, team_id, is_available')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ member: data });
}
