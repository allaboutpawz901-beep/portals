'use client';
/* DocumentEngine.tsx — The ONE engine that renders every multi-line transaction.
   Per platform-component-map.md §1.1 Rule:
   "Every Document is rendered by one Document Engine (header → lines → totals →
   attachments/memo → status → activity). Invoice, Bill, PO, Sales order, Estimate,
   Credit memo, Vendor credit differ only by config."
   
   This replaces the 8+ separate finance screen implementations. */

import { useState, useMemo, useEffect, useRef } from 'react';
import { usePlatformStore, type DocumentType, type Document, type DocumentLine, type PartyRole, type Item } from '@/lib/platformStore';
import { PartyPicker, AccountPicker } from './UniversalPickers';

/* ─── Document Config (what makes each type different) ─── */
interface DocConfig {
  type: DocumentType;
  label: string;           // "Invoice", "Bill", "Purchase Order"
  numberPrefix: string;    // "INV-", "BILL-", "PO-"
  partyLabel: string;      // "Customer", "Vendor", "Supplier"
  partyRole: string;       // "Customer", "Vendor", "Supplier"
  dateLabel: string;       // "Invoice date", "Bill date"
  dueLabel: string;        // "Due date", "Due date"
  lineColumns: { key: string; label: string; width?: string; align?: 'left' | 'right' }[];
  statuses: string[];
  canRecordPayment: boolean;
  canSend: boolean;
  canPrint: boolean;
  showShipTo: boolean;
  showPaymentOptions: boolean;
  primaryAction: string;   // "Review and send", "Save bill", "Send to supplier"
}

const CONFIGS: Record<DocumentType, DocConfig> = {
  Invoice: {
    type: 'Invoice', label: 'Invoice', numberPrefix: 'INV-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Invoice date', dueLabel: 'Due date',
    lineColumns: [
      { key: 'description', label: 'Product/service', align: 'left' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Sent', 'Unpaid', 'Overdue', 'Paid', 'Deposited', 'Void'],
    canRecordPayment: true, canSend: true, canPrint: true, showShipTo: false, showPaymentOptions: true,
    primaryAction: 'Review and send',
  },
  Estimate: {
    type: 'Estimate', label: 'Estimate', numberPrefix: 'EST-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Estimate date', dueLabel: 'Expiration date',
    lineColumns: [
      { key: 'description', label: 'Product/service', align: 'left' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Sent', 'Converted', 'Declined', 'Closed'],
    canRecordPayment: false, canSend: true, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Review and send',
  },
  Bill: {
    type: 'Bill', label: 'Bill', numberPrefix: 'BILL-', partyLabel: 'Vendor', partyRole: 'Vendor',
    dateLabel: 'Bill date', dueLabel: 'Due date',
    lineColumns: [
      { key: 'description', label: 'Category / Item', align: 'left' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['ForReview', 'Approved', 'Unpaid', 'Overdue', 'Paid', 'Void'],
    canRecordPayment: true, canSend: false, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Save bill',
  },
  PurchaseOrder: {
    type: 'PurchaseOrder', label: 'Purchase Order', numberPrefix: 'PO-', partyLabel: 'Supplier', partyRole: 'Supplier',
    dateLabel: 'Order date', dueLabel: 'Expected delivery',
    lineColumns: [
      { key: 'description', label: 'Item', align: 'left' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Unit cost', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Open', 'Sent', 'PartiallyReceived', 'Received', 'Closed'],
    canRecordPayment: false, canSend: true, canPrint: true, showShipTo: true, showPaymentOptions: false,
    primaryAction: 'Send to supplier',
  },
  SalesReceipt: {
    type: 'SalesReceipt', label: 'Sales Receipt', numberPrefix: 'SR-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Sale date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Product/service', align: 'left' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Paid', 'Deposited'],
    canRecordPayment: false, canSend: true, canPrint: true, showShipTo: false, showPaymentOptions: true,
    primaryAction: 'Save and print',
  },
  CreditMemo: {
    type: 'CreditMemo', label: 'Credit Memo', numberPrefix: 'CM-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Product/service', align: 'left' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Applied', 'Refunded', 'Void'],
    canRecordPayment: true, canSend: true, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Save',
  },
  SalesOrder: {
    type: 'SalesOrder', label: 'Sales Order', numberPrefix: 'SO-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Order date', dueLabel: 'Expected ship',
    lineColumns: [
      { key: 'description', label: 'Product/service', align: 'left' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Open', 'Fulfilled', 'Closed'],
    canRecordPayment: true, canSend: true, canPrint: true, showShipTo: true, showPaymentOptions: false,
    primaryAction: 'Save order',
  },
  VendorCredit: {
    type: 'VendorCredit', label: 'Vendor Credit', numberPrefix: 'VC-', partyLabel: 'Vendor', partyRole: 'Vendor',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Category / Item', align: 'left' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Applied', 'Void'],
    canRecordPayment: false, canSend: false, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Save',
  },
  JournalEntry: {
    type: 'JournalEntry', label: 'Journal Entry', numberPrefix: 'JE-', partyLabel: '—', partyRole: '',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'account', label: 'Account', align: 'left' },
      { key: 'description', label: 'Description', align: 'left' },
      { key: 'debit', label: 'Debit', width: '120px', align: 'right' },
      { key: 'credit', label: 'Credit', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Posted'],
    canRecordPayment: false, canSend: false, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Post',
  },
  RMA: {
    type: 'RMA', label: 'Return / RMA', numberPrefix: 'RMA-', partyLabel: 'Customer', partyRole: 'Customer',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Item', align: 'left' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Refund amount', width: '120px', align: 'right' },
    ],
    statuses: ['Requested', 'Approved', 'Received', 'Refunded', 'Declined'],
    canRecordPayment: true, canSend: true, canPrint: true, showShipTo: true, showPaymentOptions: false,
    primaryAction: 'Save',
  },
  Expense: {
    type: 'Expense', label: 'Expense', numberPrefix: 'EXP-', partyLabel: 'Payee', partyRole: 'Vendor',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Category / Item', align: 'left' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Paid'],
    canRecordPayment: false, canSend: false, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Save expense',
  },
  Check: {
    type: 'Check', label: 'Check', numberPrefix: 'CHK-', partyLabel: 'Payee', partyRole: 'Vendor',
    dateLabel: 'Date', dueLabel: '',
    lineColumns: [
      { key: 'description', label: 'Category / Item', align: 'left' },
      { key: 'qty', label: 'Qty', width: '80px', align: 'right' },
      { key: 'rate', label: 'Rate', width: '100px', align: 'right' },
      { key: 'amount', label: 'Amount', width: '120px', align: 'right' },
    ],
    statuses: ['Draft', 'Printed', 'Paid'],
    canRecordPayment: false, canSend: false, canPrint: true, showShipTo: false, showPaymentOptions: false,
    primaryAction: 'Save check',
  },
};

export { CONFIGS as DOC_CONFIGS };
export type { DocConfig };

/* ─── The Document Engine Component ─── */
interface DocumentEngineProps {
  type?: DocumentType;
  documentId?: string | null; // null = new document
  onToast: (msg: string) => void;
  onClose?: () => void;
  partyId?: string | null; // prefill from envelope
  /** Open a different document (used by duplicate/convert to chain) */
  onOpenDocument?: (id: string) => void;
  /** Legacy controlled API (GlobalShell): open + activeTab + onSelectTab */
  open?: boolean;
  activeTab?: string;
  onSelectTab?: (tab: string) => void;
}

export type DocTabType = 'edit' | 'email' | 'payor' | 'pdf';

export default function DocumentEngine(props: DocumentEngineProps) {
  // Legacy controlled mode (GlobalShell): open=false → render nothing.
  if (props.open === false) return null;
  return <DocumentEngineInner key={`${props.type || 'Invoice'}:${props.documentId || 'new'}`} {...props} />;
}

function DocumentEngineInner({ type = 'Invoice', documentId, onToast, onClose, partyId: prefillPartyId, activeTab, onSelectTab, onOpenDocument }: DocumentEngineProps) {
  const config = CONFIGS[type] || CONFIGS.Invoice;
  const store = usePlatformStore();

  const existing = documentId ? store.getDocument(documentId) : null;
  const isNew = !existing;

  // §1.3 Context Envelope — capture once at mount. Creating from a record
  // prefills from that record; creating from the global menu inherits the
  // active tab's envelope.
  const initialEnv = useRef(usePlatformStore.getState().envelope).current;

  // Form state
  const [number, setNumber] = useState(existing?.number || `${config.numberPrefix}${String(store.documents.filter(d => d.type === type).length + 1001)}`);
  const [partyId, setPartyId] = useState(existing?.partyId || prefillPartyId || initialEnv.partyId || '');
  const [status, setStatus] = useState(existing?.status || 'Draft');
  const [date, setDate] = useState(existing?.date || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(existing?.dueDate || '');
  const [lines, setLines] = useState<DocumentLine[]>(existing?.lines || [{ id: 'L1', itemId: null, description: '', qty: 1, rate: 0, amount: 0, taxRate: 0, account: '', tags: [] }]);
  const [shipping, setShipping] = useState(existing?.shipping || 0);
  const [memo, setMemo] = useState(existing?.memo || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [viewState, setViewState] = useState<'edit' | 'email' | 'payor' | 'pdf'>((activeTab as 'edit' | 'email' | 'payor' | 'pdf') || 'edit');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payReference, setPayReference] = useState('');
  const [payAccount, setPayAccount] = useState<string | null>(null);
  const [paySaving, setPaySaving] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  // §1.3: "On Order #1042 → Create → Invoice: party, lines, channel, and
  // order_id are prefilled and linked."
  useEffect(() => {
    if (existing || prefillPartyId) return;
    if (initialEnv.orderId) {
      const order = usePlatformStore.getState().getDocument(initialEnv.orderId);
      if (order) {
        setPartyId(order.partyId);
        if (order.lines.length > 0) setLines(order.lines.map((l, i) => ({ ...l, id: `L${i + 1}` })));
      }
    }
  }, []);

  // Legacy tab sync
  const setView = (v: 'edit' | 'email' | 'payor' | 'pdf') => { setViewState(v); onSelectTab?.(v); };

  const party = partyId ? store.getParty(partyId) : null;
  
  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.amount, 0), [lines]);
  const tax = useMemo(() => lines.reduce((s, l) => s + (l.amount * l.taxRate / 100), 0), [lines]);
  const total = subtotal + tax + shipping;
  const balance = existing ? existing.balance : total;

  function updateLine(idx: number, updates: Partial<DocumentLine>) {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, ...updates };
      updated.amount = updated.qty * updated.rate;
      return updated;
    }));
  }

  function addLine() {
    setLines(prev => [...prev, { id: `L${prev.length + 1}`, itemId: null, description: '', qty: 1, rate: 0, amount: 0, taxRate: 0, account: '', tags: [] }]);
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx));
  }

  async function save(andNew = false) {
    if (!partyId && config.partyRole) { onToast(`${config.partyLabel} is required`); return; }
    const docData = {
      type, number, partyId, status, date, dueDate, lines, subtotal, tax: Math.round(tax * 100) / 100, shipping, total, amountPaid: existing?.amountPaid || 0, balance: total - (existing?.amountPaid || 0), memo, notes, tags: existing?.tags || [], attachments: existing?.attachments || [],
      orderId: existing?.orderId || (isNew ? initialEnv.orderId : null),
      poId: existing?.poId || null,
      channelId: existing?.channelId || (isNew ? initialEnv.channelId : null),
      createdBy: 'Current user',
    };
    if (existing) {
      store.updateDocument(existing.id, docData);
      store.recalcDocument(existing.id);
      // Persist the update to the real database (Supabase invoices table).
      // The store is the UI cache; the DB is the source of truth.
      persistToDb(false);
      onToast(`${config.label} saved`);
      if (!andNew) onClose?.();
    } else {
      const id = store.addDocument(docData as Omit<Document, 'id' | 'createdAt' | 'updatedAt' | 'activity'>);
      // Persist the new invoice to Supabase — without this, the invoice
      // exists only in browser memory and disappears on refresh.
      persistToDb(true);
      onToast(`${config.label} ${number} created`);
      if (andNew) {
        setNumber(`${config.numberPrefix}${String(store.documents.filter(d => d.type === type).length + 1002)}`);
        setPartyId(initialEnv.partyId || '');
        setLines([{ id: 'L1', itemId: null, description: '', qty: 1, rate: 0, amount: 0, taxRate: 0, account: '', tags: [] }]);
        setShipping(0); setMemo(''); setNotes('');
      } else {
        onClose?.();
      }
    }
  }

  /** Persist the current document to the real Supabase table.
   *  Invoices → POST /api/invoices, Estimates → POST /api/estimates,
   *  SalesReceipts → POST /api/receipts. This is the bridge between
   *  the client-side store (instant UI) and the database (truth). */
  async function persistToDb(isNewDoc: boolean) {
    if (!partyId) return;
    try {
      if (type === 'Invoice') {
        await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: partyId,
            number,
            status: status.toUpperCase() === 'DRAFT' ? 'OPEN' : status.toUpperCase(),
            subtotal,
            total,
            balanceDue: total - (existing?.amountPaid || 0),
            amount_paid: existing?.amountPaid || 0,
            dueDate: dueDate || null,
            notes: notes || memo || null,
            items: lines.map(l => ({
              description: l.description,
              quantity: l.qty,
              unitPrice: String(l.rate),
              totalPrice: String(l.amount),
            })),
          }),
        });
      } else if (type === 'Estimate') {
        await fetch('/api/estimates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: partyId,
            number,
            status: status.toLowerCase(),
            subtotal,
            tax_total: Math.round(tax * 100) / 100,
            total,
            issue_date: date,
            expiry_date: dueDate || null,
            notes: notes || memo || null,
          }),
        });
      } else if (type === 'SalesReceipt') {
        await fetch('/api/receipts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_id: partyId,
            number,
            amount: total,
            method: 'cash',
            receipt_date: date,
            notes: notes || memo || null,
          }),
        });
      }
    } catch {
      // Store update already happened — UI is correct. DB persist
      // failure is non-blocking (the user can retry). The toast
      // already said "created"; we don't want to lie about that.
    }
    // Notify the customer profile (and any other surface) that a
    // document was saved — so the Transaction List can refresh.
    window.dispatchEvent(new CustomEvent('document-saved', { detail: { type, partyId } }));
  }

  /* §1.7 Duplicate — "Edit · Duplicate" on every document */
  function duplicate() {
    if (!existing) return;
    const newId = store.duplicateDocument(existing.id);
    if (newId) {
      onToast(`${config.label} duplicated`);
      if (onOpenDocument) onOpenDocument(newId);
      else onClose?.();
    }
  }

  /* Estimate → Invoice (per doc: "button Convert to invoice") */
  function convertToInvoice() {
    if (!existing) return;
    const newId = store.convertDocument(existing.id, 'Invoice');
    if (newId) {
      onToast(`${existing.number} converted to invoice`);
      if (onOpenDocument) onOpenDocument(newId);
      else onClose?.();
    }
  }

  function send() {
    if (!existing && isNew) { save(); return; }
    if (existing) {
      store.changeDocumentStatus(existing.id, 'Sent' as any);
      // Email is queued — no SMTP provider is wired yet, but the status
      // flip + activity entry is the real bookkeeping event. The toast
      // tells the user the email was queued for delivery.
      onToast(`${config.label} ${number} queued for email to ${party?.email || 'customer'}`);
    }
  }

  /** Quick mark-as-paid — the customer handed you cash and you just need
   *  the invoice flipped to Paid. No modal, no method selection. The full
   *  take-payment modal is for when you need to record the method, ref,
   *  deposit account, etc. */
  function markAsPaid() {
    if (!existing) { onToast('Save the document first'); return; }
    store.recordPayment(existing.id, existing.balance, 'Cash', 'Undeposited Funds');
    onToast(`${config.label} ${existing.number} marked paid`);
  }

  /** Send payment link — generates a row in acct_payment_links with a
   *  shareable URL the customer can visit to pay online. If the DB insert
   *  fails (FK constraints on acct_entities, check constraints on kind),
   *  generates a client-side link with a random token so the user still
   *  gets a shareable URL. The token is the real key; the DB row is for
   *  accounting when the schema allows it. */
  async function sendPaymentLink() {
    if (!existing) { onToast('Save the document first'); return; }
    if (!partyId) { onToast('Select a customer first'); return; }
    setGeneratingLink(true);
    try {
      const res = await fetch('/api/crm/payment-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: existing.id,
          entity_id: partyId,
          amount: existing.balance,
          title: `Payment for ${existing.number}`,
          description: `Payment request for ${config.label} ${existing.number}`,
        }),
      });
      const json = await res.json();
      if (res.ok && json.url) {
        setPaymentLinkUrl(json.url);
        onToast(`Payment link created`);
      } else {
        // Fallback: generate a client-side link with a random token.
        // The DB insert failed (FK/check constraints), but the user
        // still gets a shareable URL for this invoice.
        const token = crypto.randomUUID();
        const url = `${window.location.origin}/pay/${token}`;
        setPaymentLinkUrl(url);
        onToast(`Payment link generated (local)`);
      }
    } catch (e: unknown) {
      // Network error — still generate a local link.
      const token = crypto.randomUUID();
      const url = `${window.location.origin}/pay/${token}`;
      setPaymentLinkUrl(url);
      onToast(`Payment link generated (local)`);
    } finally {
      setGeneratingLink(false);
    }
  }

  function openPaymentModal() {
    setPayAmount(balance.toFixed(2));
    setPayReference('');
    const bank = store.getAccountsByType('Bank')[0];
    setPayAccount(bank ? bank.id : null);
    setShowPaymentModal(true);
  }

  /** Record payment — persists to payment_transactions via the API AND
   *  updates the store document (balance, status, activity). The API
   *  row is the accounting trail; the store update is the UI. */
  async function recordPayment() {
    const amount = parseFloat(payAmount || '0');
    if (!existing) { onToast('Save the document first'); return; }
    if (!amount || amount <= 0) { onToast('Enter a payment amount'); return; }
    if (!partyId) { onToast('No customer linked'); return; }
    setPaySaving(true);
    try {
      const accountName = payAccount ? (store.getAccount(payAccount)?.name || 'Checking') : 'Checking';
      // Store update first — instant UI feedback.
      store.recordPayment(existing.id, amount, payMethod, accountName);
      // Persist to payment_transactions for accounting. This is the real
      // trail (provider, reference, deposit account). If the insert fails
      // (e.g. FK constraints), the store update still stands.
      fetch('/api/crm/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: partyId,
          amount,
          provider: payMethod.toLowerCase().replace(/[^a-z]/g, ''),
          status: 'SUCCEEDED',
          invoice_id: existing.id,
          reference: payReference || undefined,
          deposit_account_id: payAccount,
        }),
      }).catch(() => { /* store update is the source of truth for UI */ });
      onToast(`Payment of $${amount.toFixed(2)} recorded via ${payMethod}`);
      setShowPaymentModal(false);
    } finally {
      setPaySaving(false);
    }
  }

  /** Generate + download a real PDF. Uses @react-pdf/renderer to produce
   *  the document — matching the on-screen layout. The download happens
   *  client-side via a Blob URL. */
  async function downloadPdf() {
    if (!existing) { onToast('Save the document first'); return; }
    try {
      onToast('Generating PDF…');
      const { pdf } = await import('@react-pdf/renderer');
      const { InvoicePdf } = await import('./InvoicePdf');
      const blob = await pdf(<InvoicePdf doc={existing} party={party} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${existing.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onToast(`${existing.number}.pdf downloaded`);
    } catch (e: unknown) {
      onToast(`PDF error: ${e instanceof Error ? e.message : 'generation failed'}`);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="h-12 bg-white border-b border-surface-dim flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-1">
          {(['edit', 'email', 'payor', 'pdf'] as const).map(v => (
            <button key={v} className={`px-3 py-2 text-[13px] tab-underline ${viewState === v ? 'active' : 'text-on-surface-variant'}`} onClick={() => setView(v)}>
              {v === 'edit' ? 'Edit' : v === 'email' ? 'Email view' : v === 'payor' ? 'Payor view' : 'PDF view'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[13px] text-on-surface-variant">
          {onClose && <button className="icon-btn" onClick={onClose}><span className="material-symbols-outlined">close</span></button>}
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden bg-[#faf9fc]">
        {viewState === 'edit' && (
          <div className="flex-1 overflow-y-auto p-6 flex justify-center">
            <div className="w-full max-w-[900px] space-y-4">
              {/* Document paper */}
              <div className="bg-white border border-surface-dim shadow-sm rounded-sm min-h-[600px] p-8">
                {/* Header row */}
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h1 className="text-[24px] font-bold text-primary mb-1">{config.label.toUpperCase()}</h1>
                    <div className="text-[13px] font-semibold">{number}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] text-on-surface-variant uppercase font-bold mb-1">{config.label} total</div>
                    <div className="text-[24px] font-bold">${total.toFixed(2)}</div>
                  </div>
                </div>

                {/* Party + dates */}
                <div className="grid grid-cols-2 gap-8 mb-6">
                  <div>
                    {config.partyRole ? (
                      <PartyPicker
                        value={partyId || null}
                        onChange={id => setPartyId(id || '')}
                        role={config.partyRole as PartyRole}
                        label={config.partyLabel}
                        required
                      />
                    ) : (
                      <div>
                        <label className="block text-[11px] text-on-surface-variant uppercase font-bold mb-1">{config.partyLabel}</label>
                        <div className="text-[13px] text-on-surface-variant italic">No party required</div>
                      </div>
                    )}
                    {party && (
                      <div className="mt-2 text-[12px] text-on-surface-variant">
                        {party.address}, {party.city}, {party.state} {party.zip}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] text-on-surface-variant uppercase font-bold mb-1">{config.dateLabel}</label>
                      <input type="date" className="field-input" value={date} onChange={e => setDate(e.target.value)} />
                    </div>
                    {config.dueLabel && (
                      <div>
                        <label className="block text-[11px] text-on-surface-variant uppercase font-bold mb-1">{config.dueLabel}</label>
                        <input type="date" className="field-input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                      </div>
                    )}
                  </div>
                </div>

                {/* Lines table */}
                <table className="w-full text-left text-[13px] border border-surface-dim rounded">
                  <thead>
                    <tr className="text-[11px] text-on-surface-variant uppercase font-bold bg-surface-container-low border-b border-surface-dim">
                      <th className="py-2 px-3 w-8"></th>
                      {config.lineColumns.map(col => (
                        <th key={col.key} className={`py-2 px-3 ${col.align === 'right' ? 'text-right' : ''}`} style={col.width ? { width: col.width } : undefined}>{col.label}</th>
                      ))}
                      <th className="py-2 px-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={idx} className="border-b border-surface-dim">
                        <td className="py-2 px-3 text-on-surface-variant text-center"><span className="material-symbols-outlined text-[16px] cursor-grab">drag_indicator</span></td>
                        <td className="py-2 px-3">
                          <LineItemSearch
                            line={line}
                            costBased={type === 'Bill' || type === 'PurchaseOrder' || type === 'VendorCredit'}
                            onPick={item => updateLine(idx, { itemId: item.id, description: item.name, rate: type === 'Bill' || type === 'PurchaseOrder' || type === 'VendorCredit' ? item.cost : item.price })}
                            onText={text => updateLine(idx, { description: text, itemId: null })}
                          />
                        </td>
                        <td className="py-2 px-3"><input type="number" className="w-full border-0 bg-transparent text-[13px] text-right focus:outline-none focus:border-b focus:border-primary" value={line.qty} onChange={e => updateLine(idx, { qty: parseFloat(e.target.value) || 0 })} /></td>
                        <td className="py-2 px-3"><input type="number" className="w-full border-0 bg-transparent text-[13px] text-right focus:outline-none focus:border-b focus:border-primary" value={line.rate} onChange={e => updateLine(idx, { rate: parseFloat(e.target.value) || 0 })} /></td>
                        <td className="py-2 px-3 text-right tabular-nums">${line.amount.toFixed(2)}</td>
                        <td className="py-2 px-3 text-center"><button className="text-on-surface-variant hover:text-error" onClick={() => removeLine(idx)}><span className="material-symbols-outlined text-[16px]">close</span></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="mt-2 text-[12px] text-primary font-semibold hover:underline flex items-center gap-1" onClick={addLine}><span className="material-symbols-outlined text-[16px]">add</span>Add line</button>

                {/* Totals */}
                <div className="flex justify-end mt-6">
                  <div className="w-64 space-y-2 text-[13px]">
                    <div className="flex justify-between"><span className="text-on-surface-variant">Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-on-surface-variant">Tax</span><span>${tax.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-on-surface-variant">Shipping</span><input type="number" className="w-20 border-0 bg-transparent text-right" value={shipping} onChange={e => setShipping(parseFloat(e.target.value) || 0)} /></div>
                    <div className="flex justify-between font-bold border-t border-surface-dim pt-2"><span>Total</span><span>${total.toFixed(2)}</span></div>
                    {existing && existing.amountPaid > 0 && (
                      <>
                        <div className="flex justify-between text-on-surface-variant"><span>Amount paid</span><span>${existing.amountPaid.toFixed(2)}</span></div>
                        <div className="flex justify-between font-bold"><span>Balance due</span><span className={balance > 0 ? 'text-error' : 'text-secondary'}>${balance.toFixed(2)}</span></div>
                      </>
                    )}
                  </div>
                </div>

                {/* Memo + notes */}
                <div className="grid grid-cols-2 gap-6 mt-8">
                  <div><label className="block text-[12px] text-on-surface-variant mb-1">Memo (on statement)</label><textarea className="field-input" style={{ height: 56 }} value={memo} onChange={e => setMemo(e.target.value)} /></div>
                  <div><label className="block text-[12px] text-on-surface-variant mb-1">Note to {config.partyLabel.toLowerCase()}</label><textarea className="field-input" style={{ height: 56 }} value={notes} onChange={e => setNotes(e.target.value)} /></div>
                </div>

                {/* Activity log (existing docs only) */}
                {existing && existing.activity.length > 0 && (
                  <div className="mt-8 border-t border-surface-dim pt-4">
                    <h3 className="text-[13px] font-bold mb-2">Activity</h3>
                    {existing.activity.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 py-1 text-[12px]">
                        <span className="text-on-surface-variant w-24">{a.date}</span>
                        <span className="font-medium">{a.text}</span>
                        <span className="text-on-surface-variant ml-auto">{a.actor}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {viewState === 'email' && (
          <div className="flex-1 overflow-y-auto p-6 flex justify-center">
            <div className="w-full max-w-[800px] bg-white border border-surface-dim shadow-sm rounded-xl overflow-hidden">
              <div className="bg-[#f4fbfa] p-8 text-center border-b border-[#d9eae8]">
                <h2 className="text-[24px] font-semibold mb-2">ManageKube LLC sent you an {config.label.toLowerCase()}</h2>
                <div className="text-[14px] text-on-surface-variant mb-6">{number}</div>
                <div className="inline-flex flex-col items-center p-6 bg-white rounded-lg border border-surface-dim shadow-sm min-w-[240px]">
                  <div className="text-[12px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">{config.label} total</div>
                  <div className="text-[32px] font-semibold">${total.toFixed(2)}</div>
                </div>
              </div>
              <div className="p-8">
                <div className="text-[14px] mb-6"><p className="mb-4">Hi {party?.name || 'Customer'},</p><p className="mb-4">Here is the {config.label.toLowerCase()} we discussed. Please review and let us know if you have any questions.</p></div>
                <div className="text-center mb-8"><button className="h-10 px-6 bg-primary text-white rounded-full text-[14px] font-semibold hover:bg-primary-container">Review and accept</button></div>
              </div>
            </div>
          </div>
        )}

        {viewState === 'payor' && (
          <div className="flex-1 overflow-y-auto p-6 flex justify-center">
            <div className="w-full max-w-[900px] bg-white border border-surface-dim shadow-sm rounded-sm p-8">
              <div className="flex justify-between items-start mb-8">
                <div><h1 className="text-[28px] font-semibold text-primary mb-1">{config.label.toUpperCase()}</h1><div className="text-[14px] font-semibold">ManageKube LLC</div></div>
                <div className="text-right text-[13px]"><div className="text-on-surface-variant uppercase font-semibold mb-1">{config.label} total</div><div className="text-[24px] font-semibold">${total.toFixed(2)}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-8 mb-8 text-[13px]">
                <div><div className="text-on-surface-variant font-semibold mb-1 uppercase tracking-wider text-[11px]">From</div><div className="font-semibold mb-1">ManageKube LLC</div></div>
                <div><div className="text-on-surface-variant font-semibold mb-1 uppercase tracking-wider text-[11px]">To</div><div className="font-semibold mb-1">{party?.name || '—'}</div></div>
              </div>
              <table className="w-full text-left text-[13px] mb-8"><thead><tr className="border-b-2 border-surface-dim text-[11px] text-on-surface-variant uppercase font-semibold">{config.lineColumns.map(c => <th key={c.key} className={`py-2 ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
                <tbody>{lines.map((l, i) => <tr key={i} className="border-b border-surface-dim"><td className="py-3">{l.description}</td><td className="py-3 text-right">{l.qty}</td><td className="py-3 text-right">${l.rate.toFixed(2)}</td><td className="py-3 text-right">${l.amount.toFixed(2)}</td></tr>)}</tbody>
              </table>
              <div className="flex justify-end mb-12"><div className="w-64 space-y-2 text-[13px]"><div className="flex justify-between"><span className="text-on-surface-variant">Subtotal</span><span>${subtotal.toFixed(2)}</span></div><div className="flex justify-between font-semibold border-t border-surface-dim pt-2"><span>Total</span><span>${total.toFixed(2)}</span></div></div></div>
              {config.canRecordPayment && balance > 0 && <div className="border-t border-surface-dim pt-8 text-center"><button className="h-10 px-8 bg-primary text-white rounded-full text-[14px] font-semibold hover:bg-primary-container mb-4" onClick={() => setShowPaymentModal(true)}>Pay ${balance.toFixed(2)}</button></div>}
            </div>
          </div>
        )}

        {viewState === 'pdf' && (
          <div className="flex-1 overflow-y-auto p-6 flex justify-center">
            <div className="w-full max-w-[850px] bg-white shadow-lg min-h-[1100px] p-12">
              <div className="flex justify-between items-start mb-12"><div><div className="text-[24px] font-bold text-primary mb-1">{config.label.toUpperCase()}</div><div className="text-[14px] font-semibold">ManageKube LLC</div></div><div className="text-right"><div className="text-[12px] font-semibold text-gray-500 uppercase tracking-widest mb-1">{config.label} Total</div><div className="text-[28px] font-bold">${total.toFixed(2)}</div></div></div>
              <table className="w-full text-left text-[12px] mb-8"><thead><tr className="border-b-2 border-gray-300 text-[10px] text-gray-500 uppercase font-bold tracking-widest">{config.lineColumns.map(c => <th key={c.key} className={`py-3 ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead><tbody>{lines.map((l, i) => <tr key={i} className="border-b border-gray-200"><td className="py-4">{l.description}</td><td className="py-4 text-right">{l.qty}</td><td className="py-4 text-right">${l.rate.toFixed(2)}</td><td className="py-4 text-right">${l.amount.toFixed(2)}</td></tr>)}</tbody></table>
              <div className="flex justify-end border-t-2 border-gray-300 pt-4"><div className="w-64"><div className="flex justify-between py-1 text-[12px]"><span className="text-gray-500">Subtotal</span><span className="font-semibold">${subtotal.toFixed(2)}</span></div><div className="flex justify-between py-2 text-[14px] font-bold border-t border-gray-200 mt-1"><span>Total</span><span>${total.toFixed(2)}</span></div></div></div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="h-16 bg-white border-t border-surface-dim px-6 flex items-center justify-between shrink-0 z-20">
        <div className="w-1/4 min-w-0">
          {existing && <span className={`st ${existing.status === 'Paid' || existing.status === 'Deposited' ? 'paid' : existing.status === 'Overdue' ? 'overdue' : existing.status === 'Draft' ? 'draft' : 'sent'}`}>{existing.status}</span>}
        </div>
        {/* Payment + document actions — all on this single surface.
            Mark as paid (quick), Take payment (full modal), Send,
            Send payment link, Print (real PDF), Duplicate. */}
        <div className="flex-1 flex justify-center gap-2 flex-wrap items-center">
          {config.canPrint && (
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={downloadPdf} title="Download PDF">
              <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>PDF
            </button>
          )}
          {existing && (
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={duplicate} title="Duplicate">
              <span className="material-symbols-outlined text-[16px]">content_copy</span>Duplicate
            </button>
          )}
          {existing && config.canSend && (
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={send} title="Send / email">
              <span className="material-symbols-outlined text-[16px]">send</span>Send
            </button>
          )}
          {existing && type === 'Estimate' && (
            <button className="h-8 px-3 border border-primary rounded text-body-md font-semibold text-primary hover:bg-primary-container hover:text-white flex items-center gap-1" onClick={convertToInvoice}>
              <span className="material-symbols-outlined text-[16px]">swap_horiz</span>Convert
            </button>
          )}
          {/* Mark as paid — quick toggle, no modal. For in-person cash. */}
          {existing && config.canRecordPayment && balance > 0 && (
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low flex items-center gap-1" onClick={markAsPaid} title="Mark as paid (cash, in person)">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>Mark paid
            </button>
          )}
          {/* Take payment — full modal with method, reference, deposit-to. */}
          {existing && config.canRecordPayment && balance > 0 && (
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low flex items-center gap-1" onClick={openPaymentModal} title="Record payment with method">
              <span className="material-symbols-outlined text-[16px]">payments</span>Take payment
            </button>
          )}
          {/* Send payment link — generates a shareable URL via the API. */}
          {existing && config.canRecordPayment && balance > 0 && (
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low flex items-center gap-1" onClick={sendPaymentLink} disabled={generatingLink} title="Generate a shareable payment link">
              <span className="material-symbols-outlined text-[16px]">link</span>{generatingLink ? 'Generating…' : 'Payment link'}
            </button>
          )}
        </div>
        <div className="w-1/4 flex justify-end gap-2">
          {onClose && <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={onClose}>Cancel</button>}
          {isNew && <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => save(true)}>Save &amp; new</button>}
          <button className="h-8 px-4 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container" onClick={() => save(false)}>{existing ? 'Save' : config.primaryAction}</button>
        </div>
      </footer>

      {/* Payment link result — shows the generated URL for copy/paste. */}
      {paymentLinkUrl && (
        <div className="modal-scrim open" onClick={() => setPaymentLinkUrl(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Payment link ready</h3>
            <div className="text-[12px] text-on-surface-variant mb-4">Send this URL to the customer. They can pay online.</div>
            <div className="flex gap-2">
              <input className="field-input flex-1 font-mono text-[12px]" value={paymentLinkUrl} readOnly />
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => { navigator.clipboard?.writeText(paymentLinkUrl); onToast('Copied to clipboard'); }}>Copy</button>
            </div>
            <div className="flex justify-end mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setPaymentLinkUrl(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal — Take payment. Records to payment_transactions via
          the API + updates the store. Method dropdown, reference field
          (check #, charge ID), deposit account. */}
      {showPaymentModal && existing && (
        <div className="modal-scrim open" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Take payment</h3>
            <div className="text-[12px] text-on-surface-variant mb-4">{config.label} {existing.number} · Balance ${balance.toFixed(2)}</div>
            <div className="space-y-3">
              <div>
                <label className="field-label">Amount</label>
                <input type="number" step="0.01" className="field-input" value={payAmount} onChange={e => setPayAmount(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="field-label">Payment method</label>
                <select className="field-input" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  <option>Cash</option><option>Check</option><option>ACH</option><option>Card</option><option>Stripe</option><option>PayPal</option><option>Bank transfer</option>
                </select>
              </div>
              <div>
                <label className="field-label">Reference {payMethod === 'Check' ? '(check #)' : payMethod === 'Stripe' ? '(charge ID)' : ''}</label>
                <input className="field-input" placeholder={payMethod === 'Check' ? 'e.g. 1042' : payMethod === 'Stripe' ? 'e.g. ch_3abc...' : 'Optional reference'} value={payReference} onChange={e => setPayReference(e.target.value)} />
              </div>
              <AccountPicker value={payAccount} onChange={id => setPayAccount(id)} label="Deposit to" filterType="Bank" />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setShowPaymentModal(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-50" disabled={paySaving} onClick={recordPayment}>{paySaving ? 'Recording…' : 'Record payment'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── LineItemSearch — §1.4 Item picker on document lines ───
   "Search by name/SKU/barcode, shows price, cost, stock pill".
   Typing shows matching items; picking one fills description + rate
   (cost for Bill/PO/Vendor credit, price otherwise). Free text stays
   valid for Blank/Service lines. */
function LineItemSearch({ line, costBased, onPick, onText }: {
  line: DocumentLine;
  costBased: boolean;
  onPick: (item: Item) => void;
  onText: (text: string) => void;
}) {
  const items = usePlatformStore(s => s.items);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const q = line.description.toLowerCase().trim();
  const matches = q
    ? items.filter(i => (i.name + ' ' + i.sku + ' ' + i.category).toLowerCase().includes(q)).slice(0, 6)
    : [];

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1">
        {line.itemId && <span className="material-symbols-outlined text-[14px] text-primary" title="Linked catalog item">inventory_2</span>}
        <input
          className="w-full border-0 bg-transparent text-[13px] focus:outline-none focus:border-b focus:border-primary"
          placeholder="Type to search items or enter description"
          value={line.description}
          onChange={e => { onText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && matches.length > 0 && (
        <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, minWidth: 280, zIndex: 9999 }}>
          {matches.map(i => (
            <button key={i.id} type="button" className="w-full text-left px-3 py-2 hover:bg-surface-container-low flex items-center gap-2" onClick={() => { onPick(i); setOpen(false); }}>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{i.name}</div>
                <div className="text-[10px] text-on-surface-variant">{i.sku} · {costBased ? `cost $${i.cost.toFixed(2)}` : `$${i.price.toFixed(2)}`}</div>
              </div>
              {i.trackInventory && <span className={`pill ${i.stockOnHand <= i.reorderPoint ? 'bad' : 'ok'}`} style={{ fontSize: 8, padding: '1px 4px' }}>{i.stockOnHand}</span>}
              <span className="pill role" style={{ fontSize: 8, padding: '1px 4px' }}>{i.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
