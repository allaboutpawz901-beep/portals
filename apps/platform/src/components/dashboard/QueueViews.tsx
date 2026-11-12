'use client';

import { useState } from 'react';
import {
  AttentionQueueItem,
  CustomerQueueItem,
  SellerQueueItem,
} from '@/data/dashboardData';
import { DemoRow, DomainKey } from '@/data/shellData';
import StatusPill from '@/components/StatusPill';
import { exportToCsv } from '@/lib/csvExport';
import {
  CustomColumnItem,
  ListCustomizeDrawer,
  VisualFormatConfig,
  formatVisualNumber,
} from './DashboardModals';
import styles from './DashboardScreens.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. ATTENTION QUEUE (/notifications — Attention)
 * ═══════════════════════════════════════════════════════════════════════════ */
const ATTENTION_COLUMNS: CustomColumnItem[] = [
  { key: 'code', label: 'Ref', visible: true },
  { key: 'title', label: 'Exception / Action Required', visible: true },
  { key: 'category', label: 'Domain', visible: true },
  { key: 'entity', label: 'Counterparty / SKU', visible: true },
  { key: 'owner', label: 'Owner', visible: true },
  { key: 'impactAmount', label: 'Exposure', visible: true, right: true },
  { key: 'slaRemaining', label: 'SLA Timer', visible: true },
  { key: 'status', label: 'Status', visible: true },
  { key: 'createdOn', label: 'Created on', visible: false },
  { key: 'modifiedBy', label: 'Modified by', visible: false },
];

export function AttentionQueueView({
  items,
  onUpdateItems,
  onOpenNewTaskModal,
  onNavigate,
  onCreate,
  onOpenPeek,
  onToast,
}: {
  items: AttentionQueueItem[];
  onUpdateItems: (next: AttentionQueueItem[]) => void;
  onOpenNewTaskModal: () => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreate: (label: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState<string>('');
  const [ownerFilter, setOwnerFilter] = useState<string>('All owners');
  const [sortKey, setSortKey] = useState<keyof AttentionQueueItem>('impactAmount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState<boolean>(false);
  const [customizeOpen, setCustomizeOpen] = useState<boolean>(false);

  const [columns, setColumns] = useState<CustomColumnItem[]>(ATTENTION_COLUMNS);
  const [visualCfg, setVisualCfg] = useState<VisualFormatConfig>({
    currencySymbol: true,
    parenthesesNegatives: true,
    decimals: 0,
    divideBy1000: false,
  });

  const openItems = items.filter((i) => i.status !== 'Resolved');
  const criticalCount = openItems.filter(
    (i) => i.status === 'Critical' || i.status === 'SLA breach'
  ).length;
  const totalExposure = openItems.reduce((s, i) => s + i.impactAmount, 0);
  const financeCount = openItems.filter(
    (i) => i.category === 'Finance & Bills'
  ).length;
  const resolvedCount = items.filter((i) => i.status === 'Resolved').length;

  const filtered = items
    .filter((i) => {
      if (activeTab === 'Resolved') return i.status === 'Resolved';
      if (i.status === 'Resolved' && activeTab !== 'All') return false;
      if (activeTab === 'Critical') {
        return i.status === 'Critical' || i.status === 'SLA breach';
      }
      if (
        activeTab === 'Orders & SLA' ||
        activeTab === 'Finance & Bills' ||
        activeTab === 'Catalog & Preflight' ||
        activeTab === 'Support & RMA'
      ) {
        return i.category === activeTab;
      }
      return i.status !== 'Resolved';
    })
    .filter((i) =>
      ownerFilter === 'All owners' ? true : i.owner === ownerFilter
    )
    .filter((i) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        i.code.toLowerCase().includes(q) ||
        i.title.toLowerCase().includes(q) ||
        i.entity.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

  const visibleCols = columns.filter((c) => c.visible);

  const handleSort = (key: string) => {
    const k = key as keyof AttentionQueueItem;
    if (sortKey === k) {
      setSortDir((p) => (p === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  const updateStatusForIds = (
    ids: string[],
    status: AttentionQueueItem['status'],
    ownerOverride?: string
  ) => {
    onUpdateItems(
      items.map((it) =>
        ids.includes(it.id)
          ? {
              ...it,
              status,
              owner: ownerOverride || it.owner,
              slaRemaining: status === 'Resolved' ? 'Completed' : it.slaRemaining,
            }
          : it
      )
    );
    setSelectedIds([]);
    setOpenRowMenuId(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.breadcrumb}>
          <span>Dashboard</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Queues</span>
        </div>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Attention Queue</h1>
            <p className={styles.subtitle}>
              Unified operational triage across fulfillment SLAs, Konva Studio preflight, overdue AR, bills &amp; RMAs
            </p>
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.splitWrap}>
              <button
                type="button"
                className={styles.splitMain}
                onClick={onOpenNewTaskModal}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>
                  add
                </span>
                New task
              </button>
              <button
                type="button"
                className={styles.splitArrow}
                onClick={() => setSplitOpen((p) => !p)}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>
                  expand_more
                </span>
              </button>
              {splitOpen && (
                <div className={styles.dropdownMenu}>
                  <div className={styles.dropdownHeader}>Queue creates</div>
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      setSplitOpen(false);
                      onOpenNewTaskModal();
                    }}
                  >
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      task
                    </span>
                    Operational task
                  </button>
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      setSplitOpen(false);
                      onCreate('Ticket');
                    }}
                  >
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      confirmation_number
                    </span>
                    Support ticket
                  </button>
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      setSplitOpen(false);
                      onCreate('Return/RMA');
                    }}
                  >
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      assignment_return
                    </span>
                    Return / RMA
                  </button>
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      setSplitOpen(false);
                      onCreate('Bill');
                    }}
                  >
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      description
                    </span>
                    Vendor bill
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                const cols = columns
                  .filter((c) => c.visible)
                  .map((c) => ({ key: c.key, label: c.label }));
                exportToCsv(filtered as unknown as Record<string, unknown>[], cols, 'attention-queue');
                onToast(`Exported ${filtered.length} records to CSV`);
              }}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                download
              </span>
              Export
            </button>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setCustomizeOpen(true)}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                tune
              </span>
              Customize
            </button>
          </div>
        </div>
      </div>

      {/* 5 Queue KPI Summary Tiles */}
      <div className={styles.kpiGrid5}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Open Attention Items</span>
          <div className={styles.kpiValue}>{openItems.length}</div>
          <div className={styles.kpiDeltaNeutral}>Across 4 platform domains</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Critical / SLA Breached</span>
          <div className={styles.kpiValue}>{criticalCount}</div>
          <div className={styles.kpiDeltaNeg}>Immediate triage required</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>GMV &amp; AP Exposure</span>
          <div className={styles.kpiValue}>
            {formatVisualNumber(totalExposure, visualCfg)}
          </div>
          <div className={styles.kpiDeltaWarn}>Value held on open items</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Finance &amp; Bills Review</span>
          <div className={styles.kpiValue}>{financeCount}</div>
          <div className={styles.kpiDeltaNeutral}>AR holds, OCR bills &amp; Stripe</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Resolved This Session</span>
          <div className={styles.kpiValue}>{resolvedCount}</div>
          <div className={styles.kpiDeltaPos}>Median triage 18m</div>
        </div>
      </div>

      {/* P1 List-System Table */}
      <div className={styles.tableCard}>
        <div className={styles.viewTabsBar}>
          {[
            'All',
            'Critical',
            'Orders & SLA',
            'Finance & Bills',
            'Catalog & Preflight',
            'Support & RMA',
            'Resolved',
          ].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.viewTab} ${
                activeTab === tab ? styles.viewTabActive : ''
              }`}
              onClick={() => {
                setActiveTab(tab);
                setSelectedIds([]);
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className={styles.filterToolbar}>
          <div className={styles.searchWrap}>
            <span className={`material-symbols-outlined ${styles.icon15Search}`}>
              search
            </span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Filter ref, summary, counterparty…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className={styles.selectControl}
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="All owners">Owner: All</option>
            <option value="SA">Owner: SA (You)</option>
            <option value="M. Lin">Owner: M. Lin</option>
            <option value="K. Patel">Owner: K. Patel</option>
            <option value="R. Gomez">Owner: R. Gomez</option>
          </select>

          <span className={styles.paginationLabel}>
            {filtered.length > 0
              ? `1–${filtered.length} of ${filtered.length}`
              : '0 of 0'}
          </span>
        </div>

        {selectedIds.length > 0 && (
          <div className={styles.bulkBar}>
            <div className={styles.bulkLeft}>
              <span>{selectedIds.length} selected</span>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => setSelectedIds([])}
              >
                Clear
              </button>
            </div>
            <div className={styles.bulkActions}>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => {
                  updateStatusForIds(selectedIds, 'Resolved');
                  onToast(`Resolved ${selectedIds.length} attention items`);
                }}
              >
                Resolve selected
              </button>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => {
                  updateStatusForIds(selectedIds, 'For review', 'SA');
                  onToast(`Assigned ${selectedIds.length} items to SA`);
                }}
              >
                Assign to me (SA)
              </button>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => {
                  updateStatusForIds(selectedIds, 'Snoozed');
                  onToast(`Snoozed ${selectedIds.length} items for 4 hours`);
                }}
              >
                Snooze 4h
              </button>
            </div>
          </div>
        )}

        {filtered.length > 0 ? (
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead className={styles.thead}>
                <tr>
                  <th className={`${styles.th} ${styles.thCheck}`}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={
                        filtered.length > 0 &&
                        selectedIds.length === filtered.length
                      }
                      onChange={() =>
                        setSelectedIds(
                          selectedIds.length === filtered.length
                            ? []
                            : filtered.map((r) => r.id)
                        )
                      }
                    />
                  </th>
                  {visibleCols.map((col, idx) => (
                    <th
                      key={col.key}
                      className={`${styles.th} ${styles.thSortable} ${
                        idx === 0 ? styles.thSticky : ''
                      } ${col.right ? styles.thRight : ''}`}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}{' '}
                      {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                  <th className={styles.th} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={styles.tr}
                    onClick={() =>
                      onOpenPeek(
                        {
                          code: row.code,
                          title: row.title,
                          domain: row.category,
                          counterparty: row.entity,
                          owner: row.owner,
                          exposure: formatVisualNumber(
                            row.impactAmount,
                            visualCfg
                          ),
                          slaTimer: row.slaRemaining,
                          details: row.summary,
                          status: row.status,
                        },
                        'attention'
                      )
                    }
                  >
                    <td
                      className={styles.tdCheck}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedIds.includes(row.id)}
                        onChange={() =>
                          setSelectedIds((prev) =>
                            prev.includes(row.id)
                              ? prev.filter((x) => x !== row.id)
                              : [...prev, row.id]
                          )
                        }
                      />
                    </td>
                    {visibleCols.map((col, idx) => (
                      <td
                        key={col.key}
                        className={`${styles.td} ${
                          idx === 0 ? styles.tdSticky : ''
                        } ${col.right ? styles.tdRight : ''}`}
                      >
                        {col.key === 'status' ? (
                          <StatusPill status={row.status} />
                        ) : col.key === 'impactAmount' ? (
                          formatVisualNumber(row.impactAmount, visualCfg)
                        ) : col.key === 'title' ? (
                          <div>
                            <div>{row.title}</div>
                            <div className={styles.tdMuted}>{row.summary}</div>
                          </div>
                        ) : (
                          String(row[col.key as keyof AttentionQueueItem] ?? '')
                        )}
                      </td>
                    ))}
                    <td
                      className={styles.tdAction}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={styles.moreBtn}
                        onClick={() =>
                          setOpenRowMenuId((p) => (p === row.id ? null : row.id))
                        }
                      >
                        <span className={`material-symbols-outlined ${styles.icon18}`}>
                          more_horiz
                        </span>
                      </button>
                      {openRowMenuId === row.id && (
                        <div className={styles.dropdownMenuLeft}>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              updateStatusForIds([row.id], 'Resolved');
                              onToast(`Resolved ${row.code}`);
                            }}
                          >
                            Resolve exception
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              setOpenRowMenuId(null);
                              onNavigate(row.targetDomain, row.targetScreen);
                            }}
                          >
                            Open source workspace
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              updateStatusForIds([row.id], 'For review', 'SA');
                              onToast(`Assigned ${row.code} to SA`);
                            }}
                          >
                            Assign to me (SA)
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              updateStatusForIds([row.id], 'Snoozed');
                              onToast(`Snoozed ${row.code} for 4h`);
                            }}
                          >
                            Snooze 4 hours
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap}>
              <span className={`material-symbols-outlined ${styles.icon26}`}>
                task_alt
              </span>
            </div>
            <div className={styles.emptyTitle}>Inbox zero for {activeTab}</div>
            <div className={styles.emptyStepsRow}>
              <span className={styles.emptyStepPill}>1. All SLAs within target</span>
              <span className={styles.emptyStepPill}>2. Check Resolved tab</span>
              <span className={styles.emptyStepPill}>3. Log a manual ops task</span>
            </div>
            <div className={styles.emptyBtnRow}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => onToast('Imported external alert CSV')}
              >
                Import
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={onOpenNewTaskModal}
              >
                New task
              </button>
            </div>
          </div>
        )}
      </div>

      {customizeOpen && (
        <ListCustomizeDrawer
          title="Attention Queue"
          columns={columns}
          visualConfig={visualCfg}
          onSave={(c, v) => {
            setColumns(c);
            setVisualCfg(v);
          }}
          onClose={() => setCustomizeOpen(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. CUSTOMER QUEUE (/customers under Dashboard Queues — Commerce Columns §F)
 * ═══════════════════════════════════════════════════════════════════════════ */
const CUSTOMER_QUEUE_COLUMNS: CustomColumnItem[] = [
  { key: 'name', label: 'Name', visible: true },
  { key: 'email', label: 'Email', visible: true },
  { key: 'orders', label: 'Orders', visible: true, right: true },
  { key: 'ltv', label: 'LTV', visible: true, right: true },
  { key: 'balance', label: 'Balance', visible: true, right: true },
  { key: 'lastOrder', label: 'Last order', visible: true },
  { key: 'marketingConsent', label: 'Marketing consent', visible: true },
  { key: 'source', label: 'Source', visible: true },
  { key: 'reason', label: 'Queue action', visible: true },
  { key: 'status', label: 'Status', visible: true },
  { key: 'owner', label: 'Assigned owner', visible: false },
  { key: 'createdOn', label: 'Created on', visible: false },
];

export function CustomerQueueView({
  items,
  onUpdateItems,
  onNavigate,
  onCreate,
  onOpenPeek,
  onToast,
}: {
  items: CustomerQueueItem[];
  onUpdateItems: (next: CustomerQueueItem[]) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreate: (label: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('All sources');
  const [sortKey, setSortKey] = useState<keyof CustomerQueueItem>('ltv');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState<boolean>(false);
  const [customizeOpen, setCustomizeOpen] = useState<boolean>(false);

  const [columns, setColumns] = useState<CustomColumnItem[]>(
    CUSTOMER_QUEUE_COLUMNS
  );
  const [visualCfg, setVisualCfg] = useState<VisualFormatConfig>({
    currencySymbol: true,
    parenthesesNegatives: true,
    decimals: 0,
    divideBy1000: false,
  });

  const openItems = items.filter((i) => i.status !== 'Resolved');
  const totalOutstanding = openItems.reduce((s, i) => s + i.balance, 0);
  const vipCount = openItems.filter(
    (i) => i.queueBucket === 'VIP / High LTV' || i.ltv >= 10000
  ).length;
  const rmaCount = openItems.filter(
    (i) => i.queueBucket === 'RMA & Refunds'
  ).length;
  const atRiskCount = openItems.filter(
    (i) => i.queueBucket === 'At risk' || i.queueBucket === 'Overdue balance'
  ).length;

  const filtered = items
    .filter((i) => {
      if (activeTab === 'Resolved') return i.status === 'Resolved';
      if (i.status === 'Resolved') return false;
      if (activeTab === 'All') return true;
      return i.queueBucket === activeTab;
    })
    .filter((i) =>
      sourceFilter === 'All sources' ? true : i.source === sourceFilter
    )
    .filter((i) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        i.name.toLowerCase().includes(q) ||
        i.email.toLowerCase().includes(q) ||
        i.reason.toLowerCase().includes(q) ||
        i.source.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

  const visibleCols = columns.filter((c) => c.visible);

  const handleSort = (key: string) => {
    const k = key as keyof CustomerQueueItem;
    if (sortKey === k) {
      setSortDir((p) => (p === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  const updateCustomerStatus = (
    ids: string[],
    status: CustomerQueueItem['status']
  ) => {
    onUpdateItems(
      items.map((it) => (ids.includes(it.id) ? { ...it, status } : it))
    );
    setSelectedIds([]);
    setOpenRowMenuId(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.breadcrumb}>
          <span>Dashboard</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Queues</span>
        </div>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Customer Queue</h1>
            <p className={styles.subtitle}>
              Commerce customer follow-ups, overdue AR collections, RMA approvals &amp; VIP care (§F commerce schema)
            </p>
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.splitWrap}>
              <button
                type="button"
                className={styles.splitMain}
                onClick={() => onCreate('Customer')}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>
                  person_add
                </span>
                New customer
              </button>
              <button
                type="button"
                className={styles.splitArrow}
                onClick={() => setSplitOpen((p) => !p)}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>
                  expand_more
                </span>
              </button>
              {splitOpen && (
                <div className={styles.dropdownMenu}>
                  <div className={styles.dropdownHeader}>Customer creates</div>
                  {[
                    ['Invoice', 'receipt_long'],
                    ['Receive payment', 'price_check'],
                    ['Statement', 'summarize'],
                    ['Credit memo', 'assignment_return'],
                    ['Add customer', 'person_add'],
                  ].map(([lbl, ic]) => (
                    <button
                      key={lbl}
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setSplitOpen(false);
                        onCreate(lbl);
                      }}
                    >
                      <span className={`material-symbols-outlined ${styles.icon16}`}>
                        {ic}
                      </span>
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                const cols = columns
                  .filter((c) => c.visible)
                  .map((c) => ({ key: c.key, label: c.label }));
                exportToCsv(filtered as unknown as Record<string, unknown>[], cols, 'customer-queue');
                onToast(`Exported ${filtered.length} records to CSV`);
              }}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                download
              </span>
              Export
            </button>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setCustomizeOpen(true)}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                tune
              </span>
              Customize
            </button>
          </div>
        </div>
      </div>

      {/* §F Customers KPI Tiles: total, active/VIP, RMA/new, outstanding balance, at risk */}
      <div className={styles.kpiGrid5}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Queued Customers</span>
          <div className={styles.kpiValue}>{openItems.length}</div>
          <div className={styles.kpiDeltaNeutral}>184 total active in CRM</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>VIP / High LTV (&gt;$10K)</span>
          <div className={styles.kpiValue}>{vipCount}</div>
          <div className={styles.kpiDeltaPos}>Priority SLA (&lt;1h response)</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Outstanding AR Balance</span>
          <div className={styles.kpiValue}>
            {formatVisualNumber(totalOutstanding, visualCfg)}
          </div>
          <div className={styles.kpiDeltaWarn}>Across open B2B invoices</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Open RMAs &amp; Exchanges</span>
          <div className={styles.kpiValue}>{rmaCount}</div>
          <div className={styles.kpiDeltaNeutral}>Ready for credit memo / reprint</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>At Risk &amp; Overdue</span>
          <div className={styles.kpiValue}>{atRiskCount}</div>
          <div className={styles.kpiDeltaNeg}>Winback or payment link needed</div>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.viewTabsBar}>
          {[
            'All',
            'Needs follow-up',
            'Overdue balance',
            'RMA & Refunds',
            'At risk',
            'VIP / High LTV',
            'Resolved',
          ].map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.viewTab} ${
                activeTab === t ? styles.viewTabActive : ''
              }`}
              onClick={() => {
                setActiveTab(t);
                setSelectedIds([]);
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={styles.filterToolbar}>
          <div className={styles.searchWrap}>
            <span className={`material-symbols-outlined ${styles.icon15Search}`}>
              search
            </span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Filter customer, email, reason…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className={styles.selectControl}
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="All sources">Source: All</option>
            <option value="Storefront">Storefront</option>
            <option value="B2B Invoice">B2B Invoice</option>
            <option value="Marketplace">Marketplace</option>
            <option value="Social Shop">Social Shop</option>
          </select>

          <span className={styles.paginationLabel}>
            {filtered.length > 0
              ? `1–${filtered.length} of ${filtered.length}`
              : '0 of 0'}
          </span>
        </div>

        {/* §F Customers Bulk Actions: Tag, Email, Merge + Resolve */}
        {selectedIds.length > 0 && (
          <div className={styles.bulkBar}>
            <div className={styles.bulkLeft}>
              <span>{selectedIds.length} customers selected</span>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => setSelectedIds([])}
              >
                Clear
              </button>
            </div>
            <div className={styles.bulkActions}>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => {
                  updateCustomerStatus(selectedIds, 'VIP');
                  onToast(`Tagged ${selectedIds.length} customers as VIP`);
                }}
              >
                Tag VIP
              </button>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => {
                  onToast(
                    `Sent follow-up / payment link email to ${selectedIds.length} customers`
                  );
                  setSelectedIds([]);
                }}
              >
                Email
              </button>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => {
                  updateCustomerStatus(selectedIds, 'Resolved');
                  onToast(`Marked ${selectedIds.length} customer items resolved`);
                }}
              >
                Mark followed up
              </button>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => {
                  onToast('Validated party records for duplicate merge');
                  setSelectedIds([]);
                }}
              >
                Merge
              </button>
            </div>
          </div>
        )}

        {filtered.length > 0 ? (
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead className={styles.thead}>
                <tr>
                  <th className={`${styles.th} ${styles.thCheck}`}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={
                        filtered.length > 0 &&
                        selectedIds.length === filtered.length
                      }
                      onChange={() =>
                        setSelectedIds(
                          selectedIds.length === filtered.length
                            ? []
                            : filtered.map((r) => r.id)
                        )
                      }
                    />
                  </th>
                  {visibleCols.map((col, idx) => (
                    <th
                      key={col.key}
                      className={`${styles.th} ${styles.thSortable} ${
                        idx === 0 ? styles.thSticky : ''
                      } ${col.right ? styles.thRight : ''}`}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}{' '}
                      {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                  <th className={styles.th} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={styles.tr}
                    onClick={() =>
                      onOpenPeek(
                        {
                          name: row.name,
                          email: row.email,
                          orders: row.orders,
                          ltv: formatVisualNumber(row.ltv, visualCfg),
                          balance: formatVisualNumber(row.balance, visualCfg),
                          lastOrder: row.lastOrder,
                          marketingConsent: row.marketingConsent,
                          source: row.source,
                          queueReason: row.reason,
                          status: row.status,
                        },
                        'party'
                      )
                    }
                  >
                    <td
                      className={styles.tdCheck}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedIds.includes(row.id)}
                        onChange={() =>
                          setSelectedIds((prev) =>
                            prev.includes(row.id)
                              ? prev.filter((x) => x !== row.id)
                              : [...prev, row.id]
                          )
                        }
                      />
                    </td>
                    {visibleCols.map((col, idx) => (
                      <td
                        key={col.key}
                        className={`${styles.td} ${
                          idx === 0 ? styles.tdSticky : ''
                        } ${col.right ? styles.tdRight : ''} ${
                          col.key === 'balance' && row.balance > 0
                            ? styles.tdNeg
                            : col.key === 'ltv'
                              ? styles.tdPos
                              : ''
                        }`}
                      >
                        {col.key === 'status' ? (
                          <StatusPill status={row.status} />
                        ) : col.key === 'ltv' || col.key === 'balance' ? (
                          formatVisualNumber(row[col.key], visualCfg)
                        ) : (
                          String(row[col.key as keyof CustomerQueueItem] ?? '')
                        )}
                      </td>
                    ))}
                    <td
                      className={styles.tdAction}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={styles.moreBtn}
                        onClick={() =>
                          setOpenRowMenuId((p) => (p === row.id ? null : row.id))
                        }
                      >
                        <span className={`material-symbols-outlined ${styles.icon18}`}>
                          more_horiz
                        </span>
                      </button>
                      {openRowMenuId === row.id && (
                        <div className={styles.dropdownMenuLeft}>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              updateCustomerStatus([row.id], 'Resolved');
                              onToast(`Completed follow-up for ${row.name}`);
                            }}
                          >
                            Mark followed up
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              setOpenRowMenuId(null);
                              onCreate('Invoice');
                            }}
                          >
                            Create Invoice
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              setOpenRowMenuId(null);
                              onCreate('Credit memo');
                            }}
                          >
                            Issue Credit Memo / RMA
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              setOpenRowMenuId(null);
                              onNavigate('contacts', 'customers');
                            }}
                          >
                            Open Customer Hub
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap}>
              <span className={`material-symbols-outlined ${styles.icon26}`}>
                groups
              </span>
            </div>
            <div className={styles.emptyTitle}>No customers in {activeTab}</div>
            <div className={styles.emptyStepsRow}>
              <span className={styles.emptyStepPill}>1. Import customer CSV</span>
              <span className={styles.emptyStepPill}>2. Connect Shopify / Stripe</span>
              <span className={styles.emptyStepPill}>3. Add party role=Customer</span>
            </div>
            <div className={styles.emptyBtnRow}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => onToast('Opened Customer CSV Importer')}
              >
                Import
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => onCreate('Customer')}
              >
                Add customer
              </button>
            </div>
          </div>
        )}
      </div>

      {customizeOpen && (
        <ListCustomizeDrawer
          title="Customer Queue"
          columns={columns}
          visualConfig={visualCfg}
          onSave={(c, v) => {
            setColumns(c);
            setVisualCfg(v);
          }}
          onClose={() => setCustomizeOpen(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. SELLER QUEUE (/seller under Dashboard Queues — Sellers, Suppliers & 1099s)
 * ═══════════════════════════════════════════════════════════════════════════ */
const SELLER_QUEUE_COLUMNS: CustomColumnItem[] = [
  { key: 'seller', label: 'Seller / Supplier', visible: true },
  { key: 'role', label: 'Role', visible: true },
  { key: 'stage', label: 'Queue Stage', visible: true },
  { key: 'gmvOrSpend', label: 'GMV / YTD Paid', visible: true, right: true },
  { key: 'takeOrMarginPct', label: 'Take / Margin %', visible: true, right: true },
  { key: 'slaPct', label: 'SLA', visible: true, right: true },
  { key: 'w9Status', label: '1099 / W-9', visible: true },
  { key: 'payoutHold', label: 'Payout Hold', visible: true, right: true },
  { key: 'openItems', label: 'Action Summary', visible: true },
  { key: 'status', label: 'Status', visible: true },
  { key: 'contactEmail', label: 'Email', visible: false },
  { key: 'updatedOn', label: 'Modified on', visible: false },
];

export function SellerQueueView({
  items,
  onUpdateItems,
  onOpenContractorInvite,
  onNavigate,
  onCreate,
  onOpenPeek,
  onToast,
}: {
  items: SellerQueueItem[];
  onUpdateItems: (next: SellerQueueItem[]) => void;
  onOpenContractorInvite: () => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreate: (label: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('All roles');
  const [sortKey, setSortKey] = useState<keyof SellerQueueItem>('gmvOrSpend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [splitOpen, setSplitOpen] = useState<boolean>(false);
  const [customizeOpen, setCustomizeOpen] = useState<boolean>(false);

  const [columns, setColumns] = useState<CustomColumnItem[]>(
    SELLER_QUEUE_COLUMNS
  );
  const [visualCfg, setVisualCfg] = useState<VisualFormatConfig>({
    currencySymbol: true,
    parenthesesNegatives: true,
    decimals: 0,
    divideBy1000: false,
  });

  const openItems = items.filter((i) => i.status !== 'Approved');
  const onboardingCount = openItems.filter(
    (i) => i.stage === 'Onboarding & KYB'
  ).length;
  const catalogCount = openItems.filter(
    (i) => i.stage === 'Catalog review'
  ).length;
  const w9PendingCount = openItems.filter(
    (i) => i.w9Status === 'Pending W-9'
  ).length;
  const totalHeldPayouts = openItems.reduce((s, i) => s + i.payoutHold, 0);

  const filtered = items
    .filter((i) => {
      if (activeTab === 'Approved') return i.status === 'Approved';
      if (i.status === 'Approved') return false;
      if (activeTab === 'All') return true;
      return i.stage === activeTab;
    })
    .filter((i) => (roleFilter === 'All roles' ? true : i.role === roleFilter))
    .filter((i) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        i.seller.toLowerCase().includes(q) ||
        i.role.toLowerCase().includes(q) ||
        i.openItems.toLowerCase().includes(q) ||
        i.w9Status.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

  const visibleCols = columns.filter((c) => c.visible);

  const handleSort = (key: string) => {
    const k = key as keyof SellerQueueItem;
    if (sortKey === k) {
      setSortDir((p) => (p === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  const approveSellers = (ids: string[]) => {
    onUpdateItems(
      items.map((it) =>
        ids.includes(it.id)
          ? {
              ...it,
              status: 'Approved',
              payoutHold: 0,
              w9Status: it.w9Status === 'Pending W-9' ? 'Verified' : it.w9Status,
            }
          : it
      )
    );
    setSelectedIds([]);
    setOpenRowMenuId(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.breadcrumb}>
          <span>Dashboard</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Queues</span>
        </div>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Seller Queue</h1>
            <p className={styles.subtitle}>
              Marketplace creator sellers, POD fulfillment suppliers &amp; 1099 contractors — KYB, catalog review, SLA &amp; W-9 holds
            </p>
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.splitWrap}>
              <button
                type="button"
                className={styles.splitMain}
                onClick={onOpenContractorInvite}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>
                  engineering
                </span>
                Invite seller / W-9
              </button>
              <button
                type="button"
                className={styles.splitArrow}
                onClick={() => setSplitOpen((p) => !p)}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>
                  expand_more
                </span>
              </button>
              {splitOpen && (
                <div className={styles.dropdownMenu}>
                  <div className={styles.dropdownHeader}>
                    Seller &amp; Supplier creates
                  </div>
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      setSplitOpen(false);
                      onOpenContractorInvite();
                    }}
                  >
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      mail
                    </span>
                    Invite contractor / W-9 (§B4)
                  </button>
                  {[
                    ['Add supplier', 'factory'],
                    ['Add vendor', 'domain_add'],
                    ['Purchase order', 'shopping_bag'],
                    ['Settlement', 'assured_workload'],
                  ].map(([lbl, ic]) => (
                    <button
                      key={lbl}
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setSplitOpen(false);
                        onCreate(lbl);
                      }}
                    >
                      <span className={`material-symbols-outlined ${styles.icon16}`}>
                        {ic}
                      </span>
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                const cols = columns
                  .filter((c) => c.visible)
                  .map((c) => ({ key: c.key, label: c.label }));
                exportToCsv(filtered as unknown as Record<string, unknown>[], cols, 'seller-supplier-queue');
                onToast(`Exported ${filtered.length} records to CSV`);
              }}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                download
              </span>
              Export
            </button>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setCustomizeOpen(true)}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                tune
              </span>
              Customize
            </button>
          </div>
        </div>
      </div>

      {/* 5 Seller Queue KPI Tiles */}
      <div className={styles.kpiGrid5}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Open Seller Items</span>
          <div className={styles.kpiValue}>{openItems.length}</div>
          <div className={styles.kpiDeltaNeutral}>Sellers, POD suppliers &amp; 1099s</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Onboarding &amp; KYB</span>
          <div className={styles.kpiValue}>{onboardingCount}</div>
          <div className={styles.kpiDeltaPos}>Stripe Connect verified</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Catalog &amp; DPI Reviews</span>
          <div className={styles.kpiValue}>{catalogCount}</div>
          <div className={styles.kpiDeltaNeutral}>20 listings awaiting publish</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Pending W-9 / 1099</span>
          <div className={styles.kpiValue}>{w9PendingCount}</div>
          <div className={styles.kpiDeltaWarn}>Required before Jan 31 NEC</div>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Payouts Held in Escrow</span>
          <div className={styles.kpiValue}>
            {formatVisualNumber(totalHeldPayouts, visualCfg)}
          </div>
          <div className={styles.kpiDeltaNeg}>Awaiting W-9 or QA signoff</div>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.viewTabsBar}>
          {[
            'All',
            'Onboarding & KYB',
            'Catalog review',
            'SLA & Quality',
            'Payouts & 1099',
            'Approved',
          ].map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.viewTab} ${
                activeTab === t ? styles.viewTabActive : ''
              }`}
              onClick={() => {
                setActiveTab(t);
                setSelectedIds([]);
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div className={styles.filterToolbar}>
          <div className={styles.searchWrap}>
            <span className={`material-symbols-outlined ${styles.icon15Search}`}>
              search
            </span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Filter seller, supplier, W-9, action…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className={styles.selectControl}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="All roles">Role: All</option>
            <option value="Marketplace Seller">Marketplace Seller</option>
            <option value="POD Supplier">POD Supplier</option>
            <option value="Design Partner">Design Partner</option>
            <option value="1099 Contractor">1099 Contractor</option>
          </select>

          <span className={styles.paginationLabel}>
            {filtered.length > 0
              ? `1–${filtered.length} of ${filtered.length}`
              : '0 of 0'}
          </span>
        </div>

        {selectedIds.length > 0 && (
          <div className={styles.bulkBar}>
            <div className={styles.bulkLeft}>
              <span>{selectedIds.length} counterparties selected</span>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => setSelectedIds([])}
              >
                Clear
              </button>
            </div>
            <div className={styles.bulkActions}>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => {
                  approveSellers(selectedIds);
                  onToast(`Approved & cleared ${selectedIds.length} sellers`);
                }}
              >
                Approve &amp; release payouts
              </button>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => {
                  onToast(`Sent W-9 request email to ${selectedIds.length} parties`);
                  setSelectedIds([]);
                }}
              >
                Request W-9
              </button>
            </div>
          </div>
        )}

        {filtered.length > 0 ? (
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead className={styles.thead}>
                <tr>
                  <th className={`${styles.th} ${styles.thCheck}`}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={
                        filtered.length > 0 &&
                        selectedIds.length === filtered.length
                      }
                      onChange={() =>
                        setSelectedIds(
                          selectedIds.length === filtered.length
                            ? []
                            : filtered.map((r) => r.id)
                        )
                      }
                    />
                  </th>
                  {visibleCols.map((col, idx) => (
                    <th
                      key={col.key}
                      className={`${styles.th} ${styles.thSortable} ${
                        idx === 0 ? styles.thSticky : ''
                      } ${col.right ? styles.thRight : ''}`}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}{' '}
                      {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                  <th className={styles.th} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className={styles.tr}
                    onClick={() =>
                      onOpenPeek(
                        {
                          seller: row.seller,
                          email: row.contactEmail,
                          role: row.role,
                          stage: row.stage,
                          gmvOrYtdPaid: formatVisualNumber(
                            row.gmvOrSpend,
                            visualCfg
                          ),
                          sla: `${row.slaPct.toFixed(1)}%`,
                          w9Status: row.w9Status,
                          payoutHold: formatVisualNumber(row.payoutHold, visualCfg),
                          actionSummary: row.openItems,
                          status: row.status,
                        },
                        'party'
                      )
                    }
                  >
                    <td
                      className={styles.tdCheck}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedIds.includes(row.id)}
                        onChange={() =>
                          setSelectedIds((prev) =>
                            prev.includes(row.id)
                              ? prev.filter((x) => x !== row.id)
                              : [...prev, row.id]
                          )
                        }
                      />
                    </td>
                    {visibleCols.map((col, idx) => (
                      <td
                        key={col.key}
                        className={`${styles.td} ${
                          idx === 0 ? styles.tdSticky : ''
                        } ${col.right ? styles.tdRight : ''} ${
                          col.key === 'payoutHold' && row.payoutHold > 0
                            ? styles.tdNeg
                            : ''
                        }`}
                      >
                        {col.key === 'status' ? (
                          <StatusPill status={row.status} />
                        ) : col.key === 'w9Status' ? (
                          <StatusPill status={row.w9Status} />
                        ) : col.key === 'gmvOrSpend' || col.key === 'payoutHold' ? (
                          formatVisualNumber(row[col.key], visualCfg)
                        ) : col.key === 'takeOrMarginPct' || col.key === 'slaPct' ? (
                          `${row[col.key].toFixed(1)}%`
                        ) : (
                          String(row[col.key as keyof SellerQueueItem] ?? '')
                        )}
                      </td>
                    ))}
                    <td
                      className={styles.tdAction}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={styles.moreBtn}
                        onClick={() =>
                          setOpenRowMenuId((p) => (p === row.id ? null : row.id))
                        }
                      >
                        <span className={`material-symbols-outlined ${styles.icon18}`}>
                          more_horiz
                        </span>
                      </button>
                      {openRowMenuId === row.id && (
                        <div className={styles.dropdownMenuLeft}>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              approveSellers([row.id]);
                              onToast(
                                `Approved ${row.seller} & released held payouts`
                              );
                            }}
                          >
                            Approve &amp; clear hold
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              setOpenRowMenuId(null);
                              onToast(`Sent W-9 link to ${row.contactEmail}`);
                            }}
                          >
                            Request W-9 e-signature
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              setOpenRowMenuId(null);
                              onNavigate('finance', 'vendors');
                            }}
                          >
                            Open Vendors &amp; 1099s
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconWrap}>
              <span className={`material-symbols-outlined ${styles.icon26}`}>
                storefront
              </span>
            </div>
            <div className={styles.emptyTitle}>
              No sellers or suppliers in {activeTab}
            </div>
            <div className={styles.emptyStepsRow}>
              <span className={styles.emptyStepPill}>1. Invite creator or contractor</span>
              <span className={styles.emptyStepPill}>2. Collect W-9 &amp; Stripe KYB</span>
              <span className={styles.emptyStepPill}>3. Approve listings &amp; SLA</span>
            </div>
            <div className={styles.emptyBtnRow}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => onToast('Opened Seller Roster CSV Importer')}
              >
                Import
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={onOpenContractorInvite}
              >
                Invite seller / W-9
              </button>
            </div>
          </div>
        )}
      </div>

      {customizeOpen && (
        <ListCustomizeDrawer
          title="Seller Queue"
          columns={columns}
          visualConfig={visualCfg}
          onSave={(c, v) => {
            setColumns(c);
            setVisualCfg(v);
          }}
          onClose={() => setCustomizeOpen(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
