'use client';
/**
 * AttentionQueueScreen — the merged "needs a human" queue (task 4-c).
 *
 * Real signals only, grouped into sections with live count badges:
 *   1. Conversations awaiting reply — open convs whose LAST message is inbound
 *   2. Overdue tasks — crm_tasks status != 'done' and due_at < now
 *   3. Follow-ups due — crm_leads with next_follow_up_at < now (not converted/lost)
 *   4. Attention flags — crm_needs_attention rows with status != 'resolved'
 *
 * Conversation items open the SAME ConversationThreadDrawer as the inbox,
 * so reply / assign / resolve work identically. Marking a task done
 * PATCHes /api/crm/tasks/[id] and visibly strikes the row.
 */
import { useMemo, useState } from 'react';
import { useList } from '@/hooks/useCrmApi';
import {
  useConversations,
  useStaff,
  completeTask,
  type QueueConversation,
} from '@/hooks/useQueueApi';
import { ConversationThreadDrawer, channelIcon, relTime, initials } from './ConversationInbox';

/* Local row shapes for the non-conversation signals */
interface AttentionTask {
  id: string;
  title: string;
  task_type: string | null;
  priority: string;
  status: string;
  due_at: string | null;
  completed_at?: string | null;
}
interface AttentionLead {
  id: string;
  contact_name: string | null;
  email: string | null;
  status: string;
  next_follow_up_at: string | null;
}
interface AttentionFlag {
  id: string;
  priority: string | null;
  issue_code: string | null;
  issue: string | null;
  recommendation: string | null;
  due_by: string | null;
  status: string;
}

function priorityPill(priority: string | null) {
  const p = (priority || '').toLowerCase();
  if (p === 'urgent' || p === 'high' || p === 'critical') return <span className="pill bad">{priority}</span>;
  if (p === 'medium' || p === 'normal') return <span className="pill warn">{priority || 'normal'}</span>;
  return <span className="pill neutral">{priority || 'low'}</span>;
}

/** A grouped section with a count badge and capped, scrollable body */
function Section({ icon, title, blurb, count, children }: {
  icon: string;
  title: string;
  blurb: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-surface-dim overflow-hidden flex flex-col min-h-0">
      <header className="px-4 py-3 border-b border-surface-dim flex items-center gap-2 bg-surface-container-low flex-wrap">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden>{icon}</span>
        <h2 className="text-headline-sm">{title}</h2>
        <span className={`pill ${count > 0 ? 'bad' : 'ok'}`} aria-label={`${count} items`}>{count}</span>
        <span className="text-[11px] text-on-surface-variant ml-auto">{blurb}</span>
      </header>
      <div className="max-h-96 overflow-y-auto divide-y divide-surface-dim [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-surface-container-highest">
        {children}
      </div>
    </section>
  );
}

export default function AttentionQueueScreen({ onToast }: { onToast: (m: string) => void }) {
  /* Cache-first lists — the screen paints instantly, data fills in */
  const { data: conversations, refresh: refreshConversations, setData: setConversations } = useConversations();
  const { data: staff } = useStaff();
  const { data: tasks, refresh: refreshTasks, setData: setTasks } = useList<AttentionTask>('queueAttentionTasks', '/api/crm/tasks');
  const { data: leads } = useList<AttentionLead>('queueAttentionLeads', '/api/crm/leads');
  const { data: flags } = useList<AttentionFlag>('queueNeedsAttention', '/api/crm/needs-attention');

  const [activeId, setActiveId] = useState<string | null>(null);
  const [doneTaskIds, setDoneTaskIds] = useState<Set<string>>(new Set());

  /* 1. Conversations awaiting reply: open + last message inbound */
  const awaitingReply = useMemo(
    () => conversations.filter(c =>
      (c.status === 'open' || c.status === 'pending') && c.last_message?.direction === 'inbound'),
    [conversations],
  );

  /* 2. Overdue tasks (rows marked done in-session stay visible, struck) */
  const overdueTasks = useMemo(() => {
    const nowTs = Date.now();
    return tasks.filter(t => {
      if (doneTaskIds.has(t.id)) return true;
      if (t.status === 'done') return false;
      if (!t.due_at) return false;
      const due = new Date(t.due_at).getTime();
      return !isNaN(due) && due < nowTs;
    });
  }, [tasks, doneTaskIds]);
  const openOverdueCount = overdueTasks.filter(t => !doneTaskIds.has(t.id)).length;

  /* 3. Lead follow-ups due */
  const dueLeads = useMemo(() => {
    const nowTs = Date.now();
    return leads.filter(l => {
      if (l.status === 'converted' || l.status === 'lost') return false;
      if (!l.next_follow_up_at) return false;
      const due = new Date(l.next_follow_up_at).getTime();
      return !isNaN(due) && due < nowTs;
    });
  }, [leads]);

  /* 4. Open attention flags */
  const openFlags = useMemo(() => flags.filter(f => f.status !== 'resolved'), [flags]);

  function patchRow(id: string, partial: Partial<QueueConversation>) {
    setConversations(conversations.map(c => (c.id === id ? { ...c, ...partial } : c)));
  }

  async function handleMarkDone(taskId: string) {
    const res = await completeTask(taskId);
    if (!res.ok) {
      onToast(`Mark done failed: ${res.error}`);
      return;
    }
    setDoneTaskIds(prev => new Set(prev).add(taskId));
    setTasks(tasks.map(t => (t.id === taskId ? { ...t, status: 'done', completed_at: new Date().toISOString() } : t)));
    onToast('Task marked done');
    refreshTasks();
  }

  const totalAttention = awaitingReply.length + openOverdueCount + dueLeads.length + openFlags.length;

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="py-4">
        <h1 className="text-headline-lg">Attention queue</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">
          Everything waiting on a human — replies, overdue tasks, follow-ups, flags · {totalAttention} item{totalAttention === 1 ? '' : 's'}
        </p>
      </div>

      {/* Grouped sections */}
      <div className="grid gap-4 lg:grid-cols-2 content-start flex-1 min-h-0">
        {/* 1 — Conversations awaiting reply */}
        <Section icon="forum" title="Awaiting reply" blurb="open · last message inbound" count={awaitingReply.length}>
          {awaitingReply.length === 0 ? (
            <div className="px-4 py-8 text-center text-body-sm text-on-surface-variant flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[28px] text-outline" aria-hidden>mark_email_read</span>
              Inbox zero — every conversation has a reply.
            </div>
          ) : awaitingReply.map(c => (
            <button
              key={c.id}
              className="w-full text-left px-4 py-2.5 hover:bg-surface-container-low flex items-center gap-3"
              onClick={() => setActiveId(c.id)}
              title="Open thread"
            >
              <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }} aria-hidden>{initials(c.last_inbound_from)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-body-sm font-medium truncate">{c.last_inbound_from || 'Unknown sender'}</div>
                <div className="text-[11px] text-on-surface-variant truncate">
                  {c.last_message?.subject || c.subject || '(no subject)'} — {c.last_message?.body?.slice(0, 60) || ''}
                </div>
              </div>
              <span className="inline-flex items-center gap-0.5 text-[11px] text-on-surface-variant whitespace-nowrap" title="Channel">
                <span className="material-symbols-outlined text-[14px]" aria-hidden>{channelIcon(c.channel)}</span>
                waiting {relTime(c.last_message?.created_at)}
              </span>
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant" aria-hidden>chevron_right</span>
            </button>
          ))}
        </Section>

        {/* 2 — Overdue tasks */}
        <Section icon="task_alt" title="Overdue tasks" blurb="due before now · not done" count={openOverdueCount}>
          {overdueTasks.length === 0 ? (
            <div className="px-4 py-8 text-center text-body-sm text-on-surface-variant flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[28px] text-outline" aria-hidden>event_available</span>
              No overdue tasks.
            </div>
          ) : overdueTasks.map(t => {
            const struck = doneTaskIds.has(t.id);
            return (
              <div key={t.id} className={`px-4 py-2.5 flex items-center gap-3 ${struck ? 'opacity-60' : ''}`}>
                <button
                  className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${struck ? 'bg-primary border-primary' : 'border-surface-dim hover:bg-surface-container-low'}`}
                  onClick={() => handleMarkDone(t.id)}
                  disabled={struck}
                  title={struck ? 'Done' : 'Mark done'}
                  aria-label={`Mark done: ${t.title}`}
                >
                  {struck && <span className="material-symbols-outlined text-[14px] text-white" aria-hidden>check</span>}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-body-sm truncate ${struck ? 'line-through text-on-surface-variant' : 'font-medium'}`}>{t.title}</div>
                  <div className="text-[11px] text-on-surface-variant truncate">
                    {t.task_type || 'task'} · due {relTime(t.due_at)}
                  </div>
                </div>
                {priorityPill(t.priority)}
                {struck ? (
                  <span className="pill ok">done</span>
                ) : (
                  <button className="fin-link" onClick={() => handleMarkDone(t.id)}>
                    Mark done<span className="material-symbols-outlined" aria-hidden>check</span>
                  </button>
                )}
              </div>
            );
          })}
        </Section>

        {/* 3 — Lead follow-ups due */}
        <Section icon="flag" title="Follow-ups due" blurb="next_follow_up_at before now" count={dueLeads.length}>
          {dueLeads.length === 0 ? (
            <div className="px-4 py-8 text-center text-body-sm text-on-surface-variant flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[28px] text-outline" aria-hidden>handshake</span>
              No lead follow-ups are past due.
            </div>
          ) : dueLeads.map(l => (
            <div key={l.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }} aria-hidden>{initials(l.contact_name || l.email)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-body-sm font-medium truncate">{l.contact_name || l.email || 'Unnamed lead'}</div>
                <div className="text-[11px] text-on-surface-variant truncate">
                  {l.email || '—'} · follow-up was due {relTime(l.next_follow_up_at)}
                </div>
              </div>
              <span className="pill warn">{l.status}</span>
              <button className="fin-link whitespace-nowrap" onClick={() => onToast('Open the Leads screen to work this follow-up')} title="Leads screen">
                Open leads<span className="material-symbols-outlined" aria-hidden>arrow_forward</span>
              </button>
            </div>
          ))}
        </Section>

        {/* 4 — Attention flags */}
        <Section icon="warning" title="Needs attention" blurb="open flags from risk checks" count={openFlags.length}>
          {openFlags.length === 0 ? (
            <div className="px-4 py-8 text-center text-body-sm text-on-surface-variant flex flex-col items-center gap-2">
              <span className="material-symbols-outlined text-[28px] text-outline" aria-hidden>verified</span>
              No open attention flags.
            </div>
          ) : openFlags.map(f => (
            <div key={f.id} className="px-4 py-2.5 flex items-center gap-3">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0" aria-hidden>warning</span>
              <div className="min-w-0 flex-1">
                <div className="text-body-sm font-medium truncate">{f.issue || f.issue_code || 'Attention needed'}</div>
                <div className="text-[11px] text-on-surface-variant truncate">
                  {f.recommendation || ''}{f.due_by ? ` · due ${relTime(f.due_by)}` : ''}
                </div>
              </div>
              {priorityPill(f.priority)}
            </div>
          ))}
        </Section>
      </div>

      {/* Same drawer as the inbox — reply / assign / resolve all work here */}
      <ConversationThreadDrawer
        conversationId={activeId}
        staff={staff}
        onClose={() => setActiveId(null)}
        onChanged={refreshConversations}
        onPatchRow={patchRow}
        onToast={onToast}
      />
    </main>
  );
}
