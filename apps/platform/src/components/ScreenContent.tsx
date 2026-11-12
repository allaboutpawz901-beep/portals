'use client';
// Business Tax + Sales screens wired here (tax-overview / tax-summary / tax-filing)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEMO_ROWS,
  DOMAINS,
  DemoRow,
  DomainKey,
  GroupBgToken,
  ListScreenConfig,
  OverviewScreenConfig,
  SCREEN_DEFS,
  findScreen,
} from '@/data/shellData';
import { WorkspaceTab } from './Header';
import StatusPill from './StatusPill';
import CapTableScreenRenderer, {
  CAP_TABLE_SCREEN_IDS,
} from './cap-table/CapTableScreens';
import WorkspaceSettings, {
  WS_SCREEN_IDS,
} from './settings/WorkspaceSettings';
import RowMenu, { BulkBar, type RowMenuItem } from './ListPrimitives';
import ProductCard, { ProductThumb } from './design/ProductCard';
import listStyles from './ListPrimitives.module.css';
import DashboardScreenRenderer, {
  DASHBOARD_SCREEN_IDS,
  DashboardController,
} from './dashboard/DashboardScreens';
import ExpensesBillsOverview from './expenses-bills/ExpensesBillsOverview';
import PayBills from './expenses-bills/PayBills';
import Vendors from './expenses-bills/Vendors';
// Finance — HTML 1:1 screens (spec: unsaid-component-functionality-spec.md §2–§5)
import AccountingOverviewScreen from './finance/AccountingOverviewScreen';
import BankTransactionsScreen from './finance/BankTransactionsScreen';
import ChartOfAccountsScreen from './finance/ChartOfAccountsScreen';
import BankRulesScreen from './finance/BankRulesScreen';
import ReceiptsScreen from './finance/ReceiptsScreen';
import BillsScreen from './finance/BillsScreen';
import EstimatesScreen from './finance/EstimatesScreen';
import PurchaseOrderScreen from './finance/PurchaseOrderScreen';
import ReportsScreen from './finance/ReportsScreen';
import CashFlowScreen from './finance/CashFlowScreen';
import ReconcileScreen from './finance/ReconcileScreen';
import BusinessTaxOverview from './business-tax/BusinessTaxOverview';
import TaxSummary from './business-tax/TaxSummary';
import YearEndFiling from './business-tax/YearEndFiling';
import SalesOverview from './sales/SalesOverview';
import SalesTransactions from './sales/SalesTransactions';
import InvoicesScreen from './sales/InvoicesScreen';
import PaymentLinksScreen from './sales/PaymentLinksScreen';
import CatalogProductsScreen from './catalog/CatalogProductsScreen';
import ContactsParties from './contacts/ContactsParties';
import CrmOverviewSupabase from './contacts/CrmOverviewSupabase';
// Sellers — Seller relationships group (Supabase-backed screens)
import SellersScreen from './sellers/SellersScreen';
import SellerDetailScreen from './sellers/SellerDetailScreen';
import SellerFeedScreen from './sellers/SellerFeedScreen';
import SellerOnboardingScreen from './sellers/SellerOnboardingScreen';
import SellerQueueScreen from './sellers/SellerQueueScreen';
// Segments / Templates — CRM Tools (Supabase-backed screens)
import SegmentsScreen from './segments/SegmentsScreen';
import TemplatesScreen from './templates/TemplatesScreen';
// Queues — reply / assign / resolve loop on real conversations + messages
import AttentionQueueScreen from './queue/AttentionQueueScreen';
import CustomerQueueScreen from './queue/CustomerQueueScreen';
import ConversationInbox from './queue/ConversationInbox';
import AppointmentsScreen from './contacts/AppointmentsScreen';
import CustomersSupabase from './contacts/CustomersSupabase';
import LeadsPipelineSupabase from './contacts/LeadsPipelineSupabase';
import StatementsScreen from './contacts/StatementsScreen';
import OrdersOverview from './orders/OrdersOverview';
import OrdersList from './orders/OrdersList';
import PurchaseOrders from './orders/PurchaseOrders';
import ReturnsClaims from './orders/ReturnsClaims';
import FulfillmentQueue from './orders/FulfillmentQueue';
import BatchSlips from './orders/BatchSlips';
import ShippingSettings from './orders/ShippingSettings';
import InventoryView from './orders/InventoryView';
import DesignCanvasScreen from './design/DesignCanvasScreen';
import DesignPreviewScreen from './design/DesignPreviewScreen';
import ErpProductPageScreen from './design/ErpProductPageScreen';
import ErpProductCatalogScreen from './design/ErpProductCatalogScreen';
import MyProductsTable from './design/MyProductsTable';
import CreateWizard from './design/CreateWizard';
import { TOP_NAV, STOREFRONT_NAV } from '@/lib/designCanvasStore';
import ProductPageModal from './design/ProductPageModal';
import TasksProjectsScreen from './tasks/TasksProjectsScreen';
import PublishingOverviewScreen from './marketing/PublishingOverviewScreen';
import CreateContentScreen from './marketing/CreateContentScreen';
import OversightScreen from './marketing/OversightScreen';
import AdCenterScreen from './marketing/AdCenterScreen';
import CampaignsScreen from './marketing/CampaignsScreen';
import AdSetsScreen from './marketing/AdSetsScreen';
import CreativesScreen from './marketing/CreativesScreen';
import AudiencesScreen from './marketing/AudiencesScreen';
import PixelsScreen from './marketing/PixelsScreen';
import AdSpendScreen from './marketing/AdSpendScreen';
import AdvertisersScreen from './marketing/AdvertisersScreen';
import PromotionsScreen from './marketing/PromotionsScreen';
import NewsletterScreen from './marketing/NewsletterScreen';
import AutomationScreen from './marketing/AutomationScreen';
import SupportOverviewScreen from './support/SupportOverviewScreen';
import SupportTicketsScreen from './support/SupportTicketsScreen';
import SupportWorkspaceScreen from './support/SupportWorkspaceScreen';
import { useDesignCanvas, CATALOG_PRODUCTS, type CatalogProduct } from '@/lib/designCanvasStore';
import {
  createOrder,
  enqueue,
  getDesignsReport,
  getSettings,
  listBlanks,
  listCategories,
  listDesigns,
  listItems,
  listStores,
  saveSettings,
  type BlankCard,
  type DesignListItem,
  type DesignsReport,
  type ItemRow,
  type StoreRow,
} from '@/lib/podApi';
import { exportToCsv } from '@/lib/csvExport';
import styles from './ScreenContent.module.css';

interface ScreenContentProps {
  openTabs: WorkspaceTab[];
  activeTabKey: string;
  dashboardController: DashboardController;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCapCreate: (label: string) => void;
  onCreate: (label: string, prefill?: { partyName?: string; partyId?: string; source?: string; email?: string | null }) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (message: string) => void;
  sideRailCollapsed: boolean;
  /** Full-screen focus mode — page is free from sidebar & tab bar. */
  focusMode: boolean;
  onToggleFocus: () => void;
  onOpenStandalone: () => void;
  /** Pre-filled category/subcategory for the Create Wizard — set when the
   *  wizard icon next to a catalog child is clicked. */
  wizardPrefill?: { category: string; subcategory?: string } | null;
}

// Maps a GroupBgToken to a concrete background-color class for child-pill icons.
function groupBgClass(bg: GroupBgToken): string {
  switch (bg) {
    case 'bg-qb-navy':
      return 'bg-[#1f2937]';
    case 'bg-qb-teal':
      return 'bg-[#0e5e6f]';
    case 'bg-qb-maroon':
      return 'bg-[#6b1e28]';
    case 'bg-qb-green':
      return 'bg-[#1e5a38]';
    case 'bg-error':
      return 'bg-[#ba1a1a]';
    case 'bg-primary':
      return 'bg-[#0a6400]';
    default:
      return 'bg-[#5a6355]';
  }
}

/** Resolve a studio-* screen id to its hardcoded-nav catalog node:
 *  studio-accessories--bags--backpacks → { category: 'Accessories',
 *  subcategory: 'backpacks', path: ['Accessories','Bags','backpacks'] }.
 *  The full `path` is needed so the catalog screen can walk the nav tree
 *  for pills scoped to the ACTIVE subcategory (not the entire department).
 *  Unresolved ids still pass the prettified first segment so the API
 *  can answer honestly (matched: false). */
function catalogNodeFor(screenId: string): { category?: string; subcategory?: string; path?: string[] } {
  if (!screenId.startsWith('studio-')) return {};
  const segs = screenId.replace('studio-', '').split('--').filter(Boolean);
  if (segs.length === 0) return {};
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const pretty = (s: string) =>
    s.split('-').map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
  type NavNode = { name: string; children?: NavNode[] };
  let pool: NavNode[] = STOREFRONT_NAV as NavNode[];
  const names: string[] = [];
  for (const seg of segs) {
    const hit = pool.find((n) => norm(n.name) === norm(seg));
    if (!hit) break;
    names.push(hit.name);
    pool = hit.children ?? [];
  }
  if (names.length === 0) return { category: pretty(segs[0]) };
  return {
    category: names[0],
    subcategory: names.length > 1 ? names[names.length - 1] : undefined,
    path: names,
  };
}

function ListView({
  cfg,
  domainLabel,
  groupName,
  onCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
  onNavigate,
}: {
  cfg: ListScreenConfig;
  domainLabel: string;
  groupName: string;
  onCreate: (label: string, prefill?: { partyName?: string; partyId?: string; source?: string; email?: string | null }) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (message: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const allRows = DEMO_ROWS[cfg.key] || [];
  const tabs = cfg.tabs || ['All'];
  const [activeTab, setActiveTab] = useState<string>(tabs[0]);
  const [rowSearch, setRowSearch] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [splitOpen, setSplitOpen] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  // Product page modal — opens when a catalog thumbnail is clicked.
  const [activeProduct, setActiveProduct] = useState<CatalogProduct | null>(null);

  // Click-outside for split-button dropdown
  useEffect(() => {
    if (!splitOpen) return;
    function handleClick(e: MouseEvent) {
      if (splitRef.current && !splitRef.current.contains(e.target as Node)) {
        setSplitOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [splitOpen]);

  // Filter by tab + search. Tabs like "Open/Overdue/Paid" filter by status column.
  const filtered = allRows.filter((r) => {
    let tabMatch = true;
    if (activeTab !== 'All' && activeTab !== 'For review') {
      const status = String(r.status ?? '').toLowerCase();
      tabMatch = status === activeTab.toLowerCase();
    } else if (activeTab === 'For review') {
      tabMatch = String(r.status ?? '').toLowerCase() === 'for review';
    }
    if (!rowSearch.trim()) return tabMatch;
    const q = rowSearch.toLowerCase();
    const searchMatch = Object.values(r).some((v) =>
      String(v).toLowerCase().includes(q)
    );
    return tabMatch && searchMatch;
  });
  const hasData = filtered.length > 0;

  const toggleSelect = (idx: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((_, i) => i));
    });

  const selectedArray = Array.from(selectedIds);

  const isStudioCatalog =
    cfg.family === 'catalog' &&
    (cfg.key.startsWith('studio-') || cfg.key.startsWith('wizard-'));

  // Map a catalog row to its CATALOG_PRODUCTS entry (by product name).
  const productForRow = (row: DemoRow): CatalogProduct | undefined =>
    CATALOG_PRODUCTS.find((p) => p.name === String(row.product ?? ''));

  const rowMenuItems = (row: DemoRow, idx: number): import('@/components/ListPrimitives').RowMenuItem[] => [
    ...(isStudioCatalog
      ? [
          {
            label: 'Add to designer',
            icon: 'palette',
            onClick: () => {
              // Open the product page modal — user reviews supplier/variants,
              // then clicks "Start designing" to load the canvas.
              const prod = productForRow(row);
              if (prod) {
                setActiveProduct(prod);
              } else {
                // Fallback: load a blank directly.
                const productName = String(row.product ?? '').toLowerCase();
                const blankKey = productName.includes('mug')
                  ? 'mug'
                  : productName.includes('hoodie') || productName.includes('crewneck')
                    ? 'hoodie'
                    : 'tee';
                useDesignCanvas.getState().loadBlank(blankKey);
                onNavigate('design', 'new-design');
                onToast(`${row.product ?? 'Product'} added to designer.`);
              }
            },
          },
          {
            label: 'View',
            icon: 'open_in_new',
            onClick: () => onOpenPeek(row, cfg.family),
          },
        ]
      : [
          {
            label: 'View',
            icon: 'open_in_new',
            onClick: () => onOpenPeek(row, cfg.family),
          },
        ]),
    {
      label: 'Edit',
      icon: 'edit',
      onClick: () => onOpenPeek(row, cfg.family),
    },
    {
      label: 'Duplicate',
      icon: 'content_copy',
      onClick: () => onToast(`Duplicated ${cfg.newLabel}`),
    },
    {
      label: 'Print',
      icon: 'print',
      dividerBefore: true,
      onClick: () => {
        if (typeof window !== 'undefined') window.print();
      },
    },
    {
      label: 'Delete',
      icon: 'delete',
      danger: true,
      onClick: () => {
        onToast(`Deleted record`);
        toggleSelect(idx);
      },
    },
  ];

  const bulkActions: import('@/components/ListPrimitives').BulkAction[] = [
    {
      label: 'Export selected',
      icon: 'download',
      onClick: () => {
        const cols = cfg.cols.map((c) => ({ key: c.key, label: c.label }));
        const selectedRows = selectedArray
          .map((i) => filtered[i])
          .filter(Boolean) as unknown as Record<string, unknown>[];
        exportToCsv(selectedRows, cols, `${cfg.key || 'export'}-selected`);
        onToast(`Exported ${selectedArray.length} records to CSV`);
        setSelectedIds(new Set());
      },
    },
    {
      label: 'Delete selected',
      icon: 'delete',
      danger: true,
      onClick: () => {
        onToast(`Deleted ${selectedArray.length} records`);
        setSelectedIds(new Set());
      },
    },
  ];

  // Per-family create options for the split-button dropdown
  const familyCreates = cfg.createActionsRow
    ? cfg.createActionsRow.map(([label]) => label)
    : [cfg.newLabel];

  return (
    <div className={styles.screenContainer}>
      <div className={styles.listHeader}>
        <div>
          <div className={styles.breadcrumb}>
            <span>{domainLabel}</span>
            <span className={styles.breadcrumbSep}>/</span>
            <span>{groupName}</span>
          </div>
          <h1 className={styles.pageTitle}>{cfg.title}</h1>
          <p className={styles.pageSubtitle}>{cfg.subtitle}</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.splitBtn} ref={splitRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className={styles.splitBtnPrimaryMain}
              data-new={cfg.newLabel}
              onClick={() => onCreate(cfg.newLabel)}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>add</span>
              New {cfg.newLabel.toLowerCase()}
            </button>
            <button
              type="button"
              className={styles.splitBtnPrimaryArrow}
              aria-expanded={splitOpen}
              onClick={() => setSplitOpen((prev) => !prev)}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>expand_more</span>
            </button>
            {splitOpen && (
              <div className={listStyles.splitDropdown} role="menu">
                {familyCreates.map((label) => (
                  <button
                    key={label}
                    type="button"
                    className={listStyles.splitDropdownItem}
                    onClick={() => {
                      setSplitOpen(false);
                      onCreate(label);
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                    {label}
                  </button>
                ))}
                <div className={listStyles.rowMenuDivider} />
                <button
                  type="button"
                  className={listStyles.splitDropdownItem}
                  onClick={() => {
                    setSplitOpen(false);
                    onOpenCreateFlyout();
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>apps</span>
                  Show all create options
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className={styles.secondaryBtn}
            data-export
            onClick={() => {
              const cols = cfg.cols.map((c) => ({ key: c.key, label: c.label }));
              exportToCsv(filtered as unknown as Record<string, unknown>[], cols, cfg.key || 'export');
              onToast(`Exported ${filtered.length} records to CSV`);
            }}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>download</span>
            Export
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            data-customize
            onClick={() => onToast('Customize panel — Data / Visual tabs')}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>tune</span>
            Customize
          </button>
        </div>
      </div>

      {cfg.createActionsRow && (
        <div className={styles.createActionsRow}>
          <span className={styles.createActionsLabel}>Create actions:</span>
          {cfg.createActionsRow.map(([label, icon]) => (
            <button
              key={label}
              type="button"
              className={styles.createActionChip}
              data-new={label}
              onClick={() => onCreate(label)}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>{icon}</span>
              {label}
            </button>
          ))}
          <button
            type="button"
            className={styles.showAllBtn}
            data-open-create
            onClick={onOpenCreateFlyout}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>apps</span>
            Show all
          </button>
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.viewTabsBar}>
          {tabs.map((tab) => {
            const isTabActive = activeTab === tab;
            const count =
              tab === 'All'
                ? allRows.length
                : allRows.filter(
                    (r) => String(r.status ?? '').toLowerCase() === tab.toLowerCase()
                  ).length;
            return (
              <button
                key={tab}
                type="button"
                data-viewtab={tab}
                className={`${styles.viewTab} ${isTabActive ? styles.viewTabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
                {count > 0 && <span className={styles.viewTabCount}>{count}</span>}
              </button>
            );
          })}
        </div>

        <div className={styles.filterToolbar}>
          <div className={styles.rowFilterWrap}>
            <span className={`material-symbols-outlined ${styles.icon15Search}`}>search</span>
            <input
              className={styles.rowFilterInput}
              placeholder="Filter rows…"
              type="text"
              value={rowSearch}
              onChange={(e) => setRowSearch(e.target.value)}
            />
          </div>
          <button type="button" className={styles.filterToolBtn}>
            <span className={`material-symbols-outlined ${styles.icon14}`}>filter_list</span>
            Filter
          </button>
          <button type="button" className={styles.filterToolBtn}>
            <span className={`material-symbols-outlined ${styles.icon14}`}>calendar_today</span>
            Date range
          </button>
          <button type="button" className={styles.filterToolBtn}>
            <span className={`material-symbols-outlined ${styles.icon14}`}>bookmark</span>
            Saved views
          </button>
          <span className={styles.rowCountText}>
            {selectedIds.size > 0
              ? `${selectedIds.size} selected`
              : `1–${filtered.length} of ${filtered.length}`}
          </span>
        </div>

        {selectedIds.size > 0 && (
          <BulkBar
            selectedIds={selectedArray.map(String)}
            onClear={() => setSelectedIds(new Set())}
            actions={bulkActions}
          />
        )}

        {hasData ? (
          <table className={styles.dataTable}>
            <thead className={styles.tableHead}>
              <tr>
                <th className={styles.checkColHeader}>
                  <input
                    type="checkbox"
                    className={styles.rowCheck}
                    checked={selectedIds.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                {isStudioCatalog && <th className={styles.thumbColHeader} />}
                {cfg.cols.map((col) => (
                  <th
                    key={col.key}
                    className={`${styles.colHeader} ${col.right ? styles.alignRight : ''}`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className={styles.actionColHeader} />
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {filtered.map((row, idx) => {
                const prod = isStudioCatalog ? productForRow(row) : undefined;
                const thumbImg = prod
                  ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23e8e8e8"/><path d="M30 30 L30 90 L45 90 L45 50 L50 40 L55 50 L55 90 L70 90 L70 30 Z" fill="%23fff" stroke="%23ccc"/></svg>'
                  : null;
                return (
                <tr
                  key={idx}
                  className={`${styles.tableRow} ${selectedIds.has(idx) ? styles.tableRowSelected : ''}`}
                  onClick={() => onOpenPeek(row, cfg.family)}
                >
                  <td className={styles.cell}>
                    <input
                      type="checkbox"
                      className={styles.rowCheck}
                      checked={selectedIds.has(idx)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelect(idx)}
                    />
                  </td>
                  {isStudioCatalog && (
                    <td className={styles.thumbCell}>
                      {thumbImg && prod && (
                        <button
                          type="button"
                          className={styles.thumbBtn}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('blank-type', prod.blankKey);
                            e.dataTransfer.setData('catalog-product-id', prod.id);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          title={`${prod.name} — drag to canvas or click for product page`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveProduct(prod);
                          }}
                        >
                          <img src={thumbImg} alt={prod.name} />
                        </button>
                      )}
                    </td>
                  )}
                  {cfg.cols.map((col) => {
                    const val = row[col.key];
                    return (
                      <td
                        key={col.key}
                        className={`${styles.cell} ${col.right ? styles.alignRight : ''}`}
                      >
                        {col.key === 'status' ? (
                          <StatusPill status={String(val)} />
                        ) : (
                          String(val ?? '')
                        )}
                      </td>
                    );
                  })}
                  <td className={styles.actionCell}>
                    <RowMenu items={rowMenuItems(row, idx)} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconCircle}>
              <span className={`material-symbols-outlined ${styles.icon32Outline}`}>inbox</span>
            </div>
            <h3 className={styles.emptyTitle}>
              {cfg.emptyTitle || `No ${cfg.title.toLowerCase()} yet`}
            </h3>
            <p className={styles.emptyDesc}>
              {cfg.emptySteps || 'Create your first record or import from a CSV.'}
            </p>
            <div className={styles.emptyActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                data-import
                onClick={() => onToast('Import dialog — select a CSV file')}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>upload</span>
                Import
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                data-new={cfg.newLabel}
                onClick={() => onCreate(cfg.newLabel)}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>add</span>
                {cfg.newLabel}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Product page modal — opens when a catalog thumbnail is clicked. */}
      {activeProduct && (
        <ProductPageModal
          product={activeProduct}
          onClose={() => setActiveProduct(null)}
          onEnterStudio={() => {
            onNavigate('design', 'new-design');
            onToast(`${activeProduct.name} loaded into the studio.`);
          }}
        />
      )}
    </div>
  );
}

function OverviewView({
  cfg,
  domain,
  domainLabel,
  groupName,
  activeScreenId,
  onCreate,
  onOpenCreateFlyout,
  onNavigate,
}: {
  cfg: OverviewScreenConfig;
  domain: DomainKey;
  domainLabel: string;
  groupName: string;
  activeScreenId: string;
  onCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const kpis = cfg.kpis || [];
  const actions = cfg.actions || [];

  // Build the child strip: all screens across all groups in this domain.
  const childScreens = useMemo(() => {
    const dom = DOMAINS[domain];
    if (!dom) return [];
    return dom.groups.flatMap((g) =>
      g.screens.map((s) => ({
        ...s,
        group: g.name,
        groupIcon: g.icon,
        groupBg: g.bg,
      }))
    );
  }, [domain]);

  // Hover-arrows navigation for the child strip (replaces scrollbar).
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
  }, [childScreens, updateArrows]);

  const scrollBy = (dir: 1 | -1) => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.7, 200), behavior: 'smooth' });
  };

  return (
    <div className={styles.screenContainer}>
      {/* Domain child strip — hover-arrow navigation (no scrollbar) */}
      {childScreens.length > 1 && (
        <div
          className={styles.childStripWrap}
          onMouseEnter={updateArrows}
        >
          {canLeft && (
            <button
              type="button"
              className={`${styles.childStripArrow} ${styles.childStripArrowLeft}`}
              onClick={() => scrollBy(-1)}
              aria-label="Scroll left"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                chevron_left
              </span>
            </button>
          )}
          {canRight && (
            <button
              type="button"
              className={`${styles.childStripArrow} ${styles.childStripArrowRight}`}
              onClick={() => scrollBy(1)}
              aria-label="Scroll right"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                chevron_right
              </span>
            </button>
          )}
          <div
            ref={stripRef}
            className={styles.childStrip}
            onScroll={updateArrows}
          >
            {childScreens.map((s) => {
              const active = s.id === activeScreenId;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`${styles.childPill} ${active ? styles.childPillActive : ''}`}
                  onClick={() => onNavigate(domain, s.id)}
                  title={s.label}
                >
                  <span
                    className={`${styles.childPillIcon} ${groupBgClass(s.groupBg)}`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                      {s.groupIcon}
                    </span>
                  </span>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.overviewHeader}>
        <div className={styles.breadcrumb}>
          <span>{domainLabel}</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span>{groupName}</span>
        </div>
        <h1 className={styles.pageTitle}>{cfg.title}</h1>
        <p className={styles.pageSubtitle}>{cfg.subtitle}</p>
      </div>

      <div className={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <div key={kpi.label} className={styles.kpiCard}>
            <span className={styles.kpiLabel}>{kpi.label}</span>
            <div className={styles.kpiValue}>{kpi.value}</div>
            <div
              className={
                kpi.delta?.startsWith('+') ? styles.kpiDeltaPos : styles.kpiDeltaNeg
              }
            >
              {kpi.delta || ''}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.createActionsRow}>
        <span className={styles.createActionsLabel}>Create actions:</span>
        {actions.map(([label, icon]) => (
          <button
            key={label}
            type="button"
            className={styles.createActionChip}
            data-new={label}
            onClick={() => onCreate(label)}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>{icon}</span>
            {label}
          </button>
        ))}
        <button
          type="button"
          className={styles.showAllBtn}
          data-open-create
          onClick={onOpenCreateFlyout}
        >
          <span className={`material-symbols-outlined ${styles.icon16}`}>apps</span>
          Show all
        </button>
      </div>

      <div className={styles.panelCard}>
        <h2 className={styles.panelTitle}>{cfg.panelTitle || 'Business at a glance'}</h2>
        <p className={styles.panelText}>
          {cfg.panelText ||
            'Insight cards and suggestions live here. Setup checklist card until company setup is complete.'}
        </p>
      </div>
    </div>
  );
}

/* ── PoD designer live lists (A4–A9, Nov 8) ──
   Every screen below reads a real /api/v1 endpoint and renders real rows.
   Loading / error-with-retry / empty states only — never invented data.
   Clicking a blank loads its real detail into the store, then navigates to
   the product page (A3) or the canvas (A1). */

interface LiveCol {
  key: string;
  label: string;
  right?: boolean;
}

function LiveStudioList({
  domainLabel,
  groupName,
  title,
  subtitle,
  cols,
  rows,
  thumbs,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDesc,
  onRowClick,
  headerExtra,
  tabs,
  activeTab,
  onTabChange,
  selectable,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  bulkActions,
  onClearSelection,
  rowAction,
  quickActions,
}: {
  domainLabel: string;
  groupName: string;
  title: string;
  subtitle: string;
  cols: LiveCol[];
  rows: Record<string, React.ReactNode>[];
  thumbs?: (string | null | undefined)[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyTitle: string;
  emptyDesc: string;
  onRowClick?: (idx: number) => void;
  headerExtra?: React.ReactNode;
  /** Optional tab bar (CatalogList: All / Eligible / Review / Discontinued). */
  tabs?: { label: string; count?: number }[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  /** Optional checkbox selection + bulk bar (Design selected → queue). */
  selectable?: boolean;
  selected?: Set<number>;
  onToggleSelect?: (idx: number) => void;
  onToggleSelectAll?: () => void;
  bulkActions?: import('@/components/ListPrimitives').BulkAction[];
  onClearSelection?: () => void;
  /** Optional per-row action button (Design / Design this). */
  rowAction?: { label: string; onClick: (idx: number) => void };
  /** Optional per-row quick-actions menu (the ⋯ menu — View, Preview, queue…). */
  quickActions?: (idx: number) => RowMenuItem[];
}) {
  return (
    <div className={styles.screenContainer}>
      <div className={styles.listHeader}>
        <div>
          <div className={styles.breadcrumb}>
            <span>{domainLabel}</span>
            <span className={styles.breadcrumbSep}>/</span>
            <span>{groupName}</span>
          </div>
          <h1 className={styles.pageTitle}>{title}</h1>
          <p className={styles.pageSubtitle}>{subtitle}</p>
        </div>
        {headerExtra}
      </div>
      <div className={styles.tableCard}>
        {tabs && tabs.length > 0 && (
          <div className={styles.viewTabsBar}>
            {tabs.map((tab) => (
              <button
                key={tab.label}
                type="button"
                data-viewtab={tab.label}
                className={`${styles.viewTab} ${activeTab === tab.label ? styles.viewTabActive : ''}`}
                onClick={() => onTabChange?.(tab.label)}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className={styles.viewTabCount}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        )}
        {selectable && selected && selected.size > 0 && bulkActions && (
          <BulkBar
            selectedIds={[...selected].map(String)}
            onClear={() => onClearSelection?.()}
            actions={bulkActions}
          />
        )}
        {loading ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconCircle}>
              <span className={`material-symbols-outlined ${styles.icon32Outline}`}>hourglass_top</span>
            </div>
            <h3 className={styles.emptyTitle}>Loading {title.toLowerCase()}…</h3>
            <p className={styles.emptyDesc}>Reading live rows.</p>
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconCircle}>
              <span className={`material-symbols-outlined ${styles.icon32Outline}`}>error</span>
            </div>
            <h3 className={styles.emptyTitle}>Could not load {title.toLowerCase()}</h3>
            <p className={styles.emptyDesc}>{error}</p>
            <div className={styles.emptyActions}>
              <button type="button" className={styles.secondaryBtn} onClick={onRetry}>
                <span className={`material-symbols-outlined ${styles.icon16}`}>refresh</span>
                Retry
              </button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconCircle}>
              <span className={`material-symbols-outlined ${styles.icon32Outline}`}>inbox</span>
            </div>
            <h3 className={styles.emptyTitle}>{emptyTitle}</h3>
            <p className={styles.emptyDesc}>{emptyDesc}</p>
          </div>
        ) : (
          <table className={styles.dataTable}>
            <thead className={styles.tableHead}>
              <tr>
                {selectable && (
                  <th className={styles.thumbColHeader}>
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      checked={selected != null && rows.length > 0 && selected.size === rows.length}
                      onChange={() => onToggleSelectAll?.()}
                    />
                  </th>
                )}
                {thumbs && <th className={styles.thumbColHeader} />}
                {cols.map((col) => (
                  <th
                    key={col.key}
                    className={`${styles.colHeader} ${col.right ? styles.alignRight : ''}`}
                  >
                    {col.label}
                  </th>
                ))}
                {(rowAction || quickActions) && <th className={styles.colHeader} />}
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {rows.map((row, idx) => (
                <tr
                  key={idx}
                  className={styles.tableRow}
                  onClick={onRowClick ? () => onRowClick(idx) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {selectable && (
                    <td className={styles.cell} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select row ${idx + 1}`}
                        checked={selected?.has(idx) ?? false}
                        onChange={() => onToggleSelect?.(idx)}
                      />
                    </td>
                  )}
                  {thumbs && (
                    <td className={styles.thumbCell}>
                      <ProductThumb
                        name={String(rows[idx]?.[cols[0]?.key ?? ''] ?? '')}
                        imageUrl={thumbs[idx]}
                        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, fontSize: 14 }}
                      />
                    </td>
                  )}
                  {cols.map((col) => (
                    <td
                      key={col.key}
                      className={`${styles.cell} ${col.right ? styles.alignRight : ''}`}
                    >
                      {col.key === 'status' ? (
                        <StatusPill status={String(row[col.key] ?? '')} />
                      ) : (
                        (row[col.key] as React.ReactNode) ?? ''
                      )}
                    </td>
                  ))}
                  {(rowAction || quickActions) && (
                    <td className={styles.cell} onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        {rowAction && (
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            style={{ whiteSpace: 'nowrap' }}
                            onClick={() => rowAction.onClick(idx)}
                          >
                            {rowAction.label}
                          </button>
                        )}
                        {quickActions && quickActions(idx).length > 0 && (
                          <RowMenu items={quickActions(idx)} ariaLabel={`Quick actions for row ${idx + 1}`} />
                        )}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Open an existing design in the Studio (canvas or preview view). */
async function openDesignInStudio(
  designId: string,
  view: 'design' | 'preview',
  onNavigate: (domain: DomainKey, screenId: string) => void,
  onToast: (message: string) => void,
) {
  try {
    await useDesignCanvas
      .getState()
      .openStudio({ entry: 'catalog', designId, view });
    onNavigate('design', view === 'preview' ? 'design-preview' : 'new-design');
  } catch {
    onToast('Could not open that design.');
  }
}

/** Open a blank's product page: load the real detail, then navigate (A3). */
async function openBlankProductPage(
  cardId: string,
  onNavigate: (domain: DomainKey, screenId: string) => void,
  onToast: (message: string) => void,
) {
  const detail = await useDesignCanvas.getState().loadBlankDetail(cardId);
  if (!detail) {
    onToast('Could not load that product.');
    return;
  }
  onNavigate('design', 'product-page');
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : `USD ${Number(n).toFixed(2)}`;

/** A4 — Catalog lists (Men / Women / Children / Home Living). */
function StudioCatalogScreen({
  category,
  onNavigate,
  onToast,
}: {
  category: string;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (message: string) => void;
}) {
  const [subs, setSubs] = useState<string[]>([]);
  const [activeSub, setActiveSub] = useState<string | null>(null);
  const [cards, setCards] = useState<BlankCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Live eligibility per canonical (render_state + offers + lifecycle),
  // fetched from the blank workspace for exactly the canonicals on screen.
  const [eligibility, setEligibility] = useState<
    Map<string, { status: string; reasons: string[]; renderState: string }>
  >(new Map());
  const [activeTab, setActiveTab] = useState('All');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  /** Cards is the product view; Table mirrors every other table in the app. */
  const [view, setView] = useState<'cards' | 'table'>('cards');

  const load = useCallback(
    async (sub?: string) => {
      setLoading(true);
      setError(null);
      try {
        const { items, meta } = await listBlanks({ category, subcategory: sub, limit: 50 });
        setCards(items);
        setTotal(meta?.total ?? items.length);
        setSelected(new Set());
        const canonicalIds = [...new Set(items.map((c) => c.canonicalProductId).filter(Boolean))];
        if (canonicalIds.length > 0) {
          try {
            const res = await fetch(
              `/api/v1/blanks/workspace?ids=${encodeURIComponent(canonicalIds.join(','))}&limit=100`,
            );
            if (res.ok) {
              const body = (await res.json()) as {
                items: {
                  canonicalProductId: string;
                  renderState: string;
                  eligibility: { status: string; reasons: string[] };
                }[];
              };
              setEligibility(
                new Map(
                  body.items.map((w) => [
                    w.canonicalProductId,
                    {
                      status: w.eligibility.status,
                      reasons: w.eligibility.reasons,
                      renderState: w.renderState,
                    },
                  ]),
                ),
              );
            }
          } catch {
            // Eligibility is additive — a failed lookup never blocks the list.
            setEligibility(new Map());
          }
        } else {
          setEligibility(new Map());
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load products.');
      } finally {
        setLoading(false);
      }
    },
    [category],
  );

  useEffect(() => {
    let cancelled = false;
    void listCategories()
      .then(({ categories }) => {
        if (cancelled) return;
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const node = categories.find((c) => norm(c.name) === norm(category));
        const children = node?.children.map((c) => c.name) ?? [];
        // "All" first: a department screen opens on the whole department,
        // not on its first child (Apparel used to open on Men and report
        // Men's total as Apparel's). The sub-tabs narrow from there.
        setSubs(['All', ...children]);
        setActiveSub('All');
        void load(undefined);
      })
      .catch(() => {
        if (cancelled) return;
        // Nav failed — fall back to the category itself as the subcategory.
        setSubs(['All']);
        setActiveSub('All');
        void load(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [category, load]);

  const changeSub = (sub: string) => {
    setActiveSub(sub);
    void load(sub === 'All' ? undefined : sub);
  };

  const eligLabel: Record<string, string> = {
    eligible: 'Eligible',
    review: 'Review',
    discontinued: 'Discontinued',
  };
  const renderLabel: Record<string, string> = {
    missing_assets: 'Missing assets',
    unverified: 'Unverified',
    render_ready: 'Render-ready',
  };

  const catalogRows = cards.map((c) => {
    const e = c.canonicalProductId ? eligibility.get(c.canonicalProductId) : undefined;
    const eligStatus = e?.status ?? 'review';
    const reason = e
      ? (e.reasons[0] ?? (eligStatus === 'eligible' ? 'Ready to design.' : ''))
      : 'No render data on file.';
    return {
      card: c,
      eligStatus,
      product: c.name,
      blank: c.brand,
      supplier: c.supplier,
      eligibility: `${eligLabel[eligStatus] ?? eligStatus}${reason ? ` — ${reason}` : ''}`,
      status: e ? (renderLabel[e.renderState] ?? e.renderState) : '—',
    };
  });
  const counts = {
    All: catalogRows.length,
    Eligible: catalogRows.filter((r) => r.eligStatus === 'eligible').length,
    Review: catalogRows.filter((r) => r.eligStatus === 'review').length,
    Discontinued: catalogRows.filter((r) => r.eligStatus === 'discontinued').length,
  };
  const filtered =
    activeTab === 'All'
      ? catalogRows
      : catalogRows.filter((r) => eligLabel[r.eligStatus] === activeTab);

  const designSelected = async () => {
    const ids = [...selected]
      .map((i) => filtered[i]?.card.id)
      .filter((x): x is string => Boolean(x));
    let added = 0;
    let dup = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await enqueue({ supplierCatalogProductId: id });
        added += 1;
      } catch (e) {
        if ((e as { status?: number }).status === 409) dup += 1;
        else failed.push(id);
      }
    }
    setSelected(new Set());
    if (failed.length > 0) {
      onToast(`Queue failed for ${failed.length} blank(s); ${added} added.`);
    } else if (added > 0) {
      onToast(
        `${added} added to the Design Queue${dup > 0 ? ` (${dup} already queued)` : ''}.`,
      );
    } else {
      onToast('Those blanks are already in the Design Queue.');
    }
  };

  const subtitle = `Showing ${cards.length} of ${total} blanks in ${category} — ${counts.Eligible} eligible · ${counts.Review} in review · ${counts.Discontinued} discontinued. Eligibility is live from the render workspace; a blank with no render assets sits in Review until its contract is built.`;
  const viewToggle = (
    <div className={styles.viewTabsBar} style={{ border: 'none' }}>
      {(['cards', 'table'] as const).map((v) => (
        <button
          key={v}
          type="button"
          className={`${styles.viewTab} ${view === v ? styles.viewTabActive : ''}`}
          onClick={() => setView(v)}
        >
          {v === 'cards' ? 'Cards' : 'Table'}
        </button>
      ))}
    </div>
  );
  const subTabs =
    subs.length > 1 ? (
      <div className={styles.viewTabsBar} style={{ border: 'none' }}>
        {subs.map((sub) => (
          <button
            key={sub}
            type="button"
            className={`${styles.viewTab} ${activeSub === sub ? styles.viewTabActive : ''}`}
            onClick={() => changeSub(sub)}
          >
            {sub}
          </button>
        ))}
      </div>
    ) : undefined;

  const tableView = (
    <LiveStudioList
      domainLabel="Design Studio"
      groupName="Catalog"
      title={category}
      subtitle={subtitle}
      cols={[
        { key: 'product', label: 'Product' },
        { key: 'blank', label: 'Blank' },
        { key: 'supplier', label: 'Supplier' },
        { key: 'eligibility', label: 'Studio eligibility' },
        { key: 'status', label: 'Status' },
        { key: 'price', label: 'Price', right: true },
      ]}
      rows={filtered.map((r) => ({
        product: r.product,
        blank: r.blank,
        supplier: r.supplier,
        eligibility: r.eligibility,
        status: r.status,
        price: money(r.card.baseCost),
      }))}
      thumbs={filtered.map((r) => r.card.mockupThumbUrl)}
      loading={loading}
      error={error}
      onRetry={() => activeSub && void load(activeSub)}
      emptyTitle={`No ${category.toLowerCase()} products yet`}
      emptyDesc="No keeper-supplier blanks in this category."
      onRowClick={(idx) => void openBlankProductPage(filtered[idx].card.id, onNavigate, onToast)}
      tabs={[
        { label: 'All', count: counts.All },
        { label: 'Eligible', count: counts.Eligible },
        { label: 'Review', count: counts.Review },
        { label: 'Discontinued', count: counts.Discontinued },
      ]}
      activeTab={activeTab}
      onTabChange={(tab) => {
        setActiveTab(tab);
        setSelected(new Set());
      }}
      selectable
      selected={selected}
      onToggleSelect={(idx) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(idx)) next.delete(idx);
          else next.add(idx);
          return next;
        })
      }
      onToggleSelectAll={() =>
        setSelected((prev) =>
          prev.size === filtered.length
            ? new Set()
            : new Set(filtered.map((_, i) => i)),
        )
      }
      bulkActions={[{ label: 'Design selected', icon: 'palette', onClick: () => void designSelected() }]}
      onClearSelection={() => setSelected(new Set())}
      rowAction={{
        label: 'Design this',
        onClick: (idx) => void openBlankProductPage(filtered[idx].card.id, onNavigate, onToast),
      }}
      quickActions={(idx) => [
        {
          label: 'View product page',
          icon: 'inventory_2',
          onClick: () => void openBlankProductPage(filtered[idx].card.id, onNavigate, onToast),
        },
        {
          label: 'Add to Design Queue',
          icon: 'queue',
          onClick: () =>
            void enqueue({ supplierCatalogProductId: filtered[idx].card.id })
              .then(() => onToast('Added to the Design Queue.'))
              .catch((e: { status?: number }) =>
                onToast(
                  (e as { status?: number }).status === 409
                    ? 'Already in the Design Queue.'
                    : 'Could not queue that blank.',
                ),
              ),
        },
      ]}
      headerExtra={
        <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {viewToggle}
          {/* The wizard lives in the catalog now — the wizard icon starts it. */}
          <button
            type="button"
            className={styles.secondaryBtn}
            title="Create wizard — start from a ranked product"
            aria-label="Create wizard"
            onClick={() => onNavigate('design', 'wizard-best-selling')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              auto_fix_high
            </span>
            Wizard
          </button>
          {subTabs}
        </span>
      }
    />
  );
  if (view === 'table') return tableView;
  const tabs = [
    { label: 'All', count: counts.All },
    { label: 'Eligible', count: counts.Eligible },
    { label: 'Review', count: counts.Review },
    { label: 'Discontinued', count: counts.Discontinued },
  ];
  return (
    <div className={styles.screenContainer}>
      <div className={styles.listHeader}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Design Studio</span>
            <span className={styles.breadcrumbSep}>/</span>
            <span>Catalog</span>
          </div>
          <h1 className={styles.pageTitle}>{category}</h1>
          <p className={styles.pageSubtitle}>{subtitle}</p>
        </div>
        <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {viewToggle}
          {/* The wizard lives in the catalog now — the wizard icon starts it. */}
          <button
            type="button"
            className={styles.secondaryBtn}
            title="Create wizard — start from a ranked product"
            aria-label="Create wizard"
            onClick={() => onNavigate('design', 'wizard-best-selling')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              auto_fix_high
            </span>
            Wizard
          </button>
          {subTabs}
        </span>
      </div>
      <div className={styles.tableCard}>
        <div className={styles.viewTabsBar}>
          {tabs.map((tab) => (
            <button
              key={tab.label}
              type="button"
              data-viewtab={tab.label}
              className={`${styles.viewTab} ${activeTab === tab.label ? styles.viewTabActive : ''}`}
              onClick={() => {
                setActiveTab(tab.label);
                setSelected(new Set());
              }}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className={styles.viewTabCount}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <BulkBar
            selectedIds={[...selected].map(String)}
            onClear={() => setSelected(new Set())}
            actions={[{ label: 'Design selected', icon: 'palette', onClick: () => void designSelected() }]}
          />
        )}
        {loading ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>Loading {category.toLowerCase()}…</h3>
            <p className={styles.emptyDesc}>Reading live rows.</p>
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>Could not load {category.toLowerCase()}</h3>
            <p className={styles.emptyDesc}>{error}</p>
            <div className={styles.emptyActions}>
              <button type="button" className={styles.secondaryBtn} onClick={() => activeSub && void load(activeSub)}>
                Retry
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>No {category.toLowerCase()} products yet</h3>
            <p className={styles.emptyDesc}>No keeper-supplier blanks in this category.</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
              padding: 16,
            }}
          >
            {filtered.map((r, idx) => (
              <ProductCard
                key={r.card.id}
                card={r.card}
                selected={selected.has(idx)}
                onToggleSelect={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(idx)) next.delete(idx);
                    else next.add(idx);
                    return next;
                  })
                }
                onDesign={() => void openBlankProductPage(r.card.id, onNavigate, onToast)}
                onView={() => void openBlankProductPage(r.card.id, onNavigate, onToast)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A5 — Collection (My library child): designs grouped by collection_id. */
function CollectionScreen({
  onNavigate,
  onToast,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (message: string) => void;
}) {
  const [designs, setDesigns] = useState<DesignListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items } = await listDesigns({ limit: 100 });
      setDesigns(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load designs.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const m = new Map<string, DesignListItem[]>();
    for (const d of designs) {
      const key = d.collection_id ?? 'Unfiled';
      const list = m.get(key) ?? [];
      list.push(d);
      m.set(key, list);
    }
    return [...m.entries()];
  }, [designs]);
  const flat = useMemo(() => groups.flatMap(([, list]) => list), [groups]);

  const openDesign = (d: DesignListItem) => {
    if (!d.supplier_catalog_product_id) {
      onToast('This design has no blank attached.');
      return;
    }
    void openBlankProductPage(d.supplier_catalog_product_id, onNavigate, onToast);
  };

  return (
    <div>
      {groups.map(([collectionId, list]) => (
        <div key={collectionId} style={{ marginBottom: 8 }}>
          <h3 style={{ margin: '12px 0 4px', fontSize: 14 }}>
            {collectionId === 'Unfiled' ? 'Unfiled designs' : `Collection ${collectionId.slice(0, 8)}`}
            <span className={styles.muted}> — {list.length} design{list.length === 1 ? '' : 's'}</span>
          </h3>
        </div>
      ))}
      <LiveStudioList
        domainLabel="Design Studio"
        groupName="My library"
        title="Collection"
        subtitle="Your designs grouped by collection, with their live publications and mockups."
        cols={[
          { key: 'design', label: 'Design' },
          { key: 'collection', label: 'Collection' },
          { key: 'status', label: 'Status' },
          { key: 'publications', label: 'Publications', right: true },
          { key: 'price', label: 'Price', right: true },
        ]}
        rows={flat.map((d) => ({
          design: d.name,
          collection: d.collection_id ? d.collection_id.slice(0, 8) : 'Unfiled',
          status: d.status,
          publications: d.publications.length,
          price: money(d.retail_price),
        }))}
        thumbs={flat.map((d) => d.publications[0]?.mockup_url ?? null)}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        emptyTitle="No designs yet"
        emptyDesc="Start a design from a blank and it appears here."
        onRowClick={(idx) => openDesign(flat[idx])}
        rowAction={{
          label: 'Open in Studio',
          onClick: (idx) => void openDesignInStudio(flat[idx].id, 'design', onNavigate, onToast),
        }}
        quickActions={(idx) => [
          {
            label: 'Preview',
            icon: 'visibility',
            onClick: () => void openDesignInStudio(flat[idx].id, 'preview', onNavigate, onToast),
          },
          {
            label: 'View product page',
            icon: 'inventory_2',
            onClick: () => openDesign(flat[idx]),
          },
        ]}
      />
    </div>
  );
}

/** A5 — Published (My library child): designs with a live listing. */
/** Product card for a published design — mirrors ProductCard's shape. */
function DesignCard({
  design,
  onOpen,
  onPreview,
  onView,
}: {
  design: DesignListItem;
  onOpen: () => void;
  onPreview: () => void;
  onView: () => void;
}) {
  const published = design.publications.some((p) => p.status === 'published');
  const thumb = design.publications.find((p) => p.mockup_url)?.mockup_url ?? null;
  return (
    <article
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <div
        style={{ cursor: 'pointer' }}
        onClick={onView}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onView();
        }}
      >
        <ProductThumb
          name={design.name}
          imageUrl={thumb}
          style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }}
        />
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{design.name}</div>
        <div style={{ fontSize: 12, color: '#5f6368' }}>
          {design.publications.length} publication{design.publications.length === 1 ? '' : 's'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{money(design.retail_price)}</span>
          <span
            style={{
              marginLeft: 'auto',
              background: published ? '#e6f4ea' : '#fef7e0',
              color: published ? '#137333' : '#7a5c00',
              borderRadius: 999,
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'capitalize',
            }}
          >
            {published ? 'Published' : design.status}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={onOpen}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: '#1a73e8',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Open in Studio
          </button>
          <span style={{ flexShrink: 0 }}>
            <RowMenu
              items={[
                { label: 'Preview', icon: 'visibility', onClick: onPreview },
                { label: 'View product page', icon: 'inventory_2', onClick: onView },
              ]}
              ariaLabel={`Quick actions for ${design.name}`}
            />
          </span>
        </div>
      </div>
    </article>
  );
}

function PublishedDesignsScreen({
  onNavigate,
  onToast,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (message: string) => void;
}) {
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [designs, setDesigns] = useState<DesignListItem[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ items }, storesRes] = await Promise.all([
        listDesigns({ status: 'published', limit: 100 }),
        listStores(),
      ]);
      setDesigns(items);
      setStores(storesRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load published designs.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const openDesign = (d: DesignListItem) => {
    if (!d.supplier_catalog_product_id) {
      onToast('This design has no blank attached.');
      return;
    }
    void openBlankProductPage(d.supplier_catalog_product_id, onNavigate, onToast);
  };

  // Stores attached as a table, under the published listings.
  const storesView = (
    <LiveStudioList
      domainLabel="Design Studio"
      groupName="My products"
      title="Stores attached"
      subtitle="Storefronts your published listings are attached to — channels recorded when a listing is published to them."
      cols={[
        { key: 'store', label: 'Store' },
        { key: 'channel', label: 'Channel' },
        { key: 'live', label: 'Products live', right: true },
        { key: 'status', label: 'Status' },
      ]}
      rows={stores.map((s) => ({
        store: s.name,
        channel: s.channelType ?? s.code,
        live: s.liveProducts,
        status: s.status,
      }))}
      loading={loading}
      error={error}
      onRetry={() => void load()}
      emptyTitle="No stores connected yet"
      emptyDesc="No channels are connected — connect a channel and publish a listing to it, and it appears here."
    />
  );

  const tableView = (
    <>
      <LiveStudioList
        domainLabel="Design Studio"
        groupName="My products"
        title="Published"
        subtitle="Designs with a live listing — Draft → Published → Syncing, from the real publication rows."
        cols={[
          { key: 'design', label: 'Design' },
          { key: 'status', label: 'Status' },
          { key: 'publications', label: 'Publications', right: true },
          { key: 'price', label: 'Price', right: true },
        ]}
        rows={designs.map((d) => ({
          design: d.name,
          status: d.publications.some((p) => p.status === 'published') ? 'Published' : d.status,
          publications: d.publications.length,
          price: money(d.retail_price),
        }))}
        thumbs={designs.map((d) => d.publications.find((p) => p.mockup_url)?.mockup_url ?? null)}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        emptyTitle="Nothing published yet"
        emptyDesc="Publish a design from Preview & Publish and it appears here."
        onRowClick={(idx) => openDesign(designs[idx])}
        rowAction={{
          label: 'Open in Studio',
          onClick: (idx) => void openDesignInStudio(designs[idx].id, 'design', onNavigate, onToast),
        }}
        quickActions={(idx) => [
          {
            label: 'Preview',
            icon: 'visibility',
            onClick: () => void openDesignInStudio(designs[idx].id, 'preview', onNavigate, onToast),
          },
          {
            label: 'View product page',
            icon: 'inventory_2',
            onClick: () => openDesign(designs[idx]),
          },
        ]}
      />
      {storesView}
    </>
  );
  if (view === 'table') return tableView;

  const viewToggle = (
    <div className={styles.viewTabsBar} style={{ border: 'none' }}>
      {(['cards', 'table'] as const).map((v) => (
        <button
          key={v}
          type="button"
          className={`${styles.viewTab} ${view === v ? styles.viewTabActive : ''}`}
          onClick={() => setView(v)}
        >
          {v === 'cards' ? 'Cards' : 'Table'}
        </button>
      ))}
    </div>
  );

  return (
    <div className={styles.screenContainer}>
      <div className={styles.listHeader}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Design Studio</span>
            <span className={styles.breadcrumbSep}>/</span>
            <span>My products</span>
          </div>
          <h1 className={styles.pageTitle}>Published</h1>
          <p className={styles.pageSubtitle}>
            Published listings as product cards — the table is one click away, stores attached below.
          </p>
        </div>
        {viewToggle}
      </div>
      {loading ? (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>Loading published…</h3>
          <p className={styles.emptyDesc}>Reading live rows.</p>
        </div>
      ) : error ? (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>Could not load published</h3>
          <p className={styles.emptyDesc}>{error}</p>
          <div className={styles.emptyActions}>
            <button type="button" className={styles.secondaryBtn} onClick={() => void load()}>
              Retry
            </button>
          </div>
        </div>
      ) : designs.length === 0 ? (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>Nothing published yet</h3>
          <p className={styles.emptyDesc}>Publish a design from Preview &amp; Publish and it appears here.</p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
            padding: 16,
          }}
        >
          {designs.map((d) => (
            <DesignCard
              key={d.id}
              design={d}
              onOpen={() => void openDesignInStudio(d.id, 'design', onNavigate, onToast)}
              onPreview={() => void openDesignInStudio(d.id, 'preview', onNavigate, onToast)}
              onView={() => openDesign(d)}
            />
          ))}
        </div>
      )}
      {storesView}
    </div>
  );
}

/** A6 — Create Order: prefill an order draft from a published product. */
function CreateOrderScreen({ onToast }: { onToast: (message: string) => void }) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ orderNumber: string; total: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items: rows } = await listItems({ status: 'published', limit: 100 });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load published products.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const item = items.find((i) => i.id === selectedItemId) ?? null;
  const variant = item?.variants.find((v) => v.id === selectedVariantId) ?? null;
  const route = variant?.routes[0] ?? null;
  const designId = item?.designs[0]?.designId ?? null;

  const submit = async () => {
    if (!variant) return;
    setCreating(true);
    try {
      const res = await createOrder({
        productVariantId: variant.id,
        designPublicationId:
          item?.designs.find((d) => d.status === 'published')?.designId === undefined
            ? undefined
            : undefined,
        quantity,
      });
      setCreated({ orderNumber: res.orderNumber, total: res.total });
      onToast(`Order draft ${res.orderNumber} created.`);
    } catch (e) {
      onToast(`Could not create the order: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.screenContainer}>
      <div className={styles.listHeader}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Design Studio</span>
            <span className={styles.breadcrumbSep}>/</span>
            <span>My products</span>
          </div>
          <h1 className={styles.pageTitle}>Create Order</h1>
          <p className={styles.pageSubtitle}>
            Draft a production order from a published product — the envelope (design, product,
            supplier route) prefills from the live listing.
          </p>
        </div>
      </div>
      <div className={styles.tableCard}>
        {loading ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>Loading published products…</h3>
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>Could not load published products</h3>
            <p className={styles.emptyDesc}>{error}</p>
            <div className={styles.emptyActions}>
              <button type="button" className={styles.secondaryBtn} onClick={() => void load()}>
                Retry
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.emptyState}>
            <h3 className={styles.emptyTitle}>No published products yet</h3>
            <p className={styles.emptyDesc}>Publish a design first — it becomes orderable here.</p>
          </div>
        ) : (
          <div style={{ padding: 16, display: 'grid', gap: 12 }}>
            <label>
              Published product
              <select
                value={selectedItemId ?? ''}
                onChange={(e) => {
                  setSelectedItemId(e.target.value || null);
                  setSelectedVariantId(null);
                  setCreated(null);
                }}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              >
                <option value="">— choose a product —</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} — {money(i.price)}
                  </option>
                ))}
              </select>
            </label>
            {item && (
              <label>
                Variant
                <select
                  value={selectedVariantId ?? ''}
                  onChange={(e) => {
                    setSelectedVariantId(e.target.value || null);
                    setCreated(null);
                  }}
                  style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
                >
                  <option value="">— choose a variant —</option>
                  {item.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {[v.color, v.size].filter(Boolean).join(' / ') || v.sku || v.id.slice(0, 8)} —{' '}
                      {money(v.price)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {variant && (
              <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
                <div><b>Design:</b> {designId ?? '—'}</div>
                <div><b>Product:</b> {item?.id}</div>
                <div><b>Variant price (your set price):</b> {money(variant.price)}</div>
                <div>
                  <b>Supplier route (priority 1):</b>{' '}
                  {route
                    ? `${route.supplier} — cost ${money(route.costSnapshot)}, lead ${route.leadTimeDays ?? '—'} days`
                    : 'No fulfillment route on file'}
                </div>
                <label>
                  Quantity
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                    style={{ display: 'block', marginTop: 4, padding: 8, width: 120 }}
                  />
                </label>
                <div><b>Total:</b> {money(variant.price * quantity)}</div>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={creating}
                  onClick={() => void submit()}
                >
                  {creating ? 'Creating…' : 'Create order draft'}
                </button>
                {created && (
                  <div>
                    Order draft <b>{created.orderNumber}</b> created — total {money(created.total)}.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A6 — My Stores: the channels listings are live on. */
function MyStoresScreen() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items } = await listStores();
      setStores(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load stores.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <LiveStudioList
      domainLabel="Design Studio"
      groupName="My products"
      title="My Stores"
      subtitle="Storefronts your designed products publish to — channels recorded when a listing is published to them."
      cols={[
        { key: 'store', label: 'Store' },
        { key: 'channel', label: 'Channel' },
        { key: 'live', label: 'Products live', right: true },
        { key: 'status', label: 'Status' },
      ]}
      rows={stores.map((s) => ({
        store: s.name,
        channel: s.channelType ?? s.code,
        live: s.liveProducts,
        status: s.status,
      }))}
      loading={loading}
      error={error}
      onRetry={() => void load()}
      emptyTitle="No stores connected yet"
      emptyDesc="No channels are connected — connect a channel and publish a listing to it, and it appears here."
    />
  );
}

/** One row from GET /api/v1/rankings (unified doc §7). */
interface RankingRow {
  blankId: string;
  name: string;
  brand: string | null;
  department: string;
  supplierCatalogProductId: string | null;
  units30d: number;
  prior30d: number;
  trendPct: number | null;
  status: 'hot' | 'rising' | 'steady';
}

/** GET /api/v1/rankings — real order velocity; trendPct null = no prior baseline. */
async function listRankings(opts: {
  kind: 'best' | 'fast';
  dept?: string;
  limit?: number;
}): Promise<{
  rows: RankingRow[];
  meta: {
    kind: string;
    dept: string | null;
    ordersInWindow: number;
    orders30d: number;
    canonicalsWithSales: number;
    note: string | null;
  };
}> {
  const params = new URLSearchParams({ kind: opts.kind });
  if (opts.dept) params.set('dept', opts.dept);
  if (opts.limit) params.set('limit', String(opts.limit));
  const res = await fetch(`/api/v1/rankings?${params.toString()}`);
  if (!res.ok) {
    let message = `Rankings ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      /* keep the status message */
    }
    throw new Error(message);
  }
  return (await res.json()) as {
    rows: RankingRow[];
    meta: {
      kind: string;
      dept: string | null;
      ordersInWindow: number;
      orders30d: number;
      canonicalsWithSales: number;
      note: string | null;
    };
  };
}

/** A7 — Wizard: Best Selling / Fast Selling / by department, from real order rankings. */
function WizardScreen({
  kind,
  category,
  onNavigate,
  onToast,
}: {
  kind: 'best' | 'fast';
  category?: string;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (message: string) => void;
}) {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [meta, setMeta] = useState<{
    ordersInWindow: number;
    orders30d: number;
    canonicalsWithSales: number;
    note: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const label = category
    ? `${category} — ${kind === 'fast' ? 'Fast Selling' : 'Best Selling'}`
    : kind === 'fast'
      ? 'Fast Selling'
      : 'Best Selling';
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listRankings({ kind, dept: category, limit: 20 });
      setRows(res.rows);
      setMeta(res.meta);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load rankings.');
    } finally {
      setLoading(false);
    }
  }, [kind, category]);
  useEffect(() => {
    void load();
  }, [load]);

  const designRow = (row: RankingRow) => {
    if (!row.supplierCatalogProductId) {
      onToast('This ranking row has no keeper blank attached.');
      return;
    }
    void openBlankProductPage(row.supplierCatalogProductId, onNavigate, onToast);
  };

  const designSelected = async () => {
    const ids = [...selected]
      .map((i) => rows[i]?.supplierCatalogProductId)
      .filter((x): x is string => Boolean(x));
    const skipped = selected.size - ids.length;
    let added = 0;
    let dup = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await enqueue({ supplierCatalogProductId: id });
        added += 1;
      } catch (e) {
        if ((e as { status?: number }).status === 409) dup += 1;
        else failed.push(id);
      }
    }
    setSelected(new Set());
    if (failed.length > 0) {
      onToast(`Queue failed for ${failed.length} blank(s); ${added} added.`);
    } else if (added > 0) {
      onToast(
        `${added} added to the Design Queue${dup > 0 ? ` (${dup} already queued)` : ''}${skipped > 0 ? ` (${skipped} without a blank skipped)` : ''}.`,
      );
    } else {
      onToast('Those blanks are already in the Design Queue.');
    }
  };

  const statusLabel: Record<string, string> = { hot: 'Hot', rising: 'Rising', steady: 'Steady' };
  const subtitle =
    kind === 'best'
      ? `Ranked by real order velocity — ${meta?.canonicalsWithSales ?? 0} product${meta?.canonicalsWithSales === 1 ? '' : 's'} with recorded sales in the last 30 days; the rest rank by variant count. Click a row, or Design, to start designing it.`
      : `Ranked by sales trend — fastest-growing first. Click a row, or Design, to start designing it.`;
  return (
    <LiveStudioList
      domainLabel="Design Studio"
      groupName="Create wizard"
      title={label}
      subtitle={meta?.note ? `${subtitle} ${meta.note}` : subtitle}
      cols={[
        { key: 'product', label: 'Product' },
        { key: 'department', label: 'Department' },
        { key: 'units', label: 'Units 30d', right: true },
        { key: 'trend', label: 'Trend', right: true },
        { key: 'status', label: 'Status' },
      ]}
      rows={rows.map((r) => ({
        product: r.name,
        department: r.department,
        units: r.units30d,
        trend: r.trendPct == null ? '—' : `${r.trendPct >= 0 ? '+' : ''}${r.trendPct}%`,
        status: statusLabel[r.status] ?? r.status,
      }))}
      loading={loading}
      error={error}
      onRetry={() => void load()}
      emptyTitle="No ranked products yet"
      emptyDesc={meta?.note ?? 'No blanks in this category.'}
      onRowClick={(idx) => designRow(rows[idx])}
      selectable
      selected={selected}
      onToggleSelect={(idx) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(idx)) next.delete(idx);
          else next.add(idx);
          return next;
        })
      }
      onToggleSelectAll={() =>
        setSelected((prev) =>
          prev.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)),
        )
      }
      bulkActions={[{ label: 'Design selected', icon: 'palette', onClick: () => void designSelected() }]}
      onClearSelection={() => setSelected(new Set())}
      rowAction={{ label: 'Design', onClick: (idx) => designRow(rows[idx]) }}
    />
  );
}

/** A8 — Published Items & SKUs (Global Catalog): live products rows. */
function PublishedSkusScreen({
  onNavigate,
  onToast,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (message: string) => void;
}) {
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items: rows } = await listItems({ status: 'published', limit: 100 });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load published items.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const openItem = (item: ItemRow) => {
    if (!item.sourceProductId) {
      onToast('This listing has no blank attached.');
      return;
    }
    void openBlankProductPage(item.sourceProductId, onNavigate, onToast);
  };

  return (
    <LiveStudioList
      domainLabel="Catalog"
      groupName="Catalog"
      title="Published Items & SKUs"
      subtitle="Designs published from the Studio — live across all channels. Status comes from the product row; a reload keeps the listing."
      cols={[
        { key: 'product', label: 'Product' },
        { key: 'brand', label: 'Brand' },
        { key: 'colors', label: 'Colors' },
        { key: 'sizes', label: 'Sizes' },
        { key: 'supplier', label: 'Supplier' },
        { key: 'price', label: 'Price', right: true },
        { key: 'status', label: 'Status' },
      ]}
      rows={items.map((i) => ({
        product: i.name,
        brand: i.brand ?? '—',
        colors: i.colors.join(', ') || '—',
        sizes: i.sizes.join(', ') || '—',
        supplier: i.supplier ?? '—',
        price: money(i.price),
        status: i.status,
      }))}
      loading={loading}
      error={error}
      onRetry={() => void load()}
      emptyTitle="Nothing published yet"
      emptyDesc="Publish a design from Preview & Publish and its listing appears here."
      onRowClick={(idx) => openItem(items[idx])}
    />
  );
}

/** A9 — Designs & collections report: real aggregates, drill into rows. */
function DesignsReportScreen({ onToast }: { onToast: (message: string) => void }) {
  const [report, setReport] = useState<DesignsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ label: string; items: DesignListItem[] } | null>(null);
  const [drilling, setDrilling] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getDesignsReport());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the report.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const drillDesigns = async (label: string, opts: { status?: string; collectionId?: string }) => {
    setDrilling(true);
    try {
      const { items } = await listDesigns({ ...opts, limit: 100 });
      setDrill({ label, items });
    } catch (e) {
      onToast(`Drill failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setDrilling(false);
    }
  };

  if (loading || error || !report) {
    return (
      <LiveStudioList
        domainLabel="Reports"
        groupName="Catalog reports"
        title="Designs & collections report"
        subtitle="Designs, publications, collections and orders — live aggregates."
        cols={[]}
        rows={[]}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        emptyTitle="No report data"
        emptyDesc="No designs yet."
      />
    );
  }

  return (
    <div className={styles.screenContainer}>
      <div className={styles.listHeader}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Reports</span>
            <span className={styles.breadcrumbSep}>/</span>
            <span>Catalog reports</span>
          </div>
          <h1 className={styles.pageTitle}>Designs & collections report</h1>
          <p className={styles.pageSubtitle}>
            {report.totals.designs} designs · {report.totals.publications} publications ·{' '}
            {report.products.publishedPod} published POD products · {money(report.totals.orderRevenue)}{' '}
            order revenue. Click a row to drill into the real records.
          </p>
        </div>
      </div>
      <div className={styles.tableCard} style={{ padding: 16 }}>
        <h3>Designs by status</h3>
        {report.designsByStatus.map((s) => (
          <button
            key={s.status}
            type="button"
            className={styles.secondaryBtn}
            style={{ margin: '4px 8px 4px 0' }}
            onClick={() => void drillDesigns(`Designs — ${s.status}`, { status: s.status })}
          >
            {s.status}: {s.count}
          </button>
        ))}
        <h3 style={{ marginTop: 16 }}>Publications by status</h3>
        {report.publicationsByStatus.map((s) => (
          <button
            key={s.status}
            type="button"
            className={styles.secondaryBtn}
            style={{ margin: '4px 8px 4px 0' }}
            onClick={() => void drillDesigns(`Designs with ${s.status} publications`, {})}
          >
            {s.status}: {s.count}
          </button>
        ))}
        <h3 style={{ marginTop: 16 }}>Collections</h3>
        {report.collections.length === 0 && <p className={styles.muted}>No collections yet.</p>}
        {report.collections.map((c) => (
          <button
            key={c.collectionId}
            type="button"
            className={styles.secondaryBtn}
            style={{ margin: '4px 8px 4px 0' }}
            onClick={() =>
              void drillDesigns(`Collection ${c.collectionId.slice(0, 8)}`, {
                collectionId: c.collectionId,
              })
            }
          >
            {c.collectionId.slice(0, 8)}: {c.designCount} designs
          </button>
        ))}
        <p className={styles.muted}>Unfiled designs: {report.unfiledDesigns}</p>
        <h3 style={{ marginTop: 16 }}>Designs with orders</h3>
        {report.designsWithOrders.length === 0 && (
          <p className={styles.muted}>No design has an order yet.</p>
        )}
        {report.designsWithOrders.map((r) => (
          <div key={r.design.id} style={{ fontSize: 14, margin: '4px 0' }}>
            {r.design.name} — {r.orders} order{r.orders === 1 ? '' : 's'}, {r.units} units,{' '}
            {money(r.revenue)}
          </div>
        ))}
        {drilling && <p className={styles.muted}>Loading drill-down…</p>}
        {drill && (
          <div style={{ marginTop: 16 }}>
            <h3>{drill.label}</h3>
            {drill.items.length === 0 ? (
              <p className={styles.muted}>No records.</p>
            ) : (
              <ul style={{ fontSize: 14 }}>
                {drill.items.map((d) => (
                  <li key={d.id}>
                    {d.name} — {d.status} — {money(d.retail_price)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A9 — Design Studio settings: the Studio defaults. */
function DesignStudioSettingsScreen({ onToast }: { onToast: (message: string) => void }) {
  const [supplier, setSupplier] = useState('printify');
  const [markup, setMarkup] = useState('1.55');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSettings('design_studio');
      const data = res.data as { default_supplier?: unknown; price_markup?: unknown };
      if (typeof data.default_supplier === 'string') setSupplier(data.default_supplier);
      if (typeof data.price_markup === 'number') setMarkup(String(data.price_markup));
      setSavedAt(res.updatedAt);
      setIsDefault(res.isDefault);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const value = Number(markup);
    if (!(value > 0)) {
      onToast('The price markup must be a number above 0.');
      return;
    }
    setSaving(true);
    try {
      const res = await saveSettings('design_studio', {
        default_supplier: supplier,
        price_markup: value,
        price_rule: 'suggested',
      });
      setSavedAt(res.updatedAt);
      setIsDefault(false);
      onToast('Studio defaults saved.');
    } catch (e) {
      onToast(`Could not save: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.screenContainer}>
      <div className={styles.listHeader}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Settings</span>
            <span className={styles.breadcrumbSep}>/</span>
            <span>Catalog &amp; Design</span>
          </div>
          <h1 className={styles.pageTitle}>Design Studio</h1>
          <p className={styles.pageSubtitle}>
            Studio defaults. The price markup is a suggestion only — the user sets the price on
            the card before publishing; the suggestion shown on the card follows this markup.
          </p>
        </div>
      </div>
      <div className={styles.tableCard} style={{ padding: 16 }}>
        {loading ? (
          <p className={styles.muted}>Loading settings…</p>
        ) : error ? (
          <div>
            <p>{error}</p>
            <button type="button" className={styles.secondaryBtn} onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
            <label>
              Default supplier (keeper only)
              <select
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              >
                <option value="printify">Printify</option>
                <option value="printful">Printful</option>
                <option value="cloudprinter">Cloudprinter</option>
              </select>
            </label>
            <label>
              Suggested price markup (× cost, before shipping)
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              />
            </label>
            <div>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Saving…' : 'Save defaults'}
              </button>
            </div>
            <p className={styles.muted}>
              {isDefault
                ? 'Showing the platform defaults — nothing saved yet.'
                : `Saved${savedAt ? ` ${new Date(savedAt).toLocaleString()}` : ''}.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TabScreenRenderer({
  domain,
  screenId,
  dashboardController,
  onNavigate,
  onCapCreate,
  onCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
  wizardPrefill,
}: {
  domain: DomainKey;
  screenId: string;
  dashboardController: DashboardController;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCapCreate: (label: string) => void;
  onCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (message: string) => void;
  wizardPrefill?: { category: string; subcategory?: string } | null;
}) {
  // Peek adapter: finance screens call onOpenPeek(title, details).
  const peekTitled = useCallback(
    (title: string, details: Record<string, string | number>) => {
      onOpenPeek({ title, ...details }, 'finance');
    },
    [onOpenPeek]
  );

  if (domain === 'dashboard' && DASHBOARD_SCREEN_IDS.has(screenId)) {
    return (
      <DashboardScreenRenderer
        screenId={screenId}
        controller={dashboardController}
        onNavigate={onNavigate}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
        onOpenPeek={onOpenPeek}
        onToast={onToast}
      />
    );
  }

  // Cap Table screens now live inside the finance domain (executive decision).
  if (domain === 'finance' && CAP_TABLE_SCREEN_IDS.has(screenId)) {
    return (
      <CapTableScreenRenderer
        screenId={screenId}
        onGotoScreen={(scrId) => onNavigate(domain, scrId)}
        onCapCreate={onCapCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
        onOpenPeek={onOpenPeek}
        onToast={onToast}
      />
    );
  }

  if (domain === 'settings' && WS_SCREEN_IDS.has(screenId)) {
    return (
      <WorkspaceSettings
        screenId={screenId}
        onGotoScreen={(id) => onNavigate('settings', id)}
        onToast={onToast}
      />
    );
  }

  // ── Orders module pages ──
  if (domain === 'orders') {
    const ordersProps = {
      onNavigate,
      onToast,
      onCreate,
      onOpenCreateFlyout,
      onOpenPeek: peekTitled,
    };
    switch (screenId) {
      case 'orders-overview':
        return <OrdersOverview {...ordersProps} />;
      case 'orders':
        return <OrdersList {...ordersProps} />;
      case 'purchase-orders':
        return <PurchaseOrders {...ordersProps} />;
      case 'returns':
        return <ReturnsClaims {...ordersProps} />;
      case 'fulfillment-queue':
        return <FulfillmentQueue {...ordersProps} />;
      case 'batch-slips':
        return <BatchSlips {...ordersProps} />;
      case 'shipping-settings':
        return <ShippingSettings {...ordersProps} />;
      case 'inventory':
        return <InventoryView {...ordersProps} />;
      default:
        // Fall through to existing screen-specific renderers below
        break;
    }
  }

  // ── Design Studio: New design canvas (spec: upload/canvas.html) ──
  if (screenId === 'new-design') {
    return <DesignCanvasScreen onToast={onToast} onNavigate={onNavigate} />;
  }

  // ── Design Studio: dock tool screens (Upload, AI, Shapes, etc.) ──
  // These open the canvas with the matching dock panel pre-opened. Each
  // sidebar child under "New design" routes here — the canvas is the
  // host, the dock panel is what the user picked.
  const STUDIO_DOCK_MAP: Record<string, string> = {
    'studio-upload': 'Upload',
    'studio-images': 'Images',
    'studio-graphics': 'Graphics',
    'studio-templates': 'Graphics',
    'studio-shapes': 'Shapes',
    'studio-add-text': 'Text',
    'studio-ai': 'AI',
    'studio-themes': 'Themes',
    'studio-product-details': 'My library',
    'studio-layers': 'My library',
    'studio-layouts': 'My templates',
    'studio-files': 'Upload',
    'studio-shutterstock': 'Images',
  };
  if (STUDIO_DOCK_MAP[screenId]) {
    useDesignCanvas.getState().setCanvasDock(STUDIO_DOCK_MAP[screenId]);
    return <DesignCanvasScreen onToast={onToast} onNavigate={onNavigate} />;
  }
  // Settings sub-screens (grid, guides, bleeds, rulers, units, background,
  // reset) — these are canvas settings, not dock panels. They open the
  // canvas; the settings live in the canvas's own settings UI.
  if (['studio-settings', 'studio-show-grid', 'studio-show-guides', 'studio-show-bleeds', 'studio-show-rulers', 'studio-units', 'studio-background-color', 'studio-bg-none', 'studio-bg-palette', 'studio-bg-custom', 'studio-reset-settings'].includes(screenId)) {
    useDesignCanvas.getState().setCanvasDock(null);
    return <DesignCanvasScreen onToast={onToast} onNavigate={onNavigate} />;
  }

  // ── Design Studio: My products → Published renders as a TABLE (move 5).
  //    Rows = published listings + product cards + attached stores, with
  //    three-dot create actions per row.
  if (screenId === 'studio-published' || screenId === 'studio-my-stores') {
    return <MyProductsTable onToast={onToast} onNavigate={onNavigate} />;
  }

  // ── Design Studio: My products → Hidden.
  //    Lists all supplier_catalog_products where is_hidden = true — the
  //    ones the user eye-balled off the catalog (not eligible for search,
  //    not eligible for design). Reuses ErpProductCatalogScreen in hidden
  //    mode so the same card grid + eye-icon restore works.
  if (screenId === 'studio-hidden') {
    return (
      <ErpProductCatalogScreen
        onToast={onToast}
        onNavigate={onNavigate}
        category="All"
        hidden
      />
    );
  }

  // ── Design Studio: My orders (restored — move 5 keeps it under My products).
  //    Reuses the OrdersList table (same shape as the global Orders screen).
  if (screenId === 'studio-my-orders') {
    return <OrdersList onNavigate={onNavigate} onToast={onToast} />;
  }

  // ── Design Studio: Create wizard (move 4) — launched from the wizard icon
  //    next to a catalog child. The prefill carries the category/subcategory.
  if (screenId === 'studio-wizard') {
    return <CreateWizard onToast={onToast} onNavigate={onNavigate} initialCategory={wizardPrefill?.category} initialSubcategory={wizardPrefill?.subcategory} />;
  }

  // ── Design Studio: catalog screens — the ONE Product Catalog page
  //    (EXACT 1:1 of upload/product cards.html). One shared catalog:
  //    every catalog entry point (department, category, subcategory,
  //    legacy tab) lands on the same designed page.
  if (screenId.startsWith('studio-') && screenId.includes('--')) {
    const node = catalogNodeFor(screenId);
    return <ErpProductCatalogScreen onToast={onToast} onNavigate={onNavigate} {...node} />;
  }

  if (screenId.startsWith('studio-') && !['studio-wizard', 'studio-design', 'studio-upload', 'studio-images', 'studio-graphics', 'studio-add-text', 'studio-ai', 'studio-shapes', 'studio-themes', 'studio-templates', 'studio-product-details', 'studio-layers', 'studio-layouts', 'studio-files', 'studio-shutterstock', 'studio-settings', 'studio-show-grid', 'studio-show-guides', 'studio-show-bleeds', 'studio-show-rulers', 'studio-units', 'studio-background-color', 'studio-bg-none', 'studio-bg-palette', 'studio-bg-custom', 'studio-reset-settings', 'studio-my-library', 'studio-my-collections', 'studio-my-stores', 'studio-my-templates', 'studio-my-orders', 'studio-published', 'studio-hidden'].includes(screenId)) {
    const node = catalogNodeFor(screenId);
    return <ErpProductCatalogScreen onToast={onToast} onNavigate={onNavigate} {...node} />;
  }

  // ── Tasks & Projects (spec: upload/task-projects.html) ──
  if (screenId === 'tasks') {
    return <TasksProjectsScreen onToast={onToast} />;
  }

  // ── Marketing screens ──
  const mktProps = { onToast, onNavigate };
  switch (screenId) {
    case 'mkt-publishing-overview': return <PublishingOverviewScreen {...mktProps} />;
    case 'mkt-create-content': return <CreateContentScreen {...mktProps} />;
    case 'mkt-oversight': return <OversightScreen onToast={onToast} />;
    case 'mkt-promotions': return <PromotionsScreen onToast={onToast} />;
    case 'mkt-newsletter': return <NewsletterScreen onToast={onToast} />;
    case 'mkt-automation': return <AutomationScreen onToast={onToast} />;
    case 'mkt-adcenter': return <AdCenterScreen {...mktProps} />;
    case 'mkt-campaigns': return <CampaignsScreen onToast={onToast} />;
    case 'mkt-adsets': return <AdSetsScreen onToast={onToast} />;
    case 'mkt-creatives': return <CreativesScreen onToast={onToast} />;
    case 'mkt-audiences': return <AudiencesScreen onToast={onToast} />;
    case 'mkt-pixels': return <PixelsScreen onToast={onToast} />;
    case 'mkt-adspend': return <AdSpendScreen {...mktProps} />;
    case 'mkt-advertisers': return <AdvertisersScreen onToast={onToast} />;
    default: break;
  }

  // ── Design Studio: Product page — EXACT 1:1 of upload/erp product page.html.
  // Full screen: gallery | info | order summary, fulfillment network, 6 tabs.
  if (screenId === 'product-page') {
    return <ErpProductPageScreen onToast={onToast} onNavigate={onNavigate} />;
  }

  // ── Design Studio: Product Catalog — EXACT 1:1 of upload/product cards.html.
  // The one shared catalog page (cards + Filter + New Product).
  if (screenId === 'product-catalog') {
    return <ErpProductCatalogScreen onToast={onToast} onNavigate={onNavigate} category="All" />;
  }

  // ── Design Studio: Preview & Publish page (spec: upload/mockup preview.html) ──
  if (screenId === 'design-preview') {
    return <DesignPreviewScreen onToast={onToast} onNavigate={onNavigate} />;
  }

  // ── Finance: Expenses & Bills (spec §3) ──
  if (screenId === 'bills-overview') {
    return (
      <ExpensesBillsOverview
        onNavigate={onNavigate}
        onToast={onToast}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
      />
    );
  }

  if (screenId === 'bills') {
    return (
      <BillsScreen
        onPayBills={() => onNavigate('finance', 'bill-payments')}
        onCreateBill={() => onCreate('Bill')}
        onOpenPeek={peekTitled}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'bill_payments' || screenId === 'bill-payments') {
    return (
      <PayBills
        onNavigate={onNavigate}
        onToast={onToast}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
      />
    );
  }

  if (screenId === 'vendors' || screenId === 'suppliers') {
    // Contacts → Vendors/Suppliers: the unified parties view scoped to the
    // role — real rows from acct_vendors / suppliers via /api/parties,
    // same table UX, peek drawer, row actions and canonical create drawer.
    const role = screenId === 'vendors' ? 'Vendor' : 'Supplier';
    return <ContactsParties onToast={onToast} onNavigate={onNavigate as (d: string, s: string) => void} onCreate={onCreate} initialRole={role} />;
  }

  if (screenId === 'suppliers-directory' || screenId === 'suppliers-vendors' || screenId === 'suppliers-sellers') {
    // Suppliers domain → Supplier Directory group: the same unified parties
    // view, scoped by role. Sellers are a contact type (sellers table pair)
    // — same list, same drawer, same profile as every other party.
    const role = screenId === 'suppliers-vendors' ? 'Vendor' : screenId === 'suppliers-sellers' ? 'Seller' : 'Supplier';
    return <ContactsParties onToast={onToast} onNavigate={onNavigate as (d: string, s: string) => void} onCreate={onCreate} initialRole={role} />;
  }

  if (screenId === 'catalog-parties') {
    // Catalog → Products & Variants → "Suppliers / Vendors / Sellers": the
    // unified parties list (every role) — same data, same drawer.
    return <ContactsParties onToast={onToast} onNavigate={onNavigate as (d: string, s: string) => void} onCreate={onCreate} />;
  }

  if (screenId === 'leads') {
    return <LeadsPipelineSupabase onToast={onToast} onNavigate={onNavigate as (d: string, s: string) => void} />;
  }

  if (screenId === 'appointments') {
    // CRM Appointments — crm_appointments domain (day/week/list calendar,
    // create action, confirm→check-in→start→complete / cancel / no-show loop).
    return <AppointmentsScreen onToast={onToast} />;
  }

  if (screenId === 'segments') {
    // Real segments on crm_segments + crm_segment_memberships: list with
    // member counts, detail drawer with members, create-on-save.
    return <SegmentsScreen onToast={onToast} onNavigate={onNavigate as (d: string, s: string) => void} />;
  }

  if (screenId === 'templates') {
    // CRM message templates on crm_message_templates — full CRUD.
    return <TemplatesScreen onToast={onToast} />;
  }

  if (screenId === 'attention') {
    // Attention Queue — real signals: conversations awaiting reply, overdue
    // tasks, due lead follow-ups, unresolved attention flags.
    return <AttentionQueueScreen onToast={onToast} />;
  }

  if (screenId === 'customer-queue') {
    // Customer Queue — the reply / assign / resolve loop on live
    // conversations + messages.
    return <CustomerQueueScreen onToast={onToast} />;
  }

  if (screenId === 'seller-queue') {
    // Seller Queue — appeals awaiting decision (grant/deny) + open violations.
    return <SellerQueueScreen onToast={onToast} />;
  }

  if (screenId === 'support-overview') {
    // Support Overview (spec: upload/support_extract/Support/support overview.html)
    return <SupportOverviewScreen onToast={onToast} onNavigate={onNavigate} />;
  }

  if (screenId === 'tickets') {
    // Support Tickets (spec: upload/support_extract/Support/tickets.html)
    return <SupportTicketsScreen onToast={onToast} onNavigate={onNavigate} />;
  }

  if (screenId === 'agent-workspace') {
    // Omnichannel Inbox agent workspace (spec: upload/support_extract/Support/support workspace.html)
    return <SupportWorkspaceScreen onToast={onToast} onNavigate={onNavigate} />;
  }

  if (screenId === 'messages') {
    // Omnichannel Inbox — every conversation across web_form / email / chat
    // with the full reply / assign / resolve loop.
    return (
      <ConversationInbox
        onToast={onToast}
        title="Omnichannel inbox"
        subtitle="Every conversation across web form, email and chat — reply, assign, resolve."
      />
    );
  }

  // ── Contacts: Seller relationships (Supabase seller tables) ──
  if (screenId === 'sellers') {
    // Seller list = profiles ∪ enforcement-derived seller_ids (/api/sellers).
    return <SellersScreen onToast={onToast} onNavigate={onNavigate as (d: string, s: string) => void} />;
  }

  if (screenId === 'seller-detail') {
    // Dossier for the seller selected in the Sellers list (sellerStore carries
    // the selection): profile, violations, appeals, posts.
    return <SellerDetailScreen onToast={onToast} onNavigate={onNavigate as (d: string, s: string) => void} />;
  }

  if (screenId === 'seller-feed') {
    // seller_social_posts feed, newest first, with a working publish flow.
    return <SellerFeedScreen onToast={onToast} />;
  }

  if (screenId === 'seller-onboarding') {
    // Onboarding queue: self-serve profiles + appeals awaiting decision.
    return <SellerOnboardingScreen onToast={onToast} onNavigate={onNavigate as (d: string, s: string) => void} />;
  }

  if (screenId === 'purchase-orders') {
    return (
      <PurchaseOrderScreen onToast={onToast} />
    );
  }

  // ── Finance: Accounting (spec §2) ──
  if (screenId === 'accounting') {
    return (
      <AccountingOverviewScreen
        onNavigate={onNavigate}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
        onOpenPeek={peekTitled}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'bank') {
    return (
      <BankTransactionsScreen
        onNavigate={onNavigate}
        onOpenPeek={peekTitled}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'coa') {
    return (
      <ChartOfAccountsScreen
        onNavigate={onNavigate}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'cash-flow') {
    return (
      <CashFlowScreen
        onNavigate={onNavigate}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'quick-view') {
    return (
      <ReportsScreen
        onNavigate={onNavigate}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'rules') {
    return (
      <BankRulesScreen
        onNavigate={onNavigate}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'receipts') {
    return (
      <ReceiptsScreen
        onNavigate={onNavigate}
        onOpenPeek={peekTitled}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'reconcile') {
    return (
      <ReconcileScreen
        onNavigate={onNavigate}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'tax-overview') {
    return (
      <BusinessTaxOverview
        onNavigate={onNavigate}
        onToast={onToast}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
      />
    );
  }

  if (screenId === 'tax-summary') {
    return (
      <TaxSummary
        onNavigate={onNavigate}
        onToast={onToast}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
      />
    );
  }

  if (screenId === 'tax-filing') {
    return (
      <YearEndFiling
        onNavigate={onNavigate}
        onToast={onToast}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
      />
    );
  }

  if (screenId === 'sales-overview') {
    return (
      <SalesOverview
        onNavigate={onNavigate}
        onToast={onToast}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
      />
    );
  }

  if (screenId === 'sales-transactions') {
    return (
      <SalesTransactions
        onNavigate={onNavigate}
        onToast={onToast}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
        onOpenPeek={onOpenPeek}
      />
    );
  }

  if (screenId === 'invoices') {
    return (
      <InvoicesScreen
        onNavigate={onNavigate as (d: string, s: string) => void}
        onToast={onToast}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
        onOpenPeek={onOpenPeek}
      />
    );
  }

  if (screenId === 'estimates') {
    // Finance → Sales → Estimates: the full Document list (store-backed,
    // DocumentEngine-wired). The contacts-scoped view is not routed here.
    return <EstimatesScreen onToast={onToast} />;
  }

  if (screenId === 'payment-links') {
    return (
      <PaymentLinksScreen
        onNavigate={onNavigate}
        onToast={onToast}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
        onOpenPeek={onOpenPeek}
      />
    );
  }

  if (screenId === 'products') {
    // The global Catalog products list — REAL data from the products table.
    // Every row/name click opens ProductProfile (the tabbed product page that
    // mirrors PartyProfile). Finance's “Products and services” uses the same
    // list — one catalog, one screen.
    return (
      <CatalogProductsScreen
        onNavigate={onNavigate as (d: string, s: string) => void}
        onToast={onToast}
        backLabel={domain === 'catalog' ? 'Products' : 'Products and services'}
      />
    );
  }

  if (screenId === 'parties') {
    return <ContactsParties onToast={onToast} onNavigate={onNavigate as (d: string, s: string) => void} onCreate={onCreate} />;
  }

  if (screenId === 'crm-overview') {
    return <CrmOverviewSupabase onToast={onToast} onNavigate={onNavigate as (d: string, s: string) => void} onCreate={onCreate} />;
  }

  if (screenId === 'customers') {
    return <CustomersSupabase onToast={onToast} onNavigate={onNavigate as (d: string, s: string) => void} onCreate={onCreate} />;
  }

  if (screenId === 'statements') {
    return <StatementsScreen onToast={onToast} />;
  }

  // ── Published Items & SKUs — merge store-published products into the
  //    catalog rows. Designs published from the Studio go live here.
  if (screenId === 'published-skus') {
    const published = useDesignCanvas.getState().published;
    if (published.length > 0) {
      const existing = DEMO_ROWS['published-skus'] || [];
      const publishedRows = published.map((p) => ({
        product: p.name,
        brand: p.brand,
        color: p.color,
        sizes: p.sizes.join('/'),
        supplier: p.supplier,
        status: 'Live',
      }));
      // Prepend published rows that aren't already in the list.
      const existingNames = new Set(existing.map((r: DemoRow) => String(r.product)));
      const newRows = publishedRows.filter((r) => !existingNames.has(r.product));
      if (newRows.length > 0) {
        DEMO_ROWS['published-skus'] = [...newRows, ...existing];
      }
    }
  }

  // ── Design Studio catalog lists (Lane 5) — live blanks + eligibility,
  //    not the shellData demo rows. ──
  if (screenId === 'collection') {
    return <CollectionScreen onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'published') {
    return <PublishedDesignsScreen onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-my-stores') {
    return <MyStoresScreen />;
  }
  if (screenId === 'studio-men') {
    return <StudioCatalogScreen category="Men" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-women') {
    return <StudioCatalogScreen category="Women" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-children') {
    return <StudioCatalogScreen category="Children" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-home-living') {
    return <StudioCatalogScreen category="Home Living" onNavigate={onNavigate} onToast={onToast} />;
  }

  // ── Catalog departments — the sidebar catalog mirrors the top-bar
  //    navigation (13 departments). ──
  if (screenId === 'studio-apparel') {
    return <StudioCatalogScreen category="Apparel" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-wall-art') {
    return <StudioCatalogScreen category="Wall Art" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-headwear') {
    return <StudioCatalogScreen category="Headwear" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-cards-stationery') {
    return <StudioCatalogScreen category="Cards & stationery" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-business-commercial') {
    return <StudioCatalogScreen category="Business & commercial" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-keepsakes') {
    return <StudioCatalogScreen category="Keepsakes" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-accessories') {
    return <StudioCatalogScreen category="Accessories" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-drinkware') {
    return <StudioCatalogScreen category="Drinkware" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-technology') {
    return <StudioCatalogScreen category="Technology" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-games-puzzles') {
    return <StudioCatalogScreen category="Games & Puzzles" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-wellness') {
    return <StudioCatalogScreen category="Wellness" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'studio-collections-occasions') {
    return <StudioCatalogScreen category="Collections & Occasions" onNavigate={onNavigate} onToast={onToast} />;
  }

  // ── Create wizard lists (Lane 5) — real order rankings. ──
  if (screenId === 'wizard-best-selling') {
    return <WizardScreen kind="best" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'wizard-fast-selling') {
    return <WizardScreen kind="fast" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'wizard-men') {
    return <WizardScreen kind="best" category="Men" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'wizard-women') {
    return <WizardScreen kind="best" category="Women" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'wizard-children') {
    return <WizardScreen kind="best" category="Children" onNavigate={onNavigate} onToast={onToast} />;
  }
  if (screenId === 'wizard-home-living') {
    return <WizardScreen kind="best" category="Home Living" onNavigate={onNavigate} onToast={onToast} />;
  }

  const screen = findScreen(domain, screenId);
  const domainLabel = DOMAINS[domain].label;
  const def = SCREEN_DEFS[screen.id] || SCREEN_DEFS[screen.id.replace(/-/g, '_')];

  let resolvedConfig: ListScreenConfig | OverviewScreenConfig;
  if (def) {
    resolvedConfig = def;
  } else if (screen.type === 'overview') {
    resolvedConfig = {
      mode: 'overview',
      title: screen.label,
      subtitle: 'Overview screen.',
      kpis: [],
      actions: [],
    };
  } else {
    resolvedConfig = {
      mode: 'list',
      key: '__empty',
      title: screen.label,
      subtitle: 'List screen — view tabs, filter bar, bulk bar, row menu, right peek drawer.',
      family: 'generic',
      newLabel: 'Create',
      cols: [{ key: 'name', label: 'Name' }],
      tabs: ['All'],
      emptyTitle: `No ${screen.label.toLowerCase()} yet`,
      emptySteps: 'Import from a file or create your first record to get started.',
    };
  }

  return resolvedConfig.mode === 'overview' ? (
    <OverviewView
      cfg={resolvedConfig}
      domain={domain}
      domainLabel={domainLabel}
      groupName={screen.group}
      activeScreenId={screenId}
      onCreate={onCreate}
      onOpenCreateFlyout={onOpenCreateFlyout}
      onNavigate={onNavigate}
    />
  ) : (
    <ListView
      cfg={resolvedConfig}
      domainLabel={domainLabel}
      groupName={screen.group}
      onCreate={onCreate}
      onOpenCreateFlyout={onOpenCreateFlyout}
      onOpenPeek={onOpenPeek}
      onToast={onToast}
      onNavigate={onNavigate}
    />
  );
}

export default function ScreenContent({
  openTabs,
  activeTabKey,
  dashboardController,
  onNavigate,
  onCapCreate,
  onCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
  sideRailCollapsed,
  focusMode,
  onToggleFocus,
  onOpenStandalone,
  wizardPrefill,
}: ScreenContentProps) {
  const offsetClass = focusMode
    ? styles.contentOffsetFocus
    : sideRailCollapsed
      ? styles.contentOffsetCollapsed
      : '';
  return (
    <div className={`${styles.contentOffset} ${offsetClass}`}>
      <main
        id="screen"
        className={`${styles.screenMain} ${focusMode ? styles.screenMainFocus : ''}`}
      >
        {/* Page view controls — below the tab bar, on every page */}
        <div className={styles.focusBar} role="toolbar" aria-label="Page view controls">
          <button
            type="button"
            className={styles.focusBtn}
            data-standalone-open
            title="Open this page in a new tab"
            aria-label="Open this page in a new tab"
            onClick={onOpenStandalone}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
              open_in_new
            </span>
          </button>
          <button
            type="button"
            className={`${styles.focusBtn} ${focusMode ? styles.focusBtnActive : ''}`}
            data-focus-toggle
            title={
              focusMode
                ? 'Exit full screen'
                : 'Full screen — hide sidebar & tabs'
            }
            aria-label={
              focusMode
                ? 'Exit full screen'
                : 'Full screen — hide sidebar & tabs'
            }
            aria-pressed={focusMode}
            onClick={onToggleFocus}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>
              {focusMode ? 'close_fullscreen' : 'open_in_full'}
            </span>
          </button>
        </div>
        {openTabs.map((tab) => {
          const isActive = tab.key === activeTabKey;
          return (
            <div
              key={tab.key}
              className={isActive ? styles.tabPaneActive : styles.tabPaneHidden}
            >
              <TabScreenRenderer
                domain={tab.domain}
                screenId={tab.screenId}
                dashboardController={dashboardController}
                onNavigate={onNavigate}
                onCapCreate={onCapCreate}
                onCreate={onCreate}
                onOpenCreateFlyout={onOpenCreateFlyout}
                onOpenPeek={onOpenPeek}
                onToast={onToast}
                wizardPrefill={tab.domain === 'design' ? wizardPrefill : undefined}
              />
            </div>
          );
        })}
      </main>
    </div>
  );
}
