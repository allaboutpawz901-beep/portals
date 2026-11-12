'use client';
/* AdSpendScreen — 1:1 port of upload/marketing_extracted/Marketing/ad spend.html
   The HTML's <style> block lives in src/app/marketing.css (global classes).
   The HTML's <body> is ported to JSX below; class names are identical.
   The HTML's <script> is ported to React state + handlers below. */
import { useMemo, useState } from 'react';
import { exportToCsv } from '@/lib/csvExport';

interface MarketingScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

/* ─── data (verbatim from HTML <script>) ─── */
const NETWORKS = ['Meta', 'TikTok', 'Google', 'Pinterest'] as const;
type Network = (typeof NETWORKS)[number];

interface Advertiser {
  id: string;
  name: string;
  billing: string;
  gate: string;
  spend: Record<Network, number>;
  mapped: Record<Network, string>;
}

const ADVERTISERS: Advertiser[] = [
  { id: 'ADV-1001', name: 'Unsaid Company Inc.', billing: 'Visa •4421', gate: 'Ready',
    spend: { Meta: 4410, TikTok: 0, Google: 0, Pinterest: 0 }, mapped: { Meta: '6100', TikTok: '6101', Google: '6102', Pinterest: '6103' } },
  { id: 'ADV-1002', name: 'Orion Apparel LLC', billing: 'Mastercard •8801', gate: 'Ready',
    spend: { Meta: 4210, TikTok: 0, Google: 0, Pinterest: 2000 }, mapped: { Meta: '6100', TikTok: '6101', Google: '6102', Pinterest: '6103' } },
  { id: 'ADV-1003', name: 'Blue Ridge Co.', billing: 'Visa •4421', gate: 'Ready',
    spend: { Meta: 890, TikTok: 0, Google: 0, Pinterest: 0 }, mapped: { Meta: '6100', TikTok: '6101', Google: '6102', Pinterest: '6103' } },
  { id: 'ADV-1004', name: 'Maple Supply Inc.', billing: '—', gate: 'Billing on hold',
    spend: { Meta: 0, TikTok: 0, Google: 3120, Pinterest: 0 }, mapped: { Meta: '6100', TikTok: '6101', Google: '', Pinterest: '6103' } },
  { id: 'ADV-1005', name: 'Northwind Labs LLC', billing: 'Chase ACH •9910', gate: 'Ready',
    spend: { Meta: 7500, TikTok: 0, Google: 2340, Pinterest: 0 }, mapped: { Meta: '6100', TikTok: '6101', Google: '6102', Pinterest: '6103' } },
  { id: 'ADV-1006', name: 'Acme Corp', billing: '—', gate: 'Verification pending',
    spend: { Meta: 0, TikTok: 0, Google: 0, Pinterest: 0 }, mapped: { Meta: '', TikTok: '', Google: '', Pinterest: '' } },
];

interface JournalEntry {
  id: string;
  date: string;
  amount: number;
  account: string;
  memo: string;
  status: string;
}

const JOURNALS: Record<string, JournalEntry[]> = {
  'ADV-1001': [{ id: 'JE-7031', date: '2026-10-31', amount: 4410, account: '6100', memo: 'Meta Ads — Fall launch · Oct 2026', status: 'Posted' }],
  'ADV-1002': [
    { id: 'JE-7032', date: '2026-10-31', amount: 4210, account: '6100', memo: 'Meta Ads — Orion prospecting · Oct 2026', status: 'Posted' },
    { id: 'JE-7033', date: '2026-10-31', amount: 2000, account: '6103', memo: 'Pinterest Ads — Orion inspo · Oct 2026', status: 'Posted' },
  ],
  'ADV-1003': [{ id: 'JE-7034', date: '2026-10-31', amount: 890, account: '6100', memo: 'Meta Ads — Blue Ridge test · Oct 2026', status: 'Posted' }],
  'ADV-1004': [{ id: 'JE-7035', date: '2026-10-31', amount: 3120, account: '', memo: 'Google Ads — Maple search · Oct 2026', status: 'Unmapped' }],
  'ADV-1005': [
    { id: 'JE-7036', date: '2026-10-31', amount: 7500, account: '6100', memo: 'Meta Ads — Northwind lookalike · Oct 2026', status: 'Posted' },
    { id: 'JE-7037', date: '2026-10-31', amount: 2340, account: '6102', memo: 'Google Ads — Brand search · Oct 2026', status: 'Posted' },
  ],
  'ADV-1006': [],
};

interface ReconRow {
  account: string;
  name: string;
  debits: number;
  ledger: number;
  state: string;
  lastLocked: string;
}

const RECON: ReconRow[] = [
  { account: '6100', name: 'Advertising Expense — Meta', debits: 17010, ledger: 17010, state: 'Open', lastLocked: '2026-10-31' },
  { account: '6101', name: 'Advertising Expense — TikTok', debits: 0, ledger: 0, state: 'Not started', lastLocked: '—' },
  { account: '6102', name: 'Advertising Expense — Google', debits: 5460, ledger: 5460, state: 'Open', lastLocked: '—' },
  { account: '6103', name: 'Advertising Expense — Pinterest', debits: 2000, ledger: 2000, state: 'Open', lastLocked: '—' },
];

interface FinanceRouteMeta {
  title: string;
  body: string;
  route: string;
  nav: [string, string] | null;
}

const FINANCE_ROUTES: Record<string, FinanceRouteMeta> = {
  'chart-of-accounts': { title: 'Finance → Chart of accounts', body: 'The shared CoA that every ad spend mapping writes to. Editing accounts here affects future journal entries.', route: '/finance/accounting/chart-of-accounts', nav: ['finance', 'chart-of-accounts'] },
  'reconcile': { title: 'Finance → Reconcile', body: 'The reconcile workspace for the Advertising Expense accounts this period.', route: '/finance/accounting/reconcile', nav: ['finance', 'reconcile'] },
  'reports': { title: 'Finance → Reports', body: 'The Advertising Expense category in Financial reports.', route: '/finance/reports?category=advertising', nav: ['finance', 'reports'] },
  'document-engine': { title: 'Finance → Journal entry', body: 'The Finance document engine opened to the selected journal entry.', route: '/finance/journal/{id}', nav: ['finance', 'journal'] },
  'billing-profiles': { title: 'Finance → Billing profiles', body: 'Billing profiles are created and managed in Finance, not on the Ad spend bridge.', route: '/finance/configuration/billing-profiles', nav: ['finance', 'billing-profiles'] },
  'advertiser-verification': { title: 'Advertising → Advertisers', body: 'Verification lives with the advertiser record; this bridge only surfaces the block.', route: '/advertising/advertisers?filter=unverified', nav: ['advertising', 'advertisers'] },
  'advertising-advertisers': { title: 'Advertising → Advertisers', body: 'Open in Advertisers page.', route: '/advertising/advertisers', nav: ['advertising', 'advertisers'] },
  'advertising-campaigns': { title: 'Advertising → Campaigns', body: 'Open in Campaigns page.', route: '/advertising/campaigns', nav: ['advertising', 'campaigns'] },
};

interface PeriodState {
  year: number;
  month: number;
  label: string;
  lastPosted: string;
}

const PERIOD_INITIAL: PeriodState = { year: 2026, month: 10, label: 'October 2026', lastPosted: '2026-11-01' };

/* ─── helpers (from HTML <script>) ─── */
function fmtMoney(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function netChip(n: string) {
  return <span className={`net-chip net-${n}`}>{n}</span>;
}
function pill(kind: string, text: string) {
  return <span className={`pill ${kind}`}>{text}</span>;
}
function advertiserSpend(a: Advertiser) {
  return Object.values(a.spend).reduce((s, v) => s + v, 0);
}
function advertiserMapped(a: Advertiser) {
  let mapped = 0;
  (Object.entries(a.spend) as [Network, number][]).forEach(([net, amt]) => {
    if (amt > 0 && a.mapped[net]) mapped += amt;
  });
  return mapped;
}
function advertiserUnmapped(a: Advertiser) {
  return advertiserSpend(a) - advertiserMapped(a);
}

interface MapTarget {
  advertiserId: string;
  network: Network;
}
interface FinanceModalState {
  title: string;
  body: string;
  route: string;
  nav: [string, string] | null;
}

export default function AdSpendScreen({ onToast, onNavigate }: MarketingScreenProps) {
  /* ─── state ─── */
  const [advertisers, setAdvertisers] = useState<Advertiser[]>(ADVERTISERS);
  const [period, setPeriod] = useState<PeriodState>(PERIOD_INITIAL);

  // CoA mapping drawer
  const [mapTarget, setMapTarget] = useState<MapTarget | null>(null);
  const [mapAccount, setMapAccount] = useState('');
  const [mapCostCenter, setMapCostCenter] = useState('');
  const [mapTaxLine, setMapTaxLine] = useState('');

  // Journal entry drawer
  const [journalAdvertiserId, setJournalAdvertiserId] = useState<string | null>(null);

  // Row ⋯ menu
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);

  // Finance destination modal
  const [financeModal, setFinanceModal] = useState<FinanceModalState | null>(null);

  /* ─── derived (mirrors renderSpend / renderMapping / renderExceptions) ─── */
  const totalSpend = useMemo(() => advertisers.reduce((s, a) => s + advertiserSpend(a), 0), [advertisers]);
  const totalMapped = useMemo(() => advertisers.reduce((s, a) => s + advertiserMapped(a), 0), [advertisers]);
  const totalUnmapped = totalSpend - totalMapped;
  const mappedPct = totalSpend ? Math.round(totalMapped / totalSpend * 100) : 0;

  const lockedRecon = useMemo(() => RECON.filter(r => r.state === 'Locked'), []);
  const statReconciled = lockedRecon.length ? lockedRecon.map(r => r.account).join(', ') : 'Open';
  const statReconciledNote = lockedRecon.length
    ? `Locked accounts: ${lockedRecon.length}`
    : 'No accounts locked for this period';

  // Section 2 — CoA mapping rows
  const mappedRows = useMemo(() => {
    const out: { advertiser: string; advertiserId: string; network: Network; amount: number; account: string }[] = [];
    advertisers.forEach(a => {
      (Object.entries(a.spend) as [Network, number][]).forEach(([net, amt]) => {
        if (amt <= 0) return;
        const acct = a.mapped[net];
        if (acct) out.push({ advertiser: a.name, advertiserId: a.id, network: net, amount: amt, account: acct });
      });
    });
    return out;
  }, [advertisers]);

  const unmappedRows = useMemo(() => {
    const out: { advertiser: string; advertiserId: string; network: Network; amount: number; account: string }[] = [];
    advertisers.forEach(a => {
      (Object.entries(a.spend) as [Network, number][]).forEach(([net, amt]) => {
        if (amt <= 0) return;
        const acct = a.mapped[net];
        if (!acct) out.push({ advertiser: a.name, advertiserId: a.id, network: net, amount: amt, account: '' });
      });
    });
    return out;
  }, [advertisers]);

  // Section 4 — exceptions
  interface ExceptionItem { kind: string; title: string; desc: string; route: string; action: string; advId: string }
  const exceptions = useMemo<ExceptionItem[]>(() => {
    const list: ExceptionItem[] = [];
    advertisers.forEach(a => {
      const unmapped = advertiserUnmapped(a);
      if (unmapped > 0) {
        list.push({
          kind: 'Unmapped spend',
          title: a.name + ' — ' + fmtMoney(unmapped),
          desc: 'Some spend has no Chart of Accounts mapping. It cannot post to Finance until mapped.',
          route: 'chart-of-accounts',
          action: 'Map accounts',
          advId: a.id,
        });
      }
      if (a.gate === 'Billing on hold') {
        list.push({
          kind: 'Billing on hold',
          title: a.name,
          desc: 'Billing profile is missing or on hold. Spend cannot be charged.',
          route: 'billing-profiles',
          action: 'Open billing profile',
          advId: a.id,
        });
      }
      if (a.gate === 'Verification pending') {
        list.push({
          kind: 'Verification pending',
          title: a.name,
          desc: 'Advertiser is unverified. Spend is blocked until verification is complete.',
          route: 'advertiser-verification',
          action: 'Open advertiser',
          advId: a.id,
        });
      }
    });
    return list;
  }, [advertisers]);

  /* ─── handlers ─── */
  function openMapDrawer(advertiserId: string, network: Network) {
    const a = advertisers.find(x => x.id === advertiserId);
    if (!a) return;
    setMapTarget({ advertiserId, network });
    setMapAccount(a.mapped[network] || '');
    setMapCostCenter('');
    setMapTaxLine('');
    setRowMenuForId(null);
  }
  function closeMapDrawer() {
    setMapTarget(null);
  }
  function saveMapDrawer() {
    if (!mapTarget) return;
    if (!mapAccount) { onToast('Choose an account before saving'); return; }
    const target = mapTarget;
    const acct = mapAccount;
    setAdvertisers(prev => prev.map(a => a.id === target.advertiserId
      ? { ...a, mapped: { ...a.mapped, [target.network]: acct } }
      : a));
    onToast('Mapping saved — future entries will post to account ' + acct);
    closeMapDrawer();
  }

  function openJournal(advertiserId: string) {
    setJournalAdvertiserId(advertiserId);
    setRowMenuForId(null);
  }
  function closeJournal() { setJournalAdvertiserId(null); }

  function openFinance(key: string, fallbackBody?: string) {
    const meta = FINANCE_ROUTES[key]
      || { title: 'Open destination', body: fallbackBody || '', route: '/' + key, nav: null as [string, string] | null };
    setFinanceModal({ title: meta.title, body: meta.body, route: meta.route, nav: meta.nav });
  }
  function closeFinanceModal() { setFinanceModal(null); }
  function confirmFinance() {
    if (!financeModal) return;
    const { route, nav } = financeModal;
    setFinanceModal(null);
    if (nav && onNavigate) onNavigate(nav[0], nav[1]);
    onToast('Navigating: ' + route);
  }

  function rowAction(act: string, a: Advertiser) {
    setRowMenuForId(null);
    if (act === 'map-all') {
      const entry = (Object.entries(a.spend) as [Network, number][]).find(([n, v]) => v > 0 && !a.mapped[n]);
      if (entry) openMapDrawer(a.id, entry[0]);
      else onToast('All spend already mapped');
    } else if (act === 'view-journal') {
      openJournal(a.id);
    } else if (act === 'open-advertiser') {
      openFinance('advertising-advertisers', 'Open in Advertisers page.');
    } else if (act === 'open-campaigns') {
      openFinance('advertising-campaigns', 'Open in Campaigns page.');
    } else if (act === 'reconcile') {
      openFinance('reconcile', 'Open in Reconcile.');
    }
  }

  function exceptionAction(route: string, advId: string) {
    if (route === 'chart-of-accounts') {
      const a = advertisers.find(x => x.id === advId);
      if (!a) return;
      const entry = (Object.entries(a.spend) as [Network, number][]).find(([n, v]) => v > 0 && !a.mapped[n]);
      if (entry) openMapDrawer(advId, entry[0]);
      else onToast('All spend already mapped');
    } else {
      openFinance(route, 'Billing profiles / Verification are managed in Finance.');
    }
  }

  function periodPrev() {
    setPeriod(p => {
      let m = p.month - 1, y = p.year;
      if (m < 1) { m = 12; y -= 1; }
      const label = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
      onToast('Period changed: ' + label);
      return { ...p, month: m, year: y, label };
    });
  }
  function periodNext() {
    setPeriod(p => {
      let m = p.month + 1, y = p.year;
      if (m > 12) { m = 1; y += 1; }
      const label = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
      onToast('Period changed: ' + label);
      return { ...p, month: m, year: y, label };
    });
  }

  function handleExport() {
    const rows = advertisers.map(a => {
      const spend = advertiserSpend(a);
      const mapped = advertiserMapped(a);
      return {
        advertiserId: a.id,
        advertiser: a.name,
        billing: a.billing,
        gate: a.gate,
        spend,
        mapped,
        unmapped: spend - mapped,
        journals: (JOURNALS[a.id] || []).length,
      };
    });
    exportToCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'advertiserId', label: 'Advertiser ID' },
      { key: 'advertiser', label: 'Advertiser' },
      { key: 'billing', label: 'Billing' },
      { key: 'gate', label: 'Billing gate' },
      { key: 'spend', label: 'Spend' },
      { key: 'mapped', label: 'Mapped' },
      { key: 'unmapped', label: 'Unmapped' },
      { key: 'journals', label: 'Journal entries' },
    ], 'ad-spend-' + period.label.toLowerCase().replace(/\s+/g, '-'));
    onToast(`Exported ad spend bridge for ${period.label}`);
  }

  const mapTargetAdvertiser = mapTarget ? advertisers.find(a => a.id === mapTarget.advertiserId) : null;
  const journalAdvertiser = journalAdvertiserId ? advertisers.find(a => a.id === journalAdvertiserId) : null;
  const journalEntries = journalAdvertiserId ? (JOURNALS[journalAdvertiserId] || []) : [];
  const rowMenuAdvertiser = rowMenuForId ? advertisers.find(a => a.id === rowMenuForId) : null;

  return (
    <main className="px-6 pb-12">

      {/* ─── BREADCRUMB ─── */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Advertising</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Ad spend &amp; Finance bridge</span>
      </div>

      {/* ─── PAGE HEADER ─── */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Ad spend &amp; Finance bridge</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Every dollar of ad spend, mapped to a Chart of Accounts entry, reconciled against the Finance ledger.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="fin-link h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => openFinance('chart-of-accounts')}>
            <span className="material-symbols-outlined text-[16px]">account_tree</span>Open Chart of accounts
          </button>
          <button className="fin-link h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => openFinance('reconcile')}>
            <span className="material-symbols-outlined text-[16px]">fact_check</span>Open Reconcile
          </button>
          <button className="fin-link h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => openFinance('reports')}>
            <span className="material-symbols-outlined text-[16px]">bar_chart</span>View in Reports
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export spend
          </button>
        </div>
      </div>

      {/* ─── PERIOD STRIP ─── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1">
          <button className="h-8 px-3 border border-surface-dim rounded-l text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={periodPrev}><span className="material-symbols-outlined text-[16px]">chevron_left</span></button>
          <div className="h-8 px-3 border-y border-surface-dim flex items-center text-body-md font-semibold">{period.label}</div>
          <button className="h-8 px-3 border border-surface-dim rounded-r text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={periodNext}><span className="material-symbols-outlined text-[16px]">chevron_right</span></button>
        </div>
        <span className="text-[11px] text-on-surface-variant">·</span>
        <span className={`pill ${totalUnmapped > 0 ? 'bad' : 'info'}`}><span className="material-symbols-outlined text-[12px]">sync</span>Reconcile: {totalUnmapped > 0 ? 'Blocked' : 'Open'}</span>
        <button className="fin-link" onClick={() => openFinance('reconcile')}><span className="material-symbols-outlined">open_in_new</span>View in Reconcile</button>
        <span className="ml-auto text-[11px] text-on-surface-variant">Last posted to Finance: {period.lastPosted} · period {period.year}-{String(period.month).padStart(2, '0')}</span>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Spend this period</div>
          <div className="text-headline-sm mt-1 tabular-nums">{fmtMoney(totalSpend)}</div>
          <div className="kpi-note"><span className="material-symbols-outlined">verified</span>Matches Campaigns page total</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Mapped to CoA</div>
          <div className="text-headline-sm mt-1 tabular-nums">{mappedPct}%</div>
          <div className="kpi-note">{fmtMoney(totalMapped)} of {fmtMoney(totalSpend)}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Unmapped exceptions</div>
          <div className="text-headline-sm mt-1 tabular-nums">{totalUnmapped > 0 ? fmtMoney(totalUnmapped) : '—'}</div>
          <div className="kpi-note"><span className="material-symbols-outlined">error</span>Block period close</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Reconciled through</div>
          <div className="text-headline-sm mt-1 tabular-nums">{statReconciled}</div>
          <div className="kpi-note">{statReconciledNote}</div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
           SECTION 1 — AD SPEND BY ADVERTISER (single source of truth)
           ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-white rounded-xl border border-surface-dim mb-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
          <div>
            <h2 className="text-headline-sm">Ad spend by advertiser</h2>
            <div className="text-[11px] text-on-surface-variant">Source: Campaigns &amp; Ad sets · read-only here — spending is managed in Advertising</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="fin-link" onClick={() => openFinance('advertising-campaigns', 'Open in Advertising → campaigns')}><span className="material-symbols-outlined">open_in_new</span>Open Campaigns</button>
            <button className="fin-link" onClick={() => openFinance('advertising-advertisers', 'Open in Advertising → advertisers')}><span className="material-symbols-outlined">open_in_new</span>Open Advertisers</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Advertiser</th>
                <th className="px-3 py-2">Billing gate</th>
                <th className="px-3 py-2">Networks</th>
                <th className="px-3 py-2 text-right">Spend</th>
                <th className="px-3 py-2 text-right">Mapped</th>
                <th className="px-3 py-2">Journal</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {advertisers.map(a => {
                const spend = advertiserSpend(a);
                const mapped = advertiserMapped(a);
                const unmapped = spend - mapped;
                const activeNets = (Object.entries(a.spend) as [Network, number][]).filter(([, v]) => v > 0).map(([n]) => n);
                const gateClass = a.gate === 'Ready' ? 'ok' : a.gate === 'Verification pending' ? 'warn' : 'bad';
                const journal = JOURNALS[a.id] || [];
                return (
                  <tr key={a.id} className="hover:bg-surface-container-low">
                    <td className="px-3 py-2">
                      <div className="font-medium">{a.name}</div>
                      <div className="text-[11px] text-on-surface-variant code-mono">{a.id} · {a.billing}</div>
                    </td>
                    <td className="px-3 py-2">{pill(gateClass, a.gate)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {activeNets.length
                          ? activeNets.map(n => <span key={n}>{netChip(n)}</span>)
                          : <span className="text-[11px] text-on-surface-variant">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(spend)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${unmapped > 0 ? 'text-error font-semibold' : 'text-secondary'}`}>
                      {fmtMoney(mapped)}
                      {unmapped > 0 && <div className="text-[10px] font-normal">{fmtMoney(unmapped)} unmapped</div>}
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      {journal.length
                        ? (
                          <button className="fin-link" onClick={() => openJournal(a.id)}>
                            <span className="material-symbols-outlined">receipt_long</span>{journal.length} journal{journal.length === 1 ? '' : 's'}
                          </button>
                        )
                        : <span className="text-on-surface-variant">—</span>}
                    </td>
                    <td className="px-2 py-2 text-right relative">
                      <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === a.id ? null : a.id); }}>
                        <span className="material-symbols-outlined text-[16px]">more_horiz</span>
                      </button>
                      {rowMenuForId === a.id && rowMenuAdvertiser && (
                        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                          <div className="menu-header">{rowMenuAdvertiser.name}</div>
                          <button onClick={() => rowAction('map-all', rowMenuAdvertiser)}><span className="material-symbols-outlined">account_tree</span>Map unmapped spend</button>
                          <button onClick={() => rowAction('view-journal', rowMenuAdvertiser)}><span className="material-symbols-outlined">receipt_long</span>View journal entries</button>
                          <div className="sep"></div>
                          <button onClick={() => rowAction('open-advertiser', rowMenuAdvertiser)}><span className="material-symbols-outlined">open_in_new</span>Open in Advertisers</button>
                          <button onClick={() => rowAction('open-campaigns', rowMenuAdvertiser)}><span className="material-symbols-outlined">open_in_new</span>Open in Campaigns</button>
                          <div className="sep"></div>
                          <button onClick={() => rowAction('reconcile', rowMenuAdvertiser)}><span className="material-symbols-outlined">fact_check</span>Open in Reconcile</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface-container-low font-semibold text-body-sm">
              <tr>
                <td className="px-3 py-2" colSpan={3}>Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totalSpend)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totalMapped)}</td>
                <td className="px-3 py-2" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           SECTION 2 — COA MAPPING
           ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-white rounded-xl border border-surface-dim mb-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
          <div>
            <h2 className="text-headline-sm">Chart of Accounts mapping</h2>
            <div className="text-[11px] text-on-surface-variant">Each advertiser × network posts to an Advertising Expense account in Finance.</div>
          </div>
          <button className="fin-link" onClick={() => openFinance('chart-of-accounts')}><span className="material-symbols-outlined">open_in_new</span>Open Chart of accounts</button>
        </div>
        <div className="p-5">
          <div className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold mb-2">Mapped</div>
          <div className="mb-4">
            {mappedRows.length
              ? mappedRows.map((r, i) => (
                <div key={`${r.advertiserId}::${r.network}::${i}`} className="cpa-row">
                  <div>
                    <div className="label font-medium">{r.advertiser}</div>
                    <div className="text-[11px] text-on-surface-variant">{r.advertiserId}</div>
                  </div>
                  <div><div className="flex items-center gap-1">{netChip(r.network)}</div></div>
                  <div>
                    <div className="account">{r.account}</div>
                    <div className="account-id">Advertising Expense — {r.network}</div>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="tabular-nums text-body-sm">{fmtMoney(r.amount)}</span>
                    <button className="h-6 px-2 border border-surface-dim rounded text-[11px] hover:bg-surface-container-low" onClick={() => openMapDrawer(r.advertiserId, r.network)}>Change</button>
                  </div>
                </div>
              ))
              : <div className="text-[11px] text-on-surface-variant py-2">No mappings yet.</div>}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-on-surface-variant font-bold mb-2">Unmapped — needs an account</div>
          <div>
            {unmappedRows.length
              ? unmappedRows.map((r, i) => (
                <div key={`${r.advertiserId}::${r.network}::${i}`} className="cpa-row">
                  <div>
                    <div className="label font-medium">{r.advertiser}</div>
                    <div className="text-[11px] text-on-surface-variant">{r.advertiserId}</div>
                  </div>
                  <div><div className="flex items-center gap-1">{netChip(r.network)}</div></div>
                  <div><div className="account-id">— no account mapped —</div></div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="tabular-nums text-body-sm text-error font-semibold">{fmtMoney(r.amount)}</span>
                    <button className="h-6 px-2 bg-primary text-white rounded text-[11px] font-semibold hover:bg-primary-container" onClick={() => openMapDrawer(r.advertiserId, r.network)}>Map</button>
                  </div>
                </div>
              ))
              : <div className="text-[11px] text-secondary py-2">All spend is mapped. ✓</div>}
          </div>
          <div className="mt-4 p-3 border border-outline-variant bg-surface-container-low rounded text-[10px] text-on-surface-variant flex items-start gap-2">
            <span className="material-symbols-outlined text-[14px] text-primary">info</span>
            <div>Mapping is written to the same CoA used by Finance. Changing the account here changes where future journal entries post — not past periods.</div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           SECTION 3 — RECONCILIATION STATE
           ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-white rounded-xl border border-surface-dim mb-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
          <div>
            <h2 className="text-headline-sm">Reconciliation state</h2>
            <div className="text-[11px] text-on-surface-variant">Read from Finance · 1 row per CoA account this period</div>
          </div>
          <button className="fin-link" onClick={() => openFinance('reconcile')}><span className="material-symbols-outlined">open_in_new</span>Open Reconcile</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2 text-right">Debits</th>
                <th className="px-3 py-2 text-right">Ledger balance</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Last locked</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {RECON.map(r => {
                const stateClass = r.state === 'Locked' ? 'ok' : r.state === 'Open' ? 'info' : 'neutral';
                return (
                  <tr key={r.account} className="hover:bg-surface-container-low">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.account} · {r.name}</div>
                    </td>
                    <td className="px-3 py-2 text-[11px]">{period.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.debits)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.ledger)}</td>
                    <td className="px-3 py-2">{pill(stateClass, r.state)}</td>
                    <td className="px-3 py-2 text-[11px]">{r.lastLocked}</td>
                    <td className="px-2 py-2 text-right relative">
                      <button className="fin-link" onClick={() => openFinance('reconcile')}><span className="material-symbols-outlined">open_in_new</span>Open</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
           SECTION 4 — EXCEPTIONS
           ═══════════════════════════════════════════════════════════════ */}
      <section className="bg-white rounded-xl border border-surface-dim">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
          <div>
            <h2 className="text-headline-sm">Exceptions blocking close</h2>
            <div className="text-[11px] text-on-surface-variant">Anything that stops this period from reconciling in Finance.</div>
          </div>
          <span className="pill warn">{exceptions.length} exception{exceptions.length === 1 ? '' : 's'}</span>
        </div>
        <div className="p-5 space-y-2">
          {exceptions.length
            ? exceptions.map((x, i) => (
              <div key={i} className={`exception-row ${x.kind === 'Unmapped spend' ? '' : 'warn'}`}>
                <div className="exception-icon"><span className="material-symbols-outlined text-[14px]">{x.kind === 'Unmapped spend' ? 'error' : 'warning'}</span></div>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-semibold">{x.kind} — {x.title}</div>
                  <div className="text-[11px] text-on-surface-variant">{x.desc}</div>
                </div>
                <button className="fin-link" onClick={() => exceptionAction(x.route, x.advId)}><span className="material-symbols-outlined">open_in_new</span>{x.action}</button>
              </div>
            ))
            : (
              <div className="py-3 text-body-sm text-secondary flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">check_circle</span>No exceptions. Period can reconcile.</div>
            )}
        </div>
      </section>

      {/* Click-away catcher for row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* ═══════════════════════════════════════════════════════════════════
           OVERLAYS
           ═══════════════════════════════════════════════════════════════════ */}

      {/* CoA mapping drawer */}
      {mapTarget && mapTargetAdvertiser && (
        <>
          <div className="drawer-scrim open" onClick={closeMapDrawer} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">account_tree</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">Map to Chart of Accounts</div>
                  <div className="text-[11px] text-on-surface-variant">{mapTargetAdvertiser.name} · {mapTarget.network}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeMapDrawer}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="p-3 rounded-lg border border-outline-variant bg-surface-container-low text-body-sm">
                <div className="flex justify-between mb-1"><span className="text-on-surface-variant">Advertiser</span><span className="font-semibold">{mapTargetAdvertiser.name}</span></div>
                <div className="flex justify-between"><span className="text-on-surface-variant">Network</span><span className="font-semibold">{netChip(mapTarget.network)}</span></div>
              </div>
              <div>
                <label className="field-label">Advertising expense account</label>
                <select className="field-input" value={mapAccount} onChange={e => setMapAccount(e.target.value)}>
                  <option value="">— Select an account —</option>
                  <option value="6100">6100 · Advertising Expense — Meta</option>
                  <option value="6101">6101 · Advertising Expense — TikTok</option>
                  <option value="6102">6102 · Advertising Expense — Google</option>
                  <option value="6103">6103 · Advertising Expense — Pinterest</option>
                  <option value="6104">6104 · Advertising Expense — Other</option>
                </select>
                <div className="text-[10px] text-on-surface-variant mt-1">Pulled live from Finance → Chart of accounts.</div>
              </div>
              <div>
                <label className="field-label">Cost center</label>
                <select className="field-input" value={mapCostCenter} onChange={e => setMapCostCenter(e.target.value)}>
                  <option value="">— None —</option>
                  <option>Marketing — Paid</option>
                  <option>Marketing — Brand</option>
                  <option>Growth — Acquisition</option>
                </select>
              </div>
              <div>
                <label className="field-label">Tax line</label>
                <select className="field-input" value={mapTaxLine} onChange={e => setMapTaxLine(e.target.value)}>
                  <option value="">— None —</option>
                  <option>Advertising — Schedule C line 8</option>
                  <option>Advertising — Schedule C line 8 · Q4</option>
                </select>
              </div>
              <div className="p-3 rounded-lg border border-outline-variant bg-surface-container-low text-[10px] text-on-surface-variant flex items-start gap-2">
                <span className="material-symbols-outlined text-[14px] text-primary">info</span>
                <div>Saving writes to the shared CoA mapping. It affects future journal entries only — past periods keep their posted accounts.</div>
              </div>
              <div className="pt-2 border-t border-surface-dim">
                <button className="fin-link" onClick={() => openFinance('chart-of-accounts')}><span className="material-symbols-outlined">open_in_new</span>Open Chart of accounts in Finance</button>
              </div>
            </div>
            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeMapDrawer}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={saveMapDrawer}>Save mapping</button>
            </div>
          </div>
        </>
      )}

      {/* Journal entry drawer */}
      {journalAdvertiser && (
        <>
          <div className="drawer-scrim open" onClick={closeJournal} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">receipt_long</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">Journal entries — {journalAdvertiser.name}</div>
                  <div className="text-[11px] text-on-surface-variant">Read from Finance · {period.label}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeJournal}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-body-sm">
              {journalEntries.length
                ? journalEntries.map(j => (
                  <div key={j.id} className="p-3 rounded-lg border border-surface-dim bg-white">
                    <div className="flex justify-between mb-1">
                      <span className="code-mono text-body-sm font-semibold">{j.id}</span>
                      {pill(j.status === 'Posted' ? 'ok' : 'bad', j.status)}
                    </div>
                    <div className="text-[11px] text-on-surface-variant mb-2">{j.date} · {j.memo}</div>
                    <div className="flex justify-between text-body-sm"><span className="text-on-surface-variant">Account</span><span className="font-mono">{j.account || '— unmapped —'}</span></div>
                    <div className="flex justify-between text-body-sm"><span className="text-on-surface-variant">Amount</span><span className="tabular-nums font-semibold">{fmtMoney(j.amount)}</span></div>
                  </div>
                ))
                : <div className="text-body-sm text-on-surface-variant">No journal entries for this advertiser this period.</div>}
            </div>
            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-end shrink-0">
              <button className="fin-link" onClick={() => openFinance('document-engine')}><span className="material-symbols-outlined">open_in_new</span>Open in Finance document engine</button>
            </div>
          </div>
        </>
      )}

      {/* Finance destination modal */}
      {financeModal && (
        <div className="modal-scrim open" onClick={closeFinanceModal}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">{financeModal.title}</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">{financeModal.body}</p>
            <div className="p-3 rounded border border-outline-variant bg-surface-container-low text-[11px] code-mono mb-3">{financeModal.route}</div>
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeFinanceModal}>Close</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={confirmFinance}>Open</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
