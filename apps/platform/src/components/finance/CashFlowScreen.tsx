'use client';

import { useMemo, useState } from 'react';
import { DomainKey } from '@/data/shellData';
import styles from './CashFlowScreen.module.css';

export interface CashFlowScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast?: (msg: string) => void;
}

// ── Read-only model (spec §2.6) ──
// Built from open invoices, open bills, recurring templates, and scheduled payments.
const CASH_ON_HAND = 84210.4;

interface FlowWindow {
  id: 'w30' | 'w60' | 'w90';
  label: string;
  range: string;
  moneyIn: number;
  moneyOut: number;
}

const WINDOWS: FlowWindow[] = [
  { id: 'w30', label: 'Next 30 days', range: 'Nov 14 – Dec 13', moneyIn: 10720.0, moneyOut: 6270.0 },
  { id: 'w60', label: 'Days 31 – 60', range: 'Dec 14 – Jan 12', moneyIn: 8220.0, moneyOut: 5210.0 },
  { id: 'w90', label: 'Days 61 – 90', range: 'Jan 13 – Feb 11', moneyIn: 5240.0, moneyOut: 4380.0 },
];

// The what-if invoice — spec: "what if this invoice pays late".
const LATE_INVOICE = { no: 'INV-1002', amount: 1240.0, due: '11/27/2026', paysAt: '12/15/2026' };

const SOURCES = [
  { icon: 'receipt_long', label: 'Open invoices', detail: '4 invoices · $8,420.00 expected', tone: 'in' },
  { icon: 'description', label: 'Open bills', detail: '3 bills · $4,080.00 due', tone: 'out' },
  { icon: 'event_repeat', label: 'Recurring templates', detail: '6 templates · $3,180.00 / month', tone: 'in' },
  { icon: 'schedule_send', label: 'Scheduled payments', detail: '$2,190.00 in the next 30 days', tone: 'out' },
] as const;

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export default function CashFlowScreen({ onToast }: CashFlowScreenProps) {
  const [lateInvoice, setLateInvoice] = useState<boolean>(false);

  const windows = useMemo(() => {
    if (!lateInvoice) return WINDOWS;
    // INV-1002 shifts from the 30-day window into days 31–60.
    return WINDOWS.map((w) => {
      if (w.id === 'w30') return { ...w, moneyIn: w.moneyIn - LATE_INVOICE.amount };
      if (w.id === 'w60') return { ...w, moneyIn: w.moneyIn + LATE_INVOICE.amount };
      return w;
    });
  }, [lateInvoice]);

  const cumulative = useMemo(() => {
    const rows: {
      id: 'w30' | 'w60' | 'w90';
      label: string;
      range: string;
      moneyIn: number;
      moneyOut: number;
      cumIn: number;
      cumOut: number;
      balance: number;
    }[] = [];
    let inSum = 0;
    let outSum = 0;
    for (const w of windows) {
      inSum += w.moneyIn;
      outSum += w.moneyOut;
      rows.push({
        ...w,
        cumIn: inSum,
        cumOut: outSum,
        balance: CASH_ON_HAND + inSum - outSum,
      });
    }
    return rows;
  }, [windows]);

  const maxFlow = Math.max(...windows.map((w) => Math.max(w.moneyIn, w.moneyOut)));
  const next30 = cumulative[0];
  const totalIn = cumulative[2].cumIn;
  const totalOut = cumulative[2].cumOut;
  const endBalance = cumulative[2].balance;

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
          <span className={styles.breadcrumbActive}>Cash flow</span>
        </div>
        <div className={styles.readonlyBadge}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            lock
          </span>
          Read-only
        </div>
      </div>

      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Cash flow</h1>
            <p className={styles.pageSubtitle}>
              Money in, money out, and projected balance for the next 30, 60, and 90 days.
            </p>
          </div>
          {/* What-if toggle */}
          <button
            type="button"
            className={`${styles.whatIfToggle} ${lateInvoice ? styles.whatIfToggleOn : ''}`}
            data-whatif={lateInvoice ? 'on' : 'off'}
            aria-pressed={lateInvoice}
            onClick={() => {
              const next = !lateInvoice;
              setLateInvoice(next);
              if (onToast)
                onToast(
                  next
                    ? `What-if: ${LATE_INVOICE.no} now assumed to pay ${LATE_INVOICE.paysAt}`
                    : `What-if cleared — ${LATE_INVOICE.no} back on ${LATE_INVOICE.due}`
                );
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {lateInvoice ? 'toggle_on' : 'toggle_off'}
            </span>
            <span className={styles.whatIfText}>
              What if this invoice pays late
              <span className={styles.whatIfMeta}>
                {LATE_INVOICE.no} · {fmt(LATE_INVOICE.amount)} · due {LATE_INVOICE.due}
              </span>
            </span>
          </button>
        </div>

        {/* KPI row */}
        <div className={styles.kpiRow}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Cash on hand today</span>
            <span className={styles.kpiValue}>{fmt(CASH_ON_HAND)}</span>
            <span className={styles.kpiMeta}>Chase •9910 · Visa •4421 · Amex •3307</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Money in · next 30 days</span>
            <span className={`${styles.kpiValue} ${styles.kpiIn}`}>{fmt(next30.moneyIn)}</span>
            <span className={styles.kpiMeta}>
              {lateInvoice ? `Excludes ${LATE_INVOICE.no} (${fmt(LATE_INVOICE.amount)})` : 'Includes all open invoices'}
            </span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Money out · next 30 days</span>
            <span className={`${styles.kpiValue} ${styles.kpiOut}`}>{fmt(next30.moneyOut)}</span>
            <span className={styles.kpiMeta}>Open bills + scheduled payments</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Projected balance · 30 days</span>
            <span className={styles.kpiValue}>{fmt(next30.balance)}</span>
            <span className={styles.kpiMeta}>
              60d {fmt(cumulative[1].balance)} · 90d {fmt(cumulative[2].balance)}
            </span>
          </div>
        </div>

        {/* Projection windows */}
        <section className={styles.panel} aria-label="Projected cash flow windows">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Projected cash flow</h2>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendIn}`} /> Money in
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendOut}`} /> Money out
              </span>
            </div>
          </div>
          <div className={styles.windowGrid}>
            {cumulative.map((w, idx) => (
              <div key={w.id} className={styles.windowCard} data-window={w.id}>
                <div className={styles.windowHead}>
                  <span className={styles.windowLabel}>{w.label}</span>
                  <span className={styles.windowRange}>{w.range}</span>
                </div>
                <div className={styles.barRow}>
                  <span className={styles.barLabel}>In</span>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.bar} ${styles.barIn}`}
                      style={{ width: `${Math.max((w.moneyIn / maxFlow) * 100, 2)}%` }}
                    />
                  </div>
                  <span className={styles.barValue}>{fmt(w.moneyIn)}</span>
                </div>
                <div className={styles.barRow}>
                  <span className={styles.barLabel}>Out</span>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.bar} ${styles.barOut}`}
                      style={{ width: `${Math.max((w.moneyOut / maxFlow) * 100, 2)}%` }}
                    />
                  </div>
                  <span className={styles.barValue}>{fmt(w.moneyOut)}</span>
                </div>
                <div className={styles.windowBalance}>
                  <span className={styles.windowBalanceLabel}>
                    Projected balance{idx > 0 ? ` · ${idx === 1 ? '60' : '90'}d` : ''}
                  </span>
                  <span className={styles.windowBalanceValue}>{fmt(w.balance)}</span>
                </div>
                {idx === 0 && lateInvoice && (
                  <div className={styles.windowFlag}>
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                      bolt
                    </span>
                    {LATE_INVOICE.no} shifted to days 31–60
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className={styles.windowFootnote}>
            90-day totals — money in {fmt(totalIn)} · money out {fmt(totalOut)} · ending balance{' '}
            {fmt(endBalance)}
          </div>
        </section>

        {/* Sources */}
        <section className={styles.panel} aria-label="Cash flow sources">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Built from</h2>
          </div>
          <div className={styles.sourceGrid}>
            {SOURCES.map((s) => (
              <div key={s.label} className={styles.sourceCard} data-tone={s.tone}>
                <span className={`material-symbols-outlined ${styles.sourceIcon}`}>{s.icon}</span>
                <div>
                  <div className={styles.sourceLabel}>{s.label}</div>
                  <div className={styles.sourceDetail}>{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
