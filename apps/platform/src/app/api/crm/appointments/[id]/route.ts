import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * /api/crm/appointments/[id] — status transitions + reschedule on crm_appointments.
 *
 * PATCH body: { action: 'confirm'|'check_in'|'start'|'complete'|'cancel'|'no_show'|'reschedule',
 *               reason?, late_cancel?, starts_at?, ends_at?, duration_minutes?, note? }
 *
 * Every transition appends a crm_appointment_status_history row and mirrors the
 * DDL's status→timestamp mapping (confirmed_at, checked_in_at, started_at,
 * completed_at, cancelled_at, no_show_at). Reschedule rewrites the time window
 * and recomputes the buffer block (the DDL trigger does the same once applied).
 */

const TZ = 'America/Chicago';

/** Wall-clock (date, "HH:MM") in the tenant timezone → correct UTC instant. */
function zonedToIso(date: string, hhmm: string, tz: string): string {
  const naive = new Date(`${date}T${hhmm}:00Z`).getTime();
  const asTz = new Date(new Date(naive).toLocaleString('en-US', { timeZone: tz })).getTime();
  return new Date(naive + (naive - asTz)).toISOString();
}

const STATUS_BY_ACTION: Record<string, string> = {
  confirm: 'confirmed',
  check_in: 'checked_in',
  start: 'in_progress',
  complete: 'completed',
  cancel: 'cancelled',
  no_show: 'no_show',
};

const TIMESTAMP_FIELD: Record<string, string> = {
  confirm: 'confirmed_at',
  check_in: 'checked_in_at',
  start: 'started_at',
  complete: 'completed_at',
  cancel: 'cancelled_at',
  no_show: 'no_show_at',
};

function isSchemaPending(err: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42P01') return true;
  if (err.code === 'PGRST205' || err.code === 'PGRST200') {
    const msg = `${err.message || ''} ${err.details || ''}`;
    return /crm_appointment|crm_booking|crm_dependent|crm_staff_blocked/.test(msg);
  }
  return false;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String(body.action || '');
  if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 });

  const { data: appt, error: fetchErr } = await supabaseAdmin()
    .from('crm_appointments')
    .select('id, status, starts_at, ends_at, buffer_before_minutes, buffer_after_minutes, staff_id, resource_id')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();

  if (fetchErr) {
    if (isSchemaPending(fetchErr)) {
      return NextResponse.json({ error: 'schema_pending', hint: 'Apply supabase/migrations/20261109200000_appointments_domain.sql' }, { status: 503 });
    }
    return NextResponse.json({ error: fetchErr.message }, { status: 400 });
  }
  if (!appt) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let historyAction = action;

  if (action === 'reschedule') {
    if (['completed', 'cancelled', 'no_show'].includes(appt.status)) {
      return NextResponse.json({ error: 'invalid_transition', message: `Cannot reschedule a ${appt.status} appointment.` }, { status: 400 });
    }
    const current = new Date(appt.starts_at as string);
    let startsAt = body.starts_at as string | undefined;
    if (!startsAt && body.date && body.time) {
      // Date + wall-clock in the tenant timezone → instant.
      startsAt = zonedToIso(String(body.date), String(body.time), TZ);
    }
    if (!startsAt) return NextResponse.json({ error: 'starts_at (or date+time) required for reschedule' }, { status: 400 });

    let duration = Number(body.duration_minutes) || 0;
    if (!duration && body.ends_at) {
      duration = Math.round((new Date(body.ends_at as string).getTime() - new Date(startsAt).getTime()) / 60_000);
    }
    if (!duration) duration = Math.round((new Date(appt.ends_at as string).getTime() - new Date(appt.starts_at as string).getTime()) / 60_000) || 30;

    const endsAt = body.ends_at
      ? (body.ends_at as string)
      : new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
    if (new Date(endsAt) <= new Date(startsAt)) {
      return NextResponse.json({ error: 'ends_at must be after starts_at' }, { status: 400 });
    }

    const before = Math.max(0, Number(appt.buffer_before_minutes) || 0);
    const after = Math.max(0, Number(appt.buffer_after_minutes) || 0);
    update.starts_at = startsAt;
    update.ends_at = endsAt;
    update.block_starts_at = new Date(new Date(startsAt).getTime() - before * 60_000).toISOString();
    update.block_ends_at = new Date(new Date(endsAt).getTime() + after * 60_000).toISOString();
    if (['cancelled', 'no_show'].includes(appt.status)) update.status = 'scheduled';
  } else {
    const newStatus = STATUS_BY_ACTION[action];
    if (!newStatus) {
      return NextResponse.json({ error: 'unknown_action', message: `Unknown action "${action}".` }, { status: 400 });
    }
    const TERMINAL = ['completed', 'cancelled', 'no_show'];
    if (TERMINAL.includes(appt.status as string) && action !== 'cancel') {
      return NextResponse.json({ error: 'invalid_transition', message: `Appointment is already ${appt.status}.` }, { status: 400 });
    }
    update.status = newStatus;
    update[TIMESTAMP_FIELD[action]] = new Date().toISOString();
    if (action === 'cancel') {
      update.cancellation_reason = (body.reason as string | undefined) || null;
      if (typeof body.late_cancel === 'boolean') update.late_cancel = body.late_cancel;
    }
    if (body.note) update.internal_notes = body.note as string;
    historyAction = `status:${newStatus}`;
  }

  const { data: updated, error: updateErr } = await supabaseAdmin()
    .from('crm_appointments')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select(`
      id, appointment_number, status, starts_at, ends_at, timezone, cancellation_reason, late_cancel,
      customer:crm_customers(id, preferred_name, first_name, last_name, company_name, email, phone),
      staff:crm_staff(id, display_name, first_name, last_name),
      service:crm_services(id, name, default_duration_minutes)
    `)
    .single();

  if (updateErr) {
    if (updateErr.code === '23P01') {
      return NextResponse.json({ error: 'double_booking', message: 'The new time conflicts with an existing booking.' }, { status: 409 });
    }
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  // Append status history (best-effort — the DDL trigger also writes it once
  // applied; skip silently when the table is not there yet).
  await supabaseAdmin().from('crm_appointment_status_history').insert({
    tenant_id: DEFAULT_TENANT_ID,
    appointment_id: id,
    from_status: appt.status,
    to_status: (update.status as string) || appt.status,
    action: historyAction,
    note: (body.note as string | undefined) || (body.reason as string | undefined) || null,
    changed_by: null,
    changed_at: new Date().toISOString(),
  });

  return NextResponse.json({ item: updated });
}
