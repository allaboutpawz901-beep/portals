'use client';
/* SupportTicketsScreen — 1:1 port of upload/support_extract/Support/tickets.html
   The HTML's <style> block lives in src/app/support.css (+ marketing.css globals).
   The HTML's <body> is ported to JSX below; class names are identical.
   The HTML's <script> (filtering, view tabs, bulk selection, row menu,
   ticket detail drawer) is ported to React state + handlers below. */
import { useState } from 'react';

interface SupportScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

/* ─── data (verbatim from HTML) ─── */
interface Ticket {
  id: string;
  subject: string;
  customer: string;
  custId: string;
  initials: string;
  avatarBg: string;
  priority: 'Urgent' | 'High' | 'Normal' | 'Low';
  status: 'Open' | 'Pending' | 'Solved';
  assignee: 'Maya Chen' | 'Noah Kim' | 'Unassigned';
}

const TICKETS_INIT: Ticket[] = [
  { id: 'SD-4821', subject: 'Unable to access account', customer: 'Olivia Rhys', custId: 'CUST-0882', initials: 'OR', avatarBg: 'bg-qb-blue', priority: 'High', status: 'Open', assignee: 'Maya Chen' },
  { id: 'SD-4820', subject: 'Refund request for order #8821', customer: 'Ethan Cole', custId: 'CUST-0911', initials: 'EC', avatarBg: 'bg-qb-teal', priority: 'Normal', status: 'Pending', assignee: 'Noah Kim' },
  { id: 'SD-4819', subject: 'App crashes on checkout', customer: 'Priya Shah', custId: 'CUST-0402', initials: 'PS', avatarBg: 'bg-qb-maroon', priority: 'Urgent', status: 'Open', assignee: 'Unassigned' },
];

type ViewTab = 'All' | 'Unassigned' | 'Mine';
const VIEW_TABS: { id: ViewTab; label: string }[] = [
  { id: 'All', label: 'All tickets' },
  { id: 'Unassigned', label: 'Unassigned' },
  { id: 'Mine', label: 'My tickets' },
];

const PRIORITY_FILTERS = ['', 'Urgent', 'High', 'Normal', 'Low'];

export default function SupportTicketsScreen({ onToast, onNavigate }: SupportScreenProps) {
  /* ─── state (mirrors HTML's currentTab / filters / bulk / row menu / drawer) ─── */
  const [items, setItems] = useState<Ticket[]>(TICKETS_INIT);
  const [currentTab, setCurrentTab] = useState<ViewTab>('All');
  const [q, setQ] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);

  /* ─── derived (mirrors applyFilters) ─── */
  const rows = items.filter(t => {
    const tabOk = currentTab === 'All'
      || (currentTab === 'Unassigned' ? t.assignee === 'Unassigned' : t.assignee === 'Maya Chen');
    const ql = q.toLowerCase();
    const qOk = !ql || `${t.id} ${t.subject} ${t.customer} ${t.custId} ${t.priority} ${t.status} ${t.assignee}`.toLowerCase().includes(ql);
    const pOk = !priorityFilter || t.priority === priorityFilter;
    return tabOk && qOk && pOk;
  });

  const allChecked = rows.length > 0 && rows.every(t => checked.has(t.id));
  const someChecked = rows.some(t => checked.has(t.id));
  const drawerTicket = drawerId ? items.find(t => t.id === drawerId) : null;

  /* ─── handlers ─── */
  function toggleRow(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /* Check-all respects visibility (mirrors HTML: only rows with display !== "none") */
  function toggleAll(on: boolean) {
    setChecked(prev => {
      const next = new Set(prev);
      rows.forEach(t => { if (on) next.add(t.id); else next.delete(t.id); });
      return next;
    });
  }

  function clearChecks() { setChecked(new Set()); }

  /* Bulk bar (mirrors [data-bulk] handler — every action toasts
     `${Action} on N tickets`, delete additionally removes the rows) */
  function bulkAction(act: 'assign' | 'priority' | 'solve' | 'delete' | 'close') {
    if (act === 'close') { clearChecks(); return; }
    const n = checked.size;
    if (act === 'delete') {
      setItems(prev => prev.filter(t => !checked.has(t.id)));
    }
    const label = act.charAt(0).toUpperCase() + act.slice(1);
    onToast(`${label} on ${n} ticket${n !== 1 ? 's' : ''}`);
    clearChecks();
  }

  /* Row ⋯ menu — fixed-positioned per HTML (below the button, clamped to viewport) */
  function openRowMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({
      id,
      top: r.bottom + 4,
      left: Math.min(r.right - 250, window.innerWidth - 270),
    });
  }

  function closeMenu() { setMenu(null); }

  /* Global actions (from row menu or drawer) — mirrors [data-action] handler */
  function action(act: string, id: string) {
    if (act === 'open-inbox') {
      onToast('Opening conversation in Omnichannel Inbox...');
      setDrawerId(null);
      closeMenu();
      onNavigate?.('support', 'agent-workspace');
    } else if (act === 'view-crm') {
      onToast('Navigating to canonical CRM record...');
      closeMenu();
    } else if (act === 'delete') {
      setItems(prev => prev.filter(t => t.id !== id));
      setChecked(prev => { const next = new Set(prev); next.delete(id); return next; });
      onToast('Ticket deleted');
      closeMenu();
    } else if (act === 'email') {
      onToast('Opening email composer...');
      closeMenu();
    } else if (act === 'view-details') {
      setDrawerId(id);
      closeMenu();
    }
  }

  /* Row click (not on checkbox/button) opens the ticket drawer */
  function onRowClick(e: React.MouseEvent<HTMLTableRowElement>, id: string) {
    if ((e.target as HTMLElement).closest('input,button')) return;
    setDrawerId(id);
  }

  return (
    <main className="px-6 pb-12">

      {/* ─── BREADCRUMB ─── */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Support</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Tickets</span>
      </div>

      {/* ─── SUB-NAVIGATION ─── */}
      <div className="flex items-center gap-1 border-b border-surface-dim bg-white overflow-x-auto">
        <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'support-overview')}>Overview</button>
        <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'agent-workspace')}>Omnichannel Inbox</button>
        <button className="px-3 py-2 text-label-md tab-underline active">Tickets</button>
        <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate to Knowledge Base')}>Knowledge Base</button>
      </div>

      {/* ─── PAGE HEADER ─── */}
      <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Tickets</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Manage, prioritize, and resolve customer requests.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex split-btn">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" onClick={() => onToast('New ticket flow')}>
              <span className="material-symbols-outlined text-[16px]">add</span>New ticket
            </button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={() => onToast('New ticket flow')}>
              <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
          </div>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Export queued')}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export</button>
        </div>
      </div>

      {/* ─── TABLE CARD ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">

        {/* View tabs */}
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          {VIEW_TABS.map(t => (
            <button key={t.id} className={`h-full px-3 text-label-md tab-underline ${currentTab === t.id ? 'active' : 'text-on-surface-variant'}`} onClick={() => setCurrentTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* Filter row */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search tickets…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <label className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 bg-white">
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">flag</span>
            <span className="text-on-surface-variant">Priority:</span>
            <select className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
              {PRIORITY_FILTERS.map(p => <option key={p} value={p}>{p || 'All'}</option>)}
            </select>
          </label>
          <span className="ml-auto text-[11px] text-on-surface-variant">{rows.length} of {items.length}</span>
        </div>

        {/* Bulk bar */}
        {checked.size > 0 && (
          <div className="bulk-bar show">
            <span className="text-[12px] font-semibold">{checked.size} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('assign')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">person_add</span>Assign</button>
            <button onClick={() => bulkAction('priority')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">flag</span>Set priority</button>
            <button onClick={() => bulkAction('solve')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">check_circle</span>Mark solved</button>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('delete')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
            <button className="ml-auto" onClick={() => bulkAction('close')}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>
        )}

        {/* Table */}
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
            <tr>
              <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={e => toggleAll(e.target.checked)} /></th>
              <th className="px-3 py-2">Ticket ID</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-dim">
            {rows.map(t => (
              <tr key={t.id} className="hover:bg-surface-container-low cursor-pointer" onClick={e => onRowClick(e, t.id)}>
                <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={checked.has(t.id)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(t.id)} /></td>
                <td className="px-3 py-2 font-mono text-primary font-medium">{t.id}</td>
                <td className="px-3 py-2 font-medium">{t.subject}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full ${t.avatarBg} text-white flex items-center justify-center text-[10px] font-bold`}>{t.initials}</div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{t.customer}</div>
                      <div className="text-[10px] text-on-surface-variant font-mono">{t.custId}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2"><span className={`stat ${t.priority.toLowerCase()}`}>{t.priority}</span></td>
                <td className="px-3 py-2"><span className={`stat ${t.status.toLowerCase()}`}>{t.status}</span></td>
                <td className="px-3 py-2 text-on-surface-variant">{t.assignee}</td>
                <td className="px-2 py-2 text-right">
                  <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => openRowMenu(e, t.id)}>
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── ROW ⋯ MENU ─── */}
      {menu && (
        <>
          <div className="row-menu open" style={{ top: menu.top, left: menu.left }} onClick={e => e.stopPropagation()}>
            <div className="menu-header">Ticket Actions</div>
            <button onClick={() => action('open-inbox', menu.id)}><span className="material-symbols-outlined">chat</span>Open ticket in Inbox</button>
            <button onClick={() => action('view-details', menu.id)}><span className="material-symbols-outlined">visibility</span>View ticket details</button>
            <div className="sep"></div>
            <div className="menu-header">Customer Record</div>
            <button onClick={() => action('view-crm', menu.id)}><span className="material-symbols-outlined">groups</span>View CRM record</button>
            <button onClick={() => action('email', menu.id)}><span className="material-symbols-outlined">mail</span>Email customer</button>
            <div className="sep"></div>
            <button className="danger" onClick={() => action('delete', menu.id)}><span className="material-symbols-outlined">delete</span>Delete ticket</button>
          </div>
          {/* Click-away catcher for row menu */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={closeMenu} />
        </>
      )}

      {/* ─── TICKET DETAIL DRAWER ─── */}
      {drawerTicket && (
        <>
          <div className="drawer-scrim open" onClick={() => setDrawerId(null)} />
          <div className="drawer open" key={drawerTicket.id}>
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">confirmation_number</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">Ticket {drawerTicket.id}</div>
                  <div className="text-[11px] text-on-surface-variant truncate">{drawerTicket.subject}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDrawerId(null)}>
                <span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-surface-container-low rounded-lg p-3 mb-4 flex justify-between items-center">
                <div>
                  <div className="text-headline-sm mb-1">{drawerTicket.subject}</div>
                  <div className="text-[11px] text-on-surface-variant">Requested by {drawerTicket.customer} (<span className="font-mono text-primary">{drawerTicket.custId}</span>)</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Status</label>
                  <select className="field-input" defaultValue={drawerTicket.status}><option>Open</option><option>Pending</option><option>Solved</option></select>
                </div>
                <div>
                  <label className="field-label">Priority</label>
                  <select className="field-input" defaultValue={drawerTicket.priority}><option>High</option><option>Urgent</option><option>Normal</option><option>Low</option></select>
                </div>
              </div>
              <div>
                <label className="field-label">Assignee</label>
                <select className="field-input" defaultValue={drawerTicket.assignee}><option>Maya Chen</option><option>Noah Kim</option><option>Unassigned</option></select>
              </div>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setDrawerId(null)}>Cancel</button>
              <div className="flex items-center gap-2">
                {/* Canonical CRM Jump */}
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Navigating to canonical CRM record...')}>
                  <span className="material-symbols-outlined text-[16px]">groups</span>View CRM
                </button>
                <button className="h-8 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => action('open-inbox', drawerTicket.id)}>Open in Inbox</button>
              </div>
            </div>
          </div>
        </>
      )}

    </main>
  );
}
