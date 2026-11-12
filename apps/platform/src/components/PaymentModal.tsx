'use client';

import { useState, useMemo, useEffect } from 'react';
import { usePlatformStore } from '@/lib/platformStore';
import { AccountPicker } from './UniversalPickers';

/**
 * PaymentModal — records a payment for a customer. NOT a document engine:
 * a focused payment form that handles every real-world scenario:
 *
 *  - In person: customer is here, paying cash / check / card now.
 *  - Online (Stripe): customer paid on the website; funds settled in bank.
 *  - Bank transfer / ACH: received a wire or ACH.
 *  - Applied to an invoice: pick which unpaid invoice this pays off; the
 *    modal marks it Paid in the client store + records the payment in the
 *    payment_transactions table so it flows into accounting.
 *  - Standalone: no invoice — just record money received (customer credit,
 *    prepayment, overpayment).
 *
 * The modal persists to payment_transactions (provider, status, deposit
 * account, reference) — the real accounting trail. It does NOT force you
 * to create an invoice first, email anything, or pretend it's a "sales
 * receipt".
 */

export interface PaymentPrefill {
  partyId?: string;
  partyName?: string;
  source?: string;
  email?: string | null;
}

const PROVIDERS = [
  { value: 'cash', label: 'Cash', icon: 'payments' },
  { value: 'check', label: 'Check', icon: 'receipt_long' },
  { value: 'card', label: 'Credit / Debit Card', icon: 'credit_card' },
  { value: 'stripe', label: 'Stripe (Online)', icon: 'cloud_done' },
  { value: 'ach', label: 'ACH / Bank Transfer', icon: 'account_balance' },
  { value: 'bank_transfer', label: 'Wire Transfer', icon: 'account_balance' },
  { value: 'paypal', label: 'PayPal', icon: 'account_balance_wallet' },
  { value: 'other', label: 'Other', icon: 'more_horiz' },
] as const;

export default function PaymentModal({
  open,
  prefill,
  onToast,
  onClose,
  onSaved,
}: {
  open: boolean;
  prefill: PaymentPrefill | null;
  onToast: (msg: string) => void;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const store = usePlatformStore();
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState<string>('cash');
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [depositAccount, setDepositAccount] = useState<string | null>(null);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string | null>(null);
  const [status, setStatus] = useState<'settled' | 'pending'>('settled');
  const [saving, setSaving] = useState(false);

  // Unpaid invoices for this customer — the modal lets the user apply
  // the payment to one of them (marks it Paid in the store).
  const unpaidInvoices = useMemo(() => {
    if (!prefill?.partyId) return [];
    return store
      .getDocumentsByParty(prefill.partyId)
      .filter((d) => d.type === 'Invoice' && d.balance > 0 && d.status !== 'Void' && d.status !== 'Paid')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [prefill?.partyId, store.documents]);

  // Default the deposit account to the first bank account.
  useEffect(() => {
    if (!depositAccount) {
      const bank = store.getAccountsByType('Bank')[0];
      setDepositAccount(bank ? bank.id : null);
    }
  }, [depositAccount, store]);

  // When provider = stripe, default status to 'settled' but make it
  // easy to switch to 'pending' if the payout hasn't landed yet.
  useEffect(() => {
    if (provider === 'stripe') setStatus('settled');
  }, [provider]);

  if (!open) return null;

  const partyName = prefill?.partyName || 'this customer';

  function reset() {
    setAmount('');
    setProvider('cash');
    setReference('');
    setMemo('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setLinkedInvoiceId(null);
    setStatus('settled');
  }

  async function handleSave() {
    const amt = parseFloat(amount || '0');
    if (!amt || amt <= 0) {
      onToast('Enter a payment amount');
      return;
    }
    if (!prefill?.partyId) {
      onToast('No customer selected');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/crm/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: prefill.partyId,
          amount: amt,
          provider,
          status,
          invoice_id: linkedInvoiceId,
          deposit_account_id: depositAccount,
          reference: reference || undefined,
          memo: memo || undefined,
          processed_at: new Date(payDate).toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || 'Failed to record payment');

      // If linked to an invoice, mark it Paid in the client store so the
      // UI reflects it immediately (the DB row is the source of truth for
      // accounting; the store mirrors it for the document list).
      const accountName = depositAccount
        ? store.getAccount(depositAccount)?.name || 'Checking'
        : 'Checking';
      if (linkedInvoiceId) {
        const inv = store.getDocument(linkedInvoiceId);
        if (inv) {
          store.recordPayment(linkedInvoiceId, amt, provider, accountName);
        }
      } else {
        // Standalone payment — update the party's balance in the store.
        usePlatformStore.setState((state) => ({
          parties: state.parties.map((p) =>
            p.id === prefill.partyId ? { ...p, balance: p.balance - amt } : p,
          ),
        }));
      }

      const providerLabel = PROVIDERS.find((p) => p.value === provider)?.label || provider;
      onToast(
        `Payment of $${amt.toFixed(2)} recorded via ${providerLabel}` +
          (linkedInvoiceId ? ' — invoice marked paid' : ''),
      );
      reset();
      onSaved?.();
      onClose();
    } catch (e: unknown) {
      onToast(`Error: ${e instanceof Error ? e.message : 'Failed to record payment'}`);
    } finally {
      setSaving(false);
    }
  }

  const selectedInvoice = unpaidInvoices.find((i) => i.id === linkedInvoiceId);
  const providerLabel = PROVIDERS.find((p) => p.value === provider)?.label || provider;

  return (
    <div className="modal-scrim open" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-primary">payments</span>
            <h3 className="text-[16px] font-semibold">Record payment</h3>
          </div>
          <button
            className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
            onClick={onClose}
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Customer */}
          <div className="flex items-center gap-2 text-[13px] text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">person</span>
            <span className="font-medium text-on-surface">{partyName}</span>
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-on-surface-variant font-semibold">$</span>
                <input
                  type="number"
                  step="0.01"
                  className="field-input pl-7"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div>
              <label className="field-label">Payment date</label>
              <input
                type="date"
                className="field-input"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </div>
          </div>

          {/* Payment method — the field that was completely missing */}
          <div>
            <label className="field-label">Payment method</label>
            <div className="grid grid-cols-4 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-[11px] font-medium transition-colors ${
                    provider === p.value
                      ? 'border-primary bg-primary-container text-primary'
                      : 'border-surface-dim bg-white text-on-surface-variant hover:bg-surface-container'
                  }`}
                  onClick={() => setProvider(p.value)}
                >
                  <span className="material-symbols-outlined text-[20px]">{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stripe settlement status — only when provider = stripe */}
          {provider === 'stripe' && (
            <div className="bg-surface-container-lowest border border-surface-dim rounded-lg p-3 space-y-2">
              <div className="text-[12px] font-semibold text-on-surface-variant">Settlement status</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 h-8 rounded text-[12px] font-semibold border ${
                    status === 'settled'
                      ? 'border-primary bg-primary text-white'
                      : 'border-surface-dim bg-white text-on-surface-variant hover:bg-surface-container'
                  }`}
                  onClick={() => setStatus('settled')}
                >
                  Settled — funds in bank
                </button>
                <button
                  type="button"
                  className={`flex-1 h-8 rounded text-[12px] font-semibold border ${
                    status === 'pending'
                      ? 'border-primary bg-primary text-white'
                      : 'border-surface-dim bg-white text-on-surface-variant hover:bg-surface-container'
                  }`}
                  onClick={() => setStatus('pending')}
                >
                  Pending — awaiting payout
                </button>
              </div>
              <div className="text-[11px] text-on-surface-variant">
                Stripe pays out to your bank on a rolling schedule. Mark &ldquo;pending&rdquo; if the payout hasn&apos;t landed yet — you&apos;ll mark it settled when it does.
              </div>
            </div>
          )}

          {/* Apply to invoice — optional */}
          <div>
            <label className="field-label">Apply to invoice (optional)</label>
            {unpaidInvoices.length === 0 ? (
              <div className="text-[12px] text-on-surface-variant bg-surface-container-low rounded-lg p-3">
                No unpaid invoices for this customer. This will be recorded as a standalone payment (customer credit / prepayment).
              </div>
            ) : (
              <select
                className="field-input"
                value={linkedInvoiceId || ''}
                onChange={(e) => setLinkedInvoiceId(e.target.value || null)}
              >
                <option value="">— No invoice (standalone payment) —</option>
                {unpaidInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.number} — ${inv.balance.toFixed(2)} balance (due {inv.dueDate})
                  </option>
                ))}
              </select>
            )}
            {selectedInvoice && (
              <div className="text-[11px] text-on-surface-variant mt-1">
                Will mark <strong>{selectedInvoice.number}</strong> as paid.
              </div>
            )}
          </div>

          {/* Deposit to */}
          <AccountPicker
            value={depositAccount}
            onChange={(id) => setDepositAccount(id)}
            label="Deposit to"
            filterType="Bank"
          />

          {/* Reference — check #, Stripe charge ID, etc. */}
          <div>
            <label className="field-label">
              Reference {provider === 'check' ? '(check #)' : provider === 'stripe' ? '(charge ID)' : ''}
            </label>
            <input
              className="field-input"
              placeholder={
                provider === 'check' ? 'e.g. 1042'
                  : provider === 'stripe' ? 'e.g. ch_3abc...'
                  : provider === 'ach' || provider === 'bank_transfer' ? 'e.g. wire ref'
                  : 'Optional reference'
              }
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          {/* Memo */}
          <div>
            <label className="field-label">Memo (optional)</label>
            <textarea
              className="field-input min-h-[60px] resize-y"
              placeholder="Internal note about this payment…"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-dim flex justify-end gap-2 shrink-0">
          <button
            className="h-9 px-4 border border-surface-dim rounded text-[13px] font-semibold hover:bg-surface-container"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="h-9 px-5 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-50 flex items-center gap-1.5"
            disabled={!amount || saving}
            onClick={handleSave}
          >
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            {saving ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
