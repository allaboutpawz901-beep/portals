'use client';

import React, { useState, useMemo } from 'react';
import styles from './PurchaseOrderScreen.module.css';
import { usePlatformStore, type DocumentLine, type DocumentStatus } from '@/lib/platformStore';

interface LineItem {
  id: string;
  item: string;
  sku: string;
  description: string;
  qtyOrd: number;
  qtyRcvd: number;
  unitCost: number;
}

type POViewMode = 'edit' | 'email' | 'vendor' | 'pdf';
type POStatus = 'Open' | 'Sent to Vendor' | 'Partially Received' | 'Fully Received' | 'Cancelled';

/* ═══ Store ↔ screen adapters ═══
   The screen keeps its approved layout; the PO document, supplier and lines
   now come from the shared platform store (§1.1 single source of truth). */

/* Store status vocabulary → the screen's status pill labels */
const toLocalStatus = (s: DocumentStatus): POStatus =>
  s === 'Sent'
    ? 'Sent to Vendor'
    : s === 'PartiallyReceived'
    ? 'Partially Received'
    : s === 'Received'
    ? 'Fully Received'
    : s === 'Closed'
    ? 'Cancelled'
    : 'Open';

const toStoreStatus = (s: POStatus): DocumentStatus =>
  s === 'Sent to Vendor'
    ? 'Sent'
    : s === 'Partially Received'
    ? 'PartiallyReceived'
    : s === 'Fully Received'
    ? 'Received'
    : s === 'Cancelled'
    ? 'Closed'
    : 'Open';

/* The approved screen shows MM/DD/YYYY; the store uses ISO dates */
const toDisplayDate = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso || '—';
};

const toIsoDate = (display: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((display || '').trim());
  return m ? `${m[3]}-${m[1]}-${m[2]}` : display;
};

/* Next PO number per the platform numbering scheme */
const nextPoNumber = () =>
  `PO-${usePlatformStore.getState().documents.filter((d) => d.type === 'PurchaseOrder').length + 3001}`;

interface PurchaseOrderScreenProps {
  onClose?: () => void;
  onToast?: (message: string) => void;
  documentId?: string | null;
}

export default function PurchaseOrderScreen({
  onClose,
  onToast,
  documentId,
}: PurchaseOrderScreenProps) {
  // Shared platform store — single source of truth (§1.1)
  const store = usePlatformStore();

  // Supplier picker options come from the Party store (role: Supplier)
  const suppliers = useMemo(
    () => store.parties.filter((p) => p.roles.includes('Supplier')),
    [store.parties]
  );

  // The PO this screen edits: an explicit id, else the first PO in the store
  const po =
    (documentId ? store.getDocument(documentId) : undefined) ??
    store.documents.find((d) => d.type === 'PurchaseOrder') ??
    null;

  const poNumber = po?.number || nextPoNumber();

  const [viewMode, setViewMode] = useState<POViewMode>('edit');
  const [status, setStatus] = useState<POStatus>(() =>
    po ? toLocalStatus(po.status) : 'Open'
  );
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Vendor selection
  const [selectedVendorIndex, setSelectedVendorIndex] = useState(() => {
    const wanted = po?.partyId || suppliers[0]?.id;
    const idx = suppliers.findIndex((s) => s.id === wanted);
    return idx >= 0 ? idx : 0;
  });
  const activeVendor = suppliers[selectedVendorIndex] || suppliers[0];

  // Dates & terms
  const [orderDate, setOrderDate] = useState(() =>
    po ? toDisplayDate(po.date) : '11/03/2026'
  );
  const [deliveryDate, setDeliveryDate] = useState(() =>
    po ? toDisplayDate(po.dueDate) : '11/15/2026'
  );
  const [paymentTerms, setPaymentTerms] = useState(
    () => store.getParty(po?.partyId || '')?.terms || 'Net 30'
  );
  const [shipVia, setShipVia] = useState('FedEx Ground');
  const [notes, setNotes] = useState(() => po?.memo || '');

  // Lines — initialized from the store document, edited locally, saved on Save
  const [lines, setLines] = useState<LineItem[]>(() =>
    po
      ? po.lines.map((l) => {
          const item = l.itemId ? store.getItem(l.itemId) : undefined;
          return {
            id: l.id,
            item: item?.name || l.description,
            sku: item?.sku || '',
            description: l.description,
            qtyOrd: l.qty,
            qtyRcvd:
              po.status === 'Received' || po.status === 'Closed' ? l.qty : 0,
            unitCost: l.rate,
          };
        })
      : []
  );

  // Accordions in sidebar
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({
    customization: false,
    receiving: true,
    billing: false,
    attachments: false,
  });

  // Customization switches
  const [showSku, setShowSku] = useState(true);
  const [showUnitCost, setShowUnitCost] = useState(true);
  const [showReceivingStatus, setShowReceivingStatus] = useState(true);
  const [showVendorPartNo, setShowVendorPartNo] = useState(false);

  // Table column toggles
  const [colNum, setColNum] = useState(true);
  const [colItem, setColItem] = useState(true);
  const [colDesc, setColDesc] = useState(true);
  const [colQtyOrd, setColQtyOrd] = useState(true);
  const [colQtyRcvd, setColQtyRcvd] = useState(true);
  const [colCost, setColCost] = useState(true);
  const [colAmount, setColAmount] = useState(true);

  // Footer menus
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);

  const toggleAccordion = (id: string) => {
    setExpandedAccordions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Calculations
  const subtotal = useMemo(() => {
    return lines.reduce((acc, l) => acc + l.qtyOrd * l.unitCost, 0);
  }, [lines]);

  const shipping = 45.0;
  const tax = 0.0;
  const grandTotal = subtotal + shipping + tax;

  const totalQtyOrd = useMemo(() => {
    return lines.reduce((acc, l) => acc + l.qtyOrd, 0);
  }, [lines]);

  const totalQtyRcvd = useMemo(() => {
    return lines.reduce((acc, l) => acc + l.qtyRcvd, 0);
  }, [lines]);

  const totalQtyRemaining = Math.max(0, totalQtyOrd - totalQtyRcvd);

  const handleUpdateLine = (id: string, field: keyof LineItem, val: string | number) => {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: val } : l))
    );
  };

  const handleAddLine = () => {
    const nextIdx = lines.length + 1;
    const newLine: LineItem = {
      id: `line-${Date.now()}`,
      item: `Product Item #${nextIdx}`,
      sku: `SKU-${100 + nextIdx}`,
      description: 'Standard Specification',
      qtyOrd: 25,
      qtyRcvd: 0,
      unitCost: 10.0,
    };
    setLines((prev) => [...prev, newLine]);
    onToast?.('Added new line item');
  };

  const handleClearLines = () => {
    setLines([]);
    onToast?.('Cleared all lines');
  };

  // Map screen lines back to store DocumentLines (match the item by SKU)
  const toStoreLines = (ls: LineItem[]): DocumentLine[] =>
    ls.map((l) => {
      const matched = l.sku
        ? store.items.find((i) => i.sku === l.sku)
        : undefined;
      const orig = po?.lines.find((pl) => pl.id === l.id);
      return {
        id: l.id,
        itemId: matched?.id || orig?.itemId || null,
        description: l.description,
        qty: l.qtyOrd,
        rate: l.unitCost,
        amount: l.qtyOrd * l.unitCost,
        taxRate: 0,
        account: orig?.account || '5000 COGS',
        tags: orig?.tags || [],
      };
    });

  // Persist the editor to the shared store (creates the PO when none exists)
  const savePo = (linesOverride?: LineItem[], statusOverride?: DocumentStatus) => {
    const linesToSave = linesOverride ?? lines;
    const sub = linesToSave.reduce((acc, l) => acc + l.qtyOrd * l.unitCost, 0);
    const tot = sub + shipping + tax;
    const partyId = activeVendor?.id || po?.partyId || '';
    const payload = {
      partyId,
      status: statusOverride ?? toStoreStatus(status),
      date: toIsoDate(orderDate),
      dueDate: toIsoDate(deliveryDate),
      lines: toStoreLines(linesToSave),
      subtotal: sub,
      tax,
      shipping,
      total: tot,
      memo: notes,
    };
    if (po) {
      store.updateDocument(po.id, payload);
    } else {
      store.addDocument({
        ...payload,
        type: 'PurchaseOrder',
        number: nextPoNumber(),
        amountPaid: 0,
        balance: tot,
        notes: '',
        tags: [],
        attachments: [],
        orderId: null,
        poId: null,
        channelId: null,
        createdBy: 'Current user',
      });
    }
  };

  // Create bill from this PO (3-way match: PO ↔ receipt ↔ bill)
  const handleCreateBill = () => {
    if (!po) {
      onToast?.('Save the purchase order before creating a bill');
      return;
    }
    const billLines = toStoreLines(lines);
    const sub = billLines.reduce((acc, l) => acc + l.amount, 0);
    const tot = sub + shipping + tax;
    const billNumber = `BILL-${
      usePlatformStore.getState().documents.filter((d) => d.type === 'Bill').length + 2001
    }`;
    store.addDocument({
      type: 'Bill',
      number: billNumber,
      partyId: activeVendor?.id || po.partyId,
      status: 'ForReview',
      date: new Date().toISOString().slice(0, 10),
      dueDate: toIsoDate(deliveryDate),
      lines: billLines,
      subtotal: sub,
      tax,
      shipping,
      total: tot,
      amountPaid: 0,
      balance: tot,
      memo: `Created from purchase order ${po.number}`,
      notes: '',
      tags: [],
      attachments: [],
      orderId: null,
      poId: po.id,
      channelId: null,
      createdBy: 'Current user',
    });
    onToast?.(`Bill ${billNumber} created from ${po.number} — added to 'For review'`);
  };

  const handleReceiveItems = () => {
    // Mark items as received
    const received = lines.map((l) => ({ ...l, qtyRcvd: l.qtyOrd }));
    setLines(received);
    setStatus('Fully Received');
    if (po) {
      savePo(received, 'Received');
      store.changeDocumentStatus(po.id, 'Received');
    }
    onToast?.('All items marked as received');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusClass = (st: POStatus) => {
    switch (st) {
      case 'Open':
        return styles.statusOpen;
      case 'Sent to Vendor':
        return styles.statusSent;
      case 'Partially Received':
        return styles.statusPartial;
      case 'Fully Received':
        return styles.statusReceived;
      case 'Cancelled':
        return styles.statusCancelled;
      default:
        return styles.statusOpen;
    }
  };

  return (
    <div className={styles.container}>
      {/* ═══════════ TOP HEADER ═══════════ */}
      <header className={styles.header}>
        <div className={styles.topRow}>
          <div className={styles.titleArea}>
            <button
              type="button"
              className={styles.iconBtn}
              title="Audit history"
              onClick={() => onToast?.('Viewing PO audit history')}
            >
              <span className="material-symbols-outlined">history</span>
            </button>
            <h1 className={styles.mainTitle}>Purchase Order {poNumber.replace(/^PO-/, '')}</h1>
            <span className={`${styles.statusPill} ${getStatusClass(status)}`}>
              {status}
            </span>
          </div>

          <div className={styles.topRightActions}>
            <button
              type="button"
              className={styles.iconBtn}
              title="Help & docs"
              onClick={() => onToast?.('Help and documentation')}
            >
              <span className="material-symbols-outlined">help_outline</span>
            </button>
            <button
              type="button"
              className={styles.starCircleBtn}
              title="Pin purchase order"
              onClick={() => onToast?.('Purchase Order pinned to favorites')}
            >
              <span className="material-symbols-outlined">star</span>
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              title="Close"
              onClick={() => {
                if (onClose) onClose();
                else onToast?.('Closed Purchase Order');
              }}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Tabs & Quick Actions */}
        <div className={styles.tabRow}>
          <div className={styles.viewsTabs}>
            <button
              type="button"
              className={`${styles.tabBtn} ${viewMode === 'edit' ? styles.tabBtnActive : ''}`}
              onClick={() => setViewMode('edit')}
            >
              Edit
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${viewMode === 'email' ? styles.tabBtnActive : ''}`}
              onClick={() => setViewMode('email')}
            >
              Email view
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${viewMode === 'vendor' ? styles.tabBtnActive : ''}`}
              onClick={() => setViewMode('vendor')}
            >
              Vendor view
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${viewMode === 'pdf' ? styles.tabBtnActive : ''}`}
              onClick={() => setViewMode('pdf')}
            >
              PDF view
            </button>
          </div>

          <div className={styles.quickActionsGroup}>
            <button
              type="button"
              className={styles.quickActionLink}
              onClick={() => {
                setSidebarOpen((prev) => !prev);
                onToast?.(sidebarOpen ? 'Sidebar collapsed' : 'Sidebar expanded');
              }}
            >
              <span className="material-symbols-outlined">settings</span>
              Manage
            </button>
            <button
              type="button"
              className={styles.quickActionLink}
              onClick={handleReceiveItems}
            >
              <span className="material-symbols-outlined">local_shipping</span>
              Receive items
            </button>
            <button
              type="button"
              className={styles.quickActionLink}
              onClick={handleCreateBill}
            >
              <span className="material-symbols-outlined">receipt_long</span>
              Create bill
            </button>
            <button
              type="button"
              className={styles.quickActionLink}
              onClick={() => onToast?.('Feedback dialog opened')}
            >
              <span className="material-symbols-outlined">chat_bubble_outline</span>
              Feedback
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════ MAIN WORKSPACE AREA ═══════════ */}
      <div className={styles.workspace}>
        {/* Left Side: Document Canvas */}
        <div className={styles.canvasWrapper}>
          {/* 1. EDIT VIEW */}
          {viewMode === 'edit' && (
            <div className={styles.editContainer}>
              <div className={styles.documentPaper}>
                {/* Header: Company & PO # */}
                <div className={styles.docHeader}>
                  <div>
                    <h2 className={styles.companyTitle}>PURCHASE ORDER</h2>
                    <div className={styles.companyName}>Unsaid</div>
                    <div className={styles.companyMeta}>
                      123 Business Rd, Suite 100
                      <br />
                      hello@unsaid.com
                    </div>
                  </div>
                  <div className={styles.poNumberBlock}>
                    <div className={styles.poLabel}>PO Number</div>
                    <div className={styles.poValue}>{poNumber}</div>
                  </div>
                </div>

                {/* Vendor / Ship To Grid */}
                <div className={styles.partyGrid}>
                  <div className={styles.vendorBlock}>
                    <div className={styles.partyLabel}>Vendor</div>
                    <div className={styles.selectWrapper}>
                      <select
                        className={styles.vendorSelect}
                        value={selectedVendorIndex}
                        onChange={(e) => setSelectedVendorIndex(Number(e.target.value))}
                      >
                        {suppliers.map((v, i) => (
                          <option key={v.id} value={i}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      <span className={`material-symbols-outlined ${styles.selectArrow}`}>
                        expand_more
                      </span>
                    </div>
                    <div className={styles.partyDetails}>
                      {activeVendor?.email}
                      <br />
                      {activeVendor?.phone}
                    </div>
                  </div>

                  <div>
                    <div className={styles.partyLabel}>Ship To</div>
                    <div className={styles.partyName}>Unsaid Warehouse</div>
                    <div className={styles.partyDetails}>
                      456 Warehouse Way
                      <br />
                      Dock 4
                      <br />
                      Springfield, IL 62701
                    </div>
                  </div>
                </div>

                {/* Dates & Terms Row */}
                <div className={styles.metaGrid}>
                  <div className={styles.metaField}>
                    <label className={styles.fieldLabel}>Order Date</label>
                    <input
                      type="text"
                      className={styles.textInput}
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                    />
                  </div>
                  <div className={styles.metaField}>
                    <label className={styles.fieldLabel}>Expected Delivery</label>
                    <input
                      type="text"
                      className={styles.textInput}
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                    />
                  </div>
                  <div className={styles.metaField}>
                    <label className={styles.fieldLabel}>Payment Terms</label>
                    <input
                      type="text"
                      className={styles.textInput}
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value)}
                    />
                  </div>
                  <div className={styles.metaField}>
                    <label className={styles.fieldLabel}>Ship Via</label>
                    <input
                      type="text"
                      className={styles.textInput}
                      value={shipVia}
                      onChange={(e) => setShipVia(e.target.value)}
                    />
                  </div>
                </div>

                {/* Product Lines Table */}
                <div className={styles.tableWrapper}>
                  <table className={styles.linesTable}>
                    <thead>
                      <tr className={styles.linesHeaderRow}>
                        <th className={styles.thCell} style={{ width: 36 }}></th>
                        {colNum && <th className={styles.thCell} style={{ width: 36 }}>#</th>}
                        {colItem && <th className={styles.thCell}>Item / SKU</th>}
                        {colDesc && <th className={styles.thCell}>Description</th>}
                        {colQtyOrd && (
                          <th className={styles.thCellRight} style={{ width: 70 }}>
                            Qty Ord
                          </th>
                        )}
                        {colQtyRcvd && (
                          <th className={styles.thCellRight} style={{ width: 70 }}>
                            Qty Rcvd
                          </th>
                        )}
                        {colCost && (
                          <th className={styles.thCellRight} style={{ width: 90 }}>
                            Unit Cost
                          </th>
                        )}
                        {colAmount && (
                          <th className={styles.thCellLast} style={{ width: 90 }}>
                            Amount
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr key={line.id} className={styles.lineRow}>
                          <td className={styles.dragCell}>
                            <span className={`material-symbols-outlined ${styles.dragHandle}`}>
                              drag_indicator
                            </span>
                          </td>
                          {colNum && <td className={styles.numCell}>{idx + 1}</td>}
                          {colItem && (
                            <td className={styles.inputCell}>
                              <input
                                className={styles.cellInput}
                                value={line.item}
                                onChange={(e) =>
                                  handleUpdateLine(line.id, 'item', e.target.value)
                                }
                              />
                              {showSku && (
                                <div className={styles.itemSku}>
                                  SKU: {line.sku}
                                </div>
                              )}
                            </td>
                          )}
                          {colDesc && (
                            <td className={styles.inputCell}>
                              <input
                                className={styles.cellInput}
                                value={line.description}
                                onChange={(e) =>
                                  handleUpdateLine(line.id, 'description', e.target.value)
                                }
                              />
                            </td>
                          )}
                          {colQtyOrd && (
                            <td className={styles.numberCell}>
                              <input
                                className={styles.cellInput}
                                style={{ textAlign: 'right' }}
                                type="number"
                                value={line.qtyOrd}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    line.id,
                                    'qtyOrd',
                                    Number(e.target.value) || 0
                                  )
                                }
                              />
                            </td>
                          )}
                          {colQtyRcvd && (
                            <td className={styles.numberCell}>
                              <input
                                className={styles.cellInput}
                                style={{
                                  textAlign: 'right',
                                  color: line.qtyRcvd > 0 ? '#0a6400' : '#5a6355',
                                  fontWeight: 600,
                                }}
                                type="number"
                                value={line.qtyRcvd}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    line.id,
                                    'qtyRcvd',
                                    Number(e.target.value) || 0
                                  )
                                }
                              />
                            </td>
                          )}
                          {colCost && (
                            <td className={styles.numberCell}>
                              <input
                                className={styles.cellInput}
                                style={{ textAlign: 'right' }}
                                type="number"
                                step="0.5"
                                value={line.unitCost}
                                onChange={(e) =>
                                  handleUpdateLine(
                                    line.id,
                                    'unitCost',
                                    Number(e.target.value) || 0
                                  )
                                }
                              />
                            </td>
                          )}
                          {colAmount && (
                            <td className={styles.numberCellLast}>
                              {formatCurrency(line.qtyOrd * line.unitCost)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className={styles.tableBtnGroup}>
                    <button
                      type="button"
                      className={styles.tableBtn}
                      onClick={handleAddLine}
                    >
                      Add line item
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        expand_more
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.tableBtn}
                      onClick={handleClearLines}
                    >
                      Clear all lines
                    </button>
                  </div>

                  {/* Notes & Totals */}
                  <div className={styles.bottomSection}>
                    <div className={styles.notesArea}>
                      <div>
                        <label className={styles.sectionLabel}>
                          Vendor Instructions / Notes
                        </label>
                        <textarea
                          className={styles.textarea}
                          placeholder="Include packing slip with PO number. Do not substitute items without approval."
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className={styles.sectionLabel}>Attachments</label>
                        <div
                          className={styles.attachmentDropzone}
                          onClick={() => onToast?.('Attachments upload dialog opened')}
                        >
                          <div className={styles.dropzoneTitle}>Add attachment</div>
                          <div className={styles.dropzoneDesc}>Max file size: 20 MB</div>
                        </div>
                      </div>
                    </div>

                    <div className={styles.totalsArea}>
                      <div className={styles.totalsRow}>
                        <span className={styles.totalsRowMuted}>Subtotal</span>
                        <span style={{ fontWeight: 500 }}>{formatCurrency(subtotal)}</span>
                      </div>
                      <div className={styles.totalsRow}>
                        <span className={styles.totalsRowMuted}>Shipping</span>
                        <span style={{ fontWeight: 500 }}>{formatCurrency(shipping)}</span>
                      </div>
                      <div className={styles.totalsRow}>
                        <span className={styles.totalsRowMuted}>Tax</span>
                        <span style={{ fontWeight: 500 }}>{formatCurrency(tax)}</span>
                      </div>
                      <div className={styles.totalsRowFinal}>
                        <span>PO Total</span>
                        <span>{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. EMAIL VIEW */}
          {viewMode === 'email' && (
            <div className={styles.emailCard}>
              <div className={styles.emailBanner}>
                <h2 className={styles.emailTitle}>Purchase Order {poNumber}</h2>
                <div className={styles.emailCompany}>Unsaid</div>
                <div className={styles.emailBadgeBox}>
                  <div className={styles.emailBadgeLabel}>PO Total</div>
                  <div className={styles.emailBadgeAmount}>
                    {formatCurrency(grandTotal)}
                  </div>
                </div>
              </div>

              <div className={styles.emailBody}>
                <div className={styles.emailParagraph}>
                  <p>Hi {activeVendor?.name},</p>
                  <p>
                    Please find attached our purchase order {poNumber}. Please confirm
                    receipt and expected delivery date of {deliveryDate}.
                  </p>
                </div>
                <div className={styles.emailCtaWrapper}>
                  <button
                    type="button"
                    className={styles.emailCtaBtn}
                    onClick={() => setViewMode('vendor')}
                  >
                    View Purchase Order
                  </button>
                </div>
                <div className={styles.emailFooter}>
                  <p style={{ fontWeight: 600, color: '#1a1c1e', marginBottom: 2 }}>
                    Unsaid
                  </p>
                  <p>123 Business Rd, Suite 100</p>
                  <p>hello@unsaid.com</p>
                </div>
              </div>
            </div>
          )}

          {/* 3. VENDOR VIEW */}
          {viewMode === 'vendor' && (
            <div className={styles.vendorCard}>
              <div className={styles.docHeader}>
                <div>
                  <h1 className={styles.companyTitle} style={{ fontSize: 28 }}>
                    PURCHASE ORDER
                  </h1>
                  <div className={styles.companyName}>Unsaid</div>
                </div>
                <div className={styles.poNumberBlock}>
                  <div className={styles.poLabel}>PO Total</div>
                  <div className={styles.poValue} style={{ fontSize: 24 }}>
                    {formatCurrency(grandTotal)}
                  </div>
                </div>
              </div>

              <div className={styles.partyGrid}>
                <div>
                  <div className={styles.partyLabel}>Vendor</div>
                  <div className={styles.partyName}>{activeVendor?.name}</div>
                  <div className={styles.partyDetails}>
                    {activeVendor?.email}
                    <br />
                    {activeVendor?.phone}
                  </div>
                </div>
                <div>
                  <div className={styles.partyLabel}>Ship To</div>
                  <div className={styles.partyName}>Unsaid Warehouse</div>
                  <div className={styles.partyDetails}>
                    456 Warehouse Way, Dock 4
                    <br />
                    Springfield, IL 62701
                  </div>
                </div>
              </div>

              <div className={styles.metaGrid}>
                <div>
                  <span className={styles.fieldLabel}>PO Number</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{poNumber}</span>
                </div>
                <div>
                  <span className={styles.fieldLabel}>Order Date</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{orderDate}</span>
                </div>
                <div>
                  <span className={styles.fieldLabel}>Expected Delivery</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{deliveryDate}</span>
                </div>
                <div>
                  <span className={styles.fieldLabel}>Terms</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{paymentTerms}</span>
                </div>
              </div>

              <table className={styles.linesTable} style={{ marginBottom: 32 }}>
                <thead>
                  <tr className={styles.linesHeaderRow}>
                    <th className={styles.thCell}>Item</th>
                    <th className={styles.thCell}>Description</th>
                    <th className={styles.thCellRight}>Qty Ord</th>
                    <th className={styles.thCellRight}>Unit Cost</th>
                    <th className={styles.thCellLast}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className={styles.lineRow}>
                      <td style={{ fontWeight: 500 }}>{l.item}</td>
                      <td style={{ color: '#5a6355' }}>
                        SKU: {l.sku} · {l.description}
                      </td>
                      <td style={{ textAlign: 'right' }}>{l.qtyOrd}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(l.unitCost)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>
                        {formatCurrency(l.qtyOrd * l.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 48 }}>
                <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#5a6355' }}>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#5a6355' }}>Shipping</span>
                    <span>{formatCurrency(shipping)}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 14,
                      fontWeight: 600,
                      borderTop: '1px solid #dad9dd',
                      paddingTop: 8,
                      marginTop: 4,
                    }}
                  >
                    <span>Total</span>
                    <span>{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderTop: '1px solid #dad9dd',
                  paddingTop: 24,
                  textAlign: 'center',
                  fontSize: 12,
                  color: '#5a6355',
                }}
              >
                <p>
                  Please include PO Number <strong>{poNumber}</strong> on all packing slips and invoices.
                </p>
              </div>
            </div>
          )}

          {/* 4. PDF VIEW */}
          {viewMode === 'pdf' && (
            <div className={styles.pdfCard}>
              <div className={styles.docHeader} style={{ marginBottom: 48 }}>
                <div>
                  <div className={styles.companyTitle} style={{ fontSize: 24, marginBottom: 4 }}>
                    PURCHASE ORDER
                  </div>
                  <div className={styles.companyName}>Unsaid</div>
                  <div className={styles.companyMeta} style={{ marginTop: 4 }}>
                    123 Business Rd, Suite 100
                  </div>
                </div>
                <div className={styles.poNumberBlock}>
                  <div className={styles.poLabel}>PO Total</div>
                  <div className={styles.poValue} style={{ fontSize: 28, fontWeight: 700 }}>
                    {formatCurrency(grandTotal)}
                  </div>
                </div>
              </div>

              <div className={styles.partyGrid} style={{ marginBottom: 48 }}>
                <div>
                  <div className={styles.partyLabel}>Vendor</div>
                  <div className={styles.partyName}>{activeVendor?.name}</div>
                  <div className={styles.partyDetails}>
                    {activeVendor?.email}
                    <br />
                    {activeVendor?.phone}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={styles.partyLabel}>Ship To</div>
                  <div className={styles.partyName}>Unsaid Warehouse</div>
                  <div className={styles.partyDetails}>
                    456 Warehouse Way, Dock 4
                    <br />
                    Springfield, IL 62701
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 36,
                  fontSize: 12,
                }}
              >
                <table>
                  <tbody>
                    <tr>
                      <td style={{ color: '#5a6355', paddingRight: 16, paddingBottom: 4 }}>
                        PO Number
                      </td>
                      <td style={{ fontWeight: 600 }}>{poNumber}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#5a6355', paddingRight: 16, paddingBottom: 4 }}>
                        Order Date
                      </td>
                      <td style={{ fontWeight: 600 }}>{orderDate}</td>
                    </tr>
                  </tbody>
                </table>
                <table>
                  <tbody>
                    <tr>
                      <td style={{ color: '#5a6355', paddingRight: 16, paddingBottom: 4 }}>
                        Expected Delivery
                      </td>
                      <td style={{ fontWeight: 600 }}>{deliveryDate}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#5a6355', paddingRight: 16, paddingBottom: 4 }}>
                        Terms
                      </td>
                      <td style={{ fontWeight: 600 }}>{paymentTerms}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <table className={styles.linesTable} style={{ marginBottom: 32, fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #dad9dd', color: '#5a6355', fontWeight: 700 }}>
                    <th style={{ padding: '12px 0' }}>Item / SKU</th>
                    <th style={{ padding: '12px 0' }}>Description</th>
                    <th style={{ padding: '12px 0', textAlign: 'right' }}>Qty</th>
                    <th style={{ padding: '12px 0', textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ padding: '12px 0', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} style={{ borderBottom: '1px solid #eeedf1' }}>
                      <td style={{ padding: '16px 0', fontWeight: 600 }}>
                        {l.item}
                        <br />
                        <span style={{ color: '#6f7a69', fontWeight: 400, fontSize: 11 }}>
                          SKU: {l.sku}
                        </span>
                      </td>
                      <td style={{ padding: '16px 0', color: '#5a6355' }}>{l.description}</td>
                      <td style={{ padding: '16px 0', textAlign: 'right' }}>{l.qtyOrd}</td>
                      <td style={{ padding: '16px 0', textAlign: 'right' }}>{formatCurrency(l.unitCost)}</td>
                      <td style={{ padding: '16px 0', textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(l.qtyOrd * l.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '2px solid #dad9dd', paddingTop: 16 }}>
                <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5a6355' }}>Subtotal</span>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5a6355' }}>Shipping</span>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(shipping)}</span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 14,
                      fontWeight: 700,
                      borderTop: '1px solid #eeedf1',
                      paddingTop: 8,
                      marginTop: 4,
                    }}
                  >
                    <span>Total</span>
                    <span>{formatCurrency(grandTotal)}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 64, textAlign: 'center', fontSize: 11, color: '#6f7a69' }}>
                <p>Please include PO Number {poNumber} on all packing slips.</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Sidebar Controls (only in Edit view) */}
        {viewMode === 'edit' && sidebarOpen && (
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <h2 className={styles.sidebarTitle}>{poNumber}</h2>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setSidebarOpen(false)}
                title="Collapse sidebar"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className={styles.sidebarBody}>
              {/* Status Dropdown */}
              <div className={styles.statusDropdownContainer}>
                <button
                  type="button"
                  className={styles.statusSelectBtn}
                  onClick={() => setStatusMenuOpen((prev) => !prev)}
                >
                  {status}
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    expand_more
                  </span>
                </button>

                {statusMenuOpen && (
                  <div className={styles.dropdownMenu}>
                    {(
                      [
                        'Open',
                        'Sent to Vendor',
                        'Partially Received',
                        'Fully Received',
                        'Cancelled',
                      ] as POStatus[]
                    ).map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={styles.dropdownMenuItem}
                        onClick={() => {
                          setStatus(st);
                          setStatusMenuOpen(false);
                          onToast?.(`Status changed to ${st}`);
                        }}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Accordions Stack */}
              <div className={styles.accordionsStack}>
                {/* 1. Customization */}
                <div className={styles.accordionCard}>
                  <button
                    type="button"
                    className={styles.accordionHeader}
                    onClick={() => toggleAccordion('customization')}
                  >
                    Customization
                    <span className="material-symbols-outlined">
                      {expandedAccordions.customization ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {expandedAccordions.customization && (
                    <div className={styles.accordionContent}>
                      <div className={styles.switchRow}>
                        <span>Show SKU</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={showSku}
                            onChange={(e) => setShowSku(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Show Unit Cost</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={showUnitCost}
                            onChange={(e) => setShowUnitCost(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Show Receiving Status</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={showReceivingStatus}
                            onChange={(e) => setShowReceivingStatus(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Show Vendor Part No.</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={showVendorPartNo}
                            onChange={(e) => setShowVendorPartNo(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>

                      <div className={styles.tableContentSubhead}>
                        <span className={styles.subheadTitle}>Table content</span>
                        <button
                          type="button"
                          className={styles.subheadLink}
                          onClick={() => onToast?.('Label editing enabled')}
                        >
                          Edit labels
                        </button>
                      </div>

                      <div className={styles.switchRow}>
                        <span>#</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colNum}
                            onChange={(e) => setColNum(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Item / SKU</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colItem}
                            onChange={(e) => setColItem(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Description</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colDesc}
                            onChange={(e) => setColDesc(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Qty Ordered</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colQtyOrd}
                            onChange={(e) => setColQtyOrd(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Qty Received</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colQtyRcvd}
                            onChange={(e) => setColQtyRcvd(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Unit Cost</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colCost}
                            onChange={(e) => setColCost(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                      <div className={styles.switchRow}>
                        <span>Amount</span>
                        <label className={styles.switch}>
                          <input
                            type="checkbox"
                            checked={colAmount}
                            onChange={(e) => setColAmount(e.target.checked)}
                          />
                          <span className={styles.slider}></span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Receiving */}
                <div className={styles.accordionCard}>
                  <button
                    type="button"
                    className={styles.accordionHeader}
                    onClick={() => toggleAccordion('receiving')}
                  >
                    Receiving
                    <span className="material-symbols-outlined">
                      {expandedAccordions.receiving ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {expandedAccordions.receiving && (
                    <div className={styles.accordionContent}>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>Items ordered</span>
                        <span style={{ fontWeight: 500 }}>{totalQtyOrd}</span>
                      </div>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>Items received</span>
                        <span style={{ fontWeight: 600, color: '#0a6400' }}>
                          {totalQtyRcvd}
                        </span>
                      </div>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>Items remaining</span>
                        <span
                          style={{
                            fontWeight: 600,
                            color: totalQtyRemaining > 0 ? '#ba1a1a' : '#0a6400',
                          }}
                        >
                          {totalQtyRemaining}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={styles.receiveItemsBtn}
                        onClick={handleReceiveItems}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          local_shipping
                        </span>
                        Receive items
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. Billing & Terms */}
                <div className={styles.accordionCard}>
                  <button
                    type="button"
                    className={styles.accordionHeader}
                    onClick={() => toggleAccordion('billing')}
                  >
                    Billing &amp; Terms
                    <span className="material-symbols-outlined">
                      {expandedAccordions.billing ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {expandedAccordions.billing && (
                    <div className={styles.accordionContent}>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>Payment Terms</span>
                        <span style={{ fontWeight: 500 }}>{paymentTerms}</span>
                      </div>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>Ship Via</span>
                        <span style={{ fontWeight: 500 }}>{shipVia}</span>
                      </div>
                      <div className={styles.kpiStatRow}>
                        <span className={styles.kpiStatLabel}>FOB</span>
                        <span style={{ fontWeight: 500 }}>Destination</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Attachments */}
                <div className={styles.accordionCard}>
                  <button
                    type="button"
                    className={styles.accordionHeader}
                    onClick={() => toggleAccordion('attachments')}
                  >
                    Attachments
                    <span className="material-symbols-outlined">
                      {expandedAccordions.attachments ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {expandedAccordions.attachments && (
                    <div
                      className={styles.accordionContent}
                      style={{ color: '#5a6355', fontSize: 13 }}
                    >
                      No attachments.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className={styles.footer}>
        <div style={{ width: '30%' }}></div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <button
            type="button"
            className={styles.printLink}
            onClick={() => onToast?.(`Printing or downloading ${poNumber}...`)}
          >
            Print or download
          </button>
        </div>

        <div className={styles.footerActions} style={{ width: '30%', justifyContent: 'flex-end' }}>
          {/* Split Save button */}
          <div className={styles.splitBtnGroup}>
            <button
              type="button"
              className={styles.splitBtnMain}
              onClick={() => {
                savePo();
                onToast?.(`Saved ${poNumber} successfully`);
                onClose?.();
              }}
            >
              Save
            </button>
            <button
              type="button"
              className={styles.splitBtnArrow}
              onClick={() => {
                setSaveMenuOpen((prev) => !prev);
                setSendMenuOpen(false);
              }}
              title="Save options"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                expand_more
              </span>
            </button>

            {saveMenuOpen && (
              <div className={styles.floatingMenu}>
                <button
                  type="button"
                  className={styles.floatingMenuItem}
                  onClick={() => {
                    setSaveMenuOpen(false);
                    savePo();
                    onToast?.('Saved and new PO started');
                  }}
                >
                  Save and new
                </button>
                <button
                  type="button"
                  className={styles.floatingMenuItem}
                  onClick={() => {
                    setSaveMenuOpen(false);
                    savePo();
                    onToast?.('Saved and closed');
                    if (onClose) onClose();
                  }}
                >
                  Save and close
                </button>
              </div>
            )}
          </div>

          {/* Split Send button */}
          <div className={styles.splitBtnGroup}>
            <button
              type="button"
              className={styles.splitBtnPrimaryMain}
              onClick={() => {
                setStatus('Sent to Vendor');
                if (po) {
                  savePo(undefined, 'Sent');
                  store.changeDocumentStatus(po.id, 'Sent');
                }
                onToast?.(`${poNumber} sent to ${activeVendor?.name} (${activeVendor?.email})`);
                onClose?.();
              }}
            >
              Send to Vendor
            </button>
            <button
              type="button"
              className={styles.splitBtnPrimaryArrow}
              onClick={() => {
                setSendMenuOpen((prev) => !prev);
                setSaveMenuOpen(false);
              }}
              title="Send options"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                expand_more
              </span>
            </button>

            {sendMenuOpen && (
              <div className={styles.floatingMenu}>
                <button
                  type="button"
                  className={styles.floatingMenuItem}
                  onClick={() => {
                    setSendMenuOpen(false);
                    setStatus('Sent to Vendor');
                    if (po) store.changeDocumentStatus(po.id, 'Sent');
                    onToast?.(`Opening send flow to ${activeVendor?.email}...`);
                  }}
                >
                  Send to Vendor
                </button>
                <button
                  type="button"
                  className={styles.floatingMenuItem}
                  onClick={() => {
                    setSendMenuOpen(false);
                    onToast?.(`Downloading PDF ${poNumber}...`);
                  }}
                >
                  Download PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
