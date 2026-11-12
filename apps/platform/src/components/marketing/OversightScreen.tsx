'use client';
/* OversightScreen — 1:1 port of upload/marketing_extracted/Marketing/publishing oversight.html
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
const REASONS = ['policy', 'brand', 'quality', 'spam'] as const;
const CHANNELS = ['Instagram', 'Facebook', 'LinkedIn', 'TikTok'] as const;
const REVIEWERS = ['Jordan A. (me)', 'Sarah A.', 'Marcus L.', 'Priya N.'] as const;

type Reason = typeof REASONS[number];
type State = 'awaiting' | 'approved' | 'rejected' | 'changes';
type DecisionType = 'approved' | 'rejected' | 'changes';
type ReviewAction = 'approve' | 'changes' | 'reject' | 'assign';
type View = 'queue' | 'decisions';
type DecTab = 'all' | DecisionType;

const REASON_LABEL: Record<Reason, string> = {
  policy: 'Policy / compliance',
  brand: 'Brand voice',
  quality: 'Content quality',
  spam: 'Spam / duplication',
};
const REASON_CHIP: Record<Reason, string> = {
  policy: 'reason-policy',
  brand: 'reason-brand',
  quality: 'reason-quality',
  spam: 'reason-spam',
};

interface ReviewItem {
  id: string;
  title: string;
  caption: string;
  channel: string;
  author: string;
  scheduled: string;
  reason: Reason;
  reviewer: string;
  state: State;
  flag: string;
  note: string;
}

interface DecisionEntry {
  when: string;
  title: string;
  decision: DecisionType;
  reviewer: string;
  reason: Reason;
  note: string;
}

const INITIAL_ITEMS: ReviewItem[] = [
  { id: 'rv-001', title: 'October product spotlight', caption: "A closer look at what's new this month.", channel: 'Instagram', author: 'Sarah A.', scheduled: '2026-11-01T15:30', reason: 'policy', reviewer: '—', state: 'awaiting', flag: 'blocked_word', note: "Contains 'guaranteed' — policy rule." },
  { id: 'rv-002', title: 'Behind the scenes', caption: 'A little look behind the scenes.', channel: 'TikTok', author: 'Marcus L.', scheduled: '2026-11-01T10:00', reason: 'quality', reviewer: 'Jordan A.', state: 'awaiting', flag: 'missing_media', note: 'No media attached.' },
  { id: 'rv-003', title: 'Weekly company update', caption: "This week's updates from our team.", channel: 'LinkedIn', author: 'Priya N.', scheduled: '2026-11-03T09:00', reason: 'brand', reviewer: '—', state: 'awaiting', flag: 'new_author', note: 'First post from new author.' },
  { id: 'rv-004', title: 'Holiday capsule teaser', caption: 'Something cozy is coming.', channel: 'Instagram', author: 'Sarah A.', scheduled: '2026-11-04T12:00', reason: 'spam', reviewer: 'Jordan A.', state: 'awaiting', flag: 'duplicate', note: 'Near-duplicate caption of ORD-1052 post.' },
  { id: 'rv-005', title: 'Team spotlight — Dana', caption: 'Meet Dana, our VP Engineering.', channel: 'LinkedIn', author: 'Priya N.', scheduled: '2026-11-05T09:00', reason: 'brand', reviewer: '—', state: 'awaiting', flag: 'brand_voice', note: 'Needs tone check.' },
  { id: 'rv-006', title: 'Canvas tote drop', caption: 'New canvas totes are here.', channel: 'Facebook', author: 'Marcus L.', scheduled: '2026-11-06T11:00', reason: 'policy', reviewer: 'Sarah A.', state: 'awaiting', flag: 'channel_not_connected', note: 'Facebook not connected for this author.' },
  { id: 'rv-007', title: 'Mug restock', caption: 'Our 11oz mug is back.', channel: 'Instagram', author: 'Sarah A.', scheduled: '2026-11-07T10:00', reason: 'quality', reviewer: '—', state: 'awaiting', flag: 'missing_media', note: 'No media attached.' },
];

const INITIAL_DECISIONS: DecisionEntry[] = [
  { when: '2026-11-01T09:12', title: 'October product spotlight', decision: 'approved', reviewer: 'Jordan A.', reason: 'brand', note: 'Good to go.' },
  { when: '2026-11-01T09:20', title: 'Behind the scenes', decision: 'changes', reviewer: 'Jordan A.', reason: 'quality', note: 'Add media.' },
  { when: '2026-10-31T16:40', title: 'Weekly company update', decision: 'approved', reviewer: 'Sarah A.', reason: 'brand', note: '—' },
  { when: '2026-10-31T15:05', title: 'Holiday capsule teaser', decision: 'rejected', reviewer: 'Jordan A.', reason: 'spam', note: 'Duplicate of prior post.' },
];

interface Rule {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
}

const INITIAL_RULES: Rule[] = [
  { id: 'blocked_words', name: 'Blocked words', category: 'Policy / compliance', enabled: true },
  { id: 'duplicate', name: 'Duplicate caption check', category: 'Spam / duplication', enabled: true },
  { id: 'missing_media', name: 'Missing media', category: 'Content quality', enabled: true },
  { id: 'new_author', name: 'First post from new author', category: 'Brand voice', enabled: false },
  { id: 'channel_not_connected', name: 'Channel not connected', category: 'Policy / compliance', enabled: true },
];

const NAV_ITEMS: { key: string; label: string }[] = [
  { key: 'overview', label: 'Publishing Overview' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'queue', label: 'Queue' },
  { key: 'create', label: 'Create Content' },
  { key: 'library', label: 'Content Library' },
  { key: 'channels', label: 'Connected Channels' },
  { key: 'performance', label: 'Performance' },
  { key: 'oversight', label: 'Oversight' },
];

const DECISION_TITLES: Record<ReviewAction, string> = {
  approve: 'Approve content',
  changes: 'Request changes',
  reject: 'Reject content',
  assign: 'Assign reviewer',
};

const DECISION_SUBS: Record<ReviewAction, string> = {
  approve: 'This approves the content and unlocks publishing for the selected items.',
  changes: 'The author will be notified and must resubmit. Existing schedule is paused.',
  reject: 'The content is rejected and removed from the schedule. Logged for audit.',
  assign: 'Reassign the reviewer. The previous reviewer will see the change in their queue.',
};

const STATE_LABEL: Record<State, string> = {
  awaiting: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Rejected',
  changes: 'Changes requested',
};
const STATE_CLASS: Record<State, string> = {
  awaiting: 'bg-tertiary/15 text-tertiary',
  approved: 'bg-secondary-container text-on-secondary-container',
  rejected: 'bg-error-container text-on-error-container',
  changes: 'bg-qb-maroon/15 text-qb-maroon',
};

/* ─── helpers (verbatim from HTML <script>) ─── */
function fmt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatePill({ state }: { state: State }) {
  return <span className={`px-2 py-0.5 rounded-full text-label-sm ${STATE_CLASS[state]}`}>{STATE_LABEL[state]}</span>;
}

function ReasonChip({ reason }: { reason: Reason }) {
  return <span className={`reason-chip ${REASON_CHIP[reason] || 'reason-brand'}`}>{REASON_LABEL[reason] || reason}</span>;
}

interface Chip {
  k: 'q' | 'reason' | 'channel' | 'awaiting';
  label: string;
}

export default function OversightScreen({ onToast, onNavigate }: MarketingScreenProps) {
  /* ─── STATE ─── */
  const [view, setView] = useState<View>('queue');
  const [items, setItems] = useState<ReviewItem[]>(INITIAL_ITEMS);
  const [decisions, setDecisions] = useState<DecisionEntry[]>(INITIAL_DECISIONS);
  const [decTab, setDecTab] = useState<DecTab>('all');

  // Filters
  const [q, setQ] = useState('');
  const [reasons, setReasons] = useState<Set<Reason>>(new Set(REASONS));
  const [channels, setChannels] = useState<Set<string>>(new Set(CHANNELS));
  const [awaitingOnly, setAwaitingOnly] = useState(false);

  // Popovers (with draft state for Apply/Cancel pattern)
  const [popReasonOpen, setPopReasonOpen] = useState(false);
  const [popChannelOpen, setPopChannelOpen] = useState(false);
  const [draftReasons, setDraftReasons] = useState<Set<Reason>>(new Set(REASONS));
  const [draftChannels, setDraftChannels] = useState<Set<string>>(new Set(CHANNELS));

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Peek
  const [peekId, setPeekId] = useState<string | null>(null);

  // Decision modal
  const [decisionAction, setDecisionAction] = useState<ReviewAction | null>(null);
  const [decisionIds, setDecisionIds] = useState<string[]>([]);
  const [decisionReason, setDecisionReason] = useState<Reason | ''>('');
  const [decisionReviewer, setDecisionReviewer] = useState<string>(REVIEWERS[0]);
  const [decisionNote, setDecisionNote] = useState('');

  // Rules modal
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rules, setRules] = useState<Rule[]>(INITIAL_RULES);

  // Row menu
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);

  /* ─── DERIVED ─── */
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      const ql = q.toLowerCase();
      const textOK = !ql || (it.title + ' ' + it.caption + ' ' + it.channel + ' ' + it.author).toLowerCase().includes(ql);
      const reasonOK = reasons.has(it.reason);
      const channelOK = channels.has(it.channel);
      const stateOK = !awaitingOnly || it.state === 'awaiting';
      return textOK && reasonOK && channelOK && stateOK;
    });
  }, [items, q, reasons, channels, awaitingOnly]);

  const statAwaiting = items.filter(i => i.state === 'awaiting').length;

  const filteredDecisions = useMemo(() => {
    return decisions.filter(d => decTab === 'all' || d.decision === decTab);
  }, [decisions, decTab]);

  const chips: Chip[] = [];
  if (q) chips.push({ k: 'q', label: `Search: "${q}"` });
  if (reasons.size !== REASONS.length) {
    chips.push({ k: 'reason', label: `Reason: ${[...reasons].map(r => REASON_LABEL[r]).join(', ') || 'none'}` });
  }
  if (channels.size !== CHANNELS.length) {
    chips.push({ k: 'channel', label: `Channel: ${[...channels].join(', ') || 'none'}` });
  }
  if (awaitingOnly) chips.push({ k: 'awaiting', label: 'Awaiting only' });

  const allChecked = filteredItems.length > 0 && filteredItems.every(it => selected.has(it.id));
  const someChecked = filteredItems.some(it => selected.has(it.id));

  const peekItem = peekId ? items.find(it => it.id === peekId) : null;

  /* ─── HANDLERS ─── */
  function navigateTo(key: string) {
    if (onNavigate) onNavigate('social', key);
    onToast(`Navigate → ${key}`);
  }

  function toggleView(v: View) {
    setView(v);
    if (v === 'decisions') setDecTab('all');
    setRowMenuForId(null);
  }

  function clearAllFilters() {
    setQ('');
    const allR = new Set(REASONS);
    setReasons(allR);
    setDraftReasons(allR);
    const allC = new Set<string>(CHANNELS);
    setChannels(allC);
    setDraftChannels(allC);
    setAwaitingOnly(false);
  }

  function clearChip(k: Chip['k']) {
    if (k === 'q') setQ('');
    if (k === 'reason') {
      const all = new Set(REASONS);
      setReasons(all);
      setDraftReasons(all);
    }
    if (k === 'channel') {
      const all = new Set<string>(CHANNELS);
      setChannels(all);
      setDraftChannels(all);
    }
    if (k === 'awaiting') setAwaitingOnly(false);
  }

  function toggleRow(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    if (allChecked) {
      setSelected(prev => {
        const n = new Set(prev);
        filteredItems.forEach(it => n.delete(it.id));
        return n;
      });
    } else {
      setSelected(prev => {
        const n = new Set(prev);
        filteredItems.forEach(it => n.add(it.id));
        return n;
      });
    }
  }

  function openPeek(id: string) {
    setPeekId(id);
    setRowMenuForId(null);
  }
  function closePeek() {
    setPeekId(null);
  }

  function openDecision(action: ReviewAction, ids: string[]) {
    if (!ids.length) { onToast('Select at least one item'); return; }
    setDecisionAction(action);
    setDecisionIds(ids);
    setDecisionReason('');
    setDecisionReviewer(REVIEWERS[0]);
    setDecisionNote('');
    setRowMenuForId(null);
  }
  function closeDecision() {
    setDecisionAction(null);
    setDecisionIds([]);
  }
  function confirmDecision() {
    if (!decisionAction) return;
    if (decisionAction !== 'assign' && !decisionReason) {
      onToast('Pick a reason before confirming');
      return;
    }
    const action = decisionAction;
    const ids = decisionIds.slice();
    const reviewer = decisionReviewer;
    const reason = (decisionReason || 'brand') as Reason;
    const note = decisionNote;

    if (action === 'assign') {
      const idSet = new Set(ids);
      setItems(prev => prev.map(it => idSet.has(it.id) ? { ...it, reviewer } : it));
      onToast('Assigned to ' + reviewer);
    } else {
      const state: State = action === 'approve' ? 'approved' : action === 'changes' ? 'changes' : 'rejected';
      const idSet = new Set(ids);
      const newDecs: DecisionEntry[] = ids.map(id => {
        const it = items.find(x => x.id === id);
        return { when: new Date().toISOString(), title: (it && it.title) || id, decision: state, reviewer, reason, note: note || '—' };
      });
      setItems(prev => prev.map(it => idSet.has(it.id) ? { ...it, state, reviewer } : it));
      setDecisions(prev => [...newDecs, ...prev]);
      onToast(action === 'approve' ? 'Approved' : action === 'changes' ? 'Changes requested' : 'Rejected');
    }
    closeDecision();
    setPeekId(null);
  }

  function bulkAction(action: string) {
    if (action === 'Clear') {
      setSelected(new Set());
      return;
    }
    const ids = [...selected];
    const normalized: ReviewAction =
      action === 'Approve' ? 'approve' :
      action === 'Request changes' ? 'changes' :
      action === 'Reject' ? 'reject' : 'assign';
    openDecision(normalized, ids);
  }

  function rowMenuAction(act: string, id: string) {
    setRowMenuForId(null);
    if (act === 'preview' || act === 'open') openPeek(id);
    else if (act === 'approve') openDecision('approve', [id]);
    else if (act === 'changes') openDecision('changes', [id]);
    else if (act === 'reject') openDecision('reject', [id]);
    else if (act === 'assign') openDecision('assign', [id]);
  }

  function revertDecision(d: DecisionEntry) {
    setItems(prev => prev.map(it => it.title === d.title ? { ...it, state: 'awaiting' } : it));
    setDecisions(prev => prev.filter(x => !(x.when === d.when && x.title === d.title)));
    onToast(`Reverted "${d.title}"`);
  }

  function handleExport() {
    const rows = filteredItems.map(it => ({
      id: it.id,
      title: it.title,
      caption: it.caption,
      channel: it.channel,
      author: it.author,
      scheduled: it.scheduled,
      reason: REASON_LABEL[it.reason],
      reviewer: it.reviewer,
      state: STATE_LABEL[it.state],
      flag: it.flag,
      note: it.note,
    }));
    exportToCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'id', label: 'Review ID' },
      { key: 'title', label: 'Title' },
      { key: 'caption', label: 'Caption' },
      { key: 'channel', label: 'Channel' },
      { key: 'author', label: 'Author' },
      { key: 'scheduled', label: 'Scheduled' },
      { key: 'reason', label: 'Reason' },
      { key: 'reviewer', label: 'Reviewer' },
      { key: 'state', label: 'State' },
      { key: 'flag', label: 'Flag' },
      { key: 'note', label: 'Note' },
    ], 'oversight');
    onToast(`Exported ${rows.length} oversight items`);
  }

  function saveRules() {
    setRulesOpen(false);
    onToast('Oversight rules saved');
  }

  /* ─── RENDER ─── */
  return (
    <main className="px-6 pb-12">

      {/* ─── DOMAIN TABSTRIP ─── */}
      <div className="flex items-center gap-1 mt-4 mb-1 border-b border-surface-dim overflow-x-auto">
        {NAV_ITEMS.map(n => (
          <button key={n.key} className={`h-9 px-3 text-label-md tab-underline ${n.key === 'oversight' ? 'active' : 'text-on-surface-variant'}`} onClick={() => navigateTo(n.key)}>{n.label}</button>
        ))}
      </div>

      {/* ─── HEADER ─── */}
      <div className="flex items-center justify-between gap-4 py-4">
        <div>
          <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
            <span>Marketing</span><span className="text-outline">/</span>
            <span>Social publishing</span><span className="text-outline">/</span>
            <span>Oversight</span>
          </div>
          <h1 className="text-headline-lg">Publishing oversight</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Review, approve, reject, or flag content before it publishes. Every decision is logged and reversible.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="view-toggle">
            <button className={view === 'queue' ? 'active' : ''} onClick={() => toggleView('queue')}>Queue</button>
            <button className={view === 'decisions' ? 'active' : ''} onClick={() => toggleView('decisions')}>Decisions log</button>
          </div>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => setRulesOpen(true)}>
            <span className="material-symbols-outlined text-[16px]">rule</span>Oversight rules
          </button>
        </div>
      </div>

      {/* ─── SUMMARY STRIP ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Awaiting review</span>
          <div className="text-headline-lg mt-1">{statAwaiting}</div>
          <div className="text-[11px] text-on-surface-variant mt-1">3 flagged by rules · 4 manual</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Approved this week</span>
          <div className="text-headline-lg mt-1">23</div>
          <div className="text-[11px] text-secondary mt-1">+6 vs last week</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Rejected / changes</span>
          <div className="text-headline-lg mt-1">4</div>
          <div className="text-[11px] text-error mt-1">2 in revision</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Avg. review time</span>
          <div className="text-headline-lg mt-1">2.1h</div>
          <div className="text-[11px] text-secondary mt-1">−0.4h vs last week</div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
           QUEUE VIEW
           ═══════════════════════════════════════════════════════════ */}
      <section className={view === 'queue' ? '' : 'hidden-imp'}>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-8 pl-7 pr-2 bg-white border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search content, channel, author…" value={q} onChange={e => setQ(e.target.value)} />
          </div>

          {/* Reason popover */}
          <div className="relative">
            <button className="h-8 px-2.5 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); const willOpen = !popReasonOpen; setPopReasonOpen(willOpen); setPopChannelOpen(false); if (willOpen) setDraftReasons(new Set(reasons)); }}>
              <span className="material-symbols-outlined text-[14px]">flag</span>Reason
              <span className="text-[10px] text-on-surface-variant">{reasons.size === REASONS.length ? '' : `(${reasons.size})`}</span>
            </button>
            {popReasonOpen && (
              <div className="popover absolute left-0 top-9 p-3 w-64" onClick={e => e.stopPropagation()}>
                <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">Filter by reason</div>
                {REASONS.map(r => (
                  <label key={r} className="flex items-center gap-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftReasons.has(r)} onChange={() => { const n = new Set(draftReasons); if (n.has(r)) n.delete(r); else n.add(r); setDraftReasons(n); }} />
                    {REASON_LABEL[r]}
                  </label>
                ))}
                <div className="flex justify-end gap-2 mt-3">
                  <button className="h-7 px-2 text-body-sm border border-surface-dim rounded hover:bg-surface-container-low" onClick={() => { const all = new Set(REASONS); setReasons(all); setDraftReasons(all); setPopReasonOpen(false); }}>Clear</button>
                  <button className="h-7 px-2 text-body-sm bg-primary text-white rounded hover:bg-primary-container font-semibold" onClick={() => { setReasons(new Set(draftReasons)); setPopReasonOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>

          {/* Channel popover */}
          <div className="relative">
            <button className="h-8 px-2.5 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); const willOpen = !popChannelOpen; setPopChannelOpen(willOpen); setPopReasonOpen(false); if (willOpen) setDraftChannels(new Set(channels)); }}>
              <span className="material-symbols-outlined text-[14px]">hub</span>Channel
            </button>
            {popChannelOpen && (
              <div className="popover absolute left-0 top-9 p-3 w-56" onClick={e => e.stopPropagation()}>
                <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">Filter by channel</div>
                {CHANNELS.map(c => (
                  <label key={c} className="flex items-center gap-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftChannels.has(c)} onChange={() => { const n = new Set(draftChannels); if (n.has(c)) n.delete(c); else n.add(c); setDraftChannels(n); }} />
                    {c}
                  </label>
                ))}
                <div className="flex justify-end gap-2 mt-3">
                  <button className="h-7 px-2 text-body-sm border border-surface-dim rounded hover:bg-surface-container-low" onClick={() => { const all = new Set<string>(CHANNELS); setChannels(all); setDraftChannels(all); setPopChannelOpen(false); }}>Clear</button>
                  <button className="h-7 px-2 text-body-sm bg-primary text-white rounded hover:bg-primary-container font-semibold" onClick={() => { setChannels(new Set(draftChannels)); setPopChannelOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>

          <button className={`h-8 px-2.5 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 ${awaitingOnly ? 'border-primary text-primary' : ''}`} onClick={() => setAwaitingOnly(v => !v)}>
            <span className="material-symbols-outlined text-[14px]">schedule</span>Awaiting only
          </button>

          <span className="ml-auto text-[11px] text-on-surface-variant">{filteredItems.length ? `1–${filteredItems.length} of ${filteredItems.length}` : '0 of 0'}</span>
        </div>

        {/* Active chips */}
        {chips.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-outline">Active:</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {chips.map(c => (
                <span key={c.k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-medium">
                  {c.label}
                  <button className="w-4 h-4 rounded-full hover:bg-surface-container-high flex items-center justify-center" onClick={() => clearChip(c.k)}>
                    <span className="material-symbols-outlined text-[12px]">close</span>
                  </button>
                </span>
              ))}
            </div>
            <button className="text-[11px] text-primary hover:underline font-medium ml-1" onClick={clearAllFilters}>Clear all</button>
          </div>
        )}

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="bulk-bar show px-4 py-2 flex items-center gap-3 text-body-sm mb-2 rounded">
            <span className="font-semibold">{selected.size} selected</span>
            <div className="w-px h-4 bg-white/30"></div>
            <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Approve')}><span className="material-symbols-outlined text-[15px]">check_circle</span>Approve</button>
            <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Request changes')}><span className="material-symbols-outlined text-[15px]">edit_note</span>Request changes</button>
            <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Reject')}><span className="material-symbols-outlined text-[15px]">block</span>Reject</button>
            <button className="flex items-center gap-1 hover:underline" onClick={() => bulkAction('Assign reviewer')}><span className="material-symbols-outlined text-[15px]">person_add</span>Assign reviewer</button>
            <button className="ml-auto flex items-center gap-1 hover:underline" onClick={() => bulkAction('Clear')}><span className="material-symbols-outlined text-[15px]">close</span>Clear</button>
          </div>
        )}

        {/* Oversight queue table */}
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
          {filteredItems.length === 0 ? (
            <div className="py-12 px-8 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-[28px] text-outline">verified</span>
              </div>
              <h3 className="text-headline-sm mb-1">Nothing to review</h3>
              <p className="text-body-sm text-on-surface-variant mb-3">No items match your filters. Clear them to see the full queue.</p>
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={clearAllFilters}>Clear filters</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm min-w-[1180px]">
                <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                  <tr>
                    <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} /></th>
                    <th className="px-3 py-2">Content</th>
                    <th className="px-3 py-2">Channel</th>
                    <th className="px-3 py-2">Author</th>
                    <th className="px-3 py-2">Scheduled</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Reviewer</th>
                    <th className="px-3 py-2">State</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-dim">
                  {filteredItems.map(it => (
                    <tr key={it.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openPeek(it.id)}>
                      <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={selected.has(it.id)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(it.id)} /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="post-thumb"><span className="material-symbols-outlined text-[18px]">image</span></div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{it.title}</div>
                            <div className="text-[11px] text-on-surface-variant truncate">{it.caption}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">{it.channel}</td>
                      <td className="px-3 py-2">{it.author}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(it.scheduled)}</td>
                      <td className="px-3 py-2"><ReasonChip reason={it.reason} /></td>
                      <td className="px-3 py-2">{it.reviewer === '—' ? <span className="text-on-surface-variant">Unassigned</span> : <span className="reviewer-chip"><span className="material-symbols-outlined text-[12px]">person</span>{it.reviewer}</span>}</td>
                      <td className="px-3 py-2"><StatePill state={it.state} /></td>
                      <td className="px-2 py-2 text-right relative">
                        <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === it.id ? null : it.id); }}>
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                        </button>
                        {rowMenuForId === it.id && (
                          <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                            <div className="menu-header">{it.id}</div>
                            <button onClick={() => rowMenuAction('preview', it.id)}><span className="material-symbols-outlined">visibility</span>Preview</button>
                            <button onClick={() => rowMenuAction('approve', it.id)}><span className="material-symbols-outlined text-primary">check_circle</span>Approve</button>
                            <button onClick={() => rowMenuAction('changes', it.id)}><span className="material-symbols-outlined">edit_note</span>Request changes</button>
                            <button className="danger" onClick={() => rowMenuAction('reject', it.id)}><span className="material-symbols-outlined">block</span>Reject</button>
                            <div className="sep"></div>
                            <button onClick={() => rowMenuAction('assign', it.id)}><span className="material-symbols-outlined">person_add</span>Assign reviewer</button>
                            <button onClick={() => rowMenuAction('open', it.id)}><span className="material-symbols-outlined">open_in_new</span>Open full record</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
           DECISIONS LOG VIEW
           ═══════════════════════════════════════════════════════════ */}
      <section className={view === 'decisions' ? '' : 'hidden-imp'}>
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
          <div className="flex items-center justify-between px-4 h-11 border-b border-surface-dim">
            <div className="flex items-center gap-1">
              {(['all', 'approved', 'rejected', 'changes'] as DecTab[]).map(t => (
                <button key={t} className={`h-full px-3 text-label-md tab-underline ${decTab === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => setDecTab(t)}>
                  {t === 'all' ? 'All decisions' : t === 'approved' ? 'Approved' : t === 'rejected' ? 'Rejected' : 'Changes requested'}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-on-surface-variant">Immutable audit log</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm min-w-[1000px]">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Content</th>
                  <th className="px-3 py-2">Decision</th>
                  <th className="px-3 py-2">Reviewer</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {filteredDecisions.length === 0 ? (
                  <tr><td colSpan={7}><div className="py-10 text-center text-body-sm text-on-surface-variant">No decisions in this view.</div></td></tr>
                ) : filteredDecisions.map((d, i) => (
                  <tr key={`${d.when}-${i}`} className="hover:bg-surface-container-low">
                    <td className="px-3 py-2 tabular-nums">{fmt(d.when)}</td>
                    <td className="px-3 py-2 font-medium">{d.title}</td>
                    <td className="px-3 py-2"><StatePill state={d.decision} /></td>
                    <td className="px-3 py-2">{d.reviewer}</td>
                    <td className="px-3 py-2"><ReasonChip reason={d.reason} /></td>
                    <td className="px-3 py-2 text-[11px] text-on-surface-variant">{d.note}</td>
                    <td className="px-2 py-2 text-right relative">
                      <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => revertDecision(d)}>
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">undo</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Click-away catcher for row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* Peek drawer */}
      {peekItem && (
        <>
          <div className="scrim open" onClick={closePeek} />
          <div className="peek open">
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">fact_check</span>
                <span className="text-headline-sm truncate">{peekItem.title}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => openDecision('approve', [peekItem.id])}>
                  <span className="material-symbols-outlined text-[14px]">check</span>Approve
                </button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={closePeek}>
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-body-sm">
              <div className="mb-3 flex items-center gap-2">
                <StatePill state={peekItem.state} />
                <ReasonChip reason={peekItem.reason} />
              </div>
              <div className="bg-surface-container-low rounded-lg p-3 mb-3">
                <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-1">Flag</div>
                <div className="text-body-sm">{peekItem.flag.replace(/_/g, ' ')} — {peekItem.note}</div>
              </div>
              <dl className="divide-y divide-surface-dim text-body-sm">
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Channel</dt><dd>{peekItem.channel}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Author</dt><dd>{peekItem.author}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Scheduled</dt><dd className="tabular-nums">{fmt(peekItem.scheduled)}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Reviewer</dt><dd>{peekItem.reviewer}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Reason</dt><dd>{REASON_LABEL[peekItem.reason]}</dd></div>
              </dl>
              <div className="mt-4 pt-3 border-t border-surface-dim">
                <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-1">Caption</div>
                <div className="text-body-sm whitespace-pre-wrap">{peekItem.caption}</div>
              </div>
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => openDecision('approve', [peekItem.id])}><span className="material-symbols-outlined text-[16px]">check_circle</span>Approve</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => openDecision('changes', [peekItem.id])}><span className="material-symbols-outlined text-[16px]">edit_note</span>Request changes</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md text-error hover:bg-error-container/40 flex items-center justify-center gap-1" onClick={() => openDecision('reject', [peekItem.id])}><span className="material-symbols-outlined text-[16px]">block</span>Reject</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => openDecision('assign', [peekItem.id])}><span className="material-symbols-outlined text-[16px]">person_add</span>Assign</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Decision modal (used for Approve / Request changes / Reject / Assign) */}
      {decisionAction && (
        <div className="modal-scrim open" onClick={closeDecision}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">{DECISION_TITLES[decisionAction]}</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">{DECISION_SUBS[decisionAction]}</p>

            {decisionAction !== 'assign' && (
              <div className="mb-3">
                <label className="block text-label-sm text-on-surface-variant mb-1">Reason</label>
                <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={decisionReason} onChange={e => setDecisionReason(e.target.value as Reason | '')}>
                  <option value="">— Select a reason —</option>
                  {REASONS.map(r => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
                </select>
              </div>
            )}
            <div className="mb-3">
              <label className="block text-label-sm text-on-surface-variant mb-1">Reviewer</label>
              <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={decisionReviewer} onChange={e => setDecisionReviewer(e.target.value)}>
                {REVIEWERS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {decisionAction !== 'assign' && (
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">Note (visible to author)</label>
                <textarea className="w-full min-h-[80px] p-2 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="What should the author know?" value={decisionNote} onChange={e => setDecisionNote(e.target.value)} />
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeDecision}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={confirmDecision}>{DECISION_TITLES[decisionAction].split(' ')[0]}</button>
            </div>
          </div>
        </div>
      )}

      {/* Oversight rules modal */}
      {rulesOpen && (
        <div className="modal-scrim open" onClick={() => setRulesOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Oversight rules</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Automatic review flags. Anything matching a rule is routed to the queue before publishing.</p>
            <div className="space-y-2">
              {rules.map((r, i) => (
                <label key={r.id} className="flex items-center justify-between p-2 rounded border border-surface-dim">
                  <span className="text-body-sm"><strong>{r.name}</strong><div className="text-[11px] text-on-surface-variant">{r.category}</div></span>
                  <input type="checkbox" checked={r.enabled} onChange={() => setRules(prev => prev.map((x, j) => j === i ? { ...x, enabled: !x.enabled } : x))} />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setRulesOpen(false)}>Close</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={saveRules}>Save rules</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
