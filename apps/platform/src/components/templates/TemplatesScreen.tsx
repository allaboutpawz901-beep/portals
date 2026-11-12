'use client';
/**
 * TemplatesScreen — Contacts → CRM Tools → Templates.
 *
 * Real data from Supabase `crm_message_templates` via /api/crm/templates.
 * Cache-first (useTemplates): the screen paints instantly, rows fill in from
 * the background refresh, and Supabase is touched only when the user saves.
 *
 * Interactions (all with in-page feedback):
 *   • Row click        → peek drawer with the rendered preview + metadata
 *   • New / Edit       → full form drawer (Save and close / Save and new)
 *   • Duplicate        → POST "<name> (copy)"
 *   • Toggle active    → optimistic pill flip, reconciled by refresh()
 *   • Delete           → confirm(), optimistic removal, refresh()
 */
import { useEffect, useMemo, useState } from 'react';
import { useTemplates, useTemplateMutations, type CrmTemplate, type TemplateInput } from '@/hooks/useTemplatesApi';

interface TemplatesScreenProps {
  onToast: (m: string) => void;
}

/* ─── channel metadata ─── */
const CHANNELS = ['email', 'sms', 'chat'] as const;
type Channel = (typeof CHANNELS)[number];
const CHANNEL_META: Record<string, { icon: string; label: string }> = {
  email: { icon: 'mail', label: 'Email' },
  sms: { icon: 'sms', label: 'SMS' },
  chat: { icon: 'chat', label: 'Chat' },
};

const TABS: { id: 'all' | Channel; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'email', label: 'Email' },
  { id: 'sms', label: 'SMS' },
  { id: 'chat', label: 'Chat' },
];

/* ─── helpers ─── */
function channelMeta(channel: string) {
  return CHANNEL_META[channel] || { icon: 'chat', label: channel || '—' };
}
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function parseVariables(csv: string): string[] {
  return csv.split(',').map(v => v.trim()).filter(Boolean);
}

/* ─── form state ─── */
interface FormState {
  name: string;
  channel: Channel;
  category: string;
  subject: string;
  body: string;
  variables: string;
}
const EMPTY_FORM: FormState = {
  name: '',
  channel: 'email',
  category: '',
  subject: '',
  body: '',
  variables: '',
};

export default function TemplatesScreen({ onToast }: TemplatesScreenProps) {
  /* data — full tenant list; channel tabs filter client-side so every
     tab count is computed from the same cached list. */
  const { data: templates, loaded, refresh, setData } = useTemplates();
  const { createTemplate, updateTemplate, deleteTemplate } = useTemplateMutations();

  /* UI state */
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | Channel>('all');
  const [peekId, setPeekId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);

  /* full create/edit drawer */
  const [formOpen, setFormOpen] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState<CrmTemplate | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  /* Reset the form whenever the drawer opens for a different target. */
  useEffect(() => {
    if (!formOpen) return;
    if (editingSnapshot) {
      setForm({
        name: editingSnapshot.name,
        channel: (CHANNELS as readonly string[]).includes(editingSnapshot.channel)
          ? (editingSnapshot.channel as Channel)
          : 'email',
        category: editingSnapshot.category || '',
        subject: editingSnapshot.subject || '',
        body: editingSnapshot.body || '',
        variables: (editingSnapshot.variables || []).join(', '),
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [formOpen, editingSnapshot]);

  /* derived */
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return templates.filter(t => {
      const tabOK = tab === 'all' || t.channel === tab;
      if (!tabOK) return false;
      if (!ql) return true;
      return [t.name, t.subject, t.body, t.category, (t.variables || []).join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(ql);
    });
  }, [templates, q, tab]);

  const counts = useMemo(() => ({
    all: templates.length,
    email: templates.filter(t => t.channel === 'email').length,
    sms: templates.filter(t => t.channel === 'sms').length,
    chat: templates.filter(t => t.channel === 'chat').length,
  }), [templates]);

  const peek = peekId ? templates.find(t => t.id === peekId) || null : null;
  const filtersActive = !!q.trim() || tab !== 'all';

  /* ─── drawer plumbing ─── */
  function openForm(t: CrmTemplate | null) {
    setEditingSnapshot(t);
    setFormOpen(true);
    setPeekId(null);
    setRowMenuForId(null);
  }
  function closeForm() {
    setFormOpen(false);
    setEditingSnapshot(null);
  }

  function collect(): TemplateInput | null {
    const name = form.name.trim();
    if (!name) { onToast('Name is required'); return null; }
    return {
      name,
      channel: form.channel,
      subject: form.subject.trim() || null,
      body: form.body || null,
      variables: parseVariables(form.variables),
      category: form.category.trim() || null,
    };
  }

  async function persist(): Promise<boolean> {
    const payload = collect();
    if (!payload) return false;
    setSaving(true);
    try {
      if (editingSnapshot) {
        const res = await updateTemplate(editingSnapshot.id, payload);
        if (!res.ok) { onToast(`Save failed: ${res.error}`); return false; }
        onToast(`Template "${payload.name}" updated`);
      } else {
        const res = await createTemplate(payload);
        if (!res.ok) { onToast(`Save failed: ${res.error}`); return false; }
        onToast(`Template "${payload.name}" created`);
      }
      refresh(); // row appears / updates in the table
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndClose() {
    if (await persist()) closeForm();
  }
  async function saveAndNew() {
    if (await persist()) setForm({ ...EMPTY_FORM, channel: form.channel });
  }

  /* ─── row actions ─── */
  async function toggleActive(t: CrmTemplate) {
    setRowMenuForId(null);
    const next = !t.is_active;
    // optimistic pill flip — reconciled by refresh()
    setData(templates.map(x => (x.id === t.id ? { ...x, is_active: next } : x)));
    const res = await updateTemplate(t.id, { is_active: next });
    if (res.ok) {
      onToast(`Template "${t.name}" ${next ? 'activated' : 'deactivated'}`);
      refresh();
    } else {
      onToast(`Update failed: ${res.error}`);
      refresh(); // roll back to server truth
    }
  }

  async function duplicate(t: CrmTemplate) {
    setRowMenuForId(null);
    const res = await createTemplate({
      name: `${t.name} (copy)`,
      channel: t.channel,
      subject: t.subject,
      body: t.body,
      variables: t.variables || [],
      category: t.category,
    });
    if (res.ok) {
      onToast(`Duplicated as "${t.name} (copy)"`);
      refresh();
    } else {
      onToast(`Duplicate failed: ${res.error}`);
    }
  }

  async function removeTemplate(t: CrmTemplate) {
    setRowMenuForId(null);
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    const res = await deleteTemplate(t.id);
    if (res.ok) {
      // optimistic removal — the row disappears immediately
      setData(templates.filter(x => x.id !== t.id));
      if (peekId === t.id) setPeekId(null);
      onToast(`Template "${t.name}" deleted`);
      refresh();
    } else {
      onToast(`Delete failed: ${res.error}`);
    }
  }

  function rowAction(act: string, t: CrmTemplate) {
    switch (act) {
      case 'edit': openForm(t); break;
      case 'duplicate': void duplicate(t); break;
      case 'toggle': void toggleActive(t); break;
      case 'delete': void removeTemplate(t); break;
    }
  }

  /* ═══════════════════════════════ RENDER ═══════════════════════════════ */
  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* BREADCRUMB */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Contacts</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Templates</span>
      </div>

      {/* PAGE HEADER */}
      <div className="flex items-start justify-between gap-4 py-3 mb-3 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Templates</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Reusable messages for support replies and outreach · {templates.length} total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2 text-[16px] text-outline">search</span>
            <input
              className="h-8 w-56 pl-8 pr-3 bg-white border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
              placeholder="Search templates…"
              value={q}
              onChange={e => setQ(e.target.value)}
              aria-label="Search templates"
            />
          </div>
          <button
            className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1"
            onClick={() => openForm(null)}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>New template
          </button>
        </div>
      </div>

      {/* CHANNEL TABS */}
      <div className="flex items-center gap-1 border-b border-surface-dim mb-3">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`px-3 py-2 text-label-md tab-underline ${tab === t.id ? 'active' : 'text-on-surface-variant'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span className="text-on-surface-variant">({counts[t.id] || 0})</span>
          </button>
        ))}
      </div>

      {/* LIST CARD */}
      <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-left text-body-sm min-w-[880px]">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider sticky top-0">
              <tr>
                <th className="px-3 py-2">Template</th>
                <th className="px-3 py-2 w-28">Channel</th>
                <th className="px-3 py-2 w-32">Category</th>
                <th className="px-3 py-2">Variables</th>
                <th className="px-3 py-2 w-24">Status</th>
                <th className="px-3 py-2 w-28">Updated</th>
                <th className="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {!loaded && templates.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-on-surface-variant/60">Fetching from Supabase…</td></tr>
              ) : templates.length === 0 ? (
                /* ── honest empty state: table has zero rows in Supabase ── */
                <tr>
                  <td colSpan={7} className="p-0">
                    <div className="py-16 px-6 text-center">
                      <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
                        <span className="material-symbols-outlined text-[28px] text-outline">draft</span>
                      </div>
                      <h3 className="text-headline-sm mb-1">No templates yet</h3>
                      <p className="text-body-sm text-on-surface-variant mb-4">Create your first message template for support replies and outreach.</p>
                      <button
                        className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container inline-flex items-center gap-1"
                        onClick={() => openForm(null)}
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>New template
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-on-surface-variant">
                  No templates match{filtersActive ? ' — clear the search or channel filter.' : '.'}
                </td></tr>
              ) : (
                filtered.map(t => {
                  const ch = channelMeta(t.channel);
                  return (
                    <tr key={t.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => setPeekId(t.id)}>
                      <td className="px-3 py-2">
                        <div className="font-medium truncate max-w-[260px]" title={t.name}>{t.name}</div>
                        <div className="text-[11px] text-on-surface-variant truncate max-w-[260px]" title={t.subject || ''}>{t.subject || 'No subject'}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 text-[12px] text-on-surface-variant">
                          <span className="material-symbols-outlined text-[15px]">{ch.icon}</span>{ch.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {t.category
                          ? <span className="pill info" title={t.category}>{t.category}</span>
                          : <span className="text-[11px] text-on-surface-variant">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {(t.variables || []).length === 0
                            ? <span className="text-[11px] text-on-surface-variant">—</span>
                            : (t.variables || []).slice(0, 4).map(v => (
                              <span key={v} className="bg-surface-container-low border border-surface-dim rounded-full px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">{v}</span>
                            ))}
                          {(t.variables || []).length > 4 && (
                            <span className="text-[10px] text-on-surface-variant self-center">+{t.variables!.length - 4}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`pill role ${t.is_active ? 'customer' : ''}`}>{t.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-on-surface-variant whitespace-nowrap">{fmtDate(t.updated_at)}</td>
                      <td className="px-2 py-2 text-right relative">
                        <button
                          className="w-7 h-7 rounded border border-surface-dim hover:bg-surface-container flex items-center justify-center mx-auto"
                          onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === t.id ? null : t.id); }}
                          title="Row actions"
                          aria-label={`Actions for ${t.name}`}
                        >
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                        </button>
                        {rowMenuForId === t.id && (
                          <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                            <div className="menu-header">This template</div>
                            <button onClick={() => rowAction('edit', t)}><span className="material-symbols-outlined">edit</span>Edit</button>
                            <button onClick={() => rowAction('duplicate', t)}><span className="material-symbols-outlined">content_copy</span>Duplicate</button>
                            <button onClick={() => rowAction('toggle', t)}>
                              <span className="material-symbols-outlined">{t.is_active ? 'toggle_off' : 'toggle_on'}</span>
                              {t.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <div className="sep"></div>
                            <button className="danger" onClick={() => rowAction('delete', t)}><span className="material-symbols-outlined">delete</span>Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* footer */}
        <div className="px-3 py-2 border-t border-surface-dim text-[11px] text-on-surface-variant flex items-center justify-between">
          <span>{filtered.length} of {templates.length} templates</span>
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px]">database</span>Supabase · crm_message_templates
          </span>
        </div>
      </div>

      {/* Click-away for row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* ── PEEK DRAWER — rendered preview ── */}
      {peek && (
        <>
          <div className="drawer-scrim open" onClick={() => setPeekId(null)} />
          <div className="peek open" role="dialog" aria-label={`Preview of ${peek.name}`}>
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{channelMeta(peek.channel).icon}</span>
                <span className="text-headline-sm truncate">{peek.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded border border-surface-dim text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => openForm(peek)}>
                  <span className="material-symbols-outlined text-[14px]">edit</span>Edit
                </button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setPeekId(null)} aria-label="Close preview"><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-body-sm">
              {/* status pills */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`pill role ${peek.is_active ? 'customer' : ''}`}>{peek.is_active ? 'Active' : 'Inactive'}</span>
                {peek.is_system && <span className="pill warn">System</span>}
                {peek.category && <span className="pill info">{peek.category}</span>}
              </div>

              {/* rendered preview */}
              <section>
                <div className="section-h">Preview</div>
                <div className="bg-surface-container-low rounded-lg p-4 border border-surface-dim">
                  <div className="font-semibold text-[13px]">{peek.subject || <span className="text-on-surface-variant">(no subject)</span>}</div>
                  <div className="whitespace-pre-wrap mt-2 text-[13px] leading-relaxed">{peek.body || <span className="text-on-surface-variant">(no body)</span>}</div>
                </div>
              </section>

              {/* variables */}
              <section>
                <div className="section-h">Variables</div>
                {(peek.variables || []).length === 0 ? (
                  <div className="text-[12px] text-on-surface-variant">No variables — this template sends as-is.</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(peek.variables || []).map(v => (
                      <span key={v} className="bg-surface-container-low border border-surface-dim rounded-full px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant">{v}</span>
                    ))}
                  </div>
                )}
              </section>

              {/* metadata */}
              <section>
                <div className="section-h">Details</div>
                <dl>
                  <div className="kv"><dt>Channel</dt><dd>{channelMeta(peek.channel).label}</dd></div>
                  <div className="kv"><dt>Category</dt><dd>{peek.category || '—'}</dd></div>
                  <div className="kv"><dt>Status</dt><dd>{peek.is_active ? 'Active' : 'Inactive'}</dd></div>
                  <div className="kv"><dt>Created</dt><dd>{fmtDate(peek.created_at)}</dd></div>
                  <div className="kv"><dt>Updated</dt><dd>{fmtDate(peek.updated_at)}</dd></div>
                  <div className="kv"><dt>Template ID</dt><dd className="code-mono">{peek.id.slice(0, 8)}…</dd></div>
                </dl>
              </section>
            </div>
            <div className="h-12 border-t border-surface-dim px-4 flex items-center gap-2 shrink-0 bg-white">
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => openForm(peek)}>
                <span className="material-symbols-outlined text-[16px]">edit</span>Edit template
              </button>
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => void duplicate(peek)}>
                <span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate
              </button>
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1 ml-auto" onClick={() => void toggleActive(peek)}>
                <span className="material-symbols-outlined text-[16px]">{peek.is_active ? 'toggle_off' : 'toggle_on'}</span>
                {peek.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── FULL FORM DRAWER — create / edit ── */}
      {formOpen && (
        <>
          <div className="drawer-scrim open" onClick={closeForm} />
          <div className="drawer open" role="dialog" aria-label={editingSnapshot ? 'Edit template' : 'New template'}>
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">{editingSnapshot ? 'edit' : 'draft'}</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">{editingSnapshot ? 'Edit template' : 'New template'}</div>
                  <div className="text-[11px] text-on-surface-variant truncate">{editingSnapshot ? editingSnapshot.name : 'A reusable message for support replies and outreach.'}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeForm} aria-label="Close"><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* basics */}
              <section>
                <div className="section-h">Basics</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label" htmlFor="tpl-name">Name <span className="text-error">*</span></label>
                    <input
                      id="tpl-name"
                      className="field-input"
                      placeholder="e.g. Support — first reply"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label" htmlFor="tpl-channel">Channel</label>
                      <select id="tpl-channel" className="field-input" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value as Channel }))}>
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                        <option value="chat">Chat</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label" htmlFor="tpl-category">Category</label>
                      <input
                        id="tpl-category"
                        className="field-input"
                        placeholder="e.g. support, follow_up"
                        value={form.category}
                        onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="tpl-subject">Subject</label>
                    <input
                      id="tpl-subject"
                      className="field-input"
                      placeholder={form.channel === 'email' ? 'Subject line' : 'Title (optional)'}
                      value={form.subject}
                      onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    />
                  </div>
                </div>
              </section>

              {/* body */}
              <section>
                <div className="section-h">Message body</div>
                <textarea
                  id="tpl-body"
                  className="field-textarea"
                  style={{ minHeight: 200 }}
                  rows={10}
                  placeholder={'Write the message…\nUse {{customer_name}} style placeholders for variables.'}
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                />
                <div className="text-[11px] text-on-surface-variant mt-1">{form.body.length} characters</div>
              </section>

              {/* variables */}
              <section>
                <div className="section-h">Variables</div>
                <input
                  id="tpl-variables"
                  className="field-input"
                  placeholder="Comma-separated, e.g. customer_name, order_number"
                  value={form.variables}
                  onChange={e => setForm(f => ({ ...f, variables: e.target.value }))}
                />
                <div className="text-[11px] text-on-surface-variant mt-1">Separate with commas — each becomes a merge chip.</div>
                {parseVariables(form.variables).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {parseVariables(form.variables).map(v => (
                      <span key={v} className="bg-surface-container-low border border-surface-dim rounded-full px-2.5 py-1 text-[11px] font-semibold text-on-surface-variant">{v}</span>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeForm}>Cancel</button>
              <div className="flex items-center gap-2">
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low disabled:opacity-50" onClick={saveAndNew} disabled={saving}>Save and new</button>
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-50" onClick={saveAndClose} disabled={saving}>{saving ? 'Saving…' : 'Save and close'}</button>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
