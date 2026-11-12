'use client';
/* NewsletterScreen — 1:1 port of upload/marketing_extracted/Marketing/newsletter caimpagnshtml.html
   The HTML's <style> block lives in src/app/marketing.css (global classes).
   The HTML's <body> is ported to JSX below; class names are identical.
   The HTML's <script> is ported to React state + handlers below. */
import { Fragment, useMemo, useState } from 'react';
import { exportToCsv } from '@/lib/csvExport';

interface MarketingScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

/* ─── data (verbatim from HTML <script>) ─── */
interface Campaign {
  id: string;
  name: string;
  subject: string;
  segment: string;
  recipients: number;
  send: string;
  open: string;
  click: string;
  status: string;
}

const CAMPAIGNS: Campaign[] = [
  { id: 'c1', name: 'October product spotlight', subject: "A closer look at what's new this month", segment: 'All subscribers', recipients: 14286, send: '2026-10-29T15:30', open: '44.2%', click: '7.1%', status: 'Sent' },
  { id: 'c2', name: 'Weekly digest · W44', subject: 'This week at Unsaid', segment: 'All subscribers', recipients: 14286, send: '2026-11-03T09:00', open: '—', click: '—', status: 'Scheduled' },
  { id: 'c3', name: 'Holiday teaser', subject: 'Something cozy is coming', segment: 'VIP customers', recipients: 842, send: '2026-11-10T10:00', open: '—', click: '—', status: 'Scheduled' },
  { id: 'c4', name: 'Black Friday draft', subject: 'Our biggest drop of the year', segment: 'All subscribers', recipients: 14286, send: '—', open: '—', click: '—', status: 'Draft' },
  { id: 'c5', name: 'New subscriber welcome', subject: 'Welcome to Unsaid', segment: 'New subscribers', recipients: 312, send: 'Automation', open: '—', click: '—', status: 'Paused' },
];

interface Segment { id: string; label: string; count: number; desc: string; }
const SEGMENTS: Segment[] = [
  { id: 'seg-all', label: 'All subscribers', count: 14286, desc: 'Everyone who has opted in' },
  { id: 'seg-vip', label: 'VIP customers', count: 842, desc: 'LTV > $500' },
  { id: 'seg-new', label: 'New subscribers', count: 312, desc: 'Joined in the last 30 days' },
  { id: 'seg-risk', label: 'At-risk', count: 119, desc: 'No opens in 90 days' },
];

const STATUS_PILL: Record<string, string> = {
  Sent: 'bg-secondary-container text-on-secondary-container',
  Scheduled: 'bg-tertiary/15 text-tertiary',
  Sending: 'bg-qb-blue/15 text-qb-blue',
  Draft: 'bg-surface-container text-on-surface-variant',
  Paused: 'bg-qb-maroon/15 text-qb-maroon',
  Archived: 'bg-surface-container text-on-surface-variant',
};

const TABS = ['All', 'Draft', 'Scheduled', 'Sending', 'Sent', 'Paused'] as const;
const BLOCK_TYPES = ['hero', 'text', 'cta', 'divider'] as const;
type BlockType = typeof BLOCK_TYPES[number];

interface Block { id: string; type: BlockType; content: string; }
const DEFAULT_BLOCKS: Block[] = [
  { id: 'blk-hero', type: 'hero', content: 'Hero image' },
  { id: 'blk-text', type: 'text', content: "Hi there,\n\nWe've just released our fall capsule — a small, considered collection built around the pieces you asked for.\n\nTake a look and let us know what you think." },
  { id: 'blk-cta', type: 'cta', content: 'Shop the drop' },
];

/* ─── helpers (from HTML <script>) ─── */
function statusPillClass(s: string) {
  return STATUS_PILL[s] || 'bg-surface-container text-on-surface-variant';
}
function fmt(iso: string) {
  if (!iso) return '—';
  if (iso === 'Automation') return 'Automation';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NewsletterScreen({ onToast }: MarketingScreenProps) {
  /* ─── state (mirrors HTML `filters`, `peekId`, `rowMenuForId`, builder state) ─── */
  const [items, setItems] = useState<Campaign[]>(CAMPAIGNS);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<string>('All');
  const [segments, setSegments] = useState<Set<string>>(new Set(SEGMENTS.map(s => s.label)));
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [newCampaignMenuOpen, setNewCampaignMenuOpen] = useState(false);
  const [popSegmentOpen, setPopSegmentOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [otherCreate, setOtherCreate] = useState<{ kind: string } | null>(null);

  /* builder state */
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [builderStep, setBuilderStep] = useState<'design' | 'recipients' | 'settings' | 'review'>('design');
  const [blocks, setBlocks] = useState<Block[]>(DEFAULT_BLOCKS);
  const [builderSegments, setBuilderSegments] = useState<string[]>([]);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [isDirty, setIsDirty] = useState(false);
  // message detail fields
  const [fName, setFName] = useState('');
  const [fSubject, setFSubject] = useState('');
  const [fFrom, setFFrom] = useState('Unsaid Company');
  const [fReply, setFReply] = useState('hello@unsaid.app');
  const [fPreheader, setFPreheader] = useState('');
  const [fSendAt, setFSendAt] = useState('');
  const [fApproval, setFApproval] = useState<'none' | 'approval'>('none');
  const [exclUnsub, setExclUnsub] = useState(true);
  const [exclBounce, setExclBounce] = useState(true);
  const [exclComplaint, setExclComplaint] = useState(true);
  const [trackOpens, setTrackOpens] = useState(true);
  const [gaUtm, setGaUtm] = useState(true);
  const [gaEvent, setGaEvent] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  /* ─── derived (mirrors filteredCampaigns / renderCampaigns) ─── */
  const rows = useMemo(() => items.filter(c => {
    const ql = q.toLowerCase();
    const qOK = !ql || (c.name + ' ' + c.subject + ' ' + c.segment).toLowerCase().includes(ql);
    const tabOK = tab === 'All' || c.status === tab;
    const segOK = segments.has(c.segment);
    const dateOK = (!dateFrom || (c.send && c.send >= dateFrom)) && (!dateTo || (c.send && c.send.slice(0, 10) <= dateTo));
    return qOK && tabOK && segOK && dateOK;
  }), [items, q, tab, segments, dateFrom, dateTo]);

  const activeCount = items.filter(c => ['Draft', 'Scheduled', 'Sending'].includes(c.status)).length;
  const allChecked = rows.length > 0 && rows.every(c => selected.has(c.id));
  const someChecked = rows.some(c => selected.has(c.id));
  const filtersActive = !!q || tab !== 'All' || segments.size !== SEGMENTS.length || !!dateFrom || !!dateTo;

  const recipientsCount = builderSegments.reduce((sum, label) => {
    const s = SEGMENTS.find(x => x.label === label);
    return sum + (s ? s.count : 0);
  }, 0);

  /* ─── handlers ─── */
  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map(c => c.id)));
  }
  function clearAllFilters() {
    setQ(''); setTab('All');
    setSegments(new Set(SEGMENTS.map(s => s.label)));
    setDateFrom(null); setDateTo(null);
  }

  function openPeek(id: string) { setPeekId(id); setRowMenu(null); }
  function closePeek() { setPeekId(null); }

  function rowAction(act: string, c: Campaign) {
    setRowMenu(null);
    switch (act) {
      case 'open': openBuilder(c.id); break;
      case 'preview': openPeek(c.id); break;
      case 'duplicate':
        setItems(prev => [{ ...c, id: 'c' + Date.now(), name: c.name + ' (copy)', status: 'Draft', send: '—', open: '—', click: '—' }, ...prev]);
        onToast('Duplicated');
        break;
      case 'pause': setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Paused' } : x)); onToast('Paused'); break;
      case 'resume': setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Scheduled' } : x)); onToast('Resumed'); break;
      case 'archive': setItems(prev => prev.map(x => x.id === c.id ? { ...x, status: 'Archived' } : x)); onToast('Archived'); break;
    }
  }

  function bulkAction(act: string) {
    if (act === 'Clear') { setSelected(new Set()); return; }
    const sel = [...selected];
    const n = sel.length;
    if (act === 'Pause') { setItems(prev => prev.map(c => sel.includes(c.id) ? { ...c, status: 'Paused' } : c)); onToast(`Pause · ${n} campaign(s)`); }
    else if (act === 'Resume') { setItems(prev => prev.map(c => sel.includes(c.id) ? { ...c, status: 'Scheduled' } : c)); onToast(`Resume · ${n} campaign(s)`); }
    else if (act === 'Duplicate') {
      const copies: Campaign[] = sel.map(id => {
        const c = items.find(x => x.id === id)!;
        return { ...c, id: 'c' + Date.now() + Math.random().toString(36).slice(2, 6), name: c.name + ' (copy)', status: 'Draft', send: '—', open: '—', click: '—' };
      });
      setItems(prev => [...copies, ...prev]);
      onToast(`Duplicate · ${n} campaign(s)`);
    }
    else if (act === 'Archive') { setItems(prev => prev.map(c => sel.includes(c.id) ? { ...c, status: 'Archived' } : c)); onToast(`Archive · ${n} campaign(s)`); }
    setSelected(new Set());
  }

  function handleExport() {
    exportToCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'id', label: 'Campaign ID' }, { key: 'name', label: 'Campaign' }, { key: 'subject', label: 'Subject' },
      { key: 'segment', label: 'Segment' }, { key: 'recipients', label: 'Recipients' }, { key: 'send', label: 'Send' },
      { key: 'open', label: 'Open rate' }, { key: 'click', label: 'Click rate' }, { key: 'status', label: 'Status' },
    ], 'newsletter-campaigns');
    onToast(`Exported ${rows.length} campaigns`);
  }

  /* ─── builder handlers ─── */
  function openBuilder(id: string | null) {
    setEditingId(id);
    setBuilderStep('design');
    setSendMode('now');
    setIsDirty(false);
    setPreviewMode('desktop');
    setPeekId(null);
    setNewCampaignMenuOpen(false);
    setTemplatesOpen(false);
    const c = id ? items.find(x => x.id === id) : null;
    setFName(c ? c.name : '');
    setFSubject(c ? c.subject : '');
    setFFrom('Unsaid Company');
    setFReply('hello@unsaid.app');
    setFPreheader('');
    setFSendAt(new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 16));
    setFApproval('none');
    setExclUnsub(true); setExclBounce(true); setExclComplaint(true);
    setTrackOpens(true); setGaUtm(true); setGaEvent(false);
    setBlocks(DEFAULT_BLOCKS.map(b => ({ ...b })));
    setBuilderSegments([c ? c.segment : 'All subscribers']);
    setBuilderOpen(true);
  }
  function closeBuilder() {
    setBuilderOpen(false);
    setEditingId(null);
  }
  function builderCloseClick() {
    if (isDirty && !confirm('Discard unsaved changes?')) return;
    closeBuilder();
  }
  function addBlock(type: BlockType) {
    const content = type === 'text' ? 'Add your paragraph here.' : type === 'cta' ? 'Shop the drop' : type === 'hero' ? 'Hero image' : '';
    setBlocks(prev => [...prev, { id: 'blk-' + Date.now(), type, content }]);
    setIsDirty(true);
  }
  function moveBlock(id: string, dir: number) {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [b] = copy.splice(idx, 1);
      copy.splice(next, 0, b);
      return copy;
    });
  }
  function removeBlock(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id));
  }
  function updateBlock(id: string, content: string) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b));
    setIsDirty(true);
  }
  function toggleBuilderSegment(label: string) {
    setBuilderSegments(prev => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]);
    setIsDirty(true);
  }
  function collectPayload() {
    return {
      name: fName || 'Untitled campaign',
      subject: fSubject,
      preheader: fPreheader,
      fromName: fFrom,
      replyTo: fReply,
      segment: builderSegments[0] || '',
      segments: builderSegments,
      recipients: recipientsCount,
      blocks,
      sendMode,
      sendAt: sendMode === 'schedule' ? fSendAt : null,
      approval: fApproval,
    };
  }
  function saveBuilder() {
    const p = collectPayload();
    if (editingId) {
      setItems(prev => prev.map(c => c.id === editingId ? { ...c, name: p.name, subject: p.subject, segment: p.segment, recipients: p.recipients } : c));
    } else {
      setItems(prev => [{ id: 'c' + Date.now(), name: p.name, subject: p.subject, segment: p.segment, recipients: p.recipients, send: '—', open: '—', click: '—', status: 'Draft' }, ...prev]);
    }
    setIsDirty(false);
    closeBuilder();
    onToast('Campaign saved');
  }
  function sendBuilder() {
    const p = collectPayload();
    if (sendMode === 'now') {
      const id = editingId || 'c' + Date.now();
      const now = new Date().toISOString();
      setItems(prev => {
        if (editingId) return prev.map(c => c.id === editingId ? { ...c, name: p.name, subject: p.subject, segment: p.segment, recipients: p.recipients, status: 'Sending', send: now } : c);
        return [{ id, name: p.name, subject: p.subject, segment: p.segment, recipients: p.recipients, status: 'Sending', send: now, open: '—', click: '—' }, ...prev];
      });
      setIsDirty(false);
      closeBuilder();
      onToast('Send prepared — connect ESP to deliver');
    } else {
      const id = editingId || 'c' + Date.now();
      setItems(prev => {
        if (editingId) return prev.map(c => c.id === editingId ? { ...c, name: p.name, subject: p.subject, segment: p.segment, recipients: p.recipients, status: 'Scheduled', send: fSendAt } : c);
        return [{ id, name: p.name, subject: p.subject, segment: p.segment, recipients: p.recipients, status: 'Scheduled', send: fSendAt, open: '—', click: '—' }, ...prev];
      });
      setIsDirty(false);
      closeBuilder();
      onToast('Scheduled');
    }
  }
  function sendTest() {
    if (!testEmail) { onToast('Enter an email'); return; }
    if (!testEmail.includes('@')) { onToast('Enter a valid email'); return; }
    onToast('Test sent to ' + testEmail);
  }
  function builderSendTestFromHeader() {
    onToast('Send test — enter an email on the Review tab');
    setBuilderStep('review');
  }
  function builderPreviewFromHeader() {
    onToast('Preview opened in right pane — resize with Desktop/Mobile toggle');
  }

  /* ─── derived builder renders ─── */
  const stepIndex = ['design', 'recipients', 'settings', 'review'].indexOf(builderStep) + 1;
  const stepNames = ['Design', 'Recipients', 'Settings', 'Review'];
  const nonHeroBlocks = blocks.filter(b => b.type !== 'hero');
  const hasHero = blocks.some(b => b.type === 'hero');

  function renderStepMarker(idx: number, currentIdx: number) {
    const cls = idx === currentIdx ? 'active' : idx < currentIdx ? 'done' : '';
    return <div className={`step ${cls}`}><span className="step-num">{idx}</span>{stepNames[idx - 1]}</div>;
  }

  const peek = peekId ? items.find(c => c.id === peekId) : null;
  const editingCampaign = editingId ? items.find(c => c.id === editingId) : null;
  const builderTitle = fName || (editingCampaign ? editingCampaign.name : 'Untitled campaign');
  const builderSub = editingCampaign ? `${editingCampaign.status} · ${editingCampaign.segment}` : 'Draft · not yet sent';

  return (
    <main className="px-6 pb-12">

      {/* ─── DOMAIN TABSTRIP ─── */}
      <div className="flex items-center gap-1 mt-4 mb-1 border-b border-surface-dim overflow-x-auto">
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate → overview')}>Publishing Overview</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate → calendar')}>Calendar</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate → queue')}>Queue</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate → create')}>Create Content</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate → library')}>Content Library</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate → channels')}>Connected Channels</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate → performance')}>Performance</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate → oversight')}>Oversight</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate → promotions')}>Promotions</button>
        <button className="h-9 px-3 text-label-md tab-underline active">Newsletter</button>
      </div>

      {/* ─── HEADER ─── */}
      <div className="flex items-center justify-between gap-4 py-4">
        <div>
          <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
            <span>Marketing</span><span className="text-outline">/</span><span>Newsletter</span>
          </div>
          <h1 className="text-headline-lg">Newsletter campaigns</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Build, schedule, and send email campaigns. Segment recipients, design in blocks, and measure performance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => setTemplatesOpen(true)}>
            <span className="material-symbols-outlined text-[16px]">dashboard_customize</span>Templates
          </button>
          <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => openBuilder(null)}>
            <span className="material-symbols-outlined text-[16px]">add</span>New campaign
          </button>
        </div>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Subscribers</span>
          <div className="text-headline-lg mt-1">14,286</div>
          <div className="text-[11px] text-secondary mt-1">+312 this month</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Avg. open rate (30d)</span>
          <div className="text-headline-lg mt-1">42.8%</div>
          <div className="text-[11px] text-secondary mt-1">+3.1 pts</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Avg. click rate (30d)</span>
          <div className="text-headline-lg mt-1">6.4%</div>
          <div className="text-[11px] text-on-surface-variant mt-1">Stable</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Drafts &amp; scheduled</span>
          <div className="text-headline-lg mt-1">{activeCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-1">{items.filter(c => c.status === 'Scheduled').length} scheduled · {items.filter(c => c.status === 'Draft').length} draft</div>
        </div>
      </div>

      {/* ─── CREATE ACTIONS ROW ─── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => openBuilder(null)}>
          <span className="material-symbols-outlined text-[16px]">mail</span>New campaign
        </button>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => setOtherCreate({ kind: 'Automation' })}>
          <span className="material-symbols-outlined text-[16px]">bolt</span>Automation
        </button>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => setOtherCreate({ kind: 'Segment' })}>
          <span className="material-symbols-outlined text-[16px]">groups</span>Segment
        </button>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => setOtherCreate({ kind: 'Template' })}>
          <span className="material-symbols-outlined text-[16px]">dashboard_customize</span>Template
        </button>
        <button className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1" onClick={() => onToast('Open global create flyout')}>
          <span className="material-symbols-outlined text-[16px]">apps</span>Show all
        </button>
      </div>

      {/* ─── CAMPAIGNS LIST ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">

        {/* View tabs */}
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          {TABS.map(t => (
            <button key={t} className={`h-full px-3 text-label-md tab-underline ${tab === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => { setTab(t); setSelected(new Set()); }}>{t}</button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim">
          <div className="relative flex items-center flex-1 max-w-sm">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter by name, subject, segment…" value={q} onChange={e => setQ(e.target.value)} />
          </div>

          {/* Segment popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopSegmentOpen(v => !v); }}>
              <span className="material-symbols-outlined text-[14px]">groups</span>Segment
            </button>
            {popSegmentOpen && (
              <div className="popover" style={{ position: 'absolute', left: 0, top: 32, padding: 12, width: 256 }} onClick={e => e.stopPropagation()}>
                <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">Filter by segment</div>
                {SEGMENTS.map(s => (
                  <label key={s.id} className="flex items-center gap-2 py-1 text-body-sm">
                    <input type="checkbox" className="row-check" checked={segments.has(s.label)} onChange={() => { const next = new Set(segments); if (next.has(s.label)) next.delete(s.label); else next.add(s.label); setSegments(next); }} />{s.label}
                  </label>
                ))}
                <div className="flex justify-end gap-2 mt-3">
                  <button className="h-7 px-2 text-body-sm border border-surface-dim rounded hover:bg-surface-container-low" onClick={() => setSegments(new Set(SEGMENTS.map(s => s.label)))}>Clear</button>
                  <button className="h-7 px-2 text-body-sm bg-primary text-white rounded hover:bg-primary-container font-semibold" onClick={() => setPopSegmentOpen(false)}>Apply</button>
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
                {`Search: "${q}"`}
                <button className="w-4 h-4 rounded-full hover:bg-surface-container-high flex items-center justify-center" onClick={() => setQ('')}><span className="material-symbols-outlined text-[12px]">close</span></button>
              </span>
            )}
            {tab !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-medium">
                {`Tab: ${tab}`}
                <button className="w-4 h-4 rounded-full hover:bg-surface-container-high flex items-center justify-center" onClick={() => setTab('All')}><span className="material-symbols-outlined text-[12px]">close</span></button>
              </span>
            )}
            {segments.size !== SEGMENTS.length && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-medium">
                {`Segment: ${[...segments].join(', ') || 'none'}`}
                <button className="w-4 h-4 rounded-full hover:bg-surface-container-high flex items-center justify-center" onClick={() => setSegments(new Set(SEGMENTS.map(s => s.label)))}><span className="material-symbols-outlined text-[12px]">close</span></button>
              </span>
            )}
            {(dateFrom || dateTo) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-medium">
                {`Date: ${dateFrom || '…'} → ${dateTo || '…'}`}
                <button className="w-4 h-4 rounded-full hover:bg-surface-container-high flex items-center justify-center" onClick={() => { setDateFrom(null); setDateTo(null); }}><span className="material-symbols-outlined text-[12px]">close</span></button>
              </span>
            )}
            <button className="ml-auto text-[11px] text-primary hover:underline font-medium" onClick={clearAllFilters}>Clear all</button>
          </div>
        )}

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="bulk-bar show">
            <span className="font-semibold">{selected.size} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('Pause')}><span className="material-symbols-outlined text-[15px] align-middle mr-1">pause_circle</span>Pause</button>
            <button onClick={() => bulkAction('Resume')}><span className="material-symbols-outlined text-[15px] align-middle mr-1">play_circle</span>Resume</button>
            <button onClick={() => bulkAction('Duplicate')}><span className="material-symbols-outlined text-[15px] align-middle mr-1">content_copy</span>Duplicate</button>
            <button onClick={() => bulkAction('Archive')}><span className="material-symbols-outlined text-[15px] align-middle mr-1">archive</span>Archive</button>
            <button className="ml-auto" onClick={() => bulkAction('Clear')}><span className="material-symbols-outlined text-[15px] align-middle mr-1">close</span>Clear</button>
          </div>
        )}

        {/* Table / Empty */}
        {rows.length === 0 ? (
          <div className="py-16 px-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-[32px] text-outline">mail</span>
            </div>
            <h3 className="text-headline-sm mb-1">No campaigns match your filters</h3>
            <p className="text-body-sm text-on-surface-variant mb-4 max-w-sm mx-auto">Clear filters or start a new newsletter campaign.</p>
            <div className="flex items-center justify-center gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={clearAllFilters}>
                <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>Clear filters
              </button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => openBuilder(null)}>
                <span className="material-symbols-outlined text-[16px]">add</span>New campaign
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm min-w-[1150px]">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} /></th>
                  <th className="px-3 py-2">Campaign</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Segment</th>
                  <th className="px-3 py-2 text-right">Recipients</th>
                  <th className="px-3 py-2">Send</th>
                  <th className="px-3 py-2 text-right">Open</th>
                  <th className="px-3 py-2 text-right">Click</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {rows.map(c => (
                  <tr key={c.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openPeek(c.id)}>
                    <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={selected.has(c.id)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(c.id)} /></td>
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2 text-[11px] text-on-surface-variant truncate max-w-[240px]">{c.subject}</td>
                    <td className="px-3 py-2">{c.segment}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.recipients.toLocaleString()}</td>
                    <td className="px-3 py-2 text-[11px]">{fmt(c.send)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.open}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.click}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-label-sm ${statusPillClass(c.status)}`}>{c.status}</span></td>
                    <td className="px-2 py-2 text-right relative">
                      <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setRowMenu(rowMenu?.id === c.id ? null : { id: c.id, top: r.bottom + 4, left: r.right - 240 }); }}>
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
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

      {/* Click-away catcher for row menu */}
      {rowMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenu(null)} />}

      {/* Row menu popover */}
      {rowMenu && (
        <div className="popover" style={{ position: 'fixed', top: rowMenu.top, left: rowMenu.left, minWidth: 220, zIndex: 200 }} onClick={e => e.stopPropagation()}>
          <div className="px-3 py-1 text-[10px] text-outline uppercase tracking-wider font-bold">{rowMenu.id}</div>
          <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { const c = items.find(x => x.id === rowMenu.id); if (c) rowAction('open', c); }}><span className="material-symbols-outlined text-[16px]">edit</span>Open in builder</button>
          <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { const c = items.find(x => x.id === rowMenu.id); if (c) rowAction('preview', c); }}><span className="material-symbols-outlined text-[16px]">visibility</span>Preview</button>
          <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { const c = items.find(x => x.id === rowMenu.id); if (c) rowAction('duplicate', c); }}><span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate</button>
          <div className="border-t border-surface-dim my-1"></div>
          <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { const c = items.find(x => x.id === rowMenu.id); if (c) rowAction('pause', c); }}><span className="material-symbols-outlined text-[16px]">pause_circle</span>Pause</button>
          <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { const c = items.find(x => x.id === rowMenu.id); if (c) rowAction('archive', c); }}><span className="material-symbols-outlined text-[16px]">archive</span>Archive</button>
        </div>
      )}

      {/* Peek drawer */}
      {peek && (
        <>
          <div className="scrim open" onClick={closePeek} />
          <div className="peek open">
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">mail</span>
                <span className="text-headline-sm truncate">{peek.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => { const id = peek.id; closePeek(); openBuilder(id); }}><span className="material-symbols-outlined text-[14px]">open_in_full</span>Open builder</button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={closePeek}><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-body-sm">
              <div className="mb-3 flex items-center gap-2"><span className={`px-2 py-0.5 rounded-full text-label-sm ${statusPillClass(peek.status)}`}>{peek.status}</span></div>
              <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-1">Subject</div>
              <div className="text-body-sm mb-3">{peek.subject}</div>
              <dl className="divide-y divide-surface-dim text-body-sm">
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Segment</dt><dd>{peek.segment}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Recipients</dt><dd className="tabular-nums">{peek.recipients.toLocaleString()}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Send</dt><dd>{fmt(peek.send)}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Open rate</dt><dd>{peek.open}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Click rate</dt><dd>{peek.click}</dd></div>
              </dl>
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => { const id = peek.id; closePeek(); openBuilder(id); }}><span className="material-symbols-outlined text-[16px]">edit</span>Open builder</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('duplicate', peek)}><span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => rowAction('pause', peek)}><span className="material-symbols-outlined text-[16px]">pause_circle</span>Pause</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md text-error hover:bg-error-container/40 flex items-center justify-center gap-1" onClick={() => rowAction('archive', peek)}><span className="material-symbols-outlined text-[16px]">archive</span>Archive</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Templates modal */}
      {templatesOpen && (
        <div className="modal-scrim open" onClick={() => setTemplatesOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-headline-sm">Campaign templates</h3>
              <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setTemplatesOpen(false)}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
            <p className="text-body-sm text-on-surface-variant mb-3">Reusable starting points. Pick a template to open the builder.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { icon: 'campaign', name: 'Product launch', sub: 'Hero + CTA' },
                { icon: 'article', name: 'Weekly digest', sub: 'Sections + links' },
                { icon: 'redeem', name: 'Promo blast', sub: 'Image + code' },
              ].map(tpl => (
                <button key={tpl.name} className="tpl-card border border-surface-dim rounded-lg overflow-hidden text-left hover:border-primary" onClick={() => { setTemplatesOpen(false); openBuilder(null); }}>
                  <div className="h-24 bg-surface-container-low flex items-center justify-center"><span className="material-symbols-outlined text-[28px] text-on-surface-variant">{tpl.icon}</span></div>
                  <div className="p-2"><div className="text-[12px] font-semibold">{tpl.name}</div><div className="text-[10px] text-on-surface-variant">{tpl.sub}</div></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Other create modal */}
      {otherCreate && (
        <div className="modal-scrim open" onClick={() => setOtherCreate(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Create {otherCreate.kind.toLowerCase()}</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">This opens the {otherCreate.kind} create surface.</p>
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setOtherCreate(null)}>Close</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => { onToast(`Opened ${otherCreate.kind} create surface`); setOtherCreate(null); }}>Open create</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          CAMPAIGN BUILDER (full-screen)
          ═══════════════════════════════════════════════════════════════════ */}
      {builderOpen && (
        <div className="builder open">
          <div className="h-14 bg-white border-b border-surface-dim flex items-center justify-between px-5 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={builderCloseClick}><span className="material-symbols-outlined text-[18px]">arrow_back</span></button>
              <div className="min-w-0">
                <div className="text-headline-sm truncate">{builderTitle}</div>
                <div className="text-[11px] text-on-surface-variant">{builderSub}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 h-full">
              {(['design', 'recipients', 'settings', 'review'] as const).map(s => (
                <button key={s} className={`tab-underline h-full px-3 text-body-md ${builderStep === s ? 'active' : 'text-on-surface-variant'}`} onClick={() => setBuilderStep(s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={builderPreviewFromHeader}>
                <span className="material-symbols-outlined text-[16px]">visibility</span>Preview
              </button>
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={builderSendTestFromHeader}>
                <span className="material-symbols-outlined text-[16px]">send</span>Send test
              </button>
              <div className="flex">
                <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main flex items-center gap-1" onClick={saveBuilder}>
                  <span className="material-symbols-outlined text-[16px]">save</span>Save &amp; close
                </button>
                <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={sendBuilder}>
                  <span className="material-symbols-outlined text-[16px]">expand_more</span>
                </button>
              </div>
            </div>
          </div>

          <div className="builder-main">
            {/* LEFT: step content */}
            <div className="builder-left">

              {/* DESIGN step */}
              {builderStep === 'design' && (
                <div>
                  <div className="stepper">
                    {renderStepMarker(1, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(2, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(3, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(4, stepIndex)}
                  </div>

                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-surface-dim p-4">
                      <div className="text-headline-sm mb-2">Message details</div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-label-sm text-on-surface-variant mb-1">Internal name</label>
                          <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="e.g. November product drop" value={fName} onChange={e => { setFName(e.target.value); setIsDirty(true); }} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-label-sm text-on-surface-variant mb-1">From name</label>
                            <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fFrom} onChange={e => { setFFrom(e.target.value); setIsDirty(true); }} />
                          </div>
                          <div>
                            <label className="block text-label-sm text-on-surface-variant mb-1">Reply-to</label>
                            <input type="email" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="hello@unsaid.app" value={fReply} onChange={e => { setFReply(e.target.value); setIsDirty(true); }} />
                          </div>
                        </div>
                        <div>
                          <label className="block text-label-sm text-on-surface-variant mb-1">Subject line</label>
                          <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="A closer look at what's new" value={fSubject} onChange={e => { setFSubject(e.target.value); setIsDirty(true); }} />
                        </div>
                        <div>
                          <label className="block text-label-sm text-on-surface-variant mb-1">Preview text</label>
                          <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="What your subscribers see in their inbox list" value={fPreheader} onChange={e => { setFPreheader(e.target.value); setIsDirty(true); }} />
                        </div>
                      </div>
                    </div>

                    {/* Blocks */}
                    <div className="bg-white rounded-xl border border-surface-dim p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-headline-sm">Email content</div>
                        <div className="flex items-center gap-1">
                          {([['hero', 'image', 'Hero'], ['text', 'text_fields', 'Text'], ['cta', 'smart_button', 'Button'], ['divider', 'horizontal_rule', 'Divider']] as const).map(([t, icon, label]) => (
                            <button key={t} className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => addBlock(t)}><span className="material-symbols-outlined text-[14px]">{icon}</span>{label}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {blocks.length === 0 && <div className="text-[11px] text-on-surface-variant">No blocks yet. Add one above.</div>}
                        {blocks.map(b => (
                          <div key={b.id} className="block-card">
                            <div className="block-head">
                              <span className="material-symbols-outlined text-[16px] block-grip">drag_indicator</span>
                              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{b.type}</span>
                              <div className="block-toolbar">
                                <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => moveBlock(b.id, -1)}><span className="material-symbols-outlined text-[14px]">arrow_upward</span></button>
                                <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => moveBlock(b.id, 1)}><span className="material-symbols-outlined text-[14px]">arrow_downward</span></button>
                                <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center text-error" onClick={() => removeBlock(b.id)}><span className="material-symbols-outlined text-[14px]">close</span></button>
                              </div>
                            </div>
                            <div className="block-body">
                              {b.type === 'hero' && (
                                <div className="h-24 rounded bg-surface-container-low flex items-center justify-center text-on-surface-variant"><span className="material-symbols-outlined text-[28px]">image</span></div>
                              )}
                              {b.type === 'divider' && (
                                <div className="h-px bg-surface-dim"></div>
                              )}
                              {b.type === 'cta' && (
                                <div className="flex items-center gap-2">
                                  <input className="flex-1 h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={b.content} onChange={e => updateBlock(b.id, e.target.value)} />
                                  <div className="text-[11px] text-on-surface-variant">Button text</div>
                                </div>
                              )}
                              {b.type === 'text' && (
                                <textarea className="w-full min-h-[110px] p-2.5 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Add text…" value={b.content} onChange={e => updateBlock(b.id, e.target.value)} />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="text-[10px] text-on-surface-variant mt-2">Drag to reorder. Every block is editable — hover a block to remove or move it.</div>
                    </div>
                  </div>
                </div>
              )}

              {/* RECIPIENTS step */}
              {builderStep === 'recipients' && (
                <div>
                  <div className="stepper">
                    {renderStepMarker(1, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(2, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(3, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(4, stepIndex)}
                  </div>

                  <div className="bg-white rounded-xl border border-surface-dim p-4 mb-4">
                    <div className="text-headline-sm mb-1">Who receives this?</div>
                    <div className="text-[11px] text-on-surface-variant mb-3">Segments combine with AND at the campaign level. Recipients are deduplicated before send.</div>
                    <div className="space-y-2">
                      {SEGMENTS.map(s => {
                        const sel = builderSegments.includes(s.label);
                        return (
                          <label key={s.id} className={`seg-row ${sel ? 'selected' : ''}`}>
                            <input type="checkbox" checked={sel} onChange={() => toggleBuilderSegment(s.label)} />
                            <div className="min-w-0 flex-1"><div className="text-body-sm font-semibold">{s.label}</div><div className="text-[11px] text-on-surface-variant">{s.desc} · {s.count.toLocaleString()} recipients</div></div>
                            <span className="text-[11px] text-on-surface-variant tabular-nums">{s.count.toLocaleString()}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Create segment — opens Customers → Segments')}>
                        <span className="material-symbols-outlined text-[16px]">add</span>Create segment
                      </button>
                      <span className="text-[11px] text-on-surface-variant">Or import a CSV in <span className="text-primary font-medium">Customers → Segments</span>.</span>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-surface-dim p-4">
                    <div className="text-headline-sm mb-2">Exclusions</div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked={exclUnsub} onChange={e => { setExclUnsub(e.target.checked); setIsDirty(true); }} /> Exclude unsubscribed</label>
                      <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked={exclBounce} onChange={e => { setExclBounce(e.target.checked); setIsDirty(true); }} /> Exclude hard-bounced addresses</label>
                      <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked={exclComplaint} onChange={e => { setExclComplaint(e.target.checked); setIsDirty(true); }} /> Exclude spam complainers</label>
                    </div>
                  </div>
                </div>
              )}

              {/* SETTINGS step */}
              {builderStep === 'settings' && (
                <div>
                  <div className="stepper">
                    {renderStepMarker(1, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(2, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(3, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(4, stepIndex)}
                  </div>

                  <div className="bg-white rounded-xl border border-surface-dim p-4 space-y-3">
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Send timing</label>
                      <div className="view-toggle">
                        <button className={sendMode === 'now' ? 'active' : ''} onClick={() => { setSendMode('now'); setIsDirty(true); }}>Send now</button>
                        <button className={sendMode === 'schedule' ? 'active' : ''} onClick={() => { setSendMode('schedule'); setIsDirty(true); }}>Schedule</button>
                      </div>
                    </div>
                    {sendMode === 'schedule' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-label-sm text-on-surface-variant mb-1">Send at</label>
                          <input type="datetime-local" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fSendAt} onChange={e => { setFSendAt(e.target.value); setIsDirty(true); }} />
                        </div>
                        <div>
                          <label className="block text-label-sm text-on-surface-variant mb-1">Time zone</label>
                          <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" defaultValue="Central Time (US & Canada)">
                            <option>Central Time (US &amp; Canada)</option>
                            <option>Eastern Time</option>
                            <option>Pacific Time</option>
                            <option>UTC</option>
                          </select>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Tracking &amp; delivery</label>
                      <label className="flex items-center gap-2 text-body-sm py-1"><input type="checkbox" className="row-check" checked={trackOpens} onChange={e => { setTrackOpens(e.target.checked); setIsDirty(true); }} /> Track opens &amp; clicks</label>
                      <label className="flex items-center gap-2 text-body-sm py-1"><input type="checkbox" className="row-check" checked={gaUtm} onChange={e => { setGaUtm(e.target.checked); setIsDirty(true); }} /> Google Analytics UTM</label>
                      <label className="flex items-center gap-2 text-body-sm py-1"><input type="checkbox" className="row-check" checked={gaEvent} onChange={e => { setGaEvent(e.target.checked); setIsDirty(true); }} /> Google Analytics event</label>
                    </div>
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Approval</label>
                      <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={fApproval} onChange={e => { setFApproval(e.target.value as 'none' | 'approval'); setIsDirty(true); }}>
                        <option value="none">No approval required</option>
                        <option value="approval">Submit for approval before sending</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* REVIEW step */}
              {builderStep === 'review' && (
                <div>
                  <div className="stepper">
                    {renderStepMarker(1, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(2, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(3, stepIndex)}
                    <div className="step-line"></div>
                    {renderStepMarker(4, stepIndex)}
                  </div>

                  <div className="bg-white rounded-xl border border-surface-dim p-4">
                    <div className="text-headline-sm mb-2">Ready to send</div>
                    <div className="bg-surface-container-low border border-surface-dim rounded-lg p-4 text-body-sm leading-relaxed">
                      <strong>{fSubject || 'Untitled'}</strong>
                      <br /><span className="text-on-surface-variant">From:</span> {fFrom || '—'}
                      <br /><span className="text-on-surface-variant">Segments:</span> {builderSegments.length ? builderSegments.join(', ') : 'none selected'}
                      <br /><span className="text-on-surface-variant">Estimated recipients:</span> {recipientsCount.toLocaleString()}
                      <br /><span className="text-on-surface-variant">Timing:</span> {sendMode === 'now' ? 'Immediately after confirmation' : `Scheduled · ${fmt(fSendAt)}`}
                      <br /><span className="text-on-surface-variant">Content blocks:</span> {nonHeroBlocks.length}
                      <br /><span className="text-on-surface-variant">Approval:</span> {fApproval === 'approval' ? 'Required' : 'Not required'}
                    </div>
                    <div className="mt-3 p-3 border border-outline-variant bg-surface-container-low rounded text-[10px] text-on-surface-variant">
                      This prototype prepares the send request. Actual email delivery requires your backend ESP (e.g. SendGrid, Postmark, SES) and list storage.
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl border border-surface-dim p-4">
                      <div className="text-label-sm uppercase tracking-wider text-on-surface-variant font-bold mb-1">Send a test</div>
                      <input type="email" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="you@example.com" value={testEmail} onChange={e => setTestEmail(e.target.value)} />
                      <button className="mt-2 h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={sendTest}>
                        <span className="material-symbols-outlined text-[16px]">send</span>Send test
                      </button>
                    </div>
                    <div className="bg-white rounded-xl border border-surface-dim p-4">
                      <div className="text-label-sm uppercase tracking-wider text-on-surface-variant font-bold mb-1">This will</div>
                      <div className="text-body-sm">Send to ~{recipientsCount.toLocaleString()} recipients. {sendMode === 'now' ? 'Delivery begins once confirmed.' : 'Delivery is scheduled and can be paused before it fires.'}</div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* RIGHT: live email preview */}
            <div className="builder-right">
              <div className="text-label-sm uppercase tracking-wider text-on-surface-variant font-bold mb-2 flex items-center justify-between">
                <span>Live preview</span>
                <div className="view-toggle">
                  <button className={previewMode === 'desktop' ? 'active' : ''} onClick={() => setPreviewMode('desktop')}>Desktop</button>
                  <button className={previewMode === 'mobile' ? 'active' : ''} onClick={() => setPreviewMode('mobile')}>Mobile</button>
                </div>
              </div>
              <div className="email-shell" style={{ maxWidth: previewMode === 'mobile' ? 320 : 420 }}>
                <div className="email-head">
                  <div className="email-avatar">U</div>
                  <div>
                    <strong>{fFrom || 'Unsaid Company'}</strong>
                    <small>{fSubject || 'Subject line'}</small>
                  </div>
                </div>
                {hasHero && (
                  <div className="email-hero"><span className="material-symbols-outlined">image</span></div>
                )}
                <div className="email-body">
                  {nonHeroBlocks.length === 0 ? (
                    <span>Your email body will appear here as you add blocks.</span>
                  ) : nonHeroBlocks.map((b, i) => (
                    <Fragment key={b.id}>
                      {i > 0 && <br />}
                      {b.type === 'cta' && <span className="email-cta">{b.content || 'Button'}</span>}
                      {b.type === 'divider' && <div style={{ height: 1, background: '#e7eaed', margin: '10px 0' }} />}
                      {b.type === 'text' && <div>{b.content || ''}</div>}
                    </Fragment>
                  ))}
                </div>
                <div className="email-foot">
                  <span>You're receiving this because you opted in.</span>
                  <span className="text-primary font-semibold">Unsubscribe</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
