/**
 * Design Studio canvas state — shared between the New design canvas screen,
 * the global SideRail (tool clicks → StudioDrawer), and catalog list rows
 * (thumbnail click → product page modal → Start designing → loads canvas).
 *
 * Client-only Zustand store. Imported by 'use client' components.
 */
import { create } from 'zustand';
import {
  createDesign,
  getBlank,
  getDesign,
  listBlanks,
  listCategories,
  type BlankCard,
  type BlankDetail,
  type CategoryNavNode,
  type PlacementSpec,
} from './podApi';

// ── Blanks (supplier mockups) ──
export interface Blank {
  key: string;
  name: string;
  brand: string;
  price: number;
  /** Inline SVG data URI — keeps the mockup self-contained, no asset fetch. */
  img: string;
  /** Product family — drives which print-area pills render on the canvas. */
  family: 'tops' | 'books' | 'drinkware';
}

function svgTee(fill: string, stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f4f3f7"/><path d="M60 40 L40 80 L40 160 L160 160 L160 80 L140 40 Z" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}"/></svg>`;
}
function svgHoodie(fill: string, stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f4f3f7"/><path d="M50 40 L30 100 L40 160 L160 160 L170 100 L150 40 Z" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}"/></svg>`;
}
function svgMug(fill: string, stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f4f3f7"/><rect x="60" y="50" width="60" height="100" rx="10" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}"/></svg>`;
}
function svgBook(fill: string, stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f4f3f7"/><path d="M40 30 L40 170 L100 170 L100 30 Z" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}"/><path d="M100 30 L100 170 L160 170 L160 30 Z" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" opacity="0.85"/></svg>`;
}

export const BLANKS: Record<string, Blank> = {
  tee: { key: 'tee', name: 'Unisex Heavy Blend Crewneck', brand: 'Gildan 18000', price: 17.87, img: svgTee('#ffffff'), family: 'tops' },
  hoodie: { key: 'hoodie', name: 'Pullover Hoodie', brand: 'Gildan 18500', price: 28.5, img: svgHoodie('#ffffff'), family: 'tops' },
  mug: { key: 'mug', name: 'Ceramic Mug 11oz', brand: 'Generic', price: 6.5, img: svgMug('#ffffff'), family: 'drinkware' },
  tumbler: { key: 'tumbler', name: 'Stainless Tumbler 20oz', brand: 'Generic', price: 12.95, img: svgMug('#c0c0c0'), family: 'drinkware' },
  book: { key: 'book', name: 'Perfect-Bound Paperback', brand: 'BookBaby', price: 4.5, img: svgBook('#ffffff'), family: 'books' },
  shorts: { key: 'shorts', name: 'Unisex B-Core Pocketed 7" Shorts', brand: 'Badger 412700', price: 22.27, img: svgTee('#ffffff'), family: 'tops' },
};

// ── Print-area pills per product family ──
// Tops: Front side / Back side / Sleeve left / Sleeve right / Neck label inner
// Books: Front matter / Back matter / Binder (spine)
// Drinkware (mugs/tumblers): row list — Wrap / Both sides / Handle only
export interface PrintArea {
  id: string;
  label: string;
}
export const PRINT_AREAS: Record<Blank['family'], PrintArea[]> = {
  tops: [
    { id: 'front', label: 'Front side' },
    { id: 'back', label: 'Back side' },
    { id: 'sleeve-l', label: 'Sleeve left' },
    { id: 'sleeve-r', label: 'Sleeve right' },
    { id: 'neck', label: 'Neck label inner' },
  ],
  books: [
    { id: 'front-matter', label: 'Front matter' },
    { id: 'back-matter', label: 'Back matter' },
    { id: 'binder', label: 'Binder' },
  ],
  drinkware: [
    { id: 'wrap', label: 'Wrap' },
    { id: 'both-sides', label: 'Both sides' },
    { id: 'handle', label: 'Handle only' },
  ],
};

export interface BlankColor {
  name: string;
  hex: string;
  sku?: string;
}

export const SUPPLIER_COLORS: BlankColor[] = [
  { name: 'White', hex: '#ffffff', sku: '18000-WHT' },
  { name: 'Ash', hex: '#e5e5e5', sku: '18000-ASH' },
  { name: 'Sport Grey', hex: '#b0b0b0', sku: '18000-SPG' },
  { name: 'Black', hex: '#000000', sku: '18000-BLK' },
  { name: 'Navy', hex: '#1d2a44', sku: '18000-NVY' },
  { name: 'Maroon', hex: '#6b1e28', sku: '18000-MRN' },
  { name: 'Forest Green', hex: '#1d4422', sku: '18000-FGR' },
  { name: 'Royal', hex: '#1d3e8a', sku: '18000-RYL' },
];

// ── Studio session (unified contract) ──
// One Studio screen, one session object. Every entry point fills in fields
// on that session and opens the same screen. The session has one canvas,
// three views (Design, Product page, Preview), and one drawer open at a
// time. The sidebar is only a launcher: its Studio children call
// openStudio with a view or a drawer.
export type StudioEntry = 'topnav' | 'wizard' | 'catalog' | 'design-first';
export type StudioView = 'design' | 'product' | 'preview';
export type DrawerId =
  | 'upload'
  | 'ai'
  | 'text'
  | 'images'
  | 'graphics'
  | 'colors'
  | 'library'
  | 'templates'
  | 'inspiration';

export interface StudioLaunch {
  entry: StudioEntry;
  blankIds?: string[]; // one or many; many = Design Queue
  designId?: string; // reopen an existing design
  seedAsset?: { assetId: string }; // design-first: artwork waiting for a product
  origin?: {
    wizard?: { kind: 'best' | 'fast' | 'dept'; dept?: string; rank?: number };
    catalog?: { dept: string };
  };
  view?: StudioView;
  drawer?: DrawerId;
}

export type BlockerCode =
  | 'not_render_ready'
  | 'no_offer'
  | 'dpi_low'
  | 'outside_print_area'
  | 'missing_font'
  | 'no_mockup'
  | 'discontinued';

export interface Blocker {
  code: BlockerCode;
  message: string;
  fix?: 'scale_to_fit' | 'upscale' | 'pick_font' | 'generate_mockup';
}

export interface StudioTarget {
  blankId: string;
  size: string; // preview size, e.g. 'L'
  status: 'loaded' | 'placed' | 'preview_ready' | 'blocked';
  blockers: Blocker[];
}

/** PlacementSpec lives in podApi.ts (version 1, layers in inches) — the one definition, per the render contract. Re-exported here for session consumers. */
export type { PlacementSpec } from './podApi';

export interface PreviewPrefs {
  colorMode: 'realistic_cmyk' | 'bright_rgb';
  background: { type: 'color' | 'image'; value: string };
  scaling: 'fixed_inches' | 'proportional_to_size';
}

// ── Catalog products (for thumbnails + product page modal) ──
export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  blankKey: string;
  department: string;
  eligibility: string;
  status: string;
  bestseller?: boolean;
  fabric?: string;
  fit?: string;
  features?: string[];
  /* Live-card carry-through (set by blankCardToCatalogProduct): lets the
   * product page render the REAL product the instant View is clicked —
   * image, price, SKU, supplier — while GET /blanks/:id enriches. */
  img?: string;
  price?: number | null;
  sku?: string | null;
  variantCount?: number;
  supplier?: string;
  supplierSlug?: string;
  supplierCount?: number;
  categoryPath?: string;
}

export const CATALOG_PRODUCTS: CatalogProduct[] = [
  { id: 'p1', name: 'Heavyweight Tee', brand: 'Gildan 18000', blankKey: 'tee', department: 'Men', eligibility: 'Front / back / sleeves', status: 'Eligible', bestseller: true, fabric: '100% Cotton', fit: 'Classic', features: ['Heavyweight 5.3 oz fabric', 'Double-needle stitching', 'Taped shoulder-to-shoulder', 'Tear-away label'] },
  { id: 'p2', name: 'Performance Polo', brand: 'Port Authority L518', blankKey: 'tee', department: 'Men', eligibility: 'Left chest', status: 'Eligible', fabric: '100% Polyester', fit: 'Athletic', features: ['Moisture-wicking', 'UV protection UPF 40', 'Flat knit collar', '3-button placket'] },
  { id: 'p3', name: 'Fleece Crewneck', brand: 'Independent 2050', blankKey: 'hoodie', department: 'Men', eligibility: 'Front / back', status: 'Eligible', fabric: '80/20 cotton/poly', fit: 'Relaxed', features: ['Air jet yarn for soft feel', 'Ribbed cuffs and waistband', 'Double-needle stitching'] },
  { id: 'p4', name: 'Camp Collar Shirt', brand: 'Cotton & Cloud 4001', blankKey: 'tee', department: 'Men', eligibility: 'All-over print', status: 'Review', fabric: '100% Rayon', fit: 'Relaxed', features: ['All-over print capability', 'Camp collar', 'Loop button closure'] },
  { id: 'p5', name: 'Vintage Wash Tee', brand: 'Comfort Colors 1717', blankKey: 'tee', department: 'Men', eligibility: 'Front / back', status: 'Eligible', fabric: '100% Ring-spun cotton', fit: 'Relaxed', features: ['Garment-dyed vintage wash', 'Pre-shrunk', 'Relaxed fit'] },
  { id: 'p6', name: 'Utility Jacket', brand: 'Rabbit Skins 3350', blankKey: 'tee', department: 'Men', eligibility: 'Embroidery only', status: 'Discontinued', fabric: '100% Cotton canvas', fit: 'Workwear', features: ['Heavy-duty canvas', 'Multiple pockets', 'Embroidery-ready'] },
  { id: 'p7', name: 'Relaxed Boyfriend Tee', brand: 'Bella+Canvas 3001CVC', blankKey: 'tee', department: 'Women', eligibility: 'Front / back', status: 'Eligible', bestseller: true, fabric: '52/48 cotton/poly', fit: 'Relaxed', features: ['Side-seamed', 'Relaxed boyfriend fit', 'Pre-shrunk'] },
  { id: 'p8', name: 'Cropped Crewneck', brand: 'Comfort Colors 6016', blankKey: 'hoodie', department: 'Women', eligibility: 'Front', status: 'Eligible', fabric: '80/20 cotton/poly', fit: 'Cropped', features: ['Cropped silhouette', 'Ribbed hem', 'Garment-dyed'] },
  { id: 'p9', name: '11oz Mug', brand: 'Orca Coating 6111', blankKey: 'mug', department: 'Home Living', eligibility: 'Wrap / both sides', status: 'Eligible', bestseller: true, fabric: 'Ceramic', fit: '11oz', features: ['Dishwasher safe', 'Orca coating', 'Full wrap print'] },
  { id: 'p10', name: 'Stainless Tumbler 20oz', brand: 'Generic', blankKey: 'tumbler', department: 'Home Living', eligibility: 'Wrap', status: 'Eligible', fabric: '18/8 Stainless', fit: '20oz', features: ['Double-wall vacuum', 'Keeps cold 24h', 'Includes lid + straw'] },
  { id: 'p11', name: 'Perfect-Bound Paperback', brand: 'BookBaby', blankKey: 'book', department: 'Home Living', eligibility: 'Cover / spine', status: 'Eligible', fabric: 'Paper', fit: 'Standard', features: ['Perfect binding', 'Matte cover finish', '60lb cream paper'] },
  { id: 'p12', name: 'Youth Tee', brand: 'Gildan 18000B', blankKey: 'tee', department: 'Children', eligibility: 'Front / back', status: 'Eligible', fabric: '100% Cotton', fit: 'Youth', features: ['Heavyweight fabric', 'Taped neck', 'Double-needle hem'] },
];

// ── Supplier fulfillment data (productguide.html) ──
export interface SupplierData {
  key: string;
  name: string;
  badge: string;
  price: number;
  premiumPrice: number;
  shipping: number;
  delivery: string;
  origin: string;
  colors: string[];
  sizes: string[];
  printAreas: string[];
}

export const SUPPLIERS: Record<string, SupplierData> = {
  'printify-choice': {
    key: 'printify-choice', name: 'Printify Choice', badge: 'Trusted network of quality providers',
    price: 22.27, premiumPrice: 16.36, shipping: 4.49, delivery: '2.8 days',
    origin: 'United States (Network)',
    colors: ['#ffffff', '#e5e5e5', '#b0b0b0', '#000000', '#6b1e28', '#1d4422', '#1d2a44', '#1d3e8a'],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
    printAreas: ['Front left leg', 'Front right leg'],
  },
  printful: {
    key: 'printful', name: 'Printful', badge: 'Fastest delivery',
    price: 24.5, premiumPrice: 18.0, shipping: 5.99, delivery: '1.5 days',
    origin: 'Charlotte, NC',
    colors: ['#ffffff', '#000000', '#1d2a44', '#6b1e28'],
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    printAreas: ['Front', 'Back'],
  },
  'printify-standard': {
    key: 'printify-standard', name: 'Printify Standard', badge: 'Lowest price',
    price: 20.0, premiumPrice: 15.0, shipping: 3.99, delivery: '4-6 days',
    origin: 'Global partners',
    colors: ['#ffffff', '#e5e5e5', '#b0b0b0', '#000000'],
    sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
    printAreas: ['Front left leg'],
  },
};

// ── Storefront navigation (hard-coded) ──
// The user's storefront tree, verbatim. NOT pulled from any API or DB —
// the dynamic /api/v1/categories fetch served the wrong tree (the legacy
// Printify catalog dump with Apparel/Wall Art/Drinkware as roots). This
// is the tree the storefront actually sells: Accessories, Home goods, Men,
// Women, Children, Collections — each with their subcategories and (where
// they exist) sub-subcategories. Every sidebar link and top-bar dropdown
// reads from this constant.
export interface NavChild {
  name: string;
  children?: NavChild[];
}
export const STOREFRONT_NAV: NavChild[] = [
  {
    name: 'Accessories',
    children: [
      {
        name: 'Bags',
        children: ['backpacks', 'Drawstring Bags', 'Duffle Bags', 'Fanny packs', 'Handbags', 'Tote Bags'].map((n) => ({ name: n })),
      },
      {
        name: 'Hats',
        children: ['5 Panel', 'Beanies', 'Bucket', 'Dad Hats', 'Mesh hat', 'Snap backs', 'Truckers', 'Visors'].map((n) => ({ name: n })),
      },
      { name: 'Trinkets', children: [{ name: 'Patches' }, { name: 'Pins' }] },
      { name: 'Sports Accessories' },
      {
        name: 'Tech Accessories',
        children: ['Earphone Cases', 'Laptop cases', 'Mouse Pads', 'Phone cases'].map((n) => ({ name: n })),
      },
    ],
  },
  {
    name: 'Home goods',
    children: [
      { name: 'Babies & kids Essentials' },
      {
        name: 'Drinkware Bottles & tumblers',
        children: ['Coasters', 'Glassware', 'Mugs', 'Tumblers', 'Water bottles'].map((n) => ({ name: n })),
      },
      { name: 'Flags & Signs' },
      {
        name: 'Home Decor',
        children: [
          { name: 'Bathroom' },
          { name: 'Candles' },
          { name: 'Kitchen accessories', children: [{ name: 'Tableware' }, { name: 'Aprons' }] },
        ],
      },
      {
        name: 'Pillows & Blankets',
        children: ['Bedding', 'Blankets', 'Pillow Covers', 'Pillows'].map((n) => ({ name: n })),
      },
      { name: 'Rugs & mats' },
      { name: 'Towels' },
      {
        name: 'Wall Art',
        children: ['Canvas Prints', 'Framed Posters', 'Metal Prints', 'New folder'].map((n) => ({ name: n })),
      },
      { name: 'Seasonal & Holiday decorations', children: [{ name: 'Ornaments' }] },
      {
        name: 'Stationary',
        children: ['Books', 'Greeting cards', 'Journals & Notebooks', 'Magnets & stickers', 'Postcards', 'Stickers'].map((n) => ({ name: n })),
      },
      { name: 'Pet products' },
    ],
  },
  {
    name: 'Men',
    children: [
      { name: 'Bottoms', children: ['Leggings', 'Pants', 'Shorts', 'sweatpants'].map((n) => ({ name: n })) },
      { name: 'Knitwear', children: [{ name: 'Hoodies' }, { name: 'Sweatshirt' }] },
      { name: 'Outerwear', children: [{ name: 'Jackets & Vests' }] },
      {
        name: 'Shirts',
        children: ['All Over Shirts', 'Crop Tops', 'Embroidered Shirts', 'Long sleeves', 'Polo shirts', 'T-Shirts', 'Tank tops'].map((n) => ({ name: n })),
      },
      { name: 'Shoes', children: [{ name: 'Flip Flops' }, { name: 'Shoes' }, { name: 'Socks' }] },
      { name: 'Sleepwear & Underwear', children: [{ name: 'Pajamas' }, { name: 'Underwear' }] },
      { name: 'Sportswear', children: [{ name: 'swimwear' }] },
      { name: 'Workwear' },
    ],
  },
  {
    name: 'Women',
    children: [
      { name: 'Bottoms', children: ['Leggings', 'Pants', 'shorts', 'Sweatpants & Joggers'].map((n) => ({ name: n })) },
      { name: 'Knitwear', children: [{ name: 'Hoodies' }, { name: 'Sweatshirt' }] },
      { name: 'Outerwear', children: [{ name: 'Jackets & Vests' }] },
      {
        name: 'Shirts',
        children: ['All Over Shirts', 'Crop Tops', 'Embroidered Shirts', 'Long sleeves', 'Polo shirts', 'T-Shirts', 'Tank tops'].map((n) => ({ name: n })),
      },
      { name: 'Shoes', children: [{ name: 'Flip Flops' }, { name: 'Shoes' }, { name: 'Socks' }] },
      { name: 'Skirts & Dresses', children: [{ name: 'Dresses' }, { name: 'Skirts' }] },
      { name: 'Sleepwear & Underwear' },
      { name: 'Sportswear', children: [{ name: 'Sports Bras' }, { name: 'Swimwear' }] },
      { name: 'Workwear' },
    ],
  },
  {
    name: 'Children',
    children: [
      { name: 'Baby clothing' },
      { name: 'Bottoms' },
      { name: 'Dresses' },
      { name: 'Knitwear', children: [{ name: 'Hoodies' }, { name: 'Sweatshirts' }] },
      {
        name: 'Shirts',
        children: ['All Over Shirts', 'Long sleeves', 'T-Shirts'].map((n) => ({ name: n })),
      },
      { name: 'Shoes', children: [{ name: 'Flip Flops' }, { name: 'Shoes' }, { name: 'Socks' }] },
      { name: 'Sportswear' },
      { name: 'Sweatshirt' },
      { name: 'Toys & games' },
    ],
  },
  {
    name: 'Collections',
    children: [
      { name: 'Sportswear' },
      { name: 'Streetwear' },
      { name: 'Beachwear' },
      { name: 'Gifts' },
      { name: 'Style Trends' },
      { name: 'Grow a fashion brand' },
      { name: 'Made in EU' },
      { name: 'Halloween' },
      { name: 'Back to school' },
      {
        name: 'Holiday Season',
        children: ['New Year', 'MLK', 'Memorial Day', 'Juneteenth', 'Fourth of July', 'Labor Day', 'Columbus Day', 'Veterans Day', 'Thanksgiving', 'Christmas', 'Easter', 'Hanukkah'].map((n) => ({ name: n })),
      },
      { name: 'Matching Sets' },
    ],
  },
];

// Flat Record<department, childName[]> for back-compat with the design
// canvas top bar and CreateWizard. The full nested tree lives in
// STOREFRONT_NAV above; this is just its first level flattened.
export const TOP_NAV: Record<string, string[]> = Object.fromEntries(
  STOREFRONT_NAV.map((d) => [d.name, (d.children ?? []).map((c) => c.name)]),
);

// ── Supplier category data (mock supplier API) ──
// When a user clicks a category/subcategory in the top bar, the supplier
// inspector opens with this data. In production, this would be a live API
// call to Printify/Printful.
export interface SupplierCategoryData {
  productName: string;
  supplier: string;
  sku: string;
  basePrice: number;
  colors: { name: string; hex: string; sku: string }[];
  sizes: string[];
  models: string[];
}

export const SUPPLIER_CATEGORY_DATA: SupplierCategoryData = {
  productName: 'Unisex Heavy Blend Crewneck',
  supplier: 'Printify',
  sku: 'GILDAN-18000',
  basePrice: 17.87,
  colors: [
    { name: 'White', hex: '#ffffff', sku: '18000-WHT' },
    { name: 'Ash', hex: '#e5e5e5', sku: '18000-ASH' },
    { name: 'Sport Grey', hex: '#b0b0b0', sku: '18000-SPG' },
    { name: 'Black', hex: '#000000', sku: '18000-BLK' },
    { name: 'Navy', hex: '#1d2a44', sku: '18000-NVY' },
    { name: 'Maroon', hex: '#6b1e28', sku: '18000-MRN' },
    { name: 'Forest Green', hex: '#1d4422', sku: '18000-FGR' },
    { name: 'Royal', hex: '#1d3e8a', sku: '18000-RYL' },
  ],
  sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  models: ['Front', 'Back', 'Folded', 'Lifestyle 1', 'Lifestyle 2'],
};

// ── Category products — SUPERSEDED (Task 1, Nov 7). ──
// `genProducts` / `getCategoryProducts` below invented products per
// subcategory. They are no longer called by any wired surface — the
// flyout and the product page read `loadCategoryProducts` (GET
// /api/v1/blanks) instead. Kept only until the catalog lists (A4) are
// wired, then delete this whole block with its thumbnail generators.
// Generate products for a subcategory — returns 4-8 products with images.
// In production, this would be a live API call returning real supplier products.
export interface CategoryProduct {
  id: string;
  name: string;
  brand: string;
  price: number;
  blankKey: string;
  /** Inline SVG thumbnail — different shape per product family. */
  img: string;
}

// SVG thumbnail generators (same style as BLANKS but smaller, for the flyout).
function thumbTee(fill = '#fff', stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><path d="M36 24 L24 48 L24 96 L96 96 L96 48 L84 24 Z" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/></svg>`;
}
function thumbHoodie(fill = '#fff', stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><path d="M30 24 L18 60 L24 96 L96 96 L102 60 L90 24 Z" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/></svg>`;
}
function thumbMug(fill = '#fff', stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><rect x="36" y="30" width="36" height="60" rx="6" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/><path d="M72 44 Q84 44 84 56 Q84 68 72 68" fill="none" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/></svg>`;
}
function thumbTumbler(fill = '#c0c0c0', stroke = '#999') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><rect x="42" y="20" width="36" height="80" rx="4" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/></svg>`;
}
function thumbBook(fill = '#fff', stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><rect x="24" y="18" width="72" height="84" rx="2" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/><line x1="60" y1="18" x2="60" y2="102" stroke="${encodeURIComponent(stroke)}" stroke-width="1"/></svg>`;
}
function thumbBag(fill = '#fff', stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><path d="M30 48 L30 96 L90 96 L90 48 Z" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/><path d="M42 48 Q42 30 60 30 Q78 30 78 48" fill="none" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/></svg>`;
}
function thumbHat(fill = '#fff', stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><path d="M24 72 Q60 48 96 72 L96 78 L24 78 Z" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/><rect x="24" y="78" width="72" height="6" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1"/></svg>`;
}
function thumbPhone(fill = '#1a1a2e', stroke = '#444') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><rect x="40" y="18" width="40" height="84" rx="8" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/></svg>`;
}
function thumbSock(fill = '#fff', stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><path d="M48 18 L48 72 L30 84 L30 96 L54 96 L72 78 L72 18 Z" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/></svg>`;
}
function thumbPoster(fill = '#fff', stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><rect x="30" y="18" width="60" height="84" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/></svg>`;
}
function thumbPillow(fill = '#fff', stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><rect x="24" y="30" width="72" height="60" rx="8" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/></svg>`;
}
function thumbBlanket(fill = '#e8e8e8', stroke = '#ccc') {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="%23f4f3f7"/><rect x="18" y="24" width="84" height="72" rx="4" fill="${encodeURIComponent(fill)}" stroke="${encodeURIComponent(stroke)}" stroke-width="1.5"/></svg>`;
}

// Generate products for a subcategory — returns 4-8 products with images.
// In production, this would be a live API call returning real supplier products.
function genProducts(category: string, sub: string): CategoryProduct[] {
  const key = `${category}/${sub}`;
  const baseId = key.toLowerCase().replace(/[^a-z0-9]/g, '-');

  // Pick a thumbnail generator based on the subcategory.
  const lowerSub = sub.toLowerCase();
  let imgFn = thumbTee;
  let blankKey = 'tee';
  let brandPrefix = 'Gildan';
  let basePrice = 17.87;

  if (lowerSub.includes('hoodie')) { imgFn = thumbHoodie; blankKey = 'hoodie'; brandPrefix = 'Gildan'; basePrice = 28.5; }
  else if (lowerSub.includes('sweat')) { imgFn = thumbHoodie; blankKey = 'hoodie'; brandPrefix = 'Independent'; basePrice = 24.0; }
  else if (lowerSub.includes('mug')) { imgFn = thumbMug; blankKey = 'mug'; brandPrefix = 'Orca'; basePrice = 6.5; }
  else if (lowerSub.includes('tumbler') || lowerSub.includes('bottle')) { imgFn = thumbTumbler; blankKey = 'tumbler'; brandPrefix = 'Generic'; basePrice = 12.95; }
  else if (lowerSub.includes('book')) { imgFn = thumbBook; blankKey = 'book'; brandPrefix = 'BookBaby'; basePrice = 4.5; }
  else if (lowerSub.includes('bag') || lowerSub.includes('tote')) { imgFn = thumbBag; blankKey = 'tee'; brandPrefix = 'API'; basePrice = 8.5; }
  else if (lowerSub.includes('hat') || lowerSub.includes('cap')) { imgFn = thumbHat; blankKey = 'tee'; brandPrefix = 'Yupoong'; basePrice = 7.95; }
  else if (lowerSub.includes('phone')) { imgFn = thumbPhone; blankKey = 'tee'; brandPrefix = 'CaseMate'; basePrice = 9.95; }
  else if (lowerSub.includes('sock')) { imgFn = thumbSock; blankKey = 'tee'; brandPrefix = 'Printify'; basePrice = 4.5; }
  else if (lowerSub.includes('poster') || lowerSub.includes('canvas') || lowerSub.includes('wall')) { imgFn = thumbPoster; blankKey = 'tee'; brandPrefix = 'Generic'; basePrice = 14.95; }
  else if (lowerSub.includes('pillow')) { imgFn = thumbPillow; blankKey = 'tee'; brandPrefix = 'Generic'; basePrice = 16.95; }
  else if (lowerSub.includes('blanket') || lowerSub.includes('bedding') || lowerSub.includes('bathroom') || lowerSub.includes('towel')) { imgFn = thumbBlanket; blankKey = 'tee'; brandPrefix = 'Generic'; basePrice = 22.95; }
  else if (lowerSub.includes('t-shirt') || lowerSub.includes('tee') || lowerSub.includes('long sleeve') || lowerSub.includes('tank')) { imgFn = thumbTee; blankKey = 'tee'; brandPrefix = 'Bella+Canvas'; basePrice = 14.95; }
  else if (lowerSub.includes('bottom') || lowerSub.includes('pant') || lowerSub.includes('short')) { imgFn = thumbTee; blankKey = 'shorts'; brandPrefix = 'Badger'; basePrice = 22.27; }

  // Product name variations for visual variety.
  const nameVariants = [
    { suffix: 'Classic', fill: '#fff' },
    { suffix: 'Premium', fill: '#e5e5e5' },
    { suffix: 'Heavyweight', fill: '#b0b0b0' },
    { suffix: 'Performance', fill: '#1a1c1e' },
    { suffix: 'Eco Blend', fill: '#d4e8d4' },
    { suffix: 'Vintage Wash', fill: '#c4b8a0' },
  ];

  const count = Math.min(nameVariants.length, lowerSub.includes('all') ? 4 : 6);
  const products: CategoryProduct[] = [];
  for (let i = 0; i < count; i++) {
    const v = nameVariants[i];
    products.push({
      id: `${baseId}-${i}`,
      name: `${sub} — ${v.suffix}`,
      brand: `${brandPrefix} ${1000 + i * 137}`,
      price: +(basePrice + i * 1.5).toFixed(2),
      blankKey,
      img: imgFn(v.fill),
    });
  }
  return products;
}

// Pre-generate products for all categories (lazy-memoized).
const _categoryProductsCache: Record<string, CategoryProduct[]> = {};
export function getCategoryProducts(category: string, sub: string): CategoryProduct[] {
  const key = `${category}/${sub}`;
  if (!_categoryProductsCache[key]) {
    _categoryProductsCache[key] = genProducts(category, sub);
  }
  return _categoryProductsCache[key];
}

// ── Published products — go live to the global Catalog domain ──
export interface PublishedProduct {
  id: string;
  name: string;
  brand: string;
  blankKey: string;
  color: string;
  sizes: string[];
  printArea: string;
  supplier: string;
  publishedAt: string;
}

// ── Saved design artifacts (previews + create-actions produce these) ──
// Persisted in localStorage so the user's authored library survives reloads.
export interface SavedImage {
  id: string;
  name: string;
  /** data URI or remote URL */
  src: string;
  /** Where it came from: 'upload' | 'ai' | 'inspiration' (Wikimedia) */
  origin: 'upload' | 'ai' | 'inspiration';
  /** For inspiration images: the full-resolution Commons URL (AI source). */
  sourceUrl?: string;
  createdAt: string;
}

export interface SavedTemplate {
  id: string;
  name: string;
  /** Which blank/product it was built on */
  blankKey?: string;
  /** Snapshot of the design state when saved */
  color?: string;
  printArea?: string;
  createdAt: string;
}

export interface SavedCollectionItem {
  id: string;
  name: string;
  /** 'preview' = a design preview, 'product' = a catalog product ref */
  kind: 'preview' | 'product';
  src?: string;
  productId?: string;
  createdAt: string;
}

// ── localStorage-backed saved libraries ──
const LS_KEYS = {
  images: 'unsaid:design:saved-images',
  templates: 'unsaid:design:saved-templates',
  collection: 'unsaid:design:collection',
};

function loadLs<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Array-safe localStorage load. If the stored value is from an older format
 * (an object, a number, null…), return the fallback instead of poisoning the
 * store — a non-array here crashed every consumer with
 * "savedTemplates is not iterable".
 */
function loadLsArray<T>(key: string, fallback: T[]): T[] {
  const value = loadLs<T[] | unknown>(key, fallback);
  return Array.isArray(value) ? value : fallback;
}
function saveLs<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — silently no-op */
  }
}

// Initial snapshots from localStorage (or empty if SSR / first visit).
// Array-guarded: a corrupt/legacy value must never poison the store.
const initialSavedImages = loadLsArray<SavedImage>(LS_KEYS.images, []);
const initialSavedTemplates = loadLsArray<SavedTemplate>(LS_KEYS.templates, []);
const initialCollection = loadLsArray<SavedCollectionItem>(LS_KEYS.collection, []);

// ── Store ──
interface DesignCanvasState {
  /** Loaded blank (null = empty canvas). */
  product: Blank | null;
  /** Active mockup color (drives the rendered product image). */
  color: BlankColor;
  /** Edit vs Preview — Edit shows the design + print areas; Preview shows mockup angles. */
  mode: 'edit' | 'preview';
  /** Selected print-area pill (e.g. 'front', 'back'). */
  printArea: string;
  /** Product page modal — open with a catalog product when a thumbnail is clicked. */
  productPage: CatalogProduct | null;
  /** Confirmation modal (productguide.html "Supplier Selected" → Enter Studio). */
  confirmOpen: boolean;
  /** Published products — go live to the global Catalog (Published Items & SKUs). */
  published: PublishedProduct[];
  /** Active supplier category (set when a top-bar dropdown item is clicked).
   *  Drives the supplier inspector content in the StudioDrawer. */
  supplierCategory: { category: string; subcategory: string } | null;
  /** Design queue — products selected from the top-bar flyout for batch design. */
  designQueue: CategoryProduct[];
  /**
   * Top category nav — the ONE selection shared by the canvas and the
   * products page inside the designer. It lives in the store (not in
   * component state) so it persists across canvas ↔ product-page
   * navigation. Changing it reloads the detail cards for that category.
   */
  activeCategory: string;
  activeSubcategory: string;
  /**
   * The top nav, from GET /api/v1/categories — the ~14 real departments
   * diffed against all suppliers (top name → its subcategory names).
   * TOP_NAV below is only the fallback until the server nav loads.
   */
  navCategories: CategoryNavNode[] | null;
  navStatus: 'idle' | 'loading' | 'ready' | 'error';
  navMap: Record<string, string[]>;
  loadNavCategories: () => Promise<void>;
  /** Detail cards for the active category — from GET /api/v1/blanks. */
  catalogProducts: CategoryProduct[];
  /** The same cards, unmapped — thumbnails + base cost for the strip. */
  catalogCards: BlankCard[];
  catalogStatus: 'idle' | 'loading' | 'ready' | 'error';
  catalogError: string | null;
  /** Full blank detail — provider skeletons, base price, variant colors. */
  blankDetail: BlankDetail | null;
  blankDetailStatus: 'idle' | 'loading' | 'ready' | 'error';
  blankDetailError: string | null;
  /** Draft design created by Start designing (POST /api/v1/designs). */
  designId: string | null;

  // ── Studio session (unified contract) ──
  /** Session id — shared by every Studio tab for the same session. */
  sessionId: string;
  entry: StudioEntry | null;
  /** Design-first tray: artwork waiting for a product. */
  pendingAsset: string | null;
  /** The Design Queue as typed targets (blankId + status + blockers). */
  targets: StudioTarget[];
  activeTargetId: string | null;
  /** Which of the three views the session shows. */
  view: StudioView;
  /** The one open drawer (right), or null. */
  openDrawer: DrawerId | null;
  /** Studio output in inches; null until the first layer is placed. */
  placement: PlacementSpec | null;
  garmentColors: string[];
  collectionId: string | null;
  previewPrefs: PreviewPrefs;
  dirty: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  /** Blockers computed on every change (render_state, offers, DPI, bounds). */
  blockers: Blocker[];
  origin: StudioLaunch['origin'] | null;
  /** Browse Products overlay (the guard target when product/preview need a product). */
  browseOpen: boolean;
  /**
   * Canvas left-dock panel (Canva-style): the kind docked on the design
   * canvas ('Upload' | 'AI' | 'Text' | …) or null (rail only). Lives in the
   * store so a sidebar click can set it BEFORE the canvas screen mounts —
   * no event races. The canvas screen owns the visual dock.
   */
  canvasDock: string | null;
  setCanvasDock: (kind: string | null) => void;

  /** The only way any screen opens the Studio. Fills session fields, loads the blank(s), lands on the view. */
  openStudio: (launch: StudioLaunch) => Promise<void>;
  setView: (view: StudioView) => void;
  setDrawer: (drawer: DrawerId | null) => void;
  setPlacement: (placement: PlacementSpec | null) => void;
  setGarmentColors: (colors: string[]) => void;
  setCollectionId: (id: string | null) => void;
  setPreviewPrefs: (prefs: Partial<PreviewPrefs>) => void;
  setBrowseOpen: (open: boolean) => void;
  /** Recompute blockers from the loaded blank (render_state, offers). */
  computeBlockers: () => void;
  markDirty: () => void;
  markSaved: () => void;

  loadBlank: (key: string) => void;
  setMode: (mode: 'edit' | 'preview') => void;
  setPrintArea: (id: string) => void;
  selectColor: (c: BlankColor) => void;
  openProductPage: (p: CatalogProduct) => void;
  closeProductPage: () => void;
  setConfirmOpen: (open: boolean) => void;
  clearProduct: () => void;
  publishProduct: (supplier: string) => PublishedProduct;
  setSupplierCategory: (cat: string, sub: string) => void;
  clearSupplierCategory: () => void;
  addToQueue: (p: CategoryProduct) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;

  /** Saved images library — Upload + AI generations save here. */
  savedImages: SavedImage[];
  /** Saved templates — designs the user chose to reuse. */
  savedTemplates: SavedTemplate[];
  /** Collection — previews + product refs the user saved. */
  collection: SavedCollectionItem[];
  /** Save an uploaded or AI-generated image to the Images library. */
  saveImage: (img: Omit<SavedImage, 'id' | 'createdAt'>) => SavedImage;
  /** Save the current canvas state as a reusable template. */
  saveTemplate: (name: string) => SavedTemplate;
  /** Save a preview or product reference to the Collection. */
  saveToCollection: (item: Omit<SavedCollectionItem, 'id' | 'createdAt'>) => SavedCollectionItem;
  /** Remove a saved image / template / collection item. */
  removeImage: (id: string) => void;
  removeTemplate: (id: string) => void;
  removeFromCollection: (id: string) => void;

  setCategory: (cat: string, sub: string) => void;
  loadCategoryProducts: (cat?: string, sub?: string) => Promise<void>;
  loadBlankDetail: (id: string) => Promise<BlankDetail | null>;
  loadBlankFromDetail: (detail: BlankDetail) => void;
  /** Start designing: creates the draft design, then loads the canvas. */
  startDesign: (detail: BlankDetail, color?: string) => Promise<void>;
}

/**
 * Map an API blank card onto the store's flyout/queue card shape
 * (CategoryProduct: price + thumbnail). The page/modal shape
 * (CatalogProduct) has its own mapper below.
 */
export function blankCardToCategoryProduct(card: BlankCard): CategoryProduct {
  return {
    id: card.id,
    name: card.name,
    brand: card.brand,
    price: card.baseCost ?? 0,
    blankKey: card.canonicalProductId,
    img: card.mockupThumbUrl,
  };
}

/** Map an API blank card onto the product-page/modal shape. Carries the
 * card's live fields (image, price, SKU, supplier) so the product page
 * renders the real product immediately — the detail fetch only enriches. */
export function blankCardToCatalogProduct(
  card: BlankCard,
  category: string,
  subcategory: string,
): CatalogProduct {
  return {
    id: card.id,
    name: card.name,
    brand: card.brand,
    blankKey: card.canonicalProductId,
    department: category,
    eligibility: card.printAreas.map((p) => p.placement).join(' / ') || 'Front / back',
    status: card.status,
    features: [`${subcategory}`, `Fulfilled by ${card.supplier}`],
    img: card.mockupThumbUrl || undefined,
    price: card.baseCost,
    sku: card.sku ?? undefined,
    variantCount: card.variantCount,
    supplier: card.supplier,
    supplierSlug: card.supplierSlug,
    supplierCount: card.supplierCount,
    categoryPath: `${category}${subcategory ? ` · ${subcategory}` : ''}`,
  };
}

/* ── Real-tree path helpers ─────────────────────────────────────────────
   The sidebar Catalog group and the studio-…--… screen ids are built from
   the REAL tree (GET /api/v1/categories). These helpers walk that tree. */

const normSeg = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

/** Walk the tree root → leaf by slug (or name) segments — the slug form a
 *  studio screen id carries — and return the canonical node NAMES.
 *  Null when any segment doesn't resolve (nothing is invented). */
export function resolveCatalogPathSlugs(
  tree: CategoryNavNode[],
  slugs: string[],
): string[] | null {
  let pool: CategoryNavNode[] = tree;
  const names: string[] = [];
  for (const seg of slugs) {
    if (!seg) continue;
    const hit = pool.find(
      (n) => normSeg(n.slug) === normSeg(seg) || normSeg(n.name) === normSeg(seg),
    );
    if (!hit) return null;
    names.push(hit.name);
    pool = hit.children ?? [];
  }
  return names.length > 0 ? names : null;
}

/** Find the node for a resolved name path (root → leaf) — the children of
 *  the returned node are the subcategory chips the category screen offers. */
export function findCatalogNode(
  tree: CategoryNavNode[],
  names: string[],
): CategoryNavNode | null {
  let pool: CategoryNavNode[] = tree;
  let node: CategoryNavNode | null = null;
  for (const name of names) {
    const hit = pool.find(
      (n) => normSeg(n.name) === normSeg(name) || normSeg(n.slug) === normSeg(name),
    );
    if (!hit) return null;
    node = hit;
    pool = hit.children ?? [];
  }
  return node;
}

function blankImage(blank: Blank, hex: string): string {
  const enc = encodeURIComponent;
  switch (blank.family) {
    case 'tops':
      return blank.key === 'hoodie'
        ? `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f4f3f7"/><path d="M50 40 L30 100 L40 160 L160 160 L170 100 L150 40 Z" fill="${enc(hex)}" stroke="%23ccc"/></svg>`
        : `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f4f3f7"/><path d="M60 40 L40 80 L40 160 L160 160 L160 80 L140 40 Z" fill="${enc(hex)}" stroke="%23ccc"/></svg>`;
    case 'drinkware':
      return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f4f3f7"/><rect x="60" y="50" width="60" height="100" rx="10" fill="${enc(hex)}" stroke="%23ccc"/></svg>`;
    case 'books':
      return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23f4f3f7"/><path d="M40 30 L40 170 L100 170 L100 30 Z" fill="${enc(hex)}" stroke="%23ccc"/><path d="M100 30 L100 170 L160 170 L160 30 Z" fill="${enc(hex)}" stroke="%23ccc" opacity="0.85"/></svg>`;
  }
}

export const useDesignCanvas = create<DesignCanvasState>((set, get) => ({
  product: null,
  color: SUPPLIER_COLORS[0],
  mode: 'edit',
  printArea: 'front',
  productPage: null,
  confirmOpen: false,
  published: [],
  supplierCategory: null,
  designQueue: [],
  activeCategory: 'Men',
  activeSubcategory: TOP_NAV['Men'][0],
  navCategories: null,
  navStatus: 'idle',
  navMap: TOP_NAV,
  loadNavCategories: async () => {
    // NO-OP. The storefront nav is hard-coded in STOREFRONT_NAV / TOP_NAV
    // above — it is NOT pulled from /api/v1/categories (that endpoint
    // serves the legacy Printify catalog dump, a different surface). This
    // function is kept only so existing callers (DesignCanvasScreen,
    // SideRail) don't break. Marking ready synchronously lets them read
    // navMap (== TOP_NAV) immediately.
    const s = get();
    if (s.navStatus === 'ready') return;
    set({ navStatus: 'ready', navMap: TOP_NAV });
  },
  catalogProducts: [],
  catalogCards: [],
  catalogStatus: 'idle',
  catalogError: null,
  blankDetail: null,
  blankDetailStatus: 'idle',
  blankDetailError: null,
  designId: null,

  // ── Studio session (unified contract) ──
  sessionId:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `session-${Date.now()}`,
  entry: null,
  pendingAsset: null,
  targets: [],
  activeTargetId: null,
  view: 'design',
  openDrawer: null,
  placement: null,
  garmentColors: [],
  collectionId: null,
  previewPrefs: {
    colorMode: 'realistic_cmyk',
    background: { type: 'color', value: '#ffffff' },
    scaling: 'proportional_to_size',
  },
  dirty: false,
  saveState: 'idle',
  blockers: [],
  origin: null,
  browseOpen: false,
  canvasDock: null,
  setCanvasDock: (kind) => set({ canvasDock: kind }),

  openStudio: async (launch) => {
    const s = get();
    const sessionId =
      s.designId || s.targets.length > 0 ? s.sessionId : crypto.randomUUID();
    const view = launch.view ?? s.view;
    const hasProduct =
      !!s.product || (launch.blankIds?.length ?? 0) > 0 || !!launch.designId;
    // Guard: product and preview require a product. With none, open the
    // Browse Products overlay instead of landing on an empty view.
    const browseOpen = (view === 'product' || view === 'preview') && !hasProduct;
    set({
      sessionId,
      entry: launch.entry,
      view: browseOpen ? 'design' : view,
      openDrawer: launch.drawer ?? s.openDrawer,
      pendingAsset: launch.seedAsset ? launch.seedAsset.assetId : s.pendingAsset,
      origin: launch.origin ?? s.origin,
      browseOpen,
    });
    // Reopen an existing design: load its row, then its blank.
    if (launch.designId) {
      try {
        const { design } = await getDesign(launch.designId);
        set({ designId: design.id });
        const blankId =
          (design as { supplier_catalog_product_id?: string })
            .supplier_catalog_product_id ??
          (design as { blank_id?: string }).blank_id;
        if (blankId) await get().loadBlankDetail(blankId);
      } catch {
        // A design that cannot be reopened leaves the session empty;
        // the caller surfaces the error. Never fake a loaded design.
        set({ designId: null });
      }
      return;
    }
    // Load the blank(s): first blank becomes the active target, the rest
    // join the queue. Targets carry status + blockers; the queue cards
    // carry the display rows.
    const blankIds = launch.blankIds ?? [];
    for (let i = 0; i < blankIds.length; i++) {
      const detail = await get().loadBlankDetail(blankIds[i]);
      if (!detail) continue;
      const cur = get();
      const target: StudioTarget = {
        blankId: detail.id,
        size: 'L',
        status: 'loaded',
        blockers: [],
      };
      const targets = cur.targets.some((t) => t.blankId === detail.id)
        ? cur.targets
        : [...cur.targets, target];
      set({
        targets,
        activeTargetId: i === 0 ? detail.id : cur.activeTargetId ?? detail.id,
      });
      // BlankDetail extends BlankCard, so the loaded detail is the queue card.
      get().addToQueue(blankCardToCategoryProduct(detail));
      if (i === 0) {
        // Load the first blank onto the canvas (sets product/mode/printArea).
        get().loadBlankFromDetail(detail);
        get().computeBlockers();
      }
    }
  },

  setView: (view) => {
    const s = get();
    // Guard: product/preview need a product; otherwise open Browse Products.
    if ((view === 'product' || view === 'preview') && !s.product && s.targets.length === 0) {
      set({ view: 'design', browseOpen: true });
      return;
    }
    set({ view });
  },
  setDrawer: (drawer) => set({ openDrawer: drawer }),
  setPlacement: (placement) => set({ placement, dirty: true }),
  setGarmentColors: (colors) => set({ garmentColors: colors, dirty: true }),
  setCollectionId: (id) => set({ collectionId: id, dirty: true }),
  setPreviewPrefs: (prefs) =>
    set((s) => ({ previewPrefs: { ...s.previewPrefs, ...prefs } })),
  setBrowseOpen: (open) => set({ browseOpen: open }),
  computeBlockers: () => {
    const s = get();
    const blockers: Blocker[] = [];
    const detail = s.blankDetail;
    if (detail) {
      const renderState = (detail as { renderState?: string }).renderState;
      if (renderState && renderState !== 'render_ready') {
        blockers.push({
          code: 'not_render_ready',
          message: `This blank is not render-ready (${renderState}).`,
          fix: 'generate_mockup',
        });
      }
      if (!detail.printers || detail.printers.length === 0) {
        blockers.push({
          code: 'no_offer',
          message: 'No print provider offers this blank.',
        });
      }
    }
    const activeId = s.activeTargetId;
    set({
      blockers,
      targets: s.targets.map((t) =>
        t.blankId === activeId
          ? { ...t, blockers, status: blockers.length > 0 ? 'blocked' : t.status }
          : t,
      ),
    });
  },
  markDirty: () => set({ dirty: true }),
  markSaved: () => set({ dirty: false, saveState: 'saved' }),

  loadBlank: (key) => {
    const blank = BLANKS[key];
    if (!blank) return;
    const color = get().color;
    const family = blank.family;
    set({
      product: { ...blank, img: blankImage(blank, color.hex) },
      mode: 'edit',
      printArea: PRINT_AREAS[family][0].id,
    });
  },

  setMode: (mode) => set({ mode }),

  setPrintArea: (id) => set({ printArea: id }),

  selectColor: (c) =>
    set((s) => ({
      color: c,
      // Only legacy SVG blanks get recolored. A provider skeleton keeps its
      // stored base image — the color choice is recorded, not painted over.
      product:
        s.product && BLANKS[s.product.key]
          ? { ...s.product, img: blankImage(s.product, c.hex) }
          : s.product,
    })),

  openProductPage: (p) => set({ productPage: p }),
  closeProductPage: () => set({ productPage: null }),
  setConfirmOpen: (open) => set({ confirmOpen: open }),

  clearProduct: () => set({ product: null, mode: 'edit', printArea: 'front' }),

  publishProduct: (supplier) => {
    const s = get();
    const product = s.product;
    const ts = new Date().toISOString();
    const published: PublishedProduct = {
      id: `pub-${Date.now()}`,
      name: product?.name ?? 'Custom Design',
      brand: product?.brand ?? 'Unsaid Studio',
      blankKey: product?.key ?? 'tee',
      color: s.color.name,
      sizes: ['S', 'M', 'L', 'XL'],
      printArea: s.printArea,
      supplier,
      publishedAt: ts,
    };
    set({ published: [published, ...s.published] });
    return published;
  },

  setSupplierCategory: (cat, sub) =>
    set({ supplierCategory: { category: cat, subcategory: sub } }),
  clearSupplierCategory: () => set({ supplierCategory: null }),

  addToQueue: (p) =>
    set((s) => {
      if (s.designQueue.some((q) => q.id === p.id)) return s; // dedup
      return { designQueue: [...s.designQueue, p] };
    }),
  removeFromQueue: (id) =>
    set((s) => ({ designQueue: s.designQueue.filter((q) => q.id !== id) })),
  clearQueue: () => set({ designQueue: [] }),

  // ── Saved libraries (localStorage-backed) ──
  savedImages: initialSavedImages,
  savedTemplates: initialSavedTemplates,
  collection: initialCollection,

  saveImage: (img) => {
    const saved: SavedImage = {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...img,
    };
    const prev = Array.isArray(get().savedImages) ? get().savedImages : [];
    const next = [saved, ...prev];
    set({ savedImages: next });
    saveLs(LS_KEYS.images, next);
    return saved;
  },

  saveTemplate: (name) => {
    const s = get();
    const tpl: SavedTemplate = {
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      blankKey: s.product?.key,
      color: s.color.name,
      printArea: s.printArea,
      createdAt: new Date().toISOString(),
    };
    const prev = Array.isArray(get().savedTemplates) ? get().savedTemplates : [];
    const next = [tpl, ...prev];
    set({ savedTemplates: next });
    saveLs(LS_KEYS.templates, next);
    return tpl;
  },

  saveToCollection: (item) => {
    const entry: SavedCollectionItem = {
      id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...item,
    };
    const prev = Array.isArray(get().collection) ? get().collection : [];
    const next = [entry, ...prev];
    set({ collection: next });
    saveLs(LS_KEYS.collection, next);
    return entry;
  },

  removeImage: (id) => {
    const prev = Array.isArray(get().savedImages) ? get().savedImages : [];
    const next = prev.filter((i) => i.id !== id);
    set({ savedImages: next });
    saveLs(LS_KEYS.images, next);
  },
  removeTemplate: (id) => {
    const prev = Array.isArray(get().savedTemplates) ? get().savedTemplates : [];
    const next = prev.filter((t) => t.id !== id);
    set({ savedTemplates: next });
    saveLs(LS_KEYS.templates, next);
  },
  removeFromCollection: (id) => {
    const prev = Array.isArray(get().collection) ? get().collection : [];
    const next = prev.filter((c) => c.id !== id);
    set({ collection: next });
    saveLs(LS_KEYS.collection, next);
  },

  setCategory: (cat, sub) => {
    set({ activeCategory: cat, activeSubcategory: sub });
    void get().loadCategoryProducts(cat, sub);
  },

  loadCategoryProducts: async (cat, sub) => {
    const category = cat ?? get().activeCategory;
    const subcategory = sub ?? get().activeSubcategory;
    set({ catalogStatus: 'loading', catalogError: null });
    try {
      const { items } = await listBlanks({ category, subcategory });
      set({
        catalogCards: items,
        catalogProducts: items.map((c) => blankCardToCategoryProduct(c)),
        catalogStatus: 'ready',
      });
    } catch (e) {
      // No invented fallback: the previous list stays visible, the error
      // is shown with a retry. The route is Zai's lane (contracts §3.1).
      set({
        catalogStatus: 'error',
        catalogError: e instanceof Error ? e.message : 'Could not load products.',
      });
    }
  },

  loadBlankDetail: async (id) => {
    set({ blankDetailStatus: 'loading', blankDetailError: null });
    try {
      const detail = await getBlank(id);
      // Set blankDetail in the store — but do NOT call loadBlankFromDetail
      // here. That function sets canvas state (product, mode, printArea)
      // which should only happen when loading the canvas, not when viewing
      // the product page. The canvas calls loadBlankFromDetail separately.
      set({ blankDetail: detail, blankDetailStatus: 'ready' });
      return detail;
    } catch (e) {
      set({
        blankDetailStatus: 'error',
        blankDetailError: e instanceof Error ? e.message : 'Could not load product details.',
      });
      return null;
    }
  },

  loadBlankFromDetail: (detail) => {
    // The canvas visualizes the provider's own skeleton — first view's
    // stored base image — not the legacy inline SVG.
    const firstView = detail.views[0];
    const img = firstView?.baseUrl ?? detail.mockupThumbUrl;
    // Pills come from the API's printable regions (Printify placeholders
    // ingested into print_specs) — the first placement is the landing tab.
    const firstPlacement = detail.printAreas[0]?.placement?.toLowerCase();
    set({
      product: {
        key: detail.canonicalProductId,
        name: detail.name,
        brand: detail.brand,
        price: detail.baseCost ?? 0,
        img,
        family: detail.family,
      },
      mode: 'edit',
      printArea: firstPlacement ?? PRINT_AREAS[detail.family][0].id,
    });
  },

  startDesign: async (detail, color) => {
    // Creates the draft design row first; the canvas loads either way so
    // the designer is never blocked on the network — but a failed create
    // is reported to the caller (toast), never silently swallowed.
    const created = await createDesign({
      name: detail.name,
      blankId: detail.canonicalProductId,
      supplierCatalogProductId: detail.id,
      garmentColor: color ?? detail.variants.colors[0]?.name,
      productType: detail.name,
    }).catch((e: Error) => {
      set({ designId: null });
      throw e;
    });
    set({ designId: created.id });
    get().loadBlankFromDetail(detail);
  },
}));
