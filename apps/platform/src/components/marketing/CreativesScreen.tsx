'use client';
/* CreativesScreen — 1:1 port of upload/marketing_extracted/Marketing/creatives.html
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
const TYPES = ['Image', 'Video', 'Carousel', 'Text'] as const;

interface Creative {
  id: string;
  name: string;
  type: string;
  dimensions: string;
  networks: string[];
  usedIn: number;
  impressions: number;
  ctr: number;
  roas: number;
  status: string;
  headline: string;
  primary: string;
  cta: string;
  url: string;
}

const CREATIVES: Creative[] = [
  { id: 'CR-001', name: 'Fall hero — 1x1', type: 'Image', dimensions: '1080x1080', networks: ['Meta'], usedIn: 2, impressions: 842000, ctr: 2.1, roas: 4.26, status: 'Live', headline: 'Meet the fall capsule', primary: 'A considered collection built around what you asked for.', cta: 'Shop now', url: 'https://unsaid.app/fall' },
  { id: 'CR-002', name: 'Fall hero — 4x5', type: 'Image', dimensions: '1080x1350', networks: ['Meta', 'Pinterest'], usedIn: 1, impressions: 412000, ctr: 1.8, roas: 3.94, status: 'Live', headline: 'Meet the fall capsule', primary: 'A considered collection built around what you asked for.', cta: 'Shop now', url: 'https://unsaid.app/fall' },
  { id: 'CR-003', name: 'TikTok drop — vertical', type: 'Video', dimensions: '1080x1920 · 15s', networks: ['TikTok'], usedIn: 1, impressions: 1860000, ctr: 3.4, roas: 3.06, status: 'Live', headline: 'Behind the drop', primary: 'A 15s look at how the capsule came together.', cta: 'Learn more', url: 'https://unsaid.app/drop' },
  { id: 'CR-004', name: 'Search text — brand', type: 'Text', dimensions: '1200x628', networks: ['Google'], usedIn: 1, impressions: 94000, ctr: 5.2, roas: 4.02, status: 'Live', headline: 'Unsaid — official site', primary: 'Free shipping on orders over $50.', cta: 'Learn more', url: 'https://unsaid.app' },
  { id: 'CR-005', name: 'Holiday capsule teaser', type: 'Video', dimensions: '1080x1080 · 6s', networks: ['Meta'], usedIn: 0, impressions: 0, ctr: 0, roas: 0, status: 'In review', headline: 'Something cozy is coming', primary: 'A sneak peek before launch.', cta: 'Learn more', url: 'https://unsaid.app/holiday' },
  { id: 'CR-006', name: 'Summer CTA', type: 'Image', dimensions: '1080x1080', networks: ['Meta'], usedIn: 1, impressions: 1240000, ctr: 1.9, roas: 3.08, status: 'Archived', headline: 'Last chance', primary: 'Summer clearance — final week.', cta: 'Shop now', url: 'https://unsaid.app/summer' },
  { id: 'CR-007', name: 'Summer carousel', type: 'Carousel', dimensions: '1080x1080 x3', networks: ['Meta'], usedIn: 1, impressions: 682000, ctr: 1.6, roas: 2.84, status: 'Archived', headline: 'Three looks, one story', primary: 'Swipe through the summer edit.', cta: 'Shop now', url: 'https://unsaid.app/summer' },
  { id: 'CR-008', name: 'Evergreen tote', type: 'Image', dimensions: '1080x1350', networks: ['Pinterest'], usedIn: 0, impressions: 0, ctr: 0, roas: 0, status: 'Draft', headline: 'The everyday tote', primary: 'Canvas, ready for anything.', cta: 'Shop now', url: 'https://unsaid.app/tote' },
];

/* ─── helpers (from HTML <script>) ─── */
function pillFor(status: string) {
  const cls = status === 'Live' ? 'live' : status === 'In review' ? 'review' : status === 'Draft' ? 'draft' : status === 'Rejected' ? 'rejected' : 'archived';
  return <span className={`stat ${cls}`}>{status}</span>;
}
function netChip(n: string) {
  return <span className={`net-chip net-${n}`}>{n}</span>;
}
function iconFor(type: string) {
  return type === 'Video' ? 'movie' : type === 'Carousel' ? 'view_carousel' : type === 'Text' ? 'text_fields' : 'image';
}

export default function CreativesScreen({ onToast }: MarketingScreenProps) {
  /* ─── state (mirrors HTML's `filters`, `editing`, `peekId`, etc.) ─── */
  const [items, setItems] = useState<Creative[]>(CREATIVES);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All');
  const [types, setTypes] = useState<Set<string>>(new Set(TYPES as readonly string[]));
  const [networks, setNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [popTypeOpen, setPopTypeOpen] = useState(false);
  const [popNetworkOpen, setPopNetworkOpen] = useState(false);
  const [draftTypes, setDraftTypes] = useState<Set<string>>(new Set(TYPES as readonly string[]));
  const [draftNetworks, setDraftNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));

  // drawer form state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('Image');
  const [formStatus, setFormStatus] = useState('Draft');
  const [formDimensions, setFormDimensions] = useState('');
  const [formHeadline, setFormHeadline] = useState('');
  const [formPrimary, setFormPrimary] = useState('');
  const [formCta, setFormCta] = useState('Shop now');
  const [formUrl, setFormUrl] = useState('');
  const [formNetworks, setFormNetworks] = useState<Set<string>>(new Set(['Meta', 'TikTok']));
  const [assetFileName, setAssetFileName] = useState('');

  // preview modal
  const [previewCreative, setPreviewCreative] = useState<Creative | null>(null);

  /* ─── derived (mirrors renderTable) ─── */
  const rows = useMemo(() => items.filter(c => {
    const ql = q.toLowerCase();
    const qOK = !ql || (c.id + ' ' + c.name + ' ' + c.type + ' ' + c.networks.join(' ')).toLowerCase().includes(ql);
    const tabOK = tab === 'All' || c.status === tab;
    const typeOK = types.has(c.type);
    const netOK = c.networks.some(n => networks.has(n));
    return qOK && tabOK && typeOK && netOK;
  }), [items, q, tab, types, networks]);

  // KPI stats (mirrors syncCounts)
  const liveCreatives = items.filter(c => c.status === 'Live');
  const avgCtr = liveCreatives.length ? liveCreatives.reduce((s, c) => s + c.ctr, 0) / liveCreatives.length : 0;
  const best = [...liveCreatives].sort((a, b) => b.ctr - a.ctr)[0] || null;

  const filtersActive = !!q || tab !== 'All' || types.size !== TYPES.length || networks.size !== NETWORKS.length;
  const allChecked = rows.length > 0 && rows.every(c => selected.has(c.id));
  const someChecked = rows.some(c => selected.has(c.id));

  /* ─── handlers ─── */
  function openPeek(id: string) { setPeekId(id); setRowMenuForId(null); }
  function closePeek() { setPeekId(null); }

  function openCreativeDrawer(id: string | null) {
    const editing = id ? items.find(c => c.id === id) : null;
    setEditingId(id);
    setFormName(editing ? editing.name : '');
    setFormType(editing ? editing.type : 'Image');
    setFormStatus(editing ? editing.status : 'Draft');
    setFormDimensions(editing ? editing.dimensions : '');
    setFormHeadline(editing ? editing.headline : '');
    setFormPrimary(editing ? editing.primary : '');
    setFormCta(editing ? editing.cta : 'Shop now');
    setFormUrl(editing ? editing.url : '');
    setFormNetworks(editing ? new Set(editing.networks) : new Set(['Meta', 'TikTok']));
    setAssetFileName('');
    setDrawerOpen(true);
    setPeekId(null);
    setRowMenuForId(null);
  }
  function closeCreativeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
  }

  function collectCreative(): Creative | null {
    const name = formName.trim();
    if (!name) { onToast('Creative name is required'); return null; }
    const editing = editingId ? items.find(c => c.id === editingId) : null;
    return {
      id: editing ? editing.id : 'CR-' + String(items.length + 1).padStart(3, '0'),
      name,
      type: formType,
      dimensions: formDimensions || '—',
      networks: [...formNetworks],
      usedIn: editing ? editing.usedIn : 0,
      impressions: editing ? editing.impressions : 0,
      ctr: editing ? editing.ctr : 0,
      roas: editing ? editing.roas : 0,
      status: formStatus,
      headline: formHeadline,
      primary: formPrimary,
      cta: formCta,
      url: formUrl,
    };
  }
  function save() {
    const c = collectCreative(); if (!c) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = c; return n; } return prev; }
      return [c, ...prev];
    });
    closeCreativeDrawer();
    onToast(editingId ? 'Creative updated' : 'Creative created');
  }
  function saveAndNew() {
    const c = collectCreative(); if (!c) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = c; return n; } return prev; }
      return [c, ...prev];
    });
    setEditingId(null);
    setFormName('');
    setFormHeadline('');
    setFormPrimary('');
    setFormUrl('');
    setFormDimensions('');
    onToast('Saved. New creative form ready.');
  }

  function nextId() { return 'CR-' + String(items.length + 1).padStart(3, '0'); }
  function duplicateCreative(c: Creative): Creative {
    return { ...c, id: nextId(), name: c.name + ' (copy)', status: 'Draft', usedIn: 0, impressions: 0, ctr: 0, roas: 0 };
  }

  function rowAction(act: string, c: Creative) {
    setRowMenuForId(null);
    switch (act) {
      case 'edit': openCreativeDrawer(c.id); break;
      case 'view': openPeek(c.id); break;
      case 'duplicate':
        setItems(prev => [duplicateCreative(c), ...prev]);
        onToast(`Duplicated: ${c.name}`);
        break;
      case 'publish': setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'In review' } : x)); onToast(`Submitted: ${c.name}`); break;
      case 'archive': setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Archived' } : x)); onToast(`Archived: ${c.name}`); break;
      case 'delete':
        if (confirm(`Delete creative "${c.name}"?`)) {
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
    if (act === 'publish') { setItems(prev => prev.map(c => sel.includes(c.id) ? { ...c, status: 'In review' } : c)); onToast(`Submitted ${n} creative(s)`); }
    else if (act === 'archive') { setItems(prev => prev.map(c => sel.includes(c.id) ? { ...c, status: 'Archived' } : c)); onToast(`Archived ${n} creative(s)`); }
    else if (act === 'duplicate') {
      setItems(prev => {
        const copies: Creative[] = [];
        for (const id of sel) {
          const c = prev.find(x => x.id === id);
          if (c) copies.push({ ...c, id: 'CR-' + String(prev.length + copies.length + 1).padStart(3, '0'), name: c.name + ' (copy)', status: 'Draft', usedIn: 0, impressions: 0, ctr: 0, roas: 0 });
        }
        return [...copies, ...prev];
      });
      onToast(`Duplicated ${n} creative(s)`);
    }
    else if (act === 'delete') {
      if (confirm(`Delete ${n} creative(s)?`)) {
        setItems(prev => prev.filter(c => !sel.includes(c.id)));
        onToast(`Deleted ${n} creative(s)`);
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
  function toggleFormNetwork(n: string) {
    setFormNetworks(prev => { const next = new Set(prev); if (next.has(n)) next.delete(n); else next.add(n); return next; });
  }
  function clearAllFilters() {
    setQ(''); setTab('All');
    setTypes(new Set(TYPES as readonly string[]));
    setNetworks(new Set(NETWORKS as readonly string[]));
    setDraftTypes(new Set(TYPES as readonly string[]));
    setDraftNetworks(new Set(NETWORKS as readonly string[]));
  }

  function handleExport() {
    exportToCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'id', label: 'Creative ID' }, { key: 'name', label: 'Name' }, { key: 'type', label: 'Type' },
      { key: 'dimensions', label: 'Dimensions' }, { key: 'networks', label: 'Networks' }, { key: 'usedIn', label: 'Used in' },
      { key: 'impressions', label: 'Impressions' }, { key: 'ctr', label: 'CTR' }, { key: 'roas', label: 'ROAS' },
      { key: 'status', label: 'Status' }, { key: 'headline', label: 'Headline' }, { key: 'cta', label: 'CTA' }, { key: 'url', label: 'URL' },
    ], 'creatives');
    onToast(`Exported ${rows.length} creatives`);
  }

  const peek = peekId ? items.find(c => c.id === peekId) : null;

  return (
    <main className="px-6 pb-12">

      {/* ─── BREADCRUMB ─── */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Advertising</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Creatives</span>
      </div>

      {/* ─── PAGE HEADER ─── */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Creatives</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Every ad creative across campaigns — images, videos, carousels, and text assets.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Customize panel — Data / Visual tabs')}>
            <span className="material-symbols-outlined text-[16px]">tune</span>Customize
          </button>
          <div className="flex">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" onClick={() => openCreativeDrawer(null)}>
              <span className="material-symbols-outlined text-[16px]">add</span>New creative
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
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total creatives</div>
          <div className="text-headline-sm mt-1 tabular-nums">{items.length}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Across all campaigns</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Live in ads</div>
          <div className="text-headline-sm mt-1 tabular-nums text-secondary">{liveCreatives.length}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Currently delivering</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Avg. CTR</div>
          <div className="text-headline-sm mt-1 tabular-nums">{avgCtr.toFixed(2)}%</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Across live creatives</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Best performer</div>
          <div className="text-headline-sm mt-1 tabular-nums">{best ? best.ctr.toFixed(1) + '%' : '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">{best ? best.name : '—'}</div>
        </div>
      </div>

      {/* ─── LIST CARD ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">

        {/* Status tabs */}
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          {['All', 'Live', 'In review', 'Draft', 'Rejected', 'Archived'].map(t => (
            <button key={t} className={`h-full px-3 text-label-md tab-underline ${tab === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => { setTab(t); setSelected(new Set()); }}>{t}</button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter creatives…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {/* Type popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopTypeOpen(v => !v); setPopNetworkOpen(false); }}>
              <span className="material-symbols-outlined text-[14px]">category</span>Type
            </button>
            {popTypeOpen && (
              <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Filter by type</div>
                {TYPES.map(t => (
                  <label key={t} className="flex items-center gap-2 px-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftTypes.has(t)} onChange={() => { const next = new Set(draftTypes); if (next.has(t)) next.delete(t); else next.add(t); setDraftTypes(next); }} />{t}
                  </label>
                ))}
                <div className="sep"></div>
                <div className="flex justify-end gap-2 px-2 py-1">
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => setDraftTypes(new Set(TYPES as readonly string[]))}>Clear</button>
                  <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container" onClick={() => { setTypes(new Set(draftTypes)); setPopTypeOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          {/* Network popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopNetworkOpen(v => !v); setPopTypeOpen(false); }}>
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
            <button onClick={() => bulkAction('publish')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">publish</span>Publish</button>
            <button onClick={() => bulkAction('archive')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">archive</span>Archive</button>
            <button onClick={() => bulkAction('duplicate')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">content_copy</span>Duplicate</button>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('delete')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
            <button className="ml-auto" onClick={() => bulkAction('close')}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>
        )}

        {/* Table / Empty state */}
        {rows.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px] text-outline">perm_media</span>
            </div>
            <h3 className="text-headline-sm mb-1">No creatives match</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Clear filters or upload a new creative.</p>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={clearAllFilters}>Clear filters</button>
          </div>
        ) : (
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} /></th>
                <th className="px-3 py-2 w-14">Preview</th>
                <th className="px-3 py-2">Creative</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Networks</th>
                <th className="px-3 py-2">Used in</th>
                <th className="px-3 py-2 text-right">Impressions</th>
                <th className="px-3 py-2 text-right">CTR</th>
                <th className="px-3 py-2 text-right">ROAS</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {rows.map(c => (
                <tr key={c.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openPeek(c.id)}>
                  <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={selected.has(c.id)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(c.id)} /></td>
                  <td className="px-3 py-2"><div className={`thumb ${c.type.toLowerCase()}`}><span className="material-symbols-outlined">{iconFor(c.type)}</span></div></td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{c.id} · {c.dimensions}</div>
                  </td>
                  <td className="px-3 py-2">{c.type}</td>
                  <td className="px-3 py-2"><div className="flex items-center gap-1 flex-wrap">{c.networks.map(n => <span key={n} className={`net-chip net-${n}`}>{n}</span>)}</div></td>
                  <td className="px-3 py-2 tabular-nums">{c.usedIn} campaign{c.usedIn === 1 ? '' : 's'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.impressions.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.ctr ? c.ctr.toFixed(1) + '%' : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.roas ? c.roas.toFixed(2) + '×' : '—'}</td>
                  <td className="px-3 py-2">{pillFor(c.status)}</td>
                  <td className="px-2 py-2 text-right relative">
                    <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === c.id ? null : c.id); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button>
                    {rowMenuForId === c.id && (
                      <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                        <div className="menu-header">This creative</div>
                        <button onClick={() => rowAction('edit', c)}><span className="material-symbols-outlined">edit</span>Edit creative</button>
                        <button onClick={() => rowAction('view', c)}><span className="material-symbols-outlined">visibility</span>View details</button>
                        <button onClick={() => rowAction('duplicate', c)}><span className="material-symbols-outlined">content_copy</span>Duplicate</button>
                        <div className="sep"></div>
                        <div className="menu-header">Status</div>
                        <button onClick={() => rowAction('publish', c)}><span className="material-symbols-outlined">publish</span>Publish</button>
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
          <button onClick={() => { setCreateMenuOpen(false); openCreativeDrawer(null); }}><span className="material-symbols-outlined">perm_media</span>Creative</button>
          <button onClick={() => { setCreateMenuOpen(false); onToast('Create campaign — will route to that dedicated page'); }}><span className="material-symbols-outlined">campaign</span>Campaign</button>
          <button onClick={() => { setCreateMenuOpen(false); onToast('Create adset — will route to that dedicated page'); }}><span className="material-symbols-outlined">tune</span>Ad set</button>
          <button onClick={() => { setCreateMenuOpen(false); onToast('Create audience — will route to that dedicated page'); }}><span className="material-symbols-outlined">groups</span>Audience</button>
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
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">perm_media</span>
                <span className="text-headline-sm truncate">{peek.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => { const id = peek.id; closePeek(); openCreativeDrawer(id); }}><span className="material-symbols-outlined text-[14px]">edit</span>Edit</button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={closePeek}><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-body-sm">
              <div className="mb-3 flex items-center gap-2">{pillFor(peek.status)}{peek.networks.map(n => <span key={n} className={`net-chip net-${n}`}>{n}</span>)}</div>
              <div className="creative-preview mb-3" style={{ background: 'linear-gradient(135deg, #0077c5, #1f2937)' }}>
                <span className="material-symbols-outlined">{iconFor(peek.type)}</span>
                <span className="badge">{peek.type} · {peek.dimensions}</span>
              </div>
              <div className="bg-surface-container-low rounded-lg p-3 mb-3 grid grid-cols-3 gap-2 text-center">
                <div><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Impressions</div><div className="text-body-md font-semibold tabular-nums">{peek.impressions.toLocaleString()}</div></div>
                <div><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">CTR</div><div className="text-body-md font-semibold tabular-nums">{peek.ctr ? peek.ctr.toFixed(1) + '%' : '—'}</div></div>
                <div><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">ROAS</div><div className="text-body-md font-semibold tabular-nums">{peek.roas ? peek.roas.toFixed(2) + '×' : '—'}</div></div>
              </div>
              <dl className="text-body-sm">
                <div className="kv"><dt>Creative ID</dt><dd className="code-mono">{peek.id}</dd></div>
                <div className="kv"><dt>Type</dt><dd>{peek.type}</dd></div>
                <div className="kv"><dt>Dimensions</dt><dd>{peek.dimensions}</dd></div>
                <div className="kv"><dt>Used in</dt><dd>{peek.usedIn} campaign(s)</dd></div>
                <div className="kv"><dt>Headline</dt><dd>{peek.headline}</dd></div>
                <div className="kv"><dt>CTA</dt><dd>{peek.cta}</dd></div>
              </dl>
              <div className="mt-4 pt-3 border-t border-surface-dim">
                <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-1">Primary text</div>
                <div className="text-body-sm whitespace-pre-wrap">{peek.primary}</div>
              </div>
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => { const id = peek.id; closePeek(); openCreativeDrawer(id); }}><span className="material-symbols-outlined text-[16px]">edit</span>Edit</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => setPreviewCreative(peek)}><span className="material-symbols-outlined text-[16px]">visibility</span>Preview</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('duplicate', peek)}><span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('archive', peek)}><span className="material-symbols-outlined text-[16px]">archive</span>Archive</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Creative drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={closeCreativeDrawer} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">perm_media</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">{editingId ? 'Edit creative' : 'New creative'}</div>
                  <div className="text-[11px] text-on-surface-variant">{editingId ? (() => { const e = items.find(c => c.id === editingId); return e ? `${e.status} · ${e.id}` : ''; })() : 'Draft · not yet live'}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeCreativeDrawer}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Basics */}
              <section>
                <div className="section-h">Creative basics</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Creative name</label>
                    <input className="field-input" placeholder="e.g. Fall hero — 1x1" value={formName} onChange={e => setFormName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Type</label>
                      <select className="field-input" value={formType} onChange={e => setFormType(e.target.value)}>
                        <option>Image</option><option>Video</option><option>Carousel</option><option>Text</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Status</label>
                      <select className="field-input" value={formStatus} onChange={e => setFormStatus(e.target.value)}>
                        <option>Draft</option><option>In review</option><option>Live</option><option>Rejected</option><option>Archived</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Dimensions</label>
                    <input className="field-input" placeholder="e.g. 1080x1080" value={formDimensions} onChange={e => setFormDimensions(e.target.value)} />
                  </div>
                </div>
              </section>

              {/* Asset */}
              <section>
                <div className="section-h">Asset</div>
                <label className="file-zone block" onClick={e => { e.preventDefault(); document.getElementById('assetInput')?.click(); }}>
                  <span className="material-symbols-outlined">cloud_upload</span>
                  <div className="text-[12px] font-semibold text-primary mt-1">Upload or replace asset</div>
                  <div className="text-[10px] text-on-surface-variant mt-1">Images (JPG, PNG, WEBP), videos (MP4) · max 500 MB</div>
                  <input type="file" id="assetInput" hidden accept="image/*,video/*" onChange={e => { const f = e.target.files?.[0]; if (f) setAssetFileName(`Selected: ${f.name} (${(f.size / 1024).toFixed(0)} KB)`); }} />
                </label>
                <div className="mt-2 text-[11px] text-on-surface-variant">{assetFileName}</div>
              </section>

              {/* Copy */}
              <section>
                <div className="section-h">Copy</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Headline</label>
                    <input className="field-input" placeholder="e.g. Meet the fall capsule" value={formHeadline} onChange={e => setFormHeadline(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Primary text</label>
                    <textarea className="field-textarea" placeholder="The main copy shown above your image" value={formPrimary} onChange={e => setFormPrimary(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Call to action</label>
                      <select className="field-input" value={formCta} onChange={e => setFormCta(e.target.value)}>
                        <option>Shop now</option><option>Learn more</option><option>Sign up</option><option>Get offer</option><option>Download</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Destination URL</label>
                      <input className="field-input" placeholder="https://unsaid.app/fall" value={formUrl} onChange={e => setFormUrl(e.target.value)} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Networks */}
              <section>
                <div className="section-h">Allowed networks</div>
                <div className="grid grid-cols-2 gap-2">
                  {NETWORKS.map(n => (
                    <label key={n} className="flex items-center justify-between p-2 rounded border border-surface-dim">
                      <span className="text-body-sm">{n} Ads</span>
                      <input type="checkbox" className="row-check" checked={formNetworks.has(n)} onChange={() => toggleFormNetwork(n)} />
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeCreativeDrawer}>Cancel</button>
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

      {/* Preview modal */}
      {previewCreative && (
        <div className="modal-scrim open" onClick={() => setPreviewCreative(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-headline-sm">Creative preview</h3>
              <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setPreviewCreative(null)}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
            <div className="creative-preview">
              <span className="material-symbols-outlined">{iconFor(previewCreative.type)}</span>
              <span className="badge">{previewCreative.type} · {previewCreative.dimensions}</span>
            </div>
            <div className="mt-3 space-y-2 text-body-sm">
              <div><span className="text-on-surface-variant font-semibold text-[11px] uppercase tracking-wider">Headline</span><div className="mt-0.5 font-medium">{previewCreative.headline || '—'}</div></div>
              <div><span className="text-on-surface-variant font-semibold text-[11px] uppercase tracking-wider">Primary text</span><div className="mt-0.5">{previewCreative.primary || '—'}</div></div>
              <div><span className="text-on-surface-variant font-semibold text-[11px] uppercase tracking-wider">CTA</span><div className="mt-0.5">{previewCreative.cta || '—'}</div></div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
