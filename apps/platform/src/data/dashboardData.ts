export type OpsWindow = 'Today' | '7D' | '30D' | 'MTD';
export type ExecPeriod = 'MTD' | 'QTD' | 'YTD' | '12M';
export type ExecCompare = 'prior' | 'plan';

export interface SetupStepItem {
  id: string;
  stepNumber: number;
  title: string;
  subtitle: string;
  icon: string;
  completed: boolean;
  ctaLabel: string;
  fields: {
    key: string;
    label: string;
    value: string;
    hint?: string;
  }[];
}

export interface CreateActionOption {
  label: string;
  icon: string;
  domainGroup: string;
  favorite?: boolean;
}

export interface OpsKpiTile {
  id: string;
  label: string;
  value: string;
  delta: string;
  tone: 'pos' | 'warn' | 'neg' | 'neutral';
  subtext: string;
  targetDomain: 'orders' | 'finance' | 'catalog' | 'support' | 'dashboard';
  targetScreen: string;
}

export interface OpsFunnelStage {
  stage: string;
  count: number;
  gmv: string;
  avgAge: string;
  pctOfTotal: number;
  tone: 'navy' | 'blue' | 'teal' | 'green' | 'maroon';
  targetDomain: 'orders' | 'finance';
  targetScreen: string;
}

export interface IntegrationVital {
  name: string;
  role: string;
  status: 'Synced' | 'Healthy' | 'SLA warning' | 'For review';
  metricLabel: string;
  metricValue: string;
  slaPct: string;
  lastSync: string;
  openCount: number;
  targetDomain: 'orders' | 'finance' | 'catalog';
  targetScreen: string;
}

export interface SmartSuggestion {
  id: string;
  category: 'Bills & AP' | 'Banking' | 'Preflight' | 'Tax & 1099' | 'Collections';
  title: string;
  detail: string;
  impact: string;
  actionLabel: string;
  icon: string;
  targetDomain: 'finance' | 'dashboard' | 'orders' | 'catalog';
  targetScreen: string;
  createTrigger?: string;
}

export interface MonthlyGmvPoint {
  month: string;
  shortLabel: string;
  gmv: number;
  netRevenue: number;
  grossProfit: number;
  cogs: number;
  stripeFees: number;
  adSpend: number;
  refunds: number;
  orders: number;
}

export interface WaterfallBridgeItem {
  label: string;
  amount: number;
  pctOfGmv: number;
  kind: 'gross' | 'deduction' | 'subtotal' | 'cogs' | 'net';
  note: string;
}

export interface CategoryMarginRow {
  category: string;
  coaAccount: string;
  orders: number;
  units: number;
  gmv: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  returnRatePct: number;
  sharePct: number;
}

export interface ChannelPerformanceRow {
  channel: string;
  settlementAccount: string;
  orders: number;
  gmv: number;
  takeRatePct: number;
  fees: number;
  netContribution: number;
  growthPct: string;
  sharePct: number;
  status: 'Active' | 'Healthy' | 'For review';
}

export interface SupplierMarginRow {
  supplier: string;
  routedOrders: number;
  blankAndPrintCogs: number;
  avgTurnaround: string;
  reprintRatePct: number;
  slaPct: number;
  grossMarginPct: number;
  status: 'Healthy' | 'SLA warning';
}

export interface CohortRow {
  cohort: string;
  customers: number;
  cac: string;
  ltv: string;
  m0: number;
  m1: number;
  m2: number;
  m3: number;
  m4: number;
  m5: number;
}

export interface TopSkuAnalyticsRow {
  sku: string;
  name: string;
  category: string;
  supplier: string;
  units: number;
  gmv: number;
  marginPct: number;
  cvrPct: number;
  rmaPct: number;
  status: 'Published' | 'SLA warning';
}

export interface AttributionChannelRow {
  channel: string;
  campaignCount: number;
  spend: number;
  sessions: number;
  orders: number;
  attributedGmv: number;
  roas: number;
  cac: number;
  sharePct: number;
}

export type ExplorerDatasetKey =
  | 'orders_gmv'
  | 'sku_velocity'
  | 'customer_cohorts'
  | 'seller_ledger';

export interface ExplorerRow {
  id: string;
  dimension: string;
  secondaryDim: string;
  segment: string;
  orders: number;
  gmv: number;
  discountsAndRefunds: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  marginPct: number;
  varianceAmount: number;
  status: string;
  createdBy: string;
  createdOn: string;
  modifiedBy: string;
  modifiedOn: string;
}

export interface SavedExplorerView {
  id: string;
  name: string;
  dataset: ExplorerDatasetKey;
  tab: string;
  divideBy1000: boolean;
}

export interface AttentionQueueItem {
  id: string;
  code: string;
  title: string;
  category: 'Orders & SLA' | 'Finance & Bills' | 'Catalog & Preflight' | 'Support & RMA';
  severity: 'Critical' | 'SLA warning' | 'For review';
  entity: string;
  owner: string;
  impactAmount: number;
  slaRemaining: string;
  createdOn: string;
  modifiedBy: string;
  status: 'SLA breach' | 'Critical' | 'For review' | 'SLA warning' | 'Snoozed' | 'Resolved';
  targetDomain: 'orders' | 'finance' | 'catalog' | 'support';
  targetScreen: string;
  summary: string;
}

export interface CustomerQueueItem {
  id: string;
  name: string;
  email: string;
  queueBucket: 'Needs follow-up' | 'Overdue balance' | 'RMA & Refunds' | 'At risk' | 'VIP / High LTV';
  orders: number;
  ltv: number;
  balance: number;
  lastOrder: string;
  marketingConsent: 'Yes' | 'No';
  source: 'Storefront' | 'B2B Invoice' | 'Marketplace' | 'Social Shop';
  reason: string;
  owner: string;
  createdOn: string;
  status: 'Needs follow-up' | 'Overdue' | 'RMA open' | 'At risk' | 'VIP' | 'Resolved';
}

export interface SellerQueueItem {
  id: string;
  seller: string;
  contactEmail: string;
  role: 'Marketplace Seller' | 'POD Supplier' | 'Design Partner' | '1099 Contractor';
  stage: 'Onboarding & KYB' | 'Catalog review' | 'SLA & Quality' | 'Payouts & 1099';
  gmvOrSpend: number;
  takeOrMarginPct: number;
  openItems: string;
  slaPct: number;
  w9Status: 'Verified' | 'Pending W-9' | 'Exempt (Corp)';
  payoutHold: number;
  updatedOn: string;
  status: 'Pending KYB' | 'Catalog review' | 'SLA warning' | 'Pending W-9' | 'On hold' | 'Approved';
}

export const INITIAL_SETUP_STEPS: SetupStepItem[] = [
  {
    id: 'profile',
    stepNumber: 1,
    title: 'Business profile',
    subtitle: 'Legal entity, industry, tax classification & fiscal calendar.',
    icon: 'apartment',
    completed: true,
    ctaLabel: 'Review profile',
    fields: [
      { key: 'legalName', label: 'Legal business name', value: 'Unsaid' },
      { key: 'years', label: 'Years in business', value: '3 years (est. 2023)' },
      { key: 'industry', label: 'Industry', value: 'Print-on-Demand & Multi-Seller Commerce' },
      { key: 'taxType', label: 'Tax classification', value: 'Delaware C-Corp / Multi-State Nexus' },
      { key: 'revenueBand', label: 'Annual GMV band', value: '$5,000,000 – $10,000,000' },
    ],
  },
  {
    id: 'bank',
    stepNumber: 2,
    title: 'Connect bank & payout feeds',
    subtitle: 'Operating bank accounts, Stripe clearing & Shopify settlements.',
    icon: 'account_balance',
    completed: true,
    ctaLabel: 'Manage feeds',
    fields: [
      { key: 'primaryBank', label: 'Operating checking', value: 'Mercury Checking •9910 ($194,680.00)' },
      { key: 'cardAccount', label: 'Corporate card', value: 'Chase Ink Reserve •4421' },
      { key: 'stripeFeed', label: 'Processor clearing', value: 'Stripe Clearing (Auto-split fees)' },
      { key: 'shopifyFeed', label: 'Storefront payouts', value: 'Shopify Payments (T+2 settlement)' },
    ],
  },
  {
    id: 'payments',
    stepNumber: 3,
    title: 'Set up customer payments',
    subtitle: 'Enable ACH, card processing, QR payment links & deposit rules.',
    icon: 'payments',
    completed: true,
    ctaLabel: 'Payment settings',
    fields: [
      { key: 'ach', label: 'ACH bank transfer', value: 'Enabled · Free standard settlement' },
      { key: 'cards', label: 'Credit, debit & Apple Pay', value: 'Enabled · 2.9% + $0.30' },
      { key: 'links', label: 'Payment links & QR', value: 'Active on Invoices & B2B Quotes' },
      { key: 'lateFees', label: 'Automated reminders', value: '3 days before & 7 days past due' },
    ],
  },
  {
    id: 'branding',
    stepNumber: 4,
    title: 'Invoice & payor branding',
    subtitle: 'Configure brand color, logo lockup, default terms & payor portal.',
    icon: 'palette',
    completed: false,
    ctaLabel: 'Complete branding',
    fields: [
      { key: 'brandColor', label: 'Primary brand hex', value: '#0A6400', hint: 'Applied to Email, Payor & PDF views' },
      { key: 'logoAsset', label: 'Company wordmark', value: 'unsaid-mark-2026.svg' },
      { key: 'defaultTerms', label: 'Default invoice terms', value: 'Net 30 · 25% deposit on custom runs' },
      { key: 'customerNote', label: 'Default footer note', value: 'Thank you for partnering with Unsaid.' },
    ],
  },
  {
    id: 'goals',
    stepNumber: 5,
    title: 'Operating & margin goals',
    subtitle: 'Set Q4 GMV targets, gross margin guardrails & supplier SLA thresholds.',
    icon: 'flag',
    completed: false,
    ctaLabel: 'Set Q4 goals',
    fields: [
      { key: 'monthlyGmvTarget', label: 'Monthly GMV target', value: '$525,000' },
      { key: 'grossMarginFloor', label: 'Gross margin guardrail', value: '56.0% minimum after blank + print COGS' },
      { key: 'slaTarget', label: 'Supplier SLA target', value: '98.5% shipped within 48h' },
      { key: 'arDaysTarget', label: 'Target DSO (days to pay)', value: '14.0 days' },
    ],
  },
];

export const ALL_CREATE_ACTION_OPTIONS: CreateActionOption[] = [
  { label: 'Invoice', icon: 'receipt_long', domainGroup: 'Customers', favorite: true },
  { label: 'Sales order', icon: 'shopping_cart_checkout', domainGroup: 'Support & Orders', favorite: true },
  { label: 'Receive payment', icon: 'price_check', domainGroup: 'Customers', favorite: true },
  { label: 'Payment link', icon: 'link', domainGroup: 'Customers', favorite: false },
  { label: 'Expense', icon: 'credit_card', domainGroup: 'Vendors & Suppliers', favorite: true },
  { label: 'Bill', icon: 'description', domainGroup: 'Vendors & Suppliers', favorite: true },
  { label: 'Pay bills', icon: 'account_balance_wallet', domainGroup: 'Vendors & Suppliers', favorite: false },
  { label: 'Purchase order', icon: 'shopping_bag', domainGroup: 'Vendors & Suppliers', favorite: true },
  { label: 'Product', icon: 'checkroom', domainGroup: 'Catalog & Marketing', favorite: true },
  { label: 'Design', icon: 'palette', domainGroup: 'Catalog & Marketing', favorite: false },
  { label: 'Discount code', icon: 'sell', domainGroup: 'Catalog & Marketing', favorite: false },
  { label: 'Customer', icon: 'person_add', domainGroup: 'Customers', favorite: true },
  { label: 'Vendor', icon: 'domain_add', domainGroup: 'Vendors & Suppliers', favorite: false },
  { label: 'Add supplier', icon: 'factory', domainGroup: 'Vendors & Suppliers', favorite: false },
  { label: 'Add contractor', icon: 'engineering', domainGroup: 'Team', favorite: false },
  { label: 'Return/RMA', icon: 'assignment_return', domainGroup: 'Support & Orders', favorite: false },
  { label: 'Task', icon: 'task', domainGroup: 'Other (books)', favorite: false },
  { label: 'Reconcile', icon: 'fact_check', domainGroup: 'Other (books)', favorite: false },
];

export const DEFAULT_PINNED_CREATE_ACTIONS: string[] = [
  'Invoice',
  'Sales order',
  'Receive payment',
  'Purchase order',
  'Expense',
  'Product',
  'Customer',
];

export const OPS_VITALS_BY_WINDOW: Record<OpsWindow, OpsKpiTile[]> = {
  Today: [
    {
      id: 'unfulfilled',
      label: 'Unfulfilled orders',
      value: '42',
      delta: '6 due <4h SLA',
      tone: 'warn',
      subtext: '188 orders placed today · $16,420 GMV',
      targetDomain: 'orders',
      targetScreen: 'orders',
    },
    {
      id: 'supplier_sla',
      label: 'Supplier SLA health',
      value: '99.1%',
      delta: '+0.4 pts vs 7d',
      tone: 'pos',
      subtext: 'Printful 99.1% · Printify 99.6% · Gelato 98.4%',
      targetDomain: 'orders',
      targetScreen: 'fulfillment',
    },
    {
      id: 'preflight',
      label: 'Preflight artwork holds',
      value: '4',
      delta: '2 low DPI (<300)',
      tone: 'neg',
      subtext: 'Blocking print routing in Konva Studio',
      targetDomain: 'catalog',
      targetScreen: 'studio',
    },
    {
      id: 'receipts_bills',
      label: 'Intake & bills for review',
      value: '9',
      delta: '$4,080 AP due',
      tone: 'warn',
      subtext: '3 supplier bills + 6 emailed receipts',
      targetDomain: 'finance',
      targetScreen: 'bills',
    },
    {
      id: 'bank_feed',
      label: 'Bank & payout feed',
      value: '14',
      delta: '11 rule-matched',
      tone: 'pos',
      subtext: 'Mercury •9910 + Stripe settlement split',
      targetDomain: 'finance',
      targetScreen: 'bank',
    },
    {
      id: 'support_rma',
      label: 'Open tickets & RMAs',
      value: '7',
      delta: '14m median reply',
      tone: 'neutral',
      subtext: '3 reprint RMAs · 4 customer inquiries',
      targetDomain: 'support',
      targetScreen: 'tickets',
    },
  ],
  '7D': [
    {
      id: 'unfulfilled',
      label: 'Active pipeline orders',
      value: '244',
      delta: '98.8% on-time',
      tone: 'pos',
      subtext: '1,312 orders placed · $114,880 GMV',
      targetDomain: 'orders',
      targetScreen: 'orders',
    },
    {
      id: 'supplier_sla',
      label: 'Supplier SLA health',
      value: '98.9%',
      delta: '+0.2 pts WoW',
      tone: 'pos',
      subtext: '14.2h avg print-to-carrier scan',
      targetDomain: 'orders',
      targetScreen: 'fulfillment',
    },
    {
      id: 'preflight',
      label: 'Preflight artwork holds',
      value: '11',
      delta: '7 resolved in <2h',
      tone: 'warn',
      subtext: '4 currently awaiting designer fix',
      targetDomain: 'catalog',
      targetScreen: 'studio',
    },
    {
      id: 'receipts_bills',
      label: 'Intake & bills for review',
      value: '23',
      delta: '$12,640 AP queued',
      tone: 'warn',
      subtext: '14 auto-extracted via OCR inbox',
      targetDomain: 'finance',
      targetScreen: 'receipts',
    },
    {
      id: 'bank_feed',
      label: 'Bank & payout feed',
      value: '38',
      delta: '92% auto-categorized',
      tone: 'pos',
      subtext: '3 Stripe payouts reconciled cleanly',
      targetDomain: 'finance',
      targetScreen: 'bank',
    },
    {
      id: 'support_rma',
      label: 'Open tickets & RMAs',
      value: '19',
      delta: '1.1% RMA rate',
      tone: 'pos',
      subtext: 'Below 1.5% quality threshold',
      targetDomain: 'orders',
      targetScreen: 'returns',
    },
  ],
  '30D': [
    {
      id: 'unfulfilled',
      label: 'Orders processed (30D)',
      value: '5,640',
      delta: '+18.4% vs prior 30d',
      tone: 'pos',
      subtext: '$482,940 Gross Merchandise Volume',
      targetDomain: 'orders',
      targetScreen: 'orders',
    },
    {
      id: 'supplier_sla',
      label: 'Supplier SLA health',
      value: '99.0%',
      delta: '+0.6 pts MoM',
      tone: 'pos',
      subtext: '5,584 of 5,640 shipped inside SLA',
      targetDomain: 'orders',
      targetScreen: 'fulfillment',
    },
    {
      id: 'preflight',
      label: 'Preflight pass rate',
      value: '96.4%',
      delta: '+1.8 pts MoM',
      tone: 'pos',
      subtext: 'Automated 300 DPI + bleed guardrails',
      targetDomain: 'catalog',
      targetScreen: 'studio',
    },
    {
      id: 'receipts_bills',
      label: 'Bills & expenses posted',
      value: '148',
      delta: '$188,420 COGS/OpEx',
      tone: 'neutral',
      subtext: '97% with attached receipt/bill PDF',
      targetDomain: 'finance',
      targetScreen: 'expenses',
    },
    {
      id: 'bank_feed',
      label: 'Reconciled accounts',
      value: '5 / 5',
      delta: '$0.00 variance',
      tone: 'pos',
      subtext: 'Closed through Oct 31, 2026',
      targetDomain: 'finance',
      targetScreen: 'reconcile',
    },
    {
      id: 'support_rma',
      label: 'CSAT & RMA resolution',
      value: '97.8%',
      delta: '1.2% defect rate',
      tone: 'pos',
      subtext: '$4,810 supplier credits recovered',
      targetDomain: 'orders',
      targetScreen: 'returns',
    },
  ],
  MTD: [
    {
      id: 'unfulfilled',
      label: 'Nov MTD orders',
      value: '214',
      delta: '+21.0% vs Oct D1',
      tone: 'pos',
      subtext: '$18,910 MTD GMV · $88.36 AOV',
      targetDomain: 'orders',
      targetScreen: 'orders',
    },
    {
      id: 'supplier_sla',
      label: 'Supplier SLA health',
      value: '99.2%',
      delta: 'All pods green',
      tone: 'pos',
      subtext: 'Zero carrier pickups missed',
      targetDomain: 'orders',
      targetScreen: 'fulfillment',
    },
    {
      id: 'preflight',
      label: 'Preflight artwork holds',
      value: '4',
      delta: 'Action required',
      tone: 'neg',
      subtext: '2 Apparel · 1 Wall Art · 1 Mug wrap',
      targetDomain: 'catalog',
      targetScreen: 'studio',
    },
    {
      id: 'receipts_bills',
      label: 'Open AP balance',
      value: '$4,080',
      delta: '3 supplier bills',
      tone: 'warn',
      subtext: 'Next due Nov 10 (Printful PF-9211)',
      targetDomain: 'finance',
      targetScreen: 'bills',
    },
    {
      id: 'bank_feed',
      label: 'Unreconciled lines',
      value: '14',
      delta: 'Nov 1 feed live',
      tone: 'neutral',
      subtext: 'Synced 2m ago via Plaid + Stripe',
      targetDomain: 'finance',
      targetScreen: 'bank',
    },
    {
      id: 'support_rma',
      label: 'Active escalations',
      value: '7',
      delta: '2 VIP accounts',
      tone: 'warn',
      subtext: 'Acme Corp + Orion Apparel threads',
      targetDomain: 'support',
      targetScreen: 'tickets',
    },
  ],
};

export const OPS_PIPELINE_FUNNEL: OpsFunnelStage[] = [
  {
    stage: '1. Unfulfilled & Preflight Check',
    count: 42,
    gmv: '$3,780',
    avgAge: '1.8 hrs',
    pctOfTotal: 14,
    tone: 'maroon',
    targetDomain: 'orders',
    targetScreen: 'orders',
  },
  {
    stage: '2. Routed to POD Supplier',
    count: 118,
    gmv: '$10,490',
    avgAge: '5.4 hrs',
    pctOfTotal: 38,
    tone: 'navy',
    targetDomain: 'orders',
    targetScreen: 'purchase-orders',
  },
  {
    stage: '3. In Print & Quality Inspection',
    count: 84,
    gmv: '$7,620',
    avgAge: '13.2 hrs',
    pctOfTotal: 28,
    tone: 'blue',
    targetDomain: 'orders',
    targetScreen: 'fulfillment',
  },
  {
    stage: '4. Shipped / Carrier In-Transit',
    count: 312,
    gmv: '$27,840',
    avgAge: '2.1 days',
    pctOfTotal: 76,
    tone: 'teal',
    targetDomain: 'orders',
    targetScreen: 'shipping',
  },
  {
    stage: '5. Delivered & Payout Settled (7D)',
    count: 1290,
    gmv: '$112,410',
    avgAge: 'Completed',
    pctOfTotal: 100,
    tone: 'green',
    targetDomain: 'finance',
    targetScreen: 'sales-overview',
  },
];

export const INTEGRATION_VITALS: IntegrationVital[] = [
  {
    name: 'Printful API (Apparel & Embroidery)',
    role: 'Primary POD Supplier',
    status: 'Healthy',
    metricLabel: 'Active jobs',
    metricValue: '112 orders · $2,880 AP',
    slaPct: '99.1%',
    lastSync: '1m ago',
    openCount: 2,
    targetDomain: 'orders',
    targetScreen: 'fulfillment',
  },
  {
    name: 'Printify Network (Drinkware & Tees)',
    role: 'POD Supplier',
    status: 'Healthy',
    metricLabel: 'Active jobs',
    metricValue: '54 orders · $0 open AP',
    slaPct: '99.6%',
    lastSync: '2m ago',
    openCount: 0,
    targetDomain: 'orders',
    targetScreen: 'fulfillment',
  },
  {
    name: 'Gelato Global (Wall Art & Canvas)',
    role: 'POD Supplier',
    status: 'SLA warning',
    metricLabel: 'Active jobs',
    metricValue: '36 orders · $1,200 AP',
    slaPct: '98.4%',
    lastSync: '4m ago',
    openCount: 3,
    targetDomain: 'orders',
    targetScreen: 'fulfillment',
  },
  {
    name: 'Stripe Connect & Clearing',
    role: 'Payments & Split Payouts',
    status: 'Synced',
    metricLabel: 'Next settlement',
    metricValue: '$14,820.40 · Nov 3',
    slaPct: '100%',
    lastSync: 'Live webhook',
    openCount: 1,
    targetDomain: 'finance',
    targetScreen: 'bank',
  },
  {
    name: 'Receipts Intake (OCR Inbox)',
    role: 'receipts@unsaid.app',
    status: 'For review',
    metricLabel: 'Drafts ready',
    metricValue: '6 receipts · 3 bills',
    slaPct: '97.2%',
    lastSync: '6m ago',
    openCount: 9,
    targetDomain: 'finance',
    targetScreen: 'receipts',
  },
];

export const SMART_SUGGESTIONS: SmartSuggestion[] = [
  {
    id: 'sug-bills',
    category: 'Bills & AP',
    title: 'Schedule 2 supplier bills before Nov 10 discount cutoff',
    detail: 'Printful (#PF-9211, $2,880) and Gelato (#GL-4402, $1,200) are ready for batch ACH payment.',
    impact: 'Saves $81.60 early-pay credit',
    actionLabel: 'Open Bills',
    icon: 'account_balance_wallet',
    targetDomain: 'finance',
    targetScreen: 'bills',
  },
  {
    id: 'sug-bank',
    category: 'Banking',
    title: 'Auto-confirm 11 categorized bank & Stripe clearing lines',
    detail: 'Bank rules matched Printful COGS, FedEx labels, and Stripe fee splits with 99% confidence.',
    impact: 'Clears 78% of bank review feed',
    actionLabel: 'Review Bank Feed',
    icon: 'auto_mode',
    targetDomain: 'finance',
    targetScreen: 'bank',
  },
  {
    id: 'sug-preflight',
    category: 'Preflight',
    title: '4 custom orders paused on Konva Studio preflight gate',
    detail: '2 hoodies submitted at 144 DPI and 2 posters extend outside safe bleed guide.',
    impact: 'Unlocks $1,420 stuck GMV',
    actionLabel: 'Inspect Attention Queue',
    icon: 'palette',
    targetDomain: 'dashboard',
    targetScreen: 'attention',
  },
  {
    id: 'sug-1099',
    category: 'Tax & 1099',
    title: '6 contractors & design sellers missing W-9 before year-end',
    detail: 'Automated W-9 email requests keep 1099-NEC filing compliant ahead of Jan 31 deadline.',
    impact: 'Clears 1099 compliance hold',
    actionLabel: 'Open Seller Queue',
    icon: 'engineering',
    targetDomain: 'dashboard',
    targetScreen: 'seller-queue',
  },
];

export const MONTHLY_GMV_SERIES: MonthlyGmvPoint[] = [
  { month: 'Dec 2025', shortLabel: 'Dec', gmv: 342000, netRevenue: 314600, grossProfit: 179300, cogs: 135300, stripeFees: 9800, adSpend: 54000, refunds: 9200, orders: 4010 },
  { month: 'Jan 2026', shortLabel: 'Jan', gmv: 298000, netRevenue: 274200, grossProfit: 156300, cogs: 117900, stripeFees: 8600, adSpend: 46000, refunds: 8400, orders: 3520 },
  { month: 'Feb 2026', shortLabel: 'Feb', gmv: 315000, netRevenue: 291400, grossProfit: 167500, cogs: 123900, stripeFees: 9100, adSpend: 48500, refunds: 7600, orders: 3710 },
  { month: 'Mar 2026', shortLabel: 'Mar', gmv: 356000, netRevenue: 329300, grossProfit: 191000, cogs: 138300, stripeFees: 10200, adSpend: 53000, refunds: 8100, orders: 4180 },
  { month: 'Apr 2026', shortLabel: 'Apr', gmv: 374000, netRevenue: 346000, grossProfit: 201400, cogs: 144600, stripeFees: 10800, adSpend: 56200, refunds: 8500, orders: 4390 },
  { month: 'May 2026', shortLabel: 'May', gmv: 392000, netRevenue: 362600, grossProfit: 211800, cogs: 150800, stripeFees: 11400, adSpend: 58900, refunds: 9100, orders: 4580 },
  { month: 'Jun 2026', shortLabel: 'Jun', gmv: 408000, netRevenue: 377400, grossProfit: 221200, cogs: 156200, stripeFees: 11800, adSpend: 61000, refunds: 9400, orders: 4760 },
  { month: 'Jul 2026', shortLabel: 'Jul', gmv: 419000, netRevenue: 387600, grossProfit: 227100, cogs: 160500, stripeFees: 12100, adSpend: 62400, refunds: 9800, orders: 4890 },
  { month: 'Aug 2026', shortLabel: 'Aug', gmv: 438000, netRevenue: 405200, grossProfit: 238200, cogs: 167000, stripeFees: 12700, adSpend: 65100, refunds: 10100, orders: 5120 },
  { month: 'Sep 2026', shortLabel: 'Sep', gmv: 454000, netRevenue: 419900, grossProfit: 247700, cogs: 172200, stripeFees: 13100, adSpend: 67800, refunds: 10400, orders: 5310 },
  { month: 'Oct 2026', shortLabel: 'Oct', gmv: 482940, netRevenue: 446120, grossProfit: 260534, cogs: 185586, stripeFees: 13980, adSpend: 71400, refunds: 11240, orders: 5640 },
  { month: 'Nov 2026 (Run-rate)', shortLabel: 'Nov*', gmv: 518000, netRevenue: 479150, grossProfit: 281740, cogs: 197410, stripeFees: 14950, adSpend: 74800, refunds: 11600, orders: 6020 },
];

export const EXEC_PERIOD_MULTIPLIER: Record<ExecPeriod, { mult: number; label: string; deltaGmv: string; deltaNet: string; deltaMargin: string; deltaContrib: string }> = {
  MTD: {
    mult: 1,
    label: 'Last 30 days · Closed Oct + Nov D1',
    deltaGmv: '+18.4%',
    deltaNet: '+16.9%',
    deltaMargin: '+2.1 pts',
    deltaContrib: '+3.4 pts',
  },
  QTD: {
    mult: 2.04,
    label: 'Q4 2026 Quarter-to-Date',
    deltaGmv: '+20.1%',
    deltaNet: '+18.8%',
    deltaMargin: '+2.4 pts',
    deltaContrib: '+3.8 pts',
  },
  YTD: {
    mult: 9.25,
    label: 'Jan 1 – Nov 1, 2026 (YTD)',
    deltaGmv: '+31.6%',
    deltaNet: '+29.8%',
    deltaMargin: '+3.2 pts',
    deltaContrib: '+4.5 pts',
  },
  '12M': {
    mult: 10.12,
    label: 'Trailing 12 Months (TTM)',
    deltaGmv: '+34.2%',
    deltaNet: '+32.0%',
    deltaMargin: '+3.5 pts',
    deltaContrib: '+4.9 pts',
  },
};

export const GMV_WATERFALL_BRIDGE: WaterfallBridgeItem[] = [
  { label: 'Gross Merchandise Volume (GMV)', amount: 482940, pctOfGmv: 100.0, kind: 'gross', note: '5,640 orders · $85.63 AOV' },
  { label: 'Promotional Discounts & Codes', amount: -25580, pctOfGmv: 5.3, kind: 'deduction', note: '4100 · Discounts given' },
  { label: 'Returns, RMAs & Credit Memos', amount: -11240, pctOfGmv: 2.3, kind: 'deduction', note: '4200 · Sales returns & allowances' },
  { label: 'Net Revenue (Recognized)', amount: 446120, pctOfGmv: 92.4, kind: 'subtotal', note: 'Net sales + shipping income' },
  { label: 'Supplier Blank & Print COGS', amount: -149210, pctOfGmv: 30.9, kind: 'cogs', note: '5100 · Printful / Printify / Gelato' },
  { label: 'Outbound Carrier & Packaging', amount: -22396, pctOfGmv: 4.6, kind: 'cogs', note: '5200 · Shipping & fulfillment COGS' },
  { label: 'Stripe & Marketplace Processing', amount: -13980, pctOfGmv: 2.9, kind: 'cogs', note: '5300 · Merchant processing fees' },
  { label: 'Gross Profit', amount: 260534, pctOfGmv: 53.9, kind: 'subtotal', note: '58.4% of Net Revenue' },
  { label: 'Ad Center & Performance Spend', amount: -71400, pctOfGmv: 14.8, kind: 'deduction', note: '6100 · Meta / Google / TikTok Ads' },
  { label: 'Seller Marketplace Payouts', amount: -36561, pctOfGmv: 7.6, kind: 'deduction', note: '2150 · Marketplace seller payable' },
  { label: 'Net Contribution Margin', amount: 152573, pctOfGmv: 31.6, kind: 'net', note: '34.2% of Net Revenue' },
];

export const CATEGORY_MARGINS: CategoryMarginRow[] = [
  {
    category: 'Apparel (Tees, Hoodies, Fleece)',
    coaAccount: '4010 · Sales — Apparel',
    orders: 2890,
    units: 4920,
    gmv: 248400,
    cogs: 94392,
    grossProfit: 154008,
    marginPct: 62.0,
    returnRatePct: 1.4,
    sharePct: 51.4,
  },
  {
    category: 'Wall Art (Framed Prints, Canvas)',
    coaAccount: '4020 · Sales — Wall Art',
    orders: 1210,
    units: 1680,
    gmv: 118900,
    cogs: 49938,
    grossProfit: 68962,
    marginPct: 58.0,
    returnRatePct: 0.9,
    sharePct: 24.6,
  },
  {
    category: 'Drinkware (Mugs, Tumblers)',
    coaAccount: '4030 · Sales — Drinkware',
    orders: 940,
    units: 1890,
    gmv: 64200,
    cogs: 31458,
    grossProfit: 32742,
    marginPct: 51.0,
    returnRatePct: 1.8,
    sharePct: 13.3,
  },
  {
    category: 'Totes, Hats & Accessories',
    coaAccount: '4040 · Sales — Accessories',
    orders: 600,
    units: 1120,
    gmv: 51440,
    cogs: 23148,
    grossProfit: 28292,
    marginPct: 55.0,
    returnRatePct: 0.7,
    sharePct: 10.7,
  },
];

export const CHANNEL_PERFORMANCE: ChannelPerformanceRow[] = [
  {
    channel: 'Direct Storefront (Shopify + Web)',
    settlementAccount: '1050 · Stripe & Shopify Clearing',
    orders: 3680,
    gmv: 309080,
    takeRatePct: 100.0,
    fees: 8963,
    netContribution: 108420,
    growthPct: '+19.2%',
    sharePct: 64.0,
    status: 'Healthy',
  },
  {
    channel: 'Marketplace Creator Sellers',
    settlementAccount: '2150 · Marketplace Seller Payable',
    orders: 1290,
    gmv: 106250,
    takeRatePct: 18.5,
    fees: 3081,
    netContribution: 19656,
    growthPct: '+26.4%',
    sharePct: 22.0,
    status: 'Active',
  },
  {
    channel: 'B2B Wholesale & Custom Invoices',
    settlementAccount: '1100 · Accounts Receivable',
    orders: 670,
    gmv: 67610,
    takeRatePct: 100.0,
    fees: 1936,
    netContribution: 24497,
    growthPct: '+11.8%',
    sharePct: 14.0,
    status: 'For review',
  },
];

export const SUPPLIER_MARGINS: SupplierMarginRow[] = [
  {
    supplier: 'Printful',
    routedOrders: 3120,
    blankAndPrintCogs: 84620,
    avgTurnaround: '14.2 hrs',
    reprintRatePct: 0.8,
    slaPct: 99.1,
    grossMarginPct: 60.4,
    status: 'Healthy',
  },
  {
    supplier: 'Printify',
    routedOrders: 1580,
    blankAndPrintCogs: 38490,
    avgTurnaround: '11.6 hrs',
    reprintRatePct: 0.6,
    slaPct: 99.6,
    grossMarginPct: 57.8,
    status: 'Healthy',
  },
  {
    supplier: 'Gelato',
    routedOrders: 940,
    blankAndPrintCogs: 26100,
    avgTurnaround: '18.4 hrs',
    reprintRatePct: 1.5,
    slaPct: 98.4,
    grossMarginPct: 54.9,
    status: 'SLA warning',
  },
];

export const ANALYTICS_CONVERSION_FUNNEL = [
  { step: '1. Storefront & Marketplace Sessions', count: 148200, pct: 100.0, dropoff: '—' },
  { step: '2. Product & Mockup Views', count: 68410, pct: 46.2, dropoff: '−53.8% bounce' },
  { step: '3. Customized / Added to Cart', count: 15890, pct: 10.7, dropoff: '23.2% add-to-cart' },
  { step: '4. Checkout & Shipping Initiated', count: 8920, pct: 6.0, dropoff: '56.1% cart-to-checkout' },
  { step: '5. Completed Paid Orders', count: 5640, pct: 3.81, dropoff: '63.2% checkout completion' },
];

export const COHORT_RETENTION_ROWS: CohortRow[] = [
  { cohort: 'May 2026', customers: 820, cac: '$18.40', ltv: '$164', m0: 100, m1: 38, m2: 31, m3: 28, m4: 26, m5: 25 },
  { cohort: 'Jun 2026', customers: 890, cac: '$17.90', ltv: '$172', m0: 100, m1: 41, m2: 33, m3: 29, m4: 27, m5: 0 },
  { cohort: 'Jul 2026', customers: 940, cac: '$18.10', ltv: '$169', m0: 100, m1: 39, m2: 32, m3: 30, m4: 0, m5: 0 },
  { cohort: 'Aug 2026', customers: 1020, cac: '$17.20', ltv: '$178', m0: 100, m1: 43, m2: 35, m3: 0, m4: 0, m5: 0 },
  { cohort: 'Sep 2026', customers: 1110, cac: '$16.80', ltv: '$184', m0: 100, m1: 45, m2: 0, m3: 0, m4: 0, m5: 0 },
  { cohort: 'Oct 2026', customers: 1240, cac: '$16.40', ltv: '$191', m0: 100, m1: 0, m2: 0, m3: 0, m4: 0, m5: 0 },
];

export const TOP_SKU_ANALYTICS: TopSkuAnalyticsRow[] = [
  { sku: 'TEE-001', name: 'Heavyweight Studio Tee — Vintage Wash', category: 'Apparel', supplier: 'Printful', units: 1840, gmv: 66240, marginPct: 64.2, cvrPct: 4.9, rmaPct: 0.8, status: 'Published' },
  { sku: 'HDY-204', name: 'Midweight Fleece Pullover Hoodie', category: 'Apparel', supplier: 'Printful', units: 960, gmv: 61440, marginPct: 61.5, cvrPct: 4.1, rmaPct: 1.1, status: 'Published' },
  { sku: 'ART-118', name: 'Museum Matte Framed Poster 18×24', category: 'Wall Art', supplier: 'Gelato', units: 740, gmv: 57720, marginPct: 58.8, cvrPct: 3.7, rmaPct: 1.6, status: 'SLA warning' },
  { sku: 'TOTE-014', name: 'Organic Cotton Gusset Canvas Tote', category: 'Accessories', supplier: 'Gelato', units: 1420, gmv: 34080, marginPct: 56.4, cvrPct: 5.2, rmaPct: 0.5, status: 'Published' },
  { sku: 'MUG-003', name: 'Ceramic Campfire Mug 11oz', category: 'Drinkware', supplier: 'Printify', units: 1510, gmv: 30200, marginPct: 52.1, cvrPct: 4.6, rmaPct: 1.4, status: 'Published' },
  { sku: 'BND-090', name: 'Creator Merch Launch Kit (3-Pack)', category: 'Apparel', supplier: 'Printful', units: 410, gmv: 38540, marginPct: 63.0, cvrPct: 3.4, rmaPct: 0.6, status: 'Published' },
];

export const ATTRIBUTION_CHANNELS: AttributionChannelRow[] = [
  { channel: 'Meta Ads (IG + FB Dynamic Catalog)', campaignCount: 14, spend: 32400, sessions: 51200, orders: 1940, attributedGmv: 168780, roas: 5.21, cac: 16.7, sharePct: 34.9 },
  { channel: 'Google Shopping & Performance Max', campaignCount: 9, spend: 21800, sessions: 38400, orders: 1490, attributedGmv: 131120, roas: 6.01, cac: 14.6, sharePct: 27.2 },
  { channel: 'TikTok Shop & Creator Spark Ads', campaignCount: 11, spend: 14200, sessions: 29600, orders: 860, attributedGmv: 67940, roas: 4.78, cac: 16.5, sharePct: 14.1 },
  { channel: 'CRM Newsletter & Klaviyo Flows', campaignCount: 8, spend: 3000, sessions: 14100, orders: 780, attributedGmv: 69420, roas: 23.14, cac: 3.85, sharePct: 14.4 },
  { channel: 'Organic Search & Direct B2B', campaignCount: 0, spend: 0, sessions: 14900, orders: 570, attributedGmv: 45680, roas: 0, cac: 0, sharePct: 9.4 },
];

export const EXPLORER_DATASETS: Record<ExplorerDatasetKey, ExplorerRow[]> = {
  orders_gmv: [
    { id: 'EXP-01', dimension: 'Storefront · Apparel', secondaryDim: 'Printful', segment: 'Direct D2C', orders: 1980, gmv: 174240, discountsAndRefunds: -11820, netRevenue: 162420, cogs: -61720, grossProfit: 100700, marginPct: 62.0, varianceAmount: 14200, status: 'Healthy', createdBy: 'System ETL', createdOn: '11/01/2026', modifiedBy: 'SA', modifiedOn: '11/01/2026' },
    { id: 'EXP-02', dimension: 'Storefront · Wall Art', secondaryDim: 'Gelato', segment: 'Direct D2C', orders: 890, gmv: 89400, discountsAndRefunds: -6140, netRevenue: 83260, cogs: -34970, grossProfit: 48290, marginPct: 58.0, varianceAmount: 6810, status: 'Healthy', createdBy: 'System ETL', createdOn: '11/01/2026', modifiedBy: 'SA', modifiedOn: '11/01/2026' },
    { id: 'EXP-03', dimension: 'Storefront · Drinkware', secondaryDim: 'Printify', segment: 'Direct D2C', orders: 810, gmv: 45440, discountsAndRefunds: -3890, netRevenue: 41550, cogs: -20360, grossProfit: 21190, marginPct: 51.0, varianceAmount: -1240, status: 'SLA warning', createdBy: 'System ETL', createdOn: '11/01/2026', modifiedBy: 'M. Lin', modifiedOn: '10/31/2026' },
    { id: 'EXP-04', dimension: 'Marketplace · Creator Merch', secondaryDim: 'Printful', segment: 'Seller Tier 1', orders: 840, gmv: 72480, discountsAndRefunds: -4920, netRevenue: 67560, cogs: -26348, grossProfit: 41212, marginPct: 61.0, varianceAmount: 9340, status: 'Active', createdBy: 'System ETL', createdOn: '11/01/2026', modifiedBy: 'SA', modifiedOn: '11/01/2026' },
    { id: 'EXP-05', dimension: 'Marketplace · Indie Prints', secondaryDim: 'Gelato', segment: 'Seller Tier 2', orders: 450, gmv: 33770, discountsAndRefunds: -2910, netRevenue: 30860, cogs: -13887, grossProfit: 16973, marginPct: 55.0, varianceAmount: -2180, status: 'For review', createdBy: 'System ETL', createdOn: '11/01/2026', modifiedBy: 'K. Patel', modifiedOn: '10/30/2026' },
    { id: 'EXP-06', dimension: 'B2B Invoices · Corporate Kits', secondaryDim: 'Printful', segment: 'Enterprise AR', orders: 420, gmv: 46810, discountsAndRefunds: -4200, netRevenue: 42610, cogs: -15766, grossProfit: 26844, marginPct: 63.0, varianceAmount: 5490, status: 'Open', createdBy: 'SA', createdOn: '10/28/2026', modifiedBy: 'SA', modifiedOn: '11/01/2026' },
    { id: 'EXP-07', dimension: 'B2B Invoices · Event Swag', secondaryDim: 'Printify', segment: 'Mid-Market AR', orders: 250, gmv: 20800, discountsAndRefunds: -2940, netRevenue: 17860, cogs: -12536, grossProfit: 5324, marginPct: 29.8, varianceAmount: -3890, status: 'Overdue', createdBy: 'SA', createdOn: '10/15/2026', modifiedBy: 'R. Gomez', modifiedOn: '10/29/2026' },
  ],
  sku_velocity: [
    { id: 'SKU-01', dimension: 'TEE-001 · Heavyweight Studio Tee', secondaryDim: 'Printful', segment: 'Apparel', orders: 1840, gmv: 66240, discountsAndRefunds: -3910, netRevenue: 62330, cogs: -22314, grossProfit: 40016, marginPct: 64.2, varianceAmount: 8420, status: 'Published', createdBy: 'SA', createdOn: '08/12/2026', modifiedBy: 'SA', modifiedOn: '11/01/2026' },
    { id: 'SKU-02', dimension: 'HDY-204 · Midweight Fleece Hoodie', secondaryDim: 'Printful', segment: 'Apparel', orders: 960, gmv: 61440, discountsAndRefunds: -4120, netRevenue: 57320, cogs: -22068, grossProfit: 35252, marginPct: 61.5, varianceAmount: 6190, status: 'Published', createdBy: 'SA', createdOn: '09/01/2026', modifiedBy: 'M. Lin', modifiedOn: '10/30/2026' },
    { id: 'SKU-03', dimension: 'ART-118 · Framed Poster 18×24', secondaryDim: 'Gelato', segment: 'Wall Art', orders: 740, gmv: 57720, discountsAndRefunds: -4890, netRevenue: 52830, cogs: -21766, grossProfit: 31064, marginPct: 58.8, varianceAmount: -1950, status: 'SLA warning', createdBy: 'K. Patel', createdOn: '07/19/2026', modifiedBy: 'SA', modifiedOn: '11/01/2026' },
    { id: 'SKU-04', dimension: 'BND-090 · Creator Launch Kit', secondaryDim: 'Printful', segment: 'Bundles', orders: 410, gmv: 38540, discountsAndRefunds: -1980, netRevenue: 36560, cogs: -13527, grossProfit: 23033, marginPct: 63.0, varianceAmount: 4880, status: 'Published', createdBy: 'SA', createdOn: '09/14/2026', modifiedBy: 'SA', modifiedOn: '10/28/2026' },
    { id: 'SKU-05', dimension: 'TOTE-014 · Organic Canvas Tote', secondaryDim: 'Gelato', segment: 'Accessories', orders: 1420, gmv: 34080, discountsAndRefunds: -1640, netRevenue: 32440, cogs: -14144, grossProfit: 18296, marginPct: 56.4, varianceAmount: 2740, status: 'Published', createdBy: 'M. Lin', createdOn: '06/04/2026', modifiedBy: 'M. Lin', modifiedOn: '10/27/2026' },
    { id: 'SKU-06', dimension: 'MUG-003 · Campfire Mug 11oz', secondaryDim: 'Printify', segment: 'Drinkware', orders: 1510, gmv: 30200, discountsAndRefunds: -2780, netRevenue: 27420, cogs: -13134, grossProfit: 14286, marginPct: 52.1, varianceAmount: -820, status: 'For review', createdBy: 'R. Gomez', createdOn: '05/22/2026', modifiedBy: 'SA', modifiedOn: '10/31/2026' },
  ],
  customer_cohorts: [
    { id: 'COH-01', dimension: 'Enterprise B2B Accounts', secondaryDim: 'Net 30 Invoice', segment: 'VIP / High LTV', orders: 670, gmv: 148200, discountsAndRefunds: -5400, netRevenue: 142800, cogs: -54264, grossProfit: 88536, marginPct: 62.0, varianceAmount: 19400, status: 'VIP', createdBy: 'System CRM', createdOn: '01/01/2026', modifiedBy: 'SA', modifiedOn: '11/01/2026' },
    { id: 'COH-02', dimension: 'Repeat Creator Subscribers', secondaryDim: 'Shopify + Stripe', segment: 'Recurring', orders: 1890, gmv: 162400, discountsAndRefunds: -8920, netRevenue: 153480, cogs: -62927, grossProfit: 90553, marginPct: 59.0, varianceAmount: 11200, status: 'Active', createdBy: 'System CRM', createdOn: '03/01/2026', modifiedBy: 'SA', modifiedOn: '11/01/2026' },
    { id: 'COH-03', dimension: 'First-Time Paid Social Buyers', secondaryDim: 'Meta / TikTok', segment: 'New', orders: 2410, gmv: 134940, discountsAndRefunds: -16800, netRevenue: 118140, cogs: -53163, grossProfit: 64977, marginPct: 55.0, varianceAmount: -4120, status: 'For review', createdBy: 'System CRM', createdOn: '10/01/2026', modifiedBy: 'K. Patel', modifiedOn: '11/01/2026' },
    { id: 'COH-04', dimension: 'Dormant >90d Reactivation', secondaryDim: 'Newsletter Winback', segment: 'At risk', orders: 670, gmv: 37400, discountsAndRefunds: -5700, netRevenue: 31700, cogs: -15216, grossProfit: 16484, marginPct: 52.0, varianceAmount: -2650, status: 'At risk', createdBy: 'System CRM', createdOn: '07/01/2026', modifiedBy: 'M. Lin', modifiedOn: '10/29/2026' },
  ],
  seller_ledger: [
    { id: 'SEL-01', dimension: 'Studio North Collective', secondaryDim: 'Marketplace Seller', segment: '18% Take-Rate', orders: 490, gmv: 44100, discountsAndRefunds: -1890, netRevenue: 42210, cogs: -16884, grossProfit: 25326, marginPct: 60.0, varianceAmount: 4900, status: 'Approved', createdBy: 'Onboarding', createdOn: '04/10/2026', modifiedBy: 'SA', modifiedOn: '11/01/2026' },
    { id: 'SEL-02', dimension: 'Kitsune Ink & Apparel', secondaryDim: 'Marketplace Seller', segment: '20% Take-Rate', orders: 380, gmv: 33820, discountsAndRefunds: -1420, netRevenue: 32400, cogs: -13284, grossProfit: 19116, marginPct: 59.0, varianceAmount: 3120, status: 'Approved', createdBy: 'Onboarding', createdOn: '05/18/2026', modifiedBy: 'SA', modifiedOn: '10/30/2026' },
    { id: 'SEL-03', dimension: 'Hyperion Poster Lab', secondaryDim: 'Marketplace Seller', segment: '15% Take-Rate', orders: 260, gmv: 19240, discountsAndRefunds: -2410, netRevenue: 16830, cogs: -8415, grossProfit: 8415, marginPct: 50.0, varianceAmount: -1890, status: 'Pending W-9', createdBy: 'Onboarding', createdOn: '08/02/2026', modifiedBy: 'K. Patel', modifiedOn: '10/31/2026' },
    { id: 'SEL-04', dimension: 'Vesper Streetwear Co.', secondaryDim: 'Marketplace Seller', segment: '18% Take-Rate', orders: 160, gmv: 9090, discountsAndRefunds: -1120, netRevenue: 7970, cogs: -4384, grossProfit: 3586, marginPct: 45.0, varianceAmount: -1420, status: 'On hold', createdBy: 'Onboarding', createdOn: '09/25/2026', modifiedBy: 'SA', modifiedOn: '11/01/2026' },
  ],
};

export const INITIAL_SAVED_EXPLORER_VIEWS: SavedExplorerView[] = [
  { id: 'sv-1', name: 'Executive GMV by Channel', dataset: 'orders_gmv', tab: 'All rows', divideBy1000: false },
  { id: 'sv-2', name: 'SKU Profitability & RMA', dataset: 'sku_velocity', tab: 'All rows', divideBy1000: false },
  { id: 'sv-3', name: 'High-LTV Customer Cohorts ($K)', dataset: 'customer_cohorts', tab: 'Positive margin (>55%)', divideBy1000: true },
  { id: 'sv-4', name: 'Marketplace Seller Take-Rate', dataset: 'seller_ledger', tab: 'All rows', divideBy1000: false },
];

export const INITIAL_ATTENTION_QUEUE: AttentionQueueItem[] = [
  {
    id: 'ATN-101',
    code: 'ORD-88412',
    title: '6 rush apparel orders within 3h of Printful carrier cutoff',
    category: 'Orders & SLA',
    severity: 'Critical',
    entity: 'Acme Corp · Bulk Team Kit',
    owner: 'SA',
    impactAmount: 3840,
    slaRemaining: '2h 40m',
    createdOn: '11/01/2026 08:15',
    modifiedBy: 'System SLA',
    status: 'SLA breach',
    targetDomain: 'orders',
    targetScreen: 'fulfillment',
    summary: 'Express air upgrade or batch priority release required before 14:00 CST carrier scan.',
  },
  {
    id: 'ATN-102',
    code: 'STU-409',
    title: 'Preflight block: Back print 144 DPI (<300 DPI minimum)',
    category: 'Catalog & Preflight',
    severity: 'Critical',
    entity: 'Orion Apparel · HDY-204',
    owner: 'M. Lin',
    impactAmount: 1420,
    slaRemaining: '3h 15m',
    createdOn: '11/01/2026 09:02',
    modifiedBy: 'Preflight Gate',
    status: 'Critical',
    targetDomain: 'catalog',
    targetScreen: 'studio',
    summary: 'Konva Studio preflight blocked vector rasterization; high-res SVG uploaded in customer thread.',
  },
  {
    id: 'ATN-103',
    code: 'INV-0998',
    title: 'Invoice #0998 past due (17 days) — shipment hold active',
    category: 'Finance & Bills',
    severity: 'SLA warning',
    entity: 'Maple Supply',
    owner: 'SA',
    impactAmount: 890,
    slaRemaining: 'Overdue 17d',
    createdOn: '10/15/2026 11:20',
    modifiedBy: 'AR Automation',
    status: 'SLA warning',
    targetDomain: 'finance',
    targetScreen: 'invoices',
    summary: 'Customer placed reorder #88390 while prior Net 30 invoice #0998 ($890.00) remains unpaid.',
  },
  {
    id: 'ATN-104',
    code: 'BILL-9211',
    title: 'Supplier bill PF-9211 awaiting COGS account verification',
    category: 'Finance & Bills',
    severity: 'For review',
    entity: 'Printful',
    owner: 'K. Patel',
    impactAmount: 2880,
    slaRemaining: 'Due Nov 10',
    createdOn: '10/31/2026 16:45',
    modifiedBy: 'Receipts OCR',
    status: 'For review',
    targetDomain: 'finance',
    targetScreen: 'bills',
    summary: 'OCR matched 112 PO lines; $42.00 embroidery digitizing fee needs mapping to 5120 Setup COGS.',
  },
  {
    id: 'ATN-105',
    code: 'RMA-319',
    title: 'Damaged framed poster transit claim (3 units cracked acrylic)',
    category: 'Support & RMA',
    severity: 'Critical',
    entity: 'Blue Ridge Co. · ART-118',
    owner: 'R. Gomez',
    impactAmount: 468,
    slaRemaining: '1h 50m',
    createdOn: '11/01/2026 07:50',
    modifiedBy: 'SupportBot',
    status: 'Critical',
    targetDomain: 'orders',
    targetScreen: 'returns',
    summary: 'Photos verified; auto-reprint with Gelato + vendor credit claim ready for one-click approval.',
  },
  {
    id: 'ATN-106',
    code: 'BNK-7710',
    title: 'Stripe payout split variance ($184.50 chargeback reserve)',
    category: 'Finance & Bills',
    severity: 'For review',
    entity: 'Stripe Clearing •1050',
    owner: 'SA',
    impactAmount: 14820,
    slaRemaining: 'Due Nov 3',
    createdOn: '11/01/2026 06:00',
    modifiedBy: 'Stripe Webhook',
    status: 'For review',
    targetDomain: 'finance',
    targetScreen: 'bank',
    summary: 'Settlement batch #STL-1101 holds $184.50 dispute reserve; map to 1180 Processor Reserve.',
  },
  {
    id: 'ATN-107',
    code: 'STU-412',
    title: 'Artwork extends 0.35" outside safe bleed area on 11oz Mug',
    category: 'Catalog & Preflight',
    severity: 'SLA warning',
    entity: 'Kitsune Ink · MUG-003',
    owner: 'M. Lin',
    impactAmount: 640,
    slaRemaining: '5h 10m',
    createdOn: '11/01/2026 10:12',
    modifiedBy: 'Preflight Gate',
    status: 'SLA warning',
    targetDomain: 'catalog',
    targetScreen: 'studio',
    summary: 'Auto-fit to safe print guide available in Konva Studio inspector.',
  },
  {
    id: 'ATN-108',
    code: 'ORD-88375',
    title: 'Gelato EU hub stock delay on 24×36 Oak Frame blank',
    category: 'Orders & SLA',
    severity: 'SLA warning',
    entity: 'Northwind Labs · 12 units',
    owner: 'R. Gomez',
    impactAmount: 1680,
    slaRemaining: '6h 00m',
    createdOn: '10/31/2026 19:30',
    modifiedBy: 'Supplier Webhook',
    status: 'SLA warning',
    targetDomain: 'orders',
    targetScreen: 'orders',
    summary: 'Fallback supplier route available via Printful Charlotte hub (+ $1.10/unit COGS, saves 4 days).',
  },
];

export const INITIAL_CUSTOMER_QUEUE: CustomerQueueItem[] = [
  {
    id: 'CUS-Q1',
    name: 'Acme Corp',
    email: 'ap@acme.com',
    queueBucket: 'VIP / High LTV',
    orders: 12,
    ltv: 18240,
    balance: 1240,
    lastOrder: '11/01/2026',
    marketingConsent: 'Yes',
    source: 'B2B Invoice',
    reason: 'Requested Q4 custom volume tier pricing + Net 45 credit limit increase',
    owner: 'SA',
    createdOn: '11/01/2026',
    status: 'VIP',
  },
  {
    id: 'CUS-Q2',
    name: 'Maple Supply',
    email: 'ar@maplesupply.io',
    queueBucket: 'Overdue balance',
    orders: 2,
    ltv: 1780,
    balance: 890,
    lastOrder: '10/15/2026',
    marketingConsent: 'No',
    source: 'B2B Invoice',
    reason: 'Invoice #0998 ($890) 17 days overdue — send payment link & release order hold',
    owner: 'SA',
    createdOn: '10/29/2026',
    status: 'Overdue',
  },
  {
    id: 'CUS-Q3',
    name: 'Blue Ridge Co.',
    email: 'billing@blueridge.co',
    queueBucket: 'RMA & Refunds',
    orders: 5,
    ltv: 9810,
    balance: 0,
    lastOrder: '10/28/2026',
    marketingConsent: 'Yes',
    source: 'Storefront',
    reason: 'RMA-319 replacement shipment approval for 3 damaged framed posters ($468)',
    owner: 'R. Gomez',
    createdOn: '11/01/2026',
    status: 'RMA open',
  },
  {
    id: 'CUS-Q4',
    name: 'Northwind Labs',
    email: 'ops@northwindlabs.dev',
    queueBucket: 'Needs follow-up',
    orders: 8,
    ltv: 14620,
    balance: 2100,
    lastOrder: '10/02/2026',
    marketingConsent: 'Yes',
    source: 'B2B Invoice',
    reason: 'Invoice #0996 due today ($2,100) + confirm oak frame fallback supplier routing',
    owner: 'K. Patel',
    createdOn: '11/01/2026',
    status: 'Needs follow-up',
  },
  {
    id: 'CUS-Q5',
    name: 'Orion Apparel',
    email: 'studio@orionapparel.co',
    queueBucket: 'Needs follow-up',
    orders: 9,
    ltv: 11480,
    balance: 0,
    lastOrder: '10/30/2026',
    marketingConsent: 'Yes',
    source: 'Storefront',
    reason: 'Uploaded replacement 300 DPI vector artwork for hoodie preflight hold',
    owner: 'M. Lin',
    createdOn: '11/01/2026',
    status: 'Needs follow-up',
  },
  {
    id: 'CUS-Q6',
    name: 'Harbor & Pine Goods',
    email: 'buying@harborpine.com',
    queueBucket: 'At risk',
    orders: 6,
    ltv: 7940,
    balance: 0,
    lastOrder: '07/18/2026',
    marketingConsent: 'Yes',
    source: 'Marketplace',
    reason: '106 days since last reorder (historic 35-day cadence) — trigger VIP winback offer',
    owner: 'M. Lin',
    createdOn: '10/28/2026',
    status: 'At risk',
  },
  {
    id: 'CUS-Q7',
    name: 'Summit Athletics Club',
    email: 'treasurer@summitclub.org',
    queueBucket: 'Overdue balance',
    orders: 4,
    ltv: 6320,
    balance: 1650,
    lastOrder: '10/04/2026',
    marketingConsent: 'Yes',
    source: 'B2B Invoice',
    reason: 'ACH debit returned (R01 insufficient funds) on Invoice #0995 — reissue payment link',
    owner: 'SA',
    createdOn: '10/30/2026',
    status: 'Overdue',
  },
  {
    id: 'CUS-Q8',
    name: 'Velvet Echo Media',
    email: 'merch@velvetecho.fm',
    queueBucket: 'RMA & Refunds',
    orders: 11,
    ltv: 15890,
    balance: 0,
    lastOrder: '10/29/2026',
    marketingConsent: 'Yes',
    source: 'Social Shop',
    reason: 'Size exchange + credit memo ($168) on 7 podcast tour tees',
    owner: 'R. Gomez',
    createdOn: '10/31/2026',
    status: 'RMA open',
  },
];

export const INITIAL_SELLER_QUEUE: SellerQueueItem[] = [
  {
    id: 'SLR-Q1',
    seller: 'Hyperion Poster Lab',
    contactEmail: 'payouts@hyperionlab.art',
    role: 'Marketplace Seller',
    stage: 'Payouts & 1099',
    gmvOrSpend: 19240,
    takeOrMarginPct: 15.0,
    openItems: 'Missing signed W-9 ($3,410 payout queued)',
    slaPct: 98.9,
    w9Status: 'Pending W-9',
    payoutHold: 3410,
    updatedOn: '11/01/2026',
    status: 'Pending W-9',
  },
  {
    id: 'SLR-Q2',
    seller: 'Vesper Streetwear Co.',
    contactEmail: 'founders@vesperstreet.co',
    role: 'Marketplace Seller',
    stage: 'Catalog review',
    gmvOrSpend: 9090,
    takeOrMarginPct: 18.0,
    openItems: '14 new graphic hoodie listings awaiting IP & DPI check',
    slaPct: 97.4,
    w9Status: 'Verified',
    payoutHold: 1280,
    updatedOn: '11/01/2026',
    status: 'Catalog review',
  },
  {
    id: 'SLR-Q3',
    seller: 'Gelato',
    contactEmail: 'enterprise-sla@gelato.com',
    role: 'POD Supplier',
    stage: 'SLA & Quality',
    gmvOrSpend: 18400,
    takeOrMarginPct: 54.9,
    openItems: 'Oak frame stockout in EU hub + 3 transit damage claims',
    slaPct: 98.4,
    w9Status: 'Exempt (Corp)',
    payoutHold: 0,
    updatedOn: '11/01/2026',
    status: 'SLA warning',
  },
  {
    id: 'SLR-Q4',
    seller: 'Solstice Type Foundry',
    contactEmail: 'hello@solsticetype.io',
    role: 'Onboarding & KYB' === 'Onboarding & KYB' ? 'Design Partner' : 'Design Partner',
    stage: 'Onboarding & KYB',
    gmvOrSpend: 0,
    takeOrMarginPct: 20.0,
    openItems: 'Stripe Connect KYB identity verified · ready for storefront activation',
    slaPct: 100.0,
    w9Status: 'Verified',
    payoutHold: 0,
    updatedOn: '11/01/2026',
    status: 'Pending KYB',
  },
  {
    id: 'SLR-Q5',
    seller: 'Dahlia Chen Illustration',
    contactEmail: 'dahlia@dahliachen.studio',
    role: '1099 Contractor',
    stage: 'Payouts & 1099',
    gmvOrSpend: 6850,
    takeOrMarginPct: 100.0,
    openItems: 'Crossed $600 1099-NEC threshold · W-9 invite sent Oct 24',
    slaPct: 100.0,
    w9Status: 'Pending W-9',
    payoutHold: 950,
    updatedOn: '10/30/2026',
    status: 'Pending W-9',
  },
  {
    id: 'SLR-Q6',
    seller: 'Nomad Ceramic Works',
    contactEmail: 'ops@nomadceramics.co',
    role: 'POD Supplier',
    stage: 'Onboarding & KYB',
    gmvOrSpend: 0,
    takeOrMarginPct: 58.0,
    openItems: 'Sample pack passed QA · webhook API sandbox ready to promote',
    slaPct: 99.2,
    w9Status: 'Verified',
    payoutHold: 0,
    updatedOn: '10/31/2026',
    status: 'Pending KYB',
  },
  {
    id: 'SLR-Q7',
    seller: 'Kitsune Ink & Apparel',
    contactEmail: 'ops@kitsuneink.jp',
    role: 'Marketplace Seller',
    stage: 'Catalog review',
    gmvOrSpend: 33820,
    takeOrMarginPct: 20.0,
    openItems: '6 seasonal mug wraps flagged for bleed margin review',
    slaPct: 99.4,
    w9Status: 'Verified',
    payoutHold: 0,
    updatedOn: '11/01/2026',
    status: 'Catalog review',
  },
];
