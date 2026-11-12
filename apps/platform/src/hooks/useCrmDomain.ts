'use client';

import { useState, useEffect } from 'react';
import type {
  CrmLeadRow,
  CrmAppointmentRow,
  CrmSegmentRow,
  CrmMessageTemplateRow,
  CrmConversationRow,
  CrmMessageRow,
  CrmDealRow,
  CrmPipelineRow,
  CrmPipelineStageRow,
  CrmStaffRow,
  CrmServiceRow,
  CrmLocationRow,
  CrmHouseholdRow,
  CrmDependentRow,
  CrmTagRow,
  CrmCampaignRow,
  CrmSequenceRow,
  CrmWaitlistRow,
  CrmNeedsAttentionRow,
  CrmActivityRow,
  CrmCallRow,
  CrmDocumentRow,
  CrmDocumentTypeRow,
  CrmLeadSourceRow,
  CrmOperatingHoursRow,
  CrmHolidayBlackoutRow,
  CrmBookingPolicyRow,
  CrmStaffAvailabilityRow,
  CrmStaffShiftRow,
  CrmCommissionPlanRow,
  CrmAuditLogRow,
  CrmSavedViewRow,
  CrmSettingsRow,
  CrmPermanentAlertRow,
  CrmCustomerBehaviorRow,
  CrmCommunicationPreferenceRow,
  CrmCustomerContactMethodRow,
  CrmCustomerPreferenceRow,
  CrmRouteRow,
  CrmRouteStopRow,
  CrmAppointmentResourceRow,
  CrmShiftTemplateRow,
  CrmTimeOffRequestRow,
  CrmStaffDocumentRow,
  CrmStaffPerformanceNoteRow,
  CrmStaffIncidentReportRow,
  CrmStaffTimeClockEntryRow,
  CrmCommissionEntryRow,
  CrmProductRecommendationRow,
  CrmSurchargeRow,
  CrmPricingRuleRow,
  CrmSequenceStepRow,
  CrmAppointmentServiceRow,
  CrmSegmentMembershipRow,
} from '@/lib/crmTypes';
import type { Bill, SalesOrder } from '@/lib/accountingTypes';

/**
 * useCrmDomain — a generic hook factory for CRM Supabase tables.
 * Each domain gets its own hook that:
 *  1. Fetches from /api/crm/{domain} on mount
 *  2. Supports an optional parentId filter (customer_id, lead_id, etc.)
 *  3. Exposes refresh() to re-fetch on demand
 *  4. Returns { data, loaded, error, refresh }
 */

async function fetchJson<T>(url: string): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) return { error: json?.error?.message || `HTTP ${res.status}` };
    return { data: json.data as T };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}

function makeHook<T>(basePath: string) {
  return function useDomain(parentId?: string, parentField = 'customer_id') {
    const [data, setData] = useState<T[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
      let cancelled = false;
      setLoaded(false);
      const url = parentId
        ? `/api/crm/${basePath}?${parentField}=${encodeURIComponent(parentId)}`
        : `/api/crm/${basePath}`;
      fetchJson<T[]>(url).then((res) => {
        if (cancelled) return;
        setData(res.data ?? []);
        setError(res.error ?? null);
        setLoaded(true);
      });
      return () => { cancelled = true; };
    }, [parentId, parentField, nonce]);

    return { data, loaded, error, refresh: () => setNonce((n) => n + 1) };
  };
}

// ── Lead pipeline ────────────────────────────────────────────
export const useLeads = makeHook<CrmLeadRow>('leads');
export const useLeadSources = makeHook<CrmLeadSourceRow>('lead-sources');

// ── Appointments ─────────────────────────────────────────────
export const useAppointments = makeHook<CrmAppointmentRow>('appointments');
export const useAppointmentServices = makeHook<CrmAppointmentServiceRow>('appointment-services');
export const useAppointmentResources = makeHook<CrmAppointmentResourceRow>('appointment-resources');
export const useBookingPolicies = makeHook<CrmBookingPolicyRow>('booking-policies');
export const useOperatingHours = makeHook<CrmOperatingHoursRow>('operating-hours');
export const useHolidayBlackouts = makeHook<CrmHolidayBlackoutRow>('holiday-blackouts');

// ── Segments ─────────────────────────────────────────────────
export const useSegments = makeHook<CrmSegmentRow>('segments');
export const useSegmentMemberships = makeHook<CrmSegmentMembershipRow>('segment-memberships');

// ── Templates ────────────────────────────────────────────────
export const useMessageTemplates = makeHook<CrmMessageTemplateRow>('templates');

// ── Conversations + Messages ────────────────────────────────
export const useConversations = makeHook<CrmConversationRow>('conversations');
export const useMessages = makeHook<CrmMessageRow>('messages');

// ── Deals + Pipelines ────────────────────────────────────────
export const useDeals = makeHook<CrmDealRow>('deals');
export const usePipelines = makeHook<CrmPipelineRow>('pipelines');
export const usePipelineStages = makeHook<CrmPipelineStageRow>('pipeline-stages');

// ── Campaigns + Sequences ────────────────────────────────────
export const useCampaigns = makeHook<CrmCampaignRow>('campaigns');
export const useSequences = makeHook<CrmSequenceRow>('sequences');
export const useSequenceSteps = makeHook<CrmSequenceStepRow>('sequence-steps');

// ── Staff ────────────────────────────────────────────────────
export const useStaff = makeHook<CrmStaffRow>('staff');
export const useStaffAvailability = makeHook<CrmStaffAvailabilityRow>('staff-availability');
export const useStaffShifts = makeHook<CrmStaffShiftRow>('staff-shifts');
export const useStaffDocuments = makeHook<CrmStaffDocumentRow>('staff-documents');
export const useStaffPerformanceNotes = makeHook<CrmStaffPerformanceNoteRow>('staff-performance-notes');
export const useStaffIncidentReports = makeHook<CrmStaffIncidentReportRow>('staff-incident-reports');
export const useStaffTimeClockEntries = makeHook<CrmStaffTimeClockEntryRow>('staff-time-clock-entries');
export const useTimeOffRequests = makeHook<CrmTimeOffRequestRow>('time-off-requests');
export const useShiftTemplates = makeHook<CrmShiftTemplateRow>('shift-templates');

// ── Services + Locations ─────────────────────────────────────
export const useServices = makeHook<CrmServiceRow>('services');
export const useLocations = makeHook<CrmLocationRow>('locations');
export const useSurcharges = makeHook<CrmSurchargeRow>('surcharges');
export const usePricingRules = makeHook<CrmPricingRuleRow>('pricing-rules');

// ── Households + Dependents ──────────────────────────────────
export const useHouseholds = makeHook<CrmHouseholdRow>('households');
export const useDependents = makeHook<CrmDependentRow>('dependents');

// ── Tags ─────────────────────────────────────────────────────
export const useTags = makeHook<CrmTagRow>('tags');

// ── Waitlist + Needs Attention ───────────────────────────────
export const useWaitlist = makeHook<CrmWaitlistRow>('waitlist');
export const useNeedsAttention = makeHook<CrmNeedsAttentionRow>('needs-attention');

// ── Activity + Calls ─────────────────────────────────────────
export const useActivities = makeHook<CrmActivityRow>('activity');
export const useCalls = makeHook<CrmCallRow>('calls');

// ── Documents ────────────────────────────────────────────────
export const useDocuments = makeHook<CrmDocumentRow>('documents');
export const useDocumentTypes = makeHook<CrmDocumentTypeRow>('document-types');

// ── Commissions ─────────────────────────────────────────────
export const useCommissionPlans = makeHook<CrmCommissionPlanRow>('commission-plans');
export const useCommissionEntries = makeHook<CrmCommissionEntryRow>('commission-entries');

// ── Routes ───────────────────────────────────────────────────
export const useRoutes = makeHook<CrmRouteRow>('routes');
export const useRouteStops = makeHook<CrmRouteStopRow>('route-stops');

// ── Accounting (bills, sales orders) ────────────────────────
export const useBills = makeHook<Bill>('bills', 'vendor_id');
export const useSalesOrders = makeHook<SalesOrder>('sales_orders', 'customer_id');

// ── Customer-specific (behavior, preferences, alerts) ───────
export const useCustomerBehavior = makeHook<CrmCustomerBehaviorRow>('customer-behavior');
export const useCustomerPreferences = makeHook<CrmCustomerPreferenceRow>('customer-preferences');
export const usePermanentAlerts = makeHook<CrmPermanentAlertRow>('permanent-alerts');
export const useCommunicationPreferences = makeHook<CrmCommunicationPreferenceRow>('communication-preferences');
export const useCustomerContactMethods = makeHook<CrmCustomerContactMethodRow>('customer-contact-methods');

// ── Product recommendations ──────────────────────────────────
export const useProductRecommendations = makeHook<CrmProductRecommendationRow>('product-recommendations');

// ── Admin: audit log, saved views, settings ──────────────────
export const useAuditLog = makeHook<CrmAuditLogRow>('audit-log');
export const useSavedViews = makeHook<CrmSavedViewRow>('saved-views');
export const useCrmSettings = makeHook<CrmSettingsRow>('settings');

// ── Generic CRUD mutation helper ─────────────────────────────
export async function createCrmRow<T>(domain: string, body: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(`/api/crm/${domain}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) return { error: json?.error?.message || `HTTP ${res.status}` };
    return { data: json.data as T };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function updateCrmRow<T>(domain: string, id: string, updates: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(`/api/crm/${domain}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const json = await res.json();
    if (!res.ok) return { error: json?.error?.message || `HTTP ${res.status}` };
    return { data: json.data as T };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function deleteCrmRow(domain: string, id: string): Promise<{ error?: string }> {
  try {
    const res = await fetch(`/api/crm/${domain}/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) return { error: json?.error?.message || `HTTP ${res.status}` };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}
