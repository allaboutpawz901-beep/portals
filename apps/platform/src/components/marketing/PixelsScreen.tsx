'use client';
/* PixelsScreen — 1:1 port of upload/marketing_extracted/Marketing/pixels.html
   The HTML's <style> block lives in src/app/marketing.css (global classes).
   The HTML's <body> is ported to JSX below; class names are identical.
   The HTML's <script> is ported to React state + handlers below. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { exportToCsv } from '@/lib/csvExport';

interface MarketingScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

/* ─── data (verbatim from HTML <script>) ─── */
const NETWORKS = ['Meta', 'TikTok', 'GoogleAds', 'Pinterest'] as const;

interface PixelEvent {
  name: string;
  kind: string;
  valueField?: string;
}

interface Pixel {
  id: string;
  name: string;
  network: string;
  pixelId: string;
  install: string;
  status: string;
  events24: number;
  events30: number;
  lastEvent: string | null;
  events: PixelEvent[];
}

const INITIAL_PIXELS: Pixel[] = [
  { id: 'PX-101', name: 'Meta Pixel — Storefront', network: 'Meta', pixelId: '1029XXXX4471', install: 'Script in <head>', status: 'Live',
    events24: 1240, events30: 38420, lastEvent: '2026-11-03T09:42:11',
    events: [
      { name: 'PageView', kind: 'standard' },
      { name: 'ViewContent', kind: 'standard' },
      { name: 'AddToCart', kind: 'standard' },
      { name: 'InitiateCheckout', kind: 'standard' },
      { name: 'Purchase', kind: 'standard', valueField: 'value' },
    ] },
  { id: 'PX-102', name: 'TikTok Pixel — Storefront', network: 'TikTok', pixelId: 'C4XXXXT9', install: 'Script in <head>', status: 'Live',
    events24: 412, events30: 9821, lastEvent: '2026-11-03T09:40:02',
    events: [
      { name: 'Pageview', kind: 'standard' },
      { name: 'ViewContent', kind: 'standard' },
      { name: 'AddToCart', kind: 'standard' },
      { name: 'CompletePayment', kind: 'standard', valueField: 'value' },
    ] },
  { id: 'PX-103', name: 'Google Ads tag', network: 'GoogleAds', pixelId: 'AW-XXXXXX', install: 'GTM container', status: 'Live',
    events24: 588, events30: 14620, lastEvent: '2026-11-03T09:39:55',
    events: [
      { name: 'page_view', kind: 'standard' },
      { name: 'view_item', kind: 'standard' },
      { name: 'add_to_cart', kind: 'standard' },
      { name: 'purchase', kind: 'standard', valueField: 'value' },
    ] },
  { id: 'PX-104', name: 'Pinterest Tag', network: 'Pinterest', pixelId: '2617XXXX', install: 'Script in <head>', status: 'Paused',
    events24: 0, events30: 2140, lastEvent: '2026-10-28T14:10:00',
    events: [
      { name: 'PageVisit', kind: 'standard' },
      { name: 'AddToCart', kind: 'standard' },
      { name: 'Checkout', kind: 'standard' },
    ] },
  { id: 'PX-105', name: 'Server-side events (CAPI)', network: 'Meta', pixelId: 'CAPI-XXXX', install: 'Server-side (CAPI / Events API)', status: 'Error',
    events24: 0, events30: 0, lastEvent: null,
    events: [
      { name: 'Purchase', kind: 'standard', valueField: 'value' },
    ] },
];

interface RecentEvent {
  at: string;
  pixel: string;
  event: string;
  value: number | null;
  ok: boolean;
  err?: string;
}

const INITIAL_EVENTS: RecentEvent[] = [
  { at: '2026-11-03T09:42:11', pixel: 'PX-101', event: 'PageView', value: null, ok: true },
  { at: '2026-11-03T09:41:52', pixel: 'PX-103', event: 'view_item', value: null, ok: true },
  { at: '2026-11-03T09:41:31', pixel: 'PX-101', event: 'AddToCart', value: 18.00, ok: true },
  { at: '2026-11-03T09:41:02', pixel: 'PX-102', event: 'AddToCart', value: 24.00, ok: true },
  { at: '2026-11-03T09:40:02', pixel: 'PX-102', event: 'ViewContent', value: null, ok: true },
  { at: '2026-11-03T09:39:55', pixel: 'PX-103', event: 'page_view', value: null, ok: true },
  { at: '2026-11-03T09:39:21', pixel: 'PX-101', event: 'Purchase', value: 58.00, ok: true },
  { at: '2026-11-03T09:38:40', pixel: 'PX-103', event: 'purchase', value: 58.00, ok: true },
  { at: '2026-11-03T09:37:12', pixel: 'PX-105', event: 'Purchase', value: null, ok: false, err: 'Server-side token expired' },
  { at: '2026-11-03T09:36:09', pixel: 'PX-101', event: 'InitiateCheckout', value: null, ok: true },
];

interface SavedView {
  id: string;
  name: string;
  tab: string;
  q: string;
  networks: string[];
}

const INITIAL_SAVED_VIEWS: SavedView[] = [
  { id: 'sv-1', name: 'Live Meta', tab: 'Live', q: '', networks: ['Meta'] },
  { id: 'sv-2', name: 'Error pixels', tab: 'Error', q: '', networks: [...NETWORKS] },
];

interface DestMeta { title: string; body: string; route: string; }

const DESTS: Record<string, DestMeta> = {
  reports: { title: 'Finance → Reports', body: 'Event volume rolls into the Advertising performance report.', route: '/finance/reports?category=advertising' },
  'pick-from-network': { title: 'Pick from network', body: "Fetch an existing pixel from the advertiser's connected network account.", route: '/advertising/pixels/from-network' },
  integrations: { title: 'Settings → Integrations', body: 'Install GA4, PostHog, Clarity, Hotjar, Segment, or GTM containers — those live in Integrations, not Advertising.', route: '/settings/integrations' },
  'event-volume': { title: 'Finance → Reports', body: 'Event volume by pixel and period.', route: '/finance/reports?metric=events' },
};

/* ─── snippet templates (verbatim from HTML <template> tags) ─── */
const SNIPPET_META = `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '__PIXEL_ID__');
fbq('track', 'PageView');
</` + `script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=__PIXEL_ID__&ev=PageView&noscript=1"/></noscript>
<!-- End Meta Pixel Code -->`;

const SNIPPET_TIKTOK = `<!-- TikTok Pixel Code -->
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
  ttq.load('__PIXEL_ID__');
  ttq.page();
}(window, document, 'ttq');
</` + `script>
<!-- End TikTok Pixel Code -->`;

const SNIPPET_GOOGLEADS = `<!-- Google Ads tag (AW-…) — note: not GA4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=__PIXEL_ID__"></` + `script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '__PIXEL_ID__');
</` + `script>
<!-- End Google Ads tag -->`;

const SNIPPET_PINTEREST = `<!-- Pinterest Tag -->
<script>
!function(e){if(!window.pintrk){window.pintrk = function () {
window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var
  n=window.pintrk;n.queue=[],n.version="3.0";var
  t=document.createElement("script");t.async=!0;t.src=e;var
  r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");
pintrk('load', '__PIXEL_ID__');
pintrk('page');
</` + `script>
<noscript>
<img height="1" width="1" style="display:none;" alt="" src="https://ct.pinterest.com/v3/?event=init&tid=__PIXEL_ID__&noscript=1" />
</noscript>
<!-- End Pinterest Tag -->`;

function buildSnippet(network: string, pixelId: string): string {
  const map: Record<string, string> = {
    Meta: SNIPPET_META,
    TikTok: SNIPPET_TIKTOK,
    GoogleAds: SNIPPET_GOOGLEADS,
    Pinterest: SNIPPET_PINTEREST,
  };
  const tpl = map[network] || SNIPPET_META;
  return tpl.replace(/__PIXEL_ID__/g, pixelId || 'XXXX').trim();
}

/* ─── helpers ─── */
function fmt(n: number): string { return (n || 0).toLocaleString('en-US'); }
function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
}
function netLabel(n: string): string { return n === 'GoogleAds' ? 'Google Ads' : n; }
function netChip(n: string) { return <span className={`net-chip net-${n}`}>{netLabel(n)}</span>; }
function iconClass(n: string): string {
  const k = n === 'Meta' ? 'meta' : n === 'TikTok' ? 'tiktok' : n === 'GoogleAds' ? 'googleads' : 'pinterest';
  return `px-icon ${k}`;
}
function iconKind(n: string): string {
  return n === 'Meta' ? 'meta' : n === 'TikTok' ? 'tiktok' : n === 'GoogleAds' ? 'googleads' : 'pinterest';
}
function pill(status: string) {
  const kind = status === 'Live' ? 'ok' : status === 'Paused' ? 'warn' : 'bad';
  return <span className={`pill ${kind}`}>{status}</span>;
}
function nowIso(): string { return new Date().toISOString(); }

export default function PixelsScreen({ onToast }: MarketingScreenProps) {
  /* ─── state (mirrors HTML's `filters`, `editing`, `peekId`, etc.) ─── */
  const [items, setItems] = useState<Pixel[]>(INITIAL_PIXELS);
  const [events, setEvents] = useState<RecentEvent[]>(INITIAL_EVENTS);
  const [savedViews, setSavedViews] = useState<SavedView[]>(INITIAL_SAVED_VIEWS);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All');
  const [networks, setNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));
  const [draftNetworks, setDraftNetworks] = useState<Set<string>>(new Set(NETWORKS as readonly string[]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekId, setPeekId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [popNetworkOpen, setPopNetworkOpen] = useState(false);
  const [popSavedOpen, setPopSavedOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formStatus, setFormStatus] = useState('Live');
  const [formId, setFormId] = useState('');
  const [formInstall, setFormInstall] = useState('Script in <head>');
  const [formNetwork, setFormNetwork] = useState('Meta');
  const [draftEvents, setDraftEvents] = useState<PixelEvent[]>([]);
  const [selftestOpen, setSelftestOpen] = useState(false);
  const [selftestPixelId, setSelftestPixelId] = useState<string | null>(null);
  const [selftestPixelName, setSelftestPixelName] = useState('');
  const [selftestSteps, setSelftestSteps] = useState<{ text: string; badge: 'pending' | 'ok' | 'bad' }[]>([
    { text: 'waiting…', badge: 'pending' }, { text: 'waiting…', badge: 'pending' }, { text: 'waiting…', badge: 'pending' },
  ]);
  const [destOpen, setDestOpen] = useState(false);
  const [destKey, setDestKey] = useState<string>('');
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  const [streamToggle, setStreamToggle] = useState(true);
  const [flashNewest, setFlashNewest] = useState(false);

  const itemsRef = useRef(items);
  const streamRef = useRef(streamToggle);
  const selftestTimersRef = useRef<number[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { streamRef.current = streamToggle; }, [streamToggle]);

  /* ─── derived (mirrors filteredPixels + syncCounts) ─── */
  const rows = useMemo(() => items.filter(p => {
    const ql = q.toLowerCase();
    const qOK = !ql || (p.id + ' ' + p.name + ' ' + p.network + ' ' + p.pixelId).toLowerCase().includes(ql);
    const tabOK = tab === 'All' || p.status === tab;
    const netOK = networks.has(p.network);
    return qOK && tabOK && netOK;
  }), [items, q, tab, networks]);

  const liveCount = items.filter(p => p.status === 'Live').length;
  const errorCount = items.filter(p => p.status === 'Error').length;
  const ev24 = items.reduce((s, p) => s + p.events24, 0);
  const ev30 = items.reduce((s, p) => s + p.events30, 0);
  const activePixels = items.filter(p => p.events30 > 0).length;
  const lastEvent = items.reduce<string | null>((m, p) => !m || (p.lastEvent && p.lastEvent > m) ? p.lastEvent : m, null);

  const filtersActive = !!q || tab !== 'All' || networks.size !== NETWORKS.length;
  const allChecked = rows.length > 0 && rows.every(r => selected.has(r.id));
  const someChecked = rows.some(r => selected.has(r.id));
  const selectedCount = selected.size;

  const snippet = useMemo(() => buildSnippet(formNetwork, formId || 'XXXX'), [formNetwork, formId]);

  const peek = peekId ? items.find(p => p.id === peekId) : null;
  const editing = editingId ? items.find(p => p.id === editingId) : null;
  const destMeta = DESTS[destKey] || { title: 'Open destination', body: '', route: '/' + destKey };

  /* ─── handlers ─── */
  function openPeek(id: string) { setPeekId(id); setRowMenuForId(null); }
  function closePeek() { setPeekId(null); }

  function openPxDrawer(id: string | null) {
    const e = id ? itemsRef.current.find(p => p.id === id) : null;
    setEditingId(id);
    setFormName(e ? e.name : '');
    setFormStatus(e ? e.status : 'Live');
    setFormId(e ? e.pixelId : '');
    setFormInstall(e ? e.install : 'Script in <head>');
    setFormNetwork(e ? e.network : 'Meta');
    setDraftEvents(e ? e.events.map(ev => ({ ...ev })) : [
      { name: 'PageView', kind: 'standard' },
      { name: 'Purchase', kind: 'standard', valueField: 'value' },
    ]);
    setDrawerOpen(true);
    setPeekId(null);
    setRowMenuForId(null);
  }
  function closePxDrawer() { setDrawerOpen(false); setEditingId(null); }

  function clearSelftestTimers() {
    selftestTimersRef.current.forEach(t => clearTimeout(t));
    selftestTimersRef.current = [];
  }

  function runSelftest(p: Pixel) {
    clearSelftestTimers();
    setSelftestSteps([
      { text: 'running…', badge: 'pending' },
      { text: 'waiting…', badge: 'pending' },
      { text: 'waiting…', badge: 'pending' },
    ]);
    selftestTimersRef.current.push(window.setTimeout(() => {
      setSelftestSteps(s => [{ text: '✓ reachable', badge: 'ok' }, s[1], s[2]]);
      selftestTimersRef.current.push(window.setTimeout(() => {
        if (p.status === 'Error') {
          setSelftestSteps([
            { text: '✓ reachable', badge: 'ok' },
            { text: '✗ rejected', badge: 'bad' },
            { text: '✗ not delivered', badge: 'bad' },
          ]);
          const now = nowIso();
          setEvents(prev => [{ at: now, pixel: p.id, event: 'PageView', value: null, ok: false, err: 'Self-test rejected — check install' }, ...prev].slice(0, 20));
        } else {
          setSelftestSteps(s => [s[0], { text: '✓ fired', badge: 'ok' }, s[2]]);
          selftestTimersRef.current.push(window.setTimeout(() => {
            setSelftestSteps(s => [s[0], s[1], { text: '✓ acknowledged', badge: 'ok' }]);
            const now = nowIso();
            setItems(prev => prev.map(x => x.id === p.id ? { ...x, events24: x.events24 + 1, events30: x.events30 + 1, lastEvent: now } : x));
            setEvents(prev => [{ at: now, pixel: p.id, event: 'PageView', value: null, ok: true }, ...prev].slice(0, 20));
          }, 500));
        }
      }, 400));
    }, 300));
  }

  function openSelftest(id: string) {
    const p = itemsRef.current.find(x => x.id === id); if (!p) return;
    setSelftestPixelId(id);
    setSelftestPixelName(p.name);
    setSelftestOpen(true);
    runSelftest(p);
  }

  function copySnippet(p: Pixel) {
    const snip = buildSnippet(p.network, p.pixelId);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(snip).then(() => onToast('Snippet copied — paste into <head>')).catch(() => onToast('Clipboard unavailable. Snippet placed in editor.'));
    } else {
      onToast('Clipboard unavailable. Snippet placed in editor.');
    }
  }

  function rowAction(act: string, p: Pixel) {
    setRowMenuForId(null);
    switch (act) {
      case 'edit': openPxDrawer(p.id); break;
      case 'view': openPeek(p.id); break;
      case 'selftest': openSelftest(p.id); break;
      case 'snippet': copySnippet(p); break;
      case 'pause': setItems(prev => prev.map(x => x.id === p.id ? { ...x, status: 'Paused' } : x)); onToast(`Paused: ${p.name}`); break;
      case 'resume': setItems(prev => prev.map(x => x.id === p.id ? { ...x, status: 'Live' } : x)); onToast(`Resumed: ${p.name}`); break;
      case 'delete':
        if (confirm(`Delete pixel "${p.name}"?`)) {
          setItems(prev => prev.filter(x => x.id !== p.id));
          onToast(`Deleted: ${p.name}`);
        }
        break;
    }
  }

  function bulkAction(act: string) {
    if (act === 'close') { setSelected(new Set()); return; }
    const sel = [...selected];
    const n = sel.length;
    if (act === 'pause') { setItems(prev => prev.map(p => sel.includes(p.id) ? { ...p, status: 'Paused' } : p)); onToast(`Paused ${n} pixel(s)`); }
    else if (act === 'resume') { setItems(prev => prev.map(p => sel.includes(p.id) ? { ...p, status: 'Live' } : p)); onToast(`Resumed ${n} pixel(s)`); }
    else if (act === 'selftest') {
      if (sel.length) openSelftest(sel[sel.length - 1]);
      onToast(`Running self-test on ${n} pixel(s)`);
    }
    else if (act === 'delete') {
      if (confirm(`Delete ${n} pixel(s)?`)) {
        setItems(prev => prev.filter(p => !sel.includes(p.id)));
        onToast(`Deleted ${n} pixel(s)`);
      }
    }
    setSelected(new Set());
  }

  function toggleRow(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleAll() {
    if (allChecked) setSelected(prev => { const n = new Set(prev); rows.forEach(r => n.delete(r.id)); return n; });
    else setSelected(prev => { const n = new Set(prev); rows.forEach(r => n.add(r.id)); return n; });
  }

  function clearAllFilters() {
    setQ(''); setTab('All');
    setNetworks(new Set(NETWORKS as readonly string[]));
    setDraftNetworks(new Set(NETWORKS as readonly string[]));
  }

  function applySavedView(v: SavedView) {
    setTab(v.tab);
    setQ(v.q);
    setNetworks(new Set(v.networks));
    setDraftNetworks(new Set(v.networks));
    setPopSavedOpen(false);
    onToast('Applied view: ' + v.name);
  }
  function deleteSavedView(id: string) {
    setSavedViews(prev => prev.filter(v => v.id !== id));
    onToast('View deleted');
  }
  function saveCurrentView() {
    const name = saveViewName.trim();
    if (!name) { onToast('Name is required'); return; }
    setSavedViews(prev => [...prev, { id: 'sv-' + Date.now(), name, tab, q, networks: [...networks] }]);
    setSaveViewOpen(false);
    setSaveViewName('');
    onToast('Saved view: ' + name);
  }

  function openDest(key: string) {
    setDestKey(key);
    setDestOpen(true);
  }

  function collectPixel(): Pixel | null {
    const name = formName.trim();
    if (!name) { onToast('Pixel name is required'); return null; }
    const id = formId.trim();
    if (!id) { onToast('Pixel ID is required'); return null; }
    const e = editingId ? itemsRef.current.find(p => p.id === editingId) : null;
    return {
      id: e ? e.id : 'PX-' + String(itemsRef.current.length + 101).slice(-3),
      name,
      network: formNetwork,
      pixelId: id,
      install: formInstall,
      status: formStatus,
      events24: e ? e.events24 : 0,
      events30: e ? e.events30 : 0,
      lastEvent: e ? e.lastEvent : null,
      events: draftEvents.map(ev => ({ ...ev })),
    };
  }
  function save() {
    const p = collectPixel(); if (!p) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = p; return n; } return prev; }
      return [p, ...prev];
    });
    closePxDrawer();
    onToast(editingId ? 'Pixel updated' : 'Pixel created');
  }
  function saveAndNew() {
    const p = collectPixel(); if (!p) return;
    setItems(prev => {
      if (editingId) { const i = prev.findIndex(x => x.id === editingId); if (i >= 0) { const n = [...prev]; n[i] = p; return n; } return prev; }
      return [p, ...prev];
    });
    setEditingId(null);
    setFormName('');
    setFormId('');
    setDraftEvents([
      { name: 'PageView', kind: 'standard' },
      { name: 'Purchase', kind: 'standard', valueField: 'value' },
    ]);
    onToast('Saved. New pixel form ready.');
  }

  function handleExportEvents() {
    const exportRows = events.map(ev => {
      const p = items.find(x => x.id === ev.pixel);
      return {
        at: ev.at,
        pixel: ev.pixel,
        pixel_name: p ? p.name : '',
        event: ev.event,
        value: ev.value ?? '',
        ok: ev.ok,
        error: ev.err || '',
      } as Record<string, unknown>;
    });
    exportToCsv(exportRows, [
      { key: 'at', label: 'at' },
      { key: 'pixel', label: 'pixel' },
      { key: 'pixel_name', label: 'pixel_name' },
      { key: 'event', label: 'event' },
      { key: 'value', label: 'value' },
      { key: 'ok', label: 'ok' },
      { key: 'error', label: 'error' },
    ], 'pixel-events');
    onToast('Exported events CSV');
  }

  /* ─── effects: synthetic stream + flash reset + cleanup ─── */
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!streamRef.current) return;
      const live = itemsRef.current.filter(p => p.status === 'Live');
      if (!live.length) return;
      const p = live[Math.floor(Math.random() * live.length)];
      const ev = p.events[Math.floor(Math.random() * p.events.length)];
      const value = ev.valueField ? Math.round((10 + Math.random() * 90) * 100) / 100 : null;
      const now = nowIso();
      setEvents(prev => [{ at: now, pixel: p.id, event: ev.name, value, ok: true }, ...prev].slice(0, 20));
      setItems(prev => prev.map(x => x.id === p.id ? { ...x, events24: x.events24 + 1, events30: x.events30 + 1, lastEvent: now } : x));
      setFlashNewest(true);
      const isPurchase = /purchase|completepayment|add_to_cart|addtocart/i.test(ev.name);
      if (isPurchase && value != null) onToast(`${p.name} fired ${ev.name} · $${value.toFixed(2)}`);
    }, 3000);
    return () => clearInterval(t);
  }, [onToast]);

  useEffect(() => {
    if (!flashNewest) return;
    const t = window.setTimeout(() => setFlashNewest(false), 1000);
    return () => clearTimeout(t);
  }, [flashNewest]);

  useEffect(() => () => clearSelftestTimers(), []);

  /* selftest step notes (computed from current pixel) */
  const selftestPixel = selftestPixelId ? items.find(p => p.id === selftestPixelId) : null;

  return (
    <main className="px-6 pb-12">

      {/* ─── BREADCRUMB ─── */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Advertising</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Pixels</span>
      </div>

      {/* ─── PAGE HEADER ─── */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Pixels</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Ad-network conversion pixels installed on your storefront, and the events they fire into Meta / TikTok / Google Ads / Pinterest.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => openDest('event-volume')}>
            <span className="material-symbols-outlined text-[16px]">bar_chart</span>Event volume in Reports
          </button>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExportEvents}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export events
          </button>
          <div className="flex">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" onClick={() => openPxDrawer(null)}>
              <span className="material-symbols-outlined text-[16px]">add</span>New pixel
            </button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={() => setCreateMenuOpen(v => !v)}>
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── INFO BANNER ─── */}
      <div className="bg-surface-container-low border border-outline-variant rounded-xl p-3 mb-4 flex items-start gap-3">
        <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">info</span>
        <div className="text-body-sm text-on-surface-variant flex-1">
          <span className="font-semibold text-on-surface">Ad-network conversion pixels only.</span>
          This page manages the pixels that fire purchase and cart events back to <span className="font-semibold">Meta, TikTok, Google Ads, and Pinterest</span> for attribution and retargeting.
          <span className="block mt-1">
            Installing <span className="font-semibold">GA4, PostHog, Microsoft Clarity, Hotjar, Segment, or GTM containers</span> is a <span className="font-semibold">product analytics</span> concern — those installs live in
            <button className="fin-link" type="button" onClick={() => openDest('integrations')}><span className="material-symbols-outlined">open_in_new</span>Settings → Integrations</button>.
          </span>
        </div>
      </div>

      {/* ─── KPI STRIP ─── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Pixels installed</div>
          <div className="text-headline-sm mt-1 tabular-nums">{items.length}</div>
          <div className="pill-note">{liveCount} live · {errorCount} error</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Events (24h)</div>
          <div className="text-headline-sm mt-1 tabular-nums text-secondary">{fmt(ev24)}</div>
          <div className="pill-note">Received by webhook</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Events (30d)</div>
          <div className="text-headline-sm mt-1 tabular-nums">{fmt(ev30)}</div>
          <div className="pill-note">Across {activePixels} active pixels</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Last self-test</div>
          <div className="text-headline-sm mt-1 tabular-nums">{lastEvent ? fmtDate(lastEvent) : 'Never'}</div>
          <div className="pill-note">{lastEvent ? 'Most recent event' : 'Run self-test'}</div>
        </div>
      </div>

      {/* ════════ PIXELS LIST ════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden mb-4">
        {/* status tabs */}
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          {['All', 'Live', 'Paused', 'Error'].map(t => (
            <button key={t} className={`h-full px-3 text-label-md tab-underline ${tab === t ? 'active' : 'text-on-surface-variant'}`} onClick={() => { setTab(t); setSelected(new Set()); }}>{t}</button>
          ))}
        </div>

        {/* filter bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Filter pixels…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          {/* Network popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopNetworkOpen(v => !v); setPopSavedOpen(false); }}>
              <span className="material-symbols-outlined text-[14px]">hub</span>Network
            </button>
            {popNetworkOpen && (
              <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 220 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Filter by network</div>
                {NETWORKS.map(n => (
                  <label key={n} className="flex items-center gap-2 px-2 py-1 text-body-sm">
                    <input type="checkbox" checked={draftNetworks.has(n)} onChange={() => { const next = new Set(draftNetworks); if (next.has(n)) next.delete(n); else next.add(n); setDraftNetworks(next); }} />{netLabel(n)}
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
          {/* Saved views popover */}
          <div className="relative">
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={e => { e.stopPropagation(); setPopSavedOpen(v => !v); setPopNetworkOpen(false); }}>
              <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views
            </button>
            {popSavedOpen && (
              <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 240 }} onClick={e => e.stopPropagation()}>
                <div className="menu-header">Saved views</div>
                <div className="max-h-[220px] overflow-y-auto">
                  {savedViews.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-on-surface-variant">No saved views yet.</div>
                  ) : savedViews.map(v => (
                    <div key={v.id} className="w-full px-3 py-1.5 hover:bg-surface-container-low flex items-center gap-2">
                      <button className="flex-1 text-left flex items-center gap-2" onClick={() => applySavedView(v)}>
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">bookmark</span>
                        <span className="truncate">{v.name}</span>
                      </button>
                      <button className="w-5 h-5 rounded hover:bg-surface-container flex items-center justify-center" onClick={e => { e.stopPropagation(); deleteSavedView(v.id); }}><span className="material-symbols-outlined text-[14px] text-outline">close</span></button>
                    </div>
                  ))}
                </div>
                <div className="sep"></div>
                <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2 text-primary font-semibold" onClick={() => { setPopSavedOpen(false); setSaveViewName(''); setSaveViewOpen(true); }}>
                  <span className="material-symbols-outlined text-[16px]">bookmark_add</span>Save current view…
                </button>
              </div>
            )}
          </div>
          <button className={`h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 ${filtersActive ? '' : 'hidden-imp'}`} onClick={clearAllFilters}>
            <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>Clear all
          </button>
          <span className="ml-auto text-[11px] text-on-surface-variant">{rows.length} of {items.length}</span>
        </div>

        {/* Bulk bar */}
        {selectedCount > 0 && (
          <div className="bulk-bar show">
            <span className="text-[12px] font-semibold">{selectedCount} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('pause')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">pause_circle</span>Pause</button>
            <button onClick={() => bulkAction('resume')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">play_circle</span>Resume</button>
            <button onClick={() => bulkAction('selftest')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">science</span>Run self-test</button>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('delete')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
            <button className="ml-auto" onClick={() => bulkAction('close')}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>
        )}

        {/* Table */}
        {rows.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
              <span className="material-symbols-outlined text-[28px] text-outline">sensors</span>
            </div>
            <h3 className="text-headline-sm mb-1">No pixels match</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Clear filters or install a new pixel.</p>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={clearAllFilters}>Clear filters</button>
          </div>
        ) : (
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={toggleAll} /></th>
                <th className="px-3 py-2">Pixel</th>
                <th className="px-3 py-2">Network</th>
                <th className="px-3 py-2">Pixel ID</th>
                <th className="px-3 py-2">Install</th>
                <th className="px-3 py-2 text-right">Events (24h)</th>
                <th className="px-3 py-2 text-right">Events (30d)</th>
                <th className="px-3 py-2">Last event</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {rows.map(p => {
                const installClass = p.install.startsWith('Server') ? 'text-qb-teal' : p.install === 'GTM container' ? 'text-qb-blue' : 'text-on-surface';
                return (
                  <tr key={p.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openPeek(p.id)}>
                    <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={selected.has(p.id)} onClick={e => e.stopPropagation()} onChange={() => toggleRow(p.id)} /></td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={iconClass(p.network)}>{p.network.slice(0, 2).toUpperCase()}</div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-[11px] text-on-surface-variant">{p.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">{netChip(p.network)}</td>
                    <td className="px-3 py-2"><span className="code-mono">{p.pixelId}</span></td>
                    <td className={`px-3 py-2 text-[11px] ${installClass}`}>{p.install}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.events24 ? fmt(p.events24) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.events30 ? fmt(p.events30) : '—'}</td>
                    <td className="px-3 py-2 text-[11px]">{fmtDate(p.lastEvent)}</td>
                    <td className="px-3 py-2">{pill(p.status)}</td>
                    <td className="px-2 py-2 text-right relative">
                      <button className="w-7 h-7 rounded border border-surface-dim hover:bg-surface-container flex items-center justify-center mx-auto" title="Row actions" onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === p.id ? null : p.id); }}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span></button>
                      {rowMenuForId === p.id && (
                        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={e => e.stopPropagation()}>
                          <div className="menu-header">This pixel</div>
                          <button onClick={() => rowAction('edit', p)}><span className="material-symbols-outlined">edit</span>Edit pixel</button>
                          <button onClick={() => rowAction('view', p)}><span className="material-symbols-outlined">visibility</span>View details</button>
                          <button onClick={() => rowAction('selftest', p)}><span className="material-symbols-outlined">science</span>Run self-test</button>
                          <button onClick={() => rowAction('snippet', p)}><span className="material-symbols-outlined">code</span>Copy install snippet</button>
                          <div className="sep"></div>
                          <div className="menu-header">Status</div>
                          <button onClick={() => rowAction('pause', p)}><span className="material-symbols-outlined">pause_circle</span>Pause</button>
                          <button onClick={() => rowAction('resume', p)}><span className="material-symbols-outlined">play_circle</span>Resume</button>
                          <div className="sep"></div>
                          <button className="danger" onClick={() => rowAction('delete', p)}><span className="material-symbols-outlined">delete</span>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
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

      {/* ─── RECENT EVENTS ─── */}
      <div className="bg-white rounded-xl border border-surface-dim">
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
          <div>
            <h2 className="text-headline-sm">Recent events</h2>
            <div className="text-[11px] text-on-surface-variant">Live stream from the webhook. New events appear automatically while the page is open.</div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[11px] text-on-surface-variant">
              <input type="checkbox" className="row-check" checked={streamToggle} onChange={e => setStreamToggle(e.target.checked)} />
              Auto-refresh (3s)
            </label>
            <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => { setFlashNewest(false); onToast('Events refreshed'); }}>
              <span className="material-symbols-outlined text-[14px]">refresh</span>Refresh
            </button>
          </div>
        </div>
        <div className="p-4">
          {events.length === 0 ? (
            <div className="text-[11px] text-on-surface-variant">No events received yet.</div>
          ) : events.slice(0, 20).map((ev, idx) => {
            const p = items.find(x => x.id === ev.pixel);
            const pixelName = p ? p.name : ev.pixel;
            return (
              <div key={ev.at + ':' + idx} className={`event-row ${flashNewest && idx === 0 ? 'new-flash' : ''}`}>
                <span className="code-mono text-[11px] text-on-surface-variant w-[130px] shrink-0">{fmtDate(ev.at)}</span>
                <span className={`event-tag ${ev.ok ? '' : 'bad'}`}>{ev.ok ? 'ok' : 'error'}</span>
                <span className="text-body-sm font-medium flex-1 truncate">{ev.event}</span>
                <span className="text-[11px] text-on-surface-variant truncate">{pixelName}</span>
                <span className="text-[11px] tabular-nums">{ev.value != null ? '$' + ev.value.toFixed(2) : ''}</span>
                {ev.err ? <span className="text-[11px] text-error truncate">{ev.err}</span> : <span className="w-[0px]"></span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Click-away catcher for row menu + popovers + create menu */}
      {(rowMenuForId || popNetworkOpen || popSavedOpen || createMenuOpen) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => { setRowMenuForId(null); setPopNetworkOpen(false); setPopSavedOpen(false); setCreateMenuOpen(false); }} />
      )}

      {/* Scrim + peek drawer */}
      {peek && !drawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={closePeek} />
          <div className="peek open">
            <div className="flex items-center justify-between px-4 h-12 border-b border-surface-dim bg-surface-container-low shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">sensors</span>
                <span className="text-headline-sm truncate">{peek.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="h-7 px-2.5 rounded bg-primary text-white text-label-sm hover:bg-primary-container flex items-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); openPxDrawer(id); }}><span className="material-symbols-outlined text-[14px]">edit</span>Edit</button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={closePeek}><span className="material-symbols-outlined text-[18px]">close</span></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 text-body-sm">
              <div className="mb-3 flex items-center gap-2">{pill(peek.status)}{netChip(peek.network)}</div>
              <div className="bg-surface-container-low rounded-lg p-3 mb-3 grid grid-cols-2 gap-2 text-center">
                <div><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Events (24h)</div><div className="text-body-md font-semibold tabular-nums">{fmt(peek.events24)}</div></div>
                <div><div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Events (30d)</div><div className="text-body-md font-semibold tabular-nums">{fmt(peek.events30)}</div></div>
              </div>
              <dl className="text-body-sm">
                <div className="kv"><dt>Pixel ID</dt><dd className="code-mono">{peek.pixelId}</dd></div>
                <div className="kv"><dt>Install method</dt><dd>{peek.install}</dd></div>
                <div className="kv"><dt>Last event</dt><dd>{fmtDate(peek.lastEvent)}</dd></div>
              </dl>
              <div className="mt-4 pt-3 border-t border-surface-dim">
                <div className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold mb-2">Events fired</div>
                <div className="space-y-1">
                  {peek.events.map((ev, i) => (
                    <div key={i} className="event-row">
                      <span className="event-tag">standard</span>
                      <span className="text-body-sm flex-1">{ev.name}</span>
                      {ev.valueField ? <span className="text-[11px] text-on-surface-variant">value: <span className="code-mono">{ev.valueField}</span></span> : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-surface-dim grid grid-cols-2 gap-2">
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center justify-center gap-1" onClick={() => { const id = peek.id; setPeekId(null); openPxDrawer(id); }}><span className="material-symbols-outlined text-[16px]">edit</span>Edit</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => openSelftest(peek.id)}><span className="material-symbols-outlined text-[16px]">science</span>Self-test</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => copySnippet(peek)}><span className="material-symbols-outlined text-[16px]">code</span>Snippet</button>
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => openDest('reports')}><span className="material-symbols-outlined text-[16px]">bar_chart</span>Reports</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Pixel editor drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={closePxDrawer} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">sensors</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">{editingId ? 'Edit pixel' : 'New pixel'}</div>
                  <div className="text-[11px] text-on-surface-variant">{editing ? `${editing.status} · ${editing.id}` : 'Draft · not yet installed'}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closePxDrawer}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Network */}
              <section>
                <div className="section-h">Network</div>
                <div className="grid grid-cols-2 gap-2">
                  {NETWORKS.map(n => (
                    <div key={n} className={`channel-tile ${formNetwork === n ? 'selected' : ''}`} onClick={() => setFormNetwork(n)}>
                      <div className={`px-icon ${iconKind(n)}`}>{n.slice(0, 2).toUpperCase()}</div>
                      <div className="min-w-0"><div className="text-body-sm font-semibold">{n === 'Meta' ? 'Meta Pixel' : n === 'TikTok' ? 'TikTok Pixel' : n === 'GoogleAds' ? 'Google Ads tag' : 'Pinterest Tag'}</div><div className="text-[10px] text-on-surface-variant">{n === 'Meta' ? 'Facebook + Instagram' : n === 'TikTok' ? 'TikTok Ads' : n === 'GoogleAds' ? 'gtag / AW-… · not GA4' : 'Pinterest Ads'}</div></div>
                    </div>
                  ))}
                  <div className="channel-tile disabled" title="GA4, PostHog, Clarity, Segment, GTM containers belong in Settings → Integrations." onClick={() => openDest('integrations')}>
                    <div className="px-icon" style={{ background: '#f4f3f7', color: '#8a938c' }}>+</div>
                    <div className="min-w-0"><div className="text-body-sm font-semibold text-on-surface-variant">Analytics pixels</div><div className="text-[10px] text-on-surface-variant">GA4 / PostHog / Clarity → Settings</div></div>
                  </div>
                </div>
              </section>

              {/* Pixel basics */}
              <section>
                <div className="section-h">Pixel basics</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Pixel name</label>
                    <input className="field-input" placeholder="e.g. Meta Pixel — Storefront" value={formName} onChange={e => setFormName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="field-label">Status</label>
                      <select className="field-input" value={formStatus} onChange={e => setFormStatus(e.target.value)}>
                        <option>Live</option><option>Paused</option><option>Error</option>
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Install method</label>
                      <select className="field-input" value={formInstall} onChange={e => setFormInstall(e.target.value)}>
                        <option>Script in &lt;head&gt;</option>
                        <option>GTM container</option>
                        <option>Shopify app</option>
                        <option>Server-side (CAPI / Events API)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Pixel ID</label>
                    <input className="field-input code-mono" placeholder="e.g. 1029XXXXXXXX4471" value={formId} onChange={e => setFormId(e.target.value)} />
                  </div>
                </div>
              </section>

              {/* Events fired */}
              <section>
                <div className="section-h flex items-center justify-between">
                  <span>Events fired</span>
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => setDraftEvents(prev => [...prev, { name: 'NewEvent', kind: 'standard' }])}>
                    <span className="material-symbols-outlined text-[14px]">add</span>Add event
                  </button>
                </div>
                <div className="space-y-1">
                  {draftEvents.length === 0 ? (
                    <div className="text-[11px] text-on-surface-variant">No events configured.</div>
                  ) : draftEvents.map((ev, i) => (
                    <div key={i} className="flex items-center gap-2 py-1">
                      <input className="flex-1 h-8 px-2 border border-surface-dim rounded text-[12px]" placeholder="Event name" value={ev.name} onChange={e => setDraftEvents(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                      <input className="flex-1 h-8 px-2 border border-surface-dim rounded text-[12px]" placeholder="value field (optional)" value={ev.valueField || ''} onChange={e => setDraftEvents(prev => prev.map((x, j) => j === i ? { ...x, valueField: e.target.value } : x))} />
                      <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDraftEvents(prev => prev.filter((_, j) => j !== i))}><span className="material-symbols-outlined text-[14px] text-error">close</span></button>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-2">
                  Purchase events are posted to Finance as a conversion and attached to the matching journal entry for the period.
                </div>
              </section>

              {/* Install snippet */}
              <section>
                <div className="section-h">Install snippet</div>
                <div className="space-y-2">
                  <div className="text-[11px] text-on-surface-variant">Paste into the &lt;head&gt; of every page where the pixel should fire.</div>
                  <textarea className="field-textarea" readOnly value={snippet} rows={10} />
                  <div className="flex items-center gap-2">
                    <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => {
                      if (navigator.clipboard) { navigator.clipboard.writeText(snippet).then(() => onToast('Snippet copied')).catch(() => onToast('Copy failed — select and copy manually')); }
                      else onToast('Copy failed — select and copy manually');
                    }}>
                      <span className="material-symbols-outlined text-[14px]">content_copy</span>Copy snippet
                    </button>
                    <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => { if (editingId) openSelftest(editingId); else onToast('Save the pixel first, then run a self-test'); }}>
                      <span className="material-symbols-outlined text-[14px]">science</span>Send test event
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={closePxDrawer}>Cancel</button>
              <div className="flex items-center gap-2">
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low" onClick={saveAndNew}>Save and new</button>
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={save}>Save and close</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Self-test modal */}
      {selftestOpen && (
        <div className="modal-scrim open" onClick={() => { setSelftestOpen(false); clearSelftestTimers(); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-headline-sm">Self-test</h3>
              <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => { setSelftestOpen(false); clearSelftestTimers(); }}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
            <p className="text-body-sm text-on-surface-variant mb-3">Sending a synthetic <span className="code-mono">PageView</span> to <span className="font-semibold text-on-surface">{selftestPixelName}</span>…</p>
            <div className="space-y-2">
              <div className="p-3 rounded border border-outline-variant bg-surface-container-low text-body-sm">
                <div className="flex items-center justify-between mb-1"><span className="text-on-surface-variant">Step 1 — reachability</span><span className={`selftest-badge ${selftestSteps[0].badge}`}>{selftestSteps[0].text}</span></div>
                <div className="text-[11px] text-on-surface-variant">Contacting {selftestPixel ? netLabel(selftestPixel.network) : ''} endpoint for {selftestPixel ? selftestPixel.pixelId : ''}</div>
              </div>
              <div className="p-3 rounded border border-outline-variant bg-surface-container-low text-body-sm">
                <div className="flex items-center justify-between mb-1"><span className="text-on-surface-variant">Step 2 — synthetic event</span><span className={`selftest-badge ${selftestSteps[1].badge}`}>{selftestSteps[1].text}</span></div>
                <div className="text-[11px] text-on-surface-variant">Sending <span className="code-mono">PageView</span></div>
              </div>
              <div className="p-3 rounded border border-outline-variant bg-surface-container-low text-body-sm">
                <div className="flex items-center justify-between mb-1"><span className="text-on-surface-variant">Step 3 — delivery</span><span className={`selftest-badge ${selftestSteps[2].badge}`}>{selftestSteps[2].text}</span></div>
                <div className="text-[11px] text-on-surface-variant">Confirming the event was accepted by the network</div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => { setSelftestOpen(false); clearSelftestTimers(); }}>Close</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => { const p = items.find(x => x.id === selftestPixelId); if (p) runSelftest(p); }}>Run again</button>
            </div>
          </div>
        </div>
      )}

      {/* Destination modal */}
      {destOpen && (
        <div className="modal-scrim open" onClick={() => setDestOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">{destMeta.title}</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">{destMeta.body}</p>
            <div className="p-3 rounded border border-outline-variant bg-surface-container-low text-[11px] code-mono mb-3">{destMeta.route}</div>
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setDestOpen(false)}>Close</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => { setDestOpen(false); onToast('Navigating: ' + destMeta.route); }}>Open</button>
            </div>
          </div>
        </div>
      )}

      {/* Save view modal */}
      {saveViewOpen && (
        <div className="modal-scrim open" onClick={() => setSaveViewOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Save current view</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Name this combination of filters so you can reuse it.</p>
            <input className="field-input mb-3" placeholder="e.g. Error pixels only" value={saveViewName} onChange={e => setSaveViewName(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setSaveViewOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={saveCurrentView}>Save view</button>
            </div>
          </div>
        </div>
      )}

      {/* Create split menu */}
      {createMenuOpen && (
        <div className="row-menu open" style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4 }} onClick={() => setCreateMenuOpen(false)}>
          <div className="menu-header">New</div>
          <button onClick={() => { setCreateMenuOpen(false); openPxDrawer(null); }}><span className="material-symbols-outlined">sensors</span>Pixel</button>
          <button onClick={() => { setCreateMenuOpen(false); openDest('pick-from-network'); }}><span className="material-symbols-outlined">download</span>Pick from network</button>
        </div>
      )}
    </main>
  );
}
