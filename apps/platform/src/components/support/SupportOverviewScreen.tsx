'use client';
/**
 * SupportOverviewScreen — Support domain overview, fully wired to Supabase.
 *
 * Every number on this page is real:
 *   /api/v1/support/overview  — KPIs, 7-day volume, channel mix, priority
 *                               tickets (all from support_tickets)
 *   /api/v1/support/on-call   — SUPPORT availability: who's on call per team
 *                               (support_teams + support_team_members
 *                               .is_available) with live open-ticket load,
 *                               within-business-hours state, and a real
 *                               on-call toggle (PATCH is_available).
 *
 * No mock arrays. The HTML port's visual language (support.css) is kept.
 */

import { useCallback, useEffect, useState } from 'react';

interface SupportScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

interface OverviewKpis {
  openTickets: number;
  totalTickets: number;
  resolvedCount: number;
  firstResponse: string | null;
  firstResponseMinutes: number | null;
  csat: number | null;
  csatResponses: number;
  sla: number | null;
}
interface OverviewData {
  kpis: OverviewKpis;
  volume: Array<{ day: string; label: string; count: number }>;
  channels: Array<{ label: string; count: number; pct: number }>;
  priority: Array<{ id: string; subject: string; requester: string; priority: string; status: string; assignee: string | null; created_at: string }>;
}
interface OnCallMember {
  member_id: string;
  staff_id: string;
  name: string;
  resolved: boolean;
  title: string | null;
  email: string | null;
  member_role: string;
  max_concurrent: number | null;
  is_available: boolean;
  open_tickets: number;
  team?: string;
}
interface OnCallData {
  within_business_hours: boolean;
  business_hours: { name: string; timezone: string; schedule: unknown } | null;
  teams: Array<{ id: string; name: string; code: string; description: string | null; is_active: boolean; members: OnCallMember[]; on_call_count: number; total_load: number }>;
  on_call: OnCallMember[];
}

const CHANNEL_BAR: Record<string, string> = {
  email: 'bg-qb-blue',
  'live chat': 'bg-qb-teal',
  whatsapp: 'bg-qb-green',
  phone: 'bg-qb-maroon',
  web: 'bg-qb-navy',
  api: 'bg-surface-dim',
};
function barFor(label: string): string {
  return CHANNEL_BAR[label.toLowerCase()] || 'bg-surface-dim';
}

export default function SupportOverviewScreen({ onToast, onNavigate }: SupportScreenProps) {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [onCall, setOnCall] = useState<OnCallData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const [oRes, cRes] = await Promise.all([
        fetch('/api/v1/support/overview'),
        fetch('/api/v1/support/on-call'),
      ]);
      const oJson = await oRes.json();
      const cJson = await cRes.json();
      if (oRes.ok) setOverview(oJson);
      if (cRes.ok) setOnCall(cJson);
    } catch (e) {
      onToast(`Support overview: ${(e as Error).message}`);
    } finally {
      setLoaded(true);
    }
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  async function toggleAvailability(m: OnCallMember) {
    setToggling(m.member_id);
    try {
      const res = await fetch('/api/v1/support/on-call', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: m.member_id, is_available: !m.is_available }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Toggle failed');
      onToast(`${m.name} is now ${!m.is_available ? 'ON call' : 'off call'}`);
      load();
    } catch (e) {
      onToast(`Availability: ${(e as Error).message}`);
    } finally {
      setToggling(null);
    }
  }

  const k = overview?.kpis;
  const maxVolume = Math.max(1, ...(overview?.volume || []).map((d) => d.count));
  const maxChannelPct = Math.max(1, ...(overview?.channels || []).map((c) => c.pct));

  return (
    <main className="px-6 pb-12">

      {/* ─── BREADCRUMB ─── */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Support</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Overview</span>
      </div>

      {/* ─── SUB-NAVIGATION (Standard Pills) ─── */}
      <div className="flex items-center gap-1 border-b border-surface-dim bg-white overflow-x-auto">
        <button className="px-3 py-2 text-label-md tab-underline active">Overview</button>
        <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'agent-workspace')}>Omnichannel Inbox</button>
        <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'tickets')}>Tickets</button>
        <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate to Knowledge Base')}>Knowledge Base</button>
        <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate to Analytics')}>Analytics</button>
      </div>

      {/* ─── PAGE HEADER ─── */}
      <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Support Overview</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {loaded ? `Live from support_tickets — ${k?.openTickets ?? 0} open across every channel.` : 'Loading your support operation…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => onNavigate?.('support', 'tickets')}>
            <span className="material-symbols-outlined text-[16px]">add</span>Create ticket
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Export queued')}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
        </div>
      </div>

      {/* ─── KPI STRIP (real) ─── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Open tickets</div>
          <div className="text-headline-lg mt-1 tabular-nums">{k ? k.openTickets : '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-1">{k ? `${k.resolvedCount} resolved · ${k.totalTickets} total` : ''}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">First response time</div>
          <div className="text-headline-lg mt-1 tabular-nums">{k?.firstResponse || '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-1">median across replied tickets</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">CSAT score</div>
          <div className="text-headline-lg mt-1 tabular-nums">{k && k.csat != null ? `${k.csat}%` : '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-1">{k ? `${k.csatResponses} response${k.csatResponses === 1 ? '' : 's'}` : ''}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">SLA attainment</div>
          <div className="text-headline-lg mt-1 tabular-nums">{k && k.sla != null ? `${k.sla}%` : '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-1">resolved before due date</div>
        </div>
      </div>

      {/* ─── MAIN GRID ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">

        {/* Ticket Volume (Chart — real buckets) */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-headline-sm">Ticket volume — last 7 days</h2>
            <span className="text-[11px] text-on-surface-variant">{overview ? overview.volume.reduce((s, d) => s + d.count, 0) : '—'} created</span>
          </div>
          {overview && overview.volume.some((d) => d.count > 0) ? (
            <>
              <div className="flex items-end gap-2 h-40 pt-4 pb-2 border-b border-surface-dim">
                {overview.volume.map((d, i) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.day}: ${d.count}`}>
                    {d.count > 0 && <span className="text-[10px] text-on-surface-variant mb-1">{d.count}</span>}
                    <div className={`w-full rounded-t ${d.count > 0 ? 'bg-qb-blue/30' : 'bg-surface-container'}`} style={{ height: `${Math.max(4, (d.count / maxVolume) * 100)}%` }}></div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[11px] text-on-surface-variant mt-2">
                {overview.volume.map((d) => <span key={d.day}>{d.label}</span>)}
              </div>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center text-body-sm text-on-surface-variant">
              {loaded ? 'No tickets created in the last 7 days' : 'Loading…'}
            </div>
          )}
        </div>

        {/* Tickets by Channel (real mix) */}
        <div className="bg-white rounded-xl border border-surface-dim p-5">
          <h2 className="text-headline-sm mb-4">Tickets by channel</h2>
          {overview && overview.channels.length > 0 ? (
            <div className="space-y-3">
              {overview.channels.map((c) => (
                <div key={c.label}>
                  <div className="flex justify-between text-[12px] mb-1"><span>{c.label}</span><span className="font-semibold">{c.pct}% · {c.count}</span></div>
                  <div className="h-2 bg-surface-container-low rounded overflow-hidden"><div className={`h-full ${barFor(c.label)}`} style={{ width: `${(c.pct / maxChannelPct) * 100}%` }}></div></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-body-sm text-on-surface-variant">{loaded ? 'No tickets yet' : 'Loading…'}</div>
          )}
        </div>
      </div>

      {/* ─── ON CALL NOW (support availability) ─── */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-dim flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-headline-sm">On call now</h2>
            {onCall && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${onCall.within_business_hours ? 'bg-qb-green/15 text-qb-green' : 'bg-surface-container-high text-on-surface-variant'}`}>
                {onCall.within_business_hours ? 'WITHIN BUSINESS HOURS' : 'AFTER HOURS'}
              </span>
            )}
            {onCall?.business_hours && (
              <span className="text-[11px] text-on-surface-variant">{onCall.business_hours.name} · {onCall.business_hours.timezone}</span>
            )}
          </div>
          <span className="text-[11px] text-on-surface-variant">{onCall ? `${onCall.on_call.length} agent${onCall.on_call.length === 1 ? '' : 's'} available across ${onCall.teams.length} teams` : ''}</span>
        </div>
        {onCall && onCall.teams.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-surface-dim">
            {onCall.teams.map((t) => (
              <div key={t.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-body-md font-semibold">{t.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{t.on_call_count}/{t.members.length} on call · {t.total_load} open</div>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${t.on_call_count > 0 ? 'bg-qb-green' : 'bg-surface-dim'}`}></span>
                </div>
                <div className="mt-3 space-y-2 max-h-44 overflow-y-auto">
                  {t.members.map((m) => (
                    <div key={m.member_id} className="flex items-center gap-2">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${m.is_available ? 'bg-qb-green/15 text-qb-green' : 'bg-surface-container-high text-on-surface-variant'}`}>
                        {m.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium truncate" title={m.resolved ? undefined : `Unresolved staff ref ${m.staff_id.slice(0, 8)}`}>
                          {m.name}{!m.resolved && <span className="text-on-surface-variant" title="Staff record missing — member ref only"> *</span>}
                        </div>
                        <div className="text-[10px] text-on-surface-variant">{m.member_role}{m.max_concurrent ? ` · cap ${m.max_concurrent}` : ''} · {m.open_tickets} open</div>
                      </div>
                      <button
                        disabled={toggling === m.member_id}
                        onClick={() => toggleAvailability(m)}
                        className={`h-6 px-2 rounded text-[10px] font-bold disabled:opacity-50 ${m.is_available ? 'bg-qb-green/15 text-qb-green hover:bg-qb-green/25' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container'}`}
                        title={m.is_available ? 'Set off call' : 'Put on call'}
                      >
                        {toggling === m.member_id ? '…' : m.is_available ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  ))}
                  {t.members.length === 0 && <div className="text-[11px] text-on-surface-variant">No agents on this team yet</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-6 text-body-sm text-on-surface-variant">{loaded ? 'No support teams configured yet.' : 'Loading teams…'}</div>
        )}
      </div>

      {/* ─── PRIORITY TICKETS (real rows) ─── */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-dim">
          <h2 className="text-headline-sm">Priority tickets</h2>
          <button className="text-[11px] font-semibold text-primary hover:underline" onClick={() => onNavigate?.('support', 'tickets')}>View all →</button>
        </div>
        {overview && overview.priority.length > 0 ? (
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Requester</th>
                <th className="px-3 py-2">Assignee</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {overview.priority.map((t) => (
                <tr key={t.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => onNavigate?.('support', 'tickets')}>
                  <td className="px-3 py-2 font-mono text-primary font-medium">{t.id}</td>
                  <td className="px-3 py-2 font-medium">{t.subject}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{t.requester}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{t.assignee || 'Unassigned'}</td>
                  <td className="px-3 py-2"><span className={`stat ${t.priority.toLowerCase()}`}>{t.priority}</span></td>
                  <td className="px-3 py-2"><span className={`stat ${t.status.toLowerCase().replace(/_/g, '-')}`}>{t.status.replace(/_/g, ' ')}</span></td>
                  <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={(e) => { e.stopPropagation(); onNavigate?.('support', 'tickets'); }}><span className="material-symbols-outlined text-[16px]">more_horiz</span></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-5 py-6 text-body-sm text-on-surface-variant">
            {loaded ? 'No open priority tickets — the queue is clear.' : 'Loading tickets…'}
          </div>
        )}
      </div>

    </main>
  );
}
