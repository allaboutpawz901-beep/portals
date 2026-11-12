'use client';

import { DemoRow, DomainKey } from '@/data/shellData';
import { ExecutiveGmvView, OperationsVitalsView } from './OverviewViews';
import { AnalyticsExplorerView, AnalyticsOverviewView } from './AnalyticsViews';
import {
  AttentionQueueView,
  CustomerQueueView,
  SellerQueueView,
} from './QueueViews';
import {
  CompanySetupWizardModal,
  ContractorInviteModal,
  CreateActionsCustomizerDrawer,
  QuickTaskModal,
} from './DashboardModals';
import type { DashboardController } from './dashboardController';

// Re-export the hook + constants + types from the split lightweight file so
// existing static imports (`from './dashboard/DashboardScreens'`) keep working.
export {
  useDashboardController,
  DASHBOARD_SCREEN_IDS,
  type DashboardController,
} from './dashboardController';

export function DashboardOverlays({
  controller,
  onToast,
}: {
  controller: DashboardController;
  onToast: (msg: string) => void;
}) {
  return (
    <>
      {controller.setupWizardStepIndex !== null && (
        <CompanySetupWizardModal
          steps={controller.setupSteps}
          initialStepIndex={controller.setupWizardStepIndex}
          onSaveSteps={controller.setSetupSteps}
          onClose={controller.closeSetupWizard}
          onToast={onToast}
        />
      )}

      {controller.customizeCreateOpen && (
        <CreateActionsCustomizerDrawer
          pinnedLabels={controller.pinnedCreateActions}
          onSave={controller.setPinnedCreateActions}
          onClose={() => controller.setCustomizeCreateOpen(false)}
          onToast={onToast}
        />
      )}

      {controller.contractorModalOpen && (
        <ContractorInviteModal
          onInvite={controller.addSellerInvite}
          onClose={() => controller.setContractorModalOpen(false)}
          onToast={onToast}
        />
      )}

      {controller.quickTaskModalOpen && (
        <QuickTaskModal
          onAddTask={controller.addAttentionTask}
          onClose={() => controller.setQuickTaskModalOpen(false)}
          onToast={onToast}
        />
      )}
    </>
  );
}

export default function DashboardScreenRenderer({
  screenId,
  controller,
  onNavigate,
  onCreate,
  onOpenCreateFlyout,
  onOpenPeek,
  onToast,
}: {
  screenId: string;
  controller: DashboardController;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onCreate: (label: string) => void;
  onOpenCreateFlyout: () => void;
  onOpenPeek: (row: DemoRow, family: string) => void;
  onToast: (msg: string) => void;
}) {
  if (screenId === 'exec') {
    // Executive GMV & Margins is folded into the ops overview — redirect to ops.
    return (
      <ExecutiveGmvView
        pinnedCreateActions={controller.pinnedCreateActions}
        onOpenCustomizeCreate={() => controller.setCustomizeCreateOpen(true)}
        onNavigate={onNavigate}
        onCreate={onCreate}
        onOpenCreateFlyout={onOpenCreateFlyout}
        onOpenPeek={onOpenPeek}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'analytics') {
    return (
      <AnalyticsOverviewView
        onNavigate={onNavigate}
        onOpenPeek={onOpenPeek}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'explorer') {
    return (
      <AnalyticsExplorerView
        onNavigate={onNavigate}
        onOpenPeek={onOpenPeek}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'attention') {
    return (
      <AttentionQueueView
        items={controller.attentionItems}
        onUpdateItems={controller.setAttentionItems}
        onOpenNewTaskModal={() => controller.setQuickTaskModalOpen(true)}
        onNavigate={onNavigate}
        onCreate={onCreate}
        onOpenPeek={onOpenPeek}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'customer-queue') {
    return (
      <CustomerQueueView
        items={controller.customerQueueItems}
        onUpdateItems={controller.setCustomerQueueItems}
        onNavigate={onNavigate}
        onCreate={onCreate}
        onOpenPeek={onOpenPeek}
        onToast={onToast}
      />
    );
  }

  if (screenId === 'seller-queue') {
    return (
      <SellerQueueView
        items={controller.sellerQueueItems}
        onUpdateItems={controller.setSellerQueueItems}
        onOpenContractorInvite={() => controller.setContractorModalOpen(true)}
        onNavigate={onNavigate}
        onCreate={onCreate}
        onOpenPeek={onOpenPeek}
        onToast={onToast}
      />
    );
  }

  return (
    <OperationsVitalsView
      setupSteps={controller.setupSteps}
      pinnedCreateActions={controller.pinnedCreateActions}
      attentionItems={controller.attentionItems}
      onOpenSetupWizard={controller.openSetupWizard}
      onOpenCustomizeCreate={() => controller.setCustomizeCreateOpen(true)}
      onResolveAttentionItem={controller.resolveAttentionItem}
      onNavigate={onNavigate}
      onCreate={onCreate}
      onOpenCreateFlyout={onOpenCreateFlyout}
      onOpenPeek={onOpenPeek}
      onToast={onToast}
    />
  );
}
