'use client';
import './sales.css';
import { SalesScreenProps, SALES_NAV } from './types';
import { exportToCsv } from '@/lib/csvExport';
import { usePlatformStore } from '@/lib/platformStore';

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyK = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export default function SalesOverview({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: SalesScreenProps) {
  const documents = usePlatformStore(s => s.documents);
  const parties = usePlatformStore(s => s.parties);
  const moneyMovements = usePlatformStore(s => s.moneyMovements);

  /* Real KPIs computed from the store (§1.1 single source of truth) */
  const invoices = documents.filter(d => d.type === 'Invoice');
  const notPaid = invoices.filter(d => d.balance > 0).reduce((s, d) => s + d.balance, 0);
  const paid = invoices.reduce((s, d) => s + d.amountPaid, 0);
  const deposited = moneyMovements
    .filter(m => m.type === 'Payment' && m.status === 'Deposited')
    .reduce((s, m) => s + m.amount, 0);
  const overdue = invoices.filter(d => d.status === 'Overdue');
  const overdueAmount = overdue.reduce((s, d) => s + d.balance, 0);
  const unsentDrafts = invoices.filter(d => d.status === 'Draft');
  const openInvoices = invoices
    .filter(d => d.balance > 0)
    .sort((a, b) => (a.dueDate || a.date).localeCompare(b.dueDate || b.date));
  const totalOutstanding = openInvoices.reduce((s, d) => s + d.balance, 0);
  const totalSent = invoices.reduce((s, d) => s + d.total, 0);
  const conversionToPaid = totalSent > 0 ? (paid / totalSent * 100) : 0;
  const paidToDeposited = paid > 0 ? (deposited / paid * 100) : 0;

  /* Top customers by revenue (real documents) */
  const customerRevenue: { name: string; invoices: number; revenue: number; avatar: string; color: string }[] = [];
  const AVATAR_COLORS = ['bg-qb-blue', 'bg-qb-green', 'bg-qb-teal', 'bg-qb-maroon', 'bg-qb-navy'];
  invoices.forEach(d => {
    const party = parties.find(p => p.id === d.partyId);
    if (!party) return;
    const existing = customerRevenue.find(c => c.name === party.name);
    if (existing) { existing.invoices++; existing.revenue += d.total; }
    else customerRevenue.push({
      name: party.name,
      invoices: 1,
      revenue: d.total,
      avatar: party.name[0]?.toUpperCase() || 'A',
      color: AVATAR_COLORS[customerRevenue.length % AVATAR_COLORS.length],
    });
  });
  const totalRevenue = customerRevenue.reduce((s, c) => s + c.revenue, 0) || 1;
  customerRevenue.sort((a, b) => b.revenue - a.revenue);
  const topCustomers = customerRevenue.slice(0, 5);

  /* Avg days to pay: average days between invoice date and payment date */
  const paidInvoices = invoices.filter(d => d.amountPaid > 0);
  const avgDays = paidInvoices.length > 0
    ? paidInvoices.reduce((s, d) => {
        const pay = moneyMovements.find(m => m.documentId === d.id);
        if (!pay) return s;
        const days = (new Date(pay.date).getTime() - new Date(d.date).getTime()) / 86400000;
        return s + Math.max(0, days);
      }, 0) / paidInvoices.length
    : 0;

  const attentionCount = overdue.length + unsentDrafts.length;

  /* Recent payments: real MoneyMovement rows for Invoice payments */
  const recentPayments = moneyMovements
    .filter(m => m.type === 'Payment' && m.documentId)
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const recentPaymentsTotal = recentPayments.reduce((s, m) => s + m.amount, 0);

  /* Recent activity: real activity log entries from documents */
  const recentActivity = documents
    .filter(d => d.type === 'Invoice' || d.type === 'Estimate' || d.type === 'SalesReceipt')
    .flatMap(d => d.activity.map(a => ({ ...a, docNumber: d.number, docType: d.type, partyId: d.partyId })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  /* CSV export uses real open invoices */
  function exportOpenInvoices() {
    const cols = [
      { key: 'number', label: 'Invoice' },
      { key: 'customer', label: 'Customer' },
      { key: 'dueDate', label: 'Due' },
      { key: 'amount', label: 'Amount' },
      { key: 'status', label: 'Status' },
    ];
    const rows = openInvoices.map(d => ({
      number: d.number,
      customer: parties.find(p => p.id === d.partyId)?.name || '—',
      dueDate: d.dueDate || d.date,
      amount: money(d.total),
      status: d.status,
    }));
    exportToCsv(rows, cols, 'sales-overview-open-invoices');
    onToast(`Exported ${rows.length} open invoices to CSV`);
  }

  return (
    <>
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Sales &amp; Get Paid</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Overview</span>
        </div>
      </div>

      <main className="px-6 pb-12">
        <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
          <div>
            <h1 className="text-headline-lg">Sales &amp; Get Paid — Overview</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Payment-request funnel: Not paid / Paid / Deposited · {invoices.length} invoices · {money(totalSent)} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onToast('Date range picker')} className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">calendar_today</span>Nov 2026 ▾
            </button>
            <button onClick={exportOpenInvoices} className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">download</span>Export
            </button>
          </div>
        </div>

        {/* KPI strip — clickable, computed from store */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="kpi-card" onClick={() => onNavigate(...SALES_NAV.invoices())}>
            <div className="kpi-label"><span className="w-2 h-2 rounded-full bg-qb-maroon"></span>Not paid</div>
            <div className="kpi-val">{money(notPaid)}</div>
            <div className="kpi-delta up">
              <span className="material-symbols-outlined text-[13px]">trending_up</span>{openInvoices.length} open invoices
            </div>
          </div>
          <div className="kpi-card" onClick={() => onNavigate(...SALES_NAV.invoices())}>
            <div className="kpi-label"><span className="w-2 h-2 rounded-full bg-qb-blue"></span>Paid</div>
            <div className="kpi-val">{money(paid)}</div>
            <div className="kpi-delta up">
              <span className="material-symbols-outlined text-[13px]">trending_up</span>{invoices.filter(d => d.status === 'Paid').length} invoices
            </div>
          </div>
          <div className="kpi-card" onClick={() => onToast('Drill down → deposited')}>
            <div className="kpi-label"><span className="w-2 h-2 rounded-full bg-qb-green"></span>Deposited</div>
            <div className="kpi-val">{money(deposited)}</div>
            <div className="kpi-delta up">
              <span className="material-symbols-outlined text-[13px]">trending_up</span>{moneyMovements.filter(m => m.status === 'Deposited').length} deposits
            </div>
          </div>
          <div className="kpi-card" onClick={() => onToast('Drill down → days')}>
            <div className="kpi-label"><span className="w-2 h-2 rounded-full bg-qb-teal"></span>Avg. days to pay</div>
            <div className="kpi-val">{avgDays.toFixed(1)}</div>
            <div className="kpi-delta up">
              <span className="material-symbols-outlined text-[13px]">trending_down</span>{paidInvoices.length} payments
            </div>
          </div>
        </div>

        {/* Create actions row */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
          <button onClick={() => onCreate('Invoice')} className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">receipt_long</span>Invoice
          </button>
          <button onClick={() => onCreate('Receive payment')} className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">price_check</span>Receive payment
          </button>
          <button onClick={() => onCreate('Payment link')} className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">link</span>Payment link
          </button>
          <button onClick={() => onCreate('Estimate')} className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">request_quote</span>Estimate
          </button>
          <button onClick={() => onCreate('Sales receipt')} className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">point_of_sale</span>Sales receipt
          </button>
          <button onClick={onOpenCreateFlyout} className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">apps</span>Show all
          </button>
        </div>

        {/* Payment funnel + Attention queue */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
          {/* Funnel */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-headline-sm">Payment funnel</h2>
              <span className="text-[11px] text-on-surface-variant">Not paid → Paid → Deposited</span>
            </div>
            <div className="space-y-1">
              <div className="stage-bar">
                <div className="lbl">Not paid</div>
                <div className="track">
                  <div className="fill" style={{ width: `${totalSent > 0 ? (notPaid / totalSent * 100).toFixed(0) : 0}%`, background: '#6b1e28' }}>
                    {moneyK(notPaid)}
                  </div>
                </div>
              </div>
              <div className="stage-bar">
                <div className="lbl">Paid</div>
                <div className="track">
                  <div className="fill" style={{ width: `${totalSent > 0 ? (paid / totalSent * 100).toFixed(0) : 0}%`, background: '#0077c5' }}>
                    {moneyK(paid)}
                  </div>
                </div>
              </div>
              <div className="stage-bar">
                <div className="lbl">Deposited</div>
                <div className="track">
                  <div className="fill" style={{ width: `${paid > 0 ? (deposited / paid * 100).toFixed(0) : 0}%`, background: '#1e5a38' }}>
                    {moneyK(deposited)}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-surface-dim text-[11px] text-on-surface-variant">
              <div>Total sent: <span className="font-semibold text-on-surface">{money(totalSent)}</span></div>
              <div>Conversion to paid: <span className="font-semibold text-on-surface">{conversionToPaid.toFixed(1)}%</span></div>
              <div>Paid → Deposited: <span className="font-semibold text-on-surface">{paidToDeposited.toFixed(1)}%</span></div>
            </div>
          </div>

          {/* Attention queue — real overdue + draft counts */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-headline-sm">Needs attention</h2>
              <span className="text-[11px] text-error font-semibold">{attentionCount} items</span>
            </div>
            <div className="space-y-2">
              {overdue.length > 0 && (
                <div className="drill-row" onClick={() => onNavigate(...SALES_NAV.invoices())}>
                  <span className="material-symbols-outlined text-[18px] text-error">warning</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-medium truncate">{overdue.length} overdue invoice{overdue.length !== 1 ? 's' : ''}</div>
                    <div className="text-[11px] text-on-surface-variant">{money(overdueAmount)} · oldest {Math.max(0, ...overdue.map(d => Math.floor((Date.now() - new Date(d.dueDate || d.date).getTime()) / 86400000)))} days</div>
                  </div>
                  <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
                </div>
              )}
              {unsentDrafts.length > 0 && (
                <div className="drill-row" onClick={() => onNavigate(...SALES_NAV.invoices())}>
                  <span className="material-symbols-outlined text-[18px] text-tertiary">drafts</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-medium truncate">{unsentDrafts.length} unsent invoice{unsentDrafts.length !== 1 ? 's' : ''}</div>
                    <div className="text-[11px] text-on-surface-variant">Drafts waiting to send</div>
                  </div>
                  <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
                </div>
              )}
              {attentionCount === 0 && (
                <div className="py-6 text-center text-body-sm text-on-surface-variant">All caught up.</div>
              )}
            </div>
          </div>
        </div>

        {/* Open invoices + Top customers */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
          {/* Open invoices */}
          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-headline-sm">Open invoices</h2>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  {openInvoices.length} open · {money(totalOutstanding)} outstanding
                </p>
              </div>
              <button onClick={() => onNavigate(...SALES_NAV.invoices())} className="text-[11px] font-semibold text-primary hover:underline">
                View all
              </button>
            </div>
            <div className="divide-y divide-surface-dim">
              {openInvoices.length === 0 && (
                <div className="py-6 px-5 text-center text-body-sm text-on-surface-variant">No open invoices — all paid.</div>
              )}
              {openInvoices.slice(0, 5).map(d => {
                const party = parties.find(p => p.id === d.partyId);
                const due = d.dueDate || d.date;
                const daysToDue = Math.floor((new Date(due).getTime() - Date.now()) / 86400000);
                const ageClass = daysToDue < 0 ? 'overdue' : daysToDue <= 7 ? 'soon' : 'current';
                const ageLabel = daysToDue < 0 ? `${Math.abs(daysToDue)}d overdue` : daysToDue === 0 ? 'Due today' : `${daysToDue}d left`;
                return (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-container-low cursor-pointer" onClick={() => onNavigate(...SALES_NAV.invoices())}>
                    <div className="min-w-0 flex-1">
                      <div className="text-body-sm font-medium">{d.number} · {party?.name || '—'}</div>
                      <div className="text-[11px] text-on-surface-variant">Due {due} · {ageLabel}</div>
                    </div>
                    <span className={`age ${ageClass}`}>{daysToDue < 0 ? 'Overdue' : daysToDue <= 7 ? 'Due soon' : 'Current'}</span>
                    <span className="text-body-sm font-semibold tabular-nums">{money(d.balance)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top customers by revenue — real documents */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-headline-sm">Top customers by revenue</h2>
              <button onClick={() => onNavigate(...SALES_NAV.customers())} className="text-[11px] text-primary font-semibold hover:underline">
                View all
              </button>
            </div>
            <div>
              {topCustomers.length === 0 && (
                <div className="py-6 text-center text-body-sm text-on-surface-variant">No customer revenue yet.</div>
              )}
              {topCustomers.map(c => (
                <div key={c.name} className="drill-row">
                  <div className={`avatar ${c.color}`}>{c.avatar}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{c.invoices} invoice{c.invoices !== 1 ? 's' : ''} · {((c.revenue / totalRevenue) * 100).toFixed(0)}% of revenue</div>
                  </div>
                  <span className="amt">{moneyK(c.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row: Recent payments + Recent sales activity — both from store */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Recent payments — real MoneyMovement rows */}
          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-headline-sm">Recent payments</h2>
              <span className="text-[11px] text-on-surface-variant">{recentPayments.length} payments · {money(recentPaymentsTotal)}</span>
            </div>
            <div className="divide-y divide-surface-dim">
              {recentPayments.length === 0 && (
                <div className="py-6 px-5 text-center text-body-sm text-on-surface-variant">No payments recorded yet.</div>
              )}
              {recentPayments.map(m => {
                const party = parties.find(p => p.id === m.partyId);
                const doc = documents.find(d => d.id === m.documentId);
                return (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-container-low cursor-pointer" onClick={() => onNavigate(...SALES_NAV.invoices())}>
                    <span className="material-symbols-outlined text-[18px] text-secondary">price_check</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-body-sm font-medium truncate">{party?.name || '—'} · {m.method}</div>
                      <div className="text-[11px] text-on-surface-variant">{m.date} · {doc?.number || '—'}</div>
                    </div>
                    <span className="text-body-sm font-semibold tabular-nums text-secondary">+{money(m.amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent sales activity — real activity log entries */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <h2 className="text-headline-sm mb-3">Recent sales activity</h2>
            <div className="space-y-3 text-body-sm">
              {recentActivity.length === 0 && (
                <div className="text-center text-on-surface-variant py-4">No activity yet.</div>
              )}
              {recentActivity.map((a, i) => {
                const party = parties.find(p => p.id === a.partyId);
                const icon = a.type === 'payment' ? 'price_check' : a.type === 'created' ? 'receipt_long' : a.type === 'status' ? 'sync' : 'circle';
                const color = a.type === 'payment' ? 'text-secondary' : a.type === 'created' ? 'text-qb-blue' : 'text-on-surface-variant';
                return (
                  <div key={i} className="flex items-start gap-2">
                    <span className={`material-symbols-outlined text-[16px] ${color} mt-0.5`}>{icon}</span>
                    <div className="min-w-0">
                      <div className="font-medium">{a.text}</div>
                      <div className="text-[11px] text-on-surface-variant">{a.actor} · {a.date}{party ? ` · ${party.name}` : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => onToast('Full sales activity history')} className="w-full mt-3 h-8 border border-surface-dim rounded text-body-sm hover:bg-surface-container-low flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-[14px]">history</span>View full history
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
