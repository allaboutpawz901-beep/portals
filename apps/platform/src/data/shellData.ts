import { TOP_NAV } from '@/lib/designCanvasStore';

export type ScreenType = 'overview' | 'list' | 'wizard' | 'drawer';

/**
 * Slugify a TOP_NAV category/subcategory label into a stable screen id segment.
 * "Home & Living" → "home-living", "Sweatshirts" → "sweatshirts".
 */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Screen id for a REAL catalog-tree path: ['Apparel','Women','T-Shirts'] →
 * 'studio-apparel--women--t-shirts'. A DOUBLE dash separates path segments
 * so single dashes inside names ('T-Shirts', 'Cards & stationery' →
 * 'cards-and-stationery') stay unambiguous when routing splits the id.
 */
export function catalogScreenIdForPath(path: string[]): string {
  return 'studio-' + path.map(slugify).join('--');
}

/**
 * Routable real-tree catalog paths, keyed by screen id (e.g.
 * 'studio-cards-and-stationery' → ['Cards & stationery']). Registered by
 * the UI when the real /api/v1/categories tree loads (SideRail walks the
 * whole tree). Keyed by the EXACT names the ids were generated from — no
 * slug re-matching, which breaks when a DB slug ('cards-stationery')
 * differs from the name's slugify ('cards-and-stationery').
 */
const catalogPaths = new Map<string, string[]>();
export function registerCatalogPaths(entries: Record<string, string[]>): void {
  for (const [id, names] of Object.entries(entries)) catalogPaths.set(id, names);
}
export function catalogPathFor(id: string): string[] | null {
  return catalogPaths.get(id) ?? null;
}
/** Prettified fallback while the real tree loads: 'women-t-shirts' → 'Women T Shirts'. */
function prettifySlugSlug(id: string): string {
  return id
    .split('--')
    .pop()!
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Build the Design Studio sidebar "Catalog" group screens by mirroring the
 * in-Studio top bar (TOP_NAV) parent-child hierarchy. Each TOP_NAV category
 * is a parent screen; its subcategories are children (collapsed by default,
 * expand on click in the SideRail — NOT stuck open).
 */
function buildDesignCatalogScreens(): ScreenItem[] {
  return Object.entries(TOP_NAV).map(([category, subs]) => ({
    id: `studio-${slugify(category)}`,
    label: category,
    type: 'list' as ScreenType,
    children: subs.map((sub) => ({
      id: `studio-${slugify(category)}-${slugify(sub)}`,
      label: sub,
      type: 'list' as ScreenType,
    })),
  }));
}

export type GroupBgToken =
  | 'bg-qb-navy'
  | 'bg-qb-teal'
  | 'bg-qb-maroon'
  | 'bg-qb-green'
  | 'bg-qb-purple'
  | 'bg-qb-orange'
  | 'bg-error'
  | 'bg-primary';

export interface ScreenItem {
  id: string;
  label: string;
  type: ScreenType;
  badge?: number;
  /**
   * Routable but not shown in the sidebar — opened by an icon or an
   * action instead (the create wizard, Preview, View product page,
   * My orders). findScreen/screensOf still resolve hidden items, so
   * tabs and navigation keep working; the sidebar filters them out.
   */
  hidden?: boolean;
  /** Nested sub-screens rendered indented beneath this item. */
  children?: ScreenItem[];
}

export interface ScreenWithGroup extends ScreenItem {
  group: string;
}

export interface DomainGroup {
  name: string;
  icon: string;
  bg: GroupBgToken;
  screens: ScreenItem[];
  /** Alert-styled count badge (e.g. My orders = 1 awaiting). */
  badge?: number;
}

export interface DomainConfig {
  label: string;
  icon: string;
  groups: DomainGroup[];
}

export type DomainKey =
  | 'dashboard'
  | 'marketing'
  | 'catalog'
  | 'design'
  | 'orders'
  | 'finance'
  | 'contacts'
  | 'support'
  | 'settings'
  | 'reports'
  | 'connected-suppliers';

export const DOMAINS: Record<DomainKey, DomainConfig> = {
  dashboard: {
    label: 'Dashboard',
    icon: 'dashboard',
    groups: [
      {
        name: 'Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'ops', label: 'Dashboard', type: 'overview' },
          { id: 'tasks', label: 'Tasks & Projects', type: 'wizard' },
        ],
      },
    ],
  },
  marketing: {
    label: 'Marketing',
    icon: 'campaign',
    groups: [
      {
        name: 'Social Publishing',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'mkt-publishing-overview', label: 'Publishing Overview', type: 'overview' },
          { id: 'mkt-create-content', label: 'Create Content', type: 'wizard' },
          { id: 'mkt-oversight', label: 'Oversight', type: 'list' },
        ],
      },
      {
        name: 'Promotions',
        icon: 'sell',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'mkt-promotions', label: 'Promotions & Discounts', type: 'list' },
        ],
      },
      {
        name: 'Newsletter',
        icon: 'mail',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'mkt-newsletter', label: 'Newsletter Campaigns', type: 'list' },
        ],
      },
      {
        name: 'Automation',
        icon: 'bolt',
        bg: 'bg-qb-green',
        screens: [
          { id: 'mkt-automation', label: 'Automation', type: 'list' },
        ],
      },
      {
        name: 'Advertising',
        icon: 'campaign',
        bg: 'bg-primary',
        screens: [
          { id: 'mkt-adcenter', label: 'Ad Center', type: 'overview' },
          { id: 'mkt-campaigns', label: 'Campaigns', type: 'list' },
          { id: 'mkt-adsets', label: 'Ad Sets', type: 'list' },
          { id: 'mkt-creatives', label: 'Creatives', type: 'list' },
          { id: 'mkt-audiences', label: 'Audiences', type: 'list' },
          { id: 'mkt-pixels', label: 'Pixels', type: 'list' },
          { id: 'mkt-adspend', label: 'Ad Spend & Finance', type: 'list' },
          { id: 'mkt-advertisers', label: 'Advertisers', type: 'list' },
        ],
      },
      // CMS & Banners moved to Settings > Website / CMS
    ],
  },
  catalog: {
    label: 'Catalog',
    icon: 'inventory_2',
    groups: [
      {
        name: 'Catalog Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'catalog-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Products & Variants',
        icon: 'checkroom',
        bg: 'bg-qb-green',
        screens: [
          { id: 'products', label: 'Products', type: 'list' },
          { id: 'listings', label: 'Listings', type: 'list' },
          { id: 'blanks', label: 'Blanks', type: 'list' },
          { id: 'catalog-review', label: 'Catalog review', type: 'list' },
          { id: 'catalog-items', label: 'Catalog items', type: 'list' },
          { id: 'published-skus', label: 'Published Items & SKUs', type: 'list' },
          { id: 'bundles', label: 'Bundles', type: 'list' },
          { id: 'categories', label: 'Categories', type: 'list' },
          { id: 'catalog-parties', label: 'Suppliers / Vendors / Sellers', type: 'list' },
        ],
      },
      {
        name: 'Channels',
        icon: 'hub',
        bg: 'bg-qb-teal',
        screens: [
          {
            id: 'ecommerce',
            label: 'Ecommerce',
            type: 'list',
            children: [
              { id: 'tiktok', label: 'TikTok', type: 'list' },
              { id: 'amazon', label: 'Amazon', type: 'list' },
              { id: 'facebook-marketplace', label: 'Facebook Marketplace', type: 'list' },
              { id: 'whatnot', label: 'What Not', type: 'list' },
              { id: 'etsy', label: 'Etsy', type: 'list' },
              { id: 'ebay', label: 'Ebay', type: 'list' },
            ],
          },
        ],
      },
    ],
  },
  // ── DESIGN STUDIO (executive decision: promoted out of Catalog as its own domain) ──
  // Sidebar spec (upload/canvas.html + pasted_image_1793940317924.png):
  //   New design (canvas) is the first child of Studio — when clicked it opens
  //   the canvas screen with toolbar buttons (Upload/AI/Add text/…).
  //   Studio tools open the right-rail inspector inside the canvas screen;
  //   no visible "drawer" tag. Collection & Published are folded under
  //   My library as child screens. Catalog children = studio-eligible
  //   products from the global catalog, by department.
  design: {
    label: 'Design Studio',
    icon: 'apparel',
    groups: [
      // ── STUDIO (the only studio group) ──
      // New design (canvas) is the parent. Its children are the studio
      // dock tools — Upload, Images, Graphics, Add text, AI, Product
      // details, Layouts, Files, Themes, Settings. Each opens its own
      // dock panel on the canvas. No separate "Design" group — these
      // ARE the studio's children.
      {
        name: 'Studio',
        icon: 'palette',
        bg: 'bg-qb-purple',
        screens: [
          {
            id: 'new-design',
            label: 'New design',
            type: 'wizard',
            children: [
              { id: 'studio-upload', label: 'Upload', type: 'drawer' },
              { id: 'studio-images', label: 'Images', type: 'drawer' },
              {
                id: 'studio-graphics',
                label: 'Graphics',
                type: 'drawer',
                children: [
                  { id: 'studio-templates', label: 'Templates', type: 'drawer' },
                  { id: 'studio-shapes', label: 'Shapes', type: 'drawer' },
                ],
              },
              { id: 'studio-add-text', label: 'Add text', type: 'drawer' },
              { id: 'studio-ai', label: 'AI', type: 'drawer' },
              {
                id: 'studio-product-details',
                label: 'Product details',
                type: 'drawer',
                children: [
                  { id: 'studio-layers', label: 'Layers', type: 'drawer' },
                ],
              },
              { id: 'studio-layouts', label: 'Layouts', type: 'drawer' },
              {
                id: 'studio-files',
                label: 'Files',
                type: 'drawer',
                children: [
                  { id: 'studio-shutterstock', label: 'Shutterstock', type: 'drawer' },
                ],
              },
              { id: 'studio-themes', label: 'Themes', type: 'drawer' },
              {
                id: 'studio-settings',
                label: 'Settings',
                type: 'drawer',
                children: [
                  { id: 'studio-show-grid', label: 'Show grid', type: 'drawer' },
                  { id: 'studio-show-guides', label: 'Show guides', type: 'drawer' },
                  { id: 'studio-show-bleeds', label: 'Show bleeds', type: 'drawer' },
                  { id: 'studio-show-rulers', label: 'Show rulers', type: 'drawer' },
                  { id: 'studio-units', label: 'Units', type: 'drawer' },
                  {
                    id: 'studio-background-color',
                    label: 'Background color',
                    type: 'drawer',
                    children: [
                      { id: 'studio-bg-none', label: 'No background', type: 'drawer' },
                      { id: 'studio-bg-palette', label: 'Pick from palette', type: 'drawer' },
                      { id: 'studio-bg-custom', label: 'Create custom color', type: 'drawer' },
                    ],
                  },
                  { id: 'studio-reset-settings', label: 'Reset settings to default', type: 'drawer' },
                ],
              },
            ],
          },
          // Preview + product page are NOT in the sidebar UI — they're only
          // reachable via create-actions (canvas Preview button, card click).
          // Marked hidden so SideRail skips them, but findScreen() still
          // resolves them (the navigation needs that to open the tab).
          { id: 'design-preview', label: 'Preview', type: 'wizard', hidden: true },
          { id: 'product-page', label: 'Product page', type: 'wizard', hidden: true },
          // The Product Catalog (upload/product cards.html) — the one shared
          // catalog page. Hidden from the sidebar (the Catalog group's tree
          // entries land on it); routable so tabs/back-navigation work.
          { id: 'product-catalog', label: 'Product Catalog', type: 'list', hidden: true },
        ],
      },
      // My library = ITS OWN GROUP (own icon, own chevron, own dropdown of
      // tools). NOT under Studio. Children: My collections, My templates.
      {
        name: 'My library',
        icon: 'folder_special',
        bg: 'bg-qb-orange',
        screens: [
          {
            id: 'studio-my-library',
            label: 'My library',
            type: 'drawer',
            children: [
              { id: 'studio-my-collections', label: 'My collections', type: 'list' },
              { id: 'studio-my-templates', label: 'My templates', type: 'drawer' },
            ],
          },
        ],
      },
      // (4) Catalog = parent-child accordion mirroring TOP_NAV top-level
      //     categories. Each category has its subcategories as children.
      {
        name: 'Catalog',
        icon: 'grid_view',
        bg: 'bg-qb-teal',
        screens: [
          ...buildDesignCatalogScreens(),
        ],
      },
      // (5) My products = Published table + My Stores + My orders.
      {
        name: 'My products',
        icon: 'layers',
        bg: 'bg-qb-green',
        screens: [
          { id: 'studio-published', label: 'Published', type: 'list' },
          { id: 'studio-hidden', label: 'Hidden', type: 'list' },
          { id: 'studio-my-stores', label: 'My Stores', type: 'list' },
          { id: 'studio-my-orders', label: 'My orders', type: 'list' },
        ],
      },
    ],
  },
  orders: {
    label: 'Orders',
    icon: 'local_shipping',
    groups: [
      {
        name: 'Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'orders-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Order Management',
        icon: 'assignment',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'orders', label: 'Orders', type: 'list' },
          { id: 'order-detail', label: 'Order detail', type: 'list' },
          { id: 'packing-slip', label: 'Packing slip', type: 'list' },
          { id: 'order-issues', label: 'Order Issues (Manual Push / Needs Attention)', type: 'list' },
          { id: 'shipping-settings', label: 'Shipping settings', type: 'list' },
        ],
      },
      {
        name: 'Purchasing',
        icon: 'shopping_bag',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'purchase-orders', label: 'Purchase orders', type: 'list' },
          { id: 'inventory', label: 'Inventory', type: 'list' },
          { id: 'fulfillment-queue', label: 'Fulfillment Queue', type: 'list' },
          { id: 'batch-slips', label: 'Batch slips & labels', type: 'list' },
        ],
      },
      {
        name: 'Returns',
        icon: 'assignment_return',
        bg: 'bg-error',
        screens: [{ id: 'returns', label: 'Returns & Claims', type: 'list' }],
      },
    ],
  },
  // ── FINANCE (spec: unsaid-component-functionality-spec.md §2–§6) ──
  // Five groups: Accounting, Expenses & Bills, Sales, Business Tax, Cap Table.
  // Cap Table lives INSIDE Finance (executive decision — equity is finance).
  // Receipts is ONE page with two entry points (Accounting = bank-feed
  // companion; Expenses & Bills = capture queue). Add bill [D] and other
  // document containers are reached from their list pages / Create flyout.
  finance: {
    label: 'Finance',
    icon: 'account_balance',
    groups: [
      {
        name: 'Accounting',
        icon: 'play_arrow',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'accounting', label: 'Overview', type: 'overview' },
          { id: 'bank', label: 'Bank transactions', type: 'list' },
          { id: 'receipts', label: 'Receipts', type: 'list' },
          { id: 'reconcile', label: 'Reconcile', type: 'wizard' },
          { id: 'coa', label: 'Chart of accounts', type: 'list' },
          { id: 'cash-flow', label: 'Cash flow', type: 'overview' },
          { id: 'rules', label: 'Rules', type: 'list' },
          { id: 'entities', label: 'Entities', type: 'list' },
          { id: 'liabilities-credit', label: 'Liabilities and credit', type: 'list' },
          { id: 'quick-view', label: 'Quick view', type: 'list' },
        ],
      },
      {
        name: 'Expenses & Bills',
        icon: 'receipt',
        bg: 'bg-qb-green',
        screens: [
          { id: 'bills-overview', label: 'Overview', type: 'overview' },
          { id: 'expenses', label: 'Expense transactions', type: 'list' },
          { id: 'vendors', label: 'Vendors', type: 'list' },
          { id: 'bills', label: 'Bills', type: 'list' },
          { id: 'bill-payments', label: 'Pay bills', type: 'wizard' },
          { id: 'bill-approval-setup', label: 'Bill and payment approval setup', type: 'list' },
          { id: 'contractors', label: 'Contractors', type: 'list' },
          { id: '1099s', label: '1099s', type: 'list' },
          // Same page as Accounting > Receipts — second entry point.
          { id: 'receipts', label: 'Receipts', type: 'list' },
          { id: 'purchase-orders', label: 'Purchase orders', type: 'wizard' },
          { id: 'payroll', label: 'Payroll', type: 'list' },
        ],
      },
      {
        name: 'Sales',
        icon: 'attach_money',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'sales-overview', label: 'Overview', type: 'overview' },
          { id: 'sales-transactions', label: 'Revenue transactions', type: 'list' },
          { id: 'invoices', label: 'Invoices', type: 'list' },
          { id: 'payment-links', label: 'Payment links', type: 'list' },
          { id: 'sales-channels', label: 'Sales channels', type: 'list' },
          { id: 'payouts', label: 'Payouts', type: 'list' },
          { id: 'gift-cards', label: 'Gift cards', type: 'list' },
          { id: 'products', label: 'Products and services', type: 'list' },
          { id: 'subscriptions', label: 'Subscriptions', type: 'list' },
          { id: 'estimates', label: 'Estimates', type: 'list' },
          { id: 'statements', label: 'Statements', type: 'list' },
          { id: 'refunds', label: 'Refunds', type: 'list' },
          { id: 'disputes', label: 'Disputes', type: 'list' },
        ],
      },
      {
        name: 'Business Tax',
        icon: 'description',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'tax-overview', label: 'Business tax at a glance', type: 'overview' },
          { id: 'tax-return', label: 'Create tax return', type: 'wizard' },
          { id: 'download-tax-summary', label: 'Download tax summary', type: 'list' },
          { id: 'tax-summary', label: 'Tax summary', type: 'list' },
          { id: 'tax-income', label: 'Income from your transactions', type: 'list' },
          { id: 'tax-assets', label: 'Depreciable business assets', type: 'list' },
          { id: 'tax-1099k', label: '1099-K detail', type: 'list' },
          { id: 'payroll-tax', label: 'Payroll tax', type: 'list' },
          { id: 'tax-filing', label: 'Year-end tax filing', type: 'wizard' },
        ],
      },
      {
        name: 'Cap Table',
        icon: 'pie_chart',
        bg: 'bg-primary',
        screens: [
          { id: 'cap-overview', label: 'Overview', type: 'overview' },
          { id: 'cap-table', label: 'Cap table', type: 'list' },
          { id: 'cap-holders', label: 'Stakeholders', type: 'list' },
          { id: 'cap-rounds', label: 'Funding rounds', type: 'list' },
          { id: 'cap-options', label: 'Option pool', type: 'list' },
          { id: 'cap-safes', label: 'SAFEs and convertibles', type: 'list' },
          { id: 'cap-equity-events', label: 'Equity events', type: 'list' },
          { id: 'cap-documents', label: 'Documents', type: 'list' },
          { id: 'cap-dilution', label: 'Dilution modeler', type: 'wizard' },
          { id: 'cap-waterfall', label: 'Liquidation waterfall', type: 'wizard' },
          { id: 'cap-409a', label: '409A and valuations', type: 'list' },
          { id: 'cap-controls', label: 'Controls', type: 'list' },
        ],
      },
    ],
  },
  contacts: {
    label: 'Contacts',
    icon: 'groups',
    groups: [
      {
        name: 'CRM Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'crm-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Parties',
        icon: 'people',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'parties', label: 'Parties', type: 'list' },
          { id: 'customers', label: 'Customer', type: 'list' },
          { id: 'vendors', label: 'Vendors', type: 'list' },
          { id: 'suppliers', label: 'Suppliers', type: 'list' },
        ],
      },
      {
        name: 'CRM Tools',
        icon: 'hub',
        bg: 'bg-qb-green',
        screens: [
          { id: 'leads', label: 'Leads', type: 'list' },
          { id: 'appointments', label: 'Appointments', type: 'list' },
          { id: 'segments', label: 'Segments', type: 'list' },
          { id: 'templates', label: 'Templates', type: 'list' },
        ],
      },
      {
        name: 'Seller relationships',
        icon: 'storefront',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'sellers', label: 'Sellers', type: 'list' },
          { id: 'seller-detail', label: 'Seller detail', type: 'list' },
          { id: 'seller-feed', label: 'Seller feed', type: 'list' },
          { id: 'seller-onboarding', label: 'Onboarding Queue', type: 'list' },
        ],
      },
    ],
  },
  support: {
    label: 'Support',
    icon: 'support_agent',
    groups: [
      {
        name: 'Support Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'support-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Inbox & Tickets',
        icon: 'inbox',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'tickets', label: 'Tickets', type: 'list' },
          { id: 'agent-workspace', label: 'Agent Workspace', type: 'list' },
          { id: 'messages', label: 'Omnichannel Inbox', type: 'list' },
        ],
      },
      {
        name: 'Queues',
        icon: 'notifications',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'attention', label: 'Attention Queue', type: 'list', badge: 8 },
          { id: 'customer-queue', label: 'Customer Queue', type: 'list', badge: 8 },
          { id: 'seller-queue', label: 'Seller Queue', type: 'list', badge: 7 },
        ],
      },
      {
        name: 'SLA & Routing',
        icon: 'route',
        bg: 'bg-qb-green',
        screens: [
          { id: 'queues', label: 'Queues', type: 'list' },
          { id: 'sla', label: 'SLA rules', type: 'list' },
          { id: 'automations', label: 'Automations', type: 'list' },
        ],
      },
      {
        name: 'Trust & Safety',
        icon: 'shield',
        bg: 'bg-error',
        screens: [
          { id: 'trust', label: 'Knowledge base', type: 'list' },
          { id: 'help-center', label: 'Help center', type: 'list' },
          { id: 'docs', label: 'Docs', type: 'list' },
          { id: 'policies', label: 'Policies', type: 'list' },
        ],
      },
    ],
  },
  settings: {
    label: 'Settings',
    icon: 'settings',
    groups: [
      // ── Workspace (HTML: unsaid-settings-access.html NAV — opens with cards) ──
      {
        name: 'Workspace',
        icon: 'workspaces',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'ws-home', label: 'Home', type: 'overview' },
          { id: 'ws-general', label: 'General', type: 'list' },
          { id: 'ws-teammates', label: 'Teammates', type: 'list' },
          { id: 'ws-roles', label: 'Roles and permissions', type: 'list' },
          { id: 'ws-external', label: 'External access', type: 'list' },
          { id: 'ws-approvals', label: 'Approvals and limits', type: 'list' },
          { id: 'ws-owners', label: 'Workspace owners', type: 'list' },
          { id: 'ws-hours', label: 'Office hours', type: 'list' },
          { id: 'ws-brands', label: 'Brands', type: 'list' },
          { id: 'ws-security', label: 'Security', type: 'list' },
          { id: 'ws-activity', label: 'Activity log', type: 'list' },
          { id: 'ws-multilingual', label: 'Multilingual', type: 'list' },
        ],
      },
      // ── Accounting & Finance (HTML) ──
      {
        name: 'Accounting & Finance',
        icon: 'account_balance',
        bg: 'bg-qb-green',
        screens: [
          { id: 'set-coa', label: 'Chart of Accounts', type: 'list' },
          { id: 'set-bank-rules', label: 'Bank Rules', type: 'list' },
          { id: 'set-recurring-templates', label: 'Recurring Templates', type: 'list' },
          { id: 'set-business-tax', label: 'Business Tax', type: 'list' },
          { id: 'set-reports-budgets', label: 'Reports & Budgets', type: 'list' },
          { id: 'set-financial', label: 'Financial Settings', type: 'list' },
        ],
      },
      // ── CRM & Contacts (HTML) ──
      {
        name: 'CRM & Contacts',
        icon: 'groups',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'set-customer-hub', label: 'Customer Hub', type: 'list' },
          { id: 'set-vendors-suppliers', label: 'Vendors & Suppliers', type: 'list' },
          { id: 'set-segments-lists', label: 'Segments & Lists', type: 'list' },
          { id: 'set-lead-capture', label: 'Lead Capture Forms', type: 'list' },
        ],
      },
      // ── Catalog & Design (HTML) ──
      {
        name: 'Catalog & Design',
        icon: 'palette',
        bg: 'bg-primary',
        screens: [
          { id: 'set-design-studio', label: 'Design Studio', type: 'list' },
          { id: 'set-products-bundles', label: 'Products & Bundles', type: 'list' },
          { id: 'set-pricing-discounts', label: 'Pricing & Discounts', type: 'list' },
          { id: 'set-categories-tags', label: 'Categories & Tags', type: 'list' },
        ],
      },
      // ── Marketing & Social (HTML) ──
      {
        name: 'Marketing & Social',
        icon: 'campaign',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'set-social-channels', label: 'Social Channels', type: 'list' },
          { id: 'set-publishing-queue', label: 'Publishing Queue', type: 'list' },
          { id: 'set-newsletter-email', label: 'Newsletter & Email', type: 'list' },
          { id: 'set-ad-center', label: 'Ad Center', type: 'list' },
          { id: 'set-gmb', label: 'Google My Business', type: 'list' },
        ],
      },
      // ── Website / CMS (moved from Catalog > Channels) ──
      {
        name: 'Website / CMS',
        icon: 'web',
        bg: 'bg-qb-purple',
        screens: [
          { id: 'website-cms', label: 'Website / CMS', type: 'list' },
          { id: 'banners', label: 'Banners', type: 'list' },
          { id: 'popups', label: 'Popups', type: 'list' },
          { id: 'cms-pages', label: 'CMS pages', type: 'list' },
          { id: 'content-blocks', label: 'Content blocks', type: 'list' },
        ],
      },
      // ── Operations & Orders (HTML) ──
      {
        name: 'Operations & Orders',
        icon: 'local_shipping',
        bg: 'bg-qb-green',
        screens: [
          { id: 'set-fulfillment-shipping', label: 'Fulfillment & Shipping', type: 'list' },
          { id: 'set-inventory-warehouses', label: 'Inventory & Warehouses', type: 'list' },
          { id: 'set-support-channels', label: 'Support Channels', type: 'list' },
          { id: 'set-help-center', label: 'Help Center', type: 'list' },
          { id: 'set-outbound', label: 'Outbound', type: 'list' },
        ],
      },
      // ── EXTENSION: Dashboard & Analytics (not in HTML, gives Dashboard a home) ──
      {
        name: 'Dashboard & Analytics',
        icon: 'dashboard',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'set-dashboards', label: 'Dashboards & widgets', type: 'list' },
          { id: 'set-kpi-targets', label: 'KPI targets', type: 'list' },
          { id: 'set-analytics-config', label: 'Analytics configuration', type: 'list' },
        ],
      },
      // ── EXTENSION: Support (not in HTML, gives Support domain a home) ──
      {
        name: 'Support',
        icon: 'support_agent',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'set-ticket-channels', label: 'Ticket channels', type: 'list' },
          { id: 'set-sla-policies', label: 'SLA policies', type: 'list' },
          { id: 'set-automation-rules', label: 'Automation rules', type: 'list' },
          { id: 'set-kb-config', label: 'Knowledge base', type: 'list' },
        ],
      },
      // ── EXTENSION: Connected Suppliers (not in HTML, gives pillar #8 a home) ──
      {
        name: 'Connected Suppliers',
        icon: 'hub',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'set-supplier-portal', label: 'Supplier portal', type: 'list' },
          { id: 'set-integration-feeds', label: 'Integration feeds', type: 'list' },
          { id: 'set-contracts-config', label: 'Contracts & pricing', type: 'list' },
          { id: 'set-compliance-config', label: 'Compliance & 1099', type: 'list' },
        ],
      },
      // ── EXTENSION: Reports (not in HTML, gives Reports domain a home) ──
      {
        name: 'Reports',
        icon: 'assessment',
        bg: 'bg-primary',
        screens: [
          { id: 'set-report-templates', label: 'Report templates', type: 'list' },
          { id: 'set-scheduled-reports', label: 'Scheduled reports', type: 'list' },
          { id: 'set-report-dashboards', label: 'Report dashboards', type: 'list' },
        ],
      },
      // ── System & Personal (HTML) ──
      {
        name: 'System & Personal',
        icon: 'dns',
        bg: 'bg-error',
        screens: [
          { id: 'set-integrations', label: 'Integrations', type: 'list' },
          { id: 'set-data-privacy', label: 'Data & Privacy', type: 'list' },
          { id: 'set-notifications', label: 'Notifications', type: 'list' },
          { id: 'set-api-tokens', label: 'API Tokens', type: 'list' },
          { id: 'set-audit', label: 'Audit log', type: 'list' },
        ],
      },
    ],
  },
  // Reports — a standalone, cross-module view (NOT tied to accounting/finance).
  // Accessed only via the pinned Reports button in the icon rail. Broken down
  // by every module so each domain's reports live in their own group.
  reports: {
    label: 'Reports',
    icon: 'assessment',
    groups: [
      {
        name: 'Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'reports-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Analytics',
        icon: 'bar_chart',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'analytics', label: 'Analytics', type: 'overview' },
          { id: 'explorer', label: 'Explorer', type: 'list' },
        ],
      },
      {
        name: 'Dashboard reports',
        icon: 'dashboard',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'report-ops-vitals', label: 'Operations Vitals report', type: 'list' },
          { id: 'report-exec-gmv', label: 'Executive GMV & Margins report', type: 'list' },
          { id: 'report-analytics', label: 'Analytics report', type: 'list' },
        ],
      },
      {
        name: 'Contacts reports',
        icon: 'groups',
        bg: 'bg-qb-green',
        screens: [
          { id: 'report-customers', label: 'Customers report', type: 'list' },
          { id: 'report-vendors', label: 'Vendors report', type: 'list' },
          { id: 'report-suppliers', label: 'Suppliers report', type: 'list' },
          { id: 'report-leads', label: 'Leads & pipeline report', type: 'list' },
        ],
      },
      {
        name: 'Catalog reports',
        icon: 'inventory_2',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'report-products', label: 'Products & SKUs report', type: 'list' },
          { id: 'report-bundles', label: 'Bundles report', type: 'list' },
          { id: 'report-channels', label: 'Channel performance report', type: 'list' },
          { id: 'report-designs', label: 'Designs & collections report', type: 'list' },
        ],
      },
      {
        name: 'Orders reports',
        icon: 'local_shipping',
        bg: 'bg-primary',
        screens: [
          { id: 'report-orders', label: 'Orders report', type: 'list' },
          { id: 'report-fulfillment', label: 'Fulfillment report', type: 'list' },
          { id: 'report-inventory', label: 'Inventory report', type: 'list' },
          { id: 'report-returns', label: 'Returns & claims report', type: 'list' },
        ],
      },
      {
        name: 'Finance reports',
        icon: 'account_balance',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'report-invoices', label: 'Invoices report', type: 'list' },
          { id: 'report-bills', label: 'Bills & expenses report', type: 'list' },
          { id: 'report-tax', label: 'Tax summary report', type: 'list' },
          { id: 'report-reconcile', label: 'Reconciliation report', type: 'list' },
        ],
      },
      {
        name: 'Marketing reports',
        icon: 'campaign',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'report-social', label: 'Social performance report', type: 'list' },
          { id: 'report-promotions', label: 'Promotions report', type: 'list' },
          { id: 'report-newsletter', label: 'Newsletter report', type: 'list' },
          { id: 'report-cms', label: 'CMS & editorial report', type: 'list' },
        ],
      },
      {
        name: 'Support reports',
        icon: 'support_agent',
        bg: 'bg-qb-green',
        screens: [
          { id: 'report-tickets', label: 'Tickets report', type: 'list' },
          { id: 'report-sla', label: 'SLA report', type: 'list' },
          { id: 'report-trust', label: 'Trust & safety report', type: 'list' },
        ],
      },
    ],
  },
  // Connected Suppliers — standalone pillar #8 in the Navigation Hub flyout.
  // NOT in the PINNED icon rail; accessed only via the flyout. Unified view
  // of the supply-chain partner network: directory, integration feeds,
  // onboarding, contracts, and compliance.
  'connected-suppliers': {
    label: 'Connected Suppliers',
    icon: 'hub',
    groups: [
      {
        name: 'Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'suppliers-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Supplier Directory',
        icon: 'groups',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'suppliers-directory', label: 'All suppliers', type: 'list' },
          { id: 'suppliers-vendors', label: 'Vendors', type: 'list' },
          { id: 'suppliers-sellers', label: 'Sellers', type: 'list' },
        ],
      },
      {
        name: 'Integration Feeds',
        icon: 'extension',
        bg: 'bg-qb-green',
        screens: [
          { id: 'feed-printful', label: 'Printful API', type: 'list' },
          { id: 'feed-printify', label: 'Printify Network', type: 'list' },
          { id: 'feed-gelato', label: 'Gelato Global', type: 'list' },
          { id: 'feed-stripe', label: 'Stripe Connect & Clearing', type: 'list' },
          { id: 'feed-receipts', label: 'Receipts Intake (OCR)', type: 'list' },
        ],
      },
      {
        name: 'Onboarding',
        icon: 'how_to_reg',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'onboarding-vendor-portal', label: 'Vendor portal', type: 'list' },
          { id: 'onboarding-requests', label: 'Onboarding requests', type: 'list' },
          { id: 'onboarding-approvals', label: 'Approvals', type: 'list' },
        ],
      },
      {
        name: 'Contracts & Pricing',
        icon: 'handshake',
        bg: 'bg-primary',
        screens: [
          { id: 'contracts', label: 'Contracts', type: 'list' },
          { id: 'pricing-tiers', label: 'Pricing tiers', type: 'list' },
          { id: 'terms', label: 'Terms & SLAs', type: 'list' },
        ],
      },
      {
        name: 'Compliance',
        icon: 'verified',
        bg: 'bg-error',
        screens: [
          { id: 'compliance-certifications', label: 'Certifications', type: 'list' },
          { id: 'compliance-1099', label: '1099 / Tax', type: 'list' },
          { id: 'compliance-audit', label: 'Audit trail', type: 'list' },
        ],
      },
    ],
  },
};

export const PINNED: DomainKey[] = [
  'dashboard',
  'contacts',
  'catalog',
  'design',
  'orders',
  'finance',
  'marketing',
  'support',
];

export function screensOf(domain: DomainConfig): ScreenWithGroup[] {
  return domain.groups.flatMap((g) =>
    g.screens.flatMap((s) => [
      { ...s, group: g.name },
      ...(s.children ?? []).map((c) => ({ ...c, group: g.name })),
    ])
  );
}

/** Total screens in a group — nested children included, hidden excluded. */
export function groupScreenCount(group: DomainGroup): number {
  return group.screens.reduce(
    (n, s) => n + (s.hidden ? 0 : 1 + (s.children ?? []).filter((c) => !c.hidden).length),
    0,
  );
}

export function findScreen(domainId: DomainKey, screenId: string): ScreenWithGroup {
  const all = screensOf(DOMAINS[domainId]);
  const found = all.find((s) => s.id === screenId);
  if (found) return found;
  // Real-tree catalog path screens (studio-apparel--women--t-shirts) are not
  // in the static tree — resolve from the registry the UI fills when the
  // live /api/v1/categories tree loads, with a prettified fallback.
  if (domainId === 'design' && screenId.startsWith('studio-') && screenId.includes('--')) {
    const names = catalogPaths.get(screenId);
    return {
      id: screenId,
      label: names ? names[names.length - 1] : prettifySlugSlug(screenId),
      type: 'list',
      group: 'Catalog',
    };
  }
  return all[0];
}

export const SCREEN_HEADERS: Record<
  string,
  { title: string; subtitle: string; family: string; newLabel: string }
> = {
  invoices: { title: 'Invoices', subtitle: 'All invoices across customers.', family: 'sales', newLabel: 'Invoice' },
  expenses: { title: 'Expense transactions', subtitle: 'Bills, expenses, checks, credits.', family: 'expense', newLabel: 'Expense' },
  bills: { title: 'Bills', subtitle: 'Vendor bills — For review / Unpaid / Paid.', family: 'expense', newLabel: 'Bill' },
  customers: { title: 'Customers', subtitle: 'Party list — role=Customer.', family: 'party', newLabel: 'Customer' },
  vendors: { title: 'Vendors', subtitle: 'Party list — role=Vendor.', family: 'party', newLabel: 'Vendor' },
  products: { title: 'Products and services', subtitle: 'Catalog — same list as Catalog > Products.', family: 'catalog', newLabel: 'Product' },
  sales_transactions: { title: 'Revenue transactions', subtitle: 'Every sale and payment received.', family: 'sales', newLabel: 'Sale' },
  bank: { title: 'Bank transactions', subtitle: 'For review feed + Rules.', family: 'banking', newLabel: 'Deposit' },
  coa: { title: 'Chart of accounts', subtitle: 'Number, Name, Type, Balance.', family: 'accounting', newLabel: 'Account' },
  reports: { title: 'Reports', subtitle: 'Standard + custom reports.', family: 'reports', newLabel: 'Report' },
  products_services: { title: 'Products and services', subtitle: 'Same list as Finance.', family: 'catalog', newLabel: 'Product' },
  payment_links: { title: 'Payment links', subtitle: 'Share link or QR.', family: 'sales', newLabel: 'Payment link' },
  estimates: { title: 'Estimates', subtitle: 'Convert to Invoice.', family: 'sales', newLabel: 'Estimate' },
  statements: { title: 'Statements', subtitle: 'Batch billing summary.', family: 'sales', newLabel: 'Statement' },
  receipts: { title: 'Receipts', subtitle: 'Intake inbox — forward, drop, snap.', family: 'intake', newLabel: 'Receipt' },
  reconcile: { title: 'Reconcile', subtitle: 'Setup, then tie-out workspace.', family: 'wizard', newLabel: 'Reconcile' },
  rules: { title: 'Rules', subtitle: 'Bank rules.', family: 'accounting', newLabel: 'Rule' },
  tax_summary: { title: 'Tax summary', subtitle: 'Income / deductions / assets.', family: 'tax', newLabel: 'Tax summary' },
  tax_filing: { title: 'Year-end tax filing', subtitle: 'Feature-gated page.', family: 'tax', newLabel: 'File' },
  bill_payments: { title: 'Pay bills', subtitle: 'Pay bills workspace.', family: 'expense', newLabel: 'Payment' },
  trust: { title: 'Trust & Safety', subtitle: 'Inspection and enforcement.', family: 'support', newLabel: 'Case' },
  entities: { title: 'Entities', subtitle: 'Legal businesses under the workspace.', family: 'accounting', newLabel: 'Entity' },
  liabilities_credit: { title: 'Liabilities and credit', subtitle: 'Credit cards, lines of credit, loans.', family: 'banking', newLabel: 'Liability' },
  quick_view: { title: 'Quick view', subtitle: 'Report shortcuts with customize + Save view.', family: 'reports', newLabel: 'Report' },
  cash_flow: { title: 'Cash flow', subtitle: 'Money in, money out, projected balance.', family: 'accounting', newLabel: 'Cash flow' },
  bill_approval_setup: { title: 'Bill and payment approval setup', subtitle: 'Who approves bills and payments.', family: 'expense', newLabel: 'Approval rule' },
  contractors: { title: 'Contractors', subtitle: 'Invites, W-9s, 1099 tracking.', family: 'party', newLabel: 'Contractor' },
  '1099s': { title: '1099s', subtitle: 'Contractors over the threshold.', family: 'tax', newLabel: '1099' },
  payroll: { title: 'Payroll', subtitle: 'Pay periods, runs, forms.', family: 'expense', newLabel: 'Payroll run' },
  sales_channels: { title: 'Sales channels', subtitle: 'Connected channels and their sync.', family: 'sales', newLabel: 'Channel' },
  payouts: { title: 'Payouts', subtitle: 'Processor payouts and clearing.', family: 'sales', newLabel: 'Payout' },
  gift_cards: { title: 'Gift cards', subtitle: 'Issue, balance, redemption.', family: 'sales', newLabel: 'Gift card' },
  subscriptions: { title: 'Subscriptions', subtitle: 'Plans, subscribers, next charges.', family: 'sales', newLabel: 'Subscription' },
  refunds: { title: 'Refunds', subtitle: 'Against orders and invoices.', family: 'sales', newLabel: 'Refund' },
  disputes: { title: 'Disputes', subtitle: 'Chargebacks from the processor.', family: 'sales', newLabel: 'Dispute' },
  tax_return: { title: 'Create tax return', subtitle: 'From the year\u2019s books.', family: 'tax', newLabel: 'Return' },
  download_tax_summary: { title: 'Download tax summary', subtitle: 'PDF for the accountant.', family: 'tax', newLabel: 'Summary' },
  tax_income: { title: 'Income from your transactions', subtitle: 'Income grouped by tax category.', family: 'tax', newLabel: 'Category' },
  tax_assets: { title: 'Depreciable business assets', subtitle: 'Cost, class, depreciation to date.', family: 'tax', newLabel: 'Asset' },
  tax_1099k: { title: '1099-K detail', subtitle: 'Seller payment totals by processor.', family: 'tax', newLabel: '1099-K' },
  payroll_tax: { title: 'Payroll tax', subtitle: 'Quarterly liabilities and forms.', family: 'tax', newLabel: 'Quarter' },
};

export type DemoRow = Record<string, string | number>;

export const DEMO_ROWS: Record<string, DemoRow[]> = {
  invoices: [
    { no: '1002', date: '11/01/2026', party: 'Acme Corp', due: '12/01/2026', amount: '$1,240.00', balance: '$1,240.00', status: 'Open' },
    { no: '1001', date: '10/28/2026', party: 'Blue Ridge Co.', due: '11/27/2026', amount: '$3,410.00', balance: '$0.00', status: 'Paid' },
    { no: '0998', date: '10/15/2026', party: 'Maple Supply', due: '11/14/2026', amount: '$890.00', balance: '$890.00', status: 'Overdue' },
    { no: '0996', date: '10/02/2026', party: 'Northwind Labs', due: '11/01/2026', amount: '$2,100.00', balance: '$2,100.00', status: 'Open' },
    { no: '0994', date: '09/20/2026', party: 'Orion Apparel', due: '10/20/2026', amount: '$540.00', balance: '$0.00', status: 'Paid' },
  ],
  bills: [
    { vendor: 'Printful', billno: 'PF-9211', due: '11/10/2026', amount: '$2,880.00', status: 'For review' },
    { vendor: 'Gelato', billno: 'GL-4402', due: '11/15/2026', amount: '$1,200.00', status: 'Unpaid' },
    { vendor: 'Printify', billno: 'PR-3388', due: '10/30/2026', amount: '$640.00', status: 'Paid' },
  ],
  expenses: [
    { date: '10/30/2026', payee: 'Adobe', category: 'Software', paid: 'Visa •4421', amount: '$59.99', receipt: '✓' },
    { date: '10/29/2026', payee: 'FedEx', category: 'Shipping', paid: 'Bank •9910', amount: '$84.20', receipt: '✓' },
    { date: '10/28/2026', payee: 'Staples', category: 'Office', paid: 'Visa •4421', amount: '$142.50', receipt: '—' },
  ],
  customers: [
    { name: 'Acme Corp', email: 'ap@acme.com', orders: 12, ltv: '$18,240', balance: '$1,240', last: '11/01/2026', consent: 'Yes' },
    { name: 'Blue Ridge Co.', email: 'billing@blueridge.co', orders: 5, ltv: '$9,810', balance: '$0', last: '10/28/2026', consent: 'Yes' },
    { name: 'Maple Supply', email: 'ar@maplesupply.io', orders: 2, ltv: '$1,780', balance: '$890', last: '10/15/2026', consent: 'No' },
  ],
  vendors: [
    { name: 'Printful', role: 'Supplier', open: '$2,880', ytd: '$42,100', tax: '1099 —', sla: '99.1%' },
    { name: 'Gelato', role: 'Supplier', open: '$1,200', ytd: '$18,400', tax: '1099 —', sla: '98.4%' },
    { name: 'Printify', role: 'Supplier', open: '$0', ytd: '$31,900', tax: '1099 —', sla: '99.6%' },
  ],
  products: [
    { name: 'Classic Tee', sku: 'TEE-001', supplier: 'Printful', price: '$24.00', margin: '62%', status: 'Published' },
    { name: 'Canvas Tote', sku: 'TOTE-014', supplier: 'Gelato', price: '$18.00', margin: '55%', status: 'Published' },
    { name: 'Mug 11oz', sku: 'MUG-003', supplier: 'Printify', price: '$14.00', margin: '48%', status: 'Draft' },
  ],
  entities: [
    { name: 'Unsaid Apparel LLC', books: 'Accrual', currency: 'USD', fiscal: 'Jan – Dec', members: 4 },
    { name: 'Unsaid Studio LLC', books: 'Accrual', currency: 'USD', fiscal: 'Jan – Dec', members: 2 },
    { name: 'Unsaid EU GmbH', books: 'Accrual', currency: 'EUR', fiscal: 'Jan – Dec', members: 3 },
  ],
  liabilities_credit: [
    { type: 'Credit card', account: 'Visa Business •4421', limit: '$25,000.00', balance: '$3,182.40', available: '$21,817.60', rate: '22.9% APR' },
    { type: 'Line of credit', account: 'Chase LOC •2210', limit: '$50,000.00', balance: '$12,000.00', available: '$38,000.00', rate: '9.5% APR' },
    { type: 'Loan', account: 'SBA 7(a) term loan', limit: '$120,000.00', balance: '$84,260.00', available: '—', rate: '7.75% · 10 yr' },
  ],
  bill_approval_setup: [
    { rule: 'Bills over $1,000', applies: 'Bills', threshold: '$1,000', approvers: 'Two approvers', delegation: 'Auto while away' },
    { rule: 'All payments — Printful', applies: 'Payments', threshold: 'Any amount', approvers: 'One approver', delegation: '—' },
    { rule: 'Enterer cannot approve', applies: 'Bills & payments', threshold: '—', approvers: 'Enforced', delegation: '—' },
  ],
  contractors: [
    { name: 'Dana Whitfield', invite: 'Profile complete', w9: 'Yes', paid: '$8,420.00', status: 'Met' },
    { name: 'Marcus Lee', invite: 'Invite sent', w9: 'No', paid: '$2,100.00', status: 'Not met' },
    { name: 'Priya Nair', invite: 'Profile complete', w9: 'Yes', paid: '$11,980.00', status: 'Met' },
  ],
  '1099s': [
    { contractor: 'Priya Nair', tin: 'On file', ytd: '$11,980.00', threshold: '$600 met', status: 'Ready' },
    { contractor: 'Dana Whitfield', tin: 'On file', ytd: '$8,420.00', threshold: '$600 met', status: 'Ready' },
    { contractor: 'Marcus Lee', tin: 'Missing', ytd: '$2,100.00', threshold: '$600 met', status: 'Blocked' },
  ],
  payroll: [
    { period: 'Nov 16 – 30, 2026', status: 'Draft', payDate: '12/05/2026', gross: '$18,560.00', taxes: '$4,845.00', net: '$13,715.00' },
    { period: 'Nov 1 – 15, 2026', status: 'Approved', payDate: '11/20/2026', gross: '$18,420.00', taxes: '$4,812.00', net: '$13,608.00' },
    { period: 'Oct 16 – 31, 2026', status: 'Posted', payDate: '11/05/2026', gross: '$18,105.00', taxes: '$4,718.00', net: '$13,387.00' },
  ],
  sales_channels: [
    { channel: 'Storefront', status: 'Connected', sync: 'Live', fees: 'Processor fees mapped', payout: 'Chase •9910', orders: 1284 },
    { channel: 'TikTok Shop', status: 'Connected', sync: 'Live', fees: 'Marketplace fees mapped', payout: 'Chase •9910', orders: 412 },
    { channel: 'Etsy', status: 'Connected', sync: 'Syncing', fees: 'Listing fees mapped', payout: 'Chase •9910', orders: 187 },
    { channel: 'Amazon', status: 'Attention', sync: '14 errors', fees: 'Unmapped', payout: '—', orders: 96 },
  ],
  payouts: [
    { date: '11/10/2026', processor: 'Stripe', gross: '$2,410.60', fees: '$87.42', refunds: '$0.00', net: '$2,323.18', status: 'Matched' },
    { date: '11/06/2026', processor: 'Stripe', gross: '$1,842.60', fees: '$66.90', refunds: '$120.00', net: '$1,655.70', status: 'Matched' },
    { date: '11/03/2026', processor: 'TikTok', gross: '$980.00', fees: '$49.00', refunds: '$0.00', net: '$931.00', status: 'In clearing' },
  ],
  gift_cards: [
    { card: 'GC-4821', issued: '09/14/2026', balance: '$50.00', redeemed: '$18.00', status: 'Active' },
    { card: 'GC-5102', issued: '10/02/2026', balance: '$0.00', redeemed: '$25.00', status: 'Fully redeemed' },
    { card: 'GC-5330', issued: '11/01/2026', balance: '$100.00', redeemed: '$0.00', status: 'Active' },
  ],
  subscriptions: [
    { plan: 'Unsaid Monthly Box', subscribers: 184, cycle: 'Monthly', next: '12/01/2026', failed: 3, status: 'Active' },
    { plan: 'Unsaid Annual VIP', subscribers: 42, cycle: 'Annual', next: '03/01/2027', failed: 0, status: 'Active' },
    { plan: 'Studio Passive Club', subscribers: 28, cycle: 'Monthly', next: '12/01/2026', failed: 1, status: 'Paused' },
  ],
  refunds: [
    { date: '11/08/2026', customer: 'Acme Corp', source: '#10482', amount: '$64.00', type: 'Partial', reason: 'Wrong size', status: 'Posted' },
    { date: '11/05/2026', customer: 'Maple Supply', source: 'INV-0998', amount: '$890.00', type: 'Full', reason: 'Order cancelled', status: 'Pending approval' },
    { date: '10/28/2026', customer: 'Orion Apparel', source: '#10311', amount: '$24.00', type: 'Full', reason: 'Arrived damaged', status: 'Posted' },
  ],
  disputes: [
    { opened: '11/09/2026', processor: 'Stripe', amount: '$240.00', reason: 'Product not received', due: '11/23/2026', status: 'Action needed' },
    { opened: '11/02/2026', processor: 'Stripe', amount: '$89.00', reason: 'Subscription cancelled', due: '11/16/2026', status: 'Under review' },
    { opened: '10/21/2026', processor: 'Stripe', amount: '$312.00', reason: 'Fraud — unauthorized', due: '11/04/2026', status: 'Won' },
  ],
  tax_return: [
    { ret: '2026 Form 1065', year: '2026', status: 'In progress', blocked: '2 accounts unmapped' },
    { ret: '2026 Q4 estimated', year: '2026', status: 'Ready', blocked: '—' },
    { ret: '2025 Form 1065', year: '2025', status: 'Filed', blocked: '—' },
  ],
  download_tax_summary: [
    { period: '2026 · Jan – Nov', generated: '11/12/2026', format: 'PDF', status: 'Ready' },
    { period: '2025 · Full year', generated: '01/08/2026', format: 'PDF', status: 'Ready' },
    { period: '2024 · Full year', generated: '01/10/2025', format: 'PDF', status: 'Archived' },
  ],
  tax_income: [
    { category: 'Gross receipts', income: '$96,410.00', transactions: 412, share: '78%' },
    { category: 'Returns and allowances', income: '$3,120.00', transactions: 34, share: '3%' },
    { category: 'Other income', income: '$1,840.00', transactions: 6, share: '2%' },
  ],
  tax_assets: [
    { asset: 'Epson P7000 printer', cost: '$1,295.00', class: '5-year', inService: '03/2024', depreciation: '$733.82', status: 'Depreciating' },
    { asset: 'iMac 24\u2033', cost: '$1,599.00', class: '5-year', inService: '06/2025', depreciation: '$533.00', status: 'Depreciating' },
    { asset: 'Studio buildout', cost: '$8,400.00', class: '15-year', inService: '01/2023', depreciation: '$2,240.00', status: 'Depreciating' },
  ],
  tax_1099k: [
    { processor: 'Stripe', gross: '$96,410.00', transactions: 1284, threshold: '$5,000 met', status: 'Reportable' },
    { processor: 'TikTok Shop', gross: '$41,880.00', transactions: 412, threshold: '$5,000 met', status: 'Reportable' },
    { processor: 'Etsy', gross: '$12,140.00', transactions: 187, threshold: '$5,000 met', status: 'Reportable' },
  ],
  payroll_tax: [
    { quarter: 'Q4 2026', wages: '$36,925.00', federal: '$4,830.00', state: '$2,214.00', due: '01/15/2027', form: '941', status: 'Accruing' },
    { quarter: 'Q3 2026', wages: '$35,420.00', federal: '$4,640.00', state: '$2,125.00', due: '10/15/2026', form: '941', status: 'Filed' },
    { quarter: 'Q2 2026', wages: '$34,980.00', federal: '$4,580.00', state: '$2,099.00', due: '07/15/2026', form: '941', status: 'Filed' },
  ],
};

export interface ColumnDef {
  key: string;
  label: string;
  right?: boolean;
}

export interface ListScreenConfig {
  mode: 'list';
  key: string;
  title: string;
  subtitle: string;
  family: string;
  newLabel: string;
  tabs?: string[];
  cols: ColumnDef[];
  createActionsRow?: [string, string][];
  emptyTitle?: string;
  emptySteps?: string;
}

export interface OverviewKpi {
  label: string;
  value: string;
  delta?: string;
}

export interface OverviewScreenConfig {
  mode: 'overview';
  title: string;
  subtitle: string;
  kpis?: OverviewKpi[];
  actions?: [string, string][];
  panelTitle?: string;
  panelText?: string;
}

export type ScreenDefinition = ListScreenConfig | OverviewScreenConfig;

export const SCREEN_DEFS: Record<string, ScreenDefinition> = {
  invoices: {
    mode: 'list',
    key: 'invoices',
    title: 'Invoices',
    subtitle: 'All invoices across customers.',
    family: 'document',
    newLabel: 'Invoice',
    tabs: ['All', 'Open', 'Overdue', 'Paid'],
    cols: [
      { key: 'no', label: 'No.' },
      { key: 'date', label: 'Date' },
      { key: 'party', label: 'Customer' },
      { key: 'due', label: 'Due' },
      { key: 'amount', label: 'Amount', right: true },
      { key: 'balance', label: 'Balance', right: true },
      { key: 'status', label: 'Status' },
    ],
    createActionsRow: [
      ['Invoice', 'receipt_long'],
      ['Receive payment', 'price_check'],
      ['Estimate', 'request_quote'],
      ['Customer', 'person_add'],
    ],
  },
  bills: {
    mode: 'list',
    key: 'bills',
    title: 'Bills',
    subtitle: 'Vendor bills — For review / Unpaid / Paid.',
    family: 'document',
    newLabel: 'Bill',
    tabs: ['For review', 'Unpaid', 'Paid', 'All'],
    cols: [
      { key: 'vendor', label: 'Vendor' },
      { key: 'billno', label: 'Bill no.' },
      { key: 'due', label: 'Due' },
      { key: 'amount', label: 'Amount', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  expenses: {
    mode: 'list',
    key: 'expenses',
    title: 'Expense transactions',
    subtitle: 'Bills, expenses, checks, credits.',
    family: 'document',
    newLabel: 'Expense',
    tabs: ['All', 'Bills', 'Expenses', 'Checks', 'Credits'],
    cols: [
      { key: 'date', label: 'Date' },
      { key: 'payee', label: 'Payee' },
      { key: 'category', label: 'Category' },
      { key: 'paid', label: 'Paid from' },
      { key: 'amount', label: 'Amount', right: true },
      { key: 'receipt', label: 'Receipt' },
    ],
  },
  customers: {
    mode: 'list',
    key: 'customers',
    title: 'Customers',
    subtitle: 'Party list — role=Customer.',
    family: 'party',
    newLabel: 'Customer',
    tabs: ['All', 'Active', 'New', 'Recurring', 'Inactive', 'Needs follow-up'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'orders', label: 'Orders', right: true },
      { key: 'ltv', label: 'LTV', right: true },
      { key: 'balance', label: 'Balance', right: true },
      { key: 'last', label: 'Last order' },
      { key: 'consent', label: 'Marketing consent' },
    ],
    createActionsRow: [
      ['Customer', 'person_add'],
      ['Vendor', 'domain_add'],
      ['Supplier', 'local_shipping'],
      ['Contractor', 'engineering'],
    ],
  },
  vendors: {
    mode: 'list',
    key: 'vendors',
    title: 'Vendors',
    subtitle: 'Party list — role=Vendor.',
    family: 'party',
    newLabel: 'Vendor',
    tabs: ['All', 'Suppliers', 'Contractors', '1099'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'role', label: 'Role' },
      { key: 'open', label: 'Open bills', right: true },
      { key: 'ytd', label: 'YTD paid', right: true },
      { key: 'tax', label: '1099' },
      { key: 'sla', label: 'SLA', right: true },
    ],
  },
  products: {
    mode: 'list',
    key: 'products',
    title: 'Products and services',
    subtitle: 'Same list as Catalog > Products.',
    family: 'catalog',
    newLabel: 'Product',
    tabs: ['All', 'Published', 'Draft', 'Archived'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'sku', label: 'SKU' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'price', label: 'Price', right: true },
      { key: 'margin', label: 'Margin', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  entities: {
    mode: 'list',
    key: 'entities',
    title: 'Entities',
    subtitle: 'Each legal business under the workspace — books, base currency, fiscal year, members.',
    family: 'accounting',
    newLabel: 'Entity',
    cols: [
      { key: 'name', label: 'Entity' },
      { key: 'books', label: 'Books' },
      { key: 'currency', label: 'Base currency' },
      { key: 'fiscal', label: 'Fiscal year' },
      { key: 'members', label: 'Members', right: true },
    ],
    emptyTitle: 'No entities yet',
    emptySteps: 'Entities mirror Brands in Settings — create a brand to open its books.',
  },
  liabilities_credit: {
    mode: 'list',
    key: 'liabilities_credit',
    title: 'Liabilities and credit',
    subtitle: 'Credit cards, lines of credit, and loans in one place — payments post as transfers.',
    family: 'banking',
    newLabel: 'Liability',
    cols: [
      { key: 'type', label: 'Type' },
      { key: 'account', label: 'Account' },
      { key: 'limit', label: 'Limit / principal', right: true },
      { key: 'balance', label: 'Balance', right: true },
      { key: 'available', label: 'Available', right: true },
      { key: 'rate', label: 'Rate' },
    ],
  },
  bill_approval_setup: {
    mode: 'list',
    key: 'bill_approval_setup',
    title: 'Bill and payment approval setup',
    subtitle: 'Who approves bills and payments — by amount, by vendor, one or two approvers, delegation while away.',
    family: 'expense',
    newLabel: 'Approval rule',
    cols: [
      { key: 'rule', label: 'Rule' },
      { key: 'applies', label: 'Applies to' },
      { key: 'threshold', label: 'Threshold', right: true },
      { key: 'approvers', label: 'Approvers' },
      { key: 'delegation', label: 'Delegation' },
    ],
  },
  contractors: {
    mode: 'list',
    key: 'contractors',
    title: 'Contractors',
    subtitle: 'Invite contractors to complete their profile and W-9 — they join the vendor list marked 1099.',
    family: 'party',
    newLabel: 'Contractor',
    tabs: ['All', 'Met', 'Not met'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'invite', label: 'Invite status' },
      { key: 'w9', label: 'W-9 received' },
      { key: 'paid', label: 'Paid this year', right: true },
      { key: 'status', label: '1099 threshold' },
    ],
  },
  '1099s': {
    mode: 'list',
    key: '1099s',
    title: '1099s',
    subtitle: 'Contractors above the threshold for the tax year — generation blocks when a tax ID is missing.',
    family: 'tax',
    newLabel: '1099',
    tabs: ['All', 'Ready', 'Blocked'],
    cols: [
      { key: 'contractor', label: 'Contractor' },
      { key: 'tin', label: 'Tax ID' },
      { key: 'ytd', label: 'YTD paid', right: true },
      { key: 'threshold', label: 'Threshold' },
      { key: 'status', label: 'Form status' },
    ],
  },
  payroll: {
    mode: 'list',
    key: 'payroll',
    title: 'Payroll',
    subtitle: 'Pay periods and runs — draft → approved → paid → posted. Posting creates the wage, tax, and liability entries.',
    family: 'expense',
    newLabel: 'Payroll run',
    tabs: ['All', 'Draft', 'Approved', 'Paid', 'Posted'],
    cols: [
      { key: 'period', label: 'Pay period' },
      { key: 'status', label: 'Run state' },
      { key: 'payDate', label: 'Pay date' },
      { key: 'gross', label: 'Gross', right: true },
      { key: 'taxes', label: 'Taxes', right: true },
      { key: 'net', label: 'Net', right: true },
    ],
  },
  sales_channels: {
    mode: 'list',
    key: 'sales_channels',
    title: 'Sales channels',
    subtitle: 'Connected storefronts and marketplaces — orders from every channel land in the same orders table.',
    family: 'sales',
    newLabel: 'Channel',
    tabs: ['All', 'Connected', 'Attention'],
    cols: [
      { key: 'channel', label: 'Channel' },
      { key: 'status', label: 'Connection' },
      { key: 'sync', label: 'Sync' },
      { key: 'fees', label: 'Fees mapping' },
      { key: 'payout', label: 'Payout account' },
      { key: 'orders', label: 'Orders imported', right: true },
    ],
  },
  payouts: {
    mode: 'list',
    key: 'payouts',
    title: 'Payouts',
    subtitle: 'Processor payouts — matching a payout to a bank deposit closes the clearing balance.',
    family: 'sales',
    newLabel: 'Payout',
    tabs: ['All', 'In clearing', 'Matched'],
    cols: [
      { key: 'date', label: 'Date' },
      { key: 'processor', label: 'Processor' },
      { key: 'gross', label: 'Gross', right: true },
      { key: 'fees', label: 'Fees', right: true },
      { key: 'refunds', label: 'Refunds', right: true },
      { key: 'net', label: 'Net', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  gift_cards: {
    mode: 'list',
    key: 'gift_cards',
    title: 'Gift cards',
    subtitle: 'Sale posts to gift card liability; redemption moves liability to revenue.',
    family: 'sales',
    newLabel: 'Gift card',
    tabs: ['All', 'Active', 'Fully redeemed'],
    cols: [
      { key: 'card', label: 'Card' },
      { key: 'issued', label: 'Issued' },
      { key: 'balance', label: 'Balance', right: true },
      { key: 'redeemed', label: 'Redeemed', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  subscriptions: {
    mode: 'list',
    key: 'subscriptions',
    title: 'Subscriptions',
    subtitle: 'Plans and subscribers — each cycle creates an invoice and a payment.',
    family: 'sales',
    newLabel: 'Subscription',
    tabs: ['All', 'Active', 'Paused'],
    cols: [
      { key: 'plan', label: 'Plan' },
      { key: 'subscribers', label: 'Subscribers', right: true },
      { key: 'cycle', label: 'Cycle' },
      { key: 'next', label: 'Next charge' },
      { key: 'failed', label: 'Failed payments', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  refunds: {
    mode: 'list',
    key: 'refunds',
    title: 'Refunds',
    subtitle: 'Against orders and invoices, full or partial — over the limit needs approval. Posts to refunds and returns and reverses tax.',
    family: 'sales',
    newLabel: 'Refund',
    tabs: ['All', 'Pending approval', 'Posted'],
    cols: [
      { key: 'date', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'source', label: 'Order / invoice' },
      { key: 'amount', label: 'Amount', right: true },
      { key: 'type', label: 'Type' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status' },
    ],
  },
  disputes: {
    mode: 'list',
    key: 'disputes',
    title: 'Disputes',
    subtitle: 'Chargebacks from the processor — the evidence packet is built from the order, tracking, and messages.',
    family: 'sales',
    newLabel: 'Dispute',
    tabs: ['All', 'Action needed', 'Under review', 'Won', 'Lost'],
    cols: [
      { key: 'opened', label: 'Opened' },
      { key: 'processor', label: 'Processor' },
      { key: 'amount', label: 'Amount', right: true },
      { key: 'reason', label: 'Reason' },
      { key: 'due', label: 'Evidence due' },
      { key: 'status', label: 'Status' },
    ],
  },
  tax_return: {
    mode: 'list',
    key: 'tax_return',
    title: 'Create tax return',
    subtitle: 'Starts a return from the year\u2019s books — blocked if accounts are unmapped or periods are open.',
    family: 'tax',
    newLabel: 'Return',
    cols: [
      { key: 'ret', label: 'Return' },
      { key: 'year', label: 'Tax year' },
      { key: 'status', label: 'Status' },
      { key: 'blocked', label: 'Blocked by' },
    ],
  },
  download_tax_summary: {
    mode: 'list',
    key: 'download_tax_summary',
    title: 'Download tax summary',
    subtitle: 'PDF of income, deductions, and assets for the accountant — read-only.',
    family: 'tax',
    newLabel: 'Summary',
    cols: [
      { key: 'period', label: 'Period' },
      { key: 'generated', label: 'Generated' },
      { key: 'format', label: 'Format' },
      { key: 'status', label: 'Status' },
    ],
  },
  tax_income: {
    mode: 'list',
    key: 'tax_income',
    title: 'Income from your transactions',
    subtitle: 'Income grouped by tax category — categorizing transactions automates it.',
    family: 'tax',
    newLabel: 'Category',
    cols: [
      { key: 'category', label: 'Tax category' },
      { key: 'income', label: 'Income', right: true },
      { key: 'transactions', label: 'Transactions', right: true },
      { key: 'share', label: 'Share', right: true },
    ],
  },
  tax_assets: {
    mode: 'list',
    key: 'tax_assets',
    title: 'Depreciable business assets',
    subtitle: 'Assets with cost, class, and depreciation to date.',
    family: 'tax',
    newLabel: 'Asset',
    cols: [
      { key: 'asset', label: 'Asset' },
      { key: 'cost', label: 'Cost', right: true },
      { key: 'class', label: 'Class' },
      { key: 'inService', label: 'In service' },
      { key: 'depreciation', label: 'Depreciation to date', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  tax_1099k: {
    mode: 'list',
    key: 'tax_1099k',
    title: '1099-K detail',
    subtitle: 'Seller payment totals that cross the reporting threshold, by processor.',
    family: 'tax',
    newLabel: '1099-K',
    cols: [
      { key: 'processor', label: 'Processor' },
      { key: 'gross', label: 'Gross', right: true },
      { key: 'transactions', label: 'Transactions', right: true },
      { key: 'threshold', label: 'Threshold' },
      { key: 'status', label: 'Status' },
    ],
  },
  payroll_tax: {
    mode: 'list',
    key: 'payroll_tax',
    title: 'Payroll tax',
    subtitle: 'Quarterly liabilities and forms.',
    family: 'tax',
    newLabel: 'Quarter',
    cols: [
      { key: 'quarter', label: 'Quarter' },
      { key: 'wages', label: 'Wages', right: true },
      { key: 'federal', label: 'Federal', right: true },
      { key: 'state', label: 'State', right: true },
      { key: 'due', label: 'Due' },
      { key: 'form', label: 'Form' },
      { key: 'status', label: 'Status' },
    ],
  },
  sales_overview: {
    mode: 'overview',
    title: 'Sales & Get Paid — Overview',
    subtitle: 'Payment-request funnel: Not paid / Paid / Deposited.',
    kpis: [
      { label: 'Not paid', value: '$8,420', delta: '+12%' },
      { label: 'Paid', value: '$24,180', delta: '+8%' },
      { label: 'Deposited', value: '$22,900', delta: '+6%' },
      { label: 'Avg. days to pay', value: '14.2', delta: '−1.3' },
    ],
    actions: [
      ['Invoice', 'receipt_long'],
      ['Receive payment', 'price_check'],
      ['Payment link', 'link'],
      ['Estimate', 'request_quote'],
    ],
    panelTitle: 'Payment funnel',
    panelText: 'Not paid → Paid → Deposited breakdown appears here as a funnel visualization.',
  },
  expenses_overview: {
    mode: 'overview',
    title: 'Expenses & Bills — Overview',
    subtitle: 'Bills, expense transactions, vendors, bill payments.',
    kpis: [
      { label: 'Bills due', value: '$4,080', delta: '3 bills' },
      { label: 'Expenses MTD', value: '$1,840', delta: '+4%' },
      { label: 'Vendors', value: '42', delta: '' },
      { label: '1099 pending', value: '6', delta: '' },
    ],
    actions: [
      ['Bill', 'description'],
      ['Expense', 'credit_card'],
      ['Pay bills', 'account_balance_wallet'],
      ['Vendor', 'domain_add'],
    ],
    panelTitle: 'Receipts inbox',
    panelText: 'Drop, upload, or snap a receipt. Forwarding address: receipts@unsaid.app.',
  },
  tax_overview: {
    mode: 'overview',
    title: 'Business Tax — Overview',
    subtitle: 'Tax deadlines, taxable profit estimate, create actions.',
    kpis: [
      { label: 'Est. taxable profit', value: '$18,240', delta: '' },
      { label: 'Next deadline', value: 'Jan 15, 2027', delta: 'Q4 estimated' },
      { label: 'Sales tax payable', value: '$1,880', delta: '' },
      { label: 'Mapped accounts', value: '31 / 34', delta: '' },
    ],
    actions: [
      ['Tax summary', 'description'],
      ['File', 'upload_file'],
    ],
    panelTitle: 'Map accounts task',
    panelText: 'Map income/expense accounts to tax categories before filing.',
  },
  customers_overview: {
    mode: 'overview',
    title: 'Contacts — Overview',
    subtitle: 'Customers by lifecycle, follow-ups due.',
    kpis: [
      { label: 'Total customers', value: '184', delta: '+9' },
      { label: 'Active', value: '142', delta: '' },
      { label: 'At risk', value: '11', delta: '' },
      { label: 'Outstanding balance', value: '$8,420', delta: '' },
    ],
    actions: [
      ['Customer', 'person_add'],
      ['Estimate', 'request_quote'],
      ['Statement', 'summarize'],
    ],
    panelTitle: 'Top customers by LTV',
    panelText: 'Ranked list of customers by lifetime value.',
  },
  crm_overview: {
    mode: 'overview',
    title: 'CRM — Overview',
    subtitle: 'Customers by lifecycle, new this month, at-risk, follow-ups due.',
    kpis: [
      { label: 'Total customers', value: '184', delta: '+9' },
      { label: 'New this month', value: '9', delta: '' },
      { label: 'At risk', value: '11', delta: '' },
      { label: 'Follow-ups due', value: '14', delta: '' },
    ],
    actions: [
      ['Customer', 'person_add'],
      ['Lead', 'person_search'],
      ['Segment', 'category'],
    ],
    panelTitle: 'Lifecycle stages',
    panelText: 'Lead → Trial → Repeat → VIP → At risk. Segments and follow-up queues feed from here.',
  },
};

export interface DrawerField {
  label: string;
  type: string;
  placeholder?: string;
  value?: string;
}

export const DRAWER_FIELDS: Record<string, DrawerField[]> = {
  Invoice: [
    { label: 'Customer', type: 'text', placeholder: 'Add customer' },
    { label: 'Invoice no.', type: 'text', value: '1003' },
    { label: 'Terms', type: 'text', value: 'Net 30' },
    { label: 'Invoice date', type: 'date', value: '2026-11-01' },
    { label: 'Due date', type: 'date', value: '2026-12-01' },
  ],
  Customer: [
    { label: 'Company name', type: 'text' },
    { label: 'Display name', type: 'text' },
    { label: 'First name', type: 'text' },
    { label: 'Last name', type: 'text' },
    { label: 'Email', type: 'email' },
    { label: 'Phone', type: 'tel' },
  ],
  Vendor: [
    { label: 'Company name', type: 'text' },
    { label: 'Email', type: 'email' },
    { label: 'Terms', type: 'text', value: 'Net 30' },
    { label: 'Default expense account', type: 'text' },
  ],
  Product: [
    { label: 'Name', type: 'text' },
    { label: 'Type', type: 'text', value: 'Product' },
    { label: 'SKU', type: 'text' },
    { label: 'Sales price', type: 'number' },
  ],
};

export type CreateDotToken =
  | 'bg-primary'
  | 'bg-secondary'
  | 'bg-tertiary'
  | 'bg-qb-navy'
  | 'bg-primary-container'
  | 'bg-error';

export interface CreateRegistryCategory {
  title: string;
  dot: CreateDotToken;
  items: { label: string; desc: string; icon: string }[];
}

export const CREATE_REGISTRY: CreateRegistryCategory[] = [
  {
    title: 'Customers',
    dot: 'bg-primary',
    items: [
      { label: 'Invoice', desc: 'Document engine — Edit/Email/Payor/PDF', icon: 'receipt_long' },
      { label: 'Payment link', desc: 'Amount, description, share link/QR', icon: 'link' },
      { label: 'Receive payment', desc: 'Apply to open invoices', icon: 'price_check' },
      { label: 'Statement', desc: 'Batch billing summary', icon: 'summarize' },
      { label: 'Estimate', desc: 'Convert to Invoice', icon: 'request_quote' },
      { label: 'Sales receipt', desc: 'Instant settlement', icon: 'point_of_sale' },
      { label: 'Credit memo', desc: 'RMA / reduction', icon: 'assignment_return' },
      { label: 'Add customer', desc: 'Party drawer, role=Customer', icon: 'person_add' },
      { label: 'Appointment', desc: 'Book customer, staff, service, time', icon: 'event_available' },
    ],
  },
  {
    title: 'Vendors & Suppliers',
    dot: 'bg-secondary',
    items: [
      { label: 'Expense', desc: 'Payee, date, paid-from, category', icon: 'credit_card' },
      { label: 'Check', desc: 'Print later option', icon: 'payments' },
      { label: 'Bill', desc: 'Capture panel, Tags toggle', icon: 'description' },
      { label: 'Pay bills', desc: 'Payment workspace', icon: 'account_balance_wallet' },
      { label: 'Purchase order', desc: 'Blank/SKU lines', icon: 'shopping_bag' },
      { label: 'Vendor credit', desc: 'Supplier refund', icon: 'savings' },
      { label: 'Add vendor', desc: 'Party drawer, role=Vendor', icon: 'domain_add' },
      { label: 'Add supplier', desc: 'Party drawer, role=Supplier', icon: 'factory' },
    ],
  },
  {
    title: 'Team',
    dot: 'bg-tertiary',
    items: [
      { label: 'Add contractor', desc: 'Name, email, W-9 invite', icon: 'engineering' },
      { label: 'Time entry', desc: 'Optional, later', icon: 'schedule' },
    ],
  },
  {
    title: 'Other (books)',
    dot: 'bg-qb-navy',
    items: [
      { label: 'Task', desc: 'Quick to-do', icon: 'task' },
      { label: 'Bank deposit', desc: 'Combine funds', icon: 'account_balance' },
      { label: 'Journal entry', desc: 'Double-entry debit/credit', icon: 'menu_book' },
      { label: 'Transfer', desc: 'Inter-account treasury', icon: 'swap_horiz' },
      { label: 'Reconcile', desc: 'Setup + tie-out', icon: 'fact_check' },
      { label: 'Settlement', desc: 'Stripe/Shopify split', icon: 'assured_workload' },
      { label: 'Add product/service', desc: 'Drawer w/ Sales/Purchasing/Accounting', icon: 'checkroom' },
      { label: 'Add account', desc: 'CoA drawer', icon: 'account_tree' },
    ],
  },
  {
    title: 'Catalog & Marketing',
    dot: 'bg-primary-container',
    items: [
      { label: 'Design', desc: 'Konva studio', icon: 'palette' },
      { label: 'Product', desc: 'Open Studio from drawer', icon: 'checkroom' },
      { label: 'Collection', desc: 'Canvas builder', icon: 'collections_bookmark' },
      { label: 'Category', desc: 'Record drawer', icon: 'category' },
      { label: 'Banner', desc: 'Storefront slot', icon: 'view_carousel' },
      { label: 'Popup', desc: 'Creative popup', icon: 'open_in_new' },
      { label: 'Discount code', desc: 'Type, value, window', icon: 'sell' },
      { label: 'Campaign', desc: 'Meta/TikTok/Google Ads', icon: 'campaign' },
      { label: 'Post', desc: 'Multi-channel content', icon: 'share' },
      { label: 'Newsletter', desc: 'Campaign builder', icon: 'mail' },
    ],
  },
  {
    title: 'Support & Orders',
    dot: 'bg-error',
    items: [
      { label: 'Sales order', desc: 'Order document', icon: 'shopping_cart_checkout' },
      { label: 'Return/RMA', desc: 'Return authorization', icon: 'assignment_return' },
      { label: 'Ticket', desc: 'Support ticket', icon: 'confirmation_number' },
      { label: 'Add note', desc: 'Quick note', icon: 'note_add' },
      { label: 'Void', desc: 'Void a transaction', icon: 'block' },
    ],
  },
];

// ── DESIGN STUDIO — Studio > Catalog & Create Wizard department lists ──
// Both areas list studio-eligible products from the global catalog, by
// department (Men / Women / Children / Home Living). They share one shape.
const STUDIO_DEPARTMENTS: [string, string][] = [
  ['men', 'Men'],
  ['women', 'Women'],
  ['children', 'Children'],
  ['home-living', 'Home Living'],
];

const DEPARTMENT_ROWS: Record<string, DemoRow[]> = {
  men: [
    { product: 'Heavyweight Tee', blank: 'Gildan 18000', supplier: 'SanMar', eligibility: 'Front / back / sleeves', status: 'Eligible' },
    { product: 'Performance Polo', blank: 'Port Authority L518', supplier: 'SanMar', eligibility: 'Left chest', status: 'Eligible' },
    { product: 'Fleece Crewneck', blank: 'Independent 2050', supplier: 'S&S Activewear', eligibility: 'Front / back', status: 'Eligible' },
    { product: 'Camp Collar Shirt', blank: 'Cotton & Cloud 4001', supplier: 'TSC Apparel', eligibility: 'All-over print', status: 'Review' },
    { product: 'Vintage Wash Tee', blank: 'Comfort Colors 1717', supplier: 'S&S Activewear', eligibility: 'Front / back', status: 'Eligible' },
    { product: 'Utility Jacket', blank: 'Rabbit Skins 3350', supplier: 'TSC Apparel', eligibility: 'Embroidery only', status: 'Discontinued' },
  ],
  women: [
    { product: 'Relaxed Boyfriend Tee', blank: 'Bella+Canvas 3001CVC', supplier: 'S&S Activewear', eligibility: 'Front / back', status: 'Eligible' },
    { product: 'Cropped Crewneck', blank: 'Comfort Colors 6016', supplier: 'SanMar', eligibility: 'Front', status: 'Eligible' },
    { product: 'Flowy Racerback Tank', blank: 'Next Level 6710', supplier: 'S&S Activewear', eligibility: 'Front / back', status: 'Eligible' },
    { product: 'Open Cardigan', blank: 'Independent 2051', supplier: 'SanMar', eligibility: 'Left chest', status: 'Review' },
    { product: 'High-Rise Legging', blank: 'Bella+Canvas 1188', supplier: 'TSC Apparel', eligibility: 'All-over print', status: 'Eligible' },
  ],
  children: [
    { product: 'Youth Tee', blank: 'Gildan 18000B', supplier: 'SanMar', eligibility: 'Front / back', status: 'Eligible' },
    { product: 'Toddler Sweatshirt', blank: 'Rabbit Skins 3450', supplier: 'S&S Activewear', eligibility: 'Front', status: 'Eligible' },
    { product: 'Kids Pullover Hoodie', blank: 'Gildan 18500B', supplier: 'SanMar', eligibility: 'Front / pocket', status: 'Eligible' },
    { product: 'Infant One-Piece', blank: 'Bella+Canvas 3200', supplier: 'S&S Activewear', eligibility: 'Front', status: 'CPSIA hold' },
    { product: 'Youth Legging', blank: 'Comfort Colors 9360Y', supplier: 'TSC Apparel', eligibility: 'All-over print', status: 'Eligible' },
  ],
  'home-living': [
    { product: '11oz Mug', blank: 'Orca Coating 6111', supplier: 'Conde', eligibility: 'Wrap / both sides', status: 'Eligible' },
    { product: '15oz Mug', blank: 'Orca Coating 6211', supplier: 'Conde', eligibility: 'Wrap / both sides', status: 'Eligible' },
    { product: 'Throw Pillow', blank: 'Custom Pillow 16in', supplier: 'S&S Activewear', eligibility: 'Front panel', status: 'Eligible' },
    { product: 'Framed Poster', blank: 'Epson Premium 12×18', supplier: 'Conde', eligibility: 'Full bleed', status: 'Eligible' },
    { product: 'Beach Towel', blank: 'Towel 30×60', supplier: 'TSC Apparel', eligibility: 'Full print', status: 'Review' },
  ],
};

for (const [slug, label] of STUDIO_DEPARTMENTS) {
  for (const [prefix, subtitle] of [
    ['studio', 'Studio-eligible products from the global catalog.'],
    ['wizard', 'Create wizard — start from a department product.'],
  ] as [string, string][]) {
    const id = `${prefix}-${slug}`;
    SCREEN_DEFS[id] = {
      mode: 'list',
      key: id,
      title: label,
      subtitle,
      family: 'catalog',
      newLabel: 'Design',
      tabs: ['All', 'Eligible', 'Review', 'Discontinued'],
      cols: [
        { key: 'product', label: 'Product' },
        { key: 'blank', label: 'Blank' },
        { key: 'supplier', label: 'Supplier' },
        { key: 'eligibility', label: 'Studio eligibility' },
        { key: 'status', label: 'Status' },
      ],
      createActionsRow: [
        ['Design', 'palette'],
        ['Collection', 'collections_bookmark'],
        ['Product', 'checkroom'],
      ],
    };
    DEMO_ROWS[id] = DEPARTMENT_ROWS[slug];
  }
}

// ── DESIGN STUDIO — My products / My orders / wizard velocity lists ──
SCREEN_DEFS['studio-create-order'] = {
  mode: 'list',
  key: 'studio-create-order',
  title: 'Create Order',
  subtitle: 'Draft a production order from your designed products.',
  family: 'document',
  newLabel: 'Order draft',
  tabs: ['All', 'Draft', 'Submitted', 'Fulfilled'],
  cols: [
    { key: 'draft', label: 'Order draft' },
    { key: 'product', label: 'Product mix' },
    { key: 'store', label: 'Store' },
    { key: 'items', label: 'Items', right: true },
    { key: 'status', label: 'Status' },
  ],
  createActionsRow: [
    ['Order draft', 'post_add'],
    ['My stores', 'storefront'],
    ['Product', 'checkroom'],
  ],
};
DEMO_ROWS['studio-create-order'] = [
  { draft: 'DR-1042', product: 'Heavyweight Tee × 3 designs', store: 'Unsaid Shopify', items: 148, status: 'Draft' },
  { draft: 'DR-1041', product: '11oz Mug — Holiday set', store: 'Etsy — Unsaid Home', items: 60, status: 'Submitted' },
  { draft: 'DR-1039', product: 'Fleece Crewneck — 2 colorways', store: 'Unsaid Shopify', items: 84, status: 'Fulfilled' },
  { draft: 'DR-1038', product: 'Youth Tee — School batch', store: 'Wholesale — Ridge Co.', items: 200, status: 'Draft' },
];

SCREEN_DEFS['studio-my-stores'] = {
  mode: 'list',
  key: 'studio-my-stores',
  title: 'My Stores',
  subtitle: 'Storefronts your designed products publish to.',
  family: 'sales',
  newLabel: 'Store',
  tabs: ['All', 'Connected', 'Paused'],
  cols: [
    { key: 'store', label: 'Store' },
    { key: 'channel', label: 'Channel' },
    { key: 'live', label: 'Products live', right: true },
    { key: 'status', label: 'Status' },
  ],
  createActionsRow: [
    ['Store', 'storefront'],
    ['Order draft', 'post_add'],
    ['Product', 'checkroom'],
  ],
};
DEMO_ROWS['studio-my-stores'] = [
  { store: 'Unsaid Shopify', channel: 'Shopify', live: 42, status: 'Connected' },
  { store: 'Etsy — Unsaid Home', channel: 'Etsy', live: 18, status: 'Connected' },
  { store: 'Whatnot — Live drops', channel: 'Whatnot', live: 6, status: 'Paused' },
  { store: 'Wholesale — Ridge Co.', channel: 'B2B portal', live: 11, status: 'Connected' },
];

SCREEN_DEFS['studio-orders'] = {
  mode: 'list',
  key: 'studio-orders',
  title: 'My orders',
  subtitle: 'Production orders for your designed products.',
  family: 'document',
  newLabel: 'Order',
  tabs: ['All', 'In production', 'Shipped', 'Delivered'],
  cols: [
    { key: 'order', label: 'Order' },
    { key: 'placed', label: 'Placed' },
    { key: 'product', label: 'Product' },
    { key: 'store', label: 'Store' },
    { key: 'status', label: 'Status' },
  ],
  createActionsRow: [
    ['Order draft', 'post_add'],
    ['Product', 'checkroom'],
    ['Store', 'storefront'],
  ],
};
DEMO_ROWS['studio-orders'] = [
  { order: 'SO-8841', placed: '10/29/2026', product: 'Heavyweight Tee — Ridge', store: 'Unsaid Shopify', status: 'In production' },
  { order: 'SO-8837', placed: '10/27/2026', product: '11oz Mug — Holiday set', store: 'Etsy — Unsaid Home', status: 'Shipped' },
  { order: 'SO-8822', placed: '10/21/2026', product: 'Fleece Crewneck — Slate', store: 'Unsaid Shopify', status: 'Delivered' },
  { order: 'SO-8810', placed: '10/15/2026', product: 'Youth Tee — School batch', store: 'Wholesale — Ridge Co.', status: 'Delivered' },
];

for (const [id, title, subtitle, metricKey, metricLabel] of [
  ['wizard-best-selling', 'Best Selling', 'Start a design from a proven top seller.', 'units', 'Units 30d'],
  ['wizard-fast-selling', 'Fast Selling', 'Fast-turn products with the quickest fulfillment.', 'speed', 'Fulfillment'],
] as [string, string, string, string, string][]) {
  SCREEN_DEFS[id] = {
    mode: 'list',
    key: id,
    title,
    subtitle,
    family: 'catalog',
    newLabel: 'Design',
    tabs: ['All', 'Apparel', 'Home', 'Accessories'],
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'department', label: 'Department' },
      { key: metricKey, label: metricLabel, right: true },
      { key: 'trend', label: 'Trend' },
      { key: 'status', label: 'Status' },
    ],
    createActionsRow: [
      ['Design', 'palette'],
      ['Product', 'checkroom'],
      ['Collection', 'collections_bookmark'],
    ],
  };
}
DEMO_ROWS['wizard-best-selling'] = [
  { product: 'Heavyweight Tee', department: 'Men', units: 1284, trend: '+18%', status: 'Hot' },
  { product: 'Relaxed Boyfriend Tee', department: 'Women', units: 1096, trend: '+12%', status: 'Hot' },
  { product: '11oz Mug', department: 'Home Living', units: 734, trend: '+9%', status: 'Rising' },
  { product: 'Youth Tee', department: 'Children', units: 612, trend: '+5%', status: 'Steady' },
  { product: 'Fleece Crewneck', department: 'Men', units: 498, trend: '-2%', status: 'Steady' },
];
DEMO_ROWS['wizard-fast-selling'] = [
  { product: '11oz Mug', department: 'Home Living', speed: '2-day', trend: '+14%', status: 'Fast' },
  { product: 'Youth Tee', department: 'Children', speed: '2-day', trend: '+7%', status: 'Fast' },
  { product: 'Heavyweight Tee', department: 'Men', speed: '3-day', trend: '+11%', status: 'Fast' },
  { product: 'Framed Poster', department: 'Home Living', speed: '3-day', trend: '+4%', status: 'Steady' },
  { product: 'Fleece Crewneck', department: 'Men', speed: '5-day', trend: '+2%', status: 'Steady' },
];

// Published Items & SKUs — seeded with one demo row. Published designs from
// the Design Studio are dynamically prepended at render time (see
// ScreenContent.tsx TabScreenRenderer → published-skus branch).
SCREEN_DEFS['published-skus'] = {
  mode: 'list',
  key: 'published-skus',
  title: 'Published Items & SKUs',
  subtitle: 'Designs published from the Studio — live across all channels.',
  family: 'catalog',
  newLabel: 'Product',
  tabs: ['All', 'Published', 'Draft'],
  cols: [
    { key: 'product', label: 'Product' },
    { key: 'brand', label: 'Brand' },
    { key: 'color', label: 'Color' },
    { key: 'sizes', label: 'Sizes' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'status', label: 'Status' },
  ],
  createActionsRow: [
    ['Product', 'checkroom'],
    ['Design', 'palette'],
    ['Collection', 'collections_bookmark'],
  ],
};
DEMO_ROWS['published-skus'] = [
  { product: 'Heavyweight Tee — Sunrise', brand: 'Gildan 18000', color: 'White', sizes: 'S–XL', supplier: 'Printify Choice', status: 'Live' },
  { product: '11oz Mug — Holiday', brand: 'Orca Coating 6111', color: 'White', sizes: 'One size', supplier: 'Printify Choice', status: 'Live' },
];
