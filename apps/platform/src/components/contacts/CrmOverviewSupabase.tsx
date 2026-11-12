'use client';
/**
 * CrmOverviewSupabase — CRM Overview screen wired to Supabase via /api/crm/*.
 * Reads real customer/lead/segment counts, real AR, real LTV, real activity.
 * This is the production CRM module — no mock data.
 */
import { useState } from 'react';
import {
  useCrmStats,
  useCrmCustomers,
  useCrmLeads,
  type CrmCustomer,
} from '@/hooks/useCrmApi';
import PartyFormDrawer from './PartyFormDrawer';
import PartyProfile from './PartyProfile';

interface CrmOverviewProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
  onCreate?: (label: string) => void;
}

function fmt(n: number) {
  return (n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
function initials(first: string | null, last: string | null, company: string | null) {
  const a = first?.[0] || '';
  const b = last?.[0] || '';
  if (a || b) return (a + b).toUpperCase();
  return (company?.[0] || '?').toUpperCase();
}
function fullName(c: CrmCustomer) {
  if (c.first_name && c.last_name) return `${c.first_name} ${c.last_name}`;
  return c.first_name || c.company_name || c.email || 'Unnamed';
}
function daysSince(iso: string | null): number {
  if (!iso) return 9999;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 9999;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export default function CrmOverviewSupabase({ onToast, onNavigate, onCreate }: CrmOverviewProps) {
  const { data: stats } = useCrmStats();
  const { data: customers, loaded: customersLoaded, refresh: refreshCustomers } = useCrmCustomers();
  const { data: leads } = useCrmLeads();
  const [showCreate, setShowCreate] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  // In-screen profile swap — when the user clicks 'Open' on the peek
  // drawer, we render PartyProfile directly instead of navigating to the
  // customer table (which forced a second click on the same row).
  const [profileId, setProfileId] = useState<string | null>(null);

  if (profileId) {
    const c = customers.find(x => x.id === profileId);
    return (
      <PartyProfile
        partyId={profileId}
        source="crm_customers"
        backLabel="CRM Overview"
        summary={{
          name: c ? fullName(c) : undefined,
          roles: ['customer'],
          balance: c?.outstanding_balance,
          email: c?.email,
          phone: c?.phone,
        }}
        onToast={onToast}
        onBack={() => setProfileId(null)}
        onNavigate={onNavigate}
        onCreate={onCreate}
      />
    );
  }

  /* At-risk: customers with no activity in 30+ days and balance > 0 */
  const atRiskRows = customers
    .filter(c => daysSince(c.last_activity_at) >= 30 && (c.outstanding_balance || 0) > 0)
    .sort((a, b) => (b.outstanding_balance || 0) - (a.outstanding_balance || 0));

  /* Recent activity: aggregate from customers' last_activity_at, plus leads */
  const recentActivity = [
    ...customers.slice(0, 5).map(c => ({
      date: c.last_activity_at || c.updated_at,
      type: 'customer',
      name: fullName(c),
      text: c.lifecycle_stage === 'new_customer' ? 'New customer created' : `Updated ${c.lifecycle_status}`,
      id: c.id,
    })),
    ...leads.filter(l => l.status === 'converted').slice(0, 3).map(l => ({
      date: l.conversion_date || l.updated_at,
      type: 'lead',
      name: l.contact_name || l.email || 'Lead',
      text: 'Lead converted to customer',
      id: l.id,
    })),
  ]
    .filter(a => a.date)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 6);

  const peek = peekId ? customers.find(c => c.id === peekId) : null;

  const statsArrived = !!stats;
  function rolePill(stage: string) {
    const cls = stage === 'new_customer' ? 'customer' : stage === 'lead' ? 'contact' : stage === 'vip' ? 'vendor' : 'supplier';
    return <span className={`pill role ${cls}`}>{stage}</span>;
  }
  function iconForActivity(t: string) {
    return t === 'customer' ? 'person' : t === 'lead' ? 'person_add' : 'circle';
  }

  // Instant render — the shell paints with placeholder dashes and data
  // fills in place when the background refresh lands. No blocking spinner.

  return (
    <main className="px-6 pb-12">
      {/* BREADCRUMB */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Contacts</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">CRM Overview</span>
      </div>

      {/* PAGE HEADER */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">CRM Overview</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Relationship health, pipeline, and the parties behind it — live from Supabase.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onNavigate ? onNavigate('contacts', 'parties') : onToast('Navigate → Parties')}>
            <span className="material-symbols-outlined text-[16px]">groups</span>Open Parties
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onNavigate ? onNavigate('contacts', 'segments') : onToast('Navigate → Segments')}>
            <span className="material-symbols-outlined text-[16px]">filter_list</span>Segments
          </button>
          <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => setShowCreate(true)}>
            <span className="material-symbols-outlined text-[16px]">add</span>Add customer
          </button>
        </div>
      </div>

      {/* KPI STRIP — real Supabase stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total customers</div>
          <div className="text-headline-sm mt-1 tabular-nums">{stats?.total_customers ?? '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">{stats?.active_customers ?? 0} active · {stats?.total_leads ?? 0} leads in pipeline</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Open leads</div>
          <div className="text-headline-sm mt-1 tabular-nums text-primary">{stats?.open_leads ?? '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">{stats?.total_leads ?? 0} total leads</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Open AR</div>
          <div className="text-headline-sm mt-1 tabular-nums text-secondary">{fmt(stats?.open_ar ?? 0)}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Customer receivables</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Open tasks</div>
          <div className="text-headline-sm mt-1 tabular-nums text-error">{stats?.open_tasks ?? '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">{stats?.total_notes ?? 0} notes · {stats?.total_segments ?? 0} segments</div>
        </div>
      </div>

      {/* TWO COLUMN LAYOUT */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-4">
        {/* LEFT */}
        <div className="xl:col-span-2 space-y-3">
          {/* Recent customers */}
          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div><h2 className="text-headline-sm">Recent customers</h2><div className="text-[11px] text-on-surface-variant">From Supabase crm_customers table.</div></div>
              <button className="fin-link" onClick={() => onNavigate ? onNavigate('contacts', 'customers') : onToast('Navigate → Customers')}>
                <span className="material-symbols-outlined">open_in_new</span>Open all
              </button>
            </div>
            {!customersLoaded && customers.length === 0 ? (
              <div className="py-8 px-6 text-center text-body-sm text-on-surface-variant text-on-surface-variant/60">Fetching from Supabase…</div>
            ) : customers.length === 0 ? (
              <div className="py-8 px-6 text-center text-body-sm text-on-surface-variant">No customers yet — create your first.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                  <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                    <tr><th className="px-3 py-2">Party</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Last activity</th><th className="w-8"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-surface-dim">
                    {customers.slice(0, 8).map(c => (
                      <tr key={c.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => setPeekId(c.id)}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="avatar">{initials(c.first_name, c.last_name, c.company_name)}</div>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{fullName(c)}</div>
                              <div className="text-[11px] text-on-surface-variant truncate">{c.email || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[11px]">{c.customer_type}</td>
                        <td className="px-3 py-2">{rolePill(c.lifecycle_stage)}</td>
                        <td className="px-3 py-2 text-[11px] text-on-surface-variant">{c.last_activity_at ? daysSince(c.last_activity_at) + 'd ago' : '—'}</td>
                        <td className="px-2 py-2 text-right">
                          <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setPeekId(c.id); }}>
                            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* At-risk accounts */}
          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div><h2 className="text-headline-sm">At-risk accounts</h2><div className="text-[11px] text-on-surface-variant">No activity 30d+ with open balance.</div></div>
              <span className="pill info">{atRiskRows.length} at risk</span>
            </div>
            {atRiskRows.length === 0 ? (
              <div className="py-8 px-6 text-center text-body-sm text-on-surface-variant">No at-risk accounts.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                  <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                    <tr><th className="px-3 py-2">Party</th><th className="px-3 py-2">Last activity</th><th className="px-3 py-2 text-right">Open AR</th><th className="w-8"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-surface-dim">
                    {atRiskRows.slice(0, 6).map(c => (
                      <tr key={c.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => setPeekId(c.id)}>
                        <td className="px-3 py-2"><div className="flex items-center gap-2"><div className="avatar">{initials(c.first_name, c.last_name, c.company_name)}</div><div className="min-w-0"><div className="font-medium truncate">{fullName(c)}</div><div className="text-[11px] text-on-surface-variant truncate">{c.email || '—'}</div></div></div></td>
                        <td className="px-3 py-2 text-[11px]">{c.last_activity_at ? `${daysSince(c.last_activity_at)}d ago` : 'Never'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-error">{fmt(c.outstanding_balance || 0)}</td>
                        <td className="px-2 py-2 text-right"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setPeekId(c.id); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-3">
          {/* Recent activity */}
          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div><h2 className="text-headline-sm">Recent activity</h2><div className="text-[11px] text-on-surface-variant">Across all customers + leads.</div></div>
            </div>
            <div className="p-4">
              {recentActivity.length === 0 ? (
                <div className="py-4 text-center text-body-sm text-on-surface-variant">No activity yet.</div>
              ) : (
                recentActivity.map((a, i) => (
                  <div key={i} className="activity-row">
                    <div className="activity-dot"><span className="material-symbols-outlined">{iconForActivity(a.type)}</span></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-body-sm font-medium truncate">{a.name}</div>
                      <div className="text-[11px] text-on-surface-variant truncate">{a.text}</div>
                      <div className="text-[10px] text-outline mt-0.5">{a.date ? a.date.slice(0, 10) : '—'}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="px-5 py-3 border-b border-surface-dim"><h2 className="text-headline-sm">Quick actions</h2><div className="text-[11px] text-on-surface-variant">Shortcuts used daily.</div></div>
            <div className="p-4 grid grid-cols-2 gap-2">
              <button className="border border-surface-dim rounded-lg p-3 text-left hover:bg-surface-container-low" onClick={() => setShowCreate(true)}>
                <span className="material-symbols-outlined text-[18px] text-primary">person_add</span>
                <div className="text-[11px] font-semibold mt-1">Add customer</div>
              </button>
              <button className="border border-surface-dim rounded-lg p-3 text-left hover:bg-surface-container-low" onClick={() => onNavigate ? onNavigate('contacts', 'leads') : onToast('Navigate → Leads')}>
                <span className="material-symbols-outlined text-[18px] text-primary">flag</span>
                <div className="text-[11px] font-semibold mt-1">View leads</div>
              </button>
              <button className="border border-surface-dim rounded-lg p-3 text-left hover:bg-surface-container-low" onClick={() => onNavigate ? onNavigate('contacts', 'segments') : onToast('Navigate → Segments')}>
                <span className="material-symbols-outlined text-[18px] text-primary">filter_list</span>
                <div className="text-[11px] font-semibold mt-1">Segments</div>
              </button>
              <button className="border border-surface-dim rounded-lg p-3 text-left hover:bg-surface-container-low" onClick={() => onNavigate ? onNavigate('contacts', 'parties') : onToast('Navigate → Parties')}>
                <span className="material-symbols-outlined text-[18px] text-primary">groups</span>
                <div className="text-[11px] font-semibold mt-1">All parties</div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Peek drawer */}
      {peek && (
        <>
          <div className="drawer-scrim open" onClick={() => setPeekId(null)} />
          <div className="peek open">
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">person</span>
                <span className="text-headline-sm truncate">{fullName(peek)}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); setProfileId(id); }}>
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>Open
                </button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setPeekId(null)}>
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-body-sm">
              <div className="mb-4 flex items-center gap-2">
                {rolePill(peek.lifecycle_stage)}
                <span className="pill role contact">{peek.customer_type}</span>
              </div>
              <dl className="text-body-sm mb-4">
                <div className="kv"><dt>Company</dt><dd>{peek.company_name || '—'}</dd></div>
                <div className="kv"><dt>Email</dt><dd>{peek.email || '—'}</dd></div>
                <div className="kv"><dt>Phone</dt><dd>{peek.phone || '—'}</dd></div>
                <div className="kv"><dt>Address</dt><dd>{[peek.address_line1, peek.city, peek.state, peek.postal_code].filter(Boolean).join(', ') || '—'}</dd></div>
                <div className="kv"><dt>Customer since</dt><dd>{peek.created_at?.slice(0, 10) || '—'}</dd></div>
                <div className="kv"><dt>Last activity</dt><dd>{peek.last_activity_at ? peek.last_activity_at.slice(0, 10) : '—'}</dd></div>
                <div className="kv"><dt>Open balance</dt><dd className={(peek.outstanding_balance || 0) > 0 ? 'text-error' : ''}>{fmt(peek.outstanding_balance || 0)}</dd></div>
                <div className="kv"><dt>Lifetime value</dt><dd className="text-secondary">{fmt(peek.lifetime_value || 0)}</dd></div>
                <div className="kv"><dt>Total visits</dt><dd>{peek.total_visits || 0}</dd></div>
              </dl>
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); setProfileId(id); }}>
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>Open
                </button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => onToast(`Compose email to ${peek.email}`)}>
                  <span className="material-symbols-outlined text-[16px]">mail</span>Email
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Create customer — the SAME canonical PartyFormDrawer used on the
          Parties screen. One form, one save path, one experience. */}
      <PartyFormDrawer
        open={showCreate}
        preselectRole="Customer"
        onClose={() => setShowCreate(false)}
        onSaved={(_name, mode) => { refreshCustomers(); if (mode === 'created') setShowCreate(false); }}
        onToast={onToast}
      />
    </main>
  );
}
