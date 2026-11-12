'use client';
/* PromotionsScreen — 1:1 port of upload/marketing_extracted/Marketing/promotions and discounts.html
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
const TYPES = ['Percentage', 'Fixed', 'Free shipping', 'BOGO'] as const;
const TABS = ['All', 'Active', 'Scheduled', 'Expired', 'Paused', 'Draft'] as const;

interface DiscountTarget {
  kind: string;
  label: string;
}

interface Discount {
  id: string;
  code: string;
  title: string;
  type: string;
  value: string;
  used: number;
  limit: number | null;
  window: string;
  start: string;
  end: string | null;
  status: string;
  targets: DiscountTarget[];
  scope: string;
  perCustomer?: number | null;
  combinable?: boolean;
}

const INITIAL_DISCOUNTS: Discount[] = [
  { id: 'd1', code: 'FALL26', title: 'Fall launch — 15% sitewide', type: 'Percentage', value: '15%', used: 742, limit: 2000, window: '2026-10-01 → 2026-11-30', start: '2026-10-01T00:00', end: '2026-11-30T23:59', status: 'Active', targets: [{ kind: 'all', label: 'All products' }], scope: 'Entire order' },
  { id: 'd2', code: 'WELCOME10', title: 'New customer welcome', type: 'Percentage', value: '10%', used: 318, limit: null, window: 'Evergreen', start: '2026-01-01T00:00', end: null, status: 'Active', targets: [{ kind: 'customers', label: 'New customers' }], scope: 'Entire order' },
  { id: 'd3', code: 'SHIPFREE', title: 'Free shipping over $50', type: 'Free shipping', value: '—', used: 562, limit: null, window: 'Evergreen', start: '2026-02-15T00:00', end: null, status: 'Active', targets: [{ kind: 'all', label: 'All products' }], scope: 'Shipping' },
  { id: 'd4', code: 'BOGOTEE', title: 'Buy 2 tees, get 1 free', type: 'BOGO', value: 'Buy 2 get 1', used: 74, limit: 500, window: '2026-11-01 → 2026-11-15', start: '2026-11-01T00:00', end: '2026-11-15T23:59', status: 'Scheduled', targets: [{ kind: 'collection', label: 'Core Essentials' }], scope: 'Specific items' },
  { id: 'd5', code: 'HOLIDAY5', title: 'Holiday capsule $5 off', type: 'Fixed', value: '$5.00', used: 41, limit: 300, window: '2026-10-20 → 2026-10-31', start: '2026-10-20T00:00', end: '2026-10-31T23:59', status: 'Expired', targets: [{ kind: 'collection', label: 'Holiday Capsule' }], scope: 'Specific items' },
  { id: 'd6', code: 'PAUSED10', title: 'Paused sitewide promo', type: 'Percentage', value: '10%', used: 0, limit: 1000, window: '2026-11-01 → 2026-12-01', start: '2026-11-01T00:00', end: '2026-12-01T23:59', status: 'Paused', targets: [{ kind: 'all', label: 'All products' }], scope: 'Entire order' },
];

interface TargetItem {
  id: string;
  label: string;
  meta: string;
}

const TARGET_DATA: Record<string, TargetItem[]> = {
  all: [{ id: 'all', label: 'All products', meta: 'Sitewide' }],
  collections: [
    { id: 'COL-FALL', label: 'Fall 2026 Drop', meta: '12 products' },
    { id: 'COL-HOLIDAY', label: 'Holiday Capsule', meta: '8 products' },
    { id: 'COL-CORE', label: 'Core Essentials', meta: '22 products' },
  ],
  products: [
    { id: 'TEE-001', label: 'Classic Tee', meta: 'TEE-001 · $24.00' },
    { id: 'TOTE-014', label: 'Canvas Tote', meta: 'TOTE-014 · $18.00' },
    { id: 'MUG-003', label: 'Mug 11oz', meta: 'MUG-003 · $14.00' },
  ],
  customers: [
    { id: 'CUS-NEW', label: 'New customers', meta: 'First order' },
    { id: 'CUS-VIP', label: 'VIP segment', meta: 'LTV > $500' },
    { id: 'CUS-RISK', label: 'At-risk segment', meta: 'No order in 90d' },
  ],
};

const STATUS_PILL_CLASS: Record<string, string> = {
  Active: 'bg-secondary-container text-on-secondary-container',
  Scheduled: 'bg-tertiary/15 text-tertiary',
  Expired: 'bg-surface-container text-on-surface-variant',
  Paused: 'bg-qb-maroon/15 text-qb-maroon',
  Draft: 'bg-surface-container text-on-surface-variant',
};

const TARGET_KIND_ICON: Record<string, string> = {
  all: 'select_all',
  collection: 'collections_bookmark',
  collections: 'collections_bookmark',
  product: 'checkroom',
  products: 'checkroom',
  customers: 'groups',
};

/* ─── helpers (from HTML <script>) ─── */
function StatusPill({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-label-sm ${STATUS_PILL_CLASS[status] || 'bg-surface-container text-on-surface-variant'}`}>{status}</span>
  );
}

function TargetChip({ t }: { t: DiscountTarget }) {
  const icon = TARGET_KIND_ICON[t.kind] || 'sell';
  return (
    <span className="target-chip">
      <span className="material-symbols-outlined">{icon}</span>
      {t.label}
    </span>
  );
}

const EMPTY_TARGET: DiscountTarget = { kind: 'all', label: 'All products' };

export default function PromotionsScreen({ onToast, onNavigate }: MarketingScreenProps) {
  /* ─── state (mirrors HTML's `filters`, `editing`, `peekId`, etc.) ─── */
  const [items, setItems] = useState<Discount[]>(INITIAL_DISCOUNTS);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<string>('All');
  const [types, setTypes] = useState<Set<string>>(new Set(TYPES as readonly string[]));
  const [draftTypes, setDraftTypes] = useState<Set<string>>(new Set(TYPES as readonly string[]));
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [popTypeOpen, setPopTypeOpen] = useState(false);

  // drawer form state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentType, setCurrentType] = useState<string>('Percentage');
  const [fCode, setFCode] = useState('');
  const [fTitle, setFTitle] = useState('');
  const [fValue, setFValue] = useState('15');
  const [fFixed, setFFixed] = useState('10.00');
  const [fScope, setFScope] = useState('Entire order');
  const [fFixedScope, setFFixedScope] = useState('Entire order');
  const [fBogoBuy, setFBogoBuy] = useState('2');
  const [fBogoGet, setFBogoGet] = useState('1');
  const [fBogoDiscount, setFBogoDiscount] = useState('Free');
  const [fShipRate, setFShipRate] = useState('All shipping rates');
  const [fShipExcluded, setFShipExcluded] = useState('');
  const [fMinType, setFMinType] = useState('none');
  const [fMinValue, setFMinValue] = useState('');
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [fLimit, setFLimit] = useState('');
  const [fPerCustomer, setFPerCustomer] = useState('');
  const [fCombinable, setFCombinable] = useState(false);
  const [pickedTargets, setPickedTargets] = useState<DiscountTarget[]>([EMPTY_TARGET]);

  // target picker modal
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [activeTargetKind, setActiveTargetKind] = useState<string | null>(null);
  const [targetSearch, setTargetSearch] = useState('');
  const [targetDraft, setTargetDraft] = useState<Set<string>>(new Set());

  /* ─── derived (mirrors filteredDiscounts/renderDiscounts) ─── */
  const rows = useMemo(() => items.filter(d => {
    const ql = q.toLowerCase();
    const qOK = !ql || (d.code + ' ' + d.title + ' ' + d.type).toLowerCase().includes(ql);
    const tabOK = tab === 'All' || d.status === tab;
    const typeOK = types.has(d.type);
    const dateOK = (!dateFrom || d.start >= dateFrom) && (!dateTo || (d.end && d.end <= dateTo + 'T23:59'));
    return qOK && tabOK && typeOK && dateOK;
  }), [items, q, tab, types, dateFrom, dateTo]);

  const activeCount = items.filter(d => d.status === 'Active').length;
  const filtersActive = !!q || tab !== 'All' || types.size !== TYPES.length || !!dateFrom || !!dateTo;
  const allChecked = rows.length > 0 && rows.every(d => selected.has(d.id));
  const someChecked = rows.some(d => selected.has(d.id));

  /* ─── handlers ─── */
  function openPeek(id: string) { setPeekId(id); setRowMenuForId(null); }
  function closePeek() { setPeekId(null); }

  function openDiscountDrawer(id: string | null) {
    const editing = id ? items.find(d => d.id === id) : null;
    setEditingId(id);
    setCurrentType(editing ? editing.type : 'Percentage');
    setFCode(editing ? editing.code : '');
    setFTitle(editing ? editing.title : '');
    setFValue(editing ? editing.value.replace('%', '') : '15');
    setFFixed(editing && editing.type === 'Fixed' ? editing.value.replace('$', '') : '10.00');
    setFScope(editing ? editing.scope || 'Entire order' : 'Entire order');
    setFFixedScope(editing ? editing.scope || 'Entire order' : 'Entire order');
    setFMinType('none');
    setFMinValue('');
    setFStart(editing ? editing.start : new Date().toISOString().slice(0, 16));
    setFEnd(editing && editing.end ? editing.end : '');
    setFLimit(editing && editing.limit ? String(editing.limit) : '');
    setFPerCustomer(editing && editing.perCustomer ? String(editing.perCustomer) : '');
    setFCombinable(editing ? !!editing.combinable : false);
    setPickedTargets(editing ? [...editing.targets] : [EMPTY_TARGET]);
    setDrawerOpen(true);
    setPeekId(null);
    setRowMenuForId(null);
    setCreateMenuOpen(false);
  }

  function closeDiscountDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
  }

  function syncTypeUI(t: string) { setCurrentType(t); }

  function openTargetModal(kind: string) {
    setActiveTargetKind(kind);
    setTargetSearch('');
    setTargetDraft(new Set());
    setTargetModalOpen(true);
  }

  function confirmTargets() {
    if (!activeTargetKind) return;
    const kindMap: Record<string, string> = { all: 'all', collections: 'collection', products: 'product', customers: 'customers' };
    const data = TARGET_DATA[activeTargetKind] || [];
    const picks = data
      .filter(it => targetDraft.has(it.id))
      .map(it => ({ kind: kindMap[activeTargetKind], label: it.label }));
    if (!picks.length) { onToast('Pick at least one'); return; }
    const kinds = new Set(picks.map(p => p.kind));
    setPickedTargets(prev => prev.filter(t => !kinds.has(t.kind)).concat(picks));
    setTargetModalOpen(false);
  }

  function removePickedTarget(idx: number) {
    setPickedTargets(prev => prev.filter((_, i) => i !== idx));
  }

  function generateCode() {
    const codes = ['SAVE', 'DEAL', 'PROMO', 'VIP', 'LAUNCH', 'DROP'];
    const c = codes[Math.floor(Math.random() * codes.length)];
    const n = Math.floor(10 + Math.random() * 90);
    const y = new Date().getFullYear().toString().slice(-2);
    setFCode(c + n + y);
  }

  function collectDiscount(): Discount | null {
    const code = fCode.trim();
    const title = fTitle.trim();
    if (!code) { onToast('Code is required'); return null; }
    if (!title) { onToast('Title is required'); return null; }
    const value =
      currentType === 'Percentage' ? fValue + '%'
      : currentType === 'Fixed' ? '$' + fFixed
      : currentType === 'Free shipping' ? '—'
      : 'Buy ' + fBogoBuy + ' get ' + fBogoGet;
    const scope =
      currentType === 'Percentage' ? fScope
      : currentType === 'Fixed' ? fFixedScope
      : currentType === 'Free shipping' ? 'Shipping'
      : 'Specific items';
    const limit = fLimit ? parseInt(fLimit, 10) : null;
    const start = fStart;
    const end = fEnd || null;
    const editing = editingId ? items.find(d => d.id === editingId) : null;
    return {
      id: editing ? editing.id : 'd' + Date.now(),
      code, title, type: currentType, value, scope,
      used: editing ? editing.used : 0, limit,
      window: `${start.slice(0, 10)} → ${end ? end.slice(0, 10) : 'Evergreen'}`,
      start, end,
      status: editing ? editing.status : 'Active',
      targets: pickedTargets.length ? pickedTargets : [EMPTY_TARGET],
      perCustomer: fPerCustomer ? parseInt(fPerCustomer, 10) : null,
      combinable: fCombinable,
    };
  }

  function save() {
    const d = collectDiscount(); if (!d) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = d; return n; } return prev; }
      return [d, ...prev];
    });
    closeDiscountDrawer();
    onToast(editingId ? 'Discount updated' : 'Discount created');
  }
  function saveAndNew() {
    const d = collectDiscount(); if (!d) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = d; return n; } return prev; }
      return [d, ...prev];
    });
    setEditingId(null);
    setFCode(''); setFTitle('');
    setPickedTargets([EMPTY_TARGET]);
    onToast('Saved. New discount form ready.');
  }

  function rowAction(act: string, d: Discount) {
    setRowMenuForId(null);
    switch (act) {
      case 'edit': openDiscountDrawer(d.id); break;
      case 'preview': openPeek(d.id); break;
      case 'pause':
        setItems(prev => prev.map(x => x.id === d.id ? { ...x, status: 'Paused' } : x));
        onToast('Paused ' + d.code);
        break;
      case 'expire':
        setItems(prev => prev.map(x => x.id === d.id ? { ...x, status: 'Expired' } : x));
        onToast('Expired ' + d.code);
        break;
      case 'duplicate':
        setItems(prev => [{ ...d, id: 'd' + Date.now(), code: d.code + '_COPY', status: 'Draft', used: 0 }, ...prev]);
        onToast('Duplicated ' + d.code);
        break;
      case 'delete':
        if (confirm('Delete this discount?')) {
          setItems(prev => prev.filter(x => x.id !== d.id));
          onToast('Deleted');
        }
        break;
    }
  }

  function bulkAction(act: string) {
    if (act === 'Clear') { setSelected(new Set()); return; }
    const sel = [...selected];
    const n = sel.length;
    if (n === 0) return;
    if (act === 'Pause') {
      setItems(prev => prev.map(d => sel.includes(d.id) ? { ...d, status: 'Paused' } : d));
      onToast('Paused ' + n + ' code(s)');
    } else if (act === 'Expire') {
      setItems(prev => prev.map(d => sel.includes(d.id) ? { ...d, status: 'Expired' } : d));
      onToast('Expired ' + n + ' code(s)');
    } else if (act === 'Duplicate') {
      setItems(prev => {
        const copies: Discount[] = sel.map(id => {
          const d = prev.find(x => x.id === id);
          return d ? { ...d, id: 'd' + Date.now() + Math.random().toString(36).slice(2, 6), code: d.code + '_COPY', status: 'Draft', used: 0 } : null;
        }).filter(Boolean) as Discount[];
        return [...copies, ...prev];
      });
      onToast('Duplicated ' + n + ' code(s)');
    } else if (act === 'Delete') {
      if (confirm('Delete ' + n + ' discount code(s)?')) {
        setItems(prev => prev.filter(d => !sel.includes(d.id)));
        onToast('Deleted ' + n + ' code(s)');
      }
    }
    setSelected(new Set());
  }

  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map(d => d.id)));
  }

  function clearAllFilters() {
    setQ(''); setTab('All');
    setTypes(new Set(TYPES as readonly string[]));
    setDraftTypes(new Set(TYPES as readonly string[]));
    setDateFrom(null); setDateTo(null);
  }

  function removeChip(k: string) {
    if (k === 'q') setQ('');
    if (k === 'tab') setTab('All');
    if (k === 'types') { setTypes(new Set(TYPES as readonly string[])); setDraftTypes(new Set(TYPES as readonly string[])); }
    if (k === 'date') { setDateFrom(null); setDateTo(null); }
  }

  function handleExport() {
    exportToCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'id', label: 'ID' }, { key: 'code', label: 'Code' }, { key: 'title', label: 'Title' },
      { key: 'type', label: 'Type' }, { key: 'value', label: 'Value' }, { key: 'scope', label: 'Scope' },
      { key: 'used', label: 'Used' }, { key: 'limit', label: 'Limit' }, { key: 'window', label: 'Window' },
      { key: 'start', label: 'Start' }, { key: 'end', label: 'End' }, { key: 'status', label: 'Status' },
    ], 'promotions');
    onToast('Exported ' + rows.length + ' promotions');
  }

  function applyCreatePreset(label: string) {
    const nextType = label === 'Free shipping' ? 'Free shipping'
      : label === 'BOGO' || label === 'Buy X get Y' ? 'BOGO'
      : label === 'Automatic discount' ? 'Percentage'
      : 'Percentage';
    setCurrentType(nextType);
    openDiscountDrawer(null);
  }

  const peek = peekId ? items.find(d => d.id === peekId) : null;

  /* chip list (mirror of renderChips) */
  const chips: { k: string; label: string }[] = [];
  if (q) chips.push({ k: 'q', label: `Search: "${q}"` });
  if (tab !== 'All') chips.push({ k: 'tab', label: `Tab: ${tab}` });
  if (types.size !== TYPES.length) chips.push({ k: 'types', label: `Type: ${[...types].join(', ') || 'none'}` });
  if (dateFrom || dateTo) chips.push({ k: 'date', label: `Date: ${dateFrom || '…'} → ${dateTo || '…'}` });

  return (
    <main className="px-6 pb-12">

      {/* ─── DOMAIN TABSTRIP (Marketing) ─── */}
      <div className="flex items-center gap-1 mt-4 mb-1 border-b border-surface-dim overflow-x-auto">
        {[
          ['overview', 'Publishing Overview'], ['calendar', 'Calendar'], ['queue', 'Queue'],
          ['create', 'Create Content'], ['library', 'Content Library'], ['channels', 'Connected Channels'],
          ['performance', 'Performance'], ['oversight', 'Oversight'], ['promotions', 'Promotions'],
        ].map(([id, label]) => (
          <button key={id} className={`h-9 px-3 text-label-md tab-underline ${id === 'promotions' ? 'active' : 'text-on-surface-variant'}`} onClick={() => onNavigate ? onNavigate('marketing', id) : onToast('Navigate → ' + id)}>{label}</button>
        ))}
      </div>

      {/* ─── HEADER ─── */}
      <div className="flex items-center justify-between gap-4 py-4">
        <div>
          <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
            <span>Marketing</span><span className="text-outline">/</span><span>Promotions</span>
          </div>
          <h1 className="text-headline-lg">Promotions &amp; Discount Codes</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Create, target, and control promotional discounts. Every code is scoped by target, type, value, and window.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Customize panel — Data / Visual tabs')}>
            <span className="material-symbols-outlined text-[16px]">tune</span>Customize
          </button>
          <div className="flex">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main flex items-center gap-1" onClick={() => openDiscountDrawer(null)}>
              <span className="material-symbols-outlined text-[16px]">add</span>New discount
            </button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={e => { e.stopPropagation(); setCreateMenuOpen(v => !v); }}>
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Active codes</span>
          <div className="text-headline-lg mt-1">{activeCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-1">3 evergreen · 3 limited</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Redemptions (30d)</span>
          <div className="text-headline-lg mt-1">1,842</div>
          <div className="text-[11px] text-secondary mt-1">+18% vs prior period</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Discount given</span>
          <div className="text-headline-lg mt-1">$14,280</div>
          <div className="text-[11px] text-on-surface-variant mt-1">~7.8% of AOV</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Expiring soon</span>
          <div className="text-headline-lg mt-1">2</div>
          <div className="text-[11px] text-error mt-1">within 7 days</div>
        </div>
      </div>

      {/* ─── CREATE ACTIONS ROW ─── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
        {[
          ['Discount code', 'sell', 'Discount code'],
          ['Automatic discount', 'auto_awesome', 'Automatic discount'],
          ['Free shipping', 'local_shipping', 'Free shipping'],
          ['BOGO', 'redeem', 'Buy X get Y'],
        ].map(([key, icon, label]) => (
          <button key={key} className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => applyCreatePreset(label)}>
            <span className="material-symbols-outlined text-[16px]">{icon}</span>{label}
          </button>
        ))}
        <button className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1" onClick={() => onToast('Open global create flyout')}>
          <span className="material-symbols-outlined text-[16px]">apps</span>Show all
        </button>
      </div>

      {/* ─── PROMOTIONS LIST ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">

        {/* View tabs */}
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          {TABS.map(t => (
            <button key={t} className={`h-full px-3 text-label-md tab-underline ${tab === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter by code, type, target…" value={q} onChange={e => setQ(e.target.value)} />
          </div>

          {/* Type popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopTypeOpen(v => !v); }}>
              <span className="material-symbols-outlined text-[14px]">category</span>Type
            </button>
            {popTypeOpen && (
              <div className="popover p-3 w-56" style={{ position: 'absolute', left: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">Filter by type</div>
                {TYPES.map(t => (
                  <label key={t} className="flex items-center gap-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftTypes.has(t)} onChange={() => { const next = new Set(draftTypes); if (next.has(t)) next.delete(t); else next.add(t); setDraftTypes(next); }} />
                    {t === 'Fixed' ? 'Fixed amount' : t === 'BOGO' ? 'Buy X get Y' : t}
                  </label>
                ))}
                <div className="flex justify-end gap-2 mt-3">
                  <button className="h-7 px-2 text-body-sm border border-surface-dim rounded hover:bg-surface-container-low" onClick={() => setDraftTypes(new Set(TYPES as readonly string[]))}>Clear</button>
                  <button className="h-7 px-2 text-body-sm bg-primary text-white rounded hover:bg-primary-container font-semibold" onClick={() => { setTypes(new Set(draftTypes)); setPopTypeOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>

          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => {
            const from = prompt('From (YYYY-MM-DD):', dateFrom || '');
            if (from === null) return;
            const to = prompt('To (YYYY-MM-DD):', dateTo || '');
            if (to === null) return;
            setDateFrom(from || null);
            setDateTo(to || null);
          }}>
            <span className="material-symbols-outlined text-[14px]">calendar_today</span>Date range
          </button>
          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Saved views — coming from the list-system component')}>
            <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views
          </button>
          <span className="ml-auto text-[11px] text-on-surface-variant">{rows.length ? `1–${rows.length} of ${rows.length}` : '0 of 0'}</span>
        </div>

        {/* Active chips */}
        {chips.length > 0 && (
          <div className="px-4 py-1.5 flex items-center gap-2 flex-wrap border-b border-surface-dim">
            <span className="text-[10px] uppercase tracking-wider font-bold text-outline">Active:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {chips.map(c => (
                <span key={c.k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-medium">
                  {c.label}
                  <button className="w-4 h-4 rounded-full hover:bg-surface-container-high flex items-center justify-center" onClick={() => removeChip(c.k)}>
                    <span className="material-symbols-outlined text-[12px]">close</span>
                  </button>
                </span>
              ))}
            </div>
            <button className="ml-auto text-[11px] text-primary hover:underline font-medium" onClick={clearAllFilters}>Clear all</button>
          </div>
        )}

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="bulk-bar show">
            <span className="font-semibold">{selected.size} selected</span>
            <div className="w-px h-4 bg-white/30"></div>
            <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Pause')}><span className="material-symbols-outlined text-[15px]">pause_circle</span>Pause</button>
            <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Expire')}><span className="material-symbols-outlined text-[15px]">event_busy</span>Expire</button>
            <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Duplicate')}><span className="material-symbols-outlined text-[15px]">content_copy</span>Duplicate</button>
            <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Delete')}><span className="material-symbols-outlined text-[15px]">delete</span>Delete</button>
            <button className="ml-auto flex items-center gap-1 hover:underline" onClick={() => bulkAction('Clear')}><span className="material-symbols-outlined text-[15px]">close</span>Clear</button>
          </div>
        )}

        {/* Table or Empty state */}
        {rows.length === 0 ? (
          <div className="py-16 px-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[32px] text-outline">sell</span>
            </div>
            <h3 className="text-headline-sm mb-1">No promotions match your filters</h3>
            <p className="text-body-sm text-on-surface-variant mb-4 max-w-sm mx-auto">Clear filters or create a new discount code.</p>
            <div className="flex items-center justify-center gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={clearAllFilters}>
                <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>Clear filters
              </button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => openDiscountDrawer(null)}>
                <span className="material-symbols-outlined text-[16px]">add</span>New discount
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm min-w-[1100px]">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} /></th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2 text-right">Used / Limit</th>
                  <th className="px-3 py-2">Window</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {rows.map(d => (
                  <tr key={d.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openPeek(d.id)}>
                    <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={selected.has(d.id)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(d.id)} /></td>
                    <td className="px-3 py-2">
                      <span className="code-mono font-medium">{d.code}</span>
                      <div className="text-[11px] text-on-surface-variant truncate max-w-[220px]">{d.title}</div>
                    </td>
                    <td className="px-3 py-2">{d.type}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.value}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{d.limit == null ? `${d.used} / ∞` : `${d.used} / ${d.limit}`}</td>
                    <td className="px-3 py-2 text-[11px]">{d.window}</td>
                    <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{d.targets.map((t, i) => <TargetChip key={i} t={t} />)}</div></td>
                    <td className="px-3 py-2"><StatusPill status={d.status} /></td>
                    <td className="px-2 py-2 text-right relative">
                      <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === d.id ? null : d.id); }}>
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                      {rowMenuForId === d.id && (
                        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 220 }} onClick={e => e.stopPropagation()}>
                          <div className="menu-header">{d.id}</div>
                          <button onClick={() => rowAction('edit', d)}><span className="material-symbols-outlined">edit</span>Edit</button>
                          <button onClick={() => rowAction('preview', d)}><span className="material-symbols-outlined">visibility</span>Preview</button>
                          <div className="sep"></div>
                          <button onClick={() => rowAction('pause', d)}><span className="material-symbols-outlined">pause_circle</span>Pause</button>
                          <button onClick={() => rowAction('expire', d)}><span className="material-symbols-outlined">event_busy</span>Expire</button>
                          <button onClick={() => rowAction('duplicate', d)}><span className="material-symbols-outlined">content_copy</span>Duplicate</button>
                          <div className="sep"></div>
                          <button className="danger" onClick={() => rowAction('delete', d)}><span className="material-symbols-outlined">delete</span>Delete</button>
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
            <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => onToast('Page prev')}><span className="material-symbols-outlined text-[16px]">chevron_left</span></button>
            <span>Page 1 of 1</span>
            <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => onToast('Page next')}><span className="material-symbols-outlined text-[16px]">chevron_right</span></button>
          </div>
        </div>
      </div>

      {/* New discount split menu popover */}
      {createMenuOpen && (
        <div className="popover" style={{ position: 'fixed', minWidth: 260, top: 'auto', bottom: 'auto', right: 'auto', left: 'auto' }} onClick={() => setCreateMenuOpen(false)}>
          <div className="px-3 py-1 text-[10px] text-outline uppercase tracking-wider font-bold">Create</div>
          {[
            ['Discount code', 'sell'],
            ['Automatic discount', 'auto_awesome'],
            ['Free shipping', 'local_shipping'],
            ['Buy X get Y', 'redeem'],
          ].map(([label, icon]) => (
            <button key={label} className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => applyCreatePreset(label)}>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">{icon}</span>{label}
            </button>
          ))}
        </div>
      )}

      {/* Click-away catcher for row menu / popovers */}
      {(rowMenuForId || popTypeOpen || createMenuOpen) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => { setRowMenuForId(null); setPopTypeOpen(false); setCreateMenuOpen(false); }} />
      )}

      {/* Peek drawer */}
      {peek && (
        <>
          <div className="drawer-scrim open" onClick={closePeek} />
          <div className="peek open">
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">sell</span>
                <span className="text-headline-sm truncate">{peek.code}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => { const id = peek.id; closePeek(); openDiscountDrawer(id); }}>
                  <span className="material-symbols-outlined text-[14px]">open_in_full</span>Open
                </button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={closePeek}><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-body-sm">
              <div className="mb-3 flex items-center gap-2"><StatusPill status={peek.status} /><span className="text-[11px] text-on-surface-variant">{peek.type}</span></div>
              <div className="bg-surface-container-low rounded-lg p-3 mb-3 text-center">
                <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-1">Value</div>
                <div className="text-headline-md">{peek.value}</div>
              </div>
              <dl className="divide-y divide-surface-dim text-body-sm">
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Code</dt><dd className="font-mono">{peek.code}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Internal title</dt><dd className="text-right">{peek.title}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Scope</dt><dd>{peek.scope}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Used / limit</dt><dd className="tabular-nums">{peek.limit == null ? peek.used + ' / ∞' : peek.used + ' / ' + peek.limit}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Window</dt><dd className="text-right">{peek.window}</dd></div>
              </dl>
              <div className="mt-4 pt-3 border-t border-surface-dim">
                <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-2">Targets</div>
                <div className="flex flex-wrap gap-1.5">{peek.targets.map((t, i) => <TargetChip key={i} t={t} />)}</div>
              </div>
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => { const id = peek.id; closePeek(); openDiscountDrawer(id); }}><span className="material-symbols-outlined text-[16px]">edit</span>Edit</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('duplicate', peek)}><span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('pause', peek)}><span className="material-symbols-outlined text-[16px]">pause_circle</span>Pause</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md text-error hover:bg-error-container/40 flex items-center justify-center gap-1" onClick={() => rowAction('delete', peek)}><span className="material-symbols-outlined text-[16px]">delete</span>Delete</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Discount drawer (create + edit) */}
      {drawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={closeDiscountDrawer} />
          <div className="drawer open" style={{ width: 560, maxWidth: '94vw' }}>
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">sell</span>
                <div>
                  <div className="text-headline-sm">{editingId ? 'Edit discount' : 'New discount'}</div>
                  <div className="text-[11px] text-on-surface-variant">{editingId ? 'Editing ' + (items.find(x => x.id === editingId)?.code || '') : 'Draft · not yet published'}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeDiscountDrawer}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Basics */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-body-md font-semibold">Discount basics</h3>
                  <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Step 1 of 4</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Discount code</label>
                    <div className="flex items-center gap-2">
                      <input className="flex-1 h-9 px-2.5 border border-surface-dim rounded text-body-md font-mono focus:outline-none focus:border-primary" placeholder="e.g. FALL26" value={fCode} onChange={e => setFCode(e.target.value)} />
                      <button className="h-8 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={generateCode}>
                        <span className="material-symbols-outlined text-[14px]">casino</span>Generate
                      </button>
                    </div>
                    <div className="text-[10px] text-on-surface-variant mt-1">Codes are case-insensitive at checkout.</div>
                  </div>

                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Internal title</label>
                    <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="Fall launch — sitewide 15%" value={fTitle} onChange={e => setFTitle(e.target.value)} />
                  </div>

                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Discount type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        ['Percentage', 'percent', 'Percentage', '% off order or items'],
                        ['Fixed', 'attach_money', 'Fixed amount', '$ off order or items'],
                        ['Free shipping', 'local_shipping', 'Free shipping', 'Waive shipping cost'],
                        ['BOGO', 'redeem', 'Buy X get Y', 'Automatic quantity discount'],
                      ] as const).map(([dtype, icon, label, sub]) => {
                        const on = currentType === dtype;
                        return (
                          <button key={dtype} className={`border rounded-lg p-2.5 text-left text-body-sm hover:border-primary ${on ? 'border-primary bg-surface-container-low' : 'border-surface-dim'}`} onClick={() => syncTypeUI(dtype)}>
                            <span className="material-symbols-outlined text-[16px] text-primary">{icon}</span>
                            <div className="font-semibold mt-1">{label}</div>
                            <div className="text-[10px] text-on-surface-variant">{sub}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>

              {/* Value */}
              <section className="pt-4 border-t border-surface-dim">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-body-md font-semibold">Value</h3>
                  <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Step 2 of 4</span>
                </div>

                {currentType === 'Percentage' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Discount amount</label>
                      <div className="flex">
                        <input className="flex-1 h-9 px-2.5 border border-surface-dim rounded-l text-body-md focus:outline-none focus:border-primary" value={fValue} onChange={e => setFValue(e.target.value)} />
                        <span className="h-9 px-2 border border-l-0 border-surface-dim rounded-r bg-surface-container-low text-body-md flex items-center">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Applies to</label>
                      <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fScope} onChange={e => setFScope(e.target.value)}>
                        <option>Entire order</option>
                        <option>Specific items</option>
                        <option>Specific collections</option>
                      </select>
                    </div>
                  </div>
                )}

                {currentType === 'Fixed' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Discount amount</label>
                      <div className="flex">
                        <span className="h-9 px-2 border border-r-0 border-surface-dim rounded-l bg-surface-container-low text-body-md flex items-center">$</span>
                        <input className="flex-1 h-9 px-2.5 border border-surface-dim rounded-r text-body-md focus:outline-none focus:border-primary" value={fFixed} onChange={e => setFFixed(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Applies to</label>
                      <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fFixedScope} onChange={e => setFFixedScope(e.target.value)}>
                        <option>Entire order</option>
                        <option>Specific items</option>
                      </select>
                    </div>
                  </div>
                )}

                {currentType === 'Free shipping' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Shipping rate</label>
                      <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fShipRate} onChange={e => setFShipRate(e.target.value)}>
                        <option>All shipping rates</option>
                        <option>Standard only</option>
                        <option>Express only</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Excluded regions</label>
                      <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="e.g. AK, HI" value={fShipExcluded} onChange={e => setFShipExcluded(e.target.value)} />
                    </div>
                  </div>
                )}

                {currentType === 'BOGO' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-label-sm text-on-surface-variant mb-1">Customer buys</label>
                        <input type="number" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fBogoBuy} onChange={e => setFBogoBuy(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-label-sm text-on-surface-variant mb-1">Customer gets</label>
                        <input type="number" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fBogoGet} onChange={e => setFBogoGet(e.target.value)} />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="block text-label-sm text-on-surface-variant mb-1">Discount on the &ldquo;gets&rdquo; items</label>
                      <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fBogoDiscount} onChange={e => setFBogoDiscount(e.target.value)}>
                        <option>Free</option>
                        <option>50% off</option>
                        <option>25% off</option>
                      </select>
                    </div>
                  </>
                )}

                <div className="mt-3">
                  <label className="block text-label-sm text-on-surface-variant mb-1">Minimum requirements</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select className="h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fMinType} onChange={e => setFMinType(e.target.value)}>
                      <option value="none">No minimum</option>
                      <option value="order-amount">Minimum order amount</option>
                      <option value="items-qty">Minimum quantity of items</option>
                    </select>
                    <input className={`h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary ${fMinType === 'none' ? 'hidden-imp' : ''}`} placeholder="0.00" value={fMinValue} onChange={e => setFMinValue(e.target.value)} />
                  </div>
                </div>
              </section>

              {/* Target picker */}
              <section className="pt-4 border-t border-surface-dim">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-body-md font-semibold">Target</h3>
                  <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Step 3 of 4</span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  {([
                    ['all', 'select_all', 'All products'],
                    ['collections', 'collections_bookmark', 'Collections'],
                    ['products', 'checkroom', 'Products'],
                    ['customers', 'groups', 'Customers'],
                  ] as const).map(([k, icon, label]) => (
                    <button key={k} className="h-8 px-2.5 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => openTargetModal(k)}>
                      <span className="material-symbols-outlined text-[14px]">{icon}</span>{label}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {pickedTargets.length === 0 ? (
                    <div className="text-[11px] text-on-surface-variant py-2">No targets yet — pick at least one.</div>
                  ) : pickedTargets.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-outline-variant bg-surface-container-low text-body-sm">
                      <TargetChip t={t} />
                      <button className="ml-auto w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => removePickedTarget(i)}><span className="material-symbols-outlined text-[14px]">close</span></button>
                    </div>
                  ))}
                </div>

                <div className="text-[10px] text-on-surface-variant mt-2">Targeting is applied at checkout. Combining multiple target types narrows the eligible items/customers.</div>
              </section>

              {/* Window */}
              <section className="pt-4 border-t border-surface-dim">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-body-md font-semibold">Active window &amp; limits</h3>
                  <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">Step 4 of 4</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Start</label>
                    <input type="datetime-local" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fStart} onChange={e => setFStart(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">End (optional)</label>
                    <input type="datetime-local" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fEnd} onChange={e => setFEnd(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Usage limit per code</label>
                    <input type="number" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="Unlimited" value={fLimit} onChange={e => setFLimit(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Limit per customer</label>
                    <input type="number" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="Unlimited" value={fPerCustomer} onChange={e => setFPerCustomer(e.target.value)} />
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-3 text-body-sm">
                  <input type="checkbox" className="row-check" checked={fCombinable} onChange={e => setFCombinable(e.target.checked)} />
                  Can be combined with product discounts
                </label>
              </section>
            </div>

            {/* Footer */}
            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeDiscountDrawer}>Cancel</button>
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

      {/* Target picker modal */}
      {targetModalOpen && activeTargetKind && (
        <div className="modal-scrim open" onClick={() => setTargetModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Pick {({ all: 'All products', collections: 'Collections', products: 'Products', customers: 'Customers' } as Record<string, string>)[activeTargetKind]}</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Only items in the selected set will be eligible for this discount.</p>
            <div className="mb-2">
              <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="Search…" value={targetSearch} onChange={e => setTargetSearch(e.target.value)} />
            </div>
            <div className="max-h-[300px] overflow-y-auto border border-surface-dim rounded">
              {(TARGET_DATA[activeTargetKind] || []).filter(it => it.label.toLowerCase().includes(targetSearch.toLowerCase()) || it.meta.toLowerCase().includes(targetSearch.toLowerCase())).map(it => (
                <label key={it.id} className="flex items-center gap-3 px-3 py-2 border-b border-surface-dim last:border-b-0 cursor-pointer hover:bg-surface-container-low">
                  <input type="checkbox" style={{ accentColor: '#0a6400' }} checked={targetDraft.has(it.id)} onChange={() => { const next = new Set(targetDraft); if (next.has(it.id)) next.delete(it.id); else next.add(it.id); setTargetDraft(next); }} />
                  <div className="min-w-0 flex-1"><div className="text-body-sm font-medium">{it.label}</div><div className="text-[11px] text-on-surface-variant">{it.meta}</div></div>
                  <span className="target-chip"><span className="material-symbols-outlined">{TARGET_KIND_ICON[activeTargetKind]}</span>{activeTargetKind}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setTargetModalOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={confirmTargets}>Add to target</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
