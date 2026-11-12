/**
 * Module assignment — the seam between the two portals and the shell.
 *
 * One surface (GlobalShell) serves every audience. What a signed-in person
 * sees is decided HERE: their portal (admin | portal) plus the modules their
 * tenant and role are assigned. The sidebar is generated from this
 * assignment — module -> shell domains — never hand-built per portal.
 *
 * Scaffold state: GlobalShell still renders every domain in shellData.
 * The build wires the shell to `domainsFor()`; nothing in the shell or in
 * shellData is modified by this file.
 */
import type { DomainKey } from '@/data/shellData';

export type PortalKind = 'admin' | 'portal';

export type ModuleKey =
  | 'foundation'
  | 'identity'
  | 'crm-contacts'
  | 'marketplace'
  | 'catalog'
  | 'design-studio'
  | 'storefront-checkout'
  | 'orders-fulfillment'
  | 'purchasing-inventory'
  | 'finance'
  | 'support'
  | 'community'
  | 'tasks-chat'
  | 'reports'
  | 'integrations'
  | 'advertising'
  | 'lms'
  | 'appointments';

/** Which shell domains each module lights up. Empty = no shell domain yet. */
export const MODULE_DOMAINS: Record<ModuleKey, DomainKey[]> = {
  foundation: [],
  identity: ['settings'],
  'crm-contacts': ['contacts'],
  marketplace: ['catalog', 'orders'],
  catalog: ['catalog'],
  'design-studio': ['design'],
  'storefront-checkout': ['orders'],
  'orders-fulfillment': ['orders'],
  'purchasing-inventory': ['connected-suppliers'],
  finance: ['finance'],
  support: ['support'],
  community: [],
  'tasks-chat': ['dashboard'],
  reports: ['reports'],
  integrations: ['connected-suppliers'],
  advertising: ['marketing'],
  lms: [],
  appointments: [],
};

export interface RoleAssignment {
  portal: PortalKind;
  modules: ModuleKey[];
}

/** The administrator portal carries the full module set. */
export const ADMIN_ASSIGNMENT: RoleAssignment = {
  portal: 'admin',
  modules: Object.keys(MODULE_DOMAINS) as ModuleKey[],
};

/**
 * Portal 2 role assignments — one portal for every other user type.
 * A person holding several roles gets the union of their modules.
 * These are starting assignments; tenants persist their own in the
 * platform's assignment tables (platform_module_permissions,
 * portal_module_permissions).
 */
export const PORTAL_ASSIGNMENTS: Record<string, RoleAssignment> = {
  customer: {
    portal: 'portal',
    modules: ['foundation', 'identity', 'storefront-checkout', 'appointments', 'support'],
  },
  seller: {
    portal: 'portal',
    modules: ['foundation', 'identity', 'crm-contacts', 'marketplace', 'catalog', 'orders-fulfillment', 'finance', 'reports', 'support'],
  },
  employee: {
    portal: 'portal',
    modules: ['foundation', 'identity', 'crm-contacts', 'appointments', 'tasks-chat', 'support'],
  },
  provider: {
    portal: 'portal',
    modules: ['foundation', 'identity', 'crm-contacts', 'marketplace', 'finance', 'reports', 'appointments'],
  },
  educator: {
    portal: 'portal',
    modules: ['foundation', 'identity', 'lms', 'marketplace', 'community', 'finance', 'reports'],
  },
  vet: {
    portal: 'portal',
    modules: ['foundation', 'identity', 'crm-contacts', 'appointments', 'support'],
  },
};

/** The shell domains a person's sidebar shows, in shell order. */
export function domainsFor(assignment: RoleAssignment): DomainKey[] {
  const seen = new Set<DomainKey>();
  for (const m of assignment.modules) {
    for (const d of MODULE_DOMAINS[m]) seen.add(d);
  }
  return [...seen];
}

/** Union assignment for a person holding several portal roles. */
export function assignmentForRoles(roles: string[]): RoleAssignment {
  const modules = new Set<ModuleKey>();
  for (const role of roles) {
    const a = PORTAL_ASSIGNMENTS[role];
    if (a) for (const m of a.modules) modules.add(m);
  }
  return { portal: 'portal', modules: [...modules] };
}
