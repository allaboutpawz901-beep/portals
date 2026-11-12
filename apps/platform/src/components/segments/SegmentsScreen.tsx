'use client';
/**
 * SegmentsScreen — the REAL Segments view (Contacts → CRM Tools).
 *
 * Data: Supabase crm_segments (27 real rows) + crm_segment_memberships
 * (active member = exited_at IS NULL). No mock data anywhere — the list is
 * cache-first via useList (renders instantly, fills in when the fetch lands)
 * and every mutation updates the table / drawer IN PLACE first, then
 * reconciles with a background refresh. Toasts are supplementary only.
 *
 * Tabs: All / Static / Dynamic / Inactive. "Static" vs "Dynamic" is the
 * membership model: a segment is rule-driven (dynamic) when its definition
 * carries rules or its type says so, and manually managed (static) otherwise.
 */
import { useMemo, useState } from 'react';
import { useList, type CrmCustomer } from '@/hooks/useCrmApi';
import {
  useSegments,
  useSegmentDetail,
  createSegment,
  updateSegment,
  deleteSegment,
  addMember,
  removeMember,
  type SegmentRow,
  type SegmentMember,
} from '@/hooks/useSegmentsApi';

interface SegmentsScreenProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

/* ─── helpers ─── */

/** Rule-driven (dynamic) vs manually managed (static). */
function isRuleDriven(s: SegmentRow): boolean {
  if (s.segment_type === 'dynamic') return true;
  if (s.segment_type === 'static') return false;
  const def = s.definition as { rules?: unknown[] } | null | undefined;
  return Array.isArray(def?.rules) && (def?.rules?.length || 0) > 0;
}

function typePillClass(t: string): string {
  switch (t) {
    case 'lifecycle':
    case 'health':
    case 'dynamic':
      return 'customer';
    case 'behavioral':
    case 'marketing':
      return 'supplier';
    default: // operational, tag, static, unknown
      return 'contact';
  }
}

function memberName(m: Pick<SegmentMember, 'first_name' | 'last_name' | 'company_name' | 'email'>) {
  if (m.first_name && m.last_name) return `${m.first_name} ${m.last_name}`;
  return m.first_name || m.company_name || m.email || 'Unnamed customer';
}
function memberInitials(m: Pick<SegmentMember, 'first_name' | 'last_name' | 'company_name' | 'email'>) {
  const n = memberName(m);
  return (n.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase()) || '?';
}

const SEGMENT_TYPES: { value: string; label: string }[] = [
  { value: 'static', label: 'Static — manually managed list' },
  { value: 'dynamic', label: 'Dynamic — rule-based' },
  { value: 'lifecycle', label: 'Lifecycle' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'operational', label: 'Operational' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'health', label: 'Health' },
  { value: 'tag', label: 'Tag' },
];

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'static', label: 'Static' },
  { id: 'dynamic', label: 'Dynamic' },
  { id: 'inactive', label: 'Inactive' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/* ─── screen ─── */

export default function SegmentsScreen({ onToast, onNavigate }: SegmentsScreenProps) {
  /* List — cache-first: paints instantly (cached or empty), fills in place. */
  const { data: segments, loaded, refresh, setData } = useSegments();

  /* Detail — gated fetch, only when a drawer is open. */
  const [detailId, setDetailId] = useState<string | null>(null);
  const { segment: detailSegment, members, loaded: membersLoaded, setMembers } = useSegmentDetail(detailId);

  /* Customer picker source — same cache key/URL as the Customers screen,
     enabled only while the detail drawer is open. */
  const { data: customers } = useList<CrmCustomer>('crmCustomers::', '/api/crm/customers', undefined, { enabled: !!detailId });

  /* Table chrome */
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<TabId>('all');
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);

  /* Member picker (inline, inside the detail drawer) */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  /* Create / edit form drawer */
  const [formOpen, setFormOpen] = useState(false);
  const [formEditing, setFormEditing] = useState<SegmentRow | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState('static');
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ─── derived ─── */

  const counts = useMemo(() => ({
    all: segments.length,
    static: segments.filter(s => s.is_active && !isRuleDriven(s)).length,
    dynamic: segments.filter(s => s.is_active && isRuleDriven(s)).length,
    inactive: segments.filter(s => !s.is_active).length,
  }), [segments]);

  const filtered = useMemo(() => segments.filter(s => {
    const ql = q.trim().toLowerCase();
    const qOK = !ql || `${s.name} ${s.description || ''} ${s.segment_type}`.toLowerCase().includes(ql);
    let tabOK = true;
    if (tab === 'static') tabOK = s.is_active && !isRuleDriven(s);
    else if (tab === 'dynamic') tabOK = s.is_active && isRuleDriven(s);
    else if (tab === 'inactive') tabOK = !s.is_active;
    return qOK && tabOK;
  }), [segments, q, tab]);

  const totalMembers = useMemo(() => segments.reduce((sum, s) => sum + (s.member_count || 0), 0), [segments]);
  const filtersActive = !!q.trim() || tab !== 'all';

  /* Drawer segment: fresh detail when it lands; list row as instant fallback. */
  const drawerSegment: SegmentRow | null = detailId
    ? (detailSegment ?? segments.find(s => s.id === detailId) ?? null)
    : null;

  const memberIds = useMemo(() => new Set(members.map(m => m.customer_id)), [members]);
  const pickerResults = useMemo(() => {
    const ql = pickerQuery.trim().toLowerCase();
    return customers
      .filter(c => {
        if (!ql) return true;
        const hay = `${c.first_name || ''} ${c.last_name || ''} ${c.company_name || ''} ${c.email || ''}`.toLowerCase();
        return hay.includes(ql);
      })
      .slice(0, 30);
  }, [customers, pickerQuery]);

  /* ─── actions ─── */

  function openDetail(id: string) {
    setDetailId(id);
    setPickerOpen(false);
    setPickerQuery('');
    setRowMenuForId(null);
  }
  function closeDetail() {
    setDetailId(null);
    setPickerOpen(false);
    setPickerQuery('');
  }

  function openForm(s: SegmentRow | null) {
    setFormEditing(s);
    setFormName(s?.name ?? '');
    setFormDescription(s?.description ?? '');
    setFormType(s?.segment_type ?? 'static');
    setFormActive(s ? s.is_active : true);
    setFormOpen(true);
    setRowMenuForId(null);
    closeDetail();
  }
  function closeForm() {
    setFormOpen(false);
    setFormEditing(null);
  }

  async function handleSaveForm() {
    const name = formName.trim();
    if (!name) { onToast('Name is required'); return; }
    setSaving(true);
    const payload = { name, description: formDescription.trim() || null, segment_type: formType, is_active: formActive };

    if (formEditing) {
      const res = await updateSegment(formEditing.id, payload);
      setSaving(false);
      if (!res.ok) { onToast(`Save failed: ${res.error}`); return; }
      // Row updates in place — PATCH returns the raw row (no member_count),
      // so keep the count we already have. setData takes a plain array (not
      // an updater), computed from the current `segments` snapshot.
      setData(segments.map(x => (x.id === formEditing.id
        ? { ...x, ...(res.data as Partial<SegmentRow>), member_count: x.member_count }
        : x)));
      closeForm();
      onToast(`Segment "${name}" updated`);
    } else {
      const res = await createSegment(payload);
      setSaving(false);
      if (!res.ok) { onToast(`Create failed: ${res.error}`); return; }
      if (res.data) setData([{ ...(res.data as SegmentRow), member_count: res.data?.member_count ?? 0 }, ...segments]);
      closeForm();
      onToast(`Segment "${name}" created`);
    }
    refresh(); // reconcile with server truth (timestamps, ordering)
  }

  async function handleToggleActive(s: SegmentRow) {
    setRowMenuForId(null);
    const next = !s.is_active;
    setData(segments.map(x => (x.id === s.id ? { ...x, is_active: next } : x))); // flip the pill in place
    const res = await updateSegment(s.id, { is_active: next });
    if (!res.ok) {
      setData(segments.map(x => (x.id === s.id ? { ...x, is_active: s.is_active } : x))); // rollback
      onToast(`Update failed: ${res.error}`);
      return;
    }
    onToast(`Segment "${s.name}" ${next ? 'activated' : 'deactivated'}`);
    refresh();
  }

  async function handleDeleteSegment(s: SegmentRow) {
    setRowMenuForId(null);
    if (!confirm(`Delete segment "${s.name}"? Its ${s.member_count} membership(s) will be removed too.`)) return;
    const res = await deleteSegment(s.id);
    if (!res.ok) { onToast(`Delete failed: ${res.error}`); return; }
    setData(segments.filter(x => x.id !== s.id)); // table updates in place
    if (detailId === s.id) closeDetail();
    onToast(`Segment "${s.name}" deleted`);
    refresh();
  }

  async function handleAddMember(c: CrmCustomer) {
    if (!detailId) return;
    if (memberIds.has(c.id)) { onToast(`${memberName(c)} is already a member`); return; }
    setAddingId(c.id);
    const res = await addMember(detailId, c.id);
    setAddingId(null);
    if (!res.ok) { onToast(`Add failed: ${res.error}`); return; }
    // Visible in the member list immediately after save (updater-based,
    // so two quick adds can't clobber each other):
    setMembers(prev => [...prev, {
      membership_id: res.data?.id ?? `pending-${c.id}`,
      customer_id: c.id,
      entered_at: res.data?.entered_at ?? new Date().toISOString(),
      first_name: c.first_name,
      last_name: c.last_name,
      company_name: c.company_name,
      email: c.email,
    }]);
    setData(segments.map(x => (x.id === detailId ? { ...x, member_count: (x.member_count || 0) + 1 } : x)));
    onToast(`${memberName(c)} added to "${drawerSegment?.name ?? 'segment'}"`);
    refresh();
  }

  async function handleRemoveMember(m: SegmentMember) {
    if (!detailId) return;
    setRemovingId(m.customer_id);
    const res = await removeMember(detailId, m.customer_id);
    setRemovingId(null);
    if (!res.ok) { onToast(`Remove failed: ${res.error}`); return; }
    setMembers(prev => prev.filter(x => x.customer_id !== m.customer_id));
    setData(segments.map(x => (x.id === detailId ? { ...x, member_count: Math.max(0, (x.member_count || 0) - 1) } : x)));
    onToast(`${memberName(m)} removed from "${drawerSegment?.name ?? 'segment'}"`);
    refresh();
  }

  function clearFilters() {
    setQ('');
    setTab('all');
  }

  /* ─── render ─── */

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* BREADCRUMB */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Contacts</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Segments</span>
      </div>

      {/* PAGE HEADER */}
      <div className="flex items-start justify-between gap-4 py-3 mb-2 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Segments</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            From Supabase crm_segments · {segments.length} segments · {totalMembers} active memberships
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex items-center w-56 sm:w-72">
            <span className="material-symbols-outlined absolute left-2 text-[16px] text-on-surface-variant">search</span>
            <input
              className="w-full h-8 pl-8 pr-3 border border-surface-dim rounded text-body-sm bg-white focus:outline-none focus:border-primary"
              placeholder="Search segments…"
              aria-label="Search segments"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <button
            className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1"
            onClick={() => openForm(null)}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>New segment
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex items-center gap-1 mb-3 border-b border-surface-dim overflow-x-auto" role="tablist" aria-label="Segment filters">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`px-3 py-2 text-label-md tab-underline whitespace-nowrap ${tab === t.id ? 'active' : 'text-on-surface-variant'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span className="text-on-surface-variant">({counts[t.id]})</span>
          </button>
        ))}
        {filtersActive && (
          <button className="ml-auto h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 shrink-0" onClick={clearFilters}>
            <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>Clear filters
          </button>
        )}
      </div>

      {/* LIST CARD */}
      <div className="bg-white rounded-xl border border-surface-dim shadow-sm overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Members</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Updated</th>
                <th className="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {!loaded && segments.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-on-surface-variant/60">Fetching segments from Supabase…</td></tr>
              ) : filtered.length === 0 ? (
                segments.length === 0 ? (
                  /* Honest empty state — there is real data source, just no rows yet. */
                  <tr>
                    <td colSpan={6}>
                      <div className="py-12 px-6 text-center">
                        <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
                          <span className="material-symbols-outlined text-[28px] text-outline">category</span>
                        </div>
                        <h3 className="text-headline-sm mb-1">No segments yet</h3>
                        <p className="text-body-sm text-on-surface-variant mb-3 max-w-md mx-auto">
                          Segments group your customers for targeting and reporting. Create your first one — add customers by hand (static) or describe them with rules (dynamic).
                        </p>
                        <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container inline-flex items-center gap-1" onClick={() => openForm(null)}>
                          <span className="material-symbols-outlined text-[16px]">add</span>New segment
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <div className="py-10 px-6 text-center">
                        <h3 className="text-headline-sm mb-1">No segments match</h3>
                        <p className="text-body-sm text-on-surface-variant mb-3">
                          {tab === 'inactive'
                            ? 'No inactive segments — deactivate one from its row menu (⋯) and it will show up here.'
                            : 'Try a different search or tab.'}
                        </p>
                        <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={clearFilters}>Clear filters</button>
                      </div>
                    </td>
                  </tr>
                )
              ) : (
                filtered.map(s => (
                  <tr key={s.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openDetail(s.id)}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`pill role ${typePillClass(s.segment_type)} capitalize shrink-0`}>{s.segment_type}</span>
                        <span className="font-medium truncate" title={s.name}>{s.name}</span>
                      </div>
                      <div className="text-[10px] text-on-surface-variant mt-0.5">{isRuleDriven(s) ? 'Dynamic · rule-defined' : 'Static · manually managed'}</div>
                    </td>
                    <td className="px-3 py-2 max-w-[280px]">
                      <div className="text-[12px] text-on-surface-variant truncate" title={s.description || ''}>{s.description || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.member_count}</td>
                    <td className="px-3 py-2">
                      <span className={`pill ${s.is_active ? 'ok' : 'neutral'}`}>{s.is_active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-on-surface-variant">{(s.updated_at || s.created_at || '').slice(0, 10) || '—'}</td>
                    <td className="px-2 py-2 text-right relative" onClick={e => e.stopPropagation()}>
                      <button
                        className="w-7 h-7 rounded border border-surface-dim hover:bg-surface-container flex items-center justify-center mx-auto"
                        onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === s.id ? null : s.id); }}
                        title="Row actions"
                        aria-label={`Row actions for ${s.name}`}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                      {rowMenuForId === s.id && (
                        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                          <div className="menu-header">This segment</div>
                          <button onClick={() => { setRowMenuForId(null); openDetail(s.id); }}><span className="material-symbols-outlined">groups</span>View members</button>
                          <button onClick={() => openForm(s)}><span className="material-symbols-outlined">edit</span>Edit</button>
                          <button onClick={() => handleToggleActive(s)}>
                            <span className="material-symbols-outlined">{s.is_active ? 'toggle_off' : 'toggle_on'}</span>{s.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <div className="sep"></div>
                          <button className="danger" onClick={() => handleDeleteSegment(s)}><span className="material-symbols-outlined">delete</span>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-surface-dim text-[11px] text-on-surface-variant flex items-center justify-between shrink-0">
          <span>{filtered.length} of {segments.length} segments</span>
          <span>{totalMembers} active memberships</span>
        </div>
      </div>

      {/* Click-away for row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* ─── DETAIL DRAWER (members) ─── */}
      {drawerSegment && (
        <>
          <div className="drawer-scrim open" onClick={closeDetail} />
          <div className="drawer open" style={{ width: 720 }} role="dialog" aria-label={`Segment ${drawerSegment.name}`}>
            {/* Drawer header — instant from the cached list row, refreshed by the detail fetch */}
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">category</span>
                <span className="text-headline-sm truncate">{drawerSegment.name}</span>
                <span className={`pill role ${typePillClass(drawerSegment.segment_type)} capitalize shrink-0`}>{drawerSegment.segment_type}</span>
                <span className={`pill ${drawerSegment.is_active ? 'ok' : 'neutral'} shrink-0`}>{drawerSegment.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded border border-surface-dim text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => openForm(drawerSegment)}>
                  <span className="material-symbols-outlined text-[14px]">edit</span>Edit
                </button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeDetail} title="Close" aria-label="Close drawer">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* About */}
              <div className="bg-surface-container-low rounded-lg p-4">
                <div className="text-[11px] text-on-surface-variant uppercase font-bold mb-2">About</div>
                <p className="text-body-sm mb-3">{drawerSegment.description || 'No description.'}</p>
                <dl className="text-body-sm">
                  <div className="kv"><dt>Membership</dt><dd>{isRuleDriven(drawerSegment) ? 'Dynamic — rule-defined' : 'Static — manually managed'}</dd></div>
                  <div className="kv"><dt>Entity</dt><dd className="capitalize">{drawerSegment.entity_type || 'customer'}</dd></div>
                  <div className="kv"><dt>Members</dt><dd className="tabular-nums">{membersLoaded ? members.length : drawerSegment.member_count}</dd></div>
                  <div className="kv"><dt>Created</dt><dd>{(drawerSegment.created_at || '').slice(0, 10) || '—'}</dd></div>
                  <div className="kv"><dt>Updated</dt><dd>{(drawerSegment.updated_at || '').slice(0, 10) || '—'}</dd></div>
                </dl>
              </div>

              {/* Members */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[11px] text-on-surface-variant uppercase font-bold">Members ({membersLoaded ? members.length : '…'})</div>
                  <button
                    className="h-7 px-2.5 rounded bg-primary text-white text-label-sm font-semibold hover:bg-primary-container flex items-center gap-1"
                    onClick={() => { setPickerOpen(v => !v); setPickerQuery(''); }}
                  >
                    <span className="material-symbols-outlined text-[14px]">person_add</span>{pickerOpen ? 'Close picker' : 'Add member'}
                  </button>
                </div>

                {/* Inline member picker — search + customer results from /api/crm/customers */}
                {pickerOpen && (
                  <div className="border border-surface-dim rounded-lg p-2 mb-2 bg-white">
                    <div className="relative flex items-center">
                      <span className="material-symbols-outlined absolute left-2 text-[15px] text-on-surface-variant">search</span>
                      <input
                        className="field-input pl-7"
                        placeholder="Search customers by name, email, company…"
                        aria-label="Search customers to add"
                        autoFocus
                        value={pickerQuery}
                        onChange={e => setPickerQuery(e.target.value)}
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto mt-2 divide-y divide-surface-dim">
                      {customers.length === 0 ? (
                        <div className="px-2 py-3 text-body-sm text-on-surface-variant">Fetching customers from Supabase…</div>
                      ) : pickerResults.length === 0 ? (
                        <div className="px-2 py-3 text-body-sm text-on-surface-variant">No customers match “{pickerQuery}”.</div>
                      ) : pickerResults.map(c => {
                        const isMember = memberIds.has(c.id);
                        return (
                          <button
                            key={c.id}
                            className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-surface-container-low text-left"
                            onClick={() => (isMember ? onToast(`${memberName(c)} is already a member`) : handleAddMember(c))}
                          >
                            <span className="avatar">{memberInitials(c)}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13px] truncate">{memberName(c)}</span>
                              <span className="block text-[11px] text-on-surface-variant truncate">{c.email || 'No email'}{c.company_name ? ` · ${c.company_name}` : ''}</span>
                            </span>
                            {addingId === c.id ? (
                              <span className="pill info shrink-0"><span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>Adding…</span>
                            ) : isMember ? (
                              <span className="pill neutral shrink-0">Member</span>
                            ) : (
                              <span className="material-symbols-outlined text-[16px] text-primary">add_circle</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Member list — updates the moment a member is added/removed */}
                {!membersLoaded ? (
                  <div className="text-body-sm text-on-surface-variant py-2">Fetching members from Supabase…</div>
                ) : members.length === 0 ? (
                  <div className="text-body-sm text-on-surface-variant py-2">No members yet — use “Add member” to build this segment.</div>
                ) : (
                  <div className="border border-surface-dim rounded-lg divide-y divide-surface-dim">
                    {members.map(m => (
                      <div key={m.membership_id} className="flex items-center gap-3 px-3 py-2">
                        <span className="avatar">{memberInitials(m)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate">{memberName(m)}</div>
                          <div className="text-[11px] text-on-surface-variant truncate">
                            {m.email || 'No email'} · since {(m.entered_at || '').slice(0, 10) || '—'}
                          </div>
                        </div>
                        <button
                          className="fin-link"
                          onClick={() => (onNavigate ? onNavigate('contacts', 'customers') : onToast('Navigate → Customers'))}
                          title="Open Customers"
                        >
                          <span className="material-symbols-outlined">open_in_new</span>Open
                        </button>
                        <button
                          className="w-7 h-7 rounded hover:bg-red-50 text-error flex items-center justify-center shrink-0"
                          onClick={() => handleRemoveMember(m)}
                          title={`Remove ${memberName(m)} from segment`}
                          aria-label={`Remove ${memberName(m)} from segment`}
                          disabled={removingId === m.customer_id}
                        >
                          <span className="material-symbols-outlined text-[16px]">{removingId === m.customer_id ? 'progress_activity' : 'close'}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Drawer footer */}
            <div className="h-12 border-t border-surface-dim px-4 flex items-center justify-between shrink-0 bg-white">
              <button className="h-8 px-3 border border-error text-error rounded text-body-md hover:bg-red-50 flex items-center gap-1" onClick={() => handleDeleteSegment(drawerSegment)}>
                <span className="material-symbols-outlined text-[16px]">delete</span>Delete
              </button>
              <div className="flex items-center gap-2">
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => handleToggleActive(drawerSegment)}>
                  <span className="material-symbols-outlined text-[16px]">{drawerSegment.is_active ? 'toggle_off' : 'toggle_on'}</span>
                  {drawerSegment.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => openForm(drawerSegment)}>
                  <span className="material-symbols-outlined text-[16px]">edit</span>Edit segment
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── CREATE / EDIT DRAWER ─── */}
      {formOpen && (
        <>
          <div className="drawer-scrim open" onClick={closeForm} />
          <div className="drawer open drawer-narrow" role="dialog" aria-label={formEditing ? 'Edit segment' : 'New segment'}>
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <span className="text-headline-sm">{formEditing ? 'Edit segment' : 'New segment'}</span>
              <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeForm} title="Close" aria-label="Close form">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="field-label" htmlFor="segment-name">Name *</label>
                <input
                  id="segment-name"
                  className="field-input"
                  placeholder="e.g. VIP buyers in Texas"
                  autoFocus
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="segment-description">Description</label>
                <textarea
                  id="segment-description"
                  className="field-textarea"
                  rows={3}
                  placeholder="What defines this group of customers?"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="segment-type">Segment type</label>
                <select id="segment-type" className="field-input" value={formType} onChange={e => setFormType(e.target.value)}>
                  {SEGMENT_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <div className="pill-note">Static segments are managed by hand; dynamic segments refresh from their rules.</div>
              </div>
              <label className="flex items-center gap-2 text-body-sm cursor-pointer">
                <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} />
                Active — usable in campaigns and reports
              </label>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-end gap-2 shrink-0 bg-white">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeForm}>Cancel</button>
              <button
                className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={saving || !formName.trim()}
                onClick={handleSaveForm}
              >
                {saving ? 'Saving…' : formEditing ? 'Save changes' : 'Create segment'}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
