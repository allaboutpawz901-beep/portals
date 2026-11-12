'use client';
/**
 * SellerQueueScreen — the seller-side work queue (Support → Queues → Seller Queue).
 *
 * REAL data: seller_appeals needing a decision (grant/deny — the whole loop:
 * decision is written to Supabase, the linked violation resolves on grant)
 * + seller_violations that are still open (one-click resolve).
 * Every action flips a pill / strikes a row in place — not just a toast.
 */
import { useMemo, useState } from 'react';
import {
  useSellerAppeals,
  useSellers,
  decideAppeal,
  resolveViolation,
  type SellerAppeal,
} from '@/hooks/useSellersApi';

interface ViolationLike {
  id: string;
  seller_id: string;
  violation_type: string;
  severity: string;
  status: string;
  description: string | null;
  created_at: string;
}

/** Violations come embedded on the seller list summaries. */
interface SellerSummaryWithViolations {
  seller_id: string;
  display_name: string | null;
  legal_name: string | null;
  has_profile: boolean;
  open_violations: number;
}

function severityClass(s: string) {
  return s === 'high' ? 'pill role vendor' : s === 'medium' ? 'pill role customer' : 'pill role contact';
}
function appealStatusClass(s: string) {
  return s === 'granted' ? 'pill role customer' : s === 'denied' ? 'pill role vendor' : 'pill info';
}

export default function SellerQueueScreen({ onToast }: { onToast: (m: string) => void }) {
  const { data: appeals, refresh: refreshAppeals } = useSellerAppeals();
  const { data: sellers, refresh: refreshSellers } = useSellers();
  const [busyId, setBusyId] = useState<string | null>(null);

  const sellerName = (sellerId: string) => {
    const s = sellers.find(x => x.seller_id === sellerId);
    return s?.display_name || s?.legal_name || 'Unknown seller';
  };

  const pending = appeals.filter(a => a.status === 'pending');
  const decided = appeals.filter(a => a.status !== 'pending');

  async function handleDecide(appeal: SellerAppeal, decision: 'granted' | 'denied') {
    setBusyId(appeal.id);
    const res = await decideAppeal(appeal.id, decision, decision);
    setBusyId(null);
    if (res.ok) {
      onToast(`Appeal ${decision} — ${sellerName(appeal.seller_id)}`);
      refreshAppeals();
      refreshSellers();
    } else {
      onToast(`Decision failed: ${res.error}`);
    }
  }

  async function handleResolveViolation(v: ViolationLike) {
    setBusyId(v.id);
    const res = await resolveViolation(v.id, 'resolved');
    setBusyId(null);
    if (res.ok) {
      onToast(`Violation resolved — ${v.violation_type}`);
      refreshSellers();
    } else {
      onToast(`Resolve failed: ${res.error}`);
    }
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between py-4 flex-wrap gap-2">
        <div>
          <h1 className="text-headline-lg">Seller queue</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Appeals awaiting decision and open policy violations — live from Supabase.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill info">{pending.length} appeals pending</span>
          <span className="pill role vendor">{sellers.reduce((s, x) => s + (x.open_violations || 0), 0)} open violations</span>
        </div>
      </div>

      {/* Appeals needing decision */}
      <section className="bg-white rounded-xl border border-surface-dim mb-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
          <div>
            <h2 className="text-headline-sm">Appeals awaiting decision</h2>
            <div className="text-[11px] text-on-surface-variant">Grant or deny — the decision and timestamp are written to seller_appeals.</div>
          </div>
          <span className="pill info">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="py-8 px-6 text-center text-body-sm text-on-surface-variant">
            No appeals pending — the seller queue is clear.
          </div>
        ) : (
          <div className="divide-y divide-surface-dim">
            {pending.map(a => (
              <div key={a.id} className="px-5 py-3 flex items-start gap-3 hover:bg-surface-container-low">
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant mt-0.5">gavel</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{sellerName(a.seller_id)}</span>
                    <span className={severityClass(a.violation_severity || 'medium')}>{a.violation_type || 'violation'}</span>
                    <span className={appealStatusClass(a.status)}>{a.status}</span>
                  </div>
                  <div className="text-body-sm text-on-surface-variant mt-1">&ldquo;{a.appeal_text}&rdquo;</div>
                  <div className="text-[10px] text-outline mt-1">Filed {a.created_at?.slice(0, 10)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low disabled:opacity-50"
                    disabled={busyId === a.id}
                    onClick={() => handleDecide(a, 'denied')}
                  >
                    Deny
                  </button>
                  <button
                    className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-50"
                    disabled={busyId === a.id}
                    onClick={() => handleDecide(a, 'granted')}
                  >
                    Grant
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Decided appeals history */}
      <section className="bg-white rounded-xl border border-surface-dim mb-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
          <div>
            <h2 className="text-headline-sm">Recent decisions</h2>
            <div className="text-[11px] text-on-surface-variant">Appeals already decided, with their outcome.</div>
          </div>
        </div>
        {decided.length === 0 ? (
          <div className="py-6 px-6 text-center text-body-sm text-on-surface-variant">No decisions yet.</div>
        ) : (
          <div className="divide-y divide-surface-dim">
            {decided.map(a => (
              <div key={a.id} className="px-5 py-2.5 flex items-center gap-3 text-body-sm hover:bg-surface-container-low">
                <span className={appealStatusClass(a.status)}>{a.status}</span>
                <span className="font-medium">{sellerName(a.seller_id)}</span>
                <span className="text-on-surface-variant truncate flex-1">{a.violation_type || 'violation'}</span>
                <span className="text-[10px] text-outline">{a.decided_at?.slice(0, 10) || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Open violations across sellers */}
      <section className="bg-white rounded-xl border border-surface-dim">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
          <div>
            <h2 className="text-headline-sm">Open violations</h2>
            <div className="text-[11px] text-on-surface-variant">Policy violations still unresolved. Resolve closes them in place.</div>
          </div>
        </div>
        {sellers.filter(s => (s.open_violations || 0) > 0).length === 0 ? (
          <div className="py-6 px-6 text-center text-body-sm text-on-surface-variant">No open violations.</div>
        ) : (
          <div className="divide-y divide-surface-dim">
            {sellers.filter(s => (s.open_violations || 0) > 0).map(s => (
              <div key={s.seller_id} className="px-5 py-3 flex items-center gap-3 hover:bg-surface-container-low">
                <div className="avatar">{(sellerName(s.seller_id) || '??').slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{sellerName(s.seller_id)}</div>
                  {!s.has_profile && <div className="text-[10px] text-on-surface-variant">no profile — from enforcement data</div>}
                </div>
                <span className="pill role vendor">{s.open_violations} open</span>
                <span className="text-[10px] text-outline w-20 text-right">
                  {s.pending_appeals > 0 ? `${s.pending_appeals} pending appeal${s.pending_appeals > 1 ? 's' : ''}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
