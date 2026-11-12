-- CANONICAL STEP 900  |  file S900_verify.sql  |  was unify/09_verify.sql  |  internal log label '09' (unchanged)
-- =====================================================================
-- S900_verify.sql — zero-gap gate. Read-only. Raises an exception (non-zero
-- psql exit) if ANY check fails, and prints the per-check result table.
--
-- Checks
--   orders_unlinked        every legacy order row (live or archived) points
--                          at an existing erp_orders row
--   acct_customers_unlinked every acct_customers row has a CRM twin
--   integrity              platform_integrity_report(false) is empty
--   security               platform_security_audit() is empty
--   actions                every active quick action is 'ok'
--   features               every nav path has an existing backing table
--   retire_blocked         no legacy table is BLOCKED from retiring
--   forward_failed         no event-forwarding failures in unify.run_log
--   legacy_writers         old writer RPCs are not executable by users
--   appointments           appointment tables, RPCs and exclusion constraints exist
--   common_features        06b tables, triggers and RPCs exist; RPCs are
--                          executable by authenticated, cron entry points are not
--   agnostic_core          06c deals/pipelines, leads, webforms, calls, email,
--                          sequences, calendar, routes, custom fields, PHI guards
--   packs                  06d modules backed by tables, pack items valid, every
--                          tenant on core, every nav path owned by a module
--   roles_learning         06e: no groomer/front_desk roles stored, no function
--                          search_path names a missing lms schema, role FKs, learning RPCs
--   catalog_listing        06f: catalog/listing/map tables, tenant-safe link key,
--                          no pet-only node_type CHECK, every link has a node, RPCs
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 900 (internal label '09'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S900_verify.sql is step 900; run S200_unify_preflight.sql and every step up to 500 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('900');
END $guard$;

CREATE TEMP TABLE _verify(check_name text PRIMARY KEY, failures bigint, detail text);

DO $$
DECLARE n bigint; d text; r record; q text;
BEGIN
  -- 1. orders: live legacy tables ...
  SELECT count(*), string_agg(DISTINCT tbl || ':' || verdict, ', ') INTO n, d
    FROM unify.v_legacy_orders WHERE verdict <> 'linked';
  -- ... and rows already moved into archive.*
  FOR r IN SELECT c.table_name FROM information_schema.columns c
            WHERE c.table_schema = 'archive' AND c.column_name = 'erp_order_id'
              AND c.table_name IN ('orders','ecommerce_orders','commerce_orders','sales_orders') LOOP
    EXECUTE format('SELECT count(*) FROM archive.%I a WHERE NOT EXISTS (SELECT 1 FROM public.erp_orders e WHERE e.id = a.erp_order_id)', r.table_name) INTO q;
    IF q::bigint > 0 THEN n := n + q::bigint; d := concat_ws(', ', d, 'archive.' || r.table_name || ':' || q || ' unlinked'); END IF;
  END LOOP;
  INSERT INTO _verify VALUES ('orders_unlinked', n, d);

  -- 2. acct_customers
  SELECT count(*), string_agg(coalesce(customer_number, id::text) || ':' || verdict, ', ')
    INTO n, d FROM unify.v_acct_customers WHERE verdict <> 'linked' OR crm_id IS NULL;
  INSERT INTO _verify VALUES ('acct_customers_unlinked', n, d);

  -- 3. integrity
  SELECT count(*), string_agg(DISTINCT category || ':' || table_name, ', ') INTO n, d
    FROM public.platform_integrity_report(false);
  INSERT INTO _verify VALUES ('integrity', n, left(d, 2000));

  -- 4. security
  SELECT count(*), string_agg(table_name || ':' || problem, ', ') INTO n, d FROM public.platform_security_audit();
  INSERT INTO _verify VALUES ('security', n, left(d, 2000));

  -- 5. actions
  SELECT count(*), string_agg(action_code || ':' || status, ', ') INTO n, d
    FROM public.platform_action_coverage() WHERE status <> 'ok';
  INSERT INTO _verify VALUES ('actions', n, d);

  -- 6. features
  SELECT count(*), string_agg(feature_path || ' -> ' || coalesce(backing_table, '?'), ', ') INTO n, d
    FROM public.platform_feature_tree_coverage
   WHERE NOT is_implemented OR backing_table IS NULL OR to_regclass('public.' || quote_ident(backing_table)) IS NULL;
  INSERT INTO _verify VALUES ('features', n, d);

  -- 7. retire blocked
  SELECT count(*), string_agg(legacy_table || ': ' || coalesce(detail, ''), '; ') INTO n, d
    FROM unify.retire_report WHERE decision ILIKE 'blocked%';
  INSERT INTO _verify VALUES ('retire_blocked', n, d);

  -- 8. forwarders
  SELECT count(*), string_agg(DISTINCT item, ', ') INTO n, d FROM unify.run_log WHERE action = 'forward_failed';
  INSERT INTO _verify VALUES ('forward_failed', n, d);

  -- 9. legacy writers closed
  SELECT count(*), string_agg(p.proname, ', ') INTO n, d FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('create_bill','create_purchase_order','create_sales_order','create_receipt')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  INSERT INTO _verify VALUES ('legacy_writers', n, d);

  -- 10. appointments domain
  SELECT count(*), string_agg(x, ', ') INTO n, d FROM (
    SELECT 'table ' || t AS x FROM unnest(ARRAY['crm_appointments','crm_appointment_services','crm_appointment_status_history',
           'crm_appointment_resources','crm_booking_policies','crm_dependents','crm_staff_blocked_times','crm_services','crm_staff']) t
     WHERE to_regclass('public.' || t) IS NULL
    UNION ALL
    SELECT 'rpc ' || f FROM unnest(ARRAY['crm_available_slots','crm_book_appointment','crm_reschedule_appointment',
           'crm_cancel_appointment','crm_set_appointment_status']) f
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f
                         AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    UNION ALL
    SELECT 'no exclusion constraint on crm_appointments'
     WHERE to_regclass('public.crm_appointments') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.crm_appointments'::regclass AND contype = 'x')) z;
  INSERT INTO _verify VALUES ('appointments', n, d);

  -- 11. common features (06b)
  SELECT count(*), string_agg(x, ', ') INTO n, d FROM (
    SELECT 'table ' || t AS x FROM unnest(ARRAY['support_oncall_schedules','support_oncall_participants','support_oncall_overrides',
           'support_escalation_policies','support_escalation_policy_steps','support_pages','platform_out_of_office',
           'platform_member_invitations','platform_notification_preferences','platform_reminders','platform_record_followers']) t
     WHERE to_regclass('public.' || t) IS NULL
    UNION ALL
    SELECT 'rpc ' || f FROM unnest(ARRAY['support_page','support_ack_page','support_resolve_page','support_oncall_now','support_auto_assign',
           'support_business_add_minutes','support_is_business_time','platform_invite_member','platform_accept_invitation',
           'platform_revoke_invitation','platform_follow','platform_set_reminder','erp_hold_order','erp_release_order']) f
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f
                         AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    UNION ALL
    SELECT 'internal fn open to users: ' || p.proname FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('platform_notify','platform_notify_followers','platform_dispatch_reminders','support_run_clocks','support__page_step')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    UNION ALL
    SELECT 'trigger ' || g FROM unnest(ARRAY['trg_support_ticket_sla','trg_support_ticket_autoassign','trg_crm_task_recur','trg_erp_order_hold_guard']) g
     WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = g AND NOT tgisinternal)
    UNION ALL
    SELECT 'no overlap guard on support_oncall_overrides'
     WHERE to_regclass('public.support_oncall_overrides') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.support_oncall_overrides'::regclass AND contype = 'x')) z;
  INSERT INTO _verify VALUES ('common_features', n, d);

  -- 12. agnostic core (06c): tables, guards, RPCs; anon may only submit webforms
  SELECT count(*), string_agg(x, ', ') INTO n, d FROM (
    SELECT 'table ' || t AS x FROM unnest(ARRAY['platform_deployment_profile','platform_picklist_values','platform_terminology',
           'platform_custom_field_values','crm_record_types','crm_record_parties','crm_record_events','crm_pipelines','crm_pipeline_stages',
           'crm_deals','crm_deal_stage_history','crm_lead_scoring_rules','crm_lead_score_bands','platform_webforms','platform_webform_submissions',
           'crm_calls','platform_mailboxes','platform_email_threads','platform_email_messages','crm_sequences','crm_sequence_steps',
           'crm_sequence_enrollments','platform_calendars','platform_calendar_events','platform_calendar_attendees','crm_routes','crm_route_stops',
           'platform_data_classes','platform_sensitive_access_log']) t
     WHERE to_regclass('public.' || t) IS NULL
    UNION ALL
    SELECT 'rpc ' || f FROM unnest(ARRAY['platform_get_custom_fields','platform_set_custom_fields','crm_move_deal','crm_convert_lead',
           'crm_score_lead','crm_start_call','platform_send_email','crm_enroll_in_sequence','crm_build_route','platform_log_access',
           'platform_submit_webform','platform_validate_identifier']) f
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f
                         AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    UNION ALL
    SELECT 'anon can run ' || p.proname FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('platform_set_custom_fields','crm_move_deal','crm_convert_lead',
           'crm_start_call','platform_send_email','crm_enroll_in_sequence','crm_build_route','platform_log_access','platform_apply_pack',
           'platform_enable_module','platform_provision_tenant','crm_run_sequences')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
    UNION ALL
    SELECT 'webform submit closed to anon' WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname = 'platform_submit_webform' AND has_function_privilege('anon', p.oid, 'EXECUTE'))
    UNION ALL
    SELECT 'internal fn open to users: ' || p.proname FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('crm_run_sequences','platform__can_admin')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    UNION ALL
    SELECT 'trigger ' || g FROM unnest(ARRAY['trg_crm_call_activity','trg_crm_deal_history','trg_crm_deal_stage','trg_crm_estimate_wins_deal',
           'trg_crm_lead_rescore','trg_crm_record_guard','trg_crm_record_event_guard','trg_crm_record_status_history','trg_platform_cf_phi_guard','trg_platform_cfv_guard',
           'trg_platform_email_after','trg_platform_email_link']) g
     WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = g AND NOT tgisinternal)
    UNION ALL
    SELECT 'picklist guard missing on ' || c FROM unnest(ARRAY['crm_services','crm_surcharges','commerce_refunds','crm_duplicate_candidates',
           'onboarding_cases','crm_dependents']) c
     WHERE to_regclass('public.' || c) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || c)::regclass AND tgname LIKE 'trg_picklist_%' AND NOT tgisinternal)
    UNION ALL
    SELECT 'tenant without default pipeline: ' || t.slug FROM public.tenants t
     WHERE NOT EXISTS (SELECT 1 FROM public.crm_pipelines p WHERE p.tenant_id = t.id AND p.is_default)) z;
  INSERT INTO _verify VALUES ('agnostic_core', n, d);

  -- 13. modules & packs (06d): every module backed by real tables, every pack item valid,
  --     every tenant on core, every nav path owned by a module
  SELECT count(*), string_agg(x, ', ') INTO n, d FROM (
    SELECT 'module ' || code || ' missing ' || array_to_string(tables_missing, '/') AS x
      FROM public.platform_module_coverage() WHERE status = 'missing_tables'
    UNION ALL
    SELECT 'pack ' || k.code || ' lists unknown module ' || m FROM public.platform_packs k, unnest(k.modules) m
     WHERE NOT EXISTS (SELECT 1 FROM public.platform_modules x WHERE x.code = m)
    UNION ALL
    SELECT 'module ' || x.code || ' depends on unknown ' || dep FROM public.platform_modules x, unnest(x.depends_on) dep
     WHERE NOT EXISTS (SELECT 1 FROM public.platform_modules y WHERE y.code = dep)
    UNION ALL
    SELECT 'pack item ' || i.pack_code || '/' || i.item_key || ': unknown table ' || split_part(i.item_key, '.', 1)
      FROM public.platform_pack_items i
     WHERE i.item_type IN ('custom_field','data_class') AND to_regclass('public.' || split_part(i.item_key, '.', 1)) IS NULL
    UNION ALL
    SELECT 'pack item ' || i.pack_code || '/' || i.item_key || ': unknown column'
      FROM public.platform_pack_items i
     WHERE i.item_type = 'data_class' AND NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public'
           AND c.table_name = split_part(i.item_key, '.', 1) AND c.column_name = split_part(i.item_key, '.', 2))
    UNION ALL
    SELECT 'pack item ' || i.pack_code || '/' || i.item_key || ': unknown picklist' FROM public.platform_pack_items i
     WHERE i.item_type = 'picklist' AND NOT EXISTS (SELECT 1 FROM public.platform_picklist_values v WHERE v.tenant_id IS NULL AND v.list_code = i.item_key)
    UNION ALL
    SELECT 'tenant ' || t.slug || ' has no core pack' FROM public.tenants t
     WHERE NOT EXISTS (SELECT 1 FROM public.platform_tenant_packs p WHERE p.tenant_id = t.id AND p.pack_code = 'core')
    UNION ALL
    SELECT 'nav path with no owning module: ' || f.feature_path FROM public.platform_feature_tree_coverage f
     WHERE NOT EXISTS (SELECT 1 FROM public.platform_modules m, unnest(m.nav_prefixes) px WHERE f.feature_path = px OR f.feature_path LIKE px || '/%')
       AND NOT EXISTS (SELECT 1 FROM public.platform_modules m WHERE f.module = ANY (m.nav_modules))
    UNION ALL
    SELECT 'rpc ' || f FROM unnest(ARRAY['platform_enable_module','platform_apply_pack','platform_provision_tenant','platform_tenant_nav',
           'platform_tenant_actions','platform_module_coverage']) f
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f
                         AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))) z;
  INSERT INTO _verify VALUES ('packs', n, d);

  -- 14. agnostic roles + learning (06e)
  SELECT count(*), string_agg(x, ', ') INTO n, d FROM (
    SELECT 'vertical role stored in ' || rv.t || ': ' || rv.v AS x
      FROM (SELECT 'tenant_memberships' t, role v FROM public.tenant_memberships
            UNION ALL SELECT 'platform_member_invitations', role FROM public.platform_member_invitations) rv
     WHERE NOT EXISTS (SELECT 1 FROM public.platform_roles pr WHERE pr.code = rv.v)
    UNION ALL
    SELECT 'search_path names missing schema lms: ' || p.proname FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace AND array_to_string(p.proconfig, ',') ~ '\mlms\M'
       AND to_regnamespace('lms') IS NULL
    UNION ALL
    SELECT 'missing FK ' || c FROM unnest(ARRAY['tenant_memberships_role_fk','platform_member_invitations_role_fk']) c
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c)
    UNION ALL
    SELECT 'missing ' || t FROM unnest(ARRAY['platform_roles','platform_role_aliases','platform_member_roles','learn_programs','learn_units',
           'learn_cohorts','learn_cohort_staff','learn_enrollments','learn_progress','learn_v_roster']) t
     WHERE to_regclass('public.' || t) IS NULL
    UNION ALL
    SELECT 'rpc ' || f FROM unnest(ARRAY['platform_assign_role','platform_revoke_role','platform_has_role','platform_role_label',
           'learn_enroll','learn_record_progress','learn_withdraw','assign_lms_role','revoke_lms_role']) f
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f
                         AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    UNION ALL
    SELECT 'internal fn open to users: ' || p.proname FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('platform__user_has_role','platform__sync_membership','learn__recompute','learn__record_event')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) z;
  INSERT INTO _verify VALUES ('roles_learning', n, d);

  -- 15. catalog -> listing map (06f)
  SELECT count(*), string_agg(x, ', ') INTO n, d FROM (
    SELECT 'missing ' || t AS x FROM unnest(ARRAY['catalog_source_categories','listing_category_map','listing_v_availability']) t
     WHERE to_regclass('public.' || t) IS NULL
    UNION ALL
    SELECT 'pet-only CHECK still on taxonomy_nodes.node_type' WHERE EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'taxonomy_nodes_node_type_check')
    UNION ALL
    SELECT 'missing ' || c FROM unnest(ARRAY['product_taxonomy_links_tenant_path_product_key','product_taxonomy_links_node_fk']) c
     WHERE NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c)
    UNION ALL
    SELECT 'listing link without a listing node: ' || count(*) FROM public.product_taxonomy_links WHERE node_id IS NULL HAVING count(*) > 0
    UNION ALL
    SELECT 'rpc ' || f FROM unnest(ARRAY['listing_publish','listing_map_category','listing_unmap','listing_unmapped','listing_products']) f
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f
                         AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    UNION ALL
    SELECT 'global catalog writable by users' WHERE has_table_privilege('authenticated', 'public.catalog_source_categories', 'INSERT')) z;
  INSERT INTO _verify VALUES ('catalog_listing', n, d);
END $$;

SELECT check_name, failures, CASE WHEN failures = 0 THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM _verify ORDER BY check_name;

-- what was kept (and why) vs archived
SELECT decision, count(*) AS tables, string_agg(legacy_table, ', ' ORDER BY legacy_table) FILTER (WHERE decision <> 'archived') AS kept
  FROM unify.retire_report GROUP BY decision ORDER BY decision;

DO $$
DECLARE f text;
BEGIN
  SELECT string_agg(check_name || '=' || failures, ', ') INTO f FROM _verify WHERE failures > 0;
  IF f IS NOT NULL THEN
    RAISE EXCEPTION 'UNIFY VERIFY FAILED: %', f;
  END IF;
  RAISE NOTICE 'UNIFY VERIFY PASSED: 0 gaps';
END $$;

-- canonical step ledger
SELECT unify.done('900');
