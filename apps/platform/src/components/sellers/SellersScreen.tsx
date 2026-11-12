'use client';
/**
 * SellersScreen — the Sellers list (Contacts → Seller relationships).
 *
 * REAL data from /api/sellers: the union of seller_self_serve_profiles and
 * seller_ids that appear only in enforcement data (violations/appeals) —
 * those rows carry an honest "no profile — from enforcement data" note.
 * Cache-first: paints instantly, fills from the background refresh, hits
 * Supabase only when the user saves (Add seller drawer → POST).
 */
import { useMemo, useState } from 'react';
import { useSellerStore } from '@/lib/sellerStore';
import {
  useSellers,
  createSeller,
  sellerDisplayName,
  initials,
  fmtDate,
  typeLabel,
  typePillClass,
  taxLabel,
  taxPillClass,
  type SellerSummary,
} from '@/hooks/useSellersApi';

interface SellersScreenProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

interface AddForm {
  legal_name: string;
  display_name: string;
  applicant_type: string;
}

const EMPTY_FORM: AddForm = { legal_name: '', display_name: '', applicant_type: 'individual' };

export default function SellersScreen({ onToast, onNavigate }: SellersScreenProps) {
  const { data: sellers, loaded, refresh } = useSellers();
  const setSelectedSellerId = useSellerStore(s => s.setSelectedSellerId);

  const [q, setQ] = useState('');
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  /* Instant client-side search over names (server also supports ?q=). */
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return sellers;
    return sellers.filter(s =>
      `${s.display_name || ''} ${s.legal_name || ''} ${s.seller_id}`.toLowerCase().includes(ql),
    );
  }, [sellers, q]);

  const totalSellers = sellers.length;
  const withProfile = sellers.filter(s => s.has_profile).length;
  const enforcementOnly = totalSellers - withProfile;
  const openViolations = sellers.reduce((s, x) => s + x.open_violations, 0);
  const pendingAppeals = sellers.reduce((s, x) => s + x.pending_appeals, 0);

  function openDetail(s: SellerSummary) {
    setSelectedSellerId(s.seller_id);
    setRowMenuForId(null);
    onNavigate?.('contacts', 'seller-detail');
  }

  function viewFeed(s: SellerSummary) {
    setSelectedSellerId(s.seller_id);
    setRowMenuForId(null);
    onNavigate?.('contacts', 'seller-feed');
  }

  async function saveSeller() {
    const legal = form.legal_name.trim();
    if (!legal) { onToast('Legal name is required'); return; }
    setSaving(true);
    const res = await createSeller({
      legal_name: legal,
      display_name: form.display_name.trim() || undefined,
      applicant_type: form.applicant_type,
    });
    setSaving(false);
    if (!res.ok) { onToast(`Save failed: ${res.error}`); return; }
    onToast(`Seller "${res.data?.display_name || res.data?.legal_name}" created`);
    setDrawerOpen(false);
    setForm(EMPTY_FORM);
    refresh();
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* BREADCRUMB */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Contacts</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Sellers</span>
      </div>

      {/* PAGE HEADER */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Sellers</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Self-serve seller profiles and enforcement activity · {totalSellers} seller{totalSellers === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input
              className="h-8 w-56 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
              placeholder="Search sellers…"
              value={q}
              onChange={e => setQ(e.target.value)}
              aria-label="Search sellers"
            />
          </div>
          <button
            className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
            onClick={() => { setForm(EMPTY_FORM); setDrawerOpen(true); }}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>Add seller
          </button>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total sellers</div>
          <div className="text-headline-sm mt-1 tabular-nums">{totalSellers}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">{withProfile} with profile · {enforcementOnly} from enforcement data</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Open violations</div>
          <div className={`text-headline-sm mt-1 tabular-nums ${openViolations > 0 ? 'text-error' : ''}`}>{openViolations}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Across all sellers</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Pending appeals</div>
          <div className={`text-headline-sm mt-1 tabular-nums ${pendingAppeals > 0 ? 'text-secondary' : ''}`}>{pendingAppeals}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Awaiting a decision</div>
        </div>
      </div>

      {/* LIST CARD */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden mb-4">
        {/* Filter bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">storefront</span>
          <span className="text-label-sm text-on-surface-variant">Seller relationships</span>
          <span className="ml-auto text-[11px] text-on-surface-variant">{filtered.length} of {totalSellers}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px] text-outline">storefront</span>
            </div>
            <h3 className="text-headline-sm mb-1">{loaded && sellers.length > 0 ? 'No sellers match' : 'No sellers yet'}</h3>
            <p className="text-body-sm text-on-surface-variant mb-3 max-w-md mx-auto">
              {loaded && sellers.length > 0
                ? 'Try a different search.'
                : 'Sellers appear here when they complete self-serve onboarding, when enforcement activity (violations or appeals) references them, or when you add one.'}
            </p>
            <button
              className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
              onClick={() => { setForm(EMPTY_FORM); setDrawerOpen(true); }}
            >
              Add seller
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2">Seller</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Tax form</th>
                  <th className="px-3 py-2 text-right">Open violations</th>
                  <th className="px-3 py-2 text-right">Pending appeals</th>
                  <th className="px-3 py-2">Added</th>
                  <th className="w-10 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {filtered.map(s => (
                  <tr
                    key={s.seller_id}
                    className="hover:bg-surface-container-low cursor-pointer"
                    onClick={() => openDetail(s)}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="avatar" aria-hidden="true">{initials(sellerDisplayName(s))}</span>
                        <div className="min-w-0">
                          <span className="font-medium truncate block text-primary hover:underline">{sellerDisplayName(s)}</span>
                          {s.has_profile ? (
                            <span className="text-[11px] text-on-surface-variant truncate block">
                              {s.display_name && s.legal_name && s.display_name !== s.legal_name ? s.legal_name : s.seller_id.slice(0, 8)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-on-surface-variant italic block">no profile — from enforcement data</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {s.applicant_type
                        ? <span className={`pill role ${typePillClass(s.applicant_type)}`}>{typeLabel(s.applicant_type)}</span>
                        : <span className="text-on-surface-variant">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {s.tax_form_status
                        ? <span className={`pill ${taxPillClass(s.tax_form_status)}`} title={s.tax_form_status}>{taxLabel(s.tax_form_status)}</span>
                        : <span className="text-on-surface-variant">—</span>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${s.open_violations > 0 ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>
                      {s.open_violations}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${s.pending_appeals > 0 ? 'text-secondary font-semibold' : 'text-on-surface-variant'}`}>
                      {s.pending_appeals}
                    </td>
                    <td className="px-3 py-2 text-[11px]">{fmtDate(s.created_at)}</td>
                    <td className="px-2 py-2 text-right relative">
                      <button
                        className="w-7 h-7 rounded border border-surface-dim hover:bg-surface-container flex items-center justify-center mx-auto"
                        onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === s.seller_id ? null : s.seller_id); }}
                        title="Row actions"
                        aria-label={`Row actions for ${sellerDisplayName(s)}`}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                      {rowMenuForId === s.seller_id && (
                        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                          <div className="menu-header">This seller</div>
                          <button onClick={() => openDetail(s)}><span className="material-symbols-outlined">storefront</span>Open detail</button>
                          <button onClick={() => viewFeed(s)}><span className="material-symbols-outlined">campaign</span>View feed</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-2 flex items-center justify-between border-t border-surface-dim text-[11px] text-on-surface-variant">
          <span>{loaded ? 'Live from Supabase' : 'Loading…'}</span>
          <span>{filtered.length} seller{filtered.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* Click-away for row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* Add seller drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={() => !saving && setDrawerOpen(false)} />
          <div className="drawer open" role="dialog" aria-label="Add seller">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">storefront</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">Add seller</div>
                  <div className="text-[11px] text-on-surface-variant">Create a self-serve seller profile.</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDrawerOpen(false)} aria-label="Close"><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <section>
                <div className="section-h">Identity</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label" htmlFor="sf-legal">Legal name *</label>
                    <input
                      id="sf-legal"
                      className="field-input"
                      placeholder="e.g. Jordan Avery Studio LLC"
                      value={form.legal_name}
                      onChange={e => setForm(p => ({ ...p, legal_name: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="sf-display">Display name</label>
                    <input
                      id="sf-display"
                      className="field-input"
                      placeholder="e.g. Jordan Avery"
                      value={form.display_name}
                      onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="sf-type">Applicant type</label>
                    <select
                      id="sf-type"
                      className="field-input"
                      value={form.applicant_type}
                      onChange={e => setForm(p => ({ ...p, applicant_type: e.target.value }))}
                    >
                      <option value="individual">Individual</option>
                      <option value="business">Business</option>
                    </select>
                  </div>
                </div>
              </section>

              <section>
                <div className="section-h">Onboarding defaults</div>
                <dl className="text-body-sm">
                  <div className="kv"><dt>Tax form status</dt><dd><span className="pill warn" title="not_required">not required</span></dd></div>
                  <div className="kv"><dt>Seller record</dt><dd className="text-on-surface-variant">created on save · status “applied”</dd></div>
                </dl>
                <p className="text-[11px] text-on-surface-variant mt-2">
                  A tax form only becomes required once recorded earnings cross the reporting threshold. Government ID, tax ID, warehouse and payout details are collected during the seller&apos;s self-serve flow.
                </p>
              </section>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</button>
              <button
                className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-50"
                onClick={saveSeller}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save seller'}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
