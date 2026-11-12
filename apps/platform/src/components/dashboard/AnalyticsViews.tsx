'use client';

import { useState } from 'react';
import {
  ANALYTICS_CONVERSION_FUNNEL,
  ATTRIBUTION_CHANNELS,
  COHORT_RETENTION_ROWS,
  EXPLORER_DATASETS,
  ExplorerDatasetKey,
  ExplorerRow,
  INITIAL_SAVED_EXPLORER_VIEWS,
  SavedExplorerView,
  TOP_SKU_ANALYTICS,
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

/* 1. Analytics Overview (/analytics) */
export function AnalyticsOverviewView({
  onNavigate,
  onOpenPeek,
  onToast,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [range, setRange] = useState<'7D' | '30D' | '90D' | 'YTD'>('30D');
  const [channel, setChannel] = useState<string>('All channels');
  const [focusTab, setFocusTab] = useState<
    'all' | 'conversion' | 'cohorts' | 'skus' | 'attribution'
  >('all');

  const rangeMult =
    range === '7D' ? 0.24 : range === '30D' ? 1 : range === '90D' ? 2.85 : 9.25;
  const chanMult =
    channel === 'Storefront'
      ? 0.64
      : channel === 'Marketplace'
        ? 0.22
        : channel === 'B2B Invoices'
          ? 0.14
          : 1;
  const mult = rangeMult * chanMult;

  const getHeatCellClass = (val: number) => {
    if (val === 0) return styles.heatEmpty;
    if (val === 100) return styles.heat100;
    if (val >= 38) return styles.heatHigh;
    if (val >= 30) return styles.heatMid;
    return styles.heatLow;
  };

  const showConversion = focusTab === 'all' || focusTab === 'conversion';
  const showAttribution = focusTab === 'all' || focusTab === 'attribution';
  const showCohorts = focusTab === 'all' || focusTab === 'cohorts';
  const showSkus = focusTab === 'all' || focusTab === 'skus';

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.breadcrumb}>
          <span>Dashboard</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Analytics</span>
        </div>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Analytics</h1>
            <p className={styles.subtitle}>
              Storefront conversion funnel, cohort retention, SKU velocity &amp; Ad Center attribution
            </p>
          </div>
          <div className={styles.toolbarRight}>
            <select
              className={styles.selectControl}
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="All channels">All channels</option>
              <option value="Storefront">Storefront (D2C)</option>
              <option value="Marketplace">Marketplace Sellers</option>
              <option value="B2B Invoices">B2B Invoices</option>
            </select>

            <div className={styles.segmented}>
              {(['7D', '30D', '90D', 'YTD'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`${styles.segBtn} ${
                    range === r ? styles.segBtnBlueActive : ''
                  }`}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                const cols = [
                  { key: 'sku', label: 'SKU' },
                  { key: 'name', label: 'Name' },
                  { key: 'category', label: 'Category' },
                  { key: 'supplier', label: 'Supplier' },
                  { key: 'units', label: 'Units' },
                  { key: 'gmv', label: 'GMV' },
                  { key: 'marginPct', label: 'Margin %' },
                  { key: 'cvrPct', label: 'CVR %' },
                  { key: 'rmaPct', label: 'RMA %' },
                  { key: 'status', label: 'Status' },
                ];
                exportToCsv(TOP_SKU_ANALYTICS as unknown as Record<string, unknown>[], cols, 'analytics-overview');
                onToast(`Exported ${TOP_SKU_ANALYTICS.length} records to CSV`);
              }}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                download
              </span>
              Export
            </button>

            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => onNavigate('dashboard', 'explorer')}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                table_chart
              </span>
              Explore raw data
            </button>
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className={styles.tableCard}>
        <div className={styles.viewTabsBar}>
          {[
            ['all', 'All Analytics'],
            ['conversion', 'Traffic & Conversion'],
            ['cohorts', 'Revenue & Cohorts'],
            ['skus', 'Catalog & SKU Velocity'],
            ['attribution', 'Marketing & Attribution'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`${styles.viewTab} ${
                focusTab === id ? styles.viewTabActive : ''
              }`}
              onClick={() =>
                setFocusTab(
                  id as 'all' | 'conversion' | 'cohorts' | 'skus' | 'attribution'
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Analytics KPI Cards */}
      <div className={styles.kpiGrid4}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Storefront &amp; Channel Sessions</span>
          <div className={styles.kpiValue}>
            {Math.round(148200 * mult).toLocaleString()}
          </div>
          <div className={styles.kpiDeltaPos}>+14.8% vs prior {range}</div>
          <div className={styles.kpiSubtext}>68.4K product &amp; design mockup views</div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Checkout Conversion Rate</span>
          <div className={styles.kpiValue}>3.81%</div>
          <div className={styles.kpiDeltaPos}>+0.42 pts vs benchmark</div>
          <div className={styles.kpiSubtext}>
            {Math.round(5640 * mult).toLocaleString()} completed paid orders
          </div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Customer LTV : CAC Ratio</span>
          <div className={styles.kpiValue}>10.8×</div>
          <div className={styles.kpiDeltaPos}>$184 LTV · $17.04 blended CAC</div>
          <div className={styles.kpiSubtext}>Payback on first order (62% gross margin)</div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>90-Day Repeat Buyer Share</span>
          <div className={styles.kpiValue}>39.4%</div>
          <div className={styles.kpiDeltaPos}>+3.1 pts YoY</div>
          <div className={styles.kpiSubtext}>1.2% net RMA / defect rate</div>
        </div>
      </div>

      {/* Conversion Funnel + Marketing Attribution */}
      {(showConversion || showAttribution) && (
        <div className={styles.grid12}>
          {showConversion && (
            <div
              className={`${styles.panelCard} ${
                showAttribution ? styles.span5 : styles.span8
              }`}
            >
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>Storefront Conversion Funnel</h2>
                  <p className={styles.panelSubtitle}>
                    Session → Mockup View → Cart → Checkout → Paid Order
                  </p>
                </div>
                <span className={styles.badgeNeutral}>{channel}</span>
              </div>

              <div className={styles.funnelList}>
                {ANALYTICS_CONVERSION_FUNNEL.map((st) => (
                  <div key={st.step} className={styles.funnelRowBtn}>
                    <div className={styles.funnelTopLine}>
                      <span className={styles.funnelStageName}>{st.step}</span>
                      <div className={styles.funnelRightStats}>
                        <span className={styles.funnelCountStrong}>
                          {Math.round(st.count * mult).toLocaleString()}
                        </span>
                        <span className={styles.funnelMuted}>
                          {st.pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className={styles.barTrack}>
                      <svg className={styles.barSvg} aria-hidden="true">
                        <rect
                          className={styles.fillTeal}
                          x="0"
                          y="0"
                          width={`${Math.max(4, st.pct)}%`}
                          height="10"
                          rx="3"
                        />
                      </svg>
                    </div>
                    <div className={styles.kpiSubtext}>{st.dropoff}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showAttribution && (
            <div
              className={`${styles.panelCard} ${
                showConversion ? styles.span7 : styles.span8
              }`}
            >
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>
                    Ad Center Multi-Channel Attribution &amp; ROAS
                  </h2>
                  <p className={styles.panelSubtitle}>
                    Meta, Google Shopping, TikTok Spark Ads &amp; CRM Newsletter
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.btnLinkGreen}
                  onClick={() => onNavigate('marketing', 'social')}
                >
                  Open Marketing →
                </button>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={styles.th}>Channel</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Spend</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Orders</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Attr. GMV</th>
                      <th className={`${styles.th} ${styles.thRight}`}>ROAS</th>
                      <th className={`${styles.th} ${styles.thRight}`}>CAC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ATTRIBUTION_CHANNELS.map((ch) => (
                      <tr
                        key={ch.channel}
                        className={styles.tr}
                        onClick={() =>
                          onOpenPeek(
                            {
                              name: ch.channel,
                              campaigns: ch.campaignCount,
                              spend: `$${Math.round(ch.spend * rangeMult).toLocaleString()}`,
                              orders: Math.round(ch.orders * mult),
                              attributedGmv: `$${Math.round(ch.attributedGmv * mult).toLocaleString()}`,
                              roas: ch.roas > 0 ? `${ch.roas.toFixed(2)}x` : 'Organic',
                              status: 'Active',
                            },
                            'attribution'
                          )
                        }
                      >
                        <td className={styles.td}>
                          <div>{ch.channel}</div>
                          <div className={styles.tdMuted}>
                            {ch.campaignCount > 0
                              ? `${ch.campaignCount} active campaigns`
                              : 'Zero paid media spend'}
                          </div>
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          ${Math.round(ch.spend * rangeMult).toLocaleString()}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {Math.round(ch.orders * mult).toLocaleString()}
                        </td>
                        <td
                          className={`${styles.td} ${styles.tdRight} ${styles.tdPos}`}
                        >
                          ${Math.round(ch.attributedGmv * mult).toLocaleString()}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {ch.roas > 0 ? `${ch.roas.toFixed(2)}×` : '—'}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {ch.cac > 0 ? `$${ch.cac.toFixed(2)}` : '$0.00'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cohort Retention Matrix + Top SKUs */}
      {(showCohorts || showSkus) && (
        <div className={styles.grid12}>
          {showCohorts && (
            <div
              className={`${styles.panelCard} ${
                showSkus ? styles.span6 : styles.span8
              }`}
            >
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>
                    Monthly Customer Retention Cohorts
                  </h2>
                  <p className={styles.panelSubtitle}>
                    Repeat purchase rate from acquisition month (M0) through M5
                  </p>
                </div>
                <span className={styles.badgeNeutral}>6-Month Matrix</span>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={styles.th}>Cohort</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Buyers</th>
                      <th className={`${styles.th} ${styles.thRight}`}>LTV</th>
                      <th className={styles.th}>M0</th>
                      <th className={styles.th}>M1</th>
                      <th className={styles.th}>M2</th>
                      <th className={styles.th}>M3</th>
                      <th className={styles.th}>M4</th>
                      <th className={styles.th}>M5</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COHORT_RETENTION_ROWS.map((row) => (
                      <tr key={row.cohort} className={styles.tr}>
                        <td className={styles.td}>{row.cohort}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {row.customers.toLocaleString()}
                        </td>
                        <td
                          className={`${styles.td} ${styles.tdRight} ${styles.tdPos}`}
                        >
                          {row.ltv}
                        </td>
                        {[row.m0, row.m1, row.m2, row.m3, row.m4, row.m5].map(
                          (val, i) => (
                            <td
                              key={i}
                              className={`${styles.heatCellBase} ${getHeatCellClass(val)}`}
                            >
                              {val > 0 ? `${val}%` : '—'}
                            </td>
                          )
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showSkus && (
            <div
              className={`${styles.panelCard} ${
                showCohorts ? styles.span6 : styles.span8
              }`}
            >
              <div className={styles.panelHeader}>
                <div>
                  <h2 className={styles.panelTitle}>
                    Top Performing SKUs &amp; Designs
                  </h2>
                  <p className={styles.panelSubtitle}>
                    Click any SKU row to inspect unit economics &amp; RMA rate
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.btnLinkGreen}
                  onClick={() => onNavigate('catalog', 'products')}
                >
                  Catalog →
                </button>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.dataTable}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={styles.th}>SKU / Product</th>
                      <th className={styles.th}>Supplier</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Units</th>
                      <th className={`${styles.th} ${styles.thRight}`}>GMV</th>
                      <th className={`${styles.th} ${styles.thRight}`}>Margin</th>
                      <th className={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {TOP_SKU_ANALYTICS.map((sku) => (
                      <tr
                        key={sku.sku}
                        className={styles.tr}
                        onClick={() =>
                          onOpenPeek(
                            {
                              name: `${sku.sku} · ${sku.name}`,
                              category: sku.category,
                              supplier: sku.supplier,
                              units: Math.round(sku.units * mult),
                              gmv: `$${Math.round(sku.gmv * mult).toLocaleString()}`,
                              margin: `${sku.marginPct}%`,
                              conversionRate: `${sku.cvrPct}%`,
                              rmaRate: `${sku.rmaPct}%`,
                              status: sku.status,
                            },
                            'catalog'
                          )
                        }
                      >
                        <td className={styles.td}>
                          <div>{sku.name}</div>
                          <div className={styles.tdMuted}>
                            {sku.sku} · {sku.category} · RMA {sku.rmaPct}%
                          </div>
                        </td>
                        <td className={styles.td}>{sku.supplier}</td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {Math.round(sku.units * mult).toLocaleString()}
                        </td>
                        <td
                          className={`${styles.td} ${styles.tdRight} ${styles.tdPos}`}
                        >
                          ${Math.round(sku.gmv * mult).toLocaleString()}
                        </td>
                        <td className={`${styles.td} ${styles.tdRight}`}>
                          {sku.marginPct.toFixed(1)}%
                        </td>
                        <td className={styles.td}>
                          <StatusPill status={sku.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* 2. Analytics Explorer View (/analytics/explorer — Ad-hoc Pivot + Full P1 List-System) */
const DEFAULT_EXPLORER_COLUMNS: CustomColumnItem[] = [
  { key: 'dimension', label: 'Primary Dimension', visible: true },
  { key: 'secondaryDim', label: 'Supplier / Method', visible: true },
  { key: 'segment', label: 'Segment', visible: true },
  { key: 'orders', label: 'Orders', visible: true, right: true },
  { key: 'gmv', label: 'GMV', visible: true, right: true },
  { key: 'discountsAndRefunds', label: 'Promos & RMAs', visible: true, right: true },
  { key: 'netRevenue', label: 'Net Revenue', visible: true, right: true },
  { key: 'cogs', label: 'Supplier COGS', visible: true, right: true },
  { key: 'grossProfit', label: 'Gross Profit', visible: true, right: true },
  { key: 'marginPct', label: 'Margin %', visible: true, right: true },
  { key: 'varianceAmount', label: 'vs Plan', visible: true, right: true },
  { key: 'status', label: 'Status', visible: true },
  { key: 'createdBy', label: 'Created by', visible: false },
  { key: 'createdOn', label: 'Created on', visible: false },
  { key: 'modifiedBy', label: 'Modified by', visible: false },
  { key: 'modifiedOn', label: 'Modified on', visible: false },
];

export function AnalyticsExplorerView({
  onNavigate,
  onOpenPeek,
  onToast,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [dataset, setDataset] = useState<ExplorerDatasetKey>('orders_gmv');
  const [activeTab, setActiveTab] = useState<string>('All rows');
  const [search, setSearch] = useState<string>('');
  const [dateRange, setDateRange] = useState<string>('Last 30 days');
  const [showVisualChart, setShowVisualChart] = useState<boolean>(true);

  const [savedViews, setSavedViews] = useState<SavedExplorerView[]>(
    INITIAL_SAVED_EXPLORER_VIEWS
  );
  const [activeSavedId, setActiveSavedId] = useState<string>('sv-1');
  const [addingView, setAddingView] = useState<boolean>(false);
  const [newViewName, setNewViewName] = useState<string>('');

  const [sortKey, setSortKey] = useState<keyof ExplorerRow>('gmv');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [splitMenuOpen, setSplitMenuOpen] = useState<boolean>(false);
  const [customizeOpen, setCustomizeOpen] = useState<boolean>(false);

  const [columns, setColumns] = useState<CustomColumnItem[]>(
    DEFAULT_EXPLORER_COLUMNS
  );
  const [visualCfg, setVisualCfg] = useState<VisualFormatConfig>({
    currencySymbol: true,
    parenthesesNegatives: true,
    decimals: 0,
    divideBy1000: false,
  });

  const rawRows = EXPLORER_DATASETS[dataset];

  const filtered = rawRows
    .filter((r) => {
      if (activeTab === 'Positive margin (>55%)') return r.marginPct >= 55;
      if (activeTab === 'High volume') return r.orders >= 800;
      if (activeTab === 'Flagged variance') return r.varianceAmount < 0;
      return true;
    })
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.dimension.toLowerCase().includes(q) ||
        r.secondaryDim.toLowerCase().includes(q) ||
        r.segment.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
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

  const maxGmv = Math.max(1, ...filtered.map((r) => r.gmv));
  const visibleColumns = columns.filter((c) => c.visible);

  const handleSort = (key: string) => {
    const k = key as keyof ExplorerRow;
    if (sortKey === k) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(k);
      setSortDir('desc');
    }
  };

  const handleApplySavedView = (sv: SavedExplorerView) => {
    setActiveSavedId(sv.id);
    setDataset(sv.dataset);
    setActiveTab(sv.tab);
    setVisualCfg((prev) => ({ ...prev, divideBy1000: sv.divideBy1000 }));
    setSelectedIds([]);
  };

  const handleSaveCurrentView = () => {
    const clean = newViewName.trim();
    if (!clean) return;
    const nv: SavedExplorerView = {
      id: `sv-${Date.now()}`,
      name: clean,
      dataset,
      tab: activeTab,
      divideBy1000: visualCfg.divideBy1000,
    };
    setSavedViews((prev) => [...prev, nv]);
    setActiveSavedId(nv.id);
    setNewViewName('');
    setAddingView(false);
    onToast(`Saved Explorer view "${clean}"`);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((r) => r.id));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const renderExplorerCell = (row: ExplorerRow, colKey: string) => {
    if (colKey === 'status') {
      return <StatusPill status={row.status} />;
    }
    if (colKey === 'orders') {
      return row.orders.toLocaleString();
    }
    if (colKey === 'marginPct') {
      return `${row.marginPct.toFixed(1)}%`;
    }
    if (
      colKey === 'gmv' ||
      colKey === 'discountsAndRefunds' ||
      colKey === 'netRevenue' ||
      colKey === 'cogs' ||
      colKey === 'grossProfit' ||
      colKey === 'varianceAmount'
    ) {
      const num = row[colKey];
      return formatVisualNumber(num, visualCfg);
    }
    return String(row[colKey as keyof ExplorerRow] ?? '');
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.breadcrumb}>
          <span>Dashboard</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Analytics</span>
        </div>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Explorer</h1>
            <p className={styles.subtitle}>
              Multi-dimensional pivot &amp; P1 list-system across GMV, SKUs, cohorts, and marketplace sellers
            </p>
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.segmented}>
              <button
                type="button"
                className={`${styles.segBtn} ${
                  showVisualChart ? styles.segBtnActive : ''
                }`}
                onClick={() => setShowVisualChart(true)}
              >
                Chart + Table
              </button>
              <button
                type="button"
                className={`${styles.segBtn} ${
                  !showVisualChart ? styles.segBtnActive : ''
                }`}
                onClick={() => setShowVisualChart(false)}
              >
                Table only
              </button>
            </div>

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

            <div className={styles.splitWrap}>
              <button
                type="button"
                className={styles.splitMain}
                onClick={() => {
                  const cols = columns
                    .filter((c) => c.visible)
                    .map((c) => ({ key: c.key, label: c.label }));
                  exportToCsv(filtered as unknown as Record<string, unknown>[], cols, 'analytics-explorer');
                  onToast(`Exported ${filtered.length} records to CSV`);
                }}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>
                  download
                </span>
                Export CSV
              </button>
              <button
                type="button"
                className={styles.splitArrow}
                onClick={() => setSplitMenuOpen((p) => !p)}
              >
                <span className={`material-symbols-outlined ${styles.icon16}`}>
                  expand_more
                </span>
              </button>
              {splitMenuOpen && (
                <div className={styles.dropdownMenu}>
                  <div className={styles.dropdownHeader}>Explorer actions</div>
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      setAddingView(true);
                      setSplitMenuOpen(false);
                    }}
                  >
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      bookmark_add
                    </span>
                    Save current view
                  </button>
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      onToast('Scheduled Monday 8:00 AM email digest');
                      setSplitMenuOpen(false);
                    }}
                  >
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      schedule_send
                    </span>
                    Schedule weekly digest
                  </button>
                  <div className={styles.dropdownDivider} />
                  <button
                    type="button"
                    className={styles.dropdownItem}
                    onClick={() => {
                      setSplitMenuOpen(false);
                      onNavigate('finance', 'quick-view');
                    }}
                  >
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      bar_chart
                    </span>
                    Open Finance Reports
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Saved Views Bar */}
      <div className={styles.savedViewsBar}>
        <span className={styles.createActionsLabel}>Saved views:</span>
        {savedViews.map((sv) => (
          <button
            key={sv.id}
            type="button"
            className={`${styles.savedViewPill} ${
              activeSavedId === sv.id ? styles.savedViewPillActive : ''
            }`}
            onClick={() => handleApplySavedView(sv)}
          >
            <span className={`material-symbols-outlined ${styles.icon14}`}>
              bookmark
            </span>
            {sv.name}
          </button>
        ))}
        {addingView ? (
          <>
            <input
              type="text"
              className={styles.inlineInputSm}
              placeholder="View name…"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
            />
            <button
              type="button"
              className={styles.btnGhostSm}
              onClick={handleSaveCurrentView}
            >
              Save
            </button>
            <button
              type="button"
              className={styles.btnGhostSm}
              onClick={() => setAddingView(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className={styles.btnGhostSm}
            onClick={() => setAddingView(true)}
          >
            + Save view
          </button>
        )}
      </div>

      {/* Optional Visual Distribution Panel */}
      {showVisualChart && filtered.length > 0 && (
        <div className={styles.panelCard}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                GMV &amp; Gross Profit Distribution ({dateRange})
              </h2>
              <p className={styles.panelSubtitle}>
                Live comparison across {filtered.length} slices · Blue = GMV, Green = Gross Profit
              </p>
            </div>
            <div className={styles.segmented}>
              {(
                [
                  ['orders_gmv', 'Orders & GMV'],
                  ['sku_velocity', 'Products & SKUs'],
                  ['customer_cohorts', 'Customer Cohorts'],
                  ['seller_ledger', 'Seller Ledger'],
                ] as [ExplorerDatasetKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.segBtn} ${
                    dataset === key ? styles.segBtnBlueActive : ''
                  }`}
                  onClick={() => {
                    setDataset(key);
                    setSelectedIds([]);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.funnelList}>
            {filtered.map((row) => {
              const gmvPct = (row.gmv / maxGmv) * 100;
              const profPct = (Math.max(0, row.grossProfit) / maxGmv) * 100;
              return (
                <div key={row.id}>
                  <div className={styles.funnelTopLine}>
                    <span className={styles.funnelStageName}>
                      {row.dimension} ({row.secondaryDim})
                    </span>
                    <div className={styles.funnelRightStats}>
                      <span className={styles.funnelCountStrong}>
                        {formatVisualNumber(row.gmv, visualCfg)} GMV
                      </span>
                      <span className={styles.tdPos}>
                        {formatVisualNumber(row.grossProfit, visualCfg)} GP (
                        {row.marginPct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div className={styles.barTrackTall}>
                    <svg className={styles.barSvg} aria-hidden="true">
                      <rect
                        className={styles.fillBlue}
                        x="0"
                        y="0"
                        width={`${gmvPct.toFixed(1)}%`}
                        height="8"
                      />
                      <rect
                        className={styles.fillPrimary}
                        x="0"
                        y="8"
                        width={`${profPct.toFixed(1)}%`}
                        height="8"
                      />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* P1 List-System Table */}
      <div className={styles.tableCard}>
        <div className={styles.viewTabsBar}>
          {[
            'All rows',
            'Positive margin (>55%)',
            'High volume',
            'Flagged variance',
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
              placeholder="Filter dimension, supplier, status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className={styles.selectControl}
            value={dataset}
            onChange={(e) => {
              setDataset(e.target.value as ExplorerDatasetKey);
              setSelectedIds([]);
            }}
          >
            <option value="orders_gmv">Dataset: Orders &amp; GMV</option>
            <option value="sku_velocity">Dataset: Products &amp; SKUs</option>
            <option value="customer_cohorts">Dataset: Customer Cohorts</option>
            <option value="seller_ledger">Dataset: Seller Ledger</option>
          </select>

          <select
            className={styles.selectControl}
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="Last 7 days">Date: Last 7 days</option>
            <option value="Last 30 days">Date: Last 30 days</option>
            <option value="Q4 2026 QTD">Date: Q4 2026 QTD</option>
            <option value="YTD 2026">Date: YTD 2026</option>
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
                onClick={() =>
                  onToast(`Exported ${selectedIds.length} selected Explorer rows`)
                }
              >
                Export selected
              </button>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => {
                  onToast(`Pinned ${selectedIds.length} slices to Executive GMV`);
                  setSelectedIds([]);
                }}
              >
                Pin to Executive Overview
              </button>
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => {
                  onToast(`Sent ${selectedIds.length} slices to Attention Queue`);
                  setSelectedIds([]);
                }}
              >
                Flag variance
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
                      onChange={toggleSelectAll}
                    />
                  </th>
                  {visibleColumns.map((col, cIdx) => (
                    <th
                      key={col.key}
                      className={`${styles.th} ${styles.thSortable} ${
                        cIdx === 0 ? styles.thSticky : ''
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
                          dimension: row.dimension,
                          supplierOrMethod: row.secondaryDim,
                          segment: row.segment,
                          orders: row.orders,
                          gmv: formatVisualNumber(row.gmv, visualCfg),
                          netRevenue: formatVisualNumber(row.netRevenue, visualCfg),
                          cogs: formatVisualNumber(row.cogs, visualCfg),
                          grossProfit: formatVisualNumber(
                            row.grossProfit,
                            visualCfg
                          ),
                          margin: `${row.marginPct.toFixed(1)}%`,
                          createdBy: `${row.createdBy} (${row.createdOn})`,
                          status: row.status,
                        },
                        'explorer'
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
                        onChange={() => toggleRow(row.id)}
                      />
                    </td>
                    {visibleColumns.map((col, cIdx) => {
                      const rawNum = row[col.key as keyof ExplorerRow];
                      const isNeg = typeof rawNum === 'number' && rawNum < 0;
                      const isProfit = col.key === 'grossProfit';
                      return (
                        <td
                          key={col.key}
                          className={`${styles.td} ${
                            cIdx === 0 ? styles.tdSticky : ''
                          } ${col.right ? styles.tdRight : ''} ${
                            isNeg ? styles.tdNeg : isProfit ? styles.tdPos : ''
                          }`}
                        >
                          {renderExplorerCell(row, col.key)}
                        </td>
                      );
                    })}
                    <td
                      className={styles.tdAction}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={styles.moreBtn}
                        onClick={() =>
                          setOpenRowMenuId((prev) =>
                            prev === row.id ? null : row.id
                          )
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
                              setOpenRowMenuId(null);
                              onOpenPeek(
                                {
                                  dimension: row.dimension,
                                  orders: row.orders,
                                  gmv: formatVisualNumber(row.gmv, visualCfg),
                                  grossProfit: formatVisualNumber(
                                    row.grossProfit,
                                    visualCfg
                                  ),
                                  status: row.status,
                                },
                                'explorer'
                              );
                            }}
                          >
                            Inspect in Peek Drawer
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              setOpenRowMenuId(null);
                              onNavigate('orders', 'orders');
                            }}
                          >
                            Drill into Orders
                          </button>
                          <button
                            type="button"
                            className={styles.dropdownItem}
                            onClick={() => {
                              setOpenRowMenuId(null);
                              onToast(`Exported slice ${row.dimension}`);
                            }}
                          >
                            Export slice CSV
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
                query_stats
              </span>
            </div>
            <div className={styles.emptyTitle}>No matching Explorer slices</div>
            <div className={styles.emptyStepsRow}>
              <span className={styles.emptyStepPill}>1. Adjust tab or search</span>
              <span className={styles.emptyStepPill}>2. Switch fact dataset</span>
              <span className={styles.emptyStepPill}>3. Import external CSV</span>
            </div>
            <div className={styles.emptyBtnRow}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => onToast('Opened CSV Dataset Importer')}
              >
                Import
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  setActiveTab('All rows');
                  setSearch('');
                }}
              >
                Reset filters
              </button>
            </div>
          </div>
        )}
      </div>

      {customizeOpen && (
        <ListCustomizeDrawer
          title="Analytics Explorer"
          columns={columns}
          visualConfig={visualCfg}
          onSave={(nextCols, nextVis) => {
            setColumns(nextCols);
            setVisualCfg(nextVis);
          }}
          onClose={() => setCustomizeOpen(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
