import type { DomainKey } from '@/data/shellData';

/**
 * Shared prop contract for all Business Tax screens.
 * Wired in ScreenContent.tsx TabScreenRenderer.
 */
export interface BusinessTaxScreenProps {
  /** Navigate the shell to a screen in a domain. */
  onNavigate: (domain: DomainKey, screenId: string) => void;
  /** Show a transient toast message in the shell. */
  onToast: (message: string) => void;
  /** Trigger a Create action (opens RecordDrawer). */
  onCreate: (label: string) => void;
  /** Open the global Create flyout (filtered to Business Tax). */
  onOpenCreateFlyout: () => void;
}

/**
 * Navigation targets used by Business Tax screens.
 * Each returns a [domain, screenId] tuple for onNavigate.
 */
export const TAX_NAV = {
  overview: () => ['finance', 'tax-overview'] as const,
  summary: () => ['finance', 'tax-summary'] as const,
  filing: () => ['finance', 'tax-filing'] as const,
  coa: () => ['finance', 'coa'] as const,
  reports: () => ['finance', 'quick-view'] as const,
  reconcile: () => ['finance', 'reconcile'] as const,
  bank: () => ['finance', 'bank'] as const,
} as const;

/**
 * Compute whole days from "today" (local, midnight) to an ISO date string.
 * Negative = past. Used by deadline countdowns.
 */
export function daysUntil(isoDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(isoDate + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Format a deadline status from a day count. */
export type DeadlineTone = 'past' | 'urgent' | 'soon' | 'far';
export function deadlineTone(days: number): DeadlineTone {
  if (days < 0) return 'past';
  if (days <= 14) return 'urgent';
  if (days <= 60) return 'soon';
  return 'far';
}
