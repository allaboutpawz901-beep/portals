'use client';
/* platformStore.ts — The 5 shared entities from platform-component-map.md §1.1
   This is the single source of truth for the entire platform.
   Every module reads from and writes to these stores.
   No module has its own local mock data array. */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/* ═══════════════════════════════════════════════════════════════
   ENTITY 1: PARTY (§1.1)
   One person/company record. Roles: Customer, Vendor, Supplier,
   Contractor, Seller, Lead. A party can hold many roles.
   ═══════════════════════════════════════════════════════════════ */

export type PartyRole = 'Customer' | 'Vendor' | 'Supplier' | 'Contractor' | 'Seller' | 'Lead';

export interface Party {
  id: string;
  name: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roles: PartyRole[];
  balance: number; // AR positive, AP negative
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  terms: string; // Net 30, Net 15, Due on receipt
  creditLimit: number;
  taxId: string;
  taxExempt: boolean;
  track1099: boolean;
  notes: string;
  tags: string[];
  added: string;
  lastActivity: string;
  owner: string;
  segmentIds: string[];
  // Role-specific
  leadSource?: string;
  leadStatus?: string;
  leadValue?: number;
  supplierLeadTime?: number;
  supplierAccountNo?: string;
  supplierUrl?: string;
  vendorDefaultAccount?: string;
  contractorW9Status?: string;
}

const SEED_PARTIES: Party[] = [
  { id: 'P-1001', name: 'Acme Corp', displayName: 'Acme', firstName: 'John', lastName: 'Doe', email: 'john@acme.com', phone: '+1 (555) 111-2222', roles: ['Customer'], balance: 1240.00, address: '123 Main St', city: 'Springfield', state: 'IL', zip: '62701', country: 'United States', terms: 'Net 30', creditLimit: 5000, taxId: '', taxExempt: false, track1099: false, notes: '', tags: ['VIP'], added: '2026-10-15', lastActivity: '2026-11-02', owner: 'Jordan A.', segmentIds: [] },
  { id: 'P-1002', name: 'Blue Ridge Co.', displayName: 'Blue Ridge', firstName: 'Sarah', lastName: 'Smith', email: 'sarah@blueridge.co', phone: '+1 (555) 333-4444', roles: ['Customer', 'Vendor'], balance: 0, address: '456 Ridge Rd', city: 'Asheville', state: 'NC', zip: '28801', country: 'United States', terms: 'Net 15', creditLimit: 3000, taxId: '', taxExempt: false, track1099: false, notes: '', tags: [], added: '2026-08-02', lastActivity: '2026-10-31', owner: 'Sarah A.', segmentIds: [] },
  { id: 'P-1003', name: 'Printful Inc.', displayName: 'Printful', firstName: 'Print', lastName: 'Fulfillment', email: 'support@printful.com', phone: '+1 (555) 000-1111', roles: ['Supplier'], balance: -2880.00, address: '789 Print Ave', city: 'Charlotte', state: 'NC', zip: '28202', country: 'United States', terms: 'Net 30', creditLimit: 0, taxId: '12-3456789', taxExempt: false, track1099: false, notes: 'POD supplier', tags: ['POD'], added: '2026-01-10', lastActivity: '2026-11-01', owner: 'Marcus L.', segmentIds: [], supplierLeadTime: 3, supplierAccountNo: 'SUP-001', supplierUrl: 'https://api.printful.com' },
  { id: 'P-1004', name: 'Gelato Pty Ltd', displayName: 'Gelato', firstName: 'Gelato', lastName: 'Support', email: 'help@gelato.com', phone: '+61 2 8000 0000', roles: ['Supplier'], balance: -1200.00, address: '10 George St', city: 'Sydney', state: 'NSW', zip: '2000', country: 'Australia', terms: 'Net 30', creditLimit: 0, taxId: '', taxExempt: false, track1099: false, notes: 'Global POD', tags: ['POD'], added: '2026-03-22', lastActivity: '2026-10-30', owner: 'Marcus L.', segmentIds: [], supplierLeadTime: 5, supplierAccountNo: 'SUP-002', supplierUrl: 'https://api.gelato.com' },
  { id: 'P-1005', name: 'Jane Miller', displayName: 'Jane', firstName: 'Jane', lastName: 'Miller', email: 'jane.miller@email.com', phone: '+1 (555) 777-8888', roles: ['Lead'], balance: 0, address: '101 Elm St', city: 'Austin', state: 'TX', zip: '78701', country: 'United States', terms: '', creditLimit: 0, taxId: '', taxExempt: false, track1099: false, notes: '', tags: [], added: '2026-09-01', lastActivity: '2026-09-05', owner: 'Sarah A.', segmentIds: [], leadSource: 'Website', leadStatus: 'Contacted', leadValue: 5000 },
  { id: 'P-1006', name: 'Staples', displayName: 'Staples', firstName: 'Office', lastName: 'Supplies', email: 'billing@staples.com', phone: '+1 (800) 333-3333', roles: ['Vendor'], balance: -142.50, address: '500 Staples Dr', city: 'Framingham', state: 'MA', zip: '01702', country: 'United States', terms: 'Net 30', creditLimit: 0, taxId: '04-1234567', taxExempt: false, track1099: true, notes: '', tags: [], added: '2026-05-14', lastActivity: '2026-10-20', owner: 'Jordan A.', segmentIds: [], vendorDefaultAccount: 'Office Supplies' },
  { id: 'P-1007', name: 'Maple Supply', displayName: 'Maple', firstName: 'Maple', lastName: 'Co', email: 'ar@maplesupply.io', phone: '+1 (555) 774-9810', roles: ['Customer', 'Supplier'], balance: 890.00, address: '200 Maple Ln', city: 'Portland', state: 'OR', zip: '97201', country: 'United States', terms: 'Net 30', creditLimit: 2000, taxId: '', taxExempt: false, track1099: false, notes: '', tags: [], added: '2026-02-11', lastActivity: '2026-10-15', owner: 'Sarah A.', segmentIds: [], supplierLeadTime: 7, supplierAccountNo: 'SUP-003' },
  { id: 'P-1008', name: 'Northwind Labs', displayName: 'Northwind', firstName: 'North', lastName: 'Wind', email: 'marketing@northwindlabs.io', phone: '+1 (555) 310-8844', roles: ['Customer'], balance: 2100.00, address: '300 Wind St', city: 'Seattle', state: 'WA', zip: '98101', country: 'United States', terms: 'Net 30', creditLimit: 10000, taxId: '', taxExempt: false, track1099: false, notes: '', tags: ['Enterprise'], added: '2025-11-20', lastActivity: '2026-10-15', owner: 'Jordan A.', segmentIds: [] },
  { id: 'P-1009', name: 'Apex Manufacturing', displayName: 'Apex', firstName: 'Apex', lastName: 'Mfg', email: 'orders@apexmfg.com', phone: '+1 (555) 220-3344', roles: ['Vendor', 'Supplier'], balance: -540.00, address: '400 Apex Dr', city: 'Detroit', state: 'MI', zip: '48201', country: 'United States', terms: 'Net 30', creditLimit: 0, taxId: '38-9876543', taxExempt: false, track1099: true, notes: '', tags: [], added: '2026-04-03', lastActivity: '2026-10-25', owner: 'Marcus L.', segmentIds: [], supplierLeadTime: 14, supplierAccountNo: 'SUP-004' },
  { id: 'P-1010', name: 'Riverside Design Studio', displayName: 'Riverside', firstName: 'River', lastName: 'Side', email: 'hello@riverside.design', phone: '+1 (555) 661-7788', roles: ['Lead'], balance: 0, address: '55 River Rd', city: 'Denver', state: 'CO', zip: '80202', country: 'United States', terms: '', creditLimit: 0, taxId: '', taxExempt: false, track1099: false, notes: '', tags: [], added: '2026-10-28', lastActivity: '2026-10-28', owner: 'Sarah A.', segmentIds: [], leadSource: 'Referral', leadStatus: 'New', leadValue: 8500 },
  { id: 'P-1011', name: 'Summit Apparel', displayName: 'Summit', firstName: 'Summit', lastName: 'Apparel', email: 'sales@summitapparel.com', phone: '+1 (555) 445-9911', roles: ['Lead'], balance: 0, address: '88 Summit Blvd', city: 'Salt Lake City', state: 'UT', zip: '84101', country: 'United States', terms: '', creditLimit: 0, taxId: '', taxExempt: false, track1099: false, notes: '', tags: [], added: '2026-11-01', lastActivity: '2026-11-01', owner: 'Jordan A.', segmentIds: [], leadSource: 'Event', leadStatus: 'New', leadValue: 12000 },
];

/* ═══════════════════════════════════════════════════════════════
   ENTITY 2: ITEM (§1.1)
   Anything sellable/buyable. Product, Service, Blank, Bundle.
   ═══════════════════════════════════════════════════════════════ */

export type ItemType = 'Product' | 'Service' | 'Blank' | 'Bundle' | 'Design-linked';
export type FulfillmentType = 'Stock' | 'POD' | 'Supplier-fulfilled' | 'Digital';

export interface Item {
  id: string;
  name: string;
  sku: string;
  type: ItemType;
  category: string;
  status: 'Draft' | 'Published' | 'Archived';
  price: number;
  cost: number;
  description: string;
  incomeAccount: string;
  expenseAccount: string;
  taxable: boolean;
  trackInventory: boolean;
  fulfillmentType: FulfillmentType;
  stockOnHand: number;
  reorderPoint: number;
  supplierId: string | null;
  designId: string | null;
  channels: string[];
  image: string;
  tags: string[];
  updated: string;
}

const SEED_ITEMS: Item[] = [
  { id: 'ITM-001', name: 'Classic Tee — White', sku: 'TEE-001-WHT', type: 'Product', category: 'Apparel > T-Shirts', status: 'Published', price: 24.99, cost: 8.50, description: '100% cotton crew neck tee', incomeAccount: '4000 Product Sales', expenseAccount: '5000 COGS', taxable: true, trackInventory: true, fulfillmentType: 'Stock', stockOnHand: 142, reorderPoint: 50, supplierId: 'P-1003', designId: null, channels: ['Shopify', 'Etsy'], image: '', tags: ['Best seller'], updated: '2026-11-01' },
  { id: 'ITM-002', name: 'Canvas Tote Bag', sku: 'TOTE-014', type: 'Product', category: 'Accessories > Bags', status: 'Published', price: 18.00, cost: 6.00, description: 'Heavyweight canvas tote', incomeAccount: '4000 Product Sales', expenseAccount: '5000 COGS', taxable: true, trackInventory: true, fulfillmentType: 'Stock', stockOnHand: 78, reorderPoint: 30, supplierId: 'P-1009', designId: null, channels: ['Shopify'], image: '', tags: [], updated: '2026-10-28' },
  { id: 'ITM-003', name: 'Custom Design Print (POD)', sku: 'POD-DESIGN-001', type: 'Design-linked', category: 'Apparel > Custom', status: 'Published', price: 29.99, cost: 12.00, description: 'Print-on-demand custom design', incomeAccount: '4000 Product Sales', expenseAccount: '5000 COGS', taxable: true, trackInventory: false, fulfillmentType: 'POD', stockOnHand: 0, reorderPoint: 0, supplierId: 'P-1003', designId: 'D-001', channels: ['Shopify', 'TikTok', 'Etsy'], image: '', tags: ['POD'], updated: '2026-11-02' },
  { id: 'ITM-004', name: 'Graphic Design Service', sku: 'SVC-DESIGN', type: 'Service', category: 'Services > Design', status: 'Published', price: 75.00, cost: 0, description: 'Hourly graphic design service', incomeAccount: '4100 Service Income', expenseAccount: '', taxable: false, trackInventory: false, fulfillmentType: 'Digital', stockOnHand: 0, reorderPoint: 0, supplierId: null, designId: null, channels: [], image: '', tags: [], updated: '2026-09-15' },
  { id: 'ITM-005', name: 'Holiday Bundle (Tee + Tote)', sku: 'BND-HOL-001', type: 'Bundle', category: 'Bundles', status: 'Published', price: 38.00, cost: 14.50, description: 'Classic tee + canvas tote bundle', incomeAccount: '4000 Product Sales', expenseAccount: '5000 COGS', taxable: true, trackInventory: false, fulfillmentType: 'Stock', stockOnHand: 0, reorderPoint: 0, supplierId: null, designId: null, channels: ['Shopify'], image: '', tags: ['Holiday'], updated: '2026-10-20' },
  { id: 'ITM-006', name: 'Blank Tee — Premium', sku: 'BLK-TEE-PREM', type: 'Blank', category: 'Blanks > T-Shirts', status: 'Published', price: 0, cost: 7.50, description: 'Premium blank tee for printing', incomeAccount: '', expenseAccount: '5000 COGS', taxable: false, trackInventory: true, fulfillmentType: 'Stock', stockOnHand: 500, reorderPoint: 100, supplierId: 'P-1003', designId: null, channels: [], image: '', tags: ['Blank'], updated: '2026-10-01' },
];

/* ═══════════════════════════════════════════════════════════════
   ENTITY 3: DOCUMENT (§1.1)
   Any multi-line transaction. Invoice, Bill, PO, Estimate, etc.
   All rendered by ONE Document Engine (§1.1 Rule).
   ═══════════════════════════════════════════════════════════════ */

export type DocumentType = 'Invoice' | 'Estimate' | 'Bill' | 'PurchaseOrder' | 'SalesReceipt' | 'CreditMemo' | 'SalesOrder' | 'VendorCredit' | 'JournalEntry' | 'RMA' | 'Expense' | 'Check';

export type DocumentStatus = 'Draft' | 'Sent' | 'Unpaid' | 'Overdue' | 'Paid' | 'Deposited' | 'ForReview' | 'Approved' | 'Shipped' | 'Delivered' | 'Returned' | 'PartiallyReceived' | 'Received' | 'Closed' | 'Void' | 'Open' | 'Converted' | 'Declined' | 'Pending' | 'Requested' | 'Fulfilled' | 'Printed' | 'Applied' | 'Posted';

export interface DocumentLine {
  id: string;
  itemId: string | null;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  taxRate: number;
  account: string;
  tags: string[];
}

export interface Document {
  id: string;
  type: DocumentType;
  number: string;
  partyId: string;
  status: DocumentStatus;
  date: string;
  dueDate: string;
  lines: DocumentLine[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  amountPaid: number;
  balance: number;
  memo: string;
  notes: string;
  tags: string[];
  attachments: string[];
  orderId: string | null;
  poId: string | null;
  channelId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activity: { date: string; type: string; text: string; actor: string }[];
}

const SEED_DOCUMENTS: Document[] = [
  {
    id: 'DOC-1001', type: 'Invoice', number: 'INV-1001', partyId: 'P-1001', status: 'Unpaid',
    date: '2026-11-01', dueDate: '2026-12-01',
    lines: [
      { id: 'L1', itemId: 'ITM-001', description: 'Classic Tee — White', qty: 10, rate: 24.99, amount: 249.90, taxRate: 8.25, account: '4000 Product Sales', tags: [] },
      { id: 'L2', itemId: 'ITM-002', description: 'Canvas Tote Bag', qty: 5, rate: 18.00, amount: 90.00, taxRate: 8.25, account: '4000 Product Sales', tags: [] },
    ],
    subtotal: 339.90, tax: 28.04, shipping: 12.00, total: 379.94, amountPaid: 0, balance: 379.94,
    memo: '', notes: 'Thank you for your business.', tags: [], attachments: [],
    orderId: null, poId: null, channelId: 'Shopify', createdBy: 'Jordan A.', createdAt: '2026-11-01', updatedAt: '2026-11-01',
    activity: [{ date: '2026-11-01', type: 'created', text: 'Invoice created', actor: 'Jordan A.' }],
  },
  {
    id: 'DOC-1002', type: 'Invoice', number: 'INV-1002', partyId: 'P-1008', status: 'Overdue',
    date: '2026-10-02', dueDate: '2026-11-01',
    lines: [
      { id: 'L1', itemId: 'ITM-004', description: 'Graphic Design Service (10 hrs)', qty: 10, rate: 75.00, amount: 750.00, taxRate: 0, account: '4100 Service Income', tags: [] },
    ],
    subtotal: 750.00, tax: 0, shipping: 0, total: 750.00, amountPaid: 0, balance: 750.00,
    memo: '', notes: '', tags: [], attachments: [],
    orderId: null, poId: null, channelId: null, createdBy: 'Sarah A.', createdAt: '2026-10-02', updatedAt: '2026-10-02',
    activity: [{ date: '2026-10-02', type: 'created', text: 'Invoice created', actor: 'Sarah A.' }, { date: '2026-10-03', type: 'sent', text: 'Invoice sent to customer', actor: 'Sarah A.' }],
  },
  {
    id: 'DOC-1003', type: 'Invoice', number: 'INV-1003', partyId: 'P-1002', status: 'Paid',
    date: '2026-09-15', dueDate: '2026-10-15',
    lines: [
      { id: 'L1', itemId: 'ITM-003', description: 'Custom Design Print (POD)', qty: 20, rate: 29.99, amount: 599.80, taxRate: 8.25, account: '4000 Product Sales', tags: ['POD'] },
    ],
    subtotal: 599.80, tax: 49.48, shipping: 15.00, total: 664.28, amountPaid: 664.28, balance: 0,
    memo: '', notes: '', tags: [], attachments: [],
    orderId: null, poId: null, channelId: 'Shopify', createdBy: 'Marcus L.', createdAt: '2026-09-15', updatedAt: '2026-09-20',
    activity: [{ date: '2026-09-15', type: 'created', text: 'Invoice created', actor: 'Marcus L.' }, { date: '2026-09-16', type: 'sent', text: 'Invoice sent', actor: 'Marcus L.' }, { date: '2026-09-20', type: 'payment', text: 'Payment received $664.28', actor: 'System' }],
  },
  {
    id: 'DOC-1004', type: 'Bill', number: 'BILL-2001', partyId: 'P-1003', status: 'ForReview',
    date: '2026-10-28', dueDate: '2026-11-27',
    lines: [
      { id: 'L1', itemId: 'ITM-006', description: 'Blank Tee — Premium (500 units)', qty: 500, rate: 7.50, amount: 3750.00, taxRate: 0, account: '5000 COGS', tags: [] },
    ],
    subtotal: 3750.00, tax: 0, shipping: 45.00, total: 3795.00, amountPaid: 0, balance: 3795.00,
    memo: '', notes: '', tags: [], attachments: [],
    orderId: null, poId: 'PO-3001', channelId: null, createdBy: 'Marcus L.', createdAt: '2026-10-28', updatedAt: '2026-10-28',
    activity: [{ date: '2026-10-28', type: 'created', text: 'Bill uploaded from email', actor: 'System' }],
  },
  {
    id: 'DOC-1005', type: 'Estimate', number: 'EST-3001', partyId: 'P-1010', status: 'Sent',
    date: '2026-10-28', dueDate: '2026-11-28',
    lines: [
      { id: 'L1', itemId: 'ITM-004', description: 'Brand identity design package', qty: 1, rate: 5000.00, amount: 5000.00, taxRate: 0, account: '4100 Service Income', tags: [] },
    ],
    subtotal: 5000.00, tax: 0, shipping: 0, total: 5000.00, amountPaid: 0, balance: 5000.00,
    memo: '', notes: 'Includes logo, color palette, typography guide', tags: [], attachments: [],
    orderId: null, poId: null, channelId: null, createdBy: 'Sarah A.', createdAt: '2026-10-28', updatedAt: '2026-10-28',
    activity: [{ date: '2026-10-28', type: 'created', text: 'Estimate created', actor: 'Sarah A.' }, { date: '2026-10-29', type: 'sent', text: 'Estimate sent to customer', actor: 'Sarah A.' }],
  },
  {
    id: 'DOC-1006', type: 'PurchaseOrder', number: 'PO-3001', partyId: 'P-1003', status: 'Open',
    date: '2026-10-15', dueDate: '2026-10-22',
    lines: [
      { id: 'L1', itemId: 'ITM-006', description: 'Blank Tee — Premium', qty: 500, rate: 7.50, amount: 3750.00, taxRate: 0, account: '5000 COGS', tags: [] },
      { id: 'L2', itemId: 'ITM-002', description: 'Canvas Tote Bag', qty: 50, rate: 6.00, amount: 300.00, taxRate: 0, account: '5000 COGS', tags: [] },
    ],
    subtotal: 4050.00, tax: 0, shipping: 45.00, total: 4095.00, amountPaid: 0, balance: 4095.00,
    memo: 'Include packing slip with PO number', notes: '', tags: [], attachments: [],
    orderId: null, poId: null, channelId: null, createdBy: 'Marcus L.', createdAt: '2026-10-15', updatedAt: '2026-10-15',
    activity: [{ date: '2026-10-15', type: 'created', text: 'PO created', actor: 'Marcus L.' }, { date: '2026-10-16', type: 'sent', text: 'PO sent to supplier', actor: 'Marcus L.' }],
  },
  {
    id: 'DOC-1007', type: 'SalesOrder', number: 'SO-1047', partyId: 'P-1001', status: 'Open',
    date: '2026-11-04', dueDate: '2026-11-08',
    lines: [
      { id: 'L1', itemId: 'ITM-001', description: 'Classic Tee — White', qty: 2, rate: 24.99, amount: 49.98, taxRate: 8.25, account: '4000 Product Sales', tags: [] },
      { id: 'L2', itemId: 'ITM-005', description: 'Holiday Bundle (Tee + Tote)', qty: 2, rate: 38.00, amount: 76.00, taxRate: 8.25, account: '4000 Product Sales', tags: [] },
    ],
    subtotal: 125.98, tax: 10.39, shipping: 6.00, total: 142.37, amountPaid: 0, balance: 142.37,
    memo: '', notes: 'Rush order — past SLA, push to supplier today', tags: [], attachments: [],
    orderId: null, poId: null, channelId: 'Shopify', createdBy: 'System', createdAt: '2026-11-04', updatedAt: '2026-11-04',
    activity: [{ date: '2026-11-04', type: 'created', text: 'Order placed on Shopify', actor: 'System' }],
  },
  {
    id: 'DOC-1008', type: 'SalesOrder', number: 'SO-1046', partyId: 'P-1002', status: 'Open',
    date: '2026-11-03', dueDate: '2026-11-07',
    lines: [
      { id: 'L1', itemId: 'ITM-003', description: 'Custom Design Print (POD)', qty: 1, rate: 29.99, amount: 29.99, taxRate: 8.25, account: '4000 Product Sales', tags: ['POD'] },
    ],
    subtotal: 29.99, tax: 2.47, shipping: 5.00, total: 37.46, amountPaid: 37.46, balance: 0,
    memo: '', notes: '', tags: [], attachments: [],
    orderId: null, poId: null, channelId: 'Etsy', createdBy: 'System', createdAt: '2026-11-03', updatedAt: '2026-11-03',
    activity: [{ date: '2026-11-03', type: 'created', text: 'Order placed on Etsy', actor: 'System' }],
  },
  {
    id: 'DOC-1009', type: 'SalesOrder', number: 'SO-1045', partyId: 'P-1008', status: 'Closed',
    date: '2026-10-28', dueDate: '2026-11-01',
    lines: [
      { id: 'L1', itemId: 'ITM-002', description: 'Canvas Tote Bag', qty: 4, rate: 18.00, amount: 72.00, taxRate: 8.25, account: '4000 Product Sales', tags: [] },
    ],
    subtotal: 72.00, tax: 5.94, shipping: 8.00, total: 85.94, amountPaid: 85.94, balance: 0,
    memo: '', notes: 'Delivered 10/30', tags: [], attachments: [],
    orderId: null, poId: null, channelId: 'TikTok', createdBy: 'System', createdAt: '2026-10-28', updatedAt: '2026-10-30',
    activity: [{ date: '2026-10-28', type: 'created', text: 'Order placed on TikTok', actor: 'System' }, { date: '2026-10-30', type: 'status', text: 'Delivered', actor: 'System' }],
  },
  {
    id: 'DOC-1010', type: 'RMA', number: 'RMA-101', partyId: 'P-1001', status: 'Requested',
    date: '2026-11-05', dueDate: '',
    lines: [
      { id: 'L1', itemId: 'ITM-001', description: 'Classic Tee — White (wrong size)', qty: 1, rate: 24.99, amount: 24.99, taxRate: 0, account: '', tags: [] },
    ],
    subtotal: 24.99, tax: 0, shipping: 0, total: 24.99, amountPaid: 0, balance: 24.99,
    memo: 'Reason: wrong size — exchange for L', notes: '', tags: [], attachments: [],
    orderId: 'DOC-1007', poId: null, channelId: 'Shopify', createdBy: 'Jordan A.', createdAt: '2026-11-05', updatedAt: '2026-11-05',
    activity: [{ date: '2026-11-05', type: 'created', text: 'RMA requested by customer', actor: 'Jordan A.' }],
  },
  {
    id: 'DOC-1011', type: 'RMA', number: 'RMA-100', partyId: 'P-1008', status: 'Approved',
    date: '2026-11-02', dueDate: '',
    lines: [
      { id: 'L1', itemId: 'ITM-002', description: 'Canvas Tote Bag (damaged in transit)', qty: 1, rate: 18.00, amount: 18.00, taxRate: 0, account: '', tags: [] },
    ],
    subtotal: 18.00, tax: 0, shipping: 0, total: 18.00, amountPaid: 0, balance: 18.00,
    memo: 'Reason: damaged — refund on receipt', notes: '', tags: [], attachments: [],
    orderId: 'DOC-1009', poId: null, channelId: 'TikTok', createdBy: 'Sarah A.', createdAt: '2026-11-02', updatedAt: '2026-11-02',
    activity: [{ date: '2026-11-02', type: 'created', text: 'RMA requested', actor: 'Sarah A.' }, { date: '2026-11-03', type: 'status', text: 'Return approved', actor: 'Sarah A.' }],
  },
];

/* ═══════════════════════════════════════════════════════════════
   ENTITY 4: MONEY MOVEMENT (§1.1)
   Payment, Deposit, Transfer, Refund.
   ═══════════════════════════════════════════════════════════════ */

export type MoneyType = 'Payment' | 'Deposit' | 'Transfer' | 'Refund' | 'Settlement';

export interface MoneyMovement {
  id: string;
  type: MoneyType;
  amount: number;
  date: string;
  method: string; // Cash, Check, ACH, Card, PayPal, etc.
  fromAccount: string;
  toAccount: string;
  partyId: string | null;
  documentId: string | null; // linked invoice/bill
  reference: string;
  status: 'Pending' | 'Deposited' | 'Cleared' | 'Reversed';
  memo: string;
  createdBy: string;
}

const SEED_MONEY: MoneyMovement[] = [
  { id: 'PAY-001', type: 'Payment', amount: 664.28, date: '2026-09-20', method: 'Card', fromAccount: 'Customer', toAccount: '1000 Checking', partyId: 'P-1002', documentId: 'DOC-1003', reference: 'ch_12345', status: 'Deposited', memo: 'Payment for INV-1003', createdBy: 'System' },
];

/* ═══════════════════════════════════════════════════════════════
   ENTITY 5: ACCOUNT (§1.1)
   Ledger node. Chart of Accounts, Bank, Credit card, etc.
   ═══════════════════════════════════════════════════════════════ */

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'COGS' | 'Expense' | 'Bank' | 'CreditCard';

export interface Account {
  id: string;
  number: string;
  name: string;
  type: AccountType;
  detailType: string;
  balance: number;
  bankBalance: number;
  active: boolean;
  parent: string | null;
  description: string;
}

const SEED_ACCOUNTS: Account[] = [
  { id: 'ACC-1000', number: '1000', name: 'Checking', type: 'Bank', detailType: 'Checking', balance: 48230.00, bankBalance: 48230.00, active: true, parent: null, description: 'Primary business checking' },
  { id: 'ACC-1010', number: '1010', name: 'Savings', type: 'Bank', detailType: 'Savings', balance: 12500.00, bankBalance: 12500.00, active: true, parent: null, description: 'Business savings' },
  { id: 'ACC-1200', number: '1200', name: 'Accounts Receivable', type: 'Asset', detailType: 'Accounts Receivable', balance: 3340.00, bankBalance: 0, active: true, parent: null, description: '' },
  { id: 'ACC-1500', number: '1500', name: 'Inventory Asset', type: 'Asset', detailType: 'Inventory', balance: 8750.00, bankBalance: 0, active: true, parent: null, description: '' },
  { id: 'ACC-2000', number: '2000', name: 'Accounts Payable', type: 'Liability', detailType: 'Accounts Payable', balance: -4762.50, bankBalance: 0, active: true, parent: null, description: '' },
  { id: 'ACC-2100', number: '2100', name: 'Sales Tax Payable', type: 'Liability', detailType: 'Sales Tax', balance: -77.52, bankBalance: 0, active: true, parent: null, description: '' },
  { id: 'ACC-3000', number: '3000', name: 'Owner\'s Equity', type: 'Equity', detailType: 'Owner\'s Equity', balance: 50000.00, bankBalance: 0, active: true, parent: null, description: '' },
  { id: 'ACC-4000', number: '4000', name: 'Product Sales', type: 'Income', detailType: 'Sales Income', balance: -128950.00, bankBalance: 0, active: true, parent: null, description: '' },
  { id: 'ACC-4100', number: '4100', name: 'Service Income', type: 'Income', detailType: 'Service Income', balance: -22500.00, bankBalance: 0, active: true, parent: null, description: '' },
  { id: 'ACC-5000', number: '5000', name: 'COGS', type: 'COGS', detailType: 'Cost of Goods Sold', balance: 48230.00, bankBalance: 0, active: true, parent: null, description: '' },
  { id: 'ACC-6000', number: '6000', name: 'Office Supplies', type: 'Expense', detailType: 'Office Supplies', balance: 1240.00, bankBalance: 0, active: true, parent: null, description: '' },
  { id: 'ACC-6100', number: '6100', name: 'Advertising', type: 'Expense', detailType: 'Advertising', balance: 30820.00, bankBalance: 0, active: true, parent: null, description: '' },
];

/* ═══════════════════════════════════════════════════════════════
   THE STORE
   ═══════════════════════════════════════════════════════════════ */

interface PlatformState {
  // Entities
  parties: Party[];
  items: Item[];
  documents: Document[];
  moneyMovements: MoneyMovement[];
  accounts: Account[];

  // Context Envelope (§1.3)
  envelope: {
    originModule: string | null;
    originRecordId: string | null;
    partyId: string | null;
    orderId: string | null;
    itemId: string | null;
    designId: string | null;
    accountId: string | null;
    channelId: string | null;
    returnTo: string | null;
  };

  // Party CRUD
  addParty: (party: Omit<Party, 'id' | 'added' | 'lastActivity'>) => string;
  updateParty: (id: string, updates: Partial<Party>) => void;
  deleteParty: (id: string) => void;
  getParty: (id: string) => Party | undefined;
  getPartiesByRole: (role: PartyRole) => Party[];
  /** Supabase → store mirror: upsert parties by id (Supabase uuids).
   *  Supabase stays the system of record; the store is a read-mirror so
   *  the document-engine pickers see live CRM records. */
  mirrorParties: (parties: Party[]) => void;

  // Item CRUD
  addItem: (item: Omit<Item, 'id' | 'updated'>) => string;
  updateItem: (id: string, updates: Partial<Item>) => void;
  deleteItem: (id: string) => void;
  getItem: (id: string) => Item | undefined;

  // Document CRUD
  addDocument: (doc: Omit<Document, 'id' | 'createdAt' | 'updatedAt' | 'activity'>) => string;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  deleteDocument: (id: string) => void;
  getDocument: (id: string) => Document | undefined;
  getDocumentsByType: (type: DocumentType) => Document[];
  getDocumentsByParty: (partyId: string) => Document[];
  recordPayment: (documentId: string, amount: number, method: string, fromAccount: string) => void;
  changeDocumentStatus: (id: string, status: DocumentStatus) => void;
  recalcDocument: (id: string) => void;

  // Money movement CRUD
  addMoney: (money: Omit<MoneyMovement, 'id'>) => string;

  // Account CRUD
  addAccount: (account: Omit<Account, 'id'>) => string;
  updateAccount: (id: string, updates: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  getAccount: (id: string) => Account | undefined;
  getAccountsByType: (type: AccountType) => Account[];

  // Document utilities
  duplicateDocument: (id: string) => string | null;
  convertDocument: (id: string, toType: DocumentType) => string | null;

  // Envelope
  setEnvelope: (env: Partial<PlatformState['envelope']>) => void;
  clearEnvelope: () => void;
}

let idCounter = Date.now();
const nextId = (prefix: string) => `${prefix}-${++idCounter}`;

/* Number prefixes per document type (matches DocumentEngine CONFIGS) */
const DOC_PREFIXES: Record<DocumentType, string> = {
  Invoice: 'INV-', Estimate: 'EST-', Bill: 'BILL-', PurchaseOrder: 'PO-',
  SalesReceipt: 'SR-', CreditMemo: 'CM-', SalesOrder: 'SO-', VendorCredit: 'VC-',
  JournalEntry: 'JE-', RMA: 'RMA-', Expense: 'EXP-', Check: 'CHK-',
};

export const usePlatformStore = create<PlatformState>()(
  persist(
    (set, get) => ({
      parties: SEED_PARTIES,
      items: SEED_ITEMS,
      documents: SEED_DOCUMENTS,
      moneyMovements: SEED_MONEY,
      accounts: SEED_ACCOUNTS,

      envelope: {
        originModule: null, originRecordId: null, partyId: null,
        orderId: null, itemId: null, designId: null,
        accountId: null, channelId: null, returnTo: null,
      },

      // ── Party CRUD ──
      addParty: (party) => {
        const id = nextId('P');
        const newParty: Party = {
          ...party, id, added: new Date().toISOString().slice(0, 10),
          lastActivity: new Date().toISOString().slice(0, 10),
        };
        set(state => ({ parties: [newParty, ...state.parties] }));
        return id;
      },
      updateParty: (id, updates) => {
        set(state => ({
          parties: state.parties.map(p => p.id === id ? { ...p, ...updates, lastActivity: new Date().toISOString().slice(0, 10) } : p),
        }));
      },
      deleteParty: (id) => {
        set(state => ({ parties: state.parties.filter(p => p.id !== id) }));
      },
      getParty: (id) => get().parties.find(p => p.id === id),
      getPartiesByRole: (role) => get().parties.filter(p => p.roles.includes(role)),

      // ── Supabase → store mirror (upsert by id) ──
      mirrorParties: (incoming) => {
        if (incoming.length === 0) return;
        set(state => {
          const byId = new Map(state.parties.map(p => [p.id, p]));
          const existingIds = new Set(state.parties.map(p => p.id));
          for (const p of incoming) {
            const prev = byId.get(p.id);
            byId.set(p.id, prev ? { ...prev, ...p } : p);
          }
          // Keep store order; mirror-newcomers go first (freshest on top).
          const fresh = incoming.filter(p => !existingIds.has(p.id));
          const updated = state.parties.map(p => byId.get(p.id) || p);
          return { parties: [...fresh, ...updated] };
        });
      },

      // ── Item CRUD ──
      addItem: (item) => {
        const id = nextId('ITM');
        const newItem: Item = { ...item, id, updated: new Date().toISOString().slice(0, 10) };
        set(state => ({ items: [newItem, ...state.items] }));
        return id;
      },
      updateItem: (id, updates) => {
        set(state => ({
          items: state.items.map(i => i.id === id ? { ...i, ...updates, updated: new Date().toISOString().slice(0, 10) } : i),
        }));
      },
      deleteItem: (id) => {
        set(state => ({ items: state.items.filter(i => i.id !== id) }));
      },
      getItem: (id) => get().items.find(i => i.id === id),

      // ── Document CRUD ──
      addDocument: (doc) => {
        const id = nextId('DOC');
        const now = new Date().toISOString();
        const newDoc: Document = {
          ...doc, id, createdAt: now, updatedAt: now,
          activity: [{ date: now.slice(0, 10), type: 'created', text: `${doc.type} created`, actor: 'Current user' }],
        };
        set(state => ({ documents: [newDoc, ...state.documents] }));
        return id;
      },
      updateDocument: (id, updates) => {
        const now = new Date().toISOString();
        set(state => ({
          documents: state.documents.map(d => d.id === id ? { ...d, ...updates, updatedAt: now } : d),
        }));
      },
      deleteDocument: (id) => {
        set(state => ({ documents: state.documents.filter(d => d.id !== id) }));
      },
      getDocument: (id) => get().documents.find(d => d.id === id),
      getDocumentsByType: (type) => get().documents.filter(d => d.type === type),
      getDocumentsByParty: (partyId) => get().documents.filter(d => d.partyId === partyId),

      recordPayment: (documentId, amount, method, fromAccount) => {
        const doc = get().documents.find(d => d.id === documentId);
        if (!doc) return;
        const newAmountPaid = doc.amountPaid + amount;
        const newBalance = doc.total - newAmountPaid;
        const newStatus = newBalance <= 0 ? 'Paid' : 'Unpaid';
        const now = new Date().toISOString();
        const payId = nextId('PAY');
        const payment: MoneyMovement = {
          id: payId, type: 'Payment', amount, date: now.slice(0, 10),
          method, fromAccount: fromAccount || 'Customer', toAccount: '1000 Checking',
          partyId: doc.partyId, documentId, reference: '', status: 'Cleared',
          memo: `Payment for ${doc.number}`, createdBy: 'Current user',
        };
        set(state => ({
          documents: state.documents.map(d => d.id === documentId ? {
            ...d, amountPaid: newAmountPaid, balance: newBalance, status: newStatus,
            updatedAt: now,
            activity: [...d.activity, { date: now.slice(0, 10), type: 'payment', text: `Payment received $${amount.toFixed(2)} via ${method}`, actor: 'Current user' }],
          } : d),
          moneyMovements: [payment, ...state.moneyMovements],
          parties: state.parties.map(p => p.id === doc.partyId ? { ...p, balance: p.balance - amount } : p),
        }));
      },

      changeDocumentStatus: (id, status) => {
        const now = new Date().toISOString();
        set(state => ({
          documents: state.documents.map(d => d.id === id ? {
            ...d, status, updatedAt: now,
            activity: [...d.activity, { date: now.slice(0, 10), type: 'status', text: `Status changed to ${status}`, actor: 'Current user' }],
          } : d),
        }));
      },

      recalcDocument: (id) => {
        set(state => ({
          documents: state.documents.map(d => {
            if (d.id !== id) return d;
            const subtotal = d.lines.reduce((s, l) => s + l.amount, 0);
            const tax = d.lines.reduce((s, l) => s + (l.amount * l.taxRate / 100), 0);
            const total = subtotal + tax + d.shipping;
            const balance = total - d.amountPaid;
            return { ...d, subtotal, tax: Math.round(tax * 100) / 100, total, balance };
          }),
        }));
      },

      // ── Money movement ──
      addMoney: (money) => {
        const id = nextId('PAY');
        set(state => ({ moneyMovements: [{ ...money, id }, ...state.moneyMovements] }));
        return id;
      },

      // ── Account ──
      addAccount: (account) => {
        const id = nextId('ACC');
        set(state => ({ accounts: [...state.accounts, { ...account, id }] }));
        return id;
      },
      updateAccount: (id, updates) => {
        set(state => ({ accounts: state.accounts.map(a => a.id === id ? { ...a, ...updates } : a) }));
      },
      deleteAccount: (id) => {
        set(state => ({ accounts: state.accounts.filter(a => a.id !== id) }));
      },
      getAccount: (id) => get().accounts.find(a => a.id === id),
      getAccountsByType: (type) => get().accounts.filter(a => a.type === type),

      // ── Document utilities ──
      duplicateDocument: (id) => {
        const src = get().documents.find(d => d.id === id);
        if (!src) return null;
        const newId = nextId('DOC');
        const now = new Date().toISOString();
        const sameTypeCount = get().documents.filter(d => d.type === src.type).length + 1002;
        const prefix = DOC_PREFIXES[src.type] || 'DOC-';
        const copy: Document = {
          ...src, id: newId, number: `${prefix}${sameTypeCount}`,
          status: 'Draft', amountPaid: 0, balance: src.total,
          date: now.slice(0, 10), dueDate: '',
          createdAt: now, updatedAt: now,
          activity: [{ date: now.slice(0, 10), type: 'created', text: `Duplicated from ${src.number}`, actor: 'Current user' }],
        };
        set(state => ({ documents: [copy, ...state.documents] }));
        return newId;
      },
      convertDocument: (id, toType) => {
        const src = get().documents.find(d => d.id === id);
        if (!src) return null;
        const newId = nextId('DOC');
        const now = new Date().toISOString();
        const sameTypeCount = get().documents.filter(d => d.type === toType).length + 1002;
        const prefix = DOC_PREFIXES[toType] || 'DOC-';
        const converted: Document = {
          ...src, id: newId, type: toType, number: `${prefix}${sameTypeCount}`,
          status: 'Draft', amountPaid: 0, balance: src.total,
          date: now.slice(0, 10), dueDate: '',
          createdAt: now, updatedAt: now,
          activity: [
            { date: now.slice(0, 10), type: 'created', text: `Converted from ${src.type} ${src.number}`, actor: 'Current user' },
          ],
        };
        set(state => ({ documents: [converted, ...state.documents] }));
        // Mark source as converted/closed if it was an Estimate
        if (src.type === 'Estimate') {
          set(state => ({
            documents: state.documents.map(d => d.id === id ? {
              ...d, status: 'Converted', updatedAt: now,
              activity: [...d.activity, { date: now.slice(0, 10), type: 'status', text: `Converted to ${toType} ${converted.number}`, actor: 'Current user' }],
            } : d),
          }));
        }
        return newId;
      },

      // ── Envelope ──
      setEnvelope: (env) => {
        set(state => ({ envelope: { ...state.envelope, ...env } }));
      },
      clearEnvelope: () => {
        set({
          envelope: {
            originModule: null, originRecordId: null, partyId: null,
            orderId: null, itemId: null, designId: null,
            accountId: null, channelId: null, returnTo: null,
          },
        });
      },
    }),
    {
      name: 'platform-store',
      version: 2, // v2: added SalesOrder + RMA seeds, Expense/Check doc types
      // Only persist the data, not the functions
      partialize: (state) => ({
        parties: state.parties,
        items: state.items,
        documents: state.documents,
        moneyMovements: state.moneyMovements,
        accounts: state.accounts,
      }),
    }
  )
);
