'use client';
/**
 * PartyProfile — the ONE full-page profile for every party type.
 *
 * Customers, Vendors, Suppliers, Leads all open this same page. They're all
 * "parties" — the same data model, different role tags. The Customers list,
 * Vendors list, Suppliers list are just role-filtered views of /api/parties.
 *
 * Data flow (instant-render pattern):
 *   1. Renders immediately from the `summary` prop (name/roles/balance from the
 *      cached list row — already in hand when the user clicks).
 *   2. Background-fetches the full record via useParty(id, source) →
 *      GET /api/parties/[id]?source=…, which returns the source-table row +
 *      notes/tasks/activity in one unified shape.
 *
 * Design: 8 tabs (Transaction List · Activity Feed · Statements · Recurring ·
 * Details · Late Fees · Notes · Tasks) + profile card with financial summary +
 * lifecycle stage changer (customers) / 1099 & terms (vendors) / kind & status
 * (suppliers) / lead source & follow-up (leads).
 */
import { useState, useMemo, useEffect } from 'react';
import {
  useParty,
  usePlatformMutations,
  fetchJson,
  type PartyDetail,
} from '@/hooks/useCrmApi';
import { useCustomerTransactions } from '@/hooks/useAccounting';
import { exportToCsv } from '@/lib/csvExport';
import { useSellerStore } from '@/lib/sellerStore';
import PartyFormDrawer, { type PartyFormEditTarget } from './PartyFormDrawer';

type Tab = 'transactions' | 'activity' | 'statements' | 'recurring' | 'details' | 'latefees' | 'notes' | 'tasks';

const money = (n: number | null | undefined) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function initials(name: string) {
  return (name || '').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '??';
}
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const TABS: { id: Tab; label: string; badge?: string }[] = [
  { id: 'transactions', label: 'Transaction List' },
  { id: 'activity', label: 'Activity Feed' },
  { id: 'statements', label: 'Statements' },
  { id: 'recurring', label: 'Recurring Transactions' },
  { id: 'details', label: 'Details' },
  { id: 'latefees', label: 'Late Fees' },
  { id: 'notes', label: 'Notes' },
  { id: 'tasks', label: 'Tasks', badge: 'New' },
];

/* "New transaction" menu — adapts to role: customers get Invoice/Receipt,
   vendors get Bill/Check, suppliers get PO, leads get Estimate, sellers get
   the vendor-style set (you pay sellers commissions/production costs). */
const TXN_MENU_BY_ROLE: Record<string, string[]> = {
  customer: ['Invoice', 'Payment', 'Recurring payment', 'Estimate', 'Payment Link', 'Sales Receipt', 'Credit memo', 'Statement'],
  vendor: ['Bill', 'Check', 'Expense', 'Purchase order', 'Vendor credit', 'Recurring bill'],
  supplier: ['Purchase order', 'Bill', 'Check'],
  lead: ['Estimate', 'Invoice'],
  seller: ['Bill', 'Check', 'Expense', 'Statement'],
};

interface PartyProfileProps {
  partyId: string;
  source: string; // 'crm_customers' | 'acct_vendors' | 'suppliers' | 'crm_leads'
  /** Label for the back button — the screen the user traveled FROM
   *  (e.g. "Parties" when arriving via the Parties list, "Customers" when
   *  arriving via the Customers list). NOT derived from the party's role:
   *  the same customer opened from Parties must say "← Parties". */
  backLabel?: string;
  /** Instant-render summary from the cached list row (optional). */
  summary?: {
    name?: string;
    roles?: string[];
    balance?: number;
    email?: string | null;
    phone?: string | null;
  };
  onToast: (m: string) => void;
  onBack: () => void;
  onNavigate?: (d: string, s: string) => void;
  onCreate?: (label: string, prefill?: { partyName?: string; partyId?: string; source?: string }) => void;
}

export default function PartyProfile({ partyId, source, backLabel, summary, onToast, onBack, onNavigate, onCreate }: PartyProfileProps) {
  const { data: party, loaded, refresh } = useParty(partyId, source);
  const [tab, setTab] = useState<Tab>('transactions');
  const [txnMenuOpen, setTxnMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [noteDrawerOpen, setNoteDrawerOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'open' | 'done' | 'overdue'>('all');

  const { createNote, updateNote, deleteNote, createTask, updateTask, deleteTask } = usePlatformMutations(onToast);
  // Note composer drawer state — noteBody is the large textarea in the
  // drawer, noteType lets the user tag the note (general / call / meeting /
  // follow-up). The drawer replaces the cramped bottom input so the user
  // has room to type freely.
  const [noteBody, setNoteBody] = useState('');
  const [noteType, setNoteType] = useState('general');
  // Note inline-edit state — editingNoteId === null means no note is being
  // edited; when set, that note's body renders as a textarea instead of text.
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteBody, setEditingNoteBody] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');
  // Task drawer edit mode — editingTaskId === null means the drawer is
  // creating a new task; when set, the drawer is editing that task and the
  // Save button PATCHes instead of POSTs.
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  // Derive the role label from the source table for display + menu.
  const roleKey = source === 'crm_customers' ? 'customer'
    : source === 'acct_vendors' ? 'vendor'
    : source === 'suppliers' ? 'supplier'
    : source === 'sellers' ? 'seller'
    : source === 'crm_leads' ? 'lead' : 'customer';
  const roleLabel = roleKey.charAt(0).toUpperCase() + roleKey.slice(1);
  const txnMenu = TXN_MENU_BY_ROLE[roleKey] || TXN_MENU_BY_ROLE.customer;

  // Instant-render fallback while the full record loads.
  const displayName = party?.name || summary?.name || 'Unnamed party';
  const displayRoles = party?.roles || summary?.roles || [roleKey];
  const displayBalance = party?.balance ?? summary?.balance ?? 0;

  // Edit opens the CANONICAL PartyFormDrawer (the same form every create
  // button uses) in editing mode — one form, full prefill, PATCH on save.
  const openEdit = () => setEditOpen(true);

  const editTarget: PartyFormEditTarget | null = party ? {
    id: party.id,
    source: party.source,
    name: party.name || '',
    email: party.email || '',
    phone: party.phone || '',
    address: party.address_line1 || '',
    company: party.company,
    first: party.first_name,
    last: party.last_name,
    display: party.preferred_name,
    mobile: party.mobile_phone,
    address2: party.address_line2,
    city: party.city,
    state: party.state,
    zip: party.postal_code,
    country: party.country,
    customerType: party.customer_type,
    marketingEmail: party.marketing_email_opt_in,
    marketingSms: party.marketing_sms_opt_in,
    terms: party.payment_terms_days,
    is1099: party.is_1099_vendor,
    taxNumber: party.tax_number,
    w9Received: !!party.w9_received_at,
    kind: party.kind,
    apiUrl: party.api_base_url,
    leadSource: party.lead_source,
    leadType: party.lead_type,
    leadStatus: party.status,
    nextFollowUp: party.next_follow_up_at ? String(party.next_follow_up_at).slice(0, 10) : null,
    leadNotes: party.lead_notes,
    website: party.website,
    commissionRate: party.commission_rate != null ? String(party.commission_rate) : null,
    applicantType: party.applicant_type === 'business_seller' ? 'business' : party.applicant_type === 'individual_seller' ? 'individual' : party.applicant_type,
    roles: (party.roles || []).map(r => r.charAt(0).toUpperCase() + r.slice(1)),
  } : null;

  async function handleArchive() {
    try {
      const res = await fetchJson<{ data: any }>(`/api/parties/${partyId}?source=${source}`, { method: 'DELETE' });
      if (res.ok) { onToast(`${roleLabel} archived`); onBack(); }
      else onToast(`Archive failed: ${res.error}`);
    } catch (e: any) { onToast(`Error: ${e.message}`); }
  }

  async function handleAddNote() {
    if (!noteBody.trim()) return;
    try {
      await createNote({ customer_id: partyId, body: noteBody, note_type: noteType || 'general' });
      onToast('Note added');
      setNoteBody('');
      setNoteType('general');
      setNoteDrawerOpen(false);
      refresh();
    } catch (e: any) { onToast(`Error: ${e.message}`); }
  }

  /** Jump to the Notes tab and open the composer drawer so the user can
   *  type freely — the old cramped bottom input is gone. */
  function focusNoteComposer() {
    setTab('notes');
    setNoteDrawerOpen(true);
  }

  /** REAL task completion — PATCHes crm_tasks.status and refreshes. */
  async function handleSetTaskStatus(taskId: string, status: 'done' | 'open') {
    try {
      const res = await fetchJson(`/api/crm/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (res.ok) {
        onToast(status === 'done' ? 'Task completed' : 'Task reopened');
        refresh();
      } else {
        onToast(`Could not update task: ${res.error}`);
      }
    } catch (e: any) { onToast(`Error: ${e.message}`); }
  }

  /** REAL print — prints the profile page. */
  function handlePrint() {
    window.print();
  }

  /** REAL export — downloads the active tab's data as CSV. */
  function handleExport() {
    if (tab === 'notes') {
      exportToCsv(notes.map(n => ({ type: n.note_type || 'general', body: n.body, created_at: n.created_at || '' })),
        [{ key: 'created_at', label: 'Date' }, { key: 'type', label: 'Type' }, { key: 'body', label: 'Note' }],
        `${displayName}-notes`);
    } else if (tab === 'tasks') {
      exportToCsv(tasks.map(t => ({ title: t.title, type: t.task_type || '', priority: t.priority || '', status: t.status || '', due_at: t.due_at || '' })),
        [{ key: 'title', label: 'Task' }, { key: 'type', label: 'Type' }, { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status' }, { key: 'due_at', label: 'Due Date' }],
        `${displayName}-tasks`);
    } else if (tab === 'activity') {
      exportToCsv(activity.map(a => ({ activity_type: a.activity_type, description: a.description || '', created_at: a.created_at || '' })),
        [{ key: 'created_at', label: 'Date' }, { key: 'activity_type', label: 'Activity' }, { key: 'description', label: 'Description' }],
        `${displayName}-activity`);
    } else {
      // Transactions / statements / recurring — header-only CSV until the
      // first transaction is created (the list is data-driven).
      exportToCsv([],
        [{ key: 'date', label: 'Date' }, { key: 'type', label: 'Type' }, { key: 'no', label: 'No.' }, { key: partyKeyLabel, label: roleLabel }, { key: 'memo', label: 'Memo' }, { key: 'amount', label: 'Amount' }, { key: 'status', label: 'Status' }],
        `${displayName}-transactions`);
    }
    onToast(`Exported ${displayName} — ${roleLabel.toLowerCase()} file downloaded`);
  }

  async function handleAddTask() {
    if (!taskTitle.trim()) return;
    try {
      await createTask({
        customer_id: partyId,
        title: taskTitle,
        task_type: 'follow_up',
        priority: taskPriority,
        status: 'open',
        due_at: taskDue || null,
      });
      onToast('Task created');
      setTaskDrawerOpen(false);
      resetTaskForm();
      refresh();
    } catch (e: any) { onToast(`Error: ${e.message}`); }
  }
  // Save (drawer) — creates a new task OR patches the editing one.
  async function handleSaveTask() {
    if (editingTaskId) {
      const res = await updateTask(editingTaskId, {
        title: taskTitle,
        priority: taskPriority,
        due_at: taskDue || null,
      });
      if (res.ok) { setTaskDrawerOpen(false); resetTaskForm(); refresh(); }
      return;
    }
    await handleAddTask();
  }

  function handleNewTxn(label: string) {
    setTxnMenuOpen(false);
    if (onCreate) {
      onCreate(label, { partyName: displayName, partyId, source, email: party?.email ?? summary?.email ?? null });
    }
  }

  // ── Note edit/delete ──
  function startEditNote(id: string, body: string) {
    setEditingNoteId(id);
    setEditingNoteBody(body);
  }
  function cancelEditNote() {
    setEditingNoteId(null);
    setEditingNoteBody('');
  }
  async function saveEditNote(id: string) {
    const body = editingNoteBody.trim();
    if (!body) { onToast('Note body cannot be empty'); return; }
    const res = await updateNote(id, { body });
    if (res.ok) { cancelEditNote(); refresh(); }
  }
  async function handleDeleteNote(id: string) {
    if (!confirm('Delete this note?')) return;
    const res = await deleteNote(id);
    if (res.ok) refresh();
  }

  // ── Task edit/delete ──
  // Edit reuses the same task drawer — prefill the form fields and set
  // editingTaskId so Save knows to PATCH instead of POST.
  function startEditTask(t: { id: string; title: string; priority: string; due_at: string | null }) {
    setEditingTaskId(t.id);
    setTaskTitle(t.title);
    setTaskPriority(t.priority || 'medium');
    setTaskDue(t.due_at ? t.due_at.slice(0, 10) : '');
    setTaskDrawerOpen(true);
  }
  function resetTaskForm() {
    setEditingTaskId(null);
    setTaskTitle('');
    setTaskDue('');
    setTaskPriority('medium');
  }
  async function handleDeleteTask(id: string) {
    if (!confirm('Delete this task?')) return;
    const res = await deleteTask(id);
    if (res.ok) refresh();
  }

  const notes = party?.notes || [];
  const tasks = party?.tasks || [];
  const activity = party?.activity || [];

  // ── Documents for this party (invoices, estimates, receipts, etc.)
  //    Read from the REAL Supabase tables via /api/invoices, /api/receipts,
  //    /api/estimates. NOT the client-side platformStore — that's a cache;
  //    the database is the source of truth. Saved invoices show up here
  //    immediately because DocumentEngine.save() POSTs to /api/invoices.
  const { data: customerTxns, loaded: txnsLoaded, refresh: refreshTxns } = useCustomerTransactions(partyId);
  const [txnTypeFilter, setTxnTypeFilter] = useState<string>('all');
  const [txnStatusFilter, setTxnStatusFilter] = useState<string>('all');

  // When the DocumentEngine saves a document for this party (or any
  // party), refresh the Transaction List so the new invoice/receipt
  // shows up immediately — the user just saved it, they expect to
  // see it when they return to the profile.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.partyId === partyId || !detail.partyId) {
        refreshTxns();
      }
    };
    window.addEventListener('document-saved', handler);
    return () => window.removeEventListener('document-saved', handler);
  }, [partyId, refreshTxns]);
  const visibleDocuments = useMemo(() => {
    let docs = customerTxns;
    if (txnTypeFilter !== 'all') {
      const map: Record<string, string> = {
        Invoices: 'Invoice',
        Estimates: 'Estimate',
        'Sales Receipts': 'Receipt',
      };
      const want = map[txnTypeFilter];
      if (want) docs = docs.filter((d) => d.type === want);
    }
    if (txnStatusFilter !== 'all') {
      const s = txnStatusFilter.toLowerCase();
      docs = docs.filter((d) => d.status.toLowerCase().includes(s));
    }
    return docs;
  }, [customerTxns, txnTypeFilter, txnStatusFilter]);
  const openTaskCount = tasks.filter(t => t.status !== 'done' && t.status !== 'closed').length;
  const openBalance = party?.outstanding_balance ?? party?.balance ?? 0;
  const isCustomer = roleKey === 'customer';
  const isVendor = roleKey === 'vendor';
  const isSupplier = roleKey === 'supplier';
  const isLead = roleKey === 'lead';
  const isSeller = roleKey === 'seller';
  const partyKeyLabel = roleKey; // column header key for CSV exports

  // Real task filtering (All / Open / Done / Overdue).
  const nowIso = new Date().toISOString();
  const visibleTasks = tasks.filter(t => {
    if (taskFilter === 'open') return t.status !== 'done' && t.status !== 'closed';
    if (taskFilter === 'done') return t.status === 'done';
    if (taskFilter === 'overdue') return t.status !== 'done' && t.status !== 'closed' && !!t.due_at && t.due_at < nowIso;
    return true;
  });

  return (
    <main className="flex flex-col h-full overflow-hidden bg-background">
      {/* ═══ TOP ACTION BAR ═══ */}
      <header className="h-14 px-6 flex items-center justify-between bg-white border-b border-surface-dim shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <button className="flex items-center gap-1 text-primary font-semibold text-[13px] hover:underline shrink-0" onClick={onBack}>
            <span className="material-symbols-outlined text-[16px]">arrow_back_ios</span>{backLabel || 'Parties'}
          </button>
          <span className="text-on-surface-variant text-[12px] truncate">/ {displayName}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button className="h-8 px-3 border border-error/60 text-error rounded bg-white text-[13px] font-semibold hover:bg-error-container" onClick={handleArchive}>Archive</button>
          <button className="h-8 px-3 border border-surface-dim rounded bg-white text-[13px] font-semibold hover:bg-surface-container" onClick={openEdit}>Edit</button>
          <div className="relative">
            <div className="flex">
              <button className="h-8 px-3 bg-primary text-white text-[13px] font-semibold rounded-l hover:bg-primary-container flex items-center gap-1" onClick={() => handleNewTxn(txnMenu[0])}>
                New transaction
              </button>
              <button className="h-8 px-1.5 bg-primary text-white rounded-r hover:bg-primary-container border-l border-primary-container" onClick={e => { e.stopPropagation(); setTxnMenuOpen(v => !v); }}>
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            {txnMenuOpen && (
              <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, minWidth: 220 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">New transaction</div>
                {txnMenu.map(label => (
                  <button key={label} onClick={() => handleNewTxn(label)}>
                    <span className="material-symbols-outlined">{label.includes('Invoice') || label.includes('Bill') ? 'receipt_long' : label.includes('Estimate') || label.includes('Quote') ? 'request_quote' : label.includes('Check') || label.includes('Payment') ? 'payments' : label.includes('Credit') ? 'credit_card' : label.includes('Order') ? 'shopping_bag' : 'description'}</span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ═══ SCROLLABLE CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto p-6">
        {!loaded && !party ? (
          <div className="flex items-center justify-center py-16 text-on-surface-variant">
            <span className="material-symbols-outlined animate-spin text-[32px] mr-2">progress_activity</span>
            Loading {roleLabel.toLowerCase()}…
          </div>
        ) : (
        <>
        {/* ── PROFILE CARD ── */}
        <div className="bg-white border border-surface-dim rounded-xl p-6 flex gap-6 mb-4">
          {/* Avatar + name */}
          <div className="w-1/4 flex flex-col items-center justify-center text-center border-r border-surface-dim pr-6">
            <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center text-2xl font-bold text-on-surface-variant mb-3">
              {initials(displayName)}
            </div>
            <h1 className="text-[22px] font-semibold mb-1">{displayName}</h1>
            {party?.company && party.company !== displayName && (
              <div className="text-[12px] text-on-surface-variant mb-3">{party.company}</div>
            )}
            {!party?.company && (
              <a href="#" className="text-[12px] text-primary hover:underline mb-3" onClick={e => { e.preventDefault(); openEdit(); }}>Add company name</a>
            )}
            <div className="flex items-center gap-2 mb-2 flex-wrap justify-center">
              {displayRoles.map(r => (
                <span key={r} className={`pill role ${r === 'customer' ? 'customer' : r === 'vendor' ? 'vendor' : r === 'supplier' ? 'supplier' : r === 'seller' ? 'seller' : 'contact'}`}>{r}</span>
              ))}
              {isCustomer && party?.customer_type && <span className="pill tag">{party.customer_type}</span>}
              {isVendor && party?.vendor_number && <span className="pill tag">#{party.vendor_number}</span>}
              {isSupplier && party?.kind && <span className="pill tag">{party.kind}</span>}
              {isSeller && party?.status && <span className="pill tag" title="Onboarding status">{party.status}</span>}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high" title="Create note" onClick={focusNoteComposer}><span className="material-symbols-outlined text-[18px]">edit_note</span></button>
              <button className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center hover:bg-surface-container-high" title="Create task" onClick={() => setTaskDrawerOpen(true)}><span className="material-symbols-outlined text-[18px]">task_alt</span></button>
            </div>
          </div>

          {/* Contact grid */}
          <div className="flex-1 grid grid-cols-2 gap-6 text-[13px]">
            <div className="space-y-4">
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">Email</div>
                {party?.email ? <a href={`mailto:${party.email}`} className="text-primary hover:underline">{party.email}</a> : <button className="text-primary hover:underline" onClick={openEdit}>Add email</button>}
              </div>
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">{isVendor ? 'Terms' : 'Billing address'}</div>
                {isVendor && party?.payment_terms_days != null ? `${party.payment_terms_days} days` :
                 party ? ([party.address_line1, party.city, party.state, party.postal_code].filter(Boolean).join(', ') || <button className="text-primary hover:underline" onClick={openEdit}>Add billing address</button>) :
                 <button className="text-primary hover:underline" onClick={openEdit}>Add billing address</button>}
              </div>
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">Notes</div>
                {notes.length > 0 ? <span className="text-on-surface">{notes.length} note{notes.length === 1 ? '' : 's'}</span> : <button className="text-primary hover:underline" onClick={() => setTab('notes')}>Add notes</button>}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">Phone</div>
                {party?.phone ? <span>{party.phone}</span> : <button className="text-primary hover:underline" onClick={openEdit}>Add phone number</button>}
              </div>
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">
                  {isLead ? 'Lead source' : isSupplier ? 'Ordering status' : isVendor ? '1099 / W-9' : 'Shipping address'}
                </div>
                {isLead ? (party?.lead_source || <button className="text-primary hover:underline" onClick={openEdit}>Add source</button>) :
                 isSupplier ? (party?.ordering_status || '—') :
                 isVendor ? (
                   <span className="flex items-center gap-2">
                     {party?.is_1099_vendor ? <span className="pill tag">1099</span> : 'Not 1099'}
                     {party?.w9_received_at ? <span className="pill status role customer">W-9 ✓</span> : <span className="pill tag">No W-9</span>}
                   </span>
                 ) :
                 <button className="text-primary hover:underline" onClick={openEdit}>Add shipping address</button>}
              </div>
              <div>
                <div className="font-semibold text-on-surface-variant mb-1">Custom Fields</div>
                <button className="mt-1 text-on-surface-variant hover:text-on-surface" onClick={openEdit}><span className="material-symbols-outlined text-[18px]">edit</span></button>
              </div>
            </div>
          </div>

          {/* Financial / status summary */}
          <div className="w-64 shrink-0 bg-[#eef5fa] rounded-lg p-4">
            <h3 className="font-semibold text-[14px] mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">
                {isCustomer ? 'account_balance_wallet' : isVendor ? 'payments' : isSupplier ? 'factory' : isLead ? 'flag' : 'person'}
              </span>
              {isCustomer ? 'Financial summary' : isVendor ? 'Vendor terms' : isSupplier ? 'Supplier info' : isLead ? 'Lead info' : 'Summary'}
            </h3>
            {isCustomer && (
              <>
                <div className="mb-4">
                  <div className="flex items-center gap-1 text-[12px] text-on-surface-variant mb-1"><span className={`w-2 h-2 rounded-full ${openBalance > 0 ? 'bg-yellow-400' : 'bg-green-500'}`}></span>Open Balance</div>
                  <div className="text-[20px] font-semibold text-on-surface">{money(openBalance)}</div>
                </div>
                <div className="mb-4">
                  <div className="flex items-center gap-1 text-[12px] text-on-surface-variant mb-1"><span className="w-2 h-2 rounded-full bg-secondary"></span>Lifetime value</div>
                  <div className="text-[20px] font-semibold text-on-surface">{money(party?.lifetimeValue)}</div>
                </div>
                <div className="pt-3 border-t border-surface-dim grid grid-cols-2 gap-2 text-[12px]">
                  <div><div className="text-on-surface-variant">Visits</div><div className="font-semibold">{party?.total_visits ?? 0}</div></div>
                  <div><div className="text-on-surface-variant">30d spend</div><div className="font-semibold">{money(party?.total_spend_30d)}</div></div>
                  <div><div className="text-on-surface-variant">Last activity</div><div className="font-semibold">{party?.last_activity_at ? `${daysSince(party.last_activity_at)}d ago` : '—'}</div></div>
                  <div><div className="text-on-surface-variant">Added</div><div className="font-semibold">{fmtDate(party?.created_at)}</div></div>
                </div>
              </>
            )}
            {isVendor && (
              <div className="space-y-3 text-[13px]">
                <div><div className="text-[11px] text-on-surface-variant">Payment terms</div><div className="font-semibold">{party?.payment_terms_days ?? 30} days</div></div>
                <div><div className="text-[11px] text-on-surface-variant">1099 vendor</div><div className="font-semibold">{party?.is_1099_vendor ? 'Yes' : 'No'}</div></div>
                <div><div className="text-[11px] text-on-surface-variant">W-9 received</div><div className="font-semibold">{party?.w9_received_at ? fmtDate(party.w9_received_at) : 'Not received'}</div></div>
                <div><div className="text-[11px] text-on-surface-variant">Status</div><div className="font-semibold">{party?.lifecycle_status}</div></div>
                <div><div className="text-[11px] text-on-surface-variant">Added</div><div className="font-semibold">{fmtDate(party?.created_at)}</div></div>
              </div>
            )}
            {isSupplier && (
              <div className="space-y-3 text-[13px]">
                <div><div className="text-[11px] text-on-surface-variant">Kind</div><div className="font-semibold">{party?.kind || '—'}</div></div>
                <div><div className="text-[11px] text-on-surface-variant">Ordering status</div><div className="font-semibold">{party?.ordering_status || '—'}</div></div>
                <div><div className="text-[11px] text-on-surface-variant">Added</div><div className="font-semibold">{fmtDate(party?.created_at)}</div></div>
              </div>
            )}
            {isLead && (
              <div className="space-y-3 text-[13px]">
                <div><div className="text-[11px] text-on-surface-variant">Status</div><div className="font-semibold">{party?.status || '—'}</div></div>
                <div><div className="text-[11px] text-on-surface-variant">Source</div><div className="font-semibold">{party?.lead_source || '—'}</div></div>
                <div><div className="text-[11px] text-on-surface-variant">First contact</div><div className="font-semibold">{fmtDate(party?.first_contact_at)}</div></div>
                <div><div className="text-[11px] text-on-surface-variant">Next follow-up</div><div className="font-semibold">{fmtDate(party?.next_follow_up_at)}</div></div>
              </div>
            )}
          </div>
        </div>

        {/* ── LIFECYCLE / STATUS BAR (customers only — stage changer) ── */}
        {isCustomer && party?.lifecycleStage && (
          <div className="bg-white border border-surface-dim rounded-xl p-4 mb-4 flex items-center gap-3">
            <div className="text-[12px] text-on-surface-variant uppercase font-bold">Lifecycle stage</div>
            <StageChanger partyId={partyId} source={source} current={party.lifecycleStage} onToast={onToast} onSaved={refresh} />
          </div>
        )}

        {/* ── TABS ── */}
        <div className="border-b border-surface-dim mb-4 overflow-x-auto">
          <div className="flex items-center gap-6 min-w-max">
            {TABS.map(t => (
              <button key={t.id} className={`pb-3 text-[14px] tab-underline ${tab === t.id ? 'active' : 'text-on-surface-variant hover:text-on-surface'} flex items-center gap-2`} onClick={() => setTab(t.id)}>
                {t.label}
                {t.badge && <span className="bg-[#d81b60] text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">{t.badge}</span>}
                {t.id === 'tasks' && openTaskCount > 0 && <span className="text-[11px] text-on-surface-variant">({openTaskCount})</span>}
                {t.id === 'notes' && notes.length > 0 && <span className="text-[11px] text-on-surface-variant">({notes.length})</span>}
              </button>
            ))}
          </div>
        </div>

        {/* ═══ TAB PANES ═══ */}

        {/* 1. Transaction List — LIVE documents from the store */}
        {tab === 'transactions' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button className="h-8 px-3 border border-surface-dim rounded text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container" disabled title="Select rows to enable batch actions">Batch actions</button>
                <select className="h-8 px-3 border border-surface-dim rounded text-[13px] bg-white" value={txnTypeFilter} onChange={(e) => setTxnTypeFilter(e.target.value)}>
                  <option value="all">All transactions</option><option value="Invoices">Invoices</option><option value="Estimates">Estimates</option><option value="Bills">Bills</option><option value="Credit memos">Credit memos</option><option value="Sales Receipts">Sales Receipts</option>
                </select>
                <select className="h-8 px-3 border border-surface-dim rounded text-[13px] bg-white" value={txnStatusFilter} onChange={(e) => setTxnStatusFilter(e.target.value)}><option value="all">All</option><option value="Open">Open</option><option value="Overdue">Overdue</option><option value="Paid">Paid</option><option value="Draft">Draft</option><option value="Sent">Sent</option></select>
              </div>
              <div className="flex items-center gap-1">
                <button className="icon-btn" title="Print" onClick={handlePrint}><span className="material-symbols-outlined text-[18px]">print</span></button>
                <button className="icon-btn" title="Export" onClick={handleExport}><span className="material-symbols-outlined text-[18px]">download</span></button>
              </div>
            </div>
            <div className="bg-white border border-surface-dim rounded-xl overflow-hidden">
              <table className="data-table">
                <thead><tr>
                  <th className="w-8"><input type="checkbox" className="accent-primary" /></th>
                  <th>Date</th><th>Type</th><th>No.</th><th>{roleLabel}</th><th>Memo</th>
                  <th className="text-right">Amount</th><th>Status</th><th className="text-right">Action</th>
                </tr></thead>
                <tbody>
                  {visibleDocuments.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-10 text-on-surface-variant">
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-[40px] text-outline-variant">receipt_long</span>
                        <div className="font-semibold text-[14px] text-on-surface">{txnsLoaded ? 'No transactions yet' : 'Loading…'}</div>
                        {txnsLoaded && <div className="text-[12px]">Create one with &ldquo;New transaction&rdquo; above.</div>}
                        {txnsLoaded && <button className="mt-2 h-8 px-3 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container" onClick={() => handleNewTxn(txnMenu[0])}>Create {txnMenu[0]}</button>}
                      </div>
                    </td></tr>
                  ) : (
                    visibleDocuments.map((d) => (
                      <tr key={d.id} className="hover:bg-surface-container-low">
                        <td><input type="checkbox" className="accent-primary" /></td>
                        <td>{d.date}</td>
                        <td>{d.type}</td>
                        <td className="font-mono text-[12px] font-semibold">{d.number}</td>
                        <td>{displayName}</td>
                        <td className="text-on-surface-variant truncate max-w-[200px]">{d.memo || '—'}</td>
                        <td className="text-right font-semibold">${d.total.toFixed(2)}</td>
                        <td>
                          <span className={`pill status ${d.status === 'PAID' || d.status === 'Paid' || d.status === 'Deposited' ? 'tag' : d.status === 'OVERDUE' || d.status === 'Overdue' ? 'role vendor' : d.status === 'DRAFT' || d.status === 'Draft' ? 'tag' : 'role customer'}`}>{d.status}</span>
                        </td>
                        <td className="text-right">
                          <button className="action-link" onClick={() => handleNewTxn(d.type)}>View</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. Activity Feed */}
        {tab === 'activity' && (
          <div className="bg-white border border-surface-dim rounded-xl p-8 flex items-center gap-8">
            <div className="flex-1">
              <h2 className="text-2xl font-semibold mb-2">Keep track of every interaction</h2>
              <p className="text-body-md text-on-surface-variant mb-6 max-w-lg">Strengthen your connection with {displayName}. Add a note, task, or review recent activity — new activities will appear here.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-surface-dim rounded-lg p-4">
                  <div className="material-symbols-outlined text-[24px] text-on-surface-variant mb-2">edit_note</div>
                  <h3 className="font-semibold text-[14px] mb-1">Create a note</h3>
                  <p className="text-[12px] text-on-surface-variant mb-4">Capture important details.</p>
                  <button className="w-full h-8 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container" onClick={focusNoteComposer}>Add note</button>
                </div>
                <div className="border border-surface-dim rounded-lg p-4">
                  <div className="material-symbols-outlined text-[24px] text-on-surface-variant mb-2">task_alt</div>
                  <h3 className="font-semibold text-[14px] mb-1">Assign a task</h3>
                  <p className="text-[12px] text-on-surface-variant mb-4">Stay organized.</p>
                  <button className="w-full h-8 border border-surface-dim rounded text-[12px] font-semibold hover:bg-surface-container" onClick={() => setTaskDrawerOpen(true)}>Add task</button>
                </div>
              </div>
              {activity.length > 0 && (
                <div className="mt-6 border-t border-surface-dim pt-4">
                  <h3 className="font-semibold text-[14px] mb-2">Recent activity ({activity.length})</h3>
                  <div className="space-y-2">
                    {activity.slice(0, 10).map(a => (
                      <div key={a.id} className="text-[12px] flex items-center gap-2 py-1">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">history</span>
                        <span className="font-medium text-on-surface">{a.activity_type}</span>
                        {a.description && <span className="text-on-surface-variant">— {a.description}</span>}
                        <span className="ml-auto text-on-surface-variant">{fmtDate(a.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="w-64 h-64 shrink-0 bg-surface-container-low rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-[80px] text-outline">support_agent</span>
            </div>
          </div>
        )}

        {/* 3. Statements */}
        {tab === 'statements' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container" disabled title="Select statements to enable batch actions">Batch actions</button>
              <select className="h-8 px-3 border border-surface-dim rounded text-[13px] bg-white"><option>Last 12 months</option><option>This year</option></select>
            </div>
            <div className="bg-white border border-surface-dim rounded-xl overflow-hidden">
              <table className="data-table">
                <thead><tr><th className="w-8"><input type="checkbox" className="accent-primary" /></th><th>Date</th><th>No.</th><th>{roleLabel}</th><th>Start Date</th><th>End Date</th><th>Statement Type</th><th className="text-right">Action</th></tr></thead>
                <tbody><tr><td colSpan={8} className="text-center py-8 text-on-surface-variant">No matching statements found.</td></tr></tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. Recurring Transactions */}
        {tab === 'recurring' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2 top-1.5 text-[18px] text-outline">search</span>
                <input className="h-8 pl-8 pr-2 border border-surface-dim rounded text-[13px] w-64 focus:outline-none focus:border-primary" placeholder="Search by template name" />
              </div>
              <button className="h-8 px-3 bg-primary text-white text-[13px] font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => handleNewTxn(isVendor ? 'Recurring bill' : 'Recurring payment')}><span className="material-symbols-outlined text-[16px]">add</span>New template</button>
            </div>
            <div className="bg-white border border-surface-dim rounded-xl overflow-hidden">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Type</th><th>Txn Type</th><th>Interval</th><th>Previous Date</th><th>Next Date</th><th className="text-right">Amount</th><th className="text-right">Action</th></tr></thead>
                <tbody><tr><td colSpan={8} className="text-center py-8 text-on-surface-variant">No matching recurring transactions found.</td></tr></tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. Details */}
        {tab === 'details' && (
          <div className="grid grid-cols-2 gap-8 text-[13px]">
            <div>
              <h3 className="font-semibold text-[14px] mb-3">Contact info</h3>
              <table className="w-full">
                <tbody>
                  {[
                    ['Name', displayName],
                    ['Preferred name', party?.preferred_name || '—'],
                    ['Company', party?.company || '—'],
                    ['Email', party?.email || '—'],
                    ['Phone', party?.phone || '—'],
                    ['Mobile', party?.mobile_phone || '—'],
                    ['Address', [party?.address_line1, party?.address_line2, party?.city, party?.state, party?.postal_code].filter(Boolean).join(', ') || '—'],
                    ['Country', party?.country || '—'],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b border-surface-dim"><td className="py-2 text-on-surface-variant w-1/3">{k}</td><td className="py-2 font-medium">{v}</td></tr>
                  ))}
                </tbody>
              </table>
              {isCustomer && (
                <>
                  <h3 className="font-semibold text-[14px] mt-6 mb-3">Customer info</h3>
                  <table className="w-full">
                    <tbody>
                      {[['Customer type', party?.customer_type || '—'], ['Lifecycle stage', party?.lifecycleStage || '—'], ['Lifecycle status', party?.lifecycle_status || '—'], ['Total visits', party?.total_visits ?? '—'], ['30d spend', money(party?.total_spend_30d)], ['Last activity', party?.last_activity_at ? fmtDate(party.last_activity_at) : '—'], ['Marketing email', party?.marketing_email_opt_in ? 'Opted in' : 'Not opted in'], ['Marketing SMS', party?.marketing_sms_opt_in ? 'Opted in' : 'Not opted in']].map(([k, v]) => (
                        <tr key={k} className="border-b border-surface-dim"><td className="py-2 text-on-surface-variant w-1/3">{k}</td><td className="py-2 font-medium">{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {isVendor && (
                <>
                  <h3 className="font-semibold text-[14px] mt-6 mb-3">Vendor info</h3>
                  <table className="w-full">
                    <tbody>
                      {[['Vendor #', party?.vendor_number || '—'], ['Payment terms', party?.payment_terms_days != null ? `${party.payment_terms_days} days` : '—'], ['1099 vendor', party?.is_1099_vendor ? 'Yes' : 'No'], ['Tax form', party?.tax_form_type || (party?.is_1099_vendor ? 'W-9 (pending)' : '—')], ['Tax ID', party?.tax_number || '—'], ['Currency', party?.currency || '—'], ['AP account', party?.ap_account_id ? 'Linked (Accounts Payable)' : '—'], ['W-9 received', party?.w9_received_at ? fmtDate(party.w9_received_at) : 'Not received']].map(([k, v]) => (
                        <tr key={k} className="border-b border-surface-dim"><td className="py-2 text-on-surface-variant w-1/3">{k}</td><td className="py-2 font-medium">{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {isSupplier && (
                <>
                  <h3 className="font-semibold text-[14px] mt-6 mb-3">Supplier info</h3>
                  <table className="w-full">
                    <tbody>
                      {[['Kind', party?.kind || '—'], ['Ordering status', party?.ordering_status || '—'], ['Catalog source', party?.catalog_source || '—'], ['API URL', party?.api_base_url || '—']].map(([k, v]) => (
                        <tr key={k} className="border-b border-surface-dim"><td className="py-2 text-on-surface-variant w-1/3">{k}</td><td className="py-2 font-medium">{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {isLead && (
                <>
                  <h3 className="font-semibold text-[14px] mt-6 mb-3">Lead info</h3>
                  <table className="w-full">
                    <tbody>
                      {[['Status', party?.status || '—'], ['Lead source', party?.lead_source || '—'], ['Lead type', party?.lead_type || '—'], ['First contact', fmtDate(party?.first_contact_at)], ['Next follow-up', fmtDate(party?.next_follow_up_at)], ['Notes', party?.lead_notes || '—']].map(([k, v]) => (
                        <tr key={k} className="border-b border-surface-dim"><td className="py-2 text-on-surface-variant w-1/3">{k}</td><td className="py-2 font-medium">{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {isSeller && (
                <>
                  <h3 className="font-semibold text-[14px] mt-6 mb-3">Seller info</h3>
                  <table className="w-full">
                    <tbody>
                      {[['Legal name', party?.company || '—'], ['Display name', party?.preferred_name || '—'], ['Applicant type', party?.applicant_type === 'business_seller' ? 'Business' : party?.applicant_type === 'individual_seller' ? 'Individual' : (party?.applicant_type || '—')], ['Seller type', party?.seller_type || '—'], ['Onboarding status', party?.status || '—'], ['Website', party?.website ? <a href={party.website.startsWith('http') ? party.website : `https://${party.website}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{party.website}</a> : '—'], ['Commission rate', party?.commission_rate != null ? `${party.commission_rate}%` : '—'], ['Tax ID', party?.tax_id_last4 ? `•••• ${party.tax_id_last4}` : '—'], ['Tax form', party?.tax_form_status === 'not_required' ? 'Not required' : (party?.tax_form_status || '—')], ['Recorded earnings', money(party?.recorded_earnings)], ['Open violations', String(party?.open_violations ?? 0)], ['Pending appeals', String(party?.pending_appeals ?? 0)], ['Operations', party?.operations_paused ? 'Paused' : 'Active']].map(([k, v]) => (
                        <tr key={String(k)} className="border-b border-surface-dim"><td className="py-2 text-on-surface-variant w-1/3">{k}</td><td className="py-2 font-medium">{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    className="mt-4 h-8 px-3 bg-primary text-white text-[13px] font-semibold rounded hover:bg-primary-container flex items-center gap-1"
                    onClick={() => {
                      // Join the two modules: the party profile hands off to the
                      // Seller relationships workspace (onboarding, violations,
                      // appeals, social feed) without losing context.
                      useSellerStore.getState().setSelectedSellerId(partyId);
                      onNavigate?.('contacts', 'seller-detail');
                    }}
                  >
                    <span className="material-symbols-outlined text-[16px]">storefront</span>Open seller workspace
                  </button>
                  <p className="text-[11px] text-on-surface-variant mt-1.5">Onboarding, violations, appeals and the social feed live in the Seller relationships module.</p>
                </>
              )}
            </div>
            <div>
              <h3 className="font-semibold text-[14px] mb-3">Metadata</h3>
              <table className="w-full">
                <tbody>
                  {[['Source table', source], ['Added', fmtDate(party?.created_at)], ['Updated', fmtDate(party?.updated_at)], ['Roles', displayRoles.join(', ')]].map(([k, v]) => (
                    <tr key={k} className="border-b border-surface-dim"><td className="py-2 text-on-surface-variant w-1/3">{k}</td><td className="py-2">{v}</td></tr>
                  ))}
                </tbody>
              </table>
              <h3 className="font-semibold text-[14px] mt-6 mb-3">Attachments</h3>
              <div className="text-on-surface-variant">None</div>
            </div>
          </div>
        )}

        {/* 6. Late Fees */}
        {tab === 'latefees' && (
          <div className="border border-surface-dim rounded-lg p-6 bg-white text-[13px]">
            To apply late fees, you&apos;ll first need to turn them on at a company level under{' '}
            <a
              href="#"
              className="font-semibold underline text-on-surface"
              onClick={e => { e.preventDefault(); if (onNavigate) onNavigate('settings', 'settings-overview'); }}
            >Account and Settings</a>.
          </div>
        )}

        {/* 7. Notes */}
        {tab === 'notes' && (
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-surface-dim pb-2">
              <div className="text-[13px] text-on-surface-variant">{notes.length} note(s)</div>
              <button className="text-[13px] font-semibold text-primary hover:underline flex items-center gap-1" onClick={focusNoteComposer}><span className="material-symbols-outlined text-[16px]">add</span>Add note</button>
            </div>
            {notes.length === 0 ? (
              <div className="empty-state mt-12">
                <span className="material-symbols-outlined">folder_open</span>
                <div className="font-semibold text-[14px] text-on-surface mt-4">No notes yet</div>
                <div className="text-[12px] text-on-surface-variant mt-1">Notes you add will appear here.</div>
              </div>
            ) : (
              <div className="space-y-3 mb-4">
                {notes.map(n => (
                  <div key={n.id} className="bg-white border border-surface-dim rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="pill tag">{n.note_type || 'general'}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-on-surface-variant mr-2">{fmtDate(n.created_at)}</span>
                        {editingNoteId === n.id ? (
                          <>
                            <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center text-primary" title="Save" onClick={() => saveEditNote(n.id)}><span className="material-symbols-outlined text-[16px]">save</span></button>
                            <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center text-on-surface-variant" title="Cancel" onClick={cancelEditNote}><span className="material-symbols-outlined text-[16px]">close</span></button>
                          </>
                        ) : (
                          <>
                            <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center text-on-surface-variant" title="Edit note" onClick={() => startEditNote(n.id, n.body)}><span className="material-symbols-outlined text-[16px]">edit</span></button>
                            <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center text-error" title="Delete note" onClick={() => handleDeleteNote(n.id)}><span className="material-symbols-outlined text-[16px]">delete</span></button>
                          </>
                        )}
                      </div>
                    </div>
                    {editingNoteId === n.id ? (
                      <textarea
                        className="field-input min-h-[80px] resize-y"
                        value={editingNoteBody}
                        onChange={e => setEditingNoteBody(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEditNote(n.id); if (e.key === 'Escape') cancelEditNote(); }}
                      />
                    ) : (
                      <div className="text-[13px] whitespace-pre-wrap">{n.body}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Add note — opens a drawer with a large textarea so the user
                has room to type freely. The old cramped bottom input felt
                like you couldn't write a real note. */}
            <div className="flex justify-center pt-4">
              <button className="h-9 px-5 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container flex items-center gap-1.5" onClick={() => setNoteDrawerOpen(true)}>
                <span className="material-symbols-outlined text-[18px]">add</span>Add note
              </button>
            </div>
          </div>
        )}

        {/* 8. Tasks */}
        {tab === 'tasks' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="text-[13px] text-on-surface-variant">{tasks.length} task(s) · {openTaskCount} open</div>
              <div className="flex items-center gap-2">
                <select
                  className="h-8 px-3 border border-surface-dim rounded text-[13px] bg-white"
                  value={taskFilter}
                  onChange={e => setTaskFilter(e.target.value as typeof taskFilter)}
                  aria-label="Filter tasks"
                >
                  <option value="all">All tasks</option>
                  <option value="open">Open</option>
                  <option value="overdue">Overdue</option>
                  <option value="done">Done</option>
                </select>
                <button className="h-8 px-3 bg-primary text-white text-[13px] font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => { resetTaskForm(); setTaskDrawerOpen(true); }}><span className="material-symbols-outlined text-[16px]">add</span>Add task</button>
              </div>
            </div>
            <div className="bg-white border border-surface-dim rounded-xl overflow-hidden">
              {tasks.length === 0 ? (
                <table className="data-table">
                  <thead><tr><th>Task</th><th>Priority</th><th>Assigned To</th><th>Due Date</th><th className="text-right">Actions</th></tr></thead>
                  <tbody><tr><td colSpan={5} className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#8af5be] text-[#00714b] mb-2"><span className="material-symbols-outlined text-[20px]">check</span></div>
                    <h3 className="font-semibold text-[14px] text-on-surface">You&apos;re caught up!</h3>
                    <p className="text-[12px] text-on-surface-variant mt-1">No tasks to do right now.</p>
                  </td></tr></tbody>
                </table>
              ) : visibleTasks.length === 0 ? (
                <table className="data-table">
                  <thead><tr><th>Task</th><th>Type</th><th>Priority</th><th>Status</th><th>Due Date</th><th className="text-right">Actions</th></tr></thead>
                  <tbody><tr><td colSpan={6} className="text-center py-8 text-on-surface-variant">No {taskFilter} tasks.</td></tr></tbody>
                </table>
              ) : (
                <table className="data-table">
                  <thead><tr><th>Task</th><th>Type</th><th>Priority</th><th>Status</th><th>Due Date</th><th className="text-right">Actions</th></tr></thead>
                  <tbody>
                    {visibleTasks.map(t => {
                      const done = t.status === 'done';
                      return (
                        <tr key={t.id} className={done ? 'opacity-60' : ''}>
                          <td className={`font-medium ${done ? 'line-through' : ''}`}>{t.title}</td>
                          <td>{t.task_type || '—'}</td>
                          <td><span className={`pill tag ${t.priority === 'high' ? 'role vendor' : t.priority === 'low' ? 'tag' : ''}`}>{t.priority}</span></td>
                          <td><span className={`pill status ${done ? 'tag' : 'role customer'}`}>{t.status}</span></td>
                          <td>{fmtDate(t.due_at)}</td>
                          <td className="text-right whitespace-nowrap">
                            <button className="action-link" onClick={() => startEditTask(t)}>Edit</button>
                            {done
                              ? <button className="action-link ml-2" onClick={() => handleSetTaskStatus(t.id, 'open')}>Reopen</button>
                              : <button className="action-link ml-2" onClick={() => handleSetTaskStatus(t.id, 'done')}>Complete</button>}
                            <button className="action-link ml-2 text-error" onClick={() => handleDeleteTask(t.id)}>Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* ═══ NOTE COMPOSER DRAWER ═══ */}
      {noteDrawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={() => { setNoteDrawerOpen(false); setNoteBody(''); setNoteType('general'); }} />
          <div className="drawer open" style={{ width: 560 }}>
            <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
              <h3 className="text-[16px] font-semibold">Add note</h3>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => { setNoteDrawerOpen(false); setNoteBody(''); setNoteType('general'); }}><span className="material-symbols-outlined text-[20px]">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="field-label">Note type</label>
                <select className="field-input" value={noteType} onChange={e => setNoteType(e.target.value)}>
                  <option value="general">General</option>
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="reminder">Reminder</option>
                </select>
              </div>
              <div className="flex flex-col flex-1">
                <label className="field-label">Note</label>
                <textarea
                  className="field-input flex-1 min-h-[400px] resize-y text-[14px] leading-relaxed"
                  placeholder="Type your note here…"
                  value={noteBody}
                  onChange={e => setNoteBody(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="pt-4 border-t border-surface-dim">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-[13px]">Linked record</h4>
                </div>
                <div className="text-[12px]">
                  <span className="text-primary font-medium">{roleLabel}</span><br />
                  <span className="text-on-surface-variant">{displayName}</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-surface-dim flex justify-end gap-2 shrink-0">
              <button className="h-8 px-4 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container" onClick={() => { setNoteDrawerOpen(false); setNoteBody(''); setNoteType('general'); }}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-50" disabled={!noteBody.trim()} onClick={handleAddNote}>Save note</button>
            </div>
          </div>
        </>
      )}

      {/* ═══ TASK DRAWER ═══ */}
      {taskDrawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={() => setTaskDrawerOpen(false)} />
          <div className="drawer open" style={{ width: 560 }}>
            <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
              <h3 className="text-[16px] font-semibold">{editingTaskId ? 'Edit task' : 'Add task'}</h3>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => { setTaskDrawerOpen(false); resetTaskForm(); }}><span className="material-symbols-outlined text-[20px]">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="field-label">Task name</label>
                <input className="field-input" placeholder="e.g. Follow up with customer" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="field-label">Description (optional)</label>
                <textarea className="field-input min-h-[120px] resize-y text-[14px] leading-relaxed" placeholder="Add details about this task…" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Priority</label>
                  <select className="field-input" value={taskPriority} onChange={e => setTaskPriority(e.target.value)}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Due date</label>
                  <input className="field-input" type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} />
                </div>
              </div>
              <div className="pt-4 border-t border-surface-dim">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-[13px]">Linked record</h4>
                </div>
                <div className="text-[12px]">
                  <span className="text-primary font-medium">{roleLabel}</span><br />
                  <span className="text-on-surface-variant">{displayName}</span>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-surface-dim flex justify-end gap-2 shrink-0">
              <button className="h-8 px-4 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container" onClick={() => { setTaskDrawerOpen(false); resetTaskForm(); }}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container" onClick={handleSaveTask}>{editingTaskId ? 'Save changes' : 'Save'}</button>
            </div>
          </div>
        </>
      )}

      {/* ═══ EDIT — the canonical PartyFormDrawer (same form as every create
              button across Parties / Customers / Vendors / Suppliers), in
              editing mode with full prefill and PATCH on save. ═══ */}
      {editOpen && editTarget && (
        <PartyFormDrawer
          open={editOpen}
          editing={editTarget}
          onClose={() => setEditOpen(false)}
          onSaved={() => { refresh(); onToast('Party saved'); }}
          onToast={onToast}
        />
      )}
    </main>
  );
}

/* Stage changer — inline PATCH to /api/crm/customers/[id] (customer-only). */
function StageChanger({ partyId, source, current, onToast, onSaved }: {
  partyId: string; source: string; current: string;
  onToast: (m: string) => void; onSaved: () => void;
}) {
  if (source !== 'crm_customers') return null;
  const stages = ['lead', 'new_customer', 'active', 'vip'];
  async function change(stage: string) {
    const res = await fetchJson(`/api/crm/customers/${partyId}`, { method: 'PATCH', body: JSON.stringify({ lifecycle_stage: stage }) });
    if (res.ok) { onToast(`Stage → ${stage}`); onSaved(); }
    else onToast(`Save failed`);
  }
  return (
    <div className="flex gap-2">
      {stages.map(stage => (
        <button key={stage} className={`h-7 px-3 rounded text-label-sm border ${current === stage ? 'bg-primary text-white border-primary' : 'border-surface-dim hover:bg-surface-container-low'}`} onClick={() => change(stage)}>
          {stage.replace('_', ' ')}
        </button>
      ))}
    </div>
  );
}
