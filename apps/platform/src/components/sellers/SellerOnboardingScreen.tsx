'use client';
/**
 * SellerOnboardingScreen — the Onboarding Queue (Contacts → Seller
 * relationships). REAL data: seller_self_serve_profiles via /api/sellers
 * (0 rows today → honest empty state + a fully working Add seller flow) and
 * pending seller_appeals via /api/sellers/appeals for the "Needs decision"
 * strip. Every action PATCHes Supabase and visibly updates the row/pill.
 */
import { useMemo, useState } from 'react';
import { useSellerStore } from '@/lib/sellerStore';
import {
  useSellers,
  useSellerAppeals,
  createSeller,
  updateSellerProfile,
  decideAppeal,
  sellerDisplayName,
  initials,
  fmtDate,
  typeLabel,
  typePillClass,
  taxLabel,
  taxPillClass,
  type SellerAppeal,
  type SellerSummary,
} from '@/hooks/useSellersApi';

interface SellerOnboardingScreenProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

interface AddForm {
  legal_name: string;
  display_name: string;
  applicant_type: string;
}

const EMPTY_FORM: AddForm = { legal_name: '', display_name: '', applicant_type: 'individual' };

export default function SellerOnboardingScreen({ onToast, onNavigate }: SellerOnboardingScreenProps) {
  const { data: sellers, loaded, refresh } = useSellers();
  const { data: appeals, refresh: refreshAppeals } = useSellerAppeals();
  const setSelectedSellerId = useSellerStore(s => s.setSelectedSellerId);

  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busySellerId, setBusySellerId] = useState<string | null>(null);
  const [busyAppealId, setBusyAppealId] = useState<string | null>(null);
  /* tax_form_prompted_at isn't part of the list summary — track the stamp
     locally so the row can show "prompted just now" after the action. */
  const [promptedAt, setPromptedAt] = useState<Map<string, string>>(new Map());

  /* The queue holds sellers WITH a profile (the onboarding record itself). */
  const queue = useMemo(() => sellers.filter(s => s.has_profile), [sellers]);
  const pendingAppeals = useMemo(() => appeals.filter(a => a.status === 'pending'), [appeals]);
  const taxReceived = queue.filter(s => s.tax_form_status === 'received').length;
  const formsNotOnFile = queue.length - taxReceived;

  function openDetail(s: SellerSummary) {
    setSelectedSellerId(s.seller_id);
    setRowMenuForId(null);
    onNavigate?.('contacts', 'seller-detail');
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
    onToast(`Seller "${res.data?.display_name || res.data?.legal_name}" created — added to the queue`);
    setDrawerOpen(false);
    setForm(EMPTY_FORM);
    refresh();
  }

  async function promptTaxForm(s: SellerSummary) {
    setBusySellerId(s.seller_id);
    setRowMenuForId(null);
    const now = new Date().toISOString();
    const res = await updateSellerProfile(s.seller_id, { tax_form_prompted_at: now });
    setBusySellerId(null);
    if (!res.ok) { onToast(`Prompt failed: ${res.error}`); return; }
    setPromptedAt(prev => new Map(prev).set(s.seller_id, now));
    onToast(`Tax form prompted for ${sellerDisplayName(s)}`);
  }

  async function markTaxReceived(s: SellerSummary) {
    setBusySellerId(s.seller_id);
    setRowMenuForId(null);
    const res = await updateSellerProfile(s.seller_id, { tax_form_status: 'received' });
    setBusySellerId(null);
    if (!res.ok) { onToast(`Save failed: ${res.error}`); return; }
    onToast(`Tax form marked received for ${sellerDisplayName(s)}`);
    refresh();
  }

  async function handleDecideAppeal(a: SellerAppeal, status: 'granted' | 'denied') {
    setBusyAppealId(a.id);
    const res = await decideAppeal(a.id, status);
    setBusyAppealId(null);
    if (!res.ok) { onToast(`Decision failed: ${res.error}`); return; }
    onToast(status === 'granted' ? 'Appeal granted — linked violation resolved' : 'Appeal denied');
    refreshAppeals();
    refresh();
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* BREADCRUMB */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Contacts</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Onboarding Queue</span>
      </div>

      {/* PAGE HEADER */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Onboarding Queue</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Self-serve seller profiles moving through onboarding · {queue.length} in queue
          </p>
        </div>
        <button
          className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
          onClick={() => { setForm(EMPTY_FORM); setDrawerOpen(true); }}
        >
          <span className="material-symbols-outlined text-[16px]">add</span>Add seller
        </button>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">In queue</div>
          <div className="text-headline-sm mt-1 tabular-nums">{queue.length}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Seller profiles</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Tax forms received</div>
          <div className="text-headline-sm mt-1 tabular-nums text-secondary">{taxReceived}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">On file</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Forms not on file</div>
          <div className={`text-headline-sm mt-1 tabular-nums ${formsNotOnFile > 0 ? 'text-error' : ''}`}>{formsNotOnFile}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Track until received</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Appeals to decide</div>
          <div className={`text-headline-sm mt-1 tabular-nums ${pendingAppeals.length > 0 ? 'text-secondary' : ''}`}>{pendingAppeals.length}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">From enforcement</div>
        </div>
      </div>

      {/* NEEDS DECISION — pending appeals (real rows even when profiles are empty) */}
      <div className="bg-white rounded-xl border border-surface-dim mb-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-dim flex items-center justify-between">
          <h2 className="text-headline-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-secondary">fact_check</span>
            Needs decision
            <span className="text-on-surface-variant text-body-sm font-normal">({pendingAppeals.length})</span>
          </h2>
        </div>
        {pendingAppeals.length === 0 ? (
          <div className="px-4 py-6 text-center text-body-sm text-on-surface-variant">No appeals awaiting a decision.</div>
        ) : (
          <div className="divide-y divide-surface-dim">
            {pendingAppeals.map(a => (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="pill warn">pending</span>
                    {a.violation_type && (
                      <span className="text-[11px] text-on-surface-variant">
                        on {a.violation_type.replace(/_/g, ' ')}
                        {a.violation_severity ? ` (${a.violation_severity})` : ''}
                      </span>
                    )}
                    <span className="text-[11px] text-on-surface-variant">· Seller {a.seller_id.slice(0, 8)}</span>
                  </div>
                  {a.appeal_text && <div className="text-body-sm mt-0.5">&ldquo;{a.appeal_text}&rdquo;</div>}
                  <div className="text-[11px] text-on-surface-variant mt-0.5">filed {fmtDate(a.created_at)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    className="h-7 px-2.5 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container flex items-center gap-1 disabled:opacity-50"
                    onClick={() => handleDecideAppeal(a, 'granted')}
                    disabled={busyAppealId === a.id}
                  >
                    <span className="material-symbols-outlined text-[14px]">check</span>Grant
                  </button>
                  <button
                    className="h-7 px-2.5 border border-error text-error rounded text-label-sm font-semibold hover:bg-error/5 flex items-center gap-1 disabled:opacity-50"
                    onClick={() => handleDecideAppeal(a, 'denied')}
                    disabled={busyAppealId === a.id}
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* QUEUE TABLE — seller profiles */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-surface-dim flex items-center justify-between">
          <h2 className="text-headline-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">storefront</span>
            Seller profiles
            <span className="text-on-surface-variant text-body-sm font-normal">({queue.length})</span>
          </h2>
          <span className="text-[11px] text-on-surface-variant">{loaded ? 'Live from Supabase' : 'Loading…'}</span>
        </div>

        {queue.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px] text-outline">badge</span>
            </div>
            <h3 className="text-headline-sm mb-1">Queue is empty — no seller profiles yet</h3>
            <p className="text-body-sm text-on-surface-variant mb-3 max-w-md mx-auto">
              Profiles land here when sellers complete the self-serve onboarding flow, or when you add one.
              Enforcement activity (violations, appeals) shows on the Sellers list even without a profile.
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
                  <th className="px-3 py-2">Added</th>
                  <th className="w-10 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {queue.map(s => (
                  <tr key={s.seller_id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openDetail(s)}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="avatar" aria-hidden="true">{initials(sellerDisplayName(s))}</span>
                        <div className="min-w-0">
                          <span className="font-medium truncate block text-primary hover:underline">{sellerDisplayName(s)}</span>
                          <span className="text-[11px] text-on-surface-variant truncate block">
                            {s.display_name && s.legal_name && s.display_name !== s.legal_name ? s.legal_name : s.seller_id.slice(0, 8)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`pill role ${typePillClass(s.applicant_type)}`}>{typeLabel(s.applicant_type)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`pill ${taxPillClass(s.tax_form_status)}`} title={s.tax_form_status || undefined}>{taxLabel(s.tax_form_status)}</span>
                        {promptedAt.has(s.seller_id) && s.tax_form_status !== 'received' && (
                          <span className="text-[10px] text-on-surface-variant">prompted just now</span>
                        )}
                      </div>
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${s.open_violations > 0 ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>
                      {s.open_violations}
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
                          {s.tax_form_status !== 'received' && (
                            <>
                              <button onClick={() => promptTaxForm(s)} disabled={busySellerId === s.seller_id}>
                                <span className="material-symbols-outlined">outgoing_mail</span>Prompt tax form
                              </button>
                              <button onClick={() => markTaxReceived(s)} disabled={busySellerId === s.seller_id}>
                                <span className="material-symbols-outlined">task_alt</span>Mark tax form received
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                  <div className="text-[11px] text-on-surface-variant">Creates a profile and adds it to this queue.</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDrawerOpen(false)} aria-label="Close"><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <section>
                <div className="section-h">Identity</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label" htmlFor="oq-legal">Legal name *</label>
                    <input
                      id="oq-legal"
                      className="field-input"
                      placeholder="e.g. Jordan Avery Studio LLC"
                      value={form.legal_name}
                      onChange={e => setForm(p => ({ ...p, legal_name: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="oq-display">Display name</label>
                    <input
                      id="oq-display"
                      className="field-input"
                      placeholder="e.g. Jordan Avery"
                      value={form.display_name}
                      onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="oq-type">Applicant type</label>
                    <select id="oq-type" className="field-input" value={form.applicant_type} onChange={e => setForm(p => ({ ...p, applicant_type: e.target.value }))}>
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
