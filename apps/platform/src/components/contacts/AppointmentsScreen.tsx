'use client';
/**
 * AppointmentsScreen — the CRM Appointments page (crm_appointments domain).
 *
 * Day | Week | List views on live data from /api/crm/appointments, a create
 * dialog backed by /api/crm/appointments/lookups (+ slot suggestions from
 * /api/crm/appointments/slots), and the full status-action loop (confirm →
 * check in → start → complete / cancel / no-show / reschedule) via PATCH
 * /api/crm/appointments/:id.
 *
 * The domain DDL (supabase/migrations/20261109200000_appointments_domain.sql,
 * source upload/04_appointments.sql) must be applied to the remote — until
 * then the API answers 503 schema_pending and this screen shows the apply
 * banner instead of pretending to work.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

interface ApptCustomer { id: string; preferred_name: string | null; first_name: string | null; last_name: string | null; company_name: string | null; email: string | null; phone: string | null }
interface ApptStaff { id: string; display_name: string | null; first_name: string | null; last_name: string | null; color_label: string | null }
interface ApptService { id: string; name: string; default_duration_minutes: number | null }
interface ApptResource { id: string; name: string; resource_type: string | null }
export interface ApptItem {
  id: string;
  appointment_number: string;
  status: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  source_channel: string;
  customer_notes: string | null;
  internal_notes: string | null;
  cancellation_reason: string | null;
  estimated_total: number | null;
  customer: ApptCustomer | null;
  staff: ApptStaff | null;
  service: ApptService | null;
  resource: ApptResource | null;
}
interface ApptMeta { schemaReady: boolean; today: number; upcoming: number; confirmed: number; completed: number; cancelled: number; noShow: number }
interface Lookups {
  customers: ApptCustomer[];
  staff: ApptStaff[];
  services: Array<ApptService & { default_price: number | null; is_active: boolean | null }>;
  resources: ApptResource[];
}
interface SlotSuggestion { starts_at: string; ends_at: string; staff_id: string }

interface Props {
  onToast: (msg: string) => void;
}

const TZ = 'America/Chicago';
const HOUR_H = 48; // px per hour in the calendar grid
const DAY_START_H = 7;
const DAY_END_H = 20;
const HOURS = Array.from({ length: DAY_END_H - DAY_START_H }, (_, i) => DAY_START_H + i);

const STATUS_STYLES: Record<string, string> = {
  requested: 'bg-surface-container-high text-on-surface-variant',
  scheduled: 'bg-qb-navy/10 text-qb-navy',
  confirmed: 'bg-qb-teal/15 text-qb-teal',
  checked_in: 'bg-qb-green/15 text-qb-green',
  in_progress: 'bg-qb-maroon/10 text-qb-maroon',
  completed: 'bg-qb-green/20 text-qb-green',
  cancelled: 'bg-surface-container-high text-on-surface-variant line-through',
  no_show: 'bg-error/10 text-error',
};

function nameOf(c: ApptCustomer | null): string {
  if (!c) return '—';
  return c.preferred_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || '—';
}
function staffName(s: ApptStaff | null): string {
  if (!s) return 'Unassigned';
  return s.display_name || [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Staff';
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}
function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
}
function dateKeyCT(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export default function AppointmentsScreen({ onToast }: Props) {
  const [view, setView] = useState<'day' | 'week' | 'list'>('week');
  const [items, setItems] = useState<ApptItem[]>([]);
  const [meta, setMeta] = useState<ApptMeta | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [schemaPending, setSchemaPending] = useState(false);
  const [pendingMsg, setPendingMsg] = useState<string>('');
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  // create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [slots, setSlots] = useState<SlotSuggestion[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [form, setForm] = useState({ customer_id: '', service_id: '', staff_id: '', resource_id: '', date: dateKeyCT(new Date()), time: '10:00', duration_minutes: 30, customer_notes: '', internal_notes: '' });
  const [saving, setSaving] = useState(false);

  // reschedule dialog
  const [resched, setResched] = useState<ApptItem | null>(null);
  const [reschedForm, setReschedForm] = useState({ date: '', time: '', duration_minutes: 30 });

  const range = useMemo(() => {
    if (view === 'day') {
      const start = new Date(`${dateKeyCT(anchor)}T00:00:00`);
      return { from: start.toISOString(), to: new Date(start.getTime() + 86400000).toISOString() };
    }
    // Week (or list window): the Sunday–Saturday week containing the anchor.
    const base = new Date(`${dateKeyCT(anchor)}T00:00:00`);
    const dow = base.getDay();
    const weekStart = addDays(base, -dow);
    const weekEnd = addDays(weekStart, 7);
    return { from: weekStart.toISOString(), to: weekEnd.toISOString(), weekStart };
  }, [anchor, view]);

  const load = useCallback(async () => {
    setLoaded(false);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    try {
      const res = await fetch(`/api/crm/appointments?${params}`);
      const json = await res.json();
      if (res.status === 503 && json.error === 'schema_pending') {
        setSchemaPending(true);
        setPendingMsg(json.hint || '');
        setItems([]);
        setMeta(null);
        return;
      }
      setSchemaPending(false);
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setItems(json.items || []);
      setMeta(json.meta || null);
    } catch (e) {
      onToast(`Appointments: ${(e as Error).message}`);
    } finally {
      setLoaded(true);
    }
  }, [range.from, range.to, statusFilter, onToast]);

  useEffect(() => { load(); }, [load]);

  async function openCreate() {
    setShowCreate(true);
    setSlots([]);
    try {
      const res = await fetch('/api/crm/appointments/lookups');
      const json = await res.json();
      setLookups({ customers: json.customers || [], staff: json.staff || [], services: json.services || [], resources: json.resources || [] });
    } catch {
      setLookups({ customers: [], staff: [], services: [], resources: [] });
    }
  }

  async function suggestSlots() {
    if (!form.date) return;
    setSlotsLoading(true);
    try {
      const p = new URLSearchParams({ date: form.date, duration_minutes: String(form.duration_minutes) });
      if (form.service_id) p.set('service_id', form.service_id);
      if (form.staff_id) p.set('staff_id', form.staff_id);
      const res = await fetch(`/api/crm/appointments/slots?${p}`);
      const json = await res.json();
      setSlots(json.slots || []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  async function createAppt() {
    if (!form.customer_id || !form.date || !form.time) {
      onToast('Pick a customer, date and time first');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/crm/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: form.customer_id,
          service_id: form.service_id || undefined,
          staff_id: form.staff_id || undefined,
          resource_id: form.resource_id || undefined,
          // date+time are resolved in the tenant TZ server-side (America/Chicago).
          date: form.date,
          time: form.time,
          duration_minutes: form.duration_minutes,
          customer_notes: form.customer_notes || undefined,
          internal_notes: form.internal_notes || undefined,
        }),
      });
      const json = await res.json();
      if (res.status === 503 && json.error === 'schema_pending') {
        onToast('Appointments schema not applied yet — apply the migration first');
        return;
      }
      if (res.status === 409) {
        onToast(json.message || 'Double booking — that window is taken');
        return;
      }
      if (!res.ok) throw new Error(json.error || 'Create failed');
      onToast(`Booked ${json.item?.appointment_number || ''}`);
      setShowCreate(false);
      load();
    } catch (e) {
      onToast(`Create failed: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function act(a: ApptItem, action: string, extra: Record<string, unknown> = {}) {
    setBusyId(a.id);
    try {
      const res = await fetch(`/api/crm/appointments/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (res.status === 503 && json.error === 'schema_pending') {
        onToast('Appointments schema not applied yet');
        return;
      }
      if (res.status === 409) {
        onToast(json.message || 'Conflict — the new time is already booked');
        return;
      }
      if (!res.ok) throw new Error(json.message || json.error || 'Action failed');
      onToast(`${a.appointment_number}: ${action.replace('_', ' ')}`);
      load();
    } catch (e) {
      onToast(`${action}: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
      setResched(null);
    }
  }

  function openResched(a: ApptItem) {
    setResched(a);
    setReschedForm({
      date: dateKeyCT(new Date(a.starts_at)),
      time: new Date(a.starts_at).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
      duration_minutes: Math.max(15, Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60000)),
    });
  }

  const byDay = useMemo(() => {
    const map = new Map<string, ApptItem[]>();
    for (const a of items) {
      const k = dateKeyCT(new Date(a.starts_at));
      const list = map.get(k) || [];
      list.push(a);
      map.set(k, list);
    }
    for (const list of map.values()) list.sort((x, y) => x.starts_at.localeCompare(y.starts_at));
    return map;
  }, [items]);

  const weekDays = useMemo(() => {
    const base = new Date(`${dateKeyCT(anchor)}T00:00:00`);
    const weekStart = addDays(base, -base.getDay());
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [anchor]);

  function dayBlock(a: ApptItem) {
    const start = new Date(a.starts_at);
    const end = new Date(a.ends_at);
    const loc = new Date(start.toLocaleString('en-US', { timeZone: TZ }));
    const locEnd = new Date(end.toLocaleString('en-US', { timeZone: TZ }));
    const top = Math.max(0, (loc.getHours() + loc.getMinutes() / 60 - DAY_START_H) * HOUR_H);
    const height = Math.max(20, ((locEnd.getTime() - loc.getTime()) / 3600000) * HOUR_H);
    return { top, height };
  }

  const nextActions = (a: ApptItem): string[] => {
    switch (a.status) {
      case 'requested':
      case 'scheduled': return ['confirm', 'cancel'];
      case 'confirmed': return ['check_in', 'cancel'];
      case 'checked_in': return ['start', 'cancel'];
      case 'in_progress': return ['complete'];
      default: return [];
    }
  };
  const ACTION_LABELS: Record<string, string> = { confirm: 'Confirm', check_in: 'Check in', start: 'Start', complete: 'Complete', cancel: 'Cancel', no_show: 'No-show' };

  function ApptCard({ a, compact }: { a: ApptItem; compact?: boolean }) {
    return (
      <div className={`rounded-lg border border-surface-dim bg-white p-2 ${compact ? '' : 'p-3'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-primary">{a.appointment_number}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_STYLES[a.status] || ''}`}>{a.status.replace(/_/g, ' ')}</span>
        </div>
        <div className={`font-semibold ${compact ? 'text-[12px]' : 'text-body-md'} mt-1 truncate`}>{nameOf(a.customer)}</div>
        <div className="text-[11px] text-on-surface-variant">{fmtTime(a.starts_at)} – {fmtTime(a.ends_at)} · {a.service?.name || 'General'}</div>
        {!compact && (
          <div className="text-[11px] text-on-surface-variant mt-0.5">
            {staffName(a.staff)}{a.resource ? ` · ${a.resource.name}` : ''}{a.source_channel && a.source_channel !== 'staff' ? ` · via ${a.source_channel.replace(/_/g, ' ')}` : ''}
          </div>
        )}
        {a.internal_notes && !compact && <div className="text-[11px] text-on-surface-variant italic mt-1 truncate">📝 {a.internal_notes}</div>}
        <div className="flex flex-wrap gap-1 mt-2">
          {nextActions(a).map((act2) => (
            <button
              key={act2}
              disabled={busyId === a.id}
              onClick={() => {
                if (act2 === 'cancel') {
                  const reason = typeof window !== 'undefined' ? window.prompt('Cancellation reason (optional)') || undefined : undefined;
                  act(a, 'cancel', { reason });
                } else {
                  act(a, act2);
                }
              }}
              className={`h-6 px-2 rounded text-[11px] font-semibold disabled:opacity-50 ${act2 === 'cancel' ? 'border border-surface-dim text-on-surface-variant hover:bg-surface-container-low' : 'bg-primary text-white hover:bg-primary-container'}`}
            >
              {ACTION_LABELS[act2]}
            </button>
          ))}
          {nextActions(a).length > 0 && (
            <button disabled={busyId === a.id} onClick={() => openResched(a)} className="h-6 px-2 rounded text-[11px] border border-surface-dim text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50">
              Reschedule
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── schema-pending banner ── */
  if (schemaPending) {
    return (
      <main className="px-6 pb-12">
        <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
          <span>Contacts</span><span className="text-outline">/</span>
          <span className="text-on-surface font-semibold">Appointments</span>
        </div>
        <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
          <div>
            <h1 className="text-headline-lg">Appointments</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">The booking calendar for customers, staff and resources.</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant">event_busy</span>
          <h2 className="text-headline-sm mt-2">Appointments schema not applied yet</h2>
          <p className="text-body-sm text-on-surface-variant mt-1 max-w-xl mx-auto">
            The Appointments domain (<span className="font-mono">crm_appointments</span> + booking policies, resources, status history, staff blocks and the book/reschedule/cancel RPCs) exists as a migration but has not been applied to the database yet.
          </p>
          <p className="text-body-sm mt-2 max-w-xl mx-auto">
            Apply <span className="font-mono text-primary">{pendingMsg || 'supabase/migrations/20261109200000_appointments_domain.sql'}</span> (idempotent — safe to run), then this page lights up with the calendar, create action and the full status loop.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="px-6 pb-12">
      {/* breadcrumb */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Contacts</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Appointments</span>
      </div>

      {/* sub-nav */}
      <div className="flex items-center gap-1 border-b border-surface-dim bg-white overflow-x-auto">
        <button className={`px-3 py-2 text-label-md tab-underline ${view === 'day' ? 'active' : 'text-on-surface-variant'}`} onClick={() => setView('day')}>Day</button>
        <button className={`px-3 py-2 text-label-md tab-underline ${view === 'week' ? 'active' : 'text-on-surface-variant'}`} onClick={() => setView('week')}>Week</button>
        <button className={`px-3 py-2 text-label-md tab-underline ${view === 'list' ? 'active' : 'text-on-surface-variant'}`} onClick={() => setView('list')}>List</button>
      </div>

      {/* header */}
      <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-headline-lg">
              {view === 'day' && new Date(range.from).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' })}
              {view === 'week' && `Week of ${weekDays[0].toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}`}
              {view === 'list' && 'All appointments'}
            </h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">Bookings, confirmations and the front-desk loop — live on crm_appointments.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2 border border-surface-dim rounded text-body-md bg-white focus:outline-none"
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {['requested', 'scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <button className="h-8 w-8 rounded border border-surface-dim flex items-center justify-center hover:bg-surface-container-low" onClick={() => setAnchor(addDays(anchor, view === 'day' ? -1 : -7))} aria-label="Previous">
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <button className="h-8 px-2 rounded border border-surface-dim text-body-md hover:bg-surface-container-low" onClick={() => setAnchor(new Date())}>Today</button>
          <button className="h-8 w-8 rounded border border-surface-dim flex items-center justify-center hover:bg-surface-container-low" onClick={() => setAnchor(addDays(anchor, view === 'day' ? 1 : 7))} aria-label="Next">
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
          <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={openCreate}>
            <span className="material-symbols-outlined text-[16px]">add</span>New appointment
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {meta && (
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-5">
          {[
            { label: 'Today', value: meta.today, icon: 'today' },
            { label: 'Upcoming', value: meta.upcoming, icon: 'upcoming' },
            { label: 'Confirmed', value: meta.confirmed, icon: 'task_alt' },
            { label: 'Completed', value: meta.completed, icon: 'check_circle' },
            { label: 'No-shows', value: meta.noShow, icon: 'event_busy' },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-xl border border-surface-dim p-4">
              <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">{k.icon}</span>{k.label}
              </div>
              <div className="text-headline-lg mt-1 tabular-nums">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* loading / empty */}
      {!loaded && <div className="bg-white rounded-xl border border-surface-dim p-8 text-center text-on-surface-variant text-body-md">Loading appointments…</div>}
      {loaded && items.length === 0 && (
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant">event_available</span>
          <h2 className="text-headline-sm mt-2">Nothing booked in this window</h2>
          <p className="text-body-sm text-on-surface-variant mt-1">Create the first appointment for this period.</p>
          <button className="h-8 px-3 mt-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container inline-flex items-center gap-1" onClick={openCreate}>
            <span className="material-symbols-outlined text-[16px]">add</span>New appointment
          </button>
        </div>
      )}

      {/* DAY view */}
      {loaded && view === 'day' && items.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-dim flex items-center justify-between">
            <h2 className="text-headline-sm">{fmtDay(range.from)}</h2>
            <span className="text-[11px] text-on-surface-variant">{items.length} appointment{items.length === 1 ? '' : 's'} · times in {TZ}</span>
          </div>
          <div className="relative" style={{ height: (DAY_END_H - DAY_START_H) * HOUR_H }}>
            {HOURS.map((h) => (
              <div key={h} className="absolute left-0 right-0 border-t border-surface-dim" style={{ top: (h - DAY_START_H) * HOUR_H }}>
                <span className="absolute -top-2 left-2 text-[10px] text-on-surface-variant bg-white px-1">{h % 12 === 0 ? 12 : h % 12}{h < 12 ? 'am' : 'pm'}</span>
              </div>
            ))}
            <div className="absolute left-16 right-3 top-0 bottom-0">
              {items.map((a) => {
                const { top, height } = dayBlock(a);
                return (
                  <div key={a.id} className="absolute left-0 right-0" style={{ top, height }}>
                    <ApptCard a={a} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* WEEK view */}
      {loaded && view === 'week' && (
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
          <div className="grid grid-cols-8 border-b border-surface-dim">
            <div className="p-2"></div>
            {weekDays.map((d) => {
              const isToday = dateKeyCT(d) === dateKeyCT(new Date());
              return (
                <div key={d.toISOString()} className={`p-2 text-center border-l border-surface-dim ${isToday ? 'bg-surface-container-low' : ''}`}>
                  <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className={`text-body-md font-semibold ${isToday ? 'text-primary' : ''}`}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>
          <div className="relative" style={{ height: (DAY_END_H - DAY_START_H) * HOUR_H }}>
            {HOURS.map((h) => (
              <div key={h} className="absolute left-0 right-0 border-t border-surface-dim" style={{ top: (h - DAY_START_H) * HOUR_H }}>
                <span className="absolute -top-2 left-1 text-[10px] text-on-surface-variant bg-white px-1">{h % 12 === 0 ? 12 : h % 12}{h < 12 ? 'am' : 'pm'}</span>
              </div>
            ))}
            <div className="absolute inset-0 grid grid-cols-8">
              <div></div>
              {weekDays.map((d) => {
                const key = dateKeyCT(d);
                const list = (byDay.get(key) || []).filter((a) => {
                  const { top } = dayBlock(a);
                  return top < (DAY_END_H - DAY_START_H) * HOUR_H;
                });
                return (
                  <div key={key} className="border-l border-surface-dim relative p-1 space-y-1 overflow-hidden">
                    {list.map((a) => (
                      <ApptCard key={a.id} a={a} compact />
                    ))}
                    {list.length === 0 && <div className="text-[10px] text-on-surface-variant/50 text-center pt-2">—</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* LIST view */}
      {loaded && view === 'list' && items.length > 0 && (
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Number</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Service</th>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {items.map((a) => (
                <tr key={a.id} className="hover:bg-surface-container-low">
                  <td className="px-3 py-2 font-mono text-[12px] text-primary">{a.appointment_number}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDay(a.starts_at)}<span className="text-on-surface-variant"> · </span>{fmtTime(a.starts_at)}–{fmtTime(a.ends_at)}</td>
                  <td className="px-3 py-2 font-medium">{nameOf(a.customer)}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{a.service?.name || '—'}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{staffName(a.staff)}</td>
                  <td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_STYLES[a.status] || ''}`}>{a.status.replace(/_/g, ' ')}</span></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {nextActions(a).map((act2) => (
                        <button key={act2} disabled={busyId === a.id}
                          onClick={() => { if (act2 === 'cancel') { const reason = typeof window !== 'undefined' ? window.prompt('Cancellation reason (optional)') || undefined : undefined; act(a, 'cancel', { reason }); } else act(a, act2); }}
                          className="h-6 px-2 rounded text-[11px] font-semibold bg-primary text-white hover:bg-primary-container disabled:opacity-50">
                          {ACTION_LABELS[act2]}
                        </button>
                      ))}
                      {nextActions(a).length > 0 && (
                        <button disabled={busyId === a.id} onClick={() => openResched(a)} className="h-6 px-2 rounded text-[11px] border border-surface-dim text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50">Resched</button>
                      )}
                      {nextActions(a).length === 0 && <span className="text-[11px] text-on-surface-variant">—</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="px-5 py-4 border-b border-surface-dim flex items-center justify-between">
              <div>
                <h2 className="text-headline-sm">New appointment</h2>
                <p className="text-[11px] text-on-surface-variant">Books into crm_appointments — double-booking is blocked at the database level.</p>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setShowCreate(false)} aria-label="Close">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Customer *</span>
                <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} className="mt-1 w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary">
                  <option value="">Select customer…</option>
                  {(lookups?.customers || []).map((c) => (
                    <option key={c.id} value={c.id}>{nameOf(c)}{c.email ? ` — ${c.email}` : ''}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Service</span>
                  <select value={form.service_id} onChange={(e) => { const svc = lookups?.services.find((s) => s.id === e.target.value); setForm({ ...form, service_id: e.target.value, duration_minutes: svc?.default_duration_minutes || form.duration_minutes }); }} className="mt-1 w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none">
                    <option value="">General visit</option>
                    {(lookups?.services || []).map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.default_duration_minutes || 30}m)</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Staff</span>
                  <select value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} className="mt-1 w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none">
                    <option value="">Unassigned</option>
                    {(lookups?.staff || []).map((s) => (
                      <option key={s.id} value={s.id}>{staffName(s)}</option>
                    ))}
                  </select>
                </label>
              </div>
              {lookups && lookups.resources.length > 0 && (
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Resource</span>
                  <select value={form.resource_id} onChange={(e) => setForm({ ...form, resource_id: e.target.value })} className="mt-1 w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none">
                    <option value="">None</option>
                    {lookups.resources.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} ({r.resource_type})</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Date</span>
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Time</span>
                  <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="mt-1 w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Duration</span>
                  <select value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} className="mt-1 w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none">
                    {[15, 30, 45, 60, 90, 120, 180].map((m) => (<option key={m} value={m}>{m} min</option>))}
                  </select>
                </label>
              </div>
              <button onClick={suggestSlots} disabled={slotsLoading} className="h-7 px-2 rounded border border-surface-dim text-[11px] font-semibold text-primary hover:bg-surface-container-low disabled:opacity-50 inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">auto_awesome</span>{slotsLoading ? 'Checking…' : 'Suggest open times'}
              </button>
              {slots.length > 0 && (
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {slots.slice(0, 24).map((s) => (
                    <button key={`${s.starts_at}|${s.staff_id}`} onClick={() => setForm({ ...form, time: new Date(s.starts_at).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }), staff_id: form.staff_id || s.staff_id })}
                      className="h-6 px-2 rounded-full border border-surface-dim text-[11px] hover:border-primary hover:text-primary">
                      {fmtTime(s.starts_at)}
                    </button>
                  ))}
                </div>
              )}
              {slots.length === 0 && !slotsLoading && form.date && (
                <p className="text-[11px] text-on-surface-variant">No suggestions yet — run “Suggest open times” for free slots on {form.date}.</p>
              )}
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Customer notes</span>
                <textarea value={form.customer_notes} onChange={(e) => setForm({ ...form, customer_notes: e.target.value })} rows={2} className="mt-1 w-full px-2 py-1.5 border border-surface-dim rounded text-body-md focus:outline-none" placeholder="What the customer should know…" />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Internal notes</span>
                <textarea value={form.internal_notes} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })} rows={2} className="mt-1 w-full px-2 py-1.5 border border-surface-dim rounded text-body-md focus:outline-none" placeholder="Staff-only context…" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-surface-dim flex justify-end gap-2">
              <button className="h-8 px-3 rounded border border-surface-dim text-body-md hover:bg-surface-container-low" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="h-8 px-3 rounded bg-primary text-white text-body-md font-semibold hover:bg-primary-container disabled:opacity-50" onClick={createAppt} disabled={saving || !form.customer_id}>
                {saving ? 'Booking…' : 'Book appointment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESCHEDULE dialog */}
      {resched && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) setResched(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="px-5 py-4 border-b border-surface-dim flex items-center justify-between">
              <div>
                <h2 className="text-headline-sm">Reschedule {resched.appointment_number}</h2>
                <p className="text-[11px] text-on-surface-variant">{nameOf(resched.customer)} · {fmtDay(resched.starts_at)} {fmtTime(resched.starts_at)}</p>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setResched(null)} aria-label="Close">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Date</span>
                  <input type="date" value={reschedForm.date} onChange={(e) => setReschedForm({ ...reschedForm, date: e.target.value })} className="mt-1 w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Time</span>
                  <input type="time" value={reschedForm.time} onChange={(e) => setReschedForm({ ...reschedForm, time: e.target.value })} className="mt-1 w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none" />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Duration</span>
                <select value={reschedForm.duration_minutes} onChange={(e) => setReschedForm({ ...reschedForm, duration_minutes: Number(e.target.value) })} className="mt-1 w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none">
                  {[15, 30, 45, 60, 90, 120, 180].map((m) => (<option key={m} value={m}>{m} min</option>))}
                </select>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-surface-dim flex justify-end gap-2">
              <button className="h-8 px-3 rounded border border-surface-dim text-body-md hover:bg-surface-container-low" onClick={() => setResched(null)}>Cancel</button>
              <button
                className="h-8 px-3 rounded bg-primary text-white text-body-md font-semibold hover:bg-primary-container"
                onClick={() => act(resched, 'reschedule', { date: reschedForm.date, time: reschedForm.time, duration_minutes: reschedForm.duration_minutes })}
              >
                Move appointment
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
