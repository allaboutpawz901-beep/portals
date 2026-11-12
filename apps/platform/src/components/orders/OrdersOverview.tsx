'use client';

import { useState } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import { usePlatformStore } from '@/lib/platformStore';
import { getOrders } from '@/data/ordersData';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
}

/* KPI tiles + pipeline + recent orders derive from the shared store */


const CREATE_ACTIONS = [
  { label: 'Create order', icon: 'add_shopping_cart' },
  { label: 'Report a problem', icon: 'report_problem' },
  { label: 'Create PO', icon: 'shopping_bag' },
  { label: 'Restock', icon: 'sync' },
  { label: 'Batch slips', icon: 'receipt' },
  { label: 'Export', icon: 'download' },
  { label: 'Pick list', icon: 'checklist' },
];


const TOP_PRODUCTS = [
  { name: 'Classic Tee', units: 142, revenue: '$3,408' },
  { name: 'Hoodie V2', units: 86, revenue: '$4,128' },
  { name: 'Canvas Tote', units: 64, revenue: '$1,152' },
  { name: 'Mug 11oz', units: 48, revenue: '$672' },
];

const ATTENTION_ITEMS = [
  { icon: 'schedule', title: '2 orders past SLA', sub: '#1047 Acme Corp · #1042 Lakeside Design' },
  { icon: 'error', title: 'Mug 11oz stockout', sub: '0 on hand · 4 on open orders · reorder now' },
  { icon: 'assignment_return', title: 'Return #1031 needs processing', sub: 'Northwind Labs · $76 refund pending' },
  { icon: 'forum', title: 'Customer question on #1045', sub: 'Northwind Labs · asked 2 hours ago' },
];

const ACTIVITY = [
  { icon: 'local_shipping', text: 'Order #1044 shipped via Gelato', time: '10 min ago' },
  { icon: 'check_circle', text: 'Order #1043 delivered to Maple Supply', time: '1 hour ago' },
  { icon: 'inventory_2', text: 'Classic Tee restocked (+50 from PO-2201)', time: '3 hours ago' },
  { icon: 'assignment_return', text: 'Return RMA-098 received from Blue Ridge Co.', time: 'Yesterday' },
];

export function OrdersOverview({ onNavigate, onToast, onCreate, onOpenCreateFlyout }: OrdersScreenProps) {
  const store = usePlatformStore();

  /* Everything below derives from the shared store (§1.1). */
  const orders = getOrders();
  const RECENT_ORDERS = orders.slice(0, 5).map(o => ({ order: o.id, customer: o.customer, supplier: o.supplier, total: o.total, status: o.status }));
  const unfulfilled = orders.filter(o => o.status === 'Unfulfilled');
  const pastSla = unfulfilled.filter(o => o.slaPast);
  const shipped = orders.filter(o => o.status === 'Shipped' || o.status === 'Delivered');
  const revenueMtd = orders.reduce((s, o) => s + (parseFloat(o.total.replace(/[$,]/g, '')) || 0), 0);

  const KPI_TILES = [
    { label: 'Orders (all)', value: String(orders.length), delta: `${store.documents.filter(d => d.type === 'SalesOrder').length} sales orders`, icon: 'shopping_cart', color: 'qbBlue' },
    { label: 'Unfulfilled', value: String(unfulfilled.length), delta: pastSla.length ? `${pastSla.length} past SLA` : 'on schedule', icon: 'schedule', color: 'error' },
    { label: 'Shipped / Delivered', value: String(shipped.length), delta: 'All time', icon: 'local_shipping', color: 'qbGreen' },
    { label: 'Revenue (orders)', value: `$${revenueMtd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, delta: `${orders.length} orders`, icon: 'attach_money', color: 'qbTeal' },
  ];

  const PIPELINE_STAGES = [
    { name: 'Unfulfilled', value: unfulfilled.length, color: '#8a5a00' },
    { name: 'Ready to ship', value: orders.filter(o => o.status === 'Ready to Ship').length, color: '#0077c5' },
    { name: 'Local pickup', value: orders.filter(o => o.status === 'Local Pickup').length, color: '#6b1e8a' },
    { name: 'Shipped', value: orders.filter(o => o.status === 'Shipped').length, color: '#4a3fc4' },
    { name: 'Delivered', value: orders.filter(o => o.status === 'Delivered').length, color: '#1e5a38' },
  ].map(st => ({ ...st, pct: orders.length ? Math.round((st.value / orders.length) * 100) : 0 }));

  return (
    <div className={styles.container}>
      {/* Context header */}
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Overview</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Orders — Overview</h1>
            <p className={styles.pageSubtitle}>Order pipeline, fulfillment queue, and today&apos;s commitments · November 2026</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => onToast('Date range picker')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_today</span>
              Nov 2026
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>expand_more</span>
            </button>
            <button className={styles.btnSecondary} onClick={() => {
              const cols = [
                { key: 'order', label: 'Order' },
                { key: 'customer', label: 'Customer' },
                { key: 'supplier', label: 'Supplier' },
                { key: 'total', label: 'Total' },
                { key: 'status', label: 'Status' },
              ];
              exportToCsv(RECENT_ORDERS as unknown as Record<string, unknown>[], cols, 'orders-overview');
              onToast(`Exported ${RECENT_ORDERS.length} records to CSV`);
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              Export
            </button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className={styles.kpiGrid}>
          {KPI_TILES.map((kpi) => (
            <button
              key={kpi.label}
              className={`${styles.kpiTile} ${styles[`kpiTile${kpi.color}`] || ''}`}
              onClick={() => onNavigate('orders', 'orders')}
            >
              <div className={styles.kpiIconRow}>
                <span className={`material-symbols-outlined ${styles.kpiIcon}`} style={{ color: `var(--${kpi.color === 'qbBlue' ? 'qb-blue' : kpi.color === 'qbGreen' ? 'qb-green' : kpi.color === 'qbTeal' ? 'qb-teal' : kpi.color})` }}>
                  {kpi.icon}
                </span>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#5a6355' }}>open_in_new</span>
              </div>
              <div className={styles.kpiValue}>{kpi.value}</div>
              <div className={styles.kpiDelta}>{kpi.delta}</div>
              <div className={styles.kpiLabel}>{kpi.label}</div>
            </button>
          ))}
        </div>

        {/* Create actions row */}
        <div className={styles.createActionsRow}>
          <span className={styles.createActionsLabel}>Create actions:</span>
          {CREATE_ACTIONS.map((action) => (
            <button
              key={action.label}
              className={styles.createChip}
              onClick={() => (onCreate ? onCreate(action.label) : onToast(`${action.label} — opening`))}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{action.icon}</span>
              {action.label}
            </button>
          ))}
          <button className={styles.showAllChip} onClick={() => (onOpenCreateFlyout ? onOpenCreateFlyout() : onToast('Show all create options'))}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>apps</span>
            Show all
          </button>
        </div>

        {/* Two-column: Pipeline + Needs attention */}
        <div className={styles.grid2col}>
          {/* Fulfillment pipeline */}
          <div className={`${styles.panel} ${styles.span2}`}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Fulfillment pipeline</h2>
              <button className={styles.panelLink} onClick={() => onNavigate('orders', 'fulfillment-queue')}>
                View queue
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
              </button>
            </div>
            <div className={styles.pipelineBars}>
              {PIPELINE_STAGES.map((stage) => (
                <div key={stage.name} className={styles.pipelineRow}>
                  <span className={styles.pipelineLabel}>{stage.name}</span>
                  <div className={styles.pipelineTrack}>
                    <div
                      className={styles.pipelineFill}
                      style={{ width: `${stage.pct}%`, backgroundColor: stage.color }}
                    />
                  </div>
                  <span className={styles.pipelineValue}>{stage.value}</span>
                </div>
              ))}
            </div>
            <div className={styles.pipelineFooter}>
              <span className={styles.pipelineMetric}><strong>94%</strong> on-time rate</span>
              <span className={styles.pipelineMetric}><strong>1.8d</strong> avg. fulfillment time</span>
              <span className={styles.pipelineMetric} style={{ color: '#ba1a1a' }}><strong>2</strong> past SLA</span>
            </div>
          </div>

          {/* Needs attention */}
          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Needs attention</h2>
              <span className={styles.badgeError}>4 items</span>
            </div>
            <div className={styles.attentionList}>
              {ATTENTION_ITEMS.map((item, idx) => (
                <button
                  key={idx}
                  className={styles.attentionItem}
                  onClick={() => onNavigate('orders', 'orders')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ba1a1a' }}>{item.icon}</span>
                  <div className={styles.attentionText}>
                    <div className={styles.attentionTitle}>{item.title}</div>
                    <div className={styles.attentionSub}>{item.sub}</div>
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#5a6355' }}>chevron_right</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Two-column: Recent orders + Top products */}
        <div className={styles.grid2col}>
          <div className={`${styles.panel} ${styles.span2}`}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Recent orders</h2>
              <button className={styles.panelLink} onClick={() => onNavigate('orders', 'orders')}>
                View all
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
              </button>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Supplier</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {RECENT_ORDERS.map((row) => (
                  <tr key={row.order} className={styles.tableRow} onClick={() => onNavigate('orders', 'order-detail')}>
                    <td><strong>{row.order}</strong></td>
                    <td>{row.customer}</td>
                    <td>{row.supplier}</td>
                    <td style={{ textAlign: 'right' }}>{row.total}</td>
                    <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Top products (30d)</h2>
            </div>
            <div className={styles.productList}>
              {TOP_PRODUCTS.map((product) => (
                <div key={product.name} className={styles.productItem}>
                  <div className={styles.productAvatar}>{product.name[0]}</div>
                  <div className={styles.productInfo}>
                    <div className={styles.productName}>{product.name}</div>
                    <div className={styles.productStats}>{product.units} units sold · {product.revenue}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent activity</h2>
            <button className={styles.panelLink} onClick={() => onNavigate('orders', 'orders')}>
              View all
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>chevron_right</span>
            </button>
          </div>
          <div className={styles.activityList}>
            {ACTIVITY.map((item, idx) => (
              <div key={idx} className={styles.activityItem}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#5a6355' }}>{item.icon}</span>
                <div>
                  <span className={styles.activityText}>{item.text}</span>
                  <span className={styles.activityTime}>{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default OrdersOverview;
