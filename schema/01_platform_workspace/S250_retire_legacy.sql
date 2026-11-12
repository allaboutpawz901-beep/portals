-- CANONICAL STEP 250  |  file S250_retire_legacy.sql  |  was unify/05_retire_legacy.sql  |  internal log label '05' (unchanged)
-- =====================================================================
-- S250_retire_legacy.sql — retire the §4 duplicates safely.
--
-- For every legacy -> canonical pair in §4 the script decides, against the
-- LIVE database (not a hard-coded list):
--
--   KEEP as engine storage  live DB functions read/write it (excluding search,
--                           migration tooling and the old-app writer RPCs).
--                           It is re-labelled relation='source' (feeds the
--                           canonical table) — not a duplicate, not a gap.
--   KEEP as bridged intake  it was written within active_write_window AND unify
--                           mirrors it into the canonical table (orders family,
--                           forwarders from 03). relation='source'.
--   ARCHIVE                 empty, or fully migrated and quiet. Active FKs to it
--                           are repointed to the canonical table (or exempted),
--                           the table moves to schema archive, and an empty
--                           compatibility view with the same name is left so old
--                           functions still compile; writes to it are redirected
--                           to the canonical table or rejected with a clear error.
--   BLOCKED                 still holds data unify cannot migrate -> stays
--                           legacy and is listed in unify.retire_report.
--
-- Nothing is dropped. archive.<table> keeps every row. Idempotent.
-- Settings (unify.settings): active_write_window, compat_views, retire_legacy_rpcs.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 250 (internal label '05'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S250_retire_legacy.sql is step 250; run S200_unify_preflight.sql and every step up to 240 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('250');
END $guard$;
BEGIN;
CREATE SCHEMA IF NOT EXISTS archive;
REVOKE ALL ON SCHEMA archive FROM anon, authenticated;
INSERT INTO unify.settings(key, value) VALUES ('retire_legacy_rpcs', 'true') ON CONFLICT (key) DO NOTHING;

-- 1. the §4 map --------------------------------------------------------
CREATE TEMP TABLE s4(legacy_table text PRIMARY KEY, canonical_table text) ON COMMIT DROP;
INSERT INTO s4 VALUES
  ('saved_views','platform_saved_views'),
  ('crm_saved_views','platform_saved_views'),
  ('acct_audit_log','platform_audit_events'),
  ('cms_audit_log','platform_audit_events'),
  ('commerce_audit_log','platform_audit_events'),
  ('crm_audit_log','platform_audit_events'),
  ('erp_audit_log','platform_audit_events'),
  ('activity_log','platform_audit_events'),
  ('acct_integration_idempotency','platform_idempotency_keys'),
  ('commerce_idempotency','platform_idempotency_keys'),
  ('crm_idempotency_keys','platform_idempotency_keys'),
  ('erp_idempotency_keys','platform_idempotency_keys'),
  ('customers','crm_customers'),
  ('commerce_customer_accounts','crm_customers'),
  ('order_customers','crm_customers'),
  ('vendors','acct_vendors'),
  ('erp_vendors','acct_vendors'),
  ('commerce_suppliers','suppliers'),
  ('commerce_products','products'),
  ('carts','commerce_carts'),
  ('cart_items','commerce_carts'),
  ('acct_gift_cards','commerce_gift_cards'),
  ('acct_gift_card_transactions','commerce_gift_cards'),
  ('acct_refunds','commerce_refunds'),
  ('erp_return_refunds','commerce_refunds'),
  ('acct_disputes','commerce_disputes'),
  ('subscriptions','commerce_subscriptions'),
  ('subscription_plans','commerce_subscriptions'),
  ('orders','erp_orders'),
  ('order_items','erp_order_lines'),
  ('commerce_orders','erp_orders'),
  ('commerce_order_items','erp_order_lines'),
  ('ecommerce_orders','erp_orders'),
  ('sales_orders','erp_orders'),
  ('sales_order_items','erp_order_lines'),
  ('purchase_orders','erp_purchase_orders'),
  ('purchase_order_items','erp_purchase_orders'),
  ('purchase_order_lines','erp_purchase_orders'),
  ('acct_ap_purchase_orders','erp_purchase_orders'),
  ('acct_ap_purchase_order_lines','erp_purchase_orders'),
  ('goods_receipts','erp_goods_receipts'),
  ('goods_receipt_lines','erp_goods_receipts'),
  ('inventory_items','erp_inventory_movements'),
  ('inventory_levels','erp_inventory_movements'),
  ('inventory_transactions','erp_inventory_movements'),
  ('commerce_inventory_events','erp_inventory_movements'),
  ('erp_inventory_transactions','erp_inventory_movements'),
  ('erp_stock_levels','erp_inventory_movements'),
  ('acct_inventory_layers','erp_inventory_cost_layers'),
  ('acct_inventory_layer_draws','erp_inventory_cost_layers'),
  ('acct_inventory_moves','erp_inventory_cost_layers'),
  ('journal_entries','acct_journal_entries'),
  ('journal_lines','acct_journal_lines'),
  ('chart_of_accounts','acct_chart_of_accounts'),
  ('bank_accounts','acct_bank_accounts'),
  ('bank_transactions','acct_bank_transactions'),
  ('reconciliations','acct_reconciliations'),
  ('invoices','acct_ar_invoices'),
  ('invoice_items','acct_ar_invoices'),
  ('recurring_invoices','acct_recurring_invoices'),
  ('recurring_invoice_items','acct_recurring_invoices'),
  ('receipts','acct_ar_receipts'),
  ('receipt_items','acct_ar_receipts'),
  ('estimates','acct_estimates'),
  ('estimate_items','acct_estimates'),
  ('customer_statements','acct_customer_statements'),
  ('acct_recognition_schedules','acct_revenue_recognition_schedules'),
  ('acct_recognition_lines','acct_revenue_recognition_schedules'),
  ('bills','acct_ap_bills'),
  ('bill_items','acct_ap_bills'),
  ('vendor_invoices','acct_ap_bills'),
  ('vendor_invoice_lines','acct_ap_bills'),
  ('acct_payroll_employees','acct_employees'),
  ('payroll_employees','acct_employees'),
  ('staff','acct_employees'),
  ('payroll_runs','acct_payroll_runs'),
  ('payroll_run_items','acct_payroll_runs'),
  ('payroll_tax_forms','acct_payroll_tax_forms'),
  ('acct_timesheets','acct_time_entries'),
  ('payroll_timesheets','acct_time_entries'),
  ('crm_staff_time_clock_entries','acct_time_entries'),
  ('support_time_entries','acct_time_entries'),
  ('promos','commerce_promotions'),
  ('promo_redemptions','commerce_promotions'),
  ('commerce_coupons','commerce_promotions'),
  ('commerce_coupon_redemptions','commerce_promotions'),
  ('stripe_webhook_events','integration_webhook_inbox'),
  ('paypal_webhook_events','integration_webhook_inbox'),
  ('commerce_webhook_events','integration_webhook_inbox'),
  ('commerce_outbox_events','platform_outbox'),
  ('social_outbox_events','platform_outbox'),
  ('email_outbox','platform_outbox'),
  ('sync_jobs','platform_jobs'),
  ('support_jobs','platform_jobs'),
  ('provider_jobs','platform_jobs'),
  ('availability','crm_staff_availability'),
  ('blocked_times','crm_staff_blocked_times');
INSERT INTO public.platform_canonical_map(legacy_table, canonical_table, relation, notes)
SELECT legacy_table, canonical_table, 'legacy', '§4 consolidation' FROM s4
ON CONFLICT (legacy_table) DO UPDATE SET canonical_table = EXCLUDED.canonical_table
  WHERE public.platform_canonical_map.relation = 'legacy';   -- never demote a decided 'source'

-- acct_customers is the AR/tax profile, linked 1:1 to crm_customers by 01
INSERT INTO public.platform_canonical_map(legacy_table, canonical_table, relation, notes)
VALUES ('acct_customers', 'crm_customers', 'source',
        'AR/tax profile (terms, credit limit, AR account, tax exemption); 1:1 with crm_customers via platform_customer_identity_links')
ON CONFLICT (legacy_table) DO UPDATE SET relation = 'source', canonical_table = EXCLUDED.canonical_table, notes = EXCLUDED.notes;

-- 2. keep reference / integration / log lifecycles across re-classification
DO $$
DECLARE src text; def text;
BEGIN
  SELECT prosrc INTO src FROM pg_proc WHERE oid = 'public.platform_classify_tables()'::regprocedure;
  IF position('''reference'',''integration''' IN src) = 0 THEN
    def := pg_get_functiondef('public.platform_classify_tables()'::regprocedure);
    def := replace(def, $q$WHEN g.lifecycle IN ('legacy','archived') THEN g.lifecycle$q$,
                        $q$WHEN g.lifecycle IN ('legacy','archived','reference','integration','log') THEN g.lifecycle$q$);
    EXECUTE def;
    PERFORM unify.log('platform_classify_tables', NULL, 'patched', 'preserves reference/integration/log lifecycles');
  END IF;
END $$;
-- platform_archive_legacy_table looked children up by regclass text, so a child
-- already moved to schema archive ("archive.x") counted as active. Ignore them.
DO $$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.platform_archive_legacy_table(text,text)'::regprocedure);
  IF position('unify-patched' IN def) = 0 THEN
    def := replace(def, $q$AND coalesce(ch.lifecycle, 'active') NOT IN ('legacy','archived');$q$,
      $q$AND coalesce(ch.lifecycle, 'active') NOT IN ('legacy','archived')
     AND (SELECT k.relnamespace FROM pg_class k WHERE k.oid = f.conrelid) = 'public'::regnamespace;  -- unify-patched$q$);
    IF position('unify-patched' IN def) = 0 THEN RAISE EXCEPTION 'could not patch platform_archive_legacy_table'; END IF;
    EXECUTE def;
  END IF;
END $$;
-- platform__apply_app_security walks every registry row whose name resolves; a
-- retired table's compatibility view must be skipped (views cannot take RLS).
DO $$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.platform__apply_app_security()'::regprocedure);
  IF position('unify-patched' IN def) = 0 THEN
    def := replace(def, $q$WHERE to_regclass('public.' || quote_ident(r.table_name)) IS NOT NULL$q$,
      $q$WHERE to_regclass('public.' || quote_ident(r.table_name)) IS NOT NULL AND r.lifecycle <> 'archived'  -- unify-patched$q$);
    IF position('unify-patched' IN def) = 0 THEN RAISE EXCEPTION 'could not patch platform__apply_app_security'; END IF;
    EXECUTE def;
  END IF;
END $$;
SELECT public.platform_classify_tables();   -- registers the tables created by 03/04
SELECT public.platform__apply_canonical_map();

-- 3. decision helpers -------------------------------------------------
CREATE TABLE IF NOT EXISTS unify.retire_report(
  legacy_table text PRIMARY KEY, canonical_table text, decision text NOT NULL, detail text, decided_at timestamptz DEFAULT now());

-- functions whose mention of a legacy table is not a dependency we must keep
CREATE TABLE IF NOT EXISTS unify.ref_ignore(proname text PRIMARY KEY, why text);
INSERT INTO unify.ref_ignore VALUES
  ('global_search','search; reads compat view'), ('acct_legacy_preflight','migration tooling'), ('acct_migrate_legacy','migration tooling'),
  ('acct__legacy_customer','migration tooling'), ('acct__legacy_vendor','migration tooling'), ('platform_link_legacy_orders','migration tooling'),
  ('retention_prune','housekeeping'), ('acct__seed_kpis','reads compat view'), ('acct_flux_analysis','reads compat view'),
  ('app_dashboard_overview','reads compat view'), ('platform__table_domain','meta'), ('platform__parent_fk','meta'),
  ('create_bill','old-app writer'), ('create_receipt','old-app writer'), ('create_purchase_order','old-app writer'),
  ('create_sales_order','old-app writer'), ('convert_purchase_order_to_bill','old-app writer'),
  ('convert_sales_order_to_invoice','old-app writer'), ('run_payroll','old-app writer'), ('post_journal','old-app writer'),
  ('take_payment','old-app writer'), ('generate_customer_statement','old-app writer'), ('apply_stock_movement','old-app writer'),
  ('trg_goods_receipt_line','old-app writer'), ('brand_supply_source','old-app writer')
ON CONFLICT (proname) DO UPDATE SET why = EXCLUDED.why;

CREATE OR REPLACE FUNCTION unify.engine_refs(p_table text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname)
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang AND l.lanname IN ('sql','plpgsql')
   WHERE p.pronamespace = 'public'::regnamespace
     AND NOT EXISTS (SELECT 1 FROM unify.ref_ignore i WHERE i.proname = p.proname)
     AND regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
         ~* ('(\m(from|join|into|update|table|exists)\s+(only\s+)?(public\.)?"?' || p_table || '"?\M|\m' || p_table || '%rowtype)') $$;

CREATE OR REPLACE FUNCTION unify.last_write(p_table text) RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
DECLARE cols text; v timestamptz;
BEGIN
  SELECT string_agg(format('max(%I)', column_name), ', ') INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = p_table AND data_type LIKE 'timestamp%'
     AND column_name IN ('created_at','updated_at','createdAt','updatedAt','received_at','occurred_at','event_time','processed_at');
  IF cols IS NULL THEN RETURN NULL; END IF;
  EXECUTE format('SELECT greatest(%s) FROM public.%I', cols, p_table) INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION unify.rowcount(p_table text) RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE n bigint; BEGIN EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO n; RETURN n; END $$;

CREATE OR REPLACE FUNCTION unify.has_col(p_table text, p_col text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_col) $$;

-- rows of p_table that are NOT yet represented in the canonical model
CREATE OR REPLACE FUNCTION unify.unmigrated(p_table text) RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE n bigint; f unify.forwarders;
BEGIN
  IF unify.rowcount(p_table) = 0 THEN RETURN 0; END IF;
  SELECT * INTO f FROM unify.forwarders WHERE source_table = p_table;
  IF FOUND THEN
    IF f.mapper = 'map_audit' THEN
      EXECUTE format('SELECT count(*) FROM public.%I s WHERE NOT EXISTS (SELECT 1 FROM public.platform_audit_events c WHERE c.source_table = %L AND c.source_id = coalesce(to_jsonb(s)->>''id'', md5(to_jsonb(s)::text)))', p_table, p_table) INTO n;
    ELSIF f.mapper = 'map_idem' THEN
      EXECUTE format('SELECT count(*) FROM public.%I s WHERE NOT EXISTS (SELECT 1 FROM public.platform_idempotency_keys c WHERE c.source_table = %L AND c.source_id = coalesce(to_jsonb(s)->>''id'', md5(to_jsonb(s)::text)))', p_table, p_table) INTO n;
    ELSIF f.mapper = 'map_outbox' THEN
      EXECUTE format('SELECT count(*) FROM public.%I s WHERE NOT EXISTS (SELECT 1 FROM public.platform_outbox c WHERE c.source_table = %L AND c.source_id = s.id::text)', p_table, p_table) INTO n;
    ELSIF f.mapper = 'map_job' THEN
      EXECUTE format('SELECT count(*) FROM public.%I s WHERE NOT EXISTS (SELECT 1 FROM public.platform_jobs c WHERE c.source_table = %L AND c.source_id = s.id::text)', p_table, p_table) INTO n;
    ELSIF f.mapper = 'map_webhook' THEN
      EXECUTE format('SELECT count(*) FROM public.%I s WHERE NOT EXISTS (SELECT 1 FROM public.integration_webhook_inbox c WHERE c.event_id = coalesce(to_jsonb(s)->>''provider_event_id'', to_jsonb(s)->>''external_event_id'', to_jsonb(s)->>''event_id'', s.id::text))', p_table) INTO n;
    ELSIF f.mapper = 'map_saved_view' THEN
      EXECUTE format('SELECT count(*) FROM public.%I s WHERE NOT EXISTS (SELECT 1 FROM public.platform_saved_views c WHERE c.id::text = s.id::text) AND unify.user_or_null(coalesce(to_jsonb(s)->>''owner_user_id'', to_jsonb(s)->>''user_id'')) IS NOT NULL', p_table) INTO n;
    END IF;
    RETURN n;
  END IF;
  IF p_table IN ('orders','ecommerce_orders','commerce_orders','sales_orders') THEN
    SELECT count(*) INTO n FROM unify.v_legacy_orders WHERE tbl = p_table AND verdict <> 'linked';
    RETURN n;
  END IF;
  IF p_table IN ('order_items','commerce_order_items','sales_order_items') THEN
    RETURN unify.unmigrated(CASE p_table WHEN 'order_items' THEN 'orders' WHEN 'commerce_order_items' THEN 'commerce_orders' ELSE 'sales_orders' END);
  END IF;
  IF p_table IN ('customers','order_customers','commerce_customer_accounts')
     AND unify.has_col(p_table, 'email') AND unify.has_col(p_table, 'tenant_id') THEN
    EXECUTE format('SELECT count(*) FROM public.%I s WHERE nullif(btrim(s.email), '''') IS NULL OR NOT EXISTS (SELECT 1 FROM public.crm_customers c WHERE c.tenant_id = s.tenant_id AND lower(btrim(c.email)) = lower(btrim(s.email)))', p_table) INTO n;
    RETURN n;
  END IF;
  IF p_table IN ('availability','blocked_times') THEN
    EXECUTE format('SELECT count(*) FROM public.%I s WHERE NOT EXISTS (SELECT 1 FROM public.crm_staff_blocked_times b WHERE b.legacy_source = %L AND b.legacy_id = s.id::text)', p_table, p_table) INTO n;
    RETURN n;
  END IF;
  RETURN unify.rowcount(p_table);   -- no mapper: every row is unmigrated
END $$;

CREATE OR REPLACE FUNCTION unify.is_bridged(p_table text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_table IN ('orders','ecommerce_orders','commerce_orders','sales_orders','order_items','commerce_order_items','sales_order_items')
      OR EXISTS (SELECT 1 FROM unify.forwarders WHERE source_table = p_table) $$;

-- writes to a retired name: redirect to the canonical mapper, or refuse clearly
CREATE OR REPLACE FUNCTION unify.retired_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, unify AS $$
BEGIN
  IF TG_OP = 'INSERT' AND coalesce(TG_ARGV[1], '') <> '' THEN
    EXECUTE format('SELECT unify.%I($1, $2)', TG_ARGV[1]) USING TG_TABLE_NAME::text, to_jsonb(NEW);
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is retired; use %', TG_TABLE_NAME, TG_ARGV[0] USING ERRCODE = '0A000';
END $$;

CREATE OR REPLACE FUNCTION unify.compat_view(p_table text, p_canonical text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE m text := (SELECT mapper FROM unify.forwarders WHERE source_table = p_table);
BEGIN
  IF to_regclass('public.' || quote_ident(p_table)) IS NOT NULL THEN RETURN; END IF;
  EXECUTE format('CREATE VIEW public.%I AS SELECT * FROM archive.%I WHERE false', p_table, p_table);
  EXECUTE format('COMMENT ON VIEW public.%I IS %L', p_table, 'RETIRED: always empty. Data is in archive.' || p_table || '; canonical table is ' || p_canonical);
  EXECUTE format('CREATE TRIGGER retired_write INSTEAD OF INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION unify.retired_write(%L, %L)',
                 p_table, p_canonical, coalesce(m, ''));
  EXECUTE format('REVOKE ALL ON public.%I FROM anon', p_table);
  EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated, service_role', p_table);
END $$;

-- 4. decide and act ----------------------------------------------------
CREATE OR REPLACE FUNCTION unify.retire_one(p_table text, p_canonical text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  refs text; n_rows bigint; n_un bigint; lw timestamptz; win interval := coalesce(unify.setting('active_write_window'), '30 days')::interval;
  fk record; nn bigint; ctype text; blockers text; status text; res text;
BEGIN
  IF to_regclass('archive.' || quote_ident(p_table)) IS NOT NULL THEN
    IF coalesce(unify.setting('compat_views'), 'true')::boolean OR unify.engine_refs(p_table) IS NOT NULL
       OR EXISTS (SELECT 1 FROM unify.ref_ignore i JOIN pg_proc p ON p.proname = i.proname
                   WHERE p.prosrc ~* ('\m' || p_table || '\M')) THEN
      PERFORM unify.compat_view(p_table, p_canonical);
    END IF;
    RETURN 'archived: archive.' || p_table;
  END IF;
  IF to_regclass('public.' || quote_ident(p_table)) IS NULL THEN RETURN 'absent: not in this database'; END IF;
  IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.' || quote_ident(p_table))) NOT IN ('r','p') THEN RETURN 'not_a_table'; END IF;

  refs := unify.engine_refs(p_table);
  IF refs IS NOT NULL THEN
    UPDATE public.platform_canonical_map SET relation = 'source',
           notes = 'engine storage, kept: used by ' || refs || CASE WHEN unify.is_bridged(p_table) THEN '; mirrored into ' || p_canonical ELSE '' END
     WHERE legacy_table = p_table;
    RETURN 'keep_engine: ' || refs;
  END IF;

  n_rows := unify.rowcount(p_table);
  n_un   := unify.unmigrated(p_table);
  -- line tables follow their header table's activity
  lw     := unify.last_write(CASE p_table WHEN 'order_items' THEN 'orders' WHEN 'commerce_order_items' THEN 'commerce_orders'
                                          WHEN 'sales_order_items' THEN 'sales_orders' ELSE p_table END);
  IF n_rows > 0 AND unify.is_bridged(p_table) AND (lw IS NULL OR lw > now() - win) THEN
    UPDATE public.platform_canonical_map SET relation = 'source',
           notes = format('bridged intake, kept: last write %s; unify mirrors every row into %s', coalesce(lw::text, 'unknown'), p_canonical)
     WHERE legacy_table = p_table;
    RETURN 'keep_bridged: ' || coalesce(lw::text, 'no timestamp');
  END IF;
  IF n_un > 0 THEN
    RETURN format('BLOCKED: %s of %s rows not represented in %s', n_un, n_rows, p_canonical);
  END IF;

  -- active FKs into the table: all values must be NULL, or remappable to erp_orders.
  -- Composite tenant-scoped FKs (tenant_id, x_id) are handled on their x_id column.
  FOR fk IN
    SELECT c.oid, c.conname, k.relname::text AS child, array_length(c.conkey, 1) AS ncols,
           (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) AND a.attname <> 'tenant_id'
             ORDER BY a.attnum LIMIT 1) AS col,
           (SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
               AND a.attname <> 'tenant_id' ORDER BY a.attnum LIMIT 1) AS typ,
           EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey) AND a.attname = 'tenant_id') AS has_tenant
      FROM pg_constraint c
      JOIN pg_class k ON k.oid = c.conrelid AND k.relnamespace = 'public'::regnamespace
      LEFT JOIN public.platform_table_registry g ON g.table_name = k.relname::text
     WHERE c.contype = 'f' AND c.confrelid = to_regclass('public.' || quote_ident(p_table)) AND c.conrelid <> c.confrelid
       AND coalesce(g.lifecycle, 'active') NOT IN ('legacy','archived')
  LOOP
    IF fk.col IS NULL OR fk.ncols > 2 OR (fk.ncols = 2 AND NOT fk.has_tenant) THEN
      blockers := concat_ws(', ', blockers, format('%s.%s (unsupported multi-column FK)', fk.child, fk.conname)); CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I IS NOT NULL', fk.child, fk.col) INTO nn;
    IF nn > 0 AND unify.has_col(p_table, 'erp_order_id') AND p_canonical = 'erp_orders' AND fk.typ = 'uuid' THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', fk.child, fk.conname);
      EXECUTE format('UPDATE public.%I c SET %I = l.erp_order_id FROM public.%I l WHERE c.%I = l.id AND l.erp_order_id IS NOT NULL',
                     fk.child, fk.col, p_table, fk.col);
      PERFORM unify.log('retire', fk.child || '.' || fk.col, 'remapped_to_erp_orders', nn::text || ' rows');
    ELSIF nn > 0 THEN
      blockers := concat_ws(', ', blockers, format('%s.%s (%s rows)', fk.child, fk.col, nn));
      CONTINUE;
    ELSE
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', fk.child, fk.conname);
    END IF;
    DELETE FROM public.platform_fk_log WHERE child_table = fk.child AND child_column = fk.col;
    SELECT format_type(a.atttypid, a.atttypmod) INTO ctype FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.' || quote_ident(p_canonical)) AND a.attname = 'id';
    IF ctype = fk.typ THEN
      status := public.platform__ensure_fk(fk.child, fk.col, p_canonical, 'id', NULL, 'repointed from retired ' || p_table);
      IF status NOT IN ('validated','exists') THEN
        RAISE EXCEPTION 'repointing %.% to % failed: %', fk.child, fk.col, p_canonical, status;
      END IF;
    ELSE
      INSERT INTO public.platform_fk_exemptions(table_name, column_name, reason)
      VALUES (fk.child, fk.col, format('pointed at retired %s (%s); canonical %s.id is %s - set by app', p_table, fk.typ, p_canonical, ctype))
      ON CONFLICT (table_name, column_name) DO UPDATE SET reason = EXCLUDED.reason;
    END IF;
  END LOOP;
  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED: active tables still point at rows of %: %', p_table, blockers;
  END IF;

  UPDATE public.platform_table_registry SET lifecycle = 'legacy' WHERE table_name = p_table AND lifecycle <> 'legacy';
  res := public.platform_archive_legacy_table(p_table, 'ARCHIVE ' || p_table);
  IF coalesce(unify.setting('compat_views'), 'true')::boolean OR unify.engine_refs(p_table) IS NOT NULL
     OR EXISTS (SELECT 1 FROM unify.ref_ignore i JOIN pg_proc p ON p.proname = i.proname WHERE p.prosrc ~* ('\m' || p_table || '\M')) THEN
    PERFORM unify.compat_view(p_table, p_canonical);
  END IF;
  RETURN 'archived: ' || n_rows || ' rows kept in ' || res;
END $$;

DO $$
DECLARE m record; d text;
BEGIN
  -- children before parents so parent FK checks see them as legacy/archived
  FOR m IN SELECT legacy_table, canonical_table FROM public.platform_canonical_map
            WHERE legacy_table <> 'acct_customers'
            ORDER BY (legacy_table ~ '(_items|_lines|_draws|_transactions|_redemptions)$') DESC, legacy_table LOOP
    BEGIN
      d := unify.retire_one(m.legacy_table, m.canonical_table);
    EXCEPTION WHEN others THEN
      d := CASE WHEN SQLERRM LIKE 'BLOCKED%' THEN SQLERRM ELSE 'BLOCKED: ' || SQLERRM END;
    END;
    INSERT INTO unify.retire_report(legacy_table, canonical_table, decision, detail, decided_at)
    VALUES (m.legacy_table, m.canonical_table, split_part(d, ':', 1), nullif(substr(d, length(split_part(d, ':', 1)) + 2), ''), now())
    ON CONFLICT (legacy_table) DO UPDATE SET decision = EXCLUDED.decision, detail = EXCLUDED.detail, decided_at = now();
    PERFORM unify.log('retire', m.legacy_table, split_part(d, ':', 1), d);
  END LOOP;
END $$;

-- 5. old-app writer RPCs: their tables are retired, stop clients calling them
DO $$
DECLARE f record;
BEGIN
  IF coalesce(unify.setting('retire_legacy_rpcs'), 'true')::boolean THEN
    FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN unify.ref_ignore i ON i.proname = p.proname AND i.why = 'old-app writer'
              WHERE p.pronamespace = 'public'::regnamespace AND p.prorettype <> 'trigger'::regtype LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
    END LOOP;
  END IF;
END $$;

SELECT public.platform__apply_canonical_map();
SELECT public.platform_classify_tables();
COMMIT;

SELECT decision, count(*) AS tables, string_agg(legacy_table, ', ' ORDER BY legacy_table) AS which
  FROM unify.retire_report GROUP BY decision ORDER BY decision;
SELECT legacy_table, detail FROM unify.retire_report WHERE decision = 'BLOCKED' ORDER BY 1;

-- canonical step ledger
SELECT unify.done('250');
