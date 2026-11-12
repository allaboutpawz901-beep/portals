-- CANONICAL STEP 220  |  file S220_unify_orders.sql  |  was unify/02_orders.sql  |  internal log label '02' (unchanged)
-- =====================================================================
-- S220_unify_orders.sql — one purchase = one erp_orders row.
--
-- For every purchase found in orders / ecommerce_orders / commerce_orders /
-- sales_orders (grouped by unify.v_legacy_orders.cluster_key):
--   * already represented in erp_orders  -> just back-link erp_order_id
--   * not represented                    -> create erp_orders + lines +
--     shipping address + status history, then back-link every legacy row
-- Historical orders are NOT posted to the ledger unless
-- unify.settings.post_historical_orders_to_gl = 'true'.
-- Also installs unify.reconcile_orders(), which you schedule so that any
-- order the old storefront code still writes lands in erp_orders too.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 220 (internal label '02'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S220_unify_orders.sql is step 220; run S200_unify_preflight.sql and every step up to 210 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('220');
END $guard$;
BEGIN;

CREATE OR REPLACE FUNCTION unify.map_order_status(p_status text, p_payment text, p_fulfillment text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN s IN ('refunded','partially_refunded') OR pay IN ('refunded') THEN
         CASE WHEN f IN ('shipped','delivered','fulfilled','in_transit') THEN 'delivered' ELSE 'cancelled' END
    WHEN s IN ('cancelled','canceled','void','voided','expired','failed') THEN 'cancelled'
    WHEN s IN ('delivered','fulfilled','complete','completed') OR f IN ('delivered') THEN 'delivered'
    WHEN s IN ('shipped','in_transit','partially_shipped') OR f IN ('shipped','in_transit','fulfilled') THEN 'shipped'
    WHEN s IN ('fulfilling','processing','in_production','printing','packed','ready') THEN 'processing'
    WHEN s IN ('paid','confirmed','succeeded','captured') OR pay IN ('paid','succeeded','captured') THEN 'confirmed'
    WHEN s IN ('pending_payment','pending','unpaid','open','requires_payment','requires_payment_method','draft','new','') THEN 'pending_payment'
    ELSE 'confirmed' END
  FROM (SELECT lower(coalesce(p_status,'')) s, lower(coalesce(p_payment,'')) pay, lower(coalesce(p_fulfillment,'')) f) x
$$;

-- shipping_address arrives as jsonb (flat, or Stripe-style {name, address:{line1,...}}) or text
CREATE OR REPLACE FUNCTION unify.add_address(p_tenant uuid, p_order uuid, p_addr jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE a jsonb; nm text;
BEGIN
  IF p_addr IS NULL OR jsonb_typeof(p_addr) <> 'object' THEN RETURN; END IF;
  a := CASE WHEN jsonb_typeof(p_addr->'address') = 'object' THEN p_addr->'address' ELSE p_addr END;
  IF coalesce(a->>'line1', a->>'address1', a->>'street') IS NULL OR coalesce(a->>'city', '') = '' THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.erp_order_addresses WHERE order_id = p_order AND address_type = 'shipping') THEN RETURN; END IF;
  nm := coalesce(p_addr->>'name', a->>'name', concat_ws(' ', a->>'first_name', a->>'last_name'));
  INSERT INTO public.erp_order_addresses(tenant_id, order_id, address_type, first_name, last_name, company, line1, line2, city, state, postal_code, country_code, phone)
  VALUES (p_tenant, p_order, 'shipping', nullif(split_part(nm, ' ', 1), ''),
          CASE WHEN position(' ' IN nm) > 0 THEN substr(nm, position(' ' IN nm) + 1) END, a->>'company',
          coalesce(a->>'line1', a->>'address1', a->>'street'), coalesce(a->>'line2', a->>'address2'), a->>'city',
          coalesce(a->>'state', a->>'region', a->>'province'), coalesce(a->>'postal_code', a->>'zip', a->>'postcode'),
          upper(left(coalesce(nullif(a->>'country', ''), nullif(a->>'country_code', ''), 'US'), 2)), coalesce(p_addr->>'phone', a->>'phone'));
END $$;

-- create the canonical order for one purchase that is not represented yet
CREATE OR REPLACE FUNCTION unify.create_erp_order(p_cluster text, p_post_to_gl boolean) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE o public.orders%ROWTYPE; e public.ecommerce_orders%ROWTYPE; c public.commerce_orders%ROWTYPE; s public.sales_orders%ROWTYPE;
        v_id uuid := gen_random_uuid(); v_tenant uuid; v_num text; v_status text; v_total numeric; v_sub numeric; v_tax numeric;
        v_ship numeric; v_paid numeric; v_ref numeric; v_email text; v_crm uuid; v_keys jsonb; v_placed timestamptz; v_addr jsonb;
        v_raw_status text; v_pay text; v_ful text; v_lines numeric; v_src text; v_pi text; n int;
BEGIN
  SELECT x.* INTO o FROM public.orders x JOIN unify.v_legacy_orders v ON v.tbl = 'orders' AND v.id = x.id::text WHERE v.cluster_key = p_cluster LIMIT 1;
  SELECT x.* INTO e FROM public.ecommerce_orders x JOIN unify.v_legacy_orders v ON v.tbl = 'ecommerce_orders' AND v.id = x.id::text WHERE v.cluster_key = p_cluster ORDER BY x.placed_at LIMIT 1;
  SELECT x.* INTO c FROM public.commerce_orders x JOIN unify.v_legacy_orders v ON v.tbl = 'commerce_orders' AND v.id = x.id WHERE v.cluster_key = p_cluster ORDER BY x.created_at LIMIT 1;
  SELECT x.* INTO s FROM public.sales_orders x JOIN unify.v_legacy_orders v ON v.tbl = 'sales_orders' AND v.id = x.id::text WHERE v.cluster_key = p_cluster LIMIT 1;
  SELECT jsonb_agg(tbl || ':' || id ORDER BY tbl, id) INTO v_keys FROM unify.v_legacy_orders WHERE cluster_key = p_cluster;

  v_tenant := coalesce(o.tenant_id, e.tenant_id, s.tenant_id, c.tenant_id, unify.default_tenant());
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'unify: purchase % has no tenant; set unify.settings default_tenant_id', p_cluster; END IF;
  v_src := coalesce(o.id::text, e.id::text, c.id, s.id::text);
  v_pi := coalesce(nullif(o.stripe_payment_intent_id, ''), nullif(e.stripe_payment_intent_id, ''), nullif(c.stripe_payment_intent_id, ''));
  v_raw_status := coalesce(o.status, e.status, c.status, s.status::text);
  v_pay := coalesce(e.payment_status, c.payment_status);
  v_ful := coalesce(e.fulfillment_status, c.fulfillment_status);
  v_status := unify.map_order_status(v_raw_status, v_pay, v_ful);
  v_placed := coalesce(e.placed_at, o.created_at, c.created_at, s.created_at, now());
  v_email := lower(nullif(btrim(coalesce(e.customer_email, c.customer_email, c.email)), ''));
  v_crm := coalesce(e.crm_customer_id,
                    (SELECT m.new_id FROM public.acct_legacy_map m WHERE m.tenant_id = v_tenant AND m.legacy_table = 'customers' AND m.legacy_id = coalesce(c.customer_id, s.customer_id)),
                    (SELECT x.id FROM public.crm_customers x WHERE o.customer_id IS NOT NULL AND x.id = o.customer_id),
                    unify.crm_for_email(v_tenant, v_email, e.customer_name, e.customer_phone, 'order:' || v_src));
  IF v_email IS NULL AND v_crm IS NOT NULL THEN SELECT lower(email) INTO v_email FROM public.crm_customers WHERE id = v_crm; END IF;

  SELECT sum(coalesce(i.quantity, 1) * i.unit_price) INTO v_lines FROM public.order_items i WHERE o.id IS NOT NULL AND i.order_id = o.id;
  v_total := coalesce(e.total, o.total, unify.commerce_money(c.total_amount, c.stripe_payment_intent_id), s.total, v_lines, 0);
  v_ship  := coalesce(e.shipping_total, o.shipping_cost, 0);
  v_tax   := coalesce(e.tax_total, s.tax_total, 0);
  v_sub   := coalesce(e.subtotal, s.subtotal, unify.commerce_money(c.subtotal, c.stripe_payment_intent_id), v_lines, v_total - v_ship - v_tax);
  v_ref   := CASE WHEN lower(coalesce(v_raw_status, '')) IN ('refunded') OR lower(coalesce(v_pay, '')) = 'refunded' THEN v_total ELSE 0 END;
  v_paid  := CASE WHEN v_status = 'pending_payment' THEN 0
                  WHEN v_status = 'cancelled' AND v_ref = 0 AND lower(coalesce(v_pay, '')) NOT IN ('paid','succeeded','captured') THEN 0
                  ELSE v_total END;

  v_num := CASE WHEN nullif(e.order_number, '') IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM public.erp_orders x WHERE x.tenant_id = v_tenant AND x.order_number = e.order_number) THEN e.order_number
                WHEN nullif(s.number, '') IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM public.erp_orders x WHERE x.tenant_id = v_tenant AND x.order_number = s.number) THEN s.number
                ELSE public.erp_next_document_number(v_tenant, 'order') END;

  -- skip the automatic ledger posting for historical orders (acct__sync_erp_order honours acct_legacy_map)
  IF NOT p_post_to_gl THEN
    INSERT INTO public.acct_legacy_map(tenant_id, legacy_table, legacy_id, new_table, new_id, note)
    VALUES (v_tenant, 'erp_orders', v_id::text, 'erp_orders', v_id, 'unify: historical storefront order imported without ledger posting')
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.erp_orders(id, tenant_id, order_number, source_order_id, crm_customer_id, status, fulfillment_method, order_date, currency,
                                subtotal, discount_total, tax_total, shipping_total, total, amount_paid, amount_refunded, balance_due,
                                customer_email, customer_phone, notes, sales_channel, metadata, created_at, updated_at)
  VALUES (v_id, v_tenant, v_num, v_src, v_crm, v_status,
          CASE WHEN lower(coalesce(c.fulfillment_method, o.shipping_method, '')) ~ '(pickup|pick_up|local)' THEN 'pickup' ELSE 'ship' END,
          v_placed, upper(coalesce(nullif(e.currency, ''), nullif(s.currency, ''), 'USD')),
          v_sub, greatest(v_sub + v_ship + v_tax - v_total, 0), v_tax, v_ship, v_total, v_paid, v_ref, greatest(v_total - v_paid, 0),
          v_email, e.customer_phone, coalesce(c.notes, s.notes),
          CASE WHEN s.id IS NOT NULL THEN 'manual' ELSE 'website' END,
          jsonb_strip_nulls(jsonb_build_object(
            'legacy_order_id', v_src, 'unify_legacy_keys', v_keys, 'unify_managed', true, 'migrated_by', 'unify_v1',
            'legacy_status', v_raw_status, 'legacy_payment_status', v_pay, 'legacy_fulfillment_status', v_ful,
            'stripe_payment_intent_id', v_pi, 'stripe_checkout_id', c.stripe_checkout_id,
            'tracking_number', c.tracking_number, 'carrier', c.carrier, 'shipping_method', o.shipping_method,
            'commerce_metadata', c.metadata, 'posted_to_gl', p_post_to_gl)),
          v_placed, now());

  -- lines: storefront items (have SKU + design), else Stripe checkout items, else B2B items, else one summary line
  IF o.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.order_items WHERE order_id = o.id) THEN
    INSERT INTO public.erp_order_lines(tenant_id, order_id, sku_id, description, quantity, unit_price, line_total, status,
                                       quantity_shipped, design_publication_id, design_file_snapshot_url, storefront_order_item_id,
                                       supplier_catalog_variant_id, design_snapshot)
    SELECT v_tenant, v_id, i.product_variant_id, coalesce(i.design_snapshot->>'title', i.design_snapshot->>'name', 'Storefront item'),
           coalesce(i.quantity, 1), i.unit_price, coalesce(i.quantity, 1) * i.unit_price,
           CASE v_status WHEN 'cancelled' THEN 'cancelled' WHEN 'shipped' THEN 'shipped' WHEN 'delivered' THEN 'delivered' ELSE 'open' END,
           CASE WHEN v_status IN ('shipped','delivered') THEN coalesce(i.quantity, 1) ELSE 0 END,
           i.design_publication_id, i.design_file_snapshot_url, i.id, i.supplier_catalog_variant_id, i.design_snapshot
      FROM public.order_items i WHERE i.order_id = o.id
       AND NOT EXISTS (SELECT 1 FROM public.erp_order_lines l WHERE l.storefront_order_item_id = i.id);
  ELSIF c.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.commerce_order_items WHERE order_id = c.id) THEN
    INSERT INTO public.erp_order_lines(tenant_id, order_id, description, quantity, unit_price, line_total, status, quantity_shipped)
    SELECT v_tenant, v_id, coalesce(i.name, 'Item ' || coalesce(i.product_id, i.id)), coalesce(i.quantity, 1),
           unify.commerce_money(i.unit_price, c.stripe_payment_intent_id),
           coalesce(i.quantity, 1) * unify.commerce_money(i.unit_price, c.stripe_payment_intent_id),
           CASE v_status WHEN 'cancelled' THEN 'cancelled' WHEN 'shipped' THEN 'shipped' WHEN 'delivered' THEN 'delivered' ELSE 'open' END,
           CASE WHEN v_status IN ('shipped','delivered') THEN coalesce(i.quantity, 1) ELSE 0 END
      FROM public.commerce_order_items i WHERE i.order_id = c.id;
  ELSIF s.id IS NOT NULL AND EXISTS (SELECT 1 FROM public.sales_order_items WHERE sales_order_id = s.id) THEN
    INSERT INTO public.erp_order_lines(tenant_id, order_id, description, quantity, unit_price, discount_amount, line_total, status)
    SELECT v_tenant, v_id, coalesce(i.description, 'Item ' || i.product_id), coalesce(i.quantity, 1), i.unit_price, coalesce(i.discount, 0),
           coalesce(i.quantity, 1) * coalesce(i.unit_price, 0) - coalesce(i.discount, 0),
           CASE v_status WHEN 'cancelled' THEN 'cancelled' ELSE 'open' END
      FROM public.sales_order_items i WHERE i.sales_order_id = s.id ORDER BY i.position;
  ELSE
    INSERT INTO public.erp_order_lines(tenant_id, order_id, description, quantity, unit_price, line_total, status)
    VALUES (v_tenant, v_id, 'Imported order ' || v_num || ' (legacy source kept no line detail)', 1, v_sub, v_sub,
            CASE v_status WHEN 'cancelled' THEN 'cancelled' WHEN 'shipped' THEN 'shipped' WHEN 'delivered' THEN 'delivered' ELSE 'open' END);
  END IF;

  v_addr := coalesce(e.shipping_address, o.shipping_address,
                     CASE WHEN c.shipping_address ~ '^\s*\{' THEN c.shipping_address::jsonb END);
  PERFORM unify.add_address(v_tenant, v_id, v_addr);

  INSERT INTO public.erp_order_status_history(tenant_id, order_id, from_status, to_status, reason, changed_at)
  VALUES (v_tenant, v_id, NULL, v_status, 'unify: imported from ' || (SELECT string_agg(value, ', ') FROM jsonb_array_elements_text(v_keys)), now());

  IF c.tracking_number IS NOT NULL AND v_status IN ('shipped','delivered') THEN
    PERFORM unify.log('orders', v_id::text, 'tracking_kept_in_metadata', c.carrier || ' ' || c.tracking_number);
  END IF;

  IF p_post_to_gl THEN
    BEGIN PERFORM public.acct__sync_erp_order(v_id);  -- lines exist now; post
    EXCEPTION WHEN others THEN PERFORM unify.log('orders', v_id::text, 'gl_post_failed', SQLERRM); END;
  END IF;
  RETURN v_id;
END $$;

-- link (or create) every purchase; p_min_age protects orders that are still being written
CREATE OR REPLACE FUNCTION unify.unify_orders(p_min_age interval DEFAULT '0 seconds')
RETURNS TABLE(cluster_key text, sources text, verdict text, erp_order_id uuid, order_number text)
LANGUAGE plpgsql AS $$
DECLARE r record; v_erp uuid; v_post boolean; v_cut timestamptz := unify.setting('cutover_at')::timestamptz;
BEGIN
  PERFORM set_config('unify.running', 'on', true);
  IF EXISTS (SELECT 1 FROM unify.v_order_conflicts) THEN
    RAISE EXCEPTION 'unify: purchases matched to more than one erp order: %',
      (SELECT string_agg(v.cluster_key || ' -> ' || v.erp_ids::text, '; ') FROM unify.v_order_conflicts v);
  END IF;
  CREATE TEMP TABLE IF NOT EXISTS unify_clusters ON COMMIT DROP AS SELECT * FROM unify.v_legacy_orders WITH NO DATA;
  TRUNCATE unify_clusters;
  INSERT INTO unify_clusters SELECT * FROM unify.v_legacy_orders;

  FOR r IN SELECT u.cluster_key, string_agg(u.tbl, '+' ORDER BY u.tbl) srcs, (min(u.cluster_erp_id::text))::uuid erp,
                  min(u.placed_at) placed, bool_and(u.verdict = 'linked') all_linked
             FROM unify_clusters u GROUP BY u.cluster_key ORDER BY min(u.placed_at) LOOP
    IF r.all_linked THEN CONTINUE; END IF;
    IF r.erp IS NULL AND r.placed > now() - p_min_age THEN CONTINUE; END IF;
    IF r.erp IS NULL THEN
      v_post := CASE WHEN r.placed >= v_cut THEN unify.setting('post_new_orders_to_gl')::boolean
                     ELSE unify.setting('post_historical_orders_to_gl')::boolean END;
      v_erp := unify.create_erp_order(r.cluster_key, v_post);
      verdict := 'moved (new erp order' || CASE WHEN v_post THEN ', posted to GL' ELSE ', not posted to GL' END || ')';
    ELSE
      v_erp := r.erp; verdict := 'already represented: back-linked';
    END IF;
    UPDATE public.orders x SET erp_order_id = v_erp FROM unify_clusters u WHERE u.cluster_key = r.cluster_key AND u.tbl = 'orders' AND x.id::text = u.id AND x.erp_order_id IS DISTINCT FROM v_erp;
    UPDATE public.ecommerce_orders x SET erp_order_id = v_erp FROM unify_clusters u WHERE u.cluster_key = r.cluster_key AND u.tbl = 'ecommerce_orders' AND x.id::text = u.id AND x.erp_order_id IS DISTINCT FROM v_erp;
    UPDATE public.commerce_orders x SET erp_order_id = v_erp FROM unify_clusters u WHERE u.cluster_key = r.cluster_key AND u.tbl = 'commerce_orders' AND x.id = u.id AND x.erp_order_id IS DISTINCT FROM v_erp;
    UPDATE public.sales_orders x SET erp_order_id = v_erp FROM unify_clusters u WHERE u.cluster_key = r.cluster_key AND u.tbl = 'sales_orders' AND x.id::text = u.id AND x.erp_order_id IS DISTINCT FROM v_erp;
    INSERT INTO public.acct_legacy_map(tenant_id, legacy_table, legacy_id, new_table, new_id, note)
    SELECT DISTINCT e.tenant_id, u.tbl, u.id, 'erp_orders', v_erp, 'unify: ' || r.cluster_key
      FROM unify_clusters u JOIN public.erp_orders e ON e.id = v_erp WHERE u.cluster_key = r.cluster_key
    ON CONFLICT (tenant_id, legacy_table, legacy_id) DO NOTHING;
    -- storefront item ids on canonical lines (lets returns/reviews resolve back to the line)
    UPDATE public.erp_order_lines l SET storefront_order_item_id = i.id
      FROM public.order_items i JOIN unify_clusters u ON u.tbl = 'orders' AND u.id = i.order_id::text AND u.cluster_key = r.cluster_key
     WHERE l.order_id = v_erp AND l.storefront_order_item_id IS NULL AND l.sku_id = i.product_variant_id
       AND NOT EXISTS (SELECT 1 FROM public.erp_order_lines z WHERE z.storefront_order_item_id = i.id);
    SELECT eo.order_number INTO order_number FROM public.erp_orders eo WHERE eo.id = v_erp;
    cluster_key := r.cluster_key; sources := r.srcs; erp_order_id := v_erp;
    PERFORM unify.log('orders', r.cluster_key, verdict, v_erp::text);
    RETURN NEXT;
  END LOOP;
END $$;

-- run by pg_cron (see 07) for orders the old storefront code still writes
CREATE OR REPLACE FUNCTION unify.reconcile() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE n_orders int; n_cust int;
BEGIN
  SELECT count(*) INTO n_cust FROM unify.unify_customers();
  SELECT count(*) INTO n_orders FROM unify.unify_orders(unify.setting('reconcile_min_age')::interval);
  RETURN jsonb_build_object('customers', n_cust, 'orders', n_orders, 'at', now());
END $$;
REVOKE ALL ON FUNCTION unify.reconcile() FROM PUBLIC;

SELECT * FROM unify.unify_orders();
COMMIT;

-- canonical step ledger
SELECT unify.done('220');
