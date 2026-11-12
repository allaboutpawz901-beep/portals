'use client';

import { useState } from 'react';
import { DomainKey } from '@/data/shellData';
import { BATCH_ORDERS } from '@/data/ordersData';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
}

export function BatchSlips({ onToast }: OrdersScreenProps) {
  const [docType, setDocType] = useState<string>('both');
  const [orders, setOrders] = useState(BATCH_ORDERS.map(o => ({ ...o })));
  const [template, setTemplate] = useState<string>('letter');
  const [carrier, setCarrier] = useState('usps');

  const selectedCount = orders.filter(o => o.checked).length;
  const toggleOrder = (id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, checked: !o.checked } : o));
  };
  const selectAll = () => setOrders(prev => prev.map(o => ({ ...o, checked: true })));
  const clearAll = () => setOrders(prev => prev.map(o => ({ ...o, checked: false })));

  return (
    <div className={styles.container}>
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Batch slips &amp; labels</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Batch slips &amp; labels</h1>
            <p className={styles.pageSubtitle}>Choose what to print, configure the template, preview, and send to printer</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnSecondary} onClick={() => { setOrders(BATCH_ORDERS.map(o => ({ ...o }))); onToast('Reset'); }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
              Reset
            </button>
            <div className={styles.splitBtn}>
              <button className={styles.splitBtnMain} onClick={() => window.print()}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>
                Generate &amp; print
              </button>
              <button className={styles.splitBtnArrow} onClick={() => onToast('Options: Print now / Save as PDF / Download zip / Email batch')}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>expand_more</span>
              </button>
            </div>
          </div>
        </div>

        <div className={styles.batchGrid}>
          {/* Left column — config */}
          <div>
            {/* 1. What to print */}
            <div className={styles.batchSection}>
              <div className={styles.batchSectionNum}>1</div>
              <div className={styles.batchSectionTitle}>What to print</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                {[['both', 'Slips + Labels'], ['slips', 'Slips only'], ['labels', 'Labels only']].map(([val, label]) => (
                  <button key={val} className={`${styles.filterBtn} ${docType === val ? styles.viewTabActive : ''}`} style={{ flex: 1, justifyContent: 'center', height: 34, borderRadius: 6, border: docType === val ? '1px solid #0a6400' : '1px solid #dad9dd', color: docType === val ? '#0a6400' : '#1a1c1e' }} onClick={() => setDocType(val)}>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355' }}>Order source</label>
                  <select className={styles.filterSelect} style={{ width: '100%', marginTop: 4 }} defaultValue="ready">
                    <option value="ready">Ready to ship</option>
                    <option value="unfulfilled">Unfulfilled</option>
                    <option value="pickup">Local pickup</option>
                    <option value="selected">Selected orders</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355' }}>Ship date</label>
                  <input type="date" className={styles.filterSelect} style={{ width: '100%', marginTop: 4 }} defaultValue="2026-11-01" />
                </div>
              </div>
            </div>

            {/* 2. Orders in this batch */}
            <div className={styles.batchSection}>
              <div className={styles.batchSectionNum}>2</div>
              <div className={styles.batchSectionTitle}>Orders in this batch</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{selectedCount} of {orders.length} selected</span>
                <button className={styles.filterBtn} onClick={selectAll}>Select all</button>
                <button className={styles.filterBtn} onClick={clearAll}>Clear</button>
              </div>
              {orders.map((order) => (
                <div key={order.id} className={styles.batchOrderItem}>
                  <input type="checkbox" checked={order.checked} onChange={() => toggleOrder(order.id)} />
                  <div className={styles.batchOrderInfo}>
                    <div className={styles.batchOrderTitle}>{order.id} · {order.customer} — {order.items}</div>
                    <div className={styles.batchOrderSub}>{order.method}{order.pastSla && <span style={{ color: '#ba1a1a', fontWeight: 600, marginLeft: 8 }}>Past SLA</span>}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* 3. Template & paper */}
            <div className={styles.batchSection}>
              <div className={styles.batchSectionNum}>3</div>
              <div className={styles.batchSectionTitle}>Template &amp; paper</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                {[['letter', 'Letter', '8.5×11 · 4-per-page'], ['a4', 'A4', '210×297 · 2-per-page'], ['thermal', '4×6 thermal', 'Direct thermal label']].map(([val, label, sub]) => (
                  <button key={val} className={styles.batchOrderItem} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, border: template === val ? '2px solid #0a6400' : '1px solid #eeedf1', cursor: 'pointer' }} onClick={() => setTemplate(val)}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: template === val ? '#0a6400' : '#5a6355' }}>description</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: 11, color: '#5a6355' }}>{sub}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355' }}>Printer</label>
                  <select className={styles.filterSelect} style={{ width: '100%', marginTop: 4 }}>
                    <option>HP LaserJet Pro</option>
                    <option>Brother HL-L2350DW</option>
                    <option>Zebra ZP450 thermal</option>
                    <option>Save as PDF</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355' }}>Sides</label>
                  <select className={styles.filterSelect} style={{ width: '100%', marginTop: 4 }}>
                    <option>Single-sided</option>
                    <option>Double-sided</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 4. Carrier & shipping */}
            <div className={styles.batchSection}>
              <div className={styles.batchSectionNum}>4</div>
              <div className={styles.batchSectionTitle}>Carrier &amp; shipping</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355' }}>Carrier</label>
                  <select className={styles.filterSelect} style={{ width: '100%', marginTop: 4 }} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                    <option value="usps">USPS</option>
                    <option value="ups">UPS</option>
                    <option value="fedex">FedEx</option>
                    <option value="dhl">DHL Express</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355' }}>Service</label>
                  <select className={styles.filterSelect} style={{ width: '100%', marginTop: 4 }}>
                    <option>Ground Advantage</option>
                    <option>Priority Mail</option>
                    <option>Express</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" /> Include commercial invoice (international)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked /> Include return address on packing slip
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" /> Add &ldquo;fragile&rdquo; sticker on labels
                </label>
              </div>
            </div>
          </div>

          {/* Right column — preview + summary */}
          <div>
            <div className={styles.batchSection}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Preview</h2>
                <span className={styles.badgeNeutral}>{selectedCount} page{selectedCount !== 1 ? 's' : ''}</span>
              </div>
              <div className={styles.batchPreview}>
                {selectedCount > 0 ? (
                  <div className={styles.batchPreviewContent}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 8 }}>Packing Slip</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Unsaid</div>
                    <div style={{ fontSize: 10, color: '#5a6355', marginBottom: 12 }}>ManageKube LLC · Nashville, TN</div>
                    <div style={{ borderTop: '1px solid #dad9dd', paddingTop: 8, fontSize: 11 }}>
                      <div><strong>Order:</strong> {orders.find(o => o.checked)?.id}</div>
                      <div><strong>Customer:</strong> {orders.find(o => o.checked)?.customer}</div>
                      <div style={{ marginTop: 8 }}><strong>Items:</strong></div>
                      <div style={{ color: '#5a6355', fontSize: 10, marginTop: 2 }}>{orders.find(o => o.checked)?.items}</div>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: '#5a6355', fontSize: 13 }}>No orders selected</span>
                )}
              </div>
            </div>

            <div className={styles.batchSection}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Batch summary</h2>
              </div>
              <div className={styles.batchSummaryRow}><span>Orders in batch</span><span>{selectedCount}</span></div>
              <div className={styles.batchSummaryRow}><span>Slips to generate</span><span>{docType !== 'labels' ? selectedCount : 0}</span></div>
              <div className={styles.batchSummaryRow}><span>Labels to generate</span><span>{docType !== 'slips' ? selectedCount : 0}</span></div>
              <div className={styles.batchSummaryRow}><span>Est. pages</span><span>{selectedCount}</span></div>
              <div className={styles.batchSummaryRow}><span>Est. postage</span><span>$18.40</span></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 12, cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked /> Mark orders as &ldquo;Label printed&rdquo; after batch
              </label>
            </div>

            <div className={styles.batchSection}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Quick actions</h2>
              </div>
              <button className={styles.btnSecondary} style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }} onClick={() => onToast('Saved as template preset')}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bookmark_add</span>
                Save as template preset
              </button>
              <button className={styles.btnSecondary} style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }} onClick={() => onToast('Test printing one copy…')}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>
                Test print one copy
              </button>
              <button className={styles.btnSecondary} style={{ width: '100%', justifyContent: 'center' }} onClick={() => onToast('Reprinting last batch…')}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>history</span>
                Reprint last batch
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BatchSlips;
