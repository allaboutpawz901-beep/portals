import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * /api/crm/appointments/slots — bookable start times for a date.
 *
 * GET ?date=YYYY-MM-DD&service_id=&staff_id=&duration_minutes=
 *
 * Computed from plain tables (works with or without the DDL RPCs applied):
 *   window      — crm_staff_availability for that weekday (fallback 09:00–17:00)
 *   duration    — explicit → crm_services.default_duration_minutes → 30
 *   policy      — crm_booking_policies (interval, min notice, buffers, horizon)
 *   busy blocks — crm_appointments active bookings overlapping the day
 */

const TZ = 'America/Chicago';
const ACTIVE = ['requested', 'scheduled', 'confirmed', 'checked_in', 'in_progress'];

function parseTime(v: unknown): { h: number; m: number } | null {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return { h: Math.min(23, Number(m[1])), m: Number(m[2]) };
  if (s.includes('T')) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      // Extract the wall-clock portion the same way it was stored (assume CT).
      const loc = new Date(d.toLocaleString('en-US', { timeZone: TZ }));
      return { h: loc.getHours(), m: loc.getMinutes() };
    }
  }
  return null;
}

/** Wall-clock (date, "HH:MM") in the tenant timezone → correct UTC instant.
 * Standard double-conversion; never trusts the server's local TZ. */
function zonedToIso(date: string, hhmm: string, tz: string): string {
  const naive = new Date(`${date}T${hhmm}:00Z`).getTime();
  const asTz = new Date(new Date(naive).toLocaleString('en-US', { timeZone: tz })).getTime();
  return new Date(naive + (naive - asTz)).toISOString();
}

/** Weekday (0=Sun) of a YYYY-MM-DD date interpreted in the tenant TZ. */
function dowInTz(date: string, tz: string): number {
  const d = new Date(new Date(`${date}T12:00:00Z`).toLocaleString('en-US', { timeZone: tz }));
  return d.getDay();
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const date = sp.get('date'); // YYYY-MM-DD
  const serviceId = sp.get('service_id') || undefined;
  const staffId = sp.get('staff_id') || undefined;
  const explicitDuration = Number(sp.get('duration_minutes')) || 0;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date=YYYY-MM-DD required' }, { status: 400 });
  }

  // Duration: explicit → service default → 30.
  let duration = explicitDuration;
  if (!duration && serviceId) {
    const { data: svc } = await supabaseAdmin()
      .from('crm_services')
      .select('default_duration_minutes')
      .eq('id', serviceId)
      .maybeSingle();
    duration = Number(svc?.default_duration_minutes) || 0;
  }
  if (!duration) duration = 30;

  // Policy for (tenant, service) or tenant-wide.
  let interval = 15, minNotice = 60, maxAdvanceDays = 90, bufBefore = 0, bufAfter = 0;
  let policyQ = supabaseAdmin()
    .from('crm_booking_policies')
    .select('slot_interval_minutes, min_notice_minutes, max_advance_days, buffer_before_minutes, buffer_after_minutes')
    .eq('tenant_id', DEFAULT_TENANT_ID);
  policyQ = serviceId ? policyQ.eq('service_id', serviceId) : policyQ.is('service_id', null);
  const { data: policy } = await policyQ.limit(1).maybeSingle();
  if (policy) {
    interval = policy.slot_interval_minutes || interval;
    minNotice = policy.min_notice_minutes ?? minNotice;
    maxAdvanceDays = policy.max_advance_days || maxAdvanceDays;
    bufBefore = policy.buffer_before_minutes || 0;
    bufAfter = policy.buffer_after_minutes || 0;
  }

  // Horizon check.
  const dayStartIso = zonedToIso(date, '00:00', TZ);
  const dayStart = new Date(dayStartIso);
  if (dayStart.getTime() > Date.now() + maxAdvanceDays * 86400000) {
    return NextResponse.json({ slots: [], meta: { reason: 'beyond_max_advance_days' } });
  }

  // Staff in scope.
  let staffIds: string[] = staffId ? [staffId] : [];
  if (!staffIds.length) {
    const { data: staffRows } = await supabaseAdmin()
      .from('crm_staff')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true)
      .limit(50);
    staffIds = (staffRows || []).map((s: { id: string }) => s.id);
  }

  // Busy blocks for the day (union over scoped staff; resource blocks too).
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const { data: busyRows } = await supabaseAdmin()
    .from('crm_appointments')
    .select('block_starts_at, block_ends_at, staff_id, resource_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('status', ACTIVE)
    .lt('block_starts_at', dayEnd.toISOString())
    .gt('block_ends_at', dayStart.toISOString());
  const busy = (busyRows || []) as Array<{ block_starts_at: string; block_ends_at: string; staff_id: string | null }>;

  // Default window per staff: availability rows for that weekday, else 09:00–17:00.
  const dow = dowInTz(date, TZ); // 0=Sun
  const { data: availRows } = await supabaseAdmin()
    .from('crm_staff_availability')
    .select('staff_id, availability_type, day_of_week, available_from, available_to')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('day_of_week', dow);
  const availForStaff = new Map<string, Array<{ from: string; to: string }>>();
  for (const r of (availRows || []) as Array<{ staff_id: string; availability_type: string; available_from: unknown; available_to: unknown }>) {
    const from = parseTime(r.available_from);
    const to = parseTime(r.available_to);
    if (!from || !to) continue;
    const list = availForStaff.get(r.staff_id) || [];
    list.push({ from: `${String(from.h).padStart(2, '0')}:${String(from.m).padStart(2, '0')}`, to: `${String(to.h).padStart(2, '0')}:${String(to.m).padStart(2, '0')}` });
    availForStaff.set(r.staff_id, list);
  }

  const minStart = Date.now() + minNotice * 60_000;
  const slots: Array<{ starts_at: string; ends_at: string; staff_id: string }> = [];
  const seen = new Set<string>();

  for (const sid of staffIds) {
    const windows = availForStaff.get(sid) || [{ from: '09:00', to: '17:00' }];
    for (const w of windows) {
      const winStartIso = zonedToIso(date, w.from, TZ);
      const winEndIso = zonedToIso(date, w.to, TZ);
      let t = new Date(winStartIso).getTime();
      const winEnd = new Date(winEndIso).getTime();
      while (t + (duration + bufAfter) * 60_000 <= winEnd) {
        const blockStart = t - bufBefore * 60_000;
        const blockEnd = t + (duration + bufAfter) * 60_000;
        const conflicts = busy.some((b) =>
          b.staff_id === sid &&
          new Date(b.block_starts_at).getTime() < blockEnd &&
          new Date(b.block_ends_at).getTime() > blockStart,
        );
        if (!conflicts && t >= minStart) {
          const iso = new Date(t).toISOString();
          const key = `${iso}|${sid}`;
          if (!seen.has(key)) {
            seen.add(key);
            slots.push({
              starts_at: iso,
              ends_at: new Date(t + duration * 60_000).toISOString(),
              staff_id: sid,
            });
          }
        }
        t += interval * 60_000;
      }
    }
  }

  slots.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.staff_id.localeCompare(b.staff_id));
  return NextResponse.json({ slots, meta: { date, duration_minutes: duration, interval_minutes: interval, min_notice_minutes: minNotice } });
}
