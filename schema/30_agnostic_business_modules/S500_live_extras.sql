-- CANONICAL STEP 500  |  file S500_live_extras.sql  |  was unify/08_live_extras.sql  |  internal log label '08' (unchanged)
-- =====================================================================
-- S500_live_extras.sql — conform the live-only objects (not in the target
-- schema) so the database is exactly: target schema + unify additions.
--
-- Decisions live in unify.live_extras (edit and re-run to change them):
--   keep           part of the app; gets FKs, RLS and a registry row
--                  (design_renders, design_queue: the PoD render loop)
--   archive        unused; moved to schema archive with every row kept.
--                  DB functions that only serve it (the rules engine's
--                  apply_bulk etc.) move to archive with it.
--   keep_external  owned by another system that connects as the DB owner
--                  (e.g. Payload CMS): kept, service-only, outside the
--                  ERP integrity checks
--   review         nobody has decided yet -> 09_verify fails and lists it
--
-- An object is only archived when nothing that stays depends on it:
-- no FK from a kept table, no view that stays, no target-schema function
-- reading it, and no trigger on a kept table calling one of its functions.
-- Otherwise it is BLOCKED and 09 fails with the reason.
-- Nothing is dropped. Idempotent.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 500 (internal label '08'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S500_live_extras.sql is step 500; run S200_unify_preflight.sql and every step up to 400 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('500');
END $guard$;
BEGIN;

CREATE SCHEMA IF NOT EXISTS archive;

-- target schema + objects the unify package creates (snapshot of a clean build)
CREATE TABLE IF NOT EXISTS unify.known_objects(name text PRIMARY KEY);
INSERT INTO unify.known_objects SELECT unnest(ARRAY[
'acct_1099_thresholds','acct_account_balances','acct_account_dimension_rules','acct_account_roles',
'acct_allocation_rules','acct_allocations','acct_ap_approvals','acct_ap_bill_lines','acct_ap_bills',
'acct_ap_payment_applications','acct_ap_payments','acct_ap_purchase_order_lines','acct_ap_purchase_orders',
'acct_ap_vendor_credit_applications','acct_ap_vendor_credit_lines','acct_ap_vendor_credits',
'acct_ar_collections_cases','acct_ar_credit_memos','acct_ar_invoice_lines','acct_ar_invoices',
'acct_ar_receipt_applications','acct_ar_receipts','acct_asset_books','acct_asset_classes',
'acct_asset_depreciation_lines','acct_asset_depreciation_runs','acct_attachments','acct_audit_log',
'acct_auto_reversals','acct_bank_accounts','acct_bank_deposit_lines','acct_bank_deposits',
'acct_bank_rule_conditions','acct_bank_rule_splits','acct_bank_rules','acct_bank_statements',
'acct_bank_transactions','acct_bank_transfers','acct_book_account_mappings','acct_books','acct_budget_lines',
'acct_budget_versions','acct_channel_accounts','acct_channel_settlement_lines','acct_channel_settlements',
'acct_chart_of_accounts','acct_close_checklists','acct_close_task_comments','acct_close_tasks',
'acct_close_template_tasks','acct_close_templates','acct_closes','acct_consolidation_groups',
'acct_consolidation_members','acct_consolidation_runs','acct_contractor_invites','acct_controls',
'acct_credit_memo_applications','acct_currencies','acct_customer_statements','acct_customers',
'acct_debt_instruments','acct_debt_schedule','acct_dimension_values','acct_dimensions','acct_disputes',
'acct_document_inbox','acct_employees','acct_entities','acct_estimate_lines','acct_estimates',
'acct_exchange_rates','acct_expense_lines','acct_expense_reports','acct_fiscal_years','acct_fixed_assets',
'acct_flux_explanations','acct_fx_revaluation_runs','acct_gateway_clearing_entries',
'acct_gift_card_transactions','acct_gift_cards','acct_import_jobs','acct_integration_idempotency',
'acct_intercompany_partners','acct_intercompany_transactions','acct_inventory_layer_draws',
'acct_inventory_layers','acct_inventory_moves','acct_item_classifications','acct_items',
'acct_journal_batches','acct_journal_entries','acct_journal_lines','acct_kpi_definitions',
'acct_lease_payments','acct_leases','acct_legacy_map','acct_number_sequences','acct_order_payments',
'acct_order_postings','acct_party_addresses','acct_pay_periods','acct_payment_links','acct_payment_terms',
'acct_payouts','acct_payroll_deductions','acct_payroll_employees','acct_payroll_run_items',
'acct_payroll_runs','acct_payroll_tax_forms','acct_periods','acct_price_book_lines','acct_price_books',
'acct_processor_events','acct_receipt_extractions','acct_recognition_lines','acct_recognition_schedules',
'acct_reconciliation_items','acct_reconciliations','acct_recurring_bills','acct_recurring_invoice_lines',
'acct_recurring_invoices','acct_recurring_journals','acct_refund_policies','acct_refunds',
'acct_report_packages','acct_report_snapshots','acct_revenue_contracts',
'acct_revenue_performance_obligations','acct_revenue_recognition_schedules','acct_review_comments',
'acct_review_findings','acct_review_ignore_rules','acct_review_runs','acct_scheduled_payments',
'acct_settings','acct_spend_lines','acct_spend_transactions','acct_statement_batches','acct_tax_categories',
'acct_tax_codes','acct_tax_exemptions','acct_tax_filings','acct_tax_jurisdictions','acct_tax_lines',
'acct_tax_nexus','acct_tax_rates','acct_tax_rules','acct_tax_taxability_rules','acct_tax_transactions',
'acct_time_entries','acct_timesheets','acct_transaction_templates','acct_v_account_list','acct_v_ap_aging',
'acct_v_ar_aging','acct_v_bank_feed_review','acct_v_bank_feed_stages','acct_v_bill_funnel',
'acct_v_monthly_pnl','acct_v_sales_funnel','acct_v_spend_by_category','acct_v_tasks_due',
'acct_v_undeposited_payments','acct_vendor_aliases','acct_vendors','acct_workflow_actions',
'acct_workflow_instances','acct_workflows','activity_log','ad_account_tiers','ad_accounts','ad_advertisers',
'ad_analytics','ad_audiences','ad_budget_tiers','ad_campaign_categories','ad_campaign_daily',
'ad_campaign_groups','ad_campaign_placements','ad_campaign_rates','ad_campaign_targeting','ad_campaigns',
'ad_creative_assets','ad_creatives','ad_event_counters','ad_events','ad_exchange_partners',
'ad_experiment_variants','ad_experiments','ad_frequency','ad_groups','ad_leads','ad_markers','ad_placements',
'ad_rate_card','ad_rate_card_items','ad_rate_cards','ad_tiers','add_ons','admin_impersonation_sessions',
'admin_manual_overrides','ai_ab_assignments','ai_ab_tests','ai_agents','ai_budget_alerts','ai_disclosures',
'ai_gateway_requests','ai_gateway_settings','ai_gateway_usage_monthly','ai_intent_events',
'ai_mcp_connections','ai_purposes','ai_tasks','analytics_events','analytics_export_runs','api_keys',
'app_password_credentials','app_settings','attribute_values','attributes','availability','bank_accounts',
'bank_transactions','bill_items','bills','blocked_times','brand_opt_outs','brand_placements','brand_profiles',
'brands','canonical_products','cap_board_approvals','cap_convertibles','cap_documents','cap_equity_events',
'cap_funding_rounds','cap_issuances','cap_issuer_profiles','cap_option_exercises','cap_option_grants',
'cap_option_pools','cap_qualified_individuals','cap_share_classes','cap_stakeholders','cap_table_snapshots',
'cap_valuations','cap_vesting_schedules','capabilities','cart_items','carts','catalog_bundle_components',
'catalog_bundles','catalog_gtins','catalog_listing_overrides','categories','chargeback_details',
'chart_of_accounts','checkouts','cms_audience_segments','cms_audit_log','cms_banners','cms_block_schemas',
'cms_bundle_rules','cms_campaigns','cms_cart_thresholds','cms_cdn_profiles','cms_component_analytics',
'cms_content_blocks','cms_design_tokens','cms_fallback_pages','cms_funnel_events','cms_galleries',
'cms_gallery_items','cms_global_content','cms_global_copy','cms_integrations','cms_locales',
'cms_media_assets','cms_media_taxonomy','cms_navigation','cms_navigation_items','cms_navigation_menus',
'cms_offers','cms_page_revisions','cms_pages','cms_policy_acceptances','cms_popups','cms_redirects','cms_seo',
'cms_slot_items','cms_slots','cms_versions','cms_volume_tiers','cms_website_settings','collections',
'commerce_accounting_mappings','commerce_audit_log','commerce_barcodes','commerce_batch_slips',
'commerce_branches','commerce_brands','commerce_cart_lines','commerce_carts','commerce_cash_movements',
'commerce_catalog_category_map','commerce_catalog_item_taxonomy','commerce_catalog_items',
'commerce_categories','commerce_channel_events','commerce_channel_products','commerce_checkout_sessions',
'commerce_coupon_redemptions','commerce_coupons','commerce_customer_accounts','commerce_customer_addresses',
'commerce_customer_payment_methods','commerce_departments','commerce_deposits','commerce_disputes',
'commerce_event_consumptions','commerce_export_jobs','commerce_fulfillment_events',
'commerce_gift_card_designs','commerce_gift_card_transactions','commerce_gift_cards','commerce_idempotency',
'commerce_inventory_alerts','commerce_inventory_events','commerce_loyalty_accounts',
'commerce_loyalty_transactions','commerce_modules','commerce_order_channel_refs','commerce_order_channels',
'commerce_order_events','commerce_order_items','commerce_orders','commerce_outbox_events',
'commerce_payment_allocations','commerce_payment_methods','commerce_payments','commerce_posting_events',
'commerce_price_lists','commerce_prices','commerce_procurement_events','commerce_product_media',
'commerce_product_tags','commerce_products','commerce_promotion_items','commerce_promotion_targets',
'commerce_promotions','commerce_receipts','commerce_refund_lines','commerce_refunds',
'commerce_register_sessions','commerce_return_actions','commerce_return_events','commerce_sale_discounts',
'commerce_sale_lines','commerce_sale_taxes','commerce_sales','commerce_shipping_labels',
'commerce_store_credit_transactions','commerce_store_credits','commerce_subscription_events',
'commerce_subscription_invoice_lines','commerce_subscription_invoices','commerce_subscription_items',
'commerce_subscription_payments','commerce_subscription_plan_items','commerce_subscription_plans',
'commerce_subscriptions','commerce_supplier_orders','commerce_suppliers','commerce_webhook_events',
'communications','contact_message','contact_messages','crm_activity','crm_appointment_resources',
'crm_appointment_services','crm_appointment_status_history','crm_appointments','crm_audit_log',
'crm_automation_enrollments','crm_automation_runs','crm_automation_workflows','crm_booking_policies',
'crm_campaign_members','crm_campaigns','crm_commission_entries','crm_commission_plans','crm_commission_rules',
'crm_commission_tiers','crm_communication_preferences','crm_conversations','crm_customer_behavior',
'crm_customer_contact_methods','crm_customer_preferences','crm_customer_tag_assignments','crm_customer_tags',
'crm_customers','crm_dependents','crm_document_types','crm_document_versions','crm_documents',
'crm_duplicate_candidates','crm_external_identities','crm_funnel_events','crm_holiday_blackouts',
'crm_households','crm_idempotency_keys','crm_lead_activities','crm_lead_sources','crm_leads','crm_locations',
'crm_merge_log','crm_message_templates','crm_messages','crm_needs_attention','crm_notes',
'crm_operating_hours','crm_party_dependents','crm_permanent_alerts','crm_pricing_rules',
'crm_product_recommendations','crm_saved_views','crm_search_index','crm_segment_memberships','crm_segments',
'crm_service_location_availability','crm_service_package_items','crm_service_packages','crm_services',
'crm_settings','crm_shift_templates','crm_staff','crm_staff_availability','crm_staff_blocked_times',
'crm_staff_commission_assignments','crm_staff_documents','crm_staff_incident_reports',
'crm_staff_performance_notes','crm_staff_shifts','crm_staff_time_clock_entries','crm_staff_training_records',
'crm_surcharges','crm_tags','crm_task_assignees','crm_task_comments','crm_tasks','crm_time_off_requests',
'crm_waitlist','currencies','customer_addresses','customer_ai_disclosure_acks','customer_memberships',
'customer_notifications','customer_return_requests','customer_statements','customer_wishlist_items',
'customers','design_assets','design_files','design_publications','designs','dmca_counter_notices',
'dmca_designated_agent','dmca_details','dmca_strikes','dmca_takedown_log','dropship_pipe_attempts',
'dropship_pipe_mappings','ecommerce_orders','efile_acknowledgements','efile_calendar','efile_errors',
'efile_filing_records','efile_filings','efile_form_types','efile_state_settings','efile_submissions',
'efile_transmitter_credentials','email_events','email_inbound_addresses','email_inbound_messages',
'email_messages','email_outbox','email_sender_domains','employee_notifications','erp_audit_log',
'erp_carriers','erp_document_sequences','erp_fulfillment_lines','erp_fulfillment_orders',
'erp_goods_receipt_lines','erp_goods_receipts','erp_idempotency_keys','erp_inventory_balances',
'erp_inventory_cost_layers','erp_inventory_count_lines','erp_inventory_count_sessions','erp_inventory_lots',
'erp_inventory_movements','erp_inventory_reservations','erp_inventory_serial_numbers',
'erp_inventory_transactions','erp_inventory_transfer_lines','erp_inventory_transfers','erp_order_addresses',
'erp_order_lines','erp_order_notes','erp_order_status_history','erp_orders','erp_package_items',
'erp_packages','erp_pick_task_lines','erp_pick_tasks','erp_pick_waves','erp_product_barcodes',
'erp_product_categories','erp_product_skus','erp_product_variants','erp_products','erp_purchase_order_lines',
'erp_purchase_orders','erp_replenishment_recommendations','erp_replenishment_rules',
'erp_return_authorizations','erp_return_inspections','erp_return_lines','erp_return_refunds',
'erp_shipment_packages','erp_shipments','erp_shipping_methods','erp_stock_levels','erp_tracking_events',
'erp_uom_conversions','erp_vendor_items','erp_vendors','erp_warehouse_locations','erp_warehouse_zones',
'erp_warehouses','estimate_items','estimates','faqs','feedback_submissions','fsm_child_instances',
'fsm_transitions','fulfillment_items','fulfillment_label_attempts','fulfillment_orders',
'fulfillment_package_lines','fulfillment_packages','gallery_photos','gated_brands','geo_zip_cache',
'goods_receipt_lines','goods_receipts','google_ga4_daily','google_ga4_landing_pages',
'google_indexing_submissions','google_merchant_sync_runs','google_merchant_sync_state',
'google_property_sync_runs','google_search_console_daily','google_search_console_sitemaps','identity_grants',
'integration_connections','integration_keys','integration_providers','integration_secrets',
'integration_sync_cursors','integration_webhook_inbox','inventory_items','inventory_levels',
'inventory_transactions','invoice_items','invoices','journal_entries','journal_lines','jurisdiction_rules',
'licensee_advertisers','licensee_api_keys','licensee_creative_designs','location_hour_exceptions',
'location_hours','locations','marketing_suppressions','mef_ack_errors','mef_acknowledgements',
'mef_ats_status','mef_billable_events','mef_business_rules','mef_compliance_controls','mef_fee_schedule',
'mef_form_families','mef_payroll_constants','mef_providers','mef_reporting_agent_auth','mef_return_versions',
'mef_returns','mef_schema_versions','mef_security_incidents','mef_signatures','mef_signers','mef_submissions',
'mef_transmissions','membership_plans','merchandising_modules','message_flags','newsletter',
'newsletter_subscribers','node_associations','node_filter_values','node_filters','oauth_states','offers',
'onboarding_cases','onboarding_events','onboarding_gates','order_cases','order_customers',
'order_fulfillment_logs','order_items','order_shipping_estimates','orders','organizations','page_components',
'partner_application_documents','partner_portals','partner_pushes','payment_transactions',
'paypal_webhook_events','payroll_employees','payroll_run_items','payroll_runs','payroll_tax_forms',
'payroll_timesheets','pdp_behavior_scores','perk_ledger','perk_rules','pg_stat_statements',
'pg_stat_statements_info','platform_account_subscriptions','platform_admin_access_log','platform_admins',
'platform_announcement_reads','platform_announcements','platform_audit_events','platform_backups',
'platform_canonical_map','platform_capabilities','platform_chat_members','platform_chat_messages',
'platform_chat_threads','platform_create_favorites','platform_custom_fields',
'platform_customer_identity_links','platform_dashboard_widgets','platform_dashboards',
'platform_db_contract_metadata','platform_duplicable_tables','platform_feature_flags',
'platform_feature_tree_coverage','platform_fk_exemptions','platform_fk_log','platform_form_field_visibility',
'platform_idempotency_keys','platform_integration_health_registry','platform_jobs','platform_kpi_targets',
'platform_lens_fields','platform_lens_labels','platform_lenses','platform_module_permissions',
'platform_objects','platform_outbox','platform_parties','platform_party_roles','platform_party_sources',
'platform_permission_registry','platform_polymorphic_columns','platform_polymorphic_type_map',
'platform_quick_action_registry','platform_quick_links','platform_report_definitions',
'platform_reserved_slugs','platform_role_values','platform_saved_views','platform_subscription_offers',
'platform_table_access_overrides','platform_table_registry','platform_tools','platform_vendor_identity_links',
'platform_workflow_transition_validation','policies','policy_settings','portal_account_links',
'portal_action_permissions','portal_customer_accounts','portal_magic_links','portal_module_permissions',
'portal_permission_audit_log','portal_user_preferences','portal_users','pricing_packages',
'privacy_request_details','product_attribute_values','product_canvas_templates','product_collections',
'product_media','product_nodes','product_questions','product_relations','product_reviews',
'product_taxonomy_links','product_taxonomy_nodes','product_variants','products','profiles','projects',
'promo_redemptions','promos','provider_jobs','purchase_order_items','purchase_order_lines','purchase_orders',
'quarantine','receipt_items','receipts','reconciliations','recurring_invoice_items','recurring_invoices',
'related_search_page_products','related_search_pages','return_policy_rules','reviews','route_redirects',
'sales_order_items','sales_orders','search_events','seller_1099k_generations','seller_ad_campaigns',
'seller_advertising_enrollments','seller_appeals','seller_brand_authorizations','seller_category_approvals',
'seller_customer_messages','seller_customer_notes','seller_data_processing','seller_dpa_acceptances',
'seller_email_templates','seller_inventory_settings','seller_investigations','seller_live_settings',
'seller_live_streams','seller_login_activity','seller_notification_preferences','seller_performance_alerts',
'seller_policy_enforcement','seller_remediation_plans','seller_sales_rewards','seller_self_serve_profiles',
'seller_settlement_reversals','seller_settlements','seller_social_posts','seller_solution_providers',
'seller_stripe_accounts','seller_tax_exemptions','seller_tax_remittance_filings','seller_violations',
'seller_webhook_deliveries','seller_webhooks','sellers','seo_overrides','seo_templates','service_items',
'service_pricing','services','ship_from_addresses','shipping_memberships','shipping_profiles',
'shop_category_images','shop_grid_cards','shop_image_dims','site_templates','social_accounts',
'social_data_deletion_requests','social_media_assets','social_oauth_states','social_oauth_tokens',
'social_outbox_events','social_platform_apps','social_platform_capabilities','social_post_media',
'social_post_networks','social_post_series','social_post_targets','social_posts','social_publish_attempts',
'social_schedule_slots','social_webhook_deliveries','social_webhook_endpoints','sources','ssp_endpoints',
'staff','state_rules','stg_feed','stripe_pending_charges','stripe_webhook_events','subscription_plans',
'subscriptions','supplier_catalog_products','supplier_catalog_variants','supplier_category_mapping',
'supplier_category_memory','supplier_category_visibility','supplier_fulfillment_locations',
'supplier_import_items','supplier_imports','supplier_mockup_templates','supplier_print_specs',
'supplier_product_costs','supplier_product_mappings','suppliers','supply_service_map','support_actions',
'support_attachments','support_automations','support_business_hours','support_canned_replies',
'support_case_details','support_categories','support_channel_threads','support_channels',
'support_contact_notes','support_contact_orgs','support_contacts','support_drafts','support_escalation_rules',
'support_forms','support_holidays','support_jobs','support_kb_articles','support_macros',
'support_notification_prefs','support_notifications','support_organizations','support_permissions',
'support_queues','support_report_daily','support_routing_rules','support_side_conversation_messages',
'support_side_conversation_participants','support_side_conversations','support_signatures',
'support_sla_policies','support_staff_skills','support_team_members','support_teams','support_templates',
'support_ticket_access_grants','support_ticket_counters','support_ticket_events',
'support_ticket_participants','support_ticket_relations','support_tickets','support_time_entries',
'support_webhook_deliveries','support_webhooks_outbound','sync_jobs','tags','tax_consent_items',
'tax_consents','tax_disclosure_documents','tax_disclosure_items','tax_nexus_alerts',
'tax_screen_presentations','tax_us_states','taxes','taxonomy_category_bridge','taxonomy_nodes',
'teller_accounts','teller_balances','teller_enrollments','teller_sign_convention','teller_transactions',
'tenant_locations','tenant_memberships','tenant_printer_settings','tenant_settings','tenant_stripe_accounts',
'tenant_wordpress_connections','tenants','testimonials','theme_prompts','transaction_tags','trust_policies',
'ugc_comments','ugc_media','ugc_post_stats_v','ugc_posts','ugc_product_counters','ugc_reactions',
'ugc_reports','ugc_shares','user_notifications','user_session_tabs','user_tenants','user_workspace_sessions',
'val_active_fmv','val_allocations','val_approaches','val_comps','val_dlom','val_inputs','val_material_events',
'val_reports','val_requests','variant_axis_values','variant_fulfillment_routes','vendor_invoice_lines',
'vendor_invoices','vendors','verification_tasks'
]) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS unify.known_functions(name text PRIMARY KEY);
INSERT INTO unify.known_functions SELECT unnest(ARRAY[
'acct_1099_export','acct_1099_summary','acct_1099_threshold','acct__account_amounts','acct__apply_security',
'acct__assert_migrator','acct__close_check','acct__csv_header_index','acct__csv_rows',
'acct__default_asset_class','acct__default_close_template','acct__depreciation_month','acct__ensure_account',
'acct__ensure_operating_accounts','acct__eval_kpi','acct__inv_components','acct__inv_invoice_posted',
'acct__inv_issue','acct__inv_mirror','acct__inv_post_je','acct__inv_receive','acct__inv_restock',
'acct__inv_restore','acct__inv_reverse_source','acct__inv_unreceive','acct__inv_vendor_return',
'acct__kpi_tokens','acct__ledger_sums','acct__legacy_customer','acct__legacy_id','acct__legacy_numeric',
'acct__legacy_vendor','acct__ofx_tag','acct__order_for_books','acct__order_for_charge',
'acct__order_is_fulfilled','acct__order_money_in','acct__order_money_out','acct__order_payment_mode',
'acct__order_processor_payment','acct__order_processor_refund','acct__order_recognize','acct__order_register',
'acct__parse_amount','acct__parse_date','acct__pnl_section','acct__prior_window','acct__purchase_line_posted',
'acct__role','acct__seed_kpis','acct__settings','acct__sync_erp_order','acct_accept_bank_transaction',
'acct_account_balance','acct_account_register','acct_add_fixed_asset','acct_add_tax_holiday',
'acct_address_text','acct_ai_context','acct_apply_bank_rules','acct_apply_credit_memo',
'acct_apply_unapplied_payment','acct_apply_vendor_credit','acct_approve_refund','acct_assert_access',
'acct_attach_standard_triggers','acct_audit_row_change','acct_available_credit','acct_balance_sheet',
'acct_bank_account_check','acct_bank_descriptor_trg','acct_bank_gl','acct_bank_match_candidates',
'acct_bank_rule_matches','acct_bank_txn_before_insert','acct_bill_before_write',
'acct_bill_from_purchase_order','acct_bill_inventory_trg','acct_bill_line_after_write',
'acct_bill_line_before_write','acct_bill_refresh_status','acct_block_posted_mutation',
'acct_bootstrap_company','acct_budget_from_actuals','acct_budget_vs_actual','acct_build_amortization',
'acct_bulk_accept','acct_calculate_tax','acct_calculate_tax_summary','acct_can_access',
'acct_cancel_recognition_schedule','acct_cash_flow','acct_classify_bank_feed','acct_close_dispute',
'acct_close_fiscal_year','acct_close_status','acct_coa_before_write','acct_complete_close_task',
'acct_complete_contractor_profile','acct_convert_estimate','acct_create_credit_memo',
'acct_create_payment_link','acct_create_recognition_schedule','acct_create_statement_batch',
'acct_customer_name','acct_customer_statement','acct_debt_balance','acct_decide_bill','acct_default_entity',
'acct_dispose_fixed_asset','acct_draft_from_template','acct_duplicate_statement_batch',
'acct_ensure_fiscal_year','acct_entity_operating_accounts_trg','acct_erp_order_trg',
'acct_exclude_bank_transaction','acct_explain_flux','acct_fill_tenant_from_parent','acct_finalize_close',
'acct_finish_reconciliation','acct_fiscal_year_start','acct_fixed_asset_register','acct_flux_analysis',
'acct_fx_revalue','acct_general_ledger','acct_generate_1099s','acct_generate_close',
'acct_generate_statement_batch','acct_gift_card_check','acct_import_bank_file',
'acct_import_channel_settlement','acct_inbox_before_insert','acct_inbox_create_bill',
'acct_inbox_set_extraction','acct_ingest_processor_event','acct_inventory_adjust','acct_inventory_opening',
'acct_inventory_tieout','acct_inventory_valuation','acct_invite_contractor','acct_invoice_before_write',
'acct_invoice_inventory_trg','acct_invoice_line_before_write','acct_invoice_recalc',
'acct_invoice_refresh_status','acct_invoice_tax_payload','acct_invoice_unbilled_time','acct_is_tenant_member',
'acct_issue_gift_card','acct_item_before_write','acct_item_class_check','acct_item_class_path',
'acct_item_sync_commerce','acct_je_after_post','acct_je_before_insert','acct_kpi_definitions_trg',
'acct_kpi_value','acct_kpis','acct_legacy_preflight','acct_make_deposit','acct_mark_bill_reviewed',
'acct_mark_invoice_paid','acct_match_bank_transaction','acct_match_receipts','acct_migrate_legacy',
'acct_minor_to_major','acct_next_number','acct_next_seq','acct_normalize_descriptor','acct_open_dispute',
'acct_pay_bills','acct_pay_payroll_liabilities','acct_pay_sales_tax_filing','acct_payout_register',
'acct_payroll_run_trg','acct_period_for','acct_place_asset_in_service','acct_po_match','acct_post_bill',
'acct_post_channel_settlement','acct_post_credit_memo','acct_post_draft_journal','acct_post_entry',
'acct_post_erp_count_session','acct_post_inventory_count','acct_post_invoice','acct_post_journal',
'acct_post_payroll_run','acct_post_refund','acct_post_spend','acct_post_vendor_credit',
'acct_prepare_sales_tax_filing','acct_primary_book','acct_print_checks','acct_process_processor_event',
'acct_profit_and_loss','acct_publish_report_package','acct_rebuild_balances','acct_recognition_tieout',
'acct_reconciliation_mark','acct_reconciliation_summary','acct_record_debt_draw','acct_record_debt_payment',
'acct_record_payment_link_payment','acct_record_receipt','acct_redeem_gift_card','acct_refund_inventory_trg',
'acct_report_snapshots_lock','acct_retained_earnings_statement','acct_retry_processor_events',
'acct_reverse_channel_settlement','acct_reverse_journal','acct_role_account','acct_round',
'acct_run_auto_reversals','acct_run_depreciation','acct_run_recognition','acct_run_recurring_bills',
'acct_run_recurring_invoices','acct_run_review','acct_run_scheduled_payments','acct_sales_tax_liability',
'acct_schedule_auto_reversal','acct_schedule_bill_payment','acct_seed_default_coa',
'acct_seed_tax_mississippi','acct_seed_tax_us_state','acct_send_invoice','acct_send_statement',
'acct_send_statement_batch','acct_set_opening_balance','acct_set_period_status','acct_set_updated_at',
'acct_setup_channel','acct_signoff_close_task','acct_spend_before_insert','acct_spend_inventory_trg',
'acct_spend_line_after_write','acct_spend_line_before_write','acct_start_reconciliation','acct_submit_bill',
'acct_suggest_coding','acct_sync_erp_order','acct_sync_pending_orders','acct_system_register',
'acct_tax_chain','acct_time_entry_unlink_trg','acct_transfer_funds','acct_trial_balance','acct_unbilled_time',
'acct_undo_bank_transaction','acct_undo_reconciliation','acct_update_finding','acct_valid_routing',
'acct_validate_journal_entry','acct_vendor_before_write','acct_vendor_credit_inventory_trg',
'acct_void_bill_payment','acct_void_credit_memo','acct_void_deposit','acct_void_document','acct_void_invoice',
'acct_void_receipt','acct_void_transfer','ai_gateway_log','ai_gateway_preflight',
'ai_intent_events_no_mutation','app__default_from','app__insert_json','app__row','app_archive_record',
'app_dashboard_overview','app_delete_draft','app_duplicate_record','app_publish_product',
'app_reprice_variants','app_void','apply_stock_movement','armor','assign_lms_role',
'audit_portal_account_links','brand_supply_ok','brand_supply_source','cap__apply_vesting_template_trg',
'cap__assert_admin','cap__early_exercise_trg','cap__equity_accounts','cap__event','cap__event_chain_trg',
'cap__event_hash','cap__grant_409a_guard_trg','cap__is_holder','cap__issuance_83b_trg','cap__months',
'cap__voting_pct','cap_available_shares','cap_cancel_options','cap_close_round','cap_compliance_check',
'cap_controls_check','cap_events_immutable_trg','cap_exercise_option','cap_grant_options','cap_issue_shares',
'cap_liquidation_waterfall','cap_model_round','cap_my_holdings','cap_record_83b_filing',
'cap_record_convertible','cap_table','cap_take_snapshot','cap_verify_event_chain','cap_vested_shares',
'cap_vesting_schedule','cash_dist','cms_set_updated_at','commerce_has_tenant_access',
'convert_purchase_order_to_bill','convert_sales_order_to_invoice','create_bill','create_purchase_order',
'create_receipt','create_sales_order','crm__appointment_after','crm__appointment_before','crm__assert_member',
'crm__policy','crm__refresh_customer_visits','crm__service_minutes','crm_available_slots',
'crm_book_appointment','crm_cancel_appointment','crm_has_tenant_access','crm_reschedule_appointment',
'crm_set_appointment_status','crypt','current_tenant_id','current_tenant_ids','date_dist','dearmor','decrypt',
'decrypt_iv','digest','dmca_takedown_log_immutable','effective_filter_node','efile_build_1099_filing',
'efile_build_payroll_filing','efile_build_sales_tax_filing','efile_claim','efile_mark_filed_manually',
'efile_queue','efile_record_acknowledgement','efile_record_submission','email_claim_batch','email_enqueue',
'email_inbound_attach_document','email_mark_sent','encrypt','encrypt_iv','enqueue_sync_job',
'ensure_ad_events_partition','erp__default_location','erp__default_warehouse','erp__move','erp__order_status',
'erp__sku_for_item','erp__sku_for_variant','erp_add_order_note','erp_adjust_stock','erp_cancel_order',
'erp_current_tenant_member','erp_decide_return','erp_mark_shipped','erp_movement_stock_trg',
'erp_next_document_number','erp_open_return','erp_orders_channel_trg','erp_rebuild_stock_balances',
'erp_receive_purchase_order','erp_receive_return','erp_receive_transfer','erp_record_tracking_event',
'erp_refund_order','erp_send_purchase_order','erp_set_carrier_active','erp_set_updated_at',
'erp_stock_history','erp_transfer_stock','erp_validate_order_line_quantities','fips_mode',
'first_party_seller','float4_dist','float8_dist','fulfillment_package_lines_quantity_guard',
'gbt_bit_compress','gbt_bit_consistent','gbt_bit_penalty','gbt_bit_picksplit','gbt_bit_same',
'gbt_bit_sortsupport','gbt_bit_union','gbt_bool_compress','gbt_bool_consistent','gbt_bool_fetch',
'gbt_bool_penalty','gbt_bool_picksplit','gbt_bool_same','gbt_bool_sortsupport','gbt_bool_union',
'gbt_bpchar_compress','gbt_bpchar_consistent','gbt_bpchar_sortsupport','gbt_bytea_compress',
'gbt_bytea_consistent','gbt_bytea_penalty','gbt_bytea_picksplit','gbt_bytea_same','gbt_bytea_sortsupport',
'gbt_bytea_union','gbt_cash_compress','gbt_cash_consistent','gbt_cash_distance','gbt_cash_fetch',
'gbt_cash_penalty','gbt_cash_picksplit','gbt_cash_same','gbt_cash_sortsupport','gbt_cash_union',
'gbt_date_compress','gbt_date_consistent','gbt_date_distance','gbt_date_fetch','gbt_date_penalty',
'gbt_date_picksplit','gbt_date_same','gbt_date_sortsupport','gbt_date_union','gbt_decompress',
'gbt_enum_compress','gbt_enum_consistent','gbt_enum_fetch','gbt_enum_penalty','gbt_enum_picksplit',
'gbt_enum_same','gbt_enum_sortsupport','gbt_enum_union','gbt_float4_compress','gbt_float4_consistent',
'gbt_float4_distance','gbt_float4_fetch','gbt_float4_penalty','gbt_float4_picksplit','gbt_float4_same',
'gbt_float4_sortsupport','gbt_float4_union','gbt_float8_compress','gbt_float8_consistent',
'gbt_float8_distance','gbt_float8_fetch','gbt_float8_penalty','gbt_float8_picksplit','gbt_float8_same',
'gbt_float8_sortsupport','gbt_float8_union','gbt_inet_compress','gbt_inet_consistent','gbt_inet_penalty',
'gbt_inet_picksplit','gbt_inet_same','gbt_inet_sortsupport','gbt_inet_union','gbt_int2_compress',
'gbt_int2_consistent','gbt_int2_distance','gbt_int2_fetch','gbt_int2_penalty','gbt_int2_picksplit',
'gbt_int2_same','gbt_int2_sortsupport','gbt_int2_union','gbt_int4_compress','gbt_int4_consistent',
'gbt_int4_distance','gbt_int4_fetch','gbt_int4_penalty','gbt_int4_picksplit','gbt_int4_same',
'gbt_int4_sortsupport','gbt_int4_union','gbt_int8_compress','gbt_int8_consistent','gbt_int8_distance',
'gbt_int8_fetch','gbt_int8_penalty','gbt_int8_picksplit','gbt_int8_same','gbt_int8_sortsupport',
'gbt_int8_union','gbt_intv_compress','gbt_intv_consistent','gbt_intv_decompress','gbt_intv_distance',
'gbt_intv_fetch','gbt_intv_penalty','gbt_intv_picksplit','gbt_intv_same','gbt_intv_sortsupport',
'gbt_intv_union','gbt_macad8_compress','gbt_macad8_consistent','gbt_macad8_fetch','gbt_macad8_penalty',
'gbt_macad8_picksplit','gbt_macad8_same','gbt_macad8_sortsupport','gbt_macad8_union','gbt_macad_compress',
'gbt_macad_consistent','gbt_macad_fetch','gbt_macad_penalty','gbt_macad_picksplit','gbt_macad_same',
'gbt_macad_union','gbt_macaddr_sortsupport','gbt_numeric_compress','gbt_numeric_consistent',
'gbt_numeric_penalty','gbt_numeric_picksplit','gbt_numeric_same','gbt_numeric_sortsupport',
'gbt_numeric_union','gbt_oid_compress','gbt_oid_consistent','gbt_oid_distance','gbt_oid_fetch',
'gbt_oid_penalty','gbt_oid_picksplit','gbt_oid_same','gbt_oid_sortsupport','gbt_oid_union',
'gbt_text_compress','gbt_text_consistent','gbt_text_penalty','gbt_text_picksplit','gbt_text_same',
'gbt_text_sortsupport','gbt_text_union','gbt_time_compress','gbt_time_consistent','gbt_time_distance',
'gbt_time_fetch','gbt_time_penalty','gbt_time_picksplit','gbt_time_same','gbt_time_sortsupport',
'gbt_time_union','gbt_timetz_compress','gbt_timetz_consistent','gbt_ts_compress','gbt_ts_consistent',
'gbt_ts_distance','gbt_ts_fetch','gbt_ts_penalty','gbt_ts_picksplit','gbt_ts_same','gbt_ts_sortsupport',
'gbt_ts_union','gbt_tstz_compress','gbt_tstz_consistent','gbt_tstz_distance','gbt_uuid_compress',
'gbt_uuid_consistent','gbt_uuid_fetch','gbt_uuid_penalty','gbt_uuid_picksplit','gbt_uuid_same',
'gbt_uuid_sortsupport','gbt_uuid_union','gbt_var_decompress','gbt_var_fetch','gbt_varbit_sortsupport',
'gbtreekey16_in','gbtreekey16_out','gbtreekey2_in','gbtreekey2_out','gbtreekey32_in','gbtreekey32_out',
'gbtreekey4_in','gbtreekey4_out','gbtreekey8_in','gbtreekey8_out','gbtreekey_var_in','gbtreekey_var_out',
'gen_random_bytes','gen_random_uuid','gen_salt','generate_customer_statement','get_auth_user_by_email',
'get_pending_sync_jobs','gin_extract_query_trgm','gin_extract_value_trgm','gin_trgm_consistent',
'gin_trgm_triconsistent','gist_translate_cmptype_btree','global_search','gtrgm_compress','gtrgm_consistent',
'gtrgm_decompress','gtrgm_distance','gtrgm_in','gtrgm_options','gtrgm_out','gtrgm_penalty','gtrgm_picksplit',
'gtrgm_same','gtrgm_union','hmac','increment_ad_event','int2_dist','int4_dist','int8_dist','interval_dist',
'is_consumable_type','is_tenant_member','mef__aba_ok','mef__efile_paused','mef__family_for','mef__headline',
'mef__incident_due_trg','mef__pdf_name_ok','mef__queue_issues','mef__queue_issues_for_claim',
'mef__rand_alnum','mef__return_after_trg','mef__return_before_trg','mef__return_hash',
'mef__signature_immutable_trg','mef__submission_id_ok','mef_build_941','mef_claim','mef_create_return',
'mef_ero_certify','mef_new_message_id','mef_new_submission_id','mef_queue_return','mef_readiness',
'mef_record_ack','mef_record_transmission','mef_record_transmission_failure','mef_set_efw',
'mef_set_environment','mef_sign_return','mef_signature_screen','mef_signer_set_online_pin',
'mef_signer_upsert','mef_update_return_data','mef_void_return','normalize_product_type','oid_dist',
'outbox_emit','outbox_emit_lifecycle','partnership18_calculate','partnership18_save','partnership18_split',
'paths_related','pawzly_bump_session','pg_stat_statements','pg_stat_statements_info',
'pg_stat_statements_reset','pgp_armor_headers','pgp_key_id','pgp_pub_decrypt','pgp_pub_decrypt_bytea',
'pgp_pub_encrypt','pgp_pub_encrypt_bytea','pgp_sym_decrypt','pgp_sym_decrypt_bytea','pgp_sym_encrypt',
'pgp_sym_encrypt_bytea','platform__apply_app_security','platform__apply_canonical_map',
'platform__assert_tenant_admin','platform__can_see_task','platform__ensure_fk','platform__has_col',
'platform__is_chat_member','platform__parent_fk','platform__party_assign_trg','platform__party_resolve',
'platform__row_predicate','platform__secure_feature_functions','platform__secure_mef_functions',
'platform__table_domain','platform__vault_store','platform_action_coverage','platform_archive_legacy_table',
'platform_classify_tables','platform_create_task','platform_has_permission','platform_integrity_report',
'platform_is_admin','platform_is_tenant_admin','platform_is_tenant_member','platform_link_catalog',
'platform_link_legacy_orders','platform_mark_chat_read','platform_move_task','platform_my_inbox',
'platform_party_add_role','platform_party_backfill','platform_party_merge','platform_polymorphic_orphans',
'platform_post_message','platform_revalidate_fks','platform_security_audit','platform_start_chat',
'platform_touch_updated_at','platform_user_tenant_ids','post_journal','product_has_live_brand',
'recompute_category_counts','register_product_attributes','resend_process_webhook','retention_prune',
'revalidate_brand','revoke_lms_role','rpc_get_balance_sheet','rpc_get_general_ledger',
'rpc_get_profit_and_loss','rpc_get_trial_balance','run_payroll','search_text','set_limit',
'set_product_attribute','set_updated_at','shipping_apply_tiers','show_limit','show_trgm','similarity',
'similarity_dist','similarity_op','sku_weight_lb','slugify','social_claim_outbox_events',
'strict_word_similarity','strict_word_similarity_commutator_op','strict_word_similarity_dist_commutator_op',
'strict_word_similarity_dist_op','strict_word_similarity_op','support_contacts_merge_guard',
'support_grant_access','support_messages_rollup','support_next_ticket_ref','support_recount_ticket_messages',
'support_ticket_events_defaults','support_ticket_events_immutable','support_ticket_tenant_id',
'support_ticket_visibility_ok','support_tickets_assign_ref','support_tickets_merge_guard',
'support_tickets_touch','sync_catalog_item_taxonomy','take_payment','tax16_claim_job','tax16_configure',
'tax16_finish_job','tax16_request_preview','tax16_teller_bind_verified','tax16_teller_challenge',
'tax__consent_immutable_trg','tax__consent_item_immutable_trg','tax__doc_immutable_trg','tax__min_dwell_ms',
'tax__norm_name','tax__render','tax__sha','tax_consent_copy','tax_consent_is_active','tax_consent_revoke',
'tax_consent_screen','tax_consent_sign','tax_nexus_exposure','tax_refresh_nexus_alerts',
'tax_us_sales_by_state','tax_us_windows','taxonomy_link_count','taxonomy_link_products','taxprod_deferred',
'taxprod_nol','taxprod_partnership','taxprod_provision','taxprod_reconcile','taxprod_save',
'telemed_audit_log_immutable','teller_ingest_transactions','teller_next_sync_window','teller_process_webhook',
'teller_record_api_error','teller_record_balance','teller_register_enrollment','teller_upsert_account',
'time_dist','touch_updated_at','trg_authorization_revoke','trg_brand_after','trg_brand_before',
'trg_brand_placement_after','trg_brand_placement_before','trg_fill_tenant','trg_goods_receipt_line',
'trg_offer_before','trg_po_revoke','trg_po_status','trg_product_after','trg_product_before',
'trg_register_attributes','trg_seller_status','trg_taxonomy_node_after','ts_dist','tstz_dist',
'ugc_current_customer_id','ugc_current_tenant_id','ugc_refresh_product_counters','ugc_trg_refresh_counters',
'upsert_portal_account_link','user_tenant_ids','uuid_generate_v1','uuid_generate_v1mc','uuid_generate_v3',
'uuid_generate_v4','uuid_generate_v5','uuid_nil','uuid_ns_dns','uuid_ns_oid','uuid_ns_url','uuid_ns_x500',
'val__gate','val__material_event_trg','val__report_guard_trg','val_adopt_report','val_draft_report',
'val_open_request','val_safe_harbor_check','word_similarity','word_similarity_commutator_op',
'word_similarity_dist_commutator_op','word_similarity_dist_op','word_similarity_op'
]) ON CONFLICT DO NOTHING;
-- objects added by 06b_common_features (kept in their own list so the generated arrays above stay untouched)
INSERT INTO unify.known_objects SELECT unnest(ARRAY[
'platform_out_of_office','platform_notification_preferences','platform_record_followers','platform_reminders',
'platform_member_invitations','support_oncall_schedules','support_oncall_participants','support_oncall_overrides',
'support_escalation_policies','support_escalation_policy_steps','support_pages','support_v_oncall_now'
]) ON CONFLICT DO NOTHING;
INSERT INTO unify.known_functions SELECT unnest(ARRAY[
'platform_is_away','platform_notify','platform_follow','platform_notify_followers','platform_set_reminder',
'platform_dispatch_reminders','platform_rrule_next','crm__task_recur','platform_invite_member','platform_accept_invitation',
'platform_revoke_invitation','support__bh_windows','support_is_business_time','support_business_add_minutes',
'support__ticket_sla','support_oncall_now','support__page_step','support_page','support_ack_page','support_resolve_page',
'support_run_clocks','support_auto_assign','support__ticket_autoassign','erp__order_hold_guard','erp_hold_order','erp_release_order'
]) ON CONFLICT DO NOTHING;
-- objects added by 06c_agnostic_core and 06d_modules_and_packs
INSERT INTO unify.known_objects SELECT unnest(ARRAY[
'crm_calls','crm_deal_stage_history','crm_deals','crm_lead_score_bands','crm_lead_scoring_rules',
'crm_pipeline_stages','crm_pipelines','crm_record_events','crm_record_parties','crm_record_types','crm_route_stops',
'crm_routes','crm_sequence_enrollments','crm_sequence_steps','crm_sequences','crm_v_pipeline_summary',
'crm_v_sales_tracking','platform_calendar_attendees','platform_calendar_events','platform_calendars',
'platform_custom_field_values','platform_data_classes','platform_deployment_profile','platform_email_messages',
'platform_email_threads','platform_mailboxes','platform_modules','platform_pack_items','platform_packs',
'platform_picklist_values','platform_sensitive_access_log','platform_tenant_modules','platform_tenant_packs',
'platform_terminology','platform_v_agenda','platform_webform_submissions','platform_webforms'
]) ON CONFLICT DO NOTHING;
INSERT INTO unify.known_functions SELECT unnest(ARRAY[
'crm__call_activity','crm__deal_history','crm__deal_stage','crm__estimate_wins_deal','crm__lead_rescore',
'crm__record_guard','crm__record_event_guard','crm__record_status_history','crm_build_route','crm_convert_lead','crm_enroll_in_sequence',
'crm_ensure_default_pipeline','crm_move_deal','crm_run_sequences','crm_score_lead','crm_start_call',
'platform__can_admin','platform__cf_phi_guard','platform__cfv_guard','platform__email_after','platform__email_link',
'platform__picklist_guard','platform_apply_pack','platform_deployment_allows','platform_enable_module',
'platform_get_custom_fields','platform_log_access','platform_module_coverage','platform_module_enabled',
'platform_picklist_ok','platform_provision_tenant','platform_send_email','platform_set_custom_fields',
'platform_submit_webform','platform_tenant_actions','platform_tenant_nav','platform_validate_identifier'
]) ON CONFLICT DO NOTHING;

-- objects added by 06e_roles_and_learning and 06f_catalog_listing_map
INSERT INTO unify.known_objects SELECT unnest(ARRAY[
'platform_roles','platform_role_aliases','platform_member_roles',
'learn_programs','learn_units','learn_cohorts','learn_cohort_staff','learn_enrollments','learn_progress','learn_v_roster',
'catalog_source_categories','listing_category_map','listing_v_availability'
]) ON CONFLICT DO NOTHING;
INSERT INTO unify.known_functions SELECT unnest(ARRAY[
'platform_resolve_role','platform_role_label','platform__role_alias','platform__user_has_role','platform_has_role',
'platform__is_service','platform__sync_membership','platform_assign_role','platform_revoke_role','platform_has_permission',
'assign_lms_role','revoke_lms_role',
'learn__enrollment_guard','learn__record_event','learn_enroll','learn__recompute','learn_record_progress','learn_withdraw',
'catalog__norm_path','catalog_upsert_source_category','catalog__product_source_category','listing__link_guard',
'listing__node_path_moved','listing__map_matches','listing_publish','listing_map_category','listing_unmap',
'listing_unmapped','listing_products','recompute_category_counts'
]) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS unify.live_extras (
  name       text PRIMARY KEY,
  decision   text NOT NULL CHECK (decision IN ('keep','archive','keep_external','review')),
  canonical  text,
  reason     text,
  decided_by text NOT NULL DEFAULT 'unify 08 seed',
  updated_at timestamptz NOT NULL DEFAULT now());

-- decisions from the code audit (writers/readers + row counts). ON CONFLICT DO NOTHING:
-- your own edits to unify.live_extras win on re-run.
INSERT INTO unify.live_extras(name, decision, canonical, reason) VALUES
 ('design_renders','keep',NULL,'PoD render job queue (19 code refs): one row per design x view x color x mockup/print, worker claims with FOR UPDATE SKIP LOCKED'),
 ('design_queue','keep',NULL,'ordered queue of blanks to prep (/api/v1/design-queue, 6 code refs)'),
 ('blank_assets','archive','product_canvas_templates','old blank-harvest store (Printful ghost/shading images), 0 code refs'),
 ('provider_offers','archive','supplier_product_costs','old supplier cost snapshots, 0 code refs'),
 ('renders','archive','design_renders','orphan: no writer or reader anywhere'),
 ('email_confirmation_tokens','archive','auth.users','Supabase Auth handles email confirmation'),
 ('bulk_jobs','archive',NULL,'rules engine, never adopted by the app (0 code refs)'),
 ('saved_views','archive','platform_saved_views','rules engine, never adopted by the app (0 code refs)'),
 ('season_windows','archive',NULL,'rules engine, never adopted by the app (0 code refs)'),
 ('product_facts','archive',NULL,'rules engine view, never adopted by the app'),
 ('appt_appointments','archive','crm_appointments','unadopted parallel scheduling module (0 rows, 0 code refs); canonical is crm_appointments (04)'),
 ('appt_calendars','archive','crm_staff','unadopted appt_* module'),
 ('appt_services','archive','crm_services','unadopted appt_* module'),
 ('appt_resources','archive','crm_appointment_resources','unadopted appt_* module'),
 ('appt_waitlist','archive','crm_waitlist','unadopted appt_* module'),
 ('appt_reminders','archive','platform_reminders','unadopted appt_* module'),
 ('appt_availability_rules','archive','crm_staff_availability','unadopted appt_* module'),
 ('appt_availability_exceptions','archive','crm_staff_blocked_times','unadopted appt_* module'),
 ('appt_appointment_attendees','archive','crm_appointments','unadopted appt_* module'),
 ('appt_appointment_events','archive','crm_appointment_status_history','unadopted appt_* module'),
 ('appt_appointment_resources','archive','crm_appointments','unadopted appt_* module')
ON CONFLICT (name) DO NOTHING;

-- discover everything else that is live-only
INSERT INTO unify.live_extras(name, decision, reason, decided_by)
SELECT c.relname,
       CASE WHEN c.relname ~ '^payload_' THEN 'keep_external' ELSE 'review' END,
       CASE WHEN c.relname ~ '^payload_' THEN 'Payload CMS table (connects as DB owner)'
            ELSE 'live-only, not in the target schema: set decision to keep / archive / keep_external' END,
       'unify 08 discovery'
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m') AND NOT c.relispartition
   AND NOT EXISTS (SELECT 1 FROM unify.known_objects k WHERE k.name = c.relname)
ON CONFLICT (name) DO NOTHING;

-- functions whose body mentions a relation (same matcher as 05, without ignore list)
CREATE OR REPLACE FUNCTION unify.fn_refs(p_rel text) RETURNS TABLE(fn regprocedure, proname text) LANGUAGE sql STABLE AS $$
  SELECT p.oid::regprocedure, p.proname::text
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang AND l.lanname IN ('sql','plpgsql')
   WHERE p.pronamespace = 'public'::regnamespace
     AND regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
         ~* ('(\m(from|join|into|update|table|exists)\s+(only\s+)?(public\.)?"?' || p_rel || '"?\M|\m' || p_rel || '%rowtype)') $$;

-- ---------------------------------------------------------------------
-- archive
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record; f record; b text; v_oid oid; v_kind char; v_rows bigint; v_target text; v_moved text;
BEGIN
  CREATE TEMP TABLE _arch ON COMMIT DROP AS
  SELECT e.name, c.oid, c.relkind FROM unify.live_extras e
    JOIN pg_class c ON c.relname = e.name AND c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m')
   WHERE e.decision = 'archive';

  -- live-only functions that serve only archived objects move with them
  CREATE TEMP TABLE _fn ON COMMIT DROP AS
  SELECT DISTINCT x.fn, x.proname, a.name AS rel
    FROM _arch a CROSS JOIN LATERAL unify.fn_refs(a.name) x;

  FOR r IN SELECT * FROM _arch LOOP
    b := NULL;
    -- FK from a table that stays
    SELECT string_agg(DISTINCT con.conrelid::regclass::text, ', ') INTO b FROM pg_constraint con
     WHERE con.contype = 'f' AND con.confrelid = r.oid AND con.conrelid NOT IN (SELECT oid FROM _arch);
    IF b IS NOT NULL THEN b := 'FK from kept table(s): ' || b; END IF;
    -- view that stays
    IF b IS NULL THEN
      SELECT string_agg(DISTINCT vc.relname, ', ') INTO b
        FROM pg_depend d JOIN pg_rewrite rw ON rw.oid = d.objid JOIN pg_class vc ON vc.oid = rw.ev_class
       WHERE d.refobjid = r.oid AND vc.oid <> r.oid AND vc.oid NOT IN (SELECT oid FROM _arch);
      IF b IS NOT NULL THEN b := 'view(s) that stay depend on it: ' || b; END IF;
    END IF;
    -- target-schema function reads/writes it
    IF b IS NULL THEN
      SELECT string_agg(DISTINCT fn.proname, ', ') INTO b FROM _fn fn
       WHERE fn.rel = r.name AND EXISTS (SELECT 1 FROM unify.known_functions k WHERE k.name = fn.proname);
      IF b IS NOT NULL THEN b := 'target-schema function(s) use it: ' || b; END IF;
    END IF;
    -- a live-only function of it is a trigger on a kept table
    IF b IS NULL THEN
      SELECT string_agg(DISTINCT tg.tgrelid::regclass::text || '.' || tg.tgname, ', ') INTO b
        FROM _fn fn JOIN pg_trigger tg ON tg.tgfoid = fn.fn::oid
       WHERE fn.rel = r.name AND NOT tg.tgisinternal AND tg.tgrelid NOT IN (SELECT oid FROM _arch);
      IF b IS NOT NULL THEN b := 'trigger(s) on kept tables call its functions: ' || b; END IF;
    END IF;

    IF b IS NOT NULL THEN
      INSERT INTO unify.retire_report(legacy_table, canonical_table, decision, detail)
      SELECT r.name, e.canonical, 'BLOCKED', 'live-only archive blocked: ' || b FROM unify.live_extras e WHERE e.name = r.name
      ON CONFLICT (legacy_table) DO UPDATE SET decision = 'BLOCKED', detail = EXCLUDED.detail, decided_at = now();
      PERFORM unify.log('live_extras', r.name, 'blocked', b);
      DELETE FROM _arch WHERE name = r.name;
    END IF;
  END LOOP;

  -- move functions first (only those not part of the target schema)
  FOR f IN SELECT DISTINCT fn.fn, fn.proname FROM _fn fn
            WHERE fn.rel IN (SELECT name FROM _arch)
              AND NOT EXISTS (SELECT 1 FROM unify.known_functions k WHERE k.name = fn.proname) LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = f.fn::oid AND p.pronamespace = 'public'::regnamespace) THEN
      EXECUTE format('ALTER FUNCTION %s SET SCHEMA archive', f.fn);
      PERFORM unify.log('live_extras', f.proname, 'function_archived', 'served archived live-only objects');
    END IF;
  END LOOP;

  -- views before tables (order does not matter for dependencies, it keeps the log readable)
  FOR r IN SELECT * FROM _arch ORDER BY (relkind IN ('v','m')) DESC, name LOOP
    v_rows := NULL;
    IF r.relkind IN ('r','p') THEN EXECUTE format('SELECT count(*) FROM public.%I', r.name) INTO v_rows; END IF;
    v_target := r.name;
    IF to_regclass('archive.' || quote_ident(r.name)) IS NOT NULL THEN
      v_target := left(r.name, 50) || '_live';              -- an earlier §4 archive has the name
      EXECUTE format('ALTER %s public.%I RENAME TO %I',
                     CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, r.name, v_target);
    END IF;
    EXECUTE format('ALTER %s public.%I SET SCHEMA archive',
                   CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, v_target);
    UPDATE public.platform_table_registry SET lifecycle = 'archived', classified_at = now(),
           notes = concat_ws('; ', notes, 'unify 08: live-only, archived to archive.' || v_target)
     WHERE table_name = r.name;
    INSERT INTO unify.retire_report(legacy_table, canonical_table, decision, detail)
    SELECT r.name, e.canonical, 'archived', 'live-only: ' || e.reason || coalesce('; ' || v_rows || ' rows kept in archive.' || v_target, '')
      FROM unify.live_extras e WHERE e.name = r.name
    ON CONFLICT (legacy_table) DO UPDATE SET decision = 'archived', canonical_table = EXCLUDED.canonical_table,
                                             detail = EXCLUDED.detail, decided_at = now();
    PERFORM unify.log('live_extras', r.name, 'archived', coalesce(v_rows::text || ' rows', 'view'));
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- keep: give each kept table real FKs, RLS and a registry row
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _fkguess(col text PRIMARY KEY, parent text) ON COMMIT DROP;
INSERT INTO _fkguess VALUES
 ('tenant_id','tenants'), ('design_id','designs'), ('product_id','products'), ('variant_id','product_variants'),
 ('product_variant_id','product_variants'), ('sku_id','erp_product_skus'), ('template_id','product_canvas_templates'),
 ('canvas_template_id','product_canvas_templates'), ('blank_id','product_canvas_templates'),
 ('mockup_template_id','supplier_mockup_templates'), ('design_file_id','design_files'), ('file_id','design_files'),
 ('asset_id','design_assets'), ('design_asset_id','design_assets'), ('publication_id','design_publications'),
 ('supplier_id','suppliers'), ('collection_id','collections'), ('order_id','erp_orders'), ('job_id','platform_jobs'),
 ('render_id','design_renders'), ('queue_id','design_queue'),
 ('user_id','auth.users'), ('created_by','auth.users'), ('owner_id','auth.users'), ('owner_user_id','auth.users'),
 ('requested_by','auth.users'), ('updated_by','auth.users');

DO $$
DECLARE r record; c record; g text;
BEGIN
  FOR r IN SELECT e.name FROM unify.live_extras e WHERE e.decision = 'keep' AND unify.is_base_table(e.name) LOOP
    FOR c IN SELECT a.attname::text col FROM pg_attribute a
              WHERE a.attrelid = to_regclass('public.' || quote_ident(r.name)) AND a.attnum > 0 AND NOT a.attisdropped
                AND format_type(a.atttypid, a.atttypmod) = 'uuid'
                AND NOT EXISTS (SELECT 1 FROM pg_constraint f WHERE f.conrelid = a.attrelid AND f.contype = 'f' AND a.attnum = ANY (f.conkey)) LOOP
      SELECT parent INTO g FROM _fkguess WHERE col = c.col;
      IF g IS NULL THEN CONTINUE; END IF;                          -- left for platform_integrity_report to flag
      IF g = 'auth.users' THEN PERFORM unify.ensure_auth_fk(r.name, c.col);
      ELSE PERFORM public.platform__ensure_fk(r.name, c.col, g, 'id', NULL, 'unify 08: live-only keep'); END IF;
    END LOOP;
    PERFORM unify.log('live_extras', r.name, 'kept', 'FKs ensured');
    INSERT INTO unify.retire_report(legacy_table, canonical_table, decision, detail)
    SELECT r.name, NULL, 'keep_live', e.reason FROM unify.live_extras e WHERE e.name = r.name
    ON CONFLICT (legacy_table) DO UPDATE SET decision = 'keep_live', detail = EXCLUDED.detail, decided_at = now();
  END LOOP;
END $$;

-- nullable orphan values on kept tables -> saved + NULL, then validate (same contract as 06)
DO $$
DECLARE l record; nn boolean; ptab text;
BEGIN
  FOR l IN SELECT fl.* FROM public.platform_fk_log fl JOIN unify.live_extras e ON e.name = fl.child_table AND e.decision = 'keep'
            WHERE fl.status = 'not_valid_orphans' LOOP
    SELECT a.attnotnull INTO nn FROM pg_attribute a WHERE a.attrelid = to_regclass('public.' || quote_ident(l.child_table)) AND a.attname = l.child_column;
    IF nn IS DISTINCT FROM false OR NOT unify.has_col(l.child_table, 'id') THEN CONTINUE; END IF;
    ptab := CASE WHEN l.parent_table = 'auth.users' THEN 'auth.users' ELSE 'public.' || quote_ident(l.parent_table) END;
    EXECUTE format('INSERT INTO unify.orphan_values(table_name, column_name, row_id, old_value, parent_table)
                    SELECT %L, %L, c.id::text, c.%I::text, %L FROM public.%I c
                     WHERE c.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %s p WHERE p.id = c.%I) ON CONFLICT DO NOTHING',
                   l.child_table, l.child_column, l.child_column, l.parent_table, l.child_table, l.child_column, ptab, l.child_column);
    EXECUTE format('UPDATE public.%I c SET %I = NULL WHERE c.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %s p WHERE p.id = c.%I)',
                   l.child_table, l.child_column, l.child_column, ptab, l.child_column);
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', l.child_table, l.constraint_name);
    UPDATE public.platform_fk_log SET status = 'validated', detail = concat_ws('; ', detail, 'orphan values saved to unify.orphan_values and cleared'), logged_at = now()
     WHERE child_table = l.child_table AND child_column = l.child_column;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- keep_external: service-only, outside ERP integrity checks
-- ---------------------------------------------------------------------
INSERT INTO public.platform_table_access_overrides(table_name, access_mode, notes)
SELECT e.name, 'service_only', 'unify 08: ' || coalesce(e.reason, 'external system')
  FROM unify.live_extras e WHERE e.decision = 'keep_external' AND unify.is_base_table(e.name)
   AND NOT EXISTS (SELECT 1 FROM public.platform_table_access_overrides o WHERE o.table_name = e.name);
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT e.name FROM unify.live_extras e WHERE e.decision = 'keep_external' AND unify.is_base_table(e.name) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.name);   -- owner role bypasses RLS
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.name);
    INSERT INTO unify.retire_report(legacy_table, canonical_table, decision, detail)
    VALUES (r.name, NULL, 'keep_external', 'external system table, service-only')
    ON CONFLICT (legacy_table) DO UPDATE SET decision = 'keep_external', detail = EXCLUDED.detail, decided_at = now();
  END LOOP;
END $$;

-- registry + RLS for kept tables, then lifecycles
SELECT count(*) AS security_actions FROM public.platform__apply_app_security();
SELECT public.platform_classify_tables() AS tables_classified;
UPDATE public.platform_table_registry g SET lifecycle = 'integration', classified_at = now()
  FROM unify.live_extras e WHERE e.name = g.table_name AND e.decision = 'keep_external';
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT e.name FROM unify.live_extras e WHERE e.decision = 'keep_external' AND unify.is_base_table(e.name) LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', r.name);
  END LOOP;
END $$;

-- undecided objects are reported as BLOCKED so 09 fails until you decide
INSERT INTO unify.retire_report(legacy_table, canonical_table, decision, detail)
SELECT e.name, NULL, 'BLOCKED', 'live-only object with no decision: UPDATE unify.live_extras SET decision = ''keep''|''archive''|''keep_external'' WHERE name = ''' || e.name || ''' and re-run 08'
  FROM unify.live_extras e
 WHERE e.decision = 'review' AND to_regclass('public.' || quote_ident(e.name)) IS NOT NULL
ON CONFLICT (legacy_table) DO UPDATE SET decision = 'BLOCKED', detail = EXCLUDED.detail, decided_at = now();
-- a decision that was later resolved clears its BLOCKED row
DELETE FROM unify.retire_report rr USING unify.live_extras e
 WHERE rr.legacy_table = e.name AND rr.decision = 'BLOCKED' AND e.decision = 'review'
   AND to_regclass('public.' || quote_ident(e.name)) IS NULL;

COMMIT;

SELECT e.decision, count(*) AS objects, string_agg(e.name, ', ' ORDER BY e.name) AS names
  FROM unify.live_extras e GROUP BY e.decision ORDER BY e.decision;
SELECT legacy_table, decision, detail FROM unify.retire_report WHERE decision = 'BLOCKED' ORDER BY 1;

-- canonical step ledger
SELECT unify.done('500');
