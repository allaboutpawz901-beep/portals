'use client';
/* AdvertisersScreen — 1:1 port of upload/marketing_extracted/Marketing/ad center mangemnt .html
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
interface AccessUser { email: string; role: string; }
interface Advertiser {
  id: string;
  legalName: string;
  displayName: string;
  email: string;
  phone: string;
  country: string;
  bizType: string;
  taxId: string;
  verify: string;
  status: string;
  networks: string[];
  billing: string;
  creditLimit: number;
  campaigns: number;
  spend: number;
  access: AccessUser[];
  created: string;
}

const ADVERTISERS: Advertiser[] = [
  { id: 'ADV-1001', legalName: 'Unsaid Company Inc.', displayName: 'Unsaid', email: 'ads@unsaid.app', phone: '+1 (901) 210-3145', country: 'United States', bizType: 'C-Corp', taxId: '••-•••4471', verify: 'Verified', status: 'Active', networks: ['Meta', 'TikTok', 'Google'], billing: 'Visa •4421', creditLimit: 15000, campaigns: 4, spend: 18420, access: [{ email: 'jordan@unsaid.app', role: 'Owner' }, { email: 'sarah@unsaid.app', role: 'Manager' }], created: '2026-01-15' },
  { id: 'ADV-1002', legalName: 'Orion Apparel LLC', displayName: 'Orion Apparel', email: 'billing@orion.co', phone: '+1 (555) 220-4412', country: 'United States', bizType: 'LLC', taxId: '••-•••8821', verify: 'Verified', status: 'Active', networks: ['Meta', 'Pinterest'], billing: 'Mastercard •8801', creditLimit: 8000, campaigns: 2, spend: 6210, access: [{ email: 'ap@orion.co', role: 'Owner' }, { email: 'media@orion.co', role: 'Analyst' }], created: '2026-03-02' },
  { id: 'ADV-1003', legalName: 'Blue Ridge Co.', displayName: 'Blue Ridge', email: 'ads@blueridge.co', phone: '+1 (555) 882-1102', country: 'United States', bizType: 'LLC', taxId: '••-•••1144', verify: 'Pending', status: 'Pending', networks: ['Meta'], billing: 'Visa •4421', creditLimit: 5000, campaigns: 0, spend: 0, access: [{ email: 'billing@blueridge.co', role: 'Owner' }], created: '2026-10-20' },
  { id: 'ADV-1004', legalName: 'Maple Supply Inc.', displayName: 'Maple Supply', email: 'ar@maplesupply.io', phone: '+1 (555) 774-9810', country: 'Canada', bizType: 'C-Corp', taxId: '••-•••7789', verify: 'Verified', status: 'Suspended', networks: ['Google'], billing: 'Bank transfer', creditLimit: 12000, campaigns: 1, spend: 0, access: [{ email: 'ar@maplesupply.io', role: 'Owner' }, { email: 'finance@maplesupply.io', role: 'Billing' }], created: '2026-05-14' },
  { id: 'ADV-1005', legalName: 'Northwind Labs LLC', displayName: 'Northwind Labs', email: 'marketing@northwindlabs.io', phone: '+1 (555) 310-8844', country: 'United States', bizType: 'LLC', taxId: '••-•••6620', verify: 'Verified', status: 'Active', networks: ['Meta', 'Google'], billing: 'Visa •4421', creditLimit: 20000, campaigns: 3, spend: 9840, access: [{ email: 'marketing@northwindlabs.io', role: 'Owner' }, { email: 'ops@northwindlabs.io', role: 'Manager' }, { email: 'reporting@northwindlabs.io', role: 'Analyst' }], created: '2026-02-10' },
  { id: 'ADV-1006', legalName: 'Acme Corp', displayName: 'Acme Corp', email: 'ap@acme.com', phone: '+1 (555) 001-9921', country: 'United States', bizType: 'C-Corp', taxId: '••-•••4410', verify: 'Pending', status: 'Pending', networks: ['Meta', 'TikTok', 'Google', 'Pinterest'], billing: '—', creditLimit: 0, campaigns: 0, spend: 0, access: [{ email: 'ap@acme.com', role: 'Owner' }], created: '2026-11-01' },
  { id: 'ADV-1007', legalName: 'Gelato Pty Ltd', displayName: 'Gelato', email: 'ads@gelato.co', phone: '+61 2 8000 0000', country: 'Australia', bizType: 'Partnership', taxId: '••-•••3390', verify: 'Verified', status: 'Active', networks: ['TikTok'], billing: 'Mastercard •8801', creditLimit: 6000, campaigns: 1, spend: 3120, access: [{ email: 'ads@gelato.co', role: 'Owner' }, { email: 'billing@gelato.co', role: 'Billing' }], created: '2026-06-30' },
  { id: 'ADV-1008', legalName: 'Printify Ltd.', displayName: 'Printify', email: 'hello@printify.com', phone: '+1 (555) 400-1120', country: 'United States', bizType: 'S-Corp', taxId: '••-•••2201', verify: 'Verified', status: 'Invited', networks: ['Meta', 'Pinterest'], billing: '—', creditLimit: 0, campaigns: 0, spend: 0, access: [{ email: 'hello@printify.com', role: 'Owner' }], created: '2026-11-02' },
];

const NETWORKS = ['Meta', 'TikTok', 'Google', 'Pinterest'] as const;
const ROLES = ['Owner', 'Manager', 'Billing', 'Analyst'] as const;
const COUNTRIES = ['United States', 'Canada', 'United Kingdom', 'Australia'] as const;
const BIZ_TYPES = ['LLC', 'C-Corp', 'S-Corp', 'Sole proprietor', 'Partnership'] as const;
const PAYMENTS = ['Visa •4421', 'Mastercard •8801', 'Bank transfer'] as const;

/* ─── helpers (from HTML <script>) ─── */
function initials(s: string): string {
  const w = (s || '').split(/\s+/).map(x => x[0] || '').join('');
  return (w.slice(0, 2).toUpperCase()) || 'A';
}
function pillFor(status: string) {
  const cls = status === 'Active' ? 'active' : status === 'Pending' ? 'pending' : status === 'Suspended' ? 'suspended' : status === 'Invited' ? 'invited' : 'closed';
  return <span className={`stat ${cls}`}>{status}</span>;
}
function avatarClass(status: string): string {
  return status === 'Suspended' ? 'suspended' : status === 'Pending' ? 'pending' : status === 'Invited' ? 'invited' : status === 'Closed' ? 'closed' : '';
}
function netChip(n: string) {
  return <span key={n} className={`net-chip net-${n}`}>{n}</span>;
}
function fmt(n: number) { return n.toLocaleString(); }

/* small avatar color overrides used in connected-networks list */
const NET_AVATAR_STYLE: Record<string, React.CSSProperties> = {
  Meta: {},
  TikTok: { background: '#eef1f2', color: '#27353a' },
  Google: { background: '#f8f0ee', color: '#c45c5b' },
  Pinterest: { background: '#f9eeee', color: '#bd5558' },
};
function netAvatarLetter(n: string): string { return n[0]; }

export default function AdvertisersScreen({ onToast }: MarketingScreenProps) {
  /* ─── state (mirrors HTML's filters, editing, peekId, etc.) ─── */
  const [items, setItems] = useState<Advertiser[]>(ADVERTISERS);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All');
  const [networks, setNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));
  const [roles, setRoles] = useState<Set<string>>(new Set(ROLES as readonly string[]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [popNetworkOpen, setPopNetworkOpen] = useState(false);
  const [popRoleOpen, setPopRoleOpen] = useState(false);
  const [draftNetworks, setDraftNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));
  const [draftRoles, setDraftRoles] = useState<Set<string>>(new Set(ROLES as readonly string[]));

  // advertiser drawer form state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fLegal, setFLegal] = useState('');
  const [fDisplay, setFDisplay] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fCountry, setFCountry] = useState<string>(COUNTRIES[0]);
  const [fBizType, setFBizType] = useState<string>(BIZ_TYPES[0]);
  const [fTax, setFTax] = useState('');
  const [fVerify, setFVerify] = useState('Pending');
  const [fDraftNets, setFDraftNets] = useState<Set<string>>(new Set(['Meta', 'TikTok', 'Google']));
  const [fUseWorkspaceBilling, setFUseWorkspaceBilling] = useState(true);
  const [fPayment, setFPayment] = useState<string>(PAYMENTS[0]);
  const [fCredit, setFCredit] = useState(15000);
  const [draftAccess, setDraftAccess] = useState<AccessUser[]>([]);

  // invite modal state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('Manager');

  // billing modal state
  const [billingOpen, setBillingOpen] = useState(false);
  const [billName, setBillName] = useState('');
  const [billPayment, setBillPayment] = useState<string>(PAYMENTS[0]);
  const [billCredit, setBillCredit] = useState(15000);

  // network modal state
  const [netModalOpen, setNetModalOpen] = useState(false);
  const [netSelect, setNetSelect] = useState('Meta Ads');
  const [netAccount, setNetAccount] = useState('');

  // save split menu
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);

  /* ─── derived (mirrors renderTable) ─── */
  const rows = useMemo(() => items.filter(a => {
    const ql = q.toLowerCase();
    const qOK = !ql || (a.id + ' ' + a.displayName + ' ' + a.legalName + ' ' + a.email + ' ' + a.networks.join(' ')).toLowerCase().includes(ql);
    const tabOK = tab === 'All' || a.status === tab;
    const netOK = a.networks.some(n => networks.has(n));
    const roleOK = a.access.some(u => roles.has(u.role));
    return qOK && tabOK && netOK && roleOK;
  }), [items, q, tab, networks, roles]);

  const totalCount = items.length;
  const activeCount = items.filter(a => a.status === 'Active').length;
  const pendingCount = items.filter(a => a.status === 'Pending').length;
  const suspendedCount = items.filter(a => a.status === 'Suspended').length;

  const filtersActive = !!q || tab !== 'All' || networks.size !== NETWORKS.length || roles.size !== ROLES.length;
  const allChecked = rows.length > 0 && rows.every(a => selected.has(a.id));
  const someChecked = rows.some(a => selected.has(a.id));

  /* ─── handlers ─── */
  function openPeek(id: string) { setPeekId(id); setRowMenuForId(null); }
  function closePeek() { setPeekId(null); }

  function openAdvertiserDrawer(id: string | null) {
    const editing = id ? items.find(a => a.id === id) : null;
    setEditingId(id);
    setFLegal(editing ? editing.legalName : '');
    setFDisplay(editing ? editing.displayName : '');
    setFEmail(editing ? editing.email : '');
    setFPhone(editing ? editing.phone : '');
    setFCountry(editing ? editing.country : COUNTRIES[0]);
    setFBizType(editing ? editing.bizType : BIZ_TYPES[0]);
    setFTax(editing ? editing.taxId : '');
    setFVerify(editing ? editing.verify : 'Pending');
    setFUseWorkspaceBilling(editing ? editing.billing === 'Visa •4421' : true);
    setFPayment(editing ? editing.billing : PAYMENTS[0]);
    setFCredit(editing ? editing.creditLimit : 15000);
    setFDraftNets(editing ? new Set(editing.networks) : new Set(['Meta', 'TikTok', 'Google']));
    setDraftAccess(editing ? editing.access.map(u => ({ ...u })) : []);
    setDrawerOpen(true);
    setPeekId(null);
    setRowMenuForId(null);
  }
  function closeAdvertiserDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setSaveMenuOpen(false);
  }

  function collectAdvertiser(): Advertiser | null {
    const legal = fLegal.trim();
    const display = fDisplay.trim();
    const email = fEmail.trim();
    if (!legal) { onToast('Legal business name is required'); return null; }
    if (!display) { onToast('Display name is required'); return null; }
    if (!email) { onToast('Contact email is required'); return null; }
    const nets = [...fDraftNets];
    const editing = editingId ? items.find(a => a.id === editingId) : null;
    return {
      id: editing ? editing.id : 'ADV-' + String(items.length + 1001),
      legalName: legal,
      displayName: display,
      email,
      phone: fPhone,
      country: fCountry,
      bizType: fBizType,
      taxId: fTax || '—',
      verify: fVerify,
      status: editing ? editing.status : 'Pending',
      networks: nets,
      billing: fUseWorkspaceBilling ? 'Visa •4421' : fPayment,
      creditLimit: fCredit,
      campaigns: editing ? editing.campaigns : 0,
      spend: editing ? editing.spend : 0,
      access: draftAccess.map(u => ({ ...u })),
      created: editing ? editing.created : new Date().toISOString().slice(0, 10),
    };
  }
  function persist(a: Advertiser) {
    setItems(prev => {
      if (editingId) {
        const i = prev.findIndex(x => x.id === editingId);
        if (i >= 0) { const n = [...prev]; n[i] = a; return n; }
        return prev;
      }
      return [a, ...prev];
    });
  }
  function save() {
    const a = collectAdvertiser(); if (!a) return;
    persist(a);
    closeAdvertiserDrawer();
    onToast(editingId ? 'Advertiser updated' : 'Advertiser created');
  }
  function saveAndNew() {
    const a = collectAdvertiser(); if (!a) return;
    persist(a);
    setEditingId(null);
    setFLegal(''); setFDisplay(''); setFEmail(''); setFPhone(''); setFTax('');
    setFVerify('Pending');
    setFDraftNets(new Set(['Meta', 'TikTok', 'Google']));
    setDraftAccess([]);
    setFUseWorkspaceBilling(true);
    setFPayment(PAYMENTS[0]);
    setFCredit(15000);
    onToast('Saved. New advertiser form ready.');
  }
  function saveAndInvite() {
    const a = collectAdvertiser(); if (!a) return;
    persist(a);
    closeAdvertiserDrawer();
    onToast('Saved and sent invite');
  }

  function rowAction(act: string, a: Advertiser) {
    setRowMenuForId(null);
    switch (act) {
      case 'edit': openAdvertiserDrawer(a.id); break;
      case 'view': openPeek(a.id); break;
      case 'invite': openInviteModal(); break;
      case 'verify':
        setItems(prev => prev.map(x => x.id === a.id ? { ...x, verify: 'Verified', status: x.status === 'Pending' ? 'Active' : x.status } : x));
        onToast(`Marked verified: ${a.displayName}`);
        break;
      case 'suspend':
        setItems(prev => prev.map(x => x.id === a.id ? { ...x, status: 'Suspended' } : x));
        onToast(`Suspended: ${a.displayName}`);
        break;
      case 'restore':
        setItems(prev => prev.map(x => x.id === a.id ? { ...x, status: 'Active' } : x));
        onToast(`Restored: ${a.displayName}`);
        break;
      case 'close':
        if (confirm('Close this advertiser account? This cannot be undone.')) {
          setItems(prev => prev.map(x => x.id === a.id ? { ...x, status: 'Closed' } : x));
          onToast(`Closed: ${a.displayName}`);
        }
        break;
    }
  }

  function bulkAction(act: string) {
    if (act === 'close') { setSelected(new Set()); return; }
    const sel = [...selected];
    const n = sel.length;
    if (act === 'suspend') {
      setItems(prev => prev.map(a => sel.includes(a.id) ? { ...a, status: 'Suspended' } : a));
      onToast(`Suspended ${n} advertiser(s)`);
    } else if (act === 'restore') {
      setItems(prev => prev.map(a => sel.includes(a.id) ? { ...a, status: 'Active' } : a));
      onToast(`Restored ${n} advertiser(s)`);
    } else if (act === 'verify') {
      setItems(prev => prev.map(a => sel.includes(a.id) ? { ...a, verify: 'Verified', status: a.status === 'Pending' ? 'Active' : a.status } : a));
      onToast(`Marked ${n} advertiser(s) verified`);
    }
    setSelected(new Set());
  }

  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map(a => a.id)));
  }
  function clearAllFilters() {
    setQ(''); setTab('All');
    setNetworks(new Set(NETWORKS as readonly string[]));
    setRoles(new Set(ROLES as readonly string[]));
    setDraftNetworks(new Set(NETWORKS as readonly string[]));
    setDraftRoles(new Set(ROLES as readonly string[]));
  }

  function openInviteModal() {
    setInviteEmail('');
    setInviteRole('Manager');
    setInviteOpen(true);
  }
  function confirmInvite() {
    const email = inviteEmail.trim();
    if (!email) { onToast('Email is required'); return; }
    setDraftAccess(prev => [...prev, { email, role: inviteRole }]);
    setInviteOpen(false);
    onToast(`Invited ${email} (${inviteRole})`);
  }

  function changeAccessRole(i: number, role: string) {
    setDraftAccess(prev => prev.map((u, j) => j === i ? { ...u, role } : u));
  }
  function removeAccess(i: number) {
    setDraftAccess(prev => prev.filter((_, j) => j !== i));
  }

  function toggleDraftNetwork(n: string) {
    setFDraftNets(prev => { const next = new Set(prev); if (next.has(n)) next.delete(n); else next.add(n); return next; });
  }

  function handleExport() {
    exportToCsv(rows as unknown as Record<string, unknown>[], [
      { key: 'id', label: 'Advertiser ID' }, { key: 'displayName', label: 'Advertiser' },
      { key: 'legalName', label: 'Legal name' }, { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' }, { key: 'country', label: 'Country' },
      { key: 'bizType', label: 'Business type' }, { key: 'taxId', label: 'Tax ID' },
      { key: 'verify', label: 'Verification' }, { key: 'networks', label: 'Networks' },
      { key: 'billing', label: 'Billing' }, { key: 'creditLimit', label: 'Credit limit' },
      { key: 'campaigns', label: 'Campaigns' }, { key: 'spend', label: 'Spend (30d)' },
      { key: 'status', label: 'Status' }, { key: 'created', label: 'Created' },
    ], 'advertisers');
    onToast(`Exported ${rows.length} advertisers`);
  }

  const peek = peekId ? items.find(a => a.id === peekId) : null;

  return (
    <main className="px-6 pb-12">

      {/* ─── BREADCRUMB ─── */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Advertising</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Advertisers</span>
      </div>

      {/* ─── PAGE HEADER ─── */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Advertisers</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Every advertiser account — identity, networks, billing, verification, and access.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Customize panel — Data / Visual tabs')}>
            <span className="material-symbols-outlined text-[16px]">tune</span>Customize
          </button>
          <div className="flex">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" onClick={() => openAdvertiserDrawer(null)}>
              <span className="material-symbols-outlined text-[16px]">add</span>New advertiser
            </button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={() => setCreateMenuOpen(v => !v)}>
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Total advertisers</div>
          <div className="text-headline-sm mt-1 tabular-nums">{totalCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Across 4 networks</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Active</div>
          <div className="text-headline-sm mt-1 tabular-nums text-secondary">{activeCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Approved &amp; able to spend</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Verification pending</div>
          <div className="text-headline-sm mt-1 tabular-nums text-tertiary">{pendingCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Blocking new campaigns</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Suspended</div>
          <div className="text-headline-sm mt-1 tabular-nums text-error">{suspendedCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Spend paused by policy</div>
        </div>
      </div>

      {/* ─── LIST CARD ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">

        {/* View tabs */}
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          {['All', 'Active', 'Pending', 'Suspended', 'Invited', 'Closed'].map(t => (
            <button key={t} className={`h-full px-3 text-label-md tab-underline ${tab === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => { setTab(t); setSelected(new Set()); }}>{t}</button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter advertisers…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {/* Network popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopNetworkOpen(v => !v); setPopRoleOpen(false); }}>
              <span className="material-symbols-outlined text-[14px]">hub</span>Network
            </button>
            {popNetworkOpen && (
              <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 220 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Filter by network</div>
                {NETWORKS.map(n => (
                  <label key={n} className="flex items-center gap-2 px-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftNetworks.has(n)} onChange={() => { const next = new Set(draftNetworks); if (next.has(n)) next.delete(n); else next.add(n); setDraftNetworks(next); }} />{n} Ads
                  </label>
                ))}
                <div className="sep"></div>
                <div className="flex justify-end gap-2 px-2 py-1">
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => setDraftNetworks(new Set(NETWORKS as readonly string[]))}>Clear</button>
                  <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container" onClick={() => { setNetworks(new Set(draftNetworks)); setPopNetworkOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          {/* Role popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopRoleOpen(v => !v); setPopNetworkOpen(false); }}>
              <span className="material-symbols-outlined text-[14px]">badge</span>Role
            </button>
            {popRoleOpen && (
              <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Filter by role</div>
                {ROLES.map(r => (
                  <label key={r} className="flex items-center gap-2 px-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftRoles.has(r)} onChange={() => { const next = new Set(draftRoles); if (next.has(r)) next.delete(r); else next.add(r); setDraftRoles(next); }} />{r}
                  </label>
                ))}
                <div className="sep"></div>
                <div className="flex justify-end gap-2 px-2 py-1">
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => setDraftRoles(new Set(ROLES as readonly string[]))}>Clear</button>
                  <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container" onClick={() => { setRoles(new Set(draftRoles)); setPopRoleOpen(false); }}>Apply</button>
                </div>
              </div>
            )}
          </div>
          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => onToast('Saved views — pick or save current filters')}>
            <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views
          </button>
          <button className={`h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 ${filtersActive ? '' : 'hidden-imp'}`} onClick={clearAllFilters}>
            <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>Clear all
          </button>
          <span className="ml-auto text-[11px] text-on-surface-variant">{rows.length} of {items.length}</span>
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && (
          <div className="bulk-bar show">
            <span className="text-[12px] font-semibold">{selected.size} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('suspend')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">block</span>Suspend</button>
            <button onClick={() => bulkAction('restore')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">refresh</span>Restore</button>
            <button onClick={() => bulkAction('verify')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">verified</span>Mark verified</button>
            <span className="w-px h-4 bg-white/30"></span>
            <button className="ml-auto" onClick={() => bulkAction('close')}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>
        )}

        {/* Table or empty state */}
        {rows.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px] text-outline">person_search</span>
            </div>
            <h3 className="text-headline-sm mb-1">No advertisers match</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Clear filters or add a new advertiser.</p>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={clearAllFilters}>Clear filters</button>
          </div>
        ) : (
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} /></th>
                <th className="px-3 py-2">Advertiser</th>
                <th className="px-3 py-2">Advertiser ID</th>
                <th className="px-3 py-2">Networks</th>
                <th className="px-3 py-2">Billing</th>
                <th className="px-3 py-2">Verification</th>
                <th className="px-3 py-2 text-right">Campaigns</th>
                <th className="px-3 py-2 text-right">Spend (30d)</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {rows.map(a => (
                <tr key={a.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openPeek(a.id)}>
                  <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={selected.has(a.id)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(a.id)} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`adv-avatar ${avatarClass(a.status)}`}>{initials(a.displayName)}</div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.displayName}</div>
                        <div className="text-[11px] text-on-surface-variant truncate">{a.legalName} · {a.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2"><span className="code-mono">{a.id}</span></td>
                  <td className="px-3 py-2"><div className="flex items-center gap-1 flex-wrap">{a.networks.map(netChip)}</div></td>
                  <td className="px-3 py-2 text-[11px]">{a.billing}</td>
                  <td className="px-3 py-2">{pillFor(a.verify === 'Verified' ? 'Active' : a.verify === 'Pending' ? 'Pending' : 'Suspended')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.campaigns}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${fmt(a.spend)}</td>
                  <td className="px-3 py-2">{pillFor(a.status)}</td>
                  <td className="px-2 py-2 text-right relative">
                    <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === a.id ? null : a.id); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button>
                    {rowMenuForId === a.id && (
                      <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                        <div className="menu-header">This advertiser</div>
                        <button onClick={() => rowAction('edit', a)}><span className="material-symbols-outlined">edit</span>Edit advertiser</button>
                        <button onClick={() => rowAction('view', a)}><span className="material-symbols-outlined">visibility</span>View details</button>
                        <button onClick={() => rowAction('invite', a)}><span className="material-symbols-outlined">group_add</span>Invite user</button>
                        <button onClick={() => rowAction('verify', a)}><span className="material-symbols-outlined">verified</span>Mark verified</button>
                        <div className="sep"></div>
                        <div className="menu-header">Status</div>
                        <button onClick={() => rowAction('suspend', a)}><span className="material-symbols-outlined">block</span>Suspend</button>
                        <button onClick={() => rowAction('restore', a)}><span className="material-symbols-outlined">refresh</span>Restore</button>
                        <div className="sep"></div>
                        <button className="danger" onClick={() => rowAction('close', a)}><span className="material-symbols-outlined">do_not_disturb</span>Close account</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        <div className="px-4 py-2 flex items-center justify-between border-t border-surface-dim text-[11px] text-on-surface-variant">
          <span>Rows per page:
            <select className="border border-surface-dim rounded px-1 py-0.5 bg-white" onChange={() => onToast('Rows per page updated')}><option>25</option><option>50</option><option>75</option><option>100</option></select>
          </span>
          <div className="flex items-center gap-2">
            <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => onToast('Previous page')}><span className="material-symbols-outlined text-[16px]">chevron_left</span></button>
            <span>Page 1 of 1</span>
            <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => onToast('Next page')}><span className="material-symbols-outlined text-[16px]">chevron_right</span></button>
          </div>
        </div>
      </div>

      {/* Create split menu */}
      {createMenuOpen && (
        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={() => setCreateMenuOpen(false)}>
          <div className="menu-header">New</div>
          <button onClick={() => { setCreateMenuOpen(false); openAdvertiserDrawer(null); }}><span className="material-symbols-outlined">person_add</span>Advertiser</button>
          <button onClick={() => { setCreateMenuOpen(false); openInviteModal(); }}><span className="material-symbols-outlined">group_add</span>Invite user</button>
          <button onClick={() => { setCreateMenuOpen(false); setBillingOpen(true); }}><span className="material-symbols-outlined">account_balance</span>Billing profile</button>
          <button onClick={() => { setCreateMenuOpen(false); setNetModalOpen(true); }}><span className="material-symbols-outlined">hub</span>Network connection</button>
        </div>
      )}

      {/* Click-away catcher for row menu */}
      {rowMenuForId && <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForId(null)} />}

      {/* Peek drawer */}
      {peek && (
        <>
          <div className="drawer-scrim open" onClick={() => setPeekId(null)} />
          <div className="peek open">
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">person</span>
                <span className="text-headline-sm truncate">{peek.displayName}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); openAdvertiserDrawer(id); }}><span className="material-symbols-outlined text-[14px]">edit</span>Edit</button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setPeekId(null)}><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-body-sm">
              <div className="mb-3 flex items-center gap-2">{pillFor(peek.status)}<span className="code-mono text-on-surface-variant">{peek.id}</span></div>
              <div className="mb-3 flex items-center gap-1 flex-wrap">{peek.networks.map(netChip)}</div>
              <div className="bg-surface-container-low rounded-lg p-3 mb-3 text-center">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold mb-1">Spend (30d)</div>
                <div className="text-headline-md tabular-nums">${fmt(peek.spend)}</div>
              </div>
              <dl className="text-body-sm">
                <div className="kv"><dt>Legal name</dt><dd>{peek.legalName}</dd></div>
                <div className="kv"><dt>Email</dt><dd>{peek.email}</dd></div>
                <div className="kv"><dt>Phone</dt><dd>{peek.phone}</dd></div>
                <div className="kv"><dt>Country</dt><dd>{peek.country}</dd></div>
                <div className="kv"><dt>Business type</dt><dd>{peek.bizType}</dd></div>
                <div className="kv"><dt>Tax ID</dt><dd className="code-mono">{peek.taxId}</dd></div>
                <div className="kv"><dt>Verification</dt><dd>{peek.verify}</dd></div>
                <div className="kv"><dt>Billing</dt><dd>{peek.billing}</dd></div>
                <div className="kv"><dt>Credit limit</dt><dd className="tabular-nums">${fmt(peek.creditLimit)}</dd></div>
                <div className="kv"><dt>Campaigns</dt><dd className="tabular-nums">{peek.campaigns}</dd></div>
                <div className="kv"><dt>Created</dt><dd>{peek.created}</dd></div>
              </dl>
              <div className="mt-4 pt-3 border-t border-surface-dim">
                <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-2">Access</div>
                <div className="space-y-1">
                  {peek.access.map((u, i) => (
                    <div key={i} className="flex items-center justify-between py-1 text-body-sm">
                      <span className="truncate">{u.email}</span>
                      <span className="role-chip"><span className="material-symbols-outlined">badge</span>{u.role}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); openAdvertiserDrawer(id); }}><span className="material-symbols-outlined text-[16px]">edit</span>Edit</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => { openInviteModal(); }}><span className="material-symbols-outlined text-[16px]">group_add</span>Invite</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => { rowAction('suspend', peek); setPeekId(null); }}><span className="material-symbols-outlined text-[16px]">block</span>Suspend</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => { rowAction('restore', peek); setPeekId(null); }}><span className="material-symbols-outlined text-[16px]">refresh</span>Restore</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Advertiser drawer (create + edit) */}
      {drawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={closeAdvertiserDrawer} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">person_add</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">{editingId ? 'Edit advertiser' : 'New advertiser'}</div>
                  <div className="text-[11px] text-on-surface-variant">{editingId ? (() => { const e = items.find(a => a.id === editingId); return e ? `${e.status} · ${e.id}` : ''; })() : 'Draft · not yet invited'}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeAdvertiserDrawer}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">

              {/* Identity */}
              <section>
                <div className="section-h">Advertiser identity</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Legal business name</label>
                    <input className="field-input" placeholder="e.g. Unsaid Company Inc." value={fLegal} onChange={e => setFLegal(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Display name</label>
                    <input className="field-input" placeholder="e.g. Unsaid" value={fDisplay} onChange={e => setFDisplay(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Contact email</label>
                      <input className="field-input" type="email" placeholder="ads@company.com" value={fEmail} onChange={e => setFEmail(e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Contact phone</label>
                      <input className="field-input" type="tel" placeholder="+1 (555) 010-0100" value={fPhone} onChange={e => setFPhone(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Country</label>
                      <select className="field-input" value={fCountry} onChange={e => setFCountry(e.target.value)}>
                        {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Business type</label>
                      <select className="field-input" value={fBizType} onChange={e => setFBizType(e.target.value)}>
                        {BIZ_TYPES.map(b => <option key={b}>{b}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* Verification */}
              <section>
                <div className="section-h">Verification &amp; tax</div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Tax ID (EIN)</label>
                      <input className="field-input code-mono" placeholder="••-•••••••" value={fTax} onChange={e => setFTax(e.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Verification</label>
                      <select className="field-input" value={fVerify} onChange={e => setFVerify(e.target.value)}>
                        <option value="Pending">Pending</option>
                        <option value="Verified">Verified</option>
                        <option value="Rejected">Rejected</option>
                      </select>
                    </div>
                  </div>
                  <div className="border border-dashed border-surface-dim rounded-lg p-3 text-center cursor-pointer hover:bg-surface-container-low" onClick={() => onToast('Upload business documents — Articles of incorporation, W-9, business license')}>
                    <div className="text-[12px] font-semibold text-primary">Upload business documents</div>
                    <div className="text-[10px] text-on-surface-variant mt-1">Articles of incorporation, W-9, business license · PDF up to 10 MB</div>
                  </div>
                </div>
              </section>

              {/* Networks */}
              <section>
                <div className="section-h">Connected networks</div>
                <div className="space-y-2">
                  {NETWORKS.map(n => (
                    <label key={n} className="flex items-center justify-between p-2 rounded border border-surface-dim">
                      <span className="flex items-center gap-2">
                        <span className="adv-avatar" style={{ width: 26, height: 26, fontSize: 10, ...NET_AVATAR_STYLE[n] }}>{netAvatarLetter(n)}</span>
                        <span className="text-body-sm">{n} Ads</span>
                      </span>
                      <input type="checkbox" className="row-check" checked={fDraftNets.has(n)} onChange={() => toggleDraftNetwork(n)} />
                    </label>
                  ))}
                </div>
              </section>

              {/* Billing */}
              <section>
                <div className="section-h">Billing profile</div>
                <div className="space-y-2">
                  <label className="flex items-center justify-between py-1 text-body-sm">
                    <span>Use workspace billing profile</span>
                    <input type="checkbox" className="row-check" checked={fUseWorkspaceBilling} onChange={e => setFUseWorkspaceBilling(e.target.checked)} />
                  </label>
                  <div className="grid grid-cols-2 gap-3" style={{ opacity: fUseWorkspaceBilling ? 0.6 : 1 }}>
                    <div>
                      <label className="field-label">Payment method</label>
                      <select className="field-input" value={fPayment} onChange={e => setFPayment(e.target.value)}>
                        {PAYMENTS.map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Monthly credit limit</label>
                      <input type="number" className="field-input" value={fCredit} onChange={e => setFCredit(parseInt(e.target.value || '0', 10))} />
                    </div>
                  </div>
                </div>
              </section>

              {/* Access */}
              <section>
                <div className="section-h">Access &amp; roles</div>
                <div className="space-y-2">
                  {draftAccess.length === 0 ? (
                    <div className="text-[11px] text-on-surface-variant">No users yet.</div>
                  ) : draftAccess.map((u, i) => (
                    <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded border border-surface-dim text-body-sm">
                      <span className="material-symbols-outlined text-[16px] text-primary">person</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{u.email}</div>
                        <div className="text-[11px] text-on-surface-variant">{u.role}</div>
                      </div>
                      <select className="h-7 px-1 border border-surface-dim rounded text-body-sm" value={u.role} onChange={e => changeAccessRole(i, e.target.value)}>
                        {ROLES.map(r => <option key={r}>{r}</option>)}
                      </select>
                      <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => removeAccess(i)}><span className="material-symbols-outlined text-[14px] text-error">close</span></button>
                    </div>
                  ))}
                </div>
                <button className="mt-2 h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={openInviteModal}>
                  <span className="material-symbols-outlined text-[14px]">group_add</span>Invite user
                </button>
              </section>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closeAdvertiserDrawer}>Cancel</button>
              <div className="flex items-center gap-2">
                <div className="flex">
                  <button className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main" onClick={saveAndNew}>Save and new</button>
                  <button className="h-8 px-1.5 bg-white border border-surface-dim hover:bg-surface-container-low split-btn-arrow"><span className="material-symbols-outlined text-[16px]">expand_more</span></button>
                </div>
                <div className="flex">
                  <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main" onClick={save}>Save and close</button>
                  <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={e => { e.stopPropagation(); setSaveMenuOpen(v => !v); }}><span className="material-symbols-outlined text-[16px]">expand_more</span></button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Save split menu */}
      {saveMenuOpen && (
        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={() => setSaveMenuOpen(false)}>
          <div className="menu-header">Save</div>
          <button onClick={() => { setSaveMenuOpen(false); save(); }}><span className="material-symbols-outlined">save</span>Save and close</button>
          <button onClick={() => { setSaveMenuOpen(false); saveAndNew(); }}><span className="material-symbols-outlined">add</span>Save and new</button>
          <button onClick={() => { setSaveMenuOpen(false); saveAndInvite(); }}><span className="material-symbols-outlined">mail</span>Save and send invite</button>
        </div>
      )}

      {/* Invite user modal */}
      {inviteOpen && (
        <div className="modal-scrim open" onClick={() => setInviteOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Invite user</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">They will receive an email invitation for this advertiser.</p>
            <div className="space-y-3">
              <div>
                <label className="field-label">Email</label>
                <input className="field-input" type="email" placeholder="teammate@company.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Role</label>
                <select className="field-input" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setInviteOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={confirmInvite}>Send invite</button>
            </div>
          </div>
        </div>
      )}

      {/* Billing profile modal */}
      {billingOpen && (
        <div className="modal-scrim open" onClick={() => setBillingOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">New billing profile</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Create a billing profile to attach to advertiser accounts.</p>
            <div className="space-y-3">
              <div>
                <label className="field-label">Profile name</label>
                <input className="field-input" placeholder="e.g. US Card •4421" value={billName} onChange={e => setBillName(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Payment method</label>
                <select className="field-input" value={billPayment} onChange={e => setBillPayment(e.target.value)}>
                  {PAYMENTS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Monthly credit limit</label>
                <input type="number" className="field-input" value={billCredit} onChange={e => setBillCredit(parseInt(e.target.value || '0', 10))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setBillingOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => {
                const name = billName.trim();
                if (!name) { onToast('Profile name is required'); return; }
                setBillingOpen(false);
                onToast(`Billing profile created: ${name}`);
              }}>Create profile</button>
            </div>
          </div>
        </div>
      )}

      {/* Network connection modal */}
      {netModalOpen && (
        <div className="modal-scrim open" onClick={() => setNetModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Connect a network</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Authorize this advertiser to spend on a network.</p>
            <div className="space-y-3">
              <div>
                <label className="field-label">Network</label>
                <select className="field-input" value={netSelect} onChange={e => setNetSelect(e.target.value)}>
                  <option>Meta Ads</option><option>TikTok Ads</option><option>Google Ads</option><option>Pinterest Ads</option>
                </select>
              </div>
              <div>
                <label className="field-label">Ad account ID</label>
                <input className="field-input" placeholder="act_1234567890" value={netAccount} onChange={e => setNetAccount(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setNetModalOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => {
                const id = netAccount.trim();
                if (!id) { onToast('Ad account ID is required'); return; }
                setNetModalOpen(false);
                onToast(`Connected ${netSelect} (${id})`);
              }}>Connect</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
