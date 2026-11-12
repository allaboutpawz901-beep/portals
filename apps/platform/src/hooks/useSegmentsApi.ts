'use client';
/**
 * useSegmentsApi — data layer for the Segments screen.
 *
 * Real Supabase tables: crm_segments (list + detail) and
 * crm_segment_memberships (active member = exited_at IS NULL).
 *
 * Follows the platform data-layer rules:
 *  - INSTANT RENDER: lists come from useList (cache-first, module cache),
 *    so the table paints immediately and fills in when the fetch lands.
 *  - GATED DETAIL: useSegmentDetail(id) only fetches when an id is set.
 *  - TOAST-FREE MUTATIONS: every mutation returns { ok, error?, data? };
 *    the CALLER decides the feedback (drawer/table update + toast).
 */
import { useCallback, useEffect, useState } from 'react';
import { useList, fetchJson } from '@/hooks/useCrmApi';

/* ────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────── */

/** Row of crm_segments as served by GET /api/crm/segments (includes member_count). */
export interface SegmentRow {
  id: string;
  tenant_id?: string;
  name: string;
  description: string | null;
  entity_type?: string | null;
  definition?: { match?: string; rules?: unknown[] } | Record<string, unknown> | null;
  segment_type: string;
  is_active: boolean;
  member_count: number;
  created_at?: string;
  updated_at?: string;
}

/** Active member of a segment (membership joined with crm_customers). */
export interface SegmentMember {
  membership_id: string;
  customer_id: string;
  entered_at: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
}

/** GET /api/crm/segments/[id] payload — segment + active members. */
export interface SegmentDetail extends SegmentRow {
  members: SegmentMember[];
}

/** Uniform mutation result — no toasts inside, callers decide. */
export interface SegmentMutationResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/* ────────────────────────────────────────────────────────────
   useSegments — list with member_count (cache-first)
   ──────────────────────────────────────────────────────────── */

export function useSegments() {
  // Shares the 'crmSegments' cache key + URL with the CRM overview's
  // useCrmSegments() so both screens benefit from one background fetch.
  return useList<SegmentRow>('crmSegments', '/api/crm/segments');
}

/* ────────────────────────────────────────────────────────────
   useSegmentDetail — gated fetch, only when id is set
   ──────────────────────────────────────────────────────────── */

interface DetailCacheEntry { at: number; data: SegmentDetail }
const detailCache = new Map<string, DetailCacheEntry>();
const EMPTY_MEMBERS: SegmentMember[] = [];

export function useSegmentDetail(id: string | null): {
  segment: SegmentDetail | null;
  members: SegmentMember[];
  loaded: boolean;
  refresh: () => void;
  setMembers: (updater: (prev: SegmentMember[]) => SegmentMember[]) => void;
} {
  // State is id-scoped: `data` always belongs to `state.id`, so switching
  // segments can never flash the previous segment's members.
  const [state, setState] = useState<{ id: string | null; data: SegmentDetail | null }>(() =>
    id ? { id, data: detailCache.get(id)?.data ?? null } : { id: null, data: null },
  );
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  // React's "adjust state when a prop changes" pattern — runs during render,
  // so the drawer shows the cached detail (or a clean loading state) the
  // instant a different segment is opened, with zero frame of stale data.
  if (state.id !== id) {
    setState({ id, data: id ? detailCache.get(id)?.data ?? null : null });
  }

  // Gated background fetch — no id, no request.
  useEffect(() => {
    if (!id) return;
    let mounted = true;
    fetchJson<{ data: SegmentDetail }>(`/api/crm/segments/${id}`).then(res => {
      if (res.ok && mounted) {
        detailCache.set(id, { at: Date.now(), data: res.data.data });
        setState(prev => (prev.id === id ? { id, data: res.data.data } : prev));
      }
    });
    return () => { mounted = false; };
  }, [id, tick]);

  /** Update the member list through an updater (race-safe: two quick
      adds/removes apply sequentially against the latest state). The cache
      is written too, so reopening this segment stays consistent. */
  const setMembers = useCallback((updater: (prev: SegmentMember[]) => SegmentMember[]) => {
    setState(prev => {
      if (!prev.id || !prev.data) return prev;
      const next = { ...prev.data, members: updater(prev.data.members) };
      detailCache.set(prev.id, { at: Date.now(), data: next });
      return { ...prev, data: next };
    });
  }, []);

  const current = state.id === id ? state.data : null;
  return {
    segment: current,
    members: current?.members ?? EMPTY_MEMBERS,
    loaded: !!current,
    refresh,
    setMembers,
  };
}

/* ────────────────────────────────────────────────────────────
   Mutations — fetchJson POST/PATCH/DELETE, { ok, error } out
   ──────────────────────────────────────────────────────────── */

async function mutate<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<SegmentMutationResult<T>> {
  const res = await fetchJson<{ data: T }>(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

/** POST /api/crm/segments */
export function createSegment(input: {
  name: string;
  description?: string | null;
  segment_type?: string;
}): Promise<SegmentMutationResult<SegmentRow>> {
  return mutate<SegmentRow>('/api/crm/segments', 'POST', input);
}

/** PATCH /api/crm/segments/[id] — only the provided fields are sent. */
export function updateSegment(
  id: string,
  updates: Partial<Pick<SegmentRow, 'name' | 'description' | 'segment_type' | 'is_active'>>,
): Promise<SegmentMutationResult<SegmentRow>> {
  return mutate<SegmentRow>(`/api/crm/segments/${id}`, 'PATCH', updates);
}

/** DELETE /api/crm/segments/[id] — removes memberships then the segment. */
export function deleteSegment(id: string): Promise<SegmentMutationResult<{ id: string }>> {
  return mutate<{ id: string }>(`/api/crm/segments/${id}`, 'DELETE');
}

/** POST /api/crm/segments/[id]/members — body { customer_id }. */
export function addMember(
  segmentId: string,
  customerId: string,
): Promise<SegmentMutationResult<{ id: string; segment_id: string; customer_id: string; entered_at: string }>> {
  return mutate(`/api/crm/segments/${segmentId}/members`, 'POST', { customer_id: customerId });
}

/** DELETE /api/crm/segments/[id]/members — soft exit (exited_at = now). */
export function removeMember(
  segmentId: string,
  customerId: string,
): Promise<SegmentMutationResult<{ segment_id: string; customer_id: string; exited_at: string }>> {
  return mutate(`/api/crm/segments/${segmentId}/members`, 'DELETE', { customer_id: customerId });
}
