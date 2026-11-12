-- CANONICAL STEP 310  |  file S310_agnostic_core.sql  |  was unify/06c_agnostic_core.sql  |  internal log label '06c' (unchanged)
-- =====================================================================
-- S310_agnostic_core.sql — one core that fits every client type.
--
-- Principle: a vertical is CONFIGURATION, not schema. Every client gets the
-- same tables; an industry pack (06d) only adds picklist values, record
-- types, custom fields, pipelines, terminology and compliance rules.
--
-- This file fills the gaps in the 36 agnostic domains:
--   A. De-verticalize   grooming-only CHECK lists become tenant picklists
--   B. Custom fields    typed values + validation (definitions existed,
--                       there was nowhere to store a value)
--   C. Tracked records  crm_dependents becomes the generic "record the work
--                       is about": vehicle (VIN), property (MLS), policy,
--                       patient, student, pet, equipment. Typed identifier,
--                       status history, events (service visits, claims,
--                       enrollment changes), several parties per record.
--   D. Deals            pipelines, stages, deals, stage history, lead
--                       conversion, quote -> won, pipeline/sales views
--   E. Lead scoring     rules -> score + hot/warm/cold
--   F. Webforms         public forms -> leads / tickets (instant capture)
--   G. Calls            click-to-call log + dial request to the provider
--   H. Email sync       mailboxes, threads, messages, auto-link to contacts
--   I. Sequences        multi-step email/task cadences, stop on reply
--   J. Calendar         calendars, events, attendees, one agenda view
--   K. Routes           daily route with ordered stops
--   L. Sensitive data   data classes (phi/pii/pci) + access log; a
--                       deployment profile that says whether this database
--                       may hold PHI at all
-- Idempotent; RLS on everything; FKs on every *_id.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 310 (internal label '06c'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S310_agnostic_core.sql is step 310; run S200_unify_preflight.sql and every step up to 300 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('310');
END $guard$;
BEGIN;

-- =====================================================================
-- L0. deployment profile (one row): what this database is allowed to hold
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.platform_deployment_profile (
  id            boolean PRIMARY KEY DEFAULT true CHECK (id),
  code          text NOT NULL DEFAULT 'shared',
  compliance    text[] NOT NULL DEFAULT '{}',      -- e.g. {hipaa}; set ONLY on a Supabase HIPAA (High Compliance) project with a BAA
  region        text,
  notes         text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_deployment_profile
  ADD COLUMN IF NOT EXISTS baa_signed_at date,                                          -- Supabase BAA date (HIPAA deployments)
  ADD COLUMN IF NOT EXISTS attested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL; -- who confirmed the project settings
INSERT INTO public.platform_deployment_profile(id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.platform_deployment_allows(p_compliance text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT coalesce((SELECT p_compliance = ANY (compliance) FROM public.platform_deployment_profile), false) $$;

-- =====================================================================
-- A. picklists replace industry CHECK lists
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.platform_picklist_values (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid REFERENCES public.tenants(id) ON DELETE CASCADE,   -- NULL = available to every tenant
  list_code  text NOT NULL,
  value      text NOT NULL,
  label      text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  pack_code  text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_picklist_values_uq
  ON public.platform_picklist_values(coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), list_code, value);

CREATE OR REPLACE FUNCTION public.platform_picklist_ok(p_tenant uuid, p_list text, p_value text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT p_value IS NULL OR EXISTS (SELECT 1 FROM public.platform_picklist_values v
           WHERE v.list_code = p_list AND v.value = p_value AND v.is_active
             AND (v.tenant_id IS NULL OR v.tenant_id = p_tenant)) $$;

-- generic guard: TG_ARGV[0] = column, TG_ARGV[1] = list code
CREATE OR REPLACE FUNCTION public.platform__picklist_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE j jsonb := to_jsonb(NEW); v text := j ->> TG_ARGV[0]; t uuid := nullif(j ->> 'tenant_id', '')::uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND v IS NOT DISTINCT FROM (to_jsonb(OLD) ->> TG_ARGV[0]) THEN RETURN NEW; END IF;
  IF NOT public.platform_picklist_ok(t, TG_ARGV[1], v) THEN
    RAISE EXCEPTION '%.% = % is not an allowed value; add it under Settings > Picklists (list %)',
      TG_TABLE_NAME, TG_ARGV[0], v, TG_ARGV[1] USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- seed: generic values for everyone; vertical values tagged with their pack
INSERT INTO public.platform_picklist_values(tenant_id, list_code, value, label, sort_order, pack_code)
SELECT NULL, l, v, initcap(replace(v, '_', ' ')), o, p FROM (VALUES
  ('service_category','consultation',10,NULL),('service_category','standard',20,NULL),('service_category','premium',30,NULL),
  ('service_category','repair',40,NULL),('service_category','maintenance',50,NULL),('service_category','inspection',60,NULL),
  ('service_category','installation',70,NULL),('service_category','class',80,NULL),('service_category','a_la_carte',90,NULL),
  ('service_category','add_on',100,NULL),('service_category','package',110,NULL),('service_category','other',999,NULL),
  ('service_category','full_groom',200,'pet_grooming'),('service_category','bath_and_brush',210,'pet_grooming'),
  ('surcharge_type','weekend',10,NULL),('surcharge_type','holiday',20,NULL),('surcharge_type','late_pickup',30,NULL),
  ('surcharge_type','no_show',40,NULL),('surcharge_type','express',50,NULL),('surcharge_type','special_handling',60,NULL),
  ('surcharge_type','travel',70,NULL),('surcharge_type','after_hours',80,NULL),('surcharge_type','other',999,NULL),
  ('surcharge_type','severe_matting',200,'pet_grooming'),('surcharge_type','senior_pet',210,'pet_grooming'),
  ('surcharge_type','aggressive_pet',220,'pet_grooming'),('surcharge_type','de_shedding',230,'pet_grooming'),
  ('surcharge_type','flea_treatment',240,'pet_grooming'),
  ('refund_reason','service_issue',10,NULL),('refund_reason','cancellation',20,NULL),('refund_reason','no_show_waived',30,NULL),
  ('refund_reason','duplicate_charge',40,NULL),('refund_reason','pricing_error',50,NULL),('refund_reason','customer_dissatisfaction',60,NULL),
  ('refund_reason','damaged',70,NULL),('refund_reason','not_as_described',80,NULL),('refund_reason','fraud',90,NULL),('refund_reason','other',999,NULL),
  ('refund_reason','pet_health',200,'pet_grooming'),
  ('duplicate_entity','customer',10,NULL),('duplicate_entity','household',20,NULL),('duplicate_entity','record',30,NULL),
  ('duplicate_entity','lead',40,NULL),('duplicate_entity','pet',200,'pet_grooming'),
  ('onboarding_type','individual_seller',10,NULL),('onboarding_type','business_seller',20,NULL),('onboarding_type','manufacturer',30,NULL),
  ('onboarding_type','franchise',40,NULL),('onboarding_type','service_provider',50,NULL),('onboarding_type','groomer',200,'pet_grooming'),
  ('onboarding_type','pharmacy',210,'healthcare'),('onboarding_type','veterinarian',220,'pet_grooming'),
  ('onboarding_type','healthcare_provider',230,'healthcare'),('onboarding_type','dealership',240,'auto_dealer'),
  ('onboarding_type','brokerage',250,'real_estate'),('onboarding_type','agency',260,'financial_services'),('onboarding_type','school',270,'edtech'),
  ('dependent_type','person',10,NULL),('dependent_type','child',20,NULL),('dependent_type','equipment',30,NULL),
  ('dependent_type','property',40,NULL),('dependent_type','vehicle',50,NULL),('dependent_type','other',999,NULL),
  ('dependent_type','pet',200,'pet_grooming'),('dependent_type','patient',210,'healthcare'),('dependent_type','policy',220,'financial_services'),
  ('dependent_type','student',230,'edtech')
) s(l, v, o, p)
ON CONFLICT DO NOTHING;
-- vertical values start inactive globally; 06d activates them per tenant when the pack is applied.
-- Exception: a vertical value already used by existing rows stays globally active, so live data keeps working.
-- runs once (marker in unify.settings); later runs leave admins' choices alone
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM unify.settings WHERE key = '06c.vertical_picklists_scoped') THEN RETURN; END IF;
  UPDATE public.platform_picklist_values pv SET is_active = false
   WHERE pv.tenant_id IS NULL AND pv.pack_code IS NOT NULL AND pv.is_active
     AND NOT EXISTS (SELECT 1 FROM public.crm_services x WHERE pv.list_code = 'service_category' AND x.service_category = pv.value)
     AND NOT EXISTS (SELECT 1 FROM public.crm_surcharges x WHERE pv.list_code = 'surcharge_type' AND x.surcharge_type = pv.value)
     AND NOT EXISTS (SELECT 1 FROM public.commerce_refunds x WHERE pv.list_code = 'refund_reason' AND x.reason_code = pv.value)
     AND NOT EXISTS (SELECT 1 FROM public.crm_duplicate_candidates x WHERE pv.list_code = 'duplicate_entity' AND x.entity_type = pv.value)
     AND NOT EXISTS (SELECT 1 FROM public.onboarding_cases x WHERE pv.list_code = 'onboarding_type' AND x.type = pv.value)
     AND NOT EXISTS (SELECT 1 FROM public.crm_dependents x WHERE pv.list_code = 'dependent_type' AND x.dependent_type = pv.value);
  INSERT INTO unify.settings(key, value, note) VALUES ('06c.vertical_picklists_scoped', now()::text, 'vertical picklist values scoped to packs');
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('crm_services','service_category','service_category','crm_services_service_category_check'),
      ('crm_surcharges','surcharge_type','surcharge_type','crm_surcharges_surcharge_type_check'),
      ('commerce_refunds','reason_code','refund_reason','commerce_refunds_reason_code_check'),
      ('crm_duplicate_candidates','entity_type','duplicate_entity','crm_duplicate_candidates_entity_type_check'),
      ('onboarding_cases','type','onboarding_type','onboarding_cases_type_check'),
      ('crm_dependents','dependent_type','dependent_type','crm_dependents_dependent_type_check')) v(tbl, col, list, con) LOOP
    IF to_regclass('public.' || r.tbl) IS NULL THEN CONTINUE; END IF;
    -- values in live data that the seed doesn't know yet become global values, so nothing breaks
    EXECUTE format($f$INSERT INTO public.platform_picklist_values(tenant_id, list_code, value, label, sort_order)
                      SELECT DISTINCT NULL::uuid, %L, x.%I, initcap(replace(x.%I, '_', ' ')), 500 FROM public.%I x WHERE x.%I IS NOT NULL
                      ON CONFLICT DO NOTHING$f$, r.list, r.col, r.col, r.tbl, r.col);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.con);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_picklist_%s ON public.%I', r.col, r.tbl);
    EXECUTE format('CREATE TRIGGER trg_picklist_%s BEFORE INSERT OR UPDATE OF %I ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform__picklist_guard(%L, %L)',
                   r.col, r.col, r.tbl, r.col, r.list);
    PERFORM unify.log('06c', r.tbl || '.' || r.col, 'check_to_picklist', r.list);
  END LOOP;
END $$;

-- terminology: what this tenant calls things (Customer -> Patient, Appointment -> Visit)
CREATE TABLE IF NOT EXISTS public.platform_terminology (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  term_key   text NOT NULL,          -- customer, dependent, appointment, staff, deal, order, service, location
  singular   text NOT NULL,
  plural     text NOT NULL,
  pack_code  text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, term_key)
);

-- =====================================================================
-- B. custom field values
-- =====================================================================
ALTER TABLE public.platform_custom_fields ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'normal';
ALTER TABLE public.platform_custom_fields ADD COLUMN IF NOT EXISTS validation_pattern text;
ALTER TABLE public.platform_custom_fields ADD COLUMN IF NOT EXISTS validator text;      -- vin | npi | email | phone | url
ALTER TABLE public.platform_custom_fields ADD COLUMN IF NOT EXISTS is_unique boolean NOT NULL DEFAULT false;
ALTER TABLE public.platform_custom_fields ADD COLUMN IF NOT EXISTS record_type_code text;  -- only for crm_dependents of this type
ALTER TABLE public.platform_custom_fields ADD COLUMN IF NOT EXISTS help_text text;
ALTER TABLE public.platform_custom_fields ADD COLUMN IF NOT EXISTS pack_code text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_custom_fields_sensitivity_chk') THEN
    ALTER TABLE public.platform_custom_fields ADD CONSTRAINT platform_custom_fields_sensitivity_chk
      CHECK (sensitivity IN ('normal','pii','phi','pci','financial','secret'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_custom_fields_type_chk') THEN
    ALTER TABLE public.platform_custom_fields ADD CONSTRAINT platform_custom_fields_type_chk
      CHECK (field_type IN ('text','long_text','number','currency','percent','date','datetime','boolean','select','multi_select',
                            'email','phone','url','user','record','json')) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_custom_field_values (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  field_id     uuid NOT NULL REFERENCES public.platform_custom_fields(id) ON DELETE CASCADE,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  value_text   text,
  value_number numeric,
  value_date   date,
  value_ts     timestamptz,
  value_bool   boolean,
  value_json   jsonb,
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (field_id, entity_id)
);
CREATE INDEX IF NOT EXISTS platform_cfv_entity_idx ON public.platform_custom_field_values(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS platform_cfv_text_idx ON public.platform_custom_field_values(field_id, value_text);

-- VIN (ISO 3779 check digit, North America) and NPI (Luhn with 80840 prefix)
CREATE OR REPLACE FUNCTION public.platform_validate_identifier(p_validator text, p_value text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text := upper(regexp_replace(coalesce(p_value, ''), '[\s-]', '', 'g')); s int := 0; i int; c text; n int; d int;
        w int[] := ARRAY[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
BEGIN
  IF p_value IS NULL OR p_validator IS NULL THEN RETURN true; END IF;
  CASE p_validator
  WHEN 'vin' THEN
    IF v !~ '^[A-HJ-NPR-Z0-9]{17}$' THEN RETURN false; END IF;
    FOR i IN 1..17 LOOP
      c := substr(v, i, 1);
      n := CASE WHEN c ~ '[0-9]' THEN c::int
                ELSE (ARRAY[1,2,3,4,5,6,7,8,0,1,2,3,4,5,0,7,0,9,2,3,4,5,6,7,8,9])[ascii(c) - 64] END;
      s := s + n * w[i];
    END LOOP;
    RETURN substr(v, 9, 1) = CASE WHEN s % 11 = 10 THEN 'X' ELSE (s % 11)::text END;
  WHEN 'npi' THEN
    IF v !~ '^[0-9]{10}$' THEN RETURN false; END IF;
    v := '80840' || v; s := 0;
    FOR i IN 1..length(v) LOOP
      d := substr(v, length(v) - i + 1, 1)::int;
      IF i % 2 = 0 THEN d := d * 2; IF d > 9 THEN d := d - 9; END IF; END IF;
      s := s + d;
    END LOOP;
    RETURN s % 10 = 0;
  WHEN 'email' THEN RETURN p_value ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  WHEN 'phone' THEN RETURN regexp_replace(p_value, '[^0-9]', '', 'g') ~ '^[0-9]{7,15}$';
  WHEN 'url'   THEN RETURN p_value ~* '^https?://';
  ELSE RETURN true;
  END CASE;
END $$;

CREATE OR REPLACE FUNCTION public.platform__cfv_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE f record;
BEGIN
  SELECT * INTO f FROM public.platform_custom_fields WHERE id = NEW.field_id;
  IF f.tenant_id IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'custom field belongs to another workspace'; END IF;
  IF f.entity_type <> NEW.entity_type THEN RAISE EXCEPTION 'field % is for %, not %', f.field_key, f.entity_type, NEW.entity_type; END IF;
  IF f.sensitivity = 'phi' AND NOT public.platform_deployment_allows('hipaa') THEN
    RAISE EXCEPTION 'field % holds PHI; this database is not a HIPAA deployment', f.field_key;
  END IF;
  IF f.field_type IN ('select') AND NEW.value_text IS NOT NULL AND jsonb_typeof(f.options) = 'array' AND jsonb_array_length(f.options) > 0
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(f.options) o WHERE coalesce(o ->> 'value', o #>> '{}') = NEW.value_text) THEN
    RAISE EXCEPTION '% is not an option of %', NEW.value_text, f.field_key USING ERRCODE = 'check_violation';
  END IF;
  IF f.validation_pattern IS NOT NULL AND NEW.value_text IS NOT NULL AND NEW.value_text !~ f.validation_pattern THEN
    RAISE EXCEPTION '% does not match the format for %', NEW.value_text, f.label USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.platform_validate_identifier(f.validator, NEW.value_text) THEN
    RAISE EXCEPTION '% is not a valid %', NEW.value_text, upper(f.validator) USING ERRCODE = 'check_violation';
  END IF;
  IF f.is_unique AND NEW.value_text IS NOT NULL AND EXISTS (SELECT 1 FROM public.platform_custom_field_values x
       WHERE x.field_id = NEW.field_id AND lower(x.value_text) = lower(NEW.value_text) AND x.id <> NEW.id) THEN
    RAISE EXCEPTION '% % already exists', f.label, NEW.value_text USING ERRCODE = 'unique_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_platform_cfv_guard ON public.platform_custom_field_values;
CREATE TRIGGER trg_platform_cfv_guard BEFORE INSERT OR UPDATE ON public.platform_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.platform__cfv_guard();

CREATE OR REPLACE FUNCTION public.platform__cf_phi_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sensitivity = 'phi' AND NOT public.platform_deployment_allows('hipaa') THEN
    RAISE EXCEPTION 'PHI fields can only be created on a HIPAA deployment (see platform_deployment_profile)';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_platform_cf_phi_guard ON public.platform_custom_fields;
CREATE TRIGGER trg_platform_cf_phi_guard BEFORE INSERT OR UPDATE OF sensitivity ON public.platform_custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.platform__cf_phi_guard();

-- read/write custom fields as one JSON object per record
CREATE OR REPLACE FUNCTION public.platform_get_custom_fields(p_entity_type text, p_entity_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_catalog AS $$
  SELECT coalesce(jsonb_object_agg(f.field_key, coalesce(to_jsonb(v.value_text), to_jsonb(v.value_number), to_jsonb(v.value_date),
                                                         to_jsonb(v.value_ts), to_jsonb(v.value_bool), v.value_json)), '{}'::jsonb)
    FROM public.platform_custom_field_values v JOIN public.platform_custom_fields f ON f.id = v.field_id
   WHERE v.entity_type = p_entity_type AND v.entity_id = p_entity_id $$;

CREATE OR REPLACE FUNCTION public.platform_set_custom_fields(p_tenant uuid, p_entity_type text, p_entity_id uuid, p_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE k text; val jsonb; f record;
BEGIN
  IF NOT public.platform_is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'not a member of this workspace'; END IF;
  FOR k, val IN SELECT * FROM jsonb_each(p_values) LOOP
    SELECT * INTO f FROM public.platform_custom_fields WHERE tenant_id = p_tenant AND entity_type = p_entity_type AND field_key = k AND is_active;
    IF f.id IS NULL THEN RAISE EXCEPTION 'unknown custom field % on %', k, p_entity_type; END IF;
    IF val IS NULL OR val = 'null'::jsonb THEN
      DELETE FROM public.platform_custom_field_values WHERE field_id = f.id AND entity_id = p_entity_id; CONTINUE;
    END IF;
    INSERT INTO public.platform_custom_field_values(tenant_id, field_id, entity_type, entity_id, value_text, value_number, value_date, value_ts, value_bool, value_json, updated_by)
    VALUES (p_tenant, f.id, p_entity_type, p_entity_id,
            CASE WHEN f.field_type IN ('text','long_text','select','email','phone','url','user','record') THEN val #>> '{}' END,
            CASE WHEN f.field_type IN ('number','currency','percent') THEN (val #>> '{}')::numeric END,
            CASE WHEN f.field_type = 'date' THEN (val #>> '{}')::date END,
            CASE WHEN f.field_type = 'datetime' THEN (val #>> '{}')::timestamptz END,
            CASE WHEN f.field_type = 'boolean' THEN (val #>> '{}')::boolean END,
            CASE WHEN f.field_type IN ('multi_select','json') THEN val END, auth.uid())
    ON CONFLICT (field_id, entity_id) DO UPDATE SET value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number,
       value_date = EXCLUDED.value_date, value_ts = EXCLUDED.value_ts, value_bool = EXCLUDED.value_bool, value_json = EXCLUDED.value_json,
       updated_by = auth.uid();
  END LOOP;
  RETURN public.platform_get_custom_fields(p_entity_type, p_entity_id);
END $$;

-- =====================================================================
-- C. tracked records (crm_dependents generalized)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.crm_record_types (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code               text NOT NULL,              -- vehicle, property, policy, patient, student, pet, equipment
  label              text NOT NULL,
  plural_label       text NOT NULL,
  dependent_type     text NOT NULL DEFAULT 'other',
  identifier_label   text,                       -- VIN, MLS #, Policy #, MRN, Student ID
  identifier_pattern text,
  identifier_validator text,                     -- vin | npi | ...
  identifier_required boolean NOT NULL DEFAULT false,
  statuses           text[] NOT NULL DEFAULT ARRAY['active','inactive'],
  default_status     text NOT NULL DEFAULT 'active',
  party_roles        text[] NOT NULL DEFAULT ARRAY['owner'],
  event_types        text[] NOT NULL DEFAULT ARRAY['note'],
  sensitivity        text NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal','pii','phi','financial')),
  pack_code          text,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

ALTER TABLE public.crm_dependents ADD COLUMN IF NOT EXISTS record_type_id uuid;
ALTER TABLE public.crm_dependents ADD COLUMN IF NOT EXISTS identifier text;
ALTER TABLE public.crm_dependents ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.crm_dependents ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE public.crm_dependents ADD COLUMN IF NOT EXISTS owner_staff_id uuid;
ALTER TABLE public.crm_dependents ADD COLUMN IF NOT EXISTS address jsonb;
ALTER TABLE public.crm_dependents ADD COLUMN IF NOT EXISTS identifier_normalized text
  GENERATED ALWAYS AS (upper(regexp_replace(identifier, '[\s-]', '', 'g'))) STORED;
SELECT public.platform__ensure_fk('crm_dependents', 'record_type_id', 'crm_record_types', 'id', 'RESTRICT', 'unify 06c');
SELECT public.platform__ensure_fk('crm_dependents', 'owner_staff_id', 'crm_staff', 'id', 'SET NULL', 'unify 06c');
CREATE UNIQUE INDEX IF NOT EXISTS crm_dependents_identifier_uq
  ON public.crm_dependents(tenant_id, record_type_id, identifier_normalized) WHERE identifier IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_record_parties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dependent_id uuid NOT NULL REFERENCES public.crm_dependents(id) ON DELETE CASCADE,
  customer_id  uuid NOT NULL REFERENCES public.crm_customers(id) ON DELETE CASCADE,
  role         text NOT NULL,            -- owner, co_buyer, policyholder, insured, beneficiary, seller, buyer, guardian, patient
  is_primary   boolean NOT NULL DEFAULT false,
  starts_on    date,
  ends_on      date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dependent_id, customer_id, role)
);

CREATE TABLE IF NOT EXISTS public.crm_record_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dependent_id     uuid NOT NULL REFERENCES public.crm_dependents(id) ON DELETE CASCADE,
  event_type       text NOT NULL,        -- status_change, service_visit, claim_filed, claim_paid, enrollment, showing, recall ...
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  reference_number text,                 -- claim #, RO #, enrollment term
  status_from      text,
  status_to        text,
  amount           numeric(14,2),
  appointment_id   uuid REFERENCES public.crm_appointments(id) ON DELETE SET NULL,
  order_id         uuid REFERENCES public.erp_orders(id) ON DELETE SET NULL,
  document_id      uuid REFERENCES public.crm_documents(id) ON DELETE SET NULL,
  staff_id         uuid REFERENCES public.crm_staff(id) ON DELETE SET NULL,
  details          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_record_events_dep_idx ON public.crm_record_events(dependent_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.crm__record_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE rt record;
BEGIN
  IF NEW.record_type_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO rt FROM public.crm_record_types WHERE id = NEW.record_type_id;
  IF rt.tenant_id <> NEW.tenant_id THEN RAISE EXCEPTION 'record type belongs to another workspace'; END IF;
  IF rt.sensitivity = 'phi' AND NOT public.platform_deployment_allows('hipaa') THEN
    RAISE EXCEPTION '% records hold PHI; this database is not a HIPAA deployment', rt.label;
  END IF;
  NEW.dependent_type := rt.dependent_type;          -- the record type decides (column default is 'person')
  NEW.status := coalesce(NEW.status, rt.default_status);
  IF NOT NEW.status = ANY (rt.statuses) THEN
    RAISE EXCEPTION '% is not a % status (allowed: %)', NEW.status, rt.label, array_to_string(rt.statuses, ', ') USING ERRCODE = 'check_violation';
  END IF;
  IF rt.identifier_required AND NEW.identifier IS NULL THEN RAISE EXCEPTION '% is required', coalesce(rt.identifier_label, 'Identifier'); END IF;
  IF NEW.identifier IS NOT NULL THEN
    IF rt.identifier_pattern IS NOT NULL AND NEW.identifier !~ rt.identifier_pattern THEN
      RAISE EXCEPTION '% does not look like a %', NEW.identifier, rt.identifier_label USING ERRCODE = 'check_violation';
    END IF;
    IF NOT public.platform_validate_identifier(rt.identifier_validator, NEW.identifier) THEN
      RAISE EXCEPTION '% is not a valid % (check digit failed)', NEW.identifier, rt.identifier_label USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN NEW.status_changed_at := now(); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_crm_record_guard ON public.crm_dependents;
CREATE TRIGGER trg_crm_record_guard BEFORE INSERT OR UPDATE OF record_type_id, status, identifier ON public.crm_dependents
  FOR EACH ROW EXECUTE FUNCTION public.crm__record_guard();

CREATE OR REPLACE FUNCTION public.crm__record_status_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.record_type_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.crm_record_events(tenant_id, dependent_id, event_type, status_from, status_to, created_by)
    VALUES (NEW.tenant_id, NEW.id, 'status_change', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status, auth.uid());
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_crm_record_status_history ON public.crm_dependents;
CREATE TRIGGER trg_crm_record_status_history AFTER INSERT OR UPDATE OF status ON public.crm_dependents
  FOR EACH ROW EXECUTE FUNCTION public.crm__record_status_history();

-- events must belong to the record's workspace and be an event type its record type allows
CREATE OR REPLACE FUNCTION public.crm__record_event_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE d record;
BEGIN
  SELECT x.tenant_id, rt.label, rt.event_types INTO d
    FROM public.crm_dependents x LEFT JOIN public.crm_record_types rt ON rt.id = x.record_type_id WHERE x.id = NEW.dependent_id;
  IF d.tenant_id IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'record belongs to another workspace'; END IF;
  IF d.event_types IS NOT NULL AND NEW.event_type NOT IN ('status_change','note') AND NOT NEW.event_type = ANY (d.event_types) THEN
    RAISE EXCEPTION '% is not a % event (allowed: %)', NEW.event_type, d.label, array_to_string(d.event_types, ', ') USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_crm_record_event_guard ON public.crm_record_events;
CREATE TRIGGER trg_crm_record_event_guard BEFORE INSERT OR UPDATE OF event_type, dependent_id, tenant_id ON public.crm_record_events
  FOR EACH ROW EXECUTE FUNCTION public.crm__record_event_guard();

-- =====================================================================
-- D. deals & pipelines
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  is_default  boolean NOT NULL DEFAULT false,
  currency    char(3) NOT NULL DEFAULT 'USD',
  pack_code   text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_pipelines_one_default ON public.crm_pipelines(tenant_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  integer NOT NULL,
  probability numeric(5,2) NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  stage_kind  text NOT NULL DEFAULT 'open' CHECK (stage_kind IN ('open','won','lost')),
  rotting_days integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, name)
);

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deal_number         text,
  name                text NOT NULL,
  pipeline_id         uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT,
  stage_id            uuid NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE RESTRICT,
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  customer_id         uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  lead_id             uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  dependent_id        uuid REFERENCES public.crm_dependents(id) ON DELETE SET NULL,
  owner_staff_id      uuid REFERENCES public.crm_staff(id) ON DELETE SET NULL,
  amount              numeric(14,2) NOT NULL DEFAULT 0,
  currency            char(3) NOT NULL DEFAULT 'USD',
  probability         numeric(5,2),
  expected_close_date date,
  source              text,
  lost_reason         text,
  won_at              timestamptz,
  lost_at             timestamptz,
  stage_entered_at    timestamptz NOT NULL DEFAULT now(),
  last_activity_at    timestamptz,
  estimate_id         uuid REFERENCES public.acct_estimates(id) ON DELETE SET NULL,
  order_id            uuid REFERENCES public.erp_orders(id) ON DELETE SET NULL,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, deal_number)
);
CREATE INDEX IF NOT EXISTS crm_deals_board_idx ON public.crm_deals(tenant_id, pipeline_id, stage_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.crm_deal_stage_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  deal_id       uuid NOT NULL REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id   uuid REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  amount        numeric(14,2),
  changed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at    timestamptz NOT NULL DEFAULT now(),
  days_in_from  numeric(10,2)
);

ALTER TABLE public.acct_estimates ADD COLUMN IF NOT EXISTS deal_id uuid;
SELECT public.platform__ensure_fk('acct_estimates', 'deal_id', 'crm_deals', 'id', 'SET NULL', 'unify 06c');
ALTER TABLE public.crm_activity ADD COLUMN IF NOT EXISTS deal_id uuid;
SELECT public.platform__ensure_fk('crm_activity', 'deal_id', 'crm_deals', 'id', 'SET NULL', 'unify 06c');

CREATE OR REPLACE FUNCTION public.crm__deal_stage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE s record;
BEGIN
  SELECT * INTO s FROM public.crm_pipeline_stages WHERE id = NEW.stage_id;
  IF s.pipeline_id <> NEW.pipeline_id THEN RAISE EXCEPTION 'stage % is not in this pipeline', s.name; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.deal_number := coalesce(NEW.deal_number, 'D-' || lpad((SELECT count(*) + 1 FROM public.crm_deals d WHERE d.tenant_id = NEW.tenant_id)::text, 5, '0'));
    NEW.created_by := coalesce(NEW.created_by, auth.uid());
  END IF;
  IF TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.status := s.stage_kind;
    NEW.probability := CASE WHEN TG_OP = 'UPDATE' OR NEW.probability IS NULL THEN s.probability ELSE NEW.probability END;
    NEW.stage_entered_at := now();
    NEW.won_at := CASE WHEN s.stage_kind = 'won' THEN coalesce(NEW.won_at, now()) END;
    NEW.lost_at := CASE WHEN s.stage_kind = 'lost' THEN coalesce(NEW.lost_at, now()) END;
    IF s.stage_kind <> 'lost' THEN NEW.lost_reason := NULL; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_crm_deal_stage ON public.crm_deals;
CREATE TRIGGER trg_crm_deal_stage BEFORE INSERT OR UPDATE ON public.crm_deals FOR EACH ROW EXECUTE FUNCTION public.crm__deal_stage();

CREATE OR REPLACE FUNCTION public.crm__deal_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.crm_deal_stage_history(tenant_id, deal_id, from_stage_id, to_stage_id, amount, changed_by, days_in_from)
    VALUES (NEW.tenant_id, NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.stage_id END, NEW.stage_id, NEW.amount, auth.uid(),
            CASE WHEN TG_OP = 'UPDATE' THEN round(extract(epoch FROM now() - OLD.stage_entered_at) / 86400.0, 2) END);
    INSERT INTO public.crm_activity(tenant_id, customer_id, lead_id, deal_id, activity_type, channel, subject, occurred_at)
    VALUES (NEW.tenant_id, NEW.customer_id, NEW.lead_id, NEW.id, 'deal_stage', 'system',
            (SELECT 'Deal ' || NEW.name || ' -> ' || name FROM public.crm_pipeline_stages WHERE id = NEW.stage_id), now());
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_crm_deal_history ON public.crm_deals;
CREATE TRIGGER trg_crm_deal_history AFTER INSERT OR UPDATE OF stage_id ON public.crm_deals FOR EACH ROW EXECUTE FUNCTION public.crm__deal_history();

CREATE OR REPLACE FUNCTION public.crm_ensure_default_pipeline(p_tenant uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE p uuid;
BEGIN
  SELECT id INTO p FROM public.crm_pipelines WHERE tenant_id = p_tenant AND is_default;
  IF p IS NOT NULL THEN RETURN p; END IF;
  INSERT INTO public.crm_pipelines(tenant_id, name, is_default) VALUES (p_tenant, 'Sales', true)
  ON CONFLICT (tenant_id, name) DO UPDATE SET is_default = true RETURNING id INTO p;
  INSERT INTO public.crm_pipeline_stages(tenant_id, pipeline_id, name, sort_order, probability, stage_kind)
  SELECT p_tenant, p, n, o, pr, k FROM (VALUES ('New',10,10,'open'),('Qualified',20,25,'open'),('Proposal',30,50,'open'),
         ('Negotiation',40,75,'open'),('Won',90,100,'won'),('Lost',99,0,'lost')) v(n, o, pr, k)
  ON CONFLICT DO NOTHING;
  RETURN p;
END $$;

CREATE OR REPLACE FUNCTION public.crm_move_deal(p_deal uuid, p_stage uuid, p_lost_reason text DEFAULT NULL) RETURNS public.crm_deals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE d public.crm_deals; k text;
BEGIN
  SELECT * INTO d FROM public.crm_deals WHERE id = p_deal;
  IF d.id IS NULL OR NOT public.platform_is_tenant_member(d.tenant_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT stage_kind INTO k FROM public.crm_pipeline_stages WHERE id = p_stage;
  IF k = 'lost' AND coalesce(btrim(p_lost_reason), '') = '' THEN RAISE EXCEPTION 'a lost reason is required'; END IF;
  UPDATE public.crm_deals SET stage_id = p_stage, lost_reason = CASE WHEN k = 'lost' THEN p_lost_reason END WHERE id = p_deal RETURNING * INTO d;
  PERFORM public.platform_notify_followers(d.tenant_id, 'crm_deals', d.id, 'deal.stage', 'Deal ' || d.name || ' moved', NULL, '/deals/' || d.id);
  RETURN d;
END $$;

CREATE OR REPLACE FUNCTION public.crm_convert_lead(p_lead uuid, p_deal_name text DEFAULT NULL, p_amount numeric DEFAULT 0,
  p_pipeline uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE l record; v_cust uuid; v_pipe uuid; v_stage uuid; v_deal uuid;
BEGIN
  SELECT * INTO l FROM public.crm_leads WHERE id = p_lead FOR UPDATE;
  IF l.id IS NULL OR NOT public.platform_is_tenant_member(l.tenant_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_cust := l.customer_id;
  IF v_cust IS NULL AND l.email IS NOT NULL THEN
    SELECT id INTO v_cust FROM public.crm_customers WHERE tenant_id = l.tenant_id AND lower(email) = lower(l.email) LIMIT 1;
  END IF;
  IF v_cust IS NULL THEN
    INSERT INTO public.crm_customers(tenant_id, customer_type, lifecycle_status, country, first_name, last_name, email, phone, lifecycle_stage, first_contact_at)
    VALUES (l.tenant_id, 'individual', 'active', 'US', split_part(coalesce(l.contact_name, ''), ' ', 1), nullif(substr(coalesce(l.contact_name, ''), strpos(coalesce(l.contact_name, ''), ' ') + 1), ''),
            l.email, l.phone, 'customer', coalesce(l.first_contact_at, now()))
    RETURNING id INTO v_cust;
  END IF;
  v_pipe := coalesce(p_pipeline, public.crm_ensure_default_pipeline(l.tenant_id));
  SELECT id INTO v_stage FROM public.crm_pipeline_stages WHERE pipeline_id = v_pipe AND stage_kind = 'open' ORDER BY sort_order LIMIT 1;
  INSERT INTO public.crm_deals(tenant_id, name, pipeline_id, stage_id, customer_id, lead_id, owner_staff_id, amount, source)
  VALUES (l.tenant_id, coalesce(p_deal_name, coalesce(l.contact_name, 'Deal') || ' deal'), v_pipe, v_stage, v_cust, l.id,
          l.lead_owner_id, coalesce(p_amount, 0), l.lead_source)
  RETURNING id INTO v_deal;
  UPDATE public.crm_leads SET customer_id = v_cust, status = 'converted', conversion_date = now(), updated_at = now() WHERE id = p_lead;
  RETURN v_deal;
END $$;

-- accepted quote wins the deal; a declined quote leaves it open
CREATE OR REPLACE FUNCTION public.crm__estimate_wins_deal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_stage uuid;
BEGIN
  IF NEW.deal_id IS NOT NULL AND NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    SELECT s.id INTO v_stage FROM public.crm_deals d JOIN public.crm_pipeline_stages s ON s.pipeline_id = d.pipeline_id AND s.stage_kind = 'won'
     WHERE d.id = NEW.deal_id AND d.status = 'open' ORDER BY s.sort_order LIMIT 1;
    IF v_stage IS NOT NULL THEN
      UPDATE public.crm_deals SET stage_id = v_stage, amount = coalesce(NEW.total, amount), estimate_id = NEW.id WHERE id = NEW.deal_id;
    END IF;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_crm_estimate_wins_deal ON public.acct_estimates;
CREATE TRIGGER trg_crm_estimate_wins_deal AFTER UPDATE OF status ON public.acct_estimates FOR EACH ROW EXECUTE FUNCTION public.crm__estimate_wins_deal();

CREATE OR REPLACE VIEW public.crm_v_pipeline_summary WITH (security_invoker = true) AS
SELECT d.tenant_id, d.pipeline_id, p.name AS pipeline, s.id AS stage_id, s.name AS stage, s.sort_order,
       count(d.id) AS deals, coalesce(sum(d.amount), 0) AS amount,
       coalesce(sum(d.amount * coalesce(d.probability, s.probability) / 100.0), 0) AS weighted_amount,
       count(d.id) FILTER (WHERE s.rotting_days IS NOT NULL AND d.stage_entered_at < now() - make_interval(days => s.rotting_days)) AS rotting
  FROM public.crm_pipeline_stages s JOIN public.crm_pipelines p ON p.id = s.pipeline_id
  LEFT JOIN public.crm_deals d ON d.stage_id = s.id
 GROUP BY d.tenant_id, d.pipeline_id, p.name, s.id, s.name, s.sort_order;

CREATE OR REPLACE VIEW public.crm_v_sales_tracking WITH (security_invoker = true) AS
SELECT tenant_id, owner_staff_id, date_trunc('month', coalesce(won_at, lost_at, created_at))::date AS month,
       count(*) FILTER (WHERE status = 'won') AS won_deals, coalesce(sum(amount) FILTER (WHERE status = 'won'), 0) AS won_amount,
       count(*) FILTER (WHERE status = 'lost') AS lost_deals,
       round(100.0 * count(*) FILTER (WHERE status = 'won') / nullif(count(*) FILTER (WHERE status IN ('won','lost')), 0), 1) AS win_rate_pct,
       round(avg(extract(epoch FROM won_at - created_at) / 86400.0) FILTER (WHERE status = 'won'), 1) AS avg_days_to_win
  FROM public.crm_deals GROUP BY 1, 2, 3;

-- =====================================================================
-- E. lead scoring
-- =====================================================================
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE public.crm_leads ADD COLUMN IF NOT EXISTS scored_at timestamptz;

CREATE TABLE IF NOT EXISTS public.crm_lead_scoring_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  field      text NOT NULL,          -- a crm_leads column, or 'activity_count_7d' / 'days_since_activity'
  operator   text NOT NULL CHECK (operator IN ('eq','neq','contains','gt','lt','is_set','is_not_set')),
  value      text,
  points     integer NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.crm_lead_score_bands (
  tenant_id  uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  hot_min    integer NOT NULL DEFAULT 60,
  warm_min   integer NOT NULL DEFAULT 30
);

CREATE OR REPLACE FUNCTION public.crm_score_lead(p_lead uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE l public.crm_leads; j jsonb; r record; v text; s int := 0; ok boolean; b record;
BEGIN
  SELECT * INTO l FROM public.crm_leads WHERE id = p_lead;
  IF l.id IS NULL THEN RETURN NULL; END IF;
  j := to_jsonb(l) || jsonb_build_object(
         'activity_count_7d', (SELECT count(*) FROM public.crm_activity a WHERE a.lead_id = l.id AND a.occurred_at > now() - interval '7 days'),
         'days_since_activity', extract(day FROM now() - coalesce(l.last_activity_at, l.created_at, now())));
  FOR r IN SELECT * FROM public.crm_lead_scoring_rules WHERE tenant_id = l.tenant_id AND is_active LOOP
    v := j ->> r.field;
    ok := CASE r.operator
            WHEN 'eq' THEN lower(v) = lower(r.value) WHEN 'neq' THEN lower(v) IS DISTINCT FROM lower(r.value)
            WHEN 'contains' THEN v ILIKE '%' || r.value || '%'
            WHEN 'gt' THEN v ~ '^-?[0-9.]+$' AND v::numeric > r.value::numeric
            WHEN 'lt' THEN v ~ '^-?[0-9.]+$' AND v::numeric < r.value::numeric
            WHEN 'is_set' THEN coalesce(v, '') <> '' WHEN 'is_not_set' THEN coalesce(v, '') = '' END;
    IF coalesce(ok, false) THEN s := s + r.points; END IF;
  END LOOP;
  SELECT * INTO b FROM public.crm_lead_score_bands WHERE tenant_id = l.tenant_id;
  UPDATE public.crm_leads SET score = s, scored_at = now(),
         priority = CASE WHEN s >= coalesce(b.hot_min, 60) THEN 'hot' WHEN s >= coalesce(b.warm_min, 30) THEN 'warm' ELSE 'cold' END
   WHERE id = p_lead;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.crm__lead_rescore() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM public.crm_score_lead(NEW.id); RETURN NULL; END $$;
DROP TRIGGER IF EXISTS trg_crm_lead_rescore ON public.crm_leads;
CREATE TRIGGER trg_crm_lead_rescore AFTER INSERT OR UPDATE OF status, lead_source, lead_type, email, phone, last_activity_at, customer_id
  ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.crm__lead_rescore();

-- =====================================================================
-- F. webforms (instant lead capture)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.platform_webforms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  name            text NOT NULL,
  creates         text NOT NULL DEFAULT 'lead' CHECK (creates IN ('lead','ticket','deal','contact_only')),
  fields          jsonb NOT NULL DEFAULT '[{"key":"name","label":"Name","required":true},{"key":"email","label":"Email","type":"email","required":true},{"key":"phone","label":"Phone"},{"key":"message","label":"Message","type":"long_text"}]',
  pipeline_id     uuid REFERENCES public.crm_pipelines(id) ON DELETE SET NULL,
  assign_staff_id uuid REFERENCES public.crm_staff(id) ON DELETE SET NULL,
  notify_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  success_message text NOT NULL DEFAULT 'Thanks, we''ll be in touch shortly.',
  redirect_url    text,
  max_per_hour_per_ip integer NOT NULL DEFAULT 10,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE TABLE IF NOT EXISTS public.platform_webform_submissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  webform_id  uuid NOT NULL REFERENCES public.platform_webforms(id) ON DELETE CASCADE,
  payload     jsonb NOT NULL,
  source_url  text,
  utm         jsonb,
  ip_hash     text,
  lead_id     uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  ticket_id   uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  deal_id     uuid REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','spam','rejected')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_webform_submissions_rate_idx ON public.platform_webform_submissions(webform_id, ip_hash, created_at);

-- public endpoint (anon allowed): tenant slug + form slug
CREATE OR REPLACE FUNCTION public.platform_submit_webform(p_tenant_slug text, p_form_slug text, p_payload jsonb,
  p_source_url text DEFAULT NULL, p_utm jsonb DEFAULT NULL, p_client_ip text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE f record; v_sub uuid; v_lead uuid; v_deal uuid; v_ip text; fld jsonb; v_email text;
BEGIN
  SELECT w.* INTO f FROM public.platform_webforms w JOIN public.tenants t ON t.id = w.tenant_id
   WHERE t.slug = p_tenant_slug AND w.slug = p_form_slug AND w.is_active;
  IF f.id IS NULL THEN RAISE EXCEPTION 'form not found'; END IF;
  IF coalesce(p_payload ->> '_hp', '') <> '' THEN RETURN jsonb_build_object('ok', true, 'message', f.success_message); END IF;  -- honeypot
  v_ip := CASE WHEN p_client_ip IS NOT NULL THEN encode(sha256(convert_to(p_client_ip || f.id::text, 'UTF8')), 'hex') END;
  IF v_ip IS NOT NULL AND (SELECT count(*) FROM public.platform_webform_submissions s
                            WHERE s.webform_id = f.id AND s.ip_hash = v_ip AND s.created_at > now() - interval '1 hour') >= f.max_per_hour_per_ip THEN
    RAISE EXCEPTION 'too many submissions, try again later';
  END IF;
  FOR fld IN SELECT * FROM jsonb_array_elements(f.fields) LOOP
    IF coalesce((fld ->> 'required')::boolean, false) AND coalesce(btrim(p_payload ->> (fld ->> 'key')), '') = '' THEN
      RAISE EXCEPTION '% is required', fld ->> 'label';
    END IF;
  END LOOP;
  v_email := lower(btrim(p_payload ->> 'email'));
  IF v_email IS NOT NULL AND NOT public.platform_validate_identifier('email', v_email) THEN RAISE EXCEPTION 'email is not valid'; END IF;
  INSERT INTO public.platform_webform_submissions(tenant_id, webform_id, payload, source_url, utm, ip_hash)
  VALUES (f.tenant_id, f.id, p_payload - '_hp', p_source_url, p_utm, v_ip) RETURNING id INTO v_sub;
  IF f.creates IN ('lead','deal') THEN
    INSERT INTO public.crm_leads(tenant_id, contact_name, email, phone, lead_source, lead_type, status, notes, lead_owner_id, first_contact_at, last_activity_at)
    VALUES (f.tenant_id, p_payload ->> 'name', v_email, p_payload ->> 'phone', coalesce(p_utm ->> 'source', 'webform:' || f.slug), 'inbound', 'new',
            p_payload ->> 'message', f.assign_staff_id, now(), now())
    RETURNING id INTO v_lead;
    IF f.creates = 'deal' THEN v_deal := public.crm_convert_lead(v_lead, NULL, 0, f.pipeline_id); END IF;
  END IF;
  UPDATE public.platform_webform_submissions SET lead_id = v_lead, deal_id = v_deal, status = 'processed' WHERE id = v_sub;
  PERFORM public.platform_notify(f.tenant_id, coalesce(f.notify_user_id, (SELECT user_id FROM public.crm_staff WHERE id = f.assign_staff_id)),
          'webform.submitted', 'New ' || f.name || ' submission', coalesce(p_payload ->> 'name', v_email), '/leads/' || v_lead, 'high',
          'platform_webform_submissions', v_sub);
  RETURN jsonb_build_object('ok', true, 'message', f.success_message, 'redirect_url', f.redirect_url);
END $$;

-- =====================================================================
-- G. click-to-call
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.crm_calls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  direction        text NOT NULL CHECK (direction IN ('outbound','inbound')),
  from_number      text,
  to_number        text NOT NULL,
  customer_id      uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  lead_id          uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  deal_id          uuid REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  ticket_id        uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  staff_id         uuid REFERENCES public.crm_staff(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','ringing','in_progress','completed','no_answer','busy','failed','voicemail','cancelled')),
  disposition      text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  answered_at      timestamptz,
  ended_at         timestamptz,
  duration_seconds integer,
  recording_url    text,
  transcript       text,
  notes            text,
  provider         text,
  provider_call_id text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_call_id)
);

CREATE OR REPLACE FUNCTION public.crm_start_call(p_tenant uuid, p_to_number text, p_customer uuid DEFAULT NULL, p_lead uuid DEFAULT NULL,
  p_deal uuid DEFAULT NULL, p_ticket uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v uuid; st uuid;
BEGIN
  IF NOT public.platform_is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'not a member of this workspace'; END IF;
  IF p_customer IS NOT NULL AND EXISTS (SELECT 1 FROM public.crm_customers WHERE id = p_customer AND (do_not_call OR do_not_contact)) THEN
    RAISE EXCEPTION 'this contact is marked do-not-call';
  END IF;
  SELECT id INTO st FROM public.crm_staff WHERE tenant_id = p_tenant AND user_id = auth.uid();
  INSERT INTO public.crm_calls(tenant_id, direction, to_number, customer_id, lead_id, deal_id, ticket_id, staff_id)
  VALUES (p_tenant, 'outbound', p_to_number, p_customer, p_lead, p_deal, p_ticket, st) RETURNING id INTO v;
  INSERT INTO public.platform_outbox(tenant_id, channel, event_type, aggregate_type, aggregate_ref, payload, status, attempts, available_at, source_table, source_id)
  VALUES (p_tenant, 'voice', 'call.dial', 'crm_calls', v::text, jsonb_build_object('call_id', v, 'to', p_to_number, 'staff_id', st, 'user_id', auth.uid()),
          'pending', 0, now(), 'crm_calls', v::text);
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.crm__call_activity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.ended_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.ended_at IS NULL) THEN
    INSERT INTO public.crm_activity(tenant_id, customer_id, lead_id, deal_id, activity_type, channel, direction, subject, body, occurred_at, staff_id, external_id, metadata)
    VALUES (NEW.tenant_id, NEW.customer_id, NEW.lead_id, NEW.deal_id, 'call', 'phone', NEW.direction,
            initcap(NEW.direction) || ' call (' || NEW.status || ')', NEW.notes, NEW.started_at, NEW.staff_id, NEW.provider_call_id,
            jsonb_build_object('duration_seconds', NEW.duration_seconds, 'recording_url', NEW.recording_url, 'call_id', NEW.id));
    UPDATE public.crm_leads SET last_activity_at = now() WHERE id = NEW.lead_id;
    UPDATE public.crm_deals SET last_activity_at = now() WHERE id = NEW.deal_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_crm_call_activity ON public.crm_calls;
CREATE TRIGGER trg_crm_call_activity AFTER INSERT OR UPDATE OF ended_at ON public.crm_calls FOR EACH ROW EXECUTE FUNCTION public.crm__call_activity();

-- =====================================================================
-- H. two-way email sync
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.platform_mailboxes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,       -- NULL = shared inbox
  connection_id   uuid REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  email_address   text NOT NULL,
  provider        text NOT NULL CHECK (provider IN ('gmail','outlook','imap','resend_inbound')),
  sync_mode       text NOT NULL DEFAULT 'two_way' CHECK (sync_mode IN ('two_way','inbound_only','send_only')),
  sync_cursor     text,
  last_synced_at  timestamptz,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error','disconnected')),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email_address)
);
CREATE TABLE IF NOT EXISTS public.platform_email_threads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mailbox_id         uuid NOT NULL REFERENCES public.platform_mailboxes(id) ON DELETE CASCADE,
  external_thread_id text,
  subject            text,
  customer_id        uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  lead_id            uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  deal_id            uuid REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  last_message_at    timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, external_thread_id)
);
CREATE TABLE IF NOT EXISTS public.platform_email_messages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mailbox_id          uuid NOT NULL REFERENCES public.platform_mailboxes(id) ON DELETE CASCADE,
  thread_id           uuid REFERENCES public.platform_email_threads(id) ON DELETE CASCADE,
  external_message_id text,
  direction           text NOT NULL CHECK (direction IN ('inbound','outbound')),
  status              text NOT NULL DEFAULT 'synced' CHECK (status IN ('draft','queued','sent','synced','failed')),
  from_address        text NOT NULL,
  to_addresses        text[] NOT NULL DEFAULT '{}',
  cc_addresses        text[] NOT NULL DEFAULT '{}',
  subject             text,
  snippet             text,
  body_html           text,
  body_text           text,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  is_read             boolean NOT NULL DEFAULT false,
  customer_id         uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  lead_id             uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  deal_id             uuid REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  sent_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, external_message_id)
);
CREATE INDEX IF NOT EXISTS platform_email_messages_customer_idx ON public.platform_email_messages(customer_id, sent_at DESC);

CREATE OR REPLACE FUNCTION public.platform__email_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE other text;
BEGIN
  other := lower(CASE WHEN NEW.direction = 'inbound' THEN NEW.from_address ELSE NEW.to_addresses[1] END);
  other := coalesce(substring(other FROM '<([^>]+)>'), other);
  IF NEW.customer_id IS NULL THEN
    SELECT id INTO NEW.customer_id FROM public.crm_customers WHERE tenant_id = NEW.tenant_id AND lower(email) = other AND merged_into_customer_id IS NULL LIMIT 1;
  END IF;
  IF NEW.lead_id IS NULL THEN
    SELECT id INTO NEW.lead_id FROM public.crm_leads WHERE tenant_id = NEW.tenant_id AND lower(email) = other ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF NEW.deal_id IS NULL AND NEW.thread_id IS NOT NULL THEN SELECT deal_id INTO NEW.deal_id FROM public.platform_email_threads WHERE id = NEW.thread_id; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_platform_email_link ON public.platform_email_messages;
CREATE TRIGGER trg_platform_email_link BEFORE INSERT ON public.platform_email_messages FOR EACH ROW EXECUTE FUNCTION public.platform__email_link();

CREATE OR REPLACE FUNCTION public.platform__email_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.status IN ('sent','synced') THEN
    INSERT INTO public.crm_activity(tenant_id, customer_id, lead_id, deal_id, activity_type, channel, direction, subject, body, occurred_at, external_id)
    VALUES (NEW.tenant_id, NEW.customer_id, NEW.lead_id, NEW.deal_id, 'email', 'email', NEW.direction, NEW.subject, NEW.snippet, NEW.sent_at, NEW.external_message_id);
    UPDATE public.platform_email_threads SET last_message_at = greatest(coalesce(last_message_at, NEW.sent_at), NEW.sent_at),
           customer_id = coalesce(customer_id, NEW.customer_id), lead_id = coalesce(lead_id, NEW.lead_id) WHERE id = NEW.thread_id;
    IF NEW.lead_id IS NOT NULL THEN UPDATE public.crm_leads SET last_activity_at = NEW.sent_at WHERE id = NEW.lead_id; END IF;
    -- a reply stops any sequence the sender is enrolled in
    IF NEW.direction = 'inbound' THEN
      UPDATE public.crm_sequence_enrollments e SET status = 'replied', completed_at = now(), next_run_at = NULL
       WHERE e.tenant_id = NEW.tenant_id AND e.status = 'active'
         AND (e.customer_id = NEW.customer_id OR e.lead_id = NEW.lead_id)
         AND EXISTS (SELECT 1 FROM public.crm_sequences s WHERE s.id = e.sequence_id AND s.stop_on_reply);
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.platform_send_email(p_mailbox uuid, p_to text[], p_subject text, p_body_html text,
  p_customer uuid DEFAULT NULL, p_lead uuid DEFAULT NULL, p_deal uuid DEFAULT NULL, p_thread uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE m record; v uuid;
BEGIN
  SELECT * INTO m FROM public.platform_mailboxes WHERE id = p_mailbox;
  IF m.id IS NULL OR NOT public.platform_is_tenant_member(m.tenant_id) OR (m.user_id IS NOT NULL AND m.user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'you cannot send from this mailbox';
  END IF;
  IF m.sync_mode = 'inbound_only' THEN RAISE EXCEPTION 'mailbox is inbound only'; END IF;
  INSERT INTO public.platform_email_messages(tenant_id, mailbox_id, thread_id, direction, status, from_address, to_addresses, subject, body_html,
                                             snippet, customer_id, lead_id, deal_id, sent_by)
  VALUES (m.tenant_id, m.id, p_thread, 'outbound', 'queued', m.email_address, p_to, p_subject, p_body_html,
          left(regexp_replace(p_body_html, '<[^>]+>', '', 'g'), 200), p_customer, p_lead, p_deal, auth.uid())
  RETURNING id INTO v;
  INSERT INTO public.platform_outbox(tenant_id, channel, event_type, aggregate_type, aggregate_ref, payload, status, attempts, available_at, source_table, source_id)
  VALUES (m.tenant_id, 'email', 'mailbox.send', 'platform_email_messages', v::text,
          jsonb_build_object('message_id', v, 'mailbox_id', m.id, 'provider', m.provider, 'connection_id', m.connection_id), 'pending', 0, now(),
          'platform_email_messages', v::text);
  RETURN v;
END $$;

-- =====================================================================
-- I. email sequences
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.crm_sequences (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  mailbox_id    uuid REFERENCES public.platform_mailboxes(id) ON DELETE SET NULL,
  stop_on_reply boolean NOT NULL DEFAULT true,
  send_window_start time NOT NULL DEFAULT '08:00',
  send_window_end   time NOT NULL DEFAULT '18:00',
  timezone      text NOT NULL DEFAULT 'America/Chicago',
  weekdays_only boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
-- sales = 1:1 follow-up (opt-out rules: do_not_contact + suppression list); marketing = bulk (needs marketing opt-in)
ALTER TABLE public.crm_sequences ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'sales' CHECK (purpose IN ('sales','marketing'));
CREATE TABLE IF NOT EXISTS public.crm_sequence_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES public.crm_sequences(id) ON DELETE CASCADE,
  step_no     integer NOT NULL CHECK (step_no > 0),
  delay_days  integer NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  step_type   text NOT NULL CHECK (step_type IN ('email','task','call','sms')),
  template_id uuid REFERENCES public.crm_message_templates(id) ON DELETE SET NULL,
  subject     text,
  body        text,
  task_title  text,
  UNIQUE (sequence_id, step_no)
);
CREATE TABLE IF NOT EXISTS public.crm_sequence_enrollments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sequence_id  uuid NOT NULL REFERENCES public.crm_sequences(id) ON DELETE CASCADE,
  customer_id  uuid REFERENCES public.crm_customers(id) ON DELETE CASCADE,
  lead_id      uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  deal_id      uuid REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  email        text,
  current_step integer NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','replied','unsubscribed','bounced','stopped')),
  next_run_at  timestamptz,
  enrolled_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enrolled_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (customer_id IS NOT NULL OR lead_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_sequence_enrollments_active_uq
  ON public.crm_sequence_enrollments(sequence_id, coalesce(customer_id, lead_id)) WHERE status IN ('active','paused');
DROP TRIGGER IF EXISTS trg_platform_email_after ON public.platform_email_messages;
CREATE TRIGGER trg_platform_email_after AFTER INSERT OR UPDATE OF status ON public.platform_email_messages FOR EACH ROW EXECUTE FUNCTION public.platform__email_after();

CREATE OR REPLACE FUNCTION public.crm_enroll_in_sequence(p_sequence uuid, p_customer uuid DEFAULT NULL, p_lead uuid DEFAULT NULL, p_deal uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE s record; v uuid; v_email text; first_delay int;
BEGIN
  SELECT * INTO s FROM public.crm_sequences WHERE id = p_sequence AND is_active;
  IF s.id IS NULL OR NOT public.platform_is_tenant_member(s.tenant_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  v_email := coalesce((SELECT email FROM public.crm_customers WHERE id = p_customer), (SELECT email FROM public.crm_leads WHERE id = p_lead));
  IF EXISTS (SELECT 1 FROM public.crm_customers WHERE id = p_customer AND do_not_contact) THEN
    RAISE EXCEPTION 'this contact is marked do not contact';
  END IF;
  IF s.purpose = 'marketing' AND EXISTS (SELECT 1 FROM public.crm_customers WHERE id = p_customer AND NOT marketing_email_opt_in) THEN
    RAISE EXCEPTION 'this contact has not opted in to marketing email';
  END IF;
  IF to_regclass('public.marketing_suppressions') IS NOT NULL AND v_email IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.marketing_suppressions ms
                WHERE ms.tenant_id = s.tenant_id AND ms.channel = 'email' AND lower(ms.contact) = lower(v_email)) THEN
      RAISE EXCEPTION 'this email is suppressed';
    END IF;
  END IF;
  SELECT delay_days INTO first_delay FROM public.crm_sequence_steps WHERE sequence_id = p_sequence ORDER BY step_no LIMIT 1;
  INSERT INTO public.crm_sequence_enrollments(tenant_id, sequence_id, customer_id, lead_id, deal_id, email, next_run_at, enrolled_by)
  VALUES (s.tenant_id, p_sequence, p_customer, p_lead, p_deal, v_email, now() + make_interval(days => coalesce(first_delay, 0)), auth.uid())
  RETURNING id INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.crm_run_sequences() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE e record; s record; st record; nx record; n int := 0; lt timestamp;
BEGIN
  FOR e IN SELECT * FROM public.crm_sequence_enrollments WHERE status = 'active' AND next_run_at <= now()
            ORDER BY next_run_at LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
    SELECT * INTO s FROM public.crm_sequences WHERE id = e.sequence_id;
    lt := now() AT TIME ZONE s.timezone;
    IF lt::time < s.send_window_start OR lt::time >= s.send_window_end OR (s.weekdays_only AND extract(isodow FROM lt) > 5) THEN
      CONTINUE;                                   -- outside the send window; picked up on a later run
    END IF;
    SELECT * INTO st FROM public.crm_sequence_steps WHERE sequence_id = e.sequence_id AND step_no > e.current_step ORDER BY step_no LIMIT 1;
    IF st.id IS NULL THEN
      UPDATE public.crm_sequence_enrollments SET status = 'completed', completed_at = now(), next_run_at = NULL WHERE id = e.id; CONTINUE;
    END IF;
    IF st.step_type = 'email' AND s.mailbox_id IS NOT NULL AND e.email IS NOT NULL THEN
      INSERT INTO public.platform_email_messages(tenant_id, mailbox_id, direction, status, from_address, to_addresses, subject, body_html, snippet,
                                                 customer_id, lead_id, deal_id)
      SELECT e.tenant_id, s.mailbox_id, 'outbound', 'queued', mb.email_address, ARRAY[e.email],
             coalesce(st.subject, t.subject), coalesce(st.body, t.body), left(coalesce(st.body, t.body, ''), 200), e.customer_id, e.lead_id, e.deal_id
        FROM public.platform_mailboxes mb LEFT JOIN public.crm_message_templates t ON t.id = st.template_id WHERE mb.id = s.mailbox_id;
      INSERT INTO public.platform_outbox(tenant_id, channel, event_type, aggregate_type, aggregate_ref, payload, status, attempts, available_at, source_table, source_id)
      VALUES (e.tenant_id, 'email', 'sequence.send', 'crm_sequence_enrollments', e.id::text,
              jsonb_build_object('enrollment_id', e.id, 'step_no', st.step_no), 'pending', 0, now(), 'crm_sequence_steps', e.id || ':' || st.step_no)
      ON CONFLICT (source_table, source_id) DO NOTHING;
    ELSE   -- task / call / sms (or email without a mailbox): create a task for the owner
      INSERT INTO public.crm_tasks(tenant_id, customer_id, lead_id, task_type, priority, title, status, due_at, related_type, related_id)
      VALUES (e.tenant_id, e.customer_id, e.lead_id, CASE st.step_type WHEN 'call' THEN 'call' ELSE 'todo' END, 'normal',
              coalesce(st.task_title, initcap(st.step_type) || ': ' || s.name || ' step ' || st.step_no), 'open', now(), 'crm_sequence_enrollments', e.id);
    END IF;
    SELECT * INTO nx FROM public.crm_sequence_steps WHERE sequence_id = e.sequence_id AND step_no > st.step_no ORDER BY step_no LIMIT 1;
    UPDATE public.crm_sequence_enrollments
       SET current_step = st.step_no,
           next_run_at = CASE WHEN nx.id IS NULL THEN NULL ELSE now() + make_interval(days => nx.delay_days) END,
           status = CASE WHEN nx.id IS NULL THEN 'completed' ELSE 'active' END,
           completed_at = CASE WHEN nx.id IS NULL THEN now() END
     WHERE id = e.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- =====================================================================
-- J. calendar
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.platform_calendars (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  owner_user_id  uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id       uuid REFERENCES public.crm_staff(id) ON DELETE CASCADE,
  name           text NOT NULL,
  color          text,
  timezone       text NOT NULL DEFAULT 'America/Chicago',
  visibility     text NOT NULL DEFAULT 'team' CHECK (visibility IN ('private','team','public')),
  connection_id  uuid REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  external_calendar_id text,
  sync_token     text,
  last_synced_at timestamptz,
  blocks_availability boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.platform_calendar_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  calendar_id     uuid NOT NULL REFERENCES public.platform_calendars(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  location        text,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  all_day         boolean NOT NULL DEFAULT false,
  recurrence_rule text,
  status          text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('tentative','confirmed','cancelled')),
  busy            boolean NOT NULL DEFAULT true,
  appointment_id  uuid REFERENCES public.crm_appointments(id) ON DELETE CASCADE,
  related_type    text,
  related_id      uuid,
  meeting_url     text,
  external_event_id text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at),
  UNIQUE (calendar_id, external_event_id)
);
CREATE INDEX IF NOT EXISTS platform_calendar_events_range_idx ON public.platform_calendar_events USING gist (calendar_id, tstzrange(starts_at, ends_at));
CREATE TABLE IF NOT EXISTS public.platform_calendar_attendees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES public.platform_calendar_events(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.crm_customers(id) ON DELETE CASCADE,
  email       text,
  response    text NOT NULL DEFAULT 'needs_action' CHECK (response IN ('needs_action','accepted','declined','tentative')),
  CHECK (user_id IS NOT NULL OR customer_id IS NOT NULL OR email IS NOT NULL)
);

-- one agenda: appointments + calendar events + tasks with a due time
CREATE OR REPLACE VIEW public.platform_v_agenda WITH (security_invoker = true) AS
SELECT a.tenant_id, 'appointment'::text AS kind, a.id, coalesce(s.name, 'Appointment') AS title, a.starts_at, a.ends_at, a.staff_id,
       (SELECT user_id FROM public.crm_staff x WHERE x.id = a.staff_id) AS user_id, a.customer_id, a.status
  FROM public.crm_appointments a LEFT JOIN public.crm_services s ON s.id = a.service_id
 WHERE a.status NOT IN ('cancelled','rescheduled')
UNION ALL
SELECT e.tenant_id, 'event', e.id, e.title, e.starts_at, e.ends_at, c.staff_id, c.owner_user_id, NULL, e.status
  FROM public.platform_calendar_events e JOIN public.platform_calendars c ON c.id = e.calendar_id
 WHERE e.status <> 'cancelled' AND e.appointment_id IS NULL
UNION ALL
SELECT t.tenant_id, 'task', t.id, t.title, coalesce(t.start_at, t.due_at), t.due_at, NULL, t.created_by, t.customer_id, t.status
  FROM public.crm_tasks t WHERE t.due_at IS NOT NULL AND coalesce(t.status, '') NOT IN ('completed','done','cancelled');

-- =====================================================================
-- K. route planning
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.crm_routes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  route_date       date NOT NULL,
  staff_id         uuid REFERENCES public.crm_staff(id) ON DELETE SET NULL,
  name             text,
  start_address    text,
  end_address      text,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','optimizing','planned','in_progress','completed','cancelled')),
  total_distance_m integer,
  total_duration_s integer,
  optimized_at     timestamptz,
  provider         text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, staff_id, route_date)
);
CREATE TABLE IF NOT EXISTS public.crm_route_stops (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  route_id        uuid NOT NULL REFERENCES public.crm_routes(id) ON DELETE CASCADE,
  seq             integer NOT NULL,
  appointment_id  uuid REFERENCES public.crm_appointments(id) ON DELETE SET NULL,
  order_id        uuid REFERENCES public.erp_orders(id) ON DELETE SET NULL,
  customer_id     uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  address         text NOT NULL,
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  window_start    timestamptz,
  window_end      timestamptz,
  service_minutes integer NOT NULL DEFAULT 0,
  eta             timestamptz,
  arrived_at      timestamptz,
  completed_at    timestamptz,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','en_route','arrived','completed','skipped','failed')),
  notes           text,
  CONSTRAINT crm_route_stops_seq_uq UNIQUE (route_id, seq) DEFERRABLE INITIALLY DEFERRED
);

-- build a staff member's route for a day from their appointments (time order); optimization is done by the provider
CREATE OR REPLACE FUNCTION public.crm_build_route(p_tenant uuid, p_staff uuid, p_date date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v uuid; tz text;
BEGIN
  IF NOT public.platform_is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'not a member of this workspace'; END IF;
  INSERT INTO public.crm_routes(tenant_id, route_date, staff_id, name)
  VALUES (p_tenant, p_date, p_staff, 'Route ' || p_date)
  ON CONFLICT (tenant_id, staff_id, route_date) DO UPDATE SET updated_at = now() RETURNING id INTO v;
  DELETE FROM public.crm_route_stops WHERE route_id = v AND status = 'pending' AND appointment_id IS NOT NULL;
  INSERT INTO public.crm_route_stops(tenant_id, route_id, seq, appointment_id, customer_id, address, window_start, window_end, service_minutes)
  SELECT p_tenant, v, 1000 + row_number() OVER (ORDER BY a.starts_at), a.id, a.customer_id,
         concat_ws(', ', c.address_line1, c.city, c.state, c.postal_code), a.starts_at, a.ends_at,
         (extract(epoch FROM a.ends_at - a.starts_at) / 60)::int
    FROM public.crm_appointments a JOIN public.crm_customers c ON c.id = a.customer_id
   WHERE a.tenant_id = p_tenant AND a.staff_id = p_staff AND a.status NOT IN ('cancelled','rescheduled','no_show')
     AND (a.starts_at AT TIME ZONE coalesce(a.timezone, 'America/Chicago'))::date = p_date
     AND c.address_line1 IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.crm_route_stops s WHERE s.route_id = v AND s.appointment_id = a.id);
  -- renumber 1..n
  WITH o AS (SELECT id, row_number() OVER (ORDER BY seq) rn FROM public.crm_route_stops WHERE route_id = v)
  UPDATE public.crm_route_stops s SET seq = o.rn FROM o WHERE o.id = s.id;
  UPDATE public.crm_routes SET status = 'optimizing' WHERE id = v;
  INSERT INTO public.platform_outbox(tenant_id, channel, event_type, aggregate_type, aggregate_ref, payload, status, attempts, available_at, source_table, source_id)
  VALUES (p_tenant, 'integration', 'route.optimize', 'crm_routes', v::text, jsonb_build_object('route_id', v), 'pending', 0, now(),
          'crm_routes', v || ':' || extract(epoch FROM now())::bigint)
  ON CONFLICT (source_table, source_id) DO NOTHING;
  RETURN v;
END $$;

-- =====================================================================
-- L. sensitive data: classification + access log
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.platform_data_classes (
  table_name  text NOT NULL,
  column_name text NOT NULL,
  data_class  text NOT NULL CHECK (data_class IN ('pii','phi','pci','financial','secret')),
  mask        text NOT NULL DEFAULT 'partial' CHECK (mask IN ('none','partial','full')),
  notes       text,
  PRIMARY KEY (table_name, column_name)
);
ALTER TABLE public.platform_data_classes
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
INSERT INTO public.platform_data_classes(table_name, column_name, data_class, mask) VALUES
  ('crm_customers','email','pii','partial'),('crm_customers','phone','pii','partial'),('crm_customers','mobile_phone','pii','partial'),
  ('crm_customers','date_of_birth','pii','full'),('crm_customers','address_line1','pii','partial'),
  ('crm_dependents','date_of_birth','pii','full'),('crm_dependents','identifier','pii','partial'),('crm_dependents','notes','pii','full'),
  ('crm_appointments','customer_notes','pii','full'),('crm_appointments','internal_notes','pii','full'),
  ('crm_calls','recording_url','pii','full'),('crm_calls','transcript','pii','full'),
  ('platform_email_messages','body_html','pii','full'),('platform_email_messages','body_text','pii','full'),
  ('tenants','tax_id','financial','partial')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_sensitive_access_log (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  table_name  text NOT NULL,
  record_id   uuid,
  fields      text[],
  action      text NOT NULL DEFAULT 'view' CHECK (action IN ('view','export','print','share','break_glass')),
  purpose     text,
  accessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_sensitive_access_log_rec_idx ON public.platform_sensitive_access_log(table_name, record_id, accessed_at DESC);

CREATE OR REPLACE FUNCTION public.platform_log_access(p_tenant uuid, p_table text, p_record uuid, p_fields text[] DEFAULT NULL,
  p_action text DEFAULT 'view', p_purpose text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NOT public.platform_is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'not a member of this workspace'; END IF;
  IF p_action = 'break_glass' AND coalesce(btrim(p_purpose), '') = '' THEN RAISE EXCEPTION 'break-glass access needs a reason'; END IF;
  INSERT INTO public.platform_sensitive_access_log(tenant_id, user_id, table_name, record_id, fields, action, purpose)
  VALUES (p_tenant, auth.uid(), p_table, p_record, p_fields, p_action, p_purpose);
END $$;

-- =====================================================================
-- security
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_terminology','platform_custom_field_values','crm_record_types','crm_record_parties','crm_record_events',
     'crm_pipelines','crm_pipeline_stages','crm_deals','crm_lead_scoring_rules','crm_lead_score_bands','platform_webforms',
     'crm_calls','platform_email_threads','crm_sequences','crm_sequence_steps','crm_sequence_enrollments','platform_calendar_events',
     'platform_calendar_attendees','crm_routes','crm_route_stops'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_tenant_rw ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_tenant_rw ON public.%I FOR ALL TO authenticated
                      USING (public.platform_is_tenant_member(tenant_id)) WITH CHECK (public.platform_is_tenant_member(tenant_id))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
  -- read-only to members (written by RPCs / triggers / sync workers)
  FOREACH t IN ARRAY ARRAY['crm_deal_stage_history','platform_webform_submissions','platform_sensitive_access_log'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_tenant_read ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_tenant_read ON public.%I FOR SELECT TO authenticated USING (public.platform_is_tenant_member(tenant_id))', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
  END LOOP;
  -- mailboxes, calendars, email messages: private ones only to their owner
  ALTER TABLE public.platform_mailboxes ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS unify_mailbox_rw ON public.platform_mailboxes;
  CREATE POLICY unify_mailbox_rw ON public.platform_mailboxes FOR ALL TO authenticated
    USING (public.platform_is_tenant_member(tenant_id) AND (user_id IS NULL OR user_id = auth.uid() OR public.platform_is_tenant_admin(tenant_id)))
    WITH CHECK (public.platform_is_tenant_member(tenant_id) AND (user_id IS NULL OR user_id = auth.uid()));
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_mailboxes TO authenticated;
  REVOKE SELECT (sync_cursor) ON public.platform_mailboxes FROM authenticated;
  ALTER TABLE public.platform_email_messages ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS unify_email_read ON public.platform_email_messages;
  CREATE POLICY unify_email_read ON public.platform_email_messages FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.platform_mailboxes m WHERE m.id = mailbox_id AND public.platform_is_tenant_member(m.tenant_id)
                     AND (m.user_id IS NULL OR m.user_id = auth.uid())));
  DROP POLICY IF EXISTS unify_email_update ON public.platform_email_messages;
  CREATE POLICY unify_email_update ON public.platform_email_messages FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.platform_mailboxes m WHERE m.id = mailbox_id AND public.platform_is_tenant_member(m.tenant_id)
                     AND (m.user_id IS NULL OR m.user_id = auth.uid())));
  GRANT SELECT, UPDATE (is_read, customer_id, lead_id, deal_id) ON public.platform_email_messages TO authenticated;
  ALTER TABLE public.platform_calendars ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS unify_calendar_rw ON public.platform_calendars;
  CREATE POLICY unify_calendar_rw ON public.platform_calendars FOR ALL TO authenticated
    USING (public.platform_is_tenant_member(tenant_id) AND (visibility <> 'private' OR owner_user_id = auth.uid()))
    WITH CHECK (public.platform_is_tenant_member(tenant_id));
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_calendars TO authenticated;
  -- picklists: everyone reads globals + own; tenant admins manage their own
  ALTER TABLE public.platform_picklist_values ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS unify_picklist_read ON public.platform_picklist_values;
  CREATE POLICY unify_picklist_read ON public.platform_picklist_values FOR SELECT TO authenticated
    USING (tenant_id IS NULL OR public.platform_is_tenant_member(tenant_id));
  DROP POLICY IF EXISTS unify_picklist_admin ON public.platform_picklist_values;
  CREATE POLICY unify_picklist_admin ON public.platform_picklist_values FOR ALL TO authenticated
    USING (tenant_id IS NOT NULL AND public.platform_is_tenant_admin(tenant_id)) WITH CHECK (tenant_id IS NOT NULL AND public.platform_is_tenant_admin(tenant_id));
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_picklist_values TO authenticated;
  -- global reference tables
  FOREACH t IN ARRAY ARRAY['platform_deployment_profile','platform_data_classes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_read_all ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_read_all ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
  END LOOP;
END $$;
GRANT SELECT ON public.crm_v_pipeline_summary, public.crm_v_sales_tracking, public.platform_v_agenda TO authenticated;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['platform_picklist_ok','platform_deployment_allows','platform_validate_identifier','platform_get_custom_fields',
     'platform_set_custom_fields','crm_ensure_default_pipeline','crm_move_deal','crm_convert_lead','crm_score_lead','crm_start_call',
     'platform_send_email','crm_enroll_in_sequence','crm_build_route','platform_log_access','platform_submit_webform'] LOOP
    EXECUTE (SELECT string_agg(format('GRANT EXECUTE ON FUNCTION %s TO authenticated', p.oid::regprocedure), '; ')
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f);
  END LOOP;
  -- the public webform endpoint is the only anon entry point
  EXECUTE (SELECT string_agg(format('GRANT EXECUTE ON FUNCTION %s TO anon', p.oid::regprocedure), '; ')
             FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'platform_submit_webform');
  FOREACH f IN ARRAY ARRAY['crm_run_sequences','crm__record_event_guard','platform__picklist_guard','platform__cfv_guard','platform__cf_phi_guard','crm__record_guard',
     'crm__record_status_history','crm__deal_stage','crm__deal_history','crm__estimate_wins_deal','crm__lead_rescore','crm__call_activity',
     'platform__email_link','platform__email_after'] LOOP
    EXECUTE (SELECT string_agg(format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', p.oid::regprocedure), '; ')
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f);
  END LOOP;
END $$;

INSERT INTO public.platform_polymorphic_columns(table_name, type_column, id_column)
SELECT t, c1, c2 FROM (VALUES ('platform_custom_field_values','entity_type','entity_id'),('platform_calendar_events','related_type','related_id')) v(t, c1, c2)
 WHERE NOT EXISTS (SELECT 1 FROM public.platform_polymorphic_columns p WHERE p.table_name = v.t AND p.id_column = v.c2)
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_table_access_overrides(table_name, access_mode, notes)
SELECT t, 'global_read', 'unify 06c: global reference data, readable by every signed-in user'
  FROM (VALUES ('platform_deployment_profile'),('platform_data_classes')) v(t)
 WHERE NOT EXISTS (SELECT 1 FROM public.platform_table_access_overrides o WHERE o.table_name = v.t);
SELECT count(*) AS tables_secured FROM public.platform__apply_app_security();
SELECT public.platform_classify_tables() AS tables_classified;
COMMIT;

-- canonical step ledger
SELECT unify.done('310');
