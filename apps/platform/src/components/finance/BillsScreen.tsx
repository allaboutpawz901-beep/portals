'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import styles from './BillsScreen.module.css';
import { usePlatformStore, type Document, type DocumentStatus } from '@/lib/platformStore';
import DocumentEngine from '../DocumentEngine';

export interface BillItem {
  id: string;
  vendor: string;
  source: 'Auto-scanned' | 'Email forwarded' | 'Manual' | 'Upload';
  billNo: string;
  billDate: string;
  category: string;
  className?: string;
  location?: string;
  memo: string;
  dueDate: string;
  amount: number;
  attachmentsCount: number;
  status: 'For review' | 'Unpaid' | 'Paid';
}

/* ═══ Store → screen adapters ═══
   The screen keeps its approved layout and local row shape; every row is now
   derived from the shared platform store (§1.1 single source of truth). */

/* The store uses ISO dates; the approved screen shows MM/DD/YYYY */
const toDisplayDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso || '—';
};

/* The create form shows MM/DD/YYYY; the store stores ISO */
const toIsoDate = (display: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((display || '').trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : display;
};

/* Source badges derive from tags (set on create) and the activity log */
const SOURCE_FROM_TAG: Record<string, BillItem['source']> = {
  'source:upload': 'Upload',
  'source:email': 'Email forwarded',
  'source:scan': 'Auto-scanned',
};

/* Store DocumentStatus → the screen's three tabs: For review / Unpaid / Paid.
   Drafts land in 'For review' (upload → review → approve → paid funnel);
   Approved/Overdue/etc. are payable, so they land in 'Unpaid'. */
const toTabStatus = (s: DocumentStatus): BillItem['status'] =>
  s === 'ForReview' || s === 'Draft'
    ? 'For review'
    : s === 'Paid' || s === 'Deposited'
    ? 'Paid'
    : 'Unpaid';

/* Next bill number per the platform numbering scheme */
const nextBillNumber = () =>
  `BILL-${usePlatformStore.getState().documents.filter((d) => d.type === 'Bill').length + 2001}`;

/* Store Document → the screen's local row type */
function toBillItem(doc: Document, vendorName: string): BillItem {
  const taggedSource = doc.tags.map((t) => SOURCE_FROM_TAG[t]).find(Boolean);
  const activityText = doc.activity.map((a) => a.text).join(' ').toLowerCase();
  const source: BillItem['source'] =
    taggedSource ??
    (activityText.includes('email')
      ? 'Email forwarded'
      : activityText.includes('upload') || activityText.includes('scan')
      ? 'Auto-scanned'
      : 'Manual');
  return {
    id: doc.id,
    vendor: vendorName || '—',
    source,
    billNo: doc.number,
    billDate: toDisplayDate(doc.date),
    category: doc.lines[0]?.description || 'Uncategorized',
    className: doc.lines[0]?.account || undefined,
    location: undefined,
    memo: doc.memo,
    dueDate: toDisplayDate(doc.dueDate),
    amount: doc.total,
    attachmentsCount: doc.attachments.length,
    status: toTabStatus(doc.status),
  };
}

type ColumnKey =
  | 'vendor'
  | 'source'
  | 'billNo'
  | 'billDate'
  | 'category'
  | 'className'
  | 'location'
  | 'memo'
  | 'dueDate'
  | 'amount'
  | 'attachments';

interface ColumnDef {
  key: ColumnKey;
  label: string;
  visible: boolean;
  align?: 'left' | 'right';
}

const DEFAULT_COLUMNS: ColumnDef[] = [
  { key: 'vendor', label: 'Vendor', visible: true, align: 'left' },
  { key: 'source', label: 'Source', visible: true, align: 'left' },
  { key: 'billNo', label: 'Bill No.', visible: true, align: 'left' },
  { key: 'billDate', label: 'Bill Date', visible: true, align: 'left' },
  { key: 'category', label: 'Category', visible: true, align: 'left' },
  { key: 'className', label: 'Class', visible: false, align: 'left' },
  { key: 'location', label: 'Location', visible: false, align: 'left' },
  { key: 'memo', label: 'Memo', visible: true, align: 'left' },
  { key: 'dueDate', label: 'Due Date', visible: true, align: 'left' },
  { key: 'amount', label: 'Bill Amount', visible: true, align: 'right' },
  { key: 'attachments', label: 'Attachments', visible: true, align: 'right' },
];

export interface BillsScreenProps {
  onPayBills?: () => void;
  onCreateBill?: () => void;
  onOpenPeek?: (title: string, details: Record<string, string | number>) => void;
  onToast?: (message: string) => void;
}

export default function BillsScreen({
  onPayBills,
  onCreateBill,
  onOpenPeek,
  onToast,
}: BillsScreenProps) {
  // Shared platform store — single source of truth (§1.1)
  const store = usePlatformStore();

  // Row-level "open in engine": editing a bill opens the Document Engine
  const [editingId, setEditingId] = useState<string | null>(null);

  // Tabs: 'For review' | 'Unpaid' | 'Paid'
  const [activeTab, setActiveTab] = useState<'For review' | 'Unpaid' | 'Paid'>('For review');

  // Bills collection — derived from store documents (no local mock array)
  const bills: BillItem[] = useMemo(
    () =>
      store.documents
        .filter((d) => d.type === 'Bill')
        .map((doc) => toBillItem(doc, store.getParty(doc.partyId)?.name || '')),
    [store]
  );

  // Selected bill rows
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filter toolbar
  const [selectedVendor, setSelectedVendor] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterCategory, setFilterCategory] = useState<string>('All');

  // Date Popover & Date Pill
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<'This Year' | 'Last Year' | 'Custom'>('This Year');
  const [dateFrom, setDateFrom] = useState('01/01/2026');
  const [dateTo, setDateTo] = useState('12/31/2026');
  const [isDateFilterActive, setIsDateFilterActive] = useState(false);
  const [activeDateLabel, setActiveDateLabel] = useState('This Year');

  // Filters Popover
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);

  // Split Add Bill Menu
  const [isAddBillMenuOpen, setIsAddBillMenuOpen] = useState(false);

  // Customize Drawer
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnDef[]>(DEFAULT_COLUMNS);
  const [sortBy, setSortBy] = useState<'billDate' | 'dueDate' | 'amount' | 'vendor'>('billDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [rowsPerPage, setRowsPerPage] = useState<number>(50);
  const [rowHeight, setRowHeight] = useState<'Cozy' | 'Compact'>('Cozy');
  const [alternateRowColor, setAlternateRowColor] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEmailSettingsOpen, setIsEmailSettingsOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Row Action Menu
  const [activeRowMenuId, setActiveRowMenuId] = useState<string | null>(null);

  // New Bill form state
  const [newVendor, setNewVendor] = useState(
    () =>
      store.parties.find((p) => p.roles.includes('Vendor') || p.roles.includes('Supplier'))
        ?.name || 'Printful'
  );
  const [newBillNo, setNewBillNo] = useState<string>(nextBillNumber);
  const [newBillDate, setNewBillDate] = useState('11/04/2026');
  const [newDueDate, setNewDueDate] = useState('12/04/2026');
  const [newCategory, setNewCategory] = useState('Printing');
  const [newAmount, setNewAmount] = useState('250.00');
  const [newMemo, setNewMemo] = useState('Sample shipment invoice');

  // File upload input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local Toast
  const [localToastMessage, setLocalToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (onToast) {
      onToast(msg);
    }
    setLocalToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setLocalToastMessage(null);
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.dateTrigger}`) && !target.closest(`.${styles.datePopover}`)) {
        setIsDatePopoverOpen(false);
      }
      if (!target.closest(`.${styles.filterBtnTrigger}`) && !target.closest(`.${styles.filterPopover}`)) {
        setIsFilterPopoverOpen(false);
      }
      if (!target.closest(`.${styles.splitBtn}`)) {
        setIsAddBillMenuOpen(false);
      }
      if (!target.closest(`.${styles.rowMenu}`) && !target.closest('[data-row-menu-btn]')) {
        setActiveRowMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Filtered & Sorted bills
  const filteredBills = useMemo(() => {
    return bills
      .filter((b) => {
        // Tab filter
        if (b.status !== activeTab) return false;

        // Vendor filter
        if (selectedVendor !== 'All' && b.vendor !== selectedVendor) return false;

        // Status popover filter
        if (filterStatus !== 'All' && b.status !== filterStatus) return false;

        // Category filter
        if (filterCategory !== 'All' && b.category !== filterCategory) return false;

        return true;
      })
      .sort((a, b) => {
        let valA: string | number = a[sortBy] ?? '';
        let valB: string | number = b[sortBy] ?? '';
        if (sortBy === 'amount') {
          return sortDirection === 'asc' ? (a.amount - b.amount) : (b.amount - a.amount);
        }
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
  }, [bills, activeTab, selectedVendor, filterStatus, filterCategory, sortBy, sortDirection]);

  // Vendor/category filter options derive from the live bills
  const vendorOptions = useMemo(
    () => Array.from(new Set(bills.map((b) => b.vendor))).sort(),
    [bills]
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set(bills.map((b) => b.category))).sort(),
    [bills]
  );

  // Find or create the Vendor party for a new bill
  const findOrCreateVendorParty = (vendorName: string): string => {
    const name = vendorName.trim() || 'Unknown Vendor';
    const existing = store.parties.find(
      (p) => p.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) return existing.id;
    return store.addParty({
      name,
      displayName: name,
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      roles: ['Vendor'],
      balance: 0,
      address: '',
      city: '',
      state: '',
      zip: '',
      country: '',
      terms: 'Net 30',
      creditLimit: 0,
      taxId: '',
      taxExempt: false,
      track1099: false,
      notes: '',
      tags: [],
      owner: 'Current user',
      segmentIds: [],
    });
  };

  // Bulk selection handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredBills.map((b) => b.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const isAllSelected = filteredBills.length > 0 && selectedIds.size === filteredBills.length;

  // Forwarding email copy
  const handleCopyEmail = () => {
    const email = 'unsaid+expenses@assist.intuit.com';
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(email);
    }
    showToast('Forwarding email copied to clipboard');
  };

  // Date Filter Apply & Reset
  const handleApplyDateFilter = () => {
    setIsDatePopoverOpen(false);
    setIsDateFilterActive(true);
    setActiveDateLabel(`${dateFrom} - ${dateTo}`);
    showToast('Date filter applied');
  };

  const handleResetDateFilter = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsDateFilterActive(false);
    setActiveDateLabel('This Year');
    setDatePreset('This Year');
    setDateFrom('01/01/2026');
    setDateTo('12/31/2026');
    showToast('Date filter reset');
  };

  // Upload files handler
  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const amount = +(Math.random() * 500 + 45).toFixed(2);
      const today = new Date().toISOString().slice(0, 10);
      const due = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      // Find or create the vendor party, then write the bill to the store
      const partyId = findOrCreateVendorParty(
        file.name.split('.')[0].replace(/[-_]/g, ' ') || 'New Vendor'
      );
      store.addDocument({
        type: 'Bill',
        number: `UL-${Math.floor(1000 + Math.random() * 9000)}`,
        partyId,
        status: 'ForReview',
        date: today,
        dueDate: due,
        lines: [
          {
            id: 'L1',
            itemId: null,
            description: 'Printing',
            qty: 1,
            rate: amount,
            amount,
            taxRate: 0,
            account: '',
            tags: [],
          },
        ],
        subtotal: amount,
        tax: 0,
        shipping: 0,
        total: amount,
        amountPaid: 0,
        balance: amount,
        memo: `Scanned from ${file.name}`,
        notes: '',
        tags: ['source:upload'],
        attachments: [file.name],
        orderId: null,
        poId: null,
        channelId: null,
        createdBy: 'Current user',
      });
      setActiveTab('For review');
      showToast(`Uploaded ${file.name} — Added to 'For review'`);
      e.target.value = '';
    }
  };

  // Create Bill Modal submit — writes to the shared store
  const handleSaveNewBill = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(newAmount) || 0;
    const partyId = findOrCreateVendorParty(newVendor);
    store.addDocument({
      type: 'Bill',
      number: newBillNo,
      partyId,
      status: 'ForReview',
      date: toIsoDate(newBillDate),
      dueDate: toIsoDate(newDueDate),
      lines: [
        {
          id: 'L1',
          itemId: null,
          description: newCategory,
          qty: 1,
          rate: amount,
          amount,
          taxRate: 0,
          account: '',
          tags: [],
        },
      ],
      subtotal: amount,
      tax: 0,
      shipping: 0,
      total: amount,
      amountPaid: 0,
      balance: amount,
      memo: newMemo,
      notes: '',
      tags: [],
      attachments: [],
      orderId: null,
      poId: null,
      channelId: null,
      createdBy: 'Current user',
    });
    setIsCreateModalOpen(false);
    setActiveTab('For review');
    showToast(`Bill ${newBillNo} created successfully`);
    // reset form
    setNewBillNo(nextBillNumber());
  };

  // Review & Approve
  const handleApproveBill = (id: string) => {
    store.changeDocumentStatus(id, 'Unpaid');
    setActiveRowMenuId(null);
    showToast('Bill approved and moved to Unpaid');
  };

  // Mark as Paid — records a full payment against the bill
  const handleMarkAsPaid = (id: string) => {
    const doc = store.getDocument(id);
    if (doc) store.recordPayment(id, doc.total, 'Check', 'Checking');
    setActiveRowMenuId(null);
    showToast('Bill marked as Paid');
  };

  // Delete Bill
  const handleDeleteBill = (id: string) => {
    store.deleteDocument(id);
    setActiveRowMenuId(null);
    showToast('Bill deleted');
  };

  // Column toggle
  const handleToggleColumn = (key: ColumnKey) => {
    setColumns((prev) =>
      prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col))
    );
  };

  const visibleColumns = columns.filter((c) => c.visible);

  // ── Row-level "open in engine" — the Document Engine renders the bill ──
  if (editingId) {
    return (
      <DocumentEngine
        type="Bill"
        documentId={editingId}
        onToast={showToast}
        onClose={() => setEditingId(null)}
      />
    );
  }

  return (
    <div className={styles.container}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.csv"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ═══════════ TOP HEADER ═══════════ */}
      <header className={styles.header}>
        {/* Breadcrumbs & Utility */}
        <div className={styles.breadcrumbsRow}>
          <div className={styles.breadcrumbText}>Expenses &amp; Pay Bills / Bills</div>
          <div className={styles.topRightActions}>
            <button
              type="button"
              className={styles.feedbackLink}
              onClick={() => showToast('Feedback form opened')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                chat_bubble_outline
              </span>
              Give feedback
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              title="Open in new window"
              onClick={() => showToast('Opened in standalone tab')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                open_in_new
              </span>
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              title="Fullscreen"
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(() => {});
                } else {
                  document.documentElement.requestFullscreen?.().catch(() => {});
                }
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                fullscreen
              </span>
            </button>
          </div>
        </div>

        {/* Title & Main Actions */}
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Bills</h1>
          <div className={styles.mainActionsGroup}>
            <button
              type="button"
              className={styles.emailSettingsLink}
              onClick={() => setIsEmailSettingsOpen(true)}
            >
              Manage email settings
            </button>
            <button
              type="button"
              className={styles.payBillsBtn}
              onClick={() => {
                if (onPayBills) onPayBills();
                else showToast('Opening Pay Bills workspace...');
              }}
            >
              Pay bills
            </button>

            {/* Split Add Bill */}
            <div className={styles.splitBtn}>
              <button
                type="button"
                className={styles.splitBtnMain}
                onClick={() => {
                  if (onCreateBill) onCreateBill();
                  else setIsCreateModalOpen(true);
                }}
              >
                Add bill
              </button>
              <button
                type="button"
                className={styles.splitBtnArrow}
                aria-label="More options"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAddBillMenuOpen((prev) => !prev);
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  expand_more
                </span>
              </button>

              {isAddBillMenuOpen && (
                <div
                  className={styles.rowMenu}
                  style={{ top: 38, right: 0, minWidth: 160 }}
                >
                  <button
                    type="button"
                    className={styles.rowMenuItem}
                    onClick={() => {
                      setIsAddBillMenuOpen(false);
                      setIsCreateModalOpen(true);
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      add_circle
                    </span>
                    Create bill
                  </button>
                  <button
                    type="button"
                    className={styles.rowMenuItem}
                    onClick={() => {
                      setIsAddBillMenuOpen(false);
                      handleTriggerUpload();
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      upload_file
                    </span>
                    Upload bills
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Email Forwarding Banner */}
        <div className={styles.emailBanner}>
          <div className={styles.bannerContent}>
            <span className={`material-symbols-outlined ${styles.bannerIcon}`}>auto_awesome</span>
            <span className={styles.bannerBold}>Anyone can autofill multiple receipts</span>
            <span className={styles.bannerMuted}>or create bills and expenses by sending files to:</span>
            <span className={styles.bannerEmail}>unsaid+expenses@assist.intuit.com</span>
            <button
              type="button"
              className={styles.copyEmailBtn}
              title="Copy email address"
              onClick={handleCopyEmail}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                content_copy
              </span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={styles.tabsRow}>
          <div className={styles.tabsList}>
            {(['For review', 'Unpaid', 'Paid'] as const).map((tab) => {
              const isActive = activeTab === tab;
              const count = bills.filter((b) => b.status === tab).length;
              return (
                <button
                  key={tab}
                  type="button"
                  className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ''}`}
                  onClick={() => {
                    setActiveTab(tab);
                    setSelectedIds(new Set());
                    showToast(`Switched to ${tab} tab (${count} items)`);
                  }}
                >
                  {tab}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={styles.howToLink}
            onClick={() => setIsHelpModalOpen(true)}
          >
            How to manage bills
          </button>
        </div>
      </header>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <main className={styles.main}>
        {/* Filter Bar */}
        <div className={styles.filterBar}>
          <div className={styles.filtersLeft}>
            <div className={styles.filtersRow}>
              {/* Vendor Filter */}
              <div className={styles.filterField}>
                <label className={styles.filterLabel}>Vendor</label>
                <div style={{ position: 'relative' }}>
                  <select
                    className={styles.fieldSelect}
                    value={selectedVendor}
                    onChange={(e) => {
                      setSelectedVendor(e.target.value);
                      showToast(`Vendor filter: ${e.target.value}`);
                    }}
                  >
                    <option value="All">All</option>
                    {vendorOptions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: 10,
                      fontSize: 16,
                      color: '#5a6355',
                      pointerEvents: 'none',
                    }}
                  >
                    expand_more
                  </span>
                </div>
              </div>

              {/* Bill Date Filter (Opens Popover) */}
              <div className={`${styles.filterField} ${styles.dateTrigger}`}>
                <label className={styles.filterLabel}>Bill Date</label>
                <div
                  className={styles.dateTriggerInner}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDatePopoverOpen((prev) => !prev);
                    setIsFilterPopoverOpen(false);
                  }}
                >
                  <span>{isDateFilterActive ? activeDateLabel : 'This Year'}</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#5a6355' }}>
                    calendar_today
                  </span>
                </div>

                {/* Date Popover */}
                {isDatePopoverOpen && (
                  <div
                    className={`${styles.popover} ${styles.datePopover}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className={styles.popoverHeader}>
                      <h3 className={styles.popoverTitle}>Bill Date</h3>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => setIsDatePopoverOpen(false)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                          close
                        </span>
                      </button>
                    </div>

                    <div className={styles.dateInputsRow}>
                      <div style={{ flex: 1 }}>
                        <label className={styles.modalLabel}>Preset</label>
                        <select
                          className={styles.fieldSelect}
                          value={datePreset}
                          onChange={(e) => {
                            const val = e.target.value as 'This Year' | 'Last Year' | 'Custom';
                            setDatePreset(val);
                            if (val === 'This Year') {
                              setDateFrom('01/01/2026');
                              setDateTo('12/31/2026');
                            } else if (val === 'Last Year') {
                              setDateFrom('01/01/2025');
                              setDateTo('12/31/2025');
                            }
                          }}
                        >
                          <option value="This Year">This Year</option>
                          <option value="Last Year">Last Year</option>
                          <option value="Custom">Custom</option>
                        </select>
                      </div>

                      <div style={{ flex: 1 }}>
                        <label className={styles.modalLabel}>From</label>
                        <div className={styles.inputWrapper}>
                          <input
                            type="text"
                            className={styles.fieldInput}
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                          />
                          <span className={`material-symbols-outlined ${styles.inputIcon}`}>
                            calendar_today
                          </span>
                        </div>
                      </div>

                      <div style={{ flex: 1 }}>
                        <label className={styles.modalLabel}>To</label>
                        <div className={styles.inputWrapper}>
                          <input
                            type="text"
                            className={styles.fieldInput}
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                          />
                          <span className={`material-symbols-outlined ${styles.inputIcon}`}>
                            calendar_today
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.popoverFooter}>
                      <button
                        type="button"
                        className={styles.popoverResetBtn}
                        onClick={() => handleResetDateFilter()}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className={styles.popoverApplyBtn}
                        onClick={handleApplyDateFilter}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Filter By Button (Opens Popover) */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className={styles.filterBtnTrigger}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFilterPopoverOpen((prev) => !prev);
                    setIsDatePopoverOpen(false);
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    filter_list
                  </span>
                  Filters
                  {(filterStatus !== 'All' || filterCategory !== 'All') && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        backgroundColor: '#0a6400',
                      }}
                    />
                  )}
                </button>

                {/* Filter By Popover */}
                {isFilterPopoverOpen && (
                  <div
                    className={`${styles.popover} ${styles.filterPopover}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className={styles.popoverHeader}>
                      <h3 className={styles.popoverTitle}>Filter By</h3>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        onClick={() => setIsFilterPopoverOpen(false)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                          close
                        </span>
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                      <div>
                        <label className={styles.modalLabel}>Status</label>
                        <div style={{ position: 'relative' }}>
                          <select
                            className={styles.fieldSelect}
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                          >
                            <option value="All">All</option>
                            <option value="For review">For review</option>
                            <option value="Unpaid">Unpaid</option>
                            <option value="Paid">Paid</option>
                          </select>
                          <span
                            className="material-symbols-outlined"
                            style={{
                              position: 'absolute',
                              right: 10,
                              top: 10,
                              fontSize: 16,
                              color: '#5a6355',
                              pointerEvents: 'none',
                            }}
                          >
                            expand_more
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className={styles.modalLabel}>Category</label>
                        <div style={{ position: 'relative' }}>
                          <select
                            className={styles.fieldSelect}
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                          >
                            <option value="All">All</option>
                            {categoryOptions.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <span
                            className="material-symbols-outlined"
                            style={{
                              position: 'absolute',
                              right: 10,
                              top: 10,
                              fontSize: 16,
                              color: '#5a6355',
                              pointerEvents: 'none',
                            }}
                          >
                            expand_more
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button
                        type="button"
                        className={styles.popoverApplyBtn}
                        style={{ width: '100%', height: 36 }}
                        onClick={() => {
                          setIsFilterPopoverOpen(false);
                          showToast('Filters applied');
                        }}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        className={styles.popoverResetBtn}
                        style={{ width: '100%', height: 36 }}
                        onClick={() => {
                          setFilterStatus('All');
                          setFilterCategory('All');
                          setIsFilterPopoverOpen(false);
                          showToast('Filters reset');
                        }}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Active Date Pill */}
            {isDateFilterActive && (
              <div>
                <span className={styles.activeDatePill}>
                  Bill Date: {activeDateLabel}
                  <button
                    type="button"
                    className={styles.pillCloseBtn}
                    onClick={handleResetDateFilter}
                    title="Remove date filter"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      close
                    </span>
                  </button>
                </span>
              </div>
            )}
          </div>

          {/* Right side icons */}
          <div className={styles.filtersRight}>
            <button
              type="button"
              className={styles.iconBtn}
              title="Print table"
              onClick={() => {
                if (typeof window !== 'undefined') window.print();
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                print
              </span>
            </button>
            <button
              type="button"
              className={styles.customizeBtn}
              onClick={() => setIsCustomizeOpen(true)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                tune
              </span>
              Customize
            </button>
          </div>
        </div>

        {/* ═══════════ TABLE AREA ═══════════ */}
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th style={{ width: 40, paddingLeft: 12 }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    style={{ accentColor: '#0a6400', cursor: 'pointer' }}
                  />
                </th>
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      textAlign: col.align || 'left',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      if (
                        col.key === 'billDate' ||
                        col.key === 'dueDate' ||
                        col.key === 'amount' ||
                        col.key === 'vendor'
                      ) {
                        if (sortBy === col.key) {
                          setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                        } else {
                          setSortBy(col.key);
                          setSortDirection('asc');
                        }
                      }
                    }}
                  >
                    {col.label}
                    {sortBy === col.key && (
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 14, verticalAlign: 'middle', marginLeft: 4 }}
                      >
                        {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                      </span>
                    )}
                  </th>
                ))}
                <th style={{ textAlign: 'right', paddingRight: 16 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredBills.length === 0 ? (
                /* Empty State Row matching attachment screenshot exactly */
                <tr>
                  <td colSpan={visibleColumns.length + 2} className={styles.emptyStateCell}>
                    <h3 className={styles.emptyStateTitle}>No bills found</h3>
                    <p className={styles.emptyStateDesc}>
                      Select Upload files to create bills automatically.
                    </p>
                    <button
                      type="button"
                      className={styles.uploadFilesBtn}
                      onClick={handleTriggerUpload}
                    >
                      Upload files
                    </button>
                  </td>
                </tr>
              ) : (
                filteredBills.map((bill, idx) => {
                  const isChecked = selectedIds.has(bill.id);
                  const isAlt = alternateRowColor && idx % 2 === 1;
                  const rowClass = `${styles.tableRow} ${
                    rowHeight === 'Compact' ? styles.compactRow : ''
                  } ${isAlt ? styles.tableRowAlt : ''}`;

                  return (
                    <tr key={bill.id} className={rowClass}>
                      <td style={{ width: 40, paddingLeft: 12 }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleRow(bill.id)}
                          style={{ accentColor: '#0a6400', cursor: 'pointer' }}
                        />
                      </td>

                      {visibleColumns.map((col) => {
                        switch (col.key) {
                          case 'vendor':
                            return (
                              <td key={col.key} style={{ fontWeight: 600 }}>
                                <button
                                  type="button"
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    font: 'inherit',
                                    color: '#0a6400',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    textDecoration: 'underline',
                                  }}
                                  onClick={() => {
                                    if (onOpenPeek) {
                                      onOpenPeek(`Bill ${bill.billNo} — ${bill.vendor}`, {
                                        Vendor: bill.vendor,
                                        'Bill No.': bill.billNo,
                                        'Bill Date': bill.billDate,
                                        'Due Date': bill.dueDate,
                                        Amount: `$${bill.amount.toFixed(2)}`,
                                        Category: bill.category,
                                        Source: bill.source,
                                        Status: bill.status,
                                        Memo: bill.memo,
                                      });
                                    } else {
                                      setEditingId(bill.id);
                                    }
                                  }}
                                >
                                  {bill.vendor}
                                </button>
                              </td>
                            );
                          case 'source':
                            return (
                              <td key={col.key}>
                                <span className={styles.sourceBadge}>
                                  <span
                                    className="material-symbols-outlined"
                                    style={{ fontSize: 13 }}
                                  >
                                    {bill.source === 'Auto-scanned'
                                      ? 'document_scanner'
                                      : bill.source === 'Email forwarded'
                                      ? 'mail'
                                      : 'edit_note'}
                                  </span>
                                  {bill.source}
                                </span>
                              </td>
                            );
                          case 'billNo':
                            return (
                              <td key={col.key} style={{ fontFamily: 'monospace' }}>
                                {bill.billNo}
                              </td>
                            );
                          case 'billDate':
                            return <td key={col.key}>{bill.billDate}</td>;
                          case 'category':
                            return (
                              <td key={col.key}>
                                <span className={styles.categoryTag}>{bill.category}</span>
                              </td>
                            );
                          case 'className':
                            return <td key={col.key}>{bill.className || '—'}</td>;
                          case 'location':
                            return <td key={col.key}>{bill.location || '—'}</td>;
                          case 'memo':
                            return (
                              <td
                                key={col.key}
                                style={{
                                  maxWidth: 240,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {bill.memo}
                              </td>
                            );
                          case 'dueDate':
                            return <td key={col.key}>{bill.dueDate}</td>;
                          case 'amount':
                            return (
                              <td
                                key={col.key}
                                style={{
                                  textAlign: 'right',
                                  fontWeight: 600,
                                  fontVariantNumeric: 'tabular-nums',
                                }}
                              >
                                ${bill.amount.toFixed(2)}
                              </td>
                            );
                          case 'attachments':
                            return (
                              <td key={col.key} style={{ textAlign: 'right' }}>
                                {bill.attachmentsCount > 0 ? (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 3,
                                      color: '#5a6355',
                                    }}
                                  >
                                    <span
                                      className="material-symbols-outlined"
                                      style={{ fontSize: 15 }}
                                    >
                                      attach_file
                                    </span>
                                    {bill.attachmentsCount}
                                  </span>
                                ) : (
                                  <span style={{ color: '#becab6' }}>—</span>
                                )}
                              </td>
                            );
                          default:
                            return <td key={col.key}>—</td>;
                        }
                      })}

                      {/* Action Cell */}
                      <td style={{ textAlign: 'right', paddingRight: 16, position: 'relative' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {bill.status === 'For review' && (
                            <button
                              type="button"
                              className={styles.popoverApplyBtn}
                              style={{ height: 26, fontSize: 11, padding: '0 8px' }}
                              onClick={() => handleApproveBill(bill.id)}
                            >
                              Approve
                            </button>
                          )}
                          {bill.status === 'Unpaid' && (
                            <button
                              type="button"
                              className={styles.popoverApplyBtn}
                              style={{ height: 26, fontSize: 11, padding: '0 8px' }}
                              onClick={() => handleMarkAsPaid(bill.id)}
                            >
                              Pay
                            </button>
                          )}
                          <button
                            type="button"
                            data-row-menu-btn
                            className={styles.iconBtn}
                            style={{ width: 28, height: 28 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveRowMenuId(activeRowMenuId === bill.id ? null : bill.id);
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                              more_vert
                            </span>
                          </button>
                        </div>

                        {/* Row Action Popover */}
                        {activeRowMenuId === bill.id && (
                          <div
                            className={styles.rowMenu}
                            style={{ right: 16, top: 32, minWidth: 180 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className={styles.rowMenuItem}
                              onClick={() => {
                                if (onOpenPeek) {
                                  onOpenPeek(`Bill ${bill.billNo} — ${bill.vendor}`, {
                                    Vendor: bill.vendor,
                                    'Bill No.': bill.billNo,
                                    'Bill Date': bill.billDate,
                                    'Due Date': bill.dueDate,
                                    Amount: `$${bill.amount.toFixed(2)}`,
                                    Category: bill.category,
                                    Source: bill.source,
                                    Status: bill.status,
                                    Memo: bill.memo,
                                  });
                                }
                                setActiveRowMenuId(null);
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                visibility
                              </span>
                              View bill details
                            </button>
                            <button
                              type="button"
                              className={styles.rowMenuItem}
                              onClick={() => {
                                setEditingId(bill.id);
                                setActiveRowMenuId(null);
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                edit
                              </span>
                              Edit bill
                            </button>
                            {bill.status === 'For review' && (
                              <button
                                type="button"
                                className={styles.rowMenuItem}
                                onClick={() => handleApproveBill(bill.id)}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                  check_circle
                                </span>
                                Approve to Unpaid
                              </button>
                            )}
                            {bill.status === 'Unpaid' && (
                              <button
                                type="button"
                                className={styles.rowMenuItem}
                                onClick={() => handleMarkAsPaid(bill.id)}
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                  paid
                                </span>
                                Mark as Paid
                              </button>
                            )}
                            <button
                              type="button"
                              className={styles.rowMenuItem}
                              onClick={() => {
                                showToast(`Downloading receipt for ${bill.billNo}...`);
                                setActiveRowMenuId(null);
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                download
                              </span>
                              Download attachment
                            </button>
                            <button
                              type="button"
                              className={styles.rowMenuItem}
                              style={{ color: '#ba1a1a' }}
                              onClick={() => handleDeleteBill(bill.id)}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                delete
                              </span>
                              Delete bill
                            </button>
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

        {/* ═══════════ PAGINATION ═══════════ */}
        <div className={styles.pagination}>
          <div>
            {filteredBills.length === 0
              ? '0 - 0 of 0 items'
              : `1 - ${filteredBills.length} of ${filteredBills.length} items`}
          </div>
          <div className={styles.paginationControls}>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.disabledIconBtn}`}
              disabled
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                chevron_left
              </span>
            </button>
            <span>Page</span>
            <input
              className={styles.pageInput}
              defaultValue="1"
              readOnly
            />
            <span>of 1</span>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.disabledIconBtn}`}
              disabled
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                chevron_right
              </span>
            </button>
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.disabledIconBtn}`}
              disabled
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                last_page
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* ═══════════ CUSTOMIZE DRAWER ═══════════ */}
      <div
        className={`${styles.drawerScrim} ${isCustomizeOpen ? styles.drawerScrimOpen : ''}`}
        onClick={() => setIsCustomizeOpen(false)}
      />
      <aside
        className={`${styles.drawer} ${isCustomizeOpen ? styles.drawerOpen : ''}`}
        aria-label="Customize Table"
      >
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>Customize</h2>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setIsCustomizeOpen(false)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              close
            </span>
          </button>
        </div>

        <div className={styles.drawerBody}>
          {/* Sort Section */}
          <div>
            <div className={styles.drawerSectionTitle}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                expand_less
              </span>
              Sort
            </div>
            <div className={styles.sortBox}>
              <div>
                <label className={styles.filterLabel}>Sort by</label>
                <div style={{ position: 'relative' }}>
                  <select
                    className={styles.fieldSelect}
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(
                        e.target.value as 'billDate' | 'dueDate' | 'amount' | 'vendor'
                      )
                    }
                  >
                    <option value="billDate">Bill Date</option>
                    <option value="dueDate">Due Date</option>
                    <option value="amount">Bill Amount</option>
                    <option value="vendor">Vendor</option>
                  </select>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: 10,
                      fontSize: 16,
                      color: '#5a6355',
                      pointerEvents: 'none',
                    }}
                  >
                    expand_more
                  </span>
                </div>
              </div>

              <div>
                <label className={styles.filterLabel}>Direction</label>
                <div style={{ position: 'relative' }}>
                  <select
                    className={styles.fieldSelect}
                    value={sortDirection}
                    onChange={(e) => setSortDirection(e.target.value as 'asc' | 'desc')}
                  >
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: 10,
                      fontSize: 16,
                      color: '#5a6355',
                      pointerEvents: 'none',
                    }}
                  >
                    expand_more
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className={styles.addSortBtn}
              onClick={() => showToast('Secondary sort criteria added')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                add
              </span>
              Add sort
            </button>
          </div>

          {/* Rows Section */}
          <div>
            <div className={styles.drawerSectionTitle}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                expand_less
              </span>
              Rows
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className={styles.filterLabel}>Rows per page</label>
                <div style={{ position: 'relative' }}>
                  <select
                    className={styles.fieldSelect}
                    value={rowsPerPage}
                    onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  >
                    <option value={50}>50</option>
                    <option value={75}>75</option>
                    <option value={100}>100</option>
                  </select>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: 10,
                      fontSize: 16,
                      color: '#5a6355',
                      pointerEvents: 'none',
                    }}
                  >
                    expand_more
                  </span>
                </div>
              </div>

              <div>
                <label className={styles.filterLabel}>Row height</label>
                <div style={{ position: 'relative' }}>
                  <select
                    className={styles.fieldSelect}
                    value={rowHeight}
                    onChange={(e) => setRowHeight(e.target.value as 'Cozy' | 'Compact')}
                  >
                    <option value="Cozy">Cozy</option>
                    <option value="Compact">Compact</option>
                  </select>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: 10,
                      fontSize: 16,
                      color: '#5a6355',
                      pointerEvents: 'none',
                    }}
                  >
                    expand_more
                  </span>
                </div>
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={alternateRowColor}
                  onChange={(e) => setAlternateRowColor(e.target.checked)}
                  style={{ accentColor: '#0a6400' }}
                />
                Alternate row color
              </label>
            </div>
          </div>

          {/* Columns Section */}
          <div>
            <div className={styles.drawerSectionTitle}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                expand_less
              </span>
              Columns
            </div>
            <p style={{ fontSize: 11, color: '#5a6355', marginBottom: 12 }}>
              Drag to change the order of columns
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {columns.map((col) => (
                <div key={col.key} className={styles.columnOrderItem}>
                  <div className={styles.columnItemLeft}>
                    <span className={`material-symbols-outlined ${styles.dragHandle}`}>
                      drag_indicator
                    </span>
                    <input
                      type="checkbox"
                      checked={col.visible}
                      onChange={() => handleToggleColumn(col.key)}
                      style={{ accentColor: '#0a6400', cursor: 'pointer' }}
                    />
                    <span>{col.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* ═══════════ MODALS ═══════════ */}

      {/* Create Bill Modal */}
      {isCreateModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsCreateModalOpen(false)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Add Bill</h2>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setIsCreateModalOpen(false)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  close
                </span>
              </button>
            </div>

            <form onSubmit={handleSaveNewBill}>
              <div className={styles.modalBody}>
                <div className={styles.modalGrid}>
                  <div>
                    <label className={styles.modalLabel}>Vendor *</label>
                    <input
                      className={styles.fieldInput}
                      value={newVendor}
                      onChange={(e) => setNewVendor(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className={styles.modalLabel}>Bill Number *</label>
                    <input
                      className={styles.fieldInput}
                      value={newBillNo}
                      onChange={(e) => setNewBillNo(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className={styles.modalLabel}>Bill Date</label>
                    <input
                      className={styles.fieldInput}
                      value={newBillDate}
                      onChange={(e) => setNewBillDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={styles.modalLabel}>Due Date</label>
                    <input
                      className={styles.fieldInput}
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={styles.modalLabel}>Category</label>
                    <select
                      className={styles.fieldSelect}
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                    >
                      <option value="Printing">Printing</option>
                      <option value="Shipping">Shipping</option>
                      <option value="Software">Software</option>
                      <option value="Office Supplies">Office Supplies</option>
                      <option value="Legal & Professional">Legal &amp; Professional</option>
                    </select>
                  </div>
                  <div>
                    <label className={styles.modalLabel}>Amount ($) *</label>
                    <input
                      className={styles.fieldInput}
                      type="number"
                      step="0.01"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className={styles.modalFullWidth}>
                    <label className={styles.modalLabel}>Memo / Notes</label>
                    <input
                      className={styles.fieldInput}
                      value={newMemo}
                      onChange={(e) => setNewMemo(e.target.value)}
                      placeholder="e.g. Q4 Packaging supplies"
                    />
                  </div>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.popoverResetBtn}
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.popoverApplyBtn}>
                  Save bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Email Settings Modal */}
      {isEmailSettingsOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsEmailSettingsOpen(false)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Manage Email Settings</h2>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setIsEmailSettingsOpen(false)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  close
                </span>
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ fontSize: 13, color: '#5a6355', margin: 0 }}>
                Forward receipts and digital bills from your vendors or team to this private
                inbox address. Bills are scanned using automated extraction and placed into your
                &apos;For review&apos; queue.
              </p>

              <div>
                <label className={styles.modalLabel}>Your Ingestion Email Address</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className={styles.fieldInput}
                    value="unsaid+expenses@assist.intuit.com"
                    readOnly
                  />
                  <button
                    type="button"
                    className={styles.popoverApplyBtn}
                    onClick={handleCopyEmail}
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label className={styles.modalLabel}>Sender Whitelist / Authorization</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="radio" name="email_auth" defaultChecked style={{ accentColor: '#0a6400' }} />
                    Anyone can forward bills to this address
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="radio" name="email_auth" style={{ accentColor: '#0a6400' }} />
                    Only team members and invited users
                  </label>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.popoverApplyBtn}
                onClick={() => {
                  setIsEmailSettingsOpen(false);
                  showToast('Email settings updated');
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How to Manage Bills Modal */}
      {isHelpModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsHelpModalOpen(false)}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>How to Manage Bills</h2>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setIsHelpModalOpen(false)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  close
                </span>
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ display: 'flex', gap: 12 }}>
                <span className="material-symbols-outlined" style={{ color: '#0a6400', fontSize: 28 }}>
                  document_scanner
                </span>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600 }}>
                    1. Forward or upload invoices
                  </h4>
                  <p style={{ margin: 0, fontSize: 12, color: '#5a6355' }}>
                    Email invoices to your custom inbox or upload PDFs and images directly. OCR
                    extracts vendor, total amount, line items, and due dates.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <span className="material-symbols-outlined" style={{ color: '#0a6400', fontSize: 28 }}>
                  fact_check
                </span>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600 }}>
                    2. Review &amp; match
                  </h4>
                  <p style={{ margin: 0, fontSize: 12, color: '#5a6355' }}>
                    Bills appear in &apos;For review&apos;. Match them against open Purchase Orders
                    and assign expense categories.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <span className="material-symbols-outlined" style={{ color: '#0a6400', fontSize: 28 }}>
                  payments
                </span>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 600 }}>
                    3. Approve and pay
                  </h4>
                  <p style={{ margin: 0, fontSize: 12, color: '#5a6355' }}>
                    Approved bills move to &apos;Unpaid&apos;. Schedule payments via ACH, card, or paper
                    check through &apos;Pay bills&apos;.
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.popoverApplyBtn}
                onClick={() => setIsHelpModalOpen(false)}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local In-Screen Toast */}
      {localToastMessage && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check_circle
          </span>
          {localToastMessage}
        </div>
      )}
    </div>
  );
}
