-- =====================================================================================
-- App Part 19: Cap table ledger integrity and 409A valuation          domain 19 (Cap Table & Valuation)
--
-- Replaces 409a-cap-table-schema.sql (never deployed). Instead of a second, parallel cap
-- model, this extends the Part 14 cap table (cap_share_classes, cap_stakeholders,
-- cap_issuances, cap_option_pools, cap_option_grants, cap_convertibles, cap_valuations,
-- cap_equity_events), which is already tenant/entity scoped, joined to the party hub and
-- posts to the ledger. Every concept in the 409A draft maps onto it:
--
--   409A draft                    -> here
--   cap_companies                 -> acct_entities + cap_issuer_profiles (409A facts per issuer)
--   cap_stakeholders              -> cap_stakeholders (+ holder_kind, is_board, is_insider)
--   cap_documents                 -> cap_documents (+ entity_id, sha256)
--   cap_qualified_individuals     -> cap_qualified_individuals (new)
--   cap_board_approvals           -> cap_board_approvals (new; linked from every equity action)
--   cap_security_classes          -> cap_share_classes (+ has_put_or_call, rofr_only, terms)
--   cap_equity_plans              -> cap_option_pools (+ shareholder approval, board approval)
--   cap_vesting_schedules         -> cap_vesting_schedules (templates, new)
--   cap_securities / cap_grants   -> cap_issuances, cap_option_grants, cap_convertibles
--   cap_vesting_events            -> cap_vesting_schedule(grant) (derived, cannot drift)
--   cap_transactions (hash chain) -> cap_equity_events (+ seq, prev_hash, row_hash, verifier)
--   cap_table_snapshots           -> cap_table_snapshots (new, immutable, chain-anchored)
--   val_* (requests..reports)     -> val_* (new, tenant/entity scoped)
--   val_active_fmv                -> val_active_fmv (security_invoker view)
--   "TODO in app layer" guards    -> enforced in the database (grant FMV guard, 10% holder ISO
--                                    rule, safe-harbor gate at valuation and at grant time,
--                                    material-event expiry, 83(b) deadlines)
--
-- Access: equity is not visible to every team member. Company owners/admins read everything;
-- a stakeholder linked to a user reads only their own holdings. Setup tables are admin-write;
-- ledger tables (issuances, grants, exercises, convertibles, events, valuations, snapshots,
-- reports) are written only by the security-definer functions.
--
-- Rules implemented: Treas. Reg. 1.409A-1(b)(5)(iv)(B) (12-month limit, material information,
-- independent appraisal / formula / illiquid start-up presumptions: <10 years, no traded class,
-- no put/call other than ROFR or lapse restrictions, no change in control within 90 days or
-- IPO within 180 days of the action, qualified person with ~5 years experience, written report);
-- IRC 422(c)(5) (ISO to a >10% holder: 110% of FMV, 5-year term); IRC 422(b)(1) (shareholder
-- approval within 12 months of plan adoption); IRC 83(b) (30-day election window).
--
-- Requires: Part 14 (cap_*), Part 10 (platform registry security), Part 6 (acct security).
-- Runs in one transaction; re-runnable.
-- =====================================================================================
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.cap_share_classes') IS NULL OR to_regclass('public.cap_equity_events') IS NULL THEN
    RAISE EXCEPTION 'Missing prerequisite: run App Part 14 (cap table) first';
  END IF;
  IF to_regprocedure('public.platform__apply_app_security()') IS NULL THEN
    RAISE EXCEPTION 'Missing prerequisite: run App Part 10 (security registry) first';
  END IF;
END $$;

-- -------------------------------------------------------------------------------------
-- A. Access helpers
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cap__assert_admin(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
BEGIN
  IF p_tenant_id IS NULL OR NOT (platform_is_tenant_admin(p_tenant_id) OR auth.role() = 'service_role' OR platform_is_admin()) THEN
    RAISE EXCEPTION 'Only company owners and admins can see or change the cap table' USING ERRCODE = '42501';
  END IF;
END $$;

-- true when the stakeholder row belongs to the signed-in user (RLS predicate)
CREATE OR REPLACE FUNCTION public.cap__is_holder(p_stakeholder_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
  SELECT p_stakeholder_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM cap_stakeholders s WHERE s.id = p_stakeholder_id AND s.user_id = auth.uid());
$$;

-- -------------------------------------------------------------------------------------
-- B. Issuer profile, governance, qualified individuals
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cap_issuer_profiles (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_id                       uuid NOT NULL REFERENCES public.acct_entities(id) ON DELETE CASCADE,
  state_of_incorporation          text NOT NULL,
  incorporated_on                 date NOT NULL,
  predecessor_start_date          date,              -- earliest trade/business start of any predecessor (10-year test)
  has_traded_class                boolean NOT NULL DEFAULT false,
  anticipated_change_in_control_on date,             -- set when a sale is reasonably anticipated
  anticipated_ipo_on              date,              -- set when a public offering is reasonably anticipated
  fiscal_year_end                 text NOT NULL DEFAULT '12-31' CHECK (fiscal_year_end ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id),
  CHECK (predecessor_start_date IS NULL OR predecessor_start_date <= incorporated_on)
);

CREATE TABLE IF NOT EXISTS public.cap_board_approvals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_id              uuid NOT NULL REFERENCES public.acct_entities(id),
  approval_type          text NOT NULL CHECK (approval_type IN ('plan_adopt','pool_increase','grant_batch','issuance','valuation_adopt',
                                                                'financing','qualified_individual','other')),
  approval_method        text NOT NULL DEFAULT 'written_consent' CHECK (approval_method IN ('written_consent','meeting')),
  adopted_on             date NOT NULL,
  document_id            uuid REFERENCES public.cap_documents(id) ON DELETE SET NULL,
  signer_stakeholder_ids uuid[] NOT NULL DEFAULT '{}',
  recitals               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             uuid DEFAULT auth.uid(),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cap_qualified_individuals (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_id              uuid NOT NULL REFERENCES public.acct_entities(id),
  stakeholder_id         uuid REFERENCES public.cap_stakeholders(id) ON DELETE SET NULL,
  party_id               uuid REFERENCES public.platform_parties(id) ON DELETE SET NULL,
  full_name              text NOT NULL,
  firm                   text,
  is_independent         boolean NOT NULL DEFAULT false,   -- independent appraiser (presumption (i)) vs in-house (iii)
  qualifications_summary text NOT NULL,
  years_experience       numeric(5,2) NOT NULL CHECK (years_experience >= 0),
  experience_categories  text[] NOT NULL DEFAULT '{}' CHECK (experience_categories <@ ARRAY['business_valuation','appraisal','financial_accounting',
                                  'investment_banking','private_equity','secured_lending','comparable_industry']::text[]),
  cv_document_id         uuid REFERENCES public.cap_documents(id) ON DELETE SET NULL,
  board_approval_id      uuid REFERENCES public.cap_board_approvals(id) ON DELETE SET NULL,
  determined_on          date,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cap_vesting_schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                text NOT NULL,
  total_months        int NOT NULL DEFAULT 48 CHECK (total_months >= 0),
  cliff_months        int NOT NULL DEFAULT 12 CHECK (cliff_months >= 0),
  frequency_months    int NOT NULL DEFAULT 1 CHECK (frequency_months >= 1),
  acceleration        text NOT NULL DEFAULT 'none' CHECK (acceleration IN ('none','single_trigger','double_trigger')),
  is_default          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name),
  CHECK (cliff_months <= total_months)
);
CREATE UNIQUE INDEX IF NOT EXISTS cap_vesting_schedules_one_default ON public.cap_vesting_schedules(tenant_id) WHERE is_default;

-- extend the Part 14 tables with what the 409A draft carried
ALTER TABLE public.cap_documents      ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.acct_entities(id),
                                      ADD COLUMN IF NOT EXISTS sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$');
ALTER TABLE public.cap_stakeholders   ADD COLUMN IF NOT EXISTS holder_kind text NOT NULL DEFAULT 'person' CHECK (holder_kind IN ('person','entity')),
                                      ADD COLUMN IF NOT EXISTS is_board boolean NOT NULL DEFAULT false,
                                      ADD COLUMN IF NOT EXISTS is_insider boolean NOT NULL DEFAULT false;
ALTER TABLE public.cap_share_classes  ADD COLUMN IF NOT EXISTS has_put_or_call boolean NOT NULL DEFAULT false,
                                      ADD COLUMN IF NOT EXISTS rofr_only boolean NOT NULL DEFAULT true,   -- ROFR / lapse restrictions do not break the start-up presumption
                                      ADD COLUMN IF NOT EXISTS terms jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.cap_option_pools   ADD COLUMN IF NOT EXISTS board_approval_id uuid REFERENCES public.cap_board_approvals(id) ON DELETE SET NULL,
                                      ADD COLUMN IF NOT EXISTS shareholder_approved_on date,
                                      ADD COLUMN IF NOT EXISTS iso_share_limit numeric(20,0);
ALTER TABLE public.cap_funding_rounds ADD COLUMN IF NOT EXISTS board_approval_id uuid REFERENCES public.cap_board_approvals(id) ON DELETE SET NULL;
ALTER TABLE public.cap_issuances      ADD COLUMN IF NOT EXISTS board_approval_id uuid REFERENCES public.cap_board_approvals(id) ON DELETE SET NULL,
                                      ADD COLUMN IF NOT EXISTS form_83b_due_on date,
                                      ADD COLUMN IF NOT EXISTS form_83b_filed_on date;
ALTER TABLE public.cap_option_grants  ADD COLUMN IF NOT EXISTS board_approval_id uuid REFERENCES public.cap_board_approvals(id) ON DELETE SET NULL,
                                      ADD COLUMN IF NOT EXISTS vesting_schedule_id uuid REFERENCES public.cap_vesting_schedules(id) ON DELETE SET NULL,
                                      ADD COLUMN IF NOT EXISTS val_report_id uuid,      -- FK after val_reports
                                      ADD COLUMN IF NOT EXISTS imported_without_409a boolean NOT NULL DEFAULT false;
ALTER TABLE public.cap_valuations     ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.acct_entities(id),
                                      ADD COLUMN IF NOT EXISTS method text CHECK (method IS NULL OR method IN ('independent_appraisal','illiquid_startup','formula','other')),
                                      ADD COLUMN IF NOT EXISTS val_report_id uuid,      -- FK after val_reports
                                      ADD COLUMN IF NOT EXISTS expired_reason text;
UPDATE public.cap_valuations v SET entity_id = acct_default_entity(v.tenant_id) WHERE v.entity_id IS NULL;

-- -------------------------------------------------------------------------------------
-- C. Equity event hash chain (cap_equity_events is the cap ledger)
-- -------------------------------------------------------------------------------------
ALTER TABLE public.cap_equity_events ADD COLUMN IF NOT EXISTS seq bigint GENERATED ALWAYS AS IDENTITY,
                                     ADD COLUMN IF NOT EXISTS prev_hash text,
                                     ADD COLUMN IF NOT EXISTS row_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS cap_equity_events_seq ON public.cap_equity_events(seq);
CREATE INDEX IF NOT EXISTS cap_equity_events_tenant_seq ON public.cap_equity_events(tenant_id, seq DESC);

CREATE OR REPLACE FUNCTION public.cap__event_hash(e public.cap_equity_events, p_prev text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public','pg_catalog' AS $$
  SELECT encode(sha256(convert_to(coalesce(p_prev, '') || '|' || jsonb_build_object(
           'id', e.id, 'tenant_id', e.tenant_id, 'seq', e.seq, 'event_type', e.event_type, 'event_date', e.event_date,
           'stakeholder_id', e.stakeholder_id, 'share_class_id', e.share_class_id, 'shares', e.shares, 'amount', e.amount,
           'related_type', e.related_type, 'related_id', e.related_id, 'details', e.details,
           'created_by', e.created_by, 'created_at', e.created_at)::text, 'UTF8')), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.cap__event_chain_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
BEGIN
  -- one writer per tenant chain at a time
  PERFORM pg_advisory_xact_lock(hashtextextended('cap_equity_events:' || NEW.tenant_id::text, 0));
  SELECT e.row_hash INTO NEW.prev_hash FROM cap_equity_events e WHERE e.tenant_id = NEW.tenant_id ORDER BY e.seq DESC LIMIT 1;
  NEW.row_hash := cap__event_hash(NEW, NEW.prev_hash);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cap_event_chain ON public.cap_equity_events;
CREATE TRIGGER trg_cap_event_chain BEFORE INSERT ON public.cap_equity_events FOR EACH ROW EXECUTE FUNCTION cap__event_chain_trg();

-- backfill any rows written before this part (fresh installs have none)
DO $$
DECLARE r public.cap_equity_events%ROWTYPE; v_prev text; v_tenant uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM cap_equity_events WHERE row_hash IS NULL) THEN
    PERFORM set_config('app.allow_tenant_purge', 'on', true);
    FOR r IN SELECT * FROM cap_equity_events ORDER BY tenant_id, seq LOOP
      IF v_tenant IS DISTINCT FROM r.tenant_id THEN v_prev := NULL; v_tenant := r.tenant_id; END IF;
      UPDATE cap_equity_events SET prev_hash = v_prev, row_hash = cap__event_hash(r, v_prev) WHERE id = r.id;
      v_prev := cap__event_hash(r, v_prev);
    END LOOP;
    PERFORM set_config('app.allow_tenant_purge', 'off', true);
  END IF;
END $$;
ALTER TABLE public.cap_equity_events ALTER COLUMN row_hash SET NOT NULL;

CREATE OR REPLACE FUNCTION public.cap_verify_event_chain(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE r public.cap_equity_events%ROWTYPE; v_prev text; n bigint := 0;
BEGIN
  PERFORM cap__assert_admin(p_tenant_id);
  FOR r IN SELECT * FROM cap_equity_events WHERE tenant_id = p_tenant_id ORDER BY seq LOOP
    n := n + 1;
    IF r.prev_hash IS DISTINCT FROM v_prev OR r.row_hash <> cap__event_hash(r, v_prev) THEN
      RETURN jsonb_build_object('valid', false, 'events_checked', n, 'first_broken_seq', r.seq, 'event_id', r.id);
    END IF;
    v_prev := r.row_hash;
  END LOOP;
  RETURN jsonb_build_object('valid', true, 'events_checked', n, 'head_hash', v_prev);
END $$;

-- -------------------------------------------------------------------------------------
-- D. Snapshots (derived cap table, frozen and anchored to the event chain)
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cap_table_snapshots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  as_of_date           date NOT NULL,
  reason               text NOT NULL CHECK (reason IN ('valuation','grant','financing','board','audit','manual')),
  snapshot             jsonb NOT NULL,
  total_outstanding    numeric(20,0) NOT NULL,
  total_fully_diluted  numeric(20,0) NOT NULL,
  last_event_seq       bigint,
  last_event_hash      text,
  snapshot_hash        text NOT NULL,
  created_by           uuid DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_cap_snapshots_immutable ON public.cap_table_snapshots;
CREATE TRIGGER trg_cap_snapshots_immutable BEFORE UPDATE OR DELETE ON public.cap_table_snapshots FOR EACH ROW
  WHEN (current_setting('app.allow_tenant_purge', true) IS DISTINCT FROM 'on') EXECUTE FUNCTION cap_events_immutable_trg();

CREATE OR REPLACE FUNCTION public.cap_take_snapshot(p_tenant_id uuid, p_as_of date DEFAULT current_date, p_reason text DEFAULT 'manual')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE v uuid; v_snap jsonb; v_out numeric; v_fd numeric; v_seq bigint; v_hash text;
BEGIN
  PERFORM cap__assert_admin(p_tenant_id);
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.holder_kind DESC, t.fully_diluted DESC, t.holder_name), '[]'::jsonb),
         coalesce(sum(t.issued_shares), 0), coalesce(sum(t.fully_diluted), 0)
    INTO v_snap, v_out, v_fd FROM cap_table(p_tenant_id, p_as_of) t;
  SELECT e.seq, e.row_hash INTO v_seq, v_hash FROM cap_equity_events e WHERE e.tenant_id = p_tenant_id ORDER BY e.seq DESC LIMIT 1;
  INSERT INTO cap_table_snapshots(tenant_id, as_of_date, reason, snapshot, total_outstanding, total_fully_diluted, last_event_seq, last_event_hash, snapshot_hash)
  VALUES (p_tenant_id, p_as_of, p_reason, v_snap, v_out, v_fd, v_seq, v_hash,
          encode(sha256(convert_to(coalesce(v_hash,'') || '|' || p_as_of::text || '|' || v_snap::text, 'UTF8')), 'hex'))
  RETURNING id INTO v;
  RETURN v;
END $$;

-- -------------------------------------------------------------------------------------
-- E. Vesting: templates applied at grant time; schedule derived from the same math as cap_vested_shares
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cap__apply_vesting_template_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE s cap_vesting_schedules%ROWTYPE;
BEGIN
  IF NEW.vesting_schedule_id IS NOT NULL THEN
    SELECT * INTO s FROM cap_vesting_schedules WHERE id = NEW.vesting_schedule_id AND tenant_id = NEW.tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vesting schedule not found for this company'; END IF;
    NEW.vesting_months := s.total_months; NEW.cliff_months := s.cliff_months;
    NEW.vesting_frequency_months := s.frequency_months; NEW.acceleration := s.acceleration;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cap_grant_vesting_template ON public.cap_option_grants;
CREATE TRIGGER trg_cap_grant_vesting_template BEFORE INSERT ON public.cap_option_grants FOR EACH ROW EXECUTE FUNCTION cap__apply_vesting_template_trg();

CREATE OR REPLACE FUNCTION public.cap_vesting_schedule(p_grant_id uuid)
RETURNS TABLE(vest_date date, shares_vesting numeric, cumulative_vested numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE g cap_option_grants%ROWTYPE;
BEGIN
  SELECT * INTO g FROM cap_option_grants WHERE id = p_grant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grant not found'; END IF;
  IF NOT (platform_is_tenant_admin(g.tenant_id) OR cap__is_holder(g.stakeholder_id) OR auth.role() = 'service_role' OR platform_is_admin()) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH d AS (
    SELECT (g.vesting_start + make_interval(months => m))::date dt
      FROM generate_series(0, greatest(g.vesting_months, 0)) m),
  v AS (SELECT d.dt, cap_vested_shares(g.id, d.dt) cum FROM d)
  SELECT v.dt, v.cum - coalesce(lag(v.cum) OVER (ORDER BY v.dt), 0), v.cum FROM v
  ORDER BY v.dt;
  RETURN;
END $$;

-- -------------------------------------------------------------------------------------
-- F. 409A valuation workflow
-- -------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.val_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_id               uuid NOT NULL REFERENCES public.acct_entities(id),
  valuation_date          date NOT NULL,
  purpose                 text NOT NULL DEFAULT 'option_grant_fmv' CHECK (purpose IN ('option_grant_fmv','rsa_purchase_price','financial_reporting_asc718','other')),
  method                  text NOT NULL DEFAULT 'independent_appraisal' CHECK (method IN ('independent_appraisal','illiquid_startup','formula','other')),
  provider_name           text,
  qualified_individual_id uuid REFERENCES public.cap_qualified_individuals(id) ON DELETE SET NULL,
  snapshot_id             uuid REFERENCES public.cap_table_snapshots(id),
  status                  text NOT NULL DEFAULT 'collecting' CHECK (status IN ('collecting','drafting','in_review','adopted','superseded','expired','cancelled','ineligible')),
  gate_check              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by              uuid DEFAULT auth.uid(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.val_inputs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id              uuid NOT NULL UNIQUE REFERENCES public.val_requests(id) ON DELETE CASCADE,
  cash                    numeric(20,2) NOT NULL DEFAULT 0,
  debt                    numeric(20,2) NOT NULL DEFAULT 0,
  historical_financials   jsonb NOT NULL DEFAULT '[]'::jsonb,
  projections             jsonb NOT NULL DEFAULT '{}'::jsonb,
  projections_assumptions text,
  recent_transactions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  material_events         jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.val_comps (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id          uuid NOT NULL REFERENCES public.val_requests(id) ON DELETE CASCADE,
  comp_name           text NOT NULL,
  ticker              text,
  ev_revenue_multiple numeric(12,4),
  ev_ebitda_multiple  numeric(12,4),
  volatility          numeric(8,6) CHECK (volatility IS NULL OR (volatility > 0 AND volatility < 5)),   -- decimal: 0.55 = 55%
  beta                numeric(8,4),
  source              text,
  as_of               date
);

CREATE TABLE IF NOT EXISTS public.val_approaches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id        uuid NOT NULL REFERENCES public.val_requests(id) ON DELETE CASCADE,
  method            text NOT NULL CHECK (method IN ('asset','dcf','market_guideline','market_transaction','backsolve')),
  enterprise_value  numeric(20,2),
  equity_value      numeric(20,2),
  weight_pct        numeric(6,3) NOT NULL DEFAULT 0 CHECK (weight_pct >= 0 AND weight_pct <= 100),
  rejected          boolean NOT NULL DEFAULT false,
  rationale         text,
  inputs            jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (request_id, method),
  CHECK (NOT rejected OR weight_pct = 0),
  CHECK (NOT rejected OR rationale IS NOT NULL)          -- 409A: considered and rejected approaches need a reason
);

CREATE TABLE IF NOT EXISTS public.val_allocations (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id                  uuid NOT NULL UNIQUE REFERENCES public.val_requests(id) ON DELETE CASCADE,
  method                      text NOT NULL CHECK (method IN ('opm','cvm','pwerm','hybrid')),
  equity_value_in             numeric(20,2) NOT NULL CHECK (equity_value_in >= 0),
  breakpoints                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  volatility                  numeric(8,6),
  time_to_liquidity_yrs       numeric(8,4),
  risk_free_rate              numeric(8,6),
  dividend_yield              numeric(8,6) NOT NULL DEFAULT 0,
  scenarios                   jsonb NOT NULL DEFAULT '[]'::jsonb,
  per_class_value             jsonb NOT NULL DEFAULT '{}'::jsonb,
  common_per_share_marketable numeric(20,8) NOT NULL CHECK (common_per_share_marketable >= 0),
  CHECK (method <> 'opm' OR (volatility IS NOT NULL AND time_to_liquidity_yrs IS NOT NULL AND risk_free_rate IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.val_dlom (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id  uuid NOT NULL UNIQUE REFERENCES public.val_requests(id) ON DELETE CASCADE,
  model       text NOT NULL CHECK (model IN ('finnerty','chaffee','ghaidarov','restricted_stock_study','pre_ipo_study')),
  inputs      jsonb NOT NULL DEFAULT '{}'::jsonb,
  dlom_pct    numeric(6,3) NOT NULL CHECK (dlom_pct >= 0 AND dlom_pct < 100),
  rationale   text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.val_reports (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_id                   uuid NOT NULL REFERENCES public.acct_entities(id),
  request_id                  uuid NOT NULL UNIQUE REFERENCES public.val_requests(id),
  method                      text NOT NULL,
  snapshot_id                 uuid REFERENCES public.cap_table_snapshots(id),
  valuation_date              date NOT NULL,
  report_date                 date NOT NULL,
  concluded_equity_value      numeric(20,2) NOT NULL,
  common_per_share_marketable numeric(20,8) NOT NULL,
  dlom_pct                    numeric(6,3) NOT NULL,
  fmv_per_share_common        numeric(20,8) NOT NULL CHECK (fmv_per_share_common >= 0),
  qualified_individual_id     uuid REFERENCES public.cap_qualified_individuals(id),
  report_document_id          uuid REFERENCES public.cap_documents(id),
  board_approval_id           uuid REFERENCES public.cap_board_approvals(id),
  valid_until                 date,
  superseded_by               uuid REFERENCES public.val_reports(id),
  status                      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','adopted','superseded','expired','withdrawn')),
  expired_reason              text,
  adopted_at                  timestamptz,
  adopted_by                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CHECK (report_date >= valuation_date),
  CHECK (status <> 'adopted' OR (valid_until IS NOT NULL AND board_approval_id IS NOT NULL))
);
SELECT platform__ensure_fk('cap_option_grants', 'val_report_id', 'val_reports', 'id', 'SET NULL', 'part 19');
SELECT platform__ensure_fk('cap_valuations',    'val_report_id', 'val_reports', 'id', 'SET NULL', 'part 19');

CREATE TABLE IF NOT EXISTS public.val_material_events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_id               uuid NOT NULL REFERENCES public.acct_entities(id),
  event_type              text NOT NULL CHECK (event_type IN ('financing','term_sheet','secondary_sale','patent','litigation','key_hire','key_departure',
                                                              'customer','acquisition_offer','ipo_planning','other')),
  event_date              date NOT NULL,
  description             text NOT NULL,
  triggers_revaluation    boolean NOT NULL DEFAULT false,
  resolved_val_request_id uuid REFERENCES public.val_requests(id) ON DELETE SET NULL,
  created_by              uuid DEFAULT auth.uid(),
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- adopted reports are permanent; only lifecycle columns move afterwards
CREATE OR REPLACE FUNCTION public.val__report_guard_trg()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_catalog' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' AND current_setting('app.allow_tenant_purge', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Adopted valuation reports are a permanent record';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' AND (NEW.fmv_per_share_common, NEW.valuation_date, NEW.report_date, NEW.concluded_equity_value, NEW.dlom_pct,
                                NEW.common_per_share_marketable, NEW.method, NEW.request_id, NEW.entity_id, NEW.board_approval_id)
                    IS DISTINCT FROM (OLD.fmv_per_share_common, OLD.valuation_date, OLD.report_date, OLD.concluded_equity_value, OLD.dlom_pct,
                                OLD.common_per_share_marketable, OLD.method, OLD.request_id, OLD.entity_id, OLD.board_approval_id) THEN
    RAISE EXCEPTION 'An adopted valuation cannot be edited; start a new valuation request';
  END IF;
  IF OLD.valid_until IS NOT NULL AND NEW.valid_until > OLD.valid_until THEN
    RAISE EXCEPTION 'A valuation''s validity can only be shortened';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_val_report_guard ON public.val_reports;
CREATE TRIGGER trg_val_report_guard BEFORE UPDATE OR DELETE ON public.val_reports FOR EACH ROW EXECUTE FUNCTION val__report_guard_trg();

-- Safe-harbor gate. p_as_of is the date the valuation is applied (valuation date at adoption,
-- grant date at grant time): the change-in-control / IPO look-forward runs from that date.
CREATE OR REPLACE FUNCTION public.val__gate(p_tenant_id uuid, p_entity_id uuid, p_method text, p_as_of date, p_qualified_individual_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE pr cap_issuer_profiles%ROWTYPE; q cap_qualified_individuals%ROWTYPE; v_checks jsonb := '[]'::jsonb; v_age numeric; v_putcall int;
BEGIN
  SELECT * INTO pr FROM cap_issuer_profiles WHERE tenant_id = p_tenant_id AND entity_id = p_entity_id;
  v_checks := v_checks || jsonb_build_object('code','issuer_profile','ok', pr.id IS NOT NULL,
                'detail', CASE WHEN pr.id IS NULL THEN 'Add the issuer profile (incorporation date, predecessor start, traded classes)' ELSE 'on file' END);
  IF p_method = 'illiquid_startup' THEN
    IF pr.id IS NOT NULL THEN
      v_age := round(((p_as_of - coalesce(pr.predecessor_start_date, pr.incorporated_on)) / 365.25)::numeric, 2);
      v_checks := v_checks || jsonb_build_object('code','under_10_years','ok', v_age < 10, 'detail', v_age || ' years in business (including predecessors)');
      v_checks := v_checks || jsonb_build_object('code','no_traded_class','ok', NOT pr.has_traded_class, 'detail',
                    CASE WHEN pr.has_traded_class THEN 'a class trades on an established market' ELSE 'no traded class' END);
      v_checks := v_checks || jsonb_build_object('code','no_cic_within_90_days','ok',
                    pr.anticipated_change_in_control_on IS NULL OR pr.anticipated_change_in_control_on > p_as_of + 90,
                    'detail', coalesce('change in control anticipated ' || pr.anticipated_change_in_control_on, 'none anticipated'));
      v_checks := v_checks || jsonb_build_object('code','no_ipo_within_180_days','ok',
                    pr.anticipated_ipo_on IS NULL OR pr.anticipated_ipo_on > p_as_of + 180,
                    'detail', coalesce('public offering anticipated ' || pr.anticipated_ipo_on, 'none anticipated'));
    END IF;
    SELECT count(*) INTO v_putcall FROM cap_share_classes c
     WHERE c.tenant_id = p_tenant_id AND c.entity_id = p_entity_id AND c.class_type = 'common' AND c.has_put_or_call AND NOT c.rofr_only;
    v_checks := v_checks || jsonb_build_object('code','no_put_or_call','ok', v_putcall = 0,
                  'detail', CASE WHEN v_putcall = 0 THEN 'common has no put/call beyond ROFR or lapse restrictions' ELSE v_putcall || ' common class(es) carry a put or call' END);
    SELECT * INTO q FROM cap_qualified_individuals WHERE id = p_qualified_individual_id AND tenant_id = p_tenant_id;
    v_checks := v_checks || jsonb_build_object('code','qualified_individual','ok', q.id IS NOT NULL AND q.years_experience >= 5,
                  'detail', CASE WHEN q.id IS NULL THEN 'name the person who performs the valuation'
                                 ELSE q.full_name || ', ' || q.years_experience || ' years relevant experience' END);
  ELSIF p_method = 'independent_appraisal' THEN
    SELECT * INTO q FROM cap_qualified_individuals WHERE id = p_qualified_individual_id AND tenant_id = p_tenant_id;
    v_checks := v_checks || jsonb_build_object('code','independent_appraiser','ok', q.id IS NOT NULL AND q.is_independent,
                  'detail', CASE WHEN q.id IS NULL THEN 'record the independent appraiser' WHEN NOT q.is_independent THEN 'appraiser is not marked independent' ELSE q.full_name || coalesce(' (' || q.firm || ')', '') END);
  END IF;
  RETURN jsonb_build_object('method', p_method, 'as_of', p_as_of,
           'passes', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_checks) c WHERE NOT (c->>'ok')::boolean),
           'checks', v_checks);
END $$;

CREATE OR REPLACE FUNCTION public.val_safe_harbor_check(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE r val_requests%ROWTYPE; g jsonb;
BEGIN
  SELECT * INTO r FROM val_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Valuation request not found'; END IF;
  PERFORM cap__assert_admin(r.tenant_id);
  g := val__gate(r.tenant_id, r.entity_id, r.method, r.valuation_date, r.qualified_individual_id);
  UPDATE val_requests SET gate_check = g, updated_at = now(),
         status = CASE WHEN r.method IN ('illiquid_startup','independent_appraisal') AND NOT (g->>'passes')::boolean AND r.status = 'collecting'
                       THEN 'ineligible' WHEN r.status = 'ineligible' AND (g->>'passes')::boolean THEN 'collecting' ELSE r.status END
   WHERE id = r.id;
  RETURN g;
END $$;

-- Open a valuation request and freeze the cap table it relies on
CREATE OR REPLACE FUNCTION public.val_open_request(p_tenant_id uuid, p_valuation_date date, p_method text DEFAULT 'independent_appraisal',
  p_entity_id uuid DEFAULT NULL, p_qualified_individual_id uuid DEFAULT NULL, p_provider_name text DEFAULT NULL, p_purpose text DEFAULT 'option_grant_fmv')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE v uuid; v_e uuid := coalesce(p_entity_id, acct_default_entity(p_tenant_id)); v_snap uuid;
BEGIN
  PERFORM cap__assert_admin(p_tenant_id);
  IF NOT EXISTS (SELECT 1 FROM acct_entities WHERE id = v_e AND tenant_id = p_tenant_id) THEN RAISE EXCEPTION 'Entity not found for this company'; END IF;
  v_snap := cap_take_snapshot(p_tenant_id, p_valuation_date, 'valuation');
  INSERT INTO val_requests(tenant_id, entity_id, valuation_date, purpose, method, provider_name, qualified_individual_id, snapshot_id)
  VALUES (p_tenant_id, v_e, p_valuation_date, p_purpose, p_method, p_provider_name, p_qualified_individual_id, v_snap) RETURNING id INTO v;
  INSERT INTO val_inputs(tenant_id, request_id) VALUES (p_tenant_id, v);
  PERFORM val_safe_harbor_check(v);
  RETURN v;
END $$;

-- Draft the report from the approaches, allocation and DLOM on file
CREATE OR REPLACE FUNCTION public.val_draft_report(p_request_id uuid, p_report_date date DEFAULT current_date, p_report_document_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE r val_requests%ROWTYPE; al val_allocations%ROWTYPE; dl val_dlom%ROWTYPE; v_w numeric; v_ev numeric; v uuid;
BEGIN
  SELECT * INTO r FROM val_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Valuation request not found'; END IF;
  PERFORM cap__assert_admin(r.tenant_id);
  IF r.status NOT IN ('collecting','drafting','in_review') THEN RAISE EXCEPTION 'Request is %', r.status; END IF;
  SELECT coalesce(sum(weight_pct),0), sum(coalesce(equity_value, enterprise_value) * weight_pct / 100)
    INTO v_w, v_ev FROM val_approaches WHERE request_id = r.id AND NOT rejected;
  IF abs(v_w - 100) > 0.001 THEN RAISE EXCEPTION 'Approach weights add to %%%; they must add to 100%%', v_w; END IF;
  IF NOT EXISTS (SELECT 1 FROM val_approaches WHERE request_id = r.id) OR
     (SELECT count(*) FROM val_approaches WHERE request_id = r.id) < 3 THEN
    RAISE EXCEPTION 'Record the asset, income and market approaches (use rejected = true with a rationale for any not relied on)';
  END IF;
  SELECT * INTO al FROM val_allocations WHERE request_id = r.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Add the equity allocation (OPM, CVM, PWERM or hybrid)'; END IF;
  SELECT * INTO dl FROM val_dlom WHERE request_id = r.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Add the discount for lack of marketability'; END IF;
  INSERT INTO val_reports(tenant_id, entity_id, request_id, method, snapshot_id, valuation_date, report_date, concluded_equity_value,
         common_per_share_marketable, dlom_pct, fmv_per_share_common, qualified_individual_id, report_document_id)
  VALUES (r.tenant_id, r.entity_id, r.id, r.method, r.snapshot_id, r.valuation_date, p_report_date, coalesce(al.equity_value_in, v_ev),
          al.common_per_share_marketable, dl.dlom_pct, round(al.common_per_share_marketable * (1 - dl.dlom_pct / 100), 8),
          r.qualified_individual_id, p_report_document_id)
  ON CONFLICT (request_id) DO UPDATE SET report_date = EXCLUDED.report_date, concluded_equity_value = EXCLUDED.concluded_equity_value,
         common_per_share_marketable = EXCLUDED.common_per_share_marketable, dlom_pct = EXCLUDED.dlom_pct,
         fmv_per_share_common = EXCLUDED.fmv_per_share_common, qualified_individual_id = EXCLUDED.qualified_individual_id,
         report_document_id = coalesce(EXCLUDED.report_document_id, val_reports.report_document_id)
   WHERE val_reports.status = 'draft'
  RETURNING id INTO v;
  IF v IS NULL THEN RAISE EXCEPTION 'This request already has an adopted report'; END IF;
  UPDATE val_requests SET status = 'in_review', updated_at = now() WHERE id = r.id;
  RETURN v;
END $$;

-- Board adopts the report: becomes the FMV of record (cap_valuations) until 12 months pass or a
-- material event intervenes; earlier valuations for the issuer are superseded.
CREATE OR REPLACE FUNCTION public.val_adopt_report(p_report_id uuid, p_board_approval_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE rp val_reports%ROWTYPE; rq val_requests%ROWTYPE; ba cap_board_approvals%ROWTYPE; g jsonb; v_until date; v_evt date; v_val uuid; v_prev record;
BEGIN
  SELECT * INTO rp FROM val_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Valuation report not found'; END IF;
  PERFORM cap__assert_admin(rp.tenant_id);
  IF rp.status <> 'draft' THEN RAISE EXCEPTION 'Report is %', rp.status; END IF;
  SELECT * INTO rq FROM val_requests WHERE id = rp.request_id FOR UPDATE;
  SELECT * INTO ba FROM cap_board_approvals WHERE id = p_board_approval_id AND tenant_id = rp.tenant_id AND entity_id = rp.entity_id;
  IF NOT FOUND OR ba.approval_type <> 'valuation_adopt' THEN RAISE EXCEPTION 'Use a board approval of type valuation_adopt for this entity'; END IF;
  IF ba.adopted_on < rp.report_date THEN RAISE EXCEPTION 'The board cannot adopt a report dated after its approval'; END IF;
  IF rp.method IN ('illiquid_startup','independent_appraisal') AND rp.report_document_id IS NULL THEN
    RAISE EXCEPTION 'Attach the written valuation report before adoption';
  END IF;
  g := val__gate(rp.tenant_id, rp.entity_id, rp.method, rp.valuation_date, rp.qualified_individual_id);
  IF rp.method IN ('illiquid_startup','independent_appraisal') AND NOT (g->>'passes')::boolean THEN
    RAISE EXCEPTION 'Safe-harbor requirements not met: %', (SELECT string_agg(c->>'code' || ' (' || (c->>'detail') || ')', '; ')
                                                            FROM jsonb_array_elements(g->'checks') c WHERE NOT (c->>'ok')::boolean);
  END IF;
  -- valid for at most 12 months, and not past a triggering material event already on file
  SELECT min(event_date) INTO v_evt FROM val_material_events
   WHERE tenant_id = rp.tenant_id AND entity_id = rp.entity_id AND triggers_revaluation AND resolved_val_request_id IS NULL AND event_date > rp.valuation_date;
  IF v_evt IS NOT NULL AND v_evt <= ba.adopted_on THEN
    RAISE EXCEPTION 'A material event on % postdates the valuation date; refresh the valuation (or resolve the event with this request)', v_evt;
  END IF;
  v_until := least((rp.valuation_date + interval '12 months' - interval '1 day')::date, coalesce(v_evt - 1, 'infinity'::date));
  -- supersede the prior valuation of record
  FOR v_prev IN SELECT id FROM val_reports WHERE tenant_id = rp.tenant_id AND entity_id = rp.entity_id AND status = 'adopted' AND id <> rp.id LOOP
    UPDATE val_reports SET status = 'superseded', superseded_by = rp.id,
           valid_until = least(valid_until, greatest(rp.valuation_date - 1, valuation_date)) WHERE id = v_prev.id;
  END LOOP;
  UPDATE cap_valuations SET status = 'superseded', expires_on = least(expires_on, greatest(rp.valuation_date - 1, effective_date))
   WHERE tenant_id = rp.tenant_id AND coalesce(entity_id, rp.entity_id) = rp.entity_id AND status = 'final' AND valuation_type = '409a';
  INSERT INTO cap_valuations(tenant_id, entity_id, valuation_type, effective_date, expires_on, fmv_per_common_share, provider,
         report_document_id, board_approved_on, status, method, val_report_id, notes)
  VALUES (rp.tenant_id, rp.entity_id, '409a', rp.valuation_date, v_until, rp.fmv_per_share_common, rq.provider_name,
          rp.report_document_id, ba.adopted_on, 'final', rp.method, rp.id, 'Adopted from valuation request ' || rq.id)
  RETURNING id INTO v_val;
  UPDATE val_reports SET status = 'adopted', board_approval_id = ba.id, valid_until = v_until, adopted_at = now(), adopted_by = auth.uid() WHERE id = rp.id;
  UPDATE val_requests SET status = 'adopted', gate_check = g, updated_at = now() WHERE id = rq.id;
  UPDATE val_requests SET status = 'superseded', updated_at = now()
   WHERE tenant_id = rp.tenant_id AND entity_id = rp.entity_id AND status = 'adopted' AND id <> rq.id;
  UPDATE val_material_events SET resolved_val_request_id = rq.id
   WHERE tenant_id = rp.tenant_id AND entity_id = rp.entity_id AND triggers_revaluation AND resolved_val_request_id IS NULL AND event_date <= rp.valuation_date;
  PERFORM cap__event(rp.tenant_id, 'valuation', rp.valuation_date, NULL, NULL, NULL, NULL, 'val_reports', rp.id,
                     jsonb_build_object('fmv_per_share_common', rp.fmv_per_share_common, 'method', rp.method, 'valid_until', v_until, 'cap_valuation_id', v_val));
  RETURN v_val;
END $$;

-- A triggering material event ends the current valuation's reliance the day before the event
CREATE OR REPLACE FUNCTION public.val__material_event_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
BEGIN
  IF NEW.triggers_revaluation AND NEW.resolved_val_request_id IS NULL THEN
    UPDATE val_reports SET valid_until = greatest(NEW.event_date - 1, valuation_date),
           expired_reason = 'Material event ' || NEW.event_type || ' on ' || NEW.event_date
     WHERE tenant_id = NEW.tenant_id AND entity_id = NEW.entity_id AND status = 'adopted'
       AND valuation_date < NEW.event_date AND valid_until >= NEW.event_date;
    UPDATE cap_valuations SET expires_on = greatest(NEW.event_date - 1, effective_date),
           expired_reason = 'Material event ' || NEW.event_type || ' on ' || NEW.event_date
     WHERE tenant_id = NEW.tenant_id AND coalesce(entity_id, NEW.entity_id) = NEW.entity_id AND status = 'final' AND valuation_type = '409a'
       AND effective_date < NEW.event_date AND expires_on >= NEW.event_date;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_val_material_event ON public.val_material_events;
CREATE TRIGGER trg_val_material_event AFTER INSERT OR UPDATE OF triggers_revaluation ON public.val_material_events
  FOR EACH ROW EXECUTE FUNCTION val__material_event_trg();

CREATE OR REPLACE VIEW public.val_active_fmv WITH (security_invoker = true) AS
  SELECT v.tenant_id, v.entity_id, v.id AS cap_valuation_id, v.val_report_id, v.fmv_per_common_share, v.effective_date, v.expires_on, v.method
    FROM public.cap_valuations v
   WHERE v.status = 'final' AND v.valuation_type = '409a' AND current_date BETWEEN v.effective_date AND v.expires_on;

-- -------------------------------------------------------------------------------------
-- G. Grant-time guards (any write path: function, import, or direct insert)
-- -------------------------------------------------------------------------------------
-- voting power of a holder in an issuer as of a date (ISO 10% rule; attribution not modeled)
CREATE OR REPLACE FUNCTION public.cap__voting_pct(p_tenant_id uuid, p_entity_id uuid, p_stakeholder_id uuid, p_as_of date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
  WITH v AS (
    SELECT i.stakeholder_id sid, sum(i.shares * c.votes_per_share * CASE WHEN c.class_type = 'preferred' THEN c.conversion_ratio ELSE 1 END) votes
      FROM cap_issuances i JOIN cap_share_classes c ON c.id = i.share_class_id
     WHERE i.tenant_id = p_tenant_id AND c.entity_id = p_entity_id AND i.status = 'active' AND i.issue_date <= p_as_of
     GROUP BY 1)
  SELECT coalesce((SELECT votes FROM v WHERE sid = p_stakeholder_id) / nullif((SELECT sum(votes) FROM v), 0) * 100, 0);
$$;

CREATE OR REPLACE FUNCTION public.cap__grant_409a_guard_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE v_entity uuid; v cap_valuations%ROWTYPE; g jsonb; v_pct numeric;
BEGIN
  IF NEW.grant_type = 'rsu' THEN RETURN NEW; END IF;
  SELECT c.entity_id INTO v_entity FROM cap_option_pools p JOIN cap_share_classes c ON c.id = p.share_class_id WHERE p.id = NEW.pool_id;
  SELECT * INTO v FROM cap_valuations x
   WHERE x.tenant_id = NEW.tenant_id AND coalesce(x.entity_id, v_entity) = v_entity AND x.valuation_type = '409a'
     AND x.status IN ('final','superseded') AND NEW.granted_on BETWEEN x.effective_date AND x.expires_on
   ORDER BY x.effective_date DESC LIMIT 1;
  IF v.id IS NULL THEN
    IF current_setting('cap.historical_import', true) = 'on' AND (auth.role() = 'service_role' OR platform_is_admin()) THEN
      NEW.imported_without_409a := true;  -- legacy grant brought over; the compliance check lists it
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'No 409A valuation covers %; adopt a current valuation before granting options', NEW.granted_on;
  END IF;
  NEW.valuation_id := v.id; NEW.val_report_id := v.val_report_id;
  IF NEW.exercise_price < v.fmv_per_common_share THEN
    RAISE EXCEPTION 'Exercise price % is below the 409A fair market value % (valuation of %)', NEW.exercise_price, v.fmv_per_common_share, v.effective_date;
  END IF;
  IF NEW.grant_type = 'iso' THEN
    v_pct := cap__voting_pct(NEW.tenant_id, v_entity, NEW.stakeholder_id, NEW.granted_on);
    IF v_pct > 10 THEN
      IF NEW.exercise_price < round(v.fmv_per_common_share * 1.1, 8) THEN
        RAISE EXCEPTION 'Holder has % %% of voting power; an ISO must be priced at 110%% of FMV (at least %)', round(v_pct, 2), round(v.fmv_per_common_share * 1.1, 8);
      END IF;
      IF NEW.expires_on IS NULL OR NEW.expires_on > (NEW.granted_on + interval '5 years')::date THEN
        NEW.expires_on := (NEW.granted_on + interval '5 years')::date;   -- 5-year maximum term for a 10% holder ISO
      END IF;
    END IF;
  END IF;
  -- the start-up presumption is tested again when the valuation is applied
  IF v.method = 'illiquid_startup' THEN
    g := val__gate(NEW.tenant_id, v_entity, 'illiquid_startup', NEW.granted_on,
                   (SELECT qualified_individual_id FROM val_reports WHERE id = v.val_report_id));
    IF NOT (g->>'passes')::boolean THEN
      RAISE EXCEPTION 'The start-up valuation cannot be relied on for a grant on %: %', NEW.granted_on,
        (SELECT string_agg(c->>'code', ', ') FROM jsonb_array_elements(g->'checks') c WHERE NOT (c->>'ok')::boolean);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cap_grant_409a_guard ON public.cap_option_grants;
CREATE TRIGGER trg_cap_grant_409a_guard BEFORE INSERT OR UPDATE OF exercise_price, granted_on, pool_id, stakeholder_id, grant_type
  ON public.cap_option_grants FOR EACH ROW EXECUTE FUNCTION cap__grant_409a_guard_trg();

-- 83(b): restricted stock (and early-exercised unvested options) has a 30-day election window
CREATE OR REPLACE FUNCTION public.cap__issuance_83b_trg()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_catalog' AS $$
BEGIN
  IF NEW.vesting_start IS NOT NULL AND coalesce(NEW.vesting_months, 0) > 0 AND NEW.form_83b_due_on IS NULL THEN
    NEW.form_83b_due_on := NEW.issue_date + 30;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cap_issuance_83b ON public.cap_issuances;
CREATE TRIGGER trg_cap_issuance_83b BEFORE INSERT OR UPDATE OF vesting_start, vesting_months ON public.cap_issuances
  FOR EACH ROW EXECUTE FUNCTION cap__issuance_83b_trg();

CREATE OR REPLACE FUNCTION public.cap__early_exercise_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE g cap_option_grants%ROWTYPE;
BEGIN
  SELECT * INTO g FROM cap_option_grants WHERE id = NEW.grant_id;
  IF g.early_exercise AND NEW.issuance_id IS NOT NULL AND cap_vested_shares(g.id, NEW.exercised_on) < g.exercised_shares THEN
    -- unvested shares were bought: they stay subject to repurchase on the option's schedule
    UPDATE cap_issuances SET vesting_start = g.vesting_start, vesting_months = g.vesting_months, cliff_months = g.cliff_months,
           form_83b_due_on = NEW.exercised_on + 30
     WHERE id = NEW.issuance_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cap_early_exercise ON public.cap_option_exercises;
CREATE TRIGGER trg_cap_early_exercise AFTER INSERT ON public.cap_option_exercises FOR EACH ROW EXECUTE FUNCTION cap__early_exercise_trg();

CREATE OR REPLACE FUNCTION public.cap_record_83b_filing(p_issuance_id uuid, p_filed_on date, p_document_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
DECLARE i cap_issuances%ROWTYPE;
BEGIN
  SELECT * INTO i FROM cap_issuances WHERE id = p_issuance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Issuance not found'; END IF;
  IF NOT (platform_is_tenant_admin(i.tenant_id) OR cap__is_holder(i.stakeholder_id) OR auth.role() = 'service_role' OR platform_is_admin()) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF i.form_83b_due_on IS NULL THEN RAISE EXCEPTION 'These shares are not subject to vesting; no 83(b) election applies'; END IF;
  UPDATE cap_issuances SET form_83b_filed_on = p_filed_on WHERE id = i.id;
  PERFORM cap__event(i.tenant_id, 'issuance', p_filed_on, i.stakeholder_id, i.share_class_id, 0, NULL, 'cap_issuances', i.id,
                     jsonb_build_object('action', '83b_filed', 'filed_on', p_filed_on, 'on_time', p_filed_on <= i.form_83b_due_on, 'document_id', p_document_id));
END $$;

-- -------------------------------------------------------------------------------------
-- H. Compliance check (Part 14 controls + 409A, ISO and 83(b))
-- -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cap_compliance_check(p_tenant_id uuid, p_as_of date DEFAULT current_date)
RETURNS TABLE(severity text, check_code text, message text, related_type text, related_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
BEGIN
  PERFORM cap__assert_admin(p_tenant_id);
  RETURN QUERY
  SELECT * FROM cap_controls_check(p_tenant_id, p_as_of)
  UNION ALL
  SELECT 'medium', 'issuer_profile_missing', coalesce(e.display_name, e.legal_name) || ' issues equity but has no issuer profile', 'acct_entities', e.id
    FROM acct_entities e
   WHERE e.tenant_id = p_tenant_id AND EXISTS (SELECT 1 FROM cap_share_classes c WHERE c.entity_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM cap_issuer_profiles pr WHERE pr.entity_id = e.id)
  UNION ALL
  SELECT 'high', '83b_overdue', 'The 83(b) election for ' || coalesce(i.certificate_no, i.id::text) || ' was due ' || i.form_83b_due_on, 'cap_issuances', i.id
    FROM cap_issuances i WHERE i.tenant_id = p_tenant_id AND i.form_83b_due_on < p_as_of AND i.form_83b_filed_on IS NULL AND i.status = 'active'
  UNION ALL
  SELECT 'medium', '83b_due_soon', 'The 83(b) election for ' || coalesce(i.certificate_no, i.id::text) || ' is due ' || i.form_83b_due_on, 'cap_issuances', i.id
    FROM cap_issuances i WHERE i.tenant_id = p_tenant_id AND i.form_83b_due_on BETWEEN p_as_of AND p_as_of + 10 AND i.form_83b_filed_on IS NULL
  UNION ALL
  SELECT 'high', 'grant_imported_without_409a', 'Grant ' || g.grant_number || ' was imported with no 409A valuation on file', 'cap_option_grants', g.id
    FROM cap_option_grants g WHERE g.tenant_id = p_tenant_id AND g.imported_without_409a
  UNION ALL
  SELECT 'high', 'valuation_stale_after_event', 'Material event (' || m.event_type || ', ' || m.event_date || ') has no refreshed valuation', 'val_material_events', m.id
    FROM val_material_events m WHERE m.tenant_id = p_tenant_id AND m.triggers_revaluation AND m.resolved_val_request_id IS NULL
  UNION ALL
  SELECT 'medium', 'no_current_409a', coalesce(e.display_name, e.legal_name) || ' has no 409A valuation in effect', 'acct_entities', e.id
    FROM acct_entities e
   WHERE e.tenant_id = p_tenant_id AND EXISTS (SELECT 1 FROM cap_option_pools p JOIN cap_share_classes c ON c.id = p.share_class_id WHERE c.entity_id = e.id)
     AND NOT EXISTS (SELECT 1 FROM cap_valuations v WHERE v.tenant_id = p_tenant_id AND coalesce(v.entity_id, e.id) = e.id AND v.status = 'final'
                       AND v.valuation_type = '409a' AND p_as_of BETWEEN v.effective_date AND v.expires_on)
  UNION ALL
  SELECT 'medium', 'iso_plan_not_shareholder_approved', p.name || ' grants ISOs but shareholders have not approved it within 12 months of adoption', 'cap_option_pools', p.id
    FROM cap_option_pools p
   WHERE p.tenant_id = p_tenant_id AND EXISTS (SELECT 1 FROM cap_option_grants g WHERE g.pool_id = p.id AND g.grant_type = 'iso')
     AND (p.shareholder_approved_on IS NULL OR (p.adopted_on IS NOT NULL AND abs(p.shareholder_approved_on - p.adopted_on) > 366))
  UNION ALL
  SELECT 'low', 'qualified_individual_experience', q.full_name || ' has ' || q.years_experience || ' years of experience (5 is the general standard)', 'cap_qualified_individuals', q.id
    FROM cap_qualified_individuals q WHERE q.tenant_id = p_tenant_id AND q.years_experience < 5
  UNION ALL
  SELECT 'low', 'grant_missing_board_approval', 'Grant ' || g.grant_number || ' has no board approval record', 'cap_option_grants', g.id
    FROM cap_option_grants g WHERE g.tenant_id = p_tenant_id AND g.board_approval_id IS NULL AND g.board_consent_document_id IS NULL;
END $$;

-- holders see their own position without seeing the company's cap table
CREATE OR REPLACE FUNCTION public.cap_my_holdings(p_as_of date DEFAULT current_date)
RETURNS TABLE(tenant_id uuid, stakeholder_id uuid, kind text, reference text, share_class text, quantity numeric, vested numeric,
              exercise_price numeric, issued_on date, expires_on date, form_83b_due_on date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_catalog' AS $$
  SELECT i.tenant_id, i.stakeholder_id, 'shares', i.certificate_no, c.name, i.shares,
         CASE WHEN i.vesting_start IS NULL OR coalesce(i.vesting_months,0) = 0 THEN i.shares
              WHEN cap__months(i.vesting_start, p_as_of) < coalesce(i.cliff_months,0) THEN 0
              ELSE least(i.shares, floor(i.shares * least(i.vesting_months, greatest(cap__months(i.vesting_start, p_as_of),0))::numeric / i.vesting_months)) END,
         NULL::numeric, i.issue_date, NULL::date, i.form_83b_due_on
    FROM cap_issuances i JOIN cap_share_classes c ON c.id = i.share_class_id JOIN cap_stakeholders s ON s.id = i.stakeholder_id
   WHERE s.user_id = auth.uid() AND i.status = 'active'
  UNION ALL
  SELECT g.tenant_id, g.stakeholder_id, g.grant_type, g.grant_number, c.name, g.shares - g.exercised_shares - g.cancelled_shares,
         greatest(cap_vested_shares(g.id, p_as_of) - g.exercised_shares, 0), g.exercise_price, g.granted_on, g.expires_on, NULL::date
    FROM cap_option_grants g JOIN cap_option_pools p ON p.id = g.pool_id JOIN cap_share_classes c ON c.id = p.share_class_id
    JOIN cap_stakeholders s ON s.id = g.stakeholder_id
   WHERE s.user_id = auth.uid() AND g.status = 'active';
$$;

-- -------------------------------------------------------------------------------------
-- I. Part 14 analytics are admin-only (the whole cap table, models and waterfalls are sensitive)
-- -------------------------------------------------------------------------------------
DO $$
DECLARE f record; v_def text;
BEGIN
  FOR f IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('cap_table','cap_model_round','cap_liquidation_waterfall','cap_controls_check') LOOP
    v_def := pg_get_functiondef(f.oid);
    IF position('PERFORM acct_assert_access(p_tenant_id);' IN v_def) > 0 THEN
      EXECUTE replace(v_def, 'PERFORM acct_assert_access(p_tenant_id);', 'PERFORM cap__assert_admin(p_tenant_id);  -- owners/admins only (platform_is_tenant_admin)');
    END IF;
  END LOOP;
END $$;

-- -------------------------------------------------------------------------------------
-- J. Registry, indexes, row security, function privileges
-- -------------------------------------------------------------------------------------
INSERT INTO platform_polymorphic_type_map VALUES
  ('board_approval','cap_board_approvals'), ('valuation_request','val_requests'), ('valuation_report','val_reports'),
  ('material_event','val_material_events'), ('cap_snapshot','cap_table_snapshots'), ('issuer_profile','cap_issuer_profiles')
ON CONFLICT (type_value) DO NOTHING;

-- every foreign key on cap_/val_ tables gets a supporting index
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text tbl, a.attname col
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1 AND c.connamespace = 'public'::regnamespace
       AND c.conrelid::regclass::text ~ '^(cap|val)_'
       AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (%I)', left(r.tbl || '_' || r.col || '_fk', 63), r.tbl, r.col);
  END LOOP;
END $$;

-- registry pass first (enables RLS, platform-admin policy), then replace member access on equity tables
SELECT count(*) FROM platform__apply_app_security();

DO $$
DECLARE t text; p record;
  v_setup  text[] := ARRAY['cap_documents','cap_stakeholders','cap_share_classes','cap_option_pools','cap_funding_rounds','cap_issuer_profiles',
                           'cap_board_approvals','cap_qualified_individuals','cap_vesting_schedules',
                           'val_requests','val_inputs','val_comps','val_approaches','val_allocations','val_dlom','val_material_events'];
  v_ledger text[] := ARRAY['cap_issuances','cap_option_grants','cap_option_exercises','cap_convertibles','cap_equity_events',
                           'cap_valuations','cap_table_snapshots','val_reports'];
  v_holder text[] := ARRAY['cap_issuances','cap_option_grants','cap_convertibles'];
BEGIN
  FOREACH t IN ARRAY v_setup || v_ledger LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname <> 'app_platform_admin' LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('CREATE POLICY cap_admin_read ON public.%I FOR SELECT TO authenticated USING (public.platform_is_tenant_admin(tenant_id))', t);
    IF t = ANY (v_setup) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
      EXECUTE format('CREATE POLICY cap_admin_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.platform_is_tenant_admin(tenant_id))', t);
      EXECUTE format('CREATE POLICY cap_admin_update ON public.%I FOR UPDATE TO authenticated USING (public.platform_is_tenant_admin(tenant_id)) WITH CHECK (public.platform_is_tenant_admin(tenant_id))', t);
      EXECUTE format('CREATE POLICY cap_admin_delete ON public.%I FOR DELETE TO authenticated USING (public.platform_is_tenant_admin(tenant_id))', t);
    ELSE
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated', t);
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    END IF;
    IF t = ANY (v_holder) THEN
      EXECUTE format('CREATE POLICY cap_holder_read ON public.%I FOR SELECT TO authenticated USING (public.cap__is_holder(stakeholder_id))', t);
    END IF;
  END LOOP;
  CREATE POLICY cap_holder_read ON public.cap_stakeholders FOR SELECT TO authenticated USING (user_id = auth.uid());
  CREATE POLICY cap_holder_read ON public.cap_option_exercises FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.cap_option_grants g WHERE g.id = grant_id AND public.cap__is_holder(g.stakeholder_id)));
  UPDATE platform_table_registry SET notes = 'part 19: admin read, holder self-read; ' ||
         CASE WHEN table_name = ANY (v_ledger) THEN 'written by cap_/val_ functions only' ELSE 'admin write' END
   WHERE table_name = ANY (v_setup || v_ledger);
END $$;

-- functions: internals (name__x, triggers) service-only; user-facing functions check access themselves
DO $$
DECLARE f record; v_sig text;
BEGIN
  FOR f IN SELECT p.oid, p.proname, pg_get_function_result(p.oid) res FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
              AND p.proname IN ('cap__assert_admin','cap__is_holder','cap__event_hash','cap__event_chain_trg','cap_verify_event_chain','cap_take_snapshot',
                                'cap__apply_vesting_template_trg','cap_vesting_schedule','val__report_guard_trg','val__gate','val_safe_harbor_check',
                                'val_open_request','val_draft_report','val_adopt_report','val__material_event_trg','cap__voting_pct',
                                'cap__grant_409a_guard_trg','cap__issuance_83b_trg','cap__early_exercise_trg','cap_record_83b_filing',
                                'cap_compliance_check','cap_my_holdings','cap_table','cap_model_round','cap_liquidation_waterfall','cap_controls_check') LOOP
    v_sig := f.oid::regprocedure::text;
    EXECUTE 'REVOKE ALL ON FUNCTION ' || v_sig || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_sig || ' TO service_role';
    IF f.proname = 'cap__is_holder' THEN
      EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_sig || ' TO authenticated';      -- RLS predicate about auth.uid() only
    ELSIF f.res = 'trigger' OR f.proname LIKE '%\_\_%' THEN
      EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || v_sig || ' FROM authenticated';
    ELSE
      EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_sig || ' TO authenticated';
    END IF;
  END LOOP;
END $$;

COMMIT;
