'use client';
/**
 * useSellersApi — client data layer for the Seller relationships screens.
 *
 * Same philosophy as useCrmApi: cache-first hooks paint instantly (cached or
 * empty on render #1, revalidated in the background), and mutations hit
 * Supabase only on save via fetchJson. Mutations return { ok, error } and
 * deliberately never toast — the screens own feedback via their onToast prop.
 */
import { useState, useEffect, useCallback } from 'react';
import { useList, fetchJson } from '@/hooks/useCrmApi';

/* ────────────────────────────────────────────────────────────
   Types (mirror the /api/sellers responses)
   ──────────────────────────────────────────────────────────── */

/** One row of GET /api/sellers — a profiled seller OR one derived from enforcement data. */
export interface SellerSummary {
  /** Alias of seller_id — lets the shared useList<{ id }> hook consume the list. */
  id: string;
  seller_id: string;
  profile_id: string | null;
  display_name: string | null;
  legal_name: string | null;
  applicant_type: string | null;
  tax_form_status: string | null;
  recorded_earnings: number | null;
  created_at: string | null;
  open_violations: number;
  pending_appeals: number;
  has_profile: boolean;
}

/** A seller_self_serve_profiles row. */
export interface SellerProfile {
  id: string;
  tenant_id: string;
  seller_id: string;
  user_id: string | null;
  case_id: string | null;
  applicant_type: string;
  legal_name: string;
  display_name: string | null;
  gov_id_type: string | null;
  gov_id_last4: string | null;
  tax_id_type: string | null;
  tax_id_last4: string | null;
  tax_form_status: string;
  tax_form_prompted_at: string | null;
  tax_form_received_at: string | null;
  tax_form_ticket_ref: string | null;
  recorded_earnings: number;
  completion_ticket_ref: string | null;
  created_at: string;
  updated_at: string;
}

/** A seller_violations row. */
export interface SellerViolation {
  id: string;
  tenant_id: string;
  seller_id: string;
  violation_type: string;
  severity: string;
  status: 'open' | 'resolved';
  description: string | null;
  policy_id: string | null;
  listing_id: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A seller_appeals row (violation_* fields are joined in by /api/sellers/appeals). */
export interface SellerAppeal {
  id: string;
  tenant_id: string;
  violation_id: string;
  seller_id: string;
  status: 'pending' | 'granted' | 'denied';
  appeal_text: string | null;
  decision: string | null;
  decided_by: string | null;
  decided_at: string | null;
  appeal_type: string | null;
  created_at: string;
  updated_at: string;
  violation_type?: string | null;
  violation_severity?: string | null;
  violation_status?: string | null;
}

/** A seller_social_posts row (payload is jsonb { title, note }). */
export interface SellerPost {
  id: string;
  tenant_id: string;
  seller_id: string;
  network: string;
  listing_id: string | null;
  external_id: string | null;
  external_url: string | null;
  status: string;
  payload: { title?: string; note?: string } | null;
  created_at: string;
  /** Joined by GET /api/sellers/feed */
  seller_name?: string | null;
  seller_has_profile?: boolean;
}

/** GET /api/sellers/[id] — the full dossier for one seller_id. */
export interface SellerDetail {
  profile: SellerProfile | null;
  violations: SellerViolation[];
  appeals: SellerAppeal[];
  posts: SellerPost[];
}

/* ────────────────────────────────────────────────────────────
   List hooks — cache-first via the shared useList workhorse
   ──────────────────────────────────────────────────────────── */

/** The seller list (profiles ∪ enforcement-derived seller_ids). Optional ?q= server-side search. */
export function useSellers(q?: string) {
  const url = q ? `/api/sellers?q=${encodeURIComponent(q)}` : '/api/sellers';
  return useList<SellerSummary>(`sellers:${q || ''}`, url);
}

/** All appeals, newest first, with the linked violation type/severity joined. */
export function useSellerAppeals() {
  return useList<SellerAppeal>('sellerAppeals', '/api/sellers/appeals');
}

/** Every seller social post, newest first. */
export function useSellerFeed() {
  return useList<SellerPost>('sellerFeed', '/api/sellers/feed');
}

/* ────────────────────────────────────────────────────────────
   Detail hook — cache-first object hook (same pattern as useList,
   but the payload is a dossier object, not an array)
   ──────────────────────────────────────────────────────────── */

const detailCache = new Map<string, SellerDetail>();

export function useSellerDetail(sellerId: string | null): {
  data: SellerDetail | null;
  loaded: boolean;
  refresh: () => void;
  setData: (d: SellerDetail | null) => void;
} {
  const [data, setData] = useState<SellerDetail | null>(() =>
    sellerId ? detailCache.get(sellerId) ?? null : null,
  );
  const [loaded, setLoaded] = useState<boolean>(() => (sellerId ? detailCache.has(sellerId) : true));
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!sellerId) return;
    let mounted = true;
    fetchJson<{ data: SellerDetail }>(`/api/sellers/${sellerId}`).then(res => {
      if (res.ok && mounted) {
        detailCache.set(sellerId, res.data.data);
        setData(res.data.data);
        setLoaded(true);
      }
    });
    return () => { mounted = false; };
  }, [sellerId, tick]);

  return { data, loaded, refresh, setData };
}

/* ────────────────────────────────────────────────────────────
   Mutations — fetchJson-based, { ok, error }, never toast
   ──────────────────────────────────────────────────────────── */

export interface MutationResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** Create a seller profile (server mints a fresh seller_id). */
export async function createSeller(input: {
  legal_name: string;
  display_name?: string;
  applicant_type?: string;
}): Promise<MutationResult<SellerProfile>> {
  const res = await fetchJson<{ data: SellerProfile }>('/api/sellers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

/** Update profile fields for a seller_id (display_name, applicant_type, tax_form_status, …). */
export async function updateSellerProfile(
  sellerId: string,
  updates: Partial<Pick<SellerProfile, 'display_name' | 'applicant_type' | 'tax_form_status' | 'legal_name' | 'tax_form_prompted_at' | 'tax_form_received_at'>>,
): Promise<MutationResult<SellerProfile>> {
  const res = await fetchJson<{ data: SellerProfile }>(`/api/sellers/${sellerId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

/** Decide an appeal ('granted'/'denied') or revert it to 'pending'. */
export async function decideAppeal(
  appealId: string,
  status: 'granted' | 'denied' | 'pending',
  decision?: string,
  decidedBy?: string,
): Promise<MutationResult<SellerAppeal>> {
  const res = await fetchJson<{ data: SellerAppeal }>(`/api/sellers/appeals/${appealId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, decision, decided_by: decidedBy }),
  });
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

/** Publish a seller social post (payload { title, note }, status 'posted'). */
export async function createPost(input: {
  seller_id: string;
  network: string;
  title: string;
  note?: string;
}): Promise<MutationResult<SellerPost>> {
  const res = await fetchJson<{ data: SellerPost }>('/api/sellers/feed', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

/** Open / resolve a violation. */
export async function resolveViolation(
  violationId: string,
  status: 'open' | 'resolved',
): Promise<MutationResult<SellerViolation>> {
  const res = await fetchJson<{ data: SellerViolation }>(`/api/sellers/violations/${violationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

/* ────────────────────────────────────────────────────────────
   Small shared helpers for the screens
   ──────────────────────────────────────────────────────────── */

/** Display label for any seller row — profile name, or an honest enforcement fallback. */
export function sellerDisplayName(s: { display_name?: string | null; legal_name?: string | null; seller_id: string }): string {
  return s.display_name || s.legal_name || `Seller ${s.seller_id.slice(0, 8)}`;
}

export function initials(name: string): string {
  return (name || '').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '??';
}

export function fmtDate(iso: string | null | undefined): string {
  return (iso || '').slice(0, 10) || '—';
}

export function fmtMoney(n: number | null | undefined): string {
  return (n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * applicant_type label — the table's CHECK vocabulary is
 * 'individual_seller' | 'business_seller'; show the friendly word.
 */
export function typeLabel(t: string | null | undefined): string {
  if (!t) return '—';
  if (t === 'individual_seller') return 'individual';
  if (t === 'business_seller') return 'business';
  return t;
}

/** Pill class for the applicant type. */
export function typePillClass(t: string | null | undefined): string {
  return t === 'business_seller' ? 'vendor' : 'contact';
}

/**
 * tax_form_status label — the table's CHECK vocabulary is
 * 'received' | 'not_required' (a form is only required past the reporting
 * threshold, so fresh sellers start 'not_required').
 */
export function taxLabel(t: string | null | undefined): string {
  if (!t) return '—';
  if (t === 'not_required') return 'not required';
  return t;
}

/** Pill class for the tax form status. */
export function taxPillClass(t: string | null | undefined): string {
  return t === 'received' ? 'ok' : 'warn';
}
