'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import styles from './ReportsScreen.module.css';

interface ReportRow {
  kind: 'section' | 'sub' | 'total' | 'final';
  label?: string;
  cells: string[];
}

interface ReportData {
  id: string;
  title: string;
  category: 'financial' | 'sales' | 'expenses' | 'accounting' | 'tax';
  range: string;
  description: string;
  icon: string;
  iconClass: string;
  rows: ReportRow[];
}

const REPORTS: Record<string, ReportData> = {
  pnl: {
    id: 'pnl',
    title: 'Profit and Loss',
    category: 'financial',
    range: 'November 1 – 30, 2026',
    description: 'Revenue minus costs, broken down by account.',
    icon: 'trending_up',
    iconClass: styles.iconWrapBlue,
    rows: [
      { kind: 'section', cells: ['Income', '', ''] },
      { kind: 'sub', cells: ['Sales — Apparel', '$8,420.00', '$62,180.00'] },
      { kind: 'sub', cells: ['Shipping income', '$1,204.00', '$8,204.00'] },
      { kind: 'sub', cells: ['Sales — Wall Art', '$2,110.00', '$18,940.00'] },
      { kind: 'total', label: 'Total income', cells: ['$11,734.00', '$89,324.00'] },
      { kind: 'section', cells: ['Cost of goods sold', '', ''] },
      { kind: 'sub', cells: ['COGS — Apparel', '$3,120.00', '$18,140.00'] },
      { kind: 'sub', cells: ['COGS — Wall Art', '$870.00', '$7,240.00'] },
      { kind: 'total', label: 'Total COGS', cells: ['$3,990.00', '$25,380.00'] },
      { kind: 'total', label: 'Gross profit', cells: ['$7,744.00', '$63,944.00'] },
      { kind: 'section', cells: ['Expenses', '', ''] },
      { kind: 'sub', cells: ['Office supplies', '$142.50', '$1,418.00'] },
      { kind: 'sub', cells: ['Software & subscriptions', '$59.99', '$719.88'] },
      { kind: 'sub', cells: ['Shipping & delivery', '$84.20', '$1,410.00'] },
      { kind: 'sub', cells: ['Advertising', '$1,240.00', '$9,240.00'] },
      { kind: 'sub', cells: ['Bank fees', '$12.00', '$124.00'] },
      { kind: 'total', label: 'Total expenses', cells: ['$1,538.69', '$12,911.88'] },
      { kind: 'final', label: 'Net operating income', cells: ['$6,205.31', '$51,032.12'] },
    ],
  },
  bs: {
    id: 'bs',
    title: 'Balance Sheet',
    category: 'financial',
    range: 'As of November 30, 2026',
    description: 'Snapshot of what you own, owe, and are worth.',
    icon: 'balance',
    iconClass: styles.iconWrapTeal,
    rows: [
      { kind: 'section', cells: ['Assets', ''] },
      { kind: 'sub', cells: ['Business checking', '$84,210.40'] },
      { kind: 'sub', cells: ['Accounts receivable', '$8,420.00'] },
      { kind: 'sub', cells: ['Stripe clearing', '$1,842.60'] },
      { kind: 'total', label: 'Total assets', cells: ['$94,473.00'] },
      { kind: 'section', cells: ['Liabilities', ''] },
      { kind: 'sub', cells: ['Accounts payable', '$4,080.00'] },
      { kind: 'sub', cells: ['Sales tax payable', '$1,880.00'] },
      { kind: 'total', label: 'Total liabilities', cells: ['$5,960.00'] },
      { kind: 'section', cells: ['Equity', ''] },
      { kind: 'sub', cells: ["Owner's equity", '$66,010.00'] },
      { kind: 'sub', cells: ['Retained earnings', '$22,503.00'] },
      { kind: 'total', label: 'Total equity', cells: ['$88,513.00'] },
      { kind: 'final', label: 'Total liabilities + equity', cells: ['$94,473.00'] },
    ],
  },
  cashflow: {
    id: 'cashflow',
    title: 'Statement of Cash Flows',
    category: 'financial',
    range: 'November 1 – 30, 2026',
    description: 'Where cash came from and where it went.',
    icon: 'waterfall_chart',
    iconClass: styles.iconWrapGreen,
    rows: [
      { kind: 'section', cells: ['Operating activities', ''] },
      { kind: 'sub', cells: ['Net income', '$6,205.31'] },
      { kind: 'sub', cells: ['Increase in A/R', '−$8,420.00'] },
      { kind: 'sub', cells: ['Increase in A/P', '$4,080.00'] },
      { kind: 'total', label: 'Net from operating', cells: ['$1,865.31'] },
      { kind: 'section', cells: ['Investing activities', ''] },
      { kind: 'sub', cells: ['Purchase of equipment', '−$2,400.00'] },
      { kind: 'total', label: 'Net from investing', cells: ['−$2,400.00'] },
      { kind: 'section', cells: ['Financing activities', ''] },
      { kind: 'sub', cells: ['Owner contribution', '$5,000.00'] },
      { kind: 'total', label: 'Net from financing', cells: ['$5,000.00'] },
      { kind: 'final', label: 'Net change in cash', cells: ['$4,465.31'] },
    ],
  },
  araging: {
    id: 'araging',
    title: 'A/R Aging Summary',
    category: 'sales',
    range: 'As of November 30, 2026',
    description: 'Outstanding invoices by aging bucket.',
    icon: 'hourglass_top',
    iconClass: styles.iconWrapMaroon,
    rows: [
      { kind: 'section', cells: ['Customer', 'Current', '1–30', '31–60', '61+', 'Total'] },
      { kind: 'sub', cells: ['Acme Corp', '$1,240.00', '—', '—', '—', '$1,240.00'] },
      { kind: 'sub', cells: ['Maple Supply', '—', '$890.00', '—', '—', '$890.00'] },
      { kind: 'sub', cells: ['Northwind Labs', '—', '—', '$2,100.00', '—', '$2,100.00'] },
      { kind: 'sub', cells: ['Lakeside Design', '—', '—', '—', '$1,850.00', '$1,850.00'] },
      {
        kind: 'final',
        label: 'Total',
        cells: ['$1,240.00', '$890.00', '$2,100.00', '$1,850.00', '$6,080.00'],
      },
    ],
  },
  salesbycustomer: {
    id: 'salesbycustomer',
    title: 'Sales by Customer',
    category: 'sales',
    range: 'November 1 – 30, 2026',
    description: 'Revenue per customer for the period.',
    icon: 'groups',
    iconClass: styles.iconWrapNavy,
    rows: [
      { kind: 'section', cells: ['Customer', 'Revenue', '% of total'] },
      { kind: 'sub', cells: ['Acme Corp', '$8,640.00', '34%'] },
      { kind: 'sub', cells: ['Blue Ridge Co.', '$7,410.00', '29%'] },
      { kind: 'sub', cells: ['Northwind Labs', '$4,240.00', '17%'] },
      { kind: 'sub', cells: ['Orion Apparel', '$3,890.00', '15%'] },
      { kind: 'sub', cells: ['Maple Supply', '$1,180.00', '5%'] },
      { kind: 'final', label: 'Total', cells: ['$25,360.00', '100%'] },
    ],
  },
  expensesbyvendor: {
    id: 'expensesbyvendor',
    title: 'Expenses by Vendor',
    category: 'expenses',
    range: 'November 1 – 30, 2026',
    description: 'Spend per vendor for the period.',
    icon: 'receipt_long',
    iconClass: styles.iconWrapMaroon,
    rows: [
      { kind: 'section', cells: ['Vendor', 'Expenses', 'Bills'] },
      { kind: 'sub', cells: ['Printful', '$12,410.00', '8'] },
      { kind: 'sub', cells: ['Gelato', '$6,240.00', '4'] },
      { kind: 'sub', cells: ['Printify', '$4,180.00', '3'] },
      { kind: 'sub', cells: ['Adobe', '$719.88', '12'] },
      { kind: 'sub', cells: ['Staples', '$1,418.00', '9'] },
      { kind: 'final', label: 'Total', cells: ['$24,967.88', '36'] },
    ],
  },
  gl: {
    id: 'gl',
    title: 'General Ledger',
    category: 'accounting',
    range: 'November 1 – 30, 2026 · All accounts',
    description: 'All account activity for the period.',
    icon: 'menu_book',
    iconClass: styles.iconWrapBlue,
    rows: [
      { kind: 'section', cells: ['Date', 'Description', 'Account', 'Debit', 'Credit'] },
      { kind: 'sub', cells: ['11/01/2026', 'Invoice 1002', 'Sales — Apparel', '—', '$1,240.00'] },
      { kind: 'sub', cells: ['11/01/2026', 'Invoice 1002', 'A/R', '$1,240.00', '—'] },
      { kind: 'sub', cells: ['11/03/2026', 'Staples receipt', 'Office supplies', '$142.50', '—'] },
      { kind: 'sub', cells: ['11/03/2026', 'Staples receipt', 'Business checking', '—', '$142.50'] },
      { kind: 'sub', cells: ['11/10/2026', 'Stripe payout', 'Business checking', '$1,842.60', '—'] },
      { kind: 'sub', cells: ['11/10/2026', 'Stripe payout', 'Stripe clearing', '—', '$1,842.60'] },
      { kind: 'final', label: 'Total for period', cells: ['', '', '$3,225.10', '$3,225.10'] },
    ],
  },
  tb: {
    id: 'tb',
    title: 'Trial Balance',
    category: 'accounting',
    range: 'As of November 30, 2026',
    description: 'Account balances at a point in time.',
    icon: 'rule',
    iconClass: styles.iconWrapTeal,
    rows: [
      { kind: 'section', cells: ['Account', 'Debit', 'Credit'] },
      { kind: 'sub', cells: ['1000 · Business checking', '$84,210.40', '—'] },
      { kind: 'sub', cells: ['1100 · Accounts receivable', '$8,420.00', '—'] },
      { kind: 'sub', cells: ['2000 · Accounts payable', '—', '$4,080.00'] },
      { kind: 'sub', cells: ['2200 · Sales tax payable', '—', '$1,880.00'] },
      { kind: 'sub', cells: ["3000 · Owner's equity", '—', '$66,010.00'] },
      { kind: 'sub', cells: ['4000 · Sales — Apparel', '—', '$42,180.00'] },
      { kind: 'sub', cells: ['5000 · COGS — Apparel', '$8,140.00', '—'] },
      { kind: 'final', label: 'Total', cells: ['$100,770.40', '$114,150.00'] },
    ],
  },
  salestax: {
    id: 'salestax',
    title: 'Sales Tax Liability',
    category: 'tax',
    range: 'November 1 – 30, 2026',
    description: 'Sales tax collected minus paid.',
    icon: 'gavel',
    iconClass: styles.iconWrapGreen,
    rows: [
      { kind: 'section', cells: ['Jurisdiction', 'Collected', 'Paid', 'Owed'] },
      { kind: 'sub', cells: ['Tennessee', '$1,410.00', '$920.00', '$490.00'] },
      { kind: 'sub', cells: ['California', '$840.00', '$0.00', '$840.00'] },
      { kind: 'sub', cells: ['New York', '$550.00', '$0.00', '$550.00'] },
      { kind: 'final', label: 'Total', cells: ['$2,800.00', '$920.00', '$1,880.00'] },
    ],
  },
};

export interface ReportsScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast?: (msg: string) => void;
}

export default function ReportsScreen({ onNavigate, onToast }: ReportsScreenProps) {
  const [activeView, setActiveView] = useState<'library' | 'viewer'>('library');
  const [selectedReportId, setSelectedReportId] = useState<string>('pnl');
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Date range
  const [dateFrom, setDateFrom] = useState('2026-11-01');
  const [dateTo, setDateTo] = useState('2026-11-30');
  const [rangePreset, setRangePreset] = useState('This month');

  // Customize Drawer
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [custTab, setCustTab] = useState<'data' | 'visual' | 'saved'>('data');
  const [negFormat, setNegFormat] = useState<'red' | 'paren' | 'minus'>('red');
  const [savedViewName, setSavedViewName] = useState('');

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (onToast) onToast(msg);
    setToastMsg(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastMsg(null), 2000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const currentReport = REPORTS[selectedReportId] || REPORTS.pnl;

  // Filtered reports in Library
  const filteredReports = useMemo(() => {
    return Object.values(REPORTS).filter((r) => {
      if (activeCategoryTab !== 'all' && r.category !== activeCategoryTab) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
      }
      return true;
    });
  }, [activeCategoryTab, searchQuery]);

  const openReportViewer = (id: string) => {
    setSelectedReportId(id);
    setActiveView('viewer');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePresetChange = (preset: string) => {
    setRangePreset(preset);
    if (preset === 'This month') {
      setDateFrom('2026-11-01');
      setDateTo('2026-11-30');
    } else if (preset === 'Last month') {
      setDateFrom('2026-10-01');
      setDateTo('2026-10-31');
    } else if (preset === 'This quarter') {
      setDateFrom('2026-10-01');
      setDateTo('2026-12-31');
    } else if (preset === 'This year') {
      setDateFrom('2026-01-01');
      setDateTo('2026-12-31');
    } else if (preset === 'Last year') {
      setDateFrom('2025-01-01');
      setDateTo('2025-12-31');
    }
  };

  const formatNegative = (val: string) => {
    if (!val || !val.startsWith('−')) return val;
    if (negFormat === 'red') {
      return <span className={styles.numNeg}>{val}</span>;
    }
    if (negFormat === 'paren') {
      return <span className={styles.numNeg}>({val.slice(1)})</span>;
    }
    return val;
  };

  return (
    <div className={styles.container}>
      {/* ═══════════ CONTEXT HEADER ═══════════ */}
      <div className={styles.contextHeader}>
        <div className={styles.breadcrumbsGroup}>
          <span className={`material-symbols-outlined ${styles.breadcrumbDomainIcon}`}>
            account_balance
          </span>
          <span className={styles.breadcrumbDomain}>Finance</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbSection}>Accounting</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbActive}>
            {activeView === 'viewer' ? currentReport.title : 'Quick view'}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* VIEW 1 — REPORT LIBRARY                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeView === 'library' && (
        <main className={styles.main}>
          <div className={styles.pageHeader}>
            <div>
              <h1 className={styles.pageTitle}>Quick view</h1>
              <p className={styles.pageSubtitle}>
                Report shortcuts — each opens with the customize panel and Save view.
              </p>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.headerBtn}
                onClick={() => showToast('Custom report builder')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  add
                </span>
                Custom report
              </button>
              <button
                type="button"
                className={styles.headerBtn}
                onClick={() => showToast('Saved views panel')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  bookmark
                </span>
                Saved views
              </button>
            </div>
          </div>

          {/* Search */}
          <div className={styles.searchWrap}>
            <span className={`material-symbols-outlined ${styles.searchIcon}`}>
              search
            </span>
            <input
              className={styles.searchInput}
              placeholder="Search reports…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category Tabs */}
          <div className={styles.tabsBar}>
            {[
              { id: 'all', label: 'All' },
              { id: 'financial', label: 'Financial statements' },
              { id: 'sales', label: 'Sales & customers' },
              { id: 'expenses', label: 'Expenses & vendors' },
              { id: 'accounting', label: 'Accounting' },
              { id: 'tax', label: 'Tax' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tabBtn} ${
                  activeCategoryTab === tab.id ? styles.tabBtnActive : ''
                }`}
                onClick={() => setActiveCategoryTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Report Grid */}
          <div className={styles.reportGrid}>
            {filteredReports.map((r) => (
              <div
                key={r.id}
                className={styles.reportCard}
                onClick={() => openReportViewer(r.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className={`${styles.iconWrap} ${r.iconClass}`}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                      {r.icon}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1c1e' }}>
                      {r.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#5a6355' }}>{r.range}</div>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: '#5a6355', margin: 0 }}>{r.description}</p>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* VIEW 2 — REPORT VIEWER                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeView === 'viewer' && (
        <main style={{ paddingBottom: 48 }}>
          {/* Viewer Header */}
          <div className={styles.viewerHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setActiveView('library')}
                title="Back to reports library"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  arrow_back
                </span>
              </button>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{currentReport.title}</div>
                <div style={{ fontSize: 11, color: '#5a6355' }}>
                  {dateFrom} – {dateTo}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div className={styles.dateRangeGroup}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16, color: '#5a6355' }}
                >
                  calendar_today
                </span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
                <span style={{ fontSize: 11, color: '#5a6355' }}>to</span>
                <input
                  type="date"
                  className={styles.dateInput}
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
                <select
                  className={styles.dateInput}
                  value={rangePreset}
                  onChange={(e) => handlePresetChange(e.target.value)}
                >
                  <option value="Custom">Custom</option>
                  <option value="This month">This month</option>
                  <option value="Last month">Last month</option>
                  <option value="This quarter">This quarter</option>
                  <option value="This year">This year</option>
                  <option value="Last year">Last year</option>
                </select>
              </div>

              <button
                type="button"
                className={styles.headerBtn}
                onClick={() => setIsCustomizeOpen(true)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  tune
                </span>
                Customize
              </button>

              <button
                type="button"
                className={styles.headerBtn}
                onClick={() => {
                  const cols = [
                    { key: 'kind', label: 'Row type' },
                    { key: 'line', label: 'Line item' },
                    { key: 'value1', label: 'Value 1' },
                    { key: 'value2', label: 'Value 2' },
                    { key: 'value3', label: 'Value 3' },
                  ];
                  const rows: Record<string, unknown>[] = currentReport.rows.map((r) => ({
                    kind: r.kind,
                    line: r.label ?? r.cells[0] ?? '',
                    value1: r.cells[1] ?? '',
                    value2: r.cells[2] ?? '',
                    value3: r.cells[3] ?? '',
                  }));
                  exportToCsv(rows, cols, `report-${currentReport.id}`);
                  showToast(`Exported ${rows.length} records to CSV`);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  download
                </span>
                Export ▾
              </button>

              <button
                type="button"
                className={`${styles.headerBtn} ${styles.headerBtnPrimary}`}
                onClick={() => {
                  if (typeof window !== 'undefined') window.print();
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  print
                </span>
                Print
              </button>
            </div>
          </div>

          {/* Formal Report Document Paper Card */}
          <div style={{ padding: '0 24px' }}>
            <div className={styles.paperCard}>
              <div className={styles.paperHeader}>
                <div className={styles.paperCompany}>Unsaid</div>
                <div className={styles.paperTitle}>{currentReport.title}</div>
                <div className={styles.paperMeta}>
                  {dateFrom} – {dateTo}
                </div>
                <div style={{ fontSize: 11, color: '#5a6355', marginTop: 2 }}>
                  Accrual basis · USD ($)
                </div>
              </div>

              <table className={styles.rptTable}>
                <tbody>
                  {currentReport.rows.map((row, idx) => {
                    if (row.kind === 'section') {
                      return (
                        <tr key={idx} className={styles.sectionRow}>
                          {row.cells.map((c, i) => (
                            <td key={i} className={i === 0 ? '' : styles.alignRight}>
                              {c}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    if (row.kind === 'sub') {
                      return (
                        <tr key={idx} className={styles.subRow}>
                          {row.cells.map((c, i) => (
                            <td key={i} className={i === 0 ? '' : styles.alignRight}>
                              {formatNegative(c)}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    if (row.kind === 'total') {
                      return (
                        <tr key={idx} className={styles.totalRow}>
                          <td>{row.label}</td>
                          {row.cells.map((c, i) => (
                            <td key={i} className={styles.alignRight}>
                              {formatNegative(c)}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    if (row.kind === 'final') {
                      return (
                        <tr key={idx} className={styles.finalRow}>
                          <td>{row.label}</td>
                          {row.cells.map((c, i) => (
                            <td key={i} className={styles.alignRight}>
                              {formatNegative(c)}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    return null;
                  })}
                </tbody>
              </table>

              <div className={styles.paperFooter}>
                <span>Last updated 2 minutes ago</span>
                <span>Categorized 94% · 6 accounts pending review</span>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ═══════════ CUSTOMIZE DRAWER ═══════════ */}
      <div
        className={`${styles.drawerScrim} ${isCustomizeOpen ? styles.drawerScrimOpen : ''}`}
        onClick={() => setIsCustomizeOpen(false)}
      />
      <aside
        className={`${styles.drawer} ${isCustomizeOpen ? styles.drawerOpen : ''}`}
      >
        <div className={styles.drawerHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: '#0a6400', fontSize: 20 }}>
              tune
            </span>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Customize report</h2>
              <div style={{ fontSize: 11, color: '#5a6355' }}>
                Data · Visual · Save as view
              </div>
            </div>
          </div>
          <button
            type="button"
            className={styles.headerBtn}
            style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }}
            onClick={() => setIsCustomizeOpen(false)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              close
            </span>
          </button>
        </div>

        {/* Customize Tabs */}
        <div className={styles.custTabRow}>
          {(['data', 'visual', 'saved'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.custTabBtn} ${custTab === t ? styles.custTabBtnActive : ''}`}
              onClick={() => setCustTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {custTab === 'data' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Rows
                </label>
                <select className={styles.dateInput} style={{ width: '100%', height: 36 }}>
                  <option>All accounts</option>
                  <option>Income accounts only</option>
                  <option>Expense accounts only</option>
                  <option>Non-zero only</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Columns
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['Account', 'Nov 2026', 'Jan – Nov 2026 (YTD)', '% of income', 'Budget', 'Variance'].map(
                    (col, i) => (
                      <label
                        key={col}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#becab6' }}>
                          drag_indicator
                        </span>
                        <input
                          type="checkbox"
                          defaultChecked={i < 3}
                          style={{ accentColor: '#0077c5' }}
                        />
                        <span>{col}</span>
                      </label>
                    )
                  )}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Filters
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" style={{ accentColor: '#0077c5' }} />
                    Exclude zero rows
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" style={{ accentColor: '#0077c5' }} />
                    Compare to prior period
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" style={{ accentColor: '#0077c5' }} />
                    Show percentages
                  </label>
                </div>
              </div>
            </div>
          )}

          {custTab === 'visual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Negatives representation
                </label>
                <div className={styles.segGroup}>
                  {(['red', 'paren', 'minus'] as const).map((nf) => (
                    <button
                      key={nf}
                      type="button"
                      className={`${styles.segBtn} ${negFormat === nf ? styles.segBtnActive : ''}`}
                      onClick={() => setNegFormat(nf)}
                    >
                      {nf === 'red' ? 'Red' : nf === 'paren' ? '(1,234)' : '−1,234'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Highlighting
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: '#0077c5' }} />
                  Highlight negative values in red
                </label>
              </div>
            </div>
          )}

          {custTab === 'saved' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
                  Save view as
                </label>
                <input
                  className={styles.dateInput}
                  style={{ width: '100%', height: 36, marginBottom: 8 }}
                  placeholder="e.g. Monthly P&L — Executive"
                  value={savedViewName}
                  onChange={(e) => setSavedViewName(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.headerBtnPrimary}
                  style={{ width: '100%', height: 36, borderRadius: 6, cursor: 'pointer' }}
                  onClick={() => {
                    if (!savedViewName.trim()) {
                      showToast('Name is required');
                      return;
                    }
                    showToast(`Saved view "${savedViewName}"`);
                    setSavedViewName('');
                    setIsCustomizeOpen(false);
                  }}
                >
                  Save as view
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            height: 56,
            padding: '0 20px',
            borderTop: '1px solid #dad9dd',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            className={styles.headerBtn}
            onClick={() => setIsCustomizeOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.headerBtn} ${styles.headerBtnPrimary}`}
            onClick={() => {
              setIsCustomizeOpen(false);
              showToast('Customizations applied');
            }}
          >
            Apply
          </button>
        </div>
      </aside>

      {/* Toast */}
      {toastMsg && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check_circle
          </span>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
