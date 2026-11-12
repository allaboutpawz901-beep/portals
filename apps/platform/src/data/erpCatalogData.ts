/**
 * erpCatalogData — every piece of information extracted 1:1 from
 * upload/product cards.html and upload/erp product page.html.
 * The designs are the source of truth; this data lives here and
 * feeds the exact screens. Nothing is invented, nothing dropped.
 */

/* ═══════════════ product cards.html — Product Catalog ═══════════════ */

export const CATALOG_TOTAL_COUNT = 142;

export type SupplierBadgeKind = 'printify' | 'printful' | 'both';

export interface CatalogCardData {
  name: string;
  sku: string;
  bestPrice: string;
  estShipping: string;
  variantCount: number;
  badge: SupplierBadgeKind;
  badgeLabel: string;
  imageUrl: string;
  imageAlt: string;
}

export const CATALOG_CARDS: CatalogCardData[] = [
  {
    name: 'Classic Unisex Heavyweight Tee',
    sku: 'BC-3001-UNI',
    bestPrice: '$8.50',
    estShipping: '2.5 - 2.8 days',
    variantCount: 14,
    badge: 'both',
    badgeLabel: '2 Suppliers',
    imageUrl:
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=400&h=300',
    imageAlt: 'Classic Tee',
  },
  {
    name: 'Baby Long-Sleeve Organic Bodysuit',
    sku: 'BB-ORG-LS',
    bestPrice: '$12.25',
    estShipping: '3.2 days',
    variantCount: 8,
    badge: 'printful',
    badgeLabel: 'Printful',
    imageUrl:
      'https://images.unsplash.com/photo-1522771930-78848d9293e8?auto=format&fit=crop&q=80&w=400&h=300',
    imageAlt: 'Baby Bodysuit',
  },
  {
    name: 'Atlas Soft Shell Jacket',
    sku: 'ATLAS-SS',
    bestPrice: '$34.50',
    estShipping: '4.5 days',
    variantCount: 4,
    badge: 'printify',
    badgeLabel: 'Printify',
    imageUrl:
      'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=400&h=300',
    imageAlt: 'Camo Jacket',
  },
  {
    name: 'Canvas Tote Bag',
    sku: 'TOTE-CNV',
    bestPrice: '$6.75',
    estShipping: '2.1 - 3.0 days',
    variantCount: 6,
    badge: 'both',
    badgeLabel: '2 Suppliers',
    imageUrl:
      'https://images.unsplash.com/photo-1597484662317-9bd7bdda2907?auto=format&fit=crop&q=80&w=400&h=300',
    imageAlt: 'Tote Bag',
  },
];

/* ═══════════════ erp product page.html — Product Details ═══════════════ */

export const PRODUCT_MAIN_IMAGE =
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=500&h=500';

export const PRODUCT_THUMBS = [
  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=100&h=100',
  'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=100&h=100',
  'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&q=80&w=100&h=100',
  'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&q=80&w=100&h=100',
];

export const PRODUCT = {
  title: 'Classic Unisex Heavyweight Tee',
  subtitle: 'Bella+Canvas 3001 • Multi-Supplier Product',
  tags: ['Unisex', '100% Cotton', 'DTG Print'],
  description:
    "The classic heavyweight tee. Made from 100% ring-spun cotton, this t-shirt feels soft and light, with just the right amount of stretch. It's comfortable and the unisex cut is flattering for both men and women. Double-needle stitched sleeves and bottom hem.",
  previousDesigns: ['V1', 'V2', 'V3'],
  printAreas: [
    { label: 'Front', size: '12" x 16"' },
    { label: 'Back', size: '12" x 16"' },
    { label: 'Left Sleeve', size: '3" x 3"' },
  ],
  offers: [
    { badge: 'printify' as SupplierBadgeKind, badgeLabel: 'Printify', label: 'Printify Choice', price: '$8.50' },
    { badge: 'printful' as SupplierBadgeKind, badgeLabel: 'Printful', label: 'Printful US', price: '$9.25' },
  ],
  summary: {
    baseCost: '$8.50',
    selectedVariant: 'White / M',
    printArea: 'Front (12"x16")',
    activeSupplier: 'Printify Choice',
    retailPrice: '24.99',
    profit: '$16.49',
  },
  baseCostNumber: 8.5,
  fulfillmentNetwork: [
    { label: 'Best quality', value: 'Printful (Top rated)' },
    { label: 'Lowest price', value: 'Printify ($8.50)' },
    { label: 'Most shipping options', value: 'Printify (3 Locations)' },
    { label: 'Fastest delivery', value: 'Printful (2.5 days)' },
  ],
};

/* ── Tab 1: Product Details ── */
export const PRODUCT_DETAILS = {
  aboutBullets: [
    'Material: 100% ring-spun cotton',
    'Fabric weight: 6.1 oz/yd² (206.8 g/m²)',
    'Relaxed fit, unisex sizing',
    'Double-needle stitched sleeves and bottom hem',
    'Tear-away label for custom rebranding',
  ],
  aboutParagraph:
    'This classic unisex jersey short sleeve tee fits like a well-loved favorite. Soft cotton and quality print make users fall in love with it over and over again. These t-shirts have-ribbed knit collars to bolster shaping. The shoulders are tapered for a better fit over time.',
  keyFeatures: [
    {
      icon: 'eco',
      title: '100% Cotton',
      text: 'Made with sustainably sourced USA grown cotton.',
    },
    {
      icon: 'public',
      title: 'Ethically Sourced',
      text: 'Manufactured in facilities verified by the Fair Labor Association.',
    },
    {
      icon: 'dry_cleaning',
      title: 'Durable Print',
      text: "DTG printing ensures the design won't crack or peel after washing.",
    },
    {
      icon: 'straighten',
      title: 'Retail Fit',
      text: 'Modern classic fit, seamless body, and high stitch density.',
    },
  ],
  careIcons: [
    { icon: 'local_laundry_service', title: 'Machine wash cold' },
    { icon: 'no_drinks', title: 'Do not bleach' },
    { icon: 'dry', title: 'Tumble dry low' },
    { icon: 'iron', title: 'Iron low heat' },
    { icon: 'dangerous', title: 'Do not dry clean' },
  ],
  careText:
    'Machine wash: cold (max 30C or 90F); Non-chlorine: bleach as needed; Do not tumble dry; Do not iron; Do not dryclean.',
  sizeGuide: {
    headers: ['Size', 'Chest (in)', 'Length (in)'],
    rows: [
      { size: 'S', chest: '34-37', length: '28', shaded: false },
      { size: 'M', chest: '38-41', length: '29', shaded: true },
      { size: 'L', chest: '42-45', length: '30', shaded: false },
      { size: 'XL', chest: '46-49', length: '31', shaded: true },
      { size: '2XL', chest: '50-53', length: '32', shaded: false },
    ],
    note: 'Measurements are provided by suppliers. Product measurements may vary by up to 2" (5 cm).',
  },
};

/* ── Tab 2: Variants & Inventory ── */
export const PRODUCT_VARIANTS = {
  activeVariantsLabel: 'Showing 14 active variants',
  colorsLabel: 'Colors (5 active)',
  colors: [
    { name: 'White', hex: '#ffffff', bordered: true },
    { name: 'Black', hex: '#1a1c1e', bordered: false },
    { name: 'Military Green', hex: '#5a6355', bordered: false },
    { name: 'Maroon', hex: '#6b1e28', bordered: false },
    { name: 'Royal Blue', hex: '#0077c5', bordered: false },
  ],
  rows: [
    {
      color: '#ffffff',
      bordered: true,
      variant: 'White / S',
      sku: 'BC-3001-WHT-S',
      supplier: 'Printify Choice',
      supplierBadge: 'printify' as SupplierBadgeKind,
      cost: '$8.50',
      retail: '$24.99',
    },
    {
      color: '#ffffff',
      bordered: true,
      variant: 'White / M',
      sku: 'BC-3001-WHT-M',
      supplier: 'Printify Choice',
      supplierBadge: 'printify' as SupplierBadgeKind,
      cost: '$8.50',
      retail: '$24.99',
    },
    {
      color: '#1a1c1e',
      bordered: true,
      variant: 'Black / L',
      sku: 'BC-3001-BLK-L',
      supplier: 'Printful US',
      supplierBadge: 'printful' as SupplierBadgeKind,
      cost: '$9.25',
      retail: '$24.99',
    },
    {
      color: '#5a6355',
      bordered: true,
      variant: 'Military Green / XL',
      sku: 'BC-3001-GRN-XL',
      supplier: 'Printful US',
      supplierBadge: 'printful' as SupplierBadgeKind,
      cost: '$9.25',
      retail: '$24.99',
    },
  ],
  totalActiveVariants: '14',
};

/* ── Tab 3: Supplier Costs ── */
export const PRODUCT_SUPPLIER_COSTS = {
  heading: 'Supplier Cost Breakdown',
  subheading:
    'Compare base costs, shipping, and production times across suppliers for this product.',
  rows: [
    {
      badge: 'printify' as SupplierBadgeKind,
      badgeLabel: 'Printify',
      label: 'Printify Choice',
      statusIcon: 'verified',
      statusText: 'Trusted Partner',
      statusPrimary: true,
      baseCost: '$8.50',
      shipping: '$4.99',
      production: '2.8 Days',
      routing: ['Primary', 'Backup'],
      shaded: false,
    },
    {
      badge: 'printful' as SupplierBadgeKind,
      badgeLabel: 'Printful',
      label: 'Printful US',
      statusIcon: 'check_circle',
      statusText: 'Connected',
      statusPrimary: false,
      baseCost: '$9.25',
      shipping: '$5.50',
      production: '2.5 Days',
      routing: ['Backup', 'Primary'],
      shaded: true,
    },
  ],
  smartRoutingNote:
    'Smart Routing Active: Orders for White variants will route to Printify for lower costs. Orders for Black and Green variants will route to Printful for faster production times and higher quality control.',
};

/* ── Tab 4: Fulfillment Routing ── */
export const PRODUCT_FULFILLMENT = {
  heading: 'Fulfillment Routing',
  subheading: 'Manage where your orders are routed and printed.',
  providers: [
    {
      initials: 'PC',
      name: 'Printify Choice',
      note: 'Primary Routing • Top rated quality',
      production: '2.8 days',
      locations: 'US, EU',
      dimmed: false,
    },
    {
      initials: 'PF',
      name: 'Printful US',
      note: 'Backup Routing • Fastest shipping',
      production: '2.5 days',
      locations: 'US',
      dimmed: true,
    },
  ],
};

/* ── Tab 5: Mockups ── */
export const PRODUCT_MOCKUPS = {
  contextLine: { pre: 'Showing mockups for ', product: 'Classic Unisex Heavyweight Tee' },
  colorOptions: ['All Colors', 'White', 'Black'],
  cards: [
    {
      tag: 'PRINTIFY',
      imageUrl:
        'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80&w=400&h=500',
      title: 'White Tee - Front Mockup',
      subtitle: 'Bella+Canvas 3001',
    },
    {
      tag: 'PRINTFUL',
      imageUrl:
        'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80&w=400&h=500',
      title: 'Black Tee - Lifestyle',
      subtitle: 'Bella+Canvas 3001',
    },
    {
      tag: 'PRINTIFY',
      imageUrl:
        'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&q=80&w=400&h=500',
      title: 'White Tee - Back Mockup',
      subtitle: 'Bella+Canvas 3001',
    },
    {
      tag: 'PRINTFUL',
      imageUrl:
        'https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&q=80&w=400&h=500',
      title: 'Green Tee - Flat Lay',
      subtitle: 'Bella+Canvas 3001',
    },
  ],
};

/* ── Tab 6: Reviews ── */
export const PRODUCT_REVIEWS = {
  score: '4.5',
  starIcons: ['star', 'star', 'star', 'star', 'star_half'],
  basedOn: 'Based on 24 reviews',
  ratingBars: [
    { label: 'Printing', width: '90%', score: '4.7' },
    { label: 'Material', width: '80%', score: '4.4' },
    { label: 'Fit', width: '85%', score: '4.5' },
    { label: 'Shipping', width: '75%', score: '4.2' },
  ],
  filters: ['All', '5 Star', '4 Star'],
  sortOptions: ['Most Recent'],
  reviews: [
    {
      stars: ['star', 'star', 'star', 'star', 'star'],
      title: 'Excellent Quality',
      verified: true,
      date: 'Nov 12, 2025',
      text: 'I ordered a sample of this tee for my brand. The print quality is fantastic, and the fabric is super soft. Will definitely be ordering more.',
      author: 'Sarah A.',
      meta: 'White / M (Fulfilled by Printify)',
    },
    {
      stars: ['star', 'star', 'star', 'star'],
      title: 'Runs a bit small',
      verified: false,
      date: 'Oct 28, 2025',
      text: 'Great print quality, but definitely size up. The medium fits like a small. Customer service was quick to respond though.',
      author: 'John D.',
      meta: 'Black / M (Fulfilled by Printful)',
    },
  ],
};
