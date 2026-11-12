'use client';

import './statements.css';
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { StatementsScreenProps } from './types';
import { STMT_NAV } from './types';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type StatementStatus = 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Partial';

interface StatementLine {
  date: string;
  desc: string;
  amt: string;
  paid: string;
  bal: string;
}

interface StatementData {
  id: string;
  customer: string;
  email: string;
  period: string;
  date: string;
  due: string;
  invoiced: string;
  paid: string;
  dueAmt: string;
  status: StatementStatus;
  lines: StatementLine[];
}

interface StatementRow {
  id: string;
  customer: string;
  email: string;
  avatar: string;
  avatarColor: string;
  period: string;
  sentDate: string;
  dueDate: string;
  dueRed: boolean;
  balance: string;
  balanceRed: boolean;
  status: StatementStatus;
}

type ViewTab = 'All' | 'Draft' | 'Sent' | 'Awaiting' | 'Paid' | 'Overdue';

// ─────────────────────────────────────────────────────────────
// Static data (verbatim from source <script> S_DATA map)
// ─────────────────────────────────────────────────────────────

const S_DATA: Record<string, StatementData> = {
  'ST-1101': {
    id: 'ST-1101',
    customer: 'Acme Corp',
    email: 'ap@acme.com',
    period: 'Oct 2026',
    date: '2026-10-31',
    due: '2026-11-30',
    invoiced: '$4,300.00',
    paid: '−$3,410.00',
    dueAmt: '$890.00',
    status: 'Sent',
    lines: [
      { date: '10/15', desc: 'Invoice 0998', amt: '$890.00', paid: '$0.00', bal: '$890.00' },
      { date: '10/28', desc: 'Invoice 1001', amt: '$3,410.00', paid: '$3,410.00', bal: '$0.00' },
    ],
  },
  'ST-1100': {
    id: 'ST-1100',
    customer: 'Northwind Labs',
    email: 'finance@northwind.io',
    period: 'Oct 2026',
    date: '2026-10-31',
    due: '2026-11-01',
    invoiced: '$2,100.00',
    paid: '$0.00',
    dueAmt: '$2,100.00',
    status: 'Overdue',
    lines: [
      { date: '10/02', desc: 'Invoice 0996', amt: '$2,100.00', paid: '$0.00', bal: '$2,100.00' },
    ],
  },
  'ST-1099': {
    id: 'ST-1099',
    customer: 'Blue Ridge Co.',
    email: 'billing@blueridge.co',
    period: 'Sep 2026',
    date: '2026-09-30',
    due: '2026-10-30',
    invoiced: '$3,410.00',
    paid: '−$3,410.00',
    dueAmt: '$0.00',
    status: 'Paid',
    lines: [
      { date: '09/28', desc: 'Invoice 1001', amt: '$3,410.00', paid: '$3,410.00', bal: '$0.00' },
    ],
  },
  'ST-1098': {
    id: 'ST-1098',
    customer: 'Lakeside Design',
    email: 'hello@lakeside.design',
    period: 'Sep 2026',
    date: '2026-09-30',
    due: '2026-10-30',
    invoiced: '$1,850.00',
    paid: '−$1,850.00',
    dueAmt: '$0.00',
    status: 'Paid',
    lines: [
      { date: '09/05', desc: 'Invoice 0992', amt: '$1,850.00', paid: '$1,850.00', bal: '$0.00' },
    ],
  },
  'ST-1102': {
    id: 'ST-1102',
    customer: 'Maple Supply',
    email: 'ar@maplesupply.io',
    period: 'Nov 2026',
    date: '2026-11-30',
    due: '2026-12-31',
    invoiced: '$890.00',
    paid: '$0.00',
    dueAmt: '$890.00',
    status: 'Draft',
    lines: [
      { date: '11/15', desc: 'Invoice 0998', amt: '$890.00', paid: '$0.00', bal: '$890.00' },
    ],
  },
  'ST-1097': {
    id: 'ST-1097',
    customer: 'Orion Apparel',
    email: 'hello@orionapparel.com',
    period: 'Sep 2026',
    date: '2026-09-30',
    due: '2026-10-30',
    invoiced: '$2,350.00',
    paid: '−$500.00',
    dueAmt: '$1,850.00',
    status: 'Partial',
    lines: [
      { date: '09/15', desc: 'Invoice 0994', amt: '$540.00', paid: '$540.00', bal: '$0.00' },
      { date: '09/20', desc: 'Invoice 0995', amt: '$1,810.00', paid: '$0.00', bal: '$1,810.00' },
    ],
  },
};

// Empty template used when opening "New statement"
const EMPTY_STATEMENT: StatementData = {
  id: 'ST-1103',
  customer: '',
  email: '',
  period: 'Nov 2026',
  date: '2026-11-30',
  due: '2026-12-31',
  invoiced: '$0.00',
  paid: '$0.00',
  dueAmt: '$0.00',
  status: 'Draft',
  lines: [],
};

const INITIAL_ROWS: StatementRow[] = [
  {
    id: 'ST-1101',
    customer: 'Acme Corp',
    email: 'ap@acme.com',
    avatar: 'A',
    avatarColor: 'bg-qb-blue',
    period: 'Oct 2026',
    sentDate: '10/31/2026',
    dueDate: '11/30/2026',
    dueRed: false,
    balance: '$1,240.00',
    balanceRed: false,
    status: 'Sent',
  },
  {
    id: 'ST-1100',
    customer: 'Northwind Labs',
    email: 'finance@northwind.io',
    avatar: 'N',
    avatarColor: 'bg-qb-teal',
    period: 'Oct 2026',
    sentDate: '10/31/2026',
    dueDate: '11/01/2026',
    dueRed: true,
    balance: '$2,100.00',
    balanceRed: true,
    status: 'Overdue',
  },
  {
    id: 'ST-1099',
    customer: 'Blue Ridge Co.',
    email: 'billing@blueridge.co',
    avatar: 'B',
    avatarColor: 'bg-qb-green',
    period: 'Sep 2026',
    sentDate: '09/30/2026',
    dueDate: '10/30/2026',
    dueRed: false,
    balance: '$0.00',
    balanceRed: false,
    status: 'Paid',
  },
  {
    id: 'ST-1098',
    customer: 'Lakeside Design',
    email: 'hello@lakeside.design',
    avatar: 'L',
    avatarColor: 'bg-qb-blue',
    period: 'Sep 2026',
    sentDate: '09/30/2026',
    dueDate: '10/30/2026',
    dueRed: false,
    balance: '$0.00',
    balanceRed: false,
    status: 'Paid',
  },
  {
    id: 'ST-1102',
    customer: 'Maple Supply',
    email: 'ar@maplesupply.io',
    avatar: 'M',
    avatarColor: 'bg-qb-maroon',
    period: 'Nov 2026',
    sentDate: '—',
    dueDate: '12/31/2026',
    dueRed: false,
    balance: '$890.00',
    balanceRed: false,
    status: 'Draft',
  },
  {
    id: 'ST-1097',
    customer: 'Orion Apparel',
    email: 'hello@orionapparel.com',
    avatar: 'O',
    avatarColor: 'bg-qb-navy',
    period: 'Sep 2026',
    sentDate: '09/30/2026',
    dueDate: '10/30/2026',
    dueRed: false,
    balance: '$1,850.00',
    balanceRed: false,
    status: 'Partial',
  },
];

const STATUS_PILL_CLASS: Record<StatementStatus, string> = {
  Draft: 'st draft',
  Sent: 'st sent',
  Paid: 'st paid',
  Overdue: 'st overdue',
  Partial: 'st partial',
};

const TABS: { key: ViewTab; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'Draft', label: 'Draft' },
  { key: 'Sent', label: 'Sent' },
  { key: 'Awaiting', label: 'Awaiting payment' },
  { key: 'Paid', label: 'Paid' },
  { key: 'Overdue', label: 'Overdue' },
];

function hasOpenBalance(status: StatementStatus): boolean {
  return status === 'Sent' || status === 'Overdue' || status === 'Partial';
}

function formatDueLabel(due: string): string {
  const parts = due.split('-');
  if (parts.length === 3) return `Due ${parts[1]}/${parts[2]}/${parts[0]}`;
  return 'Due —';
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function Statements({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: StatementsScreenProps) {
  // Table state
  const [rows, setRows] = useState<StatementRow[]>(INITIAL_ROWS);
  const [viewTab, setViewTab] = useState<ViewTab>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRowId, setDrawerRowId] = useState<string | null>(null);
  const [drawerData, setDrawerData] = useState<StatementData | null>(null);

  // Batch modal
  const [batchOpen, setBatchOpen] = useState(false);

  // New split menu
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newMenuPos, setNewMenuPos] = useState<{ top: number; left: number } | null>(null);
  const newSplitRef = useRef<HTMLButtonElement>(null);

  // Row ⋯ menu
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const rowMenuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<number | null>(null);

  // ── Derived state ──────────────────────────────────────────

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      let tabOk = true;
      if (viewTab === 'All') tabOk = true;
      else if (viewTab === 'Draft') tabOk = r.status === 'Draft';
      else if (viewTab === 'Sent') tabOk = r.status === 'Sent';
      else if (viewTab === 'Paid') tabOk = r.status === 'Paid';
      else if (viewTab === 'Overdue') tabOk = r.status === 'Overdue';
      else if (viewTab === 'Awaiting') tabOk = hasOpenBalance(r.status);
      const qOk =
        !q ||
        r.customer.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.period.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q);
      return tabOk && qOk;
    });
  }, [rows, viewTab, search]);

  const shown = filteredRows.length;
  const total = rows.length;
  const countText = `${shown} of ${total}`;

  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));
  const bulkBarShown = selected.size > 0;

  const drawerDueLabel = drawerData ? formatDueLabel(drawerData.due) : 'Due —';

  const rowMenuRow = rowMenuId ? rows.find((r) => r.id === rowMenuId) ?? null : null;
  const showSend = rowMenuRow?.status === 'Draft';
  const showRemind = rowMenuRow ? hasOpenBalance(rowMenuRow.status) : false;
  const showMarkPaid = rowMenuRow ? hasOpenBalance(rowMenuRow.status) : false;
  const showReceivePayment = rowMenuRow ? hasOpenBalance(rowMenuRow.status) : false;

  // ── Toast helper ───────────────────────────────────────────

  const showToast = useCallback(
    (m: string) => {
      setToastMsg(m);
      onToast(m);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToastMsg(''), 1800);
    },
    [onToast]
  );

  // ── Drawer open/close ──────────────────────────────────────

  const openStatement = useCallback((id: string | null) => {
    const data = id ? S_DATA[id] ?? EMPTY_STATEMENT : EMPTY_STATEMENT;
    setDrawerRowId(id);
    setDrawerData(data);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const openBatchModal = useCallback(() => setBatchOpen(true), []);
  const closeBatchModal = useCallback(() => setBatchOpen(false), []);

  // ── New split menu ─────────────────────────────────────────

  const toggleNewMenu = useCallback(() => {
    if (!newSplitRef.current) return;
    const r = newSplitRef.current.getBoundingClientRect();
    const menuHeight = 250;
    const top = r.bottom + 4 + menuHeight > window.innerHeight
      ? Math.max(10, r.top - menuHeight - 4)
      : r.bottom + 4;
    setNewMenuPos({
      top,
      left: Math.min(r.right - 220, window.innerWidth - 240),
    });
    setNewMenuOpen((o) => !o);
  }, []);

  const handleNewKind = useCallback(
    (kind: string) => {
      setNewMenuOpen(false);
      if (kind === 'Batch send') return openBatchModal();
      if (kind === 'From invoices') return showToast('Generating from invoices — pick period');
      openStatement(null);
    },
    [openBatchModal, showToast, openStatement]
  );

  // ── Row menu ───────────────────────────────────────────────

  const openRowMenu = useCallback((id: string) => {
    const btn = rowMenuTriggerRefs.current[id];
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const menuHeight = 300;
    const top = r.bottom + 4 + menuHeight > window.innerHeight
      ? Math.max(10, r.top - menuHeight - 4)
      : r.bottom + 4;
    setRowMenuId(id);
    setRowMenuPos({
      top,
      left: Math.min(r.right - 250, window.innerWidth - 270),
    });
    setRowMenuOpen(true);
  }, []);

  const closeRowMenu = useCallback(() => {
    setRowMenuOpen(false);
    setRowMenuId(null);
  }, []);

  const handleRowAction = useCallback(
    (action: string, id: string) => {
      closeRowMenu();
      switch (action) {
        case 'view':
        case 'edit':
          openStatement(id);
          break;
        case 'duplicate': {
          setRows((prev) => {
            const idx = prev.findIndex((r) => r.id === id);
            if (idx < 0) return prev;
            const src = prev[idx];
            let i = 1;
            let newId = `${id}-COPY`;
            while (prev.some((r) => r.id === newId)) {
              newId = `${id}-COPY${i++}`;
            }
            const clone: StatementRow = { ...src, id: newId };
            const next = [...prev];
            next.splice(idx + 1, 0, clone);
            return next;
          });
          showToast(`Duplicated statement ${id}`);
          break;
        }
        case 'send':
          setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, status: 'Sent' as StatementStatus } : r))
          );
          showToast(`Sent statement ${id}`);
          break;
        case 'remind':
          showToast(`Reminder sent for ${id}`);
          break;
        case 'print':
          showToast(`Printing statement ${id}`);
          break;
        case 'mark-paid':
          setRows((prev) =>
            prev.map((r) =>
              r.id === id
                ? { ...r, status: 'Paid' as StatementStatus, balance: '$0.00', balanceRed: false, dueRed: false }
                : r
            )
          );
          showToast(`Statement ${id} marked as paid`);
          break;
        case 'receive-payment':
          showToast(`Receive payment for ${id}`);
          break;
        case 'delete':
          setRows((prev) => prev.filter((r) => r.id !== id));
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          showToast(`Statement ${id} deleted`);
          break;
      }
    },
    [closeRowMenu, openStatement, showToast]
  );

  // ── Selection / bulk ───────────────────────────────────────

  const toggleRowCheck = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredRows.forEach((r) => next.delete(r.id));
      } else {
        filteredRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const bulkAction = (action: string) => {
    const n = selected.size;
    if (action === 'close') {
      setSelected(new Set());
      return;
    }
    if (action === 'delete') {
      setRows((prev) => prev.filter((r) => !selected.has(r.id)));
    }
    const label = action.charAt(0).toUpperCase() + action.slice(1);
    showToast(`${label} on ${n} statement${n !== 1 ? 's' : ''}`);
    setSelected(new Set());
  };

  // ── Outside click + Escape ─────────────────────────────────

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      // Close new menu (skip if clicking the trigger button)
      if (newMenuOpen && newSplitRef.current && !newSplitRef.current.contains(target)) {
        const newMenuEl = document.getElementById('new-menu');
        if (!newMenuEl || !newMenuEl.contains(target)) {
          setNewMenuOpen(false);
        }
      }
      // Close row menu
      if (rowMenuOpen) {
        const rowMenuEl = document.getElementById('row-menu');
        const trigger = rowMenuId ? rowMenuTriggerRefs.current[rowMenuId] : null;
        if (
          (!rowMenuEl || !rowMenuEl.contains(target)) &&
          (!trigger || !trigger.contains(target))
        ) {
          setRowMenuOpen(false);
        }
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawerOpen) setDrawerOpen(false);
        else if (batchOpen) setBatchOpen(false);
        else if (rowMenuOpen) setRowMenuOpen(false);
        else if (newMenuOpen) setNewMenuOpen(false);
      }
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [drawerOpen, batchOpen, newMenuOpen, rowMenuOpen, rowMenuId]);

  // ── Breadcrumb nav ─────────────────────────────────────────

  const handleContactsNav = () => {
    const [d, s] = STMT_NAV.customers();
    onNavigate(d, s);
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="statements-page">
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
            account_balance
          </span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <button
            type="button"
            className="text-label-md hover:text-primary"
            onClick={handleContactsNav}
          >
            Contacts
          </button>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Statements</span>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
          <div>
            <h1 className="text-headline-lg">Statements</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Batch billing summary — send a customer their account activity for a period
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex split-btn">
              <button
                type="button"
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main"
                onClick={() => openStatement(null)}
              >
                <span className="material-symbols-outlined text-[16px]">add</span>New statement
              </button>
              <button
                type="button"
                ref={newSplitRef}
                className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNewMenu();
                }}
              >
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <button
              type="button"
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => showToast('Exporting statements…')}
            >
              <span className="material-symbols-outlined text-[16px]">download</span>Export
            </button>
            <button
              type="button"
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => showToast('Customize panel')}
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>Customize
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
              Sent this month
            </div>
            <div className="text-headline-sm mt-1 tabular-nums">4</div>
            <div className="text-[11px] text-on-surface-variant mt-0.5">
              October 2026 · $12,340 total
            </div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
              Awaiting payment
            </div>
            <div className="text-headline-sm mt-1 tabular-nums">2</div>
            <div className="text-[11px] text-on-surface-variant mt-0.5">$3,940 outstanding</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
              Collected
            </div>
            <div className="text-headline-sm mt-1 tabular-nums text-secondary">$8,400</div>
            <div className="text-[11px] text-on-surface-variant mt-0.5">68% of sent statements</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">
              Overdue
            </div>
            <div className="text-headline-sm mt-1 tabular-nums text-error">1</div>
            <div className="text-[11px] text-on-surface-variant mt-0.5">$2,100 · past 30 days</div>
          </div>
        </div>

        {/* Create actions row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">
            Create actions:
          </span>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => openStatement(null)}
          >
            <span className="material-symbols-outlined text-[16px]">summarize</span>Statement
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={openBatchModal}
          >
            <span className="material-symbols-outlined text-[16px]">campaign</span>Batch send
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => {
              onCreate('Customer');
              showToast('New customer — party drawer');
            }}
          >
            <span className="material-symbols-outlined text-[16px]">person_add</span>Customer
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
            onClick={() => {
              onCreate('Invoice');
              showToast('New invoice');
            }}
          >
            <span className="material-symbols-outlined text-[16px]">receipt_long</span>Invoice
          </button>
          <button
            type="button"
            className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1"
            onClick={() => onOpenCreateFlyout()}
          >
            <span className="material-symbols-outlined text-[16px]">apps</span>Show all
          </button>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`h-full px-3 text-label-md tab-underline ${
                  viewTab === t.key ? 'active' : 'text-on-surface-variant'
                }`}
                onClick={() => setViewTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
            <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
              <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">
                search
              </span>
              <input
                className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
                placeholder="Filter by customer, period…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => showToast('Date range picker...')}
            >
              <span className="material-symbols-outlined text-[14px]">calendar_today</span>Date range
            </button>
            <button
              type="button"
              className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => showToast('Saved views...')}
            >
              <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views
            </button>
            <span className="ml-auto text-[11px] text-on-surface-variant">{countText}</span>
          </div>

          {/* Bulk bar */}
          <div className={`bulk-bar${bulkBarShown ? ' show' : ''}`}>
            <span className="text-[12px] font-semibold">{selected.size} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <button type="button" onClick={() => bulkAction('send')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">send</span>
              Send
            </button>
            <button type="button" onClick={() => bulkAction('print')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">print</span>
              Print
            </button>
            <button type="button" onClick={() => bulkAction('remind')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">
                notifications_active
              </span>
              Remind
            </button>
            <span className="w-px h-4 bg-white/30"></span>
            <button type="button" onClick={() => bulkAction('delete')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>
              Delete
            </button>
            <button type="button" className="ml-auto" onClick={() => bulkAction('close')}>
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          {/* Statements table */}
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    className="row-check"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-surface-container-low cursor-pointer s-row"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input,button,[data-row-menu]')) return;
                    openStatement(row.id);
                  }}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="row-check s-check"
                      checked={selected.has(row.id)}
                      onChange={() => toggleRowCheck(row.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`st-avatar ${row.avatarColor}`}>{row.avatar}</div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{row.customer}</div>
                        <div className="text-[11px] text-on-surface-variant">{row.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant">{row.period}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{row.sentDate}</td>
                  <td className={`px-3 py-2 ${row.dueRed ? 'text-error' : 'text-on-surface-variant'}`}>
                    {row.dueDate}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      row.balanceRed ? 'text-error' : ''
                    }`}
                  >
                    {row.balance}
                  </td>
                  <td className="px-3 py-2">
                    <span className={STATUS_PILL_CLASS[row.status]}>{row.status}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      data-row-menu
                      ref={(el) => {
                        rowMenuTriggerRefs.current[row.id] = el;
                      }}
                      className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRowMenu(row.id);
                      }}
                    >
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                        more_horiz
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-on-surface-variant">
                    No statements match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* New split menu */}
      <div
        id="new-menu"
        className={`row-menu${newMenuOpen ? ' open' : ''}`}
        style={newMenuPos ?? undefined}
      >
        <div className="menu-header">New statement</div>
        <button type="button" onClick={() => handleNewKind('Single customer')}>
          <span className="material-symbols-outlined">person</span>Single customer
        </button>
        <button type="button" onClick={() => handleNewKind('Batch send')}>
          <span className="material-symbols-outlined">campaign</span>Batch send to many…
        </button>
        <div className="sep"></div>
        <button type="button" onClick={() => handleNewKind('From invoices')}>
          <span className="material-symbols-outlined">receipt_long</span>Generate from invoices…
        </button>
      </div>

      {/* Row ⋯ menu */}
      <div
        id="row-menu"
        className={`row-menu${rowMenuOpen ? ' open' : ''}`}
        style={rowMenuPos ?? undefined}
      >
        <div className="menu-header">This statement</div>
        <button type="button" onClick={() => rowMenuId && handleRowAction('view', rowMenuId)}>
          <span className="material-symbols-outlined">open_in_new</span>Open statement
        </button>
        <button type="button" onClick={() => rowMenuId && handleRowAction('edit', rowMenuId)}>
          <span className="material-symbols-outlined">edit</span>Edit
        </button>
        <button
          type="button"
          onClick={() => rowMenuId && handleRowAction('duplicate', rowMenuId)}
        >
          <span className="material-symbols-outlined">content_copy</span>Duplicate for next period
        </button>
        <div className="sep"></div>
        <div className="menu-header">Send</div>
        <button
          type="button"
          className={showSend ? '' : 'hidden-imp'}
          onClick={() => rowMenuId && handleRowAction('send', rowMenuId)}
        >
          <span className="material-symbols-outlined">send</span>Send
        </button>
        <button
          type="button"
          className={showRemind ? '' : 'hidden-imp'}
          onClick={() => rowMenuId && handleRowAction('remind', rowMenuId)}
        >
          <span className="material-symbols-outlined">notifications_active</span>Send reminder
        </button>
        <button
          type="button"
          onClick={() => rowMenuId && handleRowAction('print', rowMenuId)}
        >
          <span className="material-symbols-outlined">print</span>Print / download PDF
        </button>
        <div className="sep"></div>
        <div className="menu-header">Payment</div>
        <button
          type="button"
          className={showMarkPaid ? '' : 'hidden-imp'}
          onClick={() => rowMenuId && handleRowAction('mark-paid', rowMenuId)}
        >
          <span className="material-symbols-outlined">check_circle</span>Mark as paid
        </button>
        <button
          type="button"
          className={showReceivePayment ? '' : 'hidden-imp'}
          onClick={() => rowMenuId && handleRowAction('receive-payment', rowMenuId)}
        >
          <span className="material-symbols-outlined">price_check</span>Receive payment…
        </button>
        <div className="sep"></div>
        <button
          type="button"
          className="danger"
          onClick={() => rowMenuId && handleRowAction('delete', rowMenuId)}
        >
          <span className="material-symbols-outlined">delete</span>Delete
        </button>
      </div>

      {/* Statement drawer scrim */}
      <div
        className={`drawer-scrim${drawerOpen ? ' open' : ''}`}
        onClick={closeDrawer}
      />

      {/* Statement drawer */}
      <div
        className={`drawer${drawerOpen ? ' open' : ''}`}
        style={{ width: 720 }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">summarize</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate">
                Statement {drawerData?.id ?? ''}
              </div>
              <div className="text-[11px] text-on-surface-variant">
                {drawerData
                  ? `${drawerData.customer || 'New statement'} · ${drawerData.period}`
                  : '—'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
              title="Download"
              onClick={() => showToast('Printing statement PDF')}
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
              onClick={closeDrawer}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Drawer body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Customer / period / date / due grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Customer</label>
              <div className="relative flex items-center">
                <input
                  className="field-input"
                  readOnly
                  value={drawerData?.customer ?? ''}
                />
                <span className="material-symbols-outlined absolute right-2 text-[16px] text-outline">
                  expand_more
                </span>
              </div>
            </div>
            <div>
              <label className="field-label">Period</label>
              <select className="field-input" value={drawerData?.period ?? 'Nov 2026'}>
                <option>Oct 2026</option>
                <option>Sep 2026</option>
                <option>Aug 2026</option>
                <option>Jul 2026</option>
                <option>Nov 2026</option>
              </select>
            </div>
            <div>
              <label className="field-label">Statement date</label>
              <input
                className="field-input"
                type="date"
                value={drawerData?.date ?? ''}
                readOnly
              />
            </div>
            <div>
              <label className="field-label">Due date</label>
              <input
                className="field-input"
                type="date"
                value={drawerData?.due ?? ''}
                readOnly
              />
            </div>
          </div>

          {/* Statement preview */}
          <div>
            <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">
              Statement preview
            </div>
            <div className="stmt-doc">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-bold text-body-md">Unsaid</div>
                  <div className="text-[11px] text-on-surface-variant">
                    Unsaid · Statement
                  </div>
                </div>
                <div className="text-right text-[11px] text-on-surface-variant">
                  <div>{drawerData?.period ?? ''}</div>
                  <div>{drawerDueLabel}</div>
                </div>
              </div>
              <div className="border-t border-surface-dim pt-3 mb-3">
                <div className="text-[11px] text-on-surface-variant uppercase font-bold mb-1">
                  Bill to
                </div>
                <div className="font-medium">{drawerData?.customer || '—'}</div>
              </div>
              <div className="stmt-line head">
                <span>Date</span>
                <span>Invoice / activity</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Paid</span>
                <span className="text-right">Balance</span>
              </div>
              <div>
                {drawerData && drawerData.lines.length > 0 ? (
                  drawerData.lines.map((l, idx) => (
                    <div className="stmt-line" key={idx}>
                      <span className="text-on-surface-variant">{l.date}</span>
                      <span>{l.desc}</span>
                      <span className="text-right tabular-nums">{l.amt}</span>
                      <span className="text-right tabular-nums">{l.paid}</span>
                      <span className="text-right tabular-nums">{l.bal}</span>
                    </div>
                  ))
                ) : (
                  <div className="stmt-line">
                    <span className="text-on-surface-variant">—</span>
                    <span className="text-on-surface-variant">No activity for this period</span>
                    <span className="text-right tabular-nums">$0.00</span>
                    <span className="text-right tabular-nums">$0.00</span>
                    <span className="text-right tabular-nums">$0.00</span>
                  </div>
                )}
              </div>
              <div className="flex justify-end pt-3 mt-3 border-t border-surface-dim">
                <div className="w-56 space-y-1 text-[12px]">
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Opening balance</span>
                    <span className="tabular-nums">$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Invoiced</span>
                    <span className="tabular-nums">{drawerData?.invoiced ?? '$0.00'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Paid</span>
                    <span className="tabular-nums">{drawerData?.paid ?? '$0.00'}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-surface-dim font-bold">
                    <span>Amount due</span>
                    <span className="tabular-nums">{drawerData?.dueAmt ?? '$0.00'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="field-label">Message to customer</label>
            <textarea
              className="field-input"
              style={{ height: 56, padding: '8px 10px', fontFamily: 'inherit' }}
              placeholder="Optional note visible to the customer"
              defaultValue="Please review the attached statement at your convenience."
            />
          </div>

          {/* Delivery */}
          <div>
            <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">
              Delivery
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" className="row-check" defaultChecked /> Email to{' '}
                <strong className="ml-1">{drawerData?.email || '—'}</strong>
              </label>
              <label className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" className="row-check" /> Include PDF attachment
              </label>
              <label className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" className="row-check" /> Also print for mail
              </label>
            </div>
          </div>
        </div>

        {/* Drawer footer */}
        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button
            type="button"
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
            onClick={closeDrawer}
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low"
              onClick={() => showToast('Printing statement PDF')}
            >
              <span className="material-symbols-outlined text-[16px] align-middle mr-1">print</span>
              Print
            </button>
            <div className="split-btn flex">
              <button
                type="button"
                className="h-8 px-3 border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main"
                onClick={() => {
                  showToast('Statement saved as draft');
                  closeDrawer();
                }}
              >
                Save draft
              </button>
              <button
                type="button"
                className="h-8 px-1.5 border border-surface-dim hover:bg-surface-container-low split-btn-arrow"
              >
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <div className="split-btn flex">
              <button
                type="button"
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main"
                onClick={() => {
                  showToast('Statement sent to customer');
                  closeDrawer();
                }}
              >
                Send to customer
              </button>
              <button
                type="button"
                className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"
              >
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Batch send modal */}
      <div className={`modal-scrim${batchOpen ? ' open' : ''}`} onClick={closeBatchModal}>
        <div
          className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-[20px] text-primary">campaign</span>
              <h2 className="text-headline-sm">Batch send statements</h2>
            </div>
            <p className="text-body-sm text-on-surface-variant mb-4">
              Send statements to all customers with an open balance for the selected period.
            </p>
            <div className="space-y-3">
              <div>
                <label className="field-label">Period</label>
                <select className="field-input" defaultValue="Oct 2026">
                  <option>Oct 2026</option>
                  <option>Sep 2026</option>
                  <option>Nov 2026</option>
                </select>
              </div>
              <div className="bg-surface-container-low rounded-lg p-3 text-[11px] text-on-surface-variant">
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[14px] text-secondary">check</span>
                  3 customers have open balances
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="material-symbols-outlined text-[14px] text-secondary">check</span>
                  2 have overdue balances
                </div>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[14px] text-tertiary">info</span>
                  Statements will be emailed as PDFs
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              className="flex-1 h-9 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
              onClick={closeBatchModal}
            >
              Cancel
            </button>
            <button
              type="button"
              className="flex-1 h-9 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
              onClick={() => {
                closeBatchModal();
                showToast('Statements sent to 3 customers');
              }}
            >
              <span className="material-symbols-outlined text-[16px] align-middle mr-1">send</span>
              Send to 3 customers
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      <div className={`toast${toastMsg ? ' show' : ''}`}>{toastMsg}</div>
    </div>
  );
}
