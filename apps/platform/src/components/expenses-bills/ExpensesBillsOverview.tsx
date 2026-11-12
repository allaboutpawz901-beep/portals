'use client';

import './expenses-bills.css';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ExpensesBillsScreenProps } from './types';
import { EBL_NAV } from './types';
import { usePlatformStore } from '@/lib/platformStore';

/* ════════════════════════════════════════════════════════════════
   Data shapes (sourced 1:1 from the inline <script> in the HTML)
   ════════════════════════════════════════════════════════════════ */

interface ReceiptData {
  vendor: string;
  date: string;        // ISO yyyy-mm-dd
  amount: string;      // decimal like "142.50"
  category: string;
  account: string;
}

const RECEIPT_DATA: Record<string, ReceiptData> = {
  Staples: { vendor: 'Staples', date: '2026-10-30', amount: '142.50', category: 'Office supplies', account: 'Visa \u00B04421' },
  FedEx:   { vendor: 'FedEx',   date: '2026-10-29', amount: '84.20',  category: 'Shipping',         account: 'Bank \u00B09910' },
  Adobe:   { vendor: 'Adobe',   date: '2026-10-30', amount: '59.99',  category: 'Software',         account: 'Visa \u00B04421' },
};

interface BillData {
  vendor: string;
  no: string;
  date: string;        // ISO
  due: string;        // ISO
  balance: string;    // "$2,880.00"
  doc: string;        // "PF-9211.pdf"
}

const BILL_DATA: Record<string, BillData> = {
  Printful: { vendor: 'Printful', no: 'PF-9211', date: '2026-10-11', due: '2026-11-10', balance: '$2,880.00', doc: 'PF-9211.pdf' },
  Gelato:   { vendor: 'Gelato',   no: 'GL-4402', date: '2026-10-16', due: '2026-11-15', balance: '$1,200.00', doc: 'GL-4402.pdf' },
  Printify: { vendor: 'Printify', no: 'PR-3388', date: '2026-09-30', due: '2026-10-30', balance: '$640.00',   doc: 'PR-3388.pdf' },
};

type BillStatus = 'For review' | 'Unpaid' | 'Overdue';

interface BillRow {
  vendor: string;
  no: string;
  due: string;        // display "11/10/2026"
  amount: string;    // display "$2,880.00"
  status: BillStatus;
  overdue?: boolean;
}

const INITIAL_BILLS: BillRow[] = [
  { vendor: 'Printful', no: 'PF-9211', due: '11/10/2026', amount: '$2,880.00', status: 'For review' },
  { vendor: 'Gelato',   no: 'GL-4402', due: '11/15/2026', amount: '$1,200.00', status: 'Unpaid' },
  { vendor: 'Printify', no: 'PR-3388', due: '10/30/2026', amount: '$640.00',   status: 'Overdue', overdue: true },
];

interface PayBillRow {
  vendor: string;
  billNo: string;
  due: string;
  amount: string;      // display "$2,880.00"
  overdue?: boolean;
  checked: boolean;
  payment: string;     // input value with commas "2,880.00"
}

const INITIAL_PAY_BILLS: PayBillRow[] = [
  { vendor: 'Printful', billNo: 'PF-9211', due: '11/10/2026', amount: '$2,880.00', checked: false, payment: '2,880.00' },
  { vendor: 'Gelato',   billNo: 'GL-4402', due: '11/15/2026', amount: '$1,200.00', checked: false, payment: '1,200.00' },
  { vendor: 'Printify', billNo: 'PR-3388', due: '10/30/2026', amount: '$640.00',   overdue: true, checked: false, payment: '640.00' },
];

/* Helper: format a numeric string with comma-separated integer part */
function formatWithCommas(input: string): string {
  const cleaned = input.replace(/[^0-9.,]/g, '');
  if (!cleaned) return '';
  const [intRaw, ...rest] = cleaned.split('.');
  const decPart = rest.length > 0 ? rest.join('') : undefined;
  const intNum = parseInt(intRaw.replace(/,/g, '') || '0', 10);
  if (isNaN(intNum)) return cleaned;
  const intFormatted = intNum.toLocaleString('en-US');
  return decPart !== undefined ? `${intFormatted}.${decPart}` : intFormatted;
}

/* Helper: parse "2,880.00" → 2880 */
function parseAmount(s: string): number {
  const v = parseFloat((s || '0').replace(/,/g, ''));
  return isNaN(v) ? 0 : v;
}

/* Helper: ISO date "2026-10-30" → US "10/30/2026" (matches the hardcoded receipt-row display in the source HTML) */
function isoToUS(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/* ════════════════════════════════════════════════════════════════ */

export default function ExpensesBillsOverview({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: ExpensesBillsScreenProps) {
  const store = usePlatformStore();

  /* Derive bills + KPIs reactively from store.documents */
  const bills: BillRow[] = store.documents
    .filter(d => d.type === 'Bill')
    .map(d => {
      const party = store.getParty(d.partyId);
      const due = d.dueDate || d.date;
      const overdue = new Date(due) < new Date();
      const status: BillStatus =
        d.status === 'For review' ? 'For review'
        : d.status === 'Paid' ? 'For review' /* paid bills not shown here */
        : overdue ? 'Overdue'
        : 'Unpaid';
      return {
        vendor: party?.name || '—',
        no: d.number,
        due: isoToUS(due),
        amount: `$${d.balance.toFixed(2)}`,
        status: d.status === 'Paid' ? 'For review' : status,
        overdue: overdue && d.status !== 'Paid',
      };
    });

  const payBills: PayBillRow[] = store.documents
    .filter(d => d.type === 'Bill' && d.balance > 0)
    .map(d => {
      const party = store.getParty(d.partyId);
      const due = d.dueDate || d.date;
      const overdue = new Date(due) < new Date();
      return {
        vendor: party?.name || '—',
        billNo: d.number,
        due: isoToUS(due),
        amount: `$${d.balance.toFixed(2)}`,
        overdue,
        checked: false,
        payment: d.balance.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
      };
    });

  /* ── Toast ── */
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 1800);
  }, []);

  /* ── Receipts inbox (local sample for the OCR capture panel) ── */
  const [receipts, setReceipts] = useState<string[]>(['Staples', 'FedEx', 'Adobe']);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [currentReceipt, setCurrentReceipt] = useState<string | null>(null);
  const [rcForm, setRcForm] = useState<{ vendor: string; date: string; amount: string; category: string; account: string }>({
    vendor: '', date: '', amount: '', category: '', account: '',
  });

  /* ── Bills due table ── */
  const [billsState, setBillsState] = useState<BillRow[]>(bills);

  /* ── Bill drawer ── */
  const [billOpen, setBillOpen] = useState(false);
  const [currentBill, setCurrentBill] = useState<string | null>(null);
  const [billForm, setBillForm] = useState<{ vendor: string; no: string; date: string; due: string; balance: string; doc: string }>({
    vendor: '', no: '', date: '', due: '', balance: '', doc: '',
  });

  /* ── Pay bills drawer ── */
  const [payBillsOpen, setPayBillsOpen] = useState(false);
  const [payBillsState, setPayBillsState] = useState<PayBillRow[]>(payBills);

  /* ── Row ⋯ menu ── */
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [rowMenuVendor, setRowMenuVendor] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const rowMenuBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const rowMenuElRef = useRef<HTMLDivElement | null>(null);

  /* ── Escape key closes any open drawer/menu ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (rowMenuOpen) { setRowMenuOpen(false); return; }
      if (receiptOpen) { setReceiptOpen(false); return; }
      if (billOpen)    { setBillOpen(false);    return; }
      if (payBillsOpen){ setPayBillsOpen(false);return; }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [rowMenuOpen, receiptOpen, billOpen, payBillsOpen]);

  /* ── Outside-click closes row menu (when already open) ── */
  useEffect(() => {
    if (!rowMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      const menuEl = rowMenuElRef.current;
      if (menuEl && menuEl.contains(target)) return;
      const onMenuBtn = Object.values(rowMenuBtnRefs.current).some(btn => btn && btn.contains(target));
      if (!onMenuBtn) setRowMenuOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [rowMenuOpen]);

  /* ── Cleanup toast timer on unmount ── */
  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  /* ════════════════════════════════════════════════════════════════
     Action handlers — each one mirrors an entry from the source <script>
     ════════════════════════════════════════════════════════════════ */

  /* [data-copy-mail] */
  const handleCopyMail = useCallback(() => {
    const val = 'receipts@unsaid.app';
    try { navigator.clipboard?.writeText(val); } catch { /* ignore */ }
    showToast('Forwarding address copied');
  }, [showToast]);

  /* [data-upload-receipt] */
  const handleUploadReceipt = useCallback(() => {
    showToast('Upload receipt — file picker opens');
  }, [showToast]);

  /* Receipt row click → open receipt drawer */
  const openReceiptDrawer = useCallback((vendor: string) => {
    const d = RECEIPT_DATA[vendor];
    if (!d) return;
    setCurrentReceipt(vendor);
    setRcForm({ vendor: d.vendor, date: d.date, amount: d.amount, category: d.category, account: d.account });
    setReceiptOpen(true);
  }, []);

  const closeReceiptDrawer = useCallback(() => setReceiptOpen(false), []);

  /* [data-rc-view-original] */
  const handleRcViewOriginal = useCallback(() => {
    showToast('Opening original receipt image');
  }, [showToast]);

  /* [data-rc-create-expense] */
  const handleRcCreateExpense = useCallback(() => {
    if (currentReceipt) {
      setReceipts(prev => prev.filter(v => v !== currentReceipt));
    }
    showToast('Expense created from receipt');
    setReceiptOpen(false);
  }, [currentReceipt, showToast]);

  /* [data-rc-create-bill] */
  const handleRcCreateBill = useCallback(() => {
    showToast('Bill created from receipt');
    if (currentReceipt) {
      setReceipts(prev => prev.filter(v => v !== currentReceipt));
    }
    setReceiptOpen(false);
  }, [currentReceipt, showToast]);

  /* Bill drawer */
  const openBillDrawer = useCallback((vendor: string) => {
    const d = BILL_DATA[vendor];
    if (!d) return;
    setCurrentBill(vendor);
    setBillForm({ vendor: d.vendor, no: d.no, date: d.date, due: d.due, balance: d.balance, doc: d.doc });
    setBillOpen(true);
  }, []);
  const closeBillDrawer = useCallback(() => setBillOpen(false), []);

  /* [data-bill-save] */
  const handleBillSave = useCallback(() => {
    setBillOpen(false);
    showToast('Bill saved');
  }, [showToast]);

  /* [data-bill-print] */
  const handleBillPrint = useCallback(() => {
    showToast('Printing bill');
  }, [showToast]);

  /* [data-bill-schedule] */
  const handleBillSchedule = useCallback(() => {
    setBillOpen(false);
    setPayBillsOpen(true);
  }, []);

  /* Bill row click — opens drawer unless target is a button/input */
  const handleBillRowClick = useCallback((vendor: string, e: React.MouseEvent<HTMLTableRowElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('input,button')) return;
    openBillDrawer(vendor);
  }, [openBillDrawer]);

  /* Pay bills drawer */
  const openPayBills = useCallback(() => setPayBillsOpen(true), []);
  const closePayBills = useCallback(() => setPayBillsOpen(false), []);

  /* Pay bill row checkbox toggle */
  const handlePayCheck = useCallback((idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setPayBillsState(prev => prev.map((r, i) => i === idx ? { ...r, checked } : r));
  }, []);

  /* [data-pay-all] — toggle all */
  const handlePayAll = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setPayBillsState(prev => prev.map(r => ({ ...r, checked })));
  }, []);

  /* amt-input — reformat with commas */
  const handlePayInput = useCallback((idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatWithCommas(e.target.value);
    setPayBillsState(prev => prev.map((r, i) => i === idx ? { ...r, payment: formatted } : r));
  }, []);

  /* [data-pay-submit] — records real payments via store.recordPayment */
  const handlePaySubmit = useCallback(() => {
    let paidCount = 0;
    let paidTotal = 0;
    for (const row of payBillsState) {
      if (!row.checked) continue;
      const doc = store.documents.find(d => d.type === 'Bill' && d.number === row.billNo);
      if (!doc) continue;
      const amount = parseAmount(row.payment);
      store.recordPayment(doc.id, amount, 'Check', 'Checking');
      paidCount++;
      paidTotal += amount;
    }
    setPayBillsOpen(false);
    showToast(`Paid ${paidCount} bill${paidCount !== 1 ? 's' : ''} totaling $${paidTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }, [payBillsState, store, showToast]);

  /* Total + count computed live */
  const payTotal = payBillsState.filter(r => r.checked).reduce((acc, r) => ({ total: acc.total + parseAmount(r.payment), count: acc.count + 1 }), { total: 0, count: 0 });
  const payTotalDisplay = `$${payTotal.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const payCountDisplay = `${payTotal.count} of ${payBillsState.length} selected`;
  const paySubmitDisabled = payTotal.count === 0;

  /* Row ⋯ menu — open */
  const openRowMenu = useCallback((vendor: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const btn = e.currentTarget;
    const r = btn.getBoundingClientRect();
    const top = r.bottom + 4;
    const left = Math.min(r.right - 220, window.innerWidth - 240);
    setRowMenuVendor(vendor);
    setRowMenuPos({ top, left });
    setRowMenuOpen(true);
  }, []);

  /* Row ⋯ menu — actions */
  const handleRowMenuAction = useCallback((action: string) => {
    setRowMenuOpen(false);
    const vendor = rowMenuVendor;
    if (!vendor) return;
    switch (action) {
      case 'view':
      case 'edit':
        openBillDrawer(vendor);
        break;
      case 'attach':
        showToast(`Attach document to ${vendor} bill`);
        break;
      case 'schedule':
        setPayBillsOpen(true);
        break;
      case 'pay-now':
        setPayBillsOpen(true);
        break;
      case 'mark-review':
        setBillsState(prev => prev.map(b => b.vendor === vendor ? { ...b, status: 'Unpaid' as BillStatus, overdue: false } : b));
        showToast(`${vendor} bill marked as reviewed`);
        break;
      case 'void':
        setBillsState(prev => prev.filter(b => b.vendor !== vendor));
        showToast(`${vendor} bill voided`);
        break;
    }
  }, [rowMenuVendor, openBillDrawer, showToast]);

  /* [data-expense] row click */
  const handleExpenseClick = useCallback((name: string) => {
    showToast(`Open expense: ${name}`);
  }, [showToast]);

  /* [data-create] buttons */
  const handleCreate = useCallback((kind: string) => {
    if (kind === 'Pay bills') {
      setPayBillsOpen(true);
    } else {
      onCreate(kind);
      showToast(`Create \u2192 ${kind}`);
    }
  }, [onCreate, showToast]);

  /* [data-goto] buttons */
  const handleGoto = useCallback((target: 'receipts' | 'expenses' | 'vendors') => {
    const map = {
      receipts: EBL_NAV.receipts(),
      expenses: EBL_NAV.expenses(),
      vendors: EBL_NAV.vendors(),
    } as const;
    const [d, s] = map[target];
    onNavigate(d, s);
  }, [onNavigate]);

  /* [data-bills-tab="all"] */
  const handleBillsTab = useCallback(() => {
    const [d, s] = EBL_NAV.bills();
    onNavigate(d, s);
  }, [onNavigate]);

  /* [data-open-create] */
  const handleOpenCreateFlyout = useCallback(() => {
    onOpenCreateFlyout();
  }, [onOpenCreateFlyout]);

  /* [data-date-range] */
  const handleDateRange = useCallback(() => {
    showToast('Date range picker');
  }, [showToast]);

  /* [data-export] */
  const handleExport = useCallback(() => {
    showToast('Export expenses overview');
  }, [showToast]);

  /* [data-1099-prep] */
  const handle1099Prep = useCallback(() => {
    showToast('1099 preparation workflow — 6 vendors');
  }, [showToast]);

  /* [data-attach-receipt] */
  const handleAttachReceipt = useCallback(() => {
    showToast('Attach receipt to Staples expense');
  }, [showToast]);

  /* Silent-emit onToast when a local toast fires (so shell can also surface if desired) */
  useEffect(() => {
    if (toastMsg) onToast(toastMsg);
  }, [toastMsg, onToast]);

  /* ════════════════════════════════════════════════════════════════
     Render
     ════════════════════════════════════════════════════════════════ */

  return (
    <div className="expenses-bills-page">
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Expenses &amp; Bills</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Overview</span>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
          <div>
            <h1 className="text-headline-lg">Expenses &amp; Bills — Overview</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">Bills, expenses, vendors, and payments at a glance · November 2026</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleDateRange}>
              <span className="material-symbols-outlined text-[16px]">calendar_today</span>Nov 2026 ▾
            </button>
            <button type="button" className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
              <span className="material-symbols-outlined text-[16px]">download</span>Export
            </button>
          </div>
        </div>

        {/* KPI strip — computed from store */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="eb-kpi-card">
            <div className="eb-kpi-label">Bills due</div>
            <div className="eb-kpi-val">${store.documents.filter(d => d.type === 'Bill' && d.balance > 0).reduce((s, d) => s + d.balance, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-[11px] text-error mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">warning</span>{store.documents.filter(d => d.type === 'Bill' && d.balance > 0).length} bills · {store.documents.filter(d => d.type === 'Bill' && d.balance > 0 && new Date(d.dueDate || d.date) < new Date()).length} overdue
            </div>
          </div>
          <div className="eb-kpi-card">
            <div className="eb-kpi-label">Expenses MTD</div>
            <div className="eb-kpi-val">${store.moneyMovements.filter(m => m.type === 'Payment' && m.date.startsWith(String(new Date().getFullYear()))).reduce((s, m) => s + m.amount, 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">{store.moneyMovements.filter(m => m.type === 'Payment').length} payments this year</div>
          </div>
          <div className="eb-kpi-card">
            <div className="eb-kpi-label">Active vendors</div>
            <div className="eb-kpi-val">{store.parties.filter(p => p.roles.includes('Vendor') || p.roles.includes('Supplier') || p.roles.includes('Contractor')).length}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">{store.parties.filter(p => (p.roles.includes('Vendor') || p.roles.includes('Supplier') || p.roles.includes('Contractor')) && p.balance < 0).length} with open balances</div>
          </div>
          <div className="eb-kpi-card">
            <div className="eb-kpi-label">1099 pending</div>
            <div className="eb-kpi-val">{store.parties.filter(p => p.track1099).length}</div>
            <div className="text-[11px] text-tertiary mt-1">Due Jan 31, {new Date().getFullYear() + 1}</div>
          </div>
        </div>

        {/* Create actions row */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
          <button type="button" className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => handleCreate('Bill')}>
            <span className="material-symbols-outlined text-[16px]">description</span>Bill
          </button>
          <button type="button" className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => handleCreate('Expense')}>
            <span className="material-symbols-outlined text-[16px]">credit_card</span>Expense
          </button>
          <button type="button" className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => handleCreate('Check')}>
            <span className="material-symbols-outlined text-[16px]">payments</span>Check
          </button>
          <button type="button" className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => handleCreate('Pay bills')}>
            <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>Pay bills
          </button>
          <button type="button" className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => handleCreate('Vendor')}>
            <span className="material-symbols-outlined text-[16px]">domain_add</span>Vendor
          </button>
          <button type="button" className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1" onClick={handleOpenCreateFlyout}>
            <span className="material-symbols-outlined text-[16px]">apps</span>Show all
          </button>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
          {/* Bills due — actionable preview */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-headline-sm">Bills due</h2>
                <p className="text-[11px] text-on-surface-variant mt-0.5">3 open bills · $4,080.00 total</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="h-7 px-2 border border-surface-dim rounded text-[11px] font-semibold hover:bg-surface-container-low flex items-center gap-1" onClick={handleBillsTab}>
                  View all
                </button>
                <button type="button" className="h-7 px-2 bg-primary text-white rounded text-[11px] font-semibold hover:bg-primary-container flex items-center gap-1" onClick={openPayBills}>
                  <span className="material-symbols-outlined text-[13px]">account_balance_wallet</span>Pay bills
                </button>
              </div>
            </div>
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2">Vendor</th>
                  <th className="px-4 py-2">Bill no.</th>
                  <th className="px-4 py-2">Due</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {billsState.map(b => (
                  <tr
                    key={b.vendor}
                    className="hover:bg-surface-container-low cursor-pointer bill-row"
                    onClick={(e) => handleBillRowClick(b.vendor, e)}
                  >
                    <td className="px-4 py-2 font-medium">{b.vendor}</td>
                    <td className="px-4 py-2 text-on-surface-variant">{b.no}</td>
                    <td className="px-4 py-2">
                      {b.overdue ? <span className="text-error font-medium">{b.due}</span> : b.due}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{b.amount}</td>
                    <td className="px-4 py-2">
                      {b.status === 'For review' && (
                        <span className="bstatus review"><span className="material-symbols-outlined text-[11px]">pending</span>For review</span>
                      )}
                      {b.status === 'Unpaid' && (
                        <span className="bstatus unpaid">Unpaid</span>
                      )}
                      {b.status === 'Overdue' && (
                        <span className="bstatus overdue"><span className="material-symbols-outlined text-[11px]">warning</span>Overdue</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                        ref={el => { rowMenuBtnRefs.current[b.vendor] = el; }}
                        onClick={(e) => openRowMenu(b.vendor, e)}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-surface-dim px-5 py-2 flex items-center justify-between bg-surface-container-low">
              <span className="text-[11px] text-on-surface-variant">3 open bills · 1 overdue</span>
              <span className="text-body-sm font-semibold tabular-nums">$4,720.00 total</span>
            </div>
          </div>

          {/* Receipts inbox preview */}
          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-headline-sm">Receipts inbox</h2>
                <p className="text-[11px] text-on-surface-variant mt-0.5">{receipts.length} for review</p>
              </div>
              <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={() => handleGoto('receipts')}>View all</button>
            </div>
            <div className="px-5 pb-3 flex items-center gap-1.5">
              <div className="flex-1 h-7 px-2 rounded bg-surface-container-low border border-surface-dim text-[11px] text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[13px]">mail</span>
                <span className="truncate">receipts@unsaid.app</span>
                <button type="button" className="ml-auto text-primary font-semibold flex-shrink-0" onClick={handleCopyMail}>Copy</button>
              </div>
              <button type="button" className="h-7 px-2 border border-dashed border-surface-dim rounded text-[11px] text-primary font-semibold hover:bg-surface-container-low flex items-center gap-1" onClick={handleUploadReceipt}>
                <span className="material-symbols-outlined text-[14px]">upload</span>
              </button>
            </div>
            <div className="border-t border-surface-dim">
              {receipts.map(vendor => {
                const d = RECEIPT_DATA[vendor];
                if (!d) return null;
                return (
                  <div
                    key={vendor}
                    className="flex items-center gap-2.5 px-5 py-2.5 hover:bg-surface-container-low cursor-pointer"
                    onClick={() => openReceiptDrawer(vendor)}
                  >
                    <div className="receipt-thumb"></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-body-sm font-medium truncate">{vendor} · {d.category}</div>
                      <div className="text-[11px] text-on-surface-variant">{isoToUS(d.date)} · ${d.amount}</div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-tertiary/15 text-tertiary">New</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom grid: Recent expenses + Vendors + 1099 */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Recent expenses */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-headline-sm">Recent expense transactions</h2>
                <p className="text-[11px] text-on-surface-variant mt-0.5">Last 7 days · 3 expenses · $286.69</p>
              </div>
              <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={() => handleGoto('expenses')}>View all</button>
            </div>
            <div className="divide-y divide-surface-dim">
              <div className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-container-low cursor-pointer" onClick={() => handleExpenseClick('Adobe')}>
                <span className="material-symbols-outlined text-[18px] text-qb-maroon">credit_card</span>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium truncate">Adobe · Creative Cloud</div>
                  <div className="text-[11px] text-on-surface-variant">10/30/2026 · Software · Visa •4421</div>
                </div>
                <div className="text-body-sm font-semibold tabular-nums">$59.99</div>
                <span className="material-symbols-outlined text-[14px] text-secondary">check_circle</span>
              </div>
              <div className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-container-low cursor-pointer" onClick={() => handleExpenseClick('FedEx')}>
                <span className="material-symbols-outlined text-[18px] text-qb-maroon">credit_card</span>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium truncate">FedEx · Ground shipping</div>
                  <div className="text-[11px] text-on-surface-variant">10/29/2026 · Shipping · Bank •9910</div>
                </div>
                <div className="text-body-sm font-semibold tabular-nums">$84.20</div>
                <span className="material-symbols-outlined text-[14px] text-secondary">check_circle</span>
              </div>
              <div className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-container-low cursor-pointer" onClick={() => handleExpenseClick('Staples')}>
                <span className="material-symbols-outlined text-[18px] text-qb-maroon">credit_card</span>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium truncate">Staples · Office supplies</div>
                  <div className="text-[11px] text-on-surface-variant">10/30/2026 · Office supplies · Visa •4421</div>
                </div>
                <div className="text-body-sm font-semibold tabular-nums">$142.50</div>
                <span className="material-symbols-outlined text-[14px] text-tertiary">pending</span>
              </div>
            </div>
            <div className="border-t border-surface-dim px-5 py-2 bg-surface-container-low flex items-center justify-between">
              <span className="text-[11px] text-on-surface-variant">1 needs receipt</span>
              <button type="button" className="text-[11px] font-semibold text-primary hover:underline" onClick={handleAttachReceipt}>Attach receipt</button>
            </div>
          </div>

          {/* Top vendors */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-headline-sm">Top vendors by spend</h2>
              <button type="button" className="text-[11px] text-primary font-semibold hover:underline" onClick={() => handleGoto('vendors')}>View all</button>
            </div>
            <div>
              <div className="vendor-row">
                <div className="vendor-avatar bg-qb-blue">P</div>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium truncate">Printful</div>
                  <div className="text-[11px] text-on-surface-variant">8 bills · 3 open</div>
                </div>
                <div className="text-right">
                  <div className="text-body-sm font-semibold tabular-nums">$12,410</div>
                  <div className="text-[10px] text-on-surface-variant">YTD</div>
                </div>
              </div>
              <div className="vendor-row">
                <div className="vendor-avatar bg-qb-green">G</div>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium truncate">Gelato</div>
                  <div className="text-[11px] text-on-surface-variant">4 bills · 1 open</div>
                </div>
                <div className="text-right">
                  <div className="text-body-sm font-semibold tabular-nums">$6,240</div>
                  <div className="text-[10px] text-on-surface-variant">YTD</div>
                </div>
              </div>
              <div className="vendor-row">
                <div className="vendor-avatar bg-qb-maroon">P</div>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium truncate">Printify</div>
                  <div className="text-[11px] text-on-surface-variant">3 bills · 1 overdue</div>
                </div>
                <div className="text-right">
                  <div className="text-body-sm font-semibold tabular-nums text-error">$4,180</div>
                  <div className="text-[10px] text-on-surface-variant">YTD</div>
                </div>
              </div>
              <div className="vendor-row">
                <div className="vendor-avatar bg-qb-teal">A</div>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium truncate">Adobe</div>
                  <div className="text-[11px] text-on-surface-variant">12 bills · 0 open</div>
                </div>
                <div className="text-right">
                  <div className="text-body-sm font-semibold tabular-nums">$719.88</div>
                  <div className="text-[10px] text-on-surface-variant">YTD</div>
                </div>
              </div>
              <div className="vendor-row">
                <div className="vendor-avatar bg-qb-navy">S</div>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium truncate">Staples</div>
                  <div className="text-[11px] text-on-surface-variant">9 bills · 0 open</div>
                </div>
                <div className="text-right">
                  <div className="text-body-sm font-semibold tabular-nums">$1,418</div>
                  <div className="text-[10px] text-on-surface-variant">YTD</div>
                </div>
              </div>
            </div>

            {/* 1099 nudge */}
            <div className="mt-4 bg-error-container/40 border border-error/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-[16px] text-error">warning</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-on-error-container">1099-NEC deadline</span>
              </div>
              <p className="text-[11px] text-on-error-container mb-2">6 vendors need 1099s by Jan 31, 2027. Ensure W-9s are on file.</p>
              <button type="button" className="h-7 px-2.5 border border-error rounded text-[11px] font-semibold text-error hover:bg-error-container/60" onClick={handle1099Prep}>
                Prepare 1099s
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ═══════════ ROW ⋯ MENU ═══════════ */}
      <div
        ref={rowMenuElRef}
        id="row-menu"
        className={`menu ${rowMenuOpen ? 'open' : ''}`}
        style={rowMenuPos ? { top: rowMenuPos.top, left: rowMenuPos.left } : undefined}
      >
        <div className="menu-header">This bill</div>
        <button type="button" onClick={() => handleRowMenuAction('view')}><span className="material-symbols-outlined">open_in_new</span>Open bill</button>
        <button type="button" onClick={() => handleRowMenuAction('edit')}><span className="material-symbols-outlined">edit</span>Edit</button>
        <button type="button" onClick={() => handleRowMenuAction('attach')}><span className="material-symbols-outlined">attach_file</span>Attach document</button>
        <div className="sep"></div>
        <div className="menu-header">Pay</div>
        <button type="button" onClick={() => handleRowMenuAction('schedule')}><span className="material-symbols-outlined">schedule</span>Schedule payment</button>
        <button type="button" onClick={() => handleRowMenuAction('pay-now')}><span className="material-symbols-outlined">payments</span>Pay now</button>
        <div className="sep"></div>
        <div className="menu-header">State</div>
        <button type="button" onClick={() => handleRowMenuAction('mark-review')}><span className="material-symbols-outlined">check_circle</span>Mark as reviewed</button>
        <button type="button" className="danger" onClick={() => handleRowMenuAction('void')}><span className="material-symbols-outlined">block</span>Void bill</button>
      </div>

      {/* ═══════════ RECEIPT PREVIEW DRAWER ═══════════ */}
      <div className={`drawer-scrim ${receiptOpen ? 'open' : ''}`} onClick={closeReceiptDrawer}></div>
      <div className={`drawer ${receiptOpen ? 'open' : ''}`}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">receipt_long</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate">{currentReceipt ? `Receipt — ${currentReceipt}` : 'Receipt'}</div>
              <div className="text-[11px] text-on-surface-variant">For review</div>
            </div>
          </div>
          <button type="button" className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeReceiptDrawer}>
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="bg-surface-container-low rounded-lg p-3 flex items-center gap-3">
            <div className="receipt-thumb" style={{ width: 48, height: 56 }}></div>
            <div className="min-w-0 flex-1">
              <div className="text-body-md font-semibold truncate">{currentReceipt ?? '—'}</div>
              <div className="text-[11px] text-on-surface-variant">
                {currentReceipt ? `${rcForm.date} · $${rcForm.amount} · ${rcForm.category}` : '—'}
              </div>
            </div>
            <button type="button" className="h-7 px-2 border border-surface-dim rounded text-[11px] font-semibold hover:bg-white flex items-center gap-1" onClick={handleRcViewOriginal}>
              <span className="material-symbols-outlined text-[13px]">open_in_new</span>View
            </button>
          </div>
          <div>
            <label className="field-label">Vendor</label>
            <input className="field-input" value={rcForm.vendor} onChange={e => setRcForm(f => ({ ...f, vendor: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Date</label>
              <input className="field-input" type="date" value={rcForm.date} onChange={e => setRcForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Amount</label>
              <input className="field-input tabular-nums" value={rcForm.amount} onChange={e => setRcForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="field-label">Category</label>
            <select className="field-input" value={rcForm.category} onChange={e => setRcForm(f => ({ ...f, category: e.target.value }))}>
              <option>Office supplies</option>
              <option>Shipping</option>
              <option>Software</option>
              <option>Advertising</option>
              <option>Meals &amp; entertainment</option>
              <option>Travel</option>
              <option>Ask My Accountant</option>
            </select>
          </div>
          <div>
            <label className="field-label">Paid from</label>
            <select className="field-input" value={rcForm.account} onChange={e => setRcForm(f => ({ ...f, account: e.target.value }))}>
              <option>Visa •4421</option>
              <option>Bank •9910</option>
              <option>Amex •2103</option>
            </select>
          </div>
          <div className="bg-qb-blue/5 border border-qb-blue/30 rounded-lg p-3 text-[11px] text-qb-blue flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] mt-0.5">auto_awesome</span>
            <div>Fields auto-filled from OCR. Verify the amount matches the receipt before creating.</div>
          </div>
        </div>
        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button type="button" className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeReceiptDrawer}>Cancel</button>
          <div className="flex items-center gap-2">
            <div className="flex split-btn">
              <button type="button" className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main" onClick={handleRcCreateBill}>Create bill</button>
              <button type="button" className="h-8 px-1.5 bg-white border border-surface-dim hover:bg-surface-container-low split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <div className="flex split-btn">
              <button type="button" className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main" onClick={handleRcCreateExpense}>Create expense</button>
              <button type="button" className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ BILL DRAWER ═══════════ */}
      <div className={`drawer-scrim ${billOpen ? 'open' : ''}`} onClick={closeBillDrawer}></div>
      <div className={`drawer ${billOpen ? 'open' : ''}`}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">description</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate">{currentBill ? `Bill — ${currentBill}` : 'Bill'}</div>
              <div className="text-[11px] text-on-surface-variant">{billForm.no ? `${billForm.no} · ${billForm.balance}` : '—'}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" title="Download">
              <span className="material-symbols-outlined text-[18px]">download</span>
            </button>
            <button type="button" className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeBillDrawer}>
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="bg-surface-container-low rounded-lg p-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-[28px] text-qb-maroon">receipt_long</span>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-on-surface-variant uppercase font-bold">Bill document</div>
              <div className="text-body-sm font-semibold truncate">{billForm.doc || '—'}</div>
            </div>
            <button type="button" className="h-7 px-2 border border-surface-dim rounded text-[11px] font-semibold hover:bg-white flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">open_in_new</span>View
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Vendor</label>
              <input className="field-input" value={billForm.vendor} onChange={e => setBillForm(f => ({ ...f, vendor: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Bill no.</label>
              <input className="field-input" value={billForm.no} onChange={e => setBillForm(f => ({ ...f, no: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Bill date</label>
              <input className="field-input" type="date" value={billForm.date} onChange={e => setBillForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Due date</label>
              <input className="field-input" type="date" value={billForm.due} onChange={e => setBillForm(f => ({ ...f, due: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="field-label">Terms</label>
            <select className="field-input" defaultValue="Net 30">
              <option>Net 30</option>
              <option>Net 15</option>
              <option>Net 60</option>
              <option>Due on receipt</option>
            </select>
          </div>
          <div className="border-t border-surface-dim pt-3">
            <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Line items</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-body-sm py-1 border-b border-surface-dim">
                <span className="text-on-surface-variant w-4">1</span>
                <span className="flex-1 font-medium">Printful order — 240 tees</span>
                <span className="text-on-surface-variant">240</span>
                <span className="tabular-nums">$12.00</span>
                <span className="tabular-nums font-semibold w-20 text-right">$2,880.00</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <div className="w-1/2 space-y-1 text-body-sm">
              <div className="flex justify-between"><span className="text-on-surface-variant">Subtotal</span><span className="tabular-nums">$2,880.00</span></div>
              <div className="flex justify-between"><span className="text-on-surface-variant">Tax</span><span className="tabular-nums">$0.00</span></div>
              <div className="flex justify-between pt-2 border-t border-surface-dim font-semibold"><span>Balance due</span><span className="tabular-nums">{billForm.balance}</span></div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-body-sm border-t border-surface-dim pt-3">
            <input type="checkbox" className="row-check" />
            <span>Add tags (optional)</span>
          </label>
          <div className="bg-qb-blue/5 border border-qb-blue/30 rounded-lg p-3 text-[11px] text-qb-blue flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] mt-0.5">info</span>
            <div>Save and schedule payment opens the Pay Bills workspace with this bill pre-selected.</div>
          </div>
        </div>
        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button type="button" className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeBillDrawer}>Cancel</button>
          <div className="flex items-center gap-2">
            <button type="button" className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low" onClick={handleBillPrint}>
              <span className="material-symbols-outlined text-[16px] align-middle mr-1">print</span>Print
            </button>
            <div className="flex split-btn">
              <button type="button" className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main" onClick={handleBillSave}>Save bill</button>
              <button type="button" className="h-8 px-1.5 bg-white border border-surface-dim hover:bg-surface-container-low split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <div className="flex split-btn">
              <button type="button" className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main" onClick={handleBillSchedule}>Save and schedule payment</button>
              <button type="button" className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ PAY BILLS WORKSPACE DRAWER ═══════════ */}
      <div className={`drawer-scrim ${payBillsOpen ? 'open' : ''}`} onClick={closePayBills}></div>
      <div className={`drawer ${payBillsOpen ? 'open' : ''}`} style={{ width: 960 }}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">account_balance_wallet</span>
            <div>
              <div className="text-headline-sm">Pay bills</div>
              <div className="text-[11px] text-on-surface-variant">Step 3 of 3 · Review and confirm</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-on-surface-variant uppercase font-bold">Total payment amount</div>
              <div className="text-headline-sm tabular-nums">{payTotalDisplay}</div>
            </div>
            <button type="button" className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closePayBills}>
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 border-b border-surface-dim bg-surface-container-low">
          <div className="p-3 border-r border-surface-dim">
            <label className="field-label">Payment account</label>
            <select className="field-input" defaultValue="Chase •9910 · $84,210.40">
              <option>Chase •9910 · $84,210.40</option>
              <option>Visa •4421 · $2,180.00</option>
            </select>
          </div>
          <div className="p-3 border-r border-surface-dim">
            <label className="field-label">Payment date</label>
            <input className="field-input" type="date" defaultValue="2026-11-08" />
          </div>
          <div className="p-3">
            <label className="field-label">Starting check no.</label>
            <input className="field-input" placeholder="e.g. 1042" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-2 border-b border-surface-dim bg-white flex items-center gap-2 text-[11px]">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="row-check" /> Print later
            </label>
            <span className="w-px h-3 bg-surface-dim"></span>
            <span className="text-on-surface-variant">Due:</span>
            <select className="h-6 px-1.5 border border-surface-dim rounded text-[11px] bg-white" defaultValue="All due dates">
              <option>All due dates</option>
              <option>Due within 7 days</option>
              <option>Due within 30 days</option>
              <option>Overdue only</option>
            </select>
            <span className="ml-auto text-on-surface-variant">{payCountDisplay}</span>
          </div>
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" onChange={handlePayAll} /></th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2">Bill no.</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {payBillsState.map((row, idx) => (
                <tr key={row.vendor} className="paybill-row">
                  <td className="px-3 py-2">
                    <input type="checkbox" className="row-check" checked={row.checked} onChange={(e) => handlePayCheck(idx, e)} />
                  </td>
                  <td className="px-3 py-2 font-medium">{row.vendor}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{row.billNo}</td>
                  <td className="px-3 py-2">
                    {row.overdue ? <span className="text-error font-medium">{row.due}</span> : row.due}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.amount}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      className="w-24 h-7 px-2 border border-surface-dim rounded text-body-sm text-right tabular-nums"
                      value={row.payment}
                      onChange={(e) => handlePayInput(idx, e)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0 bg-white">
          <button type="button" className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closePayBills}>Cancel</button>
          <button type="button" className="h-8 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40" disabled={paySubmitDisabled} onClick={handlePaySubmit}>
            <span className="material-symbols-outlined text-[16px] align-middle mr-1">payments</span>Pay selected bills
          </button>
        </div>
      </div>

      {/* Toast */}
      <div className={`toast ${toastMsg ? 'show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
