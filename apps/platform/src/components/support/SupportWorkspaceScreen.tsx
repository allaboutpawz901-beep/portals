'use client';
/* SupportWorkspaceScreen — 1:1 port of upload/support_extract/Support/support workspace.html
   The HTML's <style> block lives in src/app/support.css (+ marketing.css globals).
   The HTML's <body> (Zendesk-style 3-panel agent workspace) is ported to JSX
   below; class names are identical. The HTML's <script> (reply mode, context
   tabs, send reply, ⌘+Enter) is ported to React state + handlers below.
   Full-viewport-height app-like screen — the ticket tabs switch the whole
   workspace between the three tickets (identity verbatim from tickets.html). */
import { useEffect, useRef, useState } from 'react';

interface SupportScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

/* ─── data (verbatim from HTML; ticket identity from tickets.html) ─── */
interface WorkspaceTicket {
  id: string;            // SD-4821
  tabLabel: string;      // "Olivia Rhys — Account access"
  tabIcon: string;       // mail / chat / forum
  tabIconColor: string;  // text-qb-blue / text-qb-teal / text-qb-green
  subject: string;
  customer: string;
  custId: string;
  initials: string;
  avatarBg: string;
  email: string | null;  // only Olivia's email exists in the spec
  priority: string;
  status: string;
  assignee: string;
}

const TICKETS: WorkspaceTicket[] = [
  { id: 'SD-4821', tabLabel: 'Olivia Rhys — Account access', tabIcon: 'mail', tabIconColor: 'text-qb-blue', subject: 'Unable to access account', customer: 'Olivia Rhys', custId: 'CUST-0882', initials: 'OR', avatarBg: 'bg-qb-blue', email: 'olivia.rhys@email.com', priority: 'High', status: 'Open', assignee: 'Maya Chen' },
  { id: 'SD-4820', tabLabel: 'Ethan Cole — Refund request', tabIcon: 'chat', tabIconColor: 'text-qb-teal', subject: 'Refund request for order #8821', customer: 'Ethan Cole', custId: 'CUST-0911', initials: 'EC', avatarBg: 'bg-qb-teal', email: null, priority: 'Normal', status: 'Pending', assignee: 'Noah Kim' },
  { id: 'SD-4819', tabLabel: 'Priya Shah — Checkout crash', tabIcon: 'forum', tabIconColor: 'text-qb-green', subject: 'App crashes on checkout', customer: 'Priya Shah', custId: 'CUST-0402', initials: 'PS', avatarBg: 'bg-qb-maroon', email: null, priority: 'Urgent', status: 'Open', assignee: 'Unassigned' },
];

/* Olivia's SD-4821 thread (verbatim from support workspace.html).
   The spec only defines this thread — other tickets get an empty state. */
interface Msg {
  kind: 'customer' | 'agent' | 'internal';
  author: string;
  initials: string;
  avatarBg: string;
  via: string | null; // 'via email' for public messages, null for internal notes
  time: string;
  text: string;
}

const OLIVIA_THREAD: Msg[] = [
  { kind: 'customer', author: 'Olivia Rhys', initials: 'OR', avatarBg: 'bg-qb-blue', via: 'via email', time: '10:42 AM', text: "Hi, I'm unable to access my account. The password reset link keeps expiring before I can use it." },
  { kind: 'internal', author: 'Maya Chen', initials: 'MC', avatarBg: 'bg-qb-maroon', via: null, time: '10:44 AM', text: 'Checking token activity. Looks like the reset link is firing from a different IP than the request. Will send a fresh link with a longer expiry.' },
  { kind: 'agent', author: 'Maya Chen', initials: 'MC', avatarBg: 'bg-qb-maroon', via: 'via email', time: '10:45 AM', text: "Hi Olivia! I'm sorry you're running into this. I can help. Could you confirm whether you're opening the link on the same device where you requested it?" },
  { kind: 'customer', author: 'Olivia Rhys', initials: 'OR', avatarBg: 'bg-qb-blue', via: 'via email', time: '10:48 AM', text: "Yes, I'm using the same laptop. I tried twice this morning." },
];

/* Context panel data (verbatim) */
const SUGGESTED_ARTICLES = [
  { title: 'How to reset your password', meta: 'Account & access · 92% helpful' },
  { title: 'Troubleshooting login links', meta: 'Troubleshooting · 88% helpful' },
];

const INTERACTION_HISTORY = [
  { id: '#SD-4801', meta: 'Login issue · Solved', when: '2 days ago' },
  { id: '#SD-4792', meta: 'Access denied · Solved', when: '1 week ago' },
];

/* Olivia's customer details (verbatim; other tickets show the same layout with — ) */
const CUSTOMER_DETAILS = [
  { label: 'Customer since', value: 'Jan 2023' },
  { label: 'Lifetime value', value: '$2,480' },
  { label: 'Open tickets', value: '2' },
  { label: 'Sentiment', value: 'Concerned', maroon: true },
];

type ContextTab = 'user' | 'apps' | 'knowledge' | 'history';

export default function SupportWorkspaceScreen({ onToast, onNavigate }: SupportScreenProps) {
  /* ─── state (mirrors HTML's replyMode / context tab; plus ticket tabs) ─── */
  const [activeId, setActiveId] = useState('SD-4821');
  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('public');
  const [replyText, setReplyText] = useState('');
  const [contextTab, setContextTab] = useState<ContextTab>('user');
  const [tags, setTags] = useState<string[]>(['login_issue', 'password_reset']);
  const [messages, setMessages] = useState<Record<string, Msg[]>>({ 'SD-4821': OLIVIA_THREAD });

  const messageAreaRef = useRef<HTMLDivElement | null>(null);

  const active = TICKETS.find(t => t.id === activeId) || TICKETS[0];
  const thread = messages[active.id] || [];

  /* Keep the message area pinned to the latest message (mirrors sendReply scroll) */
  useEffect(() => {
    const el = messageAreaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, active.id]);

  /* ─── handlers (from HTML <script>) ─── */
  function removeTag(tag: string) {
    setTags(prev => prev.filter(t => t !== tag));
  }

  function sendReply() {
    const val = replyText.trim();
    if (!val) return;
    const msg: Msg = {
      kind: replyMode === 'public' ? 'agent' : 'internal',
      author: 'Maya Chen',
      initials: 'MC',
      avatarBg: 'bg-qb-maroon',
      via: replyMode === 'public' ? 'via email' : null,
      time: 'Just now',
      text: val,
    };
    setMessages(prev => ({ ...prev, [active.id]: [...(prev[active.id] || []), msg] }));
    setReplyText('');
    onToast(replyMode === 'public' ? 'Public reply sent' : 'Internal note added');
  }

  const modeBtnActive = 'h-6 px-2 rounded text-[11px] font-semibold bg-white shadow-sm text-on-surface';
  const modeBtnIdle = 'h-6 px-2 rounded text-[11px] font-semibold text-on-surface-variant hover:bg-white';

  return (
    <main className="px-6 pb-4 flex flex-col" style={{ height: 'calc(100vh - 124px)', minHeight: 640 }}>

      {/* ─── CONTEXT HEADER ─── */}
      <div className="h-[52px] flex items-center justify-between bg-white border-b border-surface-dim shrink-0">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">support_agent</span>
          <span className="text-label-md font-semibold">Support</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Agent Workspace</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-64 h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search tickets..." />
          </div>
          <button className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-[12px] font-bold">SA</button>
        </div>
      </div>

      {/* ─── TICKET TABS (Zendesk Style) ─── */}
      <div className="ticket-tabs">
        {TICKETS.map(t => (
          <div key={t.id} className={`ticket-tab ${t.id === activeId ? 'active' : ''}`} onClick={() => { setActiveId(t.id); onToast('Switched to ticket'); }}>
            <span className={`material-symbols-outlined ${t.tabIconColor}`}>{t.tabIcon}</span>
            <span>{t.tabLabel}</span>
            <span className="px-1.5 py-0.5 rounded bg-surface-container text-[9px] font-mono">{t.id}</span>
            <span className="material-symbols-outlined" onClick={e => { e.stopPropagation(); onToast('Close ticket tab'); }}>close</span>
          </div>
        ))}
        <div className="ticket-tab" style={{ background: 'transparent', border: 'none', color: '#5a6355' }} onClick={() => onToast('Open ticket list')}>
          <span className="material-symbols-outlined">add</span> Add
        </div>
      </div>

      {/* ─── SUB-NAVIGATION ─── */}
      <div className="pt-2 border-b border-surface-dim bg-white shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'support-overview')}>Overview</button>
          <button className="px-3 py-2 text-label-md tab-underline active">Omnichannel Inbox</button>
          <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'tickets')}>Tickets</button>
          <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onToast('Navigate to Customers')}>Customers</button>
        </div>
      </div>

      {/* ─── 3-PANEL WORKSPACE ─── */}
      <div className="workspace flex-1 min-h-0">

        {/* LEFT: Ticket Properties (Zendesk Left Rail) */}
        <div className="panel-properties">

          {/* Organization / Requester */}
          <div className="prop-section">
            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Organization (create)</div>
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-sm">{active.customer}</div>
              <button className="text-[10px] text-primary font-semibold hover:underline" onClick={() => onToast('Take it clicked')}>take it</button>
            </div>

            <label className="prop-label">Brand</label>
            <select className="prop-input mb-3"><option>ManageKube</option></select>

            <label className="prop-label">Requester</label>
            <select className="prop-input mb-3" key={active.id}><option>{active.customer}</option></select>

            <label className="prop-label">Assignee</label>
            <select className="prop-input mb-3" key={`assignee-${active.id}`}><option>Support/{active.assignee}</option></select>

            <label className="prop-label">Followers</label>
            <select className="prop-input mb-3"><option>search agents</option></select>
          </div>

          {/* Form & Tags */}
          <div className="prop-section">
            <label className="prop-label">Form</label>
            <select className="prop-input mb-3"><option>Default Ticket Form</option></select>

            <label className="prop-label">Tags</label>
            <div className="border border-surface-dim rounded p-1.5 bg-white mb-3">
              {tags.map(tag => (
                <span key={tag} className="prop-tag">{tag} <span className="material-symbols-outlined text-[12px] cursor-pointer" onClick={() => removeTag(tag)}>close</span></span>
              ))}
            </div>
          </div>

          {/* Type & Priority */}
          <div className="prop-section">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="prop-label">Type</label>
                <select className="prop-input"><option>Question</option><option>Incident</option><option>Problem</option></select>
              </div>
              <div>
                <label className="prop-label">Priority</label>
                <select className="prop-input" key={`priority-${active.id}`} defaultValue={active.priority}><option>High</option><option>Urgent</option><option>Normal</option></select>
              </div>
            </div>
          </div>

          {/* Macro */}
          <div className="prop-section mt-auto border-b-0 border-t">
            <button className="w-full h-8 border border-surface-dim rounded text-sm font-semibold hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => onToast('Macro menu opened')}>
              <span className="material-symbols-outlined text-[16px]">bolt</span>Apply macro
            </button>
          </div>
        </div>

        {/* MIDDLE: Conversation */}
        <div className="panel-conversation">

          {/* Conversation Header */}
          <div className="conversation-header">
            <div className="flex items-center gap-3">
              <span className="font-bold text-sm">Conversation with {active.customer}</span>
              <span className="text-[11px] text-on-surface-variant">Via email</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center text-on-surface-variant" title="Filter events" onClick={() => onToast('Filter events')}><span className="material-symbols-outlined text-[16px]">filter_list</span></button>
              <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center text-on-surface-variant" title="Ticket options" onClick={() => onToast('Options menu')}><span className="material-symbols-outlined text-[16px]">more_horiz</span></button>
            </div>
          </div>

          {/* Messages */}
          <div className="message-area" ref={messageAreaRef}>
            {thread.length === 0 ? (
              <div className="m-auto text-center">
                <span className="material-symbols-outlined text-[28px] text-outline">forum</span>
                <div className="text-body-sm text-on-surface-variant mt-1">No messages on this ticket yet — start with a reply below.</div>
              </div>
            ) : thread.map((m, i) => (
              <div key={i} className={`bubble ${m.kind}`}>
                <div className="bubble-header">
                  <div className={`w-5 h-5 rounded-full ${m.avatarBg} text-white flex items-center justify-center text-[9px] font-bold`}>{m.initials}</div>
                  <strong>{m.author}</strong>
                  {m.via ? <span>{m.via}</span> : <span className="px-1 py-0.5 rounded bg-qb-maroon/10 text-qb-maroon text-[9px] font-bold uppercase">Internal</span>}
                  <span className="bubble-time">{m.time}</span>
                </div>
                <div>{m.text}</div>
              </div>
            ))}
          </div>

          {/* Composer (Zendesk Bottom) */}
          <div className="border-t border-surface-dim bg-white shrink-0">

            {/* Reply Mode Toggle */}
            <div className="flex items-center gap-2 px-4 pt-2 pb-1 border-b border-surface-dim bg-surface-container-low">
              <button className={replyMode === 'public' ? modeBtnActive : modeBtnIdle} onClick={() => setReplyMode('public')}>Public Reply</button>
              <button className={replyMode === 'internal' ? modeBtnActive : modeBtnIdle} onClick={() => setReplyMode('internal')}>Internal Note</button>
            </div>

            {/* Text Area */}
            <div className="p-3">
              <div className="border border-surface-dim rounded-lg focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all bg-white">
                <textarea className="w-full h-20 p-3 text-sm bg-transparent border-none resize-none focus:outline-none" placeholder="Write a reply... (⌘ + Enter to send)" value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendReply(); }} />
                <div className="flex items-center justify-between px-2 py-1 border-t border-surface-dim bg-surface-container-low rounded-b-lg">
                  <div className="flex items-center gap-1">
                    <button className="w-7 h-7 rounded hover:bg-white flex items-center justify-center text-on-surface-variant" title="Attach file"><span className="material-symbols-outlined text-[16px]">attach_file</span></button>
                    <button className="w-7 h-7 rounded hover:bg-white flex items-center justify-center text-on-surface-variant" title="Knowledge"><span className="material-symbols-outlined text-[16px]">menu_book</span></button>
                    <button className="w-7 h-7 rounded hover:bg-white flex items-center justify-center text-on-surface-variant" title="Emoji"><span className="material-symbols-outlined text-[16px]">sentiment_satisfied</span></button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="h-7 px-3 bg-primary text-white rounded text-[11px] font-semibold hover:bg-primary-container flex items-center gap-1" onClick={sendReply}>
                      <span className="material-symbols-outlined text-[14px]">send</span>Send
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit as (Zendesk Bottom Bar) */}
            <div className="h-14 px-4 border-t border-surface-dim bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-on-surface-variant">Stay on ticket</span>
                <select className="h-7 px-2 border border-surface-dim rounded text-[11px] bg-white text-on-surface focus:outline-none">
                  <option>Stay on ticket</option>
                  <option>Next ticket in view</option>
                  <option>Close ticket</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button className="h-8 px-4 bg-primary text-white rounded text-sm font-semibold hover:bg-primary-container flex items-center gap-2" onClick={() => onToast('Ticket submitted as Open')}>
                  Submit as Open
                  <span className="material-symbols-outlined text-[16px]">expand_more</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT: Context Panel (Zendesk Apps/User/Knowledge/Interaction) */}
        <div className="panel-context">

          {/* Context Tabs */}
          <div className="context-tabs">
            <div className={`context-tab ${contextTab === 'user' ? 'active' : ''}`} onClick={() => setContextTab('user')}><span className="material-symbols-outlined">person</span></div>
            <div className={`context-tab ${contextTab === 'apps' ? 'active' : ''}`} onClick={() => setContextTab('apps')}><span className="material-symbols-outlined">apps</span></div>
            <div className={`context-tab ${contextTab === 'knowledge' ? 'active' : ''}`} onClick={() => setContextTab('knowledge')}><span className="material-symbols-outlined">menu_book</span></div>
            <div className={`context-tab ${contextTab === 'history' ? 'active' : ''}`} onClick={() => setContextTab('history')}><span className="material-symbols-outlined">history</span></div>
          </div>

          {/* User Context */}
          {contextTab === 'user' && (
            <div className="context-body">
              <div className="text-center mb-4">
                <div className={`w-12 h-12 rounded-full ${active.avatarBg} text-white flex items-center justify-center font-bold text-lg mx-auto mb-2`}>{active.initials}</div>
                <div className="font-bold text-lg">{active.customer}</div>
                {active.email && <div className="text-sm text-on-surface-variant">{active.email}</div>}
              </div>
              <div className="border-t border-surface-dim pt-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Customer Details</div>
                {CUSTOMER_DETAILS.map(d => (
                  <div key={d.label} className="flex justify-between py-1.5 text-xs">
                    <span className="text-on-surface-variant">{d.label}</span>
                    {active.id === 'SD-4821'
                      ? <span className={`font-medium ${d.maroon ? 'text-qb-maroon' : ''}`}>{d.value}</span>
                      : <span className="font-medium">—</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Apps Context (Zendesk Sell etc) */}
          {contextTab === 'apps' && (
            <div className="context-body">
              <div className="p-3 border border-surface-dim rounded-lg bg-white mb-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-qb-blue">sell</span>
                  <span className="font-semibold text-sm">Zendesk Sell</span>
                </div>
                <div className="text-xs text-on-surface-variant mb-2">Lead status: New</div>
                <button className="w-full h-7 border border-surface-dim rounded text-[11px] font-semibold hover:bg-surface-container-low" onClick={() => onToast('Sent note to sales')}>Send note to sales</button>
              </div>
              <div className="p-3 border border-surface-dim rounded-lg bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-qb-green">local_shipping</span>
                  <span className="font-semibold text-sm">Shopify</span>
                </div>
                <div className="text-xs text-on-surface-variant">Last order: #8821 ($142.50)</div>
              </div>
            </div>
          )}

          {/* Knowledge Context */}
          {contextTab === 'knowledge' && (
            <div className="context-body">
              <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-3">Suggested Articles</div>
              <div className="space-y-3">
                {SUGGESTED_ARTICLES.map(a => (
                  <div key={a.title} className="border-b border-surface-dim pb-2 cursor-pointer">
                    <div className="text-sm font-medium text-qb-blue hover:underline">{a.title}</div>
                    <div className="text-[11px] text-on-surface-variant mt-1">{a.meta}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interaction History */}
          {contextTab === 'history' && (
            <div className="context-body">
              <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-3">Interaction History</div>
              <div className="space-y-2">
                {INTERACTION_HISTORY.map(h => (
                  <div key={h.id} className="p-2 border border-surface-dim rounded text-xs">
                    <div className="font-medium text-qb-blue cursor-pointer hover:underline">{h.id}</div>
                    <div className="text-on-surface-variant">{h.meta}</div>
                    <div className="text-[10px] text-on-surface-variant mt-1">{h.when}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

    </main>
  );
}
