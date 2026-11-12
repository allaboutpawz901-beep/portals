'use client';

import './expenses-bills.css';
import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
} from 'react';
import type { ExpensesBillsScreenProps } from './types';
import { EBL_NAV } from './types';

/* ════════════════════════════════════════════════════════════════
   Pay bills screen — 1:1 conversion of upload/Pay bills.html
   ════════════════════════════════════════════════════════════════ */

interface PayBillRow {
  id: number;
  vendor: string;
  billno: string;
  due: string;          // ISO date 'YYYY-MM-DD'
  dueDisplay: string;   // 'MM/DD/YYYY'
  balance: number;
  overdue: boolean;
  checked: boolean;
  amount: string;       // formatted with commas (e.g. "2,880.00")
}

interface ConfirmSummaryItem {
  vendor: string;
  billno: string;
  amount: string;       // already formatted via money()
}

interface AccountOption {
  label: string;
  balance: number;
}

type DueFilter = 'all' | '7' | '30' | 'overdue';

const INITIAL_ROWS: PayBillRow[] = [
  { id: 1, vendor: 'Printful',                  billno: 'PF-9211', due: '2026-11-10', dueDisplay: '11/10/2026', balance: 2880.00, overdue: false, checked: false, amount: '2,880.00' },
  { id: 2, vendor: 'Gelato',                    billno: 'GL-4402', due: '2026-11-15', dueDisplay: '11/15/2026', balance: 1200.00, overdue: false, checked: false, amount: '1,200.00' },
  { id: 3, vendor: 'Printify',                  billno: 'PR-3388', due: '2026-10-30', dueDisplay: '10/30/2026', balance:  640.00, overdue: true,  checked: false, amount:   '640.00' },
  { id: 4, vendor: 'Adobe',                     billno: 'AD-9911', due: '2026-11-28', dueDisplay: '11/28/2026', balance:  719.88, overdue: false, checked: false, amount:   '719.88' },
  { id: 5, vendor: 'Knoxville Utilities Board', billno: 'KUB-8802', due: '2026-12-05', dueDisplay: '12/05/2026', balance:  320.00, overdue: false, checked: false, amount:   '320.00' },
  { id: 6, vendor: 'Lakeside Design',           billno: 'LD-1104', due: '2026-11-06', dueDisplay: '11/06/2026', balance: 1850.00, overdue: false, checked: false, amount: '1,850.00' },
];

const ACCOUNTS: AccountOption[] = [
  { label: 'Chase •9910 · $84,210.40', balance: 84210.40 },
  { label: 'Visa •4421 · $2,180.00',   balance:  2180.00 },
  { label: 'Amex •2103 · $5,000.00',   balance:  5000.00 },
];

const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PayBills({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: ExpensesBillsScreenProps) {
  // Reference unused prop signatures so the destructure is intentional.
  void onCreate;
  void onOpenCreateFlyout;

  /* ── Toast (local + mirrored to shell) ── */
  const [toastMsg, setToastMsg] = useState('');
  const showToast = useCallback((msg: string) => setToastMsg(msg), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(''), 1800);
    return () => window.clearTimeout(t);
  }, [toastMsg]);
  useEffect(() => {
    if (toastMsg) onToast(toastMsg);
  }, [toastMsg, onToast]);

  /* ── Row state ── */
  const [rows, setRows] = useState<PayBillRow[]>(INITIAL_ROWS);

  /* ── Filter state ── */
  const [search, setSearch] = useState('');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');

  /* ── Payment account state ── */
  const [payAccount, setPayAccount] = useState(ACCOUNTS[0].label);
  const [balanceNote, setBalanceNote] = useState(`Available: ${money(ACCOUNTS[0].balance)}`);

  /* ── Payment date state ── */
  const [payDate, setPayDate] = useState('2026-11-08');

  /* ── Print later state ── */
  const [printLater, setPrintLater] = useState(false);

  /* ── Confirm modal state ── */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSummary, setConfirmSummary] = useState<ConfirmSummaryItem[]>([]);
  const [confirmTotal, setConfirmTotal] = useState('$0.00');
  const [confirmAccount, setConfirmAccount] = useState('Chase •9910');
  const [confirmDate, setConfirmDate] = useState('11/08/2026');

  /* ── Success modal state ── */
  const [successOpen, setSuccessOpen] = useState(false);
  const [successData, setSuccessData] = useState({
    count: 0,
    total: '$0.00',
    date: '11/08/2026',
    printNote: '',
  });

  /* ═══════════════════════════════════════════════════════════════
     Derived visibility — applies source's applyFilters logic exactly
     ═══════════════════════════════════════════════════════════════ */
  const visibleRows = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const q = search.trim().toLowerCase();
    return rows.map((r) => {
      const qOk =
        !q ||
        r.vendor.toLowerCase().includes(q) ||
        r.billno.toLowerCase().includes(q);
      let dueOk = true;
      if (dueFilter !== 'all') {
        const dueDate = new Date(r.due + 'T00:00:00');
        const days = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
        if (dueFilter === '7') dueOk = days >= 0 && days <= 7;
        else if (dueFilter === '30') dueOk = days >= 0 && days <= 30;
        else if (dueFilter === 'overdue') dueOk = days < 0 || r.overdue;
      }
      return { ...r, visible: qOk && dueOk };
    });
  }, [rows, search, dueFilter]);

  const visibleIds = useMemo(
    () => new Set(visibleRows.filter((v) => v.visible).map((v) => v.id)),
    [visibleRows],
  );

  /* Uncheck hidden rows — mirrors source's applyFilters unchecking side effect.
     useLayoutEffect so it runs before paint (no flash of stale totals). */
  useLayoutEffect(() => {
    setRows((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (r.checked && !visibleIds.has(r.id)) {
          changed = true;
          return { ...r, checked: false };
        }
        return r;
      });
      return changed ? next : prev;
    });
  }, [visibleIds]);

  /* ═══════════════════════════════════════════════════════════════
     Totals — derived from rows (mirrors source's updateTotals)
     ═══════════════════════════════════════════════════════════════ */
  const totals = useMemo(() => {
    let selectedCount = 0;
    let totalAmount = 0;
    rows.forEach((r) => {
      if (r.checked && visibleIds.has(r.id)) {
        selectedCount++;
        const amt = parseFloat((r.amount || '0').replace(/,/g, '')) || 0;
        totalAmount += amt;
      }
    });
    return {
      selectedCount,
      totalAmount,
      totalDisplay: money(totalAmount),
      submitDisabled: selectedCount === 0,
      selectionSummary: `${selectedCount} bill${selectedCount !== 1 ? 's' : ''} selected`,
      payCountText: `${selectedCount} of ${rows.length} selected`,
      footerNote:
        selectedCount > 0
          ? `${selectedCount} bills selected · ${money(totalAmount)} total`
          : 'Select bills to pay. Payments will be sent on the date above.',
    };
  }, [rows, visibleIds]);

  /* ── Check-all derived state (all visible rows checked) ── */
  const allVisibleChecked =
    visibleIds.size > 0 &&
    [...visibleIds].every((id) => {
      const r = rows.find((rr) => rr.id === id);
      return r ? r.checked : false;
    });

  /* ═══════════════════════════════════════════════════════════════
     Action handlers
     ═══════════════════════════════════════════════════════════════ */

  /* Row checkbox change → toggle that row's checked */
  const handleRowCheck = (id: number, checked: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, checked } : r)));
  };

  /* Check-all → set all visible rows' checked to match */
  const handleCheckAll = (checked: boolean) => {
    setRows((prev) =>
      prev.map((r) => (visibleIds.has(r.id) ? { ...r, checked } : r)),
    );
  };

  /* Select all → set all visible rows' checked to true */
  const handleSelectAll = () => {
    setRows((prev) =>
      prev.map((r) => (visibleIds.has(r.id) ? { ...r, checked: true } : r)),
    );
  };

  /* Clear all → uncheck every row */
  const handleClearAll = () => {
    setRows((prev) => prev.map((r) => ({ ...r, checked: false })));
  };

  /* amt-input → reformat with commas (preserve decimal) + update row.amount */
  const handleAmountInput = (id: number, value: string) => {
    const raw = value.replace(/[^\d.]/g, '');
    const [int, dec] = raw.split('.');
    const formatted =
      int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
      (dec !== undefined ? '.' + dec : '');
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, amount: formatted } : r)));
  };

  /* Search input → re-filter */
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  /* Due filter → re-filter */
  const handleDueFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDueFilter(e.target.value as DueFilter);
  };

  /* Payment account select → update payAccount + balanceNote */
  const handlePayAccount = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setPayAccount(val);
    const acct = ACCOUNTS.find((a) => a.label === val);
    const bal = acct ? acct.balance : 0;
    setBalanceNote(`Available: ${money(bal)}`);
  };

  /* Payment date input */
  const handlePayDate = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPayDate(e.target.value);
  };

  /* Print later toggle */
  const handlePrintLater = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPrintLater(e.target.checked);
  };

  /* Submit → populate confirm modal with selected rows + total + account + date */
  const handleSubmit = () => {
    if (totals.selectedCount === 0) return;
    const selected = rows.filter((r) => r.checked && visibleIds.has(r.id));
    let total = 0;
    const summary: ConfirmSummaryItem[] = selected.map((r) => {
      const amt = parseFloat((r.amount || '0').replace(/,/g, '')) || 0;
      total += amt;
      return { vendor: r.vendor, billno: r.billno, amount: money(amt) };
    });
    setConfirmSummary(summary);
    setConfirmTotal(money(total));
    setConfirmAccount(payAccount.split(' · ')[0]);
    const [y, m, dd] = payDate.split('-');
    setConfirmDate(`${m}/${dd}/${y}`);
    setConfirmOpen(true);
  };

  /* Confirm modal Back → close */
  const handleCancelConfirm = () => setConfirmOpen(false);

  /* Confirm modal Pay now → close confirm, populate + open success */
  const handleConfirmPay = () => {
    setConfirmOpen(false);
    const selected = rows.filter((r) => r.checked && visibleIds.has(r.id));
    let total = 0;
    selected.forEach((r) => {
      total += parseFloat((r.amount || '0').replace(/,/g, '')) || 0;
    });
    const [y, m, dd] = payDate.split('-');
    setSuccessData({
      count: selected.length,
      total: money(total),
      date: `${m}/${dd}/${y}`,
      printNote: printLater
        ? 'Print later is on — checks queued in the Print Checks workspace.'
        : 'Print later is off — checks will print now.',
    });
    setSuccessOpen(true);
  };

  /* Success modal Done → close, remove paid rows, toast */
  const handleDone = () => {
    setSuccessOpen(false);
    setRows((prev) => prev.filter((r) => !r.checked));
    showToast('Payments scheduled');
  };

  /* Success modal View payments → navigate to Bills (closest existing screen to
     a payments history view). TODO: when a dedicated `payment-history` screen
     exists in shellData, route to EBL_NAV.paymentHistory() instead. */
  const handleViewPayments = () => {
    setSuccessOpen(false);
    const [d, s] = EBL_NAV.bills();
    onNavigate(d, s);
    showToast('Opening payments history');
  };

  /* Cancel button (footer) → toast + navigate to Bills */
  const handleCancel = () => {
    const [d, s] = EBL_NAV.bills();
    onNavigate(d, s);
    showToast('Returning to Bills');
  };

  /* Back arrow (header) → toast + navigate to Bills */
  const handleBack = () => {
    const [d, s] = EBL_NAV.bills();
    onNavigate(d, s);
    showToast('Returning to Bills');
  };

  /* Print checks button → toast. TODO: when a dedicated `print-checks` screen
     exists in shellData, route to EBL_NAV.printChecks() instead. For now there
     is no Print Checks workspace view built, so we surface a clear toast. */
  const handlePrintChecks = () => showToast('Print checks workspace (not yet built)');

  /* Escape key → close any open modal */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (successOpen) setSuccessOpen(false);
        else if (confirmOpen) setConfirmOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [successOpen, confirmOpen]);

  /* ═══════════════════════════════════════════════════════════════
     Render
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="pay-bills-page">
      {/* ═══════════ Context header ═══════════ */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Expenses &amp; Bills</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Bill payments</span>
        </div>
      </div>

      {/* ═══════════ PAY BILLS WORKSPACE ═══════════ */}
      <main>
        {/* Sticky total header */}
        <div className="pay-header">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
              onClick={handleBack}
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
            <div>
              <h1 className="text-headline-md">Pay bills</h1>
              <p className="text-[11px] text-on-surface-variant">{totals.selectionSummary}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={handlePrintChecks}
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              Print checks
            </button>
            <div className="total-block">
              <div className="label">Total payment amount</div>
              <div className="val">{totals.totalDisplay}</div>
            </div>
          </div>
        </div>

        {/* Payment controls */}
        <div className="pay-controls">
          <div>
            <label className="field-label">Payment account</label>
            <select className="field-input" value={payAccount} onChange={handlePayAccount}>
              {ACCOUNTS.map((a) => (
                <option key={a.label} value={a.label}>{a.label}</option>
              ))}
            </select>
            <div className="text-[11px] text-on-surface-variant mt-1">{balanceNote}</div>
          </div>
          <div>
            <label className="field-label">Payment date</label>
            <input
              className="field-input"
              type="date"
              value={payDate}
              onChange={handlePayDate}
            />
          </div>
          <div>
            <label className="field-label">Starting check no.</label>
            <input className="field-input" placeholder="1042" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-body-sm cursor-pointer pb-2">
              <input
                type="checkbox"
                className="row-check"
                checked={printLater}
                onChange={handlePrintLater}
              />
              <span>Print later</span>
            </label>
          </div>
        </div>

        {/* Filter bar */}
        <div className="pay-filters">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input
              className="w-full h-8 pl-7 pr-2 bg-white border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
              placeholder="Filter by vendor, bill no.…"
              value={search}
              onChange={handleSearch}
            />
          </div>
          <label className="h-8 px-2 border border-surface-dim rounded text-label-sm hover:bg-white flex items-center gap-1 bg-white">
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">calendar_today</span>
            <span className="text-on-surface-variant">Due:</span>
            <select
              className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none"
              value={dueFilter}
              onChange={handleDueFilter}
            >
              <option value="all">All due dates</option>
              <option value="7">Due within 7 days</option>
              <option value="30">Due within 30 days</option>
              <option value="overdue">Overdue only</option>
            </select>
          </label>
          <span className="w-px h-5 bg-surface-dim"></span>
          <button
            type="button"
            className="h-8 px-2 text-label-sm font-semibold text-primary hover:bg-white rounded"
            onClick={handleSelectAll}
          >
            Select all
          </button>
          <button
            type="button"
            className="h-8 px-2 text-label-sm font-semibold text-on-surface-variant hover:bg-white rounded"
            onClick={handleClearAll}
          >
            Clear
          </button>
          <span className="ml-auto text-[11px] text-on-surface-variant">{totals.payCountText}</span>
        </div>

        {/* Bills table */}
        <div className="bg-white border-b border-surface-dim">
          <table className="pay-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    className="row-check"
                    checked={allVisibleChecked}
                    onChange={(e) => handleCheckAll(e.target.checked)}
                  />
                </th>
                <th>Vendor</th>
                <th>Bill no.</th>
                <th>Due</th>
                <th className="right">Bill amount</th>
                <th className="right">Balance due</th>
                <th className="right">Payment</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr
                  key={r.id}
                  className={`pay-row${r.checked ? ' checked' : ''}`}
                  style={r.visible ? undefined : { display: 'none' }}
                >
                  <td>
                    <input
                      type="checkbox"
                      className="row-check pay-check"
                      checked={r.checked}
                      onChange={(e) => handleRowCheck(r.id, e.target.checked)}
                    />
                  </td>
                  <td className="font-medium">{r.vendor}</td>
                  <td className="text-on-surface-variant">{r.billno}</td>
                  <td className={r.overdue ? 'overdue' : ''}>{r.dueDisplay}</td>
                  <td className="right">{money(r.balance)}</td>
                  <td className="right">{money(r.balance)}</td>
                  <td className="right">
                    <input
                      className="amt-input"
                      value={r.amount}
                      onChange={(e) => handleAmountInput(r.id, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="pay-footer">
          <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">info</span>
            <span>{totals.footerNote}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-9 px-4 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-9 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleSubmit}
              disabled={totals.submitDisabled}
            >
              <span className="material-symbols-outlined text-[16px] align-middle mr-1">payments</span>
              Pay <span>{totals.selectedCount}</span> bills
            </button>
          </div>
        </div>
      </main>

      {/* ═══════════ CONFIRMATION MODAL ═══════════ */}
      <div className={`modal-scrim${confirmOpen ? ' open' : ''}`} id="confirm-modal">
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="p-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-secondary-container flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px] text-on-secondary-container">payments</span>
            </div>
            <h2 className="text-headline-sm mb-1">Confirm payment</h2>
            <p className="text-body-sm text-on-surface-variant mb-4">
              You're about to pay <strong>{confirmSummary.length}</strong> bills totaling{' '}
              <strong>{confirmTotal}</strong>.
            </p>
            <div className="text-left bg-surface-container-low rounded-lg p-3 mb-4 space-y-1 text-body-sm">
              {confirmSummary.map((s, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate">{s.vendor} · {s.billno}</span>
                  <span className="tabular-nums font-medium">{s.amount}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-body-sm pt-3 border-t border-surface-dim mb-4">
              <span className="text-on-surface-variant">From</span>
              <span className="font-medium">{confirmAccount}</span>
            </div>
            <div className="flex items-center justify-between text-body-sm pb-3 border-b border-surface-dim mb-4">
              <span className="text-on-surface-variant">Payment date</span>
              <span className="font-medium">{confirmDate}</span>
            </div>
          </div>
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              className="flex-1 h-9 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
              onClick={handleCancelConfirm}
            >
              Back
            </button>
            <button
              type="button"
              className="flex-1 h-9 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
              onClick={handleConfirmPay}
            >
              <span className="material-symbols-outlined text-[16px] align-middle mr-1">check</span>
              Pay now
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════ SUCCESS MODAL ═══════════ */}
      <div className={`modal-scrim${successOpen ? ' open' : ''}`} id="success-modal">
        <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-secondary-container flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[32px] text-on-secondary-container">check_circle</span>
            </div>
            <h2 className="text-headline-md mb-2">Payment scheduled</h2>
            <p className="text-body-sm text-on-surface-variant mb-5">
              <strong>{successData.count}</strong> bills totaling <strong>{successData.total}</strong>{' '}
              will be paid on <span>{successData.date}</span>.
            </p>
            <div className="bg-surface-container-low rounded-lg p-3 text-left text-[11px] text-on-surface-variant mb-5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px] text-secondary">mail</span>
                Confirmation emailed to <strong>sarah@unsaid.io</strong>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px]">print</span>
                <span>{successData.printNote}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                ACH payments typically settle in 1–2 business days.
              </div>
            </div>
          </div>
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              className="flex-1 h-9 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
              onClick={handleViewPayments}
            >
              View payments
            </button>
            <button
              type="button"
              className="flex-1 h-9 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
              onClick={handleDone}
            >
              Done
            </button>
          </div>
        </div>
      </div>

      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
