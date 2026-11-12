'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { usePlatformStore, type Document, type DocumentLine } from '@/lib/platformStore';
import { DomainKey } from '@/data/shellData';
import DocumentEngine from '../DocumentEngine';
import styles from './ReceiptsScreen.module.css';

export interface ReceiptItem {
  id: string;
  no?: string;
  vendor: string;
  amount: string;
  tax: string;
  date: string;
  account: string;
  category: string;
  status: 'review' | 'reviewed';
  actionLabel?: string;
  isProcessing?: boolean;
  notes?: string;
}

/* ── Store ↔ screen adapters ────────────────────────────────────────
   The shared store owns the data (§1.1). Receipts are SalesReceipt
   documents: Draft = for review, Paid = reviewed,
   Deposited = matched to a bank transaction. */

/* ISO (YYYY-MM-DD) → MM/DD/YYYY for display; blank → em dash */
const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const parseMoney = (val: string) => parseFloat(String(val).replace(/[$,\s]/g, '')) || 0;

export interface ReceiptsScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreateExpense?: () => void;
  onOpenPeek?: (title: string, details: Record<string, string | number>) => void;
  onToast?: (msg: string) => void;
}

export default function ReceiptsScreen({
  onToast,
}: ReceiptsScreenProps) {
  const store = usePlatformStore();
  const [activeTab, setActiveTab] = useState<'review' | 'reviewed' | 'all'>('review');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragover, setIsDragover] = useState(false);
  const [copyConfirmed, setCopyConfirmed] = useState(false);

  // Ephemeral rows while OCR extraction is in flight (persisted once resolved)
  const [processingRows, setProcessingRows] = useState<ReceiptItem[]>([]);
  // Transient "Expense created" / "Matched" badge labels (not persisted)
  const [actionLabels, setActionLabels] = useState<Record<string, string>>({});
  // Document page (§1.5) — row open/edit renders the shared DocumentEngine
  const [editingId, setEditingId] = useState<string | null>(null);

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<ReceiptItem | null>(null);
  const [drawerForm, setDrawerForm] = useState({
    vendor: '',
    date: '',
    amount: '',
    tax: '',
    account: 'Visa •4421',
    category: '',
    notes: '',
  });

  // Floating menus state
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [catPickerPos, setCatPickerPos] = useState({ top: 0, left: 0 });
  const [catPickerTargetId, setCatPickerTargetId] = useState<string | null>(null);

  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ top: 0, left: 0 });
  const [rowMenuTargetId, setRowMenuTargetId] = useState<string | null>(null);

  const [matchMenuOpen, setMatchMenuOpen] = useState(false);
  const [matchMenuPos, setMatchMenuPos] = useState({ top: 0, left: 0 });

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const snapInputRef = useRef<HTMLInputElement>(null);
  const counterRef = useRef(1050);

  const showToast = (msg: string) => {
    if (onToast) onToast(msg);
    setToastMsg(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastMsg(null), 2000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleOutside = () => {
      setCatPickerOpen(false);
      setRowMenuOpen(false);
      setMatchMenuOpen(false);
    };
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, []);

  // Copy forwarding address
  const handleCopyForwarding = async () => {
    const val = 'receipts@unsaid.app';
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(val);
    }
    setCopyConfirmed(true);
    showToast('Forwarding address copied to clipboard');
    setTimeout(() => setCopyConfirmed(false), 2000);
  };

  // Open Receipt Drawer
  const handleOpenReceipt = (rec: ReceiptItem) => {
    setActiveReceipt(rec);
    setDrawerForm({
      vendor: rec.vendor,
      date: rec.date.includes('/')
        ? (() => {
            const parts = rec.date.split('/');
            return parts.length === 3
              ? `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
              : rec.date;
          })()
        : rec.date,
      amount: rec.amount,
      tax: rec.tax,
      account: rec.account || 'Visa •4421',
      category: rec.category,
      notes: rec.notes || '',
    });
    setIsDrawerOpen(true);
  };

  const handleCloseReceipt = () => {
    setIsDrawerOpen(false);
    setActiveReceipt(null);
  };

  /* Single source of truth: receipts are derived from the shared store */
  const toReceiptItem = (doc: Document): ReceiptItem => {
    const party = store.getParty(doc.partyId);
    return {
      id: doc.id,
      no: doc.number,
      vendor: party?.name || '—',
      amount: `$${doc.total.toFixed(2)}`,
      tax: `$${doc.tax.toFixed(2)}`,
      date: fmtDate(doc.date),
      account: doc.channelId || '',
      category: doc.lines[0]?.account || '',
      status: doc.status === 'Draft' ? 'review' : 'reviewed',
      notes: doc.notes,
    };
  };

  const receipts = (() => {
    const storeRows = store.documents
      .filter((d) => d.type === 'SalesReceipt')
      .map((doc) => {
        const row = toReceiptItem(doc);
        return actionLabels[doc.id] ? { ...row, actionLabel: actionLabels[doc.id] } : row;
      });
    return [...processingRows, ...storeRows];
  })();

  // Filtered receipts
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      if (activeTab === 'review' && r.status !== 'review') return false;
      if (activeTab === 'reviewed' && r.status !== 'reviewed') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          r.vendor.toLowerCase().includes(q) ||
          r.amount.toLowerCase().includes(q) ||
          r.account.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          (r.notes && r.notes.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [receipts, activeTab, searchQuery]);

  const reviewCount = useMemo(() => {
    return receipts.filter((r) => r.status === 'review').length;
  }, [receipts]);

  // Find (or create) the party behind an extracted vendor name
  const findOrCreateParty = (vendorName: string): string => {
    const existing = usePlatformStore
      .getState()
      .parties.find((p) => p.name.toLowerCase() === vendorName.toLowerCase());
    if (existing) return existing.id;
    return store.addParty({
      name: vendorName,
      displayName: vendorName,
      firstName: vendorName,
      lastName: '',
      email: '',
      phone: '',
      roles: ['Vendor'],
      balance: 0,
      address: '',
      city: '',
      state: '',
      zip: '',
      country: 'United States',
      terms: '',
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

  // Match menu data — unmatched bank movements + open bills from the store
  const unmatchedTransactions = store.moneyMovements
    .filter((m) => !m.documentId)
    .map((m) => ({
      name: m.memo || m.reference || `${m.type} ${m.id}`,
      date: `${fmtDate(m.date)} · ${m.toAccount}`,
      amt: `−$${m.amount.toFixed(2)}`,
      isBank: true,
    }));

  const openBills = store.documents
    .filter((d) => d.type === 'Bill' && d.status !== 'Paid' && d.status !== 'Void')
    .map((d) => ({
      name: `Bill ${d.number} · ${store.getParty(d.partyId)?.name || '—'}`,
      date: `Due ${fmtDate(d.dueDate)}`,
      amt: `$${d.total.toFixed(2)}`,
      isBank: false,
    }));

  // Bulk selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredReceipts.map((r) => r.id)));
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

  // Bulk actions
  const handleBulkAction = (act: string) => {
    if (act === 'close') {
      setSelectedIds(new Set());
      return;
    }
    const count = selectedIds.size;
    if (act === 'delete') {
      selectedIds.forEach((id) => store.deleteDocument(id));
      setSelectedIds(new Set());
      showToast(`Deleted ${count} receipt${count !== 1 ? 's' : ''}`);
      return;
    }
    if (act === 'create') {
      selectedIds.forEach((id) => store.changeDocumentStatus(id, 'Paid'));
      setActionLabels((prev) => {
        const next = { ...prev };
        selectedIds.forEach((id) => {
          next[id] = 'Expense created';
        });
        return next;
      });
      setSelectedIds(new Set());
      showToast(`Created expenses for ${count} receipt${count !== 1 ? 's' : ''}`);
      return;
    }
    showToast(`${act.charAt(0).toUpperCase() + act.slice(1)} on ${count} receipt${count !== 1 ? 's' : ''}`);
  };

  // Add processing row & simulate OCR extraction
  const processFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    files.forEach((file, idx) => {
      counterRef.current += 1;
      const curIdNum = counterRef.current;
      const newId = `R-${curIdNum}`;
      const fakeVendors = [
        'Staples',
        'FedEx',
        'Adobe',
        'Amazon Web Services',
        'Google Workspace',
        'UPS',
      ];
      const vendorGuess = fakeVendors[curIdNum % fakeVendors.length];
      const baseAmt = 35 + (curIdNum * 19) % 150;
      const dateGuess = fmtDate(todayISO());

      const tempRow: ReceiptItem = {
        id: newId,
        no: newId,
        vendor: 'Extracting…',
        amount: '…',
        tax: '…',
        date: dateGuess,
        account: file.name,
        category: '',
        status: 'review',
        isProcessing: true,
      };

      setProcessingRows((prev) => [tempRow, ...prev]);

      setTimeout(() => {
        setProcessingRows((prev) => prev.filter((r) => r.id !== newId));

        // Persist the extracted receipt as a SalesReceipt (for review)
        const partyId = findOrCreateParty(vendorGuess);
        const srCount = usePlatformStore
          .getState()
          .documents.filter((d) => d.type === 'SalesReceipt').length;
        const taxAmt = Math.round(baseAmt * 0.06 * 100) / 100;
        const subtotalAmt = Math.round((baseAmt - taxAmt) * 100) / 100;
        const newDocId = store.addDocument({
          type: 'SalesReceipt',
          number: `SR-${srCount + 1001}`,
          partyId,
          status: 'Draft',
          date: todayISO(),
          dueDate: '',
          lines: [
            {
              id: 'L1',
              itemId: null,
              description: `Receipt — ${vendorGuess}`,
              qty: 1,
              rate: subtotalAmt,
              amount: subtotalAmt,
              taxRate: 0,
              account: curIdNum % 2 === 0 ? 'Office supplies' : 'Software',
              tags: [],
            },
          ],
          subtotal: subtotalAmt,
          tax: taxAmt,
          shipping: 0,
          total: baseAmt,
          amountPaid: 0,
          balance: baseAmt,
          memo: `Uploaded file: ${file.name}`,
          notes: `Uploaded file: ${file.name}`,
          tags: [],
          attachments: [file.name],
          orderId: null,
          poId: null,
          channelId: 'Visa •4421',
          createdBy: 'Current user',
        });

        showToast(`${vendorGuess} receipt extracted from ${file.name}`);
        const doc = store.getDocument(newDocId);
        if (doc) handleOpenReceipt(toReceiptItem(doc));
      }, 1100 + idx * 300);
    });
  };

  // Category picker selection
  const handlePickCategory = (cat: string) => {
    if (catPickerTargetId) {
      const doc = store.getDocument(catPickerTargetId);
      if (doc) {
        const lines: DocumentLine[] = doc.lines.length
          ? doc.lines.map((l, i) => (i === 0 ? { ...l, account: cat } : l))
          : [
              {
                id: 'L1',
                itemId: null,
                description: 'Receipt',
                qty: 1,
                rate: doc.subtotal,
                amount: doc.subtotal,
                taxRate: 0,
                account: cat,
                tags: [],
              },
            ];
        store.updateDocument(catPickerTargetId, { lines });
      }
      showToast(`Category updated to "${cat}"`);
    }
    setCatPickerOpen(false);
  };

  // Match menu selection
  const handleSelectMatch = (matchName: string) => {
    const targetId = rowMenuTargetId || activeReceipt?.id;
    if (targetId && store.getDocument(targetId)) {
      // Matched into the bank — the receipt settles as Deposited
      store.changeDocumentStatus(targetId, 'Deposited');
      setActionLabels((prev) => ({ ...prev, [targetId]: 'Matched' }));
      showToast(`Receipt matched to "${matchName}"`);
    }
    setMatchMenuOpen(false);
    setRowMenuOpen(false);
    setIsDrawerOpen(false);
  };

  // Row menu actions
  const handleRowMenuAction = (action: string) => {
    const rec = receipts.find((r) => r.id === rowMenuTargetId);
    setRowMenuOpen(false);
    if (!rec) return;

    switch (action) {
      case 'view':
      case 'edit':
        setEditingId(rec.id);
        break;
      case 'download':
        showToast('Download original receipt PDF/JPG');
        break;
      case 'create-expense':
        store.changeDocumentStatus(rec.id, 'Paid');
        setActionLabels((prev) => ({ ...prev, [rec.id]: 'Expense created' }));
        showToast('Expense created from receipt');
        break;
      case 'create-bill':
        showToast('Bill created from receipt');
        break;
      case 'attach':
        showToast('Attach to existing — opens bill picker');
        break;
      case 'match':
        setMatchMenuOpen(true);
        break;
      case 'mark-reviewed':
        store.changeDocumentStatus(rec.id, 'Paid');
        setActionLabels((prev) => ({ ...prev, [rec.id]: 'Reviewed' }));
        showToast('Marked as reviewed');
        break;
      case 'unmark-reviewed':
        store.changeDocumentStatus(rec.id, 'Draft');
        setActionLabels((prev) => {
          const next = { ...prev };
          delete next[rec.id];
          return next;
        });
        showToast('Moved back to review');
        break;
      case 'delete':
        store.deleteDocument(rec.id);
        showToast('Receipt deleted');
        break;
    }
  };

  // Drawer create expense
  const handleDrawerCreateExpense = () => {
    if (activeReceipt) {
      const total = parseMoney(drawerForm.amount);
      const tax = parseMoney(drawerForm.tax);
      const subtotal = Math.max(0, total - tax);
      const partyId = findOrCreateParty(drawerForm.vendor || 'Unknown vendor');
      store.updateDocument(activeReceipt.id, {
        partyId,
        date: drawerForm.date || todayISO(),
        subtotal,
        tax,
        total,
        amountPaid: total,
        balance: 0,
        status: 'Paid',
        channelId: drawerForm.account,
        notes: drawerForm.notes,
        lines: [
          {
            id: 'L1',
            itemId: null,
            description: `Receipt — ${drawerForm.vendor}`,
            qty: 1,
            rate: subtotal,
            amount: subtotal,
            taxRate: 0,
            account: drawerForm.category,
            tags: [],
          },
        ],
      });
      setActionLabels((prev) => ({ ...prev, [activeReceipt.id]: 'Expense created' }));
      showToast('Expense created from receipt');
      setIsDrawerOpen(false);
    }
  };

  /* §1.5 — row open/edit renders the shared DocumentEngine page */
  if (editingId) {
    return (
      <DocumentEngine
        type="SalesReceipt"
        documentId={editingId}
        onToast={onToast || (() => undefined)}
        onClose={() => setEditingId(null)}
      />
    );
  }

  return (
    <div className={styles.container}>
      {/* ═══════════ CONTEXT HEADER ═══════════ */}
      <div className={styles.contextHeader}>
        <div className={styles.breadcrumbsGroup}>
          <span className={`material-symbols-outlined ${styles.breadcrumbDomainIcon}`}>
            account_balance
          </span>
          <span className={styles.breadcrumbDomain}>Finance</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbSection}>Accounting</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbActive}>Receipts</span>
        </div>
      </div>

      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Receipts</h1>
            <p className={styles.pageSubtitle}>
              Intake inbox — forward, drop, snap. Extracted fields auto-fill.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => uploadInputRef.current?.click()}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                upload
              </span>
              Upload
            </button>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => snapInputRef.current?.click()}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                photo_camera
              </span>
              Snap photo
            </button>
          </div>
        </div>

        {/* Forwarding address + drop zone */}
        <div className={styles.intakeGrid}>
          {/* Drop zone */}
          <div
            className={`${styles.dropZone} ${isDragover ? styles.dropZoneDragover : ''}`}
            onDragEnter={(e) => {
              e.preventDefault();
              setIsDragover(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragover(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragover(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragover(false);
              processFiles(e.dataTransfer.files);
            }}
            onClick={() => uploadInputRef.current?.click()}
          >
            <span className={`material-symbols-outlined ${styles.dropIcon}`}>
              cloud_upload
            </span>
            <div className={styles.dropTitle}>Drop receipts here</div>
            <div className={styles.dropSubtitle}>
              PDF, JPG, PNG · up to 20 MB each · multiple files supported
            </div>
            <div className={styles.dropBtns} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={styles.btnPrimaryGreen}
                onClick={() => uploadInputRef.current?.click()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  upload_file
                </span>
                Choose files
              </button>
              <button
                type="button"
                className={styles.btnSecondaryOutline}
                onClick={() => snapInputRef.current?.click()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  photo_camera
                </span>
                Snap
              </button>
            </div>
          </div>

          {/* Forward by email card */}
          <div className={styles.fwdCard}>
            <div className={styles.fwdHeader}>
              <span className={`material-symbols-outlined ${styles.fwdHeaderIcon}`}>
                mail
              </span>
              <span className={styles.fwdHeaderTitle}>Forward by email</span>
            </div>
            <p className={styles.fwdDesc}>
              Send receipts to this address — they&apos;ll appear here for review.
            </p>
            <div className={styles.fwdInputRow}>
              <input
                readOnly
                className={styles.fwdInput}
                value="receipts@unsaid.app"
              />
              <button
                type="button"
                className={styles.fwdCopyBtn}
                onClick={handleCopyForwarding}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  content_copy
                </span>
                Copy
              </button>
            </div>
            {copyConfirmed && (
              <div className={styles.fwdCopiedBadge}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  check_circle
                </span>
                Copied to clipboard
              </div>
            )}
          </div>
        </div>

        {/* Table card */}
        <div className={styles.tableCard}>
          {/* Tabs */}
          <div className={styles.tabsBar}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'review' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('review')}
            >
              For review
              <span className={styles.tabCountBadge}>{reviewCount}</span>
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'reviewed' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('reviewed')}
            >
              Reviewed
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All
            </button>
          </div>

          {/* Filter bar */}
          <div className={styles.filterBar}>
            <div className={styles.searchWrap}>
              <span className={`material-symbols-outlined ${styles.searchIcon}`}>
                search
              </span>
              <input
                className={styles.searchInput}
                placeholder="Filter by vendor, amount…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={styles.filterBtn}
              onClick={() => showToast('Date range filter')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                calendar_today
              </span>
              Date range
            </button>
            <button
              type="button"
              className={styles.filterBtn}
              onClick={() => showToast('Saved views panel')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                bookmark
              </span>
              Saved views
            </button>
            <span className={styles.countText}>
              1–{filteredReceipts.length} of {receipts.length}
            </span>
          </div>

          {/* Bulk bar */}
          {selectedIds.size > 0 && (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>{selectedIds.size} selected</span>
              <span className={styles.bulkSep} />
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => handleBulkAction('categorize')}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, marginRight: 4 }}
                >
                  category
                </span>
                Categorize
              </button>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => handleBulkAction('attach')}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, marginRight: 4 }}
                >
                  attach_file
                </span>
                Attach to bill
              </button>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => handleBulkAction('create')}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, marginRight: 4 }}
                >
                  receipt_long
                </span>
                Create expenses
              </button>
              <span className={styles.bulkSep} />
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => handleBulkAction('delete')}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14, marginRight: 4 }}
                >
                  delete
                </span>
                Delete
              </button>
              <button
                type="button"
                className={styles.bulkCloseBtn}
                onClick={() => handleBulkAction('close')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  close
                </span>
              </button>
            </div>
          )}

          {/* Table */}
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th} style={{ width: 36, paddingLeft: 12 }}>
                  <input
                    type="checkbox"
                    checked={
                      filteredReceipts.length > 0 &&
                      selectedIds.size === filteredReceipts.length
                    }
                    onChange={handleSelectAll}
                    style={{ accentColor: '#0077c5' }}
                  />
                </th>
                <th className={styles.th} style={{ width: 48 }}>
                  Receipt
                </th>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>Vendor</th>
                <th className={styles.th}>Payment account</th>
                <th className={styles.th} style={{ textAlign: 'right' }}>
                  Amount / Tax
                </th>
                <th className={styles.th}>Category</th>
                <th className={styles.th}>Action</th>
                <th className={styles.th} style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filteredReceipts.map((rec) => {
                const isSelected = selectedIds.has(rec.id);
                return (
                  <tr
                    key={rec.id}
                    className={`${styles.row} ${rec.isProcessing ? styles.processingRow : ''}`}
                    onClick={() => {
                      if (!rec.isProcessing) setEditingId(rec.id);
                    }}
                  >
                    <td
                      className={styles.td}
                      style={{ width: 36, paddingLeft: 12 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        disabled={rec.isProcessing}
                        checked={isSelected}
                        onChange={() => handleToggleRow(rec.id)}
                        style={{ accentColor: '#0077c5' }}
                      />
                    </td>
                    <td className={styles.td}>
                      <div className={styles.receiptThumb}>
                        {rec.isProcessing && <div className={styles.spinner} />}
                      </div>
                    </td>
                    <td className={styles.td}>{rec.date}</td>
                    <td
                      className={styles.td}
                      style={{
                        fontWeight: rec.isProcessing ? 400 : 500,
                        fontStyle: rec.isProcessing ? 'italic' : 'normal',
                        color: rec.isProcessing ? '#5a6355' : '#1a1c1e',
                      }}
                    >
                      {rec.vendor}
                    </td>
                    <td className={styles.td} style={{ color: '#5a6355' }}>
                      {rec.account}
                    </td>
                    <td
                      className={styles.td}
                      style={{
                        textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <div>{rec.amount}</div>
                      {!rec.isProcessing && (
                        <div style={{ fontSize: 10, color: '#5a6355' }}>
                          Tax {rec.tax}
                        </div>
                      )}
                    </td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      {rec.isProcessing ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#5a6355',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <div
                            className={styles.spinner}
                            style={{ width: 12, height: 12 }}
                          />
                          Processing
                        </span>
                      ) : rec.category ? (
                        <button
                          type="button"
                          className={`${styles.catChip} ${
                            rec.status === 'reviewed'
                              ? styles.catChipDone
                              : styles.catChipSuggested
                          }`}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setCatPickerPos({
                              top: rect.bottom + 4,
                              left: Math.min(rect.left, window.innerWidth - 300),
                            });
                            setCatPickerTargetId(rec.id);
                            setCatPickerOpen(true);
                            setRowMenuOpen(false);
                            setMatchMenuOpen(false);
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 12 }}
                          >
                            {rec.status === 'reviewed' ? 'check_circle' : 'auto_awesome'}
                          </span>
                          {rec.category}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`${styles.catChip} ${styles.catChipUncat}`}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setCatPickerPos({
                              top: rect.bottom + 4,
                              left: Math.min(rect.left, window.innerWidth - 300),
                            });
                            setCatPickerTargetId(rec.id);
                            setCatPickerOpen(true);
                            setRowMenuOpen(false);
                            setMatchMenuOpen(false);
                          }}
                        >
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 12 }}
                          >
                            error
                          </span>
                          Needs category
                        </button>
                      )}
                    </td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      {rec.isProcessing ? (
                        <span style={{ fontSize: 11, color: '#5a6355' }}>—</span>
                      ) : rec.status === 'review' ? (
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => handleOpenReceipt(rec)}
                        >
                          Review
                        </button>
                      ) : (
                        <span className={styles.reviewedBadge}>
                          <span
                            className="material-symbols-outlined"
                            style={{ fontSize: 14 }}
                          >
                            check
                          </span>
                          {rec.actionLabel || 'Reviewed'}
                        </span>
                      )}
                    </td>
                    <td
                      className={styles.td}
                      style={{ textAlign: 'right' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={rec.isProcessing}
                        className={styles.moreBtn}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setRowMenuPos({
                            top: rect.bottom + 4,
                            left: Math.min(rect.right - 250, window.innerWidth - 270),
                          });
                          setRowMenuTargetId(rec.id);
                          setRowMenuOpen(true);
                          setCatPickerOpen(false);
                          setMatchMenuOpen(false);
                        }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 16 }}
                        >
                          more_horiz
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* Hidden real file pickers */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          processFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={snapInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          processFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* ═══════════ RECEIPT PREVIEW DRAWER ═══════════ */}
      {isDrawerOpen && (
        <>
          <div className={styles.drawerScrim} onClick={handleCloseReceipt} />
          <aside className={styles.drawer}>
            {/* Drawer Header */}
            <div className={styles.drawerHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 20, color: '#0a6400' }}
                >
                  receipt_long
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className={styles.drawerHeaderTitle}>
                    Receipt — {activeReceipt?.vendor || 'Vendor'}
                  </div>
                  <div className={styles.drawerHeaderSub}>
                    {activeReceipt?.no || activeReceipt?.id} ·{' '}
                    {activeReceipt?.status === 'review' ? 'For review' : 'Reviewed'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  className={styles.drawerIconBtn}
                  title="Download original"
                  onClick={() => showToast('Download original receipt')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    download
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.drawerIconBtn}
                  onClick={handleCloseReceipt}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    close
                  </span>
                </button>
              </div>
            </div>

            {/* Drawer Split */}
            <div className={styles.drawerSplit}>
              {/* Left: Paper Receipt Viewer */}
              <div className={styles.drawerImage}>
                <div className={styles.drawerImageViewer}>
                  <div className={styles.fakeReceipt}>
                    <div className={styles.fakeReceiptStore}>
                      {(drawerForm.vendor || 'STORE').toUpperCase()}
                    </div>
                    <div className={styles.fakeReceiptSub}>Store #0412</div>
                    <div className={styles.receiptLineSep} />
                    <div className={styles.receiptRow}>
                      <span>Date</span>
                      <span>{drawerForm.date || '10/30/2026'}</span>
                    </div>
                    <div className={styles.receiptRow}>
                      <span>Time</span>
                      <span>2:42 PM</span>
                    </div>
                    <div className={styles.receiptDottedSep} />
                    <div className={styles.receiptRow}>
                      <span>Item 1</span>
                      <span>$18.44</span>
                    </div>
                    <div className={styles.receiptRow}>
                      <span>Item 2</span>
                      <span>$32.10</span>
                    </div>
                    <div className={styles.receiptRow}>
                      <span>Item 3</span>
                      <span>$44.90</span>
                    </div>
                    <div className={styles.receiptRow}>
                      <span>Item 4</span>
                      <span>$38.51</span>
                    </div>
                    <div className={styles.receiptDottedSep} />
                    <div className={styles.receiptRow}>
                      <span>Subtotal</span>
                      <span>
                        $
                        {Math.max(
                          0,
                          parseFloat(drawerForm.amount.replace('$', '') || '0') -
                            parseFloat(drawerForm.tax.replace('$', '') || '0')
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className={styles.receiptRow}>
                      <span>Tax</span>
                      <span>{drawerForm.tax || '$0.00'}</span>
                    </div>
                    <div className={styles.receiptTotalRow}>
                      <span>TOTAL</span>
                      <span>{drawerForm.amount || '$0.00'}</span>
                    </div>
                    <div className={styles.receiptDottedSep} />
                    <div className={styles.receiptFooter}>
                      VISA ****4421
                      <br />
                      Auth: 002847
                      <br />
                      Thank you!
                    </div>
                  </div>
                </div>

                {/* Bottom Image Toolbar */}
                <div className={styles.imageToolbar}>
                  <button
                    type="button"
                    className={styles.imageToolBtn}
                    onClick={() => showToast('Zoom in')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      zoom_in
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.imageToolBtn}
                    onClick={() => showToast('Zoom out')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      zoom_out
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.imageToolBtn}
                    onClick={() => showToast('Rotate receipt')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      rotate_right
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.imageToolBtn}
                    onClick={() => showToast('Open full image')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      open_in_new
                    </span>
                    Open
                  </button>
                </div>
              </div>

              {/* Right: Extracted Fields */}
              <div className={styles.drawerFields}>
                <div className={styles.drawerFieldsBody}>
                  <div className={styles.fieldsSectionTitle}>Extracted fields</div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Vendor</div>
                    <div className={styles.fieldValue}>
                      <input
                        className={styles.fieldInput}
                        value={drawerForm.vendor}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, vendor: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Date</div>
                    <div className={styles.fieldValue}>
                      <input
                        type="date"
                        className={styles.fieldInput}
                        value={drawerForm.date}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, date: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Amount</div>
                    <div className={styles.fieldValue}>
                      <input
                        className={styles.fieldInput}
                        value={drawerForm.amount}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, amount: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Tax</div>
                    <div className={styles.fieldValue}>
                      <input
                        className={styles.fieldInput}
                        value={drawerForm.tax}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, tax: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Payment account</div>
                    <div className={styles.fieldValue}>
                      <select
                        className={styles.fieldSelect}
                        value={drawerForm.account}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, account: e.target.value })
                        }
                      >
                        <option>Visa •4421</option>
                        <option>Bank •9910</option>
                        <option>Amex •2103</option>
                        <option>Cash</option>
                        <option>Personal funds — reimburse</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Category</div>
                    <div className={styles.fieldValue}>
                      <select
                        className={styles.fieldSelect}
                        value={drawerForm.category}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, category: e.target.value })
                        }
                      >
                        <option value="">— Select category —</option>
                        <option>Office supplies</option>
                        <option>Shipping</option>
                        <option>Software</option>
                        <option>Advertising</option>
                        <option>Meals &amp; entertainment</option>
                        <option>Travel</option>
                        <option>Ask My Accountant</option>
                      </select>
                    </div>
                  </div>
                  <div className={styles.fieldRow}>
                    <div className={styles.fieldLabel}>Notes</div>
                    <div className={styles.fieldValue}>
                      <input
                        className={styles.fieldInput}
                        placeholder="Add a note…"
                        value={drawerForm.notes}
                        onChange={(e) =>
                          setDrawerForm({ ...drawerForm, notes: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Drawer Footer Actions */}
                <div className={styles.drawerFooter}>
                  <button
                    type="button"
                    className={styles.btnSecondaryOutline}
                    onClick={handleCloseReceipt}
                  >
                    Cancel
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className={styles.btnSecondaryOutline}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMatchMenuPos({
                          top: rect.bottom + 4,
                          left: Math.min(rect.left, window.innerWidth - 360),
                        });
                        setMatchMenuOpen(true);
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 16 }}
                      >
                        link
                      </span>
                      Match to transaction
                    </button>
                    <div className={styles.btnSplitExpense}>
                      <button
                        type="button"
                        className={styles.btnSplitExpenseMain}
                        onClick={handleDrawerCreateExpense}
                      >
                        Create expense
                      </button>
                      <button
                        type="button"
                        className={styles.btnSplitExpenseArrow}
                        onClick={handleDrawerCreateExpense}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 16 }}
                        >
                          expand_more
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* ═══════════ CATEGORY PICKER POPUP ═══════════ */}
      {catPickerOpen && (
        <div
          className={styles.catPicker}
          style={{ top: catPickerPos.top, left: catPickerPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            className={styles.catPickerSearch}
            placeholder="Search categories…"
          />
          <div className={styles.pickerSection}>Suggested</div>
          <div
            className={styles.catPickerOpt}
            onClick={() => handlePickCategory('Office supplies')}
          >
            <span className={styles.catDot} style={{ backgroundColor: '#0077c5' }} />
            Office supplies
          </div>
          <div
            className={styles.catPickerOpt}
            onClick={() => handlePickCategory('Shipping')}
          >
            <span className={styles.catDot} style={{ backgroundColor: '#1e5a38' }} />
            Shipping
          </div>
          <div
            className={styles.catPickerOpt}
            onClick={() => handlePickCategory('Software')}
          >
            <span className={styles.catDot} style={{ backgroundColor: '#6b1e28' }} />
            Software
          </div>
          <div
            className={styles.catPickerOpt}
            onClick={() => handlePickCategory('Advertising')}
          >
            <span className={styles.catDot} style={{ backgroundColor: '#0e5e6f' }} />
            Advertising
          </div>
          <div className={styles.pickerSep} />
          <div className={styles.pickerSection}>All categories</div>
          <div
            className={styles.catPickerOpt}
            onClick={() => handlePickCategory('Meals & entertainment')}
          >
            <span className={styles.catDot} style={{ backgroundColor: '#dad9dd' }} />
            Meals &amp; entertainment
          </div>
          <div
            className={styles.catPickerOpt}
            onClick={() => handlePickCategory('Travel')}
          >
            <span className={styles.catDot} style={{ backgroundColor: '#dad9dd' }} />
            Travel
          </div>
          <div
            className={styles.catPickerOpt}
            onClick={() => handlePickCategory('Ask My Accountant')}
          >
            <span className={styles.catDot} style={{ backgroundColor: '#ba1a1a' }} />
            Ask My Accountant
          </div>
        </div>
      )}

      {/* ═══════════ ROW ⋯ MENU ═══════════ */}
      {rowMenuOpen && (
        <div
          className={styles.rowMenu}
          style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.menuHeader}>This receipt</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('view')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              open_in_new
            </span>
            View receipt
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('edit')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              edit
            </span>
            Edit extracted fields
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('download')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              download
            </span>
            Download original
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>Create from receipt</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('create-expense')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              credit_card
            </span>
            Create expense
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('create-bill')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              description
            </span>
            Create bill
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => handleRowMenuAction('attach')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              attach_file
            </span>
            Attach to existing…
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>Match</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              setRowMenuOpen(false);
              setMatchMenuPos({ top: rowMenuPos.top, left: rowMenuPos.left });
              setMatchMenuOpen(true);
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              link
            </span>
            Match to transaction…
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>State</div>
          {(() => {
            const currentRec = receipts.find((r) => r.id === rowMenuTargetId);
            return currentRec?.status === 'reviewed' ? (
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => handleRowMenuAction('unmark-reviewed')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  restart_alt
                </span>
                Move back to review
              </button>
            ) : (
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => handleRowMenuAction('mark-reviewed')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  check_circle
                </span>
                Mark as reviewed
              </button>
            );
          })()}
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => handleRowMenuAction('delete')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              delete
            </span>
            Delete receipt
          </button>
        </div>
      )}

      {/* ═══════════ MATCH MENU POPUP ═══════════ */}
      {matchMenuOpen && (
        <div
          className={styles.matchMenu}
          style={{ top: matchMenuPos.top, left: matchMenuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.matchHeader}>Unmatched bank transactions</div>
          {unmatchedTransactions.map((txn, idx) => (
            <div
              key={idx}
              className={styles.matchItem}
              onClick={() => handleSelectMatch(txn.name)}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: '#ba1a1a', marginTop: 2 }}
              >
                account_balance
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {txn.name}
                </div>
                <div className={styles.matchDate}>{txn.date}</div>
              </div>
              <span className={styles.matchAmt} style={{ color: '#ba1a1a' }}>
                {txn.amt}
              </span>
            </div>
          ))}

          <div className={styles.matchHeader}>Open bills</div>
          {openBills.map((bill, idx) => (
            <div
              key={idx}
              className={styles.matchItem}
              onClick={() => handleSelectMatch(bill.name)}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: '#6b1e28', marginTop: 2 }}
              >
                description
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {bill.name}
                </div>
                <div className={styles.matchDate}>{bill.date}</div>
              </div>
              <span className={styles.matchAmt} style={{ color: '#5a6355' }}>
                {bill.amt}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════ TOAST NOTIFICATION ═══════════ */}
      {toastMsg && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check_circle
          </span>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
