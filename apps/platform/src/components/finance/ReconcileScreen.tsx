'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import styles from './ReconcileScreen.module.css';

interface ReconcileTxn {
  id: string;
  date: string;
  desc: string;
  payee: string;
  amount: number;
  cleared: boolean;
  type: 'payment' | 'deposit';
}

const INITIAL_RECONCILE_TXNS: ReconcileTxn[] = [
  // Payments / Charges
  { id: 'p1', date: '10/30/2026', desc: 'STAPLES #0412', payee: 'Staples', amount: 142.5, cleared: true, type: 'payment' },
  { id: 'p2', date: '10/29/2026', desc: 'FEDEX 001239847', payee: 'FedEx', amount: 84.2, cleared: true, type: 'payment' },
  { id: 'p3', date: '10/27/2026', desc: 'AWS EMEA CHARGES', payee: 'Amazon Web Services', amount: 124.88, cleared: true, type: 'payment' },
  { id: 'p4', date: '10/26/2026', desc: 'ADOBE CREATIVE', payee: 'Adobe', amount: 59.99, cleared: true, type: 'payment' },
  { id: 'p5', date: '10/22/2026', desc: 'STAPLES #0418', payee: 'Staples', amount: 88.15, cleared: true, type: 'payment' },
  // Deposits / Credits
  { id: 'd1', date: '10/28/2026', desc: 'STRIPE PAYOUT', payee: 'Staples', amount: 1842.6, cleared: true, type: 'deposit' },
  { id: 'd2', date: '10/27/2026', desc: 'ACME CORP — ACH', payee: 'Acme Corp', amount: 1240.0, cleared: true, type: 'deposit' },
];

export interface ReconcileScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast?: (msg: string) => void;
}

export default function ReconcileScreen({ onNavigate, onToast }: ReconcileScreenProps) {
  const [account, setAccount] = useState('Chase •9910');
  const [beginningBalance] = useState(83469.72);
  const [statementEndingBalance, setStatementEndingBalance] = useState('86053.00');
  const [statementEndingDate, setStatementEndingDate] = useState('2026-10-31');

  const [txns, setTxns] = useState<ReconcileTxn[]>(INITIAL_RECONCILE_TXNS);

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (onToast) onToast(msg);
    setToastMsg(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastMsg(null), 2200);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Payments and Deposits calculations
  const payments = useMemo(() => txns.filter((t) => t.type === 'payment'), [txns]);
  const deposits = useMemo(() => txns.filter((t) => t.type === 'deposit'), [txns]);

  const clearedPaymentsTotal = useMemo(() => {
    return payments.filter((p) => p.cleared).reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

  const clearedDepositsTotal = useMemo(() => {
    return deposits.filter((d) => d.cleared).reduce((sum, d) => sum + d.amount, 0);
  }, [deposits]);

  // Cleared Balance = Beginning Balance - Cleared Payments + Cleared Deposits
  const clearedBalance = beginningBalance - clearedPaymentsTotal + clearedDepositsTotal;
  const targetEnding = parseFloat(statementEndingBalance) || 0;
  const difference = clearedBalance - targetEnding;
  const isBalanced = Math.abs(difference) < 0.01;

  const handleToggleTxn = (id: string) => {
    setTxns((prev) =>
      prev.map((t) => (t.id === id ? { ...t, cleared: !t.cleared } : t))
    );
  };

  const handleToggleAllPayments = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.checked;
    setTxns((prev) =>
      prev.map((t) => (t.type === 'payment' ? { ...t, cleared: nextVal } : t))
    );
  };

  const handleToggleAllDeposits = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.checked;
    setTxns((prev) =>
      prev.map((t) => (t.type === 'deposit' ? { ...t, cleared: nextVal } : t))
    );
  };

  const handleFinishNow = () => {
    if (isBalanced) {
      showToast('Reconciliation complete! October 2026 period closed.');
      setTimeout(() => onNavigate('finance', 'accounting'), 1200);
    } else {
      showToast(`Cannot close: Difference is $${Math.abs(difference).toFixed(2)}. Adjust items or save for later.`);
    }
  };

  const handleSaveForLater = () => {
    showToast('Reconciliation progress saved. Returning to overview.');
    onNavigate('finance', 'accounting');
  };

  return (
    <div className={styles.container}>
      {/* Context Header */}
      <div className={styles.contextHeader}>
        <div className={styles.breadcrumbsGroup}>
          <span className={`material-symbols-outlined ${styles.breadcrumbDomainIcon}`}>
            account_balance
          </span>
          <span className={styles.breadcrumbDomain}>Finance</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbSection}>Accounting</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbActive}>Reconcile</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6355' }}>
          Period closed: Oct 2026 tie-out
        </div>
      </div>

      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Reconcile account</h1>
            <p className={styles.pageSubtitle}>
              Match bank statement transactions to your books until difference is $0.00.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => onNavigate('finance', 'accounting')}
            >
              Back to overview
            </button>
          </div>
        </div>

        {/* Setup Parameters */}
        <div className={styles.setupCard}>
          <div>
            <label className={styles.fieldLabel}>Account</label>
            <select
              className={styles.fieldInput}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="Chase •9910">Chase •9910 (Business Checking)</option>
              <option value="Visa •4421">Visa •4421 (Credit Card)</option>
              <option value="Amex •2103">Amex •2103 (Business Gold)</option>
            </select>
          </div>

          <div>
            <label className={styles.fieldLabel}>Beginning balance</label>
            <input
              className={styles.fieldInput}
              readOnly
              value={`$${beginningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              style={{ backgroundColor: '#f4f3f7', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>

          <div>
            <label className={styles.fieldLabel}>Statement ending balance</label>
            <input
              className={styles.fieldInput}
              value={statementEndingBalance}
              onChange={(e) => setStatementEndingBalance(e.target.value)}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </div>

          <div>
            <label className={styles.fieldLabel}>Statement ending date</label>
            <input
              type="date"
              className={styles.fieldInput}
              value={statementEndingDate}
              onChange={(e) => setStatementEndingDate(e.target.value)}
            />
          </div>
        </div>

        {/* Tie-Out Calculator Banner */}
        <div className={styles.tieOutBanner}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Statement Ending Balance</span>
            <span className={styles.summaryVal}>
              ${targetEnding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Cleared Balance</span>
            <span className={styles.summaryVal}>
              ${clearedBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>
              Cleared Activity ({payments.filter((p) => p.cleared).length} debits,{' '}
              {deposits.filter((d) => d.cleared).length} credits)
            </span>
            <span style={{ fontSize: 13, color: '#5a6355', marginTop: 4 }}>
              −${clearedPaymentsTotal.toFixed(2)} / +${clearedDepositsTotal.toFixed(2)}
            </span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Difference</span>
            <span
              className={`${styles.summaryVal} ${
                isBalanced ? styles.diffBalanced : styles.diffUnbalanced
              }`}
            >
              {isBalanced ? '$0.00' : `${difference < 0 ? '−' : '+'}$${Math.abs(difference).toFixed(2)}`}
            </span>
          </div>
        </div>

        {/* Side-by-side Tables */}
        <div className={styles.clearingGrid}>
          {/* Payments */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>
                Payments &amp; Charges ({payments.filter((p) => p.cleared).length} of{' '}
                {payments.length} cleared)
              </h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={payments.length > 0 && payments.every((p) => p.cleared)}
                  onChange={handleToggleAllPayments}
                  style={{ accentColor: '#0a6400' }}
                />
                Select all
              </label>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Date</th>
                  <th>Payee</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} onClick={() => handleToggleTxn(p.id)} style={{ cursor: 'pointer' }}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={p.cleared}
                        onChange={() => handleToggleTxn(p.id)}
                        style={{ accentColor: '#0a6400' }}
                      />
                    </td>
                    <td>{p.date}</td>
                    <td style={{ fontWeight: 500 }}>{p.payee}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#ba1a1a', fontVariantNumeric: 'tabular-nums' }}>
                      −${p.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Deposits */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>
                Deposits &amp; Credits ({deposits.filter((d) => d.cleared).length} of{' '}
                {deposits.length} cleared)
              </h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={deposits.length > 0 && deposits.every((d) => d.cleared)}
                  onChange={handleToggleAllDeposits}
                  style={{ accentColor: '#0a6400' }}
                />
                Select all
              </label>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Date</th>
                  <th>Payee</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id} onClick={() => handleToggleTxn(d.id)} style={{ cursor: 'pointer' }}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={d.cleared}
                        onChange={() => handleToggleTxn(d.id)}
                        style={{ accentColor: '#0a6400' }}
                      />
                    </td>
                    <td>{d.date}</td>
                    <td style={{ fontWeight: 500 }}>{d.payee}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#006c47', fontVariantNumeric: 'tabular-nums' }}>
                      +${d.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className={styles.bottomBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isBalanced ? (
              <span style={{ color: '#0a6400', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  check_circle
                </span>
                Balanced! Ready to finish.
              </span>
            ) : (
              <span style={{ color: '#ba1a1a', fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  error_outline
                </span>
                Difference is not $0.00 yet.
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleSaveForLater}
            >
              Save for later
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleFinishNow}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                fact_check
              </span>
              Finish now
            </button>
          </div>
        </div>
      </main>

      {/* Toast */}
      {toastMsg && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check_circle
          </span>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
