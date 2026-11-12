-- CANONICAL STEP 400  |  file S400_actions_and_nav.sql  |  was unify/07_actions_and_nav.sql  |  internal log label '07' (unchanged)
-- =====================================================================
-- S400_actions_and_nav.sql — wire the UI spec to the canonical schema.
--
--   1. Dashboards & widgets + KPI targets tables (the only nav items that
--      had no backing table).
--   2. platform_quick_action_registry: every Create action, Standard action
--      and option-menu action in the spec, bound to a canonical RPC (rpc),
--      an RLS-protected table (table), a pure screen (ui) or an outside
--      provider (integration). Legacy writers (create_bill,
--      create_purchase_order, create_sales_order, create_receipt) are
--      never bound.
--   3. platform_feature_tree_coverage: every nav path in the spec, including
--      the four "Not Defined" areas (Payroll, Time, Inventory, Sales Tax),
--      with its backing table. is_implemented is true only when that table
--      or view exists.
--   4. pg_cron jobs (if pg_cron is installed): unify.reconcile() every 10
--      minutes; support_run_clocks() and platform_dispatch_reminders()
--      every minute (from 06b).
-- Idempotent: upserts on action_code / feature_path.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 400 (internal label '07'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S400_actions_and_nav.sql is step 400; run S200_unify_preflight.sql and every step up to 340 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('400');
END $guard$;
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Dashboards, widgets, KPI targets
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_dashboards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  module        text NOT NULL DEFAULT 'home',      -- home, finance, orders, support ...
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_default    boolean NOT NULL DEFAULT false,
  is_shared     boolean NOT NULL DEFAULT true,
  layout        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module, name)
);
CREATE TABLE IF NOT EXISTS public.platform_dashboard_widgets (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dashboard_id         uuid NOT NULL REFERENCES public.platform_dashboards(id) ON DELETE CASCADE,
  report_definition_id uuid REFERENCES public.platform_report_definitions(id) ON DELETE SET NULL,
  widget_type          text NOT NULL CHECK (widget_type IN ('kpi','line','bar','pie','table','list','funnel','map','text')),
  title                text NOT NULL,
  metric_code          text,                    -- e.g. gmv, orders, aov, open_tickets, sla_breaches
  config               jsonb NOT NULL DEFAULT '{}'::jsonb,
  position             jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {x,y,w,h}
  sort_order           integer NOT NULL DEFAULT 100,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_dashboard_widgets_dash_idx ON public.platform_dashboard_widgets(dashboard_id);
CREATE TABLE IF NOT EXISTS public.platform_kpi_targets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  metric_code  text NOT NULL,
  period_type  text NOT NULL DEFAULT 'month' CHECK (period_type IN ('day','week','month','quarter','year')),
  period_start date NOT NULL,
  target_value numeric NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, metric_code, period_type, period_start)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_dashboards','platform_dashboard_widgets','platform_kpi_targets'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_tenant_rw ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_tenant_rw ON public.%I FOR ALL TO authenticated
                      USING (public.platform_is_tenant_member(tenant_id)) WITH CHECK (public.platform_is_tenant_member(tenant_id))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. Quick action registry
--    line: code | module | area | object_type | kind | impl | binding | display name | access
--    impl rpc -> binding is the function; table -> binding is the table;
--    ui / integration -> binding is the screen route (stored in ui_route).
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _qa(code text, module text, area text, object_type text, kind text, impl text,
                      binding text, display text, access text, ord int) ON COMMIT DROP;
INSERT INTO _qa
SELECT trim(f[1]), trim(f[2]), trim(f[3]), trim(f[4]), trim(f[5]), trim(f[6]), trim(f[7]), trim(f[8]),
       coalesce(nullif(trim(f[9]), ''), 'member'), (row_number() OVER ()) * 10
  FROM (SELECT string_to_array(l, '|') f
          FROM regexp_split_to_table($QA$
create.invoice|finance|customers|invoice|create|table|acct_ar_invoices|Invoice
create.payment_link|finance|customers|payment_link|create|rpc|acct_create_payment_link|Payment link
create.receive_payment|finance|customers|receipt|create|rpc|acct_record_receipt|Receive payment
create.statement|finance|customers|statement_batch|create|rpc|acct_create_statement_batch|Statement
create.estimate|finance|customers|estimate|create|table|acct_estimates|Estimate
create.sales_receipt|finance|customers|sales_receipt|create|table|acct_ar_invoices|Sales receipt (document_kind = sales_receipt)
create.credit_memo|finance|customers|credit_memo|create|rpc|acct_create_credit_memo|Credit memo
create.customer|crm|customers|customer|create|table|crm_customers|Add customer
create.expense|finance|vendors|expense|create|table|acct_spend_transactions|Expense (txn_kind = expense)
create.check|finance|vendors|check|create|table|acct_spend_transactions|Check (txn_kind = check)
create.bill|finance|vendors|bill|create|table|acct_ap_bills|Bill
create.pay_bills|finance|vendors|bill_payment|create|rpc|acct_pay_bills|Pay bills
create.purchase_order|orders|vendors|purchase_order|create|table|erp_purchase_orders|Purchase order
create.vendor_credit|finance|vendors|vendor_credit|create|table|acct_ap_vendor_credits|Vendor credit
create.vendor|crm|vendors|vendor|create|table|acct_vendors|Add vendor
create.supplier|crm|vendors|supplier|create|table|suppliers|Add supplier
create.contractor|finance|team|contractor|create|rpc|acct_invite_contractor|Add contractor
create.time_entry|time|team|time_entry|create|table|acct_time_entries|Time entry
create.task|tasks|other|task|create|rpc|platform_create_task|Task
create.bank_deposit|finance|other|bank_deposit|create|rpc|acct_make_deposit|Bank deposit
create.journal_entry|finance|other|journal_entry|create|rpc|acct_post_entry|Journal entry
journal.post_draft|finance|journal|journal_entry|option|rpc|acct_post_draft_journal|Post draft journal
journal.reverse|finance|journal|journal_entry|option|rpc|acct_reverse_journal|Reverse journal
create.transfer|finance|other|bank_transfer|create|rpc|acct_transfer_funds|Transfer
create.reconcile|finance|other|reconciliation|create|rpc|acct_start_reconciliation|Reconcile
create.settlement|finance|other|channel_settlement|create|table|acct_channel_settlements|Settlement
create.product_service|finance|other|item|create|table|acct_items|Add product/service
create.account|finance|other|account|create|table|acct_chart_of_accounts|Add account|admin
create.design|studio|catalog|design|create|table|designs|Design
create.product|catalog|catalog|product|create|table|products|Product
create.collection|catalog|catalog|collection|create|table|collections|Collection
create.category|catalog|catalog|category|create|table|categories|Category|admin
create.banner|marketing|catalog|banner|create|table|cms_banners|Banner
create.popup|marketing|catalog|popup|create|table|cms_popups|Popup
create.discount_code|marketing|catalog|promotion|create|table|commerce_promotions|Discount code
create.campaign|advertising|catalog|ad_campaign|create|table|ad_campaigns|Campaign
create.post|social|catalog|social_post|create|table|social_posts|Post
create.newsletter|marketing|catalog|campaign|create|table|crm_campaigns|Newsletter (channel = email)
create.sales_order|orders|support|order|create|table|erp_orders|Sales order
create.return_rma|orders|support|return|create|rpc|erp_open_return|Return/RMA
create.ticket|support|support|ticket|create|table|support_tickets|Ticket
create.note|crm|support|note|create|table|crm_notes|Add note
create.void|finance|support|document|create|rpc|app_void|Void
create.appointment|crm|appointments|appointment|create|rpc|crm_book_appointment|Book appointment
create.payroll_run|payroll|team|payroll_run|create|table|acct_payroll_runs|Payroll run
create.employee|payroll|team|employee|create|table|acct_employees|Add employee
create.inventory_count|inventory|inventory|count_session|create|table|erp_inventory_count_sessions|Cycle count
create.sales_tax_filing|sales_tax|tax|tax_filing|create|rpc|acct_prepare_sales_tax_filing|Prepare sales tax filing
create.dashboard|reports|dashboard|dashboard|create|table|platform_dashboards|Dashboard
create.report|reports|reports|report_definition|create|table|platform_report_definitions|Report
std.view|platform|any|any|standard|ui|/:module/:object/:id|View
std.edit|platform|any|any|standard|ui|/:module/:object/:id/edit|Edit
std.duplicate|platform|any|any|standard|rpc|app_duplicate_record|Duplicate
std.print|platform|any|any|standard|ui|/:module/:object/:id/print|Print
std.delete|platform|any|any|standard|rpc|app_delete_draft|Delete (drafts only; posted documents are voided)
std.archive|platform|any|any|standard|rpc|app_archive_record|Archive
party.open_profile|crm|party|party|option|ui|/crm/parties/:id|Open profile
party.email|crm|party|party|option|rpc|email_enqueue|Email
party.add_role|crm|party|party|option|rpc|platform_party_add_role|Add role
party.merge|crm|party|party|option|rpc|platform_party_merge|Merge duplicates|admin
party.archive|crm|party|party|option|rpc|app_archive_record|Archive
product.publish|catalog|product|product|option|rpc|app_publish_product|Publish
product.reprice|catalog|product|product|option|rpc|app_reprice_variants|Reprice
product.open_studio|catalog|product|product|option|ui|/studio/designs?product=:id|Open in Studio
product.view_sales|catalog|product|product|option|ui|/reports/products?product=:id|View sales
product.view_supplier|catalog|product|product|option|ui|/crm/suppliers?product=:id|View supplier
product.archive|catalog|product|product|option|rpc|app_archive_record|Archive
studio.add_to_designer|studio|studio|design|option|table|design_assets|Add to designer
fulfillment.print_slip|orders|fulfillment|order|option|table|commerce_batch_slips|Print slip
fulfillment.print_label|orders|fulfillment|shipment|option|table|commerce_shipping_labels|Print shipping label
fulfillment.refund|orders|fulfillment|order|option|rpc|erp_refund_order|Refund
fulfillment.report_problem|orders|fulfillment|order|option|table|support_tickets|Report a problem
fulfillment.cancel_order|orders|fulfillment|order|option|rpc|erp_cancel_order|Cancel order
fulfillment.print_packing_slip|orders|fulfillment|order|option|ui|/orders/:id/packing-slip|Print packing slip
fulfillment.mark_shipped|orders|fulfillment|order|option|rpc|erp_mark_shipped|Mark shipped
fulfillment.track_shipment|orders|fulfillment|shipment|option|ui|/orders/:id/tracking|Track shipment
fulfillment.sync_tracking|orders|fulfillment|shipment|option|integration|/integrations/carriers/sync|Sync tracking (carrier webhook -> erp_record_tracking_event)
fulfillment.mark_in_transit|orders|fulfillment|shipment|option|rpc|erp_record_tracking_event|Mark in transit
fulfillment.add_note|orders|fulfillment|order|option|rpc|erp_add_order_note|Add order note
carrier.test_rates|orders|carrier|carrier|option|integration|/settings/shipping/carriers/:id/test|Test rates
carrier.manage_services|orders|carrier|carrier|option|table|erp_shipping_methods|Manage services|admin
carrier.disable|orders|carrier|carrier|option|rpc|erp_set_carrier_active|Disable carrier|admin
po.send|orders|purchase_order|purchase_order|option|rpc|erp_send_purchase_order|Send to supplier
po.receive|orders|purchase_order|purchase_order|option|rpc|erp_receive_purchase_order|Receive items
po.print|orders|purchase_order|purchase_order|option|ui|/orders/purchase-orders/:id/print|Print PO
po.create_bill|finance|purchase_order|purchase_order|option|rpc|acct_bill_from_purchase_order|Create bill from PO
inventory.view_catalog|inventory|inventory|sku|option|ui|/catalog/products?sku=:id|View in Catalog
inventory.adjust|inventory|inventory|sku|option|rpc|erp_adjust_stock|Adjust stock
inventory.transfer|inventory|inventory|sku|option|rpc|erp_transfer_stock|Transfer
inventory.history|inventory|inventory|sku|option|rpc|erp_stock_history|Stock history
inventory.cycle_count|inventory|inventory|count_session|option|table|erp_inventory_count_sessions|Start cycle count
inventory.post_count|inventory|inventory|count_session|option|rpc|acct_post_erp_count_session|Post cycle count
rma.open|orders|rma|return|option|ui|/orders/returns/:id|Open RMA
rma.approve|orders|rma|return|option|rpc|erp_decide_return|Approve return
rma.decline|orders|rma|return|option|rpc|erp_decide_return|Decline return
rma.receive|orders|rma|return|option|rpc|erp_receive_return|Receive return
bill.view|finance|bill|bill|option|ui|/finance/bills/:id|View bill details
bill.approve|finance|bill|bill|option|rpc|acct_decide_bill|Approve to Unpaid
bill.submit|finance|bill|bill|option|rpc|acct_submit_bill|Submit for approval
bill.post|finance|bill|bill|option|rpc|acct_post_bill|Post bill
bill.download_attachment|finance|bill|bill|option|ui|/finance/bills/:id/attachment|Download attachment
bill.delete|finance|bill|bill|option|rpc|app_delete_draft|Delete bill
bill.categorize|finance|bill|bill|option|rpc|acct_mark_bill_reviewed|Categorize
bill.match|finance|bill|bill|option|rpc|acct_po_match|Match to PO
bill.schedule_payment|finance|bill|bill|option|rpc|acct_schedule_bill_payment|Schedule payment
bill.from_inbox|finance|bill|bill|option|rpc|acct_inbox_create_bill|Create bill from inbox
invoice.send|finance|invoice|invoice|option|rpc|acct_send_invoice|Send
invoice.remind|finance|invoice|invoice|option|rpc|acct_send_invoice|Remind
invoice.mark_paid|finance|invoice|invoice|option|rpc|acct_mark_invoice_paid|Mark paid
invoice.post|finance|invoice|invoice|option|rpc|acct_post_invoice|Post invoice
invoice.match|finance|invoice|bank_transaction|option|rpc|acct_match_bank_transaction|Match
invoice.void|finance|invoice|invoice|option|rpc|acct_void_invoice|Void invoice
estimate.convert|finance|estimate|estimate|option|rpc|acct_convert_estimate|Convert to invoice
statement.open|finance|statement|statement|option|ui|/finance/statements/:id|Open
statement.duplicate_next|finance|statement|statement_batch|option|rpc|acct_duplicate_statement_batch|Duplicate for next period
statement.generate|finance|statement|statement_batch|option|rpc|acct_generate_statement_batch|Generate statements
statement.send|finance|statement|statement|option|rpc|acct_send_statement|Send
statement.send_reminder|finance|statement|statement|option|rpc|acct_send_statement|Send reminder
statement.print|finance|statement|statement|option|ui|/finance/statements/:id/pdf|Print/PDF
appointment.reschedule|crm|appointment|appointment|option|rpc|crm_reschedule_appointment|Reschedule
appointment.cancel|crm|appointment|appointment|option|rpc|crm_cancel_appointment|Cancel appointment
appointment.check_in|crm|appointment|appointment|option|rpc|crm_set_appointment_status|Check in / complete / no-show
appointment.slots|crm|appointment|appointment|option|rpc|crm_available_slots|Find open slots
payroll.post|payroll|payroll|payroll_run|option|rpc|acct_post_payroll_run|Post payroll run
time.invoice_unbilled|time|time|time_entry|option|rpc|acct_invoice_unbilled_time|Invoice unbilled time
tax.calculate|sales_tax|tax|tax_filing|option|rpc|acct_calculate_tax|Calculate tax
tax.pay_filing|sales_tax|tax|tax_filing|option|rpc|acct_pay_sales_tax_filing|Pay sales tax filing
tax.generate_1099s|business_tax|tax|form_1099|option|rpc|acct_generate_1099s|Generate 1099s|admin
cap.issue_shares|cap_table|cap_table|issuance|option|rpc|cap_issue_shares|Issue shares|admin
cap.grant_options|cap_table|cap_table|option_grant|option|rpc|cap_grant_options|Grant options|admin
create.oncall_schedule|support|oncall|oncall_schedule|create|table|support_oncall_schedules|On-call schedule|admin
create.oncall_override|support|oncall|oncall_override|create|table|support_oncall_overrides|On-call override (swap a shift)
create.escalation_policy|support|oncall|escalation_policy|create|table|support_escalation_policies|Escalation policy|admin
oncall.page|support|oncall|page|option|rpc|support_page|Page on-call
oncall.ack|support|oncall|page|option|rpc|support_ack_page|Acknowledge page
oncall.resolve|support|oncall|page|option|rpc|support_resolve_page|Resolve page
ticket.auto_assign|support|tickets|ticket|option|rpc|support_auto_assign|Auto-assign ticket
order.hold|orders|orders|order|option|rpc|erp_hold_order|Put order on hold
order.release|orders|orders|order|option|rpc|erp_release_order|Release hold
create.invitation|settings|workspace|invitation|create|rpc|platform_invite_member|Invite teammate|admin
invitation.revoke|settings|workspace|invitation|option|rpc|platform_revoke_invitation|Revoke invitation|admin
invitation.accept|settings|workspace|invitation|option|rpc|platform_accept_invitation|Accept invitation
record.follow|platform|any|record|option|rpc|platform_follow|Follow / unfollow
record.remind|platform|any|reminder|option|rpc|platform_set_reminder|Remind me
create.out_of_office|settings|workspace|out_of_office|create|table|platform_out_of_office|Out of office
create.notification_preference|settings|system|notification_preference|create|table|platform_notification_preferences|Notification preference
create.deal|crm|deals|deal|create|table|crm_deals|Deal
deal.move|crm|deals|deal|option|rpc|crm_move_deal|Move deal to stage
lead.convert|crm|leads|lead|option|rpc|crm_convert_lead|Convert lead to deal
lead.rescore|crm|leads|lead|option|rpc|crm_score_lead|Recalculate lead score
create.pipeline|crm|deals|pipeline|create|table|crm_pipelines|Pipeline|admin
create.lead_scoring_rule|crm|leads|lead_scoring_rule|create|table|crm_lead_scoring_rules|Lead scoring rule|admin
create.webform|marketing|webforms|webform|create|table|platform_webforms|Webform|admin
webform.submit|marketing|webforms|webform_submission|option|rpc|platform_submit_webform|Submit webform (public)
call.start|crm|calls|call|option|rpc|crm_start_call|Call (click-to-call)
create.mailbox|crm|inbox|mailbox|create|table|platform_mailboxes|Connect mailbox
email.send|crm|inbox|email|create|rpc|platform_send_email|Send email
create.sequence|marketing|sequences|sequence|create|table|crm_sequences|Email sequence
sequence.enroll|marketing|sequences|sequence_enrollment|option|rpc|crm_enroll_in_sequence|Enroll in sequence
create.calendar_event|tasks|calendar|calendar_event|create|table|platform_calendar_events|Calendar event
route.build|crm|routes|route|create|rpc|crm_build_route|Build route for the day
create.tracked_record|crm|records|record|create|table|crm_dependents|Tracked record (pet, vehicle, policy, property, student...)
create.record_event|crm|records|record_event|create|table|crm_record_events|Record event (service visit, claim, enrollment...)
custom_fields.set|platform|any|custom_field_value|option|rpc|platform_set_custom_fields|Edit custom fields
create.custom_field|settings|customization|custom_field|create|table|platform_custom_fields|Custom field|admin
create.picklist_value|settings|customization|picklist_value|create|table|platform_picklist_values|Picklist value|admin
pack.apply|settings|modules|pack|option|rpc|platform_apply_pack|Apply industry pack|admin
module.enable|settings|modules|module|option|rpc|platform_enable_module|Turn module on / off|admin
tenant.provision|platform|any|tenant|create|rpc|platform_provision_tenant|Provision new client workspace|admin
access.log|platform|any|sensitive_access|option|rpc|platform_log_access|Log sensitive record access
role.assign|settings|team|member_role|option|rpc|platform_assign_role|Assign role / title|admin
role.revoke|settings|team|member_role|option|rpc|platform_revoke_role|Remove role|admin
create.learning_program|learning|programs|learning_program|create|table|learn_programs|Program (course, class, training...)
create.learning_cohort|learning|cohorts|learning_cohort|create|table|learn_cohorts|Cohort (term, session, class date)
learn.enroll|learning|enrollments|enrollment|create|rpc|learn_enroll|Enroll
learn.progress|learning|progress|progress|option|rpc|learn_record_progress|Record progress / grade
learn.withdraw|learning|enrollments|enrollment|option|rpc|learn_withdraw|Withdraw
listing.map|catalog|listing|listing_map|option|rpc|listing_map_category|Map catalog to listing category|admin
listing.unmap|catalog|listing|listing_map|option|rpc|listing_unmap|Remove listing map|admin
listing.publish|catalog|listing|listing|option|rpc|listing_publish|Publish listing categories|admin
create.listing_category|catalog|listing|listing_category|create|table|taxonomy_nodes|Listing category
$QA$, E'\n') l
         WHERE btrim(l) <> '') s;

INSERT INTO public.platform_quick_action_registry
       (action_code, module, area, object_type, display_name, kind, implementation,
        rpc_function, target_table, ui_route, required_access, sort_order, is_active, notes, updated_at)
SELECT q.code, q.module, q.area, q.object_type, q.display, q.kind, q.impl,
       CASE WHEN q.impl = 'rpc'   THEN q.binding END,
       CASE WHEN q.impl = 'table' THEN q.binding END,
       CASE WHEN q.impl IN ('ui','integration') THEN q.binding
            ELSE '/' || q.module || '/' || replace(q.object_type, '_', '-') || 's' END,
       q.access, q.ord, true, 'unify 07', now()
  FROM _qa q
ON CONFLICT (action_code) DO UPDATE SET
       module = EXCLUDED.module, area = EXCLUDED.area, object_type = EXCLUDED.object_type,
       display_name = EXCLUDED.display_name, kind = EXCLUDED.kind, implementation = EXCLUDED.implementation,
       rpc_function = EXCLUDED.rpc_function, target_table = EXCLUDED.target_table, ui_route = EXCLUDED.ui_route,
       required_access = EXCLUDED.required_access, sort_order = EXCLUDED.sort_order, is_active = true,
       notes = EXCLUDED.notes, updated_at = now();

-- any older registry row bound to a retired writer is switched off
UPDATE public.platform_quick_action_registry SET is_active = false, notes = 'disabled by unify 07: legacy writer', updated_at = now()
 WHERE rpc_function IN ('create_bill','create_purchase_order','create_sales_order','create_receipt')
    OR (target_table IS NOT NULL AND EXISTS (SELECT 1 FROM public.platform_table_registry g
                                              WHERE g.table_name = target_table AND g.lifecycle IN ('legacy','archived')));

-- ---------------------------------------------------------------------
-- 3. Feature tree coverage (the whole nav)
--    line: path | module | backing table
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _ft(path text, module text, backing text) ON COMMIT DROP;
INSERT INTO _ft
SELECT DISTINCT ON (trim(f[1])) trim(f[1]), trim(f[2]), trim(f[3])
  FROM (SELECT string_to_array(l, '|') f
          FROM regexp_split_to_table($FT$
Dashboard/Overview/GMV|reports|erp_orders
Dashboard/Overview/Orders|reports|erp_orders
Dashboard/Overview/Products|reports|products
Dashboard/Overview/Support|reports|support_tickets
Dashboard/Overview/Analytics|reports|analytics_events
Finance/Overview|finance|acct_journal_entries
Finance/Sales/Payment requests|finance|acct_payment_links
Finance/Sales/Income over time|finance|acct_journal_entries
Finance/Sales/Revenue transactions (Stripe webhook)|finance|acct_processor_events
Finance/Sales/Invoices|finance|acct_ar_invoices
Finance/Sales/Invoice lines|finance|acct_ar_invoice_lines
Finance/Sales/Payment links|finance|acct_payment_links
Finance/Sales/Receipts|finance|acct_ar_receipts
Finance/Sales/Sales channels|finance|acct_channel_accounts
Finance/Sales/Payouts|finance|acct_payouts
Finance/Sales/Products & services|finance|acct_items
Finance/Sales/Gift cards|finance|acct_gift_cards
Finance/Sales/Subscriptions|finance|commerce_subscriptions
Finance/Sales/Estimates|finance|acct_estimates
Finance/Sales/Statements|finance|acct_customer_statements
Finance/Sales/Refunds|finance|acct_refunds
Finance/Sales/Disputes|finance|acct_disputes
Finance/Sales/Credit memos|finance|acct_ar_credit_memos
Finance/Expenses & Bills/Expenses|finance|acct_spend_transactions
Finance/Expenses & Bills/Bills|finance|acct_ap_bills
Finance/Expenses & Bills/Bill approvals|finance|acct_ap_approvals
Finance/Expenses & Bills/Bill payments|finance|acct_ap_payments
Finance/Expenses & Bills/Vendor credits|finance|acct_ap_vendor_credits
Finance/Expenses & Bills/Recurring bills|finance|acct_recurring_bills
Finance/Expenses & Bills/Receipt inbox|finance|acct_document_inbox
Finance/Expenses & Bills/Contractors|finance|acct_contractor_invites
Finance/Banking/Bank accounts|finance|acct_bank_accounts
Finance/Banking/Transactions|finance|acct_bank_transactions
Finance/Banking/Deposits|finance|acct_bank_deposits
Finance/Banking/Transfers|finance|acct_bank_transfers
Finance/Banking/Reconciliation|finance|acct_reconciliations
Finance/Banking/Settlements|finance|acct_channel_settlements
Finance/Accounting/Chart of accounts|finance|acct_chart_of_accounts
Finance/Accounting/Journal entries|finance|acct_journal_entries
Finance/Accounting/Fixed assets|finance|acct_fixed_assets
Finance/Accounting/Debt|finance|acct_debt_instruments
Finance/Accounting/Month-end close|finance|acct_close_tasks
Business tax/Overview|business_tax|acct_tax_transactions
Business tax/Create tax return|business_tax|efile_filings
Business tax/Tax summary/Taxable profit estimate|business_tax|acct_journal_entries
Business tax/Tax summary/Deductible expenses|business_tax|acct_spend_transactions
Business tax/Tax summary/Depreciable business assets|business_tax|acct_fixed_assets
Business tax/1099-K detail|business_tax|seller_1099k_generations
Business tax/1099s|business_tax|acct_1099_thresholds
Business tax/Payroll tax|business_tax|acct_payroll_tax_forms
Business tax/Year-end tax filing|business_tax|efile_filings
Cap Table/Overview|cap_table|cap_table_snapshots
Cap Table/Stakeholders|cap_table|cap_stakeholders
Cap Table/Funding rounds|cap_table|cap_funding_rounds
Cap Table/Option pool|cap_table|cap_option_pools
Cap Table/Option grants|cap_table|cap_option_grants
Cap Table/SAFEs & convertibles|cap_table|cap_convertibles
Cap Table/Dilution modeler|cap_table|cap_issuances
Cap Table/Liquidation waterfall|cap_table|cap_share_classes
Cap Table/409A & valuations|cap_table|cap_valuations
Cap Table/409A requests|cap_table|val_requests
Cap Table/Equity events|cap_table|cap_equity_events
Cap Table/Controls|cap_table|cap_board_approvals
Cap Table/Documents|cap_table|cap_documents
Contacts/CRM overview|crm|crm_customers
Contacts/Parties|crm|platform_parties
Contacts/Parties/Customers|crm|crm_customers
Contacts/Parties/Customer AR profiles|crm|acct_customers
Contacts/Parties/Vendors|crm|acct_vendors
Contacts/Parties/Suppliers|crm|suppliers
Contacts/Seller relationships/Sellers|crm|sellers
Contacts/Seller relationships/Seller detail|crm|seller_self_serve_profiles
Contacts/Seller relationships/Seller feed|crm|seller_social_posts
Contacts/Seller relationships/Onboarding queue|crm|onboarding_cases
Contacts/CRM tools/Leads|crm|crm_leads
Contacts/CRM tools/Segments|crm|crm_segments
Contacts/CRM tools/Templates|crm|crm_message_templates
Contacts/CRM tools/Appointments|crm|crm_appointments
Contacts/CRM tools/Appointments/Services|crm|crm_services
Contacts/CRM tools/Appointments/Staff|crm|crm_staff
Contacts/CRM tools/Appointments/Resources|crm|crm_appointment_resources
Contacts/CRM tools/Appointments/Booking policies|crm|crm_booking_policies
Contacts/CRM tools/Appointments/Blocked times|crm|crm_staff_blocked_times
Contacts/CRM tools/Appointments/Dependents|crm|crm_dependents
Contacts/CRM tools/Appointments/Status history|crm|crm_appointment_status_history
Contacts/CRM tools/Appointments/Register sessions|crm|commerce_register_sessions
Catalog/Overview|catalog|products
Catalog/Design Studio/Konva studio|studio|designs
Catalog/Design Studio/New design|studio|designs
Catalog/Design Studio/Collection|studio|collections
Catalog/Design Studio/Published|studio|design_publications
Catalog/Products & Variants/Products|catalog|products
Catalog/Products & Variants/Variants|catalog|product_variants
Catalog/Products & Variants/Listings|catalog|commerce_channel_products
Catalog/Products & Variants/Blanks|catalog|supplier_catalog_products
Catalog/Products & Variants/Catalog review|catalog|product_reviews
Catalog/Products & Variants/Catalog items|catalog|commerce_catalog_items
Catalog/Products & Variants/Published items & SKUs|catalog|erp_product_skus
Catalog/Products & Variants/Bundles|catalog|catalog_bundles
Catalog/Products & Variants/Categories|catalog|categories
Catalog/Products & Variants/Suppliers / vendors / sellers|catalog|supplier_product_mappings
Catalog/Channels/Ecommerce|catalog|commerce_order_channels
Catalog/Channels/TikTok|catalog|commerce_channel_products
Catalog/Channels/Amazon|catalog|commerce_channel_products
Catalog/Channels/Facebook Marketplace|catalog|commerce_channel_products
Catalog/Channels/Whatnot|catalog|commerce_channel_products
Catalog/Channels/Etsy|catalog|commerce_channel_products
Catalog/Channels/eBay|catalog|commerce_channel_products
Catalog/Channels/Website / CMS|catalog|cms_pages
Studio/New design|studio|designs
Studio/Upload|studio|design_files
Studio/AI|studio|design_assets
Studio/My library|studio|design_assets
Studio/My templates|studio|product_canvas_templates
Studio/Graphics & images|studio|design_assets
Studio/My products|studio|products
Studio/My stores|studio|commerce_order_channels
Studio/My orders|studio|erp_orders
Orders/Overview|orders|erp_orders
Orders/Order management/Orders|orders|erp_orders
Orders/Order management/Order detail|orders|erp_order_lines
Orders/Order management/Packing slip|orders|commerce_batch_slips
Orders/Order management/Order issues (needs attention)|orders|erp_orders
Orders/Order management/Shipping settings|orders|erp_shipping_methods
Orders/Purchasing/Purchase orders|orders|erp_purchase_orders
Orders/Purchasing/Fulfillment|orders|erp_fulfillment_orders
Orders/Purchasing/Inventory|inventory|erp_inventory_balances
Orders/Purchasing/Fulfillment queue|orders|fulfillment_orders
Orders/Purchasing/Batch slips & labels|orders|commerce_shipping_labels
Orders/Returns/Returns & claims|orders|erp_return_authorizations
Orders/Returns/Customer return requests|orders|customer_return_requests
Social Publishing/Overview|social|social_posts
Social Publishing/Calendar|social|social_schedule_slots
Social Publishing/Channels|social|social_accounts
Social Publishing/Create content|social|social_posts
Social Publishing/Library|social|social_media_assets
Social Publishing/Performance|social|social_post_targets
Social Publishing/Queue|social|social_publish_attempts
Social Publishing/Promotions & discounts|marketing|commerce_promotions
Social Publishing/Newsletter campaigns|marketing|crm_campaigns
Social Publishing/Newsletter subscribers|marketing|newsletter_subscribers
Social Publishing/Automation|marketing|crm_automation_workflows
Advertising/Ad center|advertising|ad_accounts
Advertising/Campaigns|advertising|ad_campaigns
Advertising/Ad sets|advertising|ad_campaign_groups
Advertising/Creatives|advertising|ad_creatives
Advertising/Audiences|advertising|ad_audiences
Advertising/Pixels|advertising|ad_events
Advertising/Ad spend & finance|advertising|ad_campaign_daily
Advertising/Advertisers|advertising|ad_advertisers
Marketing/Banners|marketing|cms_banners
Marketing/Popups|marketing|cms_popups
Marketing/CMS pages|marketing|cms_pages
Marketing/Content blocks|marketing|cms_content_blocks
Support/Overview|support|support_tickets
Support/Inbox & tickets/Tickets|support|support_tickets
Support/Inbox & tickets/Omnichannel inbox|support|support_channel_threads
Support/Queues|support|support_queues
Support/SLA & routing/SLA rules|support|support_sla_policies
Support/SLA & routing/Routing rules|support|support_routing_rules
Support/SLA & routing/Automations|support|support_automations
Support/On-call/Who's on call|support|support_v_oncall_now
Support/On-call/Schedules|support|support_oncall_schedules
Support/On-call/Overrides|support|support_oncall_overrides
Support/On-call/Escalation policies|support|support_escalation_policies
Support/On-call/Pages|support|support_pages
Support/SLA & routing/Business hours|support|support_business_hours
Support/SLA & routing/Holidays|support|support_holidays
Orders/Order management/Holds & needs attention|orders|erp_orders
Tasks/Reminders|tasks|platform_reminders
Tasks/Following|tasks|platform_record_followers
Settings/Workspace/Invitations|settings|platform_member_invitations
Settings/Workspace/Out of office|settings|platform_out_of_office
Settings/System/Notification preferences|settings|platform_notification_preferences
Support/Trust & safety/Knowledge base|support|support_kb_articles
Support/Trust & safety/Help center|support|support_kb_articles
Support/Trust & safety/Docs|support|cms_pages
Support/Trust & safety/Policies|support|policy_settings
Tasks/Board|tasks|crm_tasks
Tasks/List|tasks|crm_tasks
Tasks/Calendar|tasks|crm_tasks
Tasks/Personal inbox|tasks|user_notifications
Tasks/Team announcements|tasks|platform_announcements
Tasks/Personal chat|tasks|platform_chat_threads
Pinned/Favorites|platform|platform_create_favorites
Reports/Overview|reports|platform_report_definitions
Reports/Analytics explorer|reports|analytics_events
Reports/Dashboards|reports|platform_dashboards
Reports/Dashboard widgets|reports|platform_dashboard_widgets
Reports/Report templates|reports|platform_report_definitions
Reports/Scheduled reports|reports|platform_report_definitions
Reports/Finance report packages|reports|acct_report_packages
Reports/Support daily|reports|support_report_daily
Settings/Workspace/General|settings|tenant_settings
Settings/Workspace/Teammates|settings|tenant_memberships
Settings/Workspace/Roles and permissions|settings|platform_module_permissions
Settings/Workspace/External access|settings|portal_account_links
Settings/Workspace/Approvals and limits|settings|acct_ap_approvals
Settings/Workspace/Office hours|settings|support_business_hours
Settings/Workspace/Brands|settings|brands
Settings/Workspace/Activity log|settings|platform_audit_events
Settings/Workspace/Multilingual|settings|cms_locales
Settings/Accounting/Chart of accounts|settings|acct_chart_of_accounts
Settings/Accounting/Bank rules|settings|acct_bank_rules
Settings/Accounting/Recurring templates|settings|acct_recurring_invoices
Settings/Accounting/Budgets|settings|acct_budget_versions
Settings/Accounting/Financial settings|settings|acct_settings
Settings/CRM/Customer hub|settings|crm_settings
Settings/CRM/Segments & lists|settings|crm_segments
Settings/CRM/Lead capture|settings|crm_lead_sources
Settings/Catalog/Pricing & discounts|settings|commerce_price_lists
Settings/Catalog/Categories & tags|settings|tags
Settings/Marketing/Social channels|settings|social_accounts
Settings/Website/Website settings|settings|cms_website_settings
Settings/Website/Navigation|settings|cms_navigation_menus
Settings/Operations/Fulfillment & shipping|settings|shipping_profiles
Settings/Operations/Carriers|settings|erp_carriers
Settings/Operations/Inventory & warehouses|settings|erp_warehouses
Settings/Operations/Printers|settings|tenant_printer_settings
Settings/Analytics/KPI targets|settings|platform_kpi_targets
Settings/Analytics/KPI definitions|settings|acct_kpi_definitions
Settings/Support/Ticket channels|settings|support_channels
Settings/Support/SLA policies|settings|support_sla_policies
Settings/Support/Automation rules|settings|support_automations
Settings/Suppliers/Supplier portal|settings|suppliers
Settings/Suppliers/Contracts & pricing|settings|supplier_product_costs
Settings/Suppliers/Compliance & 1099|settings|acct_1099_thresholds
Settings/System/Integrations|settings|integration_connections
Settings/System/Data & privacy|settings|privacy_request_details
Settings/System/Notifications|settings|user_notifications
Settings/System/API tokens|settings|api_keys
Settings/System/Audit log|settings|platform_audit_events
Payroll/Employees|payroll|acct_employees
Payroll/Pay runs|payroll|acct_payroll_runs
Payroll/Pay run items|payroll|acct_payroll_run_items
Payroll/Deductions|payroll|acct_payroll_deductions
Payroll/Tax forms (W-2, 941, 940)|payroll|acct_payroll_tax_forms
Payroll/Contractors (1099-NEC)|payroll|acct_contractor_invites
Time/Time entries|time|acct_time_entries
Time/Time off|time|crm_time_off_requests
Time/Shift templates|time|crm_shift_templates
Time/Staff schedule|time|crm_staff_blocked_times
Inventory/Stock on hand|inventory|erp_inventory_balances
Inventory/Movements|inventory|erp_inventory_movements
Inventory/Transfers|inventory|erp_inventory_transfers
Inventory/Cycle counts|inventory|erp_inventory_count_sessions
Inventory/Lots|inventory|erp_inventory_lots
Inventory/Serial numbers|inventory|erp_inventory_serial_numbers
Inventory/Reservations|inventory|erp_inventory_reservations
Inventory/Cost layers|inventory|erp_inventory_cost_layers
Inventory/Warehouses|inventory|erp_warehouses
Inventory/Warehouse locations|inventory|erp_warehouse_locations
Sales Tax/Jurisdictions|sales_tax|acct_tax_jurisdictions
Sales Tax/Rates|sales_tax|acct_tax_rates
Sales Tax/Nexus|sales_tax|acct_tax_nexus
Sales Tax/Nexus alerts|sales_tax|tax_nexus_alerts
Sales Tax/Taxability rules|sales_tax|acct_tax_taxability_rules
Sales Tax/Exemptions|sales_tax|acct_tax_exemptions
Sales Tax/Tax transactions|sales_tax|acct_tax_transactions
Sales Tax/Filings|sales_tax|acct_tax_filings
Sales Tax/Marketplace remittance|sales_tax|seller_tax_remittance_filings
Contacts/CRM tools/Deals|crm|crm_deals
Contacts/CRM tools/Deals/Stage history|crm|crm_deal_stage_history
Contacts/CRM tools/Pipelines|crm|crm_pipelines
Contacts/CRM tools/Pipelines/Stages|crm|crm_pipeline_stages
Contacts/CRM tools/Lead scoring|crm|crm_lead_scoring_rules
Contacts/CRM tools/Lead scoring/Score bands|crm|crm_lead_score_bands
Contacts/CRM tools/Calls|crm|crm_calls
Contacts/CRM tools/Inbox|crm|platform_email_threads
Contacts/CRM tools/Inbox/Messages|crm|platform_email_messages
Contacts/CRM tools/Routes|crm|crm_routes
Contacts/CRM tools/Routes/Stops|crm|crm_route_stops
Contacts/CRM tools/Records|crm|crm_dependents
Contacts/CRM tools/Records/Record types|crm|crm_record_types
Contacts/CRM tools/Records/Events|crm|crm_record_events
Contacts/CRM tools/Records/Related parties|crm|crm_record_parties
Contacts/CRM tools/Documents|crm|crm_documents
Contacts/CRM tools/Activity|crm|crm_activity
Marketing/Webforms|marketing|platform_webforms
Marketing/Webforms/Submissions|marketing|platform_webform_submissions
Marketing/Sequences|marketing|crm_sequences
Marketing/Sequences/Steps|marketing|crm_sequence_steps
Marketing/Sequences/Enrollments|marketing|crm_sequence_enrollments
Marketing/Campaigns|marketing|crm_campaigns
Marketing/Suppressions|marketing|marketing_suppressions
Tasks/Calendar/Calendars|tasks|platform_calendars
Tasks/Calendar/Events|tasks|platform_calendar_events
Tasks/Calendar/Agenda|tasks|platform_v_agenda
Reports/Sales tracking|reports|crm_v_sales_tracking
Reports/Sales tracking/Pipeline summary|reports|crm_v_pipeline_summary
Settings/System/Mailboxes|settings|platform_mailboxes
Settings/System/Backups|settings|platform_backups
Settings/Customization/Custom fields|settings|platform_custom_fields
Settings/Customization/Picklists|settings|platform_picklist_values
Settings/Customization/Terminology|settings|platform_terminology
Settings/Customization/Record types|settings|crm_record_types
Settings/Modules|settings|platform_tenant_modules
Settings/Modules/Catalog|settings|platform_modules
Settings/Modules/Industry packs|settings|platform_tenant_packs
Settings/Modules/Pack contents|settings|platform_pack_items
Settings/Privacy/Data classification|settings|platform_data_classes
Settings/Privacy/Sensitive access log|settings|platform_sensitive_access_log
Settings/Privacy/Deployment compliance|settings|platform_deployment_profile
Marketplace/Sellers|marketplace|sellers
Marketplace/Settlements|marketplace|seller_settlements
Marketplace/Trust & safety/Violations|marketplace|seller_violations
Marketplace/Trust & safety/Investigations|marketplace|seller_investigations
Marketplace/Trust & safety/Appeals|marketplace|seller_appeals
Marketplace/Trust & safety/Enforcement|marketplace|seller_policy_enforcement
Marketplace/Trust & safety/Policies|marketplace|trust_policies
Community/Posts|community|ugc_posts
Community/Comments|community|ugc_comments
Community/Media|community|ugc_media
Community/Trust & safety/Reports|community|ugc_reports
Community/Trust & safety/Policies|community|trust_policies
Learning/Programs|learning|learn_programs
Learning/Programs/Units|learning|learn_units
Learning/Cohorts|learning|learn_cohorts
Learning/Cohorts/Staff|learning|learn_cohort_staff
Learning/Enrollments|learning|learn_enrollments
Learning/Progress|learning|learn_progress
Learning/Roster|learning|learn_v_roster
Settings/Workspace/Roles & titles|settings|platform_member_roles
Settings/Workspace/Roles & titles/Role catalog|settings|platform_roles
Settings/Workspace/Roles & titles/Aliases|settings|platform_role_aliases
Catalog/Sources/Source categories|catalog|catalog_source_categories
Catalog/Sources/Products|catalog|supplier_catalog_products
Catalog/Listing/Categories|catalog|taxonomy_nodes
Catalog/Listing/Category map|catalog|listing_category_map
Catalog/Listing/Published products|catalog|product_taxonomy_links
Catalog/Listing/Availability|catalog|listing_v_availability
$FT$, E'\n') l
         WHERE btrim(l) <> '') s
 ORDER BY trim(f[1]);

INSERT INTO public.platform_feature_tree_coverage(feature_path, module, backing_table, is_implemented)
SELECT f.path, f.module, f.backing, to_regclass('public.' || quote_ident(f.backing)) IS NOT NULL
  FROM _ft f
ON CONFLICT (feature_path) DO UPDATE SET module = EXCLUDED.module, backing_table = EXCLUDED.backing_table,
                                         is_implemented = EXCLUDED.is_implemented;

-- re-check every row (also rows that existed before this script)
UPDATE public.platform_feature_tree_coverage c
   SET is_implemented = (c.backing_table IS NOT NULL AND to_regclass('public.' || quote_ident(c.backing_table)) IS NOT NULL);

-- ---------------------------------------------------------------------
-- 4. Register the new tables and refresh security
-- ---------------------------------------------------------------------
SELECT count(*) AS tables_secured FROM public.platform__apply_app_security();
SELECT public.platform_classify_tables() AS tables_classified;

COMMIT;

-- ---------------------------------------------------------------------
-- 5. Background reconcile (orders the old storefront still writes)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'unify_reconcile';
    PERFORM cron.schedule('unify_reconcile', '*/10 * * * *', 'SELECT unify.reconcile()');
    RAISE NOTICE 'pg_cron: unify_reconcile scheduled every 10 minutes';
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('support_clocks','platform_reminders');
    PERFORM cron.schedule('support_clocks', '* * * * *', 'SELECT public.support_run_clocks()');
    PERFORM cron.schedule('platform_reminders', '* * * * *', 'SELECT public.platform_dispatch_reminders()');
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'crm_sequences';
    PERFORM cron.schedule('crm_sequences', '* * * * *', 'SELECT public.crm_run_sequences()');
    RAISE NOTICE 'pg_cron: support_clocks (SLA breaches + on-call escalation) and platform_reminders scheduled every minute';
  ELSE
    RAISE NOTICE 'pg_cron not installed: enable it (Database > Extensions) and re-run 07, or call SELECT unify.reconcile() (10 min), support_run_clocks(), platform_dispatch_reminders() and crm_run_sequences() (1 min) from a scheduler';
  END IF;
END $$;

-- report
SELECT status, count(*) AS actions FROM public.platform_action_coverage() GROUP BY status ORDER BY status;
SELECT module, count(*) AS paths, count(*) FILTER (WHERE is_implemented) AS implemented
  FROM public.platform_feature_tree_coverage GROUP BY module ORDER BY module;

-- canonical step ledger
SELECT unify.done('400');
