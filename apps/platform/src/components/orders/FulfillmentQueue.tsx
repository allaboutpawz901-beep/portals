'use client';

import { useState, useMemo } from 'react';
import { DomainKey } from '@/data/shellData';
import { WAREHOUSE_QUEUE, DROP_SHIP_QUEUE, WAREHOUSE_TABS, DROPSHIP_TABS } from '@/data/ordersData';
import RowMenu, { RowMenuItem, BulkBar } from '@/components/ListPrimitives';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
}

const AVATAR_COLORS: Record<string, string> = {
  A: styles.avatarBlue, B: styles.avatarGreen, N: styles.avatarTeal,
  O: styles.avatarMaroon, M: styles.avatarNavy, L: styles.avatarMaroon,
  P: styles.avatarBlue, G: styles.avatarGreen,
};

export function FulfillmentQueue({ onToast, onNavigate }: OrdersScreenProps) {
  const [whTab, setWhTab] = useState<string>('All');
  const [dsTab, setDsTab] = useState<string>('All');
  const [whSearch, setWhSearch] = useState('');
  const [dsSearch, setDsSearch] = useState('');
  const [whSelected, setWhSelected] = useState<Set<string>>(new Set());
  const [dsSelected, setDsSelected] = useState<Set<string>>(new Set());

  const whFiltered = useMemo(() => {
    return WAREHOUSE_QUEUE.filter((row) => {
      if (whTab === 'All') return true;
      if (whTab === 'Ready to Ship') return row.status === 'Ready' && row.type === 'Ship';
      if (whTab === 'Local Pickup') return row.status === 'Ready' && row.type === 'Pickup';
      if (whTab === 'Unfulfilled') return row.status === 'Unfulfilled';
      return true;
    }).filter((row) => !whSearch.trim() || row.id.toLowerCase().includes(whSearch.toLowerCase()) || row.customer.toLowerCase().includes(whSearch.toLowerCase()));
  }, [whTab, whSearch]);

  const dsFiltered = useMemo(() => {
    return DROP_SHIP_QUEUE.filter((row) => {
      if (dsTab === 'All') return true;
      return row.status === dsTab;
    }).filter((row) => !dsSearch.trim() || row.id.toLowerCase().includes(dsSearch.toLowerCase()) || row.customer.toLowerCase().includes(dsSearch.toLowerCase()));
  }, [dsTab, dsSearch]);

  const toggleWhSelect = (id: string) =>
    setWhSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleDsSelect = (id: string) =>
    setDsSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const whMenuItems = (row: typeof WAREHOUSE_QUEUE[number]): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      { label: 'View order', icon: 'open_in_new', onClick: () => onToast(`Viewing ${row.id}`) },
      { label: 'Report a problem', icon: 'report_problem', onClick: () => onToast(`Reporting problem for ${row.id}`) },
      { label: 'Print packing slip', icon: 'receipt', dividerBefore: true, onClick: () => onToast(`Printing slip for ${row.id}`) },
      { label: 'Print shipping label', icon: 'print', onClick: () => onToast(`Printing label for ${row.id}`) },
    ];
    if (row.type === 'Ship' && row.status !== 'Shipped') {
      items.push({ label: 'Mark shipped', icon: 'local_shipping', onClick: () => onToast(`Marked ${row.id} shipped`) });
    }
    if (row.type === 'Pickup' && row.status !== 'Picked up') {
      items.push({ label: 'Mark picked up', icon: 'storefront', onClick: () => onToast(`Marked ${row.id} picked up`) });
    }
    return items;
  };

  const dsMenuItems = (row: typeof DROP_SHIP_QUEUE[number]): RowMenuItem[] => [
    { label: 'View order', icon: 'open_in_new', onClick: () => onToast(`Viewing ${row.id}`) },
    { label: 'Track shipment', icon: 'local_shipping', onClick: () => onToast(`Tracking ${row.id}`) },
    { label: 'Sync tracking now', icon: 'refresh', onClick: () => onToast(`Syncing tracking for ${row.id}`) },
    { label: 'Mark in transit', icon: 'local_shipping', dividerBefore: true, onClick: () => onToast(`Marked ${row.id} in transit`) },
    { label: 'Mark delivered', icon: 'package', onClick: () => onToast(`Marked ${row.id} delivered`) },
    { label: 'Mark received', icon: 'check_circle', onClick: () => onToast(`Marked ${row.id} received`) },
    { label: 'Report a problem', icon: 'report_problem', danger: true, dividerBefore: true, onClick: () => onToast(`Reporting problem for ${row.id}`) },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Fulfillment Queue</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Fulfillment Queue</h1>
            <p className={styles.pageSubtitle}>Two fulfillment tracks: physical shipments from your warehouse, and drop-shipped orders from suppliers.</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => onToast('Syncing tracking…')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
              Sync tracking
            </button>
            <button className={styles.btnSecondary} onClick={() => onNavigate('orders', 'batch-slips')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>receipt</span>
              Batch slips
            </button>
            <button className={styles.btnSecondary} onClick={() => onToast('Pick list — opening')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>checklist</span>
              Pick list
            </button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className={styles.kpiGrid}>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into warehouse queue')}>
            <div className={styles.kpiValue} style={{ color: '#6b1e28' }}>5</div>
            <div className={styles.kpiLabel}>Warehouse queue</div>
            <div className={styles.kpiDelta} style={{ color: '#ba1a1a' }}>2 past SLA</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into drop ship queue')}>
            <div className={styles.kpiValue} style={{ color: '#0077c5' }}>4</div>
            <div className={styles.kpiLabel}>Drop ship queue</div>
            <div className={styles.kpiDelta}>3 in transit</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into awaiting receipt')}>
            <div className={styles.kpiValue}>2</div>
            <div className={styles.kpiLabel}>Awaiting customer receipt</div>
            <div className={styles.kpiDelta}>Delivered, needs confirm</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into ship today')}>
            <div className={styles.kpiValue} style={{ color: '#ba1a1a' }}>3</div>
            <div className={styles.kpiLabel}>Ship today</div>
            <div className={styles.kpiDelta} style={{ color: '#ba1a1a' }}>By 4:00 PM carrier cutoff</div>
          </button>
        </div>

        {/* ── Warehouse queue ── */}
        <div className={styles.queueSection}>
          <div className={styles.queueHeader}>
            <div>
              <h2 className={styles.queueTitle}>Warehouse queue</h2>
              <p className={styles.queueSub}>Physical shipments picked, packed, and shipped from your warehouse.</p>
            </div>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.viewTabsBar}>
              {WAREHOUSE_TABS.map((tab) => (
                <button key={tab} className={`${styles.viewTab} ${whTab === tab ? styles.viewTabActive : ''}`} onClick={() => setWhTab(tab)}>
                  {tab}
                  {tab === 'All' && <span className={styles.viewTabCount}>{WAREHOUSE_QUEUE.length}</span>}
                  {tab === 'Ready to Ship' && <span className={styles.viewTabCount}>2</span>}
                  {tab === 'Local Pickup' && <span className={styles.viewTabCount}>1</span>}
                  {tab === 'Unfulfilled' && <span className={styles.viewTabCount}>2</span>}
                </button>
              ))}
            </div>

            <div className={styles.filterBar}>
              <div className={styles.filterInputWrap}>
                <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
                <input className={styles.filterInput} placeholder="Scan or search order #…" type="text" value={whSearch} onChange={(e) => setWhSearch(e.target.value)} />
              </div>
              <span className={styles.filterCount}>
                {whSelected.size > 0 ? `${whSelected.size} selected` : `${whFiltered.length} of ${WAREHOUSE_QUEUE.length}`}
              </span>
            </div>

            {whSelected.size > 0 && (
              <BulkBar
                selectedIds={Array.from(whSelected)}
                onClear={() => setWhSelected(new Set())}
                actions={[
                  { label: 'Print slips', icon: 'receipt', onClick: () => { onToast(`Printing slips for ${whSelected.size} orders`); setWhSelected(new Set()); } },
                  { label: 'Print labels', icon: 'print', onClick: () => { onToast(`Printing labels for ${whSelected.size} orders`); setWhSelected(new Set()); } },
                  { label: 'Mark shipped', icon: 'local_shipping', onClick: () => { onToast(`Marking ${whSelected.size} shipped`); setWhSelected(new Set()); } },
                  { label: 'Mark picked up', icon: 'storefront', onClick: () => { onToast(`Marking ${whSelected.size} picked up`); setWhSelected(new Set()); } },
                ]}
              />
            )}

            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkCell}><input type="checkbox" checked={whSelected.size === whFiltered.length && whFiltered.length > 0} onChange={() => setWhSelected((prev) => prev.size === whFiltered.length ? new Set() : new Set(whFiltered.map(r => r.id)))} /></th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Items to pick</th>
                  <th>Type</th>
                  <th>Ship by</th>
                  <th>Status</th>
                  <th className={styles.actionCell}></th>
                </tr>
              </thead>
              <tbody>
                {whFiltered.map((row) => (
                  <tr key={row.id} className={`${styles.tableRow} ${whSelected.has(row.id) ? styles.tableRowSelected : ''}`}>
                    <td className={styles.checkCell}><input type="checkbox" checked={whSelected.has(row.id)} onChange={() => toggleWhSelect(row.id)} /></td>
                    <td><strong>{row.id}</strong></td>
                    <td>
                      <div className={styles.cellName}>
                        <span className={`${styles.avatar} ${AVATAR_COLORS[row.customer[0]] || styles.avatarBlue}`}>{row.customer[0]}</span>
                        {row.customer}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: '#5a6355' }}>{row.items}</td>
                    <td>{row.type}</td>
                    <td style={{ color: row.pastSla ? '#ba1a1a' : '#1a1c1e', fontWeight: row.pastSla ? 700 : 400 }}>{row.shipBy}</td>
                    <td><span className={styles.statusPill} data-status={row.status === 'Ready' ? 'Ready to Ship' : row.status}>{row.status}</span></td>
                    <td className={styles.actionCell}><RowMenu items={whMenuItems(row)} /></td>
                  </tr>
                ))}
                {whFiltered.length === 0 && <tr><td colSpan={8} className={styles.emptyState}>No orders in warehouse queue.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Drop ship queue ── */}
        <div className={styles.queueSection}>
          <div className={styles.queueHeader}>
            <div>
              <h2 className={styles.queueTitle}>Drop ship queue</h2>
              <p className={styles.queueSub}>Orders routed to suppliers for direct fulfillment. Track and confirm lifecycle.</p>
            </div>
            <button className={styles.btnSecondary} onClick={() => onToast('Syncing tracking…')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
              Sync tracking
            </button>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.viewTabsBar}>
              {DROPSHIP_TABS.map((tab) => (
                <button key={tab} className={`${styles.viewTab} ${dsTab === tab ? styles.viewTabActive : ''}`} onClick={() => setDsTab(tab)}>
                  {tab}
                  {tab === 'All' && <span className={styles.viewTabCount}>{DROP_SHIP_QUEUE.length}</span>}
                  {tab === 'In transit' && <span className={styles.viewTabCount}>2</span>}
                  {tab === 'Delivered' && <span className={styles.viewTabCount}>1</span>}
                  {tab === 'Received' && <span className={styles.viewTabCount}>1</span>}
                </button>
              ))}
            </div>

            <div className={styles.filterBar}>
              <div className={styles.filterInputWrap}>
                <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
                <input className={styles.filterInput} placeholder="Filter by order, supplier, tracking #…" type="text" value={dsSearch} onChange={(e) => setDsSearch(e.target.value)} />
              </div>
              <select className={styles.filterSelect} defaultValue="All">
                <option>All</option>
                <option>Printful</option>
                <option>Gelato</option>
                <option>Printify</option>
              </select>
              <span className={styles.filterCount}>
                {dsSelected.size > 0 ? `${dsSelected.size} selected` : `${dsFiltered.length} of ${DROP_SHIP_QUEUE.length}`}
              </span>
            </div>

            {dsSelected.size > 0 && (
              <BulkBar
                selectedIds={Array.from(dsSelected)}
                onClear={() => setDsSelected(new Set())}
                actions={[
                  { label: 'Mark in transit', icon: 'local_shipping', onClick: () => { onToast(`Marking ${dsSelected.size} in transit`); setDsSelected(new Set()); } },
                  { label: 'Mark delivered', icon: 'package', onClick: () => { onToast(`Marking ${dsSelected.size} delivered`); setDsSelected(new Set()); } },
                  { label: 'Mark received', icon: 'check_circle', onClick: () => { onToast(`Marking ${dsSelected.size} received`); setDsSelected(new Set()); } },
                ]}
              />
            )}

            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkCell}><input type="checkbox" checked={dsSelected.size === dsFiltered.length && dsFiltered.length > 0} onChange={() => setDsSelected((prev) => prev.size === dsFiltered.length ? new Set() : new Set(dsFiltered.map(r => r.id)))} /></th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Supplier</th>
                  <th>Tracking / ETA</th>
                  <th>Lifecycle</th>
                  <th className={styles.actionCell}></th>
                </tr>
              </thead>
              <tbody>
                {dsFiltered.map((row) => (
                  <tr key={row.id} className={`${styles.tableRow} ${dsSelected.has(row.id) ? styles.tableRowSelected : ''}`}>
                    <td className={styles.checkCell}><input type="checkbox" checked={dsSelected.has(row.id)} onChange={() => toggleDsSelect(row.id)} /></td>
                    <td><strong>{row.id}</strong></td>
                    <td>
                      <div className={styles.cellName}>
                        <span className={`${styles.avatar} ${AVATAR_COLORS[row.customer[0]] || styles.avatarBlue}`}>{row.customer[0]}</span>
                        {row.customer}
                      </div>
                    </td>
                    <td>
                      <div className={styles.cellName}>
                        <span className={`${styles.avatar} ${AVATAR_COLORS[row.supplierInitial] || styles.avatarBlue}`} style={{ width: 24, height: 24, fontSize: 10 }}>{row.supplierInitial}</span>
                        {row.supplier}
                      </div>
                    </td>
                    <td>
                      <button className={styles.trackingChip} onClick={() => window.open(`https://tools.usps.com/go/TrackConfirmAction?tLabels=${row.tracking}`, '_blank')}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>local_shipping</span>
                        {row.tracking}
                        {row.eta && <span style={{ color: '#5a6355', marginLeft: 4 }}>· {row.eta}</span>}
                      </button>
                    </td>
                    <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                    <td className={styles.actionCell}><RowMenu items={dsMenuItems(row)} /></td>
                  </tr>
                ))}
                {dsFiltered.length === 0 && <tr><td colSpan={7} className={styles.emptyState}>No orders in drop ship queue.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FulfillmentQueue;
