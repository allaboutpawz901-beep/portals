'use client';
/* TableShell.tsx — §2.2 + §5 of platform-component-behavior.md:
   "TableShell: ViewDef, query state → onRowOpen, onSelectionChange, onSort, onFilter"
   "The same TableShell renders Invoices, POs, Orders, Tickets by swapping
   the config. Row click, right-click, bulk bar, sorts, saved views and pills
   come with it."

   §1.5 Table standard:
   Anatomy: [select] [primary identifier] [party pill] [status pill] … [amount] [date] [⋯ row actions]
   Toolbar: Search · Filters · Date range · Columns · Import · Export · primary Create button
   Tabs-as-filters with counts. Default sort. Sortable columns. Bulk bar. Totals footer.
   Row click opens drawer for records, page for documents. Right-click = ⋯ menu. */

import { useState, useMemo, useEffect, useRef } from 'react';

/* ─── ViewDef — the config that drives every list (§5 Example) ─── */

export interface ColumnDef {
  id: string;
  label: string;
  kind: 'text' | 'money' | 'date' | 'status' | 'party' | 'pill' | 'count';
  sortable: boolean;
  defaultVisible: boolean;
  align?: 'left' | 'right';
  width?: string;
  /** For kind=party: which field on the row holds the party name */
  partyField?: string;
}

export interface StatusTabDef {
  id: string;
  label: string;
  filter: { status: string };
}

export interface FilterDef {
  id: string;
  label: string;
  kind: 'party' | 'date_range' | 'tag' | 'select';
  options?: string[];
}

export interface BulkActionDef {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
}

export interface ViewDef {
  id: string;
  entity: string;
  title: string;
  subtitle?: string;
  columns: ColumnDef[];
  defaultSort: string;
  statusTabs: StatusTabDef[];
  filters: FilterDef[];
  /** 'drawer' for records, 'document.page' for documents (§1.5) */
  rowClick: 'drawer' | 'document.page' | 'none';
  bulkActions: BulkActionDef[];
  supportsImport: boolean;
  supportsExport: boolean;
  totalsFooter: string[];
  /** KPI tiles computed from the rows */
  kpis?: { label: string; compute: (rows: Record<string, unknown>[]) => number | string; tone?: 'default' | 'error' | 'success' }[];
}

/* ─── Props ─── */

interface TableShellProps {
  view: ViewDef;
  /** The rows to render (already loaded from the store/API) */
  rows: Record<string, unknown>[];
  /** Get a cell's display value: (row, column) → string */
  getCell: (row: Record<string, unknown>, col: ColumnDef) => string;
  /** Get a cell's status class for kind=status: (row, col) → 'paid'|'overdue'|... */
  getStatusClass?: (row: Record<string, unknown>, col: ColumnDef) => string;
  onRowOpen: (row: Record<string, unknown>) => void;
  onCreate: () => void;
  onBulkAction: (actionId: string, selectedIds: string[]) => void;
  onExport: (rows: Record<string, unknown>[]) => void;
  onToast: (msg: string) => void;
  /** Row ⋯ menu items per row */
  getRowActions?: (row: Record<string, unknown>) => { id: string; label: string; icon?: string; danger?: boolean; sepBefore?: boolean; header?: string }[];
  onRowAction?: (actionId: string, row: Record<string, unknown>) => void;
  /** Row unique id field */
  rowIdField?: string;
}

export default function TableShell({
  view, rows, getCell, getStatusClass, onRowOpen, onCreate, onBulkAction, onExport, onToast,
  getRowActions, onRowAction, rowIdField = 'id',
}: TableShellProps) {
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colPickerOpen) return;
    const h = (e: MouseEvent) => { if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node)) setColPickerOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [colPickerOpen]);

  /* Filter by tab + search */
  const filtered = useMemo(() => {
    let list = rows;
    if (tab !== 'all') {
      const tabDef = view.statusTabs.find(t => t.id === tab);
      if (tabDef) list = list.filter(r => String(r.status || '').toLowerCase().replace(/\s/g, '_') === tabDef.filter.status);
    }
    if (q) list = list.filter(r => Object.values(r).some(v => String(v || '').toLowerCase().includes(q.toLowerCase())));
    return list;
  }, [rows, tab, q, view.statusTabs]);

  /* Sort (§3.1: click header cycles asc → desc → default) */
  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const col = view.columns.find(c => c.id === sortCol);
    if (!col) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = getCell(a, col), bv = getCell(b, col);
      if (col.kind === 'money') return (parseFloat(av.replace(/[$,]/g, '')) || 0) * dir - (parseFloat(bv.replace(/[$,]/g, '')) || 0) * dir;
      return av.localeCompare(bv) * dir;
    });
  }, [filtered, sortCol, sortDir, view.columns, getCell]);

  const visibleCols = view.columns.filter(c => c.defaultVisible && !hiddenCols.has(c.id));
  const allChecked = sorted.length > 0 && sorted.every(r => selected.has(String(r[rowIdField])));
  const someChecked = sorted.some(r => selected.has(String(r[rowIdField])));

  function cycleSort(colId: string) {
    if (sortCol !== colId) { setSortCol(colId); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortCol(null); setSortDir('asc'); } // third click = unsort (§3.1)
  }

  function toggleRow(id: string) { setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleAll() { if (allChecked) setSelected(new Set()); else setSelected(new Set(sorted.map(r => String(r[rowIdField])))); }

  /* Tab counts (§1.5: status tabs with counts) */
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rows.length };
    view.statusTabs.forEach(t => {
      counts[t.id] = rows.filter(r => String(r.status || '').toLowerCase().replace(/\s/g, '_') === t.filter.status).length;
    });
    return counts;
  }, [rows, view.statusTabs]);

  return (
    <main className="px-6 pb-12">
      {/* Breadcrumb placeholder — module sets it */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">{view.title}</h1>
          {view.subtitle && <p className="text-body-sm text-on-surface-variant mt-0.5">{view.subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {view.supportsExport && (
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => { onExport(sorted); onToast(`Exported ${sorted.length} rows`); }}>
              <span className="material-symbols-outlined text-[16px]">download</span>Export
            </button>
          )}
          {/* Column picker (§1.5: per-user, saved per view) */}
          <div className="relative" ref={colPickerRef}>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => setColPickerOpen(v => !v)}>
              <span className="material-symbols-outlined text-[16px]">view_column</span>Columns
            </button>
            {colPickerOpen && (
              <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 220 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Visible columns</div>
                {view.columns.filter(c => c.defaultVisible).map(c => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer">
                    <input type="checkbox" checked={!hiddenCols.has(c.id)} onChange={() => {
                      setHiddenCols(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; });
                    }} />{c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          {view.supportsImport && (
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Import — file picker')}>
              <span className="material-symbols-outlined text-[16px]">upload</span>Import
            </button>
          )}
          <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={onCreate}>
            <span className="material-symbols-outlined text-[16px]">add</span>New
          </button>
        </div>
      </div>

      {/* KPI strip */}
      {view.kpis && view.kpis.length > 0 && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          {view.kpis.map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-surface-dim p-3 cursor-pointer hover:border-primary" onClick={() => onToast(`Drilling to ${k.label}…`)}>
              <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">{k.label}</div>
              <div className={`text-headline-sm mt-1 tabular-nums ${k.tone === 'error' ? 'text-error' : k.tone === 'success' ? 'text-secondary' : ''}`}>{k.compute(rows)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table card */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
        {/* Status tabs (§1.5) */}
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          <button className={`h-full px-3 text-label-md tab-underline ${tab === 'all' ? 'active' : 'text-on-surface-variant'}`} onClick={() => { setTab('all'); setSelected(new Set()); }}>
            All <span className="tabCount">{tabCounts.all}</span>
          </button>
          {view.statusTabs.map(t => (
            <button key={t.id} className={`h-full px-3 text-label-md tab-underline ${tab === t.id ? 'active' : 'text-on-surface-variant'}`} onClick={() => { setTab(t.id); setSelected(new Set()); }}>
              {t.label} <span className="tabCount">{tabCounts[t.id]}</span>
            </button>
          ))}
        </div>

        {/* Toolbar (§1.5: Search · Filters · Date range) */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {view.filters.map(f => (
            <button key={f.id} className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast(`${f.label} filter`)}>
              <span className="material-symbols-outlined text-[14px]">filter_list</span>{f.label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-on-surface-variant">{sorted.length} of {rows.length}</span>
        </div>

        {/* Bulk bar (§1.5: appears on select) */}
        {selected.size > 0 && (
          <div className="bulk-bar show">
            <span className="text-[12px] font-semibold">{selected.size} selected</span>
            <span className="w-px h-4 bg-white/30" />
            {view.bulkActions.map(a => (
              <button key={a.id} onClick={() => onBulkAction(a.id, [...selected])}>
                {a.icon && <span className="material-symbols-outlined text-[14px] align-middle mr-1">{a.icon}</span>}{a.label}
              </button>
            ))}
            <button className="ml-auto" onClick={() => setSelected(new Set())}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>
        )}

        {/* Table */}
        {sorted.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3"><span className="material-symbols-outlined text-[28px] text-outline">search_off</span></div>
            <h3 className="text-headline-sm mb-1">No {view.title.toLowerCase()} match</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Adjust filters or create a new record.</p>
            <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 mx-auto" onClick={onCreate}><span className="material-symbols-outlined text-[16px]">add</span>New</button>
          </div>
        ) : (
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} /></th>
                {visibleCols.map(col => (
                  <th key={col.id} className={`px-3 py-2 ${col.align === 'right' ? 'text-right' : ''} ${col.sortable ? 'cursor-pointer select-none hover:text-on-surface' : ''}`} style={col.width ? { width: col.width } : undefined} onClick={col.sortable ? () => cycleSort(col.id) : undefined}>
                    {col.label}
                    {col.sortable && sortCol === col.id && <span className="material-symbols-outlined text-[12px] align-middle ml-0.5">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}
                  </th>
                ))}
                <th className="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {sorted.map(row => {
                const rowId = String(row[rowIdField]);
                const actions = getRowActions ? getRowActions(row) : [];
                return (
                  <tr key={rowId} className="hover:bg-surface-container-low cursor-pointer" onClick={() => onRowOpen(row)} onContextMenu={e => { e.preventDefault(); setRowMenuId(rowMenuId === rowId ? null : rowId); }}>
                    <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={selected.has(rowId)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(rowId)} /></td>
                    {visibleCols.map(col => (
                      <td key={col.id} className={`px-3 py-2 ${col.align === 'right' ? 'text-right tabular-nums' : ''}`}>
                        {col.kind === 'status' ? (
                          <span className={`st ${getStatusClass ? getStatusClass(row, col) : 'sent'}`}>{getCell(row, col)}</span>
                        ) : col.kind === 'party' ? (
                          <span className="pill role customer">{getCell(row, col)}</span>
                        ) : getCell(row, col)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right relative">
                      {actions.length > 0 && (
                        <>
                          <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setRowMenuId(rowMenuId === rowId ? null : rowId); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button>
                          {rowMenuId === rowId && (
                            <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                              {actions.map((a, i) => (
                                <div key={i}>
                                  {a.header && <div className="menu-header">{a.header}</div>}
                                  {a.sepBefore && <div className="sep" />}
                                  <button className={a.danger ? 'danger' : ''} onClick={() => { setRowMenuId(null); onRowAction?.(a.id, row); }}>
                                    {a.icon && <span className="material-symbols-outlined">{a.icon}</span>}{a.label}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Totals footer (§1.5: sum of visible amounts) */}
        {view.totalsFooter.length > 0 && sorted.length > 0 && (
          <div className="px-4 py-2 flex justify-end gap-8 border-t border-surface-dim text-[12px] text-on-surface-variant">
            {view.totalsFooter.map(tf => {
              if (tf.startsWith('sum:')) {
                const field = tf.slice(4);
                const sum = sorted.reduce((s, r) => s + (parseFloat(String(r[field] || '0')) || 0), 0);
                return <span key={tf}>Total: <strong className="text-on-surface tabular-nums">${sum.toFixed(2)}</strong></span>;
              }
              return null;
            })}
          </div>
        )}
      </div>

      {/* Click-away for row menu (§3.1: click outside closes) */}
      {rowMenuId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuId(null)} />}
    </main>
  );
}
