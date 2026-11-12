'use client';
/* dashboardController — the hook + types, split out from DashboardScreens
   so GlobalShell can import just this (tiny) without pulling in 5,725
   lines of dashboard view components on initial page load. */
import { useCallback, useMemo, useState } from 'react';
import {
  AttentionQueueItem,
  CustomerQueueItem,
  DEFAULT_PINNED_CREATE_ACTIONS,
  INITIAL_ATTENTION_QUEUE,
  INITIAL_CUSTOMER_QUEUE,
  INITIAL_SELLER_QUEUE,
  INITIAL_SETUP_STEPS,
  SellerQueueItem,
  SetupStepItem,
} from '@/data/dashboardData';

export const DASHBOARD_SCREEN_IDS = new Set<string>([
  'ops',
  'exec',
  'analytics',
  'explorer',
  'attention',
  'customer-queue',
  'seller-queue',
]);

export function useDashboardController() {
  const [setupSteps, setSetupSteps] =
    useState<SetupStepItem[]>(INITIAL_SETUP_STEPS);
  const [pinnedCreateActions, setPinnedCreateActions] = useState<string[]>(
    DEFAULT_PINNED_CREATE_ACTIONS
  );
  const [attentionItems, setAttentionItems] = useState<AttentionQueueItem[]>(
    INITIAL_ATTENTION_QUEUE
  );
  const [customerQueueItems, setCustomerQueueItems] = useState<
    CustomerQueueItem[]
  >(INITIAL_CUSTOMER_QUEUE);
  const [sellerQueueItems, setSellerQueueItems] =
    useState<SellerQueueItem[]>(INITIAL_SELLER_QUEUE);

  const [setupWizardStepIndex, setSetupWizardStepIndex] = useState<
    number | null
  >(null);
  const [customizeCreateOpen, setCustomizeCreateOpen] = useState<boolean>(false);
  const [contractorModalOpen, setContractorModalOpen] = useState<boolean>(false);
  const [quickTaskModalOpen, setQuickTaskModalOpen] = useState<boolean>(false);

  const openSetupWizard = useCallback((stepIdx = 0) => {
    setSetupWizardStepIndex(stepIdx);
  }, []);

  const closeSetupWizard = useCallback(() => {
    setSetupWizardStepIndex(null);
  }, []);

  const resolveAttentionItem = useCallback((id: string) => {
    setAttentionItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, status: 'Resolved', slaRemaining: 'Completed' }
          : it
      )
    );
  }, []);

  const addAttentionTask = useCallback((item: AttentionQueueItem) => {
    setAttentionItems((prev) => [item, ...prev]);
  }, []);

  const addSellerInvite = useCallback((item: SellerQueueItem) => {
    setSellerQueueItems((prev) => [item, ...prev]);
  }, []);

  const queueBadges = useMemo<Record<string, number>>(
    () => ({
      attention: attentionItems.filter((i) => i.status !== 'Resolved').length,
      'customer-queue': customerQueueItems.filter((i) => i.status !== 'Resolved')
        .length,
      'seller-queue': sellerQueueItems.filter((i) => i.status !== 'Approved')
        .length,
    }),
    [attentionItems, customerQueueItems, sellerQueueItems]
  );

  return {
    setupSteps,
    setSetupSteps,
    pinnedCreateActions,
    setPinnedCreateActions,
    attentionItems,
    setAttentionItems,
    customerQueueItems,
    setCustomerQueueItems,
    sellerQueueItems,
    setSellerQueueItems,
    setupWizardStepIndex,
    openSetupWizard,
    closeSetupWizard,
    customizeCreateOpen,
    setCustomizeCreateOpen,
    contractorModalOpen,
    setContractorModalOpen,
    quickTaskModalOpen,
    setQuickTaskModalOpen,
    resolveAttentionItem,
    addAttentionTask,
    addSellerInvite,
    queueBadges,
  };
}

export type DashboardController = ReturnType<typeof useDashboardController>;
