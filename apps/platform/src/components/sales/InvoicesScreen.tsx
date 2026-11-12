'use client';
/* InvoicesScreen — Sales → Invoices.
   Built on the platform components per platform-component-behavior.md:
   - TableShell renders the list from a ViewDef (§2.2 + §5)
   - DocumentEngine renders create/edit (§4.4)
   - RecordPaymentModal / SendModal / VoidModal for actions (§2.6)
   - All data from usePlatformStore (§1.1 shared entities) */

import { useState, useCallback } from 'react';
import { usePlatformStore, type Document } from '@/lib/platformStore';
import { exportToCsv } from '@/lib/csvExport';
import TableShell, { type ViewDef } from '../TableShell';
import DocumentEngine from '../DocumentEngine';
import { RecordPaymentModal, SendModal, VoidModal, ConfirmDialog } from '../UniversalModals';

interface InvoicesScreenProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
  onOpenPeek?: (row: any, family: string) => void;
}

/* §5 pattern: the ViewDef config that drives TableShell */
const invoicesView: ViewDef = {
  id: 'invoices',
  entity: 'document',
  title: 'Invoices',
  subtitle: 'Every invoice across all customers — create, send, and get paid.',
  columns: [
    { id: 'number', label: 'Invoice #', kind: 'text', sortable: true, defaultVisible: true },
    { id: 'party', label: 'Customer', kind: 'party', sortable: true, defaultVisible: true },
    { id: 'date', label: 'Date', kind: 'date', sortable: true, defaultVisible: true },
    { id: 'dueDate', label: 'Due', kind: 'date', sortable: true, defaultVisible: true },
    { id: 'total', label: 'Amount', kind: 'money', sortable: true, defaultVisible: true, align: 'right' },
    { id: 'balance', label: 'Balance', kind: 'money', sortable: true, defaultVisible: true, align: 'right' },
    { id: 'status', label: 'Status', kind: 'status', sortable: true, defaultVisible: true },
  ],
  defaultSort: 'date',
  statusTabs: [
    { id: 'draft', label: 'Draft', filter: { status: 'draft' } },
    { id: 'unpaid', label: 'Unpaid', filter: { status: 'unpaid' } },
    { id: 'overdue', label: 'Overdue', filter: { status: 'overdue' } },
    { id: 'paid', label: 'Paid', filter: { status: 'paid' } },
  ],
  filters: [
    { id: 'customer', label: 'Customer', kind: 'party' },
    { id: 'dates', label: 'Date range', kind: 'date_range' },
    { id: 'tags', label: 'Tags', kind: 'tag' },
  ],
  rowClick: 'document.page',
  bulkActions: [
    { id: 'send', label: 'Send', icon: 'send' },
    { id: 'export', label: 'Export', icon: 'download' },
    { id: 'void', label: 'Void', icon: 'block' },
    { id: 'delete', label: 'Delete', icon: 'delete', danger: true },
  ],
  supportsImport: false,
  supportsExport: true,
  totalsFooter: ['sum:total', 'sum:balance'],
  kpis: [
    { label: 'Total invoices', compute: rows => rows.length },
    { label: 'Outstanding', compute: rows => `$${rows.reduce((s, r) => s + (Number(r.balance) || 0), 0).toFixed(2)}`, tone: 'error' },
    { label: 'Overdue', compute: rows => rows.filter(r => r.status === 'Overdue').length, tone: 'error' },
    { label: 'Paid (30d)', compute: rows => `$${rows.filter(r => r.status === 'Paid').reduce((s, r) => s + (Number(r.amountPaid) || 0), 0).toFixed(2)}`, tone: 'success' },
  ],
};

function statusTone(s: string) {
  return s === 'Paid' || s === 'Deposited' ? 'paid' : s === 'Overdue' ? 'overdue' : s === 'Draft' ? 'draft' : s === 'Void' ? 'rejected' : 'sent';
}

export default function InvoicesScreen({ onToast }: InvoicesScreenProps) {
  const store = usePlatformStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [paymentFor, setPaymentFor] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<string | null>(null);
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const [deleteFor, setDeleteFor] = useState<string | null>(null);

  const invoices = store.documents.filter(d => d.type === 'Invoice');

  /* TableShell adapters */
  const getCell = useCallback((row: Record<string, unknown>, col: { id: string }) => {
    const doc = row as unknown as Document;
    switch (col.id) {
      case 'number': return doc.number;
      case 'party': return store.getParty(doc.partyId)?.name || '—';
      case 'date': return doc.date;
      case 'dueDate': return doc.dueDate;
      case 'total': return `$${doc.total.toFixed(2)}`;
      case 'balance': return `$${doc.balance.toFixed(2)}`;
      case 'status': return doc.status;
      default: return '';
    }
  }, [store]);

  const getStatusClass = useCallback((_row: Record<string, unknown>, _col: unknown) => 'sent', []);

  const onRowOpen = useCallback((row: Record<string, unknown>) => {
    setEditingId(String(row.id));
  }, []);

  const onCreate = useCallback(() => setCreating(true), []);

  const onBulkAction = useCallback((actionId: string, ids: string[]) => {
    if (actionId === 'send') { ids.forEach(id => store.changeDocumentStatus(id, 'Sent')); onToast(`Sent ${ids.length} invoices`); }
    else if (actionId === 'void') { ids.forEach(id => store.changeDocumentStatus(id, 'Void')); onToast(`Voided ${ids.length} invoices`); }
    else if (actionId === 'delete') { ids.forEach(id => store.deleteDocument(id)); onToast(`Deleted ${ids.length} invoices`); }
    else if (actionId === 'export') { onToast(`Exported ${ids.length} invoices`); }
  }, [store, onToast]);

  const onExport = useCallback((rows: Record<string, unknown>[]) => {
    exportToCsv(rows, [
      { key: 'number', label: 'Invoice #' }, { key: 'date', label: 'Date' }, { key: 'dueDate', label: 'Due' },
      { key: 'total', label: 'Amount' }, { key: 'balance', label: 'Balance' }, { key: 'status', label: 'Status' },
    ], 'invoices');
  }, []);

  /* Row ⋯ menu per §1.7 right-click grammar */
  const getRowActions = useCallback((row: Record<string, unknown>) => {
    const doc = row as unknown as Document;
    const actions: { id: string; label: string; icon?: string; danger?: boolean; sepBefore?: boolean; header?: string }[] = [
      { id: 'open', label: 'Open invoice', icon: 'open_in_new' },
      { id: 'edit', label: 'Edit', icon: 'edit' },
      { id: 'duplicate', label: 'Duplicate', icon: 'content_copy' },
      { id: 'hdr-comms', label: '', header: 'Communicate' },
      { id: 'send', label: 'Send', icon: 'send' },
      { id: 'remind', label: 'Send reminder', icon: 'notifications_active' },
      { id: 'hdr-money', label: '', header: 'Money', sepBefore: true },
    ];
    if (doc.balance > 0) actions.push({ id: 'payment', label: 'Record payment', icon: 'payments' });
    actions.push(
      { id: 'print', label: 'Print / PDF', icon: 'print' },
      { id: 'hdr-danger', label: '', header: 'Danger', sepBefore: true },
      { id: 'void', label: 'Void', icon: 'block', danger: true },
      { id: 'delete', label: 'Delete', icon: 'delete', danger: true },
    );
    return actions;
  }, []);

  const onRowAction = useCallback((actionId: string, row: Record<string, unknown>) => {
    const id = String(row.id);
    switch (actionId) {
      case 'open': case 'edit': setEditingId(id); break;
      case 'duplicate': {
        const newId = store.duplicateDocument(id);
        if (newId) { onToast('Invoice duplicated — opening copy'); setEditingId(newId); }
        break;
      }
      case 'send': setSendFor(id); break;
      case 'remind': onToast('Reminder sent'); break;
      case 'payment': setPaymentFor(id); break;
      case 'print': window.print(); break;
      case 'void': setVoidFor(id); break;
      case 'delete': setDeleteFor(id); break;
    }
  }, [store, onToast]);

  /* ── Document Engine (create or edit) — §1.5: row click opens page for documents ── */
  if (creating) {
    return <DocumentEngine type="Invoice" onToast={onToast} onClose={() => setCreating(false)} />;
  }
  if (editingId) {
    return <DocumentEngine type="Invoice" documentId={editingId} onToast={onToast} onClose={() => setEditingId(null)} />;
  }

  return (
    <>
      <TableShell
        view={invoicesView}
        rows={invoices as unknown as Record<string, unknown>[]}
        getCell={getCell}
        getStatusClass={getStatusClass}
        onRowOpen={onRowOpen}
        onCreate={onCreate}
        onBulkAction={onBulkAction}
        onExport={onExport}
        onToast={onToast}
        getRowActions={getRowActions}
        onRowAction={onRowAction}
      />

      {/* Modals (§2.6) */}
      {paymentFor && <RecordPaymentModal documentId={paymentFor} onClose={() => setPaymentFor(null)} onToast={onToast} />}
      {sendFor && <SendModal documentId={sendFor} onClose={() => setSendFor(null)} onToast={onToast} />}
      {voidFor && <VoidModal documentId={voidFor} onClose={() => setVoidFor(null)} onToast={onToast} />}
      {deleteFor && (
        <ConfirmDialog
          title="Delete invoice"
          message={`Delete ${store.getDocument(deleteFor)?.number}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => { store.deleteDocument(deleteFor); onToast('Invoice deleted'); }}
          onClose={() => setDeleteFor(null)}
        />
      )}
    </>
  );
}
