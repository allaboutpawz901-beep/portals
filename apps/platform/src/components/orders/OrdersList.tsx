'use client';

import { useState } from 'react';
import { DomainKey } from '@/data/shellData';
import { ORDER_TABS, OrderRow } from '@/data/ordersData';
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
  A: styles.avatarBlue,
  B: styles.avatarGreen,
  N: styles.avatarTeal,
  O: styles.avatarMaroon,
  M: styles.avatarNavy,
  L: styles.avatarMaroon,
};

function avatarClass(name: string): string {
  const first = name[0]?.toUpperCase() || 'A';
  return AVATAR_COLORS[first] || styles.avatarBlue;
}

export function OrdersList({ onNavigate, onToast, onCreate, onOpenPeek }: OrdersScreenProps) {
  const store = usePlatformStore();
  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [splitOpen, setSplitOpen] = useState(false);

  const allOrders: OrderRow[] = store.documents
    .filter(d => d.type === 'SalesOrder')
    .map(d => {
      const party = store.getParty(d.partyId);
      const firstItem = d.lines[0]?.itemId ? store.getItem(d.lines[0].itemId) : null;
      const supplier = firstItem?.supplierId ? store.getParty(firstItem.supplierId)?.name || '—' : '—';
      const items = d.lines.map(l => `${l.description.split(' — ')[0]} ×${l.qty}`).join(', ');
      const due = d.dueDate || d.date;
      const slaPast = new Date(due) < new Date('2026-11-06');
      const status: OrderRow['status'] =
        d.status === 'Closed' ? 'Delivered'
        : d.status === 'Fulfilled' ? 'Shipped'
        : d.amountPaid > 0 ? 'Ready to Ship'
        : 'Unfulfilled';
      return {
        docId: d.id,
        id: `#${d.number.replace('SO-', '')}`,
        customer: party?.name || '—',
        items: items || '—',
        supplier,
        total: `$${d.total.toFixed(2)}`,
        sla: slaPast ? 'Past SLA' : `${Math.max(0, Math.round((new Date(due).getTime() - new Date('2026-11-06').getTime()) / 86400000))}d left`,
        slaPast,
        status,
      };
    });

  const filtered = allOrders.filter((row) => {
    if (activeTab !== 'All' && row.status !== activeTab) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return row.id.toLowerCase().includes(q) || row.customer.toLowerCase().includes(q);
  });

  const tabCounts: Record<string, number> = { All: allOrders.length };
  ORDER_TABS.forEach((tab) => {
    if (tab !== 'All') tabCounts[tab] = allOrders.filter((r) => r.status === tab).length;
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

  const rowMenuItems = (row: OrderRow): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      { label: 'View order', icon: 'open_in_new', onClick: () => (onOpenPeek ? onOpenPeek(`Order ${row.id} — ${row.customer}`, {
        Order: row.id,
        Customer: row.customer,
        Items: row.items,
        Supplier: row.supplier,
        Total: row.total,
        SLA: row.sla,
        Status: row.status,
      }) : onToast(`Viewing ${row.id}`)) },
      { label: 'Edit', icon: 'edit', onClick: () => (onCreate ? onCreate('Sales order') : onToast(`Editing ${row.id}`)) },
    ];
    if (row.status !== 'Shipped' && row.status !== 'Delivered') {
      items.push({ label: 'Print slip', icon: 'receipt', onClick: () => window.print() });
      items.push({ label: 'Print shipping label', icon: 'print', onClick: () => window.print() });
    }
    if (row.status === 'Ready to Ship' || row.status === 'Unfulfilled') {
      items.push({ label: 'Mark shipped', icon: 'local_shipping', onClick: () => {
        store.changeDocumentStatus(row.docId, 'Fulfilled');
        onToast(`Order ${row.id} marked shipped`);
      } });
    }
    items.push({ label: 'Refund…', icon: 'undo', dividerBefore: true, onClick: () => onToast(`Refund flow for ${row.id}`) });
    items.push({ label: 'Report a problem…', icon: 'report_problem', onClick: () => onToast(`Reporting problem for ${row.id}`) });
    items.push({ label: 'Cancel order', icon: 'block', danger: true, onClick: () => {
      store.changeDocumentStatus(row.docId, 'Void');
      onToast(`Order ${row.id} cancelled`);
    } });
    return items;
  };

  const selectedArray = Array.from(selected);

  return (
    <div className={styles.container}>
      {/* Context header */}
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Orders</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        {/* Page header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Orders</h1>
            <p className={styles.pageSubtitle}>All orders across channels · 36 active · SLAs enforced</p>
          </div>
          <div className={styles.headerActions}>
            {/* Split button: Create order */}
            <div className={styles.splitBtn} style={{ position: 'relative' }}>
              <button className={styles.splitBtnMain} onClick={() => (onCreate ? onCreate('Order') : onToast('Create order — opening drawer'))}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                Create order
              </button>
              <button
                className={styles.splitBtnArrow}
                aria-expanded={splitOpen}
                onClick={() => setSplitOpen((prev) => !prev)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>expand_more</span>
              </button>
            </div>
            <button className={styles.btnSecondary} onClick={() => (onCreate ? onCreate('Ticket') : onToast('Report a problem — opening'))}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>report_problem</span>
              Report a problem
            </button>
            <button className={styles.btnSecondary} onClick={() => (onCreate ? onCreate('Purchase order') : onToast('Create PO — opening'))}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>shopping_bag</span>
              Create PO
            </button>
            <button className={styles.btnSecondary} onClick={() => onNavigate('orders', 'inventory')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sync</span>
              Restock
            </button>
            <button className={styles.btnSecondary} onClick={() => onNavigate('orders', 'batch-slips')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>receipt</span>
              Batch slips
            </button>
            <button className={styles.btnSecondary} onClick={() => onToast('Pick list — opening')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>checklist</span>
              Pick list
            </button>
            <button className={styles.btnSecondary} onClick={() => {
              const cols = [
                { key: 'id', label: 'Order' },
                { key: 'customer', label: 'Customer' },
                { key: 'items', label: 'Items' },
                { key: 'supplier', label: 'Supplier' },
                { key: 'total', label: 'Total' },
                { key: 'sla', label: 'SLA' },
                { key: 'status', label: 'Status' },
              ];
              exportToCsv(filtered as unknown as Record<string, unknown>[], cols, 'orders-list');
              onToast(`Exported ${filtered.length} records to CSV`);
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
              Export
            </button>
          </div>
        </div>

        {/* Table card */}
        <div className={styles.tableCard}>
          {/* View tabs */}
          <div className={styles.viewTabsBar}>
            {ORDER_TABS.map((tab) => (
              <button
                key={tab}
                className={`${styles.viewTab} ${activeTab === tab ? styles.viewTabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
                {tabCounts[tab] > 0 && <span className={styles.viewTabCount}>{tabCounts[tab]}</span>}
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className={styles.filterBar}>
            <div className={styles.filterInputWrap}>
              <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
              <input
                className={styles.filterInput}
                placeholder="Filter by order #, customer…"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className={styles.filterBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_list</span>
              Filter
            </button>
            <button className={styles.filterBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_today</span>
              Date range
            </button>
            <button className={styles.filterBtn}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bookmark</span>
              Saved views
            </button>
            <span className={styles.filterCount}>
              {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} of ${allOrders.length}`}
            </span>
          </div>

          {/* Bulk bar */}
          {selected.size > 0 && (
            <BulkBar
              selectedIds={selectedArray}
              onClear={() => setSelected(new Set())}
              actions={[
                { label: 'Print slips', icon: 'receipt', onClick: () => { onToast(`Printing slips for ${selected.size} orders`); setSelected(new Set()); } },
                { label: 'Print labels', icon: 'print', onClick: () => { onToast(`Printing labels for ${selected.size} orders`); setSelected(new Set()); } },
                { label: 'Mark shipped', icon: 'local_shipping', onClick: () => { onToast(`Marking ${selected.size} orders shipped`); setSelected(new Set()); } },
                { label: 'Mark picked up', icon: 'storefront', onClick: () => { onToast(`Marking ${selected.size} orders picked up`); setSelected(new Set()); } },
                { label: 'Cancel', icon: 'cancel', danger: true, onClick: () => { onToast(`Cancelling ${selected.size} orders`); setSelected(new Set()); } },
              ]}
            />
          )}

          {/* Table */}
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCell}>
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Supplier</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>SLA</th>
                <th>Status</th>
                <th className={styles.actionCell}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className={`${styles.tableRow} ${selected.has(row.id) ? styles.tableRowSelected : ''}`}
                  onClick={() => (onOpenPeek ? onOpenPeek(`Order ${row.id} — ${row.customer}`, {
                    Order: row.id,
                    Customer: row.customer,
                    Items: row.items,
                    Supplier: row.supplier,
                    Total: row.total,
                    SLA: row.sla,
                    Status: row.status,
                  }) : onToast(`Viewing ${row.id}`))
                  }
                >
                  <td className={styles.checkCell}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                    />
                  </td>
                  <td><strong>{row.id}</strong></td>
                  <td>
                    <div className={styles.cellName}>
                      <span className={`${styles.avatar} ${avatarClass(row.customer)}`}>{row.customer[0]}</span>
                      {row.customer}
                    </div>
                  </td>
                  <td>{row.items}</td>
                  <td>{row.supplier}</td>
                  <td style={{ textAlign: 'right' }}>{row.total}</td>
                  <td style={{ color: row.slaPast ? '#ba1a1a' : '#5a6355', fontWeight: row.slaPast ? 600 : 400 }}>{row.sla}</td>
                  <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                  <td className={styles.actionCell}>
                    <RowMenu items={rowMenuItems(row)} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className={styles.emptyState}>No orders match the current filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default OrdersList;
