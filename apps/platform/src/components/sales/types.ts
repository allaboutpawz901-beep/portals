import type { DomainKey, DemoRow } from '@/data/shellData';

/**
 * Shared prop contract for all Sales screens.
 * Wired in ScreenContent.tsx TabScreenRenderer.
 */
export interface SalesScreenProps {
  /** Navigate the shell to a screen in a domain. */
  onNavigate: (domain: DomainKey, screenId: string) => void;
  /** Show a transient toast message in the shell. */
  onToast: (message: string) => void;
  /** Trigger a Create action (opens RecordDrawer). */
  onCreate: (label: string) => void;
  /** Open the global Create flyout (filtered to Sales & Get Paid). */
  onOpenCreateFlyout: () => void;
  /** Open the peek drawer for a row (family labels the source list). */
  onOpenPeek?: (row: DemoRow, family: string) => void;
}

/**
 * Navigation targets used by Sales screens.
 * Each returns a [domain, screenId] tuple for onNavigate.
 */
export const SALES_NAV = {
  overview: () => ['finance', 'sales-overview'] as const,
  transactions: () => ['finance', 'sales-transactions'] as const,
  invoices: () => ['finance', 'invoices'] as const,
  estimates: () => ['finance', 'estimates'] as const,
  paymentLinks: () => ['finance', 'payment-links'] as const,
  products: () => ['finance', 'products'] as const,
  customers: () => ['contacts', 'customers'] as const,
  customerOverview: () => ['contacts', 'crm-overview'] as const,
  coa: () => ['finance', 'coa'] as const,
  reports: () => ['finance', 'quick-view'] as const,
} as const;
