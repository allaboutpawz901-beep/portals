'use client';
/* surfaceStore.ts — Three central stores per platform-component-behavior.md §1:
   "Three central stores (everything else is local state):
   | useSurfaces    | Per-tab surface stack, dirty flags |
   | useEnvelope    | Active tab's context envelope |
   | usePermissions | Roles, field masks, feature flags |"

   Every surface (drawer, modal, page, workspace) in the app opens and closes
   through useSurfaces. The envelope carries context so Create-from-this
   prefills. Permissions gate actions and mask fields. */

import { create } from 'zustand';

/* ═══════════════════════════════════════════════════════════════
   SURFACE TYPES (§2.4 Containers)
   Drawer: width 480|720, dirty, title, onClose, onMakeFullPage
   Modal: size, dirty, onClose (≤5 fields)
   DocumentPage: DocumentDef, id|draft
   Workspace: steps, draftId, onFinish
   ═══════════════════════════════════════════════════════════════ */

export type SurfaceKind = 'drawer' | 'modal' | 'page' | 'workspace' | 'peek';

export interface SurfaceRequest {
  kind: SurfaceKind;
  /** e.g. 'party.drawer', 'invoice.page', 'record-payment.modal', 'pay-bills.workspace' */
  surfaceId: string;
  /** The record this surface operates on (null for create) */
  recordId?: string | null;
  /** Create-mode prefill from the envelope (§1.3) */
  prefill?: Partial<Record<string, unknown>>;
  /** Drawer width (§2.4): 480 default, 720 wide mode */
  width?: 480 | 720;
  /** Modal size */
  size?: 'sm' | 'md' | 'lg';
  /** Dirty flag — closing with dirty=true triggers DiscardChangesModal (§3.3) */
  dirty?: boolean;
  title?: string;
}

export interface SurfaceInstance extends SurfaceRequest {
  instanceId: string;
  openedAt: number;
  depth: number; // max 2 per §3.4
}

/* ═══════════════════════════════════════════════════════════════
   useSurfaces (§1)
   Per-tab surface stack. Max depth 2. Child save returns record
   to parent field. Opening from list replaces clean drawer.
   ═══════════════════════════════════════════════════════════════ */

interface SurfacesState {
  /** tabId → stack of surfaces (bottom = first opened) */
  stacks: Record<string, SurfaceInstance[]>;
  /** The tab whose surfaces are currently rendered */
  activeTabId: string;

  open: (request: SurfaceRequest, tabId?: string) => string;
  close: (instanceId: string) => void;
  /** Close the top surface of a tab */
  closeTop: (tabId?: string) => void;
  /** Replace the top surface (clean only; dirty triggers guard upstream) */
  replace: (request: SurfaceRequest, tabId?: string) => string;
  closeAll: (tabId: string) => void;
  /** Mark a surface dirty/clean for the guard (§3.3) */
  setDirty: (instanceId: string, dirty: boolean) => void;
  setActiveTab: (tabId: string) => void;
  /** Get the current stack for a tab */
  getStack: (tabId?: string) => SurfaceInstance[];
  /** Get the top surface */
  getTop: (tabId?: string) => SurfaceInstance | null;
  /** Does any surface in the tab have dirty=true? */
  hasDirty: (tabId?: string) => boolean;
}

let instanceCounter = 0;

export const useSurfaces = create<SurfacesState>()((set, get) => ({
  stacks: {},
  activeTabId: 'main',

  open: (request, tabId) => {
    const tab = tabId || get().activeTabId;
    const stack = get().stacks[tab] || [];
    // §3.4: max depth 2 — base drawer + one child drawer from a picker +Add new
    if (stack.length >= 2) return '';
    const instance: SurfaceInstance = {
      ...request,
      instanceId: `surf-${++instanceCounter}`,
      openedAt: Date.now(),
      depth: stack.length,
    };
    set(state => ({
      stacks: { ...state.stacks, [tab]: [...stack, instance] },
    }));
    return instance.instanceId;
  },

  close: (instanceId) => {
    set(state => {
      const next: Record<string, SurfaceInstance[]> = {};
      for (const [tab, stack] of Object.entries(state.stacks)) {
        next[tab] = stack.filter(s => s.instanceId !== instanceId);
      }
      return { stacks: next };
    });
  },

  closeTop: (tabId) => {
    const tab = tabId || get().activeTabId;
    const stack = get().stacks[tab] || [];
    if (stack.length === 0) return;
    set(state => ({
      stacks: { ...state.stacks, [tab]: stack.slice(0, -1) },
    }));
  },

  replace: (request, tabId) => {
    const tab = tabId || get().activeTabId;
    const stack = get().stacks[tab] || [];
    const instance: SurfaceInstance = {
      ...request,
      instanceId: `surf-${++instanceCounter}`,
      openedAt: Date.now(),
      depth: Math.max(0, stack.length - 1),
    };
    set(state => ({
      stacks: { ...state.stacks, [tab]: [...stack.slice(0, -1), instance] },
    }));
    return instance.instanceId;
  },

  closeAll: (tabId) => {
    set(state => ({ stacks: { ...state.stacks, [tabId]: [] } }));
  },

  setDirty: (instanceId, dirty) => {
    set(state => {
      const next: Record<string, SurfaceInstance[]> = {};
      for (const [tab, stack] of Object.entries(state.stacks)) {
        next[tab] = stack.map(s => s.instanceId === instanceId ? { ...s, dirty } : s);
      }
      return { stacks: next };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  getStack: (tabId) => get().stacks[tabId || get().activeTabId] || [],

  getTop: (tabId) => {
    const stack = get().stacks[tabId || get().activeTabId] || [];
    return stack.length > 0 ? stack[stack.length - 1] : null;
  },

  hasDirty: (tabId) => {
    const stack = get().stacks[tabId || get().activeTabId] || [];
    return stack.some(s => s.dirty);
  },
}));

/* ═══════════════════════════════════════════════════════════════
   useEnvelope (§1 + §1.3 of the map)
   "Active tab's context envelope. current(), derive(record) returns
   the envelope for Create from this."

   envelope = {
     origin_module, origin_record_id, origin_tab_id,
     party_id, order_id, item_id, design_id, account_id,
     channel_id, currency, date_range, return_to
   }
   ═══════════════════════════════════════════════════════════════ */

export interface Envelope {
  originModule: string | null;
  originRecordId: string | null;
  originTabId: string | null;
  partyId: string | null;
  orderId: string | null;
  itemId: string | null;
  designId: string | null;
  accountId: string | null;
  channelId: string | null;
  currency: string;
  dateRange: { from: string | null; to: string | null } | null;
  returnTo: string | null;
}

export const EMPTY_ENVELOPE: Envelope = {
  originModule: null, originRecordId: null, originTabId: null,
  partyId: null, orderId: null, itemId: null, designId: null,
  accountId: null, channelId: null, currency: 'USD', dateRange: null, returnTo: null,
};

interface EnvelopeState {
  /** Per-tab envelopes */
  envelopes: Record<string, Envelope>;
  activeTabId: string;

  current: () => Envelope;
  /** derive(record) — the envelope for "Create from this" (§1.3) */
  derive: (record: { id: string; type: string; partyId?: string; orderId?: string; itemId?: string; designId?: string; accountId?: string; channelId?: string }) => Envelope;
  set: (env: Partial<Envelope>) => void;
  clear: () => void;
  setActiveTab: (tabId: string) => void;
}

export const useEnvelope = create<EnvelopeState>()((set, get) => ({
  envelopes: { main: EMPTY_ENVELOPE },
  activeTabId: 'main',

  current: () => get().envelopes[get().activeTabId] || EMPTY_ENVELOPE,

  derive: (record) => ({
    ...EMPTY_ENVELOPE,
    originModule: record.type,
    originRecordId: record.id,
    originTabId: get().activeTabId,
    partyId: record.partyId || null,
    orderId: record.orderId || null,
    itemId: record.itemId || null,
    designId: record.designId || null,
    accountId: record.accountId || null,
    channelId: record.channelId || null,
    returnTo: get().activeTabId,
  }),

  set: (env) => {
    const tab = get().activeTabId;
    const current = get().envelopes[tab] || EMPTY_ENVELOPE;
    set(state => ({ envelopes: { ...state.envelopes, [tab]: { ...current, ...env } } }));
  },

  clear: () => {
    const tab = get().activeTabId;
    set(state => ({ envelopes: { ...state.envelopes, [tab]: EMPTY_ENVELOPE } }));
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),
}));

/* ═══════════════════════════════════════════════════════════════
   usePermissions (§1)
   "Roles, field masks, feature flags. can(action, record?),
   isMasked(field), flag(name)"

   §1.8: The server decides — but the client mirrors for UI.
   Role → module visibility, view vs edit vs approve.
   Approvals & limits → bill approval, payment thresholds.
   Field-level → cost, margin, bank numbers masked.
   ═══════════════════════════════════════════════════════════════ */

export type Role = 'admin' | 'manager' | 'agent' | 'viewer';

export interface PermissionDef {
  role: Role;
  /** Modules visible to this role */
  modules: string[];
  /** Actions this role can perform */
  actions: string[];
  /** Fields masked for this role */
  maskedFields: string[];
  /** Feature flags this role sees */
  flags: string[];
}

const PERMISSIONS: Record<Role, PermissionDef> = {
  admin: {
    role: 'admin',
    modules: ['*'],
    actions: ['*'],
    maskedFields: [],
    flags: ['pos', 'gift-cards', 'banking', 'payroll', 'ads', 'newsletter-automation', 'social-calendar', 'settlement', 'cycle-count'],
  },
  manager: {
    role: 'manager',
    modules: ['dashboard', 'sales', 'expenses', 'contacts', 'catalog', 'orders', 'finance', 'marketing', 'support', 'reports'],
    actions: ['create', 'edit', 'approve', 'send', 'pay', 'void', 'archive', 'delete', 'export'],
    maskedFields: ['bankAccountNumber', 'bankRoutingNumber'],
    flags: ['newsletter-automation', 'social-calendar'],
  },
  agent: {
    role: 'agent',
    modules: ['dashboard', 'sales', 'contacts', 'orders', 'support', 'catalog'],
    actions: ['create', 'edit', 'send', 'export'],
    maskedFields: ['cost', 'margin', 'bankAccountNumber', 'bankRoutingNumber', 'taxId'],
    flags: [],
  },
  viewer: {
    role: 'viewer',
    modules: ['dashboard', 'sales', 'expenses', 'contacts', 'catalog', 'orders', 'finance', 'reports'],
    actions: ['export'],
    maskedFields: ['cost', 'margin', 'bankAccountNumber', 'bankRoutingNumber', 'taxId'],
    flags: [],
  },
};

interface PermissionsState {
  role: Role;
  /** can(action, record?) — §1.8: "the menu never shows what the user can't finish" */
  can: (action: string, record?: { type?: string }) => boolean;
  /** isMasked(field) — §1.8 field-level masking */
  isMasked: (field: string) => boolean;
  /** flag(name) — feature flags for deferred modules */
  flag: (name: string) => boolean;
  setRole: (role: Role) => void;
}

export const usePermissions = create<PermissionsState>()((set, get) => ({
  role: 'admin',

  can: (action, _record) => {
    const perm = PERMISSIONS[get().role];
    if (perm.actions.includes('*')) return true;
    return perm.actions.includes(action);
  },

  isMasked: (field) => {
    const perm = PERMISSIONS[get().role];
    return perm.maskedFields.includes(field);
  },

  flag: (name) => {
    const perm = PERMISSIONS[get().role];
    return perm.flags.includes(name);
  },

  setRole: (role) => set({ role }),
}));

/* ═══════════════════════════════════════════════════════════════
   DiscardChangesModal spec (§3.3)
   "Any close, replace, tab close, route change or browser back
   with dirty = true opens DiscardChangesModal: Save · Discard · Keep editing"
   Rendered by SurfaceHost when a dirty surface is asked to close.
   ═══════════════════════════════════════════════════════════════ */

export interface DiscardGuardState {
  pendingClose: { instanceId: string; tabId: string } | null;
  askDiscard: (instanceId: string, tabId: string) => void;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
}

export const useDiscardGuard = create<DiscardGuardState>()((set, get) => ({
  pendingClose: null,
  askDiscard: (instanceId, tabId) => set({ pendingClose: { instanceId, tabId } }),
  confirmDiscard: () => {
    const pc = get().pendingClose;
    if (pc) {
      useSurfaces.getState().close(pc.instanceId);
    }
    set({ pendingClose: null });
  },
  cancelDiscard: () => set({ pendingClose: null }),
}));
