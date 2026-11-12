'use client';

import { useState } from 'react';
import { DomainKey } from '@/data/shellData';
import { CARRIERS, SHIPPING_TABS, CarrierRow } from '@/data/ordersData';
import RowMenu, { RowMenuItem, BulkBar } from '@/components/ListPrimitives';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
}

export function ShippingSettings({ onToast }: OrdersScreenProps) {
  const [activeTab, setActiveTab] = useState<string>('Carriers');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = CARRIERS.filter(c => !search.trim() || c.carrier.toLowerCase().includes(search.toLowerCase()));

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rowMenuItems = (row: CarrierRow): RowMenuItem[] => [
    { label: 'Edit settings', icon: 'edit', onClick: () => onToast(`Editing ${row.carrier}`) },
    { label: 'Test rates', icon: 'calculate', onClick: () => onToast(`Testing rates for ${row.carrier}`) },
    { label: 'Manage services', icon: 'list', onClick: () => onToast(`Managing services for ${row.carrier}`) },
    { label: 'Disable carrier', icon: 'block', dividerBefore: true, onClick: () => onToast(`Disabled ${row.carrier}`) },
    { label: 'Disconnect', icon: 'link_off', danger: true, onClick: () => onToast(`Disconnected ${row.carrier}`) },
  ];

  const carrierBadgeClass = (carrier: string) => {
    if (carrier.includes('USPS')) return styles.carrierUSPS;
    if (carrier.includes('UPS')) return styles.carrierUPS;
    if (carrier.includes('FedEx')) return styles.carrierFedEx;
    if (carrier.includes('DHL')) return styles.carrierDHL;
    return styles.carrierUSPS;
  };

  const packaging = [
    { name: 'Small Mailer', sub: '6" × 9" · 1 lb max · $0.35 each', icon: 'inventory_2' },
    { name: 'Medium Box', sub: '10" × 8" × 4" · 5 lb max · $0.80 each', icon: 'inventory_2' },
    { name: 'Large Box', sub: '14" × 10" × 6" · 20 lb max · $1.20 each', icon: 'inventory_2' },
  ];

  const rules = [
    { name: 'Free shipping on orders over $75', sub: 'Ground · Domestic US only', icon: 'rule' },
    { name: 'International: USPS Priority Mail Int\'l', sub: 'Default for non-US addresses', icon: 'rule' },
    { name: 'Local pickup: flat $0.00', sub: 'Nashville warehouse · Pickup only', icon: 'rule' },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Shipping settings</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Shipping settings</h1>
            <p className={styles.pageSubtitle}>Carrier accounts, packaging, and delivery rules</p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.splitBtn}>
              <button className={styles.splitBtnMain} onClick={() => onToast('Connect carrier — opening')}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                Connect carrier
              </button>
              <button className={styles.splitBtnArrow} onClick={() => onToast('Options: USPS / UPS / FedEx / DHL / Custom API')}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>expand_more</span>
              </button>
            </div>
            <button className={styles.btnSecondary} onClick={() => onToast('Testing rates…')}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calculate</span>
              Test rates
            </button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className={styles.kpiGrid}>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into active carriers')}>
            <div className={styles.kpiValue}>3</div>
            <div className={styles.kpiLabel}>Active carriers</div>
            <div className={styles.kpiDelta}>USPS · UPS · FedEx</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into label cost')}>
            <div className={styles.kpiValue}>$8.42</div>
            <div className={styles.kpiLabel}>Avg. label cost</div>
            <div className={styles.kpiDelta}>Last 30 days</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into packaging')}>
            <div className={styles.kpiValue}>6</div>
            <div className={styles.kpiLabel}>Packaging</div>
            <div className={styles.kpiDelta}>Boxes &amp; envelopes</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onToast('Drill into on-time delivery')}>
            <div className={styles.kpiValue} style={{ color: '#1e5a38' }}>96.4%</div>
            <div className={styles.kpiLabel}>On-time delivery</div>
            <div className={styles.kpiDelta}>Last 30 days</div>
          </button>
        </div>

        <div className={styles.tableCard}>
          {/* View tabs */}
          <div className={styles.viewTabsBar}>
            {SHIPPING_TABS.map((tab) => (
              <button key={tab} className={`${styles.viewTab} ${activeTab === tab ? styles.viewTabActive : ''}`} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Carriers' && (
            <>
              <div className={styles.filterBar}>
                <div className={styles.filterInputWrap}>
                  <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
                  <input className={styles.filterInput} placeholder="Filter by carrier…" type="text" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <button className={styles.filterBtn}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>filter_list</span>Filter</button>
                <span className={styles.filterCount}>{selected.size > 0 ? `${selected.size} selected` : `${filtered.length} of ${CARRIERS.length}`}</span>
              </div>

              {selected.size > 0 && (
                <BulkBar
                  selectedIds={Array.from(selected)}
                  onClear={() => setSelected(new Set())}
                  actions={[
                    { label: 'Enable', icon: 'check_circle', onClick: () => { onToast(`Enabling ${selected.size} carriers`); setSelected(new Set()); } },
                    { label: 'Disable', icon: 'block', onClick: () => { onToast(`Disabling ${selected.size} carriers`); setSelected(new Set()); } },
                    { label: 'Test rates', icon: 'calculate', onClick: () => { onToast(`Testing rates for ${selected.size} carriers`); setSelected(new Set()); } },
                  ]}
                />
              )}

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.checkCell}><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id)))} /></th>
                    <th>Carrier</th>
                    <th>Account</th>
                    <th>Services</th>
                    <th style={{ textAlign: 'right' }}>Avg. rate</th>
                    <th>Status</th>
                    <th className={styles.actionCell}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.id} className={`${styles.tableRow} ${selected.has(row.id) ? styles.tableRowSelected : ''}`}>
                      <td className={styles.checkCell}><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} /></td>
                      <td>
                        <div className={styles.cellName}>
                          <span className={`${styles.carrierBadge} ${carrierBadgeClass(row.carrier)}`}>{row.badge}</span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{row.carrier}</div>
                          </div>
                        </div>
                      </td>
                      <td>{row.account}</td>
                      <td style={{ fontSize: 12 }}>{row.services}</td>
                      <td style={{ textAlign: 'right' }}>{row.avgRate}</td>
                      <td>
                        <span className={styles.statusPill} data-status={row.status}>
                          {row.status === 'Connected' && <span className="material-symbols-outlined" style={{ fontSize: 10, marginRight: 2 }}>check_circle</span>}
                          {row.status === 'Needs auth' && <span className="material-symbols-outlined" style={{ fontSize: 10, marginRight: 2 }}>error</span>}
                          {row.status}
                        </span>
                      </td>
                      <td className={styles.actionCell}><RowMenu items={rowMenuItems(row)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {activeTab === 'Packaging' && (
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 className={styles.panelTitle}>Boxes &amp; envelopes</h2>
                <button className={styles.btnPrimary} onClick={() => onToast('Add packaging — opening')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  Add packaging
                </button>
              </div>
              {packaging.map(item => (
                <div key={item.name} className={styles.listItem}>
                  <div className={styles.listItemIcon}><span className="material-symbols-outlined">{item.icon}</span></div>
                  <div className={styles.listItemInfo}>
                    <div className={styles.listItemTitle}>{item.name}</div>
                    <div className={styles.listItemSub}>{item.sub}</div>
                  </div>
                  <button className={styles.listItemAction} onClick={() => onToast(`Editing ${item.name}`)}>Edit</button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'Rules' && (
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 className={styles.panelTitle}>Shipping rules</h2>
                <button className={styles.btnPrimary} onClick={() => onToast('Add rule — opening')}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  Add rule
                </button>
              </div>
              {rules.map(rule => (
                <div key={rule.name} className={styles.listItem}>
                  <div className={styles.listItemIcon}><span className="material-symbols-outlined">{rule.icon}</span></div>
                  <div className={styles.listItemInfo}>
                    <div className={styles.listItemTitle}>{rule.name}</div>
                    <div className={styles.listItemSub}>{rule.sub}</div>
                  </div>
                  <span className={styles.statusPill} data-status="Connected">Active</span>
                  <button className={styles.listItemAction} onClick={() => onToast(`Editing ${rule.name}`)}>Edit</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShippingSettings;
