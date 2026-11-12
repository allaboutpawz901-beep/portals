'use client';
/* AudiencesScreen — 1:1 port of upload/marketing_extracted/Marketing/audience.html
   The HTML's <style> block lives in src/app/marketing.css (global classes).
   The HTML's <body> is ported to JSX below; class names are identical.
   The HTML's <script> is ported to React state + handlers below. */
import { useMemo, useState } from 'react';
import { exportToCsv } from '@/lib/csvExport';

interface MarketingScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

/* ─── data (verbatim from HTML <script>) ─── */
const NETWORKS = ['Meta', 'TikTok', 'Google', 'Pinterest'] as const;
const KINDS = ['Custom', 'Retargeting', 'Lookalike'] as const;
const RULE_FIELDS = ['Visited page', 'Added to cart', 'Purchased', 'Order total', 'Days since last order', 'Country', 'Email exists', 'Phone exists', 'Consent (marketing)'] as const;
const RULE_OPS = ['equals', 'does not equal', 'contains', 'is greater than', 'is less than', 'is at least', 'is at most', 'is one of'] as const;

const SOURCES = ['CRM', 'Meta Pixel', 'TikTok Pixel', 'Shopify + Meta', 'VIP segment', 'Customer list (CSV)'] as const;
const STATUSES = ['Draft', 'Building', 'Ready', 'Expired'] as const;
const SEED_OPTIONS = ['VIP customers', 'Site visitors 30d', 'Abandoned cart 7d'] as const;
const COUNTRIES = ['United States', 'Canada', 'United Kingdom'] as const;

interface Rule {
  field: string;
  op: string;
  value: string;
}

interface Audience {
  id: string;
  name: string;
  kind: string;
  source: string;
  networks: string[];
  size: number;
  usedIn: number;
  lastSync: string | null;
  status: string;
  rules: Rule[];
  seed: string;
  country: string;
  similarity: string;
}

const AUDIENCES: Audience[] = [
  { id: 'AU-8001', name: 'Site visitors 30d', kind: 'Retargeting', source: 'Meta Pixel', networks: ['Meta'], size: 12400, usedIn: 2, lastSync: '2026-11-02T08:10', status: 'Ready',
    rules: [{ field: 'Visited page', op: 'is one of', value: '/product/*, /collections/*' }, { field: 'Days since last order', op: 'is at most', value: '30' }],
    seed: '—', country: '—', similarity: '—' },
  { id: 'AU-8002', name: 'Abandoned cart 7d', kind: 'Retargeting', source: 'Shopify + Meta', networks: ['Meta', 'TikTok'], size: 2100, usedIn: 1, lastSync: '2026-11-02T07:42', status: 'Ready',
    rules: [{ field: 'Added to cart', op: 'equals', value: 'true' }, { field: 'Purchased', op: 'equals', value: 'false' }, { field: 'Days since last order', op: 'is at most', value: '7' }],
    seed: '—', country: '—', similarity: '—' },
  { id: 'AU-8003', name: 'Lookalike — VIPs', kind: 'Lookalike', source: 'VIP segment', networks: ['Meta'], size: 1800000, usedIn: 1, lastSync: '2026-10-28T15:30', status: 'Ready',
    rules: [],
    seed: 'VIP customers', country: 'United States', similarity: '2%' },
  { id: 'AU-8004', name: 'TikTok engagement 90d', kind: 'Retargeting', source: 'TikTok Pixel', networks: ['TikTok'], size: 42000, usedIn: 1, lastSync: '2026-10-30T18:22', status: 'Ready',
    rules: [{ field: 'Visited page', op: 'contains', value: '/tiktok' }, { field: 'Days since last order', op: 'is at most', value: '90' }],
    seed: '—', country: '—', similarity: '—' },
  { id: 'AU-8005', name: 'New customers', kind: 'Custom', source: 'CRM', networks: ['Google', 'Meta'], size: 312, usedIn: 0, lastSync: '2026-10-15T09:00', status: 'Draft',
    rules: [{ field: 'Email exists', op: 'equals', value: 'true' }, { field: 'Days since last order', op: 'is at most', value: '0' }],
    seed: '—', country: '—', similarity: '—' },
  { id: 'AU-8006', name: 'High-value purchasers', kind: 'Custom', source: 'Customer list (CSV)', networks: ['Meta', 'Google'], size: 842, usedIn: 0, lastSync: '2026-11-01T12:00', status: 'Building',
    rules: [{ field: 'Order total', op: 'is greater than', value: '$500' }],
    seed: '—', country: '—', similarity: '—' },
  { id: 'AU-8007', name: 'Holiday lookalike', kind: 'Lookalike', source: 'VIP segment', networks: ['Meta'], size: 2400000, usedIn: 0, lastSync: '2026-10-05T10:00', status: 'Expired',
    rules: [],
    seed: 'VIP customers', country: 'United States', similarity: '1%' },
];

/* ─── helpers (from HTML <script>) ─── */
function pillFor(status: string) {
  const cls = status === 'Ready' ? 'ready' : status === 'Building' ? 'building' : status === 'Draft' ? 'draft' : 'expired';
  return <span className={`stat ${cls}`}>{status}</span>;
}
function iconFor(kind: string) { return kind === 'Retargeting' ? 'history' : kind === 'Lookalike' ? 'share' : 'groups'; }
function classFor(kind: string) { return kind === 'Retargeting' ? 'retarget' : kind === 'Lookalike' ? 'lookalike' : 'custom'; }
function fmtDate(iso: string | null): string {
  if (!iso || iso === '—') return '—';
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}

const AUDIENCE_COLUMNS = [
  { key: 'id', label: 'Audience ID' }, { key: 'name', label: 'Audience' }, { key: 'kind', label: 'Kind' },
  { key: 'source', label: 'Source' }, { key: 'networks', label: 'Networks' }, { key: 'size', label: 'Size' },
  { key: 'usedIn', label: 'Used in' }, { key: 'lastSync', label: 'Last sync' }, { key: 'status', label: 'Status' },
];

export default function AudiencesScreen({ onToast }: MarketingScreenProps) {
  /* ─── state (mirrors HTML's `filters`, `editing`, `peekId`, etc.) ─── */
  const [items, setItems] = useState<Audience[]>(AUDIENCES);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All');
  const [kinds, setKinds] = useState<Set<string>>(new Set(KINDS as readonly string[]));
  const [networks, setNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [popKindOpen, setPopKindOpen] = useState(false);
  const [popNetworkOpen, setPopNetworkOpen] = useState(false);
  const [draftKinds, setDraftKinds] = useState<Set<string>>(new Set(KINDS as readonly string[]));
  const [draftNetworks, setDraftNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));

  // drawer form state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formKind, setFormKind] = useState('Custom');
  const [formStatus, setFormStatus] = useState('Draft');
  const [formSource, setFormSource] = useState('CRM');
  const [formNetworks, setFormNetworks] = useState<Set<string>>(new Set(['Meta', 'TikTok']));
  const [formSeed, setFormSeed] = useState('VIP customers');
  const [formCountry, setFormCountry] = useState('United States');
  const [formSimilarity, setFormSimilarity] = useState('2');
  const [formSizeEstimate, setFormSizeEstimate] = useState('1.8M');
  const [draftRules, setDraftRules] = useState<Rule[]>([]);

  /* ─── derived (mirrors filteredAudiences + renderTable + syncCounts) ─── */
  const rows = useMemo(() => items.filter(a => {
    const ql = q.toLowerCase();
    const qOK = !ql || (a.id + ' ' + a.name + ' ' + a.kind + ' ' + a.source + ' ' + a.networks.join(' ')).toLowerCase().includes(ql);
    const tabOK = tab === 'All' || a.status === tab;
    const kindOK = kinds.has(a.kind);
    const netOK = a.networks.some(n => networks.has(n));
    return qOK && tabOK && kindOK && netOK;
  }), [items, q, tab, kinds, networks]);

  const readyCount = items.filter(a => a.status === 'Ready').length;
  const totalReach = items.reduce((s, a) => s + a.size, 0);
  const usedInTotal = items.reduce((s, a) => s + a.usedIn, 0);

  const filtersActive = !!q || tab !== 'All' || kinds.size !== KINDS.length || networks.size !== NETWORKS.length;
  const allChecked = rows.length > 0 && rows.every(a => selected.has(a.id));
  const someChecked = rows.some(a => selected.has(a.id));

  /* ─── handlers ─── */
  function openPeek(id: string) { setPeekId(id); setRowMenuForId(null); }
  function closePeek() { setPeekId(null); }

  function openAudDrawer(id: string | null) {
    const editing = id ? items.find(a => a.id === id) : null;
    setEditingId(id);
    setFormName(editing ? editing.name : '');
    setFormKind(editing ? editing.kind : 'Custom');
    setFormStatus(editing ? editing.status : 'Draft');
    setFormSource(editing ? editing.source : 'CRM');
    setFormNetworks(editing ? new Set(editing.networks) : new Set(['Meta', 'TikTok']));
    setFormSeed(editing && editing.seed !== '—' ? editing.seed : 'VIP customers');
    setFormCountry(editing && editing.country !== '—' ? editing.country : 'United States');
    setFormSimilarity(editing && editing.similarity !== '—' ? editing.similarity.replace('%', '') : '2');
    setFormSizeEstimate('1.8M');
    setDraftRules(editing ? editing.rules.map(r => ({ ...r })) : []);
    setDrawerOpen(true);
    setPeekId(null);
    setRowMenuForId(null);
  }
  function closeAudDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
  }

  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map(a => a.id)));
  }
  function clearAllFilters() {
    setQ(''); setTab('All');
    setKinds(new Set(KINDS as readonly string[]));
    setNetworks(new Set(NETWORKS as readonly string[]));
    setDraftKinds(new Set(KINDS as readonly string[]));
    setDraftNetworks(new Set(NETWORKS as readonly string[]));
  }

  function rowAction(act: string, a: Audience) {
    setRowMenuForId(null);
    switch (act) {
      case 'edit': openAudDrawer(a.id); break;
      case 'view': openPeek(a.id); break;
      case 'duplicate':
        setItems(prev => [{ ...a, id: 'AU-' + (8000 + prev.length + 1), name: a.name + ' (copy)', status: 'Draft', usedIn: 0, lastSync: null }, ...prev]);
        onToast(`Duplicated: ${a.name}`);
        break;
      case 'sync':
        setItems(prev => prev.map(x => x.id === a.id ? { ...x, lastSync: new Date().toISOString(), status: 'Ready' } : x));
        onToast(`Synced: ${a.name}`);
        break;
      case 'export':
        exportToCsv([a as unknown as Record<string, unknown>], AUDIENCE_COLUMNS, `audience-${a.id}`);
        onToast(`Exported members of ${a.name}`);
        break;
      case 'archive':
        setItems(prev => prev.map(x => x.id === a.id ? { ...x, status: 'Expired' } : x));
        onToast(`Archived: ${a.name}`);
        break;
      case 'delete':
        if (confirm(`Delete audience "${a.name}"?`)) {
          setItems(prev => prev.filter(x => x.id !== a.id));
          onToast(`Deleted: ${a.name}`);
        }
        break;
    }
  }

  function bulkAction(act: string) {
    if (act === 'close') { setSelected(new Set()); return; }
    const sel = [...selected];
    const n = sel.length;
    const targets = items.filter(a => sel.includes(a.id));
    if (act === 'sync') {
      const now = new Date().toISOString();
      setItems(prev => prev.map(a => sel.includes(a.id) ? { ...a, lastSync: now, status: 'Ready' } : a));
      onToast(`Synced ${n} audience(s)`);
    } else if (act === 'export') {
      exportToCsv(targets as unknown as Record<string, unknown>[], AUDIENCE_COLUMNS, 'audiences');
      onToast(`Exported ${n} audience(s)`);
    } else if (act === 'archive') {
      setItems(prev => prev.map(a => sel.includes(a.id) ? { ...a, status: 'Expired' } : a));
      onToast(`Archived ${n} audience(s)`);
    } else if (act === 'delete') {
      if (confirm(`Delete ${n} audience(s)?`)) {
        setItems(prev => prev.filter(a => !sel.includes(a.id)));
        onToast(`Deleted ${n} audience(s)`);
      }
    }
    setSelected(new Set());
  }

  function handleExport() {
    exportToCsv(rows as unknown as Record<string, unknown>[], AUDIENCE_COLUMNS, 'audiences');
    onToast(`Exported ${rows.length} audiences`);
  }

  /* rules */
  function addRule() {
    setDraftRules(prev => [...prev, { field: 'Visited page', op: 'contains', value: '/product' }]);
  }
  function updateRule(i: number, key: keyof Rule, value: string) {
    setDraftRules(prev => prev.map((r, j) => j === i ? { ...r, [key]: value } : r));
  }
  function removeRule(i: number) {
    setDraftRules(prev => prev.filter((_, j) => j !== i));
  }

  /* live preview */
  const previewName = formName || 'Untitled audience';
  const previewNets = [...formNetworks];
  const previewRuleCount = draftRules.length;
  const previewEstSize = formKind === 'Lookalike'
    ? (formSizeEstimate || '1.8M')
    : Math.max(50, Math.round(10000 * Math.pow(0.55, previewRuleCount))).toLocaleString();

  function collectAudience(): Audience | null {
    const name = formName.trim();
    if (!name) { onToast('Audience name is required'); return null; }
    const lookalike = formKind === 'Lookalike';
    const editing = editingId ? items.find(a => a.id === editingId) : null;
    return {
      id: editing ? editing.id : 'AU-' + (8000 + items.length + 1),
      name,
      kind: formKind,
      source: formSource,
      networks: [...formNetworks],
      size: editing ? editing.size : (lookalike ? 1800000 : Math.max(50, Math.round(10000 * Math.pow(0.55, draftRules.length)))),
      usedIn: editing ? editing.usedIn : 0,
      lastSync: new Date().toISOString(),
      status: formStatus,
      rules: draftRules.map(r => ({ ...r })),
      seed: lookalike ? formSeed : '—',
      country: lookalike ? formCountry : '—',
      similarity: lookalike ? formSimilarity + '%' : '—',
    };
  }
  function save() {
    const a = collectAudience(); if (!a) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = a; return n; } return prev; }
      return [a, ...prev];
    });
    closeAudDrawer();
    onToast(editingId ? 'Audience updated' : 'Audience created');
  }
  function saveAndNew() {
    const a = collectAudience(); if (!a) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = a; return n; } return prev; }
      return [a, ...prev];
    });
    setEditingId(null);
    setFormName('');
    setFormKind('Custom');
    setFormStatus('Draft');
    setFormSource('CRM');
    setFormNetworks(new Set(['Meta', 'TikTok']));
    setDraftRules([]);
    onToast('Saved. New audience form ready.');
  }

  const peek = peekId ? items.find(a => a.id === peekId) : null;

  return (
    <main className="px-6 pb-12">

      {/* ─── BREADCRUMB ─── */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Advertising</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Audiences</span>
      </div>

      {/* ─── PAGE HEADER ─── */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Audiences</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Custom, retargeting, and lookalike audiences — reusable across campaigns and networks.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Customize panel — Data / Visual tabs')}>
            <span className="material-symbols-outlined text-[16px]">tune</span>Customize
          </button>
          <div className="flex">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" onClick={() => openAudDrawer(null)}>
              <span className="material-symbols-outlined text-[16px]">add</span>New audience
            </button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={e => { e.stopPropagation(); setCreateMenuOpen(v => !v); }} id="createArrow">
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total audiences</div>
          <div className="text-headline-sm mt-1 tabular-nums">{items.length}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Across all networks</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Ready to use</div>
          <div className="text-headline-sm mt-1 tabular-nums text-secondary">{readyCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Synced and deliverable</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total reach</div>
          <div className="text-headline-sm mt-1 tabular-nums">{totalReach.toLocaleString()}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Sum of unique sizes</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Used in campaigns</div>
          <div className="text-headline-sm mt-1 tabular-nums">{usedInTotal}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Across all ad sets</div>
        </div>
      </div>

      {/* ─── LIST CARD ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">

        {/* Status tabs */}
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          {['All', 'Ready', 'Building', 'Draft', 'Expired'].map(t => (
            <button key={t} className={`h-full px-3 text-label-md tab-underline ${tab === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => { setTab(t); setSelected(new Set()); }}>{t}</button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter audiences…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {/* Kind popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopKindOpen(v => !v); setPopNetworkOpen(false); }} id="btnKind">
              <span className="material-symbols-outlined text-[14px]">category</span>Kind
            </button>
            {popKindOpen && (
              <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Filter by kind</div>
                {KINDS.map(k => (
                  <label key={k} className="flex items-center gap-2 px-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftKinds.has(k)} onChange={() => { const next = new Set(draftKinds); if (next.has(k)) next.delete(k); else next.add(k); setDraftKinds(next); }} />{k}
                  </label>
                ))}
                <div className="sep"></div>
                <div className="flex justify-end gap-2 px-2 py-1">
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => setDraftKinds(new Set(KINDS as readonly string[]))}>Clear</button>
                  <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container" onClick={() => { setKinds(new Set(draftKinds)); setPopKindOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          {/* Network popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopNetworkOpen(v => !v); setPopKindOpen(false); }} id="btnNetwork">
              <span className="material-symbols-outlined text-[14px]">hub</span>Network
            </button>
            {popNetworkOpen && (
              <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 220 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Filter by network</div>
                {NETWORKS.map(n => (
                  <label key={n} className="flex items-center gap-2 px-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftNetworks.has(n)} onChange={() => { const next = new Set(draftNetworks); if (next.has(n)) next.delete(n); else next.add(n); setDraftNetworks(next); }} />{n} Ads
                  </label>
                ))}
                <div className="sep"></div>
                <div className="flex justify-end gap-2 px-2 py-1">
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => setDraftNetworks(new Set(NETWORKS as readonly string[]))}>Clear</button>
                  <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container" onClick={() => { setNetworks(new Set(draftNetworks)); setPopNetworkOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Saved views — pick or save current filters')} id="btnSaved">
            <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views
          </button>
          <button className={`h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 ${filtersActive ? '' : 'hidden-imp'}`} onClick={clearAllFilters} id="btnClearAll">
            <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>Clear all
          </button>
          <span className="ml-auto text-[11px] text-on-surface-variant">{rows.length} of {items.length}</span>
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="bulk-bar show">
            <span className="text-[12px] font-semibold">{selected.size} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('sync')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">sync</span>Sync</button>
            <button onClick={() => bulkAction('export')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">download</span>Export</button>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('archive')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">archive</span>Archive</button>
            <button onClick={() => bulkAction('delete')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
            <button className="ml-auto" onClick={() => bulkAction('close')}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>
        )}

        {/* Table */}
        {rows.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px] text-outline">groups</span>
            </div>
            <h3 className="text-headline-sm mb-1">No audiences match</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Clear filters or create a new audience.</p>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={clearAllFilters}>Clear filters</button>
          </div>
        ) : (
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} /></th>
                <th className="px-3 py-2">Audience</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Networks</th>
                <th className="px-3 py-2 text-right">Size</th>
                <th className="px-3 py-2">Used in</th>
                <th className="px-3 py-2">Last sync</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {rows.map(a => (
                <tr key={a.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openPeek(a.id)}>
                  <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={selected.has(a.id)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(a.id)} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`aud-icon ${classFor(a.kind)}`}><span className="material-symbols-outlined text-[16px]">{iconFor(a.kind)}</span></div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.name}</div>
                        <div className="text-[11px] text-on-surface-variant">{a.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">{a.kind}</td>
                  <td className="px-3 py-2 text-[12px]">{a.source}</td>
                  <td className="px-3 py-2"><div className="flex items-center gap-1 flex-wrap">{a.networks.map(n => <span key={n} className={`net-chip net-${n}`}>{n}</span>)}</div></td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.size.toLocaleString()}</td>
                  <td className="px-3 py-2 tabular-nums">{a.usedIn} campaign{a.usedIn === 1 ? '' : 's'}</td>
                  <td className="px-3 py-2 text-[11px]">{fmtDate(a.lastSync)}</td>
                  <td className="px-3 py-2">{pillFor(a.status)}</td>
                  <td className="px-2 py-2 text-right relative">
                    <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === a.id ? null : a.id); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button>
                    {rowMenuForId === a.id && (
                      <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                        <div className="menu-header">This audience</div>
                        <button onClick={() => rowAction('edit', a)}><span className="material-symbols-outlined">edit</span>Edit audience</button>
                        <button onClick={() => rowAction('view', a)}><span className="material-symbols-outlined">visibility</span>View details</button>
                        <button onClick={() => rowAction('duplicate', a)}><span className="material-symbols-outlined">content_copy</span>Duplicate</button>
                        <div className="sep"></div>
                        <div className="menu-header">Operations</div>
                        <button onClick={() => rowAction('sync', a)}><span className="material-symbols-outlined">sync</span>Sync now</button>
                        <button onClick={() => rowAction('export', a)}><span className="material-symbols-outlined">download</span>Export members</button>
                        <button onClick={() => rowAction('archive', a)}><span className="material-symbols-outlined">archive</span>Archive</button>
                        <div className="sep"></div>
                        <button className="danger" onClick={() => rowAction('delete', a)}><span className="material-symbols-outlined">delete</span>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        <div className="px-4 py-2 flex items-center justify-between border-t border-surface-dim text-[11px] text-on-surface-variant">
          <span>Rows per page:
            <select className="border border-surface-dim rounded px-1 py-0.5 bg-white" onChange={() => onToast('Rows per page updated')}><option>25</option><option>50</option><option>75</option><option>100</option></select>
          </span>
          <div className="flex items-center gap-2">
            <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => onToast('Previous page')}><span className="material-symbols-outlined text-[16px]">chevron_left</span></button>
            <span>Page 1 of 1</span>
            <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => onToast('Next page')}><span className="material-symbols-outlined text-[16px]">chevron_right</span></button>
          </div>
        </div>
      </div>

      {/* Create split menu */}
      {createMenuOpen && (
        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={() => setCreateMenuOpen(false)}>
          <div className="menu-header">New</div>
          <button onClick={() => { setCreateMenuOpen(false); openAudDrawer(null); }}><span className="material-symbols-outlined">groups</span>Audience</button>
          <button onClick={() => { setCreateMenuOpen(false); openAudDrawer(null); setFormKind('Lookalike'); }}><span className="material-symbols-outlined">share</span>Lookalike</button>
          <button onClick={() => { setCreateMenuOpen(false); onToast('Create campaign — will route to that dedicated page'); }}><span className="material-symbols-outlined">campaign</span>Campaign</button>
          <button onClick={() => { setCreateMenuOpen(false); onToast('Create creative — will route to that dedicated page'); }}><span className="material-symbols-outlined">perm_media</span>Creative</button>
        </div>
      )}

      {/* Click-away catcher for row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* Peek drawer */}
      {peek && (
        <>
          <div className="drawer-scrim open" onClick={() => { if (!drawerOpen) setPeekId(null); }} />
          <div className="peek open">
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">groups</span>
                <span className="text-headline-sm truncate">{peek.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); openAudDrawer(id); }}><span className="material-symbols-outlined text-[14px]">edit</span>Edit</button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setPeekId(null)}><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-body-sm">
              <div className="mb-3 flex items-center gap-2">{pillFor(peek.status)}<span className="text-[11px] text-on-surface-variant">{peek.kind}</span></div>
              <div className="mb-3 flex items-center gap-1 flex-wrap">{peek.networks.map(n => <span key={n} className={`net-chip net-${n}`}>{n}</span>)}</div>
              <div className="bg-surface-container-low rounded-lg p-3 mb-3 text-center">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold mb-1">Audience size</div>
                <div className="text-headline-md tabular-nums">{peek.size.toLocaleString()}</div>
              </div>
              <dl className="text-body-sm">
                <div className="kv"><dt>Audience ID</dt><dd className="code-mono">{peek.id}</dd></div>
                <div className="kv"><dt>Kind</dt><dd>{peek.kind}</dd></div>
                <div className="kv"><dt>Source</dt><dd>{peek.source}</dd></div>
                <div className="kv"><dt>Used in</dt><dd>{peek.usedIn} campaign(s)</dd></div>
                <div className="kv"><dt>Last sync</dt><dd>{fmtDate(peek.lastSync)}</dd></div>
                {peek.kind === 'Lookalike' && (
                  <>
                    <div className="kv"><dt>Seed</dt><dd>{peek.seed}</dd></div>
                    <div className="kv"><dt>Country</dt><dd>{peek.country}</dd></div>
                    <div className="kv"><dt>Similarity</dt><dd>{peek.similarity}</dd></div>
                  </>
                )}
              </dl>
              {peek.rules.length > 0 && (
                <div className="mt-4 pt-3 border-t border-surface-dim">
                  <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-2">Rules</div>
                  <div className="space-y-1">
                    {peek.rules.map((r, i) => (
                      <div key={i} className="text-body-sm"><span className="font-medium">{r.field}</span> <span className="text-on-surface-variant">{r.op}</span> <span className="font-medium">{r.value}</span></div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); openAudDrawer(id); }}><span className="material-symbols-outlined text-[16px]">edit</span>Edit</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('sync', peek)}><span className="material-symbols-outlined text-[16px]">sync</span>Sync</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('duplicate', peek)}><span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('archive', peek)}><span className="material-symbols-outlined text-[16px]">archive</span>Archive</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Audience drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={closeAudDrawer} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">groups</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">{editingId ? 'Edit audience' : 'New audience'}</div>
                  <div className="text-[11px] text-on-surface-variant">{editingId ? (() => { const e = items.find(a => a.id === editingId); return e ? `${e.status} · ${e.id}` : ''; })() : 'Draft · not yet built'}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeAudDrawer}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Basics */}
              <section>
                <div className="section-h">Audience basics</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Audience name</label>
                    <input className="field-input" placeholder="e.g. Site visitors 30d" value={formName} onChange={e => setFormName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Kind</label>
                      <select className="field-input" value={formKind} onChange={e => setFormKind(e.target.value)}>
                        {KINDS.map(k => <option key={k}>{k}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Status</label>
                      <select className="field-input" value={formStatus} onChange={e => setFormStatus(e.target.value)}>
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Source</label>
                    <select className="field-input" value={formSource} onChange={e => setFormSource(e.target.value)}>
                      {SOURCES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Rules */}
              <section>
                <div className="section-h flex items-center justify-between">
                  <span>Rules</span>
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={addRule}>
                    <span className="material-symbols-outlined text-[14px]">add</span>Add rule
                  </button>
                </div>
                <div className="space-y-2">
                  {draftRules.length === 0 ? (
                    <div className="text-[11px] text-on-surface-variant">No rules yet. Add one to define the audience.</div>
                  ) : draftRules.map((r, i) => (
                    <div key={i} className="rule-row">
                      <select className="flex-1" value={r.field} onChange={e => updateRule(i, 'field', e.target.value)}>
                        {RULE_FIELDS.map(f => <option key={f}>{f}</option>)}
                      </select>
                      <select className="flex-1" value={r.op} onChange={e => updateRule(i, 'op', e.target.value)}>
                        {RULE_OPS.map(o => <option key={o}>{o}</option>)}
                      </select>
                      <input className="flex-1" value={r.value} onChange={e => updateRule(i, 'value', e.target.value)} />
                      <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => removeRule(i)}><span className="material-symbols-outlined text-[14px] text-error">close</span></button>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-2">Rules combine with AND. Members who match every rule enter the audience.</div>
              </section>

              {/* Lookalike config */}
              {formKind === 'Lookalike' && (
                <section>
                  <div className="section-h">Lookalike config</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Seed audience</label>
                      <select className="field-input" value={formSeed} onChange={e => setFormSeed(e.target.value)}>
                        {SEED_OPTIONS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Country</label>
                      <select className="field-input" value={formCountry} onChange={e => setFormCountry(e.target.value)}>
                        {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Similarity (%)</label>
                      <input type="number" className="field-input" value={formSimilarity} onChange={e => setFormSimilarity(e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Size estimate</label>
                      <input className="field-input" value={formSizeEstimate} onChange={e => setFormSizeEstimate(e.target.value)} readOnly />
                    </div>
                  </div>
                </section>
              )}

              {/* Networks */}
              <section>
                <div className="section-h">Target networks</div>
                <div className="grid grid-cols-2 gap-2">
                  {NETWORKS.map(n => (
                    <label key={n} className="flex items-center justify-between p-2 rounded border border-surface-dim">
                      <span className="text-body-sm">{n} Ads</span>
                      <input type="checkbox" className="row-check" checked={formNetworks.has(n)} onChange={() => { const next = new Set(formNetworks); if (next.has(n)) next.delete(n); else next.add(n); setFormNetworks(next); }} />
                    </label>
                  ))}
                </div>
              </section>

              {/* Live preview */}
              <section>
                <div className="section-h">Live preview</div>
                <div className="aud-preview">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`aud-icon ${classFor(formKind)}`}><span className="material-symbols-outlined text-[16px]">{iconFor(formKind)}</span></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-body-sm font-semibold truncate">{previewName}</div>
                      <div className="text-[11px] text-on-surface-variant">{formKind} · {previewNets.length ? previewNets.join(', ') : 'no networks'}</div>
                    </div>
                  </div>
                  <div className="text-[11px] text-on-surface-variant mb-1">Estimated size</div>
                  <div className="text-body-md font-semibold tabular-nums mb-2">{previewEstSize}</div>
                  <div className="bar"><span style={{ width: `${Math.min(100, previewRuleCount * 22 + 20)}%` }} /></div>
                  <div className="text-[10px] text-on-surface-variant mt-2">{previewRuleCount} rule(s) · {formKind === 'Lookalike' ? 'seed: ' + formSeed : 'matching members'}</div>
                </div>
              </section>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeAudDrawer}>Cancel</button>
              <div className="flex items-center gap-2">
                <div className="flex">
                  <button className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main" onClick={saveAndNew}>Save and new</button>
                  <button className="h-8 px-1.5 bg-white border border-surface-dim hover:bg-surface-container-low split-btn-arrow"><span className="material-symbols-outlined text-[16px]">expand_more</span></button>
                </div>
                <div className="flex">
                  <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main" onClick={save}>Save and close</button>
                  <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"><span className="material-symbols-outlined text-[16px]">expand_more</span></button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </main>
  );
}
