'use client';

import { useState } from 'react';
import {
  ALL_CREATE_ACTION_OPTIONS,
  AttentionQueueItem,
  CATEGORY_MARGINS,
  CHANNEL_PERFORMANCE,
  EXEC_PERIOD_MULTIPLIER,
  ExecCompare,
  ExecPeriod,
  GMV_WATERFALL_BRIDGE,
  INTEGRATION_VITALS,
  MONTHLY_GMV_SERIES,
  OPS_PIPELINE_FUNNEL,
  OPS_VITALS_BY_WINDOW,
  OpsFunnelStage,
  OpsKpiTile,
  OpsWindow,
  SMART_SUGGESTIONS,
  SUPPLIER_MARGINS,
  SetupStepItem,
} from '@/data/dashboardData';
import { DemoRow, DomainKey } from '@/data/shellData';
import StatusPill from '@/components/StatusPill';
import { exportToCsv } from '@/lib/csvExport';
import styles from './DashboardScreens.module.css';

function CreateActionsStrip({
  pinnedLabels,
  onCreate,
  onOpenCustomize,
  onOpenCreateFlyout,
}: {
  pinnedLabels: string[];
  onCreate: (label: string) => void;
  onOpenCustomize: () => void;
  onOpenCreateFlyout: () => void;
}) {
  return (
    <div className={styles.createActionsRow}>
      <span className={styles.createActionsLabel}>Create actions:</span>
      {pinnedLabels.map((label) => {
        const meta = ALL_CREATE_ACTION_OPTIONS.find((o) => o.label === label);
        return (
          <button
            key={label}
            type="button"
            className={styles.createChip}
            onClick={() => onCreate(label)}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>
              {meta?.icon || 'add'}
            </span>
            {label}
          </button>
        );
      })}
      <button
        type="button"
        className={styles.customizeActionsBtn}
        onClick={onOpenCustomize}
        title="Select up to 10 actions"
      >
        <span className={`material-symbols-outlined ${styles.icon14}`}>tune</span>
        Customize ({pinnedLabels.length}/10)
      </button>
      <button
        type="button"
        className={styles.showAllChip}
        onClick={onOpenCreateFlyout}
      >
        <span className={`material-symbols-outlined ${styles.icon16}`}>apps</span>
        Show all
      </button>
    </div>
  );
}

/* ── Analytics switcher + views (master account overview) ── */
type AnalyticsViewKey = 'gmv' | 'orders' | 'products' | 'support' | 'analytics';

const ANALYTICS_BUTTONS: { key: AnalyticsViewKey; label: string; icon: string }[] = [
  { key: 'gmv', label: 'GMV', icon: 'trending_up' },
  { key: 'orders', label: 'Orders', icon: 'local_shipping' },
  { key: 'products', label: 'Products', icon: 'inventory_2' },
  { key: 'support', label: 'Support', icon: 'support_agent' },
  { key: 'analytics', label: 'Analytics', icon: 'bar_chart' },
];

function AnalyticsSwitcher({
  active,
  onChange,
  onNavigate,
  onToast,
}: {
  active: AnalyticsViewKey;
  onChange: (key: AnalyticsViewKey) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
}) {
  return (
    <div>
      <div className={styles.analyticsSwitcher}>
        {ANALYTICS_BUTTONS.map((btn) => (
          <button
            key={btn.key}
            type="button"
            className={`${styles.analyticsBtn} ${
              active === btn.key ? styles.analyticsBtnActive : ''
            }`}
            onClick={() => onChange(btn.key)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {btn.icon}
            </span>
            {btn.label}
          </button>
        ))}
        <button
          type="button"
          className={styles.analyticsBtn}
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            const cols = [
              { key: 'label', label: 'Metric' },
              { key: 'value', label: 'Value' },
              { key: 'delta', label: 'Delta' },
            ];
            const rows: Record<string, unknown>[] = [
              { label: 'GMV (MTD)', value: '$482,940', delta: '+8.4% vs prior' },
              { label: 'Net Revenue', value: '$446,120', delta: '+6.1% vs prior' },
              { label: 'Gross Profit', value: '$260,534', delta: '58.4% margin' },
              { label: 'Contribution', value: '$152,573', delta: '34.2% margin' },
              { label: 'AOV', value: '$85.63', delta: '+$2.10 vs prior' },
              { label: 'Orders', value: '5,640', delta: '+412 vs prior' },
            ];
            exportToCsv(rows, cols, 'analytics-snapshot');
            onToast(`Exported ${rows.length} records to CSV`);
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
          Export
        </button>
      </div>
      {active === 'gmv' && <GmvAnalyticsView onNavigate={onNavigate} />}
      {active === 'orders' && <OrdersAnalyticsView onNavigate={onNavigate} />}
      {active === 'products' && <ProductsAnalyticsView onNavigate={onNavigate} />}
      {active === 'support' && <SupportAnalyticsView onNavigate={onNavigate} />}
      {active === 'analytics' && <AnalyticsDetailView onNavigate={onNavigate} />}
    </div>
  );
}

function GmvAnalyticsView({ onNavigate }: { onNavigate: (d: DomainKey, s: string) => void }) {
  const kpis = [
    { label: 'GMV (MTD)', value: '$482,940', delta: '+8.4% vs prior', tone: 'pos' },
    { label: 'Net Revenue', value: '$446,120', delta: '+6.1% vs prior', tone: 'pos' },
    { label: 'Gross Profit', value: '$260,534', delta: '58.4% margin', tone: 'pos' },
    { label: 'Contribution', value: '$152,573', delta: '34.2% margin', tone: 'pos' },
    { label: 'AOV', value: '$85.63', delta: '+$2.10 vs prior', tone: 'pos' },
    { label: 'Orders', value: '5,640', delta: '+412 vs prior', tone: 'pos' },
  ];
  const channels = [
    { name: 'Shopify Store', value: 248120, pct: 51, fill: 'Green' },
    { name: 'Amazon', value: 96420, pct: 20, fill: 'Navy' },
    { name: 'TikTok Shop', value: 72440, pct: 15, fill: 'Teal' },
    { name: 'Etsy', value: 38620, pct: 8, fill: 'Maroon' },
    { name: 'What Not', value: 19340, pct: 4, fill: 'Amber' },
    { name: 'eBay', value: 8000, pct: 2, fill: 'Green' },
  ];
  const maxVal = Math.max(...channels.map((c) => c.value));
  return (
    <div className={styles.analyticsView}>
      <h3 className={styles.analyticsViewTitle}>GMV &amp; Margin Analytics</h3>
      <p className={styles.analyticsViewSub}>
        Gross merchandise volume, net revenue, and contribution by channel. MTD · Nov 2026.
      </p>
      <div className={styles.analyticsKpiGrid}>
        {kpis.map((k) => (
          <div key={k.label} className={styles.analyticsKpiCard}>
            <span className={styles.analyticsKpiLabel}>{k.label}</span>
            <span className={styles.analyticsKpiValue}>{k.value}</span>
            <span
              className={`${styles.analyticsKpiDelta} ${
                k.tone === 'pos'
                  ? styles.analyticsKpiDeltaPos
                  : k.tone === 'neg'
                  ? styles.analyticsKpiDeltaNeg
                  : styles.analyticsKpiDeltaNeutral
              }`}
            >
              {k.delta}
            </span>
          </div>
        ))}
      </div>
      <h4 className={styles.analyticsViewTitle} style={{ fontSize: 13, marginBottom: 10 }}>
        GMV by channel
      </h4>
      {channels.map((c) => (
        <div key={c.name} className={styles.analyticsBarRow}>
          <span className={styles.analyticsBarLabel}>{c.name}</span>
          <div className={styles.analyticsBarTrack}>
            <div
              className={`${styles.analyticsBarFill} ${
                styles[`analyticsBarFill${c.fill}` as keyof typeof styles] || styles.analyticsBarFillGreen
              }`}
              style={{ width: `${(c.value / maxVal) * 100}%` }}
            />
          </div>
          <span className={styles.analyticsBarValue}>
            ${c.value.toLocaleString()} · {c.pct}%
          </span>
        </div>
      ))}
      <button
        type="button"
        className={styles.analyticsBtn}
        style={{ marginTop: 12 }}
        onClick={() => onNavigate('reports', 'report-exec-gmv')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        Open full GMV report
      </button>
    </div>
  );
}

function OrdersAnalyticsView({ onNavigate }: { onNavigate: (d: DomainKey, s: string) => void }) {
  const kpis = [
    { label: 'Orders (MTD)', value: '5,640', delta: '+7.9% vs prior', tone: 'pos' },
    { label: 'Unfulfilled', value: '42', delta: '6 due <4h SLA', tone: 'neg' },
    { label: 'Avg cycle time', value: '4.2 hrs', delta: '−0.8 hrs', tone: 'pos' },
    { label: 'On-time ship', value: '96.4%', delta: '+1.2 pts', tone: 'pos' },
    { label: 'Returns', value: '38', delta: '0.7% rate', tone: 'neutral' },
    { label: 'Open RMAs', value: '4', delta: '3 reprints', tone: 'neg' },
  ];
  const stages = [
    { name: 'Unfulfilled & Preflight', value: 42, pct: 100, fill: 'Maroon' },
    { name: 'Routed to POD Supplier', value: 118, pct: 90, fill: 'Navy' },
    { name: 'In Print & QC', value: 84, pct: 70, fill: 'Teal' },
    { name: 'Shipped / In-Transit', value: 312, pct: 55, fill: 'Green' },
    { name: 'Delivered & Settled', value: 1290, pct: 40, fill: 'Green' },
  ];
  const maxVal = Math.max(...stages.map((s) => s.value));
  return (
    <div className={styles.analyticsView}>
      <h3 className={styles.analyticsViewTitle}>Orders Analytics</h3>
      <p className={styles.analyticsViewSub}>
        Fulfillment pipeline, cycle times, and return health. MTD · Nov 2026.
      </p>
      <div className={styles.analyticsKpiGrid}>
        {kpis.map((k) => (
          <div key={k.label} className={styles.analyticsKpiCard}>
            <span className={styles.analyticsKpiLabel}>{k.label}</span>
            <span className={styles.analyticsKpiValue}>{k.value}</span>
            <span
              className={`${styles.analyticsKpiDelta} ${
                k.tone === 'pos'
                  ? styles.analyticsKpiDeltaPos
                  : k.tone === 'neg'
                  ? styles.analyticsKpiDeltaNeg
                  : styles.analyticsKpiDeltaNeutral
              }`}
            >
              {k.delta}
            </span>
          </div>
        ))}
      </div>
      <h4 className={styles.analyticsViewTitle} style={{ fontSize: 13, marginBottom: 10 }}>
        Order-to-Cash pipeline volume
      </h4>
      {stages.map((s) => (
        <div key={s.name} className={styles.analyticsBarRow}>
          <span className={styles.analyticsBarLabel}>{s.name}</span>
          <div className={styles.analyticsBarTrack}>
            <div
              className={`${styles.analyticsBarFill} ${
                styles[`analyticsBarFill${s.fill}` as keyof typeof styles] || styles.analyticsBarFillGreen
              }`}
              style={{ width: `${(s.value / maxVal) * 100}%` }}
            />
          </div>
          <span className={styles.analyticsBarValue}>{s.value.toLocaleString()} orders</span>
        </div>
      ))}
      <button
        type="button"
        className={styles.analyticsBtn}
        style={{ marginTop: 12 }}
        onClick={() => onNavigate('orders', 'orders-overview')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        Open Orders overview
      </button>
    </div>
  );
}

function ProductsAnalyticsView({ onNavigate }: { onNavigate: (d: DomainKey, s: string) => void }) {
  const kpis = [
    { label: 'Active SKUs', value: '1,240', delta: '+38 new', tone: 'pos' },
    { label: 'Published', value: '1,180', delta: '95.2%', tone: 'pos' },
    { label: 'In review', value: '4', delta: '2 low DPI', tone: 'neg' },
    { label: 'Avg margin', value: '54.8%', delta: '+1.4 pts', tone: 'pos' },
    { label: 'Bundles', value: '86', delta: '+12', tone: 'pos' },
    { label: 'Channels live', value: '8', delta: '2 pending', tone: 'neutral' },
  ];
  const products = [
    { name: 'Classic Tee', sku: 'TEE-001', supplier: 'Printful', price: '$24.00', margin: '62%', status: 'Published' },
    { name: 'Canvas Tote', sku: 'TOTE-014', supplier: 'Gelato', price: '$18.00', margin: '55%', status: 'Published' },
    { name: 'Mug 11oz', sku: 'MUG-003', supplier: 'Printify', price: '$14.00', margin: '48%', status: 'Draft' },
    { name: 'Hoodie V2', sku: 'HUD-022', supplier: 'Printful', price: '$48.00', margin: '58%', status: 'Published' },
    { name: 'Poster A2', sku: 'PST-009', supplier: 'Gelato', price: '$22.00', margin: '64%', status: 'Published' },
  ];
  return (
    <div className={styles.analyticsView}>
      <h3 className={styles.analyticsViewTitle}>Products &amp; Variants Analytics</h3>
      <p className={styles.analyticsViewSub}>
        SKU health, margins, and catalog review status. MTD · Nov 2026.
      </p>
      <div className={styles.analyticsKpiGrid}>
        {kpis.map((k) => (
          <div key={k.label} className={styles.analyticsKpiCard}>
            <span className={styles.analyticsKpiLabel}>{k.label}</span>
            <span className={styles.analyticsKpiValue}>{k.value}</span>
            <span
              className={`${styles.analyticsKpiDelta} ${
                k.tone === 'pos'
                  ? styles.analyticsKpiDeltaPos
                  : k.tone === 'neg'
                  ? styles.analyticsKpiDeltaNeg
                  : styles.analyticsKpiDeltaNeutral
              }`}
            >
              {k.delta}
            </span>
          </div>
        ))}
      </div>
      <table className={styles.analyticsTable}>
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th>Supplier</th>
            <th>Price</th>
            <th>Margin</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.sku}>
              <td><strong>{p.name}</strong></td>
              <td>{p.sku}</td>
              <td>{p.supplier}</td>
              <td>{p.price}</td>
              <td>{p.margin}</td>
              <td>
                <span
                  className={
                    p.status === 'Published'
                      ? styles.analyticsKpiDeltaPos
                      : styles.analyticsKpiDeltaNeg
                  }
                  style={{ fontWeight: 600 }}
                >
                  {p.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className={styles.analyticsBtn}
        style={{ marginTop: 12 }}
        onClick={() => onNavigate('catalog', 'catalog-overview')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        Open Catalog overview
      </button>
    </div>
  );
}

function SupportAnalyticsView({ onNavigate }: { onNavigate: (d: DomainKey, s: string) => void }) {
  const kpis = [
    { label: 'Open tickets', value: '47', delta: '+8 new today', tone: 'neg' },
    { label: 'Median reply', value: '14m', delta: '−3m vs 7d', tone: 'pos' },
    { label: 'SLA health', value: '96.2%', delta: '+0.4 pts', tone: 'pos' },
    { label: 'CSAT', value: '4.6/5', delta: '+0.2', tone: 'pos' },
    { label: 'Escalations', value: '3', delta: '2 billing', tone: 'neg' },
    { label: 'RMAs open', value: '4', delta: '3 reprints', tone: 'neutral' },
  ];
  const queues = [
    { name: 'Attention Queue', value: 8, fill: 'Maroon' },
    { name: 'Customer Queue', value: 8, fill: 'Navy' },
    { name: 'Seller Queue', value: 7, fill: 'Teal' },
  ];
  const maxVal = Math.max(...queues.map((q) => q.value));
  return (
    <div className={styles.analyticsView}>
      <h3 className={styles.analyticsViewTitle}>Support Analytics</h3>
      <p className={styles.analyticsViewSub}>
        Ticket volume, SLA performance, and queue health. MTD · Nov 2026.
      </p>
      <div className={styles.analyticsKpiGrid}>
        {kpis.map((k) => (
          <div key={k.label} className={styles.analyticsKpiCard}>
            <span className={styles.analyticsKpiLabel}>{k.label}</span>
            <span className={styles.analyticsKpiValue}>{k.value}</span>
            <span
              className={`${styles.analyticsKpiDelta} ${
                k.tone === 'pos'
                  ? styles.analyticsKpiDeltaPos
                  : k.tone === 'neg'
                  ? styles.analyticsKpiDeltaNeg
                  : styles.analyticsKpiDeltaNeutral
              }`}
            >
              {k.delta}
            </span>
          </div>
        ))}
      </div>
      <h4 className={styles.analyticsViewTitle} style={{ fontSize: 13, marginBottom: 10 }}>
        Queue volume
      </h4>
      {queues.map((q) => (
        <div key={q.name} className={styles.analyticsBarRow}>
          <span className={styles.analyticsBarLabel}>{q.name}</span>
          <div className={styles.analyticsBarTrack}>
            <div
              className={`${styles.analyticsBarFill} ${
                styles[`analyticsBarFill${q.fill}` as keyof typeof styles] || styles.analyticsBarFillGreen
              }`}
              style={{ width: `${(q.value / maxVal) * 100}%` }}
            />
          </div>
          <span className={styles.analyticsBarValue}>{q.value} items</span>
        </div>
      ))}
      <button
        type="button"
        className={styles.analyticsBtn}
        style={{ marginTop: 12 }}
        onClick={() => onNavigate('support', 'support-overview')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        Open Support overview
      </button>
    </div>
  );
}

function AnalyticsDetailView({ onNavigate }: { onNavigate: (d: DomainKey, s: string) => void }) {
  const kpis = [
    { label: 'Sessions (MTD)', value: '48,210', delta: '+12.4%', tone: 'pos' },
    { label: 'Conversion', value: '3.8%', delta: '+0.4 pts', tone: 'pos' },
    { label: 'AOV', value: '$85.63', delta: '+$2.10', tone: 'pos' },
    { label: 'Bounce', value: '38.2%', delta: '−2.1 pts', tone: 'pos' },
    { label: 'New visitors', value: '62%', delta: '+4 pts', tone: 'pos' },
    { label: 'Cart abandon', value: '24.1%', delta: '−1.8 pts', tone: 'pos' },
  ];
  const channels = [
    { name: 'Organic search', value: 18420, pct: 38, fill: 'Green' },
    { name: 'Paid social', value: 12080, pct: 25, fill: 'Navy' },
    { name: 'Direct', value: 8420, pct: 17, fill: 'Teal' },
    { name: 'Email', value: 5280, pct: 11, fill: 'Maroon' },
    { name: 'Referral', value: 4010, pct: 9, fill: 'Amber' },
  ];
  const maxVal = Math.max(...channels.map((c) => c.value));
  return (
    <div className={styles.analyticsView}>
      <h3 className={styles.analyticsViewTitle}>Analytics Overview</h3>
      <p className={styles.analyticsViewSub}>
        Traffic, conversion, and channel attribution. MTD · Nov 2026.
      </p>
      <div className={styles.analyticsKpiGrid}>
        {kpis.map((k) => (
          <div key={k.label} className={styles.analyticsKpiCard}>
            <span className={styles.analyticsKpiLabel}>{k.label}</span>
            <span className={styles.analyticsKpiValue}>{k.value}</span>
            <span
              className={`${styles.analyticsKpiDelta} ${
                k.tone === 'pos'
                  ? styles.analyticsKpiDeltaPos
                  : k.tone === 'neg'
                  ? styles.analyticsKpiDeltaNeg
                  : styles.analyticsKpiDeltaNeutral
              }`}
            >
              {k.delta}
            </span>
          </div>
        ))}
      </div>
      <h4 className={styles.analyticsViewTitle} style={{ fontSize: 13, marginBottom: 10 }}>
        Sessions by channel
      </h4>
      {channels.map((c) => (
        <div key={c.name} className={styles.analyticsBarRow}>
          <span className={styles.analyticsBarLabel}>{c.name}</span>
          <div className={styles.analyticsBarTrack}>
            <div
              className={`${styles.analyticsBarFill} ${
                styles[`analyticsBarFill${c.fill}` as keyof typeof styles] || styles.analyticsBarFillGreen
              }`}
              style={{ width: `${(c.value / maxVal) * 100}%` }}
            />
          </div>
          <span className={styles.analyticsBarValue}>
            {c.value.toLocaleString()} · {c.pct}%
          </span>
        </div>
      ))}
      <button
        type="button"
        className={styles.analyticsBtn}
        style={{ marginTop: 12 }}
        onClick={() => onNavigate('reports', 'analytics')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        Open full Analytics
      </button>
    </div>
  );
}

/* 1. Operations Vitals View (/admin) */
export function OperationsVitalsView({
  setupSteps,
  pinnedCreateActions,
  attentionItems,
  onOpenSetupWizard,
  onOpenCustomizeCreate,
  onResolveAttentionItem,
  onNavigate,
  onCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
}: {
  setupSteps: SetupStepItem[];
  pinnedCreateActions: string[];
  attentionItems: AttentionQueueItem[];
  onOpenSetupWizard: (stepIdx: number) => void;
  onOpenCustomizeCreate: () => void;
  onResolveAttentionItem: (id: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [windowMode, setWindowMode] = useState<OpsWindow>('Today');
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>([]);
  const [analyticsView, setAnalyticsView] = useState<AnalyticsViewKey>('gmv');

  const vitals = OPS_VITALS_BY_WINDOW[windowMode];

  const openAttention = attentionItems.filter((i) => i.status !== 'Resolved');
  const activeSuggestions = SMART_SUGGESTIONS.filter(
    (s) => !dismissedSuggestions.includes(s.id)
  );

  const getToneClass = (tone: OpsKpiTile['tone']) => {
    if (tone === 'pos') return styles.kpiDeltaPos;
    if (tone === 'warn') return styles.kpiDeltaWarn;
    if (tone === 'neg') return styles.kpiDeltaNeg;
    return styles.kpiDeltaNeutral;
  };

  const getFunnelFillClass = (tone: OpsFunnelStage['tone']) => {
    if (tone === 'maroon') return styles.fillMaroon;
    if (tone === 'navy') return styles.fillNavy;
    if (tone === 'blue') return styles.fillBlue;
    if (tone === 'teal') return styles.fillTeal;
    return styles.fillPrimary;
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Dashboard</h1>
            <p className={styles.subtitle}>
              Unsaid · Fulfillment SLAs, preflight gates, intake queues &amp; banking feeds · Sun, Nov 1, 2026
            </p>
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.segmented}>
              {(['Today', '7D', '30D', 'MTD'] as OpsWindow[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`${styles.segBtn} ${
                    windowMode === w ? styles.segBtnBlueActive : ''
                  }`}
                  onClick={() => setWindowMode(w)}
                >
                  {w}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                const cols = [
                  { key: 'id', label: 'Metric ID' },
                  { key: 'label', label: 'Metric' },
                  { key: 'value', label: 'Value' },
                  { key: 'delta', label: 'Delta' },
                  { key: 'tone', label: 'Tone' },
                  { key: 'subtext', label: 'Subtext' },
                ];
                exportToCsv(vitals as unknown as Record<string, unknown>[], cols, 'operations-vitals');
                onToast(`Exported ${vitals.length} records to CSV`);
              }}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                download
              </span>
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Analytics switcher — replaces create actions on master overview.
          Clicking a button shows analytical detail for that module. */}
      <AnalyticsSwitcher
        active={analyticsView}
        onChange={setAnalyticsView}
        onNavigate={onNavigate}
        onToast={onToast}
      />

      {/* 6 Operations Vitals KPIs */}
      <div className={styles.kpiGrid6}>
        {vitals.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className={`${styles.kpiCard} ${styles.kpiCardClickable}`}
            onClick={() => onNavigate(tile.targetDomain, tile.targetScreen)}
          >
            <div className={styles.kpiTopRow}>
              <span className={styles.kpiLabel}>{tile.label}</span>
              <span className={`material-symbols-outlined ${styles.icon14}`}>
                open_in_new
              </span>
            </div>
            <div className={styles.kpiValue}>{tile.value}</div>
            <div className={getToneClass(tile.tone)}>{tile.delta}</div>
            <div className={styles.kpiSubtext}>{tile.subtext}</div>
          </button>
        ))}
      </div>

      {/* Row 1: Fulfillment & Order-to-Cash Funnel + Supplier & Integration Health */}
      <div className={styles.grid12}>
        <div className={`${styles.panelCard} ${styles.span7}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                Order-to-Cash &amp; POD Fulfillment Pipeline
              </h2>
              <p className={styles.panelSubtitle}>
                Click any stage to open the live operational list view
              </p>
            </div>
            <button
              type="button"
              className={styles.btnLinkGreen}
              onClick={() => onNavigate('orders', 'orders')}
            >
              All orders →
            </button>
          </div>

          <div className={styles.funnelList}>
            {OPS_PIPELINE_FUNNEL.map((st) => (
              <button
                key={st.stage}
                type="button"
                className={styles.funnelRowBtn}
                onClick={() => onNavigate(st.targetDomain, st.targetScreen)}
              >
                <div className={styles.funnelTopLine}>
                  <span className={styles.funnelStageName}>{st.stage}</span>
                  <div className={styles.funnelRightStats}>
                    <span className={styles.funnelCountStrong}>
                      {st.count.toLocaleString()} orders
                    </span>
                    <span className={styles.funnelMuted}>{st.gmv}</span>
                    <span className={styles.badgeNeutral}>{st.avgAge}</span>
                  </div>
                </div>
                <div className={styles.barTrack}>
                  <svg className={styles.barSvg} aria-hidden="true">
                    <rect
                      className={getFunnelFillClass(st.tone)}
                      x="0"
                      y="0"
                      width={`${st.pctOfTotal}%`}
                      height="10"
                      rx="3"
                    />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={`${styles.panelCard} ${styles.span5}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Suppliers, Feeds &amp; Intake Inbox</h2>
              <p className={styles.panelSubtitle}>
                Printful · Printify · Gelato · Stripe · Receipts OCR
              </p>
            </div>
            <button
              type="button"
              className={styles.btnGhostSm}
              onClick={() =>
                onToast('Copied forwarding address: receipts@unsaid.app')
              }
            >
              <span className={`material-symbols-outlined ${styles.icon14}`}>
                content_copy
              </span>
              Copy intake email
            </button>
          </div>

          <div className={styles.vitalList}>
            {INTEGRATION_VITALS.map((v) => (
              <div key={v.name} className={styles.vitalRow}>
                <div className={styles.vitalInfo}>
                  <div className={styles.vitalName}>{v.name}</div>
                  <div className={styles.vitalMeta}>
                    {v.role} · {v.lastSync}
                  </div>
                </div>
                <div className={styles.vitalRight}>
                  <div className={styles.vitalStatCol}>
                    <div className={styles.vitalStatVal}>{v.metricValue}</div>
                    <div className={styles.vitalStatSub}>SLA {v.slaPct}</div>
                  </div>
                  <StatusPill status={v.status} />
                  <button
                    type="button"
                    className={styles.btnGhostSm}
                    onClick={() => onNavigate(v.targetDomain, v.targetScreen)}
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Business at a Glance Suggestions + Urgent Attention Snapshot */}
      <div className={styles.grid12}>
        <div className={`${styles.panelCard} ${styles.span6}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                Business at a glance — Suggested actions
              </h2>
              <p className={styles.panelSubtitle}>
                Automated AP, bank rule, preflight, and 1099 recommendations
              </p>
            </div>
            {dismissedSuggestions.length > 0 && (
              <button
                type="button"
                className={styles.btnGhostSm}
                onClick={() => setDismissedSuggestions([])}
              >
                Restore all
              </button>
            )}
          </div>

          <div className={styles.suggestionList}>
            {activeSuggestions.map((sug) => (
              <div key={sug.id} className={styles.suggestionItem}>
                <div className={styles.suggestionLeft}>
                  <div className={styles.suggestionIconBox}>
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      {sug.icon}
                    </span>
                  </div>
                  <div>
                    <div className={styles.suggestionCat}>{sug.category}</div>
                    <div className={styles.suggestionTitle}>{sug.title}</div>
                    <div className={styles.suggestionDetail}>{sug.detail}</div>
                    <span className={styles.suggestionImpact}>{sug.impact}</span>
                  </div>
                </div>
                <div className={styles.suggestionRight}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => onNavigate(sug.targetDomain, sug.targetScreen)}
                  >
                    {sug.actionLabel}
                  </button>
                  <button
                    type="button"
                    className={styles.btnLinkGreen}
                    onClick={() =>
                      setDismissedSuggestions((prev) => [...prev, sug.id])
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${styles.panelCard} ${styles.span6}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                Attention Queue Snapshot ({openAttention.length} open)
              </h2>
              <p className={styles.panelSubtitle}>
                Highest-urgency SLA, preflight, AR &amp; RMA exceptions
              </p>
            </div>
            <button
              type="button"
              className={styles.btnLinkGreen}
              onClick={() => onNavigate('dashboard', 'attention')}
            >
              Open Attention Queue →
            </button>
          </div>

          <div className={styles.vitalList}>
            {openAttention.slice(0, 5).map((item) => (
              <div key={item.id} className={styles.vitalRow}>
                <div
                  className={styles.vitalInfo}
                  onClick={() =>
                    onOpenPeek(
                      {
                        code: item.code,
                        title: item.title,
                        category: item.category,
                        entity: item.entity,
                        exposure: `$${item.impactAmount.toLocaleString()}`,
                        sla: item.slaRemaining,
                        summary: item.summary,
                        status: item.status,
                      },
                      'attention'
                    )
                  }
                >
                  <div className={styles.vitalName}>
                    {item.code} · {item.title}
                  </div>
                  <div className={styles.vitalMeta}>
                    {item.entity} · {item.category} · SLA: {item.slaRemaining}
                  </div>
                </div>
                <div className={styles.vitalRight}>
                  <StatusPill status={item.status} />
                  <button
                    type="button"
                    className={styles.btnGhostSm}
                    onClick={() => {
                      onResolveAttentionItem(item.id);
                      onToast(`Resolved ${item.code}`);
                    }}
                  >
                    Resolve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* 2. Executive GMV & Margins View (/dashboard) */
export function ExecutiveGmvView({
  pinnedCreateActions,
  onOpenCustomizeCreate,
  onNavigate,
  onCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
}: {
  pinnedCreateActions: string[];
  onOpenCustomizeCreate: () => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [period, setPeriod] = useState<ExecPeriod>('MTD');
  const [compareMode, setCompareMode] = useState<ExecCompare>('prior');
  const [inThousands, setInThousands] = useState<boolean>(false);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(10); // Oct 2026 default

  const pMeta = EXEC_PERIOD_MULTIPLIER[period];
  const m = pMeta.mult;

  const fmtMoney = (val: number) => {
    const absVal = Math.abs(val);
    if (inThousands) {
      const k = (absVal / 1000).toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      return val < 0 ? `($${k}K)` : `$${k}K`;
    }
    const full = Math.round(absVal).toLocaleString('en-US');
    return val < 0 ? `($${full})` : `$${full}`;
  };

  const gmvTotal = 482940 * m;
  const netRevTotal = 446120 * m;
  const grossProfitTotal = 260534 * m;
  const contribTotal = 152573 * m;

  const selectedMonth = MONTHLY_GMV_SERIES[selectedMonthIdx] || MONTHLY_GMV_SERIES[10];
  const selectedGrossMarginPct = (
    (selectedMonth.grossProfit / selectedMonth.netRevenue) *
    100
  ).toFixed(1);
  const selectedContrib =
    selectedMonth.grossProfit - selectedMonth.adSpend - selectedMonth.stripeFees;
  const selectedContribPct = (
    (selectedContrib / selectedMonth.netRevenue) *
    100
  ).toFixed(1);

  const maxChartGmv = 540000;
  const chartBaseY = 192;
  const chartPlotHeight = 162;

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.breadcrumb}>
          <span>Dashboard</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Overview</span>
        </div>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>Executive GMV &amp; Margins</h1>
            <p className={styles.subtitle}>
              {pMeta.label} · Gross merchandise volume, CoA-mapped COGS, channel take-rates &amp; net contribution
            </p>
          </div>

          <div className={styles.toolbarRight}>
            <div className={styles.segmented}>
              {(['MTD', 'QTD', 'YTD', '12M'] as ExecPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.segBtn} ${
                    period === p ? styles.segBtnBlueActive : ''
                  }`}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className={styles.segmented}>
              <button
                type="button"
                className={`${styles.segBtn} ${
                  compareMode === 'prior' ? styles.segBtnActive : ''
                }`}
                onClick={() => setCompareMode('prior')}
              >
                vs Prior
              </button>
              <button
                type="button"
                className={`${styles.segBtn} ${
                  compareMode === 'plan' ? styles.segBtnActive : ''
                }`}
                onClick={() => setCompareMode('plan')}
              >
                vs Plan
              </button>
            </div>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setInThousands((prev) => !prev)}
            >
              {inThousands ? 'Scale: $K' : 'Scale: Exact $'}
            </button>

            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => onNavigate('dashboard', 'explorer')}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>
                query_stats
              </span>
              Open Explorer
            </button>
          </div>
        </div>
      </div>

      {/* Shared Customizable Create Actions Row */}
      <CreateActionsStrip
        pinnedLabels={pinnedCreateActions}
        onCreate={onCreate}
        onOpenCustomize={onOpenCustomizeCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
      />

      {/* 5 Executive KPI Tiles */}
      <div className={styles.kpiGrid5}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Gross Merchandise Volume (GMV)</span>
          <div className={styles.kpiValue}>{fmtMoney(gmvTotal)}</div>
          <div className={styles.kpiDeltaPos}>
            {compareMode === 'prior' ? `${pMeta.deltaGmv} vs prior` : '+4.2% vs Q4 plan'}
          </div>
          <div className={styles.kpiSubtext}>
            {Math.round(5640 * m).toLocaleString()} orders · $85.63 AOV
          </div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Net Recognized Revenue</span>
          <div className={styles.kpiValue}>{fmtMoney(netRevTotal)}</div>
          <div className={styles.kpiDeltaPos}>
            {compareMode === 'prior' ? `${pMeta.deltaNet} vs prior` : '+3.8% vs Q4 plan'}
          </div>
          <div className={styles.kpiSubtext}>After promos (5.3%) &amp; RMAs (2.3%)</div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Gross Profit &amp; Margin</span>
          <div className={styles.kpiValue}>58.4%</div>
          <div className={styles.kpiDeltaPos}>
            {fmtMoney(grossProfitTotal)} ({pMeta.deltaMargin})
          </div>
          <div className={styles.kpiSubtext}>Blank + print + carrier + Stripe COGS</div>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Net Contribution Margin</span>
          <div className={styles.kpiValue}>34.2%</div>
          <div className={styles.kpiDeltaPos}>
            {fmtMoney(contribTotal)} ({pMeta.deltaContrib})
          </div>
          <div className={styles.kpiSubtext}>Net of Ad Center &amp; seller payouts</div>
        </div>

        <button
          type="button"
          className={`${styles.kpiCard} ${styles.kpiCardClickable}`}
          onClick={() => onNavigate('finance', 'bank')}
        >
          <div className={styles.kpiTopRow}>
            <span className={styles.kpiLabel}>Operating Cash &amp; In-Transit</span>
            <span className={`material-symbols-outlined ${styles.icon14}`}>
              open_in_new
            </span>
          </div>
          <div className={styles.kpiValue}>{fmtMoney(217580)}</div>
          <div className={styles.kpiDeltaPos}>$194.7K bank · $22.9K clearing</div>
          <div className={styles.kpiSubtext}>Click to inspect bank &amp; Stripe feed</div>
        </button>
      </div>

      {/* Interactive 12-Month GMV / Net Revenue / Gross Profit SVG Chart + Month Inspector */}
      <div className={styles.grid12}>
        <div className={`${styles.panelCard} ${styles.span8}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                12-Month GMV, Net Revenue &amp; Gross Profit Trajectory
              </h2>
              <p className={styles.panelSubtitle}>
                Click any month column to inspect unit economics &amp; ledger P&amp;L on the right
              </p>
            </div>
            <span className={styles.badgeNeutral}>
              Selected: {selectedMonth.month}
            </span>
          </div>

          <div className={styles.chartWrap}>
            <svg
              viewBox="0 0 740 220"
              className={styles.chartSvg}
              role="img"
              aria-label="12-month GMV, Net Revenue, and Gross Profit bar chart"
            >
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const y = chartBaseY - tick * chartPlotHeight;
                const labelVal = Math.round((maxChartGmv * tick) / 1000);
                return (
                  <g key={tick}>
                    <line
                      x1="44"
                      y1={y}
                      x2="730"
                      y2={y}
                      className={styles.chartGridLine}
                    />
                    <text x="4" y={y + 3} className={styles.chartAxisLabel}>
                      ${labelVal}K
                    </text>
                  </g>
                );
              })}

              {MONTHLY_GMV_SERIES.map((pt, idx) => {
                const colWidth = 56;
                const colX = 48 + idx * colWidth;
                const gmvH = (pt.gmv / maxChartGmv) * chartPlotHeight;
                const netH = (pt.netRevenue / maxChartGmv) * chartPlotHeight;
                const profH = (pt.grossProfit / maxChartGmv) * chartPlotHeight;
                const isSelected = idx === selectedMonthIdx;

                return (
                  <g key={pt.month} onClick={() => setSelectedMonthIdx(idx)}>
                    {isSelected && (
                      <rect
                        x={colX + 2}
                        y={20}
                        width={colWidth - 6}
                        height={chartBaseY - 16}
                        rx="4"
                        className={styles.chartColSelectedBg}
                      />
                    )}
                    <rect
                      x={colX + 8}
                      y={chartBaseY - gmvH}
                      width="11"
                      height={gmvH}
                      rx="2"
                      className={styles.chartBarGmv}
                    />
                    <rect
                      x={colX + 21}
                      y={chartBaseY - netH}
                      width="11"
                      height={netH}
                      rx="2"
                      className={styles.chartBarNet}
                    />
                    <rect
                      x={colX + 34}
                      y={chartBaseY - profH}
                      width="11"
                      height={profH}
                      rx="2"
                      className={styles.chartBarProfit}
                    />
                    <text
                      x={colX + 26}
                      y={210}
                      textAnchor="middle"
                      className={
                        isSelected
                          ? styles.chartMonthLabelActive
                          : styles.chartMonthLabel
                      }
                    >
                      {pt.shortLabel}
                    </text>
                    <rect
                      x={colX + 2}
                      y={20}
                      width={colWidth - 6}
                      height={195}
                      className={styles.chartColHit}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className={styles.chartLegend}>
            <span className={styles.legendItem}>
              <span className={styles.dotBlue} />
              Gross Merchandise Volume (GMV)
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotTeal} />
              Net Recognized Revenue
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotGreen} />
              Gross Profit (After COGS)
            </span>
          </div>
        </div>

        <div className={`${styles.panelCard} ${styles.span4}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>{selectedMonth.month}</h2>
              <p className={styles.panelSubtitle}>
                {selectedMonth.orders.toLocaleString()} orders · $
                {(selectedMonth.gmv / selectedMonth.orders).toFixed(2)} AOV
              </p>
            </div>
            <StatusPill status="Current" />
          </div>

          <div className={styles.inspectorList}>
            <div className={styles.inspectorRow}>
              <span>Gross Merchandise Volume</span>
              <strong>{fmtMoney(selectedMonth.gmv)}</strong>
            </div>
            <div className={styles.inspectorRow}>
              <span>Refunds &amp; RMA credits</span>
              <span className={styles.tdNeg}>{fmtMoney(-selectedMonth.refunds)}</span>
            </div>
            <div className={styles.inspectorRow}>
              <span>Net Recognized Revenue</span>
              <strong>{fmtMoney(selectedMonth.netRevenue)}</strong>
            </div>
            <div className={styles.inspectorRow}>
              <span>Blank, Print &amp; Ship COGS</span>
              <span className={styles.tdNeg}>{fmtMoney(-selectedMonth.cogs)}</span>
            </div>
            <div className={styles.inspectorRow}>
              <span>Stripe &amp; Processing Fees</span>
              <span className={styles.tdNeg}>
                {fmtMoney(-selectedMonth.stripeFees)}
              </span>
            </div>
            <div className={styles.inspectorRow}>
              <span>Gross Profit ({selectedGrossMarginPct}%)</span>
              <span className={styles.tdPos}>
                {fmtMoney(selectedMonth.grossProfit)}
              </span>
            </div>
            <div className={styles.inspectorRow}>
              <span>Ad Center Performance Spend</span>
              <span className={styles.tdNeg}>{fmtMoney(-selectedMonth.adSpend)}</span>
            </div>
            <div className={styles.inspectorRowBold}>
              <span>Contribution ({selectedContribPct}%)</span>
              <span className={styles.tdPos}>{fmtMoney(selectedContrib)}</span>
            </div>
          </div>

          <div className={styles.payFunnelGrid}>
            <div className={styles.payFunnelStep}>
              <div className={styles.payFunnelLabel}>AR Not Paid</div>
              <div className={styles.payFunnelVal}>$8,420</div>
            </div>
            <div className={styles.payFunnelStep}>
              <div className={styles.payFunnelLabel}>Paid (30D)</div>
              <div className={styles.payFunnelVal}>$24,180</div>
            </div>
            <div className={styles.payFunnelStep}>
              <div className={styles.payFunnelLabel}>Deposited</div>
              <div className={styles.payFunnelVal}>$22,900</div>
            </div>
          </div>
        </div>
      </div>

      {/* GMV-to-Contribution Waterfall + Channel & Supplier Scorecards */}
      <div className={styles.grid12}>
        <div className={`${styles.panelCard} ${styles.span6}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                GMV to Contribution Margin Bridge
              </h2>
              <p className={styles.panelSubtitle}>
                Tied directly to Chart of Accounts (§D1 seeded commerce accounts)
              </p>
            </div>
            <button
              type="button"
              className={styles.btnLinkGreen}
              onClick={() => onNavigate('finance', 'coa')}
            >
              Chart of accounts →
            </button>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>P&amp;L / Ledger Line</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Amount</th>
                  <th className={`${styles.th} ${styles.thRight}`}>% GMV</th>
                  <th className={styles.th}>Share</th>
                </tr>
              </thead>
              <tbody>
                {GMV_WATERFALL_BRIDGE.map((item) => {
                  const scaledAmt = item.amount * m;
                  const fillCls =
                    item.kind === 'deduction' || item.kind === 'cogs'
                      ? styles.fillMaroon
                      : item.kind === 'net'
                        ? styles.fillPrimary
                        : styles.fillBlue;
                  return (
                    <tr key={item.label} className={styles.tr}>
                      <td className={styles.td}>
                        <div>{item.label}</div>
                        <div className={styles.tdMuted}>{item.note}</div>
                      </td>
                      <td
                        className={`${styles.td} ${styles.tdRight} ${
                          scaledAmt < 0 ? styles.tdNeg : styles.tdPos
                        }`}
                      >
                        {fmtMoney(scaledAmt)}
                      </td>
                      <td className={`${styles.td} ${styles.tdRight}`}>
                        {item.pctOfGmv.toFixed(1)}%
                      </td>
                      <td className={styles.td}>
                        <div className={styles.barTrack}>
                          <svg className={styles.barSvg} aria-hidden="true">
                            <rect
                              className={fillCls}
                              x="0"
                              y="0"
                              width={`${Math.min(100, item.pctOfGmv)}%`}
                              height="10"
                              rx="2"
                            />
                          </svg>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`${styles.panelCard} ${styles.span6}`}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>
                Margin by Category &amp; POD Supplier
              </h2>
              <p className={styles.panelSubtitle}>
                Click any category or supplier row to inspect in the right peek drawer
              </p>
            </div>
            <button
              type="button"
              className={styles.btnGhostSm}
              onClick={() => {
                const cols = [
                  { key: 'category', label: 'Product Category' },
                  { key: 'coaAccount', label: 'COA Account' },
                  { key: 'orders', label: 'Orders' },
                  { key: 'units', label: 'Units' },
                  { key: 'gmv', label: 'GMV' },
                  { key: 'cogs', label: 'COGS' },
                  { key: 'grossProfit', label: 'Gross Profit' },
                  { key: 'marginPct', label: 'Margin %' },
                  { key: 'returnRatePct', label: 'Return Rate %' },
                  { key: 'sharePct', label: 'Share %' },
                ];
                exportToCsv(CATEGORY_MARGINS as unknown as Record<string, unknown>[], cols, 'category-supplier-margin-audit');
                onToast(`Exported ${CATEGORY_MARGINS.length} records to CSV`);
              }}
            >
              Export CSV
            </button>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Product Category</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Orders</th>
                  <th className={`${styles.th} ${styles.thRight}`}>GMV</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Gross Profit</th>
                  <th className={`${styles.th} ${styles.thRight}`}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_MARGINS.map((cat) => (
                  <tr
                    key={cat.category}
                    className={styles.tr}
                    onClick={() =>
                      onOpenPeek(
                        {
                          name: cat.category,
                          account: cat.coaAccount,
                          orders: Math.round(cat.orders * m),
                          gmv: fmtMoney(cat.gmv * m),
                          cogs: fmtMoney(cat.cogs * m),
                          grossProfit: fmtMoney(cat.grossProfit * m),
                          margin: `${cat.marginPct.toFixed(1)}%`,
                          returnRate: `${cat.returnRatePct}%`,
                          status: 'Active',
                        },
                        'category'
                      )
                    }
                  >
                    <td className={styles.td}>
                      <div>{cat.category}</div>
                      <div className={styles.tdMuted}>{cat.coaAccount}</div>
                    </td>
                    <td className={`${styles.td} ${styles.tdRight}`}>
                      {Math.round(cat.orders * m).toLocaleString()}
                    </td>
                    <td className={`${styles.td} ${styles.tdRight}`}>
                      {fmtMoney(cat.gmv * m)}
                    </td>
                    <td className={`${styles.td} ${styles.tdRight} ${styles.tdPos}`}>
                      {fmtMoney(cat.grossProfit * m)}
                    </td>
                    <td className={`${styles.td} ${styles.tdRight}`}>
                      {cat.marginPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.panelHeader}>
            <span className={styles.formLabel}>Channel Take-Rate &amp; POD Suppliers</span>
          </div>

          <div className={styles.vitalList}>
            {CHANNEL_PERFORMANCE.map((ch) => (
              <div key={ch.channel} className={styles.vitalRow}>
                <div className={styles.vitalInfo}>
                  <div className={styles.vitalName}>{ch.channel}</div>
                  <div className={styles.vitalMeta}>
                    {ch.settlementAccount} · Take-rate {ch.takeRatePct}%
                  </div>
                </div>
                <div className={styles.vitalRight}>
                  <div className={styles.vitalStatCol}>
                    <div className={styles.vitalStatVal}>
                      {fmtMoney(ch.gmv * m)}
                    </div>
                    <div className={styles.vitalStatSub}>
                      Net {fmtMoney(ch.netContribution * m)} ({ch.growthPct})
                    </div>
                  </div>
                  <StatusPill status={ch.status} />
                </div>
              </div>
            ))}
            {SUPPLIER_MARGINS.map((sup) => (
              <div key={sup.supplier} className={styles.vitalRow}>
                <div className={styles.vitalInfo}>
                  <div className={styles.vitalName}>
                    Supplier: {sup.supplier} ({sup.routedOrders.toLocaleString()} orders)
                  </div>
                  <div className={styles.vitalMeta}>
                    Turnaround {sup.avgTurnaround} · Reprint {sup.reprintRatePct}% · SLA{' '}
                    {sup.slaPct}%
                  </div>
                </div>
                <div className={styles.vitalRight}>
                  <div className={styles.vitalStatCol}>
                    <div className={styles.vitalStatVal}>
                      {sup.grossMarginPct.toFixed(1)}% margin
                    </div>
                    <div className={styles.vitalStatSub}>
                      COGS {fmtMoney(sup.blankAndPrintCogs * m)}
                    </div>
                  </div>
                  <StatusPill status={sup.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
