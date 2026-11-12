'use client';

import { useState } from 'react';
import { DomainKey } from '@/data/shellData';
import { RETURN_TABS, ReturnRow } from '@/data/ordersData';
import { usePlatformStore } from '@/lib/platformStore';
import RowMenu, { RowMenuItem, BulkBar } from '@/components/ListPrimitives';
import { exportToCsv } from '@/lib/csvExport';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
  onOpenPeek?: (title: string, details: Record<string, string | number>) => void;
}

const AVATAR_COLORS: Record<string, string> = {
  A: styles.avatarBlue, B: styles.avatarGreen, N: styles.avatarTeal,
  M: styles.avatarNavy, L: styles.avatarMaroon, P: styles.avatarBlue,
};

export function ReturnsClaims({ onToast, onCreate, onOpenPeek }: OrdersScreenProps) {
  const store = usePlatformStore();
  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allReturns: ReturnRow[] = store.documents
    .filter(d => d.type === 'RMA')
    .map(d => {
      const party = store.getParty(d.partyId);
      const order = d.orderId ? store.getDocument(d.orderId) : null;
      const reason = (d.memo || '').replace(/^Reason: /, '').split(' — ')[0] || 'Return';
      const status: ReturnRow['status'] =
        ['Requested', 'Approved', 'In transit', 'Received', 'Refunded', 'Declined'].includes(d.status)
          ? (d.status as ReturnRow['status'])
          : 'Requested';
      return {
        docId: d.id,
        id: d.number,
        customer: party?.name || '—',
        order: order ? `#${order.number.replace('SO-', '')}` : '—',
        reason,
        refund: `$${d.total.toFixed(2)}`,
        status,
        type: 'Customer return',
      };
    });

  const filtered = allReturns.filter((row) => {
    if (activeTab !== 'All' && row.status !== activeTab) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return row.id.toLowerCase().includes(q) || row.customer.toLowerCase().includes(q) || row.order.toLowerCase().includes(q);
  });

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAll = () =>
    setSelected((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((r) => r.id));
    });

  const rowMenuItems = (row: ReturnRow): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      { label: 'Open RMA', icon: 'open_in_new', onClick: () => (onOpenPeek ? onOpenPeek(`Return ${row.id} — ${row.customer}`, {
        'RMA No.': row.id,
        Customer: row.customer,
        Order: row.order,
        Reason: row.reason,
        Refund: row.refund,
        Type: row.type,
        Status: row.status,
      }) : onToast(`Opening ${row.id}`)) },
      { label: 'Edit', icon: 'edit', onClick: () => (onCreate ? onCreate('Return/RMA') : onToast(`Editing ${row.id}`)) },
    ];
    if (row.status === 'Requested') {
      items.push({ label: 'Approve return', icon: 'check_circle', dividerBefore: true, onClick: () => {
        store.changeDocumentStatus(row.docId, 'Approved');
        onToast(`RMA ${row.id} approved`);
      } });
      items.push({ label: 'Decline return', icon: 'cancel', onClick: () => {
        store.changeDocumentStatus(row.docId, 'Declined');
        onToast(`RMA ${row.id} declined`);
      } });
    }
    if (row.status === 'Approved') {
      items.push({ label: 'Mark in transit', icon: 'local_shipping', dividerBefore: true, onClick: () => {
        store.changeDocumentStatus(row.docId, 'In transit');
        onToast(`RMA ${row.id} marked in transit`);
      } });
    }
    if (row.status === 'In transit') {
      items.push({ label: 'Mark items received', icon: 'inventory', dividerBefore: true, onClick: () => {
        store.changeDocumentStatus(row.docId, 'Received');
        onToast(`RMA ${row.id} marked received`);
      } });
    }
    if (row.status === 'Received') {
      items.push({ label: 'Restock items', icon: 'add_box', dividerBefore: true, onClick: () => onToast(`Restocking ${row.id} items`) });
    }
    if (row.status === 'Received' || row.status === 'Approved') {
      items.push({ label: 'Issue refund…', icon: 'payments', onClick: () => {
        store.changeDocumentStatus(row.docId, 'Refunded');
        onToast(`RMA ${row.id} refunded`);
      } });
    }
    items.push({ label: 'Delete', icon: 'delete', danger: true, dividerBefore: true, onClick: () => {
      store.deleteDocument(row.docId);
      onToast(`RMA ${row.id} deleted`);
    } });
    return items;
  };

  return (
    <div className={styles.container}>
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Returns &amp; Claims</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Returns &amp; Claims</h1>
            <p className={styles.pageSubtitle}>Customer RMAs, supplier claims, refunds, and restocking</p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.splitBtn}>
              <button className={styles.splitBtnMain} onClick={() => (onCreate ? onCreate('Return/RMA') : onToast('New return — opening drawer'))}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>assignment_return</span>
                New return
              </button>
              <button className={styles.splitBtnArrow} onClick={() => onToast('Options: Customer return / Supplier claim / Pick from order')}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>expand_more</span>
              </button>
            </div>
            <button className={styles.btnSecondary} onClick={() => {
              const cols = [
                { key: 'id', label: 'RMA' },
                { key: 'customer', label: 'Customer' },
                { key: 'order', label: 'Order' },
                { key: 'reason', label: 'Reason' },
                { key: 'refund', label: 'Refund' },
                { key: 'type', label: 'Type' },
                { key: 'status', label: 'Status' },
              ];
              exportToCsv(filtered as unknown as Record<string, unknown>[], cols, 'returns-claims');
              onToast(`Exported ${filtered.length} records to CSV`);
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              Export
            </button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className={styles.kpiGrid}>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into open returns')}>
            <div className={styles.kpiValue}>3</div>
            <div className={styles.kpiLabel}>Open returns</div>
            <div className={styles.kpiDelta}>$480 in refunds pending</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into awaiting receipt')}>
            <div className={styles.kpiValue} style={{ color: '#6b1e28' }}>1</div>
            <div className={styles.kpiLabel}>Awaiting receipt</div>
            <div className={styles.kpiDelta}>In transit back to you</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into supplier claims')}>
            <div className={styles.kpiValue}>2</div>
            <div className={styles.kpiLabel}>Supplier claims</div>
            <div className={styles.kpiDelta}>$320 recoverable</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into return rate')}>
            <div className={styles.kpiValue} style={{ color: '#1e5a38' }}>2.4%</div>
            <div className={styles.kpiLabel}>Return rate (30d)</div>
            <div className={styles.kpiDelta}>Down from 3.1%</div>
          </button>
        </div>

        {/* Table */}
        <div className={styles.tableCard}>
          <div className={styles.viewTabsBar}>
            {RETURN_TABS.map((tab) => (
              <button
                key={tab}
                className={`${styles.viewTab} ${activeTab === tab ? styles.viewTabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className={styles.filterBar}>
            <div className={styles.filterInputWrap}>
              <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
              <input
                className={styles.filterInput}
                placeholder="Filter by RMA #, customer, order #…"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className={styles.filterSelect} defaultValue="All">
              <option>All</option>
              <option>Customer return</option>
              <option>Supplier claim</option>
            </select>
            <button className={styles.filterBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_today</span>
              Date range
            </button>
            <span className={styles.filterCount}>
              {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} of ${allReturns.length}`}
            </span>
          </div>

          {selected.size > 0 && (
            <BulkBar
              selectedIds={Array.from(selected)}
              onClear={() => setSelected(new Set())}
              actions={[
                { label: 'Approve', icon: 'check_circle', onClick: () => { onToast(`Approving ${selected.size} returns`); setSelected(new Set()); } },
                { label: 'Restock items', icon: 'inventory', onClick: () => { onToast(`Restocking ${selected.size} returns`); setSelected(new Set()); } },
                { label: 'Issue refund', icon: 'payments', onClick: () => { onToast(`Refunding ${selected.size} returns`); setSelected(new Set()); } },
                { label: 'Decline', icon: 'cancel', danger: true, onClick: () => { onToast(`Declining ${selected.size} returns`); setSelected(new Set()); } },
              ]}
            />
          )}

          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCell}><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} /></th>
                <th>RMA</th>
                <th>Customer</th>
                <th>Order</th>
                <th>Reason</th>
                <th style={{ textAlign: 'right' }}>Refund</th>
                <th>Status</th>
                <th className={styles.actionCell}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className={`${styles.tableRow} ${selected.has(row.id) ? styles.tableRowSelected : ''}`} onClick={() => (onOpenPeek ? onOpenPeek(`Return ${row.id} — ${row.customer}`, {
                  'RMA No.': row.id,
                  Customer: row.customer,
                  Order: row.order,
                  Reason: row.reason,
                  Refund: row.refund,
                  Type: row.type,
                  Status: row.status,
                }) : onToast(`Opening ${row.id}`))}>
                  <td className={styles.checkCell}><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} /></td>
                  <td><strong>{row.id}</strong></td>
                  <td>
                    <div className={styles.cellName}>
                      <span className={`${styles.avatar} ${AVATAR_COLORS[row.customer[0]] || styles.avatarBlue}`}>{row.customer[0]}</span>
                      {row.customer}
                    </div>
                  </td>
                  <td>{row.order}</td>
                  <td>{row.reason}</td>
                  <td style={{ textAlign: 'right' }}>{row.refund}</td>
                  <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                  <td className={styles.actionCell}><RowMenu items={rowMenuItems(row)} /></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className={styles.emptyState}>No returns match the current filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default ReturnsClaims;
