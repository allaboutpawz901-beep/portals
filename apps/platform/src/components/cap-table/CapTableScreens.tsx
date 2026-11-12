'use client';

import { useState } from 'react';
import { CAP, CapHolder } from '@/data/capTableData';
import { DemoRow } from '@/data/shellData';
import StatusPill from '@/components/StatusPill';
import styles from './CapTableScreens.module.css';

interface CapTableScreenRendererProps {
  screenId: string;
  onGotoScreen: (screenId: string) => void;
  onCapCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (message: string) => void;
}

function toDemoRow(obj: object): DemoRow {
  const out: DemoRow = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' || typeof v === 'number') {
      out[k] = v;
    }
  }
  return out;
}

function parseNumeric(val: string, fallback: number): number {
  const cleaned = val.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function CapOverviewView({
  onGotoScreen,
  onCapCreate,
  onOpenCreateFlyout,
  onToast,
}: {
  onGotoScreen: (screenId: string) => void;
  onCapCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onToast: (msg: string) => void;
}) {
  const totalFds = CAP.holders.reduce((s, h) => s + h.fds, 0);

  const kpis = [
    {
      label: 'Fully diluted shares',
      value: totalFds.toLocaleString(),
      delta: `of ${CAP.company.authorized.toLocaleString()} authorized`,
    },
    {
      label: 'Post-money valuation',
      value: '$30,000,000',
      delta: 'Series A · Sep 2026',
    },
    {
      label: 'Total raised',
      value: '$7,970,000',
      delta: '3 rounds',
    },
    {
      label: 'Option pool available',
      value: CAP.optionPool.available.toLocaleString(),
      delta: `${CAP.optionPool.granted.toLocaleString()} granted`,
    },
  ];

  const createActions: [string, string][] = [
    ['Share issuance', 'add_card'],
    ['Option grant', 'workspace_premium'],
    ['SAFE', 'description'],
    ['Round', 'trending_up'],
    ['Stakeholder', 'person_add'],
  ];

  const getBarFillClass = (type: CapHolder['type']) => {
    if (type === 'Common') return styles.fillQbBlue;
    if (type === 'Preferred (Seed)') return styles.fillQbGreen;
    if (type === 'Options') return styles.fillQbMaroon;
    return styles.fillQbTeal;
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerBlock}>
        <div className={styles.breadcrumb}>
          <span>Cap Table</span>
        </div>
        <div className={styles.headerRowBetween}>
          <div>
            <h1 className={styles.title}>Cap Table — Overview</h1>
            <p className={styles.subtitle}>
              {CAP.company.name} · {CAP.company.entity} · As of {CAP.asOf}
            </p>
          </div>
          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.btnOutline}
              onClick={() => onToast('Cap Table exported')}
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>download</span>
              Export
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() =>
                navigator.clipboard
                  ?.writeText('https://app.unsaid.co/cap-table/share')
                  .then(() => onToast('Share link copied to clipboard'))
                  .catch(() => onToast('Copy failed — copy manually'))
              }
            >
              <span className={`material-symbols-outlined ${styles.icon16}`}>share</span>
              Share
            </button>
          </div>
        </div>
      </div>

      <div className={styles.kpiGrid4}>
        {kpis.map((k) => (
          <div key={k.label} className={styles.kpiCard4}>
            <span className={styles.kpiLabel4}>{k.label}</span>
            <div className={styles.kpiValue4}>{k.value}</div>
            <div className={styles.kpiSub4}>{k.delta}</div>
          </div>
        ))}
      </div>

      <div className={styles.grid3}>
        <div className={`${styles.colSpan2} ${styles.panelCard}`}>
          <div className={styles.cardHeaderBetween}>
            <h2 className={styles.cardTitle}>Ownership breakdown</h2>
            <span className={styles.cardMeta11}>
              Fully diluted · {totalFds.toLocaleString()} shares
            </span>
          </div>
          <div className={styles.barList}>
            {CAP.holders.map((h) => {
              const pct = (h.fds / totalFds) * 100;
              return (
                <div key={h.name} className={styles.barRow}>
                  <span className={styles.barHolder}>{h.name}</span>
                  <div className={styles.barTrack}>
                    <svg className={styles.barSvg} aria-hidden="true">
                      <rect
                        className={getBarFillClass(h.type)}
                        x="0"
                        y="0"
                        width={`${pct.toFixed(1)}%`}
                        height="20"
                      />
                    </svg>
                  </div>
                  <span className={styles.barPct}>{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
          <div className={styles.legendRow}>
            <span className={styles.legendItem}>
              <span className={styles.dotBlue} />
              Common
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotGreen} />
              Preferred
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotMaroon} />
              Options
            </span>
            <span className={styles.legendItem}>
              <span className={styles.dotTeal} />
              SAFE
            </span>
          </div>
        </div>

        <div className={styles.panelCard}>
          <h2 className={styles.cardTitleMb3}>Round history</h2>
          <div className={styles.roundHistoryList}>
            {CAP.rounds.map((r) => (
              <div key={r.name} className={styles.roundHistoryItem}>
                <span
                  className={`material-symbols-outlined ${styles.icon16PrimaryTop}`}
                >
                  {r.status === 'Closed' ? 'check_circle' : 'pending'}
                </span>
                <div className={styles.roundHistoryBody}>
                  <div className={styles.roundHistoryTop}>
                    <span className={styles.roundHistoryName}>{r.name}</span>
                    <span className={styles.roundHistoryAmt}>{r.amount}</span>
                  </div>
                  <div className={styles.roundHistoryMeta}>
                    {r.date} · {r.type} · {r.lead}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={styles.btnOutlineFullMt3}
            onClick={() => onGotoScreen('cap-rounds')}
          >
            View all rounds
          </button>
        </div>
      </div>

      <div className={styles.createActionsRow}>
        <span className={styles.createActionsLabel}>Create actions:</span>
        {createActions.map(([label, icon]) => (
          <button
            key={label}
            type="button"
            className={styles.createActionChip}
            onClick={() => onCapCreate(label)}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>{icon}</span>
            {label}
          </button>
        ))}
        <button
          type="button"
          className={styles.showAllChip}
          onClick={onOpenCreateFlyout}
        >
          <span className={`material-symbols-outlined ${styles.icon16}`}>apps</span>
          Show all
        </button>
      </div>

      <div className={styles.grid2}>
        <div className={styles.panelCard}>
          <h2 className={styles.cardTitleMb2}>Recent equity events</h2>
          <div className={styles.divideList}>
            {CAP.events.slice(0, 5).map((e) => (
              <div key={`${e.date}-${e.event}`} className={styles.recentEventRow}>
                <div className={styles.recentEventLeft}>
                  <div className={styles.recentEventTitle}>{e.event}</div>
                  <div className={styles.recentEventSub}>
                    {e.date} · {e.holder}
                  </div>
                </div>
                <span className={styles.recentEventDelta}>{e.delta}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.panelCard}>
          <h2 className={styles.cardTitleMb2}>Compliance &amp; reminders</h2>
          <div className={styles.complianceList}>
            <div className={styles.complianceError}>
              <span className={`material-symbols-outlined ${styles.icon16Error}`}>
                warning
              </span>
              <span>409A expires in 47 days — refresh before next grant.</span>
            </div>
            <div className={styles.complianceNeutral}>
              <span className={`material-symbols-outlined ${styles.icon16Tertiary}`}>
                info
              </span>
              <span>Series A board consent pending for 2 grants.</span>
            </div>
            <div className={styles.complianceNeutral}>
              <span className={`material-symbols-outlined ${styles.icon16Secondary}`}>
                check_circle
              </span>
              <span>Annual Delaware franchise tax filed 2026-03-01.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CapTableMainView({
  onOpenPeek,
  onToast,
}: {
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'summary' | 'detailed' | 'fds'>('summary');
  const [activeTab, setActiveTab] = useState<string>('All');
  const [filterText, setFilterText] = useState<string>('');

  const totalFds = CAP.holders.reduce((s, h) => s + h.fds, 0);
  const totalShares = CAP.holders.reduce((s, h) => s + h.shares, 0);

  const tabs = ['All', 'Common', 'Preferred', 'Options', 'SAFE/Convertible'];
  const q = filterText.trim().toLowerCase();

  const filteredHolders = CAP.holders.filter((h) => {
    if (activeTab === 'Common' && h.type !== 'Common') return false;
    if (activeTab === 'Preferred' && h.type !== 'Preferred (Seed)') return false;
    if (activeTab === 'Options' && h.type !== 'Options') return false;
    if (activeTab === 'SAFE/Convertible' && h.type !== 'SAFE') return false;
    if (!q) return true;
    return (
      h.name.toLowerCase().includes(q) ||
      h.role.toLowerCase().includes(q) ||
      h.type.toLowerCase().includes(q)
    );
  });

  const kpiCards: [string, string][] = [
    ['Authorized', CAP.company.authorized.toLocaleString()],
    ['Issued', CAP.company.issued.toLocaleString()],
    ['Outstanding', totalShares.toLocaleString()],
    ['Fully diluted', totalFds.toLocaleString()],
    ['Par value', `$${CAP.company.parValue.toFixed(4)}`],
  ];

  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Cap Table</h1>
          <p className={styles.subtitle}>
            {CAP.company.name} · As of {CAP.asOf} · {CAP.company.entity}
          </p>
        </div>
        <div className={styles.actionsRow}>
          <div className={styles.viewToggle} id="cap-view-toggle">
            {(
              [
                ['summary', 'Summary'],
                ['detailed', 'Detailed'],
                ['fds', 'Fully diluted'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                data-capview={key}
                className={`${styles.viewToggleBtn} ${
                  viewMode === key ? styles.viewToggleBtnActive : ''
                }`}
                onClick={() => {
                  setViewMode(key);
                  onToast(`Cap Table view → ${key}`);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => onToast('Cap Table exported')}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>download</span>
            Export
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => onToast('Share link copied')}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>share</span>
            Share
          </button>
        </div>
      </div>

      <div className={styles.kpiGrid5}>
        {kpiCards.map(([label, val]) => (
          <div key={label} className={styles.kpiCard5}>
            <span className={styles.kpiLabel5}>{label}</span>
            <div className={styles.kpiValue5}>{val}</div>
          </div>
        ))}
      </div>

      <div className={styles.tableCardShadow}>
        <div className={styles.tabsBar}>
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.tabUnderline} ${
                activeTab === tab ? styles.tabUnderlineActive : ''
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className={styles.filterBar}>
          <div className={styles.searchWrap}>
            <span className={`material-symbols-outlined ${styles.icon15Search}`}>
              search
            </span>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Filter stakeholders…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
          <button type="button" className={styles.filterMiniBtn}>
            <span className={`material-symbols-outlined ${styles.icon14}`}>
              filter_list
            </span>
            Filter
          </button>
          <button type="button" className={styles.filterMiniBtn}>
            <span className={`material-symbols-outlined ${styles.icon14}`}>
              calendar_today
            </span>
            As-of date
          </button>
          <span className={styles.filterCountRight}>
            {filteredHolders.length} stakeholders
          </span>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.tableWide}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>#</th>
                <th className={styles.th}>Stakeholder</th>
                <th className={styles.th}>Security</th>
                <th className={styles.thRight}>Shares</th>
                <th className={styles.thRight}>Ownership</th>
                <th className={styles.thRight}>Options</th>
                <th className={styles.thRight}>SAFE ($)</th>
                <th className={styles.thRight}>Invested</th>
                <th className={styles.thRight}>Fully diluted</th>
                <th className={styles.thRight}>FD %</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {filteredHolders.map((h, idx) => {
                const pct = totalShares > 0 ? (h.shares / totalShares) * 100 : 0;
                return (
                  <tr
                    key={h.name}
                    className={styles.trClick}
                    onClick={() => onOpenPeek(toDemoRow(h), 'cap')}
                  >
                    <td className={styles.tdMuted}>{idx + 1}</td>
                    <td className={styles.td}>
                      <div className={styles.holderPrimary}>{h.name}</div>
                      <div className={styles.holderSecondary}>{h.role}</div>
                    </td>
                    <td className={styles.td}>
                      <StatusPill status={h.type} />
                    </td>
                    <td className={styles.tdRight}>{h.shares.toLocaleString()}</td>
                    <td className={styles.tdRight}>{pct.toFixed(2)}%</td>
                    <td className={styles.tdRight}>{h.options.toLocaleString()}</td>
                    <td className={styles.tdRight}>
                      {h.safe ? `$${h.safe.toLocaleString()}` : '—'}
                    </td>
                    <td className={styles.tdRight}>{h.invested}</td>
                    <td className={styles.tdRightMedium}>{h.fds.toLocaleString()}</td>
                    <td className={styles.tdRightSemi}>{h.fdsPct}</td>
                    <td className={styles.tdAction}>
                      <button
                        type="button"
                        className={styles.rowIconBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToast('Row actions menu');
                        }}
                      >
                        <span
                          className={`material-symbols-outlined ${styles.icon16Muted}`}
                        >
                          more_horiz
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className={styles.tfoot}>
              <tr>
                <td className={styles.td} colSpan={3}>
                  Totals
                </td>
                <td className={styles.tdRight}>{totalShares.toLocaleString()}</td>
                <td className={styles.tdRight}>100.00%</td>
                <td className={styles.tdRight}>
                  {CAP.optionPool.granted.toLocaleString()}
                </td>
                <td className={styles.tdRight}>$250,000</td>
                <td className={styles.tdRight}>$1,870,000</td>
                <td className={styles.tdRight}>{totalFds.toLocaleString()}</td>
                <td className={styles.tdRight}>100.00%</td>
                <td className={styles.td} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function CapHoldersView({
  onCapCreate,
  onOpenPeek,
  onToast,
}: {
  onCapCreate: (label: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Stakeholders</h1>
          <p className={styles.subtitle}>
            Founders, investors, option holders, SAFE holders.
          </p>
        </div>
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => onToast('Cap Table exported')}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>download</span>
            Export
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => onCapCreate('Stakeholder')}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>
              person_add
            </span>
            Add stakeholder
          </button>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Role</th>
                <th className={styles.th}>Security</th>
                <th className={styles.thRight}>Shares</th>
                <th className={styles.thRight}>Invested</th>
                <th className={styles.thRight}>FD %</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {CAP.holders.map((h) => (
                <tr
                  key={h.name}
                  className={styles.trClick}
                  onClick={() => onOpenPeek(toDemoRow(h), 'cap')}
                >
                  <td className={styles.tdMedium}>{h.name}</td>
                  <td className={styles.td}>{h.role}</td>
                  <td className={styles.td}>
                    <StatusPill status={h.type} />
                  </td>
                  <td className={styles.tdRight}>{h.shares.toLocaleString()}</td>
                  <td className={styles.tdRight}>{h.invested}</td>
                  <td className={styles.tdRight}>{h.fdsPct}</td>
                  <td className={styles.td}>
                    <StatusPill status="Active" />
                  </td>
                  <td className={styles.tdAction}>
                    <button
                      type="button"
                      className={styles.rowIconBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToast('Row actions');
                      }}
                    >
                      <span
                        className={`material-symbols-outlined ${styles.icon16Muted}`}
                      >
                        more_horiz
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CapRoundsView({
  onCapCreate,
}: {
  onCapCreate: (label: string) => void;
}) {
  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Funding Rounds</h1>
          <p className={styles.subtitle}>
            SAFE, Seed, Series A — pre/post money, price per share, shares issued.
          </p>
        </div>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => onCapCreate('Round')}
        >
          <span className={`material-symbols-outlined ${styles.icon16}`}>
            trending_up
          </span>
          New round
        </button>
      </div>

      <div className={styles.grid3}>
        {CAP.rounds.map((r) => (
          <div key={r.name} className={styles.roundCard}>
            <div className={styles.cardHeaderBetweenMb2}>
              <h3 className={styles.cardTitle}>{r.name}</h3>
              <StatusPill status={r.status} />
            </div>
            <div className={styles.roundAmount}>{r.amount}</div>
            <dl className={styles.dlList}>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Date</dt>
                <dd className={styles.dd}>{r.date}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Type</dt>
                <dd className={styles.dd}>{r.type}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Pre-money</dt>
                <dd className={styles.dd}>{r.preMoney}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Post-money</dt>
                <dd className={styles.dd}>{r.postMoney}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Price/share</dt>
                <dd className={styles.dd}>{r.pricePerShare}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Shares issued</dt>
                <dd className={styles.dd}>{r.sharesIssued}</dd>
              </div>
              <div className={styles.dlRow}>
                <dt className={styles.dt}>Lead</dt>
                <dd className={styles.dd}>{r.lead}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function CapOptionsView({
  onCapCreate,
  onOpenPeek,
  onToast,
}: {
  onCapCreate: (label: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  const p = CAP.optionPool;
  const kpiCards: [string, string][] = [
    ['Pool total', p.total.toLocaleString()],
    ['Granted', p.granted.toLocaleString()],
    ['Exercised', p.exercised.toLocaleString()],
    ['Available', p.available.toLocaleString()],
    ['Unvested', p.unvested.toLocaleString()],
  ];

  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Option Pool</h1>
          <p className={styles.subtitle}>
            Grant, vest, exercise, cancel. ISO / NSO.
          </p>
        </div>
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={styles.btnOutline}
            onClick={() => onToast('Cap Table exported')}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>download</span>
            Export
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => onCapCreate('Option grant')}
          >
            <span className={`material-symbols-outlined ${styles.icon16}`}>
              workspace_premium
            </span>
            New grant
          </button>
        </div>
      </div>

      <div className={styles.kpiGrid5}>
        {kpiCards.map(([label, val]) => (
          <div key={label} className={styles.kpiCard5}>
            <span className={styles.kpiLabel5}>{label}</span>
            <div className={styles.kpiValue5}>{val}</div>
          </div>
        ))}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Holder</th>
                <th className={styles.th}>Role</th>
                <th className={styles.th}>Grant date</th>
                <th className={styles.thRight}>Shares</th>
                <th className={styles.thRight}>Strike</th>
                <th className={styles.thRight}>Vested</th>
                <th className={styles.thRight}>Unvested</th>
                <th className={styles.th}>Vesting</th>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {p.grants.map((g) => (
                <tr
                  key={g.holder}
                  className={styles.trClick}
                  onClick={() => onOpenPeek(toDemoRow(g), 'cap')}
                >
                  <td className={styles.tdMedium}>{g.holder}</td>
                  <td className={styles.td}>{g.role}</td>
                  <td className={styles.td}>{g.grantDate}</td>
                  <td className={styles.tdRight}>{g.shares.toLocaleString()}</td>
                  <td className={styles.tdRight}>{g.strike}</td>
                  <td className={styles.tdRight}>{g.vested}</td>
                  <td className={styles.tdRight}>{g.unvested}</td>
                  <td className={styles.tdSmall}>{g.vesting}</td>
                  <td className={styles.td}>{g.type}</td>
                  <td className={styles.td}>
                    <StatusPill status={g.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CapSafesView({
  onCapCreate,
  onOpenPeek,
  onToast,
}: {
  onCapCreate: (label: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>SAFEs &amp; Convertibles</h1>
          <p className={styles.subtitle}>
            Valuation cap, discount, MFN, pro-rata. Convert on financing.
          </p>
        </div>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => onCapCreate('SAFE')}
        >
          <span className={`material-symbols-outlined ${styles.icon16}`}>
            description
          </span>
          New SAFE
        </button>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Holder</th>
                <th className={styles.th}>Date</th>
                <th className={styles.thRight}>Amount</th>
                <th className={styles.thRight}>Valuation cap</th>
                <th className={styles.th}>Discount</th>
                <th className={styles.th}>MFN</th>
                <th className={styles.th}>Pro-rata</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {CAP.safes.map((s) => (
                <tr
                  key={s.holder}
                  className={styles.trClick}
                  onClick={() => onOpenPeek(toDemoRow(s), 'cap')}
                >
                  <td className={styles.tdMedium}>{s.holder}</td>
                  <td className={styles.td}>{s.date}</td>
                  <td className={styles.tdRight}>{s.amount}</td>
                  <td className={styles.tdRight}>{s.valuationCap}</td>
                  <td className={styles.td}>{s.discount}</td>
                  <td className={styles.td}>{s.mfn}</td>
                  <td className={styles.td}>{s.proRata}</td>
                  <td className={styles.td}>
                    <StatusPill status={s.status} />
                  </td>
                  <td className={styles.tdAction}>
                    <button
                      type="button"
                      className={styles.rowIconBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToast('Row actions');
                      }}
                    >
                      <span
                        className={`material-symbols-outlined ${styles.icon16Muted}`}
                      >
                        more_horiz
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CapDilutionView({ onToast }: { onToast: (msg: string) => void }) {
  const [roundName, setRoundName] = useState<string>('Series A Extension');
  const [amountInput, setAmountInput] = useState<string>('$3,000,000');
  const [preMoneyInput, setPreMoneyInput] = useState<string>('$30,000,000');
  const [poolTopUpInput, setPoolTopUpInput] = useState<string>('250,000 shares');

  const [appliedAmount, setAppliedAmount] = useState<number>(3_000_000);
  const [appliedPreMoney, setAppliedPreMoney] = useState<number>(30_000_000);
  const [appliedPoolTopUp, setAppliedPoolTopUp] = useState<number>(250_000);

  const baseFds = CAP.holders.reduce((s, x) => s + x.fds, 0);
  const pps =
    appliedPreMoney === 30_000_000 && appliedAmount === 3_000_000
      ? 3.0
      : Math.max(0.01, appliedPreMoney / 10_000_000);
  const newShares = Math.round(appliedAmount / pps);
  const safeConversionShares = 125_000;
  const postMoney = appliedPreMoney + appliedAmount;
  const postRoundDenominator = baseFds + newShares + appliedPoolTopUp;

  const handleRunModel = () => {
    setAppliedAmount(Math.max(0, parseNumeric(amountInput, 3_000_000)));
    setAppliedPreMoney(Math.max(100_000, parseNumeric(preMoneyInput, 30_000_000)));
    setAppliedPoolTopUp(Math.max(0, parseNumeric(poolTopUpInput, 250_000)));
    onToast('Dilution model recalculated');
  };

  return (
    <div className={styles.container}>
      <div className={styles.breadcrumbWizard}>
        <span>Cap Table</span>
      </div>
      <h1 className={styles.titleMb1}>Dilution Modeler</h1>
      <p className={styles.subtitleMb5}>
        Model new rounds, option pool increases, SAFE conversions, and price-per-share
        effects.
      </p>

      <div className={styles.grid3Gap4}>
        <div className={`${styles.colSpan2} ${styles.panelCard}`}>
          <h2 className={styles.cardTitleMb3}>Model a new round</h2>
          <div className={styles.formGrid2}>
            <div>
              <label className={styles.fieldLabel}>Round name</label>
              <input
                className={styles.fieldInput}
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>Amount raised</label>
              <input
                className={styles.fieldInput}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>Pre-money valuation</label>
              <input
                className={styles.fieldInput}
                value={preMoneyInput}
                onChange={(e) => setPreMoneyInput(e.target.value)}
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>Option pool top-up</label>
              <input
                className={styles.fieldInput}
                value={poolTopUpInput}
                onChange={(e) => setPoolTopUpInput(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className={styles.btnPrimaryMb5}
            onClick={handleRunModel}
          >
            Run model
          </button>

          <h3 className={styles.subHeadingMb2}>Before / after ownership</h3>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Holder</th>
                  <th className={styles.thRight}>Before</th>
                  <th className={styles.thRight}>After</th>
                  <th className={styles.thRight}>Δ</th>
                </tr>
              </thead>
              <tbody className={styles.tbody}>
                {CAP.holders.map((h) => {
                  const afterNum = (h.fds / postRoundDenominator) * 100;
                  const after = afterNum.toFixed(2);
                  const deltaNum = parseFloat(after) - parseFloat(h.fdsPct);
                  const delta = deltaNum.toFixed(2);
                  return (
                    <tr key={h.name}>
                      <td className={styles.td}>{h.name}</td>
                      <td className={styles.tdRight}>{h.fdsPct}</td>
                      <td className={styles.tdRight}>{after}%</td>
                      <td
                        className={
                          deltaNum < 0 ? styles.tdRightNeg : styles.tdRightPos
                        }
                      >
                        {deltaNum > 0 ? '+' : ''}
                        {delta}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.panelCard}>
          <h2 className={styles.cardTitleMb3}>Conversion preview</h2>
          <div className={styles.previewStack}>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>New price/share</span>
              <span className={styles.previewVal}>${pps.toFixed(2)}</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>New shares issued</span>
              <span className={styles.previewVal}>{newShares.toLocaleString()}</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>SAFE conversion</span>
              <span className={styles.previewVal}>
                {safeConversionShares.toLocaleString()}
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Pool top-up</span>
              <span className={styles.previewVal}>
                {appliedPoolTopUp.toLocaleString()}
              </span>
            </div>
            <div className={styles.previewTotalRow}>
              <span className={styles.previewTotalText}>Post-money</span>
              <span className={styles.previewTotalText}>
                ${postMoney.toLocaleString()}
              </span>
            </div>
          </div>
          <div className={styles.infoCallout}>
            <span className={`material-symbols-outlined ${styles.icon14Inline}`}>
              info
            </span>
            SAFE conversions apply cap and discount, whichever yields more shares.
            MFN holders get the best terms from later SAFEs.
          </div>
        </div>
      </div>
    </div>
  );
}

function CapWaterfallView({ onToast }: { onToast: (msg: string) => void }) {
  const [eventType, setEventType] = useState<string>('M&A — sale of company');
  const [grossInput, setGrossInput] = useState<string>('$45,000,000');
  const [stackType, setStackType] = useState<string>('1x non-participating (Seed)');
  const [appliedProceeds, setAppliedProceeds] = useState<number>(45_000_000);
  const [appliedStack, setAppliedStack] = useState<string>(
    '1x non-participating (Seed)'
  );

  const handleRunWaterfall = () => {
    setAppliedProceeds(Math.max(0, parseNumeric(grossInput, 45_000_000)));
    setAppliedStack(stackType);
    onToast('Waterfall recalculated');
  };

  const scaleFactor = appliedProceeds / 45_000_000;
  const prefMult = appliedStack.startsWith('2x') ? 2 : 1;
  const isParticipating = appliedStack.includes('participating') && !appliedStack.includes('non-participating');

  return (
    <div className={styles.container}>
      <div className={styles.breadcrumbWizard}>
        <span>Cap Table</span>
      </div>
      <h1 className={styles.titleMb1}>Liquidation Waterfall</h1>
      <p className={styles.subtitleMb5}>
        1x non-participating preferred. Choose a liquidity event and see proceeds
        allocation.
      </p>

      <div className={styles.grid3Gap4}>
        <div className={styles.panelCard}>
          <h2 className={styles.cardTitleMb3}>Liquidity event</h2>
          <div className={styles.stack3}>
            <div>
              <label className={styles.fieldLabel}>Event type</label>
              <select
                className={styles.fieldSelect}
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                <option>M&amp;A — sale of company</option>
                <option>IPO</option>
                <option>Secondary tender</option>
                <option>Dissolution</option>
              </select>
            </div>
            <div>
              <label className={styles.fieldLabel}>Gross proceeds</label>
              <input
                className={styles.fieldInput}
                value={grossInput}
                onChange={(e) => setGrossInput(e.target.value)}
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>Preferred stack</label>
              <select
                className={styles.fieldSelect}
                value={stackType}
                onChange={(e) => setStackType(e.target.value)}
              >
                <option>1x non-participating (Seed)</option>
                <option>1x participating</option>
                <option>2x non-participating</option>
              </select>
            </div>
            <button
              type="button"
              className={styles.btnPrimaryFull}
              onClick={handleRunWaterfall}
            >
              Calculate waterfall
            </button>
          </div>
          <div className={styles.infoCallout}>
            <span className={`material-symbols-outlined ${styles.icon14Inline}`}>
              info
            </span>
            Preferred holders choose between preference or converting to common —
            whichever returns more.
          </div>
        </div>

        <div className={`${styles.colSpan2} ${styles.panelCard}`}>
          <h2 className={styles.cardTitleMb3}>Proceeds allocation</h2>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Holder</th>
                  <th className={styles.th}>Class</th>
                  <th className={styles.thRight}>Preference</th>
                  <th className={styles.thRight}>Proceeds</th>
                  <th className={styles.thRight}>%</th>
                </tr>
              </thead>
              <tbody className={styles.tbody}>
                {CAP.holders.map((h) => {
                  const invNum = parseNumeric(h.invested, 0);
                  const prefAmt = invNum * prefMult;
                  const pref =
                    h.type === 'Preferred (Seed)'
                      ? prefAmt === 0
                        ? '—'
                        : `$${prefAmt.toLocaleString()}`
                      : '—';

                  let proceedsDisplay: string;
                  if (
                    appliedProceeds === 45_000_000 &&
                    appliedStack === '1x non-participating (Seed)'
                  ) {
                    proceedsDisplay =
                      h.type === 'Preferred (Seed)'
                        ? h.invested
                        : (h.shares * 3).toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                          });
                  } else {
                    const commonShareVal = h.shares * 3 * scaleFactor;
                    const val =
                      h.type === 'Preferred (Seed)'
                        ? isParticipating
                          ? prefAmt + commonShareVal
                          : Math.max(prefAmt, commonShareVal)
                        : commonShareVal;
                    proceedsDisplay = val.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    });
                  }

                  return (
                    <tr key={h.name}>
                      <td className={styles.td}>{h.name}</td>
                      <td className={styles.td}>{h.type}</td>
                      <td className={styles.tdRight}>{pref}</td>
                      <td className={styles.tdRight}>{proceedsDisplay}</td>
                      <td className={styles.tdRight}>
                        {parseFloat(h.fdsPct).toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function CapValuationsView({
  onCapCreate,
  onOpenPeek,
  onToast,
}: {
  onCapCreate: (label: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>409A &amp; Valuations</h1>
          <p className={styles.subtitle}>
            Refresh cadence, provider, price per share, status.
          </p>
        </div>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => onCapCreate('409A')}
        >
          <span className={`material-symbols-outlined ${styles.icon16}`}>gavel</span>
          New valuation
        </button>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>Type</th>
                <th className={styles.thRight}>Value</th>
                <th className={styles.th}>Provider</th>
                <th className={styles.thRight}>Price/share</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {CAP.valuations.map((v) => (
                <tr
                  key={v.date}
                  className={styles.trClick}
                  onClick={() => onOpenPeek(toDemoRow(v), 'cap')}
                >
                  <td className={styles.td}>{v.date}</td>
                  <td className={styles.td}>{v.type}</td>
                  <td className={styles.tdRight}>{v.value}</td>
                  <td className={styles.td}>{v.provider}</td>
                  <td className={styles.tdRight}>{v.pricePerShare}</td>
                  <td className={styles.td}>
                    <StatusPill status={v.status} />
                  </td>
                  <td className={styles.tdAction}>
                    <button
                      type="button"
                      className={styles.rowIconBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToast('Row actions');
                      }}
                    >
                      <span
                        className={`material-symbols-outlined ${styles.icon16Muted}`}
                      >
                        more_horiz
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CapDocumentsView({
  onCapCreate,
  onOpenPeek,
  onToast,
}: {
  onCapCreate: (label: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Documents</h1>
          <p className={styles.subtitle}>
            Charter, financing docs, plan, bylaws — signed originals.
          </p>
        </div>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => onCapCreate('Document')}
        >
          <span className={`material-symbols-outlined ${styles.icon16}`}>upload</span>
          Upload
        </button>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Name</th>
                <th className={styles.th}>Category</th>
                <th className={styles.th}>Date</th>
                <th className={styles.thRight}>Size</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {CAP.documents.map((d) => (
                <tr
                  key={d.name}
                  className={styles.trClick}
                  onClick={() => onOpenPeek(toDemoRow(d), 'cap')}
                >
                  <td className={styles.tdDocName}>
                    <span
                      className={`material-symbols-outlined ${styles.icon16Muted}`}
                    >
                      description
                    </span>
                    {d.name}
                  </td>
                  <td className={styles.td}>{d.category}</td>
                  <td className={styles.td}>{d.date}</td>
                  <td className={styles.tdRight}>{d.size}</td>
                  <td className={styles.td}>
                    <StatusPill status={d.status} />
                  </td>
                  <td className={styles.tdAction}>
                    <button
                      type="button"
                      className={styles.rowIconBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToast('Download');
                      }}
                    >
                      <span
                        className={`material-symbols-outlined ${styles.icon16Muted}`}
                      >
                        download
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CapEquityEventsView({
  onCapCreate,
  onOpenPeek,
  onToast,
}: {
  onCapCreate: (label: string) => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Equity Events</h1>
          <p className={styles.subtitle}>
            Immutable ledger — grants, exercises, conversions, issuances,
            cancellations.
          </p>
        </div>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={() => onCapCreate('Equity event')}
        >
          <span className={`material-symbols-outlined ${styles.icon16}`}>
            post_add
          </span>
          Record event
        </button>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Date</th>
                <th className={styles.th}>Event</th>
                <th className={styles.th}>Holder</th>
                <th className={styles.thRight}>Shares</th>
                <th className={styles.thRight}>Price</th>
                <th className={styles.th}>Delta</th>
                <th className={styles.th}>Note</th>
                <th className={styles.th} />
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {CAP.events.map((e) => (
                <tr
                  key={`${e.date}-${e.event}`}
                  className={styles.trClick}
                  onClick={() => onOpenPeek(toDemoRow(e), 'cap')}
                >
                  <td className={styles.td}>{e.date}</td>
                  <td className={styles.tdMedium}>{e.event}</td>
                  <td className={styles.td}>{e.holder}</td>
                  <td className={styles.tdRight}>{e.shares}</td>
                  <td className={styles.tdRight}>{e.price}</td>
                  <td
                    className={
                      e.delta.startsWith('+')
                        ? styles.tdDeltaPos
                        : styles.tdDeltaNeutral
                    }
                  >
                    {e.delta}
                  </td>
                  <td className={styles.tdSmallMuted}>{e.note}</td>
                  <td className={styles.tdAction}>
                    <button
                      type="button"
                      className={styles.rowIconBtn}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onToast('Row actions');
                      }}
                    >
                      <span
                        className={`material-symbols-outlined ${styles.icon16Muted}`}
                      >
                        more_horiz
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export const CAP_TABLE_SCREEN_IDS = new Set([
  'cap-overview',
  'cap-table',
  'cap-holders',
  'cap-rounds',
  'cap-options',
  'cap-safes',
  'cap-dilution',
  'cap-waterfall',
  'cap-409a',
  'cap-controls',
  'cap-documents',
  'cap-equity-events',
]);

function CapControlsView({
  onToast,
}: {
  onToast: (msg: string) => void;
}) {
  const [secondAdmin, setSecondAdmin] = useState<boolean>(true);

  const PERMS: {
    role: string;
    view: string;
    holders: string;
    edit: string;
    approve: string;
  }[] = [
    { role: 'Admin', view: 'Full table', holders: 'Full details', edit: 'Yes', approve: 'Yes' },
    { role: 'Board Member', view: 'Read-only summary', holders: '—', edit: '—', approve: '—' },
    { role: 'Accountant', view: 'Totals only', holders: '—', edit: '—', approve: '—' },
    { role: 'Employee (holder)', view: 'Own grants', holders: 'Own record', edit: '—', approve: '—' },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.headerFlex}>
        <div>
          <div className={styles.breadcrumb}>
            <span>Cap Table</span>
          </div>
          <h1 className={styles.title}>Controls</h1>
          <p className={styles.subtitle}>
            Who can view or edit — grants, exercises, transfers, and repurchases all
            post through the equity event ledger.
          </p>
        </div>
        <button
          type="button"
          className={styles.btnOutline}
          onClick={() => onToast('Permissions are managed in Settings → Roles and permissions')}
        >
          <span className={`material-symbols-outlined ${styles.icon16}`}>shield_person</span>
          Open roles
        </button>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th className={styles.th}>Role</th>
                <th className={styles.th}>View cap table</th>
                <th className={styles.th}>Holder details</th>
                <th className={styles.th}>Edit records</th>
                <th className={styles.th}>Approve changes</th>
              </tr>
            </thead>
            <tbody className={styles.tbody}>
              {PERMS.map((p) => (
                <tr key={p.role}>
                  <td className={styles.tdMedium}>{p.role}</td>
                  <td className={styles.td}>{p.view}</td>
                  <td className={styles.td}>{p.holders}</td>
                  <td className={styles.td}>{p.edit}</td>
                  <td className={styles.td}>{p.approve}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.panelCard}>
          <div className={styles.cardTitleMb2}>Changes need a second admin</div>
          <p className={styles.cardMeta11}>
            When enforced, every change to the table — grants, exercises, transfers,
            repurchases — needs approval from a second admin before it posts.
          </p>
          <button
            type="button"
            className={`${styles.createActionChip} ${secondAdmin ? '' : styles.createActionChipOff}`}
            data-second-admin={secondAdmin ? 'on' : 'off'}
            aria-pressed={secondAdmin}
            onClick={() => {
              const next = !secondAdmin;
              setSecondAdmin(next);
              onToast(
                next
                  ? 'Second-admin approval enforced for all cap table changes'
                  : 'Warning: cap table changes now post without a second admin'
              );
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {secondAdmin ? 'toggle_on' : 'toggle_off'}
            </span>
            {secondAdmin ? 'Enforced' : 'Off'}
          </button>
        </div>
        <div className={styles.panelCard}>
          <div className={styles.cardTitleMb2}>Audit</div>
          <p className={styles.cardMeta11}>
            Every view of sensitive holder fields and every create, edit, void,
            approve, and export is logged with actor, time, and before/after values.
          </p>
          <button
            type="button"
            className={styles.createActionChip}
            onClick={() => onToast('Opening audit log — cap table scope')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              history
            </span>
            View audit log
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CapTableScreenRenderer({
  screenId,
  onGotoScreen,
  onCapCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
}: CapTableScreenRendererProps) {
  switch (screenId) {
    case 'cap-overview':
      return (
        <CapOverviewView
          onGotoScreen={onGotoScreen}
          onCapCreate={onCapCreate}
          onOpenCreateFlyout={onOpenCreateFlyout}
          onToast={onToast}
        />
      );
    case 'cap-table':
      return <CapTableMainView onOpenPeek={onOpenPeek} onToast={onToast} />;
    case 'cap-holders':
      return (
        <CapHoldersView
          onCapCreate={onCapCreate}
          onOpenPeek={onOpenPeek}
          onToast={onToast}
        />
      );
    case 'cap-rounds':
      return <CapRoundsView onCapCreate={onCapCreate} />;
    case 'cap-options':
      return (
        <CapOptionsView
          onCapCreate={onCapCreate}
          onOpenPeek={onOpenPeek}
          onToast={onToast}
        />
      );
    case 'cap-safes':
      return (
        <CapSafesView
          onCapCreate={onCapCreate}
          onOpenPeek={onOpenPeek}
          onToast={onToast}
        />
      );
    case 'cap-dilution':
      return <CapDilutionView onToast={onToast} />;
    case 'cap-waterfall':
      return <CapWaterfallView onToast={onToast} />;
    case 'cap-409a':
      return (
        <CapValuationsView
          onCapCreate={onCapCreate}
          onOpenPeek={onOpenPeek}
          onToast={onToast}
        />
      );
    case 'cap-controls':
      return <CapControlsView onToast={onToast} />;
    case 'cap-documents':
      return (
        <CapDocumentsView
          onCapCreate={onCapCreate}
          onOpenPeek={onOpenPeek}
          onToast={onToast}
        />
      );
    case 'cap-equity-events':
      return (
        <CapEquityEventsView
          onCapCreate={onCapCreate}
          onOpenPeek={onOpenPeek}
          onToast={onToast}
        />
      );
    default:
      return null;
  }
}
