'use client';
/**
 * useQueueApi — data layer for the support queue screens (task 4-c).
 *
 * Built on useCrmApi's cache-first primitives:
 *   - useList<T>(key, url) → instant paint from cache, background refresh
 *   - fetchJson → resilient mutations that never throw on HTML error pages
 *
 * The full queue loop — REPLY (crm_messages POST), ASSIGN (assigned_staff_id),
 * RESOLVE (status + resolved_at) — lives here as plain async mutations so
 * screens can toast / patch rows themselves. No toasts inside this file.
 */
import { useList, fetchJson } from '@/hooks/useCrmApi';

/* ────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────── */

export interface QueueLastMessage {
  subject: string | null;
  body: string | null;
  from_address: string | null;
  direction: string;
  created_at: string;
}

export interface QueueConversation {
  id: string;
  channel: string;
  status: string;
  assigned_staff_id: string | null;
  assigned_staff_name: string | null;
  subject: string | null;
  started_at: string | null;
  last_message_at: string | null;
  resolved_at: string | null;
  customer_id?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Last message of the thread, any direction (from the list endpoint) */
  last_message: QueueLastMessage | null;
  /** from_address of the LAST INBOUND message — who we're talking to */
  last_inbound_from?: string | null;
  message_count: number;
}

export interface QueueMessage {
  id: string;
  conversation_id: string;
  direction: string;
  status: string | null;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  body: string;
  created_at: string;
  sent_at: string | null;
}

export interface QueueStaff {
  id: string;
  display_name: string;
  role: string | null;
  email: string | null;
}

/** One cached thread: the conversation plus its messages, wrapped so useList
 *  (which caches arrays) can hold it as a single-element list. */
export interface QueueThread {
  id: string;
  conversation: QueueConversation;
  messages: QueueMessage[];
}

/* ────────────────────────────────────────────────────────────
   List hooks — cache-first, instant render
   ──────────────────────────────────────────────────────────── */

export interface ConversationFilter {
  status?: string;   // 'open' | 'all' | 'resolved'
  channel?: string;  // 'web_form' | 'email' | 'chat'
  assigned?: string; // 'me' | 'unassigned' | 'all'
  q?: string;
  staff_id?: string;
}

export function useConversations(filter?: ConversationFilter) {
  const f = filter || {};
  const params = new URLSearchParams();
  if (f.status && f.status !== 'all') params.set('status', f.status);
  if (f.channel && f.channel !== 'all') params.set('channel', f.channel);
  if (f.assigned && f.assigned !== 'all') params.set('assigned', f.assigned);
  if (f.staff_id) params.set('staff_id', f.staff_id);
  if (f.q) params.set('q', f.q);
  const qs = params.toString();
  const url = `/api/crm/conversations${qs ? '?' + qs : ''}`;
  const key = `queueConversations:${f.status || 'all'}|${f.channel || 'all'}|${f.assigned || 'all'}|${f.q || ''}`;
  return useList<QueueConversation>(key, url);
}

export function useStaff() {
  return useList<QueueStaff>('queueStaff', '/api/crm/staff');
}

const EMPTY_MESSAGES: QueueMessage[] = [];

/** Full thread for one conversation. Gated: id=null means NO fetch at all. */
export function useConversationThread(id: string | null) {
  const { data, loaded, refresh, setData } = useList<QueueThread>(
    `queueThread:${id || 'none'}`,
    id ? `/api/crm/conversations/${id}` : '/api/crm/conversations/none',
    (raw: unknown) => {
      const r = raw as { conversation?: QueueConversation; messages?: QueueMessage[] } | null;
      return r?.conversation
        ? [{ id: r.conversation.id, conversation: r.conversation, messages: r.messages || [] }]
        : [];
    },
    { enabled: !!id },
  );

  // Guard: never hand back a cached thread that belongs to a different id
  const thread = data.length > 0 && data[0].id === id ? data[0] : null;
  return {
    thread,
    conversation: thread?.conversation || null,
    messages: thread ? thread.messages : EMPTY_MESSAGES,
    loaded,
    refresh,
    setData,
  };
}

/* ────────────────────────────────────────────────────────────
   Mutations — fetchJson based, { ok, error }, no toasts inside
   ──────────────────────────────────────────────────────────── */

export type QueueMutationResult<T> = { ok: boolean; error: string | null; data?: T };

/** REPLY — insert an outbound message and bump the conversation. */
export async function replyToConversation(input: {
  conversation_id: string;
  body: string;
  subject?: string;
  authored_by_staff_id?: string;
  channel?: string;
}): Promise<QueueMutationResult<QueueMessage>> {
  const res = await fetchJson<{ data: QueueMessage }>('/api/crm/messages', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.ok ? { ok: true, error: null, data: res.data.data } : { ok: false, error: res.error };
}

/** ASSIGN — set (or clear, with null) assigned_staff_id. */
export async function assignConversation(id: string, staffId: string | null): Promise<QueueMutationResult<QueueConversation>> {
  const res = await fetchJson<{ data: QueueConversation }>(`/api/crm/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ assigned_staff_id: staffId }),
  });
  return res.ok ? { ok: true, error: null, data: res.data.data } : { ok: false, error: res.error };
}

/** RESOLVE — status='resolved', resolved_at=now (server-side). */
export async function resolveConversation(id: string): Promise<QueueMutationResult<QueueConversation>> {
  const res = await fetchJson<{ data: QueueConversation }>(`/api/crm/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'resolved' }),
  });
  return res.ok ? { ok: true, error: null, data: res.data.data } : { ok: false, error: res.error };
}

/** REOPEN — status='open', resolved_at=null (server-side). */
export async function reopenConversation(id: string): Promise<QueueMutationResult<QueueConversation>> {
  const res = await fetchJson<{ data: QueueConversation }>(`/api/crm/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'open' }),
  });
  return res.ok ? { ok: true, error: null, data: res.data.data } : { ok: false, error: res.error };
}

/** Complete a task — status='done', completed_at=now (server-side). */
export async function completeTask(id: string): Promise<QueueMutationResult<{ id: string }>> {
  const res = await fetchJson<{ data: { id: string } }>(`/api/crm/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'done' }),
  });
  return res.ok ? { ok: true, error: null, data: res.data.data } : { ok: false, error: res.error };
}

/* ────────────────────────────────────────────────────────────
   Live sidebar badges — real counts replace the mock 8/8/7
   ──────────────────────────────────────────────────────────── */

import { useEffect, useState } from 'react';

export interface QueueBadgeCounts {
  attention: number;
  'customer-queue': number;
  'seller-queue': number;
}

const badgeCache: { counts: QueueBadgeCounts | null } = { counts: null };

/**
 * useLiveQueueBadges — cache-first live counts for the sidebar queue badges.
 * Paints instantly (cached or null), refreshes from /api/queue/counts in the
 * background, and re-polls every 60s so resolve/assign actions reflect in
 * the chrome without a reload.
 */
export function useLiveQueueBadges(): QueueBadgeCounts | null {
  const [counts, setCounts] = useState<QueueBadgeCounts | null>(badgeCache.counts);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const res = await fetchJson<{ data: QueueBadgeCounts }>('/api/queue/counts');
      if (res.ok && mounted) {
        badgeCache.counts = res.data.data;
        setCounts(res.data.data);
      }
    }
    load();
    const t = setInterval(load, 60000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  return counts;
}
