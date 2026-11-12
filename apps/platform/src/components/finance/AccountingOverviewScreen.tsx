'use client';

import React, { useState, useRef, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import styles from './AccountingOverviewScreen.module.css';

interface ChecklistItem {
  id: string;
  title: string;
  desc: string;
  done: boolean;
  targetScreen?: string;
  targetDomain?: DomainKey;
}

interface ReceiptItem {
  id: string;
  payee: string;
  category: string;
  date: string;
  amount: string;
  account: string;
  isNew: boolean;
}

interface BankTransactionItem {
  id: string;
  date: string;
  desc: string;
  amount: number;
  suggested: string;
  reviewed: boolean;
}

interface ActivityItem {
  id: string;
  icon: string;
  iconClass: string;
  title: string;
  meta: string;
}

const INITIAL_CHECKLIST: ChecklistItem[] = [
  {
    id: 'c1',
    title: 'Connect bank account',
    desc: 'Chase •9910 linked',
    done: true,
  },
  {
    id: 'c2',
    title: 'Chart of accounts',
    desc: '34 accounts mapped',
    done: true,
  },
  {
    id: 'c3',
    title: 'First reconciliation',
    desc: 'October closed',
    done: true,
  },
  {
    id: 'c4',
    title: 'Import receipts',
    desc: '12 awaiting review',
    done: false,
    targetScreen: 'receipts',
    targetDomain: 'finance',
  },
  {
    id: 'c5',
    title: 'Set up bank rules',
    desc: 'Auto-categorize repeating transactions',
    done: false,
    targetScreen: 'rules',
    targetDomain: 'finance',
  },
  {
    id: 'c6',
    title: 'Sales tax',
    desc: 'Configure tax rates',
    done: false,
    targetScreen: 'tax-summary',
    targetDomain: 'finance',
  },
];

const INITIAL_RECEIPTS: ReceiptItem[] = [
  {
    id: 'r1',
    payee: 'Staples',
    category: 'Office supplies',
    date: '10/30/2026',
    amount: '$142.50',
    account: 'Visa •4421',
    isNew: true,
  },
  {
    id: 'r2',
    payee: 'FedEx',
    category: 'Shipping',
    date: '10/29/2026',
    amount: '$84.20',
    account: 'Bank •9910',
    isNew: true,
  },
  {
    id: 'r3',
    payee: 'Adobe',
    category: 'Software',
    date: '10/30/2026',
    amount: '$59.99',
    account: 'Visa •4421',
    isNew: true,
  },
];

const INITIAL_BANK_TRANSACTIONS: BankTransactionItem[] = [
  {
    id: 'bt1',
    date: '10/30',
    desc: 'STAPLES #0412',
    amount: -142.5,
    suggested: 'Office supplies',
    reviewed: false,
  },
  {
    id: 'bt2',
    date: '10/29',
    desc: 'FEDEX 001239847',
    amount: -84.2,
    suggested: 'Shipping',
    reviewed: false,
  },
  {
    id: 'bt3',
    date: '10/28',
    desc: 'STRIPE PAYOUT',
    amount: 1842.6,
    suggested: 'Stripe clearing',
    reviewed: false,
  },
  {
    id: 'bt4',
    date: '10/27',
    desc: 'AWS EMEA CHARGES',
    amount: -124.88,
    suggested: 'Software',
    reviewed: false,
  },
  {
    id: 'bt5',
    date: '10/27',
    desc: 'ACME CORP — ACH',
    amount: 1240.0,
    suggested: 'Invoice 1002',
    reviewed: false,
  },
];

const INITIAL_ACTIVITIES: ActivityItem[] = [
  {
    id: 'a1',
    icon: 'check_circle',
    iconClass: styles.activityIconSecondary,
    title: 'October reconciled',
    meta: 'Sarah A. · 2 hours ago',
  },
  {
    id: 'a2',
    icon: 'receipt_long',
    iconClass: styles.activityIconQbBlue,
    title: 'Invoice 1002 sent to Acme Corp',
    meta: 'Marcus L. · Yesterday',
  },
  {
    id: 'a3',
    icon: 'credit_card',
    iconClass: styles.activityIconQbMaroon,
    title: 'Staples expense created',
    meta: 'Auto · 10/30',
  },
  {
    id: 'a4',
    icon: 'tune',
    iconClass: styles.activityIconTertiary,
    title: 'Rule added: Stripe payouts',
    meta: 'Priya N. · 10/28',
  },
  {
    id: 'a5',
    icon: 'person_add',
    iconClass: styles.activityIconMuted,
    title: 'New vendor: Printful',
    meta: 'Auto · 10/26',
  },
];

export interface AccountingOverviewScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek?: (title: string, details: Record<string, string | number>) => void;
  onToast?: (message: string) => void;
}

export default function AccountingOverviewScreen({
  onNavigate,
  onCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
}: AccountingOverviewScreenProps) {
  // Time period
  const [selectedPeriod, setSelectedPeriod] = useState('This month');
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false);

  // Dynamic state
  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST);
  const [receipts, setReceipts] = useState<ReceiptItem[]>(INITIAL_RECEIPTS);
  const [bankTxns, setBankTxns] = useState<BankTransactionItem[]>(INITIAL_BANK_TRANSACTIONS);

  // Modals
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [selectedReviewTxn, setSelectedReviewTxn] = useState<BankTransactionItem | null>(null);

  // File input ref for receipt upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast
  const [localToast, setLocalToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (onToast) onToast(msg);
    setLocalToast(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setLocalToast(null);
    }, 2200);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // Close period menu on outside click
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`.${styles.headerActions}`)) {
        setIsPeriodMenuOpen(false);
      }
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  // Checklist calculations
  const completedCount = checklist.filter((i) => i.done).length;
  const totalCount = checklist.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  // Toggle checklist item
  const handleToggleChecklist = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
    );
  };

  // Copy forwarding mail
  const handleCopyEmail = () => {
    const email = 'receipts@unsaid.app';
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(email);
    }
    showToast('Forwarding address copied to clipboard');
  };

  // Upload receipt
  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileUploaded = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const newReceipt: ReceiptItem = {
        id: `r-${Date.now()}`,
        payee: file.name.split('.')[0].replace(/[-_]/g, ' ') || 'New Receipt',
        category: 'Uncategorized',
        date: '11/04/2026',
        amount: `$${(Math.random() * 200 + 15).toFixed(2)}`,
        account: 'Pending review',
        isNew: true,
      };
      setReceipts((prev) => [newReceipt, ...prev]);
      showToast(`Uploaded receipt: ${file.name}`);
      e.target.value = '';
    }
  };

  // Review bank transaction
  const handleAcceptReview = (txn: BankTransactionItem) => {
    setBankTxns((prev) =>
      prev.map((t) => (t.id === txn.id ? { ...t, reviewed: true } : t))
    );
    setSelectedReviewTxn(null);
    showToast(`Matched ${txn.desc} to ${txn.suggested}`);
  };

  return (
    <div className={styles.container}>
      {/* Hidden file input for receipts */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        style={{ display: 'none' }}
        onChange={handleFileUploaded}
      />

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
          <span className={styles.breadcrumbActive}>Overview</span>
        </div>
      </div>

      <main className={styles.main}>
        {/* ═══════════ PAGE HEADER ═══════════ */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Accounting — Overview</h1>
            <p className={styles.pageSubtitle}>
              Bank feed, receipts, reconcile, books. Unsaid · Nov 2026
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={(e) => {
                e.stopPropagation();
                setIsPeriodMenuOpen((prev) => !prev);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                calendar_today
              </span>
              {selectedPeriod} ▾
            </button>

            {isPeriodMenuOpen && (
              <div className={styles.dropdownPopover}>
                {['This month', 'Last month', 'This quarter', 'Year to date'].map((period) => (
                  <button
                    key={period}
                    type="button"
                    className={`${styles.dropdownItem} ${
                      selectedPeriod === period ? styles.dropdownItemActive : ''
                    }`}
                    onClick={() => {
                      setSelectedPeriod(period);
                      setIsPeriodMenuOpen(false);
                      showToast(`Filter set to ${period}`);
                    }}
                  >
                    <span>{period}</span>
                    {selectedPeriod === period && (
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                        check
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => {
                const cols = [
                  { key: 'date', label: 'Date' },
                  { key: 'desc', label: 'Description' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'suggested', label: 'Suggested match' },
                  { key: 'reviewed', label: 'Reviewed' },
                ];
                exportToCsv(bankTxns as unknown as Record<string, unknown>[], cols, 'accounting-overview');
                showToast(`Exported ${bankTxns.length} records to CSV`);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                download
              </span>
              Export
            </button>
          </div>
        </div>

        {/* ═══════════ KPI STRIP ═══════════ */}
        <div className={styles.kpiStrip}>
          {/* Card 1 */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'bank')}
          >
            <span className={styles.kpiLabel}>For review</span>
            <div className={styles.kpiValue}>47</div>
            <div className={styles.kpiDeltaTertiary}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                schedule
              </span>
              Oldest 6 days ago
            </div>
          </div>

          {/* Card 2 */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'bank')}
          >
            <span className={styles.kpiLabel}>Uncategorized</span>
            <div className={styles.kpiValue}>$2,418.90</div>
            <div className={styles.kpiDeltaMuted}>12 transactions</div>
          </div>

          {/* Card 3 */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'bank')}
          >
            <span className={styles.kpiLabel}>Bank balance</span>
            <div className={styles.kpiValue}>$84,210.40</div>
            <div className={styles.kpiDeltaSecondary}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                sync
              </span>
              2m ago · Chase •9910
            </div>
          </div>

          {/* Card 4 */}
          <div
            className={styles.kpiCard}
            style={{ cursor: 'pointer' }}
            onClick={() => onNavigate('finance', 'reconcile')}
          >
            <span className={styles.kpiLabel}>Reconciled</span>
            <div className={styles.kpiValue}>Oct 31</div>
            <div className={styles.kpiDeltaSecondary}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                check_circle
              </span>
              Period closed
            </div>
          </div>
        </div>

        {/* ═══════════ CREATE ACTIONS ROW ═══════════ */}
        <div className={styles.createActionsRow}>
          <span className={styles.createActionsLabel}>Create actions:</span>
          <button
            type="button"
            className={styles.createActionBtn}
            onClick={() => onCreate('Expense')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              credit_card
            </span>
            Expense
          </button>
          <button
            type="button"
            className={styles.createActionBtn}
            onClick={() => onCreate('Bank deposit')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              account_balance_wallet
            </span>
            Bank deposit
          </button>
          <button
            type="button"
            className={styles.createActionBtn}
            onClick={() => onCreate('Transfer')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              swap_horiz
            </span>
            Transfer
          </button>
          <button
            type="button"
            className={styles.createActionBtn}
            onClick={() => onCreate('Journal entry')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              menu_book
            </span>
            Journal entry
          </button>
          <button
            type="button"
            className={styles.createActionBtn}
            onClick={() => onNavigate('finance', 'reconcile')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              fact_check
            </span>
            Reconcile
          </button>
          <button
            type="button"
            className={styles.showAllBtn}
            onClick={onOpenCreateFlyout}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              apps
            </span>
            Show all
          </button>
        </div>

        {/* ═══════════ TWO-COLUMN SECTION 1 ═══════════ */}
        <div className={styles.twoColGrid}>
          {/* Setup checklist */}
          <div className={styles.checklistCard}>
            <div className={styles.cardHeaderRow}>
              <div>
                <h2 className={styles.cardTitle}>Set up your books</h2>
                <p className={styles.cardSubtitle}>
                  {completedCount} of {totalCount} complete
                </p>
              </div>
              <span className={styles.percentagePill}>{progressPercent}%</span>
            </div>

            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div>
              {checklist.map((item) => (
                <div key={item.id} className={styles.checkRow}>
                  <button
                    type="button"
                    className={item.done ? styles.checkBadgeDone : styles.checkBadgeTodo}
                    style={{ border: 'none', cursor: 'pointer' }}
                    onClick={() => handleToggleChecklist(item.id)}
                    title={item.done ? 'Mark as incomplete' : 'Mark as complete'}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      {item.done ? 'check' : 'chevron_right'}
                    </span>
                  </button>

                  <div className={styles.checkContent}>
                    <div className={styles.checkTitle}>{item.title}</div>
                    <div className={styles.checkDesc}>{item.desc}</div>
                  </div>

                  {!item.done && item.targetScreen && (
                    <button
                      type="button"
                      className={styles.checkActionBtn}
                      onClick={() => {
                        onNavigate(item.targetDomain || 'finance', item.targetScreen || 'overview');
                      }}
                    >
                      Open
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Receipts inbox preview */}
          <div className={styles.inboxCard}>
            <div className={styles.inboxHeader}>
              <div>
                <h2 className={styles.cardTitle}>Receipts inbox</h2>
                <p className={styles.cardSubtitle}>{receipts.length} for review</p>
              </div>
              <button
                type="button"
                className={styles.viewAllLink}
                onClick={() => onNavigate('finance', 'receipts')}
              >
                View all
              </button>
            </div>

            <div className={styles.inboxActionsBar}>
              <div className={styles.emailChip}>
                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                  mail
                </span>
                <span>receipts@unsaid.app</span>
                <button
                  type="button"
                  className={styles.copyEmailBtn}
                  onClick={handleCopyEmail}
                >
                  Copy
                </button>
              </div>
              <button
                type="button"
                className={styles.uploadReceiptBtn}
                onClick={handleTriggerUpload}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  upload
                </span>
                Upload
              </button>
            </div>

            <div className={styles.inboxList}>
              {receipts.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={styles.inboxRow}
                  onClick={() => {
                    if (onOpenPeek) {
                      onOpenPeek(`Receipt — ${r.payee}`, {
                        Payee: r.payee,
                        Category: r.category,
                        Date: r.date,
                        Amount: r.amount,
                        Account: r.account,
                        Status: r.isNew ? 'New' : 'Reviewed',
                      });
                    } else {
                      showToast(`Reviewing receipt: ${r.payee} (${r.amount})`);
                    }
                  }}
                >
                  <div className={styles.receiptThumb}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      receipt_long
                    </span>
                  </div>
                  <div className={styles.inboxRowContent}>
                    <div className={styles.inboxRowTitle}>
                      {r.payee} · {r.category}
                    </div>
                    <div className={styles.inboxRowMeta}>
                      {r.date} · {r.amount} · {r.account}
                    </div>
                  </div>
                  {r.isNew && <span className={styles.newBadge}>New</span>}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ═══════════ TWO-COLUMN SECTION 2 ═══════════ */}
        <div className={styles.bankActivityGrid}>
          {/* For review feed (Bank transactions) */}
          <div className={styles.bankCard}>
            <div className={styles.inboxHeader}>
              <div>
                <h2 className={styles.cardTitle}>For review</h2>
                <p className={styles.cardSubtitle}>
                  {bankTxns.filter((t) => !t.reviewed).length} bank transactions
                </p>
              </div>
              <button
                type="button"
                className={styles.viewAllLink}
                onClick={() => onNavigate('finance', 'bank')}
              >
                Open bank feed
              </button>
            </div>

            <table className={styles.bankTable}>
              <thead className={styles.bankThead}>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th>Suggested</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {bankTxns.map((txn) => {
                  const isDebit = txn.amount < 0;
                  const formattedAmount = `${isDebit ? '−' : '+'}$${Math.abs(txn.amount).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}`;

                  return (
                    <tr key={txn.id} className={styles.bankRow}>
                      <td className={styles.bankCell} style={{ width: 64 }}>
                        {txn.date}
                      </td>
                      <td
                        className={styles.bankCell}
                        style={{
                          fontWeight: 500,
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {txn.desc}
                      </td>
                      <td
                        className={`${styles.bankCell} ${
                          isDebit ? styles.amountDebit : styles.amountCredit
                        }`}
                      >
                        {formattedAmount}
                      </td>
                      <td className={styles.bankCell}>
                        <span className={styles.suggestedTag}>{txn.suggested}</span>
                      </td>
                      <td className={styles.bankCell} style={{ textAlign: 'right' }}>
                        {txn.reviewed ? (
                          <span
                            style={{
                              fontSize: 11,
                              color: '#006c47',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2,
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                              check
                            </span>
                            Matched
                          </span>
                        ) : (
                          <button
                            type="button"
                            className={styles.reviewBtn}
                            onClick={() => setSelectedReviewTxn(txn)}
                          >
                            Review
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Recent activity */}
          <div className={styles.activityCard}>
            <h2 className={styles.cardTitle} style={{ marginBottom: 16 }}>
              Recent activity
            </h2>
            <div className={styles.activityList}>
              {INITIAL_ACTIVITIES.map((act) => (
                <div key={act.id} className={styles.activityItem}>
                  <span
                    className={`material-symbols-outlined ${styles.activityIcon} ${act.iconClass}`}
                  >
                    {act.icon}
                  </span>
                  <div className={styles.activityContent}>
                    <div className={styles.activityTitle}>{act.title}</div>
                    <div className={styles.activityTime}>{act.meta}</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className={styles.auditLogBtn}
              onClick={() => setIsAuditModalOpen(true)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                history
              </span>
              Audit log
            </button>
          </div>
        </div>
      </main>

      {/* ═══════════ MODALS ═══════════ */}

      {/* Bank Transaction Review Modal */}
      {selectedReviewTxn && (
        <div className={styles.modalBackdrop} onClick={() => setSelectedReviewTxn(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Review Transaction</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setSelectedReviewTxn(null)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  close
                </span>
              </button>
            </div>

            <div className={styles.modalBody}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: 6,
                  backgroundColor: '#f4f3f7',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedReviewTxn.desc}</div>
                  <div style={{ fontSize: 12, color: '#5a6355' }}>Date: {selectedReviewTxn.date}/2026</div>
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: selectedReviewTxn.amount < 0 ? '#ba1a1a' : '#006c47',
                  }}
                >
                  {selectedReviewTxn.amount < 0 ? '−' : '+'}$
                  {Math.abs(selectedReviewTxn.amount).toFixed(2)}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5a6355', marginBottom: 4 }}>
                  Suggested Match / Category
                </label>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0a6400' }}>
                  {selectedReviewTxn.suggested} (98% confidence score)
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5a6355', marginBottom: 4 }}>
                  Rule or Match Logic
                </label>
                <div style={{ fontSize: 12, color: '#5a6355' }}>
                  Auto-categorized based on payee keyword rule &amp; previous reconciliation history.
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  setSelectedReviewTxn(null);
                  showToast('Opened advanced editor in Bank feed');
                  onNavigate('finance', 'bank');
                }}
              >
                Edit details
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => handleAcceptReview(selectedReviewTxn)}
              >
                Accept &amp; Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {isAuditModalOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsAuditModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Accounting Audit Log</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIsAuditModalOpen(false)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  close
                </span>
              </button>
            </div>

            <div className={styles.modalBody}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
                <div style={{ paddingBottom: 8, borderBottom: '1px solid #eeedf1' }}>
                  <div style={{ fontWeight: 600, color: '#1a1c1e' }}>Period closed: October 2026</div>
                  <div style={{ color: '#5a6355' }}>By Sarah A. (CFO) · 11/04/2026 08:14 AM UTC · Hash #4f82a1b</div>
                </div>
                <div style={{ paddingBottom: 8, borderBottom: '1px solid #eeedf1' }}>
                  <div style={{ fontWeight: 600, color: '#1a1c1e' }}>Invoice #1002 status changed to Sent</div>
                  <div style={{ color: '#5a6355' }}>By Marcus L. · 11/03/2026 04:30 PM UTC · $1,240.00 to Acme Corp</div>
                </div>
                <div style={{ paddingBottom: 8, borderBottom: '1px solid #eeedf1' }}>
                  <div style={{ fontWeight: 600, color: '#1a1c1e' }}>Automated OCR intake: Staples Receipt</div>
                  <div style={{ color: '#5a6355' }}>System Bot · 10/30/2026 11:15 AM UTC · $142.50 to Office supplies</div>
                </div>
                <div style={{ paddingBottom: 8, borderBottom: '1px solid #eeedf1' }}>
                  <div style={{ fontWeight: 600, color: '#1a1c1e' }}>Rule created: Stripe Payouts to Clearing Account</div>
                  <div style={{ color: '#5a6355' }}>By Priya N. · 10/28/2026 02:40 PM UTC · Rule ID #rul_9801</div>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setIsAuditModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local Toast */}
      {localToast && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check_circle
          </span>
          {localToast}
        </div>
      )}
    </div>
  );
}
