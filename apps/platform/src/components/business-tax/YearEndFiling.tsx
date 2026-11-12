'use client';
import './business-tax.css';
import { useState, useEffect, useRef } from 'react';
import { BusinessTaxScreenProps, TAX_NAV, daysUntil } from './types';

type FilingAction = 'continue' | 'restart' | 'extension' | 'accountant' | 'abandon';

export default function YearEndFiling({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: BusinessTaxScreenProps) {
  // Feature flag — true shows working page, false shows gated route
  const [ungated, setUngated] = useState(true);

  // Filing split menu
  const [filingMenuOpen, setFilingMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const splitBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // E-file drawer (step 4 of 5)
  const [efileOpen, setEfileOpen] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  const days = daysUntil('2027-03-15');

  const navigate = (fn: () => readonly [string, string]) => {
    const [domain, screenId] = fn();
    onNavigate(domain as Parameters<typeof onNavigate>[0], screenId);
  };

  // Close filing menu on outside click
  useEffect(() => {
    if (!filingMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) return;
      if (splitBtnRef.current && splitBtnRef.current.contains(target)) return;
      setFilingMenuOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [filingMenuOpen]);

  // ── Handlers ────────────────────────────────────────────────

  function handleFlagToggle() {
    const next = !ungated;
    setUngated(next);
    onToast(`year_end_filing → ${next ? 'ON (ungated)' : 'OFF (gated)'}`);
  }

  function openFilingMenu(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const top = r.bottom + 4;
    const left = Math.min(r.right - 220, window.innerWidth - 240);
    setMenuPos({ top, left });
    setFilingMenuOpen((v) => !v);
  }

  function handleFilingAction(act: FilingAction) {
    setFilingMenuOpen(false);
    if (act === 'continue') {
      setEfileOpen(true);
      return;
    }
    if (act === 'restart') {
      onToast('Restarting review from step 1…');
      return;
    }
    if (act === 'extension') {
      onToast('Form 7004 extension filed — deadline moved to Sep 15, 2027');
      return;
    }
    if (act === 'accountant') {
      onToast('Draft sent to accountant — grant access via Settings › Manage users');
      return;
    }
    if (act === 'abandon') {
      onToast('Draft discarded — can resume anytime from Year-end and filing');
    }
  }

  function openEfile() {
    setEfileOpen(true);
  }

  function closeEfile() {
    setEfileOpen(false);
  }

  function handleTransmit() {
    if (!authorized) return;
    setEfileOpen(false);
    onToast('Return transmitted to IRS — confirmation to follow within 24h');
  }

  function handleGatedContact(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    onToast('Opening Contact support — year-end engagement');
  }

  // onCreate / onOpenCreateFlyout are part of the shared contract but
  // this screen doesn't surface create actions. Suppressed for lint.
  void onCreate;
  void onOpenCreateFlyout;

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
          <span className="text-label-md text-primary font-semibold">Year-end and filing</span>
        </div>
      </div>

      {/* Demo feature-flag control strip */}
      <div className="flag-toggle-bar">
        <span className="material-symbols-outlined text-[14px]">toggle_on</span>
        <span>
          Demo control — feature flag: <strong>year_end_filing</strong>
        </span>
        <span className="spacer"></span>
        <span className="text-on-surface-variant">
          OFF shows the gated route (§A &quot;This product isn&apos;t available for your account&quot;). ON shows the working page.
        </span>
        <label className="flex items-center gap-2 cursor-pointer">
          <span>Ungated</span>
          <div
            className={`toggle ${ungated ? 'on' : ''}`}
            role="switch"
            aria-checked={ungated}
            tabIndex={0}
            onClick={handleFlagToggle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleFlagToggle();
              }
            }}
          ></div>
        </label>
      </div>

      {!ungated ? (
        // ════════════════════════════════════════════════════════
        // GATED STATE — §A "This product isn't available"
        // ════════════════════════════════════════════════════════
        <main className="flex items-center justify-center min-h-[calc(100vh-120px)] px-6">
          <div className="gate">
            <div className="gate-icon">
              <span className="material-symbols-outlined text-[36px] text-on-surface-variant">lock</span>
            </div>
            <h1 className="text-headline-lg mb-2">Year-end and filing isn&apos;t available for your account</h1>
            <p className="text-body-md text-on-surface-variant mb-6">
              This feature requires a Business Tax subscription or an active year-end engagement. Reach out to your account manager to enable it, or explore what else you can do with Business Tax today.
            </p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                className="h-9 px-4 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low"
                onClick={() => navigate(TAX_NAV.overview)}
              >
                <span className="material-symbols-outlined text-[16px] align-middle mr-1">arrow_back</span>
                Back to Business Tax
              </button>
              <button
                className="h-9 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
                onClick={() => navigate(TAX_NAV.overview)}
              >
                <span className="material-symbols-outlined text-[16px] align-middle mr-1">help</span>
                Learn about Business Tax
              </button>
            </div>
            <p className="mt-6 text-[11px] text-on-surface-variant">
              Need help?{' '}
              <a
                href="#"
                className="text-primary font-semibold hover:underline"
                onClick={handleGatedContact}
              >
                Contact support
              </a>
            </p>
          </div>
        </main>
      ) : (
        // ════════════════════════════════════════════════════════
        // UNGATED STATE
        // ════════════════════════════════════════════════════════
        <main className="px-6 pb-12">
          {/* Page header */}
          <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-headline-lg">Year-end and filing</h1>
                <span className="flag-chip">
                  <span className="material-symbols-outlined text-[12px]">verified</span>
                  Feature enabled
                </span>
              </div>
              <p className="text-body-sm text-on-surface-variant mt-0.5">
                Prepare, review, and e-file your annual return for tax year 2026.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
                onClick={() => onToast('Tax year switcher — 2024 / 2025 / 2026')}
              >
                <span className="material-symbols-outlined text-[16px]">calendar_month</span>Tax year 2026 ▾
              </button>
              <div className="flex split-btn">
                <button
                  className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main"
                  onClick={openEfile}
                >
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>Continue filing
                </button>
                <button
                  ref={splitBtnRef}
                  className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"
                  onClick={openFilingMenu}
                  aria-haspopup="menu"
                  aria-expanded={filingMenuOpen}
                >
                  <span className="material-symbols-outlined text-[16px]">expand_more</span>
                </button>
              </div>
            </div>
          </div>

          {/* Filing wizard step bar */}
          <div className="bg-white rounded-xl border border-surface-dim p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Filing progress</div>
              <div className="text-[11px] text-on-surface-variant">Step 3 of 5 · 60% complete</div>
            </div>
            <div className="step-bar mb-2">
              <div className="step">
                <span className="step-circle done">✓</span>
                <span className="step-label done">Gather data</span>
              </div>
              <div className="step-line done"></div>
              <div className="step">
                <span className="step-circle done">✓</span>
                <span className="step-label done">Reconcile</span>
              </div>
              <div className="step-line done"></div>
              <div className="step">
                <span className="step-circle active">3</span>
                <span className="step-label active">Review 1120 lines</span>
              </div>
              <div className="step-line"></div>
              <div className="step">
                <span className="step-circle todo">4</span>
                <span className="step-label todo">E-file</span>
              </div>
              <div className="step-line"></div>
              <div className="step">
                <span className="step-circle todo">5</span>
                <span className="step-label todo">Confirmed</span>
              </div>
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
            <div className="kpi-card">
              <div className="kpi-label">Est. tax due</div>
              <div className="kpi-val">$10,716.75</div>
              <div className="text-[11px] text-on-surface-variant mt-1">21% federal · state TBD</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Amount paid to date</div>
              <div className="kpi-val text-secondary">$7,680.00</div>
              <div className="text-[11px] text-on-surface-variant mt-1">Q1 / Q2 / Q3 estimates</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Remaining balance</div>
              <div className="kpi-val text-error">$3,036.75</div>
              <div className="text-[11px] text-on-surface-variant mt-1">Due at filing</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Days to deadline</div>
              <div className="kpi-val">{days} days</div>
              <div className="text-[11px] text-on-surface-variant mt-1">Mar 15, 2027 (Form 1120)</div>
            </div>
          </div>

          {/* Two-column: 1120 lines + Checklist */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
            {/* 1120 form lines preview */}
            <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-headline-sm">Form 1120 — review lines</h2>
                <span className="text-[11px] text-on-surface-variant">Draft · 4 lines flagged</span>
              </div>
              <div>
                <div className="form-line">
                  <div className="ln">1a</div>
                  <div className="desc">
                    <strong>Gross receipts or sales</strong>
                    <div className="text-[11px] text-on-surface-variant">36 invoices + 5 sales receipts</div>
                  </div>
                  <div className="amt">$89,324.00</div>
                </div>
                <div className="form-line">
                  <div className="ln">2</div>
                  <div className="desc">
                    <strong>Cost of goods sold</strong>
                    <div className="text-[11px] text-on-surface-variant">COGS — Apparel + COGS — Wall Art</div>
                  </div>
                  <div className="amt">$25,380.00</div>
                </div>
                <div className="form-line">
                  <div className="ln">3</div>
                  <div className="desc">
                    <strong>Gross profit</strong>
                  </div>
                  <div className="amt">$63,944.00</div>
                </div>
                <div className="form-line">
                  <div className="ln">18</div>
                  <div className="desc">
                    <strong>Other deductions</strong>
                    <div className="text-[11px] text-on-surface-variant">
                      Operating expenses (office, software, shipping, advertising, bank fees)
                    </div>
                  </div>
                  <div className="amt">$12,911.88</div>
                </div>
                <div className="form-line flagged">
                  <div className="ln">20</div>
                  <div className="desc">
                    <strong>Other deductions — unmapped accounts</strong>
                    <div className="text-[11px] text-on-surface-variant">
                      3 accounts not yet mapped to tax lines (Marketing — Contractors, Warehouse utilities, Freight income)
                    </div>
                  </div>
                  <div className="amt">$0.00</div>
                </div>
                <div className="form-line">
                  <div className="ln">28</div>
                  <div className="desc">
                    <strong>Taxable income before NOL and special deductions</strong>
                  </div>
                  <div className="amt">$51,032.12</div>
                </div>
                <div className="form-line">
                  <div className="ln">31</div>
                  <div className="desc">
                    <strong>Total tax</strong>
                    <div className="text-[11px] text-on-surface-variant">21% of Line 28</div>
                  </div>
                  <div className="amt">$10,716.75</div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-4 mt-3 border-t border-surface-dim">
                <button
                  className="h-8 px-3 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
                  onClick={() => navigate(TAX_NAV.summary)}
                >
                  <span className="material-symbols-outlined text-[14px]">description</span>Full tax summary
                </button>
                <button
                  className="h-8 px-3 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
                  onClick={() => onToast('Export draft 1120 as PDF')}
                >
                  <span className="material-symbols-outlined text-[14px]">download</span>Export draft 1120
                </button>
              </div>
            </div>

            {/* Pre-filing checklist */}
            <div className="bg-white rounded-xl border border-surface-dim p-5">
              <h2 className="text-headline-sm mb-3">Pre-filing checklist</h2>
              <div className="check-item">
                <div className="check-status done">
                  <span className="material-symbols-outlined text-[13px]">check</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-medium">Reconcile all bank accounts</div>
                  <div className="text-[11px] text-on-surface-variant">Chase •9910 · Nov closed</div>
                </div>
              </div>
              <div className="check-item">
                <div className="check-status done">
                  <span className="material-symbols-outlined text-[13px]">check</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-medium">Confirm year-end date</div>
                  <div className="text-[11px] text-on-surface-variant">12/31/2026</div>
                </div>
              </div>
              <div className="check-item">
                <div className="check-status warn">
                  <span className="material-symbols-outlined text-[13px]">warning</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-medium">Map all accounts to tax lines</div>
                  <div className="text-[11px] text-on-surface-variant">3 of 34 unmapped</div>
                </div>
                <button
                  className="h-6 px-2 border border-surface-dim rounded text-[11px] font-semibold text-primary hover:bg-surface-container-low"
                  onClick={() => navigate(TAX_NAV.summary)}
                >
                  Fix
                </button>
              </div>
              <div className="check-item">
                <div className="check-status done">
                  <span className="material-symbols-outlined text-[13px]">check</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-medium">Review 1099 contractors</div>
                  <div className="text-[11px] text-on-surface-variant">4 filed · due Jan 31, 2027</div>
                </div>
              </div>
              <div className="check-item">
                <div className="check-status warn">
                  <span className="material-symbols-outlined text-[13px]">warning</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-medium">Verify officer compensation</div>
                  <div className="text-[11px] text-on-surface-variant">Sarah Ahmed · $0 · C-Corp must report</div>
                </div>
                <button
                  className="h-6 px-2 border border-surface-dim rounded text-[11px] font-semibold text-primary hover:bg-surface-container-low"
                  onClick={() => onToast('Navigate → Payroll (screen not yet built)')}
                >
                  Review
                </button>
              </div>
              <div className="check-item">
                <div className="check-status todo">
                  <span className="material-symbols-outlined text-[13px]">schedule</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-medium">Upload signed Form 8879</div>
                  <div className="text-[11px] text-on-surface-variant">E-file authorization</div>
                </div>
              </div>
              <div className="check-item">
                <div className="check-status todo">
                  <span className="material-symbols-outlined text-[13px]">schedule</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-body-sm font-medium">Review state filing requirements</div>
                  <div className="text-[11px] text-on-surface-variant">TN — no state income tax for C-Corp</div>
                </div>
              </div>
            </div>
          </div>

          {/* Two-column: Deadline + Recent activity */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Key filing dates */}
            <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
              <h2 className="text-headline-sm mb-3">Key filing dates</h2>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low">
                  <span className="material-symbols-outlined text-[20px] text-qb-blue">event</span>
                  <div className="flex-1">
                    <div className="text-body-sm font-semibold">E-file window opens</div>
                    <div className="text-[11px] text-on-surface-variant">Jan 15, 2027 — IRS MeF system opens</div>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">74 days</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low">
                  <span className="material-symbols-outlined text-[20px] text-qb-maroon">schedule</span>
                  <div className="flex-1">
                    <div className="text-body-sm font-semibold">Form 1120 due</div>
                    <div className="text-[11px] text-on-surface-variant">Mar 15, 2027 — or file extension (Sep 15, 2027)</div>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">133 days</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low">
                  <span className="material-symbols-outlined text-[20px] text-qb-green">payments</span>
                  <div className="flex-1">
                    <div className="text-body-sm font-semibold">Payment due (no extension)</div>
                    <div className="text-[11px] text-on-surface-variant">Mar 15, 2027 — $3,036.75 balance</div>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">133 days</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low">
                  <span className="material-symbols-outlined text-[20px] text-qb-teal">assignment</span>
                  <div className="flex-1">
                    <div className="text-body-sm font-semibold">1099-NEC to contractors</div>
                    <div className="text-[11px] text-on-surface-variant">Jan 31, 2027 — 4 contractors</div>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">90 days</span>
                </div>
              </div>
            </div>

            {/* Recent filing activity */}
            <div className="bg-white rounded-xl border border-surface-dim p-5">
              <h2 className="text-headline-sm mb-3">Recent filing activity</h2>
              <div className="space-y-3 text-body-sm">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-secondary mt-0.5">check_circle</span>
                  <div className="min-w-0">
                    <div className="font-medium">Q3 estimated payment confirmed</div>
                    <div className="text-[11px] text-on-surface-variant">IRS · $2,560.00 · 09/12/2026</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-qb-blue mt-0.5">description</span>
                  <div className="min-w-0">
                    <div className="font-medium">2025 Form 1120 accepted</div>
                    <div className="text-[11px] text-on-surface-variant">IRS MeF · 06/22/2026</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-qb-maroon mt-0.5">schedule</span>
                  <div className="min-w-0">
                    <div className="font-medium">Extension filed for 2025</div>
                    <div className="text-[11px] text-on-surface-variant">Form 7004 · 03/13/2026</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-tertiary mt-0.5">upload</span>
                  <div className="min-w-0">
                    <div className="font-medium">Year-end data imported</div>
                    <div className="text-[11px] text-on-surface-variant">QuickBooks desktop · 04/2026</div>
                  </div>
                </div>
              </div>
              <button
                className="w-full mt-3 h-8 border border-surface-dim rounded text-body-sm hover:bg-surface-container-low flex items-center justify-center gap-1"
                onClick={() => onToast('Full filing history — 4 years')}
              >
                <span className="material-symbols-outlined text-[14px]">history</span>Full filing history
              </button>
            </div>
          </div>
        </main>
      )}

      {/* ═══════════ FILING SPLIT MENU ═══════════ */}
      <div
        ref={menuRef}
        className={`menu ${filingMenuOpen ? 'open' : ''}`}
        style={filingMenuOpen ? { top: menuPos.top, left: menuPos.left } : undefined}
      >
        <div className="menu-header">Continue filing</div>
        <button onClick={() => handleFilingAction('continue')}>
          <span className="material-symbols-outlined">play_arrow</span>Continue from step 3
        </button>
        <button onClick={() => handleFilingAction('restart')}>
          <span className="material-symbols-outlined">restart_alt</span>Restart review
        </button>
        <div className="sep"></div>
        <div className="menu-header">Alternative</div>
        <button onClick={() => handleFilingAction('extension')}>
          <span className="material-symbols-outlined">schedule</span>File extension (Form 7004)
        </button>
        <button onClick={() => handleFilingAction('accountant')}>
          <span className="material-symbols-outlined">person</span>Send to accountant
        </button>
        <div className="sep"></div>
        <button className="text-error" onClick={() => handleFilingAction('abandon')}>
          <span className="material-symbols-outlined text-error">close</span>Discard draft
        </button>
      </div>

      {/* ═══════════ E-FILE DRAWER (step 4 of 5) ═══════════ */}
      <div
        className={`drawer-scrim ${efileOpen ? 'open' : ''}`}
        onClick={closeEfile}
        aria-hidden={!efileOpen}
      />
      <div
        className={`drawer ${efileOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="E-file Form 1120"
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">upload_file</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate">E-file Form 1120</div>
              <div className="text-[11px] text-on-surface-variant">Step 4 of 5 · Tax year 2026</div>
            </div>
          </div>
          <button
            className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
            onClick={closeEfile}
            aria-label="Close drawer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="bg-surface-container-low rounded-lg p-3">
            <div className="text-[10px] text-on-surface-variant uppercase font-bold">Filing summary</div>
            <div className="grid grid-cols-2 gap-2 text-[12px] mt-2">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Form</span>
                <span className="font-semibold">1120 (C-Corp)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Tax year</span>
                <span className="font-semibold">2026</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Balance due</span>
                <span className="font-semibold tabular-nums">$3,036.75</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Payment method</span>
                <span className="font-semibold">EFTPS</span>
              </div>
            </div>
          </div>

          <div>
            <label className="field-label">Filing signer</label>
            <select className="field-input" defaultValue="Sarah Ahmed — CEO">
              <option value="Sarah Ahmed — CEO">Sarah Ahmed — CEO</option>
              <option value="Marcus Lee — CTO">Marcus Lee — CTO</option>
              <option value="Priya Nair — COO">Priya Nair — COO</option>
            </select>
          </div>

          <div>
            <label className="field-label">Contact email for IRS acknowledgment</label>
            <input className="field-input" defaultValue="sarah@unsaid.io" />
          </div>

          <div>
            <label className="field-label">Payment</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-body-sm">
                <input type="radio" name="pay" className="row-check" defaultChecked /> Pay $3,036.75 via EFTPS now
              </label>
              <label className="flex items-center gap-2 text-body-sm">
                <input type="radio" name="pay" className="row-check" /> Schedule for Mar 10, 2027 (before deadline)
              </label>
              <label className="flex items-center gap-2 text-body-sm">
                <input type="radio" name="pay" className="row-check" /> Pay by check (mail to IRS)
              </label>
            </div>
          </div>

          <div className="border-t border-surface-dim pt-3">
            <label className="flex items-start gap-2 text-body-sm cursor-pointer">
              <input
                type="checkbox"
                className="row-check mt-0.5"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
              />
              <span>
                I authorize Unsaid to e-file Form 1120 on my behalf and confirm that all information is accurate to the best of my knowledge.
              </span>
            </label>
          </div>

          <div className="bg-error-container/40 border border-error/30 rounded-lg p-3 text-[11px] text-on-error-container flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] mt-0.5">warning</span>
            <div>Once transmitted, this return cannot be edited. You can file an amended return (Form 1120-X) if changes are needed.</div>
          </div>
        </div>

        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
            onClick={closeEfile}
          >
            Cancel
          </button>
          <button
            className="h-8 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!authorized}
            onClick={handleTransmit}
          >
            <span className="material-symbols-outlined text-[16px] align-middle mr-1">send</span>Transmit to IRS
          </button>
        </div>
      </div>
    </>
  );
}
