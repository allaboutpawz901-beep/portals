'use client';
/* AdSetsScreen — 1:1 port of upload/marketing_extracted/Marketing/adsets.html
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
const PLACEMENTS = ['Auto', 'Feed', 'Stories / Reels', 'Search'] as const;
const BIDS = ['Lowest cost', 'Cost cap', 'ROAS goal'] as const;
const AUDIENCES = ['Site visitors 30d', 'Abandoned cart 7d', 'Lookalike — VIPs', 'TikTok engagement 90d', 'New customers'] as const;
const STATUSES = ['Active', 'Paused', 'Draft', 'In review', 'Ended'] as const;
const AGES = ['All ages', '18-24', '25-34', '35-44', '45-54', '55+'] as const;
const GENDERS = ['All', 'Women', 'Men'] as const;

interface CampaignRef {
  id: string;
  name: string;
  network: string;
}

const CAMPAIGNS: CampaignRef[] = [
  { id: 'CMP-3001', name: 'Fall launch — Prospecting', network: 'Meta' },
  { id: 'CMP-3002', name: 'TikTok creator drop', network: 'TikTok' },
  { id: 'CMP-3003', name: 'Brand search — Non-brand', network: 'Google' },
  { id: 'CMP-3004', name: 'Holiday capsule lookalike', network: 'Meta' },
  { id: 'CMP-3005', name: 'Pinterest — Evergreen inspo', network: 'Pinterest' },
  { id: 'CMP-3006', name: 'Summer clearance (ended)', network: 'Meta' },
];

interface AdSet {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  network: string;
  audience: string;
  placement: string;
  bid: string;
  budget: number;
  spend: number;
  revenue: number;
  roas: number;
  frequency: number;
  status: string;
  start: string | null;
  end: string | null;
}

const ADSETS: AdSet[] = [
  { id: 'AS-5001', name: 'Fall — Retargeting 30d', campaignId: 'CMP-3001', campaignName: 'Fall launch — Prospecting', network: 'Meta', audience: 'Site visitors 30d', placement: 'Feed', bid: 'Lowest cost', budget: 120, spend: 4210, revenue: 18240, roas: 4.33, frequency: 2.1, status: 'Active', start: '2026-10-15T00:00', end: '2026-11-30T23:59' },
  { id: 'AS-5002', name: 'Fall — Lookalike 2%', campaignId: 'CMP-3001', campaignName: 'Fall launch — Prospecting', network: 'Meta', audience: 'Lookalike — VIPs', placement: 'Auto', bid: 'ROAS goal', budget: 130, spend: 4410, revenue: 18480, roas: 4.19, frequency: 2.8, status: 'Active', start: '2026-10-15T00:00', end: '2026-11-30T23:59' },
  { id: 'AS-5003', name: 'TikTok — Spark ads 25-44', campaignId: 'CMP-3002', campaignName: 'TikTok creator drop', network: 'TikTok', audience: 'TikTok engagement 90d', placement: 'Stories / Reels', bid: 'Lowest cost', budget: 180, spend: 4210, revenue: 12890, roas: 3.06, frequency: 3.4, status: 'Active', start: '2026-10-20T00:00', end: '2026-11-20T23:59' },
  { id: 'AS-5004', name: 'Search — Non-brand exact', campaignId: 'CMP-3003', campaignName: 'Brand search — Non-brand', network: 'Google', audience: 'New customers', placement: 'Search', bid: 'Cost cap', budget: 120, spend: 2310, revenue: 9280, roas: 4.02, frequency: 1.4, status: 'Active', start: '2026-10-01T00:00', end: '2026-12-31T23:59' },
  { id: 'AS-5005', name: 'Holiday — Lookalike 1%', campaignId: 'CMP-3004', campaignName: 'Holiday capsule lookalike', network: 'Meta', audience: 'Lookalike — VIPs', placement: 'Auto', bid: 'Lowest cost', budget: 300, spend: 3280, revenue: 14840, roas: 4.53, frequency: 2.4, status: 'In review', start: '2026-11-05T00:00', end: '2026-12-24T23:59' },
  { id: 'AS-5006', name: 'Pinterest — Evergreen', campaignId: 'CMP-3005', campaignName: 'Pinterest — Evergreen inspo', network: 'Pinterest', audience: 'Site visitors 30d', placement: 'Feed', bid: 'Lowest cost', budget: 80, spend: 0, revenue: 0, roas: 0, frequency: 0, status: 'Draft', start: null, end: null },
  { id: 'AS-5007', name: 'Summer — Retargeting cart', campaignId: 'CMP-3006', campaignName: 'Summer clearance (ended)', network: 'Meta', audience: 'Abandoned cart 7d', placement: 'Feed', bid: 'Lowest cost', budget: 200, spend: 12400, revenue: 38210, roas: 3.08, frequency: 5.8, status: 'Ended', start: '2026-08-01T00:00', end: '2026-09-15T23:59' },
];

/* ─── helpers (from HTML <script>) ─── */
function pillFor(status: string) {
  const cls = status === 'Active' ? 'active' : status === 'Paused' ? 'paused' : status === 'In review' ? 'review' : status === 'Draft' ? 'draft' : status === 'Ended' ? 'ended' : 'draft';
  return <span className={`stat ${cls}`}>{status}</span>;
}
function netChip(n: string) {
  return <span className={`net-chip net-${n}`}>{n}</span>;
}
function fmt(n: number) { return n.toLocaleString(); }
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}

export default function AdSetsScreen({ onToast }: MarketingScreenProps) {
  /* ─── state (mirrors HTML's `filters`, `editing`, `peekId`, etc.) ─── */
  const [items, setItems] = useState<AdSet[]>(ADSETS);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All');
  const [campaigns, setCampaigns] = useState<Set<string>>(new Set(CAMPAIGNS.map(c => c.id)));
  const [placements, setPlacements] = useState<Set<string>>(new Set(PLACEMENTS as readonly string[]));
  const [bids, setBids] = useState<Set<string>>(new Set(BIDS as readonly string[]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [popCampaignOpen, setPopCampaignOpen] = useState(false);
  const [popPlacementOpen, setPopPlacementOpen] = useState(false);
  const [popBidOpen, setPopBidOpen] = useState(false);
  const [draftCampaigns, setDraftCampaigns] = useState<Set<string>>(new Set(CAMPAIGNS.map(c => c.id)));
  const [draftPlacements, setDraftPlacements] = useState<Set<string>>(new Set(PLACEMENTS as readonly string[]));
  const [draftBids, setDraftBids] = useState<Set<string>>(new Set(BIDS as readonly string[]));

  // drawer form state (mirrors HTML's openAdsetDrawer() field assignments)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formCampaignId, setFormCampaignId] = useState(CAMPAIGNS[0].id);
  const [formStatus, setFormStatus] = useState('Draft');
  const [formAudience, setFormAudience] = useState(AUDIENCES[0]);
  const [formAge, setFormAge] = useState('All ages');
  const [formGender, setFormGender] = useState('All');
  const [formLocations, setFormLocations] = useState('United States');
  const [formPlacement, setFormPlacement] = useState('Auto');
  const [formBid, setFormBid] = useState('Lowest cost');
  const [formBudget, setFormBudget] = useState(100);
  const [formFrequency, setFormFrequency] = useState(2);
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');

  /* ─── derived (mirrors filteredAds()) ─── */
  const rows = useMemo(() => items.filter(a => {
    const ql = q.toLowerCase();
    const qOK = !ql || (a.id + ' ' + a.name + ' ' + a.campaignName + ' ' + a.audience + ' ' + a.network).toLowerCase().includes(ql);
    const tabOK = tab === 'All' || a.status === tab;
    const campOK = campaigns.has(a.campaignId);
    const placeOK = placements.has(a.placement);
    const bidOK = bids.has(a.bid);
    return qOK && tabOK && campOK && placeOK && bidOK;
  }), [items, q, tab, campaigns, placements, bids]);

  // mirrors syncCounts()
  const activeList = items.filter(a => a.status === 'Active');
  const avgRoas = activeList.length ? activeList.reduce((s, a) => s + a.roas, 0) / activeList.length : 0;
  const maxFreq = items.reduce((m, a) => Math.max(m, a.frequency || 0), 0);

  const filtersActive = !!q || tab !== 'All' || campaigns.size !== CAMPAIGNS.length || placements.size !== PLACEMENTS.length || bids.size !== BIDS.length;
  const allChecked = rows.length > 0 && rows.every(a => selected.has(a.id));
  const someChecked = rows.some(a => selected.has(a.id));

  /* ─── handlers ─── */
  function openPeek(id: string) { setPeekId(id); }

  function openAdsetDrawer(id: string | null) {
    const editing = id ? items.find(a => a.id === id) : null;
    setEditingId(id);
    setFormName(editing ? editing.name : '');
    setFormCampaignId(editing ? editing.campaignId : CAMPAIGNS[0].id);
    setFormStatus(editing ? editing.status : 'Draft');
    setFormAudience(editing ? editing.audience : AUDIENCES[0]);
    setFormPlacement(editing ? editing.placement : 'Auto');
    setFormBid(editing ? editing.bid : 'Lowest cost');
    setFormBudget(editing ? editing.budget : 100);
    setFormFrequency(editing ? editing.frequency : 2);
    setFormAge('All ages');
    setFormGender('All');
    setFormLocations('United States');
    setFormStart(editing && editing.start ? editing.start.slice(0, 16) : new Date().toISOString().slice(0, 16));
    setFormEnd(editing && editing.end ? editing.end.slice(0, 16) : '');
    setDrawerOpen(true);
    setPeekId(null);
    setRowMenuForId(null);
    setCreateMenuOpen(false);
  }
  function closeAdsetDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
  }

  function collectAdset(): AdSet | null {
    const name = formName.trim();
    if (!name) { onToast('Ad set name is required'); return null; }
    const campaign = CAMPAIGNS.find(c => c.id === formCampaignId);
    const editing = editingId ? items.find(a => a.id === editingId) : null;
    return {
      id: editing ? editing.id : 'AS-' + (5000 + items.length + 1),
      name,
      campaignId: formCampaignId,
      campaignName: campaign ? campaign.name : '—',
      network: campaign ? campaign.network : 'Meta',
      audience: formAudience,
      placement: formPlacement,
      bid: formBid,
      budget: formBudget,
      spend: editing ? editing.spend : 0,
      revenue: editing ? editing.revenue : 0,
      roas: editing ? editing.roas : 0,
      frequency: formFrequency,
      status: formStatus,
      start: formStart || null,
      end: formEnd || null,
    };
  }
  function save() {
    const a = collectAdset(); if (!a) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = a; return n; } return prev; }
      return [a, ...prev];
    });
    closeAdsetDrawer();
    onToast(editingId ? 'Ad set updated' : 'Ad set created');
  }
  function saveAndNew() {
    const a = collectAdset(); if (!a) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = a; return n; } return prev; }
      return [a, ...prev];
    });
    setEditingId(null);
    setFormName('');
    onToast('Saved. New ad set form ready.');
  }

  function rowAction(act: string, a: AdSet) {
    setRowMenuForId(null);
    switch (act) {
      case 'edit': openAdsetDrawer(a.id); break;
      case 'view': openPeek(a.id); break;
      case 'duplicate':
        setItems(prev => [{ ...a, id: 'AS-' + (5000 + prev.length + 1), name: a.name + ' (copy)', status: 'Draft', spend: 0, revenue: 0, roas: 0, frequency: 0 }, ...prev]);
        onToast(`Duplicated: ${a.name}`);
        break;
      case 'pause': setItems(prev => prev.map(x => x.id === a.id ? { ...x, status: 'Paused' } : x)); onToast(`Paused: ${a.name}`); break;
      case 'resume': setItems(prev => prev.map(x => x.id === a.id ? { ...x, status: 'Active' } : x)); onToast(`Resumed: ${a.name}`); break;
      case 'archive': setItems(prev => prev.map(x => x.id === a.id ? { ...x, status: 'Ended' } : x)); onToast(`Archived: ${a.name}`); break;
      case 'delete':
        if (confirm(`Delete ad set "${a.name}"?`)) {
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
    if (n === 0) return;
    if (act === 'pause') { setItems(prev => prev.map(a => sel.includes(a.id) ? { ...a, status: 'Paused' } : a)); onToast(`Paused ${n} ad set(s)`); }
    else if (act === 'resume') { setItems(prev => prev.map(a => sel.includes(a.id) ? { ...a, status: 'Active' } : a)); onToast(`Resumed ${n} ad set(s)`); }
    else if (act === 'duplicate') {
      setItems(prev => {
        const copies = sel.map(id => { const a = prev.find(x => x.id === id); return a ? { ...a, id: 'AS-' + (5000 + prev.length + 1), name: a.name + ' (copy)', status: 'Draft', spend: 0, revenue: 0, roas: 0, frequency: 0 } : null; }).filter(Boolean) as AdSet[];
        return [...copies, ...prev];
      });
      onToast(`Duplicated ${n} ad set(s)`);
    }
    else if (act === 'delete') {
      if (confirm(`Delete ${n} ad set(s)?`)) {
        setItems(prev => prev.filter(a => !sel.includes(a.id)));
        onToast(`Deleted ${n} ad set(s)`);
      }
    }
    setSelected(new Set());
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
    setCampaigns(new Set(CAMPAIGNS.map(c => c.id)));
    setPlacements(new Set(PLACEMENTS as readonly string[]));
    setBids(new Set(BIDS as readonly string[]));
    setDraftCampaigns(new Set(CAMPAIGNS.map(c => c.id)));
    setDraftPlacements(new Set(PLACEMENTS as readonly string[]));
    setDraftBids(new Set(BIDS as readonly string[]));
  }

  function handleExport() {
    exportToCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'id', label: 'Ad set ID' }, { key: 'name', label: 'Ad set' }, { key: 'campaignId', label: 'Campaign ID' },
      { key: 'campaignName', label: 'Campaign' }, { key: 'network', label: 'Network' }, { key: 'audience', label: 'Audience' },
      { key: 'placement', label: 'Placement' }, { key: 'bid', label: 'Bid strategy' }, { key: 'budget', label: 'Daily budget' },
      { key: 'spend', label: 'Spend (30d)' }, { key: 'revenue', label: 'Revenue' }, { key: 'roas', label: 'ROAS' },
      { key: 'frequency', label: 'Frequency' }, { key: 'status', label: 'Status' }, { key: 'start', label: 'Start' }, { key: 'end', label: 'End' },
    ], 'adsets');
    onToast(`Exported ${rows.length} ad set(s)`);
  }

  const peek = peekId ? items.find(a => a.id === peekId) : null;

  return (
    <main className="px-6 pb-12">

      {/* ─── BREADCRUMB ─── */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Advertising</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Ad sets</span>
      </div>

      {/* ─── PAGE HEADER ─── */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Ad sets</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Every ad set across campaigns — audiences, placements, bid strategies, and delivery.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Customize panel — Data / Visual tabs')}>
            <span className="material-symbols-outlined text-[16px]">tune</span>Customize
          </button>
          <div className="flex">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" onClick={() => openAdsetDrawer(null)}>
              <span className="material-symbols-outlined text-[16px]">add</span>New ad set
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
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total ad sets</div>
          <div className="text-headline-sm mt-1 tabular-nums">{items.length}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Across all campaigns</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Active delivery</div>
          <div className="text-headline-sm mt-1 tabular-nums text-secondary">{activeList.length}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Currently spending</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Avg. ROAS</div>
          <div className="text-headline-sm mt-1 tabular-nums">{avgRoas.toFixed(2)}×</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Across active sets</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Audience saturation</div>
          <div className="text-headline-sm mt-1 tabular-nums">{maxFreq.toFixed(1)}×</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Highest frequency</div>
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
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter ad sets…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {/* Campaign popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopCampaignOpen(v => !v); setPopPlacementOpen(false); setPopBidOpen(false); }}>
              <span className="material-symbols-outlined text-[14px]">campaign</span>Campaign
            </button>
            {popCampaignOpen && (
              <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 260 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Filter by campaign</div>
                <div className="max-h-[220px] overflow-y-auto">
                  {CAMPAIGNS.map(c => (
                    <label key={c.id} className="flex items-center gap-2 px-2 py-1 text-body-sm">
                      <input type="checkbox" checked={draftCampaigns.has(c.id)} onChange={() => { const next = new Set(draftCampaigns); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); setDraftCampaigns(next); }} />{c.name}
                    </label>
                  ))}
                </div>
                <div className="sep"></div>
                <div className="flex justify-end gap-2 px-2 py-1">
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => setDraftCampaigns(new Set(CAMPAIGNS.map(c => c.id)))}>Clear</button>
                  <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container" onClick={() => { setCampaigns(new Set(draftCampaigns)); setPopCampaignOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          {/* Placement popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopPlacementOpen(v => !v); setPopCampaignOpen(false); setPopBidOpen(false); }}>
              <span className="material-symbols-outlined text-[14px]">grid_view</span>Placement
            </button>
            {popPlacementOpen && (
              <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 220 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Filter by placement</div>
                {PLACEMENTS.map(p => (
                  <label key={p} className="flex items-center gap-2 px-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftPlacements.has(p)} onChange={() => { const next = new Set(draftPlacements); if (next.has(p)) next.delete(p); else next.add(p); setDraftPlacements(next); }} />{p}
                  </label>
                ))}
                <div className="sep"></div>
                <div className="flex justify-end gap-2 px-2 py-1">
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => setDraftPlacements(new Set(PLACEMENTS as readonly string[]))}>Clear</button>
                  <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container" onClick={() => { setPlacements(new Set(draftPlacements)); setPopPlacementOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          {/* Bid popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopBidOpen(v => !v); setPopCampaignOpen(false); setPopPlacementOpen(false); }}>
              <span className="material-symbols-outlined text-[14px]">price_change</span>Bid
            </button>
            {popBidOpen && (
              <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 220 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Filter by bid strategy</div>
                {BIDS.map(b => (
                  <label key={b} className="flex items-center gap-2 px-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftBids.has(b)} onChange={() => { const next = new Set(draftBids); if (next.has(b)) next.delete(b); else next.add(b); setDraftBids(next); }} />{b}
                  </label>
                ))}
                <div className="sep"></div>
                <div className="flex justify-end gap-2 px-2 py-1">
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => setDraftBids(new Set(BIDS as readonly string[]))}>Clear</button>
                  <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container" onClick={() => { setBids(new Set(draftBids)); setPopBidOpen(false); }}>Apply</button>
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
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('delete')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
            <button className="ml-auto" onClick={() => bulkAction('close')}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>
        )}

        {/* Table */}
        {rows.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px] text-outline">tune</span>
            </div>
            <h3 className="text-headline-sm mb-1">No ad sets match</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Clear filters or create a new ad set.</p>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={clearAllFilters}>Clear filters</button>
          </div>
        ) : (
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} /></th>
                <th className="px-3 py-2">Ad set</th>
                <th className="px-3 py-2">Campaign</th>
                <th className="px-3 py-2">Audience</th>
                <th className="px-3 py-2">Placement</th>
                <th className="px-3 py-2">Bid</th>
                <th className="px-3 py-2 text-right">Budget (daily)</th>
                <th className="px-3 py-2 text-right">Spend (30d)</th>
                <th className="px-3 py-2 text-right">ROAS</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {rows.map(a => (
                <tr key={a.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openPeek(a.id)}>
                  <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={selected.has(a.id)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(a.id)} /></td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{a.id}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-[12px]">{a.campaignName}</div>
                    <div className="text-[11px] text-on-surface-variant">{netChip(a.network)}</div>
                  </td>
                  <td className="px-3 py-2 text-[12px]">{a.audience}</td>
                  <td className="px-3 py-2 text-[12px]">{a.placement}</td>
                  <td className="px-3 py-2 text-[12px]">{a.bid}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${a.budget}/d</td>
                  <td className="px-3 py-2 text-right tabular-nums">${fmt(a.spend)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.roas ? a.roas.toFixed(2) + '×' : '—'}</td>
                  <td className="px-3 py-2">{pillFor(a.status)}</td>
                  <td className="px-2 py-2 text-right relative">
                    <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === a.id ? null : a.id); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button>
                    {rowMenuForId === a.id && (
                      <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                        <div className="menu-header">This ad set</div>
                        <button onClick={() => rowAction('edit', a)}><span className="material-symbols-outlined">edit</span>Edit ad set</button>
                        <button onClick={() => rowAction('view', a)}><span className="material-symbols-outlined">visibility</span>View details</button>
                        <button onClick={() => rowAction('duplicate', a)}><span className="material-symbols-outlined">content_copy</span>Duplicate</button>
                        <div className="sep"></div>
                        <div className="menu-header">Status</div>
                        <button onClick={() => rowAction('pause', a)}><span className="material-symbols-outlined">pause_circle</span>Pause</button>
                        <button onClick={() => rowAction('resume', a)}><span className="material-symbols-outlined">play_circle</span>Resume</button>
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
          <button onClick={() => { setCreateMenuOpen(false); openAdsetDrawer(null); }}><span className="material-symbols-outlined">tune</span>Ad set</button>
          <button onClick={() => { setCreateMenuOpen(false); onToast('Create campaign — will route to that dedicated page'); }}><span className="material-symbols-outlined">campaign</span>Campaign</button>
          <button onClick={() => { setCreateMenuOpen(false); onToast('Create creative — will route to that dedicated page'); }}><span className="material-symbols-outlined">perm_media</span>Creative</button>
          <button onClick={() => { setCreateMenuOpen(false); onToast('Create audience — will route to that dedicated page'); }}><span className="material-symbols-outlined">groups</span>Audience</button>
        </div>
      )}

      {/* Click-away catcher for row menu and popovers */}
      {(rowMenuForId || popCampaignOpen || popPlacementOpen || popBidOpen) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => { setRowMenuForId(null); setPopCampaignOpen(false); setPopPlacementOpen(false); setPopBidOpen(false); }} />
      )}

      {/* Peek drawer */}
      {peek && (
        <>
          <div className="drawer-scrim open" onClick={() => setPeekId(null)} />
          <div className="peek open">
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">tune</span>
                <span className="text-headline-sm truncate">{peek.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); openAdsetDrawer(id); }}><span className="material-symbols-outlined text-[14px]">edit</span>Edit</button>
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
                <div className="kv"><dt>Ad set ID</dt><dd className="code-mono">{peek.id}</dd></div>
                <div className="kv"><dt>Campaign</dt><dd>{peek.campaignName}</dd></div>
                <div className="kv"><dt>Audience</dt><dd>{peek.audience}</dd></div>
                <div className="kv"><dt>Placement</dt><dd>{peek.placement}</dd></div>
                <div className="kv"><dt>Bid strategy</dt><dd>{peek.bid}</dd></div>
                <div className="kv"><dt>Daily budget</dt><dd className="tabular-nums">${peek.budget}</dd></div>
                <div className="kv"><dt>Frequency</dt><dd className="tabular-nums">{peek.frequency.toFixed(1)}×</dd></div>
                <div className="kv"><dt>Start</dt><dd>{fmtDate(peek.start)}</dd></div>
                <div className="kv"><dt>End</dt><dd>{fmtDate(peek.end)}</dd></div>
              </dl>
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); openAdsetDrawer(id); }}><span className="material-symbols-outlined text-[16px]">edit</span>Edit</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('duplicate', peek)}><span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('pause', peek)}><span className="material-symbols-outlined text-[16px]">pause_circle</span>Pause</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('resume', peek)}><span className="material-symbols-outlined text-[16px]">play_circle</span>Resume</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Ad set drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={closeAdsetDrawer} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">tune</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">{editingId ? 'Edit ad set' : 'New ad set'}</div>
                  <div className="text-[11px] text-on-surface-variant">{editingId ? (() => { const e = items.find(a => a.id === editingId); return e ? `${e.status} · ${e.id}` : ''; })() : 'Draft · not yet active'}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeAdsetDrawer}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Basics */}
              <section>
                <div className="section-h">Ad set basics</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Name</label>
                    <input className="field-input" placeholder="e.g. Site visitors — 30d — Fall" value={formName} onChange={e => setFormName(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Campaign</label>
                    <select className="field-input" value={formCampaignId} onChange={e => setFormCampaignId(e.target.value)}>
                      {CAMPAIGNS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Status</label>
                    <select className="field-input" value={formStatus} onChange={e => setFormStatus(e.target.value)}>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Audience */}
              <section>
                <div className="section-h">Audience</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Audience</label>
                    <select className="field-input" value={formAudience} onChange={e => setFormAudience(e.target.value)}>
                      {AUDIENCES.map(a => <option key={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Age</label>
                      <select className="field-input" value={formAge} onChange={e => setFormAge(e.target.value)}>
                        {AGES.map(a => <option key={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Gender</label>
                      <select className="field-input" value={formGender} onChange={e => setFormGender(e.target.value)}>
                        {GENDERS.map(g => <option key={g}>{g}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Locations</label>
                    <input className="field-input" placeholder="e.g. United States, Canada" value={formLocations} onChange={e => setFormLocations(e.target.value)} />
                  </div>
                </div>
              </section>

              {/* Placement & bid */}
              <section>
                <div className="section-h">Placement &amp; bid</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Placement</label>
                    <select className="field-input" value={formPlacement} onChange={e => setFormPlacement(e.target.value)}>
                      {PLACEMENTS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Bid strategy</label>
                    <select className="field-input" value={formBid} onChange={e => setFormBid(e.target.value)}>
                      {BIDS.map(b => <option key={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Daily budget</label>
                    <input type="number" className="field-input" value={formBudget} onChange={e => setFormBudget(parseInt(e.target.value || '0', 10))} />
                  </div>
                  <div>
                    <label className="field-label">Frequency cap</label>
                    <input type="number" className="field-input" value={formFrequency} onChange={e => setFormFrequency(parseFloat(e.target.value || '0'))} />
                  </div>
                </div>
              </section>

              {/* Schedule */}
              <section>
                <div className="section-h">Schedule</div>
                <div className="grid grid-cols-2 gap-3">
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
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeAdsetDrawer}>Cancel</button>
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
