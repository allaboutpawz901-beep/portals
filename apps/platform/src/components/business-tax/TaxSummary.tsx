'use client';
import './business-tax.css';
import { useState, useEffect, useMemo, useRef } from 'react';
import { BusinessTaxScreenProps } from './types';

/* ═══════════════════════════════════════════════════════════════
   Deployed 1:1 from upload/Tax summary.html
   Every row, badge, menu, drawer and handler below is a direct
   port of the original mockup's markup + inline script.
   ═══════════════════════════════════════════════════════════════ */

type RowType = 'section' | 'data' | 'total' | 'final';
type RowCategory = 'income' | 'deductions' | 'assets';
type RowKind = 'mapped' | 'unmapped';
type TabKey = 'all' | 'income' | 'deductions' | 'assets' | 'unmapped';
type MappedFilter = '' | 'mapped' | 'unmapped';

interface TaxRowData {
  id: string;
  type: RowType;
  sectionId?: string;
  name: string;
  formLine?: string;
  amount?: string;
  ytd?: string;
  category?: RowCategory;
  kind?: RowKind;
  mapping?: string;
  excluded?: boolean;
  flagged?: boolean;
}

const TOTAL_ACCOUNTS = 34;

/* Rows in exact DOM order of the original <tbody data-tax-tbody> */
const INITIAL_ROWS: TaxRowData[] = [
  { id: 'sec-income', type: 'section', sectionId: 'sec-income', name: 'Income' },
  { id: 'd-sales-apparel', type: 'data', sectionId: 'sec-income', category: 'income', kind: 'mapped', mapping: 'Gross receipts', name: 'Sales — Apparel', formLine: 'Form 1120, Line 1a · Gross receipts', amount: '$8,420.00', ytd: '$62,180.00' },
  { id: 'd-shipping-income', type: 'data', sectionId: 'sec-income', category: 'income', kind: 'mapped', mapping: 'Gross receipts', name: 'Shipping income', formLine: 'Form 1120, Line 1a · Gross receipts', amount: '$1,204.00', ytd: '$8,204.00' },
  { id: 'd-sales-wall-art', type: 'data', sectionId: 'sec-income', category: 'income', kind: 'mapped', mapping: 'Gross receipts', name: 'Sales — Wall Art', formLine: 'Form 1120, Line 1a · Gross receipts', amount: '$2,110.00', ytd: '$18,940.00' },
  { id: 'd-freight', type: 'data', sectionId: 'sec-income', category: 'income', kind: 'unmapped', name: 'Freight income', formLine: 'Needs tax line mapping', amount: '$—', ytd: '$0.00' },
  { id: 't-income', type: 'total', sectionId: 'sec-income', name: 'Total income', amount: '$11,734.00', ytd: '$89,324.00' },

  { id: 'sec-cogs', type: 'section', sectionId: 'sec-cogs', name: 'Cost of goods sold' },
  { id: 'd-cogs-apparel', type: 'data', sectionId: 'sec-cogs', category: 'deductions', kind: 'mapped', mapping: 'COGS', name: 'COGS — Apparel', formLine: 'Form 1120, Line 2 · Cost of goods sold', amount: '$3,120.00', ytd: '$18,140.00' },
  { id: 'd-cogs-wall-art', type: 'data', sectionId: 'sec-cogs', category: 'deductions', kind: 'mapped', mapping: 'COGS', name: 'COGS — Wall Art', formLine: 'Form 1120, Line 2 · Cost of goods sold', amount: '$870.00', ytd: '$7,240.00' },
  { id: 't-cogs', type: 'total', sectionId: 'sec-cogs', name: 'Total COGS', amount: '$3,990.00', ytd: '$25,380.00' },

  { id: 'sec-operating', type: 'section', sectionId: 'sec-operating', name: 'Operating expenses' },
  { id: 'd-office-supplies', type: 'data', sectionId: 'sec-operating', category: 'deductions', kind: 'mapped', mapping: 'Office', name: 'Office supplies', formLine: 'Form 1120, Line 18 · Office expense', amount: '$142.50', ytd: '$1,418.00' },
  { id: 'd-software', type: 'data', sectionId: 'sec-operating', category: 'deductions', kind: 'mapped', mapping: 'Software', name: 'Software & subscriptions', formLine: 'Form 1120, Line 18 · Office expense', amount: '$59.99', ytd: '$719.88' },
  { id: 'd-shipping-delivery', type: 'data', sectionId: 'sec-operating', category: 'deductions', kind: 'mapped', mapping: 'Shipping', name: 'Shipping & delivery', formLine: 'Form 1120, Line 18 · Office expense', amount: '$84.20', ytd: '$1,410.00' },
  { id: 'd-advertising', type: 'data', sectionId: 'sec-operating', category: 'deductions', kind: 'mapped', mapping: 'Advertising', name: 'Advertising', formLine: 'Form 1120, Line 18 · Advertising', amount: '$1,240.00', ytd: '$9,240.00' },
  { id: 'd-bank-fees', type: 'data', sectionId: 'sec-operating', category: 'deductions', kind: 'mapped', mapping: 'Office', name: 'Bank fees', formLine: 'Form 1120, Line 18 · Office expense', amount: '$12.00', ytd: '$124.00' },
  { id: 'd-marketing', type: 'data', sectionId: 'sec-operating', category: 'deductions', kind: 'unmapped', name: 'Marketing — Contractors', formLine: 'Needs tax line mapping', amount: '$—', ytd: '$0.00' },
  { id: 'd-warehouse', type: 'data', sectionId: 'sec-operating', category: 'deductions', kind: 'unmapped', name: 'Warehouse utilities', formLine: 'Needs tax line mapping', amount: '$—', ytd: '$0.00' },
  { id: 't-operating', type: 'total', sectionId: 'sec-operating', name: 'Total operating expenses', amount: '$1,538.69', ytd: '$12,911.88' },

  { id: 'sec-assets', type: 'section', sectionId: 'sec-assets', name: 'Business assets' },
  { id: 'd-equipment', type: 'data', sectionId: 'sec-assets', category: 'assets', kind: 'mapped', mapping: '§179 asset', name: 'Equipment — Konva workstation', formLine: 'Form 4562 · §179 deduction', amount: '$2,400.00', ytd: '$2,400.00' },
  { id: 'd-vehicle', type: 'data', sectionId: 'sec-assets', category: 'assets', kind: 'mapped', mapping: 'MACRS 5yr', name: 'Vehicle — delivery van', formLine: 'Form 4562 · MACRS 5yr', amount: '$4,800.00', ytd: '$4,800.00' },
  { id: 't-assets', type: 'total', sectionId: 'sec-assets', name: 'Total business assets', amount: '$7,200.00', ytd: '$7,200.00' },

  { id: 'f-final', type: 'final', name: 'Taxable profit (before estimated tax)', amount: '$12,195.31', ytd: '$51,032.12' },
];

export default function TaxSummary({}: BusinessTaxScreenProps) {
  const [rows, setRows] = useState<TaxRowData[]>(INITIAL_ROWS);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [filterText, setFilterText] = useState('');
  const [filterMapped, setFilterMapped] = useState<MappedFilter>('');
  const [year, setYear] = useState('2026');

  /* Menus — position:fixed, anchored exactly like the original math */
  const [exportMenu, setExportMenu] = useState<{ top: number; left: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ top: number; left: number; rowId: string } | null>(null);

  /* Map drawer */
  const [mapOpen, setMapOpen] = useState(false);
  const [mapRowId, setMapRowId] = useState<string | null>(null);
  const [mapLine, setMapLine] = useState('');

  /* Local toast — exact mockup toast (bottom center, 1.8s) */
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = (m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 1800);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /* ── Filtering — port of applyFilters() ─────────────────────── */
  const firstPass = (row: TaxRowData, q: string): boolean => {
    let visible = true;
    const nameText = (row.name + (row.formLine || '')).toLowerCase();
    const trKind = row.type === 'data' ? (row.excluded ? 'excluded' : row.kind!) : '';
    const trCat = row.category || '';
    if (q && !nameText.includes(q)) visible = false;
    if (filterMapped === 'mapped' && trKind !== 'mapped') visible = false;
    if (filterMapped === 'unmapped' && trKind !== 'unmapped') visible = false;
    if (activeTab === 'unmapped' && trKind !== 'unmapped') visible = false;
    if (activeTab === 'income' && trCat !== 'income') visible = false;
    if (activeTab === 'deductions' && trCat !== 'deductions') visible = false;
    if (activeTab === 'assets' && trCat !== 'assets') visible = false;
    return visible;
  };

  const { visibleIds, shown, total } = useMemo(() => {
    const q = (filterText || '').toLowerCase();
    const vis = new Set<string>();
    let shownCount = 0;
    let totalCount = 0;
    /* First pass over every non-section row */
    const first = new Map<string, boolean>();
    rows.forEach(r => {
      if (r.type === 'section') return;
      totalCount++;
      const v = firstPass(r, q);
      first.set(r.id, v);
      if (v) shownCount++;
      if (v) vis.add(r.id);
    });
    /* Sections: hide if empty; totals follow their section's anyVisible */
    rows.forEach(r => {
      if (r.type !== 'section') return;
      const anyVisible = rows.some(
        x => x.type === 'data' && x.sectionId === r.sectionId && first.get(x.id)
      );
      if (anyVisible) vis.add(r.id);
      rows.forEach(x => {
        if (x.type === 'total' && x.sectionId === r.sectionId && anyVisible) vis.add(x.id);
      });
    });
    return { visibleIds: vis, shown: shownCount, total: totalCount };
  }, [rows, filterText, filterMapped, activeTab]);

  /* ── Map drawer — port of openMapDrawer / saveMapping ───────── */
  const mapRow = rows.find(r => r.id === mapRowId) || null;
  const accountType =
    mapRow?.category === 'income' ? 'Income account'
    : mapRow?.category === 'assets' ? 'Asset account'
    : 'Expense account';

  const openMapDrawer = (row: TaxRowData) => {
    setMapRowId(row.id);
    setMapLine('');
    setMapOpen(true);
  };
  const closeMapDrawer = () => {
    setMapOpen(false);
    setMapRowId(null);
  };

  const saveMapping = (andNext: boolean) => {
    if (!mapLine) { toast('Select a tax line'); return; }
    let updated = rows;
    const row = rows.find(r => r.id === mapRowId);
    if (row) {
      updated = rows.map(r =>
        r.id === row.id ? { ...r, kind: 'mapped' as RowKind, mapping: mapLine } : r
      );
      setRows(updated);
      toast(`${row.name} mapped to "${mapLine}"`);
    }
    if (andNext) {
      const next = updated.find(r => r.type === 'data' && r.kind === 'unmapped');
      if (next) { openMapDrawer(next); return; }
    }
    setMapOpen(false);
    setMapRowId(null);
  };

  /* ── Row ⋯ menu — port of the appended data-row-menu handler ── */
  const openRowMenu = (e: React.MouseEvent<HTMLButtonElement>, row: TaxRowData) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const menuHeight = 300;
    const top = r.bottom + 4 + menuHeight > window.innerHeight
      ? Math.max(10, r.top - menuHeight - 4)
      : r.bottom + 4;
    setRowMenu({
      rowId: row.id,
      top,
      left: Math.min(r.right - 240, window.innerWidth - 260),
    });
  };

  const runRowAction = (act: string) => {
    const row = rows.find(r => r.id === rowMenu?.rowId);
    setRowMenu(null);
    if (!row) return;
    switch (act) {
      case 'remap':
        openMapDrawer(row); break;
      case 'view-register':
        toast(`Register → ${row.name}`); break;
      case 'run-report':
        toast(`Run report for ${row.name}`); break;
      case 'view-transactions':
        toast(`Viewing transactions for ${row.name}`); break;
      case 'export-line':
        toast(`Exporting line: ${row.name}`); break;
      case 'flag-review':
        setRows(prev => prev.map(r => (r.id === row.id ? { ...r, flagged: true } : r)));
        toast(`${row.name} flagged for accountant review`); break;
      case 'exclude':
        setRows(prev => prev.map(r => (r.id === row.id ? { ...r, excluded: true } : r)));
        toast(`${row.name} excluded from tax summary`); break;
    }
  };

  /* ── Export menu — port of data-export-split / data-export ──── */
  const openExportMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setExportMenu(prev =>
      prev ? null
      : { top: r.bottom + 4, left: Math.min(r.right - 240, window.innerWidth - 260) }
    );
  };
  const runExport = (fmt: string) => {
    setExportMenu(null);
    toast(`Exporting as ${fmt.toUpperCase()}…`);
  };

  /* ── Global click — port of the document click closer ───────── */
  useEffect(() => {
    if (!exportMenu && !rowMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (exportMenu && !t.closest('#export-menu') && !t.closest('[data-export-split]')) setExportMenu(null);
      if (rowMenu && !t.closest('#row-menu')) setRowMenu(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [exportMenu, rowMenu]);

  /* ── updateMappedCount ──────────────────────────────────────── */
  const unmappedCount = rows.filter(r => r.type === 'data' && r.kind === 'unmapped').length;
  const mappedCount = TOTAL_ACCOUNTS - unmappedCount;

  return (
    <div className="tax-summary-page">
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <span className="text-label-md">Business Tax</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Tax summary</span>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
          <div>
            <h1 className="text-headline-lg">Tax summary</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">Tax year 2026 · Unsaid · Accrual basis</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-label-sm text-on-surface-variant">Tax year</span>
              <select
                className="h-8 px-2 border border-surface-dim rounded text-body-sm bg-white"
                value={year}
                onChange={e => { setYear(e.target.value); toast(`Tax year changed to ${e.target.value}`); }}
              >
                <option>2026</option>
                <option>2025</option>
                <option>2024</option>
              </select>
            </div>
            <div className="flex split-btn">
              <button
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main"
                onClick={() => toast('Tax summary exported as PDF')}
              >
                <span className="material-symbols-outlined text-[16px]">download</span>Export
              </button>
              <button
                data-export-split
                className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"
                onClick={openExportMenu}
              >
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => toast('Sending tax summary to print…')}
            >
              <span className="material-symbols-outlined text-[16px]">print</span>Print
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="kpi-card">
            <div className="kpi-label">Gross income</div>
            <div className="kpi-val">$89,324.00</div>
            <div className="text-[11px] text-on-surface-variant mt-1">36 invoices · accrual</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Deductions</div>
            <div className="kpi-val">$38,291.88</div>
            <div className="text-[11px] text-on-surface-variant mt-1">COGS + operating</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Taxable profit</div>
            <div className="kpi-val text-qb-blue">$51,032.12</div>
            <div className="text-[11px] text-on-surface-variant mt-1">Before estimated tax</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Mapping health</div>
            <div className="kpi-val"><span>{mappedCount}</span> / 34</div>
            {unmappedCount === 0 ? (
              <div className="text-[11px] text-secondary mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">check_circle</span>All accounts mapped
              </div>
            ) : (
              <div className="text-[11px] text-error mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[13px]">warning</span>{unmappedCount} account{unmappedCount !== 1 ? 's' : ''} unmapped
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-3 border-b border-surface-dim overflow-x-auto">
          {([['all', 'All'], ['income', 'Income by category'], ['deductions', 'Deductions'], ['assets', 'Business assets'], ['unmapped', 'Unmapped only']] as [TabKey, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`px-3 py-2 text-label-md tab-underline${activeTab === key ? ' active' : ' text-on-surface-variant'}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input
              className="w-full h-7 pl-7 pr-2 bg-white border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
              placeholder="Filter accounts…"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
            />
          </div>
          <label className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 bg-white">
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">tune</span>
            <span className="text-on-surface-variant">Show:</span>
            <select
              className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none"
              value={filterMapped}
              onChange={e => setFilterMapped(e.target.value as MappedFilter)}
            >
              <option value="">All</option>
              <option value="mapped">Mapped only</option>
              <option value="unmapped">Unmapped only</option>
            </select>
          </label>
          <div className="flex-1"></div>
          <span className="text-[11px] text-on-surface-variant">{shown} of {total}</span>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden max-h-[640px] overflow-y-auto">
          <table className="tax-table">
            <thead>
              <tr>
                <th style={{ width: '36%' }}>Account / Tax line</th>
                <th className="right" style={{ width: '14%' }}>Amount</th>
                <th className="right" style={{ width: '14%' }}>YTD</th>
                <th style={{ width: '22%' }}>Tax mapping</th>
                <th style={{ width: '14%' }}></th>
              </tr>
            </thead>
            <tbody data-tax-tbody>
              {rows.map(row => {
                if (!visibleIds.has(row.id)) return null;

                if (row.type === 'section') {
                  return (
                    <tr className="section" key={row.id} data-section={row.sectionId}>
                      <td colSpan={5}>{row.name}</td>
                    </tr>
                  );
                }

                if (row.type === 'total') {
                  return (
                    <tr className="total" key={row.id}>
                      <td>{row.name}</td>
                      <td className="right">{row.amount}</td>
                      <td className="right">{row.ytd}</td>
                      <td colSpan={2}></td>
                    </tr>
                  );
                }

                if (row.type === 'final') {
                  return (
                    <tr className="final" key={row.id}>
                      <td>{row.name}</td>
                      <td className="right">{row.amount}</td>
                      <td className="right">{row.ytd}</td>
                      <td colSpan={2}></td>
                    </tr>
                  );
                }

                /* Data row */
                const unmapped = row.kind === 'unmapped';
                return (
                  <tr
                    key={row.id}
                    className={`clickable${unmapped ? ' unmapped' : ''}${row.flagged ? ' flagged' : ''}`}
                    data-kind={row.excluded ? 'excluded' : row.kind}
                    data-category={row.category}
                    style={row.excluded ? { opacity: 0.4 } : undefined}
                    onClick={e => {
                      if ((e.target as HTMLElement).closest('button, select, a')) return;
                      openMapDrawer(row);
                    }}
                  >
                    <td>{row.name}<div className="text-[11px] text-on-surface-variant">{row.formLine}</div></td>
                    <td className="right">{row.amount}</td>
                    <td className="right">{row.ytd}</td>
                    <td>
                      <span className={`mapping-badge ${unmapped ? 'unmapped' : 'mapped'}`}>
                        <span className="material-symbols-outlined text-[11px]">{unmapped ? 'error' : 'check_circle'}</span>
                        {unmapped ? 'Unmapped' : row.mapping}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        className="text-[11px] font-semibold text-primary hover:underline"
                        data-remap={row.name}
                        onClick={() => openMapDrawer(row)}
                      >
                        {unmapped ? 'Map now' : 'Remap'}
                      </button>
                      <button
                        className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded hover:bg-surface-container"
                        aria-label="Account actions"
                        onClick={e => openRowMenu(e, row)}
                      >
                        <span className="material-symbols-outlined text-[14px] text-on-surface-variant">more_horiz</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-[11px] text-on-surface-variant">
          <span className="flex items-center gap-1">
            <span className="mapping-badge mapped text-[10px]!">
              <span className="material-symbols-outlined text-[10px]">check_circle</span>Mapped
            </span>
            Account is mapped to a tax line
          </span>
          <span className="flex items-center gap-1">
            <span className="mapping-badge unmapped text-[10px]!">
              <span className="material-symbols-outlined text-[10px]">error</span>Unmapped
            </span>
            Requires mapping before filing
          </span>
        </div>
      </main>

      {/* ═══════════ EXPORT MENU ═══════════ */}
      {exportMenu && (
        <div id="export-menu" className="menu open" style={{ top: exportMenu.top, left: exportMenu.left }}>
          <div className="menu-header">Export as</div>
          <button onClick={() => runExport('pdf')}><span className="material-symbols-outlined">picture_as_pdf</span>PDF</button>
          <button onClick={() => runExport('xlsx')}><span className="material-symbols-outlined">table_chart</span>Excel (XLSX)</button>
          <button onClick={() => runExport('csv')}><span className="material-symbols-outlined">table_view</span>CSV</button>
          <div className="sep"></div>
          <div className="menu-header">Send to accountant</div>
          <button onClick={() => runExport('email')}><span className="material-symbols-outlined">mail</span>Email with PDF</button>
          <button onClick={() => runExport('share')}><span className="material-symbols-outlined">share</span>Share link</button>
        </div>
      )}

      {/* ═══════════ MAPPING DRAWER ═══════════ */}
      <div className={mapOpen ? 'drawer-scrim open' : 'drawer-scrim'} onClick={closeMapDrawer}></div>
      <div className={mapOpen ? 'drawer open' : 'drawer'}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">tune</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate">Map tax line</div>
              <div className="text-[11px] text-on-surface-variant">Tax line mapping</div>
            </div>
          </div>
          <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeMapDrawer}>
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="bg-surface-container-low rounded-lg p-3">
            <div className="text-[10px] text-on-surface-variant uppercase font-bold">Account</div>
            <div className="text-headline-sm mt-1">{mapRow ? mapRow.name : '—'}</div>
            <div className="text-[11px] text-on-surface-variant mt-1">{mapRow ? accountType : '—'}</div>
          </div>

          <div>
            <label className="field-label">Form 1120 tax line</label>
            <select className="field-input" value={mapLine} onChange={e => setMapLine(e.target.value)}>
              <option value="">— Select tax line —</option>
              <optgroup label="Income">
                <option>Gross receipts</option>
                <option>Returns and allowances</option>
                <option>Other income</option>
              </optgroup>
              <optgroup label="Deductions">
                <option>Cost of goods sold</option>
                <option>Compensation of officers</option>
                <option>Contract labor</option>
                <option>Advertising</option>
                <option>Office expense</option>
                <option>Utilities</option>
                <option>Rent or lease</option>
                <option>Shipping &amp; delivery</option>
                <option>Software</option>
                <option>Other deductions</option>
              </optgroup>
              <optgroup label="Assets">
                <option>§179 asset</option>
                <option>MACRS 5yr</option>
                <option>MACRS 7yr</option>
                <option>Bonus depreciation</option>
              </optgroup>
            </select>
          </div>

          <div>
            <label className="field-label">Detail notes (optional)</label>
            <textarea
              className="field-input"
              style={{ height: 64, padding: '8px 10px', fontFamily: 'inherit' }}
              placeholder="e.g. reconciled against Q3 contractor invoices"
            ></textarea>
          </div>

          <div>
            <label className="field-label">Apply to similar accounts</label>
            <div className="flex flex-col gap-2 mt-1">
              <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" /> All accounts with same suffix pattern</label>
              <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" /> All Contractor expense accounts</label>
            </div>
          </div>

          <div className="bg-qb-blue/5 border border-qb-blue/30 rounded-lg p-3 text-[11px] text-qb-blue flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] mt-0.5">info</span>
            <div>Mapping is reversible. Unmapped accounts are excluded from tax estimates and flagged on filing.</div>
          </div>
        </div>

        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeMapDrawer}>Cancel</button>
          <div className="flex items-center gap-2">
            <div className="flex split-btn">
              <button className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main" onClick={() => saveMapping(true)}>Save and next</button>
              <button className="h-8 px-1.5 bg-white border border-surface-dim hover:bg-surface-container-low split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <div className="flex split-btn">
              <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main" onClick={() => saveMapping(false)}>Save mapping</button>
              <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ ROW ⋯ MENU ═══════════ */}
      {rowMenu && (
        <div id="row-menu" className="menu open" style={{ top: rowMenu.top, left: rowMenu.left }}>
          <div className="menu-header">This account</div>
          <button onClick={() => runRowAction('remap')}><span className="material-symbols-outlined">tune</span>Remap tax line</button>
          <button onClick={() => runRowAction('view-register')}><span className="material-symbols-outlined">receipt_long</span>View register</button>
          <button onClick={() => runRowAction('run-report')}><span className="material-symbols-outlined">assessment</span>Run report for account</button>
          <div className="sep"></div>
          <div className="menu-header">Drill down</div>
          <button onClick={() => runRowAction('view-transactions')}><span className="material-symbols-outlined">list</span>View transactions</button>
          <button onClick={() => runRowAction('export-line')}><span className="material-symbols-outlined">download</span>Export this line</button>
          <div className="sep"></div>
          <div className="menu-header">Flags</div>
          <button onClick={() => runRowAction('flag-review')}><span className="material-symbols-outlined">flag</span>Flag for accountant review</button>
          <button className="danger" onClick={() => runRowAction('exclude')}><span className="material-symbols-outlined">block</span>Exclude from tax summary</button>
        </div>
      )}

      <div className={toastMsg ? 'toast show' : 'toast'}>{toastMsg}</div>
    </div>
  );
}
