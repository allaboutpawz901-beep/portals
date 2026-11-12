// Settings: Workspace / Access data — ported 1:1 from
// upload/unsaid-settings-access.html. Drives the Teammates, Roles, External,
// Approvals, Owners, Brands, Security, Activity log, Multilingual views.
// This is mock data — nothing here is persisted.

export interface PermissionModule {
  name: string;
  caps: string[]; // each label; trailing '*' marks a sensitive permission
}

export interface Capability {
  m: number; // module index
  c: number; // cap index within module
  label: string;
  sensitive: boolean;
}

export type DataScope = 'all' | 'own';
export type FieldVis = 'show' | 'mask' | 'hide';

export interface RoleDef {
  d: string; // description
  lock?: boolean; // locked (Admin)
  ext?: boolean; // external role (partner/accountant/board)
  g: string[]; // per-module permission bit-strings ('1' = granted)
  sc: DataScope; // data scope
  cost: FieldVis; // cost visibility
  pii: FieldVis; // PII visibility
  bank: FieldVis; // bank/tax visibility
  agg: 0 | 1; // aggregate-only (no drill-down)
  bulk: string; // bulk action limit
}

export interface Person {
  n: string; // name
  e: string; // email
  r: Record<string, string>; // brand → role
  st: 'Active' | 'Invited' | 'Suspended';
  l: string; // last active
  tf: boolean; // two-step on
  end?: string; // access end date
}

export interface ActivityEvent {
  who: string;
  what: string;
  kind: 'role' | 'access' | 'team' | 'export' | 'approval' | 'imp' | 'sign';
  when: string;
  where: string;
}

export const MOD: PermissionModule[] = [
  {
    name: 'Dashboard',
    caps: [
      'View operations vitals',
      'View financial KPIs (GMV, margins)*',
      'Customize widgets',
    ],
  },
  {
    name: 'Orders',
    caps: [
      'View orders',
      'Edit orders',
      'Cancel and refund orders*',
      'Dispatch to suppliers*',
      'Print labels and slips',
      'Manage returns',
      'See supplier costs*',
    ],
  },
  {
    name: 'Catalog',
    caps: [
      'View products',
      'Create and edit products',
      'Publish and unpublish',
      'Change prices*',
      'See blank costs and margins*',
      'Manage blanks and print areas',
    ],
  },
  {
    name: 'Design Studio',
    caps: [
      'Use the studio',
      'Manage templates',
      'Approve designs for publish',
      'Manage design library',
    ],
  },
  {
    name: 'Finance',
    caps: [
      'View reports',
      'Create invoices, bills, expenses',
      'Approve bills and payments*',
      'Reconcile accounts',
      'Post journal entries*',
      'Close periods*',
      'Manage chart of accounts',
      'View payroll*',
      'Manage taxes and 1099s*',
    ],
  },
  {
    name: 'Contacts',
    caps: [
      'View customers',
      'Edit customers',
      'See personal data (email, phone, address)*',
      'Export contacts*',
      'Merge and delete*',
      'Manage vendors and suppliers',
      'See bank and tax details*',
    ],
  },
  {
    name: 'Marketing',
    caps: [
      'View campaigns',
      'Publish social posts',
      'Spend on ads*',
      'Send newsletters',
      'Create discount codes',
      'Manage connected channels',
    ],
  },
  {
    name: 'Support',
    caps: [
      'View tickets',
      'Reply to customers',
      'Assign and escalate',
      'Issue goodwill credits*',
      'Moderate community posts',
      'Manage SLAs and routing',
      'Delete tickets*',
    ],
  },
  {
    name: 'CMS',
    caps: ['Edit content', 'Publish to storefront', 'Edit navigation', 'Manage media', 'Edit SEO'],
  },
  {
    name: 'Settings',
    caps: [
      'Manage teammates*',
      'Manage roles*',
      'Billing and subscription*',
      'Manage integrations',
      'Create API tokens*',
      'Security policies*',
      'View activity log',
      'Export workspace data*',
    ],
  },
  {
    name: 'Developers',
    caps: ['View API keys*', 'Manage webhooks'],
  },
];

export const CAPS: Capability[] = MOD.flatMap((m, mi) =>
  m.caps.map((label, ci) => ({
    m: mi,
    c: ci,
    label: label.replace(/\*$/, ''),
    sensitive: label.endsWith('*'),
  }))
);

// Helper: expand a sparse per-module permission map into full bit-strings.
function bits(
  partial: Record<string, string>,
  defaults: string[] = MOD.map(() => '')
): string[] {
  return MOD.map((m, mi) => {
    const s = partial[m.name] ?? defaults[mi] ?? '';
    let out = s;
    while (out.length < m.caps.length) out += '0';
    return out.slice(0, m.caps.length);
  });
}

const ALL_ONES = MOD.map((m) => ''.padStart(m.caps.length, '1'));

export const ROLES: Record<string, RoleDef> = {
  Admin: {
    d: 'Runs the workspace. Everything, including who has access. Locked.',
    lock: true,
    g: ALL_ONES,
    sc: 'all',
    cost: 'show',
    pii: 'show',
    bank: 'show',
    agg: 0,
    bulk: 'No limit',
  },
  Warehouse: {
    d: 'Picks, packs, ships, and reviews the dispatch queue.',
    g: bits({ Dashboard: '100', Orders: '1101110', Catalog: '100000' }),
    sc: 'all',
    cost: 'hide',
    pii: 'mask',
    bank: 'hide',
    agg: 0,
    bulk: '500',
  },
  Designer: {
    d: 'Builds designs and products. Never sees cost or customer data.',
    g: bits({
      Dashboard: '100',
      Catalog: '110000',
      'Design Studio': '1101',
      Marketing: '100000',
    }),
    sc: 'all',
    cost: 'hide',
    pii: 'hide',
    bank: 'hide',
    agg: 0,
    bulk: '100',
  },
  'Team Member': {
    d: 'General staff baseline. Start here, add only what the job needs.',
    g: bits({
      Dashboard: '100',
      Orders: '1100100',
      Catalog: '110000',
      Contacts: '1000000',
      Support: '1100000',
      CMS: '10000',
    }),
    sc: 'all',
    cost: 'hide',
    pii: 'mask',
    bank: 'hide',
    agg: 0,
    bulk: '100',
  },
  'Support Member': {
    d: 'Answers customers. Goodwill credits go through limits.',
    g: bits({
      Dashboard: '100',
      Orders: '1000010',
      Contacts: '1110000',
      Support: '1111100',
    }),
    sc: 'all',
    cost: 'hide',
    pii: 'show',
    bank: 'hide',
    agg: 0,
    bulk: '50',
  },
  Partner: {
    ext: true,
    d: 'Outside seller or creator. Sees only their own designs, orders, and payouts.',
    g: bits({
      Dashboard: '100',
      Orders: '1000000',
      Catalog: '110000',
      'Design Studio': '1100',
      Finance: '100000000',
      Marketing: '100000',
    }),
    sc: 'own',
    cost: 'hide',
    pii: 'hide',
    bank: 'hide',
    agg: 0,
    bulk: '25',
  },
  Accountant: {
    ext: true,
    d: 'Outside bookkeeper. Full Finance, nothing customer-facing.',
    g: bits({
      Dashboard: '110',
      Orders: '1000000',
      Finance: '110111101',
      Contacts: '1000001',
    }),
    sc: 'all',
    cost: 'show',
    pii: 'hide',
    bank: 'show',
    agg: 0,
    bulk: 'No limit',
  },
  'Board Member': {
    ext: true,
    d: 'Read-only reporting. Totals only, no drill-down into people or orders.',
    g: bits({ Dashboard: '110', Finance: '100000000' }),
    sc: 'all',
    cost: 'show',
    pii: 'hide',
    bank: 'hide',
    agg: 1,
    bulk: '0',
  },
};

export const BRANDS: string[] = ['Unsaid', 'Unsaid', 'Gift Lab'];

export const PEOPLE: Person[] = [
  {
    n: 'Sunny A.',
    e: 'sunny@example.com',
    r: { Unsaid: 'Admin', 'Unsaid': 'Admin' },
    st: 'Active',
    l: '2 min ago',
    tf: true,
  },
  {
    n: 'Almeta R.',
    e: 'almeta@example.com',
    r: { Unsaid: 'Warehouse' },
    st: 'Active',
    l: 'Today',
    tf: true,
  },
  {
    n: 'Dana K.',
    e: 'dana@example.com',
    r: { Unsaid: 'Designer', 'Gift Lab': 'Designer' },
    st: 'Active',
    l: 'Today',
    tf: true,
  },
  {
    n: 'Marcus T.',
    e: 'marcus@example.com',
    r: { Unsaid: 'Support Member' },
    st: 'Active',
    l: 'Yesterday',
    tf: false,
  },
  {
    n: 'Jordan P.',
    e: 'jordan@example.com',
    r: { Unsaid: 'Team Member', 'Gift Lab': 'Team Member' },
    st: 'Invited',
    l: 'Never',
    tf: false,
  },
  {
    n: 'Priya N.',
    e: 'priya@firm.example',
    r: { Unsaid: 'Accountant', 'Unsaid': 'Accountant' },
    st: 'Active',
    l: 'Oct 29',
    tf: true,
    end: 'Dec 31',
  },
  {
    n: 'Printonic',
    e: 'ops@printonic.example',
    r: { Unsaid: 'Partner' },
    st: 'Active',
    l: 'Oct 30',
    tf: true,
  },
  {
    n: 'Lee W.',
    e: 'lee@example.com',
    r: { Unsaid: 'Board Member', 'Unsaid': 'Board Member' },
    st: 'Active',
    l: 'Oct 22',
    tf: false,
    end: 'Jan 15',
  },
  {
    n: 'Casey B.',
    e: 'casey@example.com',
    r: { Unsaid: 'Support Member' },
    st: 'Suspended',
    l: 'Sep 14',
    tf: true,
  },
];

export const ACTIVITY: ActivityEvent[] = [
  { who: 'Sunny A.', what: 'Changed Designer: Marketing from none to view', kind: 'role', when: 'Today 9:12', where: 'Chicago, US' },
  { who: 'Priya N.', what: 'Opened Finance reports', kind: 'access', when: 'Oct 29 4:40 PM', where: 'Austin, US' },
  { who: 'Sunny A.', what: 'Invited Priya N. as Accountant, ends Dec 31', kind: 'team', when: 'Oct 29 4:02 PM', where: 'Chicago, US' },
  { who: 'Marcus T.', what: 'Exported 212 contacts', kind: 'export', when: 'Oct 28 11:15 AM', where: 'Memphis, US' },
  { who: 'Almeta R.', what: 'Approved dispatch of 4 orders', kind: 'approval', when: 'Oct 28 9:30 AM', where: 'Memphis, US' },
  { who: 'Sunny A.', what: 'Impersonated customer #4821 for 12 min (refund check)', kind: 'imp', when: 'Oct 27 2:11 PM', where: 'Chicago, US' },
  { who: 'Unknown', what: 'Failed sign-in for Casey B. (3 attempts)', kind: 'sign', when: 'Oct 26 3:09 AM', where: 'Lagos, NG' },
  { who: 'Sunny A.', what: 'Turned on “Creator cannot approve own bills”', kind: 'role', when: 'Oct 25 10:00 AM', where: 'Chicago, US' },
];

// ── Permission helpers (mirrors the HTML's has/granted/cnt/people) ──
export function hasPermission(role: string, m: number, c: number): boolean {
  const def = ROLES[role];
  if (!def) return false;
  const bits = def.g[m] ?? '';
  return bits.charAt(c) === '1';
}

export function peopleInRole(role: string): Person[] {
  return PEOPLE.filter((p) => Object.values(p.r).includes(role));
}

export function countRole(role: string): number {
  return peopleInRole(role).length;
}

export function grantedCount(role: string): { total: number; sensitive: number } {
  let total = 0;
  let sensitive = 0;
  CAPS.forEach((cap) => {
    if (hasPermission(role, cap.m, cap.c)) {
      total += 1;
      if (cap.sensitive) sensitive += 1;
    }
  });
  return { total, sensitive };
}

// ── Client-side role state persistence (localStorage) ──
// Roles are mutable on the client; changes persist to localStorage so the
// workspace retains custom roles and permission edits between sessions.
// This is the client-side store — it will hook to a database later.

export const ROLES_STORAGE_KEY = 'unsaid.workspace.roles.v1';

export function cloneRoles(roles: Record<string, RoleDef>): Record<string, RoleDef> {
  const out: Record<string, RoleDef> = {};
  for (const [k, v] of Object.entries(roles)) {
    out[k] = { ...v, g: [...v.g] };
  }
  return out;
}

export function loadSavedRoles(): Record<string, RoleDef> {
  if (typeof window === 'undefined') return cloneRoles(ROLES);
  try {
    const raw = localStorage.getItem(ROLES_STORAGE_KEY);
    if (!raw) return cloneRoles(ROLES);
    const parsed = JSON.parse(raw) as Record<string, RoleDef>;
    // Merge: ensure Admin is always present and locked
    if (!parsed.Admin) {
      parsed.Admin = cloneRoles(ROLES).Admin;
    }
    return parsed;
  } catch {
    return cloneRoles(ROLES);
  }
}

export function persistRoles(roles: Record<string, RoleDef>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ROLES_STORAGE_KEY, JSON.stringify(roles));
  } catch {
    // ignore quota / serialization errors
  }
}

// Count unsaved changes between a working copy and a saved snapshot.
export function diffRoleCount(
  a: Record<string, RoleDef>,
  b: Record<string, RoleDef>
): number {
  let n = 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const ra = a[k];
    const rb = b[k];
    if (!ra || !rb) {
      n += 1; // added or deleted
      continue;
    }
    for (let i = 0; i < MOD.length; i++) {
      const ga = ra.g[i] ?? '';
      const gb = rb.g[i] ?? '';
      const len = Math.max(ga.length, gb.length);
      for (let j = 0; j < len; j++) {
        if ((ga.charAt(j) || '0') !== (gb.charAt(j) || '0')) n += 1;
      }
    }
    if (ra.sc !== rb.sc) n += 1;
    if (ra.cost !== rb.cost) n += 1;
    if (ra.pii !== rb.pii) n += 1;
    if (ra.bank !== rb.bank) n += 1;
    if (ra.bulk !== rb.bulk) n += 1;
  }
  return n;
}

// Create a blank role definition (all permissions off).
export function blankRole(description = ''): RoleDef {
  return {
    d: description || 'Custom role. Start here, add only what the job needs.',
    g: MOD.map(() => ''),
    sc: 'all',
    cost: 'hide',
    pii: 'mask',
    bank: 'hide',
    agg: 0,
    bulk: '100',
  };
}
