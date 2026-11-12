'use client';
/**
 * SellerDetailScreen — the dossier for the seller selected in the Sellers
 * list (selection carried by sellerStore). REAL data from
 * GET /api/sellers/[id]: profile (may be null — enforcement-only sellers),
 * violations, appeals and social posts. Every action (edit profile, resolve
 * violation, grant/deny appeal) PATCHes Supabase and visibly flips the pill.
 */
import { useState } from 'react';
import { useSellerStore } from '@/lib/sellerStore';
import {
  useSellerDetail,
  updateSellerProfile,
  decideAppeal,
  resolveViolation,
  sellerDisplayName,
  initials,
  fmtDate,
  fmtMoney,
  typeLabel,
  typePillClass,
  taxLabel,
  taxPillClass,
  type SellerAppeal,
  type SellerViolation,
} from '@/hooks/useSellersApi';

interface SellerDetailScreenProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

interface EditForm {
  display_name: string;
  applicant_type: string;
  tax_form_status: string;
}

const EMPTY_EDIT: EditForm = { display_name: '', applicant_type: 'individual', tax_form_status: 'pending' };

function severityPillClass(sev: string): string {
  if (sev === 'high') return 'bad';
  if (sev === 'medium' || sev === 'moderate') return 'warn';
  return 'neutral';
}

export default function SellerDetailScreen({ onToast, onNavigate }: SellerDetailScreenProps) {
  const selectedSellerId = useSellerStore(s => s.selectedSellerId);
  const setSelectedSellerId = useSellerStore(s => s.setSelectedSellerId);
  const { data: detail, loaded, refresh, setData } = useSellerDetail(selectedSellerId);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<EditForm>(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);
  const [busyViolationId, setBusyViolationId] = useState<string | null>(null);
  const [busyAppealId, setBusyAppealId] = useState<string | null>(null);

  const profile = detail?.profile ?? null;

  /* ── No selection: honest empty state ── */
  if (!selectedSellerId) {
    return (
      <main className="px-6 pb-12 flex flex-col h-full">
        <div className="py-16 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[28px] text-outline">storefront</span>
          </div>
          <h3 className="text-headline-sm mb-1">Select a seller from the Sellers list</h3>
          <p className="text-body-sm text-on-surface-variant mb-4 max-w-md mx-auto">
            This screen shows the profile, violations, appeals and social posts for one seller.
          </p>
          <button
            className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
            onClick={() => onNavigate?.('contacts', 'sellers')}
          >
            Go to Sellers
          </button>
        </div>
      </main>
    );
  }

  const name = profile ? sellerDisplayName(profile) : `Seller ${selectedSellerId.slice(0, 8)}`;
  const violations = detail?.violations ?? [];
  const appeals = detail?.appeals ?? [];
  const posts = detail?.posts ?? [];
  const openViolations = violations.filter(v => v.status === 'open').length;
  const pendingAppeals = appeals.filter(a => a.status === 'pending').length;

  /* ── Actions — optimistic flip + background refresh ── */

  async function handleResolveViolation(v: SellerViolation) {
    setBusyViolationId(v.id);
    // optimistic pill flip
    if (detail) setData({ ...detail, violations: detail.violations.map(x => x.id === v.id ? { ...x, status: 'resolved' as const } : x) });
    const res = await resolveViolation(v.id, 'resolved');
    setBusyViolationId(null);
    if (!res.ok) {
      onToast(`Resolve failed: ${res.error}`);
      refresh();
      return;
    }
    onToast(`Violation "${v.violation_type.replace(/_/g, ' ')}" resolved`);
    refresh();
  }

  async function handleDecideAppeal(a: SellerAppeal, status: 'granted' | 'denied') {
    setBusyAppealId(a.id);
    // optimistic pill flip
    if (detail) setData({ ...detail, appeals: detail.appeals.map(x => x.id === a.id ? { ...x, status } : x) });
    const res = await decideAppeal(a.id, status);
    setBusyAppealId(null);
    if (!res.ok) {
      onToast(`Decision failed: ${res.error}`);
      refresh();
      return;
    }
    onToast(status === 'granted' ? 'Appeal granted — linked violation resolved' : 'Appeal denied');
    refresh();
  }

  function openEditDrawer() {
    // Prime the form from the live profile at open-time (no effect needed).
    setForm({
      display_name: profile?.display_name || '',
      applicant_type: profile?.applicant_type || 'individual',
      tax_form_status: profile?.tax_form_status || 'pending',
    });
    setEditOpen(true);
  }

  async function saveProfile() {
    if (!selectedSellerId) return;
    setSaving(true);
    const res = await updateSellerProfile(selectedSellerId, {
      display_name: form.display_name.trim() || null,
      applicant_type: form.applicant_type,
      tax_form_status: form.tax_form_status,
    });
    setSaving(false);
    if (!res.ok) { onToast(`Save failed: ${res.error}`); return; }
    onToast('Seller profile updated');
    setEditOpen(false);
    refresh();
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* BREADCRUMB + back */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2 flex-wrap">
        <button className="flex items-center gap-1 text-primary hover:underline" onClick={() => onNavigate?.('contacts', 'sellers')}>
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>Sellers
        </button>
        <span className="text-outline">/</span>
        <span className="text-on-surface font-semibold truncate">{name}</span>
      </div>

      {/* PROFILE CARD */}
      <div className="bg-white rounded-xl border border-surface-dim p-6 mb-4 flex gap-6 flex-wrap">
        <div className="w-16 h-16 rounded-full bg-surface-container grid place-items-center text-xl font-bold text-on-surface-variant shrink-0" aria-hidden="true">
          {initials(name)}
        </div>
        <div className="flex-1 min-w-[260px]">
          <h1 className="text-headline-lg">{name}</h1>
          <div className="flex items-center gap-2 mt-1 mb-3 flex-wrap">
            {profile ? (
              <>
                <span className={`pill role ${typePillClass(profile.applicant_type)}`}>{typeLabel(profile.applicant_type)}</span>
                <span className={`pill ${taxPillClass(profile.tax_form_status)}`} title={profile.tax_form_status}>tax form {taxLabel(profile.tax_form_status)}</span>
              </>
            ) : (
              <span className="pill neutral">no profile — from enforcement data</span>
            )}
            {openViolations > 0 && <span className="pill bad">{openViolations} open violation{openViolations === 1 ? '' : 's'}</span>}
            {pendingAppeals > 0 && <span className="pill warn">{pendingAppeals} pending appeal{pendingAppeals === 1 ? '' : 's'}</span>}
          </div>
          <dl className="text-body-sm grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            {profile ? (
              <>
                <div className="kv"><dt>Legal name</dt><dd>{profile.legal_name}</dd></div>
                <div className="kv"><dt>Display name</dt><dd>{profile.display_name || '—'}</dd></div>
                <div className="kv"><dt>Applicant type</dt><dd>{typeLabel(profile.applicant_type)}</dd></div>
                <div className="kv"><dt>Tax form status</dt><dd>{taxLabel(profile.tax_form_status)}</dd></div>
                <div className="kv"><dt>Recorded earnings</dt><dd className="tabular-nums">{fmtMoney(profile.recorded_earnings)}</dd></div>
                <div className="kv"><dt>Profile created</dt><dd>{fmtDate(profile.created_at)}</dd></div>
              </>
            ) : (
              <div className="kv sm:col-span-2"><dt>Profile</dt><dd className="text-on-surface-variant">No self-serve profile — this seller is known only from violations and appeals.</dd></div>
            )}
            <div className="kv"><dt>Seller ID</dt><dd className="code-mono text-[11px]">{selectedSellerId}</dd></div>
          </dl>
        </div>
        <div className="flex flex-col gap-2 items-stretch shrink-0 min-w-[140px]">
          {profile && (
            <button
              className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1"
              onClick={openEditDrawer}
            >
              <span className="material-symbols-outlined text-[16px]">edit</span>Edit profile
            </button>
          )}
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1"
            onClick={() => onNavigate?.('contacts', 'seller-feed')}
          >
            <span className="material-symbols-outlined text-[16px]">campaign</span>View feed
          </button>
        </div>
      </div>

      {!loaded && !detail && (
        <div className="text-body-sm text-on-surface-variant mb-4">Loading seller dossier…</div>
      )}

      {/* VIOLATIONS */}
      <div className="bg-white rounded-xl border border-surface-dim mb-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-dim flex items-center justify-between">
          <h2 className="text-headline-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-error">gavel</span>
            Violations
            <span className="text-on-surface-variant text-body-sm font-normal">({violations.length})</span>
          </h2>
        </div>
        {violations.length === 0 ? (
          <div className="px-4 py-6 text-center text-body-sm text-on-surface-variant">No violations on record.</div>
        ) : (
          <div className="divide-y divide-surface-dim">
            {violations.map(v => (
              <div key={v.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium capitalize">{v.violation_type.replace(/_/g, ' ')}</span>
                    <span className={`pill ${severityPillClass(v.severity)}`}>{v.severity}</span>
                    <span className={`pill ${v.status === 'open' ? 'bad' : 'ok'}`}>{v.status}</span>
                  </div>
                  {v.description && <div className="text-body-sm text-on-surface-variant mt-0.5">{v.description}</div>}
                  <div className="text-[11px] text-on-surface-variant mt-0.5">{fmtDate(v.created_at)}</div>
                </div>
                {v.status === 'open' && (
                  <button
                    className="h-7 px-2.5 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 shrink-0 disabled:opacity-50"
                    onClick={() => handleResolveViolation(v)}
                    disabled={busyViolationId === v.id}
                  >
                    <span className="material-symbols-outlined text-[14px]">task_alt</span>
                    {busyViolationId === v.id ? 'Resolving…' : 'Resolve'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* APPEALS */}
      <div className="bg-white rounded-xl border border-surface-dim mb-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-dim flex items-center justify-between">
          <h2 className="text-headline-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-secondary">fact_check</span>
            Appeals
            <span className="text-on-surface-variant text-body-sm font-normal">({appeals.length})</span>
          </h2>
        </div>
        {appeals.length === 0 ? (
          <div className="px-4 py-6 text-center text-body-sm text-on-surface-variant">No appeals on record.</div>
        ) : (
          <div className="divide-y divide-surface-dim">
            {appeals.map(a => (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`pill ${a.status === 'granted' ? 'ok' : a.status === 'denied' ? 'bad' : 'warn'}`}>{a.status}</span>
                    {a.violation_type && <span className="text-[11px] text-on-surface-variant">on {a.violation_type.replace(/_/g, ' ')}</span>}
                    {a.decided_at && <span className="text-[11px] text-on-surface-variant">· decided {fmtDate(a.decided_at)}</span>}
                  </div>
                  {a.appeal_text && <div className="text-body-sm mt-0.5">&ldquo;{a.appeal_text}&rdquo;</div>}
                  <div className="text-[11px] text-on-surface-variant mt-0.5">filed {fmtDate(a.created_at)}</div>
                </div>
                {a.status === 'pending' && (
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
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RECENT POSTS */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-dim flex items-center justify-between">
          <h2 className="text-headline-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-tertiary">campaign</span>
            Recent posts
            <span className="text-on-surface-variant text-body-sm font-normal">({posts.length})</span>
          </h2>
          <button className="fin-link" onClick={() => onNavigate?.('contacts', 'seller-feed')}>
            Open feed<span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
        {posts.length === 0 ? (
          <div className="px-4 py-6 text-center text-body-sm text-on-surface-variant">No social posts for this seller yet.</div>
        ) : (
          <div className="divide-y divide-surface-dim">
            {posts.slice(0, 5).map(p => (
              <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                <span className="pill info">{p.network}</span>
                <span className="text-body-sm font-medium truncate flex-1 min-w-0">{p.payload?.title || 'Untitled post'}</span>
                <span className={`pill ${p.status === 'published' ? 'ok' : 'neutral'}`}>{p.status}</span>
                <span className="text-[11px] text-on-surface-variant shrink-0">{fmtDate(p.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit profile drawer */}
      {editOpen && profile && (
        <>
          <div className="drawer-scrim open" onClick={() => !saving && setEditOpen(false)} />
          <div className="drawer open" role="dialog" aria-label="Edit seller profile">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">edit</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">Edit seller profile</div>
                  <div className="text-[11px] text-on-surface-variant truncate">{profile.legal_name}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setEditOpen(false)} aria-label="Close"><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <section>
                <div className="section-h">Profile</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label" htmlFor="se-display">Display name</label>
                    <input
                      id="se-display"
                      className="field-input"
                      placeholder="e.g. Jordan Avery"
                      value={form.display_name}
                      onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="se-type">Applicant type</label>
                    <select id="se-type" className="field-input" value={form.applicant_type} onChange={e => setForm(p => ({ ...p, applicant_type: e.target.value }))}>
                      <option value="individual">Individual</option>
                      <option value="business">Business</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="se-tax">Tax form status</label>
                    <select id="se-tax" className="field-input" value={form.tax_form_status} onChange={e => setForm(p => ({ ...p, tax_form_status: e.target.value }))}>
                      <option value="not_required">Not required — below reporting threshold</option>
                      <option value="received">Received</option>
                    </select>
                    <p className="text-[11px] text-on-surface-variant mt-1">Marking as received stamps the received date automatically.</p>
                  </div>
                </div>
              </section>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</button>
              <button
                className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-50"
                onClick={saveProfile}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
