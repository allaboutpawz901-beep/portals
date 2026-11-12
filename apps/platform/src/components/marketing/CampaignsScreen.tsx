'use client';
/* CampaignsScreen — 1:1 port of upload/marketing_extracted/Marketing/caimpaigns.html
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
const OBJECTIVES = ['Conversions', 'Traffic', 'Awareness', 'Engagement', 'Lead generation'] as const;

interface Campaign {
  id: string;
  name: string;
  network: string;
  objective: string;
  budget: number;
  budgetType: string;
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  schedule: string;
  start: string | null;
  end: string | null;
  status: string;
  adSets: number;
  creatives: string[];
}

const CAMPAIGNS: Campaign[] = [
  { id: 'CMP-3001', name: 'Fall launch — Prospecting', network: 'Meta', objective: 'Conversions', budget: 250, budgetType: 'Daily', spend: 8620, revenue: 36720, roas: 4.26, ctr: 2.1, schedule: '2026-10-15 → 2026-11-30', start: '2026-10-15T00:00', end: '2026-11-30T23:59', status: 'Active', adSets: 3, creatives: ['CR-001', 'CR-002'] },
  { id: 'CMP-3002', name: 'TikTok creator drop', network: 'TikTok', objective: 'Engagement', budget: 180, budgetType: 'Daily', spend: 4210, revenue: 12890, roas: 3.06, ctr: 3.4, schedule: '2026-10-20 → 2026-11-20', start: '2026-10-20T00:00', end: '2026-11-20T23:59', status: 'Active', adSets: 2, creatives: ['CR-003'] },
  { id: 'CMP-3003', name: 'Brand search — Non-brand', network: 'Google', objective: 'Traffic', budget: 120, budgetType: 'Daily', spend: 2310, revenue: 9280, roas: 4.02, ctr: 5.2, schedule: '2026-10-01 → 2026-12-31', start: '2026-10-01T00:00', end: '2026-12-31T23:59', status: 'Active', adSets: 1, creatives: ['CR-004'] },
  { id: 'CMP-3004', name: 'Holiday capsule lookalike', network: 'Meta', objective: 'Conversions', budget: 300, budgetType: 'Daily', spend: 3280, revenue: 14840, roas: 4.53, ctr: 2.8, schedule: '2026-11-05 → 2026-12-24', start: '2026-11-05T00:00', end: '2026-12-24T23:59', status: 'In review', adSets: 2, creatives: ['CR-005'] },
  { id: 'CMP-3005', name: 'Pinterest — Evergreen inspo', network: 'Pinterest', objective: 'Awareness', budget: 80, budgetType: 'Daily', spend: 0, revenue: 0, roas: 0, ctr: 0, schedule: '—', start: null, end: null, status: 'Draft', adSets: 0, creatives: [] },
  { id: 'CMP-3006', name: 'Summer clearance (ended)', network: 'Meta', objective: 'Conversions', budget: 200, budgetType: 'Daily', spend: 12400, revenue: 38210, roas: 3.08, ctr: 1.9, schedule: '2026-08-01 → 2026-09-15', start: '2026-08-01T00:00', end: '2026-09-15T23:59', status: 'Ended', adSets: 4, creatives: ['CR-006', 'CR-007'] },
];

interface Creative {
  id: string;
  name: string;
  type: string;
  dimensions: string;
}

const CREATIVES: Creative[] = [
  { id: 'CR-001', name: 'Fall hero — 1x1', type: 'Image', dimensions: '1080x1080' },
  { id: 'CR-002', name: 'Fall hero — 4x5', type: 'Image', dimensions: '1080x1350' },
  { id: 'CR-003', name: 'TikTok drop — vertical', type: 'Video', dimensions: '1080x1920 · 15s' },
  { id: 'CR-004', name: 'Search text — brand', type: 'Image', dimensions: '1200x628' },
  { id: 'CR-005', name: 'Holiday capsule teaser', type: 'Video', dimensions: '1080x1080 · 6s' },
  { id: 'CR-006', name: 'Summer CTA', type: 'Image', dimensions: '1080x1080' },
  { id: 'CR-007', name: 'Summer carousel', type: 'Carousel', dimensions: '1080x1080 x3' },
  { id: 'CR-008', name: 'Evergreen tote', type: 'Image', dimensions: '1080x1350' },
];

const AUDIENCES = ['Site visitors 30d', 'Abandoned cart 7d', 'Lookalike — VIPs', 'New customers'];

/* ─── helpers (from HTML <script>) ─── */
function pillFor(status: string) {
  const cls = status === 'Active' ? 'active' : status === 'Paused' ? 'paused' : status === 'In review' ? 'review' : status === 'Draft' ? 'draft' : status === 'Ended' ? 'ended' : 'rejected';
  return <span className={`stat ${cls}`}>{status}</span>;
}
function netChip(n: string) {
  return <span className={`net-chip net-${n}`}>{n}</span>;
}
function fmt(n: number) { return n.toLocaleString(); }

/* ─── ad set draft type ─── */
interface AdSetDraft { name: string; audience: string; placement: string; bid: string; }
const EMPTY_ADSET: AdSetDraft = { name: '', audience: AUDIENCES[0], placement: 'Auto', bid: 'Lowest cost' };

export default function CampaignsScreen({ onToast }: MarketingScreenProps) {
  /* ─── state (mirrors HTML's `filters`, `editing`, `peekId`, etc.) ─── */
  const [items, setItems] = useState<Campaign[]>(CAMPAIGNS);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All');
  const [networks, setNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));
  const [objectives, setObjectives] = useState<Set<string>>(new Set(OBJECTIVES as readonly string[]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [popNetworkOpen, setPopNetworkOpen] = useState(false);
  const [popObjectiveOpen, setPopObjectiveOpen] = useState(false);
  const [draftNetworks, setDraftNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));
  const [draftObjectives, setDraftObjectives] = useState<Set<string>>(new Set(OBJECTIVES as readonly string[]));

  // drawer form state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formNetwork, setFormNetwork] = useState('Meta');
  const [formObjective, setFormObjective] = useState('Conversions');
  const [formBudgetType, setFormBudgetType] = useState('Daily');
  const [formBudget, setFormBudget] = useState(250);
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [draftAdSets, setDraftAdSets] = useState<AdSetDraft[]>([]);
  const [pickedCreatives, setPickedCreatives] = useState<string[]>([]);
  const [adsetModalOpen, setAdsetModalOpen] = useState(false);
  const [editingAdSetIndex, setEditingAdSetIndex] = useState<number | null>(null);
  const [adsetName, setAdsetName] = useState('');
  const [adsetAudience, setAdsetAudience] = useState(AUDIENCES[0]);
  const [adsetPlacement, setAdsetPlacement] = useState('Auto');
  const [adsetBid, setAdsetBid] = useState('Lowest cost');
  const [creativeModalOpen, setCreativeModalOpen] = useState(false);
  const [creativeSearch, setCreativeSearch] = useState('');
  const [creativeDraft, setCreativeDraft] = useState<Set<string>>(new Set());

  /* ─── derived (mirrors renderTable) ─── */
  const rows = useMemo(() => items.filter(c => {
    const ql = q.toLowerCase();
    const qOK = !ql || (c.id + ' ' + c.name + ' ' + c.network + ' ' + c.objective).toLowerCase().includes(ql);
    const tabOK = tab === 'All' || c.status === tab;
    const netOK = networks.has(c.network);
    const objOK = objectives.has(c.objective);
    return qOK && tabOK && netOK && objOK;
  }), [items, q, tab, networks, objectives]);

  const activeCount = items.filter(c => c.status === 'Active').length;
  const totalSpend = items.reduce((s, c) => s + c.spend, 0);
  const totalRevenue = items.reduce((s, c) => s + c.revenue, 0);
  const blendedRoas = totalSpend ? totalRevenue / totalSpend : 0;

  const filtersActive = !!q || tab !== 'All' || networks.size !== NETWORKS.length || objectives.size !== OBJECTIVES.length;
  const allChecked = rows.length > 0 && rows.every(c => selected.has(c.id));
  const someChecked = rows.some(c => selected.has(c.id));

  /* ─── handlers ─── */
  function openPeek(id: string) { setPeekId(id); }
  function closePeek() { setPeekId(null); }

  function openCampDrawer(id: string | null) {
    const editing = id ? items.find(c => c.id === id) : null;
    setEditingId(id);
    setFormName(editing ? editing.name : '');
    setFormNetwork(editing ? editing.network : 'Meta');
    setFormObjective(editing ? editing.objective : 'Conversions');
    setFormBudgetType(editing ? editing.budgetType : 'Daily');
    setFormBudget(editing ? editing.budget : 250);
    setFormStart(editing && editing.start ? editing.start.slice(0, 16) : new Date().toISOString().slice(0, 16));
    setFormEnd(editing && editing.end ? editing.end.slice(0, 16) : '');
    setDraftAdSets(editing ? Array.from({ length: editing.adSets }, (_, i) => ({
      name: 'Ad set ' + (i + 1),
      audience: AUDIENCES[i % AUDIENCES.length],
      placement: 'Auto',
      bid: 'Lowest cost',
    })) : []);
    setPickedCreatives(editing ? [...editing.creatives] : []);
    setDrawerOpen(true);
    setPeekId(null);
    setRowMenuForId(null);
  }
  function closeCampDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
  }

  function openAdSetModal(idx: number | null) {
    const s = idx !== null ? draftAdSets[idx] : { name: 'Ad set ' + (draftAdSets.length + 1), audience: AUDIENCES[0], placement: 'Auto', bid: 'Lowest cost' };
    setEditingAdSetIndex(idx);
    setAdsetName(s.name);
    setAdsetAudience(s.audience);
    setAdsetPlacement(s.placement);
    setAdsetBid(s.bid);
    setAdsetModalOpen(true);
  }
  function confirmAdSet() {
    const newAdSet: AdSetDraft = { name: adsetName || 'Ad set', audience: adsetAudience, placement: adsetPlacement, bid: adsetBid };
    setDraftAdSets(prev => {
      if (editingAdSetIndex !== null) { const n = [...prev]; n[editingAdSetIndex] = newAdSet; return n; }
      return [...prev, newAdSet];
    });
    setAdsetModalOpen(false);
    setEditingAdSetIndex(null);
  }

  function openCreativeModal() {
    setCreativeDraft(new Set(pickedCreatives));
    setCreativeSearch('');
    setCreativeModalOpen(true);
  }
  function confirmCreatives() {
    setPickedCreatives([...creativeDraft]);
    setCreativeModalOpen(false);
  }

  function collectCampaign(): Campaign | null {
    const name = formName.trim();
    if (!name) { onToast('Campaign name is required'); return null; }
    const start = formStart;
    const end = formEnd || null;
    const editing = editingId ? items.find(c => c.id === editingId) : null;
    return {
      id: editing ? editing.id : 'CMP-' + (3000 + items.length + 1),
      name,
      network: formNetwork,
      objective: formObjective,
      budget: formBudget,
      budgetType: formBudgetType,
      spend: editing ? editing.spend : 0,
      revenue: editing ? editing.revenue : 0,
      roas: editing ? editing.roas : 0,
      ctr: editing ? editing.ctr : 0,
      schedule: start ? (end ? `${start.slice(0, 10)} → ${end.slice(0, 10)}` : start.slice(0, 10) + ' → ongoing') : '—',
      start, end,
      status: editing ? editing.status : 'Draft',
      adSets: draftAdSets.length,
      creatives: [...pickedCreatives],
    };
  }
  function save() {
    const c = collectCampaign(); if (!c) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = c; return n; } return prev; }
      return [c, ...prev];
    });
    closeCampDrawer();
    onToast(editingId ? 'Campaign updated' : 'Campaign created');
  }
  function saveAndNew() {
    const c = collectCampaign(); if (!c) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = c; return n; } return prev; }
      return [c, ...prev];
    });
    setEditingId(null);
    setFormName('');
    setDraftAdSets([]);
    setPickedCreatives([]);
    setFormNetwork('Meta');
    onToast('Saved. New campaign form ready.');
  }

  function rowAction(act: string, c: Campaign) {
    setRowMenuForId(null);
    switch (act) {
      case 'edit': openCampDrawer(c.id); break;
      case 'view': openPeek(c.id); break;
      case 'duplicate':
        setItems(prev => [{ ...c, id: 'CMP-' + (3000 + prev.length + 1), name: c.name + ' (copy)', status: 'Draft', spend: 0, revenue: 0, roas: 0, ctr: 0, schedule: '—' }, ...prev]);
        onToast(`Duplicated: ${c.name}`);
        break;
      case 'pause': setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Paused' } : x)); onToast(`Paused: ${c.name}`); break;
      case 'resume': setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Active' } : x)); onToast(`Resumed: ${c.name}`); break;
      case 'archive': setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Ended' } : x)); onToast(`Archived: ${c.name}`); break;
      case 'delete':
        if (confirm(`Delete campaign "${c.name}"?`)) {
          setItems(prev => prev.filter(x => x.id !== c.id));
          onToast(`Deleted: ${c.name}`);
        }
        break;
    }
  }

  function bulkAction(act: string) {
    if (act === 'close') { setSelected(new Set()); return; }
    const sel = [...selected];
    const n = sel.length;
    if (act === 'pause') { setItems(prev => prev.map(c => sel.includes(c.id) ? { ...c, status: 'Paused' } : c)); onToast(`Paused ${n} campaign(s)`); }
    else if (act === 'resume') { setItems(prev => prev.map(c => sel.includes(c.id) ? { ...c, status: 'Active' } : c)); onToast(`Resumed ${n} campaign(s)`); }
    else if (act === 'duplicate') {
      setItems(prev => {
        const copies = sel.map(id => { const c = prev.find(x => x.id === id); return c ? { ...c, id: 'CMP-' + (3000 + prev.length + 1), name: c.name + ' (copy)', status: 'Draft', spend: 0, revenue: 0, roas: 0, ctr: 0, schedule: '—' } : null; }).filter(Boolean) as Campaign[];
        return [...copies, ...prev];
      });
      onToast(`Duplicated ${n} campaign(s)`);
    }
    else if (act === 'archive') { setItems(prev => prev.map(c => sel.includes(c.id) ? { ...c, status: 'Ended' } : c)); onToast(`Archived ${n} campaign(s)`); }
    else if (act === 'delete') {
      if (confirm(`Delete ${n} campaign(s)?`)) {
        setItems(prev => prev.filter(c => !sel.includes(c.id)));
        onToast(`Deleted ${n} campaign(s)`);
      }
    }
    setSelected(new Set());
  }

  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map(c => c.id)));
  }
  function clearAllFilters() {
    setQ(''); setTab('All');
    setNetworks(new Set(NETWORKS as readonly string[]));
    setObjectives(new Set(OBJECTIVES as readonly string[]));
    setDraftNetworks(new Set(NETWORKS as readonly string[]));
    setDraftObjectives(new Set(OBJECTIVES as readonly string[]));
  }

  function handleExport() {
    exportToCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'id', label: 'Campaign ID' }, { key: 'name', label: 'Campaign' }, { key: 'network', label: 'Network' },
      { key: 'objective', label: 'Objective' }, { key: 'budget', label: 'Budget' }, { key: 'budgetType', label: 'Budget type' },
      { key: 'spend', label: 'Spend (30d)' }, { key: 'revenue', label: 'Revenue' }, { key: 'roas', label: 'ROAS' },
      { key: 'ctr', label: 'CTR' }, { key: 'schedule', label: 'Schedule' }, { key: 'status', label: 'Status' },
      { key: 'adSets', label: 'Ad sets' }, { key: 'creatives', label: 'Creatives' },
    ], 'campaigns');
    onToast(`Exported ${rows.length} campaigns`);
  }

  const peek = peekId ? items.find(c => c.id === peekId) : null;

  return (
    <main className="px-6 pb-12">

      {/* ─── BREADCRUMB ─── */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Advertising</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Campaigns</span>
      </div>

      {/* ─── PAGE HEADER ─── */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Campaigns</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Every ad campaign across connected networks — budgets, pacing, performance, and scheduling.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Customize panel — Data / Visual tabs')}>
            <span className="material-symbols-outlined text-[16px]">tune</span>Customize
          </button>
          <div className="flex">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" onClick={() => openCampDrawer(null)}>
              <span className="material-symbols-outlined text-[16px]">add</span>New campaign
            </button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={() => setCreateMenuOpen(v => !v)}>
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Active campaigns</div>
          <div className="text-headline-sm mt-1 tabular-nums text-secondary">{activeCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Currently spending</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total spend (30d)</div>
          <div className="text-headline-sm mt-1 tabular-nums">${fmt(totalSpend)}</div>
          <div className="text-[11px] text-secondary mt-0.5">+14% vs prior period</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Attributed revenue</div>
          <div className="text-headline-sm mt-1 tabular-nums">${fmt(totalRevenue)}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Across all networks</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Blended ROAS</div>
          <div className="text-headline-sm mt-1 tabular-nums">{blendedRoas.toFixed(2)}×</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Target 3.50×</div>
        </div>
      </div>

      {/* ─── LIST CARD ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">

        {/* Status tabs */}
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          {['All', 'Active', 'Paused', 'In review', 'Draft', 'Ended'].map(t => (
            <button key={t} className={`h-full px-3 text-label-md tab-underline ${tab === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => { setTab(t); setSelected(new Set()); }}>{t}</button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter campaigns…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {/* Network popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopNetworkOpen(v => !v); setPopObjectiveOpen(false); }}>
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
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => { setDraftNetworks(new Set(NETWORKS as readonly string[])); }}>Clear</button>
                  <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container" onClick={() => { setNetworks(new Set(draftNetworks)); setPopNetworkOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          {/* Objective popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopObjectiveOpen(v => !v); setPopNetworkOpen(false); }}>
              <span className="material-symbols-outlined text-[14px]">flag</span>Objective
            </button>
            {popObjectiveOpen && (
              <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 220 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Filter by objective</div>
                {OBJECTIVES.map(o => (
                  <label key={o} className="flex items-center gap-2 px-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftObjectives.has(o)} onChange={() => { const next = new Set(draftObjectives); if (next.has(o)) next.delete(o); else next.add(o); setDraftObjectives(next); }} />{o}
                  </label>
                ))}
                <div className="sep"></div>
                <div className="flex justify-end gap-2 px-2 py-1">
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => { setDraftObjectives(new Set(OBJECTIVES as readonly string[])); }}>Clear</button>
                  <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container" onClick={() => { setObjectives(new Set(draftObjectives)); setPopObjectiveOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Saved views — pick or save current filters')}>
            <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views
          </button>
          <button className={`h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 ${filtersActive ? '' : 'hidden-imp'}`} onClick={clearAllFilters}>
            <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>Clear all
          </button>
          <span className="ml-auto text-[11px] text-on-surface-variant">{rows.length} of {items.length}</span>
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="bulk-bar show">
            <span className="text-[12px] font-semibold">{selected.size} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('pause')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">pause_circle</span>Pause</button>
            <button onClick={() => bulkAction('resume')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">play_circle</span>Resume</button>
            <button onClick={() => bulkAction('duplicate')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">content_copy</span>Duplicate</button>
            <button onClick={() => bulkAction('archive')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">archive</span>Archive</button>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('delete')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
            <button className="ml-auto" onClick={() => bulkAction('close')}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>
        )}

        {/* Table */}
        {rows.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px] text-outline">campaign</span>
            </div>
            <h3 className="text-headline-sm mb-1">No campaigns match</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Clear filters or start a new campaign.</p>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={clearAllFilters}>Clear filters</button>
          </div>
        ) : (
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} /></th>
                <th className="px-3 py-2">Campaign</th>
                <th className="px-3 py-2">Network</th>
                <th className="px-3 py-2">Objective</th>
                <th className="px-3 py-2 text-right">Budget (daily)</th>
                <th className="px-3 py-2 text-right">Spend (30d)</th>
                <th className="px-3 py-2 text-right">ROAS</th>
                <th className="px-3 py-2">Schedule</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {rows.map(c => (
                <tr key={c.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openPeek(c.id)}>
                  <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={selected.has(c.id)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(c.id)} /></td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{c.adSets} ad set(s) · {c.creatives.length} creative(s)</div>
                  </td>
                  <td className="px-3 py-2">{netChip(c.network)}</td>
                  <td className="px-3 py-2">{c.objective}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${c.budget}/d</td>
                  <td className="px-3 py-2 text-right tabular-nums">${fmt(c.spend)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.roas ? c.roas.toFixed(2) + '×' : '—'}</td>
                  <td className="px-3 py-2 text-[11px]">{c.schedule}</td>
                  <td className="px-3 py-2">{pillFor(c.status)}</td>
                  <td className="px-2 py-2 text-right relative">
                    <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === c.id ? null : c.id); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button>
                    {rowMenuForId === c.id && (
                      <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                        <div className="menu-header">This campaign</div>
                        <button onClick={() => rowAction('edit', c)}><span className="material-symbols-outlined">edit</span>Edit campaign</button>
                        <button onClick={() => rowAction('view', c)}><span className="material-symbols-outlined">visibility</span>View details</button>
                        <button onClick={() => rowAction('duplicate', c)}><span className="material-symbols-outlined">content_copy</span>Duplicate</button>
                        <div className="sep"></div>
                        <div className="menu-header">Status</div>
                        <button onClick={() => rowAction('pause', c)}><span className="material-symbols-outlined">pause_circle</span>Pause</button>
                        <button onClick={() => rowAction('resume', c)}><span className="material-symbols-outlined">play_circle</span>Resume</button>
                        <button onClick={() => rowAction('archive', c)}><span className="material-symbols-outlined">archive</span>Archive</button>
                        <div className="sep"></div>
                        <button className="danger" onClick={() => rowAction('delete', c)}><span className="material-symbols-outlined">delete</span>Delete</button>
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
          <button onClick={() => { setCreateMenuOpen(false); openCampDrawer(null); }}><span className="material-symbols-outlined">campaign</span>Campaign</button>
          <button onClick={() => { setCreateMenuOpen(false); onToast('Create adset — will route to that dedicated page'); }}><span className="material-symbols-outlined">tune</span>Ad set</button>
          <button onClick={() => { setCreateMenuOpen(false); onToast('Create creative — will route to that dedicated page'); }}><span className="material-symbols-outlined">perm_media</span>Creative</button>
          <button onClick={() => { setCreateMenuOpen(false); onToast('Create audience — will route to that dedicated page'); }}><span className="material-symbols-outlined">groups</span>Audience</button>
        </div>
      )}

      {/* Click-away catcher for row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* Peek drawer */}
      {peek && (
        <>
          <div className="drawer-scrim open" onClick={() => setPeekId(null)} />
          <div className="peek open">
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">campaign</span>
                <span className="text-headline-sm truncate">{peek.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); openCampDrawer(id); }}><span className="material-symbols-outlined text-[14px]">edit</span>Edit</button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setPeekId(null)}><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-body-sm">
              <div className="mb-3 flex items-center gap-2">{pillFor(peek.status)}{netChip(peek.network)}</div>
              <div className="bg-surface-container-low rounded-lg p-3 mb-3 grid grid-cols-3 gap-2 text-center">
                <div><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Spend</div><div className="text-body-md font-semibold tabular-nums">${fmt(peek.spend)}</div></div>
                <div><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Revenue</div><div className="text-body-md font-semibold tabular-nums">${fmt(peek.revenue)}</div></div>
                <div><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">ROAS</div><div className="text-body-md font-semibold tabular-nums">{peek.roas ? peek.roas.toFixed(2) + '×' : '—'}</div></div>
              </div>
              <dl className="text-body-sm">
                <div className="kv"><dt>Campaign ID</dt><dd className="code-mono">{peek.id}</dd></div>
                <div className="kv"><dt>Objective</dt><dd>{peek.objective}</dd></div>
                <div className="kv"><dt>Budget</dt><dd className="tabular-nums">${peek.budget} / {peek.budgetType}</dd></div>
                <div className="kv"><dt>Schedule</dt><dd>{peek.schedule}</dd></div>
                <div className="kv"><dt>Ad sets</dt><dd>{peek.adSets}</dd></div>
                <div className="kv"><dt>Creatives</dt><dd>{peek.creatives.length}</dd></div>
                <div className="kv"><dt>CTR</dt><dd className="tabular-nums">{peek.ctr ? peek.ctr.toFixed(1) + '%' : '—'}</dd></div>
              </dl>
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); openCampDrawer(id); }}><span className="material-symbols-outlined text-[16px]">edit</span>Edit</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('duplicate', peek)}><span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('pause', peek)}><span className="material-symbols-outlined text-[16px]">pause_circle</span>Pause</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('resume', peek)}><span className="material-symbols-outlined text-[16px]">play_circle</span>Resume</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Campaign drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={closeCampDrawer} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">campaign</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">{editingId ? 'Edit campaign' : 'New campaign'}</div>
                  <div className="text-[11px] text-on-surface-variant">{editingId ? (() => { const e = items.find(c => c.id === editingId); return e ? `${e.status} · ${e.id}` : ''; })() : 'Draft · not yet published'}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeCampDrawer}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Basics */}
              <section>
                <div className="section-h">Campaign basics</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Campaign name</label>
                    <input className="field-input" placeholder="e.g. Fall launch — Prospecting" value={formName} onChange={e => setFormName(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Network</label>
                    <div className="grid grid-cols-2 gap-2">
                      {NETWORKS.map(n => (
                        <button key={n} className={`border rounded-lg p-2 text-left hover:border-primary ${formNetwork === n ? 'border-primary bg-surface-container-low' : 'border-surface-dim'}`} onClick={() => setFormNetwork(n)}>
                          <div className="flex items-center gap-2">{netChip(n)}<span className="text-[11px] text-on-surface-variant">{n === 'Meta' ? 'Facebook + Instagram' : n === 'TikTok' ? 'In-feed, Spark' : n === 'Google' ? 'Search, Shopping, PMax' : 'Promoted Pins'}</span></div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Objective</label>
                    <select className="field-input" value={formObjective} onChange={e => setFormObjective(e.target.value)}>
                      <option>Conversions</option><option>Traffic</option><option>Awareness</option><option>Engagement</option><option>Lead generation</option><option>Catalog sales</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Budget & schedule */}
              <section>
                <div className="section-h">Budget &amp; schedule</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Budget type</label>
                    <select className="field-input" value={formBudgetType} onChange={e => setFormBudgetType(e.target.value)}><option>Daily</option><option>Lifetime</option></select>
                  </div>
                  <div>
                    <label className="field-label">Amount</label>
                    <input type="number" className="field-input" value={formBudget} onChange={e => setFormBudget(parseInt(e.target.value || '0', 10))} />
                  </div>
                  <div>
                    <label className="field-label">Start</label>
                    <input type="datetime-local" className="field-input" value={formStart} onChange={e => setFormStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">End (optional)</label>
                    <input type="datetime-local" className="field-input" value={formEnd} onChange={e => setFormEnd(e.target.value)} />
                  </div>
                </div>
              </section>

              {/* Ad sets */}
              <section>
                <div className="section-h flex items-center justify-between">
                  <span>Ad sets</span>
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => openAdSetModal(null)}>
                    <span className="material-symbols-outlined text-[14px]">add</span>Add ad set
                  </button>
                </div>
                <div className="space-y-2">
                  {draftAdSets.length === 0 ? (
                    <div className="text-[11px] text-on-surface-variant">No ad sets yet.</div>
                  ) : draftAdSets.map((s, i) => (
                    <div key={i} className="adset-card">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="text-body-sm font-semibold flex-1">{s.name}</div>
                        <button className="h-6 px-2 border border-surface-dim rounded text-[11px] hover:bg-surface-container-low" onClick={() => openAdSetModal(i)}>Edit</button>
                        <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDraftAdSets(prev => prev.filter((_, j) => j !== i))}><span className="material-symbols-outlined text-[14px] text-error">close</span></button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px] text-on-surface-variant">
                        <div><span className="uppercase font-bold">Audience</span><div className="text-on-surface mt-0.5">{s.audience}</div></div>
                        <div><span className="uppercase font-bold">Placement</span><div className="text-on-surface mt-0.5">{s.placement}</div></div>
                        <div><span className="uppercase font-bold">Bid</span><div className="text-on-surface mt-0.5">{s.bid}</div></div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Creatives */}
              <section>
                <div className="section-h flex items-center justify-between">
                  <span>Creative selection</span>
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={openCreativeModal}>
                    <span className="material-symbols-outlined text-[14px]">perm_media</span>Pick creatives
                  </button>
                </div>
                <div className="space-y-2">
                  {pickedCreatives.length === 0 ? (
                    <div className="text-[11px] text-on-surface-variant">No creatives selected.</div>
                  ) : pickedCreatives.map(id => {
                    const c = CREATIVES.find(x => x.id === id); if (!c) return null;
                    return (
                      <div key={id} className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-outline-variant bg-surface-container-low text-body-sm">
                        <span className="material-symbols-outlined text-[16px] text-primary">{c.type === 'Video' ? 'movie' : c.type === 'Carousel' ? 'view_carousel' : 'image'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{c.name}</div>
                          <div className="text-[11px] text-on-surface-variant">{c.type} · {c.dimensions}</div>
                        </div>
                        <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setPickedCreatives(prev => prev.filter(x => x !== id))}><span className="material-symbols-outlined text-[14px]">close</span></button>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeCampDrawer}>Cancel</button>
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

      {/* Creative picker modal */}
      {creativeModalOpen && (
        <div className="modal-scrim open" onClick={() => setCreativeModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Pick creatives</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Select one or more creatives from the Content Library.</p>
            <input className="field-input mb-2" placeholder="Search creatives…" value={creativeSearch} onChange={e => setCreativeSearch(e.target.value)} />
            <div className="max-h-[300px] overflow-y-auto border border-surface-dim rounded">
              {CREATIVES.filter(c => c.name.toLowerCase().includes(creativeSearch.toLowerCase())).map(c => (
                <label key={c.id} className="flex items-center gap-3 px-3 py-2 border-b border-surface-dim last:border-b-0 cursor-pointer hover:bg-surface-container-low">
                  <input type="checkbox" checked={creativeDraft.has(c.id)} style={{ accentColor: '#0077c5' }} onChange={() => { const next = new Set(creativeDraft); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); setCreativeDraft(next); }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-medium">{c.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{c.type} · {c.dimensions}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setCreativeModalOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={confirmCreatives}>Add to campaign</button>
            </div>
          </div>
        </div>
      )}

      {/* Ad set editor modal */}
      {adsetModalOpen && (
        <div className="modal-scrim open" onClick={() => setAdsetModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Ad set</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Define audience, placement, and bid strategy for this ad set.</p>
            <div className="space-y-3">
              <div>
                <label className="field-label">Name</label>
                <input className="field-input" placeholder="Ad set name" value={adsetName} onChange={e => setAdsetName(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Audience</label>
                <select className="field-input" value={adsetAudience} onChange={e => setAdsetAudience(e.target.value)}>{AUDIENCES.map(a => <option key={a}>{a}</option>)}</select>
              </div>
              <div>
                <label className="field-label">Placement</label>
                <select className="field-input" value={adsetPlacement} onChange={e => setAdsetPlacement(e.target.value)}><option>Auto</option><option>Feed</option><option>Stories / Reels</option><option>Search</option></select>
              </div>
              <div>
                <label className="field-label">Bid strategy</label>
                <select className="field-input" value={adsetBid} onChange={e => setAdsetBid(e.target.value)}><option>Lowest cost</option><option>Cost cap</option><option>ROAS goal</option></select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setAdsetModalOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={confirmAdSet}>{editingAdSetIndex !== null ? 'Save' : 'Add ad set'}</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
