'use client';
/**
 * CustomersSupabase — Customers LIST screen wired to Supabase.
 * Real data from crm_customers table via /api/crm/customers.
 * Search, status tabs, row click → PartyProfile (the SAME profile page
 * every party type opens — customers, vendors, suppliers, leads all use it).
 *
 * Row three-dot menu: full quick actions WITHOUT losing list context —
 * edit, add note, add task, new invoice, set stage, email, archive.
 */
import { useState, useMemo } from 'react';
import {
  useCrmCustomers,
  usePlatformMutations,
  fetchJson,
  type CrmCustomer,
} from '@/hooks/useCrmApi';
import { exportToCsv } from '@/lib/csvExport';
import PartyFormDrawer, { type PartyFormEditTarget } from './PartyFormDrawer';
import PartyProfile from './PartyProfile';

interface CustomersSupabaseProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
  onCreate?: (label: string, prefill?: { partyName?: string; partyId?: string; source?: string; email?: string | null }) => void;
}

const money = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'new_customer', label: 'New' },
  { id: 'vip', label: 'VIP' },
  { id: 'archived', label: 'Archived' },
];

/** Build the canonical edit target from a list row (API returns select('*')). */
function editTargetFrom(c: CrmCustomer): PartyFormEditTarget {
  return {
    id: c.id,
    source: 'crm_customers',
    name: fullName(c),
    company: c.company_name,
    first: c.first_name,
    last: c.last_name,
    display: c.preferred_name ?? null,
    email: c.email || '',
    phone: c.phone || '',
    mobile: c.mobile_phone ?? null,
    address: c.address_line1 || '',
    address2: c.address_line2 ?? null,
    city: c.city,
    state: c.state,
    zip: c.postal_code,
    country: c.country,
    customerType: c.customer_type,
    marketingEmail: c.marketing_email_opt_in ?? false,
    marketingSms: c.marketing_sms_opt_in ?? false,
    roles: ['Customer'],
  };
}

export default function CustomersSupabase({ onToast, onNavigate, onCreate }: CustomersSupabaseProps) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profileId, setProfileId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [rowEditId, setRowEditId] = useState<string | null>(null);
  // Quick actions from the row — drawers over the list, no context lost.
  const [quickNoteFor, setQuickNoteFor] = useState<CrmCustomer | null>(null);
  const [quickNoteBody, setQuickNoteBody] = useState('');
  const [quickTaskFor, setQuickTaskFor] = useState<CrmCustomer | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');
  const [taskDue, setTaskDue] = useState('');

  const { createNote, createTask } = usePlatformMutations(onToast);

  // Fetch by stage filter — the API supports lifecycle_status, but we also
  // filter by lifecycle_stage client-side for the tabs.
  const statusParam = tab === 'archived' ? 'archived' : 'all';
  const { data: customers, loaded, refresh: refetch } = useCrmCustomers(search, statusParam);

  const filtered = useMemo(() => {
    if (tab === 'all' || tab === 'archived') return customers;
    return customers.filter(c => c.lifecycle_stage === tab);
  }, [customers, tab]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: customers.length };
    STATUS_TABS.forEach(t => {
      if (t.id === 'all') return;
      if (t.id === 'archived') counts[t.id] = customers.filter(c => c.archived_at).length;
      else counts[t.id] = customers.filter(c => c.lifecycle_stage === t.id).length;
    });
    return counts;
  }, [customers]);

  // Summary KPIs
  const totalAR = filtered.reduce((s, c) => s + (c.outstanding_balance || 0), 0);
  const totalLTV = filtered.reduce((s, c) => s + (c.lifetime_value || 0), 0);

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** REAL export — downloads every filtered customer as CSV. */
  function handleExport() {
    exportToCsv(filtered.map(c => ({
      name: fullName(c),
      type: c.customer_type || '',
      stage: c.lifecycle_stage || '',
      email: c.email || '',
      phone: c.phone || '',
      ar: c.outstanding_balance || 0,
      ltv: c.lifetime_value || 0,
      last_activity: c.last_activity_at ? new Date(c.last_activity_at).toISOString().slice(0, 10) : '',
    })), [
      { key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'stage', label: 'Stage' },
      { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
      { key: 'ar', label: 'Open AR' }, { key: 'ltv', label: 'Lifetime value' }, { key: 'last_activity', label: 'Last activity' },
    ], 'customers');
    onToast(`Exported ${filtered.length} customers`);
  }

  /** REAL bulk stage change — PATCHes lifecycle_stage on every selected row. */
  async function bulkStage(stage: string) {
    const sel = [...selected];
    let done = 0;
    for (const id of sel) {
      const res = await fetchJson(`/api/crm/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ lifecycle_stage: stage }) });
      if (res.ok) done++;
    }
    onToast(`Stage → ${stage.replace('_', ' ')} on ${done} of ${sel.length} customers`);
    setSelected(new Set());
    refetch();
  }

  /** REAL bulk archive — soft-archives every selected customer. */
  async function bulkArchive() {
    const sel = [...selected];
    if (!confirm(`Archive ${sel.length} selected customer${sel.length === 1 ? '' : 's'}?`)) return;
    let done = 0;
    for (const id of sel) {
      const res = await fetchJson(`/api/parties/${id}?source=crm_customers`, { method: 'DELETE' });
      if (res.ok) done++;
    }
    onToast(`Archived ${done} of ${sel.length} customers`);
    setSelected(new Set());
    refetch();
  }

  /** Row quick action — set lifecycle stage without opening the profile. */
  async function rowSetStage(c: CrmCustomer, stage: string) {
    setRowMenuForId(null);
    const res = await fetchJson(`/api/crm/customers/${c.id}`, { method: 'PATCH', body: JSON.stringify({ lifecycle_stage: stage }) });
    onToast(res.ok ? `${fullName(c)} → ${stage.replace('_', ' ')}` : `Stage change failed: ${res.error}`);
    if (res.ok) refetch();
  }

  /** Row quick action — archive without opening the profile. */
  async function rowArchive(c: CrmCustomer) {
    setRowMenuForId(null);
    if (!confirm(`Archive "${fullName(c)}"? The record is kept and can be restored from the Archived tab.`)) return;
    const res = await fetchJson(`/api/parties/${c.id}?source=crm_customers`, { method: 'DELETE' });
    onToast(res.ok ? `Archived: ${fullName(c)}` : `Archive failed: ${res.error}`);
    if (res.ok) refetch();
  }

  /** Row quick action — save a note from the list. */
  async function saveQuickNote() {
    if (!quickNoteFor || !quickNoteBody.trim()) return;
    try {
      await createNote({ customer_id: quickNoteFor.id, body: quickNoteBody, note_type: 'general' });
      onToast(`Note added to ${fullName(quickNoteFor)}`);
      setQuickNoteFor(null);
      setQuickNoteBody('');
      refetch();
    } catch (e: any) {
      onToast(`Error: ${e.message}`);
    }
  }

  /** Row quick action — save a task from the list. */
  async function saveQuickTask() {
    if (!quickTaskFor || !taskTitle.trim()) return;
    try {
      await createTask({
        customer_id: quickTaskFor.id,
        title: taskTitle,
        task_type: 'follow_up',
        priority: taskPriority,
        status: 'open',
        due_at: taskDue || null,
      });
      onToast(`Task added for ${fullName(quickTaskFor)}`);
      setQuickTaskFor(null);
      setTaskTitle('');
      setTaskPriority('medium');
      setTaskDue('');
      refetch();
    } catch (e: any) {
      onToast(`Error: ${e.message}`);
    }
  }

  /** Row quick action — new transaction pre-filled with this customer. */
  function rowNewTxn(c: CrmCustomer, label: string) {
    setRowMenuForId(null);
    if (onCreate) {
      onCreate(label, { partyName: fullName(c), partyId: c.id, source: 'crm_customers', email: c.email ?? null });
    } else {
      onToast(`${label} — open the customer profile to create documents`);
    }
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(c => c.id)));
  }

  // Row click opens the unified PartyProfile — the SAME page that
  // Parties/Vendors/Suppliers lists open. Customers are just parties with
  // role=customer, so they get the same profile.
  if (profileId) {
    const c = customers.find(x => x.id === profileId);
    return (
      <PartyProfile
        partyId={profileId}
        source="crm_customers"
        backLabel="Customers"
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

  const rowEditTarget = rowEditId ? (() => {
    const c = customers.find(x => x.id === rowEditId);
    return c ? editTargetFrom(c) : null;
  })() : null;

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-headline-lg">Customers</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">From Supabase crm_customers · {customers.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => setShowCreate(true)}>
            <span className="material-symbols-outlined text-[16px]">add</span>New customer
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Customers</div>
          <div className="text-headline-sm tabular-nums">{filtered.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Open AR</div>
          <div className="text-headline-sm tabular-nums text-secondary">{money(totalAR)}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Lifetime value</div>
          <div className="text-headline-sm tabular-nums text-primary">{money(totalLTV)}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Avg days since activity</div>
          <div className="text-headline-sm tabular-nums">
            {filtered.length > 0 ? Math.round(filtered.reduce((s, c) => s + daysSince(c.last_activity_at), 0) / filtered.length) : 0}
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 mb-3 border-b border-surface-dim">
        {STATUS_TABS.map(t => (
          <button key={t.id} className={`px-3 py-2 text-label-md tab-underline ${tab === t.id ? 'active' : 'text-on-surface-variant'}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="text-on-surface-variant">({tabCounts[t.id] || 0})</span>
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-sm">
          <span className="material-symbols-outlined absolute left-2 top-1.5 text-[16px] text-on-surface-variant">search</span>
          <input className="w-full h-8 pl-8 pr-3 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search by name, email, phone…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-3 py-2 w-8"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2 text-right">AR</th>
                <th className="px-3 py-2 text-right">LTV</th>
                <th className="px-3 py-2">Last activity</th>
                <th className="px-2 py-2 w-10 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {!loaded && customers.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-on-surface-variant/60">Fetching from Supabase…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-on-surface-variant">No customers found.</td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => setProfileId(c.id)}>
                    <td className="px-3 py-2" onClick={e => { e.stopPropagation(); }}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleRow(c.id)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="avatar w-7 h-7 rounded-full bg-surface-container flex items-center justify-center text-[11px] font-bold text-on-surface-variant">{initials(c.first_name, c.last_name, c.company_name)}</div>
                        <div className="min-w-0">
                          <button className="font-medium truncate text-left hover:text-primary hover:underline" onClick={e => { e.stopPropagation(); setProfileId(c.id); }}>{fullName(c)}</button>
                          {c.company_name && <div className="text-[11px] text-on-surface-variant truncate">{c.company_name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[11px]">{c.customer_type}</td>
                    <td className="px-3 py-2"><span className={`pill role ${c.lifecycle_stage === 'vip' ? 'vendor' : c.lifecycle_stage === 'new_customer' ? 'customer' : 'contact'}`}>{c.lifecycle_stage}</span></td>
                    <td className="px-3 py-2"><div className="text-[12px]">{c.email || '—'}</div><div className="text-[11px] text-on-surface-variant">{c.phone || ''}</div></td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(c.outstanding_balance || 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(c.lifetime_value || 0)}</td>
                    <td className="px-3 py-2 text-[11px] text-on-surface-variant">{c.last_activity_at ? `${daysSince(c.last_activity_at)}d ago` : '—'}</td>
                    <td className="px-2 py-2 text-right relative">
                      <button
                        className="w-7 h-7 rounded border border-surface-dim hover:bg-surface-container flex items-center justify-center mx-auto"
                        title="Quick actions"
                        aria-label={`Quick actions for ${fullName(c)}`}
                        onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === c.id ? null : c.id); }}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                      {rowMenuForId === c.id && (
                        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 210 }} onClick={e => e.stopPropagation()}>
                          <div className="menu-header">{fullName(c)}</div>
                          <button onClick={() => { setRowMenuForId(null); setProfileId(c.id); }}><span className="material-symbols-outlined">account_circle</span>Open profile</button>
                          <button onClick={() => { setRowMenuForId(null); setRowEditId(c.id); }}><span className="material-symbols-outlined">edit</span>Edit customer</button>
                          <button onClick={() => rowNewTxn(c, 'Invoice')}><span className="material-symbols-outlined">receipt_long</span>New invoice</button>
                          <button onClick={() => rowNewTxn(c, 'Receive payment')}><span className="material-symbols-outlined">payments</span>Receive payment</button>
                          <button onClick={() => { setRowMenuForId(null); setQuickNoteFor(c); }}><span className="material-symbols-outlined">edit_note</span>Add note</button>
                          <button onClick={() => { setRowMenuForId(null); setQuickTaskFor(c); }}><span className="material-symbols-outlined">task_alt</span>Add task</button>
                          {c.email ? (
                            <button onClick={() => { setRowMenuForId(null); window.location.href = `mailto:${c.email}?subject=${encodeURIComponent('Unsaid — ' + fullName(c))}`; }}><span className="material-symbols-outlined">mail</span>Email</button>
                          ) : null}
                          <div className="sep"></div>
                          <div className="menu-header">Set stage</div>
                          <button onClick={() => rowSetStage(c, 'new_customer')}><span className="material-symbols-outlined">new_releases</span>New</button>
                          <button onClick={() => rowSetStage(c, 'active')}><span className="material-symbols-outlined">check_circle</span>Active</button>
                          <button onClick={() => rowSetStage(c, 'vip')}><span className="material-symbols-outlined">star</span>VIP</button>
                          <div className="sep"></div>
                          <button className="danger" onClick={() => rowArchive(c)}><span className="material-symbols-outlined">archive</span>Archive</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-surface-dim text-[11px] text-on-surface-variant flex items-center justify-between">
          <span>{filtered.length} of {customers.length} customers</span>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span>{selected.size} selected</span>
              <span className="flex items-center gap-1">
                <span className="text-on-surface-variant">Set stage:</span>
                <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => bulkStage('new_customer')}>New</button>
                <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => bulkStage('active')}>Active</button>
                <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => bulkStage('vip')}>VIP</button>
              </span>
              <button className="h-6 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={bulkArchive}>Archive</button>
            </div>
          )}
        </div>
      </div>

      {/* Click-away for the row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* Quick note drawer — from the row menu, list stays underneath */}
      {quickNoteFor && (
        <>
          <div className="drawer-scrim open" onClick={() => { setQuickNoteFor(null); setQuickNoteBody(''); }} />
          <div className="drawer open" role="dialog" aria-label={`Add note to ${fullName(quickNoteFor)}`} style={{ width: 480 }}>
            <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
              <div className="min-w-0">
                <h3 className="text-[16px] font-semibold">Add note</h3>
                <div className="text-[11px] text-on-surface-variant truncate">{fullName(quickNoteFor)}</div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => { setQuickNoteFor(null); setQuickNoteBody(''); }} aria-label="Close"><span className="material-symbols-outlined text-[20px]">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <label className="field-label">Note</label>
              <textarea className="field-textarea" autoFocus placeholder="What should the team know about this customer?" value={quickNoteBody} onChange={e => setQuickNoteBody(e.target.value)} />
            </div>
            <div className="p-4 border-t border-surface-dim flex justify-end gap-2 shrink-0">
              <button className="h-8 px-4 border border-surface-dim rounded text-[13px] hover:bg-surface-container-low" onClick={() => { setQuickNoteFor(null); setQuickNoteBody(''); }}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-50" disabled={!quickNoteBody.trim()} onClick={saveQuickNote}>Save note</button>
            </div>
          </div>
        </>
      )}

      {/* Quick task drawer — from the row menu */}
      {quickTaskFor && (
        <>
          <div className="drawer-scrim open" onClick={() => setQuickTaskFor(null)} />
          <div className="drawer open" role="dialog" aria-label={`Add task for ${fullName(quickTaskFor)}`} style={{ width: 520 }}>
            <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
              <div className="min-w-0">
                <h3 className="text-[16px] font-semibold">Add task</h3>
                <div className="text-[11px] text-on-surface-variant truncate">{fullName(quickTaskFor)}</div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setQuickTaskFor(null)} aria-label="Close"><span className="material-symbols-outlined text-[20px]">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="field-label">Task name</label>
                <input className="field-input" autoFocus placeholder="e.g. Follow up on quote" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Priority</label>
                  <select className="field-input" value={taskPriority} onChange={e => setTaskPriority(e.target.value)}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Due date</label>
                  <input className="field-input" type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-surface-dim flex justify-end gap-2 shrink-0">
              <button className="h-8 px-4 border border-surface-dim rounded text-[13px] hover:bg-surface-container-low" onClick={() => setQuickTaskFor(null)}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-50" disabled={!taskTitle.trim()} onClick={saveQuickTask}>Save task</button>
            </div>
          </div>
        </>
      )}

      {/* Create — the canonical PartyFormDrawer (same as Parties/overview) */}
      <PartyFormDrawer
        open={showCreate}
        preselectRole="Customer"
        onClose={() => setShowCreate(false)}
        onSaved={(_name, mode) => { refetch(); if (mode === 'created') setShowCreate(false); }}
        onToast={onToast}
      />

      {/* Edit from a row quick action — same canonical drawer, prefilled */}
      <PartyFormDrawer
        open={!!rowEditTarget}
        editing={rowEditTarget}
        onClose={() => setRowEditId(null)}
        onSaved={() => { refetch(); }}
        onToast={onToast}
      />
    </main>
  );
}
