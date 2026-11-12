/**
 * Accounting types — the REAL Supabase tables for invoices, receipts,
 * estimates, bills, payment transactions, and sales orders.
 *
 * These are the source of truth for all financial documents. The
 * platformStore (Zustand) is a client-side cache; these tables are
 * where data actually lives.
 *
 * Schema verified against the live database via the REST API.
 */

// ── Invoices ──────────────────────────────────────────────────
export interface Invoice {
  id: string;
  tenant_id: string;
  customerId: string;
  bookingId: string | null;
  number: string;
  status: string; // OPEN, PAID, VOID, DRAFT, OVERDUE
  subtotal: number;
  depositPaid: number;
  balanceDue: number;
  total: number;
  amount_paid: number;
  currency: string;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  notes: string | null;
  ar_account_id: string | null;
  tax_id: string | null;
  stripeInvoiceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  id: string;
  tenant_id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  createdAt: string;
}

// ── Receipts (sales receipts — POS / instant payment) ─────────
export interface Receipt {
  id: string;
  tenant_id: string;
  number: string;
  customer_id: string;
  receipt_date: string;
  kind: string; // sale, refund
  amount: number;
  currency: string;
  method: string; // cash, check, card, stripe, etc.
  deposit_account_id: string | null;
  revenue_account_id: string | null;
  notes: string | null;
  journal_id: string | null;
  created_at: string;
}

// ── Estimates ─────────────────────────────────────────────────
export interface Estimate {
  id: string;
  tenant_id: string;
  number: string;
  customer_id: string;
  issue_date: string;
  expiry_date: string | null;
  status: string; // draft, sent, accepted, declined, expired, converted
  currency: string;
  exchange_rate: number;
  subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  terms: string | null;
  converted_invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Bills (vendor invoices — AP) ──────────────────────────────
export interface Bill {
  id: string;
  tenant_id: string;
  number: string;
  vendor_id: string;
  issue_date: string;
  due_date: string | null;
  status: string; // draft, approved, unpaid, overdue, paid, void
  currency: string;
  exchange_rate: number;
  subtotal: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  ap_account_id: string | null;
  notes: string | null;
  journal_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Payment transactions ──────────────────────────────────────
export interface PaymentTransaction {
  id: string;
  tenant_id: string;
  customer_id: string;
  booking_id: string | null;
  order_id: string | null;
  invoice_id: string | null;
  provider: string; // stripe, cash, check, ach, etc.
  provider_transaction_id: string | null;
  transaction_type: string; // PAYMENT, REFUND
  status: string; // PENDING, SUCCEEDED, PROCESSING, FAILED, CANCELLED
  amount: number;
  currency: string;
  failure_code: string | null;
  failure_message: string | null;
  metadata: Record<string, unknown> | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  deposit_account_id: string | null;
  ar_account_id: string | null;
  connected_account_id: string | null;
  application_fee_amount: number | null;
}

// ── Sales orders ──────────────────────────────────────────────
export interface SalesOrder {
  id: string;
  tenant_id: string;
  number: string;
  customer_id: string;
  issue_date: string;
  expected_date: string | null;
  status: string; // draft, open, fulfilled, closed
  currency: string;
  subtotal: number;
  tax_total: number;
  total: number;
  notes: string | null;
  converted_invoice_id: string | null;
  created_at: string;
  updated_at: string;
  erp_order_id: string | null;
}

// ── Unified transaction row for the customer profile table ────
// Combines invoices, receipts, estimates, bills, sales orders into
// one shape the Transaction List tab can render uniformly.
export interface CustomerTransaction {
  id: string;
  type: 'Invoice' | 'Receipt' | 'Estimate' | 'Bill' | 'SalesOrder' | 'Payment';
  number: string;
  date: string;
  total: number;
  status: string;
  balance: number;
  memo: string | null;
}
