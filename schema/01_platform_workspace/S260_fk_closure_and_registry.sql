-- CANONICAL STEP 260  |  file S260_fk_closure_and_registry.sql  |  was unify/06_fk_closure_and_registry.sql  |  internal log label '06' (unchanged)
-- =====================================================================
-- S260_fk_closure_and_registry.sql — close every dangling reference.
--
-- Each *_id column without a foreign key (339 on a fresh build) gets one of:
--   fk      a real FOREIGN KEY (182; 28 of them to auth.users)
--   exempt  a documented reason it is not a row reference (132)
--   poly    registered as a polymorphic (type, id) pair (22)
--   legacy  ad_groups / ad_analytics / ad_leads: uuid campaign_id cannot point
--           at bigint ad_campaigns.id; the tables are marked legacy (retired by 05 logic)
-- Orphan values in NULLABLE columns (ids of rows that no longer exist) are
-- saved to unify.orphan_values and set to NULL so the FK validates; orphans
-- in NOT NULL columns are reported, never deleted.
-- Then reference / integration / log lifecycles are set for tables that
-- legitimately have no relationships. Idempotent.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 260 (internal label '06'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S260_fk_closure_and_registry.sql is step 260; run S200_unify_preflight.sql and every step up to 250 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('260');
END $guard$;
BEGIN;

CREATE TABLE IF NOT EXISTS unify.orphan_values(
  table_name text, column_name text, row_id text, old_value text, parent_table text, saved_at timestamptz DEFAULT now(),
  PRIMARY KEY (table_name, column_name, row_id));

CREATE OR REPLACE FUNCTION unify.is_base_table(t text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT relkind IN ('r','p') FROM pg_class WHERE oid = to_regclass('public.' || quote_ident(t))), false) $$;

-- FK to auth.users with the same logging contract as platform__ensure_fk
CREATE OR REPLACE FUNCTION unify.ensure_auth_fk(p_child text, p_col text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_name text := left(p_child || '_' || p_col || '_fk', 63); v_status text; v_orph bigint; v_nn boolean; v_t text;
BEGIN
  SELECT a.attnotnull, format_type(a.atttypid, a.atttypmod) INTO v_nn, v_t FROM pg_attribute a
   WHERE a.attrelid = to_regclass('public.' || quote_ident(p_child)) AND a.attname = p_col AND NOT a.attisdropped;
  IF v_t IS NULL THEN v_status := 'missing';
  ELSIF v_t <> 'uuid' THEN v_status := 'type_mismatch';
  ELSIF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
                 WHERE c.conrelid = to_regclass('public.' || quote_ident(p_child)) AND c.contype = 'f'
                   AND a.attname = p_col AND c.confrelid = 'auth.users'::regclass) THEN v_status := 'exists';
  ELSE
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE %s NOT VALID',
                   p_child, v_name, p_col, CASE WHEN v_nn THEN 'NO ACTION' ELSE 'SET NULL' END);
    BEGIN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', p_child, v_name); v_status := 'validated';
    EXCEPTION WHEN foreign_key_violation THEN
      EXECUTE format('SELECT count(*) FROM public.%I c WHERE c.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.%I)',
                     p_child, p_col, p_col) INTO v_orph;
      v_status := 'not_valid_orphans';
    END;
  END IF;
  INSERT INTO public.platform_fk_log AS l(child_table, child_column, parent_table, constraint_name, status, orphan_rows, detail, logged_at)
  VALUES (p_child, p_col, 'auth.users', v_name, v_status, v_orph, 'unify 06', now())
  ON CONFLICT (child_table, child_column) DO UPDATE SET parent_table = EXCLUDED.parent_table,
    status = CASE WHEN EXCLUDED.status = 'exists' AND l.status IN ('validated','not_valid_orphans') THEN l.status ELSE EXCLUDED.status END,
    orphan_rows = coalesce(EXCLUDED.orphan_rows, l.orphan_rows), logged_at = now();
  RETURN v_status;
END $$;

CREATE TEMP TABLE r_fk(child text, col text, parent text) ON COMMIT DROP;
INSERT INTO r_fk VALUES
  ('acct_ap_approvals','approver_id','auth.users'),
  ('acct_ar_invoice_lines','bill_line_id','acct_ap_bill_lines'),
  ('acct_ar_invoices','appointment_id','crm_appointments'),
  ('acct_ar_invoices','dependent_id','crm_dependents'),
  ('acct_ar_receipts','deposit_id','acct_bank_deposits'),
  ('acct_asset_classes','accumulated_depreciation_account_id','acct_chart_of_accounts'),
  ('acct_asset_classes','asset_account_id','acct_chart_of_accounts'),
  ('acct_asset_classes','depreciation_expense_account_id','acct_chart_of_accounts'),
  ('acct_bank_transactions','statement_id','acct_bank_statements'),
  ('acct_bank_transactions','suggested_rule_id','acct_bank_rules'),
  ('acct_book_account_mappings','target_account_id','acct_chart_of_accounts'),
  ('acct_close_task_comments','author_id','auth.users'),
  ('acct_close_tasks','assignee_id','auth.users'),
  ('acct_close_tasks','reviewer_id','auth.users'),
  ('acct_controls','evidence_attachment_id','acct_attachments'),
  ('acct_estimates','appointment_id','crm_appointments'),
  ('acct_estimates','converted_invoice_id','acct_ar_invoices'),
  ('acct_estimates','dependent_id','crm_dependents'),
  ('acct_intercompany_partners','due_from_account_id','acct_chart_of_accounts'),
  ('acct_intercompany_partners','due_to_account_id','acct_chart_of_accounts'),
  ('acct_intercompany_transactions','from_journal_id','acct_journal_entries'),
  ('acct_intercompany_transactions','to_journal_id','acct_journal_entries'),
  ('acct_inventory_moves','erp_movement_id','erp_inventory_movements'),
  ('acct_items','catalog_item_id','commerce_catalog_items'),
  ('acct_items','product_id','products'),
  ('acct_payroll_employees','user_id','auth.users'),
  ('acct_price_book_lines','catalog_product_id','products'),
  ('acct_recurring_invoices','payment_method_id','commerce_customer_payment_methods'),
  ('acct_refunds','receipt_id','acct_ar_receipts'),
  ('acct_review_comments','author_id','auth.users'),
  ('acct_review_findings','assignee_id','auth.users'),
  ('acct_tax_jurisdictions','authority_vendor_id','acct_vendors'),
  ('acct_tax_transactions','filing_id','acct_tax_filings'),
  ('acct_timesheets','time_clock_entry_id','crm_staff_time_clock_entries'),
  ('acct_vendors','default_terms_id','acct_payment_terms'),
  ('acct_vendors','w9_attachment_id','acct_attachments'),
  ('acct_workflow_actions','approver_id','auth.users'),
  ('ad_advertisers','user_id','auth.users'),
  ('admin_impersonation_sessions','admin_staff_id','auth.users'),
  ('ai_gateway_requests','user_id','auth.users'),
  ('analytics_export_runs','definition_id','platform_report_definitions'),
  ('carts','customer_id','crm_customers'),
  ('cms_gallery_items','dependent_id','crm_dependents'),
  ('cms_media_assets','category_id','categories'),
  ('collections','owner_id','auth.users'),
  ('commerce_accounting_mappings','cash_account_id','acct_chart_of_accounts'),
  ('commerce_accounting_mappings','cogs_account_id','acct_chart_of_accounts'),
  ('commerce_batch_slips','warehouse_id','erp_warehouses'),
  ('commerce_carts','customer_id','crm_customers'),
  ('commerce_carts','dependent_id','crm_dependents'),
  ('commerce_carts','register_session_id','commerce_register_sessions'),
  ('commerce_cash_movements','register_session_id','commerce_register_sessions'),
  ('commerce_catalog_item_taxonomy','item_id','commerce_catalog_items'),
  ('commerce_checkout_sessions','customer_id','crm_customers'),
  ('commerce_coupons','customer_id','crm_customers'),
  ('commerce_customer_accounts','customer_id','crm_customers'),
  ('commerce_customer_addresses','customer_id','crm_customers'),
  ('commerce_deposits','applied_invoice_id','acct_ar_invoices'),
  ('commerce_deposits','appointment_id','crm_appointments'),
  ('commerce_deposits','customer_id','crm_customers'),
  ('commerce_deposits','dependent_id','crm_dependents'),
  ('commerce_gift_cards','customer_id','crm_customers'),
  ('commerce_gift_cards','purchaser_customer_id','crm_customers'),
  ('commerce_inventory_alerts','warehouse_id','erp_warehouses'),
  ('commerce_loyalty_accounts','customer_id','crm_customers'),
  ('commerce_payments','acct_receipt_id','acct_ar_receipts'),
  ('commerce_payments','customer_id','crm_customers'),
  ('commerce_sale_lines','dependent_id','crm_dependents'),
  ('commerce_sales','appointment_id','crm_appointments'),
  ('commerce_sales','customer_id','crm_customers'),
  ('commerce_sales','dependent_id','crm_dependents'),
  ('commerce_sales','register_session_id','commerce_register_sessions'),
  ('commerce_shipping_labels','shipment_id','erp_shipments'),
  ('commerce_store_credits','customer_id','crm_customers'),
  ('commerce_subscriptions','customer_id','crm_customers'),
  ('commerce_subscriptions','dependent_id','crm_dependents'),
  ('crm_activity','appointment_id','crm_appointments'),
  ('crm_activity','dependent_id','crm_dependents'),
  ('crm_appointment_services','appointment_id','crm_appointments'),
  ('crm_appointment_services','dependent_id','crm_dependents'),
  ('crm_automation_enrollments','appointment_id','crm_appointments'),
  ('crm_automation_enrollments','dependent_id','crm_dependents'),
  ('crm_commission_entries','appointment_id','crm_appointments'),
  ('crm_conversations','dependent_id','crm_dependents'),
  ('crm_documents','dependent_id','crm_dependents'),
  ('crm_messages','authored_by_staff_id','crm_staff'),
  ('crm_needs_attention','appointment_id','crm_appointments'),
  ('crm_needs_attention','dependent_id','crm_dependents'),
  ('crm_notes','appointment_id','crm_appointments'),
  ('crm_notes','dependent_id','crm_dependents'),
  ('crm_notes','service_record_id','crm_appointment_services'),
  ('crm_party_dependents','dependent_id','crm_dependents'),
  ('crm_permanent_alerts','dependent_id','crm_dependents'),
  ('crm_product_recommendations','appointment_id','crm_appointments'),
  ('crm_product_recommendations','dependent_id','crm_dependents'),
  ('crm_product_recommendations','resulting_sale_id','commerce_sales'),
  ('crm_saved_views','owner_user_id','auth.users'),
  ('crm_saved_views','user_id','auth.users'),
  ('crm_segment_memberships','dependent_id','crm_dependents'),
  ('crm_staff','user_id','auth.users'),
  ('crm_staff_incident_reports','appointment_id','crm_appointments'),
  ('crm_staff_incident_reports','dependent_id','crm_dependents'),
  ('crm_tasks','appointment_id','crm_appointments'),
  ('crm_waitlist','dependent_id','crm_dependents'),
  ('customer_ai_disclosure_acks','customer_id','crm_customers'),
  ('customer_return_requests','auth_user_id','auth.users'),
  ('customer_return_requests','customer_id','crm_customers'),
  ('customer_return_requests','order_id','orders'),
  ('designs','owner_id','auth.users'),
  ('designs','published_product_id','products'),
  ('dmca_details','signature_attachment_id','support_attachments'),
  ('dmca_details','target_seller_id','sellers'),
  ('ecommerce_orders','storefront_order_id','orders'),
  ('efile_filing_records','employee_id','acct_employees'),
  ('erp_inventory_reservations','source_order_line_id','erp_order_lines'),
  ('erp_inventory_transactions','product_id','erp_products'),
  ('erp_inventory_transactions','variant_id','erp_product_variants'),
  ('erp_inventory_transfers','from_warehouse_id','erp_warehouses'),
  ('erp_inventory_transfers','to_warehouse_id','erp_warehouses'),
  ('erp_order_lines','dependent_id','crm_dependents'),
  ('erp_order_lines','storefront_order_item_id','order_items'),
  ('erp_orders','dependent_id','crm_dependents'),
  ('identity_grants','user_id','auth.users'),
  ('inventory_levels','variant_id','product_variants'),
  ('message_flags','reporter_id','auth.users'),
  ('order_cases','investigation_id','seller_investigations'),
  ('order_fulfillment_logs','order_id','orders'),
  ('order_shipping_estimates','order_id','orders'),
  ('orders','customer_id','crm_customers'),
  ('partner_application_documents','verification_task_id','crm_tasks'),
  ('platform_account_subscriptions','account_user_id','auth.users'),
  ('platform_module_permissions','staff_id','crm_staff'),
  ('portal_customer_accounts','customer_id','crm_customers'),
  ('portal_magic_links','appointment_id','crm_appointments'),
  ('portal_magic_links','customer_id','crm_customers'),
  ('portal_users','parent_id','portal_users'),
  ('product_questions','product_id','products'),
  ('product_reviews','product_id','products'),
  ('products','created_by_seller_id','sellers'),
  ('products','owner_id','auth.users'),
  ('projects','active_supplier_catalog_product_id','supplier_catalog_products'),
  ('projects','owner_id','auth.users'),
  ('provider_jobs','product_id','products'),
  ('seller_1099k_generations','tax_document_id','efile_filing_records'),
  ('seller_ad_campaigns','listing_id','products'),
  ('seller_dpa_acceptances','policy_id','trust_policies'),
  ('seller_investigations','investigator_id','auth.users'),
  ('seller_policy_enforcement','policy_id','trust_policies'),
  ('seller_self_serve_profiles','case_id','onboarding_cases'),
  ('seller_self_serve_profiles','user_id','auth.users'),
  ('seller_social_posts','listing_id','products'),
  ('seller_violations','listing_id','products'),
  ('seller_violations','policy_id','trust_policies'),
  ('shop_category_images','node_id','taxonomy_nodes'),
  ('social_post_series','listing_id','products'),
  ('social_posts','author_id','auth.users'),
  ('social_posts','listing_id','products'),
  ('social_posts','queued_slot_id','social_schedule_slots'),
  ('stripe_pending_charges','customer_id','crm_customers'),
  ('stripe_pending_charges','payment_id','commerce_payments'),
  ('supply_service_map','service_id','crm_services'),
  ('support_attachments','event_id','support_ticket_events'),
  ('support_attachments','uploaded_by_staff_id','crm_staff'),
  ('support_categories','default_sla_policy_id','support_sla_policies'),
  ('support_categories','default_team_id','support_teams'),
  ('support_contacts','staff_id','crm_staff'),
  ('support_queues','owner_staff_id','crm_staff'),
  ('support_side_conversations','created_by_staff_id','crm_staff'),
  ('support_team_members','staff_id','crm_staff'),
  ('support_ticket_participants','staff_id','crm_staff'),
  ('support_tickets','assigned_staff_id','crm_staff'),
  ('support_tickets','locked_by_staff_id','crm_staff'),
  ('support_tickets','requester_staff_id','crm_staff'),
  ('support_tickets','requester_user_id','auth.users'),
  ('ugc_comments','customer_id','crm_customers'),
  ('ugc_media','owner_customer_id','crm_customers'),
  ('ugc_posts','customer_id','crm_customers'),
  ('ugc_reactions','customer_id','crm_customers'),
  ('ugc_reports','reporter_customer_id','crm_customers'),
  ('ugc_shares','customer_id','crm_customers'),
  ('user_tenants','user_id','auth.users'),
  ('user_workspace_sessions','user_id','auth.users');
CREATE TEMP TABLE r_ex(child text, col text, reason text) ON COMMIT DROP;
INSERT INTO r_ex VALUES
  ('acct_ap_payments','batch_id','groups payments created in one acct_pay_bills run; no batch header table by design'),
  ('acct_ap_payments','processor_transaction_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_ar_invoices','booking_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_ar_invoices','source_customer_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_ar_receipts','processor_transaction_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_attachments','entity_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_bank_accounts','account_number_vault_id','Supabase Vault secret id'),
  ('acct_disputes','charge_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_disputes','processor_dispute_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_journal_lines','customer_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_journal_lines','department_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_journal_lines','employee_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_journal_lines','location_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_journal_lines','project_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_journal_lines','source_line_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_journal_lines','vendor_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_legacy_map','legacy_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_refunds','processor_refund_id','external/provider or legacy text identifier (text); not a row reference'),
  ('acct_vendors','ach_account_vault_id','Supabase Vault secret id'),
  ('acct_vendors','tin_vault_id','Supabase Vault secret id'),
  ('acct_workflow_instances','entity_id','external/provider or legacy text identifier (text); not a row reference'),
  ('ad_event_counters','campaign_id','external/provider or legacy text identifier (bigint); not a row reference'),
  ('ad_event_counters','creative_id','external/provider or legacy text identifier (bigint); not a row reference'),
  ('admin_impersonation_sessions','target_auth_user_id','external/provider or legacy text identifier (text); not a row reference'),
  ('admin_impersonation_sessions','target_id','external/provider or legacy text identifier (text); not a row reference'),
  ('admin_manual_overrides','target_id','external/provider or legacy text identifier (text); not a row reference'),
  ('ai_ab_tests','prompt_id','AI gateway prompt registry key (prompts live in the AI gateway, not this database)'),
  ('ai_tasks','model_id','AI gateway model registry key'),
  ('ai_tasks','prompt_id','AI gateway prompt registry key (prompts live in the AI gateway, not this database)'),
  ('bill_items','product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('chargeback_details','dispute_id','external/provider or legacy text identifier (text); not a row reference'),
  ('checkouts','payment_id','external/provider or legacy text identifier (text); not a row reference'),
  ('cms_component_analytics','component_id','external/provider or legacy text identifier (text); not a row reference'),
  ('cms_content_blocks','block_id','external/provider or legacy text identifier (text); not a row reference'),
  ('cms_content_blocks','slot_id','external/provider or legacy text identifier (text); not a row reference'),
  ('cms_media_assets','media_id','external/provider or legacy text identifier (text); not a row reference'),
  ('commerce_catalog_item_taxonomy','node_id','external/provider or legacy text identifier (text); not a row reference'),
  ('commerce_disputes','processor_dispute_id','external/provider or legacy text identifier (text); not a row reference'),
  ('commerce_payments','processor_transaction_id','external/provider or legacy text identifier (text); not a row reference'),
  ('commerce_products','category_id','external/provider or legacy text identifier (bigint); not a row reference'),
  ('commerce_promotion_targets','target_id','external/provider or legacy text identifier (text); not a row reference'),
  ('crm_customers','source_customer_id','external/provider or legacy text identifier (text); not a row reference'),
  ('crm_households','source_household_id','external/provider or legacy text identifier (text); not a row reference'),
  ('crm_messages','rfc822_message_id','external/provider or legacy text identifier (text); not a row reference'),
  ('customer_wishlist_items','product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('dropship_pipe_mappings','product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('dropship_pipe_mappings','supplier_id','external/provider or legacy text identifier (text); not a row reference'),
  ('efile_filing_records','tin_vault_id','external/provider or legacy text identifier (text); not a row reference'),
  ('efile_state_settings','credential_secret_id','Supabase Vault secret id'),
  ('efile_submissions','receipt_id','external/provider or legacy text identifier (text); not a row reference'),
  ('efile_transmitter_credentials','api_client_id_secret_id','Supabase Vault secret id'),
  ('efile_transmitter_credentials','signing_key_secret_id','Supabase Vault secret id'),
  ('email_inbound_messages','message_id','external/provider or legacy text identifier (text); not a row reference'),
  ('erp_orders','source_order_id','external/provider or legacy text identifier (text); not a row reference'),
  ('erp_products','source_product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('estimate_items','product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('fulfillment_items','supplier_catalog_variant_external_id','external/provider or legacy text identifier (text); not a row reference'),
  ('fulfillment_orders','supplier_order_external_id','external/provider or legacy text identifier (text); not a row reference'),
  ('fulfillment_packages','label_id','external/provider or legacy text identifier (text); not a row reference'),
  ('google_ga4_daily','property_id','external/provider or legacy text identifier (text); not a row reference'),
  ('google_ga4_landing_pages','property_id','external/provider or legacy text identifier (text); not a row reference'),
  ('google_merchant_sync_state','catalog_item_id','external/provider or legacy text identifier (text); not a row reference'),
  ('google_merchant_sync_state','offer_id','external/provider or legacy text identifier (text); not a row reference'),
  ('integration_connections','credential_secret_id','Supabase Vault secret id'),
  ('integration_webhook_inbox','event_id','external/provider or legacy text identifier (text); not a row reference'),
  ('inventory_transactions','booking_id','external/provider or legacy text identifier (text); not a row reference'),
  ('inventory_transactions','order_id','external/provider or legacy text identifier (text); not a row reference'),
  ('journal_lines','order_id','external/provider or legacy text identifier (text); not a row reference'),
  ('journal_lines','payment_id','external/provider or legacy text identifier (text); not a row reference'),
  ('journal_lines','product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('mef_ack_errors','document_id','external/provider or legacy text identifier (text); not a row reference'),
  ('mef_ats_status','software_id','external/provider or legacy text identifier (text); not a row reference'),
  ('mef_providers','a2a_app_sys_id','external/provider or legacy text identifier (text); not a row reference'),
  ('mef_providers','cert_secret_id','Supabase Vault secret id'),
  ('mef_signatures','ero_pin_secret_id','Supabase Vault secret id'),
  ('mef_signatures','online_pin_secret_id','Supabase Vault secret id'),
  ('mef_signatures','taxpayer_pin_secret_id','Supabase Vault secret id'),
  ('mef_signers','online_pin_secret_id','Supabase Vault secret id'),
  ('mef_submissions','submission_id','external/provider or legacy text identifier (text); not a row reference'),
  ('mef_transmissions','message_id','external/provider or legacy text identifier (text); not a row reference'),
  ('mef_transmissions','receipt_id','external/provider or legacy text identifier (text); not a row reference'),
  ('order_cases','customer_id','external/provider or legacy text identifier (text); not a row reference'),
  ('order_cases','order_id','external/provider or legacy text identifier (text); not a row reference'),
  ('payment_transactions','booking_id','external/provider or legacy text identifier (text); not a row reference'),
  ('payment_transactions','connected_account_id','external/provider or legacy text identifier (text); not a row reference'),
  ('payment_transactions','order_id','external/provider or legacy text identifier (text); not a row reference'),
  ('payroll_employees','user_id','external/provider or legacy text identifier (text); not a row reference'),
  ('products','source_product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('promo_redemptions','booking_id','external/provider or legacy text identifier (text); not a row reference'),
  ('promo_redemptions','dependent_id','external/provider or legacy text identifier (text); not a row reference'),
  ('promo_redemptions','order_id','external/provider or legacy text identifier (text); not a row reference'),
  ('purchase_order_items','product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('quarantine','source_product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('receipt_items','product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('recurring_invoice_items','product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('sales_order_items','product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('seller_customer_messages','thread_id','conversation grouping key; thread = first message id'),
  ('seller_investigations','order_id','external/provider or legacy text identifier (text); not a row reference'),
  ('seller_live_streams','mux_live_stream_id','external/provider or legacy text identifier (text); not a row reference'),
  ('seller_live_streams','mux_playback_id','external/provider or legacy text identifier (text); not a row reference'),
  ('seller_live_streams','recording_asset_id','external/provider or legacy text identifier (text); not a row reference'),
  ('seller_live_streams','recording_playback_id','external/provider or legacy text identifier (text); not a row reference'),
  ('seller_settlement_reversals','order_id','external/provider or legacy text identifier (text); not a row reference'),
  ('seller_settlements','seller_order_id','external/provider or legacy text identifier (text); not a row reference'),
  ('shop_grid_cards','seller_id','external/provider or legacy text identifier (text); not a row reference'),
  ('social_accounts','metricool_brand_id','external/provider or legacy text identifier (text); not a row reference'),
  ('social_accounts','platform_account_id','external/provider or legacy text identifier (text); not a row reference'),
  ('social_oauth_tokens','key_id','external/provider or legacy text identifier (text); not a row reference'),
  ('social_platform_apps','client_id','external/provider or legacy text identifier (text); not a row reference'),
  ('social_post_networks','metricool_post_id','external/provider or legacy text identifier (text); not a row reference'),
  ('social_post_targets','platform_post_id','external/provider or legacy text identifier (text); not a row reference'),
  ('social_posts','metricool_post_id','external/provider or legacy text identifier (text); not a row reference'),
  ('stg_feed','source_product_id','external/provider or legacy text identifier (text); not a row reference'),
  ('stg_feed','source_variant_id','external/provider or legacy text identifier (text); not a row reference'),
  ('subscriptions','dependent_id','external/provider or legacy text identifier (text); not a row reference'),
  ('supplier_mockup_templates','printfile_id','external/provider or legacy text identifier (255); not a row reference'),
  ('supplier_mockup_templates','supplier_blueprint_id','external/provider or legacy text identifier (255); not a row reference'),
  ('supplier_print_specs','supplier_blueprint_id','external/provider or legacy text identifier (255); not a row reference'),
  ('supplier_product_costs','supplier_variant_id','external/provider or legacy text identifier (255); not a row reference'),
  ('support_tickets','incident_id','groups tickets raised for the same incident; incident = parent ticket id'),
  ('taxonomy_category_bridge','old_category_id','external/provider or legacy text identifier (bigint); not a row reference'),
  ('teller_accounts','account_number_secret_id','Supabase Vault secret id'),
  ('teller_accounts','institution_id','external/provider or legacy text identifier (text); not a row reference'),
  ('teller_enrollments','access_token_secret_id','Supabase Vault secret id'),
  ('teller_enrollments','enrollment_id','external/provider or legacy text identifier (text); not a row reference'),
  ('teller_enrollments','institution_id','external/provider or legacy text identifier (text); not a row reference'),
  ('tenants','tax_id','external/provider or legacy text identifier (text); not a row reference'),
  ('ugc_media','mux_asset_id','external/provider or legacy text identifier (text); not a row reference'),
  ('ugc_media','mux_playback_id','external/provider or legacy text identifier (text); not a row reference'),
  ('user_session_tabs','group_id','external/provider or legacy text identifier (255); not a row reference'),
  ('user_session_tabs','tab_id','external/provider or legacy text identifier (255); not a row reference'),
  ('user_workspace_sessions','active_tab_id','external/provider or legacy text identifier (255); not a row reference'),
  ('crm_staff_blocked_times','legacy_id','id of the migrated legacy blocked_times/availability row (text); provenance only');
CREATE TEMP TABLE r_po(child text, type_col text, id_col text) ON COMMIT DROP;
INSERT INTO r_po VALUES
  ('acct_bank_transactions','matched_doc_type','matched_doc_id'),
  ('acct_fixed_assets','source_doc_type','source_doc_id'),
  ('acct_fixed_assets','source_doc_type','source_line_id'),
  ('acct_inventory_moves','source_type','source_line_id'),
  ('acct_journal_entries','source_doc_type','source_doc_id'),
  ('acct_legacy_map','new_table','new_id'),
  ('acct_party_addresses','party_type','party_id'),
  ('acct_recognition_schedules','source_doc_type','source_doc_id'),
  ('acct_tax_transactions','source_doc_type','source_doc_id'),
  ('ai_tasks','subject_type','subject_id'),
  ('cms_versions','entity_type','entity_id'),
  ('commerce_cash_movements','reference_type','reference_id'),
  ('commerce_idempotency','resource_type','resource_id'),
  ('crm_external_identities','entity_type','entity_id'),
  ('crm_search_index','entity_type','entity_id'),
  ('erp_inventory_transactions','reference_type','reference_id'),
  ('partner_application_documents','application_kind','application_id'),
  ('portal_account_links','entity_type','entity_id'),
  ('seo_overrides','entity_type','entity_id'),
  ('ugc_reactions','target_type','target_id'),
  ('ugc_reports','target_type','target_id'),
  ('ugc_shares','target_type','target_id');
CREATE TEMP TABLE r_lg(child text, col text, canonical text) ON COMMIT DROP;
INSERT INTO r_lg VALUES
  ('ad_analytics','campaign_id','ad_campaign_daily'),
  ('ad_groups','campaign_id','ad_campaign_groups'),
  ('ad_leads','campaign_id','crm_leads');

-- 1. foreign keys
DO $$
DECLARE r record; s text; n int := 0;
BEGIN
  FOR r IN SELECT * FROM r_fk LOOP
    IF NOT unify.is_base_table(r.child) THEN CONTINUE; END IF;            -- child retired by 05
    IF r.parent = 'auth.users' THEN
      s := unify.ensure_auth_fk(r.child, r.col);
    ELSIF unify.is_base_table(r.parent) THEN
      s := public.platform__ensure_fk(r.child, r.col, r.parent, 'id', NULL, 'unify 06');
    ELSE                                                                   -- parent retired by 05
      INSERT INTO public.platform_fk_exemptions VALUES (r.child, r.col, 'parent ' || r.parent || ' retired to archive')
      ON CONFLICT (table_name, column_name) DO NOTHING;
      s := 'exempt_parent_retired';
    END IF;
    n := n + 1;
  END LOOP;
  PERFORM unify.log('fk_closure', NULL, 'fks_processed', n::text);
END $$;

-- 2. nullable orphans -> saved + NULL, then validate
DO $$
DECLARE l record; nn boolean; pk text; ptab text; pcol text; s text;
BEGIN
  FOR l IN SELECT * FROM public.platform_fk_log WHERE status = 'not_valid_orphans' LOOP
    SELECT a.attnotnull INTO nn FROM pg_attribute a WHERE a.attrelid = to_regclass('public.' || quote_ident(l.child_table)) AND a.attname = l.child_column;
    IF nn IS DISTINCT FROM false OR NOT unify.has_col(l.child_table, 'id') THEN CONTINUE; END IF;
    ptab := CASE WHEN l.parent_table = 'auth.users' THEN 'auth.users' ELSE 'public.' || quote_ident(l.parent_table) END;
    SELECT pa.attname INTO pcol FROM pg_constraint c JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
     WHERE c.conrelid = to_regclass('public.' || quote_ident(l.child_table)) AND c.conname = l.constraint_name;
    pcol := coalesce(pcol, 'id');
    EXECUTE format('INSERT INTO unify.orphan_values(table_name, column_name, row_id, old_value, parent_table)
                    SELECT %L, %L, c.id::text, c.%I::text, %L FROM public.%I c
                     WHERE c.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %s p WHERE p.%I = c.%I) ON CONFLICT DO NOTHING',
                   l.child_table, l.child_column, l.child_column, l.parent_table, l.child_table, l.child_column, ptab, pcol, l.child_column);
    EXECUTE format('UPDATE public.%I c SET %I = NULL WHERE c.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %s p WHERE p.%I = c.%I)',
                   l.child_table, l.child_column, l.child_column, ptab, pcol, l.child_column);
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', l.child_table, l.constraint_name);
    UPDATE public.platform_fk_log SET status = 'validated', detail = concat_ws('; ', detail, orphan_rows || ' orphan values saved to unify.orphan_values and cleared'), logged_at = now()
     WHERE child_table = l.child_table AND child_column = l.child_column;
  END LOOP;
END $$;

-- 3. exemptions and polymorphic pairs
INSERT INTO public.platform_fk_exemptions(table_name, column_name, reason)
SELECT child, col, reason FROM r_ex WHERE unify.is_base_table(child)
ON CONFLICT (table_name, column_name) DO UPDATE SET reason = EXCLUDED.reason;
INSERT INTO public.platform_polymorphic_columns(table_name, type_column, id_column)
SELECT child, type_col, id_col FROM r_po WHERE unify.is_base_table(child)
ON CONFLICT (table_name, id_column) DO UPDATE SET type_column = EXCLUDED.type_column;

-- 4. ad_* tables whose campaign_id cannot reference ad_campaigns: legacy -> retire
INSERT INTO public.platform_canonical_map(legacy_table, canonical_table, relation, notes)
SELECT child, canonical, 'legacy', 'uuid ' || col || ' cannot reference bigint ad_campaigns.id' FROM r_lg
ON CONFLICT (legacy_table) DO NOTHING;
SELECT public.platform__apply_canonical_map();
DO $$
DECLARE r record; d text;
BEGIN
  FOR r IN SELECT DISTINCT child, canonical FROM r_lg LOOP
    BEGIN d := unify.retire_one(r.child, r.canonical);
    EXCEPTION WHEN others THEN d := CASE WHEN SQLERRM LIKE 'BLOCKED%' THEN SQLERRM ELSE 'BLOCKED: ' || SQLERRM END; END;
    INSERT INTO unify.retire_report(legacy_table, canonical_table, decision, detail)
    VALUES (r.child, r.canonical, split_part(d, ':', 1), nullif(substr(d, length(split_part(d, ':', 1)) + 2), ''))
    ON CONFLICT (legacy_table) DO UPDATE SET decision = EXCLUDED.decision, detail = EXCLUDED.detail, decided_at = now();
  END LOOP;
END $$;

-- 5. lifecycles for tables that legitimately stand alone
UPDATE public.platform_table_registry SET lifecycle = 'reference', classified_at = now()
 WHERE lifecycle IN ('active','legacy') AND table_name IN (
   'acct_1099_thresholds','ad_account_tiers','ad_exchange_partners','ad_rate_card','fsm_transitions','gated_brands',
   'geo_zip_cache','mef_payroll_constants','mef_compliance_controls','shipping_memberships','shop_image_dims',
   'site_templates','social_platform_capabilities','supplier_category_mapping','support_permissions',
   'teller_sign_convention','app_settings')
    OR (lifecycle = 'active' AND table_name LIKE 'platform\_%' AND table_name IN (
         SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
            AND NOT EXISTS (SELECT 1 FROM pg_constraint f WHERE f.contype = 'f' AND (f.conrelid = c.oid OR f.confrelid = c.oid))));
UPDATE public.platform_table_registry SET lifecycle = 'integration', classified_at = now()
 WHERE lifecycle IN ('active','legacy')
   AND (table_name IN ('dropship_pipe_mappings','integration_secrets','oauth_states','social_platform_apps','stg_feed','app_password_credentials')
        OR table_name LIKE 'google\_%');
UPDATE public.platform_table_registry SET lifecycle = 'log', classified_at = now()
 WHERE lifecycle IN ('active','legacy')
   AND table_name IN ('ad_event_counters','contact_message','mef_security_incidents','pdp_behavior_scores','google_indexing_submissions');

-- 6. access modes for shared catalogs / reference data that have no tenant path
--    (they were RLS-on with only the platform-admin policy = unreadable by the app)
INSERT INTO public.platform_table_access_overrides(table_name, access_mode, notes)
SELECT t, m, 'unify 06: shared/reference data, no tenant path' FROM (VALUES
  ('supplier_catalog_products','global_read'), ('supplier_catalog_variants','global_read'),
  ('supplier_category_memory','global_read'), ('supplier_category_visibility','global_read'),
  ('supplier_fulfillment_locations','global_read'), ('supplier_mockup_templates','global_read'),
  ('supplier_print_specs','global_read'), ('supplier_product_costs','global_read'),
  ('mef_schema_versions','global_read'), ('mef_business_rules','global_read'), ('mef_fee_schedule','global_read'),
  ('jurisdiction_rules','global_read'), ('tax_disclosure_items','global_read'), ('ad_rate_card_items','global_read'),
  ('acct_1099_thresholds','global_read'),
  ('product_questions','public_read'), ('shop_category_images','public_read'),
  ('acct_processor_events','service_only')) v(t, m)
WHERE unify.is_base_table(t)
  AND NOT EXISTS (SELECT 1 FROM public.platform_table_access_overrides o WHERE o.table_name = v.t);
SELECT count(*) AS security_actions FROM public.platform__apply_app_security();
-- acct_* tables are skipped by platform__apply_app_security; finish acct_processor_events by hand
DO $$ BEGIN
  IF unify.is_base_table('acct_processor_events') THEN
    REVOKE ALL ON public.acct_processor_events FROM anon, authenticated;
  END IF;
END $$;

SELECT public.platform_classify_tables();
SELECT public.platform__apply_canonical_map();
COMMIT;

SELECT category, count(*) FROM public.platform_integrity_report(false) GROUP BY 1 ORDER BY 1;

-- canonical step ledger
SELECT unify.done('260');
