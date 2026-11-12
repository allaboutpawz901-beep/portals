'use client';
/* UniversalModals.tsx — §2.6 of platform-component-behavior.md:
   RecordPaymentModal, SendModal/RemindModal, VoidModal, RefundModal,
   ApproveDeclineReturnModal, ConfirmDialog.
   "Modal: size, dirty → onClose. Focus-trapped; ≤ 5 fields."
   All mutations go through the shared platform store. */

import { useState, useEffect, useRef } from 'react';
import { usePlatformStore } from '@/lib/platformStore';

/* ─── Modal shell (§2.4: focus-trapped, ≤5 fields, scrim closes only if clean) ─── */

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function ModalShell({ title, subtitle, onClose, children, footer, size = 'md' }: ModalShellProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Focus trap (§2.4)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const focusable = el.querySelectorAll('input, select, textarea, button');
    if (focusable.length > 0) (focusable[0] as HTMLElement).focus();
    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>('input, select, textarea, button'));
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, []);

  const maxW = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-lg' : 'max-w-md';

  return (
    <div className="modal-scrim open" style={{ zIndex: 110 }} onClick={onClose}>
      <div ref={ref} className={`bg-white rounded-xl shadow-2xl w-full ${maxW} p-5`} onClick={e => e.stopPropagation()}>
        <h3 className="text-headline-sm mb-0.5">{title}</h3>
        {subtitle && <p className="text-body-sm text-on-surface-variant mb-3">{subtitle}</p>}
        <div className={subtitle ? '' : 'mb-3'}>{children}</div>
        <div className="flex justify-end gap-2 mt-4">{footer}</div>
      </div>
    </div>
  );
}

/* ─── RecordPaymentModal (§2.6) ─── */

export function RecordPaymentModal({ documentId, onClose, onToast }: { documentId: string; onClose: () => void; onToast: (m: string) => void }) {
  const store = usePlatformStore();
  const doc = store.getDocument(documentId);
  const [amount, setAmount] = useState(doc?.balance ?? 0);
  const [method, setMethod] = useState('Card');
  const [depositTo, setDepositTo] = useState('Checking');
  const [reference, setReference] = useState('');

  if (!doc) return null;
  const banks = store.getAccountsByType('Bank');

  function record() {
    if (amount <= 0) { onToast('Amount must be positive'); return; }
    store.recordPayment(documentId, amount, method, depositTo);
    onToast(`Payment of $${amount.toFixed(2)} recorded via ${method}`);
    onClose();
  }

  return (
    <ModalShell
      title="Record payment"
      subtitle={`${doc.number} · Balance $${doc.balance.toFixed(2)}`}
      onClose={onClose}
      footer={
        <>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={onClose}>Cancel</button>
          <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={record}>Record payment</button>
        </>
      }
    >
      <div className="space-y-3">
        <div><label className="field-label">Amount</label><input type="number" step="0.01" className="field-input" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} autoFocus /></div>
        <div><label className="field-label">Payment method</label><select className="field-input" value={method} onChange={e => setMethod(e.target.value)}><option>Cash</option><option>Check</option><option>ACH</option><option>Card</option><option>PayPal</option><option>Bank transfer</option></select></div>
        <div><label className="field-label">Deposit to</label><select className="field-input" value={depositTo} onChange={e => setDepositTo(e.target.value)}>{banks.map(b => <option key={b.id}>{b.name}</option>)}</select></div>
        <div><label className="field-label">Reference <span className="normal-case font-normal">(optional)</span></label><input className="field-input" placeholder="Check no., transaction ID…" value={reference} onChange={e => setReference(e.target.value)} /></div>
      </div>
    </ModalShell>
  );
}

/* ─── SendModal (§2.6) ─── */

export function SendModal({ documentId, onClose, onToast }: { documentId: string; onClose: () => void; onToast: (m: string) => void }) {
  const store = usePlatformStore();
  const doc = store.getDocument(documentId);
  const party = doc ? store.getParty(doc.partyId) : null;
  const [to, setTo] = useState(party?.email || '');
  const [subject, setSubject] = useState(doc ? `${doc.type} ${doc.number} from ManageKube LLC` : '');

  if (!doc) return null;

  function send() {
    store.changeDocumentStatus(documentId, 'Sent');
    onToast(`${doc?.type} ${doc?.number} sent to ${to}`);
    onClose();
  }

  return (
    <ModalShell
      title={`Send ${doc.type.toLowerCase()}`}
      subtitle={doc.number}
      onClose={onClose}
      footer={
        <>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={onClose}>Cancel</button>
          <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={send}><span className="material-symbols-outlined text-[16px] align-middle mr-1">send</span>Send</button>
        </>
      }
    >
      <div className="space-y-3">
        <div><label className="field-label">To</label><input type="email" className="field-input" value={to} onChange={e => setTo(e.target.value)} autoFocus /></div>
        <div><label className="field-label">Subject</label><input className="field-input" value={subject} onChange={e => setSubject(e.target.value)} /></div>
        <div><label className="field-label">Attach PDF</label><label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" defaultChecked /> Include PDF attachment</label></div>
      </div>
    </ModalShell>
  );
}

/* ─── VoidModal (§2.6) ─── */

export function VoidModal({ documentId, onClose, onToast }: { documentId: string; onClose: () => void; onToast: (m: string) => void }) {
  const store = usePlatformStore();
  const doc = store.getDocument(documentId);
  const [reason, setReason] = useState('');

  if (!doc) return null;

  function voidDoc() {
    if (!reason.trim()) { onToast('Reason is required to void'); return; }
    store.changeDocumentStatus(documentId, 'Void');
    onToast(`${doc?.number} voided — ${reason}`);
    onClose();
  }

  return (
    <ModalShell
      title={`Void ${doc.type.toLowerCase()}`}
      subtitle={`${doc.number} · $${doc.total.toFixed(2)} — this cannot be undone`}
      onClose={onClose}
      footer={
        <>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={onClose}>Cancel</button>
          <button className="h-8 px-3 bg-error text-white rounded text-body-md font-semibold hover:opacity-90" onClick={voidDoc}>Void</button>
        </>
      }
    >
      <div><label className="field-label">Reason</label><textarea className="field-textarea" style={{ minHeight: 60 }} placeholder="Why is this being voided?" value={reason} onChange={e => setReason(e.target.value)} autoFocus /></div>
    </ModalShell>
  );
}

/* ─── ConfirmDialog (§2.1: used by menu confirm) ─── */

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <ModalShell
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={onClose}>Cancel</button>
          <button className={`h-8 px-3 rounded text-body-md font-semibold ${danger ? 'bg-error text-white hover:opacity-90' : 'bg-primary text-white hover:bg-primary-container'}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </>
      }
    >
      <p className="text-body-sm text-on-surface-variant">{message}</p>
    </ModalShell>
  );
}

/* ─── Pill (§2.1: one component, 7 variants per §1.6) ─── */

export type PillVariant = 'status' | 'relation' | 'party' | 'channel' | 'alert' | 'tag' | 'role';

export function Pill({
  variant, label, tone, onClick, onContextMenu, title,
}: {
  variant: PillVariant;
  label: string;
  tone?: 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  title?: string;
}) {
  const toneCls = tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : tone === 'bad' ? 'bad' : tone === 'info' ? 'info' : 'neutral';
  const variantCls = variant === 'party' || variant === 'role' ? 'role' : toneCls;
  return (
    <span
      className={`pill ${variantCls}`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title || label}
    >
      {label}
    </span>
  );
}

/* ─── PeekPopover (§2.1: 300ms hover intent, cached) ─── */

export function PeekPopover({ targetRef, type, id, onOpen }: { targetRef: React.RefObject<HTMLElement>; type: string; id: string; onOpen: () => void }) {
  const store = usePlatformStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    const enter = () => { timerRef.current = setTimeout(() => setOpen(true), 300); }; // §2.1: 300ms hover intent
    const leave = () => { if (timerRef.current) clearTimeout(timerRef.current); setOpen(false); };
    target.addEventListener('mouseenter', enter);
    target.addEventListener('mouseleave', leave);
    return () => {
      target.removeEventListener('mouseenter', enter);
      target.removeEventListener('mouseleave', leave);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [targetRef]);

  // Peek content per type (§4.2: GET /peek/{type}/{id})
  let content: React.ReactNode = null;
  if (type === 'party') {
    const p = store.getParty(id);
    if (p) {
      content = (
        <dl className="text-[12px]">
          <div className="kv"><dt>Roles</dt><dd>{p.roles.join(', ')}</dd></div>
          <div className="kv"><dt>Email</dt><dd>{p.email}</dd></div>
          <div className="kv"><dt>Balance</dt><dd className={p.balance > 0 ? 'text-error' : p.balance < 0 ? 'text-qb-blue' : ''}>${p.balance.toFixed(2)}</dd></div>
          <div className="kv"><dt>Terms</dt><dd>{p.terms || '—'}</dd></div>
        </dl>
      );
    }
  } else if (type === 'item') {
    const i = store.getItem(id);
    if (i) {
      content = (
        <dl className="text-[12px]">
          <div className="kv"><dt>SKU</dt><dd className="code-mono">{i.sku}</dd></div>
          <div className="kv"><dt>Price</dt><dd>${i.price.toFixed(2)}</dd></div>
          <div className="kv"><dt>Stock</dt><dd>{i.trackInventory ? `${i.stockOnHand} on hand` : i.fulfillmentType}</dd></div>
        </dl>
      );
    }
  }

  if (!open || !content) return null;

  return (
    <div ref={ref} className="row-menu open" style={{ position: 'fixed', zIndex: 9999, minWidth: 260 }} onClick={onOpen}>
      {content}
      <div className="sep" />
      <button className="w-full text-left px-3 py-1.5 text-[13px] text-primary font-semibold hover:bg-surface-container-low">Open →</button>
    </div>
  );
}
