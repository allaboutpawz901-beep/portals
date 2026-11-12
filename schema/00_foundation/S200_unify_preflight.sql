-- CANONICAL STEP 200  |  file S200_unify_preflight.sql  |  was unify/00_preflight.sql  |  internal log label '00' (unchanged)
-- =====================================================================
-- S200_unify_preflight.sql  —  answers "are the 47 orders and 6 acct_customers
-- already represented in the canonical tables, or do they need to move?"
--
-- Creates ONLY the private helper schema `unify` (settings, run log and
-- classification views). It does not change a single row in public.*.
-- Safe to run as many times as you like.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 200: steps 100 (baseline) and 110 (App Part 19) must already be in place
DO $guard$ BEGIN
  IF to_regclass('public.platform_table_registry') IS NULL OR to_regprocedure('public.platform__apply_app_security()') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: the baseline (R1 September files + R2) is not in this database. Run S100_baseline_gate.sql to see what is missing.';
  END IF;
  IF to_regclass('public.cap_board_approvals') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: run S110_app19_cap_table_409a.sql before S200_unify_preflight.sql.';
  END IF;
END $guard$;
BEGIN;

CREATE SCHEMA IF NOT EXISTS unify;
REVOKE ALL ON SCHEMA unify FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON SCHEMA unify FROM anon, authenticated'; END IF;
END $$;

CREATE TABLE IF NOT EXISTS unify.settings (key text PRIMARY KEY, value text NOT NULL, note text);
INSERT INTO unify.settings(key, value, note) VALUES
 ('cutover_at', now()::text, 'Orders created before this moment are historical; set once on the first run'),
 ('post_historical_orders_to_gl', 'false', 'false = historical storefront orders are NOT posted to the ledger (they were never in the books, Stripe payouts may already be booked). true = post them through acct__sync_erp_order'),
 ('post_new_orders_to_gl', 'true', 'Orders that arrive in legacy tables after cutover are posted to the ledger when the reconciler creates their erp_orders row'),
 ('reconcile_min_age', '15 minutes', 'Reconciler waits this long before creating an erp_orders row, so a natively-created erp order can claim it first'),
 ('commerce_amounts_in_cents', 'auto', 'commerce_orders.total_amount/subtotal are text. auto = cents when the value has no decimal point and equals 100x a matching storefront total, or is >= 1000 with no decimal point; true/false to force'),
 ('active_write_window', '30 days', 'A legacy table that received a row within this window is kept as a live intake table (lifecycle integration) instead of archived'),
 ('compat_views', 'true', 'After archiving an empty legacy table, leave a read-only empty view with the same name so old reads do not crash; writes raise a clear error naming the canonical table'),
 ('default_tenant_id', '', 'Tenant used for legacy rows whose tenant_id is NULL. Empty = the only tenant that owns erp_orders')
ON CONFLICT (key) DO NOTHING;

-- canonical step ledger: every step records itself here and refuses to run before its predecessor
CREATE TABLE IF NOT EXISTS unify.step_order (step text PRIMARY KEY, label text NOT NULL, file text NOT NULL, pos int NOT NULL);
INSERT INTO unify.step_order(step, label, file, pos) VALUES
 ('200','00','S200_unify_preflight.sql',0),
 ('210','01','S210_unify_customers.sql',1),
 ('220','02','S220_unify_orders.sql',2),
 ('230','03','S230_platform_canonical.sql',3),
 ('240','04','S240_appointments.sql',4),
 ('250','05','S250_retire_legacy.sql',5),
 ('260','06','S260_fk_closure_and_registry.sql',6),
 ('300','06b','S300_common_features.sql',7),
 ('310','06c','S310_agnostic_core.sql',8),
 ('320','06d','S320_modules_and_packs.sql',9),
 ('330','06e','S330_roles_and_learning.sql',10),
 ('340','06f','S340_catalog_listing_map.sql',11),
 ('400','07','S400_actions_and_nav.sql',12),
 ('500','08','S500_live_extras.sql',13),
 ('900','09','S900_verify.sql',14)
ON CONFLICT (step) DO UPDATE SET label = excluded.label, file = excluded.file, pos = excluded.pos;
CREATE TABLE IF NOT EXISTS unify.steps (step text PRIMARY KEY REFERENCES unify.step_order, first_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz NOT NULL DEFAULT now(), runs int NOT NULL DEFAULT 1);
CREATE OR REPLACE FUNCTION unify.require(p_step text) RETURNS void LANGUAGE plpgsql AS $r$
DECLARE missing text;
BEGIN
  SELECT string_agg(o.file, ', ' ORDER BY o.pos) INTO missing FROM unify.step_order o
   WHERE o.pos < (SELECT pos FROM unify.step_order WHERE step = p_step)
     AND o.step <> '900' AND NOT EXISTS (SELECT 1 FROM unify.steps s WHERE s.step = o.step);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: step % needs these steps first: %. Run ./run_all.sh (it runs every step in order).', p_step, missing;
  END IF;
END $r$;
CREATE OR REPLACE FUNCTION unify.done(p_step text) RETURNS text LANGUAGE sql AS $d$
  INSERT INTO unify.steps(step) VALUES (p_step)
  ON CONFLICT (step) DO UPDATE SET last_run_at = now(), runs = unify.steps.runs + 1
  RETURNING 'step ' || step || ' recorded (run ' || runs || ')' $d$;

CREATE TABLE IF NOT EXISTS unify.run_log (
  id bigserial PRIMARY KEY, step text NOT NULL, item text, action text NOT NULL, detail text, at timestamptz NOT NULL DEFAULT now());

CREATE OR REPLACE FUNCTION unify.setting(k text) RETURNS text LANGUAGE sql STABLE AS
$$ SELECT value FROM unify.settings WHERE key = k $$;

CREATE OR REPLACE FUNCTION unify.log(p_step text, p_item text, p_action text, p_detail text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$ INSERT INTO unify.run_log(step, item, action, detail) VALUES (p_step, p_item, p_action, p_detail) $$;

CREATE OR REPLACE FUNCTION unify.num(t text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN RETURN nullif(regexp_replace(coalesce(t, ''), '[^0-9.\-]', '', 'g'), '')::numeric;
EXCEPTION WHEN others THEN RETURN NULL; END $$;

CREATE OR REPLACE FUNCTION unify.default_tenant() RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v uuid; n int;
BEGIN
  IF nullif(unify.setting('default_tenant_id'), '') IS NOT NULL THEN RETURN unify.setting('default_tenant_id')::uuid; END IF;
  SELECT count(DISTINCT tenant_id), min(tenant_id::text)::uuid INTO n, v FROM public.erp_orders;
  IF n = 1 THEN RETURN v; END IF;
  SELECT count(*), min(id::text)::uuid INTO n, v FROM public.tenants;
  RETURN CASE WHEN n = 1 THEN v END;
END $$;

-- commerce_orders keeps money as text; decide dollars vs cents per row
CREATE OR REPLACE FUNCTION unify.commerce_money(p_txt text, p_pi text) RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE v numeric := unify.num(p_txt); m text := unify.setting('commerce_amounts_in_cents'); ref numeric;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  IF m = 'true' THEN RETURN round(v / 100, 2); ELSIF m = 'false' THEN RETURN v; END IF;
  IF position('.' IN p_txt) > 0 THEN RETURN v; END IF;
  SELECT coalesce(o.total, e.total) INTO ref
    FROM (SELECT 1) x
    LEFT JOIN public.orders o ON p_pi <> '' AND o.stripe_payment_intent_id = p_pi
    LEFT JOIN public.ecommerce_orders e ON p_pi <> '' AND e.stripe_payment_intent_id = p_pi LIMIT 1;
  IF ref IS NOT NULL THEN RETURN CASE WHEN abs(ref * 100 - v) < 1 THEN round(v / 100, 2) ELSE v END; END IF;
  RETURN CASE WHEN v >= 1000 THEN round(v / 100, 2) ELSE v END;
END $$;

-- ---------------------------------------------------------------------
-- Every legacy order row, the purchase ("cluster") it belongs to and
-- the canonical erp_orders row that already represents it, if any.
--   orders            = storefront checkout capture (has the line items)
--   ecommerce_orders  = projection of orders (storefront_order_id -> orders.id)
--   commerce_orders   = Stripe Checkout records (matched by payment intent)
--   sales_orders      = old B2B sales orders
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW unify.v_legacy_orders AS
WITH l AS (
  SELECT 'orders'::text tbl, o.id::text id, o.tenant_id, o.erp_order_id, nullif(o.stripe_payment_intent_id,'') pi,
         NULL::text order_number, NULL::text storefront_id, NULL::text email, o.created_at placed_at, o.total, o.status, NULL::text payment_status
    FROM public.orders o
  UNION ALL
  SELECT 'ecommerce_orders', e.id::text, e.tenant_id, e.erp_order_id, nullif(e.stripe_payment_intent_id,''),
         nullif(e.order_number,''), e.storefront_order_id::text, lower(nullif(btrim(e.customer_email),'')), e.placed_at, e.total, e.status, e.payment_status
    FROM public.ecommerce_orders e
  UNION ALL
  SELECT 'commerce_orders', c.id, coalesce(c.tenant_id, unify.default_tenant()), c.erp_order_id, nullif(c.stripe_payment_intent_id,''),
         NULL, NULL, lower(nullif(btrim(coalesce(c.customer_email, c.email)),'')), c.created_at,
         unify.commerce_money(c.total_amount, c.stripe_payment_intent_id), c.status, c.payment_status
    FROM public.commerce_orders c
  UNION ALL
  SELECT 'sales_orders', s.id::text, s.tenant_id, s.erp_order_id, NULL, nullif(s.number,''), NULL, NULL,
         coalesce(s.created_at, s.issue_date::timestamptz), s.total, s.status::text, NULL
    FROM public.sales_orders s
), k AS (
  SELECT l.*,
    CASE l.tbl
      WHEN 'orders' THEN 'orders:' || l.id
      WHEN 'ecommerce_orders' THEN coalesce(
        (SELECT 'orders:' || o.id FROM public.orders o WHERE o.id::text = l.storefront_id),
        (SELECT 'orders:' || o.id FROM public.orders o WHERE l.pi IS NOT NULL AND o.stripe_payment_intent_id = l.pi AND o.tenant_id = l.tenant_id ORDER BY o.created_at LIMIT 1),
        'ecommerce_orders:' || l.id)
      WHEN 'commerce_orders' THEN coalesce(
        (SELECT 'orders:' || o.id FROM public.orders o WHERE l.pi IS NOT NULL AND o.stripe_payment_intent_id = l.pi AND o.tenant_id = l.tenant_id ORDER BY o.created_at LIMIT 1),
        (SELECT coalesce((SELECT 'orders:' || o.id FROM public.orders o WHERE o.id = e.storefront_order_id), 'ecommerce_orders:' || e.id)
           FROM public.ecommerce_orders e WHERE l.pi IS NOT NULL AND e.stripe_payment_intent_id = l.pi AND e.tenant_id = l.tenant_id ORDER BY e.placed_at LIMIT 1),
        'commerce_orders:' || l.id)
      ELSE l.tbl || ':' || l.id END AS cluster_key
    FROM l
), m AS (
  SELECT k.*, x.erp_id row_erp_id, x.how match_method
    FROM k LEFT JOIN LATERAL (
      SELECT erp_id, how FROM (
        SELECT e.id erp_id, 'erp_order_id column' how, 1 p FROM public.erp_orders e WHERE e.id = k.erp_order_id
        UNION ALL
        SELECT e.id, 'source_order_id / metadata legacy id', 2 FROM public.erp_orders e
         WHERE e.tenant_id = k.tenant_id
           AND (e.source_order_id = k.id OR e.metadata->>'legacy_order_id' = k.id OR e.metadata->>(k.tbl || '_id') = k.id
                OR e.metadata->'unify_legacy_keys' ? (k.tbl || ':' || k.id)
                OR (k.storefront_id IS NOT NULL AND (e.source_order_id = k.storefront_id OR e.metadata->>'legacy_order_id' = k.storefront_id)))
        UNION ALL
        SELECT e.id, 'stripe payment intent', 3 FROM public.erp_orders e
         WHERE k.pi IS NOT NULL AND e.tenant_id = k.tenant_id
           AND (e.source_order_id = k.pi OR e.metadata->>'stripe_payment_intent_id' = k.pi OR e.metadata->>'payment_intent_id' = k.pi OR e.metadata->>'payment_intent' = k.pi)
        UNION ALL
        SELECT e.id, 'order number + (total or email)', 4 FROM public.erp_orders e
         WHERE k.order_number IS NOT NULL AND e.tenant_id = k.tenant_id AND e.order_number = k.order_number
           AND (abs(coalesce(e.total, -1) - coalesce(k.total, -2)) < 0.01 OR lower(e.customer_email) = k.email)
      ) c ORDER BY p, erp_id LIMIT 1) x ON true
), c AS (
  SELECT m.*,
         min(row_erp_id::text) OVER (PARTITION BY cluster_key)::uuid AS cluster_erp_id
    FROM m
)
SELECT tbl, id, tenant_id, cluster_key, placed_at, total, status, pi, order_number, email, erp_order_id,
       row_erp_id, match_method, cluster_erp_id,
       CASE WHEN cluster_erp_id IS NULL THEN 'NEEDS_MOVE'
            WHEN erp_order_id IS NOT DISTINCT FROM cluster_erp_id THEN 'linked'
            WHEN erp_order_id IS NOT NULL AND erp_order_id <> cluster_erp_id THEN 'CONFLICT'
            ELSE 'represented_not_linked' END AS verdict
  FROM c;
CREATE OR REPLACE VIEW unify.v_order_conflicts AS
SELECT cluster_key, array_agg(DISTINCT row_erp_id) erp_ids FROM unify.v_legacy_orders
 WHERE row_erp_id IS NOT NULL GROUP BY cluster_key HAVING count(DISTINCT row_erp_id) > 1;

-- ---------------------------------------------------------------------
-- acct_customers -> crm_customers. acct_customers is NOT retired: it is
-- the AR/tax profile (credit limit, AR account, terms, tax_exempt) used
-- by invoicing and tax functions. Each one needs exactly one CRM twin,
-- recorded in platform_customer_identity_links.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW unify.v_acct_customers AS
SELECT a.id, a.tenant_id, a.customer_number, a.legal_name, a.email, a.external_customer_id, a.party_id,
       x.crm_id, x.how match_method,
       (SELECT l.acct_customer_id FROM public.platform_customer_identity_links l WHERE l.crm_customer_id = x.crm_id) crm_linked_to,
       CASE WHEN x.crm_id IS NULL THEN 'NEEDS_MOVE'
            WHEN EXISTS (SELECT 1 FROM public.platform_customer_identity_links l WHERE l.acct_customer_id = a.id) THEN 'linked'
            WHEN EXISTS (SELECT 1 FROM public.platform_customer_identity_links l WHERE l.crm_customer_id = x.crm_id) THEN 'duplicate_ar_profile'
            ELSE 'represented_not_linked' END AS verdict
  FROM public.acct_customers a
  LEFT JOIN LATERAL (
    SELECT crm_id, how FROM (
      SELECT l.crm_customer_id crm_id, 'identity link' how, 1 p FROM public.platform_customer_identity_links l WHERE l.acct_customer_id = a.id
      UNION ALL
      SELECT coalesce(c.merged_into_customer_id, c.id), 'external_customer_id / source id', 2 FROM public.crm_customers c
       WHERE c.tenant_id = a.tenant_id AND (c.id::text = a.external_customer_id OR c.source_customer_id = a.external_customer_id
             OR c.source_customer_id = 'acct_customers:' || a.id)
      UNION ALL
      SELECT coalesce(c.merged_into_customer_id, c.id), 'acct_legacy_map', 3 FROM public.acct_legacy_map lm JOIN public.crm_customers c ON c.id = lm.new_id
       WHERE lm.tenant_id = a.tenant_id AND lm.legacy_table = 'acct_customers' AND lm.legacy_id = a.id::text AND lm.new_table = 'crm_customers'
      UNION ALL
      SELECT coalesce(c.merged_into_customer_id, c.id), 'same party', 4 FROM public.crm_customers c
       WHERE a.party_id IS NOT NULL AND c.tenant_id = a.tenant_id AND c.party_id = a.party_id
      UNION ALL
      SELECT coalesce(c.merged_into_customer_id, c.id), 'email', 5 FROM public.crm_customers c
       WHERE nullif(btrim(a.email),'') IS NOT NULL AND c.tenant_id = a.tenant_id AND lower(btrim(c.email)) = lower(btrim(a.email))
      UNION ALL
      SELECT coalesce(c.merged_into_customer_id, c.id), 'customer number', 6 FROM public.crm_customers c
       WHERE c.tenant_id = a.tenant_id AND c.external_customer_number = a.customer_number
    ) z ORDER BY p, crm_id LIMIT 1) x ON true;

COMMIT;

-- ============================ REPORT =================================
\echo
\echo '== 1. Legacy order rows by table and verdict'
SELECT tbl, verdict, count(*) rows FROM unify.v_legacy_orders GROUP BY 1,2 ORDER BY 1,2;

\echo '== 2. Distinct purchases (a storefront order, its ecommerce projection and its Stripe record are ONE purchase)'
SELECT count(*) AS purchases,
       count(*) FILTER (WHERE erp IS NOT NULL) AS already_in_erp_orders,
       count(*) FILTER (WHERE erp IS NULL)     AS need_a_new_erp_order,
       sum(rows) AS legacy_rows
  FROM (SELECT cluster_key, max(cluster_erp_id::text) erp, count(*) rows FROM unify.v_legacy_orders GROUP BY 1) p;

\echo '== 3. Purchases that need a new erp_orders row'
SELECT cluster_key, string_agg(tbl, '+' ORDER BY tbl) sources, min(placed_at) placed_at, max(total) total, max(status) status, max(email) email
  FROM unify.v_legacy_orders WHERE verdict = 'NEEDS_MOVE' GROUP BY 1 ORDER BY 3;

\echo '== 4. Conflicts (one purchase matched to two different erp orders) — must be 0'
SELECT * FROM unify.v_order_conflicts;

\echo '== 5. acct_customers'
SELECT verdict, match_method, count(*) FROM unify.v_acct_customers GROUP BY 1,2 ORDER BY 1,2;
SELECT customer_number, legal_name, email, verdict, match_method, crm_id FROM unify.v_acct_customers ORDER BY verdict, customer_number;

\echo '== 6. Rows still sitting in tables the consolidation plan retires'
SELECT m.legacy_table, m.canonical_table, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from public.%I', m.legacy_table), false, true, '')))[1]::text::bigint AS rows
  FROM public.platform_canonical_map m
 WHERE to_regclass('public.' || quote_ident(m.legacy_table)) IS NOT NULL AND m.relation = 'legacy'
 ORDER BY 3 DESC, 1;

-- canonical step ledger
SELECT unify.done('200');
