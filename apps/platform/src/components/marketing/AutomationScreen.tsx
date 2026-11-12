'use client';
/* AutomationScreen — 1:1 port of upload/marketing_extracted/Marketing/automation.html
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
interface Step { kind: string; label: string; }
interface Recipe {
  id: string;
  name: string;
  trigger: string;
  triggerDesc: string;
  steps: Step[];
  runs7d: number;
  success: number;
  lastRun: string;
  status: 'Active' | 'Paused' | 'Draft';
}
interface Run {
  started: string;
  recipe: string;
  subject: string;
  step: string;
  steps: string;
  duration: string;
  result: 'Success' | 'Failed' | 'Pending';
}
interface Trigger { value: string; source: string; }
interface StepKindMeta { label: string; cls: string; icon: string; }

const INITIAL_RECIPES: Recipe[] = [
  { id: 'a1', name: 'Abandoned cart recovery', trigger: 'Cart abandoned', triggerDesc: 'Fires 1h after a customer leaves checkout with items',
    steps: [
      { kind: 'wait', label: 'Wait 1 hour' },
      { kind: 'email', label: 'Send email · Cart reminder #1' },
      { kind: 'wait', label: 'Wait 23 hours' },
      { kind: 'email', label: 'Send email · Cart reminder #2' },
      { kind: 'condition', label: 'If order not created' },
    ],
    runs7d: 542, success: 99.2, lastRun: '2026-11-02T09:14', status: 'Active' },
  { id: 'a2', name: 'Welcome series', trigger: 'Customer created', triggerDesc: 'Fires when a new customer is created',
    steps: [
      { kind: 'email', label: 'Send email · Welcome' },
      { kind: 'wait', label: 'Wait 2 days' },
      { kind: 'email', label: 'Send email · How to shop' },
      { kind: 'wait', label: 'Wait 5 days' },
      { kind: 'email', label: 'Send email · First offer' },
    ],
    runs7d: 186, success: 100, lastRun: '2026-11-02T10:02', status: 'Active' },
  { id: 'a3', name: 'Post-purchase review', trigger: 'Order created', triggerDesc: 'Fires when an order is created in any channel',
    steps: [
      { kind: 'wait', label: 'Wait 14 days' },
      { kind: 'email', label: 'Send email · Review request' },
      { kind: 'condition', label: 'If review not submitted' },
      { kind: 'wait', label: 'Wait 7 days' },
      { kind: 'email', label: 'Send email · Review reminder' },
    ],
    runs7d: 312, success: 98.1, lastRun: '2026-11-02T07:12', status: 'Active' },
  { id: 'a4', name: 'Invoice paid → thank you', trigger: 'Invoice paid', triggerDesc: 'Fires when an invoice is paid in Finance',
    steps: [
      { kind: 'email', label: 'Send email · Thank you' },
      { kind: 'segment', label: 'Add to segment · Paid invoices' },
      { kind: 'webhook', label: 'POST to Slack' },
    ],
    runs7d: 88, success: 100, lastRun: '2026-11-01T16:40', status: 'Active' },
  { id: 'a5', name: 'Win-back (paused)', trigger: 'Schedule', triggerDesc: 'Fires on a recurring cadence',
    steps: [
      { kind: 'condition', label: 'If no order in 60d' },
      { kind: 'email', label: 'Send email · We miss you' },
      { kind: 'wait', label: 'Wait 7 days' },
      { kind: 'email', label: 'Send email · Final offer' },
    ],
    runs7d: 0, success: 0, lastRun: '2026-10-20T08:00', status: 'Paused' },
  { id: 'a6', name: 'New automation (draft)', trigger: 'Order created', triggerDesc: 'Fires when an order is created in any channel',
    steps: [
      { kind: 'condition', label: 'If order total > $50' },
    ],
    runs7d: 0, success: 0, lastRun: '—', status: 'Draft' },
];

const RUNS: Run[] = [
  { started: '2026-11-02T09:14', recipe: 'Abandoned cart recovery', subject: 'Acme Corp', step: 'Send email · Cart reminder #1', steps: '2 / 5', duration: '1.2s', result: 'Success' },
  { started: '2026-11-02T09:05', recipe: 'Welcome series', subject: 'Blue Ridge Co.', step: 'Wait 2 days', steps: '2 / 5', duration: '—', result: 'Pending' },
  { started: '2026-11-02T08:42', recipe: 'Post-purchase review', subject: 'Northwind Labs', step: 'Send email · Review request', steps: '2 / 5', duration: '0.9s', result: 'Success' },
  { started: '2026-11-02T07:12', recipe: 'Invoice paid → thank you', subject: 'INV-1054', step: 'POST to Slack', steps: '3 / 3', duration: '0.6s', result: 'Success' },
  { started: '2026-11-02T06:58', recipe: 'Abandoned cart recovery', subject: 'Maple Supply', step: 'Send email · Cart reminder #2', steps: '4 / 5', duration: '—', result: 'Failed' },
  { started: '2026-11-02T06:32', recipe: 'Welcome series', subject: 'Orion Apparel', step: 'Send email · Welcome', steps: '1 / 5', duration: '1.1s', result: 'Success' },
];

const statusPillMap: Record<string, string> = {
  Active: 'bg-secondary-container text-on-secondary-container',
  Paused: 'bg-qb-maroon/15 text-qb-maroon',
  Draft: 'bg-surface-container text-on-surface-variant',
};
const runResultPillMap: Record<string, string> = {
  Success: 'bg-secondary-container text-on-secondary-container',
  Failed: 'bg-error-container text-on-error-container',
  Pending: 'bg-tertiary/15 text-tertiary',
};
const TRIGGERS: Trigger[] = [
  { value: 'Order created', source: 'Commerce' },
  { value: 'Customer created', source: 'CRM' },
  { value: 'Cart abandoned', source: 'Commerce' },
  { value: 'Invoice paid', source: 'Finance' },
  { value: 'Schedule', source: 'Schedule' },
  { value: 'Form submitted', source: 'Marketing' },
];
const STEP_KINDS: Record<string, StepKindMeta> = {
  email: { label: 'Send email', cls: 'action', icon: 'mail' },
  webhook: { label: 'Send webhook', cls: 'action', icon: 'webhook' },
  segment: { label: 'Add to segment', cls: 'action', icon: 'groups' },
  task: { label: 'Create task', cls: 'action', icon: 'task_alt' },
  post: { label: 'Publish social post', cls: 'action', icon: 'share' },
  condition: { label: 'Condition', cls: 'condition', icon: 'call_split' },
  branch: { label: 'Branch', cls: 'condition', icon: 'alt_route' },
  wait: { label: 'Wait', cls: 'wait', icon: 'schedule' },
  until: { label: 'Wait until time', cls: 'wait', icon: 'event' },
  window: { label: 'Send window', cls: 'wait', icon: 'hourglass_bottom' },
};

const STATUS_OPTIONS = ['Active', 'Paused', 'Draft'];

const TEMPLATES: Record<string, { name: string; trigger: string; steps: Step[] }> = {
  welcome: { name: 'Welcome series', trigger: 'Customer created', steps: [{ kind: 'email', label: 'Send email · Welcome' }, { kind: 'wait', label: 'Wait 2 days' }, { kind: 'email', label: 'Send email · How to shop' }] },
  abandoned: { name: 'Abandoned cart', trigger: 'Cart abandoned', steps: [{ kind: 'wait', label: 'Wait 1 hour' }, { kind: 'email', label: 'Send email · Cart reminder #1' }, { kind: 'condition', label: 'If order not created' }] },
  review: { name: 'Post-purchase review', trigger: 'Order created', steps: [{ kind: 'wait', label: 'Wait 14 days' }, { kind: 'email', label: 'Send email · Review request' }] },
  winback: { name: 'Win-back', trigger: 'Schedule', steps: [{ kind: 'condition', label: 'If no order in 60d' }, { kind: 'email', label: 'Send email · We miss you' }] },
};

/* ─── helpers (from HTML <script>) ─── */
function statusPill(s: string) {
  return <span className={`px-2 py-0.5 rounded-full text-label-sm ${statusPillMap[s] || 'bg-surface-container text-on-surface-variant'}`}>{s}</span>;
}
function runResultPill(s: string) {
  return <span className={`px-2 py-0.5 rounded-full text-label-sm ${runResultPillMap[s] || 'bg-surface-container text-on-surface-variant'}`}>{s}</span>;
}
function fmt(iso: string) {
  if (!iso || iso === '—') return '—';
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}
function stepIconColor(cls: string) {
  return cls === 'action' ? 'text-qb-maroon' : cls === 'condition' ? 'text-qb-blue' : 'text-[#98713e]';
}
function stepPillCls(kind: string) {
  return kind === 'condition' || kind === 'wait' ? 'pending' : 'ok';
}

interface RowMenuState { id: string; top: number; left: number; }
interface ActivateMenuState { top: number; left: number; }

export default function AutomationScreen({ onToast }: MarketingScreenProps) {
  /* ─── state (mirrors HTML's filters, editing, peekId, etc.) ─── */
  const [recipes, setRecipes] = useState<Recipe[]>(INITIAL_RECIPES);
  const [view, setView] = useState<'recipes' | 'runs'>('recipes');
  const [q, setQ] = useState('');
  const [triggers, setTriggers] = useState<Set<string>>(new Set(TRIGGERS.map(t => t.value)));
  const [statuses, setStatuses] = useState<Set<string>>(new Set(STATUS_OPTIONS));
  const [popTriggerOpen, setPopTriggerOpen] = useState(false);
  const [popStatusOpen, setPopStatusOpen] = useState(false);
  const [draftTriggers, setDraftTriggers] = useState<Set<string>>(new Set(TRIGGERS.map(t => t.value)));
  const [draftStatuses, setDraftStatuses] = useState<Set<string>>(new Set(STATUS_OPTIONS));
  const [runsFilter, setRunsFilter] = useState<'all' | 'success' | 'failed' | 'pending'>('all');
  const [peekId, setPeekId] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<RowMenuState | null>(null);

  // editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [editorTab, setEditorTab] = useState<'canvas' | 'settings' | 'runs'>('canvas');
  const [draftSteps, setDraftSteps] = useState<Step[]>([]);
  const [draftTrigger, setDraftTrigger] = useState<Trigger>({ value: 'Order created', source: 'Commerce' });
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [stepModalOpen, setStepModalOpen] = useState(false);
  const [stepModalInsertAt, setStepModalInsertAt] = useState<number>(0);
  const [triggerModalOpen, setTriggerModalOpen] = useState(false);
  const [triggerModalPick, setTriggerModalPick] = useState<string>('Order created');
  const [activateMenu, setActivateMenu] = useState<ActivateMenuState | null>(null);

  // editor settings tab state
  const [eName, setEName] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eEnv, setEEnv] = useState<'live' | 'test'>('live');
  const [eReentry, setEReentry] = useState(false);
  const [eStopgoal, setEStopgoal] = useState(true);
  const [eTestbefore, setETestbefore] = useState(true);
  const [eNotify, setENotify] = useState(true);

  // inspector form state
  const [inspLabel, setInspLabel] = useState('');
  const [inspWaitAmt, setInspWaitAmt] = useState(1);
  const [inspWaitUnit, setInspWaitUnit] = useState('Minutes');
  const [inspEmail, setInspEmail] = useState('Welcome');
  const [inspCond, setInspCond] = useState('order total > $50');
  const [inspUrl, setInspUrl] = useState('');

  /* ─── derived (mirrors filteredRecipes, renderRuns) ─── */
  const filteredRecipes = useMemo(() => recipes.filter(r => {
    const ql = q.toLowerCase();
    const qOK = !ql || (r.name + ' ' + r.trigger + ' ' + r.steps.map(s => s.label).join(' ')).toLowerCase().includes(ql);
    const tOK = triggers.has(r.trigger);
    const sOK = statuses.has(r.status);
    return qOK && tOK && sOK;
  }), [recipes, q, triggers, statuses]);

  const filteredRuns = useMemo(() => {
    const map: Record<string, Run['result']> = { success: 'Success', failed: 'Failed', pending: 'Pending' };
    return RUNS.filter(r => runsFilter === 'all' || r.result === map[runsFilter]);
  }, [runsFilter]);

  const chips = useMemo(() => {
    const list: { k: 'q' | 'triggers' | 'statuses'; label: string }[] = [];
    if (q) list.push({ k: 'q', label: `Search: "${q}"` });
    if (triggers.size !== TRIGGERS.length) list.push({ k: 'triggers', label: `Trigger: ${[...triggers].join(', ') || 'none'}` });
    if (statuses.size !== STATUS_OPTIONS.length) list.push({ k: 'statuses', label: `Status: ${[...statuses].join(', ') || 'none'}` });
    return list;
  }, [q, triggers, statuses]);

  const activeCount = recipes.filter(r => r.status === 'Active').length;
  const editorRuns = useMemo(() => RUNS.filter(r => !editing || r.recipe === editing.name), [editing]);

  const triggerDescText = (() => {
    const t = TRIGGERS.find(x => x.value === draftTrigger.value);
    return t && t.source === 'Schedule' ? 'Fires on a recurring cadence' : `Fires when ${draftTrigger.value.toLowerCase()}`;
  })();

  const peek = peekId ? recipes.find(r => r.id === peekId) : null;

  /* ─── handlers ─── */
  function openPeek(id: string) { setPeekId(id); }
  function closePeek() { setPeekId(null); }

  function openEditor(recipe: Recipe | null) {
    setEditing(recipe);
    setDraftSteps(recipe ? recipe.steps.map(s => ({ ...s })) : []);
    setDraftTrigger(recipe
      ? { value: recipe.trigger, source: (TRIGGERS.find(t => t.value === recipe.trigger) || { source: 'Commerce' }).source }
      : { value: 'Order created', source: 'Commerce' });
    setSelectedStepIndex(null);
    setEName(recipe ? recipe.name : '');
    setEDesc('');
    setEEnv('live');
    setEReentry(false);
    setEStopgoal(true);
    setETestbefore(true);
    setENotify(true);
    setEditorTab('canvas');
    setEditorOpen(true);
    setPeekId(null);
    setRowMenu(null);
  }
  function closeEditor() { setEditorOpen(false); setEditing(null); setActivateMenu(null); }

  function openStepModal(insertAt: number) {
    setStepModalInsertAt(insertAt);
    setStepModalOpen(true);
  }
  function handleStepChoice(kind: string) {
    const meta = STEP_KINDS[kind] || { label: kind };
    const at = stepModalInsertAt;
    setDraftSteps(prev => { const n = [...prev]; n.splice(at, 0, { kind, label: meta.label }); return n; });
    setSelectedStepIndex(at);
    setStepModalOpen(false);
  }
  function handleStepRemove(idx: number) {
    setDraftSteps(prev => prev.filter((_, j) => j !== idx));
    if (selectedStepIndex === idx) setSelectedStepIndex(null);
    else if (selectedStepIndex !== null && selectedStepIndex > idx) setSelectedStepIndex(selectedStepIndex - 1);
  }
  function handleStepSelect(idx: number) {
    setSelectedStepIndex(idx);
    const s = draftSteps[idx];
    if (s) {
      setInspLabel(s.label);
      if (s.kind === 'condition' || s.kind === 'branch') setInspCond('order total > $50');
    }
  }
  function applyInspector() {
    if (selectedStepIndex === null) return;
    const label = inspLabel.trim();
    setDraftSteps(prev => prev.map((s, i) => i === selectedStepIndex ? { ...s, label: label || s.label } : s));
    onToast('Step updated');
  }

  function openTriggerModal() {
    setTriggerModalPick(draftTrigger.value);
    setTriggerModalOpen(true);
  }
  function confirmTriggerPick() {
    const t = TRIGGERS.find(x => x.value === triggerModalPick);
    setDraftTrigger({ value: triggerModalPick, source: (t && t.source) || 'Commerce' });
    setTriggerModalOpen(false);
  }

  function rowAction(act: string, r: Recipe) {
    setRowMenu(null);
    if (act === 'open') openEditor(r);
    else if (act === 'test') onToast('Test run started for ' + r.name);
    else if (act === 'pause') { setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, status: 'Paused' } : x)); onToast('Paused'); }
    else if (act === 'resume') { setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, status: 'Active' } : x)); onToast('Resumed'); }
    else if (act === 'duplicate') {
      const copy: Recipe = { ...r, id: 'a' + Date.now(), name: r.name + ' (copy)', status: 'Draft', runs7d: 0, success: 0, lastRun: '—' };
      setRecipes(prev => [copy, ...prev]);
      onToast('Duplicated');
    } else if (act === 'delete') {
      if (confirm('Delete this automation?')) {
        setRecipes(prev => prev.filter(x => x.id !== r.id));
        onToast('Deleted');
      }
    }
  }
  function openRowMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setRowMenu({ id, top: rect.bottom + 4, left: rect.right - 220 });
  }

  function peekAction(act: string, r: Recipe) {
    if (act === 'open') { closePeek(); openEditor(r); }
    else if (act === 'test') onToast('Test run started');
    else if (act === 'pause') { setRecipes(prev => prev.map(x => x.id === r.id ? { ...x, status: 'Paused' } : x)); closePeek(); onToast('Paused'); }
    else if (act === 'duplicate') {
      const copy: Recipe = { ...r, id: 'a' + Date.now(), name: r.name + ' (copy)', status: 'Draft', runs7d: 0, success: 0, lastRun: '—' };
      setRecipes(prev => [copy, ...prev]);
      closePeek();
      onToast('Duplicated');
    }
  }

  function collectPayload(): { name: string; description: string; trigger: string; triggerDesc: string; steps: Step[]; environment: string; rules: { reentry: boolean; stopgoal: boolean; testbefore: boolean; notify: boolean; } } {
    return {
      name: eName || 'Untitled automation',
      description: eDesc,
      trigger: draftTrigger.value,
      triggerDesc: `Fires on ${draftTrigger.value.toLowerCase()}`,
      steps: draftSteps,
      environment: eEnv,
      rules: { reentry: eReentry, stopgoal: eStopgoal, testbefore: eTestbefore, notify: eNotify },
    };
  }

  function saveEditor() {
    const payload = collectPayload();
    if (editing) {
      setRecipes(prev => prev.map(x => x.id === editing.id ? { ...x, ...payload, triggerDesc: payload.triggerDesc } : x));
    } else {
      const id = 'a' + Date.now();
      const newRecipe: Recipe = { ...payload, id, runs7d: 0, success: 0, lastRun: '—', status: 'Draft' };
      setRecipes(prev => [newRecipe, ...prev]);
    }
    onToast('Automation saved');
    closeEditor();
  }

  function saveWithStatus(status: Recipe['status']) {
    const payload = collectPayload();
    if (editing) {
      setRecipes(prev => prev.map(x => x.id === editing.id ? { ...x, ...payload, status } : x));
    } else {
      const id = 'a' + Date.now();
      const newRecipe: Recipe = { ...payload, id, runs7d: 0, success: 0, lastRun: '—', status };
      setRecipes(prev => [newRecipe, ...prev]);
    }
    onToast('Saved · ' + status);
    closeEditor();
  }

  function handleActivateMenu(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setActivateMenu({ top: rect.bottom + 4, left: rect.right - 260 });
  }

  function testEditor() {
    if (editing) onToast('Test run started');
    else onToast('Save the automation before testing');
  }

  function handleTemplate(key: string) {
    const tpl = TEMPLATES[key]; if (!tpl) return;
    openEditor(null);
    const src = (TRIGGERS.find(x => x.value === tpl.trigger) || { source: 'Commerce' }).source;
    setDraftTrigger({ value: tpl.trigger, source: src });
    setDraftSteps(tpl.steps.map(s => ({ ...s })));
    setEName(tpl.name);
    onToast('Template loaded: ' + tpl.name);
  }

  function clearAllFilters() {
    setQ('');
    setTriggers(new Set(TRIGGERS.map(t => t.value)));
    setStatuses(new Set(STATUS_OPTIONS));
    setDraftTriggers(new Set(TRIGGERS.map(t => t.value)));
    setDraftStatuses(new Set(STATUS_OPTIONS));
  }

  function handleExport() {
    const rows = filteredRecipes as unknown as Record<string, unknown>[];
    exportToCsv(rows, [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Automation' },
      { key: 'trigger', label: 'Trigger' },
      { key: 'triggerDesc', label: 'Trigger desc' },
      { key: 'steps', label: 'Steps' },
      { key: 'runs7d', label: 'Runs (7d)' },
      { key: 'success', label: 'Success %' },
      { key: 'lastRun', label: 'Last run' },
      { key: 'status', label: 'Status' },
    ], 'automations');
    onToast('Exported ' + filteredRecipes.length + ' automations');
  }

  function toggleDraftTrigger(v: string) {
    setDraftTriggers(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  }
  function toggleDraftStatus(v: string) {
    setDraftStatuses(prev => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  }
  function applyTriggerFilter() { setTriggers(new Set(draftTriggers)); setPopTriggerOpen(false); }
  function clearTriggerFilter() { setDraftTriggers(new Set(TRIGGERS.map(t => t.value))); setTriggers(new Set(TRIGGERS.map(t => t.value))); setPopTriggerOpen(false); }
  function applyStatusFilter() { setStatuses(new Set(draftStatuses)); setPopStatusOpen(false); }
  function clearStatusFilter() { setDraftStatuses(new Set(STATUS_OPTIONS)); setStatuses(new Set(STATUS_OPTIONS)); setPopStatusOpen(false); }

  function removeChip(k: 'q' | 'triggers' | 'statuses') {
    if (k === 'q') setQ('');
    if (k === 'triggers') { setTriggers(new Set(TRIGGERS.map(t => t.value))); setDraftTriggers(new Set(TRIGGERS.map(t => t.value))); }
    if (k === 'statuses') { setStatuses(new Set(STATUS_OPTIONS)); setDraftStatuses(new Set(STATUS_OPTIONS)); }
  }

  const recipeCountText = filteredRecipes.length ? `1–${filteredRecipes.length} of ${filteredRecipes.length}` : '0 of 0';

  return (
    <main className="px-6 pb-12">

      {/* ─── DOMAIN TABSTRIP (Marketing) ─── */}
      <div className="flex items-center gap-1 mt-4 mb-1 border-b border-surface-dim overflow-x-auto">
        {(['overview', 'calendar', 'queue', 'create', 'library', 'channels', 'performance', 'oversight', 'promotions', 'newsletter', 'automation'] as const).map(nav => (
          <button key={nav} className={`h-9 px-3 text-label-md tab-underline ${nav === 'automation' ? 'active' : 'text-on-surface-variant'}`} onClick={() => onToast('Navigate → ' + nav)}>
            {nav === 'overview' ? 'Publishing Overview' : nav === 'queue' ? 'Queue' : nav === 'create' ? 'Create Content' : nav === 'library' ? 'Content Library' : nav === 'channels' ? 'Connected Channels' : nav === 'performance' ? 'Performance' : nav === 'oversight' ? 'Oversight' : nav === 'promotions' ? 'Promotions' : nav === 'newsletter' ? 'Newsletter' : 'Automation'}
          </button>
        ))}
      </div>

      {/* ─── HEADER ─── */}
      <div className="flex items-center justify-between gap-4 py-4">
        <div>
          <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
            <span>Marketing</span><span className="text-outline">/</span><span>Automation</span>
          </div>
          <h1 className="text-headline-lg">Automation</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Trigger → condition → action workflows across Marketing, Commerce, and Finance. Every node is visible and every run is logged.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="view-toggle">
            <button className={view === 'recipes' ? 'active' : ''} onClick={() => setView('recipes')}>Recipes</button>
            <button className={view === 'runs' ? 'active' : ''} onClick={() => setView('runs')}>Runs</button>
          </div>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Import automations — file picker')}>
            <span className="material-symbols-outlined text-[16px]">upload</span>Import
          </button>
          <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => openEditor(null)}>
            <span className="material-symbols-outlined text-[16px]">add</span>New automation
          </button>
        </div>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Active automations</span>
          <div className="text-headline-lg mt-1">{activeCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-1">2 paused · 1 draft</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Runs (7d)</span>
          <div className="text-headline-lg mt-1">1,486</div>
          <div className="text-[11px] text-secondary mt-1">+22% vs prior week</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Success rate</span>
          <div className="text-headline-lg mt-1">98.7%</div>
          <div className="text-[11px] text-secondary mt-1">19 failed runs</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-4">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Avg. latency</span>
          <div className="text-headline-lg mt-1">1.4s</div>
          <div className="text-[11px] text-on-surface-variant mt-1">Trigger → action</div>
        </div>
      </div>

      {/* ─── CREATE ACTIONS ROW ─── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => openEditor(null)}>
          <span className="material-symbols-outlined text-[16px]">bolt</span>Blank automation
        </button>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => handleTemplate('welcome')}>
          <span className="material-symbols-outlined text-[16px]">waving_hand</span>Welcome series
        </button>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => handleTemplate('abandoned')}>
          <span className="material-symbols-outlined text-[16px]">shopping_cart</span>Abandoned cart
        </button>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => handleTemplate('review')}>
          <span className="material-symbols-outlined text-[16px]">star</span>Post-purchase review
        </button>
        <button className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5" onClick={() => handleTemplate('winback')}>
          <span className="material-symbols-outlined text-[16px]">history</span>Win-back
        </button>
        <button className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1" onClick={() => onToast('Open global create flyout')}>
          <span className="material-symbols-outlined text-[16px]">apps</span>Show all
        </button>
      </div>

      {/* ════════ RECIPES VIEW ════════ */}
      {view === 'recipes' && (
        <section>

          {/* Filters */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="relative flex items-center flex-1 max-w-sm">
              <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
              <input className="w-full h-8 pl-7 pr-2 bg-white border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter by name, trigger, or action…" value={q} onChange={e => setQ(e.target.value)} />
            </div>

            {/* Trigger popover */}
            <div className="relative">
              <button className="h-8 px-2.5 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopTriggerOpen(v => !v); setPopStatusOpen(false); }}>
                <span className="material-symbols-outlined text-[14px]">bolt</span>Trigger
              </button>
              {popTriggerOpen && (
                <div className="popover absolute left-0 top-9 p-3 w-64" onClick={e => e.stopPropagation()}>
                  <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">Filter by trigger</div>
                  {TRIGGERS.map(t => (
                    <label key={t.value} className="flex items-center gap-2 py-1 text-body-sm">
                      <input type="checkbox" className="row-check" checked={draftTriggers.has(t.value)} onChange={() => toggleDraftTrigger(t.value)} /> {t.value}
                    </label>
                  ))}
                  <div className="flex justify-end gap-2 mt-3">
                    <button className="h-7 px-2 text-body-sm border border-surface-dim rounded hover:bg-surface-container-low" onClick={clearTriggerFilter}>Clear</button>
                    <button className="h-7 px-2 text-body-sm bg-primary text-white rounded hover:bg-primary-container font-semibold" onClick={applyTriggerFilter}>Apply</button>
                  </div>
                </div>
              )}
            </div>

            {/* Status popover */}
            <div className="relative">
              <button className="h-8 px-2.5 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopStatusOpen(v => !v); setPopTriggerOpen(false); }}>
                <span className="material-symbols-outlined text-[14px]">toggle_on</span>Status
              </button>
              {popStatusOpen && (
                <div className="popover absolute left-0 top-9 p-3 w-56" onClick={e => e.stopPropagation()}>
                  <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">Filter by status</div>
                  {STATUS_OPTIONS.map(s => (
                    <label key={s} className="flex items-center gap-2 py-1 text-body-sm">
                      <input type="checkbox" className="row-check" checked={draftStatuses.has(s)} onChange={() => toggleDraftStatus(s)} /> {s}
                    </label>
                  ))}
                  <div className="flex justify-end gap-2 mt-3">
                    <button className="h-7 px-2 text-body-sm border border-surface-dim rounded hover:bg-surface-container-low" onClick={clearStatusFilter}>Clear</button>
                    <button className="h-7 px-2 text-body-sm bg-primary text-white rounded hover:bg-primary-container font-semibold" onClick={applyStatusFilter}>Apply</button>
                  </div>
                </div>
              )}
            </div>

            <span className="ml-auto text-[11px] text-on-surface-variant">{recipeCountText}</span>
          </div>

          {/* Active chips */}
          {chips.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-outline">Active:</span>
              {chips.map(c => (
                <span key={c.k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[11px] font-medium">
                  {c.label}
                  <button className="w-4 h-4 rounded-full hover:bg-surface-container-high flex items-center justify-center" onClick={() => removeChip(c.k)}><span className="material-symbols-outlined text-[12px]">close</span></button>
                </span>
              ))}
              <button className="text-[11px] text-primary hover:underline font-medium ml-1" onClick={clearAllFilters}>Clear all</button>
            </div>
          )}

          {/* Recipes table */}
          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            {filteredRecipes.length === 0 ? (
              <div className="py-12 px-8 text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[28px] text-outline">bolt</span>
                </div>
                <h3 className="text-headline-sm mb-1">No automations match your filters</h3>
                <p className="text-body-sm text-on-surface-variant mb-3">Clear filters or start a new automation.</p>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={clearAllFilters}>Clear filters</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-sm min-w-[1100px]">
                  <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2">Automation</th>
                      <th className="px-3 py-2">Trigger</th>
                      <th className="px-3 py-2">Actions</th>
                      <th className="px-3 py-2 text-right">Runs (7d)</th>
                      <th className="px-3 py-2 text-right">Success</th>
                      <th className="px-3 py-2">Last run</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-dim">
                    {filteredRecipes.map(r => (
                      <tr key={r.id} className="hover:bg-surface-container-low cursor-pointer" onClick={e => { if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input')) return; openPeek(r.id); }}>
                        <td className="px-3 py-2"><div className="font-medium">{r.name}</div><div className="text-[11px] text-on-surface-variant truncate max-w-[260px]">{r.triggerDesc}</div></td>
                        <td className="px-3 py-2"><span className="text-[11px] font-medium">{r.trigger}</span></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 flex-wrap max-w-[280px]">
                            {r.steps.slice(0, 3).map((s, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-container text-on-surface-variant">{s.label}</span>
                            ))}
                            {r.steps.length > 3 && <span className="text-[10px] text-on-surface-variant">+{r.steps.length - 3}</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.runs7d.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.runs7d ? r.success.toFixed(1) + '%' : '—'}</td>
                        <td className="px-3 py-2 text-[11px]">{fmt(r.lastRun)}</td>
                        <td className="px-3 py-2">{statusPill(r.status)}</td>
                        <td className="px-2 py-2 text-right relative">
                          <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => openRowMenu(e, r.id)}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ════════ RUNS VIEW ════════ */}
      {view === 'runs' && (
        <section>
          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-4 h-11 border-b border-surface-dim">
              <div className="flex items-center gap-1">
                {(['all', 'success', 'failed', 'pending'] as const).map(t => (
                  <button key={t} className={`h-full px-3 text-label-md tab-underline ${runsFilter === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => setRunsFilter(t)}>
                    {t === 'all' ? 'All runs' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-on-surface-variant">Immutable run log</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm min-w-[1100px]">
                <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2">Automation</th>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Current step</th>
                    <th className="px-3 py-2">Steps</th>
                    <th className="px-3 py-2">Duration</th>
                    <th className="px-3 py-2">Result</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-dim">
                  {filteredRuns.length === 0 ? (
                    <tr><td colSpan={8}><div className="py-10 text-center text-body-sm text-on-surface-variant">No runs in this view.</div></td></tr>
                  ) : filteredRuns.map((r, i) => (
                    <tr key={i} className="hover:bg-surface-container-low">
                      <td className="px-3 py-2 tabular-nums">{fmt(r.started)}</td>
                      <td className="px-3 py-2 font-medium">{r.recipe}</td>
                      <td className="px-3 py-2">{r.subject}</td>
                      <td className="px-3 py-2 text-[11px]">{r.step}</td>
                      <td className="px-3 py-2 tabular-nums">{r.steps}</td>
                      <td className="px-3 py-2 tabular-nums">{r.duration}</td>
                      <td className="px-3 py-2">{runResultPill(r.result)}</td>
                      <td className="px-2 py-2 text-right relative">
                        <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => { const rec = recipes.find(x => x.name === r.recipe); if (rec) openEditor(rec); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">open_in_new</span></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ─── Scrim + peek drawer ─── */}
      {peekId && <div className="scrim open" onClick={closePeek} />}
      {peek && (
        <div className="peek open">
          <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">bolt</span>
              <span className="text-headline-sm truncate">{peek.name}</span>
            </div>
            <div className="flex items-center gap-1">
              <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => { const r = peek; closePeek(); openEditor(r); }}><span className="material-symbols-outlined text-[14px]">open_in_full</span>Open editor</button>
              <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={closePeek}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5 text-body-sm">
            <div className="mb-3 flex items-center gap-2">{statusPill(peek.status)}<span className="text-[11px] text-on-surface-variant">{peek.trigger}</span></div>
            <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-1">Trigger</div>
            <div className="text-body-sm mb-3">{peek.triggerDesc}</div>
            <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-2">Flow</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 py-1 text-body-sm"><span className="run-step-pill">Trigger</span><span>{peek.trigger}</span></div>
              {peek.steps.map((s, i) => {
                const meta = STEP_KINDS[s.kind];
                return (
                  <div key={i} className="flex items-center gap-2 py-1 text-body-sm">
                    <span className={`run-step-pill ${stepPillCls(s.kind)}`}>{meta?.label || s.kind}</span>
                    <span>{s.label}</span>
                  </div>
                );
              })}
            </div>
            <dl className="mt-4 pt-3 border-t border-surface-dim divide-y divide-surface-dim text-body-sm">
              <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Runs (7d)</dt><dd className="tabular-nums">{peek.runs7d.toLocaleString()}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Success</dt><dd className="tabular-nums">{peek.runs7d ? peek.success.toFixed(1) + '%' : '—'}</dd></div>
              <div className="flex justify-between py-2"><dt className="text-on-surface-variant">Last run</dt><dd>{fmt(peek.lastRun)}</dd></div>
            </dl>
            <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => peekAction('open', peek)}><span className="material-symbols-outlined text-[16px]">edit</span>Open editor</button>
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => peekAction('test', peek)}><span className="material-symbols-outlined text-[16px]">play_arrow</span>Test run</button>
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => peekAction('pause', peek)}><span className="material-symbols-outlined text-[16px]">pause_circle</span>Pause</button>
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => peekAction('duplicate', peek)}><span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Row menu popover ─── */}
      {rowMenu && (
        <>
          <div className="fixed inset-0 z-[119]" onClick={() => setRowMenu(null)} />
          <div className="popover" style={{ position: 'fixed', top: rowMenu.top, left: rowMenu.left, minWidth: 220, zIndex: 120 }}>
            <div className="px-3 py-1 text-[10px] text-outline uppercase tracking-wider font-bold">{rowMenu.id}</div>
            <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { const r = recipes.find(x => x.id === rowMenu.id); if (r) rowAction('open', r); }}><span className="material-symbols-outlined text-[16px]">edit</span>Open editor</button>
            <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { const r = recipes.find(x => x.id === rowMenu.id); if (r) rowAction('test', r); }}><span className="material-symbols-outlined text-[16px]">play_arrow</span>Test run</button>
            <div className="border-t border-surface-dim my-1"></div>
            <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { const r = recipes.find(x => x.id === rowMenu.id); if (r) rowAction('pause', r); }}><span className="material-symbols-outlined text-[16px]">pause_circle</span>Pause</button>
            <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { const r = recipes.find(x => x.id === rowMenu.id); if (r) rowAction('resume', r); }}><span className="material-symbols-outlined text-[16px]">play_circle</span>Resume</button>
            <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { const r = recipes.find(x => x.id === rowMenu.id); if (r) rowAction('duplicate', r); }}><span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate</button>
            <div className="border-t border-surface-dim my-1"></div>
            <button className="w-full text-left px-3 py-1.5 text-body-sm text-error hover:bg-error-container/40 flex items-center gap-2" onClick={() => { const r = recipes.find(x => x.id === rowMenu.id); if (r) rowAction('delete', r); }}><span className="material-symbols-outlined text-[16px]">delete</span>Delete</button>
          </div>
        </>
      )}

      {/* ─── Automation editor (full-screen canvas) ─── */}
      {editorOpen && (
        <div className="fixed inset-0 bg-white z-[90] flex flex-col">
          <div className="h-14 bg-white border-b border-surface-dim flex items-center justify-between px-5 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeEditor}><span className="material-symbols-outlined text-[18px]">arrow_back</span></button>
              <div className="min-w-0">
                <div className="text-headline-sm truncate">{editing ? editing.name : (eName || 'Untitled automation')}</div>
                <div className="text-[11px] text-on-surface-variant">{editing ? (editing.status + ' · ' + editing.trigger) : ('Draft · ' + draftTrigger.value)}</div>
              </div>
            </div>
            <div className="flex items-center gap-1 h-full">
              {(['canvas', 'settings', 'runs'] as const).map(t => (
                <button key={t} className={`editor-tab tab-underline h-full px-3 text-body-md ${editorTab === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => setEditorTab(t)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={testEditor}>
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>Test run
              </button>
              <div className="flex">
                <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main flex items-center gap-1" onClick={saveEditor}>
                  <span className="material-symbols-outlined text-[16px]">save</span>Save &amp; close
                </button>
                <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={handleActivateMenu}>
                  <span className="material-symbols-outlined text-[16px]">expand_more</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] overflow-hidden">
            {/* LEFT: canvas tabs */}
            <div className="overflow-y-auto canvas-bg">
              {editorTab === 'canvas' && (
                <div className="p-6">
                  <div className="max-w-2xl mx-auto">
                    {/* Trigger slot */}
                    <div className="mb-1 flex items-center justify-between">
                      <div className="text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">Trigger</div>
                      <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={openTriggerModal}>
                        <span className="material-symbols-outlined text-[14px]">swap_horiz</span>Change trigger
                      </button>
                    </div>
                    <div className="flow-node trigger mb-0">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-primary">bolt</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-body-md font-semibold">{draftTrigger.value}</div>
                          <div className="text-[11px] text-on-surface-variant">{triggerDescText}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-label-sm bg-secondary-container text-on-secondary-container">{draftTrigger.source}</span>
                      </div>
                    </div>

                    {/* Step chain */}
                    {draftSteps.map((s, i) => {
                      const meta = STEP_KINDS[s.kind] || { label: s.kind, cls: 'action', icon: 'bolt' };
                      return (
                        <div key={i}>
                          <div className="flow-connector">
                            <button className="flow-add" onClick={() => openStepModal(i)}>+</button>
                          </div>
                          <div className={`flow-node ${meta.cls}`} onClick={() => handleStepSelect(i)} style={{ cursor: 'pointer' }}>
                            <div className="flex items-center gap-2">
                              <span className={`material-symbols-outlined text-[18px] ${stepIconColor(meta.cls)}`}>{meta.icon}</span>
                              <div className="min-w-0 flex-1">
                                <div className="text-body-md font-semibold">{s.label}</div>
                                <div className="text-[11px] text-on-surface-variant">{meta.label}</div>
                              </div>
                              <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); handleStepRemove(i); }}><span className="material-symbols-outlined text-[14px] text-error">close</span></button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="flow-connector">
                      <button className="flow-add" onClick={() => openStepModal(draftSteps.length)}>+ Add step</button>
                    </div>
                  </div>
                </div>
              )}

              {editorTab === 'settings' && (
                <div className="p-6">
                  <div className="max-w-2xl mx-auto space-y-3">
                    <div className="bg-white rounded-xl border border-surface-dim p-4">
                      <div className="text-headline-sm mb-2">Automation details</div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-label-sm text-on-surface-variant mb-1">Name</label>
                          <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="e.g. Abandoned cart recovery" value={eName} onChange={e => setEName(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-label-sm text-on-surface-variant mb-1">Description</label>
                          <textarea className="w-full min-h-[80px] p-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="What this automation does and why." value={eDesc} onChange={e => setEDesc(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-label-sm text-on-surface-variant mb-1">Environment</label>
                          <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={eEnv} onChange={e => setEEnv(e.target.value as 'live' | 'test')}>
                            <option value="live">Live</option>
                            <option value="test">Test</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-surface-dim p-4">
                      <div className="text-headline-sm mb-2">Run rules</div>
                      <div className="space-y-2">
                        <label className="flex items-center justify-between py-1 text-body-sm"><span>Allow re-entry once completed</span><input type="checkbox" className="row-check" checked={eReentry} onChange={e => setEReentry(e.target.checked)} /></label>
                        <label className="flex items-center justify-between py-1 text-body-sm"><span>Stop after goal is met</span><input type="checkbox" className="row-check" checked={eStopgoal} onChange={e => setEStopgoal(e.target.checked)} /></label>
                        <label className="flex items-center justify-between py-1 text-body-sm"><span>Send test before activating</span><input type="checkbox" className="row-check" checked={eTestbefore} onChange={e => setETestbefore(e.target.checked)} /></label>
                        <label className="flex items-center justify-between py-1 text-body-sm"><span>Notify on failure</span><input type="checkbox" className="row-check" checked={eNotify} onChange={e => setENotify(e.target.checked)} /></label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editorTab === 'runs' && (
                <div className="p-6">
                  <div className="max-w-3xl mx-auto">
                    <div className="bg-white rounded-xl border border-surface-dim p-4">
                      <div className="text-headline-sm mb-2">Recent runs</div>
                      {editorRuns.length === 0 ? (
                        <div className="py-3 text-[11px] text-on-surface-variant">No runs yet.</div>
                      ) : (
                        <div>
                          {editorRuns.map((r, i) => (
                            <div key={i} className="run-row">
                              <span className={`run-step-pill ${r.result === 'Failed' ? 'failed' : r.result === 'Pending' ? 'pending' : 'ok'}`}>{r.result}</span>
                              <div className="min-w-0 flex-1">
                                <div className="text-body-sm font-medium truncate">{r.step}</div>
                                <div className="text-[11px] text-on-surface-variant">{fmt(r.started)} · {r.subject}</div>
                              </div>
                              <span className="text-[11px] text-on-surface-variant tabular-nums">{r.duration}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: inspector */}
            <div className="border-l border-surface-dim bg-surface-container-low overflow-y-auto p-4">
              <div className="text-label-sm uppercase tracking-wider text-on-surface-variant font-bold mb-2">Inspector</div>
              {selectedStepIndex === null || !draftSteps[selectedStepIndex] ? (
                <div className="text-[11px] text-on-surface-variant">Select a step to edit it.</div>
              ) : (() => {
                const s = draftSteps[selectedStepIndex];
                const meta = STEP_KINDS[s.kind] || { label: s.kind };
                return (
                  <div className="text-body-sm text-on-surface-variant">
                    <div className="text-body-md font-semibold mb-2 text-on-surface">{meta.label}</div>
                    <div className="text-[11px] text-on-surface-variant mb-2">Step {selectedStepIndex + 1} of {draftSteps.length}</div>
                    <div className="mb-2">
                      <label className="block text-label-sm text-on-surface-variant mb-1">Step label</label>
                      <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={inspLabel} onChange={e => setInspLabel(e.target.value)} />
                    </div>
                    {s.kind === 'wait' && (
                      <div className="mb-2 grid grid-cols-2 gap-2">
                        <div><label className="block text-label-sm text-on-surface-variant mb-1">Amount</label><input type="number" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={inspWaitAmt} onChange={e => setInspWaitAmt(parseInt(e.target.value || '0', 10))} /></div>
                        <div><label className="block text-label-sm text-on-surface-variant mb-1">Unit</label><select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={inspWaitUnit} onChange={e => setInspWaitUnit(e.target.value)}><option>Minutes</option><option>Hours</option><option>Days</option></select></div>
                      </div>
                    )}
                    {s.kind === 'email' && (
                      <div className="mb-2">
                        <label className="block text-label-sm text-on-surface-variant mb-1">Newsletter template</label>
                        <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={inspEmail} onChange={e => setInspEmail(e.target.value)}><option>Welcome</option><option>Cart reminder #1</option><option>Cart reminder #2</option><option>Review request</option><option>Thank you</option></select>
                      </div>
                    )}
                    {(s.kind === 'condition' || s.kind === 'branch') && (
                      <div className="mb-2">
                        <label className="block text-label-sm text-on-surface-variant mb-1">Condition</label>
                        <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={inspCond} onChange={e => setInspCond(e.target.value)} />
                      </div>
                    )}
                    {s.kind === 'webhook' && (
                      <div className="mb-2">
                        <label className="block text-label-sm text-on-surface-variant mb-1">Webhook URL</label>
                        <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="https://hooks.slack.com/..." value={inspUrl} onChange={e => setInspUrl(e.target.value)} />
                      </div>
                    )}
                    <button className="mt-2 h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={applyInspector}>Apply</button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ─── Activate menu popover ─── */}
      {activateMenu && (
        <>
          <div className="fixed inset-0 z-[119]" onClick={() => setActivateMenu(null)} />
          <div className="popover" style={{ position: 'fixed', top: activateMenu.top, left: activateMenu.left, minWidth: 260, zIndex: 120 }}>
            <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { setActivateMenu(null); saveWithStatus('Active'); }}><span className="material-symbols-outlined text-[16px] text-primary">power</span>Save &amp; activate</button>
            <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { setActivateMenu(null); saveWithStatus('Paused'); }}><span className="material-symbols-outlined text-[16px]">pause_circle</span>Save &amp; pause</button>
            <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => { setActivateMenu(null); saveWithStatus('Draft'); }}><span className="material-symbols-outlined text-[16px]">edit_note</span>Save as draft</button>
          </div>
        </>
      )}

      {/* ─── Trigger picker modal ─── */}
      {triggerModalOpen && (
        <div className="modal-scrim open" onClick={() => setTriggerModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Choose a trigger</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Every automation starts from exactly one trigger.</p>
            <div className="space-y-1 max-h-[320px] overflow-y-auto">
              {TRIGGERS.map(t => (
                <label key={t.value} className={`trigger-row ${triggerModalPick === t.value ? 'selected' : ''}`} onClick={() => setTriggerModalPick(t.value)}>
                  <input type="radio" name="trg" checked={triggerModalPick === t.value} onChange={() => setTriggerModalPick(t.value)} style={{ accentColor: '#0a6400' }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-semibold">{t.value}</div>
                    <div className="text-[11px] text-on-surface-variant">{t.source === 'Schedule' ? 'Fires on a recurring cadence' : 'Fires when ' + t.value.toLowerCase()}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold">{t.source}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setTriggerModalOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={confirmTriggerPick}>Use this trigger</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Step picker modal ─── */}
      {stepModalOpen && (
        <div className="modal-scrim open" onClick={() => setStepModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Add a step</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Pick a condition, action, or wait to add to the flow.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">Conditions</div>
                <button className="step-choice w-full text-left p-2.5 rounded-lg border border-surface-dim hover:border-primary text-body-sm" onClick={() => handleStepChoice('condition')}><div className="font-semibold">Condition</div><div className="text-[11px] text-on-surface-variant">If order total &gt; $50</div></button>
                <button className="step-choice w-full text-left p-2.5 rounded-lg border border-surface-dim hover:border-primary text-body-sm mt-2" onClick={() => handleStepChoice('branch')}><div className="font-semibold">Branch (yes/no)</div><div className="text-[11px] text-on-surface-variant">Split into two paths</div></button>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">Actions</div>
                <button className="step-choice w-full text-left p-2.5 rounded-lg border border-surface-dim hover:border-primary text-body-sm" onClick={() => handleStepChoice('email')}><div className="font-semibold">Send email</div><div className="text-[11px] text-on-surface-variant">Newsletter or transactional</div></button>
                <button className="step-choice w-full text-left p-2.5 rounded-lg border border-surface-dim hover:border-primary text-body-sm mt-2" onClick={() => handleStepChoice('webhook')}><div className="font-semibold">Send webhook</div><div className="text-[11px] text-on-surface-variant">POST to a URL</div></button>
                <button className="step-choice w-full text-left p-2.5 rounded-lg border border-surface-dim hover:border-primary text-body-sm mt-2" onClick={() => handleStepChoice('segment')}><div className="font-semibold">Add to segment</div><div className="text-[11px] text-on-surface-variant">Customers segment</div></button>
                <button className="step-choice w-full text-left p-2.5 rounded-lg border border-surface-dim hover:border-primary text-body-sm mt-2" onClick={() => handleStepChoice('task')}><div className="font-semibold">Create task</div><div className="text-[11px] text-on-surface-variant">Assign to a teammate</div></button>
                <button className="step-choice w-full text-left p-2.5 rounded-lg border border-surface-dim hover:border-primary text-body-sm mt-2" onClick={() => handleStepChoice('post')}><div className="font-semibold">Publish social post</div><div className="text-[11px] text-on-surface-variant">Social publishing</div></button>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-outline mb-1">Time</div>
                <button className="step-choice w-full text-left p-2.5 rounded-lg border border-surface-dim hover:border-primary text-body-sm" onClick={() => handleStepChoice('wait')}><div className="font-semibold">Wait / delay</div><div className="text-[11px] text-on-surface-variant">Wait N minutes / hours / days</div></button>
                <button className="step-choice w-full text-left p-2.5 rounded-lg border border-surface-dim hover:border-primary text-body-sm mt-2" onClick={() => handleStepChoice('until')}><div className="font-semibold">Wait until time</div><div className="text-[11px] text-on-surface-variant">e.g. next Monday 9:00</div></button>
                <button className="step-choice w-full text-left p-2.5 rounded-lg border border-surface-dim hover:border-primary text-body-sm mt-2" onClick={() => handleStepChoice('window')}><div className="font-semibold">Send window</div><div className="text-[11px] text-on-surface-variant">Only between hours</div></button>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setStepModalOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
