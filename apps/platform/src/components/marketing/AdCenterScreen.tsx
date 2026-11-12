'use client';
/* AdCenterScreen — 1:1 port of upload/marketing_extracted/Marketing/adcenter.html
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

interface AdCampaign {
  id: string;
  name: string;
  network: string;
  objective: string;
  budget: number;
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

const AD_CAMPAIGNS: AdCampaign[] = [
  { id: 'ac1', name: 'Fall launch — Prospecting', network: 'Meta', objective: 'Conversions', budget: 250, spend: 8620, revenue: 36720, roas: 4.26, ctr: 2.1, schedule: '2026-10-15 → 2026-11-30', start: '2026-10-15T00:00', end: '2026-11-30T23:59', status: 'Active', adSets: 3, creatives: ['cr-001', 'cr-002'] },
  { id: 'ac2', name: 'TikTok creator drop', network: 'TikTok', objective: 'Engagement', budget: 180, spend: 4210, revenue: 12890, roas: 3.06, ctr: 3.4, schedule: '2026-10-20 → 2026-11-20', start: '2026-10-20T00:00', end: '2026-11-20T23:59', status: 'Active', adSets: 2, creatives: ['cr-003'] },
  { id: 'ac3', name: 'Brand search — Non-brand', network: 'Google', objective: 'Traffic', budget: 120, spend: 2310, revenue: 9280, roas: 4.02, ctr: 5.2, schedule: '2026-10-01 → 2026-12-31', start: '2026-10-01T00:00', end: '2026-12-31T23:59', status: 'Active', adSets: 1, creatives: ['cr-004'] },
  { id: 'ac4', name: 'Holiday capsule lookalike', network: 'Meta', objective: 'Conversions', budget: 300, spend: 3280, revenue: 14840, roas: 4.53, ctr: 2.8, schedule: '2026-11-05 → 2026-12-24', start: '2026-11-05T00:00', end: '2026-12-24T23:59', status: 'In review', adSets: 2, creatives: ['cr-005'] },
  { id: 'ac5', name: 'Pinterest — Evergreen inspo', network: 'Pinterest', objective: 'Awareness', budget: 80, spend: 0, revenue: 0, roas: 0, ctr: 0, schedule: '—', start: null, end: null, status: 'Draft', adSets: 0, creatives: [] },
  { id: 'ac6', name: 'Summer clearance (ended)', network: 'Meta', objective: 'Conversions', budget: 200, spend: 12400, revenue: 38210, roas: 3.08, ctr: 1.9, schedule: '2026-08-01 → 2026-09-15', start: '2026-08-01T00:00', end: '2026-09-15T23:59', status: 'Ended', adSets: 4, creatives: ['cr-006', 'cr-007'] },
];

interface Creative {
  id: string;
  name: string;
  type: string;
  dimensions: string;
  usedIn: number;
}

const CREATIVES: Creative[] = [
  { id: 'cr-001', name: 'Fall hero — 1x1', type: 'Image', dimensions: '1080x1080', usedIn: 1 },
  { id: 'cr-002', name: 'Fall hero — 4x5', type: 'Image', dimensions: '1080x1350', usedIn: 1 },
  { id: 'cr-003', name: 'TikTok drop — vertical', type: 'Video', dimensions: '1080x1920 · 15s', usedIn: 1 },
  { id: 'cr-004', name: 'Search text — brand', type: 'Image', dimensions: '1200x628', usedIn: 1 },
  { id: 'cr-005', name: 'Holiday capsule teaser', type: 'Video', dimensions: '1080x1080 · 6s', usedIn: 0 },
  { id: 'cr-006', name: 'Summer CTA', type: 'Image', dimensions: '1080x1080', usedIn: 1 },
  { id: 'cr-007', name: 'Summer carousel', type: 'Carousel', dimensions: '1080x1080 x3', usedIn: 1 },
  { id: 'cr-008', name: 'Evergreen tote', type: 'Image', dimensions: '1080x1350', usedIn: 0 },
];

interface Audience {
  id: string;
  name: string;
  type: string;
  source: string;
  size: string;
  usedIn: number;
  updated: string;
}

const AUDIENCES: Audience[] = [
  { id: 'au1', name: 'Site visitors 30d', type: 'Retargeting', source: 'Meta Pixel', size: '~ 12.4K', usedIn: 2, updated: '2026-11-01' },
  { id: 'au2', name: 'Abandoned cart 7d', type: 'Retargeting', source: 'Shopify + Meta', size: '~ 2.1K', usedIn: 1, updated: '2026-11-02' },
  { id: 'au3', name: 'Lookalike — VIPs', type: 'Lookalike 2%', source: 'VIP segment', size: '~ 1.8M', usedIn: 1, updated: '2026-10-28' },
  { id: 'au4', name: 'TikTok engagement 90d', type: 'Retargeting', source: 'TikTok Pixel', size: '~ 42K', usedIn: 1, updated: '2026-10-30' },
  { id: 'au5', name: 'New customers', type: 'Custom', source: 'CRM', size: '~ 312', usedIn: 0, updated: '2026-10-15' },
];

const AUDIENCE_NAMES = AUDIENCES.map(a => a.name);

/* ─── helpers (from HTML <script>) ─── */
function statusPillIcon(s: string) {
  return s === 'Active' ? 'play_arrow' : s === 'Paused' ? 'pause' : s === 'Draft' ? 'edit' : s === 'Ended' ? 'flag' : s === 'In review' ? 'schedule' : 'warning';
}
function statusPillClass(s: string) {
  return s === 'Active' ? 'status-active' : s === 'Paused' ? 'status-paused' : s === 'Draft' ? 'status-draft' : s === 'Ended' ? 'status-ended' : s === 'In review' ? 'status-review' : 'status-rejected';
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`status-pill ${statusPillClass(status)}`}>
      <span className="material-symbols-outlined text-[12px]">{statusPillIcon(status)}</span>
      {status}
    </span>
  );
}

function NetworkLogo({ net }: { net: string }) {
  const k = net === 'Meta' ? 'meta' : net === 'TikTok' ? 'tiktok' : net === 'Google' ? 'google' : 'pin';
  const l = net === 'Meta' ? 'M' : net === 'TikTok' ? 'T' : net === 'Google' ? 'G' : 'P';
  return <div className={`provider-logo ${k}`}>{l}</div>;
}

function fmt(n: number) { return n.toLocaleString(); }

function creativeIcon(t: string) { return t === 'Video' ? 'movie' : t === 'Carousel' ? 'view_carousel' : 'image'; }

/* ─── ad set draft ─── */
interface AdSetDraft { name: string; audience: string; placement: string; bid: string; }
const makeEmptyAdSet = (i: number): AdSetDraft => ({ name: 'Ad set ' + (i + 1), audience: AUDIENCE_NAMES[0], placement: 'Auto', bid: 'Lowest cost' });

type View = 'overview' | 'campaigns' | 'creatives' | 'audiences';

export default function AdCenterScreen({ onToast }: MarketingScreenProps) {
  /* ─── state ─── */
  const [items, setItems] = useState<AdCampaign[]>(AD_CAMPAIGNS);

  // top-level view toggle
  const [view, setView] = useState<View>('overview');
  const [range, setRange] = useState('30');

  // campaigns filters
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All');
  const [networks, setNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // popovers
  const [popNetworkOpen, setPopNetworkOpen] = useState(false);
  const [draftNetworks, setDraftNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));

  // peek + row menu
  const [peekId, setPeekId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [newAdMenuOpen, setNewAdMenuOpen] = useState(false);

  // campaign drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formNetwork, setFormNetwork] = useState<string | null>(null);
  const [formObjective, setFormObjective] = useState('Conversions');
  const [formBudgetType, setFormBudgetType] = useState('Daily');
  const [formBudget, setFormBudget] = useState(250);
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [draftAdSets, setDraftAdSets] = useState<AdSetDraft[]>([]);
  const [pickedCreatives, setPickedCreatives] = useState<string[]>([]);

  // ad-set editor modal
  const [adsetModalOpen, setAdsetModalOpen] = useState(false);
  const [editingAdSetIndex, setEditingAdSetIndex] = useState<number | null>(null);
  const [adsetName, setAdsetName] = useState('');
  const [adsetAudience, setAdsetAudience] = useState(AUDIENCE_NAMES[0]);
  const [adsetPlacement, setAdsetPlacement] = useState('Auto');
  const [adsetBid, setAdsetBid] = useState('Lowest cost');

  // creative picker modal
  const [creativeModalOpen, setCreativeModalOpen] = useState(false);
  const [creativePickerSearch, setCreativePickerSearch] = useState('');
  const [creativeDraft, setCreativeDraft] = useState<Set<string>>(new Set());

  // creatives view (panel)
  const [creativeSearch, setCreativeSearch] = useState('');
  const [creativeTypeFilter, setCreativeTypeFilter] = useState('All types');

  // other modals
  const [pixelsOpen, setPixelsOpen] = useState(false);
  const [otherCreateOpen, setOtherCreateOpen] = useState(false);
  const [otherCreateTarget, setOtherCreateTarget] = useState('');

  /* ─── derived ─── */
  const rows = useMemo(() => items.filter(c => {
    const ql = q.toLowerCase();
    const qOK = !ql || (c.name + ' ' + c.network + ' ' + c.objective).toLowerCase().includes(ql);
    const tabOK = tab === 'All' || c.status === tab;
    const netOK = networks.has(c.network);
    const dateOK = (!dateFrom || (c.start && c.start >= dateFrom)) && (!dateTo || (c.end && c.end.slice(0, 10) <= dateTo));
    return qOK && tabOK && netOK && dateOK;
  }), [items, q, tab, networks, dateFrom, dateTo]);

  const activeCount = items.filter(c => c.status === 'Active').length;
  const pausedCount = items.filter(c => c.status === 'Paused').length;
  const reviewCount = items.filter(c => c.status === 'In review').length;
  const draftCount = items.filter(c => c.status === 'Draft').length;
  const totalSpend = items.reduce((s, c) => s + c.spend, 0);
  const totalRevenue = items.reduce((s, c) => s + c.revenue, 0);
  const blendedRoas = totalSpend ? totalRevenue / totalSpend : 0;

  // overview derived
  const networkBars = useMemo(() => NETWORKS.map(n => {
    const spend = items.filter(c => c.network === n).reduce((s, c) => s + c.spend, 0);
    return { name: n, spend };
  }), [items]);
  const maxNetworkSpend = Math.max(1, ...networkBars.map(n => n.spend));
  const topAds = useMemo(() => items.filter(c => c.spend > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5), [items]);

  const filteredCreatives = useMemo(() => CREATIVES.filter(c => {
    const qOK = !creativeSearch || c.name.toLowerCase().includes(creativeSearch.toLowerCase());
    const tOK = creativeTypeFilter === 'All types' || c.type === creativeTypeFilter;
    return qOK && tOK;
  }), [creativeSearch, creativeTypeFilter]);

  const filtersActive = !!q || tab !== 'All' || networks.size !== NETWORKS.length || !!dateFrom || !!dateTo;
  const allChecked = rows.length > 0 && rows.every(c => selected.has(c.id));
  const someChecked = rows.some(c => selected.has(c.id));

  const peek = peekId ? items.find(c => c.id === peekId) : null;

  /* ─── handlers ─── */
  function openPeek(id: string) { setPeekId(id); setRowMenuForId(null); }
  function closePeek() { setPeekId(null); }

  function openCampaignDrawer(id: string | null) {
    const editing = id ? items.find(c => c.id === id) : null;
    setEditingId(id);
    setFormName(editing ? editing.name : '');
    setFormNetwork(editing ? editing.network : null);
    setFormObjective(editing ? editing.objective : 'Conversions');
    setFormBudgetType('Daily');
    setFormBudget(editing ? editing.budget : 250);
    setFormStart(editing && editing.start ? editing.start.slice(0, 16) : new Date().toISOString().slice(0, 16));
    setFormEnd(editing && editing.end ? editing.end.slice(0, 16) : '');
    setDraftAdSets(editing ? Array.from({ length: editing.adSets }, (_, i) => makeEmptyAdSet(i)) : []);
    setPickedCreatives(editing ? [...editing.creatives] : []);
    setDrawerOpen(true);
    setPeekId(null);
    setRowMenuForId(null);
  }
  function closeCampaignDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
  }

  function openAdSetModal(idx: number | null) {
    const s = idx !== null ? draftAdSets[idx] : makeEmptyAdSet(draftAdSets.length);
    setEditingAdSetIndex(idx);
    setAdsetName(s.name);
    setAdsetAudience(s.audience);
    setAdsetPlacement(s.placement);
    setAdsetBid(s.bid);
    setAdsetModalOpen(true);
  }
  function confirmAdSet() {
    const next: AdSetDraft = { name: adsetName || 'Ad set', audience: adsetAudience, placement: adsetPlacement, bid: adsetBid };
    setDraftAdSets(prev => {
      if (editingAdSetIndex !== null) { const n = [...prev]; n[editingAdSetIndex] = next; return n; }
      return [...prev, next];
    });
    setAdsetModalOpen(false);
    setEditingAdSetIndex(null);
  }

  function openCreativeModal() {
    setCreativeDraft(new Set(pickedCreatives));
    setCreativePickerSearch('');
    setCreativeModalOpen(true);
  }
  function confirmCreatives() {
    setPickedCreatives([...creativeDraft]);
    setCreativeModalOpen(false);
  }

  function collectCampaign(): AdCampaign | null {
    const name = formName.trim();
    if (!name) { onToast('Campaign name is required'); return null; }
    const start = formStart;
    const end = formEnd || null;
    const editing = editingId ? items.find(c => c.id === editingId) : null;
    return {
      id: editing ? editing.id : 'ac' + Date.now(),
      name,
      network: formNetwork || 'Meta',
      objective: formObjective,
      budget: formBudget,
      spend: editing ? editing.spend : 0,
      revenue: editing ? editing.revenue : 0,
      roas: editing ? editing.roas : 0,
      ctr: editing ? editing.ctr : 0,
      schedule: start ? (end ? `${start.slice(0, 10)} → ${end.slice(0, 10)}` : start.slice(0, 10) + ' → ongoing') : '—',
      start, end,
      status: editing ? editing.status : 'In review',
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
    closeCampaignDrawer();
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
    setFormNetwork(null);
    setDraftAdSets([]);
    setPickedCreatives([]);
    onToast('Saved. New campaign form ready.');
  }

  function rowAction(act: string, c: AdCampaign) {
    setRowMenuForId(null);
    switch (act) {
      case 'edit': { const id = c.id; setPeekId(null); openCampaignDrawer(id); break; }
      case 'preview': openPeek(c.id); break;
      case 'duplicate':
        setItems(prev => [{ ...c, id: 'ac' + Date.now(), name: c.name + ' (copy)', status: 'Draft', spend: 0, revenue: 0, roas: 0, ctr: 0, schedule: '—' }, ...prev]);
        onToast('Duplicated');
        break;
      case 'pause': setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Paused' } : x)); onToast('Paused'); break;
      case 'resume': setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Active' } : x)); onToast('Resumed'); break;
      case 'delete':
        if (confirm('Delete campaign?')) {
          setItems(prev => prev.filter(x => x.id !== c.id));
          onToast('Deleted');
        }
        break;
    }
  }

  function peekAction(act: string, c: AdCampaign) {
    if (act === 'open') { const id = c.id; setPeekId(null); openCampaignDrawer(id); }
    else if (act === 'duplicate') { setItems(prev => [{ ...c, id: 'ac' + Date.now(), name: c.name + ' (copy)', status: 'Draft', spend: 0, revenue: 0, roas: 0, ctr: 0, schedule: '—' }, ...prev]); setPeekId(null); onToast('Duplicated'); }
    else if (act === 'pause') { setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Paused' } : x)); setPeekId(null); onToast('Paused'); }
    else if (act === 'resume') { setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Active' } : x)); setPeekId(null); onToast('Resumed'); }
  }

  function bulkAction(act: string) {
    if (act === 'Clear') { setSelected(new Set()); return; }
    const sel = [...selected];
    const n = sel.length;
    if (act === 'Pause') { setItems(prev => prev.map(c => sel.includes(c.id) ? { ...c, status: 'Paused' } : c)); onToast('Pause · ' + n + ' campaign(s)'); }
    else if (act === 'Resume') { setItems(prev => prev.map(c => sel.includes(c.id) ? { ...c, status: 'Active' } : c)); onToast('Resume · ' + n + ' campaign(s)'); }
    else if (act === 'Duplicate') {
      setItems(prev => {
        const copies = sel.map(id => { const c = prev.find(x => x.id === id); return c ? { ...c, id: 'ac' + Date.now() + Math.random().toString(36).slice(2, 6), name: c.name + ' (copy)', status: 'Draft', spend: 0, revenue: 0, roas: 0, ctr: 0, schedule: '—' } : null; }).filter(Boolean) as AdCampaign[];
        return [...copies, ...prev];
      });
      onToast('Duplicate · ' + n + ' campaign(s)');
    }
    else if (act === 'Archive') { setItems(prev => prev.map(c => sel.includes(c.id) ? { ...c, status: 'Ended' } : c)); onToast('Archive · ' + n + ' campaign(s)'); }
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
    setDraftNetworks(new Set(NETWORKS as readonly string[]));
    setDateFrom(null); setDateTo(null);
  }

  function handleExport() {
    exportToCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'id', label: 'Campaign ID' }, { key: 'name', label: 'Campaign' }, { key: 'network', label: 'Network' },
      { key: 'objective', label: 'Objective' }, { key: 'budget', label: 'Budget (daily)' }, { key: 'spend', label: 'Spend (30d)' },
      { key: 'roas', label: 'ROAS' }, { key: 'schedule', label: 'Schedule' }, { key: 'status', label: 'Status' },
      { key: 'adSets', label: 'Ad sets' }, { key: 'creatives', label: 'Creatives' },
    ], 'ad-campaigns');
    onToast('Exported ' + rows.length + ' campaigns');
  }

  function handleOtherCreate(target: string) {
    if (target === 'Campaign') { setOtherCreateOpen(false); openCampaignDrawer(null); return; }
    setOtherCreateTarget(target);
    setOtherCreateOpen(true);
  }

  return (
    <main className="px-6 pb-12">

      {/* ─── DOMAIN TABSTRIP (Marketing) ─── */}
      <div className="flex items-center gap-1 mt-4 mb-1 border-b border-surface-dim overflow-x-auto">
        {[
          ['overview', 'Publishing Overview'], ['calendar', 'Calendar'], ['queue', 'Queue'], ['create', 'Create Content'],
          ['library', 'Content Library'], ['channels', 'Connected Channels'], ['performance', 'Performance'],
          ['oversight', 'Oversight'], ['promotions', 'Promotions'], ['newsletter', 'Newsletter'], ['automation', 'Automation'],
          ['advertising', 'Advertising'],
        ].map(([k, label]) => (
          <button key={k} className={`h-9 px-3 text-label-md tab-underline ${k === 'advertising' ? 'active' : 'text-on-surface-variant'}`} onClick={() => onToast('Navigate → ' + k)}>{label}</button>
        ))}
      </div>

      {/* ─── HEADER ─── */}
      <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
            <span>Marketing</span><span className="text-outline">/</span><span>Advertising</span>
          </div>
          <h1 className="text-headline-lg">Ad Center</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Create, target, and measure paid campaigns across connected ad networks.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="view-toggle">
            {([['overview', 'Overview'], ['campaigns', 'Campaigns'], ['creatives', 'Creatives'], ['audiences', 'Audiences']] as const).map(([k, label]) => (
              <button key={k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>{label}</button>
            ))}
          </div>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => setPixelsOpen(true)}>
            <span className="material-symbols-outlined text-[16px]">sensors</span>Tracking pixels
          </button>
          <div className="flex">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main flex items-center gap-1" onClick={() => openCampaignDrawer(null)}>
              <span className="material-symbols-outlined text-[16px]">add</span>New campaign
            </button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={e => { e.stopPropagation(); setNewAdMenuOpen(v => !v); }}>
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Spend (30d)</span>
          <div className="text-headline-lg mt-1 tabular-nums">${fmt(totalSpend)}</div>
          <div className="text-[11px] text-secondary mt-1">+14% vs prior period</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">ROAS</span>
          <div className="text-headline-lg mt-1 tabular-nums">{blendedRoas.toFixed(2)}×</div>
          <div className="text-[11px] text-secondary mt-1">Target 3.5× · Above</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Impressions (30d)</span>
          <div className="text-headline-lg mt-1">2.4M</div>
          <div className="text-[11px] text-on-surface-variant mt-1">CTR 1.8% · CPC $0.42</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Active campaigns</span>
          <div className="text-headline-lg mt-1 tabular-nums">{activeCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-1">{pausedCount} paused · {reviewCount} review · {draftCount} draft</div>
        </div>
      </div>

      {/* ─── CREATE ACTIONS ROW ─── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
        {([['Campaign', 'campaign'], ['Ad set', 'tune'], ['Creative', 'perm_media'], ['Audience', 'groups'], ['Pixel', 'sensors']] as const).map(([target, icon]) => (
          <button key={target} className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => handleOtherCreate(target)}>
            <span className="material-symbols-outlined text-[16px]">{icon}</span>{target}
          </button>
        ))}
        <button className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1" onClick={() => onToast('Open global create flyout')}>
          <span className="material-symbols-outlined text-[16px]">apps</span>Show all
        </button>
      </div>

      {/* ═══ OVERVIEW VIEW ═══ */}
      {view === 'overview' && (
        <section>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3">
            {/* Spend & revenue */}
            <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim">
              <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
                <div>
                  <h2 className="text-headline-sm">Spend &amp; revenue</h2>
                  <div className="text-[11px] text-on-surface-variant">Last {range} days · all networks</div>
                </div>
                <div className="view-toggle">
                  {([['30', '30d'], ['7', '7d'], ['90', '90d']] as const).map(([k, label]) => (
                    <button key={k} className={range === k ? 'active' : ''} onClick={() => { setRange(k); onToast('Range → last ' + k + ' days'); }}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div><div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold">Spend</div><div className="text-headline-md mt-1 tabular-nums">${fmt(totalSpend)}</div></div>
                  <div><div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold">Attributed revenue</div><div className="text-headline-md mt-1 tabular-nums">${fmt(totalRevenue)}</div></div>
                  <div><div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold">ROAS</div><div className="text-headline-md mt-1 tabular-nums">{blendedRoas.toFixed(2)}×</div></div>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1"><span className="font-medium">Spend</span><span className="text-on-surface-variant tabular-nums">${fmt(totalSpend)}</span></div>
                    <div className="bar"><span style={{ width: '24%' }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1"><span className="font-medium">Attributed revenue</span><span className="text-on-surface-variant tabular-nums">${fmt(totalRevenue)}</span></div>
                    <div className="bar"><span style={{ width: '100%' }} /></div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-surface-dim grid grid-cols-3 gap-3 text-[11px] text-on-surface-variant">
                  <div><div className="font-bold uppercase tracking-wider">CPC</div><div className="tabular-nums text-on-surface mt-1">$0.42</div></div>
                  <div><div className="font-bold uppercase tracking-wider">CPM</div><div className="tabular-nums text-on-surface mt-1">$7.68</div></div>
                  <div><div className="font-bold uppercase tracking-wider">Conv. rate</div><div className="tabular-nums text-on-surface mt-1">2.1%</div></div>
                </div>
              </div>
            </div>

            {/* Networks */}
            <div className="bg-white rounded-xl border border-surface-dim">
              <div className="px-5 py-3 border-b border-surface-dim">
                <h2 className="text-headline-sm">Spend by network</h2>
                <div className="text-[11px] text-on-surface-variant">Last {range} days</div>
              </div>
              <div className="p-5">
                {networkBars.map(n => (
                  <div key={n.name} className="mb-3 last:mb-0">
                    <div className="flex items-center gap-2 mb-1">
                      <NetworkLogo net={n.name} />
                      <div className="flex-1 text-body-sm font-medium">{n.name}</div>
                      <div className="text-[11px] text-on-surface-variant tabular-nums">${fmt(n.spend)}</div>
                    </div>
                    <div className="bar"><span style={{ width: (n.spend / maxNetworkSpend * 100).toFixed(1) + '%' }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top performing ad sets */}
          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div>
                <h2 className="text-headline-sm">Top-performing ad sets</h2>
                <div className="text-[11px] text-on-surface-variant">Ranked by attributed revenue</div>
              </div>
              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => setView('campaigns')}>View all campaigns</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm min-w-[900px]">
                <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Ad set</th>
                    <th className="px-3 py-2">Network</th>
                    <th className="px-3 py-2 text-right">Spend</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">ROAS</th>
                    <th className="px-3 py-2 text-right">CTR</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-dim">
                  {topAds.map(c => (
                    <tr key={c.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openPeek(c.id)}>
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2"><div className="flex items-center gap-2"><NetworkLogo net={c.network} /><span className="text-[11px]">{c.network}</span></div></td>
                      <td className="px-3 py-2 text-right tabular-nums">${fmt(c.spend)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">${fmt(c.revenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.roas.toFixed(2)}×</td>
                      <td className="px-3 py-2 text-right tabular-nums">{c.ctr.toFixed(1)}%</td>
                      <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ═══ CAMPAIGNS VIEW ═══ */}
      {view === 'campaigns' && (
        <section>
          <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">

            {/* View tabs */}
            <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
              {['All', 'Active', 'Paused', 'In review', 'Draft', 'Ended'].map(t => (
                <button key={t} className={`h-full px-3 text-label-md tab-underline ${tab === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => { setTab(t); setSelected(new Set()); }}>{t}</button>
              ))}
            </div>

            {/* Filter bar */}
            <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
              <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
                <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
                <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter campaigns, ad sets, networks…" value={q} onChange={e => setQ(e.target.value)} />
              </div>
              <div className="relative">
                <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopNetworkOpen(v => !v); }}>
                  <span className="material-symbols-outlined text-[14px]">hub</span>Network
                </button>
                {popNetworkOpen && (
                  <div className="popover absolute left-0 top-8 p-3 w-56" style={{ position: 'absolute' }} onClick={e => e.stopPropagation()}>
                    <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">Filter by network</div>
                    {NETWORKS.map(n => (
                      <label key={n} className="flex items-center gap-2 py-1 text-body-sm">
                        <input type="checkbox" checked={draftNetworks.has(n)} onChange={() => { const next = new Set(draftNetworks); if (next.has(n)) next.delete(n); else next.add(n); setDraftNetworks(next); }} />{n} Ads
                      </label>
                    ))}
                    <div className="flex justify-end gap-2 mt-3">
                      <button className="h-7 px-2 text-body-sm border border-surface-dim rounded hover:bg-surface-container-low" onClick={() => setDraftNetworks(new Set(NETWORKS as readonly string[]))}>Clear</button>
                      <button className="h-7 px-2 text-body-sm bg-primary text-white rounded hover:bg-primary-container font-semibold" onClick={() => { setNetworks(new Set(draftNetworks)); setPopNetworkOpen(false); }}>Apply</button>
                    </div>
                  </div>
                )}
              </div>
              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => {
                const from = prompt('From (YYYY-MM-DD):', dateFrom || '');
                if (from === null) return;
                const to = prompt('To (YYYY-MM-DD):', dateTo || '');
                if (to === null) return;
                setDateFrom(from || null); setDateTo(to || null);
              }}>
                <span className="material-symbols-outlined text-[14px]">calendar_today</span>Date range
              </button>
              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Saved views')}>
                <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views
              </button>
              <span className="ml-auto text-[11px] text-on-surface-variant">{rows.length ? `1–${rows.length} of ${rows.length}` : '0 of 0'}</span>
            </div>

            {/* Active chips */}
            {filtersActive && (
              <div className="px-4 py-1.5 flex items-center gap-2 flex-wrap border-b border-surface-dim">
                <span className="text-[10px] uppercase tracking-wider font-bold text-outline">Active:</span>
                {q && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-medium">
                    Search: &quot;{q}&quot;
                    <button className="w-4 h-4 rounded-full hover:bg-surface-container-high flex items-center justify-center" onClick={() => setQ('')}><span className="material-symbols-outlined text-[12px]">close</span></button>
                  </span>
                )}
                {tab !== 'All' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-medium">
                    Tab: {tab}
                    <button className="w-4 h-4 rounded-full hover:bg-surface-container-high flex items-center justify-center" onClick={() => setTab('All')}><span className="material-symbols-outlined text-[12px]">close</span></button>
                  </span>
                )}
                {networks.size !== NETWORKS.length && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-medium">
                    Network: {[...networks].join(', ') || 'none'}
                    <button className="w-4 h-4 rounded-full hover:bg-surface-container-high flex items-center justify-center" onClick={() => { setNetworks(new Set(NETWORKS as readonly string[])); setDraftNetworks(new Set(NETWORKS as readonly string[])); }}><span className="material-symbols-outlined text-[12px]">close</span></button>
                  </span>
                )}
                {(dateFrom || dateTo) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-medium">
                    Date: {dateFrom || '…'} → {dateTo || '…'}
                    <button className="w-4 h-4 rounded-full hover:bg-surface-container-high flex items-center justify-center" onClick={() => { setDateFrom(null); setDateTo(null); }}><span className="material-symbols-outlined text-[12px]">close</span></button>
                  </span>
                )}
                <button className="ml-auto text-[11px] text-primary hover:underline font-medium" onClick={clearAllFilters}>Clear all</button>
              </div>
            )}

            {/* Bulk bar */}
            {selected.size > 0 && (
              <div className="bulk-bar show px-4 py-2 flex items-center gap-3 text-body-sm">
                <span className="font-semibold">{selected.size} selected</span>
                <div className="w-px h-4 bg-white/30"></div>
                <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Pause')}><span className="material-symbols-outlined text-[15px]">pause_circle</span>Pause</button>
                <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Resume')}><span className="material-symbols-outlined text-[15px]">play_circle</span>Resume</button>
                <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Duplicate')}><span className="material-symbols-outlined text-[15px]">content_copy</span>Duplicate</button>
                <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Archive')}><span className="material-symbols-outlined text-[15px]">archive</span>Archive</button>
                <button className="ml-auto flex items-center gap-1 hover:underline" onClick={() => bulkAction('Clear')}><span className="material-symbols-outlined text-[15px]">close</span>Clear</button>
              </div>
            )}

            {/* Table / Empty */}
            {rows.length === 0 ? (
              <div className="py-16 px-8 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-[32px] text-outline">campaign</span>
                </div>
                <h3 className="text-headline-sm mb-1">No campaigns match your filters</h3>
                <p className="text-body-sm text-on-surface-variant mb-4 max-w-sm mx-auto">Clear filters or start a new ad campaign.</p>
                <div className="flex items-center justify-center gap-2">
                  <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={clearAllFilters}>
                    <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>Clear filters
                  </button>
                  <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => openCampaignDrawer(null)}>
                    <span className="material-symbols-outlined text-[16px]">add</span>New campaign
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-sm min-w-[1180px]">
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
                        <td className="px-3 py-2"><div className="font-medium">{c.name}</div><div className="text-[11px] text-on-surface-variant">{c.adSets} ad set(s) · {c.creatives.length} creative(s)</div></td>
                        <td className="px-3 py-2"><div className="flex items-center gap-2"><NetworkLogo net={c.network} /><span className="text-[11px]">{c.network}</span></div></td>
                        <td className="px-3 py-2">{c.objective}</td>
                        <td className="px-3 py-2 text-right tabular-nums">${c.budget}/d</td>
                        <td className="px-3 py-2 text-right tabular-nums">${fmt(c.spend)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.roas ? c.roas.toFixed(2) + '×' : '—'}</td>
                        <td className="px-3 py-2 text-[11px]">{c.schedule}</td>
                        <td className="px-3 py-2"><StatusPill status={c.status} /></td>
                        <td className="px-2 py-2 text-right relative">
                          <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === c.id ? null : c.id); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button>
                          {rowMenuForId === c.id && (
                            <div className="row-menu open" style={{ position: 'absolute' }} onClick={e => e.stopPropagation()}>
                              <div className="menu-header">{c.id}</div>
                              <button onClick={() => rowAction('edit', c)}><span className="material-symbols-outlined">edit</span>Edit campaign</button>
                              <button onClick={() => rowAction('preview', c)}><span className="material-symbols-outlined">visibility</span>View details</button>
                              <button onClick={() => rowAction('duplicate', c)}><span className="material-symbols-outlined">content_copy</span>Duplicate</button>
                              <div className="sep"></div>
                              <button onClick={() => rowAction('pause', c)}><span className="material-symbols-outlined">pause_circle</span>Pause</button>
                              <button onClick={() => rowAction('resume', c)}><span className="material-symbols-outlined">play_circle</span>Resume</button>
                              <div className="sep"></div>
                              <button className="danger" onClick={() => rowAction('delete', c)}><span className="material-symbols-outlined">delete</span>Delete</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div className="px-4 py-2 flex items-center justify-between border-t border-surface-dim text-[11px] text-on-surface-variant">
              <span>Rows per page:
                <select className="border border-surface-dim rounded px-1 py-0.5 bg-white" onChange={() => onToast('Rows per page updated')}><option>75</option><option>100</option><option>150</option></select>
              </span>
              <div className="flex items-center gap-2">
                <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => onToast('Previous page')}><span className="material-symbols-outlined text-[16px]">chevron_left</span></button>
                <span>Page 1 of 1</span>
                <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => onToast('Next page')}><span className="material-symbols-outlined text-[16px]">chevron_right</span></button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══ CREATIVES VIEW ═══ */}
      {view === 'creatives' && (
        <section>
          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim flex-wrap gap-2">
              <div>
                <h2 className="text-headline-sm">Ad creatives</h2>
                <div className="text-[11px] text-on-surface-variant">Images, videos, and copy used across ad sets.</div>
              </div>
              <div className="flex items-center gap-2">
                <input className="h-7 px-2 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search creatives…" value={creativeSearch} onChange={e => setCreativeSearch(e.target.value)} />
                <select className="h-7 px-2 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" value={creativeTypeFilter} onChange={e => setCreativeTypeFilter(e.target.value)}>
                  <option>All types</option><option>Image</option><option>Video</option><option>Carousel</option>
                </select>
                <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Upload creative — file picker')}>
                  <span className="material-symbols-outlined text-[14px]">upload</span>Upload
                </button>
              </div>
            </div>
            <div className="p-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredCreatives.length === 0 ? (
                <div className="col-span-full py-10 text-center text-body-sm text-on-surface-variant">No creatives match.</div>
              ) : filteredCreatives.map(c => (
                <div key={c.id} className="border border-surface-dim rounded-lg overflow-hidden">
                  <div className="h-[110px] bg-surface-container-low flex items-center justify-center">
                    <span className="material-symbols-outlined text-[28px] text-on-surface-variant">{creativeIcon(c.type)}</span>
                  </div>
                  <div className="p-2.5">
                    <div className="text-body-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{c.type} · {c.dimensions}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">{c.usedIn} use{c.usedIn === 1 ? '' : 's'}</span>
                      <button className="h-6 px-2 border border-surface-dim rounded text-[11px] hover:bg-surface-container-low" onClick={() => onToast('Edit creative ' + c.id)}>Edit</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ AUDIENCES VIEW ═══ */}
      {view === 'audiences' && (
        <section>
          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div>
                <h2 className="text-headline-sm">Audiences</h2>
                <div className="text-[11px] text-on-surface-variant">Reusable custom and lookalike audiences across networks.</div>
              </div>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => handleOtherCreate('Audience')}>
                <span className="material-symbols-outlined text-[16px]">add</span>New audience
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm min-w-[900px]">
                <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Audience</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2 text-right">Size</th>
                    <th className="px-3 py-2">Used in</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-dim">
                  {AUDIENCES.map(a => (
                    <tr key={a.id} className="hover:bg-surface-container-low">
                      <td className="px-3 py-2 font-medium">{a.name}</td>
                      <td className="px-3 py-2">{a.type}</td>
                      <td className="px-3 py-2 text-[11px]">{a.source}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.size}</td>
                      <td className="px-3 py-2 tabular-nums">{a.usedIn}</td>
                      <td className="px-3 py-2 text-[11px]">{a.updated}</td>
                      <td className="px-2 py-2 text-right relative"><button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => onToast('Audience ' + a.id)}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* New ad campaign split menu */}
      {newAdMenuOpen && (
        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={() => setNewAdMenuOpen(false)}>
          <div className="menu-header">Create</div>
          <button onClick={() => { setNewAdMenuOpen(false); openCampaignDrawer(null); }}><span className="material-symbols-outlined">campaign</span>Campaign</button>
          <button onClick={() => { setNewAdMenuOpen(false); handleOtherCreate('Ad set'); }}><span className="material-symbols-outlined">tune</span>Ad set</button>
          <button onClick={() => { setNewAdMenuOpen(false); handleOtherCreate('Creative'); }}><span className="material-symbols-outlined">perm_media</span>Creative</button>
          <button onClick={() => { setNewAdMenuOpen(false); handleOtherCreate('Audience'); }}><span className="material-symbols-outlined">groups</span>Audience</button>
        </div>
      )}

      {/* Click-away catcher for row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* Peek drawer */}
      {peek && (
        <>
          <div className="drawer-scrim open" onClick={closePeek} />
          <div className="peek open">
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">campaign</span>
                <span className="text-headline-sm truncate">{peek.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); openCampaignDrawer(id); }}><span className="material-symbols-outlined text-[14px]">open_in_full</span>Open</button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={closePeek}><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-body-sm">
              <div className="mb-3 flex items-center gap-2"><StatusPill status={peek.status} /><div className="flex items-center gap-1 text-[11px]"><NetworkLogo net={peek.network} />{peek.network}</div></div>
              <div className="bg-surface-container-low rounded-lg p-3 mb-3 grid grid-cols-3 gap-2 text-center">
                <div><div className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Spend</div><div className="text-body-md font-semibold tabular-nums">${fmt(peek.spend)}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Revenue</div><div className="text-body-md font-semibold tabular-nums">${fmt(peek.revenue)}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">ROAS</div><div className="text-body-md font-semibold tabular-nums">{peek.roas ? peek.roas.toFixed(2) + '×' : '—'}</div></div>
              </div>
              <dl className="divide-y divide-surface-dim text-body-sm">
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Objective</dt><dd>{peek.objective}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Budget</dt><dd className="tabular-nums">${peek.budget}/d</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Schedule</dt><dd>{peek.schedule}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Ad sets</dt><dd>{peek.adSets}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Creatives</dt><dd>{peek.creatives.length}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">CTR</dt><dd className="tabular-nums">{peek.ctr ? peek.ctr.toFixed(1) + '%' : '—'}</dd></div>
              </dl>
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => peekAction('open', peek)}><span className="material-symbols-outlined text-[16px]">edit</span>Edit</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => peekAction('duplicate', peek)}><span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => peekAction('pause', peek)}><span className="material-symbols-outlined text-[16px]">pause_circle</span>Pause</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => peekAction('resume', peek)}><span className="material-symbols-outlined text-[16px]">play_circle</span>Resume</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Campaign drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={closeCampaignDrawer} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">campaign</span>
                <div>
                  <div className="text-headline-sm">{editingId ? 'Edit campaign' : 'New campaign'}</div>
                  <div className="text-[11px] text-on-surface-variant">{editingId ? (() => { const e = items.find(c => c.id === editingId); return e ? `${e.status} · ${e.network}` : ''; })() : 'Draft · not yet published'}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeCampaignDrawer}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Basics */}
              <section>
                <div className="text-body-md font-semibold mb-2">Campaign basics</div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Campaign name</label>
                    <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="e.g. Fall launch — Prospecting" value={formName} onChange={e => setFormName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Network</label>
                    <div className="grid grid-cols-2 gap-2">
                      {NETWORKS.map(n => (
                        <button key={n} className={`border rounded-lg p-2.5 text-left text-body-sm hover:border-primary ${formNetwork === n ? 'border-primary bg-surface-container-low' : 'border-surface-dim'}`} onClick={() => setFormNetwork(n)}>
                          <div className="flex items-center gap-2"><NetworkLogo net={n} /><div><div className="font-semibold text-[12px]">{n} Ads</div><div className="text-[10px] text-on-surface-variant">{n === 'Meta' ? 'Facebook + Instagram' : n === 'TikTok' ? 'In-feed, Spark' : n === 'Google' ? 'Search, Shopping, PMax' : 'Promoted Pins'}</div></div></div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Objective</label>
                    <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={formObjective} onChange={e => setFormObjective(e.target.value)}>
                      <option>Conversions</option><option>Traffic</option><option>Awareness</option><option>Engagement</option><option>Lead generation</option><option>Catalog sales</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Budget & schedule */}
              <section className="pt-4 border-t border-surface-dim">
                <div className="text-body-md font-semibold mb-2">Budget &amp; schedule</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Budget type</label>
                    <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={formBudgetType} onChange={e => setFormBudgetType(e.target.value)}>
                      <option>Daily</option><option>Lifetime</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Amount</label>
                    <div className="flex">
                      <span className="h-9 px-2 border border-r-0 border-surface-dim rounded-l bg-surface-container-low text-body-md flex items-center">$</span>
                      <input type="number" className="flex-1 h-9 px-2.5 border border-surface-dim rounded-r text-body-md focus:outline-none focus:border-primary" value={formBudget} onChange={e => setFormBudget(parseInt(e.target.value || '0', 10))} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Start</label>
                    <input type="datetime-local" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={formStart} onChange={e => setFormStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">End (optional)</label>
                    <input type="datetime-local" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={formEnd} onChange={e => setFormEnd(e.target.value)} />
                  </div>
                </div>
              </section>

              {/* Ad sets */}
              <section className="pt-4 border-t border-surface-dim">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-body-md font-semibold">Ad sets</div>
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => openAdSetModal(null)}>
                    <span className="material-symbols-outlined text-[14px]">add</span>Add ad set
                  </button>
                </div>
                <div className="space-y-2">
                  {draftAdSets.length === 0 ? (
                    <div className="text-[11px] text-on-surface-variant">No ad sets yet. Add one to begin.</div>
                  ) : draftAdSets.map((s, i) => (
                    <div key={i} className="ad-set-card">
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

              {/* Creative picker */}
              <section className="pt-4 border-t border-surface-dim">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-body-md font-semibold">Creative selection</div>
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={openCreativeModal}>
                    <span className="material-symbols-outlined text-[14px]">perm_media</span>Pick creative
                  </button>
                </div>
                <div className="space-y-1">
                  {pickedCreatives.length === 0 ? (
                    <div className="text-[11px] text-on-surface-variant">No creatives selected yet.</div>
                  ) : pickedCreatives.map(id => {
                    const c = CREATIVES.find(x => x.id === id); if (!c) return null;
                    return (
                      <div key={id} className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-outline-variant bg-surface-container-low text-body-sm">
                        <span className="material-symbols-outlined text-[16px] text-primary">{creativeIcon(c.type)}</span>
                        <div className="min-w-0 flex-1"><div className="font-medium truncate">{c.name}</div><div className="text-[11px] text-on-surface-variant">{c.type} · {c.dimensions}</div></div>
                        <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setPickedCreatives(prev => prev.filter(x => x !== id))}><span className="material-symbols-outlined text-[14px]">close</span></button>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeCampaignDrawer}>Cancel</button>
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
            <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary mb-2" placeholder="Search creatives…" value={creativePickerSearch} onChange={e => setCreativePickerSearch(e.target.value)} />
            <div className="max-h-[320px] overflow-y-auto border border-surface-dim rounded">
              {CREATIVES.filter(c => c.name.toLowerCase().includes(creativePickerSearch.toLowerCase())).map(c => (
                <label key={c.id} className="flex items-center gap-3 px-3 py-2 border-b border-surface-dim last:border-b-0 cursor-pointer hover:bg-surface-container-low">
                  <input type="checkbox" checked={creativeDraft.has(c.id)} style={{ accentColor: '#0a6400' }} onChange={() => { const next = new Set(creativeDraft); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); setCreativeDraft(next); }} />
                  <div className="ad-creative"><span className="material-symbols-outlined text-[16px]">{creativeIcon(c.type)}</span></div>
                  <div className="min-w-0 flex-1"><div className="text-body-sm font-medium">{c.name}</div><div className="text-[11px] text-on-surface-variant">{c.type} · {c.dimensions}</div></div>
                  <span className="text-[11px] text-on-surface-variant tabular-nums">{c.usedIn} use{c.usedIn === 1 ? '' : 's'}</span>
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
                <label className="block text-label-sm text-on-surface-variant mb-1">Name</label>
                <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="Ad set name" value={adsetName} onChange={e => setAdsetName(e.target.value)} />
              </div>
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">Audience</label>
                <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={adsetAudience} onChange={e => setAdsetAudience(e.target.value)}>{AUDIENCE_NAMES.map(a => <option key={a}>{a}</option>)}</select>
              </div>
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">Placement</label>
                <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={adsetPlacement} onChange={e => setAdsetPlacement(e.target.value)}><option>Auto</option><option>Feed</option><option>Stories / Reels</option><option>Search</option></select>
              </div>
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">Bid strategy</label>
                <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={adsetBid} onChange={e => setAdsetBid(e.target.value)}><option>Lowest cost</option><option>Cost cap</option><option>ROAS goal</option></select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setAdsetModalOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={confirmAdSet}>{editingAdSetIndex !== null ? 'Save' : 'Add ad set'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Pixels modal */}
      {pixelsOpen && (
        <div className="modal-scrim open" onClick={() => setPixelsOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-headline-sm">Tracking pixels</h3>
              <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setPixelsOpen(false)}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
            <p className="text-body-sm text-on-surface-variant mb-3">Fire conversion events from your site to ad networks.</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded border border-surface-dim">
                <div><div className="font-semibold text-body-sm">Meta Pixel</div><div className="text-[11px] text-on-surface-variant">ID 1029••••4471</div></div>
                <span className="status-pill status-active"><span className="material-symbols-outlined text-[12px]">check</span>Installed</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded border border-surface-dim">
                <div><div className="font-semibold text-body-sm">TikTok Pixel</div><div className="text-[11px] text-on-surface-variant">Not installed</div></div>
                <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => onToast('Install TikTok Pixel — OAuth flow')}>Install</button>
              </div>
              <div className="flex items-center justify-between p-3 rounded border border-surface-dim">
                <div><div className="font-semibold text-body-sm">Google Ads tag</div><div className="text-[11px] text-on-surface-variant">AW-•••••••</div></div>
                <span className="status-pill status-active"><span className="material-symbols-outlined text-[12px]">check</span>Installed</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded border border-surface-dim">
                <div><div className="font-semibold text-body-sm">Pinterest Tag</div><div className="text-[11px] text-on-surface-variant">Not installed</div></div>
                <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => onToast('Install Pinterest Tag — OAuth flow')}>Install</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other create modal */}
      {otherCreateOpen && (
        <div className="modal-scrim open" onClick={() => setOtherCreateOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Create {otherCreateTarget.toLowerCase()}</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">This opens the {otherCreateTarget} create surface.</p>
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setOtherCreateOpen(false)}>Close</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => { onToast('Opened ' + otherCreateTarget + ' create surface'); setOtherCreateOpen(false); }}>Open create</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
