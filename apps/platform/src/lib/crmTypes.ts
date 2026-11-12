/**
 * CRM Types — TypeScript interfaces for every CRM Supabase table.
 * Verified against the live database schema via REST API.
 * These are the source of truth for all CRM data in the app.
 */

// ── Customers (crm_customers) ─────────────────────────────────
export interface CrmCustomerRow {
  id: string;
  tenant_id: string;
  household_id: string | null;
  source_customer_id: string | null;
  external_customer_number: string | null;
  customer_type: string;
  lifecycle_stage: string;
  lifecycle_status: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  date_of_birth: string | null;
  pronouns: string | null;
  preferred_contact_method: string | null;
  preferred_language: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string;
  lead_source_id: string | null;
  lead_owner_id: string | null;
  assigned_staff_id: string | null;
  preferred_location_id: string | null;
  customer_since: string | null;
  first_contact_at: string | null;
  last_activity_at: string | null;
  next_follow_up_at: string | null;
  last_visit_at: string | null;
  next_appointment_at: string | null;
  total_visits: number;
  lifetime_value: number;
  average_ticket: number;
  average_visit_frequency_days: number;
  no_show_rate: number;
  cancellation_rate: number;
  rebook_rate: number;
  outstanding_balance: number;
  total_spend_30d: number;
  total_spend_365d: number;
  marketing_email_opt_in: boolean;
  marketing_sms_opt_in: boolean;
  transactional_email_opt_in: boolean;
  transactional_sms_opt_in: boolean;
  do_not_call: boolean;
  do_not_contact: boolean;
  is_active: boolean;
  archived_at: string | null;
  merged_into_customer_id: string | null;
  created_at: string;
  updated_at: string;
  lead_status: string | null;
  conversion_date: string | null;
  preferred_staff_id: string | null;
  party_id: string | null;
}

// ── Leads (crm_leads) ─────────────────────────────────────────
export interface CrmLeadRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  lead_owner_id: string | null;
  lead_source_id: string | null;
  status: string;
  booking_outcome: string | null;
  lost_reason: string | null;
  first_contact_at: string | null;
  last_activity_at: string | null;
  next_follow_up_at: string | null;
  conversion_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  lead_source: string | null;
  lead_type: string | null;
  party_id: string | null;
  score: number | null;
  priority: string | null;
  scored_at: string | null;
}

// ── Appointments (crm_appointments) ───────────────────────────
export interface CrmAppointmentRow {
  id: string;
  tenant_id: string;
  appointment_number: string;
  customer_id: string;
  dependent_id: string | null;
  location_id: string | null;
  staff_id: string | null;
  resource_id: string | null;
  service_id: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  block_starts_at: string | null;
  block_ends_at: string | null;
  timezone: string;
  source_channel: string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  late_cancel: boolean;
  confirmed_at: string | null;
  checked_in_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  no_show_at: string | null;
  rescheduled_from_id: string | null;
  deposit_id: string | null;
  estimate_id: string | null;
  invoice_id: string | null;
  sale_id: string | null;
  erp_order_id: string | null;
  estimated_total: number | null;
  idempotency_key: string | null;
  created_by: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── Appointment services ─────────────────────────────────────
export interface CrmAppointmentServiceRow {
  id: string;
  tenant_id: string;
  appointment_id: string;
  dependent_id: string | null;
  service_id: string;
  staff_id: string | null;
  quantity: number;
  duration_minutes: number;
  unit_price: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  status: string;
  created_at: string;
}

// ── Segments (crm_segments) ──────────────────────────────────
export interface CrmSegmentRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  entity_type: string;
  definition: Record<string, unknown> | null;
  segment_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmSegmentMembershipRow {
  id: string;
  tenant_id: string;
  segment_id: string;
  customer_id: string;
  entered_at: string;
  exited_at: string | null;
  dependent_id: string | null;
}

// ── Message templates (crm_message_templates) ────────────────
export interface CrmMessageTemplateRow {
  id: string;
  tenant_id: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: string[] | null;
  category: string | null;
  is_system: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Conversations (crm_conversations) ─────────────────────────
export interface CrmConversationRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  channel: string;
  status: string;
  assigned_staff_id: string | null;
  subject: string | null;
  started_at: string;
  last_message_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  dependent_id: string | null;
}

// ── Messages (crm_messages) ───────────────────────────────────
export interface CrmMessageRow {
  id: string;
  tenant_id: string;
  conversation_id: string | null;
  customer_id: string | null;
  channel: string;
  direction: string;
  status: string;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  body: string;
  template_id: string | null;
  provider: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  external_message_id: string | null;
  rfc822_message_id: string | null;
  in_reply_to: string | null;
  email_references: string | null;
  raw_source_ref: string | null;
  cc_addresses: string | null;
  bcc_addresses: string | null;
  body_text: string | null;
  body_html: string | null;
  quoted_content_stripped: boolean;
  authored_by_staff_id: string | null;
  is_auto_reply: boolean;
  is_system_generated: boolean;
  delivery_status: string | null;
  bounce_reason: string | null;
}

// ── Deals (crm_deals) ─────────────────────────────────────────
export interface CrmDealRow {
  id: string;
  tenant_id: string;
  deal_number: string;
  name: string;
  pipeline_id: string;
  stage_id: string | null;
  status: string;
  customer_id: string | null;
  lead_id: string | null;
  dependent_id: string | null;
  owner_staff_id: string | null;
  amount: number;
  currency: string;
  probability: number;
  expected_close_date: string | null;
  source: string | null;
  lost_reason: string | null;
  won_at: string | null;
  lost_at: string | null;
  stage_entered_at: string | null;
  last_activity_at: string | null;
  estimate_id: string | null;
  order_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Pipelines (crm_pipelines, crm_pipeline_stages) ───────────
export interface CrmPipelineRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  currency: string;
  pack_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmPipelineStageRow {
  id: string;
  tenant_id: string;
  pipeline_id: string;
  name: string;
  sort_order: number;
  probability: number;
  stage_kind: string;
  rotting_days: number | null;
  created_at: string;
}

// ── Staff (crm_staff) ─────────────────────────────────────────
export interface CrmStaffRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  role: string;
  is_service_staff: boolean;
  is_active: boolean;
  default_location_id: string | null;
  color_label: string | null;
  hire_date: string | null;
  termination_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  image_url: string | null;
  bio: string | null;
  service_specialties: string[] | null;
  certifications: string[] | null;
  show_on_website: boolean;
  max_daily_appointments: number | null;
  commission_rate: number | null;
  salary_period: string | null;
  register_pin_hash: string | null;
  party_id: string | null;
}

// ── Services (crm_services) ───────────────────────────────────
export interface CrmServiceRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  description: string | null;
  category: string;
  default_duration_minutes: number;
  default_price: number;
  deposit_required: boolean;
  default_deposit_amount: number | null;
  rebooking_interval_days: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  service_category: string | null;
  is_add_on: boolean;
  parent_service_id: string | null;
  bookable_online: boolean;
  image_url: string | null;
}

// ── Locations (crm_locations) ─────────────────────────────────
export interface CrmLocationRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone: string | null;
  email: string | null;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Households (crm_households) ───────────────────────────────
export interface CrmHouseholdRow {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  primary_customer_id: string | null;
  source_household_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Dependents (crm_dependents) ───────────────────────────────
export interface CrmDependentRow {
  id: string;
  tenant_id: string;
  primary_customer_id: string;
  dependent_type: string;
  name: string;
  date_of_birth: string | null;
  attributes: Record<string, unknown> | null;
  notes: string | null;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  record_type_id: string | null;
  identifier: string | null;
  status: string | null;
  status_changed_at: string | null;
  owner_staff_id: string | null;
  address: string | null;
  identifier_normalized: string | null;
}

// ── Tags (crm_tags) ──────────────────────────────────────────
export interface CrmTagRow {
  id: string;
  tenant_id: string;
  entity_type: string;
  name: string;
  slug: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  color: string | null;
}

// ── Campaigns (crm_campaigns) ────────────────────────────────
export interface CrmCampaignRow {
  id: string;
  tenant_id: string;
  name: string;
  campaign_type: string;
  status: string;
  channel: string;
  template_id: string | null;
  segment_definition: Record<string, unknown> | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Sequences (crm_sequences, crm_sequence_steps) ────────────
export interface CrmSequenceRow {
  id: string;
  tenant_id: string;
  name: string;
  mailbox_id: string | null;
  stop_on_reply: boolean;
  send_window_start: string | null;
  send_window_end: string | null;
  timezone: string;
  weekdays_only: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  purpose: string | null;
}

export interface CrmSequenceStepRow {
  id: string;
  tenant_id: string;
  sequence_id: string;
  step_no: number;
  delay_days: number;
  step_type: string;
  template_id: string | null;
  subject: string | null;
  body: string | null;
  task_title: string | null;
}

// ── Waitlist (crm_waitlist) ──────────────────────────────────
export interface CrmWaitlistRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  dependent_id: string | null;
  service_id: string;
  location_id: string | null;
  preferred_staff_id: string | null;
  requested_start_at: string;
  requested_end_at: string;
  priority: string;
  status: string;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Needs attention (crm_needs_attention) ─────────────────────
export interface CrmNeedsAttentionRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  dependent_id: string | null;
  appointment_id: string | null;
  priority: string;
  issue_code: string;
  issue: string;
  recommendation: string | null;
  due_by: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

// ── Activity (crm_activity) ──────────────────────────────────
export interface CrmActivityRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  dependent_id: string | null;
  appointment_id: string | null;
  lead_id: string | null;
  activity_type: string;
  channel: string | null;
  direction: string | null;
  subject: string | null;
  body: string | null;
  occurred_at: string;
  staff_id: string | null;
  external_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  deal_id: string | null;
}

// ── Notes (crm_notes) ────────────────────────────────────────
export interface CrmNoteRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  appointment_id: string | null;
  created_by: string | null;
  note_type: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  dependent_id: string | null;
  service_record_id: string | null;
  related_id: string | null;
  related_type: string | null;
  visibility: string;
}

// ── Tasks (crm_tasks) ────────────────────────────────────────
export interface CrmTaskRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  lead_id: string | null;
  appointment_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  task_type: string;
  priority: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: string;
  completed_at: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
  all_day: boolean;
  board_column: string | null;
  module: string | null;
  parent_task_id: string | null;
  recurrence_rule: string | null;
  related_id: string | null;
  related_type: string | null;
  sort_order: number | null;
  start_at: string | null;
  tags: string[] | null;
  visibility: string;
  remind_before_minutes: number | null;
  reminder_sent_at: string | null;
  recurrence_series_id: string | null;
  recurrence_index: number | null;
}

// ── Calls (crm_calls) ────────────────────────────────────────
export interface CrmCallRow {
  id: string;
  tenant_id: string;
  direction: string;
  from_number: string | null;
  to_number: string | null;
  customer_id: string | null;
  lead_id: string | null;
  deal_id: string | null;
  ticket_id: string | null;
  staff_id: string | null;
  status: string;
  disposition: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  notes: string | null;
  provider: string | null;
  provider_call_id: string | null;
  created_at: string;
}

// ── Documents (crm_documents, crm_document_types) ─────────────
export interface CrmDocumentRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  document_type_id: string | null;
  name: string;
  status: string;
  storage_path: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  issued_at: string | null;
  expires_at: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  signature_provider: string | null;
  external_signature_id: string | null;
  rejection_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  dependent_id: string | null;
}

export interface CrmDocumentTypeRow {
  id: string;
  tenant_id: string;
  name: string;
  category: string;
  required_for_booking: boolean;
  requires_signature: boolean;
  expiration_days: number | null;
  is_active: boolean;
  created_at: string;
  body_template: string | null;
  body_format: string | null;
  version: number;
  effective_date: string | null;
  cms_page_id: string | null;
}

// ── Sellers (sellers) ────────────────────────────────────────
export interface SellerRow {
  id: string;
  tenant_id: string;
  seller_type: string;
  legal_name: string;
  display_name: string;
  slug: string;
  email: string;
  phone: string | null;
  website: string | null;
  tax_id_last4: string | null;
  commission_rate: number | null;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  operations_paused: boolean;
  operations_pause_from: string | null;
  operations_pause_to: string | null;
  operations_pause_note: string | null;
  operations_paused_at: string | null;
  party_id: string | null;
}

// ── Lead sources (crm_lead_sources) ──────────────────────────
export interface CrmLeadSourceRow {
  id: string;
  tenant_id: string;
  name: string;
  category: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  is_active: boolean;
  created_at: string;
}

// ── Lead activities (crm_lead_activities) ─────────────────────
export interface CrmLeadActivityRow {
  id: string;
  tenant_id: string;
  lead_id: string;
  activity_type: string;
  occurred_at: string;
  staff_id: string | null;
  metadata: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
}

// ── Lead scoring rules (crm_lead_scoring_rules) ──────────────
export interface CrmLeadScoringRuleRow {
  id: string;
  tenant_id: string;
  name: string;
  field: string;
  operator: string;
  value: string;
  points: number;
  is_active: boolean;
  created_at: string;
}

// ── Automation workflows (crm_automation_workflows) ──────────
export interface CrmAutomationWorkflowRow {
  id: string;
  tenant_id: string;
  name: string;
  workflow_type: string;
  status: string;
  trigger_definition: Record<string, unknown> | null;
  condition_definition: Record<string, unknown> | null;
  action_definition: Record<string, unknown> | null;
  allow_reentry: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Service packages (crm_service_packages) ──────────────────
export interface CrmServicePackageRow {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  package_type: string;
  price: number;
  visit_count: number;
  valid_days: number;
  discount_percent: number;
  is_active: boolean;
  bookable_online: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── Operating hours (crm_operating_hours) ────────────────────
export interface CrmOperatingHoursRow {
  id: string;
  tenant_id: string;
  location_id: string;
  day_of_week: number;
  opens_at: string;
  closes_at: string;
  is_closed: boolean;
  accepts_online_booking: boolean;
  last_booking_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Holiday blackouts (crm_holiday_blackouts) ────────────────
export interface CrmHolidayBlackoutRow {
  id: string;
  tenant_id: string;
  location_id: string;
  name: string;
  blackout_date: string;
  end_date: string | null;
  blackout_type: string;
  is_closed_all_day: boolean;
  opens_at: string | null;
  closes_at: string | null;
  blocks_online_booking: boolean;
  recurs_annually: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Booking policies (crm_booking_policies) ──────────────────
export interface CrmBookingPolicyRow {
  id: string;
  tenant_id: string;
  location_id: string | null;
  service_id: string | null;
  slot_interval_minutes: number;
  min_notice_minutes: number;
  max_advance_days: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  cancellation_window_hours: number;
  late_cancel_fee: number;
  no_show_fee: number;
  deposit_required: boolean;
  deposit_amount: number;
  allow_online_booking: boolean;
  auto_confirm: boolean;
  default_timezone: string;
  created_at: string;
  updated_at: string;
}

// ── Staff availability (crm_staff_availability) ──────────────
export interface CrmStaffAvailabilityRow {
  id: string;
  tenant_id: string;
  staff_id: string;
  location_id: string | null;
  day_of_week: number;
  available_from: string;
  available_to: string;
  availability_type: string;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

// ── Staff shifts (crm_staff_shifts) ──────────────────────────
export interface CrmStaffShiftRow {
  id: string;
  tenant_id: string;
  staff_id: string;
  location_id: string | null;
  shift_template_id: string | null;
  shift_date: string;
  starts_at: string;
  ends_at: string;
  break_minutes: number;
  role: string;
  status: string;
  published_at: string | null;
  confirmed_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  is_overtime: boolean;
  swap_requested_by: string | null;
  swap_approved_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Commission plans (crm_commission_plans) ─────────────────
export interface CrmCommissionPlanRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  calc_basis: string;
  default_rate_percent: number;
  flat_amount: number | null;
  includes_tips: boolean;
  includes_addons: boolean;
  includes_retail: boolean;
  retail_rate_percent: number | null;
  deduct_refunds: boolean;
  deduct_product_cost: boolean;
  minimum_guarantee: number | null;
  payout_frequency: string;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── Audit log (crm_audit_log) ────────────────────────────────
export interface CrmAuditLogRow {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  actor_staff_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: string;
}

// ── Saved views (crm_saved_views) ────────────────────────────
export interface CrmSavedViewRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  name: string;
  query: string | null;
  created_at: string;
  owner_user_id: string | null;
  entity_type: string;
  filters: Record<string, unknown> | null;
  columns: string[] | null;
  sort_definition: Record<string, unknown> | null;
  is_shared: boolean;
  updated_at: string;
}

// ── Settings (crm_settings) ──────────────────────────────────
export interface CrmSettingsRow {
  tenant_id: string;
  default_timezone: string;
  default_currency: string;
  default_appointment_duration_minutes: number;
  default_rebooking_days: number;
  inactive_after_days: number;
  at_risk_after_days: number;
  birthday_campaign_enabled: boolean;
  vaccine_reminder_enabled: boolean;
  rebooking_automation_enabled: boolean;
  require_upfront_deposit: boolean;
  deposit_percent: number | null;
  deposit_flat_amount: number | null;
  cancellation_cutoff_minutes: number;
  no_show_penalty_amount: number;
  max_booking_horizon_days: number;
  station_turnaround_buffer_minutes: number;
  updated_at: string;
  online_booking_enabled: boolean;
  online_booking_requires_approval: boolean;
  online_booking_lead_time_hours: number;
  new_client_booking_enabled: boolean;
  waitlist_enabled: boolean;
  notification_frequency: string;
}

// ── Permanent alerts (crm_permanent_alerts) ──────────────────
export interface CrmPermanentAlertRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  dependent_id: string | null;
  severity: string;
  title: string;
  body: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

// ── Customer behavior flags (crm_customer_behavior) ───────────
export interface CrmCustomerBehaviorRow {
  customer_id: string;
  tenant_id: string;
  frequent_visitor: boolean;
  high_lifetime_value: boolean;
  frequent_no_show: boolean;
  cancellation_risk: boolean;
  price_sensitive: boolean;
  online_booking_only: boolean;
  due_for_rebooking: boolean;
  frequency_declining: boolean;
  missing_documents: boolean;
  vaccine_expiring: boolean;
  outstanding_balance_flag: boolean;
  no_upcoming_appointment: boolean;
  intake_incomplete: boolean;
  birthday_this_month: boolean;
  rebooking_campaign_eligible: boolean;
  win_back_candidate: boolean;
  new_customer_nurture_eligible: boolean;
  inactive_90_plus: boolean;
  last_calculated_at: string;
}

// ── Communication preferences (crm_communication_preferences) ─
export interface CrmCommunicationPreferenceRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  channel: string;
  opted_in: boolean;
  source: string | null;
  consented_at: string | null;
  revoked_at: string | null;
}

// ── Customer contact methods (crm_customer_contact_methods) ──
export interface CrmCustomerContactMethodRow {
  id: string;
  tenant_id: string;
  customer_id: string;
  type: string;
  value: string;
  normalized_value: string | null;
  label: string | null;
  is_primary: boolean;
  is_verified: boolean;
  verified_at: string | null;
  opt_in: boolean;
  opted_in_at: string | null;
  opted_out_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Customer preferences (crm_customer_preferences) ──────────
export interface CrmCustomerPreferenceRow {
  customer_id: string;
  tenant_id: string;
  preferred_days: string[] | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  preferred_services: string[] | null;
  preferred_payment_method: string | null;
  communication_notes: string | null;
  accessibility_notes: string | null;
  parking_notes: string | null;
  updated_at: string;
  notification_frequency: string | null;
  special_handling_notes: string | null;
  preferred_style_notes: string | null;
  preferred_staff_id: string | null;
  preferred_shampoo: string | null;
  preferred_cut_style: string | null;
}

// ── Customer tags (crm_customer_tags) ────────────────────────
export interface CrmCustomerTagRow {
  tenant_id: string;
  customer_id: string;
  tag_id: string;
  created_at: string;
}

// ── Routes (crm_routes, crm_route_stops) ─────────────────────
export interface CrmRouteRow {
  id: string;
  tenant_id: string;
  route_date: string;
  staff_id: string | null;
  name: string;
  start_address: string | null;
  end_address: string | null;
  status: string;
  total_distance_m: number | null;
  total_duration_s: number | null;
  optimized_at: string | null;
  provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmRouteStopRow {
  id: string;
  tenant_id: string;
  route_id: string;
  seq: number;
  appointment_id: string | null;
  order_id: string | null;
  customer_id: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  window_start: string | null;
  window_end: string | null;
  service_minutes: number | null;
  eta: string | null;
  arrived_at: string | null;
  completed_at: string | null;
  status: string;
  notes: string | null;
}

// ── Appointment resources (crm_appointment_resources) ────────
export interface CrmAppointmentResourceRow {
  id: string;
  tenant_id: string;
  location_id: string;
  name: string;
  resource_type: string;
  capacity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Shift templates (crm_shift_templates) ────────────────────
export interface CrmShiftTemplateRow {
  id: string;
  tenant_id: string;
  name: string;
  location_id: string;
  day_of_week: number;
  starts_at: string;
  ends_at: string;
  break_minutes: number;
  role: string;
  required_headcount: number;
  color_label: string | null;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

// ── Time off requests (crm_time_off_requests) ────────────────
export interface CrmTimeOffRequestRow {
  id: string;
  tenant_id: string;
  staff_id: string;
  request_type: string;
  starts_on: string;
  ends_on: string;
  is_partial_day: boolean;
  starts_at_time: string | null;
  ends_at_time: string | null;
  hours_requested: number;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  blocks_booking: boolean;
  created_at: string;
  updated_at: string;
}

// ── Staff documents (crm_staff_documents) ─────────────────────
export interface CrmStaffDocumentRow {
  id: string;
  tenant_id: string;
  staff_id: string;
  document_type: string;
  name: string;
  storage_path: string | null;
  status: string;
  uploaded_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Staff performance notes (crm_staff_performance_notes) ────
export interface CrmStaffPerformanceNoteRow {
  id: string;
  tenant_id: string;
  staff_id: string;
  note_type: string;
  body: string;
  rating: number | null;
  created_by: string | null;
  created_at: string;
}

// ── Staff incident reports (crm_staff_incident_reports) ──────
export interface CrmStaffIncidentReportRow {
  id: string;
  tenant_id: string;
  staff_id: string;
  appointment_id: string | null;
  dependent_id: string | null;
  severity: string;
  description: string;
  action_taken: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Staff time clock entries (crm_staff_time_clock_entries) ──
export interface CrmStaffTimeClockEntryRow {
  id: string;
  tenant_id: string;
  staff_id: string;
  clock_in: string;
  clock_out: string | null;
  source: string;
  notes: string | null;
  created_at: string;
}

// ── Commission entries (crm_commission_entries) ──────────────
export interface CrmCommissionEntryRow {
  id: string;
  tenant_id: string;
  staff_id: string;
  plan_id: string | null;
  appointment_id: string | null;
  sale_id: string | null;
  service_id: string | null;
  earned_on: string;
  basis_amount: number;
  rate_percent: number;
  flat_amount: number | null;
  tips_amount: number;
  retail_amount: number;
  commission_amount: number;
  entry_type: string;
  status: string;
  payroll_run_id: string | null;
  reversal_of_id: string | null;
  calculation_detail: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Product recommendations (crm_product_recommendations) ─────
export interface CrmProductRecommendationRow {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  dependent_id: string | null;
  appointment_id: string | null;
  catalog_item_id: string | null;
  product_name: string;
  recommended_by: string | null;
  reason: string | null;
  priority: string;
  status: string;
  presented_at: string | null;
  responded_at: string | null;
  resulting_sale_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Surcharges (crm_surcharges) ──────────────────────────────
export interface CrmSurchargeRow {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  surcharge_type: string;
  calc_method: string;
  amount: number;
  percent: number;
  auto_apply: boolean;
  requires_approval: boolean;
  taxable: boolean;
  commissionable: boolean;
  applies_to_service_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Pricing rules (crm_pricing_rules) ─────────────────────────
export interface CrmPricingRuleRow {
  id: string;
  tenant_id: string;
  name: string;
  rule_type: string;
  service_id: string | null;
  service_category: string | null;
  match_key: string | null;
  min_value: number | null;
  max_value: number | null;
  adjustment_type: string;
  adjustment_value: number;
  priority: number;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
