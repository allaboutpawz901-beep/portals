import type { DomainKey } from '@/data/shellData';

/**
 * Shared prop contract for Statements screens.
 * Wired in ScreenContent.tsx TabScreenRenderer.
 *
 * Source-of-truth HTML (upload/):
 *   - statements.html → statements
 */
export interface StatementsScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (message: string) => void;
  onCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
}

/** Navigation targets used by Statements screens. */
export const STMT_NAV = {
  customers: () => ['contacts', 'customers'] as const,
  invoices: () => ['finance', 'invoices'] as const,
  parties: () => ['contacts', 'parties'] as const,
  customerOverview: () => ['contacts', 'crm-overview'] as const,
} as const;
