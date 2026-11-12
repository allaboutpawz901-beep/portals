'use client';
/* StatementsScreen — 1:1 port of upload/Contacts_extracted/Contacts/statements.html
   Now derived from the shared store: a statement is the party's invoice
   activity for a period (§Sales: "Statement | Workspace (batch)"). */
import { useState } from 'react';
import { exportToCsv } from '@/lib/csvExport';
import { usePlatformStore } from '@/lib/platformStore';

interface StatementsScreenProps { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void; }

interface StmtLine { date: string; desc: string; amt: string; paid: string; bal: string; }
interface Stmt {
  id: string; customer: string; email: string; period: string; date: string; due: string;
  invoiced: string; paid: string; dueAmt: string; status: string; balance: string; lines: StmtLine[];
  avatarColor: string; avatarLetter: string;
  partyId: string;
}

const AVATAR_COLORS = ['bg-qb-blue', 'bg-qb-teal', 'bg-qb-green', 'bg-qb-maroon', 'bg-qb-navy'];
const money = (n: number) => `$${n.toFixed(2)}`;
const monthOf = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };

function statusClass(s: string) { return s === 'Sent' ? 'sent' : s === 'Overdue' ? 'overdue' : s === 'Paid' ? 'paid' : s === 'Draft' ? 'draft' : s === 'Partial' ? 'partial' : 'sent'; }

export default function StatementsScreen({ onToast }: StatementsScreenProps) {
  const store = usePlatformStore();

  /* A statement = one customer's invoice activity for their most recent
   period, derived live from the shared store. */
  const items: Stmt[] = store.parties
    .filter(p => p.roles.includes('Customer'))
    .map((p, ci) => {
      const invoices = store.documents.filter(d => d.partyId === p.id && d.type === 'Invoice');
      if (invoices.length === 0) return null;
      const invoiced = invoices.reduce((s, d) => s + d.total, 0);
      const paid = invoices.reduce((s, d) => s + d.amountPaid, 0);
      const due = invoices.reduce((s, d) => s + d.balance, 0);
      const hasOverdue = invoices.some(d => d.status === 'Overdue');
      const hasDraft = invoices.some(d => d.status === 'Draft');
      const status = hasOverdue ? 'Overdue' : hasDraft ? 'Draft' : due <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Sent';
      const latest = invoices.reduce((a, b) => (a.date > b.date ? a : b));
      const period = monthOf(latest.date);
      return {
        id: `ST-${p.id.slice(-4)}`, partyId: p.id,
        customer: p.name, email: p.email,
        period, date: latest.date, due: latest.dueDate || latest.date,
        invoiced: money(invoiced), paid: `−${money(paid)}`, dueAmt: money(due),
        status, balance: money(due),
        lines: invoices.map(d => ({ date: d.date.slice(5).replace('-', '/'), desc: `Invoice ${d.number}`, amt: money(d.total), paid: money(d.amountPaid), bal: money(d.balance) })),
        avatarColor: AVATAR_COLORS[ci % AVATAR_COLORS.length], avatarLetter: (p.name[0] || '?').toUpperCase(),
      };
    }).filter((s): s is Stmt => s !== null);

  const [tab, setTab] = useState('All');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const filtered = items.filter(s => {
    if (hidden.has(s.id)) return false;
    const tabOK = tab === 'All' || s.status === tab || (tab === 'Awaiting payment' && (s.status === 'Sent' || s.status === 'Partial'));
    const qOK = !q || (s.customer + ' ' + s.period + ' ' + s.id).toLowerCase().includes(q.toLowerCase());
    return tabOK && qOK;
  });

  const allChecked = filtered.length > 0 && filtered.every(s => selected.has(s.id));
  const someChecked = filtered.some(s => selected.has(s.id));
  const drawerStmt = drawerId ? items.find(s => s.id === drawerId) : null;

  function toggleRow(id: string) { setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleAll() { if (allChecked) setSelected(new Set()); else setSelected(new Set(filtered.map(s => s.id))); }

  function rowAction(act: string, s: Stmt) {
    setRowMenuForId(null);
    switch (act) {
      case 'view': case 'edit': setDrawerId(s.id); break;
      case 'duplicate': onToast(`Statement regenerated for ${s.customer} — reopens with latest invoice activity`); break;
      case 'send': onToast(`Statement sent to ${s.customer} (${s.email})`); break;
      case 'remind': onToast(`Reminder sent for ${s.id} to ${s.customer}`); break;
      case 'print': window.print(); break;
      case 'mark-paid': {
        // Real money movement: record payment against each open invoice
        const open = store.documents.filter(d => d.partyId === s.partyId && d.type === 'Invoice' && d.balance > 0);
        open.forEach(d => store.recordPayment(d.id, d.balance, 'Check', 'Checking'));
        onToast(`${s.customer} marked as paid — ${open.length} payment${open.length !== 1 ? 's' : ''} recorded`);
        break;
      }
      case 'receive-payment': onToast(`Receive payment for ${s.customer} — use the Receive payment workspace`); break;
      case 'delete': setHidden(prev => { const n = new Set(prev); n.add(s.id); return n; }); onToast(`Statement ${s.id} removed from the list`); break;
    }
  }

  function bulkAction(act: string) {
    if (act === 'close') { setSelected(new Set()); return; }
    const n = selected.size;
    if (act === 'delete') { setHidden(prev => new Set([...prev, ...selected])); }
    if (act === 'send') { onToast(`Statements sent to ${n} customers`); }
    else onToast(`${act.charAt(0).toUpperCase() + act.slice(1)} on ${n} statement${n !== 1 ? 's' : ''}`);
    setSelected(new Set());
  }

  function handleExport() {
    exportToCsv(filtered as unknown as Record<string, unknown>[], [
      { key: 'id', label: 'Statement ID' }, { key: 'customer', label: 'Customer' }, { key: 'period', label: 'Period' },
      { key: 'date', label: 'Sent' }, { key: 'due', label: 'Due' }, { key: 'balance', label: 'Balance' }, { key: 'status', label: 'Status' },
    ], 'statements');
    onToast(`Exported ${filtered.length} statements`);
  }

  const tabs = ['All', 'Draft', 'Sent', 'Awaiting payment', 'Paid', 'Overdue'];

  return (
    <main className="px-6 pb-12">
      {/* BREADCRUMB */}
      <div className="flex items-center gap-1 text-label-sm text-on-surface-variant mt-4 mb-1">
        <span>Contacts</span><span className="text-outline">/</span><span className="text-label-md">Customer Hub</span><span className="text-outline">/</span><span className="text-label-md text-primary font-semibold">Statements</span>
      </div>

      {/* PAGE HEADER */}
      <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
        <div><h1 className="text-headline-lg">Statements</h1><p className="text-body-sm text-on-surface-variant mt-0.5">Batch billing summary — send a customer their account activity for a period</p></div>
        <div className="flex items-center gap-2">
          <div className="flex split-btn">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" onClick={() => setDrawerId('__new__')}><span className="material-symbols-outlined text-[16px]">add</span>New statement</button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={() => setNewMenuOpen(v => !v)}><span className="material-symbols-outlined text-[16px]">expand_more</span></button>
          </div>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}><span className="material-symbols-outlined text-[16px]">download</span>Export</button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Customize panel')}><span className="material-symbols-outlined text-[16px]">tune</span>Customize</button>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Statements</div><div className="text-headline-sm mt-1 tabular-nums">{items.length}</div><div className="text-[11px] text-on-surface-variant mt-0.5">{money(items.reduce((s, x) => s + (parseFloat(x.invoiced.replace(/[$,]/g, '')) || 0), 0))} invoiced total</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Awaiting payment</div><div className="text-headline-sm mt-1 tabular-nums">{items.filter(s => s.status === 'Sent' || s.status === 'Partial').length}</div><div className="text-[11px] text-on-surface-variant mt-0.5">{money(items.reduce((s, x) => s + (parseFloat(x.dueAmt.replace(/[$,]/g, '')) || 0), 0))} outstanding</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Collected</div><div className="text-headline-sm mt-1 tabular-nums text-secondary">{money(items.reduce((s, x) => s + (parseFloat(x.paid.replace(/[−$,]/g, '')) || 0), 0))}</div><div className="text-[11px] text-on-surface-variant mt-0.5">across all statements</div></div>
        <div className="bg-white rounded-xl border border-surface-dim p-3"><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Overdue</div><div className="text-headline-sm mt-1 tabular-nums text-error">{items.filter(s => s.status === 'Overdue').length}</div><div className="text-[11px] text-on-surface-variant mt-0.5">{money(items.filter(s => s.status === 'Overdue').reduce((s, x) => s + (parseFloat(x.dueAmt.replace(/[$,]/g, '')) || 0), 0))} past due</div></div>
      </div>

      {/* CREATE ACTIONS ROW */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => setDrawerId('__new__')}><span className="material-symbols-outlined text-[16px]">summarize</span>Statement</button>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => setBatchOpen(true)}><span className="material-symbols-outlined text-[16px]">campaign</span>Batch send</button>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => onToast('New customer — party drawer')}><span className="material-symbols-outlined text-[16px]">person_add</span>Customer</button>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => onToast('New invoice')}><span className="material-symbols-outlined text-[16px]">receipt_long</span>Invoice</button>
        <button className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1" onClick={() => onToast('Global Create flyout')}><span className="material-symbols-outlined text-[16px]">apps</span>Show all</button>
      </div>

      {/* TABLE CARD */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          {tabs.map(t => <button key={t} className={`h-full px-3 text-label-md tab-underline ${tab === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => { setTab(t); setSelected(new Set()); }}>{t}</button>)}
        </div>
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]"><span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span><input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter by customer, period…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">calendar_today</span>Date range</button>
          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Saved views')}><span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views</button>
          <span className="ml-auto text-[11px] text-on-surface-variant">{filtered.length} of {items.length}</span>
        </div>
        {selected.size > 0 && (
          <div className="bulk-bar show">
            <span className="text-[12px] font-semibold">{selected.size} selected</span>
            <span className="w-px h-4 bg-white/30" />
            <button onClick={() => bulkAction('send')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">send</span>Send</button>
            <button onClick={() => bulkAction('print')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">print</span>Print</button>
            <button onClick={() => bulkAction('remind')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">notifications_active</span>Remind</button>
            <span className="w-px h-4 bg-white/30" />
            <button onClick={() => bulkAction('delete')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
            <button className="ml-auto" onClick={() => bulkAction('close')}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>
        )}
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
            <tr>
              <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} /></th>
              <th className="px-3 py-2">Customer</th><th className="px-3 py-2">Period</th><th className="px-3 py-2">Sent</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2">Status</th><th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-dim">
            {filtered.map(s => (
              <tr key={s.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => setDrawerId(s.id)}>
                <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={selected.has(s.id)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(s.id)} /></td>
                <td className="px-3 py-2"><div className="flex items-center gap-2"><div className={`st-avatar ${s.avatarColor}`}>{s.avatarLetter}</div><div className="min-w-0"><div className="font-medium truncate">{s.customer}</div><div className="text-[11px] text-on-surface-variant">{s.email}</div></div></div></td>
                <td className="px-3 py-2 text-on-surface-variant">{s.period}</td>
                <td className="px-3 py-2 text-on-surface-variant">{s.date === '2026-11-30' ? '—' : s.date}</td>
                <td className={`px-3 py-2 ${s.status === 'Overdue' ? 'text-error' : 'text-on-surface-variant'}`}>{s.due}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${s.status === 'Overdue' ? 'text-error' : ''}`}>{s.balance}</td>
                <td className="px-3 py-2"><span className={`st ${statusClass(s.status)}`}>{s.status}</span></td>
                <td className="px-2 py-2 text-right relative">
                  <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === s.id ? null : s.id); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button>
                  {rowMenuForId === s.id && (
                    <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                      <div className="menu-header">This statement</div>
                      <button onClick={() => rowAction('view', s)}><span className="material-symbols-outlined">open_in_new</span>Open statement</button>
                      <button onClick={() => rowAction('edit', s)}><span className="material-symbols-outlined">edit</span>Edit</button>
                      <button onClick={() => rowAction('duplicate', s)}><span className="material-symbols-outlined">content_copy</span>Duplicate for next period</button>
                      <div className="sep" />
                      <div className="menu-header">Send</div>
                      {s.status === 'Draft' && <button onClick={() => rowAction('send', s)}><span className="material-symbols-outlined">send</span>Send</button>}
                      {(s.status === 'Sent' || s.status === 'Overdue' || s.status === 'Partial') && <button onClick={() => rowAction('remind', s)}><span className="material-symbols-outlined">notifications_active</span>Send reminder</button>}
                      <button onClick={() => rowAction('print', s)}><span className="material-symbols-outlined">print</span>Print / download PDF</button>
                      <div className="sep" />
                      <div className="menu-header">Payment</div>
                      {(s.status === 'Sent' || s.status === 'Overdue' || s.status === 'Partial') && <button onClick={() => rowAction('mark-paid', s)}><span className="material-symbols-outlined">check_circle</span>Mark as paid</button>}
                      {(s.status === 'Sent' || s.status === 'Overdue' || s.status === 'Partial') && <button onClick={() => rowAction('receive-payment', s)}><span className="material-symbols-outlined">price_check</span>Receive payment…</button>}
                      <div className="sep" />
                      <button className="danger" onClick={() => rowAction('delete', s)}><span className="material-symbols-outlined">delete</span>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New split menu */}
      {newMenuOpen && (
        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={() => setNewMenuOpen(false)}>
          <div className="menu-header">New statement</div>
          <button onClick={() => setDrawerId('__new__')}><span className="material-symbols-outlined">person</span>Single customer</button>
          <button onClick={() => setBatchOpen(true)}><span className="material-symbols-outlined">campaign</span>Batch send to many…</button>
          <div className="sep" />
          <button onClick={() => onToast('Generating from invoices — pick period')}><span className="material-symbols-outlined">receipt_long</span>Generate from invoices…</button>
        </div>
      )}

      {/* Click-away for row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* Statement drawer */}
      {drawerId && (
        <>
          <div className="drawer-scrim open" onClick={() => setDrawerId(null)} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">summarize</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">{drawerId === '__new__' ? 'Statement ST-1103' : `Statement ${drawerId}`}</div>
                  <div className="text-[11px] text-on-surface-variant">{drawerId === '__new__' ? 'New statement · Nov 2026' : `${drawerStmt?.customer || ''} · ${drawerStmt?.period || ''}`}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" title="Download"><span className="material-symbols-outlined text-[18px]">download</span></button>
                <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDrawerId(null)}><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label">Customer</label><input className="field-input" defaultValue={drawerStmt?.customer || ''} readOnly /></div>
                <div><label className="field-label">Period</label><select className="field-input" defaultValue={drawerStmt?.period || 'Nov 2026'}><option>Oct 2026</option><option>Sep 2026</option><option>Aug 2026</option><option>Jul 2026</option><option>Nov 2026</option></select></div>
                <div><label className="field-label">Statement date</label><input className="field-input" type="date" defaultValue={drawerStmt?.date || '2026-11-30'} /></div>
                <div><label className="field-label">Due date</label><input className="field-input" type="date" defaultValue={drawerStmt?.due || '2026-12-31'} /></div>
              </div>
              <div>
                <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Statement preview</div>
                <div className="stmt-doc">
                  <div className="flex items-center justify-between mb-3"><div><div className="font-bold text-body-md">ManageKube LLC</div><div className="text-[11px] text-on-surface-variant">ManageKube LLC · Statement</div></div><div className="text-right text-[11px] text-on-surface-variant"><div>{drawerStmt?.period || 'Nov 2026'}</div><div>Due {drawerStmt?.due || '2026-12-31'}</div></div></div>
                  <div className="border-t border-surface-dim pt-3 mb-3"><div className="text-[11px] text-on-surface-variant uppercase font-bold mb-1">Bill to</div><div className="font-medium">{drawerStmt?.customer || '—'}</div></div>
                  <div className="stmt-line head"><span>Date</span><span>Invoice / activity</span><span className="text-right">Amount</span><span className="text-right">Paid</span><span className="text-right">Balance</span></div>
                  {(drawerStmt?.lines || []).map((l, i) => <div key={i} className="stmt-line"><span className="text-on-surface-variant">{l.date}</span><span>{l.desc}</span><span className="text-right tabular-nums">{l.amt}</span><span className="text-right tabular-nums">{l.paid}</span><span className="text-right tabular-nums">{l.bal}</span></div>)}
                  <div className="flex justify-end pt-3 mt-3 border-t border-surface-dim"><div className="w-56 space-y-1 text-[12px]"><div className="flex justify-between"><span className="text-on-surface-variant">Opening balance</span><span className="tabular-nums">$0.00</span></div><div className="flex justify-between"><span className="text-on-surface-variant">Invoiced</span><span className="tabular-nums">{drawerStmt?.invoiced || '$0.00'}</span></div><div className="flex justify-between"><span className="text-on-surface-variant">Paid</span><span className="tabular-nums">{drawerStmt?.paid || '$0.00'}</span></div><div className="flex justify-between pt-1 border-t border-surface-dim font-bold"><span>Amount due</span><span className="tabular-nums">{drawerStmt?.dueAmt || '$0.00'}</span></div></div></div>
                </div>
              </div>
              <div><label className="field-label">Message to customer</label><textarea className="field-input" style={{ height: 56, padding: '8px 10px', fontFamily: 'inherit' }} defaultValue="Please review the attached statement at your convenience." /></div>
              <div><div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Delivery</div><div className="space-y-2"><label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" defaultChecked /> Email to <strong className="ml-1">{drawerStmt?.email || '—'}</strong></label><label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" /> Include PDF attachment</label><label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" /> Also print for mail</label></div></div>
            </div>
            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setDrawerId(null)}>Cancel</button>
              <div className="flex items-center gap-2">
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low flex items-center gap-1" onClick={() => { onToast('Printing statement PDF'); }}><span className="material-symbols-outlined text-[16px] align-middle mr-1">print</span>Print</button>
                <div className="split-btn flex"><button className="h-8 px-3 border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main" onClick={() => { onToast('Statement saved as draft'); setDrawerId(null); }}>Save draft</button><button className="h-8 px-1.5 border border-surface-dim hover:bg-surface-container-low split-btn-arrow"><span className="material-symbols-outlined text-[16px]">expand_more</span></button></div>
                <div className="split-btn flex"><button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main" onClick={() => { onToast('Statement sent to customer'); setDrawerId(null); }}>Send to customer</button><button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"><span className="material-symbols-outlined text-[16px]">expand_more</span></button></div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Batch send modal */}
      {batchOpen && (
        <div className="modal-scrim open" onClick={() => setBatchOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6"><div className="flex items-center gap-2 mb-3"><span className="material-symbols-outlined text-[20px] text-primary">campaign</span><h2 className="text-headline-sm">Batch send statements</h2></div><p className="text-body-sm text-on-surface-variant mb-4">Send statements to all customers with an open balance for the selected period.</p><div className="space-y-3"><div><label className="field-label">Period</label><select className="field-input"><option>Oct 2026</option><option>Sep 2026</option><option>Nov 2026</option></select></div><div className="bg-surface-container-low rounded-lg p-3 text-[11px] text-on-surface-variant"><div className="flex items-center gap-2 mb-1"><span className="material-symbols-outlined text-[14px] text-secondary">check</span>3 customers have open balances</div><div className="flex items-center gap-2 mb-1"><span className="material-symbols-outlined text-[14px] text-secondary">check</span>2 have overdue balances</div><div className="flex items-center gap-2"><span className="material-symbols-outlined text-[14px] text-tertiary">info</span>Statements will be emailed as PDFs</div></div></div></div>
            <div className="flex gap-2 px-4 pb-4"><button className="flex-1 h-9 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setBatchOpen(false)}>Cancel</button><button className="flex-1 h-9 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => { setBatchOpen(false); onToast('Statements sent to 3 customers'); }}><span className="material-symbols-outlined text-[16px] align-middle mr-1">send</span>Send to 3 customers</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
