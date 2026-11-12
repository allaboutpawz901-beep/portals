// Orders module data — derived live from the platform store (§1.1).
// Orders/POs/RMAs are Documents; inventory rows are Items. Fulfillment
// queues and carriers remain operational seeds.
import { usePlatformStore } from '@/lib/platformStore';

export interface OrderRow {
  docId: string;     // store document id — for mutations
  id: string;        // display id (#1047)
  customer: string;
  items: string;
  supplier: string;
  total: string;
  sla: string;
  slaPast: boolean;
  status: 'Unfulfilled' | 'Ready to Ship' | 'Local Pickup' | 'Shipped' | 'Delivered';
}

/* Orders = SalesOrder documents in the shared store */
export function getOrders(): OrderRow[] {
  const store = usePlatformStore.getState();
  return store.documents
    .filter(d => d.type === 'SalesOrder')
    .map(d => {
      const party = store.getParty(d.partyId);
      const firstItem = d.lines[0]?.itemId ? store.getItem(d.lines[0].itemId) : null;
      const supplier = firstItem?.supplierId ? store.getParty(firstItem.supplierId)?.name || '—' : '—';
      const items = d.lines.map(l => `${l.description.split(' — ')[0]} ×${l.qty}`).join(', ');
      const due = d.dueDate || d.date;
      const slaPast = new Date(due) < new Date('2026-11-06');
      const status: OrderRow['status'] =
        d.status === 'Closed' ? 'Delivered'
        : d.status === 'Fulfilled' ? 'Shipped'
        : d.amountPaid > 0 ? 'Ready to Ship'
        : 'Unfulfilled';
      return {
        docId: d.id,
        id: `#${d.number.replace('SO-', '')}`,
        customer: party?.name || '—',
        items: items || '—',
        supplier,
        total: `$${d.total.toFixed(2)}`,
        sla: slaPast ? 'Past SLA' : `${Math.max(0, Math.round((new Date(due).getTime() - new Date('2026-11-06').getTime()) / 86400000))}d left`,
        slaPast,
        status,
      };
    });
}

export const ORDER_TABS = ['All', 'Unfulfilled', 'Ready to Ship', 'Local Pickup', 'Shipped', 'Delivered'] as const;

export interface PurchaseOrderRow {
  docId: string;     // store document id — for mutations
  id: string;
  supplier: string;
  supplierInitial: string;
  items: string;
  ordered: string;
  expected: string;
  expectedOverdue: boolean;
  total: string;
  status: 'Draft' | 'Confirmed' | 'Receiving' | 'Received' | 'Overdue';
}

/* Purchase orders = PurchaseOrder documents */
export function getPurchaseOrders(): PurchaseOrderRow[] {
  const store = usePlatformStore.getState();
  return store.documents
    .filter(d => d.type === 'PurchaseOrder')
    .map(d => {
      const supplier = store.getParty(d.partyId);
      const units = d.lines.reduce((s, l) => s + l.qty, 0);
      const status: PurchaseOrderRow['status'] =
        d.status === 'Draft' ? 'Draft'
        : d.status === 'PartiallyReceived' ? 'Receiving'
        : d.status === 'Received' ? 'Received'
        : 'Confirmed';
      const expected = d.dueDate || d.date;
      return {
        docId: d.id,
        id: d.number,
        supplier: supplier?.name || '—',
        supplierInitial: (supplier?.name || '?')[0].toUpperCase(),
        items: `${d.lines.length} line${d.lines.length !== 1 ? 's' : ''} · ${units} units`,
        ordered: d.date.slice(5).replace('-', '/'),
        expected: expected.slice(5).replace('-', '/'),
        expectedOverdue: new Date(expected) < new Date('2026-11-06') && status !== 'Received',
        total: `$${d.total.toFixed(2)}`,
        status,
      };
    });
}

export const PO_TABS = ['All', 'Draft', 'Confirmed', 'Receiving', 'Received'] as const;

export interface ReturnRow {
  docId: string;     // store document id — for mutations
  id: string;
  customer: string;
  order: string;
  reason: string;
  refund: string;
  status: 'Requested' | 'Approved' | 'In transit' | 'Received' | 'Refunded' | 'Declined';
  type: 'Customer return' | 'Supplier claim';
}

/* Returns = RMA documents */
export function getReturns(): ReturnRow[] {
  const store = usePlatformStore.getState();
  return store.documents
    .filter(d => d.type === 'RMA')
    .map(d => {
      const party = store.getParty(d.partyId);
      const order = d.orderId ? store.getDocument(d.orderId) : null;
      const reason = (d.memo || '').replace(/^Reason: /, '').split(' — ')[0] || 'Return';
      const status: ReturnRow['status'] =
        ['Requested', 'Approved', 'In transit', 'Received', 'Refunded', 'Declined'].includes(d.status)
          ? (d.status as ReturnRow['status'])
          : 'Requested';
      return {
        docId: d.id,
        id: d.number,
        customer: party?.name || '—',
        order: order ? `#${order.number.replace('SO-', '')}` : '—',
        reason,
        refund: `$${d.total.toFixed(2)}`,
        status,
        type: 'Customer return',
      };
    });
}

export const RETURN_TABS = ['All', 'Requested', 'Approved', 'In transit', 'Received', 'Refunded', 'Declined'] as const;

export interface FulfillmentRow {
  id: string;
  customer: string;
  items: string;
  type: 'Ship' | 'Pickup';
  shipBy: string;
  pastSla: boolean;
  status: 'Ready' | 'Unfulfilled' | 'Shipped' | 'Picked up';
}

export const WAREHOUSE_QUEUE: FulfillmentRow[] = [
  { id: '#1046', customer: 'Blue Ridge Co.', items: 'Hoodie — Heavyweight — L / Black · HD-211 · ×1', type: 'Ship', shipBy: 'Today · 4 PM', pastSla: false, status: 'Ready' },
  { id: '#1041', customer: 'Acme Corp', items: 'Canvas Tote · TOTE-014 · ×3', type: 'Ship', shipBy: 'Today · 4 PM', pastSla: false, status: 'Ready' },
  { id: '#1045', customer: 'Northwind Labs', items: 'Mug 11oz · MUG-003 · ×4', type: 'Pickup', shipBy: 'Today · 5 PM', pastSla: false, status: 'Ready' },
  { id: '#1047', customer: 'Acme Corp', items: 'Hoodie · HD-211 · ×2', type: 'Ship', shipBy: 'Past SLA', pastSla: true, status: 'Unfulfilled' },
  { id: '#1042', customer: 'Lakeside Design', items: 'Classic Tee · TEE-001 · ×2', type: 'Ship', shipBy: 'Past SLA', pastSla: true, status: 'Unfulfilled' },
];

export const WAREHOUSE_TABS = ['All', 'Ready to Ship', 'Local Pickup', 'Unfulfilled'] as const;

export interface DropShipRow {
  id: string;
  customer: string;
  supplier: string;
  supplierInitial: string;
  tracking: string;
  eta: string;
  status: 'In transit' | 'Delivered' | 'Received';
}

export const DROP_SHIP_QUEUE: DropShipRow[] = [
  { id: '#1044', customer: 'Orion Apparel', supplier: 'Printful', supplierInitial: 'P', tracking: '9400 1082 0549…', eta: 'ETA 11/05', status: 'In transit' },
  { id: '#1039', customer: 'Blue Ridge Co.', supplier: 'Gelato', supplierInitial: 'G', tracking: '1Z W1A 8E2…', eta: 'ETA 11/04', status: 'In transit' },
  { id: '#1031', customer: 'Northwind Labs', supplier: 'Printify', supplierInitial: 'P', tracking: '9405 5036 9922…', eta: 'Delivered 10/30', status: 'Delivered' },
  { id: '#1024', customer: 'Acme Corp', supplier: 'Printful', supplierInitial: 'P', tracking: 'Confirmed received', eta: '', status: 'Received' },
];

export const DROPSHIP_TABS = ['All', 'In transit', 'Delivered', 'Received'] as const;

export interface InventoryRow {
  sku: string;
  product: string;
  warehouse: string;
  bin: string;
  onHand: number;
  committed: number;
  available: number;
  reorderPoint: number;
  status: 'In stock' | 'Low stock' | 'Out of stock';
}

/* Inventory = tracked Items in the store, committed = open order lines */
export function getInventory(): InventoryRow[] {
  const store = usePlatformStore.getState();
  const committedByItem: Record<string, number> = {};
  store.documents
    .filter(d => d.type === 'SalesOrder' && d.status === 'Open')
    .forEach(d => d.lines.forEach(l => { if (l.itemId) committedByItem[l.itemId] = (committedByItem[l.itemId] || 0) + l.qty; }));
  return store.items
    .filter(i => i.trackInventory)
    .map(i => {
      const committed = committedByItem[i.id] || 0;
      const available = i.stockOnHand - committed;
      const status: InventoryRow['status'] = i.stockOnHand === 0 ? 'Out of stock' : i.stockOnHand <= i.reorderPoint ? 'Low stock' : 'In stock';
      return {
        sku: i.sku,
        product: i.name,
        warehouse: 'Charlotte',
        bin: '—',
        onHand: i.stockOnHand,
        committed,
        available,
        reorderPoint: i.reorderPoint,
        status,
      };
    });
}

export const INVENTORY_TABS = ['All', 'In stock', 'Low stock', 'Out of stock'] as const;

export interface CarrierRow {
  id: string;
  carrier: string;
  badge: string;
  account: string;
  services: string;
  avgRate: string;
  status: 'Connected' | 'Needs auth' | 'Disconnected';
}

export const CARRIERS: CarrierRow[] = [
  { id: 'usps', carrier: 'USPS', badge: 'USPS', account: 'USPS-8842', services: 'Ground Advantage, Priority Mail', avgRate: '$6.20', status: 'Connected' },
  { id: 'ups', carrier: 'UPS', badge: 'UPS', account: 'UPS-44120', services: 'Ground, 2nd Day Air', avgRate: '$9.40', status: 'Connected' },
  { id: 'fedex', carrier: 'FedEx', badge: 'FedEx', account: 'FDX-93841', services: 'Ground, Express Saver', avgRate: '—', status: 'Needs auth' },
  { id: 'dhl', carrier: 'DHL Express', badge: 'DHL', account: 'Not connected', services: 'Express Worldwide', avgRate: '—', status: 'Disconnected' },
];

export const SHIPPING_TABS = ['Carriers', 'Packaging', 'Rules'] as const;

export interface BatchOrder {
  id: string;
  customer: string;
  items: string;
  method: string;
  checked: boolean;
  pastSla: boolean;
}

export const BATCH_ORDERS: BatchOrder[] = [
  { id: '#1046', customer: 'Blue Ridge Co.', items: 'Hoodie ×1', method: 'USPS Priority', checked: true, pastSla: false },
  { id: '#1041', customer: 'Acme Corp', items: 'Canvas Tote ×3', method: 'USPS Ground', checked: true, pastSla: false },
  { id: '#1045', customer: 'Northwind Labs', items: 'Mug 11oz ×4 · Local pickup', method: 'Pickup', checked: true, pastSla: false },
  { id: '#1042', customer: 'Lakeside Design', items: 'Hoodie ×1 · past SLA', method: 'USPS Ground', checked: false, pastSla: true },
];

// Avatar color helper
export function avatarColor(name: string): string {
  const colors = ['bg-qb-blue', 'bg-qb-green', 'bg-qb-teal', 'bg-qb-maroon', 'bg-qb-navy'];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}
