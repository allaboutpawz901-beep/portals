-- CANONICAL STEP 230  |  file S230_platform_canonical.sql  |  was unify/03_platform_canonical.sql  |  internal log label '03' (unchanged)
-- =====================================================================
-- S230_platform_canonical.sql — the four cross-domain platform tables the
-- §4 map points at but that do not exist yet, plus backfill and live
-- forwarding from every per-domain source:
--
--   platform_audit_events      <- acct/cms/commerce/crm/erp_audit_log, activity_log
--   platform_idempotency_keys  <- acct_integration_idempotency, commerce_idempotency,
--                                 crm_idempotency_keys, erp_idempotency_keys
--   platform_outbox            <- commerce_outbox_events, social_outbox_events, email_outbox
--   platform_jobs              <- sync_jobs, support_jobs, provider_jobs
--   integration_webhook_inbox  <- stripe_/paypal_/commerce_webhook_events  (table exists)
--   platform_saved_views       <- crm_saved_views (+ saved_views if present)
--
-- Producers that live DB functions still write (acct_audit_row_change,
-- outbox_emit, email_enqueue, enqueue_sync_job ...) keep writing their own
-- table; an AFTER trigger mirrors every row into the canonical table, so the
-- canonical table is always complete and is the one the app reads.
-- Forwarders never block the producer (errors are logged to unify.run_log).
-- Idempotent.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 230 (internal label '03'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S230_platform_canonical.sql is step 230; run S200_unify_preflight.sql and every step up to 220 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('230');
END $guard$;
BEGIN;

CREATE OR REPLACE FUNCTION unify.try_uuid(t text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN RETURN t::uuid; EXCEPTION WHEN others THEN RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION unify.try_ts(t text) RETURNS timestamptz LANGUAGE plpgsql STABLE AS $$
BEGIN RETURN t::timestamptz; EXCEPTION WHEN others THEN RETURN NULL; END $$;
CREATE OR REPLACE FUNCTION unify.tenant_or_null(t text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM public.tenants WHERE id = unify.try_uuid(t) $$;
CREATE OR REPLACE FUNCTION unify.user_or_null(t text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM auth.users WHERE id = unify.try_uuid(t) $$;

-- ---------------------------------------------------------------- tables
CREATE TABLE IF NOT EXISTS public.platform_audit_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label   text,
  action        text NOT NULL,
  object_table  text,
  object_ref    text,
  summary       text,
  before_data   jsonb,
  after_data    jsonb,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_table  text NOT NULL DEFAULT 'platform_audit_events',
  source_id     text NOT NULL DEFAULT gen_random_uuid()::text,
  ingested_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_audit_events_source_uq UNIQUE (source_table, source_id)
);
CREATE INDEX IF NOT EXISTS platform_audit_events_tenant_time_idx ON public.platform_audit_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_events_object_idx ON public.platform_audit_events(object_table, object_ref);

CREATE TABLE IF NOT EXISTS public.platform_idempotency_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope           text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash    text,
  response_status integer,
  response_body   jsonb,
  resource_table  text,
  resource_ref    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  source_table    text NOT NULL DEFAULT 'platform_idempotency_keys',
  source_id       text NOT NULL DEFAULT gen_random_uuid()::text,
  CONSTRAINT platform_idempotency_keys_source_uq UNIQUE (source_table, source_id)
);
CREATE INDEX IF NOT EXISTS platform_idempotency_keys_lookup_idx ON public.platform_idempotency_keys(tenant_id, scope, idempotency_key);

CREATE TABLE IF NOT EXISTS public.platform_outbox (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel        text NOT NULL,                 -- commerce | social | email | ...
  event_type     text NOT NULL,
  aggregate_type text,
  aggregate_ref  text,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','delivered','failed','dead')),
  attempts       integer NOT NULL DEFAULT 0,
  available_at   timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  source_table   text NOT NULL DEFAULT 'platform_outbox',
  source_id      text NOT NULL DEFAULT gen_random_uuid()::text,
  CONSTRAINT platform_outbox_source_uq UNIQUE (source_table, source_id)
);
CREATE INDEX IF NOT EXISTS platform_outbox_pending_idx ON public.platform_outbox(status, available_at) WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS platform_outbox_tenant_idx ON public.platform_outbox(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  queue         text NOT NULL,                  -- sync | support | provider | ...
  job_type      text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  result        jsonb,
  status        text NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer,
  run_at        timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  source_table  text NOT NULL DEFAULT 'platform_jobs',
  source_id     text NOT NULL DEFAULT gen_random_uuid()::text,
  CONSTRAINT platform_jobs_source_uq UNIQUE (source_table, source_id)
);
CREATE INDEX IF NOT EXISTS platform_jobs_queue_idx ON public.platform_jobs(queue, status, run_at);
CREATE INDEX IF NOT EXISTS platform_jobs_tenant_idx ON public.platform_jobs(tenant_id, created_at DESC);

-- platform_saved_views needs tenant scope to absorb crm_saved_views
ALTER TABLE public.platform_saved_views ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE public.platform_saved_views ADD COLUMN IF NOT EXISTS query text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_saved_views_tenant_fk') THEN
    ALTER TABLE public.platform_saved_views ADD CONSTRAINT platform_saved_views_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS platform_saved_views_tenant_idx ON public.platform_saved_views(tenant_id, entity_type);

-- -------------------------------------------------------- row mappers
CREATE OR REPLACE FUNCTION unify.map_audit(src text, j jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.platform_audit_events(tenant_id, occurred_at, actor_user_id, actor_label, action, object_table, object_ref,
                                           summary, before_data, after_data, payload, source_table, source_id)
  VALUES (unify.tenant_or_null(j->>'tenant_id'),
          coalesce(unify.try_ts(coalesce(j->>'event_time', j->>'occurred_at', j->>'created_at', j->>'createdAt', j->>'changed_at', j->>'logged_at')), now()),
          unify.user_or_null(coalesce(j->>'actor_user_id', j->>'actor_id', j->>'user_id', j->>'changed_by', j->>'performed_by', j->>'created_by')),
          coalesce(j->>'actor', j->>'actor_email', j->>'actor_name'),
          coalesce(j->>'action', j->>'operation', j->>'op', j->>'event_type', j->>'activity_type', 'change'),
          coalesce(j->>'table_name', j->>'entity_type', j->>'entity', j->>'object_type', j->>'resource_type', src),
          coalesce(j->>'record_id', j->>'entity_id', j->>'entityId', j->>'object_id', j->>'resource_id', j->>'row_id'),
          coalesce(j->>'summary', j->>'description', j->>'message'),
          coalesce(j->'before_data', j->'old_data', j->'old_values', j->'before'),
          coalesce(j->'after_data', j->'new_data', j->'new_values', j->'after'),
          j, src, coalesce(j->>'id', md5(j::text)))
  ON CONFLICT (source_table, source_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION unify.map_idem(src text, j jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.platform_idempotency_keys(tenant_id, scope, idempotency_key, request_hash, response_status, response_body,
                                               resource_table, resource_ref, created_at, expires_at, source_table, source_id)
  VALUES (unify.tenant_or_null(j->>'tenant_id'),
          coalesce(j->>'operation', j->>'scope', j->>'endpoint', src),
          coalesce(j->>'idempotency_key', j->>'key', j->>'idem_key', j->>'request_key', j->>'id'),
          j->>'request_hash',
          CASE WHEN j->>'response_status' ~ '^\d+$' THEN (j->>'response_status')::int END,
          coalesce(j->'response_body', j->'response', j->'result'),
          j->>'resource_type', j->>'resource_id',
          coalesce(unify.try_ts(j->>'created_at'), now()), unify.try_ts(j->>'expires_at'),
          src, coalesce(j->>'id', md5(j::text)))
  ON CONFLICT (source_table, source_id) DO UPDATE
     SET response_status = EXCLUDED.response_status, response_body = EXCLUDED.response_body, expires_at = EXCLUDED.expires_at;
END $$;

CREATE OR REPLACE FUNCTION unify.outbox_status(s text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(s) IN ('sent','delivered','processed','done','published','completed','succeeded','success','opened','clicked') THEN 'delivered'
    WHEN lower(s) IN ('processing','claimed','sending','in_progress','running','queued_send') THEN 'processing'
    WHEN lower(s) IN ('failed','error','bounced','retry') THEN 'failed'
    WHEN lower(s) IN ('dead','dead_letter','cancelled','canceled','suppressed','complained','discarded') THEN 'dead'
    ELSE 'pending' END $$;

CREATE OR REPLACE FUNCTION unify.map_outbox(src text, j jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.platform_outbox(tenant_id, channel, event_type, aggregate_type, aggregate_ref, payload, status, attempts,
                                     available_at, processed_at, last_error, created_at, updated_at, source_table, source_id)
  VALUES (unify.tenant_or_null(j->>'tenant_id'),
          CASE src WHEN 'commerce_outbox_events' THEN 'commerce' WHEN 'social_outbox_events' THEN 'social'
                   WHEN 'email_outbox' THEN 'email' ELSE src END,
          coalesce(j->>'event_type', j->>'template_key', j->>'category', 'email.send'),
          coalesce(j->>'aggregate_type', j->>'related_type'),
          coalesce(j->>'aggregate_id', j->>'related_id'),
          j, unify.outbox_status(j->>'status'), coalesce((j->>'attempts')::int, 0),
          coalesce(unify.try_ts(coalesce(j->>'available_at', j->>'next_attempt_at', j->>'scheduled_at')), now()),
          unify.try_ts(coalesce(j->>'processed_at', j->>'delivered_at', j->>'sent_at')),
          coalesce(j->>'last_error', j->>'error'),
          coalesce(unify.try_ts(j->>'created_at'), now()), now(), src, coalesce(j->>'id', md5(j::text)))
  ON CONFLICT (source_table, source_id) DO UPDATE
     SET status = EXCLUDED.status, attempts = EXCLUDED.attempts, available_at = EXCLUDED.available_at,
         processed_at = EXCLUDED.processed_at, last_error = EXCLUDED.last_error, payload = EXCLUDED.payload, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION unify.job_status(s text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(s) IN ('running','processing','in_progress','claimed','started') THEN 'running'
    WHEN lower(s) IN ('succeeded','success','done','completed','complete','processed','finished') THEN 'succeeded'
    WHEN lower(s) IN ('failed','error','dead','dead_letter') THEN 'failed'
    WHEN lower(s) IN ('cancelled','canceled','skipped') THEN 'cancelled'
    ELSE 'queued' END $$;

CREATE OR REPLACE FUNCTION unify.map_job(src text, j jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.platform_jobs(tenant_id, queue, job_type, payload, result, status, attempts, max_attempts, run_at,
                                   started_at, finished_at, last_error, created_at, updated_at, source_table, source_id)
  VALUES (unify.tenant_or_null(j->>'tenant_id'),
          CASE src WHEN 'sync_jobs' THEN 'sync' WHEN 'support_jobs' THEN 'support' WHEN 'provider_jobs' THEN 'provider' ELSE src END,
          coalesce(j->>'job_type', j->>'type', 'job'),
          coalesce(j->'payload', j->'request_payload', '{}'::jsonb) || jsonb_build_object('_source', j - 'payload' - 'request_payload' - 'response_payload' - 'result'),
          coalesce(j->'result', j->'response_payload'),
          unify.job_status(j->>'status'), coalesce((j->>'attempts')::int, 0), (j->>'max_attempts')::int,
          coalesce(unify.try_ts(coalesce(j->>'scheduled_for', j->>'next_attempt_at', j->>'created_at')), now()),
          unify.try_ts(j->>'started_at'), unify.try_ts(j->>'finished_at'),
          coalesce(j->>'last_error', j->>'error_message'),
          coalesce(unify.try_ts(j->>'created_at'), now()), now(), src, coalesce(j->>'id', md5(j::text)))
  ON CONFLICT (source_table, source_id) DO UPDATE
     SET status = EXCLUDED.status, attempts = EXCLUDED.attempts, result = EXCLUDED.result, started_at = EXCLUDED.started_at,
         finished_at = EXCLUDED.finished_at, last_error = EXCLUDED.last_error, payload = EXCLUDED.payload, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION unify.webhook_status(s text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(s) IN ('processed','done','succeeded','success','completed','handled','delivered') THEN 'processed'
    WHEN lower(s) IN ('ignored','skipped','duplicate') THEN 'ignored'
    WHEN lower(s) IN ('failed','error','dead','dead_letter') THEN 'failed'
    WHEN lower(s) IN ('rejected','invalid','invalid_signature') THEN 'rejected'
    ELSE 'received' END $$;

CREATE OR REPLACE FUNCTION unify.map_webhook(src text, j jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE prov text := lower(coalesce(j->>'provider', CASE src WHEN 'stripe_webhook_events' THEN 'stripe'
                                                             WHEN 'paypal_webhook_events' THEN 'paypal' ELSE 'commerce' END));
BEGIN
  INSERT INTO public.integration_providers(code, name, category)
  VALUES (prov, initcap(prov), CASE WHEN prov IN ('stripe','paypal','square') THEN 'payments' ELSE 'other' END)
  ON CONFLICT (code) DO NOTHING;
  INSERT INTO public.integration_webhook_inbox(provider_code, event_id, event_type, tenant_id, signature_valid, received_at,
                                               payload, status, attempts, processed_at, error)
  VALUES (prov, coalesce(j->>'provider_event_id', j->>'external_event_id', j->>'event_id', j->>'id'),
          coalesce(j->>'event_type', 'unknown'), unify.tenant_or_null(j->>'tenant_id'),
          coalesce((j->>'signature_valid')::boolean, true),     -- stripe/paypal rows were only stored after verification
          coalesce(unify.try_ts(coalesce(j->>'received_at', j->>'created_at')), now()),
          coalesce(j->'payload', '{}'::jsonb), unify.webhook_status(j->>'status'), coalesce((j->>'attempts')::int, 0),
          unify.try_ts(j->>'processed_at'), coalesce(j->>'last_error', j->>'error_message'))
  ON CONFLICT (provider_code, event_id) DO UPDATE
     SET status = EXCLUDED.status, attempts = EXCLUDED.attempts, processed_at = EXCLUDED.processed_at, error = EXCLUDED.error;
END $$;

CREATE OR REPLACE FUNCTION unify.map_saved_view(src text, j jsonb) RETURNS void LANGUAGE plpgsql AS $$
DECLARE u uuid := unify.user_or_null(coalesce(j->>'owner_user_id', j->>'user_id'));
BEGIN
  IF u IS NULL THEN RETURN; END IF;   -- view owned by a deleted user: nothing to keep
  INSERT INTO public.platform_saved_views(id, tenant_id, user_id, entity_type, name, filters, columns, sort, is_shared, query, created_at, updated_at)
  VALUES (coalesce(unify.try_uuid(j->>'id'), gen_random_uuid()), unify.tenant_or_null(j->>'tenant_id'), u,
          coalesce(j->>'entity_type', 'crm_customers'), coalesce(j->>'name', 'View'),
          j->'filters', j->'columns', coalesce(j->'sort_definition', j->'sort'),
          coalesce((j->>'is_shared')::boolean, false), j->>'query',
          coalesce(unify.try_ts(j->>'created_at'), now()), coalesce(unify.try_ts(j->>'updated_at'), now()))
  ON CONFLICT (id) DO UPDATE SET filters = EXCLUDED.filters, columns = EXCLUDED.columns, sort = EXCLUDED.sort,
     is_shared = EXCLUDED.is_shared, name = EXCLUDED.name, query = EXCLUDED.query, tenant_id = EXCLUDED.tenant_id, updated_at = now();
END $$;

-- schema defect: commerce_webhook_events.status defaults to 'received' but its
-- CHECK does not allow 'received', so every insert without a status fails.
DO $$ BEGIN
  IF to_regclass('public.commerce_webhook_events') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commerce_webhook_events_status_allowed'
                  AND pg_get_constraintdef(oid) NOT LIKE '%''received''%')
     AND (SELECT column_default FROM information_schema.columns WHERE table_schema = 'public'
           AND table_name = 'commerce_webhook_events' AND column_name = 'status') LIKE '''received''%' THEN
    ALTER TABLE public.commerce_webhook_events ALTER COLUMN status SET DEFAULT 'pending';
    PERFORM unify.log('commerce_webhook_events', NULL, 'fixed_default', 'status default received -> pending');
  END IF;
END $$;

-- ------------------------------------------- generic forwarder trigger
CREATE OR REPLACE FUNCTION unify.fwd() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, unify AS $$
BEGIN
  BEGIN
    EXECUTE format('SELECT unify.%I($1, $2)', TG_ARGV[0]) USING TG_TABLE_NAME::text, to_jsonb(NEW);
  EXCEPTION WHEN others THEN
    PERFORM unify.log(TG_TABLE_NAME, NEW.id::text, 'forward_failed', SQLERRM);
  END;
  RETURN NULL;
END $$;

CREATE TABLE IF NOT EXISTS unify.forwarders(source_table text PRIMARY KEY, mapper text NOT NULL, on_update boolean NOT NULL);
INSERT INTO unify.forwarders VALUES
  ('acct_audit_log','map_audit',false), ('cms_audit_log','map_audit',false), ('commerce_audit_log','map_audit',false),
  ('crm_audit_log','map_audit',false), ('erp_audit_log','map_audit',false), ('activity_log','map_audit',false),
  ('acct_integration_idempotency','map_idem',true), ('commerce_idempotency','map_idem',true),
  ('crm_idempotency_keys','map_idem',true), ('erp_idempotency_keys','map_idem',true),
  ('commerce_outbox_events','map_outbox',true), ('social_outbox_events','map_outbox',true), ('email_outbox','map_outbox',true),
  ('sync_jobs','map_job',true), ('support_jobs','map_job',true), ('provider_jobs','map_job',true),
  ('stripe_webhook_events','map_webhook',true), ('paypal_webhook_events','map_webhook',true), ('commerce_webhook_events','map_webhook',true),
  ('crm_saved_views','map_saved_view',true), ('saved_views','map_saved_view',true)
ON CONFLICT (source_table) DO UPDATE SET mapper = EXCLUDED.mapper, on_update = EXCLUDED.on_update;

-- backfill every source, then attach forwarders
DO $$
DECLARE f record; n bigint;
BEGIN
  FOR f IN SELECT * FROM unify.forwarders LOOP
    IF coalesce((SELECT relkind FROM pg_class WHERE oid = to_regclass('public.' || quote_ident(f.source_table))), 'x') NOT IN ('r','p') THEN
      PERFORM unify.log(f.source_table, NULL, 'forward_skip', 'not a live table (absent or retired to archive)'); CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM (SELECT unify.%I(%L, to_jsonb(s)) FROM public.%I s) x', f.mapper, f.source_table, f.source_table) INTO n;
    PERFORM unify.log(f.source_table, NULL, 'backfilled', n::text || ' rows via ' || f.mapper);
    EXECUTE format('DROP TRIGGER IF EXISTS unify_forward ON public.%I', f.source_table);
    EXECUTE format('CREATE TRIGGER unify_forward AFTER INSERT%s ON public.%I FOR EACH ROW EXECUTE FUNCTION unify.fwd(%L)',
                   CASE WHEN f.on_update THEN ' OR UPDATE' ELSE '' END, f.source_table, f.mapper);
  END LOOP;
END $$;

-- ------------------------------------------------------------- RLS
ALTER TABLE public.platform_audit_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_outbox           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_jobs             ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unify_audit_read ON public.platform_audit_events;
CREATE POLICY unify_audit_read ON public.platform_audit_events FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.platform_is_tenant_admin(tenant_id));
DROP POLICY IF EXISTS unify_idem_rw ON public.platform_idempotency_keys;
CREATE POLICY unify_idem_rw ON public.platform_idempotency_keys FOR ALL TO authenticated
  USING (public.platform_is_tenant_member(tenant_id)) WITH CHECK (public.platform_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS unify_outbox_read ON public.platform_outbox;
CREATE POLICY unify_outbox_read ON public.platform_outbox FOR SELECT TO authenticated
  USING (public.platform_is_tenant_member(tenant_id));
DROP POLICY IF EXISTS unify_jobs_read ON public.platform_jobs;
CREATE POLICY unify_jobs_read ON public.platform_jobs FOR SELECT TO authenticated
  USING (public.platform_is_tenant_member(tenant_id));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'platform_saved_views' AND policyname = 'unify_saved_views_tenant') THEN
    CREATE POLICY unify_saved_views_tenant ON public.platform_saved_views FOR ALL TO authenticated
      USING (user_id = auth.uid() OR (is_shared AND tenant_id IS NOT NULL AND public.platform_is_tenant_member(tenant_id)))
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
GRANT SELECT ON public.platform_audit_events, public.platform_outbox, public.platform_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.platform_idempotency_keys TO authenticated;

-- registry classification for these tables happens in 06 (platform_classify_tables)

COMMIT;

SELECT 'platform_audit_events' AS canonical, count(*) FROM public.platform_audit_events
UNION ALL SELECT 'platform_idempotency_keys', count(*) FROM public.platform_idempotency_keys
UNION ALL SELECT 'platform_outbox', count(*) FROM public.platform_outbox
UNION ALL SELECT 'platform_jobs', count(*) FROM public.platform_jobs
UNION ALL SELECT 'integration_webhook_inbox', count(*) FROM public.integration_webhook_inbox
UNION ALL SELECT 'platform_saved_views', count(*) FROM public.platform_saved_views;

-- canonical step ledger
SELECT unify.done('230');
