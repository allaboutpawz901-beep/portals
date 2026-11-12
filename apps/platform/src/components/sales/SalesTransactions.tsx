'use client';
import './sales.css';
import { useState, useMemo } from 'react';
import { SalesScreenProps, SALES_NAV } from './types';
import RowMenu from '@/components/ListPrimitives';
import type { DemoRow } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import { usePlatformStore, type DocumentType } from '@/lib/platformStore';
import DocumentEngine from '@/components/DocumentEngine';

type TxType = 'Invoice' | 'Sales receipt' | 'Credit memo' | 'Payment';
type TxStatus = 'Open' | 'Paid' | 'Overdue';

interface SalesRow {
  id: string;
  documentId: string | null; // null = money movement row (payment)
  docType: DocumentType | null;
  date: string;
  no: string;
  customer: string;
  type: TxType;
  due: string;
  amount: string;
  balance: string;
  status: TxStatus;
}

/* ISO (2026-11-01) → display (11/01/2026) */
function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return y && y.length === 4 ? `${m}/${d}/${y}` : iso;
}

type StatusTab = 'All' | 'Open' | 'Overdue' | 'Paid';
type TypeFilter = '' | 'Invoice' | 'Sales receipt' | 'Credit memo' | 'Payment';

const STATUS_TABS: StatusTab[] = ['All', 'Open', 'Overdue', 'Paid'];

const TYPE_BADGE_CLASS: Record<TxType, string> = {
  'Invoice': 'bg-qb-blue/10 text-qb-blue',
  'Payment': 'bg-qb-teal/10 text-qb-teal',
  'Sales receipt': 'bg-qb-green/10 text-qb-green',
  'Credit memo': 'bg-qb-maroon/10 text-qb-maroon',
};

const STATUS_BADGE_CLASS: Record<TxStatus, string> = {
  Open: 'bg-primary/10 text-primary',
  Paid: 'bg-secondary-container text-on-secondary-container',
  Overdue: 'bg-error-container text-on-error-container',
};

const CREATE_CHIPS: { icon: string; label: string }[] = [
  { icon: 'receipt_long', label: 'Invoice' },
  { icon: 'price_check', label: 'Receive payment' },
  { icon: 'point_of_sale', label: 'Sales receipt' },
  { icon: 'assignment_return', label: 'Credit memo' },
  { icon: 'request_quote', label: 'Estimate' },
];

export default function SalesTransactions({ onNavigate, onToast, onCreate, onOpenCreateFlyout, onOpenPeek }: SalesScreenProps) {
  const store = usePlatformStore();
  const [activeTab, setActiveTab] = useState<StatusTab>('All');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [searchText, setSearchText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  // Split-arrow dropdown — the real transaction-type menu (was a toast stub).
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  /* §1.1: modules are views over shared entities. Sales transactions =
     Invoice + Sales receipt + Credit memo documents + Payment movements. */
  const ROWS: SalesRow[] = (() => {
    const docRows: SalesRow[] = store.documents
      .filter(d => d.type === 'Invoice' || d.type === 'SalesReceipt' || d.type === 'CreditMemo')
      .map(d => {
        const type: TxType = d.type === 'Invoice' ? 'Invoice' : d.type === 'SalesReceipt' ? 'Sales receipt' : 'Credit memo';
        const status: TxStatus = d.status === 'Paid' || d.status === 'Deposited' ? 'Paid' : d.status === 'Overdue' ? 'Overdue' : 'Open';
        return {
          id: d.id, documentId: d.id, docType: d.type,
          date: fmtDate(d.date), no: d.number,
          customer: store.getParty(d.partyId)?.name || '—',
          type, due: fmtDate(d.dueDate),
          amount: `$${d.total.toFixed(2)}`, balance: `$${d.balance.toFixed(2)}`,
          status,
        };
      });
    const payRows: SalesRow[] = store.moneyMovements
      .filter(m => m.type === 'Payment')
      .map(m => ({
        id: m.id, documentId: null, docType: null,
        date: fmtDate(m.date), no: m.reference || m.id,
        customer: m.partyId ? (store.getParty(m.partyId)?.name || '—') : '—',
        type: 'Payment', due: '—',
        amount: `$${m.amount.toFixed(2)}`, balance: '$0.00',
        status: 'Paid',
      }));
    return [...docRows, ...payRows].sort((a, b) => b.date.localeCompare(a.date));
  })();

  const filteredRows = (() => {
    const q = searchText.trim().toLowerCase();
    return ROWS.filter((r) => {
      const matchType = !typeFilter || r.type === typeFilter;
      const matchStatus =
        activeTab === 'All' ? true : r.status === activeTab;
      const matchSearch =
        !q ||
        r.date.toLowerCase().includes(q) ||
        r.no.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.due.toLowerCase().includes(q) ||
        r.amount.toLowerCase().includes(q) ||
        r.balance.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q);
      return matchType && matchStatus && matchSearch;
    });
  })();

  const total = ROWS.length;
  const shown = filteredRows.length;
  const countText = `1–${shown} of ${total}`;

  const goOverview = () => {
    const [d, s] = SALES_NAV.overview();
    onNavigate(d, s);
  };
  const goTransactions = () => {
    const [d, s] = SALES_NAV.transactions();
    onNavigate(d, s);
  };

  /* Row click opens the document page (§1.5) */
  if (editingId) {
    const doc = store.getDocument(editingId);
    if (doc) {
      return <DocumentEngine type={doc.type} documentId={editingId} onToast={onToast} onClose={() => setEditingId(null)} />;
    }
  }

  return (
    <>
      {/* ═══════════ CONTEXT HEADER ═══════════ */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <button type="button" onClick={goOverview} className="text-label-md hover:text-primary cursor-pointer">
            Sales &amp; Get Paid
          </button>
          <span className="text-outline">/</span>
          <button type="button" onClick={goTransactions} className="text-label-md text-primary font-semibold hover:underline cursor-pointer">
            Sales transactions
          </button>
        </div>
      </div>

      {/* ═══════════ SALES TRANSACTIONS PAGE ═══════════ */}
      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="text-headline-lg">Sales transactions</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">Invoice, Receipt, Credit, Payment — unified ledger. Default sort: Date desc.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex split-btn relative">
              <button
                type="button"
                onClick={() => onCreate('New transaction')}
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>New transaction
              </button>
              <button
                type="button"
                aria-label="New transaction options"
                onClick={() => setNewMenuOpen(v => !v)}
                className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"
              >
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
              {newMenuOpen && (
                <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 60 }} onClick={() => setNewMenuOpen(false)}>
                  <div className="menu-header">New transaction</div>
                  {CREATE_CHIPS.map(c => (
                    <button key={c.label} onClick={() => onCreate(c.label)}>
                      <span className="material-symbols-outlined">{c.icon}</span>{c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                const cols = [
                  { key: 'date', label: 'Date' },
                  { key: 'no', label: 'No.' },
                  { key: 'customer', label: 'Customer' },
                  { key: 'type', label: 'Type' },
                  { key: 'due', label: 'Due' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'balance', label: 'Balance' },
                  { key: 'status', label: 'Status' },
                ];
                exportToCsv(filteredRows as unknown as Record<string, unknown>[], cols, 'sales-transactions');
                onToast(`Exported ${filteredRows.length} records to CSV`);
              }}
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>Export
            </button>
            <button
              type="button"
              onClick={() => onToast('Customize panel')}
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>Customize
            </button>
          </div>
        </div>

        {/* Create actions row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
          {CREATE_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onCreate(chip.label)}
              className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">{chip.icon}</span>{chip.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onOpenCreateFlyout}
            className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">apps</span>Show all
          </button>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
          {/* Status view tabs */}
          <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`h-full px-3 text-label-md tab-underline ${activeTab === tab ? 'active' : 'text-on-surface-variant'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Filter bar with TYPE dropdown */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
            <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
              <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
                placeholder="Filter rows…"
              />
            </div>
            <label className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">category</span>
              <span className="text-on-surface-variant">Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none"
              >
                <option value="">All types</option>
                <option value="Invoice">Invoice</option>
                <option value="Sales receipt">Sales receipt</option>
                <option value="Credit memo">Credit memo</option>
                <option value="Payment">Payment</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => onToast('Filter…')}
              className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">filter_list</span>Filter
            </button>
            <button
              type="button"
              onClick={() => onToast('Date range picker')}
              className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">calendar_today</span>Date range
            </button>
            <button
              type="button"
              onClick={() => onToast('Saved views')}
              className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views
            </button>
            <span className="ml-auto text-[11px] text-on-surface-variant">{countText}</span>
          </div>

          {/* Table */}
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" /></th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {filteredRows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => {
                    if (r.documentId) setEditingId(r.documentId);
                    else onToast(`Payment ${r.no} — deposited ${r.date}`);
                  }}
                  className="hover:bg-surface-container-low cursor-pointer sales-row"
                >
                  <td className="px-3 py-2"><input type="checkbox" className="row-check" /></td>
                  <td className="px-3 py-2">{r.date}</td>
                  <td className="px-3 py-2 font-medium">{r.no}</td>
                  <td className="px-3 py-2">{r.customer}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_BADGE_CLASS[r.type]}`}>{r.type}</span>
                  </td>
                  <td className="px-3 py-2">{r.due}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.amount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.balance}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-label-sm ${STATUS_BADGE_CLASS[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <RowMenu
                      ariaLabel={`Row actions for ${r.no}`}
                      items={[
                        {
                          label: 'View',
                          icon: 'open_in_new',
                          onClick: () => onOpenPeek?.(r as unknown as DemoRow, 'sales'),
                        },
                        {
                          label: 'Edit',
                          icon: 'edit',
                          onClick: () => {
                            if (r.documentId) setEditingId(r.documentId);
                            else onToast(`Payment ${r.no} has no editable document`);
                          },
                        },
                        {
                          label: 'Duplicate',
                          icon: 'content_copy',
                          onClick: () => {
                            if (r.documentId) {
                              const newId = store.duplicateDocument(r.documentId);
                              if (newId) { onToast(`Duplicated ${r.no}`); setEditingId(newId); }
                            } else onToast('Payments cannot be duplicated');
                          },
                        },
                        {
                          label: 'Categorize',
                          icon: 'category',
                          onClick: () => onToast(`Categorizing ${r.no}`),
                        },
                        {
                          label: 'Match',
                          icon: 'compare_arrows',
                          onClick: () => onToast(`Matching ${r.no}`),
                        },
                        {
                          label: 'Print',
                          icon: 'print',
                          dividerBefore: true,
                          onClick: () => window.print(),
                        },
                        {
                          label: 'Delete',
                          icon: 'delete',
                          danger: true,
                          onClick: () => {
                            if (r.documentId) { store.deleteDocument(r.documentId); onToast(`Deleted ${r.no}`); }
                            else onToast('Payments are removed from Banking');
                          },
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
