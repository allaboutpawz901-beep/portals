import type { DomainKey } from '@/data/shellData';

/**
 * Shared prop contract for all Expenses & Bills screens.
 * Wired in ScreenContent.tsx TabScreenRenderer.
 *
 * Source-of-truth HTML files (upload/):
 *   - Expenses & Bills — Overview.html  → bills-overview
 *   - Bills.html                       → bills
 *   - Pay bills.html                   → bill_payments
 *   - Vendors.html                     → vendors
 *   - Purchase order.html              → purchase-orders
 */
export interface ExpensesBillsScreenProps {
  /** Navigate the shell to a screen in a domain. */
  onNavigate: (domain: DomainKey, screenId: string) => void;
  /** Show a transient toast message in the shell. */
  onToast: (message: string) => void;
  /** Trigger a Create action (opens RecordDrawer). */
  onCreate: (label: string) => void;
  /** Open the global Create flyout. */
  onOpenCreateFlyout: () => void;
}

/**
 * Navigation targets used by Expenses & Bills screens.
 * Each returns a [domain, screenId] tuple for onNavigate.
 */
export const EBL_NAV = {
  overview: () => ['finance', 'bills-overview'] as const,
  bills: () => ['finance', 'bills'] as const,
  payBills: () => ['finance', 'bill-payments'] as const,
  vendors: () => ['finance', 'vendors'] as const,
  purchaseOrders: () => ['finance', 'purchase-orders'] as const,
  expenses: () => ['finance', 'expenses'] as const,
  receipts: () => ['finance', 'receipts'] as const,
  coa: () => ['finance', 'coa'] as const,
  reports: () => ['finance', 'quick-view'] as const,
} as const;
