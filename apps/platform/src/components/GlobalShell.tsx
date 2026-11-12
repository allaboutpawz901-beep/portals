'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DOMAINS,
  DRAWER_FIELDS,
  DemoRow,
  DomainKey,
  PINNED,
  findScreen,
  screensOf,
} from '@/data/shellData';
import Header, { WorkspaceTab } from './Header';
import MainRail from './MainRail';
import SideRail from './SideRail';
import ScreenContent from './ScreenContent';
import PeekDrawer from './PeekDrawer';
import RecordDrawer from './RecordDrawer';
import StudioDrawer from './StudioDrawer';
import DocumentEngine, { DocTabType } from './DocumentEngine';
import PaymentModal, { type PaymentPrefill } from './PaymentModal';
import PartyFormDrawer from './contacts/PartyFormDrawer';
import { usePlatformStore, type DocumentType, type PartyRole } from '@/lib/platformStore';
import { supabaseRecordToStoreParty, type SupabasePartyRecord } from '@/lib/partyMirror';
import { useLiveQueueBadges } from '@/hooks/useQueueApi';
import { useStoredJson, useStoredString } from '@/hooks/useStoredPref';
import CreateFlyout from './CreateFlyout';
import NavigationHubFlyout from './NavigationHubFlyout';
import {
  DEFAULT_FAVORITE_IDS,
  FAVORITES_STORAGE_KEY,
  QuickActionsDrawer,
} from './QuickActionsDrawer';
import { FavoritesFlyout, PinMode, BookmarkEntry } from './FavoritesFlyout';
import Toast from './Toast';
import {
  DashboardOverlays,
  useDashboardController,
} from './dashboard/DashboardScreens';
import { useDesignCanvas, type DrawerId, type StudioView } from '@/lib/designCanvasStore';

function buildWorkspaceTab(domain: DomainKey, screenId: string): WorkspaceTab {
  const scr = findScreen(domain, screenId);
  const label = scr.label === 'Overview' ? `${scr.group} · Overview` : scr.label;
  return {
    key: `${domain}:${scr.id}`,
    domain,
    screenId: scr.id,
    label,
  };
}

/** Case-insensitive key lookup for the create-routing maps. Callers pass
 *  their own casing ('Payment Link' from the profile TXN menu vs
 *  'Payment link' in the registry) — one canonical key per action,
 *  regardless of who's asking. Whitespace is collapsed too. */
function ciKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
function ciLookup<T>(map: Record<string, T>, key: string): T | undefined {
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  const lk = ciKey(key);
  for (const k of Object.keys(map)) {
    if (ciKey(k) === lk) return map[k];
  }
  return undefined;
}

function createInitialOpenGroups(): Record<DomainKey, string[]> {
  const initial = {} as Record<DomainKey, string[]>;
  for (const key of PINNED) {
    initial[key] = [DOMAINS[key].groups[0].name];
  }
  initial.dashboard = ['Overview', 'Analytics', 'Queues'];
  initial.finance = [
    'Accounting',
    'Sales',
    'Expenses & Bills',
    'Business Tax',
    'Cap Table',
  ];
  initial.design = [
    'Studio',
    'Catalog',
    'My products',
    'My orders',
    'Create wizard',
  ];
  return initial;
}

// ── Dual pin (bookmark | favorite) persistence ──
const PIN_MODE_STORAGE_KEY = 'unsaid.rail.pinmode.v1';
const BOOKMARKS_STORAGE_KEY = 'unsaid.rail.bookmarks.v1';

const DEFAULT_BOOKMARKS: BookmarkEntry[] = [
  { domain: 'dashboard', screen: 'ops' },
  { domain: 'orders', screen: 'orders' },
  { domain: 'reports', screen: 'reports-overview' },
  { domain: 'finance', screen: 'coa' },
];

/* Bookmark validation — only entries pointing at real domains survive. */
function isValidBookmarkList(v: unknown): boolean {
  return Array.isArray(v);
}
function sanitizeBookmarks(list: BookmarkEntry[]): BookmarkEntry[] {
  return list.filter(
    (b): b is BookmarkEntry =>
      b &&
      typeof b.domain === 'string' &&
      typeof b.screen === 'string' &&
      !!DOMAINS[b.domain as DomainKey]
  );
}

function isNonEmptyStringArray(v: unknown): boolean {
  return Array.isArray(v) && v.every(x => typeof x === 'string');
}

export default function GlobalShell() {
  const dashboardController = useDashboardController();
  // Live sidebar badges — real queue counts from Supabase override the
  // controller's local placeholder numbers once the background fetch lands.
  const liveQueueBadges = useLiveQueueBadges();
  const {
    closeSetupWizard,
    setCustomizeCreateOpen,
    setContractorModalOpen,
    setQuickTaskModalOpen,
  } = dashboardController;
  const [activeDomain, setActiveDomain] = useState<DomainKey>('dashboard');
  const [activeScreen, setActiveScreen] = useState<string>('ops');
  const [openTabs, setOpenTabs] = useState<WorkspaceTab[]>(() => [
    buildWorkspaceTab('dashboard', 'ops'),
  ]);
  const [openGroupsByDomain, setOpenGroupsByDomain] = useState<
    Record<DomainKey, string[]>
  >(createInitialOpenGroups);
  const [sideFilter, setSideFilter] = useState<string>('');
  const [sideRailCollapsed, setSideRailCollapsed] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'business' | 'accountant'>('business');

  // Full-screen focus mode — frees the page from sidebar + tab bar.
  const [focusMode, setFocusMode] = useState<boolean>(false);

  // Overlays & Drawers
  const [peekOpen, setPeekOpen] = useState<boolean>(false);
  const [peekRow, setPeekRow] = useState<DemoRow | null>(null);

  const [recordDrawerOpen, setRecordDrawerOpen] = useState<boolean>(false);
  const [recordKind, setRecordKind] = useState<string>('Invoice');
  const [recordRole, setRecordRole] = useState<PartyRole | null>(null);
  const [recordInit, setRecordInit] = useState<Record<string, unknown> | null>(null);
  const [recordSessionKey, setRecordSessionKey] = useState<number>(0);
  // Canonical party create (global Create flyout / quick actions) for roles
  // that live in real Supabase tables — the SAME PartyFormDrawer every
  // Contacts screen uses. Writes go to POST /api/parties, never a phantom
  // localStorage-only record.
  const [partyFormRole, setPartyFormRole] = useState<PartyRole | null>(null);
  // Design studio tool drawers (Upload / AI / Add text / …) — sidebar items
  // of type 'drawer' open these instead of workspace tabs.
  const [studioDrawerOpen, setStudioDrawerOpen] = useState<boolean>(false);
  const [studioDrawerKind, setStudioDrawerKind] = useState<string>('Upload');
  // Create Wizard prefill — when the wizard icon next to a catalog child is
  // clicked, we navigate to the wizard screen with the category/subcategory
  // pre-selected.
  const [wizardPrefill, setWizardPrefill] = useState<{ category: string; subcategory?: string } | null>(null);

  const [docEngineOpen, setDocEngineOpen] = useState<boolean>(false);
  const [docTab, setDocTab] = useState<DocTabType>('edit');
  const [docType, setDocType] = useState<DocumentType>('Invoice');
  const [docId, setDocId] = useState<string | null>(null);
  // Prefill: when a document is created FROM a party record (profile page,
  // row menu), the engine opens with that party already selected.
  const [docPartyId, setDocPartyId] = useState<string | null>(null);
  const store = usePlatformStore();

  // Payment modal — opened from a customer profile's New Transaction →
  // Payment (or the row-menu Receive payment). Opens a focused payment
  // form (amount, method, apply-to-invoice, deposit-to) instead of the
  // DocumentEngine — the user isn't creating an invoice, they're
  // recording money received.
  const [paymentModalOpen, setPaymentModalOpen] = useState<boolean>(false);
  const [paymentPrefill, setPaymentPrefill] = useState<PaymentPrefill | null>(null);

  const [createFlyoutOpen, setCreateFlyoutOpen] = useState<boolean>(false);
  const [navigationHubOpen, setNavigationHubOpen] = useState<boolean>(false);
  const [quickActionsDrawerOpen, setQuickActionsDrawerOpen] = useState<boolean>(false);
  const [favoritesFlyoutOpen, setFavoritesFlyoutOpen] = useState<boolean>(false);

  // Persisted UI prefs (localStorage) via useSyncExternalStore — the
  // hydration-safe primitive. Server + hydration render use the defaults;
  // the stored values stream in right after hydration. No mismatch, and no
  // setState-in-effect.
  const [favoriteIds, setFavoriteIds] = useStoredJson<string[]>(
    FAVORITES_STORAGE_KEY,
    DEFAULT_FAVORITE_IDS,
    isNonEmptyStringArray,
  );
  const [pinMode, setPinMode] = useStoredString<PinMode>(
    PIN_MODE_STORAGE_KEY,
    'bookmarks',
    (v) => v === 'bookmarks' || v === 'favorites',
  );
  const [railBookmarks, setRailBookmarks] = useStoredJson<BookmarkEntry[]>(
    BOOKMARKS_STORAGE_KEY,
    DEFAULT_BOOKMARKS,
    isValidBookmarkList,
    sanitizeBookmarks,
  );

  // Toast
  const [toastMsg, setToastMsg] = useState<string>('');
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (createFlyoutOpen || docEngineOpen || quickActionsDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else if (!recordDrawerOpen && !studioDrawerOpen && !peekOpen) {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [createFlyoutOpen, navigationHubOpen, docEngineOpen, quickActionsDrawerOpen, recordDrawerOpen, studioDrawerOpen, peekOpen]);

  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      void e;
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  // When the session opens a drawer (openStudio with a drawer, or a tool
  // inside the Studio), open the StudioDrawer overlay with that kind.
  // The overlay is the drawer host; the store is the single source.
  useEffect(() => {
    const drawerLabel: Record<DrawerId, string> = {
      upload: 'Upload',
      ai: 'AI',
      text: 'Text',
      images: 'Images',
      graphics: 'Graphics',
      colors: 'Colors',
      library: 'My library',
      templates: 'My templates',
      inspiration: 'Inspiration',
    };
    const unsub = useDesignCanvas.subscribe((state) => {
      if (state.openDrawer) {
        const label = drawerLabel[state.openDrawer];
        if (label && (!studioDrawerOpen || studioDrawerKind !== label)) {
          setStudioDrawerKind(label);
          setStudioDrawerOpen(true);
        }
      }
    });
    return () => unsub();
  }, [studioDrawerOpen, studioDrawerKind]);

  // When a top-bar category is clicked (sets supplierCategory in the store),
  // open the StudioDrawer with the Supplier inspector kind — only on the
  // CHANGE, never on an unrelated store update (that re-opened the drawer
  // after the user closed it).
  useEffect(() => {
    let lastKey: string | null = null;
    const unsub = useDesignCanvas.subscribe((state) => {
      const key = state.supplierCategory
        ? `${state.supplierCategory.category}/${state.supplierCategory.subcategory}`
        : null;
      if (key && key !== lastKey) {
        lastKey = key;
        setStudioDrawerKind('Supplier');
        setStudioDrawerOpen(true);
      }
      if (!key) lastKey = null;
    });
    return () => unsub();
  }, []);

  // When the Design Queue button is clicked on the canvas top bar,
  // open the StudioDrawer with the Queue kind.
  useEffect(() => {
    const handler = () => {
      setStudioDrawerKind('Queue');
      setStudioDrawerOpen(true);
    };
    window.addEventListener('open-studio-queue', handler);
    return () => window.removeEventListener('open-studio-queue', handler);
  }, []);

  // When a queued product is clicked in the queue drawer, switch the
  // drawer kind to 'Supplier' (variant drawer).
  useEffect(() => {
    const handler = (e: Event) => {
      const kind = (e as CustomEvent).detail as string;
      setStudioDrawerKind(kind);
    };
    window.addEventListener('switch-studio-kind', handler);
    return () => window.removeEventListener('switch-studio-kind', handler);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const anyOverlayOpen =
          createFlyoutOpen ||
          navigationHubOpen ||
          quickActionsDrawerOpen ||
          favoritesFlyoutOpen ||
          docEngineOpen ||
          recordDrawerOpen ||
          studioDrawerOpen ||
          peekOpen;
        setCreateFlyoutOpen(false);
        setNavigationHubOpen(false);
        setQuickActionsDrawerOpen(false);
        setFavoritesFlyoutOpen(false);
        setDocEngineOpen(false);
        setRecordDrawerOpen(false);
        setStudioDrawerOpen(false);
        setPeekOpen(false);
        closeSetupWizard();
        setCustomizeCreateOpen(false);
        setContractorModalOpen(false);
        setQuickTaskModalOpen(false);
        // Esc exits focus mode only when no overlay was open on top of it.
        if (!anyOverlayOpen) {
          setFocusMode(false);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCreateFlyoutOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    closeSetupWizard,
    setContractorModalOpen,
    setCustomizeCreateOpen,
    setQuickTaskModalOpen,
    createFlyoutOpen,
    navigationHubOpen,
    quickActionsDrawerOpen,
    favoritesFlyoutOpen,
    docEngineOpen,
    recordDrawerOpen,
    studioDrawerOpen,
    peekOpen,
  ]);

  const openOrActivateTab = useCallback((domain: DomainKey, screenId: string) => {
    const nextTab = buildWorkspaceTab(domain, screenId);
    const targetScreen = findScreen(domain, nextTab.screenId);
    setActiveDomain(domain);
    setActiveScreen(nextTab.screenId);
    setOpenGroupsByDomain((prev) => {
      const current = prev[domain] || [];
      if (current.includes(targetScreen.group)) return prev;
      return {
        ...prev,
        [domain]: [...current, targetScreen.group],
      };
    });
    setOpenTabs((prev) => {
      if (prev.some((t) => t.key === nextTab.key)) return prev;
      return [...prev, nextTab];
    });
  }, []);

  // Boot from URL — standalone page view: /?view=<domain>:<screen>&focus=1
  // One-time hydration-time init from window.location (server HTML always
  // boots the default screen, then the effect swaps in the requested view).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    if (view) {
      const sep = view.indexOf(':');
      if (sep > 0) {
        const d = view.slice(0, sep) as DomainKey;
        const s = view.slice(sep + 1);
        // Design catalog paths are DYNAMIC (studio-<dept>--<sub>--<subsub>
        // built from STOREFRONT_NAV, three levels deep) — they're not in
        // the static SCREEN_DEFS, but ScreenContent routes any studio-* id
        // through catalogNodeFor. Accept them so deep catalog links
        // (and the standalone-page button on them) boot correctly
        // instead of silently falling back to the Dashboard.
        const isDesignCatalogPath = d === 'design' && s.startsWith('studio-');
        if (
          DOMAINS[d] &&
          (isDesignCatalogPath ||
            screensOf(DOMAINS[d]).some((scr) => scr.id === s && scr.type !== 'drawer'))
        ) {
          openOrActivateTab(d, s);
        }
      }
    }
    if (params.get('focus') === '1') {
      setFocusMode(true);
    }
  }, [openOrActivateTab]);

  /* Party mirror boot — pull every live Supabase party into platformStore
     once so the document-engine pickers (invoice/bill/PO customer & vendor
     pickers) offer the real CRM records. Supabase stays the system of
     record; the store is a read-mirror. Best-effort: a failure here never
     blocks the shell (the Contacts lists read Supabase directly). */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/parties')
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: SupabasePartyRecord[] } | null) => {
        if (cancelled || !body?.data?.length) return;
        const mirrored = body.data
          .map((rec) => supabaseRecordToStoreParty(rec))
          .filter(Boolean);
        usePlatformStore.getState().mirrorParties(mirrored);
      })
      .catch(() => { /* best-effort mirror — lists still read Supabase */ });
    return () => { cancelled = true; };
  }, []);

  const handleSelectDomain = useCallback(
    (domain: DomainKey) => {
      const existingInDomain = [...openTabs]
        .reverse()
        .find((t) => t.domain === domain);
      if (existingInDomain) {
        openOrActivateTab(domain, existingInDomain.screenId);
      } else {
        // First tabbable screen — drawer-type items open tool panels, not tabs.
        const all = screensOf(DOMAINS[domain]);
        const firstScreen = all.find((s) => s.type !== 'drawer') ?? all[0];
        openOrActivateTab(domain, firstScreen.id);
      }
    },
    [openTabs, openOrActivateTab]
  );

  const handleSelectScreen = useCallback(
    (screenId: string) => {
      // Design Studio children are launchers: each calls openStudio with a
      // view or a drawer (unified contract §3). The StudioDrawer overlay
      // opens from the store's openDrawer (effect below).
      const studioViewByScreen: Record<string, StudioView> = {
        'new-design': 'design',
        'product-page': 'product',
        'design-preview': 'preview',
      };
      // Sidebar labels are the drawer-panel contract — every Design child
      // (Upload / Images / Graphics / Add text / AI / Shapes / Themes) and
      // the My library children resolve to a real panel kind. The panel
      // opens as the canvas LEFT DOCK (store-driven, race-free).
      const drawerKindByLabel: Record<string, string> = {
        Upload: 'Upload',
        Images: 'Images',
        Graphics: 'Graphics',
        'Add text': 'Text',
        AI: 'AI',
        Shapes: 'Shapes',
        Themes: 'Themes',
        Inspiration: 'Inspiration',
        'My library': 'My library',
        'My templates': 'My templates',
        Text: 'Text',
        Colors: 'Colors',
      };
      if (activeDomain === 'design' && studioViewByScreen[screenId]) {
        void useDesignCanvas
          .getState()
          .openStudio({ entry: 'topnav', view: studioViewByScreen[screenId] });
        openOrActivateTab(activeDomain, screenId);
        return;
      }
      // Drawer-type sidebar items (design studio tools) dock their panel on
      // the canvas. Set the store FIRST (survives the navigation), then land
      // on the design canvas — the dock opens with the right panel. No
      // openStudio call: tool browsing needs no product guard and must not
      // double-open the overlay drawer.
      const screen = screensOf(DOMAINS[activeDomain]).find((s) => s.id === screenId);
      if (screen?.type === 'drawer' && activeDomain === 'design') {
        const kind = drawerKindByLabel[screen.label];
        if (kind) useDesignCanvas.getState().setCanvasDock(kind);
        openOrActivateTab('design', 'new-design');
        return;
      }
      openOrActivateTab(activeDomain, screenId);
    },
    [activeDomain, openOrActivateTab]
  );

  const handleSelectTab = useCallback(
    (tab: WorkspaceTab) => {
      openOrActivateTab(tab.domain, tab.screenId);
    },
    [openOrActivateTab]
  );

  const handleCloseTab = useCallback(
    (tabKey: string) => {
      const activeKey = `${activeDomain}:${activeScreen}`;
      const idx = openTabs.findIndex((t) => t.key === tabKey);
      if (idx === -1) return;

      const remaining = openTabs.filter((t) => t.key !== tabKey);
      if (remaining.length === 0) {
        const fallback =
          tabKey === 'dashboard:ops'
            ? buildWorkspaceTab('finance', 'accounting')
            : buildWorkspaceTab('dashboard', 'ops');
        setOpenTabs([fallback]);
        setActiveDomain(fallback.domain);
        setActiveScreen(fallback.screenId);
        return;
      }

      setOpenTabs(remaining);
      if (tabKey === activeKey) {
        const nextActive = remaining[Math.min(idx, remaining.length - 1)];
        setActiveDomain(nextActive.domain);
        setActiveScreen(nextActive.screenId);
      }
    },
    [activeDomain, activeScreen, openTabs]
  );

  const handleToggleGroup = useCallback(
    (groupName: string) => {
      setOpenGroupsByDomain((prev) => {
        const current = prev[activeDomain] || [];
        const exists = current.includes(groupName);
        const nextGroups = exists
          ? current.filter((g) => g !== groupName)
          : [...current, groupName];
        return {
          ...prev,
          [activeDomain]: nextGroups,
        };
      });
    },
    [activeDomain]
  );

  const openDocEngine = useCallback((type: DocumentType, id: string | null = null, prefillPartyId?: string | null) => {
    setDocTab('edit');
    setDocType(type);
    setDocId(id);
    setDocPartyId(prefillPartyId ?? null);
    setDocEngineOpen(true);
  }, []);

  /* §1.3 return_to: closing the engine returns to the origin surface,
     then the envelope is cleared for the next context. */
  const closeDocEngine = useCallback(() => {
    setDocEngineOpen(false);
    setDocId(null);
    const env = usePlatformStore.getState().envelope;
    if (env.returnTo) {
      const [d, s] = env.returnTo.split(':');
      if (DOMAINS[d as DomainKey] && s) openOrActivateTab(d as DomainKey, s);
    }
    usePlatformStore.getState().clearEnvelope();
  }, [openOrActivateTab]);

  const openRecordDrawer = useCallback((kind: string) => {
    setRecordKind(kind);
    setRecordInit(null);
    setRecordSessionKey((c) => c + 1);
    setRecordDrawerOpen(true);
  }, []);

  const handleCapCreate = useCallback(
    (label: string) => {
      if (label === 'Share issuance' || label === 'Option grant') {
        openRecordDrawer(label === 'Share issuance' ? 'Invoice' : 'Product');
      } else {
        showToast(`Cap Table → Create ${label}`);
      }
    },
    [openRecordDrawer, showToast]
  );

  /* ── The definitive Create routing (platform-component-map.md PART 3) ──
     Every create action from the flyout, quick actions, and screens routes
     through here. Labels normalize to canonical keys, then:
       - Document types → DocumentEngine with the correct config
       - Records → RecordDrawer with the correct drawer def
       - Workspaces/lists → real screen navigation
     No dead links, no toasts pretending to be features.
     `prefill` carries the party a document is being created FOR (profile
     page / row menu): the engine opens with that party already selected. */
  const handleCreate = useCallback(
    (rawLabel: string, prefill?: { partyName?: string; partyId?: string; source?: string; email?: string | null }) => {
      setCreateFlyoutOpen(false);

      // ── Normalize: map all quick-action / create-registry labels to canonical keys ──
      const normalizeMap: Record<string, string> = {
        // Customers
        'Create invoice': 'Invoice',
        'Create estimate': 'Estimate',
        'Create sales receipt': 'Sales receipt',
        'Create statement': 'Statement',
        'Create payment link': 'Payment link',
        'Create recurring payment': 'Recurring payment',
        'Recurring sales receipt': 'Recurring sales receipt',
        'Record payment': 'Receive payment',
        'Get paid online': 'Receive payment',
        'Add customer': 'Add customer',
        // Profile TXN menu passes its own casing — normalize here so every
        // menu item lands on a real flow, never the fallback toast.
        'Payment': 'Receive payment',
        // Sales / orders module labels
        'Order': 'Sales order',
        'New transaction': 'Invoice',
        // Vendors
        'Record expense': 'Expense',
        'Create check': 'Check',
        'Create bill': 'Bill',
        'Pay bills': 'Pay bills',
        'Add vendor': 'Add vendor',
        'Print checks': 'Print checks',
        'Recurring bill': 'Recurring bill',
        'Upload multiple bills': 'Upload multiple bills',
        'Schedule online payment': 'Schedule online payment',
        'Create vendor credit': 'Vendor credit',
        // Team
        'Add employee': 'Add employee',
        'Add time entry': 'Time entry',
        // Books
        'Get Live Bookkeeping': 'Live bookkeeping',
        'Add bank deposit': 'Bank deposit',
        'Add product or service': 'Add product/service',
        'Create journal entry': 'Journal entry',
        // Tax
        'Create tax return': 'Tax return',
        'Bookkeeper tax review': 'Tax review',
        'Download tax summary': 'Download tax summary',
        // Inventory / Catalog / Support
        'Add inventory item': 'Add product/service',
        'Design Studio': 'Design',
        'Open Support Ticket': 'Ticket',
        'Publish Design': 'Publish design',
        'Create Social Post': 'Post',
      };
      const label = ciLookup(normalizeMap, rawLabel) || rawLabel;

      // ── Document types → Document Engine with the correct config ──
      const docTypeMap: Record<string, DocumentType> = {
        'Invoice': 'Invoice',
        'Estimate': 'Estimate',
        'Sales receipt': 'SalesReceipt',
        'Credit memo': 'CreditMemo',
        'Sales order': 'SalesOrder',
        'Bill': 'Bill',
        'Check': 'Check',
        'Expense': 'Expense',
        'Purchase order': 'PurchaseOrder',
        'Vendor credit': 'VendorCredit',
        'Journal entry': 'JournalEntry',
        'Return/RMA': 'RMA',
        'Void': 'Invoice', // Void opens the doc engine on the first voidable doc — screens pass ids
        // Inventory operations are booked as journal entries (double-entry
        // adjustments: shrinkage, bin transfers, count variances).
        'Stock adjustment': 'JournalEntry',
        'Adjustment': 'JournalEntry',
        'Transfer': 'JournalEntry',
        'Cycle count': 'JournalEntry',
        // Restock / reorder / receive all funnel into the PO engine.
        'Restock suggestions': 'PurchaseOrder',
        'Reorder POs': 'PurchaseOrder',
        'Receive items': 'PurchaseOrder',
      };

      // ── Payment: open the PaymentModal, NOT the DocumentEngine ──
      // When the user clicks "Payment" from a customer profile (or "Receive
      // payment" from a row menu), they're recording money received — not
      // creating an invoice or a sales receipt. The modal has amount,
      // payment method (cash/check/card/Stripe/ACH), apply-to-invoice,
      // deposit-to, and settlement status (settled vs pending for Stripe
      // payouts). It persists to payment_transactions and marks the linked
      // invoice Paid in the store.
      if (label === 'Receive payment') {
        setPaymentPrefill({
          partyId: prefill?.partyId || null,
          partyName: prefill?.partyName || null,
          source: prefill?.source,
          email: prefill?.email ?? null,
        });
        setPaymentModalOpen(true);
        return;
      }

      const asDoc = ciLookup(docTypeMap, label);
      if (asDoc && label !== 'Void') {
        // §1.3 Context Envelope — creating from a party record resolves that
        // record into the engine's party picker. Resolution order:
        //   1. Supabase uuid — the platformStore mirror keeps store ids
        //      identical to the Supabase ids, so an exact id match resolves
        //      instantly (the common case — no placeholder needed).
        //   2. Name match.
        //   3. Placeholder — created on first use so the prefill never
        //      silently disappears.
        let storePartyId: string | null = null;
        if (prefill?.partyId || prefill?.partyName) {
          const st = usePlatformStore.getState();
          const byId = prefill?.partyId ? st.parties.find(p => p.id === prefill.partyId) : undefined;
          const byName = prefill?.partyName
            ? st.parties.find(p => p.name.toLowerCase() === prefill.partyName!.toLowerCase())
            : undefined;
          if (byId) {
            storePartyId = byId.id;
          } else if (byName) {
            storePartyId = byName.id;
          } else {
            const role: PartyRole = prefill.source === 'acct_vendors' ? 'Vendor'
              : prefill.source === 'suppliers' ? 'Supplier'
              : prefill.source === 'crm_leads' ? 'Lead' : 'Customer';
            storePartyId = st.addParty({
              name: prefill.partyName!, displayName: prefill.partyName!,
              firstName: '', lastName: '',
              email: prefill.email || '', phone: '',
              roles: [role], balance: 0, address: '', city: '', state: '', zip: '', country: '',
              terms: '', creditLimit: 0, taxId: '', taxExempt: false, track1099: false,
              notes: '', tags: [], owner: 'Current user', segmentIds: [],
            });
          }
        }
        openDocEngine(asDoc, null, storePartyId);
        return;
      }

      // ── Workspaces & lists → real screen navigation ──
      const navigateMap: Record<string, [DomainKey, string]> = {
        'Pay bills': ['finance', 'bill-payments'],
        'Schedule online payment': ['finance', 'bill-payments'],
        'Upload multiple bills': ['finance', 'bills'],
        'Recurring bill': ['finance', 'bills'],
        'Receive payment': ['finance', 'invoices'],
        'Payment link': ['finance', 'payment-links'],
        'Statement': ['finance', 'statements'],
        'Recurring payment': ['finance', 'invoices'],
        'Recurring sales receipt': ['finance', 'sales-transactions'],
        'Print checks': ['finance', 'bill-payments'],
        'Bank deposit': ['finance', 'accounting'],
        'Reconcile': ['finance', 'reconcile'],
        'Tax return': ['finance', 'tax-filing'],
        'Tax review': ['finance', 'tax-overview'],
        'Download tax summary': ['finance', 'tax-summary'],
        'Live bookkeeping': ['finance', 'accounting'],
        'Purchase orders': ['finance', 'purchase-orders'],
        // Business tax module actions → the real tax screens
        'Tax summary': ['finance', 'tax-summary'],
        'Estimated payment': ['finance', 'tax-filing'],
        'Tax payment': ['finance', 'tax-filing'],
        'File extension': ['finance', 'tax-filing'],
        // CRM Appointments — the create flyout lands on the calendar screen.
        'Appointment': ['contacts', 'appointments'],
      };
      const navTarget = ciLookup(navigateMap, label);
      if (navTarget) {
        openOrActivateTab(navTarget[0], navTarget[1]);
        return;
      }

      // ── Party creation — THE canonical Supabase drawer ──
      // Customer/Vendor/Supplier/Lead/Seller live in real Supabase tables
      // (crm_customers / acct_vendors / suppliers / crm_leads / sellers +
      // seller_self_serve_profiles): their create flows open the same
      // PartyFormDrawer every Contacts screen uses → POST /api/parties →
      // mirror into platformStore for the doc-engine pickers. Contractors
      // remain store entities (contractor modal).
      const partyKinds: Record<string, PartyRole> = {
        'Add customer': 'Customer',
        'Customer': 'Customer',
        'Add vendor': 'Vendor',
        'Vendor': 'Vendor',
        'Add supplier': 'Supplier',
        'Supplier': 'Supplier',
        'Add lead': 'Lead',
        'Lead': 'Lead',
        'Add contractor': 'Contractor',
        'Contractor': 'Contractor',
        'Party': 'Customer',
        'Add seller': 'Seller',
        'Seller': 'Seller',
      };
      const partyRole = ciLookup(partyKinds, label);
      if (partyRole) {
        if (partyRole === 'Contractor') {
          setContractorModalOpen(true);
        } else {
          // Seller is a contact type — same canonical drawer, same POST
          // /api/parties contract, rows land in the sellers table pair.
          setPartyFormRole(partyRole);
        }
        return;
      }
      if (label === 'Add employee') {
        setRecordKind('Party');
        setRecordRole('Contractor');
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }

      // ── Item / Account drawers ──
      if (label === 'Add product/service' || label === 'Product' || label === 'Add inventory item') {
        setRecordKind('Item');
        setRecordRole(null);
        setRecordInit(null);
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }
      if (label === 'Service' || label === 'Bundle') {
        // Same Item drawer with the type prefilled (ItemType enum).
        setRecordKind('Item');
        setRecordRole(null);
        setRecordInit({ type: label });
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }
      if (label === 'Add account' || label === 'Account') {
        setRecordKind('Account');
        setRecordRole(null);
        setRecordInit(null);
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }
      if (label === 'Category') {
        setRecordKind('Category');
        setRecordRole(null);
        setRecordInit(null);
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }

      // ── Task / Note / Time (§ Tasks module) ──
      if (label === 'Task' || label === 'Add note' || label === 'Time entry') {
        setQuickTaskModalOpen(true);
        return;
      }

      // ── Ticket (Support drawer) ──
      if (label === 'Ticket') {
        setRecordKind('Ticket');
        setRecordRole(null);
        setRecordInit(null);
        setRecordSessionKey((c) => c + 1);
        setRecordDrawerOpen(true);
        return;
      }

      // ── Studio & marketing surfaces (existing screens) ──
      const studioLabels = new Set(['Design', 'Collection', 'Publish design']);
      if (studioLabels.has(label)) {
        openOrActivateTab('design', 'new-design');
        return;
      }
      const marketingNav: Record<string, [DomainKey, string]> = {
        'Banner': ['marketing', 'mkt-banners'],
        'Popup': ['marketing', 'mkt-banners'],
        'Discount code': ['marketing', 'mkt-promotions'],
        'Campaign': ['marketing', 'mkt-campaigns'],
        'Post': ['marketing', 'mkt-create-content'],
        'Newsletter': ['marketing', 'mkt-newsletter'],
      };
      const mktTarget = marketingNav[label];
      if (mktTarget) {
        openOrActivateTab(mktTarget[0], mktTarget[1]);
        return;
      }

      // ── Fallback: if DRAWER_FIELDS has it, open drawer (canonical key) ──
      const drawerKey = Object.keys(DRAWER_FIELDS).find(k => ciKey(k) === ciKey(label));
      if (drawerKey) {
        openRecordDrawer(drawerKey);
        return;
      }

      showToast(`Create → ${label}`);
    },
    [
      openDocEngine,
      openOrActivateTab,
      openRecordDrawer,
      setContractorModalOpen,
      setQuickTaskModalOpen,
      showToast,
    ]
  );

  const handleRailAction = useCallback(
    (id: string) => {
      if (id === 'allapps') {
        // All apps → Enterprise Navigation Hub (routing), NOT create.
        setNavigationHubOpen(true);
      } else if (id === 'customize' || id === 'favorites') {
        // The star (favorites/bookmarks) pin toggles the favorites flyout.
        setFavoritesFlyoutOpen((prev) => !prev);
      } else if (id === 'reports') {
        // Reports is its own standalone, cross-module view — NOT tied to
        // accounting/finance. Broken down by every module inside the reports
        // domain.
        openOrActivateTab('reports', 'reports-overview');
      } else if (id === 'inbox') {
        // Inbox → Support omnichannel inbox (real screen).
        openOrActivateTab('support', 'messages');
      } else if (id === 'tasks') {
        // Tasks & calendar → opens the Tasks & Projects page (full screen).
        openOrActivateTab('dashboard', 'tasks');
      } else if (id === 'home') {
        openOrActivateTab('dashboard', 'ops');
      } else {
        showToast(`Rail → ${id}`);
      }
    },
    [openOrActivateTab, showToast]
  );

  const handleUtilAction = useCallback(
    (id: string) => {
      if (id === 'settings') {
        openOrActivateTab('settings', 'ws-home');
        setCreateFlyoutOpen(false);
      } else {
        showToast(`Utility → ${id}`);
      }
    },
    [openOrActivateTab, showToast]
  );

  // ── Page-level view controls (below the tab bar, on every page) ──
  const handleOpenStandalone = useCallback(() => {
    window.open(`/?view=${activeDomain}:${activeScreen}&focus=1`, '_blank');
  }, [activeDomain, activeScreen]);

  const handleToggleFocus = useCallback(() => {
    setFocusMode((prev) => {
      const next = !prev;
      showToast(next ? 'Full screen — press Esc to exit' : 'Exited full screen');
      return next;
    });
  }, [showToast]);

  // ── Dual pin handlers (setters persist + notify via the stored-pref hook) ──
  const handlePinModeChange = useCallback((mode: PinMode) => {
    setPinMode(mode);
  }, [setPinMode]);

  const handleAddBookmark = useCallback((domain: DomainKey, screen: string) => {
    setRailBookmarks(prev =>
      prev.some((b) => b.domain === domain && b.screen === screen)
        ? prev
        : [...prev, { domain, screen }],
    );
  }, [setRailBookmarks]);

  const handleRemoveBookmark = useCallback((domain: DomainKey, screen: string) => {
    setRailBookmarks(prev => prev.filter((b) => !(b.domain === domain && b.screen === screen)));
  }, [setRailBookmarks]);

  const activeTabKey = `${activeDomain}:${activeScreen}`;

  return (
    <>
      <Header
        openTabs={openTabs}
        activeTabKey={activeTabKey}
        onSelectTab={handleSelectTab}
        onCloseTab={handleCloseTab}
        onOpenCreateFlyout={() => setCreateFlyoutOpen(true)}
        onOpenNavigationHub={() => setNavigationHubOpen(true)}
        onOpenSettings={(screenId) => openOrActivateTab('settings', screenId ?? 'ws-home')}
        viewMode={viewMode}
        onChangeViewMode={(mode) => {
          setViewMode(mode);
          showToast(`Switched to ${mode} view`);
        }}
        onToast={showToast}
        hideTabs={focusMode}
      />

      {!focusMode && (
        <MainRail
          activeDomain={activeDomain}
          onSelectDomain={handleSelectDomain}
          onOpenCreateFlyout={() => setCreateFlyoutOpen(true)}
          onRailAction={handleRailAction}
          onUtilAction={handleUtilAction}
          favoritesCount={favoriteIds.length}
          pinMode={pinMode}
          bookmarksCount={railBookmarks.length}
          favoritesOpen={favoritesFlyoutOpen}
          onToggleFavorites={() => setFavoritesFlyoutOpen((prev) => !prev)}
        />
      )}

      {!focusMode && activeDomain !== 'dashboard' && (
        <SideRail
          activeDomain={activeDomain}
          activeScreen={activeScreen}
          openGroups={openGroupsByDomain[activeDomain] || []}
          sideFilter={sideFilter}
          onSideFilterChange={setSideFilter}
          onToggleGroup={handleToggleGroup}
          onSelectScreen={handleSelectScreen}
          collapsed={sideRailCollapsed}
          onToggleCollapse={() => setSideRailCollapsed((prev) => !prev)}
          screenBadges={{ ...dashboardController.queueBadges, ...(liveQueueBadges || {}) }}
          onLaunchWizard={(category, subcategory) => {
            setWizardPrefill({ category, subcategory });
            openOrActivateTab('design', 'studio-wizard');
          }}
        />
      )}

      <ScreenContent
        openTabs={openTabs}
        activeTabKey={activeTabKey}
        dashboardController={dashboardController}
        onNavigate={openOrActivateTab}
        onCapCreate={handleCapCreate}
        onCreate={handleCreate}
        onOpenCreateFlyout={() => setCreateFlyoutOpen(true)}
        onOpenPeek={(row) => {
          setPeekRow(row);
          setPeekOpen(true);
        }}
        onToast={showToast}
        sideRailCollapsed={activeDomain === 'dashboard' ? true : sideRailCollapsed}
        focusMode={focusMode}
        onToggleFocus={handleToggleFocus}
        onOpenStandalone={handleOpenStandalone}
        wizardPrefill={wizardPrefill}
      />

      <DashboardOverlays controller={dashboardController} onToast={showToast} />

      <PeekDrawer
        open={peekOpen}
        row={peekRow}
        onClose={() => setPeekOpen(false)}
        onOpenFull={() => {
          setPeekOpen(false);
          // Open the real document in the engine when the row maps to one
          const rowDoc = peekRow && (peekRow.documentId || peekRow.id) ? store.getDocument(String(peekRow.documentId || peekRow.id)) : null;
          if (rowDoc) openDocEngine(rowDoc.type, rowDoc.id);
          else openDocEngine('Invoice');
        }}
      />

      <RecordDrawer
        open={recordDrawerOpen}
        kind={recordKind}
        sessionKey={recordSessionKey}
        initialRoles={recordRole ? [recordRole] : undefined}
        record={recordInit}
        onClose={() => { setRecordDrawerOpen(false); setRecordRole(null); setRecordInit(null); }}
        onToast={showToast}
        onSave={(values) => {
          /* Write every record create to the shared store — a real row
             appears in the corresponding list the moment you save. */
          if (recordKind === 'Party') {
            const roles = (values.roles as PartyRole[]) || (recordRole ? [recordRole] : []);
            const id = store.addParty({
              name: String(values.name || ''),
              displayName: String(values.displayName || values.name || ''),
              firstName: '',
              lastName: '',
              email: String(values.email || ''),
              phone: String(values.phone || ''),
              roles,
              balance: 0,
              address: String(values.address || ''),
              city: String(values.city || ''),
              state: String(values.state || ''),
              zip: String(values.zip || ''),
              country: String(values.country || 'United States'),
              terms: String(values.terms || 'Net 30'),
              creditLimit: Number(values.creditLimit || 0),
              taxId: String(values.taxId || ''),
              taxExempt: false,
              track1099: Boolean(values.track1099),
              notes: String(values.notes || ''),
              tags: [],
              owner: 'Current user',
              segmentIds: [],
              ...(roles.includes('Lead') ? { leadSource: String(values.leadSource || ''), leadStatus: String(values.leadStatus || 'New'), leadValue: Number(values.leadValue || 0) } : {}),
              ...(roles.includes('Supplier') ? { supplierLeadTime: Number(values.supplierLeadTime || 0), supplierAccountNo: String(values.supplierAccountNo || ''), supplierUrl: String(values.supplierUrl || '') } : {}),
              ...(roles.includes('Vendor') ? { vendorDefaultAccount: String(values.vendorDefaultAccount || '') } : {}),
            });
            showToast(`${String(values.name || 'Party')} added as ${roles.join(', ') || 'party'}`);
            return;
          }
          if (recordKind === 'Item') {
            store.addItem({
              name: String(values.name || ''),
              sku: String(values.sku || ''),
              type: (values.type as never) || 'Product',
              category: String(values.category || ''),
              status: 'Draft',
              price: Number(values.price || 0),
              cost: Number(values.cost || 0),
              description: String(values.description || ''),
              incomeAccount: String(values.incomeAccount || '4000 Product Sales'),
              expenseAccount: String(values.expenseAccount || '5000 COGS'),
              taxable: Boolean(values.taxable),
              trackInventory: Boolean(values.trackInventory),
              fulfillmentType: (values.fulfillmentType as never) || 'Stock',
              stockOnHand: 0,
              reorderPoint: Number(values.reorderPoint || 0),
              supplierId: (values.supplierId as string) || null,
              designId: null,
              channels: [],
              image: '',
              tags: [],
            });
            showToast(`${String(values.name || 'Item')} added to catalog`);
            return;
          }
          if (recordKind === 'Account') {
            store.addAccount({
              number: String(values.number || ''),
              name: String(values.name || ''),
              type: (values.type as never) || 'Expense',
              detailType: String(values.detailType || ''),
              balance: Number(values.openingBalance || 0),
              bankBalance: 0,
              active: true,
              parent: null,
              description: String(values.description || ''),
            });
            showToast(`Account ${String(values.name || '')} added to chart of accounts`);
            return;
          }
          if (recordKind === 'Expense') {
            const amount = Number(values.amount || 0);
            store.addDocument({
              type: 'Expense', number: `EXP-${store.documents.filter(d => d.type === 'Expense').length + 1001}`,
              partyId: (values.payeeId as string) || '', status: 'Paid',
              date: String(values.date || new Date().toISOString().slice(0, 10)), dueDate: '',
              lines: [{ id: 'L1', itemId: null, description: String(values.category || 'Expense'), qty: 1, rate: amount, amount, taxRate: 0, account: String(values.paidFrom || ''), tags: [] }],
              subtotal: amount, tax: 0, shipping: 0, total: amount, amountPaid: amount, balance: 0,
              memo: String(values.memo || ''), notes: '', tags: [], attachments: [],
              orderId: null, poId: null, channelId: null, createdBy: 'Current user',
            });
            showToast(`Expense of $${amount.toFixed(2)} recorded`);
            return;
          }
          showToast(`Saved ${recordKind}`);
        }}
      />

      {/* §1.2 Document page (full): the engine fills the viewport as its own
          surface — Edit/Email/Payor/PDF tabs live inside it. */}
      {docEngineOpen && (
        <div className="fixed inset-0 z-[200] bg-background flex flex-col">
          <DocumentEngine
            open={docEngineOpen}
            type={docType}
            documentId={docId}
            partyId={docPartyId}
            activeTab={docTab}
            onSelectTab={(t) => setDocTab(t as DocTabType)}
            onClose={closeDocEngine}
            onOpenDocument={(id) => { setDocId(id); setDocTab('edit'); }}
            onToast={showToast}
          />
        </div>
      )}

      {/* Payment modal — focused payment form (not a document engine).
          Opens from customer profile → New transaction → Payment, or
          row-menu → Receive payment. Records to payment_transactions
          and optionally marks an invoice Paid. */}
      <PaymentModal
        open={paymentModalOpen}
        prefill={paymentPrefill}
        onToast={showToast}
        onClose={() => { setPaymentModalOpen(false); setPaymentPrefill(null); }}
      />

      <CreateFlyout
        open={createFlyoutOpen}
        onClose={() => setCreateFlyoutOpen(false)}
        onSelectCreate={handleCreate}
      />

      <NavigationHubFlyout
        open={navigationHubOpen}
        onClose={() => setNavigationHubOpen(false)}
        onNavigate={openOrActivateTab}
        onToast={showToast}
        onCreate={handleCreate}
      />

      <StudioDrawer
        open={studioDrawerOpen}
        kind={studioDrawerKind}
        onClose={() => {
          setStudioDrawerOpen(false);
          // Closing the overlay closes the session's drawer too.
          useDesignCanvas.getState().setDrawer(null);
        }}
        onToast={showToast}
        onNavigate={(screenId) => openOrActivateTab('design', screenId)}
      />

      {/* THE canonical party create — global Create flyout, quick actions,
          module headers. Same drawer every Contacts screen uses; writes to
          Supabase (POST /api/parties) and mirrors into platformStore so the
          document-engine pickers see the record immediately. */}
      <PartyFormDrawer
        open={!!partyFormRole}
        preselectRole={partyFormRole || undefined}
        onClose={() => setPartyFormRole(null)}
        onToast={showToast}
      />

      <QuickActionsDrawer
        open={quickActionsDrawerOpen}
        onClose={() => setQuickActionsDrawerOpen(false)}
        selectedActionIds={favoriteIds}
        onSelectedActionIdsChange={setFavoriteIds}
        onToast={showToast}
        onSelectAction={(actionName) => {
          handleCreate(actionName);
        }}
      />

      <FavoritesFlyout
        open={favoritesFlyoutOpen}
        pinMode={pinMode}
        onPinModeChange={handlePinModeChange}
        bookmarks={railBookmarks}
        activeDomain={activeDomain}
        activeScreen={activeScreen}
        onAddBookmark={handleAddBookmark}
        onRemoveBookmark={handleRemoveBookmark}
        onNavigateBookmark={openOrActivateTab}
        favoriteIds={favoriteIds}
        onClose={() => setFavoritesFlyoutOpen(false)}
        onSelectAction={(actionName) => {
          handleCreate(actionName);
        }}
        onOpenCustomize={() => {
          setFavoritesFlyoutOpen(false);
          setQuickActionsDrawerOpen(true);
        }}
        onToast={showToast}
      />

      <Toast message={toastMsg} visible={toastVisible} />
    </>
  );
}
