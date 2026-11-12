import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * /api/crm/appointments — the CRM Appointments domain (crm_appointments).
 *
 * The domain DDL lives in supabase/migrations/20261109200000_appointments_domain.sql
 * (source of truth: upload/04_appointments.sql). Until it is applied to the
 * remote this route answers 503 { error: 'schema_pending' } so the UI can
 * show the apply banner instead of crashing.
 *
 * Double-booking is enforced by the table's GiST exclusion constraints —
 * a conflicting insert returns 23P01, surfaced here as 409 double_booking.
 */

const TZ = 'America/Chicago';
const ACTIVE_STATUSES = ['requested', 'scheduled', 'confirmed', 'checked_in', 'in_progress'];

/** Wall-clock (date, "HH:MM") in the tenant timezone → correct UTC instant. */
function zonedToIso(date: string, hhmm: string, tz: string): string {
  const naive = new Date(`${date}T${hhmm}:00Z`).getTime();
  const asTz = new Date(new Date(naive).toLocaleString('en-US', { timeZone: tz })).getTime();
  return new Date(naive + (naive - asTz)).toISOString();
}

/** YYYY-MM-DD of an instant in the tenant timezone. */
function dateKeyInTz(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
}

function isSchemaPending(err: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42P01') return true; // undefined_table
  if (err.code === 'PGRST205' || err.code === 'PGRST200') {
    const msg = `${err.message || ''} ${err.details || ''}`;
    return /crm_appointment|crm_booking|crm_dependent|crm_staff_blocked/.test(msg);
  }
  return false;
}

function computeBlock(startsAt: string, endsAt: string, beforeMin: number, afterMin: number) {
  const s = new Date(startsAt).getTime() - beforeMin * 60_000;
  const e = new Date(endsAt).getTime() + afterMin * 60_000;
  return { block_starts_at: new Date(s).toISOString(), block_ends_at: new Date(e).toISOString() };
}

/** GET /api/crm/appointments?from&to&status&staff_id&customer_id&limit
 * Returns items with customer/staff/service embeds + KPI meta. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tzNow = new Date();
  const from = sp.get('from') || new Date(tzNow.getTime() - 7 * 86400000).toISOString();
  const to = sp.get('to') || new Date(tzNow.getTime() + 60 * 86400000).toISOString();
  const status = sp.get('status');
  const staffId = sp.get('staff_id');
  const customerId = sp.get('customer_id');
  const limit = Math.min(Number(sp.get('limit') || 500), 1000);

  let q = supabaseAdmin()
    .from('crm_appointments')
    .select(`
      id, appointment_number, status, starts_at, ends_at, timezone, source_channel,
      customer_notes, internal_notes, cancellation_reason, cancelled_at, late_cancel,
      confirmed_at, checked_in_at, started_at, completed_at, no_show_at, created_at, updated_at,
      estimated_total,
      customer:crm_customers(id, preferred_name, first_name, last_name, company_name, email, phone),
      staff:crm_staff(id, display_name, first_name, last_name, color_label),
      service:crm_services(id, name, default_duration_minutes),
      resource:crm_appointment_resources(id, name, resource_type)
    `)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .gte('starts_at', from)
    .lte('starts_at', to)
    .order('starts_at', { ascending: true })
    .limit(limit);

  if (status && status !== 'all') q = q.eq('status', status);
  if (staffId) q = q.eq('staff_id', staffId);
  if (customerId) q = q.eq('customer_id', customerId);

  const { data, error } = await q;
  if (error) {
    if (isSchemaPending(error)) {
      return NextResponse.json({ error: 'schema_pending', items: [], meta: { schemaReady: false } }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const items = (data || []) as Array<{ starts_at: string; status: string }>;
  // "Today" is the tenant timezone's calendar day — compare date strings in TZ.
  const todayKey = dateKeyInTz(new Date().toISOString(), TZ);
  const isToday = (iso: string) => dateKeyInTz(iso, TZ) === todayKey;

  const meta = {
    schemaReady: true,
    today: items.filter((a) => isToday(a.starts_at)).length,
    upcoming: items.filter((a) => ACTIVE_STATUSES.includes(a.status) && new Date(a.starts_at) >= tzNow).length,
    confirmed: items.filter((a) => a.status === 'confirmed').length,
    completed: items.filter((a) => a.status === 'completed').length,
    cancelled: items.filter((a) => a.status === 'cancelled').length,
    noShow: items.filter((a) => a.status === 'no_show').length,
  };
  return NextResponse.json({ items, meta });
}

/** POST /api/crm/appointments — create (staff-booked).
 * body: { customer_id, staff_id?, service_id?, resource_id?, starts_at, duration_minutes?, ends_at?, status?, customer_notes?, internal_notes?, source_channel? } */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const customerId = body.customer_id as string | undefined;
  // The instant: explicit starts_at wins; otherwise date+time resolved in the
  // TENANT timezone (never the server's local TZ).
  const startsAt = (body.starts_at as string | undefined)
    || (body.date && body.time ? zonedToIso(String(body.date), String(body.time), TZ) : undefined);
  if (!customerId || !startsAt) {
    return NextResponse.json({ error: 'customer_id and (starts_at | date+time) are required' }, { status: 400 });
  }

  // Resolve duration: explicit → service default → 30.
  let duration = Number(body.duration_minutes) || 0;
  if (!duration && body.service_id) {
    const { data: svc } = await supabaseAdmin()
      .from('crm_services')
      .select('default_duration_minutes')
      .eq('id', body.service_id as string)
      .maybeSingle();
    duration = Number(svc?.default_duration_minutes) || 0;
  }
  if (!duration) duration = 30;

  const endsAt = (body.ends_at as string | undefined) || new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
  if (new Date(endsAt) <= new Date(startsAt)) {
    return NextResponse.json({ error: 'ends_at must be after starts_at' }, { status: 400 });
  }

  const bufferBefore = Math.max(0, Number(body.buffer_before_minutes) || 0);
  const bufferAfter = Math.max(0, Number(body.buffer_after_minutes) || 0);

  // Appointment number: AP-<yyyyMMdd>-<4 hex>. Unique per tenant via constraint.
  const stamp = new Date(startsAt).toLocaleDateString('en-CA', { timeZone: TZ }).replace(/-/g, '');
  const appointmentNumber = `AP-${stamp}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

  const block = computeBlock(startsAt, endsAt, bufferBefore, bufferAfter);
  const status = typeof body.status === 'string' && body.status ? body.status : 'scheduled';

  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    appointment_number: appointmentNumber,
    customer_id: customerId,
    dependent_id: (body.dependent_id as string | undefined) || null,
    location_id: (body.location_id as string | undefined) || null,
    staff_id: (body.staff_id as string | undefined) || null,
    resource_id: (body.resource_id as string | undefined) || null,
    service_id: (body.service_id as string | undefined) || null,
    status,
    starts_at: startsAt,
    ends_at: endsAt,
    buffer_before_minutes: bufferBefore,
    buffer_after_minutes: bufferAfter,
    ...block,
    timezone: (body.timezone as string | undefined) || TZ,
    source_channel: (body.source_channel as string | undefined) || 'staff',
    customer_notes: (body.customer_notes as string | undefined) || null,
    internal_notes: (body.internal_notes as string | undefined) || null,
    estimated_total: body.estimated_total != null ? Number(body.estimated_total) : null,
    // The DDL's before-trigger maintains these too — computing them here keeps
    // inserts correct even pre-migration (when the trigger is not in place).
  };

  const { data, error } = await supabaseAdmin()
    .from('crm_appointments')
    .insert(insert)
    .select(`
      id, appointment_number, status, starts_at, ends_at, timezone,
      customer:crm_customers(id, preferred_name, first_name, last_name, company_name, email, phone),
      staff:crm_staff(id, display_name, first_name, last_name),
      service:crm_services(id, name, default_duration_minutes)
    `)
    .single();

  if (error) {
    if (isSchemaPending(error)) {
      return NextResponse.json({ error: 'schema_pending', hint: 'Apply supabase/migrations/20261109200000_appointments_domain.sql' }, { status: 503 });
    }
    if (error.code === '23P01') {
      return NextResponse.json({ error: 'double_booking', message: 'That staff member or resource is already booked in this window.' }, { status: 409 });
    }
    if (error.code === '23503') {
      return NextResponse.json({ error: 'bad_reference', message: error.details || error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Insert failed' }, { status: 400 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
