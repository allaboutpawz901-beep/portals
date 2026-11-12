'use client';

import { useState, useMemo } from 'react';
import { DomainKey } from '@/data/shellData';
import { getInventory, INVENTORY_TABS, InventoryRow } from '@/data/ordersData';
import RowMenu, { RowMenuItem, BulkBar } from '@/components/ListPrimitives';
import { usePlatformStore } from '@/lib/platformStore';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
}

export function InventoryView({ onToast, onNavigate, onCreate, onOpenCreateFlyout }: OrdersScreenProps) {
  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState('');
  // Split-arrow dropdown — real inventory ops (was a toast stub).
  const [invMenuOpen, setInvMenuOpen] = useState(false);
  // Stock history — REAL: every document whose lines reference the SKU,
  // joined from the shared store (POs, invoices, receipts, credit memos).
  const [historySku, setHistorySku] = useState<InventoryRow | null>(null);
  const store = usePlatformStore();
  const [warehouse, setWarehouse] = useState('All');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return getInventory().filter(row => {
      if (activeTab !== 'All' && row.status !== activeTab) return false;
      if (warehouse !== 'All' && row.warehouse !== warehouse) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return row.sku.toLowerCase().includes(q) || row.product.toLowerCase().includes(q);
    });
  }, [activeTab, search, warehouse]);

  const toggleSelect = (sku: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });

  const rowMenuItems = (row: InventoryRow): RowMenuItem[] => [
    { label: 'View in Catalog', icon: 'open_in_new', onClick: () => onNavigate('catalog', 'products') },
    { label: 'Adjust stock', icon: 'tune', onClick: () => (onCreate ? onCreate('Stock adjustment') : onToast(`Adjusting ${row.product}`)) },
    { label: 'Transfer', icon: 'swap_horiz', onClick: () => (onCreate ? onCreate('Transfer') : onToast(`Transferring ${row.product}`)) },
    { label: 'Stock history', icon: 'history', dividerBefore: true, onClick: () => setHistorySku(row) },
    { label: 'Start cycle count', icon: 'inventory_2', onClick: () => (onCreate ? onCreate('Cycle count') : onToast(`Cycle count for ${row.product}`)) },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Inventory</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Inventory</h1>
            <p className={styles.pageSubtitle}>On-hand stock, bin locations, and reorder points across warehouses</p>
          </div>
          <div className={styles.headerActions}>
            <div className={`${styles.splitBtn} relative`}>
              <button className={styles.splitBtnMain} onClick={() => (onCreate ? onCreate('Stock adjustment') : onToast('Adjust stock — opening drawer'))}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>tune</span>
                Adjust stock
              </button>
              <button className={styles.splitBtnArrow} aria-label="Inventory options" onClick={() => setInvMenuOpen(v => !v)}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>expand_more</span>
              </button>
              {invMenuOpen && (
                <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 60 }} onClick={() => setInvMenuOpen(false)}>
                  <div className="menu-header">Inventory operations</div>
                  <button onClick={() => onCreate('Adjustment')}><span className="material-symbols-outlined">tune</span>Adjustment</button>
                  <button onClick={() => onCreate('Transfer')}><span className="material-symbols-outlined">swap_horiz</span>Transfer</button>
                  <button onClick={() => onCreate('Cycle count')}><span className="material-symbols-outlined">inventory_2</span>Cycle count</button>
                  <button onClick={() => onCreate('Reorder POs')}><span className="material-symbols-outlined">shopping_bag</span>Reorder POs</button>
                </div>
              )}
            </div>
            <button className={styles.btnSecondary} onClick={() => onToast('Syncing from supplier…')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sync</span>
              Sync from supplier
            </button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className={styles.kpiGrid}>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into total SKUs')}>
            <div className={styles.kpiValue}>342</div>
            <div className={styles.kpiLabel}>Total SKUs</div>
            <div className={styles.kpiDelta}>Across 2 warehouses</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into in stock')}>
            <div className={styles.kpiValue} style={{ color: '#1e5a38' }}>298</div>
            <div className={styles.kpiLabel}>In stock</div>
            <div className={styles.kpiDelta}>87% healthy</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into low stock')}>
            <div className={styles.kpiValue} style={{ color: '#6b1e28' }}>32</div>
            <div className={styles.kpiLabel}>Low stock</div>
            <div className={styles.kpiDelta}>Below reorder point</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into out of stock')}>
            <div className={styles.kpiValue} style={{ color: '#ba1a1a' }}>12</div>
            <div className={styles.kpiLabel}>Out of stock</div>
            <div className={styles.kpiDelta}>3 on open orders</div>
          </button>
        </div>

        {/* Create actions */}
        <div className={styles.createActionsRow}>
          <span className={styles.createActionsLabel}>Create actions:</span>
          <button className={styles.createChip} onClick={() => (onCreate ? onCreate('Adjustment') : onToast('Adjustment — opening'))}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>tune</span>Adjustment</button>
          <button className={styles.createChip} onClick={() => (onCreate ? onCreate('Transfer') : onToast('Transfer — opening'))}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>swap_horiz</span>Transfer</button>
          <button className={styles.createChip} onClick={() => (onCreate ? onCreate('Cycle count') : onToast('Cycle count — opening'))}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>inventory_2</span>Cycle count</button>
          <button className={styles.createChip} onClick={() => (onCreate ? onCreate('Reorder POs') : onToast('Reorder POs — opening'))}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>shopping_bag</span>Reorder POs</button>
          <button className={styles.showAllChip} onClick={() => (onOpenCreateFlyout ? onOpenCreateFlyout() : onToast('Show all create options'))}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>apps</span>Show all</button>
        </div>

        {/* Table */}
        <div className={styles.tableCard}>
          <div className={styles.viewTabsBar}>
            {INVENTORY_TABS.map(tab => (
              <button key={tab} className={`${styles.viewTab} ${activeTab === tab ? styles.viewTabActive : ''}`} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          <div className={styles.filterBar}>
            <div className={styles.filterInputWrap}>
              <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
              <input className={styles.filterInput} placeholder="Filter by SKU, product…" type="text" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className={styles.filterSelect} value={warehouse} onChange={e => setWarehouse(e.target.value)}>
              <option>All</option>
              <option>Charlotte</option>
              <option>Nashville</option>
            </select>
            <button className={styles.filterBtn}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_list</span>Filter</button>
            <span className={styles.filterCount}>{selected.size > 0 ? `${selected.size} selected` : `${filtered.length} of ${getInventory().length}`}</span>
          </div>

          {selected.size > 0 && (
            <BulkBar
              selectedIds={Array.from(selected)}
              onClear={() => setSelected(new Set())}
              actions={[
                { label: 'Create PO', icon: 'shopping_bag', onClick: () => { onCreate('Purchase order'); setSelected(new Set()); } },
                { label: 'Adjust', icon: 'tune', onClick: () => { onCreate('Adjustment'); setSelected(new Set()); } },
                { label: 'Transfer', icon: 'swap_horiz', onClick: () => { onCreate('Transfer'); setSelected(new Set()); } },
              ]}
            />
          )}

          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkCell}><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.sku)))} /></th>
                <th>SKU / Product</th>
                <th>Warehouse</th>
                <th>Bin</th>
                <th style={{ textAlign: 'right' }}>On hand</th>
                <th style={{ textAlign: 'right' }}>Committed</th>
                <th style={{ textAlign: 'right' }}>Available</th>
                <th style={{ textAlign: 'right' }}>Reorder pt</th>
                <th>Status</th>
                <th className={styles.actionCell}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.sku} className={`${styles.tableRow} ${selected.has(row.sku) ? styles.tableRowSelected : ''}`}>
                  <td className={styles.checkCell}><input type="checkbox" checked={selected.has(row.sku)} onChange={() => toggleSelect(row.sku)} /></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{row.product}</div>
                    <div style={{ fontSize: 11, color: '#5a6355', fontFamily: 'monospace' }}>{row.sku}</div>
                  </td>
                  <td>{row.warehouse}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.bin}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.onHand}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.committed}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.available < 0 ? '#ba1a1a' : '#1a1c1e', fontWeight: row.available < 0 ? 700 : 400 }}>{row.available}</td>
                  <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.reorderPoint}</td>
                  <td><span className={styles.statusPill} data-status={row.status}>{row.status}</span></td>
                  <td className={styles.actionCell}><RowMenu items={rowMenuItems(row)} /></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={10} className={styles.emptyState}>No inventory items match the current filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock history — REAL join: every store document whose lines
          reference this SKU (via itemId → item.sku, or the line description),
          across POs, invoices, receipts and credit memos. */}
      {historySku && (() => {
        const lineTouchesSku = (l: { itemId: string | null; description: string }) => {
          const item = l.itemId ? store.getItem(l.itemId) : null;
          return (item != null && (item.sku === historySku.sku || item.name === historySku.product)) || l.description.includes(historySku.product);
        };
        const events = store.documents
          .filter(d => d.lines.some(lineTouchesSku))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 25);
        return (
          <div className="modal-scrim open" onClick={() => setHistorySku(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h3 className="text-headline-sm">Stock history</h3>
                  <div className="text-[12px] text-on-surface-variant">{historySku.product} · <span className="font-mono">{historySku.sku}</span> · {historySku.warehouse}</div>
                </div>
                <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setHistorySku(null)} aria-label="Close">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              {events.length === 0 ? (
                <div className="border border-surface-dim rounded-lg p-4 text-body-sm text-on-surface-variant mt-3">
                  No documents reference this SKU yet — invoices, POs, receipts and credit memos with this item will appear here.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto border border-surface-dim rounded-lg divide-y divide-surface-dim mt-3">
                  {events.map(d => {
                    const party = store.getParty(d.partyId);
                    const qty = d.lines.filter(lineTouchesSku).reduce((s, l) => s + l.qty, 0);
                    return (
                      <div key={d.id} className="px-3 py-2 flex items-center gap-3 text-body-sm">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">{d.type === 'PurchaseOrder' ? 'shopping_bag' : d.type === 'Invoice' ? 'receipt_long' : 'description'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{d.number} · {d.type}</div>
                          <div className="text-[11px] text-on-surface-variant truncate">{d.date} · {party?.name || '—'}</div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div className={d.type === 'PurchaseOrder' ? 'text-secondary font-semibold' : 'text-on-surface font-semibold'}>{d.type === 'PurchaseOrder' ? `+${qty}` : `-${qty}`}</div>
                          <div className="text-[11px] text-on-surface-variant">{d.status}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default InventoryView;
