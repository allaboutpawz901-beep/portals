-- CANONICAL STEP 210  |  file S210_unify_customers.sql  |  was unify/01_customers.sql  |  internal log label '01' (unchanged)
-- =====================================================================
-- S210_unify_customers.sql — every customer record gets exactly one crm_customers
-- row (the canonical customer) on one platform_parties party.
--
--  * acct_customers stays: it is the AR/tax profile (AR account, terms,
--    credit limit, tax_exempt) that invoicing and tax code read. It is
--    linked 1:1 to its CRM twin via platform_customer_identity_links.
--  * customers / order_customers / ecommerce buyers with only an email
--    get a CRM customer by email.
-- Idempotent: re-running links nothing twice and creates nothing twice.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 210 (internal label '01'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S210_unify_customers.sql is step 210; run S200_unify_preflight.sql and every step up to 200 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('210');
END $guard$;
BEGIN;

-- find-or-create a CRM customer for an email (used by orders too)
CREATE OR REPLACE FUNCTION unify.crm_for_email(p_tenant uuid, p_email text, p_name text DEFAULT NULL, p_phone text DEFAULT NULL,
                                               p_source text DEFAULT NULL, p_create boolean DEFAULT true) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v uuid; e text := lower(nullif(btrim(p_email), '')); n text := nullif(btrim(p_name), '');
BEGIN
  IF p_tenant IS NULL OR (e IS NULL AND n IS NULL) THEN RETURN NULL; END IF;
  IF e IS NOT NULL THEN
    SELECT coalesce(c.merged_into_customer_id, c.id) INTO v FROM public.crm_customers c
     WHERE c.tenant_id = p_tenant AND lower(btrim(c.email)) = e ORDER BY c.merged_into_customer_id NULLS FIRST, c.created_at LIMIT 1;
    IF v IS NOT NULL THEN RETURN v; END IF;
  END IF;
  IF NOT p_create OR e IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.crm_customers(tenant_id, source_customer_id, customer_type, lifecycle_stage, lifecycle_status,
                                   first_name, last_name, email, phone, country, customer_since, is_active, transactional_email_opt_in)
  VALUES (p_tenant, p_source, 'individual', 'customer', 'active',
          coalesce(split_part(n, ' ', 1), split_part(e, '@', 1)),
          CASE WHEN position(' ' IN coalesce(n, '')) > 0 THEN substr(n, position(' ' IN n) + 1) END,
          e, nullif(btrim(p_phone), ''), 'US', current_date, true, true)
  RETURNING id INTO v;
  PERFORM unify.log('customers', v::text, 'created_crm_from_email', coalesce(p_source, e));
  RETURN v;
END $$;

-- give one acct_customers row its CRM twin
CREATE OR REPLACE FUNCTION unify.ensure_crm_for_acct(p_acct uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE a public.acct_customers%ROWTYPE; v unify.v_acct_customers%ROWTYPE; v_crm uuid; v_crm_party uuid;
        v_action text; v_biz boolean;
BEGIN
  SELECT * INTO a FROM public.acct_customers WHERE id = p_acct;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  SELECT * INTO v FROM unify.v_acct_customers WHERE id = p_acct;
  v_crm := v.crm_id;

  IF v_crm IS NULL THEN
    v_biz := a.legal_name ~* '\m(llc|l\.l\.c\.?|inc|incorporated|corp|corporation|co|company|ltd|limited|lp|llp|pllc|group|holdings|partners|studio|shop|store|church|school|association|foundation)\M\.?';
    INSERT INTO public.crm_customers(tenant_id, party_id, source_customer_id, external_customer_number, customer_type, lifecycle_stage, lifecycle_status,
                                     first_name, last_name, company_name, email, phone, country, customer_since, is_active, transactional_email_opt_in)
    VALUES (a.tenant_id, a.party_id, 'acct_customers:' || a.id, a.customer_number, CASE WHEN v_biz THEN 'business' ELSE 'individual' END,
            'customer', CASE WHEN coalesce(a.is_active, true) THEN 'active' ELSE 'inactive' END,
            CASE WHEN NOT v_biz THEN split_part(a.legal_name, ' ', 1) END,
            CASE WHEN NOT v_biz AND position(' ' IN a.legal_name) > 0 THEN substr(a.legal_name, position(' ' IN a.legal_name) + 1) END,
            CASE WHEN v_biz THEN a.legal_name END,
            lower(nullif(btrim(a.email), '')), a.phone, 'US', a.created_at::date, coalesce(a.is_active, true), true)
    RETURNING id INTO v_crm;
    v_action := 'moved: created crm_customers ' || v_crm;
  ELSE
    v_action := 'represented: ' || v.match_method || ' -> ' || v_crm;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_customer_identity_links WHERE acct_customer_id = a.id) THEN
    IF EXISTS (SELECT 1 FROM public.platform_customer_identity_links WHERE crm_customer_id = v_crm) THEN
      v_action := v_action || ' (second AR profile for the same customer; recorded in acct_legacy_map)';
    ELSE
      INSERT INTO public.platform_customer_identity_links(tenant_id, crm_customer_id, acct_customer_id) VALUES (a.tenant_id, v_crm, a.id);
    END IF;
  END IF;
  INSERT INTO public.acct_legacy_map(tenant_id, legacy_table, legacy_id, new_table, new_id, note)
  VALUES (a.tenant_id, 'acct_customers', a.id::text, 'crm_customers', v_crm, 'unify: AR profile twin')
  ON CONFLICT (tenant_id, legacy_table, legacy_id) DO NOTHING;

  -- tax code looks up exemption by acct_customers.id = crm id OR external_customer_id = crm id
  IF a.external_customer_id IS NULL THEN
    UPDATE public.acct_customers SET external_customer_id = v_crm::text WHERE id = a.id;
  END IF;

  -- one party for both records
  SELECT party_id INTO v_crm_party FROM public.crm_customers WHERE id = v_crm;
  IF a.party_id IS NULL AND v_crm_party IS NOT NULL THEN
    UPDATE public.acct_customers SET party_id = v_crm_party WHERE id = a.id;
  ELSIF v_crm_party IS NULL AND a.party_id IS NOT NULL THEN
    UPDATE public.crm_customers SET party_id = a.party_id WHERE id = v_crm;
  ELSIF a.party_id IS DISTINCT FROM v_crm_party THEN
    BEGIN
      PERFORM public.platform_party_merge(a.party_id, v_crm_party);
      v_action := v_action || '; parties merged';
    EXCEPTION WHEN others THEN
      PERFORM unify.log('customers', a.id::text, 'party_merge_failed', SQLERRM);
    END;
  END IF;
  PERFORM unify.log('customers', a.id::text, 'acct_customer', v_action);
  RETURN v_action;
END $$;

CREATE OR REPLACE FUNCTION unify.unify_customers() RETURNS TABLE(acct_customer_id uuid, customer_number text, result text)
LANGUAGE plpgsql AS $$
DECLARE r record; t uuid;
BEGIN
  FOR r IN SELECT a.id, a.customer_number FROM public.acct_customers a
            WHERE NOT EXISTS (SELECT 1 FROM public.acct_legacy_map m WHERE m.tenant_id = a.tenant_id AND m.legacy_table = 'acct_customers' AND m.legacy_id = a.id::text)
               OR NOT EXISTS (SELECT 1 FROM public.platform_customer_identity_links l WHERE l.acct_customer_id = a.id)
            ORDER BY a.created_at LOOP
    acct_customer_id := r.id; customer_number := r.customer_number; result := unify.ensure_crm_for_acct(r.id); RETURN NEXT;
  END LOOP;

  -- legacy `customers` (text ids) — normally empty
  IF to_regclass('public.customers') IS NOT NULL THEN
    FOR r IN EXECUTE $q$ SELECT c.id::text id, c.tenant_id, to_jsonb(c) j FROM public.customers c
             WHERE NOT EXISTS (SELECT 1 FROM public.acct_legacy_map m WHERE m.tenant_id = c.tenant_id AND m.legacy_table='customers' AND m.legacy_id = c.id::text) $q$ LOOP
      t := unify.crm_for_email(r.tenant_id, coalesce(r.j->>'email', r.j->>'customer_email'),
                               coalesce(r.j->>'name', concat_ws(' ', r.j->>'first_name', r.j->>'last_name'), r.j->>'company'), r.j->>'phone', 'customers:' || r.id);
      IF t IS NOT NULL THEN
        INSERT INTO public.acct_legacy_map(tenant_id, legacy_table, legacy_id, new_table, new_id, note)
        VALUES (r.tenant_id, 'customers', r.id, 'crm_customers', t, 'unify') ON CONFLICT DO NOTHING;
      END IF;
      acct_customer_id := NULL; customer_number := 'customers:' || r.id; result := coalesce('crm ' || t, 'no email/name: left in legacy table'); RETURN NEXT;
    END LOOP;
  END IF;

  -- storefront buyers known only by email on ecommerce_orders
  UPDATE public.ecommerce_orders e SET crm_customer_id = unify.crm_for_email(e.tenant_id, e.customer_email, e.customer_name, e.customer_phone, 'ecommerce_orders:' || e.id)
   WHERE e.crm_customer_id IS NULL AND nullif(btrim(e.customer_email), '') IS NOT NULL;
END $$;

-- Future acct_customers rows (convert_sales_order_to_invoice creates them) get their CRM twin automatically.
CREATE OR REPLACE FUNCTION unify.acct_customer_twin_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
BEGIN
  BEGIN PERFORM unify.ensure_crm_for_acct(NEW.id);
  EXCEPTION WHEN others THEN PERFORM unify.log('customers', NEW.id::text, 'twin_trigger_failed', SQLERRM); END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS unify_acct_customer_twin ON public.acct_customers;
CREATE CONSTRAINT TRIGGER unify_acct_customer_twin AFTER INSERT ON public.acct_customers
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION unify.acct_customer_twin_trg();

SELECT * FROM unify.unify_customers();
COMMIT;

-- canonical step ledger
SELECT unify.done('210');
