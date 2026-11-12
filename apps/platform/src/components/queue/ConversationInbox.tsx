'use client';
/**
 * ConversationInbox — THE shared support inbox (task 4-c centerpiece).
 *
 * Real Supabase data only: /api/crm/conversations (list + last message +
 * counts + staff names), /api/crm/conversations/[id] (full thread),
 * /api/crm/messages (replies), /api/crm/staff (assignment).
 *
 * The full loop: REPLY (outbound message row) → ASSIGN (assigned_staff_id)
 * → RESOLVE (status + resolved_at). Every action lands in BOTH the drawer
 * and the underlying table row instantly (optimistic patch + refresh()).
 *
 * ConversationThreadDrawer is exported so the Attention Queue opens the
 * exact same drawer. Cache-first via useList — no blocking spinners.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  useConversations,
  useStaff,
  useConversationThread,
  replyToConversation,
  assignConversation,
  resolveConversation,
  reopenConversation,
  type QueueConversation,
  type QueueStaff,
} from '@/hooks/useQueueApi';

/* ────────────────────────────────────────────────────────────
   Shared helpers (also used by AttentionQueueScreen)
   ──────────────────────────────────────────────────────────── */

const CHANNEL_ICONS: Record<string, string> = { web_form: 'language', email: 'mail', chat: 'chat' };
const CHANNEL_LABELS: Record<string, string> = { web_form: 'Web form', email: 'Email', chat: 'Chat' };
export const CUSTOMER_CHANNELS = ['web_form', 'email', 'chat'];

export function channelIcon(channel: string) {
  return CHANNEL_ICONS[channel] || 'forum';
}
export function channelLabel(channel: string) {
  return CHANNEL_LABELS[channel] || channel;
}

export function initials(text: string | null | undefined): string {
  const s = (text || '').trim();
  if (!s) return '?';
  if (s.includes('@')) {
    const local = s.split('@')[0] || '';
    const parts = local.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return local.slice(0, 2).toUpperCase() || '?';
  }
  const parts = s.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString();
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function statusPill(status: string) {
  if (status === 'resolved') return <span className="pill role customer">resolved</span>;
  if (status === 'closed') return <span className="pill neutral">closed</span>;
  if (status === 'pending') return <span className="pill warn">pending</span>;
  return <span className="pill info">open</span>;
}

/* ────────────────────────────────────────────────────────────
   Inbox tabs / chips
   ──────────────────────────────────────────────────────────── */

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'unassigned', label: 'Unassigned' },
] as const;
type TabId = (typeof TABS)[number]['id'];

interface ConversationInboxProps {
  onToast: (m: string) => void;
  title?: string;
  subtitle?: string;
  /** 'customer' = web_form + email + chat (the customer-facing channels) */
  defaultChannelFilter?: 'customer';
}

export default function ConversationInbox({
  onToast,
  title = 'Conversations',
  subtitle,
  defaultChannelFilter,
}: ConversationInboxProps) {
  /* Cache-first list — paints instantly, fills in from the background */
  const { data: conversations, loaded, refresh, setData } = useConversations();
  const { data: staff } = useStaff();

  const [q, setQ] = useState('');
  const [tab, setTab] = useState<TabId>('all');
  const [channel, setChannel] = useState<string>(defaultChannelFilter || 'all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);

  const counts = useMemo(() => ({
    all: conversations.length,
    open: conversations.filter(c => c.status === 'open' || c.status === 'pending').length,
    resolved: conversations.filter(c => c.status === 'resolved' || c.status === 'closed').length,
    unassigned: conversations.filter(c => !c.assigned_staff_id).length,
  }), [conversations]);

  const filtered = useMemo(() => {
    let rows = conversations;
    if (tab === 'open') rows = rows.filter(c => c.status === 'open' || c.status === 'pending');
    else if (tab === 'resolved') rows = rows.filter(c => c.status === 'resolved' || c.status === 'closed');
    else if (tab === 'unassigned') rows = rows.filter(c => !c.assigned_staff_id);

    if (channel === 'customer') rows = rows.filter(c => CUSTOMER_CHANNELS.includes(c.channel));
    else if (channel !== 'all') rows = rows.filter(c => c.channel === channel);

    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(c =>
        (c.subject || '').toLowerCase().includes(needle) ||
        (c.last_inbound_from || '').toLowerCase().includes(needle) ||
        (c.last_message?.subject || '').toLowerCase().includes(needle) ||
        (c.last_message?.body || '').toLowerCase().includes(needle) ||
        (c.last_message?.from_address || '').toLowerCase().includes(needle));
    }
    return rows;
  }, [conversations, tab, channel, q]);

  /* Instant row updates — mutations patch the list in place, refresh() reconciles */
  function patchRow(id: string, partial: Partial<QueueConversation>) {
    setData(conversations.map(c => (c.id === id ? { ...c, ...partial } : c)));
  }

  async function handleRowAssign(conv: QueueConversation, staffId: string | null) {
    setRowMenuForId(null);
    const member = staff.find(s => s.id === staffId) || null;
    patchRow(conv.id, { assigned_staff_id: staffId, assigned_staff_name: member?.display_name || null });
    const res = await assignConversation(conv.id, staffId);
    if (res.ok) onToast(staffId ? `Assigned to ${member?.display_name || 'staff'}` : 'Unassigned');
    else {
      onToast(`Assign failed: ${res.error}`);
      refresh();
    }
  }

  async function handleRowResolve(conv: QueueConversation) {
    setRowMenuForId(null);
    patchRow(conv.id, { status: 'resolved', resolved_at: new Date().toISOString() });
    const res = await resolveConversation(conv.id);
    if (res.ok) onToast('Conversation resolved');
    else {
      onToast(`Resolve failed: ${res.error}`);
      refresh();
    }
  }

  const chips: Array<{ value: string; label: string; icon?: string }> = [
    { value: 'all', label: 'All channels', icon: 'forum' },
    ...(defaultChannelFilter === 'customer' ? [{ value: 'customer', label: 'Customer', icon: 'support_agent' }] : []),
    { value: 'web_form', label: 'Web form', icon: 'language' },
    { value: 'email', label: 'Email', icon: 'mail' },
    { value: 'chat', label: 'Chat', icon: 'chat' },
  ];

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between py-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-headline-lg">{title}</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {subtitle || `Support inbox · ${conversations.length} conversations`}
          </p>
        </div>
        <div className="relative w-full max-w-sm">
          <span className="material-symbols-outlined absolute left-2 top-1.5 text-[16px] text-on-surface-variant" aria-hidden>search</span>
          <input
            className="w-full h-8 pl-8 pr-3 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
            placeholder="Search subject, message, from…"
            value={q}
            onChange={e => setQ(e.target.value)}
            aria-label="Search conversations"
          />
        </div>
      </div>

      {/* Status tabs with live counts */}
      <div className="flex items-center gap-1 border-b border-surface-dim mb-3" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`px-3 py-2 text-label-md tab-underline ${tab === t.id ? 'active' : 'text-on-surface-variant'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span className="text-on-surface-variant">({counts[t.id] || 0})</span>
          </button>
        ))}
      </div>

      {/* Channel filter chips */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {chips.map(chip => {
          const active = channel === chip.value;
          return (
            <button
              key={chip.value}
              className={`h-7 px-3 rounded-full text-label-sm border flex items-center gap-1 ${active ? 'bg-primary text-white border-primary' : 'border-surface-dim hover:bg-surface-container-low'}`}
              onClick={() => setChannel(chip.value)}
              aria-pressed={active}
            >
              {chip.icon && <span className="material-symbols-outlined text-[14px]" aria-hidden>{chip.icon}</span>}
              {chip.label}
            </button>
          );
        })}
        <span className="text-[11px] text-on-surface-variant ml-auto">
          {filtered.length} shown · {loaded ? 'live from Supabase' : 'loading…'}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="overflow-auto flex-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-surface-container-highest">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Assigned</th>
                <th className="px-3 py-2">Last activity</th>
                <th className="w-10 px-2 py-2"><span className="sr-only">Row actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {!loaded && conversations.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-on-surface-variant">Loading conversations…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-on-surface-variant">No conversations match these filters.</td></tr>
              ) : (
                filtered.map(c => {
                  const from = c.last_inbound_from || c.last_message?.from_address || null;
                  const resolved = c.status === 'resolved' || c.status === 'closed';
                  return (
                    <tr key={c.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => setOpenId(c.id)}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }} aria-hidden>{initials(from || c.subject)}</div>
                          <div className="min-w-0">
                            <div className="truncate max-w-[170px]">{from || 'Unknown sender'}</div>
                            <div className="text-[11px] text-on-surface-variant">{c.message_count} message{c.message_count === 1 ? '' : 's'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="truncate max-w-[260px] font-medium">{c.last_message?.subject || c.subject || '(no subject)'}</div>
                        <div className="text-[11px] text-on-surface-variant truncate max-w-[260px]">{c.last_message?.body?.slice(0, 90) || '—'}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[12px] text-on-surface-variant" title={channelLabel(c.channel)}>
                          <span className="material-symbols-outlined text-[16px]" aria-hidden>{channelIcon(c.channel)}</span>
                          {channelLabel(c.channel)}
                        </span>
                      </td>
                      <td className="px-3 py-2">{statusPill(c.status)}</td>
                      <td className="px-3 py-2">
                        {c.assigned_staff_name
                          ? <span className="text-[12px]">{c.assigned_staff_name}</span>
                          : <span className="text-[12px] text-on-surface-variant italic">Unassigned</span>}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-on-surface-variant whitespace-nowrap">{relTime(c.last_message_at || c.created_at)}</td>
                      <td className="px-2 py-2 text-right relative">
                        <button
                          className="w-7 h-7 rounded border border-surface-dim hover:bg-surface-container flex items-center justify-center mx-auto"
                          onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === c.id ? null : c.id); }}
                          title="Row actions"
                          aria-label={`Row actions for ${from || 'conversation'}`}
                        >
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant" aria-hidden>more_horiz</span>
                        </button>
                        {rowMenuForId === c.id && (
                          <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                            <div className="menu-header">This conversation</div>
                            <button onClick={() => { setRowMenuForId(null); setOpenId(c.id); }}>
                              <span className="material-symbols-outlined" aria-hidden>open_in_new</span>Open thread
                            </button>
                            <button className={resolved ? 'opacity-50' : ''} disabled={resolved} onClick={() => handleRowResolve(c)}>
                              <span className="material-symbols-outlined" aria-hidden>task_alt</span>Resolve
                            </button>
                            <div className="sep"></div>
                            <div className="menu-header">Assign to</div>
                            {staff.map(s => (
                              <button key={s.id} onClick={() => handleRowAssign(c, s.id)}>
                                <span className="material-symbols-outlined" aria-hidden>{c.assigned_staff_id === s.id ? 'check' : 'person'}</span>
                                {s.display_name}
                              </button>
                            ))}
                            {staff.length === 0 && <div className="px-3 py-1.5 text-[11px] text-on-surface-variant">No active staff</div>}
                            {c.assigned_staff_id && (
                              <button onClick={() => handleRowAssign(c, null)}>
                                <span className="material-symbols-outlined" aria-hidden>person_off</span>Unassign
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-surface-dim text-[11px] text-on-surface-variant flex items-center justify-between">
          <span>{filtered.length} of {conversations.length} conversations</span>
          <span>{counts.unassigned} unassigned · {counts.open} open · {counts.resolved} resolved</span>
        </div>
      </div>

      {/* Click-away for row menus */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} aria-hidden />}

      {/* Full thread drawer — shared with the Attention Queue */}
      <ConversationThreadDrawer
        conversationId={openId}
        staff={staff}
        onClose={() => setOpenId(null)}
        onChanged={refresh}
        onPatchRow={patchRow}
        onToast={onToast}
      />
    </main>
  );
}

/* ────────────────────────────────────────────────────────────
   ConversationThreadDrawer — the full REPLY / ASSIGN / RESOLVE loop
   (exported: AttentionQueueScreen opens this exact same drawer)
   ──────────────────────────────────────────────────────────── */

export interface ConversationThreadDrawerProps {
  conversationId: string | null;
  staff: QueueStaff[];
  onClose: () => void;
  /** Refresh the underlying list after any mutation */
  onChanged: () => void;
  /** Instantly patch the row in the underlying list */
  onPatchRow?: (id: string, partial: Partial<QueueConversation>) => void;
  onToast: (m: string) => void;
}

export function ConversationThreadDrawer({
  conversationId,
  staff,
  onClose,
  onChanged,
  onPatchRow,
  onToast,
}: ConversationThreadDrawerProps) {
  const { conversation, messages, setData } = useConversationThread(conversationId);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  /* Escape closes the drawer */
  useEffect(() => {
    if (!conversationId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [conversationId, onClose]);

  if (!conversationId) return null;

  const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound') || null;
  const fromLabel = lastInbound?.from_address || conversation?.last_inbound_from || 'Unknown sender';
  const subjectLabel = conversation?.subject || messages[0]?.subject || '(no subject)';
  const resolved = conversation?.status === 'resolved' || conversation?.status === 'closed';
  const assigneeName = staff.find(s => s.id === conversation?.assigned_staff_id)?.display_name || null;
  const author = staff[0] || null; // single-operator tenant: the signed-in support lead

  function applyThreadUpdate(partial: Partial<QueueConversation>) {
    if (!conversation) return;
    setData([{ id: conversation.id, conversation: { ...conversation, ...partial }, messages }]);
  }

  async function handleSend() {
    if (!conversation || !reply.trim() || sending) return;
    setSending(true);
    const res = await replyToConversation({
      conversation_id: conversation.id,
      body: reply.trim(),
      authored_by_staff_id: author?.id,
    });
    setSending(false);
    if (!res.ok) {
      onToast(`Reply failed: ${res.error}`);
      return;
    }
    const msg = res.data;
    if (msg) {
      // Append the bubble in place — no refetch needed to see the reply
      setData([{ id: conversation.id, conversation, messages: [...messages, msg] }]);
      onPatchRow?.(conversation.id, {
        last_message: { subject: msg.subject, body: msg.body, from_address: msg.from_address, direction: 'outbound', created_at: msg.created_at },
        message_count: messages.length + 1,
        last_message_at: msg.sent_at || msg.created_at,
      });
    }
    setReply('');
    onToast('Reply sent');
    onChanged();
  }

  async function handleAssign(staffId: string) {
    if (!conversation || busy) return;
    const nextId = staffId === '' ? null : staffId;
    setBusy(true);
    const res = await assignConversation(conversation.id, nextId);
    setBusy(false);
    if (!res.ok) {
      onToast(`Assign failed: ${res.error}`);
      return;
    }
    const name = staff.find(s => s.id === nextId)?.display_name || null;
    applyThreadUpdate({ assigned_staff_id: nextId });
    onPatchRow?.(conversation.id, { assigned_staff_id: nextId, assigned_staff_name: name });
    onToast(nextId ? `Assigned to ${name}` : 'Unassigned');
    onChanged();
  }

  async function handleResolveToggle() {
    if (!conversation || busy) return;
    setBusy(true);
    const res = resolved ? await reopenConversation(conversation.id) : await resolveConversation(conversation.id);
    setBusy(false);
    if (!res.ok) {
      onToast(`${resolved ? 'Reopen' : 'Resolve'} failed: ${res.error}`);
      return;
    }
    const nextStatus = resolved ? 'open' : 'resolved';
    const nextResolvedAt = resolved ? null : new Date().toISOString();
    applyThreadUpdate({ status: nextStatus, resolved_at: nextResolvedAt });
    onPatchRow?.(conversation.id, { status: nextStatus, resolved_at: nextResolvedAt });
    onToast(resolved ? 'Conversation reopened' : 'Conversation resolved');
    onChanged();
  }

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} aria-hidden />
      <div className="drawer open" style={{ width: 760 }} role="dialog" aria-label={`Conversation with ${fromLabel}`}>
        {/* Thread header */}
        <div className="px-4 py-3 border-b border-surface-dim bg-surface-container-low shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="avatar" style={{ width: 36, height: 36, fontSize: 13 }} aria-hidden>{initials(fromLabel)}</div>
              <div className="min-w-0">
                <div className="text-headline-sm truncate">{fromLabel}</div>
                <div className="text-[12px] text-on-surface-variant truncate flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]" aria-hidden>{channelIcon(conversation?.channel || '')}</span>
                  {channelLabel(conversation?.channel || '')} · {subjectLabel}
                </div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">
                  Assignee: {assigneeName || <span className="italic">Unassigned</span>}
                  {conversation?.started_at ? <> · started {relTime(conversation.started_at)}</> : null}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {conversation ? statusPill(conversation.status) : null}
              <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={onClose} title="Close (Esc)" aria-label="Close">
                <span className="material-symbols-outlined text-[18px]" aria-hidden>close</span>
              </button>
            </div>
          </div>
        </div>

        {/* Messages — inbound left/gray, outbound right/primary tinted */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-[#faf9fc] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-surface-container-highest">
          {!conversation ? (
            <div className="text-center py-12 text-on-surface-variant text-body-sm flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[28px] text-outline" aria-hidden>hourglass_top</span>
              Loading thread…
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12 text-on-surface-variant text-body-sm flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[28px] text-outline" aria-hidden>forum</span>
              No messages yet — send the first reply below.
            </div>
          ) : (
            messages.map(m => {
              const outbound = m.direction === 'outbound';
              return (
                <div key={m.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[78%] rounded-lg border px-3 py-2 ${outbound ? 'bg-[#e8f5e9] border-[#b9f6ca]' : 'bg-white border-surface-dim'}`}
                  >
                    {m.subject && (
                      <div className={`text-[11px] font-bold mb-1 ${outbound ? 'text-primary' : 'text-on-surface-variant'}`}>{m.subject}</div>
                    )}
                    <div className="text-body-sm whitespace-pre-wrap break-words">{m.body}</div>
                    <div className="text-[10px] text-on-surface-variant mt-1 flex items-center gap-1">
                      <span>{m.from_address || (outbound ? 'us' : 'customer')}</span>
                      <span>·</span>
                      <span>{fmtTime(m.sent_at || m.created_at)}</span>
                      {outbound && <span className="material-symbols-outlined text-[12px]" aria-hidden>done</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer + assign + resolve */}
        <div className="border-t border-surface-dim p-3 space-y-2 shrink-0 bg-white">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-on-surface-variant uppercase font-bold">Assigned</span>
            <div className="flex-1 min-w-[180px]">
              <select
                className="field-input"
                value={conversation?.assigned_staff_id || ''}
                onChange={e => handleAssign(e.target.value)}
                disabled={busy || !conversation}
                aria-label="Assign to staff member"
              >
                <option value="">Unassigned</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.display_name}{s.role ? ` · ${s.role}` : ''}</option>
                ))}
              </select>
            </div>
            {resolved ? (
              <button
                className="h-9 px-3 rounded border border-surface-dim text-body-md hover:bg-surface-container-low flex items-center gap-1 disabled:opacity-50"
                onClick={handleResolveToggle}
                disabled={busy || !conversation}
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden>restart_alt</span>Reopen
              </button>
            ) : (
              <button
                className="h-9 px-3 rounded bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 disabled:opacity-50"
                onClick={handleResolveToggle}
                disabled={busy || !conversation}
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden>task_alt</span>Resolve
              </button>
            )}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              className="field-textarea flex-1"
              rows={3}
              placeholder={author ? `Reply as ${author.display_name}… (⌘/Ctrl+Enter to send)` : 'Write a reply…'}
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSend(); }}
              aria-label="Reply message"
            />
            <button
              className="h-9 px-4 rounded bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              disabled={!reply.trim() || sending}
              onClick={handleSend}
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden>send</span>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
