'use client';
import './sales.css';
import { useState, useMemo } from 'react';
import { SalesScreenProps, SALES_NAV } from './types';
import RowMenu from '@/components/ListPrimitives';
import type { DemoRow } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';

type LinkStatus = 'Active' | 'Paid' | 'Expired';

interface PaymentLinkRow {
  id: number;
  code: string;
  description: string;
  amount: string;
  customer: string;
  created: string;
  expires: string;
  status: LinkStatus;
}

type TabKey = 'All' | 'Active' | 'Paid' | 'Expired';

const ROWS: PaymentLinkRow[] = [
  { id: 1, code: 'PL-7F2A', description: 'Website redesign deposit', amount: '$2,500.00', customer: 'Acme Corp', created: '10/28/2026', expires: '11/28/2026', status: 'Active' },
  { id: 2, code: 'PL-3C9E', description: 'Monthly retainer', amount: '$3,000.00', customer: 'Blue Ridge Co.', created: '10/20/2026', expires: '11/20/2026', status: 'Paid' },
  { id: 3, code: 'PL-9D4B', description: 'Consulting — 10 hours', amount: '$1,500.00', customer: 'Northwind Labs', created: '10/15/2026', expires: '11/15/2026', status: 'Active' },
  { id: 4, code: 'PL-1A8C', description: 'Brand identity package', amount: '$4,800.00', customer: 'Orion Apparel', created: '08/10/2026', expires: '09/10/2026', status: 'Expired' },
  { id: 5, code: 'PL-5E7A', description: 'Product sample order', amount: '$320.00', customer: 'Maple Supply', created: '09/12/2026', expires: '10/12/2026', status: 'Paid' },
];

const TABS: TabKey[] = ['All', 'Active', 'Paid', 'Expired'];

const STATUS_BADGE: Record<LinkStatus, string> = {
  Active: 'bg-primary/10 text-primary',
  Paid: 'bg-secondary-container text-on-secondary-container',
  Expired: 'bg-surface-container text-on-surface-variant',
};

export default function PaymentLinksScreen({ onNavigate, onToast, onCreate, onOpenCreateFlyout, onOpenPeek }: SalesScreenProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('All');
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [activeToggle, setActiveToggle] = useState(true);

  // Reference unused props so TS noUnusedLocals stays quiet without changing behavior.
  void onCreate;
  void onOpenCreateFlyout;

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return ROWS.filter((r) => {
      const matchTab = activeTab === 'All' || r.status === activeTab;
      const matchSearch =
        !q ||
        r.code.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.customer.toLowerCase().includes(q);
      return matchTab && matchSearch;
    });
  }, [activeTab, searchText]);

  const countText =
    filtered.length === 0 ? `0 of ${ROWS.length}` : `1–${filtered.length} of ${ROWS.length}`;

  // Deterministic 21×21 QR-style pattern (441 cells), computed once.
  const qrCells = useMemo(() => {
    const cells: boolean[] = [];
    for (let i = 0; i < 441; i++) {
      const on = ((i * 73 + 17) % 11) < 5;
      const r = Math.floor(i / 21);
      const c = i % 21;
      const inFinderTL = r < 7 && c < 7;
      const inFinderTR = r < 7 && c >= 14;
      const inFinderBL = r >= 14 && c < 7;
      const inFinderBorder =
        (r === 0 || r === 6 || c === 0 || c === 6) &&
        (inFinderTL || inFinderTR || inFinderBL);
      const inFinderInner =
        (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
        (r >= 2 && r <= 4 && c >= 16 && c <= 18) ||
        (r >= 16 && r <= 18 && c >= 2 && c <= 4);
      const onFinal =
        inFinderBorder ||
        inFinderInner ||
        (!inFinderTL && !inFinderTR && !inFinderBL && on);
      cells.push(onFinal);
    }
    return cells;
  }, []);

  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  return (
    <div className="bg-background font-sans text-body-md text-on-surface antialiased min-h-screen">
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">account_balance</span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <button
            className="text-label-md hover:text-primary"
            onClick={() => onNavigate(...SALES_NAV.overview())}
          >
            Sales &amp; Get Paid
          </button>
          <span className="text-outline">/</span>
          <button
            className="text-label-md text-primary font-semibold hover:underline"
            onClick={() => onNavigate(...SALES_NAV.paymentLinks())}
          >
            Payment links
          </button>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="text-headline-lg">Payment links</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Share a link or QR — customer pays via card or bank transfer. §B1 Customers › Payment link = [M].
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
              onClick={openModal}
            >
              <span className="material-symbols-outlined text-[16px]">link</span>New payment link
            </button>
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
              onClick={() => {
                const cols = [
                  { key: 'code', label: 'Code' },
                  { key: 'description', label: 'Description' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'customer', label: 'Customer' },
                  { key: 'created', label: 'Created' },
                  { key: 'expires', label: 'Expires' },
                  { key: 'status', label: 'Status' },
                ];
                exportToCsv(filtered as unknown as Record<string, unknown>[], cols, 'payment-links');
                onToast(`Exported ${filtered.length} records to CSV`);
              }}
            >
              <span className="material-symbols-outlined text-[16px]">download</span>Export
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Active links</span>
            <div className="text-headline-sm mt-1 tabular-nums">12</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Collected (30d)</span>
            <div className="text-headline-sm mt-1 tabular-nums">$4,820</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Pending</span>
            <div className="text-headline-sm mt-1 tabular-nums">$1,240</div>
          </div>
          <div className="bg-white rounded-xl border border-surface-dim p-3">
            <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Conversion</span>
            <div className="text-headline-sm mt-1 tabular-nums">62%</div>
          </div>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
          {/* Status tabs */}
          <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab}
                className={`h-full px-3 text-label-md tab-underline ${activeTab === tab ? 'active' : 'text-on-surface-variant'}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
            <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
              <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
              <input
                className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
                placeholder="Filter by code, description…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">calendar_today</span>Date range
            </button>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views
            </button>
            <span className="ml-auto text-[11px] text-on-surface-variant">{countText}</span>
          </div>

          {/* Table */}
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" /></th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Expires</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-surface-container-low cursor-pointer pl-row"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input,button')) return;
                    onToast('Row click → peek drawer (payment link details + QR)');
                  }}
                >
                  <td className="px-3 py-2"><input type="checkbox" className="row-check" /></td>
                  <td className={`px-3 py-2 font-mono font-medium ${row.status === 'Expired' ? 'text-on-surface-variant' : 'text-primary'}`}>{row.code}</td>
                  <td className="px-3 py-2">{row.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.amount}</td>
                  <td className="px-3 py-2">{row.customer}</td>
                  <td className="px-3 py-2">{row.created}</td>
                  <td className="px-3 py-2">{row.expires}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-label-sm ${STATUS_BADGE[row.status]}`}>{row.status}</span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <RowMenu
                      ariaLabel={`Row actions for ${row.code}`}
                      items={[
                        {
                          label: 'View',
                          icon: 'open_in_new',
                          onClick: () => onOpenPeek?.(row as unknown as DemoRow, 'sales'),
                        },
                        {
                          label: 'Edit',
                          icon: 'edit',
                          onClick: () => onToast(`Editing ${row.code}`),
                        },
                        {
                          label: 'Copy link',
                          icon: 'content_copy',
                          onClick: () => onToast(`Copied link ${row.code}`),
                        },
                        {
                          label: 'Share',
                          icon: 'share',
                          onClick: () => onToast(`Sharing ${row.code}`),
                        },
                        {
                          label: 'Deactivate',
                          icon: 'block',
                          danger: true,
                          onClick: () => onToast(`Deactivating ${row.code}`),
                        },
                        {
                          label: 'Delete',
                          icon: 'delete',
                          danger: true,
                          onClick: () => onToast(`Deleting ${row.code}`),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* ═══════════ PAYMENT LINK MODAL — [M] per §B1 ═══════════ */}
      <div
        className={`modal-scrim ${modalOpen ? 'open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="w-full max-w-[640px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">link</span>
              <div>
                <div className="text-headline-sm">New payment link</div>
                <div className="text-[11px] text-on-surface-variant">Amount, description, share link / QR</div>
              </div>
            </div>
            <button
              className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
              onClick={closeModal}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
            {/* Amount */}
            <div>
              <label className="block text-label-sm text-on-surface-variant mb-1">Amount</label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-on-surface-variant text-body-md">$</span>
                <input
                  className="w-full h-11 pl-7 pr-3 border border-surface-dim rounded text-headline-md font-semibold tabular-nums focus:outline-none focus:border-primary"
                  defaultValue="1,500.00"
                  type="text"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-label-sm text-on-surface-variant mb-1">Description</label>
              <input
                className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary"
                placeholder="What is this payment for?"
                defaultValue="Consulting — 10 hours"
              />
            </div>

            {/* Customer + Expiry row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">Customer (optional)</label>
                <div className="relative flex items-center">
                  <input
                    className="w-full h-9 px-2.5 pr-8 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary"
                    defaultValue="Northwind Labs"
                  />
                  <span className="material-symbols-outlined absolute right-2 text-[16px] text-outline">expand_more</span>
                </div>
              </div>
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">Expires</label>
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary"
                    defaultValue="11/15/2026"
                  />
                  <label className="flex items-center gap-1.5 text-label-sm">
                    <input type="checkbox" className="row-check" defaultChecked />
                    <span>On</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Share link + QR */}
            <div className="border-t border-surface-dim pt-4">
              <div className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mb-2">Share</div>
              <div className="flex gap-4">
                {/* QR */}
                <div className="shrink-0 flex flex-col items-center">
                  <div className="qr-grid">
                    {qrCells.map((on, i) => (
                      <div key={i} className={`qr-cell ${on ? '' : 'blank'}`} />
                    ))}
                  </div>
                  <button className="mt-2 text-[11px] text-primary font-semibold hover:underline flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">download</span>Download QR
                  </button>
                </div>
                {/* Link + copy */}
                <div className="flex-1 min-w-0 space-y-2">
                  <label className="block text-label-sm text-on-surface-variant">Payment link</label>
                  <div className="flex items-center gap-1">
                    <input
                      className="flex-1 h-9 px-2.5 border border-surface-dim rounded text-body-sm font-mono bg-surface-container-low"
                      readOnly
                      defaultValue="https://pay.unsaid.app/pl-9D4B"
                    />
                    <button
                      className="h-9 px-3 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container flex items-center gap-1"
                      onClick={() => {
                        navigator.clipboard?.writeText('https://pay.unsaid.app/pl-9D4B').then(
                          () => onToast('Link copied to clipboard'),
                          () => onToast('Copy failed — select and copy manually')
                        );
                      }}
                    >
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>Copy
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-2">
                    <button className="h-8 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">mail</span>Email
                    </button>
                    <button className="h-8 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">sms</span>SMS
                    </button>
                    <button className="h-8 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">more_horiz</span>More
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-container-low">
              <div>
                <div className="text-body-md font-medium">Link is active</div>
                <div className="text-[11px] text-on-surface-variant">Turn off to pause payments without deleting the link.</div>
              </div>
              <div
                className={`toggle ${activeToggle ? 'on' : 'off'}`}
                onClick={() => setActiveToggle((v) => !v)}
              />
            </div>

            {/* Accepted methods */}
            <div>
              <label className="block text-label-sm text-on-surface-variant mb-1">Accepted methods</label>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-surface-dim rounded text-label-sm cursor-pointer">
                  <input type="checkbox" className="row-check" defaultChecked /><span className="material-symbols-outlined text-[14px]">credit_card</span>Card
                </label>
                <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-surface-dim rounded text-label-sm cursor-pointer">
                  <input type="checkbox" className="row-check" defaultChecked /><span className="material-symbols-outlined text-[14px]">account_balance</span>Bank transfer
                </label>
                <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-surface-dim rounded text-label-sm cursor-pointer">
                  <input type="checkbox" className="row-check" /><span className="material-symbols-outlined text-[14px]">account_balance_wallet</span>Apple/Google Pay
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
            <button
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
              onClick={closeModal}
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              <div className="flex split-btn">
                <button className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main">Save and new</button>
                <button className="h-8 px-1.5 bg-white border border-surface-dim hover:bg-surface-container-low split-btn-arrow">
                  <span className="material-symbols-outlined text-[16px]">expand_more</span>
                </button>
              </div>
              <div className="flex split-btn">
                <button
                  className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main"
                  onClick={() => {
                    closeModal();
                    onToast('Payment link created');
                  }}
                >
                  Create link
                </button>
                <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow">
                  <span className="material-symbols-outlined text-[16px]">expand_more</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
