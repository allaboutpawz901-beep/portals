'use client';
import './business-tax.css';
import { useState } from 'react';
import { BusinessTaxScreenProps, TAX_NAV, daysUntil, deadlineTone } from './types';

type DeadlineTone = 'past' | 'urgent' | 'soon' | 'far';

interface DeadlineBadge {
  tone: DeadlineTone;
  icon: string;
  label: string;
}

function computeDeadlineBadge(iso: string): DeadlineBadge {
  const days = daysUntil(iso);
  const tone = deadlineTone(days);
  const icon =
    tone === 'past' ? 'check_circle' : tone === 'urgent' ? 'warning' : tone === 'soon' ? 'schedule' : 'event';
  const label = tone === 'past' ? `${Math.abs(days)}d ago` : `${days} days left`;
  return { tone, icon, label };
}

interface UnmappedRow {
  account: string;
  type: string;
  dot: string;
  options: string[];
}

const UNMAPPED_ROWS: UnmappedRow[] = [
  {
    account: 'Marketing — Contractors',
    type: 'Expense',
    dot: 'bg-qb-maroon',
    options: ['Contract labor', 'Advertising', 'Other deductions'],
  },
  {
    account: 'Warehouse utilities',
    type: 'Expense',
    dot: 'bg-qb-maroon',
    options: ['Utilities', 'Rent or lease', 'Other deductions'],
  },
  {
    account: 'Freight income',
    type: 'Income',
    dot: 'bg-qb-green',
    options: ['Gross receipts', 'Returns and allowances', 'Other income'],
  },
];

const MAPPABLE_TOTAL = 34;

export default function BusinessTaxOverview({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: BusinessTaxScreenProps) {
  // One string value per unmapped row ('' = unmapped)
  const [mapCats, setMapCats] = useState<string[]>(['', '', '']);
  const [saved, setSaved] = useState(false);

  const mappedNew = mapCats.filter((v) => v !== '').length;
  const unmappedCount = UNMAPPED_ROWS.length - mappedNew;
  const mappedCount = saved ? MAPPABLE_TOTAL : 31 + mappedNew;
  const progressPct = (mappedCount / MAPPABLE_TOTAL) * 100;
  const allMapped = unmappedCount === 0;

  const handleSelectChange = (idx: number, value: string) => {
    setMapCats((prev) => prev.map((v, i) => (i === idx ? value : v)));
  };

  const handleSave = () => {
    if (!allMapped) return;
    setSaved(true);
    onToast('Tax mapping saved');
  };

  const navigate = (fn: () => readonly [string, string]) => {
    const [domain, screenId] = fn();
    onNavigate(domain as Parameters<typeof onNavigate>[0], screenId);
  };

  // Pre-compute future deadline badges once
  const q4Badge = computeDeadlineBadge('2027-01-15');
  const annualBadge = computeDeadlineBadge('2027-03-15');
  const finalBadge = computeDeadlineBadge('2027-04-15');

  return (
    <>
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Business Tax</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Overview</span>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="text-headline-lg">Business Tax — Overview</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Tax year 2026 · Unsaid · C-Corp · Accrual basis
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => onToast('Tax year switcher — 2024 / 2025 / 2026')}
            >
              <span className="material-symbols-outlined text-[16px]">calendar_month</span>Tax year 2026 ▾
            </button>
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => navigate(TAX_NAV.summary)}
            >
              <span className="material-symbols-outlined text-[16px]">description</span>Tax summary
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Est. taxable profit</span>
            <div className="text-headline-lg mt-1 tabular-nums">$51,032.12</div>
            <div className="text-[11px] text-on-surface-variant mt-1">YTD · accrual</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Est. tax due</span>
            <div className="text-headline-lg mt-1 tabular-nums">$10,716.75</div>
            <div className="text-[11px] text-tertiary mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">info</span>21% federal · state TBD
            </div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Next deadline</span>
            <div className="text-headline-lg mt-1">Jan 15, 2027</div>
            <div className="text-[11px] text-tertiary mt-1">Q4 estimated payment</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-4">
            <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Mapped accounts</span>
            <div className="text-headline-lg mt-1 tabular-nums">
              <span>{mappedCount}</span> / 34
            </div>
            <div className="text-[11px] text-error mt-1 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">warning</span>
              {saved ? 'All accounts mapped' : '3 accounts need mapping'}
            </div>
          </div>
        </div>

        {/* Create actions row */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">
            Create actions:
          </span>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('Tax summary')}
          >
            <span className="material-symbols-outlined text-[16px]">description</span>Tax summary
          </button>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('Estimated payment')}
          >
            <span className="material-symbols-outlined text-[16px]">payments</span>Estimated payment
          </button>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('Tax payment')}
          >
            <span className="material-symbols-outlined text-[16px]">account_balance</span>Tax payment
          </button>
          <button
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => onCreate('File extension')}
          >
            <span className="material-symbols-outlined text-[16px]">schedule</span>File extension
          </button>
          <button
            className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1"
            onClick={onOpenCreateFlyout}
          >
            <span className="material-symbols-outlined text-[16px]">apps</span>Show all
          </button>
        </div>

        {/* Two-column: Deadlines + Taxable profit breakdown */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
          {/* Deadlines */}
          <div className="xl:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-headline-sm">Filing deadlines</h2>
              <span className="text-[11px] text-on-surface-variant">Tax year 2026 · C-Corp</span>
            </div>
            <div className="space-y-2">
              {/* Q1 — past / Paid */}
              <div className="deadline-card past">
                <div className="deadline-date">
                  <div className="m">Apr</div>
                  <div className="d">15</div>
                  <div className="text-[10px] text-on-surface-variant">2026</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body-md font-semibold">Q1 estimated payment</span>
                    <span className="deadline-status past">
                      <span className="material-symbols-outlined text-[11px]">check_circle</span>Paid
                    </span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">
                    Form 1120-W · $2,560.00 paid 04/12/2026
                  </div>
                </div>
                <button
                  className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low"
                  onClick={() =>
                    onToast('Opening payment detail drawer — 1120-W line, confirmation, amount paid')
                  }
                >
                  View
                </button>
              </div>

              {/* Q2 — past / Paid */}
              <div className="deadline-card past">
                <div className="deadline-date">
                  <div className="m">Jun</div>
                  <div className="d">15</div>
                  <div className="text-[10px] text-on-surface-variant">2026</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body-md font-semibold">Q2 estimated payment</span>
                    <span className="deadline-status past">
                      <span className="material-symbols-outlined text-[11px]">check_circle</span>Paid
                    </span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">
                    Form 1120-W · $2,560.00 paid 06/13/2026
                  </div>
                </div>
                <button
                  className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low"
                  onClick={() =>
                    onToast('Opening payment detail drawer — 1120-W line, confirmation, amount paid')
                  }
                >
                  View
                </button>
              </div>

              {/* Q3 — past / Paid */}
              <div className="deadline-card past">
                <div className="deadline-date">
                  <div className="m">Sep</div>
                  <div className="d">15</div>
                  <div className="text-[10px] text-on-surface-variant">2026</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body-md font-semibold">Q3 estimated payment</span>
                    <span className="deadline-status past">
                      <span className="material-symbols-outlined text-[11px]">check_circle</span>Paid
                    </span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">
                    Form 1120-W · $2,560.00 paid 09/12/2026
                  </div>
                </div>
                <button
                  className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low"
                  onClick={() =>
                    onToast('Opening payment detail drawer — 1120-W line, confirmation, amount paid')
                  }
                >
                  View
                </button>
              </div>

              {/* Q4 — computed countdown */}
              <div className={`deadline-card ${q4Badge.tone}`}>
                <div className="deadline-date">
                  <div className="m">Jan</div>
                  <div className="d">15</div>
                  <div className="text-[10px] text-on-surface-variant">2027</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body-md font-semibold">Q4 estimated payment</span>
                    <span className={`deadline-status ${q4Badge.tone}`}>
                      <span className="material-symbols-outlined text-[11px]">{q4Badge.icon}</span>
                      {q4Badge.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">Form 1120-W · est. $2,560.00</div>
                </div>
                <button
                  className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container"
                  onClick={() => onToast('Q4 estimated payment — opens pay modal (amount, bank account, submit)')}
                >
                  Pay
                </button>
              </div>

              {/* Annual return — computed countdown */}
              <div className={`deadline-card ${annualBadge.tone}`}>
                <div className="deadline-date">
                  <div className="m">Mar</div>
                  <div className="d">15</div>
                  <div className="text-[10px] text-on-surface-variant">2027</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body-md font-semibold">Annual return (Form 1120)</span>
                    <span className={`deadline-status ${annualBadge.tone}`}>
                      <span className="material-symbols-outlined text-[11px]">{annualBadge.icon}</span>
                      {annualBadge.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">Fiscal year 2026 · e-file</div>
                </div>
                <button
                  className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low"
                  onClick={() => onToast('Filing workflow — opens wizard step 1 of 4')}
                >
                  Start
                </button>
              </div>

              {/* Final payment — computed countdown */}
              <div className={`deadline-card ${finalBadge.tone}`}>
                <div className="deadline-date">
                  <div className="m">Apr</div>
                  <div className="d">15</div>
                  <div className="text-[10px] text-on-surface-variant">2027</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body-md font-semibold">Final payment / extension deadline</span>
                    <span className={`deadline-status ${finalBadge.tone}`}>
                      <span className="material-symbols-outlined text-[11px]">{finalBadge.icon}</span>
                      {finalBadge.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">
                    Pay balance owed after annual return
                  </div>
                </div>
                <button
                  className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low"
                  onClick={() => onToast('Filing workflow — opens wizard step 1 of 4')}
                >
                  Start
                </button>
              </div>
            </div>
          </div>

          {/* Taxable profit breakdown (bar chart) */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <h2 className="text-headline-sm mb-3">Taxable profit breakdown</h2>
            <div className="bar-row">
              <div className="bar-label">Gross income</div>
              <div className="bar-track">
                <div className="bar-fill bg-qb-green" style={{ width: '100%' }}></div>
              </div>
              <div className="bar-value">$89,324</div>
            </div>
            <div className="bar-row">
              <div className="bar-label">COGS</div>
              <div className="bar-track">
                <div className="bar-fill bg-qb-maroon" style={{ width: '28%' }}></div>
              </div>
              <div className="bar-value">−$25,380</div>
            </div>
            <div className="bar-row">
              <div className="bar-label">Deductible expenses</div>
              <div className="bar-track">
                <div className="bar-fill bg-qb-maroon" style={{ width: '14%' }}></div>
              </div>
              <div className="bar-value">−$12,912</div>
            </div>
            <div className="bar-row mt-2 pt-2 border-t border-surface-dim">
              <div className="bar-label font-semibold text-on-surface">Taxable profit</div>
              <div className="bar-track">
                <div className="bar-fill bg-qb-blue" style={{ width: '57%' }}></div>
              </div>
              <div className="bar-value text-qb-blue">$51,032</div>
            </div>
            <div className="mt-3 pt-3 border-t border-surface-dim space-y-1 text-[11px] text-on-surface-variant">
              <div className="flex justify-between">
                <span>Federal rate (C-Corp)</span>
                <span className="font-semibold">21%</span>
              </div>
              <div className="flex justify-between">
                <span>Est. federal tax</span>
                <span className="font-semibold tabular-nums">$10,716.75</span>
              </div>
              <div className="flex justify-between">
                <span>State (TN)</span>
                <span className="font-semibold tabular-nums">$0.00</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-surface-dim">
                <span className="font-semibold text-on-surface">Total est. tax</span>
                <span className="font-semibold text-on-surface tabular-nums">$10,716.75</span>
              </div>
            </div>
          </div>
        </div>

        {/* Map accounts task */}
        <div className="map-task mb-5">
          {saved ? (
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[24px] text-secondary">check_circle</span>
              <div>
                <h2 className="text-headline-sm">All accounts mapped</h2>
                <p className="text-[11px] text-on-surface-variant mt-0.5">
                  34 of 34 accounts are mapped to tax categories. Ready for filing.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-headline-sm">Map accounts to tax categories</h2>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Every income &amp; expense account needs a tax line before filing. {mappedCount} of{' '}
                    {MAPPABLE_TOTAL} mapped.
                  </p>
                </div>
                {allMapped ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-secondary-container text-on-secondary-container">
                    All mapped
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-error-container text-on-error-container">
                    {unmappedCount} need mapping
                  </span>
                )}
              </div>
              <div className="progress mb-3">
                <div style={{ width: `${progressPct}%` }}></div>
              </div>
              <div>
                {UNMAPPED_ROWS.map((row, idx) => (
                  <div className="unmapped-row" key={row.account}>
                    <span className={`dot ${row.dot}`}></span>
                    <span className="text-body-sm font-medium flex-1">{row.account}</span>
                    <span className="text-[11px] text-on-surface-variant">{row.type}</span>
                    <select value={mapCats[idx]} onChange={(e) => handleSelectChange(idx, e.target.value)}>
                      <option value="">— Map to tax category —</option>
                      {row.options.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-surface-dim">
                <button
                  className="h-8 px-3 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
                  onClick={() => navigate(TAX_NAV.coa)}
                >
                  <span className="material-symbols-outlined text-[14px]">account_tree</span>Open chart of accounts
                </button>
                <button
                  className="h-8 px-3 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={!allMapped}
                  onClick={handleSave}
                >
                  <span className="material-symbols-outlined text-[14px] align-middle mr-1">save</span>Save mapping
                </button>
              </div>
            </>
          )}
        </div>

        {/* Bottom row: Mini reports + recent activity */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Quick reports */}
          <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-headline-sm">Tax reports</h2>
              <button
                className="text-[11px] text-primary font-semibold hover:underline"
                onClick={() => navigate(TAX_NAV.reports)}
              >
                View all reports
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="text-left p-3 border border-surface-dim rounded-lg hover:border-primary hover:bg-surface-container-low flex items-center gap-2"
                onClick={() => navigate(TAX_NAV.summary)}
              >
                <span className="material-symbols-outlined text-[20px] text-qb-blue">description</span>
                <div className="min-w-0">
                  <div className="text-body-sm font-semibold truncate">Tax summary</div>
                  <div className="text-[11px] text-on-surface-variant truncate">Income / deductions / assets</div>
                </div>
              </button>
              <button
                className="text-left p-3 border border-surface-dim rounded-lg hover:border-primary hover:bg-surface-container-low flex items-center gap-2"
                onClick={() => navigate(TAX_NAV.reports)}
              >
                <span className="material-symbols-outlined text-[20px] text-qb-maroon">gavel</span>
                <div className="min-w-0">
                  <div className="text-body-sm font-semibold truncate">Sales tax liability</div>
                  <div className="text-[11px] text-on-surface-variant truncate">Collected minus paid</div>
                </div>
              </button>
              <button
                className="text-left p-3 border border-surface-dim rounded-lg hover:border-primary hover:bg-surface-container-low flex items-center gap-2"
                onClick={() => navigate(TAX_NAV.reports)}
              >
                <span className="material-symbols-outlined text-[20px] text-qb-green">receipt_long</span>
                <div className="min-w-0">
                  <div className="text-body-sm font-semibold truncate">Payroll tax (941)</div>
                  <div className="text-[11px] text-on-surface-variant truncate">Quarterly federal</div>
                </div>
              </button>
              <button
                className="text-left p-3 border border-surface-dim rounded-lg hover:border-primary hover:bg-surface-container-low flex items-center gap-2"
                onClick={() => navigate(TAX_NAV.reports)}
              >
                <span className="material-symbols-outlined text-[20px] text-qb-teal">assignment</span>
                <div className="min-w-0">
                  <div className="text-body-sm font-semibold truncate">Form 1120 prep</div>
                  <div className="text-[11px] text-on-surface-variant truncate">Annual return worksheet</div>
                </div>
              </button>
            </div>
          </div>

          {/* Recent activity */}
          <div className="bg-white rounded-xl border border-surface-dim p-5">
            <h2 className="text-headline-sm mb-3">Recent tax activity</h2>
            <div className="space-y-3 text-body-sm">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-secondary mt-0.5">check_circle</span>
                <div className="min-w-0">
                  <div className="font-medium">Q3 estimated payment filed</div>
                  <div className="text-[11px] text-on-surface-variant">$2,560.00 · 09/12/2026</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-qb-blue mt-0.5">tune</span>
                <div className="min-w-0">
                  <div className="font-medium">5 accounts remapped</div>
                  <div className="text-[11px] text-on-surface-variant">Priya N. · 10/28/2026</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-qb-maroon mt-0.5">description</span>
                <div className="min-w-0">
                  <div className="font-medium">2025 annual return accepted</div>
                  <div className="text-[11px] text-on-surface-variant">IRS · 06/22/2026</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] text-tertiary mt-0.5">download</span>
                <div className="min-w-0">
                  <div className="font-medium">Tax summary exported</div>
                  <div className="text-[11px] text-on-surface-variant">Marcus L. · 10/15/2026</div>
                </div>
              </div>
            </div>
            <button
              className="w-full mt-3 h-8 border border-surface-dim rounded text-body-sm hover:bg-surface-container-low flex items-center justify-center gap-1"
              onClick={() => onToast('Tax activity history — 12 entries')}
            >
              <span className="material-symbols-outlined text-[14px]">history</span>Full history
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
