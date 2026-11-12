'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  Invoice,
  Receipt,
  Estimate,
  PaymentTransaction,
  CustomerTransaction,
} from '@/lib/accountingTypes';

/**
 * useAccounting — hooks for the real Supabase accounting tables.
 * These read from the /api/invoices, /api/receipts, /api/estimates,
 * and /api/crm/payments routes — NOT the client-side platformStore.
 */

async function fetchJson<T>(url: string): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) return { error: json?.error?.message || `HTTP ${res.status}` };
    return { data: json.data as T };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}

/** All invoices for a customer — newest first. */
export function useInvoices(customerId: string | undefined) {
  const [data, setData] = useState<Invoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!customerId) { setLoaded(true); return; }
    let cancelled = false;
    setLoaded(false);
    fetchJson<Invoice[]>(`/api/invoices?customer_id=${encodeURIComponent(customerId)}`).then((res) => {
      if (cancelled) return;
      setData(res.data ?? []);
      setError(res.error ?? null);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [customerId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loaded, error, refresh };
}

/** All receipts (sales receipts) for a customer. */
export function useReceipts(customerId: string | undefined) {
  const [data, setData] = useState<Receipt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!customerId) { setLoaded(true); return; }
    let cancelled = false;
    setLoaded(false);
    fetchJson<Receipt[]>(`/api/receipts?customer_id=${encodeURIComponent(customerId)}`).then((res) => {
      if (cancelled) return;
      setData(res.data ?? []);
      setError(res.error ?? null);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [customerId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loaded, error, refresh };
}

/** All estimates for a customer. */
export function useEstimates(customerId: string | undefined) {
  const [data, setData] = useState<Estimate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!customerId) { setLoaded(true); return; }
    let cancelled = false;
    setLoaded(false);
    fetchJson<Estimate[]>(`/api/estimates?customer_id=${encodeURIComponent(customerId)}`).then((res) => {
      if (cancelled) return;
      setData(res.data ?? []);
      setError(res.error ?? null);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [customerId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loaded, error, refresh };
}

/** Payment transactions for a customer (from /api/crm/payments). */
export function usePaymentTransactions(customerId: string | undefined) {
  const [data, setData] = useState<PaymentTransaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!customerId) { setLoaded(true); return; }
    let cancelled = false;
    setLoaded(false);
    fetchJson<PaymentTransaction[]>(`/api/crm/payments?customer_id=${encodeURIComponent(customerId)}`).then((res) => {
      if (cancelled) return;
      setData(res.data ?? []);
      setError(res.error ?? null);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [customerId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loaded, error, refresh };
}

/**
 * useCustomerTransactions — the UNIFIED list for the Transaction List tab.
 * Fetches invoices + receipts + estimates in parallel and merges them
 * into one sorted array. This is what the customer profile renders.
 */
export function useCustomerTransactions(customerId: string | undefined) {
  const invoices = useInvoices(customerId);
  const receipts = useReceipts(customerId);
  const estimates = useEstimates(customerId);

  const loaded = invoices.loaded && receipts.loaded && estimates.loaded;
  const error = invoices.error || receipts.error || estimates.error;

  const refresh = () => {
    invoices.refresh();
    receipts.refresh();
    estimates.refresh();
  };

  const transactions: CustomerTransaction[] = [
    ...invoices.data.map((inv) => ({
      id: inv.id,
      type: 'Invoice' as const,
      number: inv.number,
      date: inv.createdAt?.slice(0, 10) || '',
      total: Number(inv.total) || 0,
      status: inv.status,
      balance: Number(inv.balanceDue) || 0,
      memo: inv.notes,
    })),
    ...receipts.data.map((rec) => ({
      id: rec.id,
      type: 'Receipt' as const,
      number: rec.number,
      date: rec.receipt_date || rec.created_at?.slice(0, 10) || '',
      total: Number(rec.amount) || 0,
      status: 'Paid',
      balance: 0,
      memo: rec.notes,
    })),
    ...estimates.data.map((est) => ({
      id: est.id,
      type: 'Estimate' as const,
      number: est.number,
      date: est.issue_date || est.created_at?.slice(0, 10) || '',
      total: Number(est.total) || 0,
      status: est.status,
      balance: 0,
      memo: est.notes,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return { data: transactions, loaded, error, refresh };
}
