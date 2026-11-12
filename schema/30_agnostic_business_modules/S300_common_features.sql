-- CANONICAL STEP 300  |  file S300_common_features.sql  |  was unify/06b_common_features.sql  |  internal log label '06b' (unchanged)
-- =====================================================================
-- S300_common_features.sql — the "everyone assumes it's built in" layer.
--
-- A sweep of the schema found features whose COLUMNS exist but nothing
-- drives them, or that every SaaS user expects and nobody wrote:
--
--   1. Support on-call     schedules, rotation, overrides, escalation
--                          policies, pages with acknowledge / escalate
--   2. SLA clocks          business-hours + holiday math; tickets get
--                          first_response_due_at / resolution_due_at set
--                          automatically; breaches are stamped (the columns
--                          existed, nothing filled them)
--   3. Auto-assignment     least-loaded available agent on the ticket's team
--                          (support_team_members.max_concurrent existed, unused)
--   4. Out of office       with delegate; respected by on-call, assignment
--   5. Teammate invites    tenant_memberships has invite columns but its PK
--                          needs a user_id, so a person who has not signed up
--                          could not be invited
--   6. Notifications       per-user preferences (event x channel, quiet
--                          hours) and one platform_notify() everything uses
--   7. Reminders           remind me about any record; task due reminders
--   8. Followers           follow any record, get notified on changes
--   9. Recurring tasks     crm_tasks.recurrence_rule existed, nothing
--                          generated the next occurrence
--  10. Order holds         hold / release an order; shipping is blocked
--                          while on hold; "needs attention" flag
--
-- Idempotent. Every new *_id column has a real FK; RLS on every table.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 300 (internal label '06b'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S300_common_features.sql is step 300; run S200_unify_preflight.sql and every step up to 260 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('300');
END $guard$;
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------
-- shared: out of office
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_out_of_office (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id          uuid REFERENCES public.crm_staff(id) ON DELETE CASCADE,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,
  delegate_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  delegate_staff_id uuid REFERENCES public.crm_staff(id) ON DELETE SET NULL,
  applies_to        text[] NOT NULL DEFAULT ARRAY['tickets','oncall','approvals','tasks','appointments'],
  message           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (user_id IS NOT NULL OR staff_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS platform_out_of_office_staff_idx ON public.platform_out_of_office(staff_id, starts_at, ends_at);

CREATE OR REPLACE FUNCTION public.platform_is_away(p_staff uuid, p_scope text, p_at timestamptz DEFAULT now())
RETURNS uuid LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  -- returns the delegate staff id if away with a delegate, the staff's own id if away without one, NULL if present
  SELECT coalesce(o.delegate_staff_id, p_staff) FROM public.platform_out_of_office o
   WHERE o.staff_id = p_staff AND p_scope = ANY (o.applies_to) AND p_at >= o.starts_at AND p_at < o.ends_at
   ORDER BY o.starts_at DESC LIMIT 1 $$;

-- ---------------------------------------------------------------------
-- 6. notifications: preferences + one entry point
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_notification_preferences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text NOT NULL DEFAULT '*',          -- '*' = default for every event
  channel     text NOT NULL CHECK (channel IN ('in_app','email','push','sms')),
  enabled     boolean NOT NULL DEFAULT true,
  digest      text NOT NULL DEFAULT 'instant' CHECK (digest IN ('instant','daily','weekly')),
  quiet_start time,
  quiet_end   time,
  timezone    text NOT NULL DEFAULT 'America/Chicago',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, event_type, channel)
);

CREATE OR REPLACE FUNCTION public.platform_notify(
  p_tenant uuid, p_user uuid, p_event text, p_title text, p_body text DEFAULT NULL,
  p_url text DEFAULT NULL, p_priority text DEFAULT 'normal', p_ref_type text DEFAULT NULL, p_ref_id uuid DEFAULT NULL,
  p_force_channels text[] DEFAULT NULL)          -- pages use this: urgent alerts ignore quiet hours
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_id uuid; ch text; v_on boolean; p record; v_avail timestamptz; v_local time;
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  FOREACH ch IN ARRAY ARRAY['in_app','email','push','sms'] LOOP
    SELECT * INTO p FROM public.platform_notification_preferences n
     WHERE n.tenant_id = p_tenant AND n.user_id = p_user AND n.channel = ch AND n.event_type IN (p_event, '*')
     ORDER BY (n.event_type = p_event) DESC LIMIT 1;
    v_on := CASE WHEN p_force_channels IS NOT NULL THEN ch = ANY (p_force_channels)
                 WHEN p.id IS NOT NULL THEN p.enabled
                 ELSE ch = 'in_app' OR (ch = 'email' AND p_priority IN ('high','urgent')) END;
    CONTINUE WHEN NOT v_on;
    IF ch = 'in_app' THEN
      INSERT INTO public.user_notifications(tenant_id, user_id, notification_type, title, body, priority, action_url, metadata)
      VALUES (p_tenant, p_user, p_event, p_title, p_body, p_priority, p_url,
              jsonb_build_object('ref_type', p_ref_type, 'ref_id', p_ref_id))
      RETURNING id INTO v_id;
    ELSE
      v_avail := now();
      IF p.id IS NOT NULL AND p.quiet_start IS NOT NULL AND p.quiet_end IS NOT NULL AND p_force_channels IS NULL THEN
        v_local := (now() AT TIME ZONE p.timezone)::time;
        IF (p.quiet_start < p.quiet_end AND v_local >= p.quiet_start AND v_local < p.quiet_end)
           OR (p.quiet_start > p.quiet_end AND (v_local >= p.quiet_start OR v_local < p.quiet_end)) THEN
          v_avail := ((now() AT TIME ZONE p.timezone)::date + p.quiet_end
                      + CASE WHEN v_local >= p.quiet_end AND p.quiet_start > p.quiet_end THEN interval '1 day' ELSE interval '0' END)
                     AT TIME ZONE p.timezone;
        END IF;
      END IF;
      INSERT INTO public.platform_outbox(tenant_id, channel, event_type, aggregate_type, aggregate_ref, payload, status, attempts,
                                         available_at, source_table, source_id)
      VALUES (p_tenant, ch, 'notify.' || p_event, p_ref_type, p_ref_id::text,
              jsonb_build_object('user_id', p_user, 'title', p_title, 'body', p_body, 'url', p_url, 'priority', p_priority),
              'pending', 0, v_avail, 'platform_notify', gen_random_uuid()::text);
    END IF;
  END LOOP;
  RETURN v_id;
END $$;

-- ---------------------------------------------------------------------
-- 8. followers
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_record_followers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_type text NOT NULL,          -- table name, e.g. erp_orders, support_tickets, acct_ap_bills
  related_id   uuid NOT NULL,
  reason       text NOT NULL DEFAULT 'manual' CHECK (reason IN ('manual','mentioned','assigned','created','commented')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, related_type, related_id)
);
CREATE INDEX IF NOT EXISTS platform_record_followers_rec_idx ON public.platform_record_followers(related_type, related_id);

CREATE OR REPLACE FUNCTION public.platform_follow(p_tenant uuid, p_related_type text, p_related_id uuid, p_follow boolean DEFAULT true)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.platform_is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'not a member of this workspace'; END IF;
  IF p_follow THEN
    INSERT INTO public.platform_record_followers(tenant_id, user_id, related_type, related_id)
    VALUES (p_tenant, auth.uid(), p_related_type, p_related_id) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.platform_record_followers
     WHERE tenant_id = p_tenant AND user_id = auth.uid() AND related_type = p_related_type AND related_id = p_related_id;
  END IF;
  RETURN p_follow;
END $$;

CREATE OR REPLACE FUNCTION public.platform_notify_followers(p_tenant uuid, p_related_type text, p_related_id uuid,
  p_event text, p_title text, p_body text DEFAULT NULL, p_url text DEFAULT NULL, p_except_user uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT user_id FROM public.platform_record_followers
            WHERE tenant_id = p_tenant AND related_type = p_related_type AND related_id = p_related_id
              AND user_id IS DISTINCT FROM coalesce(p_except_user, auth.uid()) LOOP
    PERFORM public.platform_notify(p_tenant, r.user_id, p_event, p_title, p_body, p_url, 'normal', p_related_type, p_related_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ---------------------------------------------------------------------
-- 7. reminders
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_reminders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  related_type text,
  related_id   uuid,
  remind_at    timestamptz NOT NULL,
  message      text NOT NULL,
  url          text,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled')),
  sent_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_reminders_due_idx ON public.platform_reminders(remind_at) WHERE status = 'pending';

ALTER TABLE public.crm_tasks ADD COLUMN IF NOT EXISTS remind_before_minutes integer;
ALTER TABLE public.crm_tasks ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.platform_set_reminder(p_tenant uuid, p_remind_at timestamptz, p_message text,
  p_related_type text DEFAULT NULL, p_related_id uuid DEFAULT NULL, p_url text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.platform_is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'not a member of this workspace'; END IF;
  INSERT INTO public.platform_reminders(tenant_id, user_id, related_type, related_id, remind_at, message, url)
  VALUES (p_tenant, auth.uid(), p_related_type, p_related_id, p_remind_at, p_message, p_url) RETURNING id INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.platform_dispatch_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE r record; n integer := 0; u uuid;
BEGIN
  FOR r IN SELECT * FROM public.platform_reminders WHERE status = 'pending' AND remind_at <= now()
            ORDER BY remind_at LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
    PERFORM public.platform_notify(r.tenant_id, r.user_id, 'reminder', r.message, NULL, r.url, 'normal', r.related_type, r.related_id);
    UPDATE public.platform_reminders SET status = 'sent', sent_at = now() WHERE id = r.id;
    n := n + 1;
  END LOOP;
  -- task due reminders (default 60 minutes before due when the task has an assignee)
  FOR r IN SELECT t.* FROM public.crm_tasks t
            WHERE t.due_at IS NOT NULL AND t.reminder_sent_at IS NULL AND t.completed_at IS NULL
              AND coalesce(t.status, '') NOT IN ('completed','done','cancelled')
              AND (t.snoozed_until IS NULL OR t.snoozed_until <= now())
              AND t.due_at - make_interval(mins => coalesce(t.remind_before_minutes, 60)) <= now()
              AND t.due_at > now() - interval '1 day'
            LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
    u := coalesce((SELECT s.user_id FROM public.crm_staff s WHERE s.id = r.assigned_to),
                  (SELECT au.id FROM auth.users au WHERE au.id = r.assigned_to), r.created_by);
    IF u IS NOT NULL THEN
      PERFORM public.platform_notify(r.tenant_id, u, 'task.due', 'Due soon: ' || r.title, NULL, '/tasks/' || r.id, 'normal', 'crm_tasks', r.id);
    END IF;
    UPDATE public.crm_tasks SET reminder_sent_at = now() WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ---------------------------------------------------------------------
-- 9. recurring tasks (RRULE subset: FREQ, INTERVAL, BYDAY for weekly, UNTIL, COUNT)
-- ---------------------------------------------------------------------
ALTER TABLE public.crm_tasks ADD COLUMN IF NOT EXISTS recurrence_series_id uuid;
ALTER TABLE public.crm_tasks ADD COLUMN IF NOT EXISTS recurrence_index integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_tasks_recurrence_series_id_fk') THEN
    ALTER TABLE public.crm_tasks ADD CONSTRAINT crm_tasks_recurrence_series_id_fk
      FOREIGN KEY (recurrence_series_id) REFERENCES public.crm_tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.platform_rrule_next(p_rule text, p_from timestamptz)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE kv text; k text; v text; freq text := 'DAILY'; ivl int := 1; byday text[]; nxt timestamptz; i int;
        days text[] := ARRAY['SU','MO','TU','WE','TH','FR','SA'];
BEGIN
  IF p_rule IS NULL OR p_from IS NULL THEN RETURN NULL; END IF;
  FOREACH kv IN ARRAY string_to_array(upper(regexp_replace(p_rule, '^RRULE:', '', 'i')), ';') LOOP
    k := split_part(kv, '=', 1); v := split_part(kv, '=', 2);
    IF k = 'FREQ' THEN freq := v; ELSIF k = 'INTERVAL' THEN ivl := greatest(v::int, 1); ELSIF k = 'BYDAY' THEN byday := string_to_array(v, ','); END IF;
  END LOOP;
  IF freq = 'WEEKLY' AND byday IS NOT NULL THEN
    FOR i IN 1..(7 * ivl) LOOP
      nxt := p_from + make_interval(days => i);
      IF days[extract(dow FROM nxt)::int + 1] = ANY (byday)
         AND (i <= 7 - extract(dow FROM p_from)::int OR i > 7 * (ivl - 1)) THEN RETURN nxt; END IF;
    END LOOP;
  END IF;
  RETURN p_from + CASE freq WHEN 'DAILY' THEN make_interval(days => ivl) WHEN 'WEEKLY' THEN make_interval(weeks => ivl)
                            WHEN 'MONTHLY' THEN make_interval(months => ivl) WHEN 'YEARLY' THEN make_interval(years => ivl)
                            WHEN 'HOURLY' THEN make_interval(hours => ivl) ELSE make_interval(days => ivl) END;
END $$;

CREATE OR REPLACE FUNCTION public.crm__task_recur() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_next timestamptz; v_until timestamptz; v_count int; v_series uuid; v_idx int; m text[];
BEGIN
  IF NEW.recurrence_rule IS NULL OR NEW.due_at IS NULL THEN RETURN NEW; END IF;
  IF NOT (coalesce(NEW.status, '') IN ('completed','done') AND coalesce(OLD.status, '') NOT IN ('completed','done')) THEN RETURN NEW; END IF;
  v_series := coalesce(NEW.recurrence_series_id, NEW.id);
  v_idx := coalesce(NEW.recurrence_index, 1) + 1;
  m := regexp_match(upper(NEW.recurrence_rule), 'UNTIL=([0-9TZ]+)');
  IF m IS NOT NULL THEN v_until := to_timestamp(left(m[1], 8), 'YYYYMMDD') + interval '1 day'; END IF;
  m := regexp_match(upper(NEW.recurrence_rule), 'COUNT=([0-9]+)');
  IF m IS NOT NULL THEN v_count := m[1]::int; END IF;
  v_next := public.platform_rrule_next(NEW.recurrence_rule, NEW.due_at);
  IF v_next IS NULL OR (v_until IS NOT NULL AND v_next >= v_until) OR (v_count IS NOT NULL AND v_idx > v_count) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.crm_tasks WHERE recurrence_series_id = v_series AND due_at = v_next) THEN RETURN NEW; END IF;
  INSERT INTO public.crm_tasks(tenant_id, customer_id, lead_id, assigned_to, created_by, task_type, priority, title, description,
                               due_at, status, board_column, visibility, related_type, related_id, tags, recurrence_rule, module,
                               start_at, all_day, remind_before_minutes, recurrence_series_id, recurrence_index)
  VALUES (NEW.tenant_id, NEW.customer_id, NEW.lead_id, NEW.assigned_to, NEW.created_by, NEW.task_type, NEW.priority, NEW.title, NEW.description,
          v_next, 'open', NEW.board_column, NEW.visibility, NEW.related_type, NEW.related_id, NEW.tags, NEW.recurrence_rule, NEW.module,
          CASE WHEN NEW.start_at IS NOT NULL THEN v_next - (NEW.due_at - NEW.start_at) END, NEW.all_day, NEW.remind_before_minutes,
          v_series, v_idx);
  IF NEW.recurrence_series_id IS NULL THEN NEW.recurrence_series_id := v_series; NEW.recurrence_index := 1; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_crm_task_recur ON public.crm_tasks;
CREATE TRIGGER trg_crm_task_recur BEFORE UPDATE OF status ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm__task_recur();

-- ---------------------------------------------------------------------
-- 5. teammate invitations
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_member_invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email            text NOT NULL,
  role             text NOT NULL CHECK (role IN ('owner','admin','manager','staff','viewer','groomer','front_desk')),
  token_hash       text NOT NULL UNIQUE,
  invited_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at      timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_member_invitations_open_uq
  ON public.platform_member_invitations(tenant_id, lower(email)) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.platform_invite_member(p_tenant uuid, p_email text, p_role text DEFAULT 'staff')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''); v_id uuid;
BEGIN
  IF NOT (public.platform_is_tenant_admin(p_tenant) OR public.platform_is_admin()) THEN RAISE EXCEPTION 'only workspace admins can invite'; END IF;
  IF p_role = 'owner' AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.tenant_id = p_tenant AND m.user_id = auth.uid() AND m.role = 'owner') THEN
    RAISE EXCEPTION 'only an owner can invite another owner';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_memberships m JOIN auth.users u ON u.id = m.user_id
              WHERE m.tenant_id = p_tenant AND lower(u.email) = lower(btrim(p_email)) AND coalesce(m.active, true)) THEN
    RAISE EXCEPTION '% is already a member', p_email;
  END IF;
  UPDATE public.platform_member_invitations SET status = 'revoked', updated_at = now()
   WHERE tenant_id = p_tenant AND lower(email) = lower(btrim(p_email)) AND status = 'pending';
  INSERT INTO public.platform_member_invitations(tenant_id, email, role, token_hash, invited_by)
  VALUES (p_tenant, lower(btrim(p_email)), p_role, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.platform_outbox(tenant_id, channel, event_type, aggregate_type, aggregate_ref, payload, status, attempts, available_at, source_table, source_id)
  VALUES (p_tenant, 'email', 'platform.invitation.created', 'platform_member_invitations', v_id::text,
          jsonb_build_object('email', lower(btrim(p_email)), 'role', p_role, 'token', v_token), 'pending', 0, now(),
          'platform_member_invitations', v_id::text)
  ON CONFLICT (source_table, source_id) DO NOTHING;
  RETURN v_token;     -- shown once; only the hash is stored
END $$;

CREATE OR REPLACE FUNCTION public.platform_accept_invitation(p_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE i record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in first'; END IF;
  SELECT * INTO i FROM public.platform_member_invitations
   WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') FOR UPDATE;
  IF i.id IS NULL OR i.status <> 'pending' THEN RAISE EXCEPTION 'invitation not found or already used'; END IF;
  IF i.expires_at < now() THEN
    UPDATE public.platform_member_invitations SET status = 'expired', updated_at = now() WHERE id = i.id;
    RAISE EXCEPTION 'invitation expired';
  END IF;
  INSERT INTO public.tenant_memberships(tenant_id, user_id, role, active, status, invited_by, invited_email, invite_accepted_at)
  VALUES (i.tenant_id, auth.uid(), i.role, true, 'active', i.invited_by, i.email, now())
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, active = true, status = 'active', invite_accepted_at = now();
  UPDATE public.platform_member_invitations SET status = 'accepted', accepted_at = now(), accepted_user_id = auth.uid(), updated_at = now()
   WHERE id = i.id;
  RETURN i.tenant_id;
END $$;

CREATE OR REPLACE FUNCTION public.platform_revoke_invitation(p_invitation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE t uuid;
BEGIN
  SELECT tenant_id INTO t FROM public.platform_member_invitations WHERE id = p_invitation;
  IF t IS NULL OR NOT (public.platform_is_tenant_admin(t) OR public.platform_is_admin()) THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.platform_member_invitations SET status = 'revoked', updated_at = now() WHERE id = p_invitation AND status = 'pending';
END $$;

-- ---------------------------------------------------------------------
-- 2. business hours + SLA clocks
-- schedule jsonb accepted shapes (per weekday key mon..sun or monday..sunday or 0..6):
--   {"mon":[{"start":"09:00","end":"17:00"}]}   {"mon":[["09:00","17:00"]]}
--   {"mon":{"open":"09:00","close":"17:00"}}    [{"day":1,"start":"09:00","end":"17:00"}]
--   {"mon":null} or missing = closed
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.support__bh_windows(p_schedule jsonb, p_dow int)
RETURNS TABLE(s time, e time) LANGUAGE sql IMMUTABLE AS $$
  WITH keys AS (SELECT (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[p_dow + 1] AS k3,
                       (ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'])[p_dow + 1] AS kl),
  d AS (
    SELECT CASE WHEN jsonb_typeof(p_schedule) = 'array' THEN
                  (SELECT jsonb_agg(x) FROM jsonb_array_elements(p_schedule) x
                    WHERE x->>'day' = p_dow::text OR lower(x->>'day') IN ((SELECT k3 FROM keys), (SELECT kl FROM keys)))
                ELSE coalesce(p_schedule->(SELECT k3 FROM keys), p_schedule->(SELECT kl FROM keys), p_schedule->p_dow::text) END AS v),
  w AS (SELECT CASE jsonb_typeof(v) WHEN 'array' THEN v WHEN 'object' THEN jsonb_build_array(v) ELSE '[]'::jsonb END AS arr FROM d)
  SELECT CASE jsonb_typeof(x) WHEN 'array' THEN (x->>0)::time ELSE coalesce(x->>'start', x->>'open', x->>'from')::time END,
         CASE jsonb_typeof(x) WHEN 'array' THEN (x->>1)::time ELSE coalesce(x->>'end', x->>'close', x->>'to')::time END
    FROM w, jsonb_array_elements(w.arr) x
   WHERE coalesce((x->>'closed')::boolean, false) = false
   ORDER BY 1 $$;

CREATE OR REPLACE FUNCTION public.support_is_business_time(p_bh uuid, p_at timestamptz DEFAULT now())
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog AS $$
DECLARE b record; ld timestamp; w record;
BEGIN
  SELECT * INTO b FROM public.support_business_hours WHERE id = p_bh;
  IF b.id IS NULL THEN RETURN true; END IF;                 -- no calendar = always open
  ld := p_at AT TIME ZONE b.timezone;
  IF EXISTS (SELECT 1 FROM public.support_holidays h WHERE h.holiday_date = ld::date
              AND (h.business_hours_id = p_bh OR (h.business_hours_id IS NULL AND (h.tenant_id = b.tenant_id OR h.scope = 'master')))) THEN
    RETURN false;
  END IF;
  FOR w IN SELECT * FROM public.support__bh_windows(b.schedule, extract(dow FROM ld)::int) LOOP
    IF ld::time >= w.s AND (ld::time < w.e OR w.e = '00:00') THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.support_business_add_minutes(p_bh uuid, p_from timestamptz, p_minutes integer)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog AS $$
DECLARE b record; d date; i int; w record; ws timestamptz; we timestamptz; seg timestamptz; rem numeric := p_minutes; avail numeric;
BEGIN
  IF p_minutes IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO b FROM public.support_business_hours WHERE id = p_bh;
  IF b.id IS NULL THEN RETURN p_from + make_interval(mins => p_minutes); END IF;
  d := (p_from AT TIME ZONE b.timezone)::date;
  FOR i IN 0..400 LOOP
    IF NOT EXISTS (SELECT 1 FROM public.support_holidays h WHERE h.holiday_date = d + i
                    AND (h.business_hours_id = p_bh OR (h.business_hours_id IS NULL AND (h.tenant_id = b.tenant_id OR h.scope = 'master')))) THEN
      FOR w IN SELECT * FROM public.support__bh_windows(b.schedule, extract(dow FROM d + i)::int) LOOP
        ws := ((d + i) + w.s) AT TIME ZONE b.timezone;
        we := CASE WHEN w.e = '00:00' THEN ((d + i + 1)::timestamp) AT TIME ZONE b.timezone ELSE ((d + i) + w.e) AT TIME ZONE b.timezone END;
        seg := greatest(ws, p_from);
        IF seg < we THEN
          avail := extract(epoch FROM we - seg) / 60;
          IF rem <= avail THEN RETURN seg + make_interval(secs => rem * 60); END IF;
          rem := rem - avail;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN p_from + make_interval(mins => p_minutes);          -- calendar with no open hours: fall back to wall clock
END $$;

CREATE OR REPLACE FUNCTION public.support__ticket_sla() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE p record; v_bh uuid; v_from timestamptz;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.sla_policy_id IS NOT DISTINCT FROM OLD.sla_policy_id
     AND NEW.business_hours_id IS NOT DISTINCT FROM OLD.business_hours_id THEN RETURN NEW; END IF;
  IF NEW.sla_policy_id IS NULL THEN
    SELECT id INTO NEW.sla_policy_id FROM public.support_sla_policies sp
     WHERE sp.is_active AND sp.is_default AND (sp.tenant_id = NEW.tenant_id OR sp.scope = 'master')
     ORDER BY (sp.tenant_id = NEW.tenant_id) DESC NULLS LAST LIMIT 1;
  END IF;
  IF NEW.sla_policy_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO p FROM public.support_sla_policies WHERE id = NEW.sla_policy_id;
  v_bh := CASE WHEN p.uses_business_hours THEN coalesce(NEW.business_hours_id, p.business_hours_id,
            (SELECT id FROM public.support_business_hours b WHERE b.is_active AND b.is_default
               AND (b.tenant_id = NEW.tenant_id OR b.scope = 'master') ORDER BY (b.tenant_id = NEW.tenant_id) DESC NULLS LAST LIMIT 1)) END;
  IF p.uses_business_hours AND NEW.business_hours_id IS NULL THEN NEW.business_hours_id := v_bh; END IF;
  v_from := coalesce(NEW.created_at, now());
  IF NEW.first_public_reply_at IS NULL THEN
    NEW.first_response_due_at := CASE WHEN v_bh IS NULL THEN v_from + make_interval(mins => p.first_response_minutes)
                                      ELSE public.support_business_add_minutes(v_bh, v_from, p.first_response_minutes) END;
  END IF;
  IF NEW.resolved_at IS NULL THEN
    NEW.resolution_due_at := CASE WHEN v_bh IS NULL THEN v_from + make_interval(mins => p.resolution_minutes)
                                  ELSE public.support_business_add_minutes(v_bh, v_from, p.resolution_minutes) END;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_support_ticket_sla ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_sla BEFORE INSERT OR UPDATE OF sla_policy_id, business_hours_id ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support__ticket_sla();

-- ---------------------------------------------------------------------
-- 1. on-call
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_oncall_schedules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  team_id            uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  name               text NOT NULL,
  timezone           text NOT NULL DEFAULT 'America/Chicago',
  rotation_type      text NOT NULL DEFAULT 'weekly' CHECK (rotation_type IN ('daily','weekly','custom')),
  shift_length_hours integer NOT NULL DEFAULT 168 CHECK (shift_length_hours > 0),
  rotation_start_at  timestamptz NOT NULL DEFAULT date_trunc('week', now()) + interval '9 hours',
  covers             text NOT NULL DEFAULT 'after_hours' CHECK (covers IN ('always','after_hours','business_hours')),
  business_hours_id  uuid REFERENCES public.support_business_hours(id) ON DELETE SET NULL,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS public.support_oncall_participants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.support_oncall_schedules(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES public.crm_staff(id) ON DELETE CASCADE,
  position    integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, position),
  UNIQUE (schedule_id, staff_id)
);
CREATE TABLE IF NOT EXISTS public.support_oncall_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.support_oncall_schedules(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES public.crm_staff(id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  reason      text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_oncall_overrides_no_overlap') THEN
    ALTER TABLE public.support_oncall_overrides ADD CONSTRAINT support_oncall_overrides_no_overlap
      EXCLUDE USING gist (schedule_id WITH =, tstzrange(starts_at, ends_at) WITH &&);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.support_escalation_policies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name              text NOT NULL,
  repeat_count      integer NOT NULL DEFAULT 0 CHECK (repeat_count BETWEEN 0 AND 10),
  trigger_on        text[] NOT NULL DEFAULT ARRAY['manual'],     -- manual, sla_breach, urgent_ticket
  match_priorities  text[] NOT NULL DEFAULT ARRAY['urgent','high'],
  is_default        boolean NOT NULL DEFAULT false,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS public.support_escalation_policy_steps (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id           uuid NOT NULL REFERENCES public.support_escalation_policies(id) ON DELETE CASCADE,
  step_no             integer NOT NULL CHECK (step_no > 0),
  ack_timeout_minutes integer NOT NULL DEFAULT 15 CHECK (ack_timeout_minutes > 0),
  target_type         text NOT NULL CHECK (target_type IN ('schedule','staff','team')),
  schedule_id         uuid REFERENCES public.support_oncall_schedules(id) ON DELETE CASCADE,
  staff_id            uuid REFERENCES public.crm_staff(id) ON DELETE CASCADE,
  team_id             uuid REFERENCES public.support_teams(id) ON DELETE CASCADE,
  channels            text[] NOT NULL DEFAULT ARRAY['push','sms','email','in_app'],
  UNIQUE (policy_id, step_no),
  CHECK ((target_type = 'schedule' AND schedule_id IS NOT NULL) OR (target_type = 'staff' AND staff_id IS NOT NULL)
      OR (target_type = 'team' AND team_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.support_pages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_id          uuid NOT NULL REFERENCES public.support_escalation_policies(id) ON DELETE CASCADE,
  ticket_id          uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  current_step       integer NOT NULL DEFAULT 1,
  loop_no            integer NOT NULL DEFAULT 0,
  paged_staff_id     uuid REFERENCES public.crm_staff(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'triggered' CHECK (status IN ('triggered','acknowledged','resolved','exhausted')),
  summary            text NOT NULL,
  dedup_key          text,
  triggered_by       text NOT NULL DEFAULT 'manual',
  triggered_at       timestamptz NOT NULL DEFAULT now(),
  next_escalation_at timestamptz,
  acknowledged_at    timestamptz,
  acknowledged_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at        timestamptz,
  history            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS support_pages_open_dedup_uq ON public.support_pages(tenant_id, dedup_key)
  WHERE dedup_key IS NOT NULL AND status IN ('triggered','acknowledged');
CREATE INDEX IF NOT EXISTS support_pages_due_idx ON public.support_pages(next_escalation_at) WHERE status = 'triggered';

CREATE OR REPLACE FUNCTION public.support_oncall_now(p_schedule uuid, p_at timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = public, pg_catalog AS $$
DECLARE s record; n int; idx int; i int; v uuid; away uuid;
BEGIN
  SELECT * INTO s FROM public.support_oncall_schedules WHERE id = p_schedule AND is_active;
  IF s.id IS NULL THEN RETURN NULL; END IF;
  SELECT o.staff_id INTO v FROM public.support_oncall_overrides o
   WHERE o.schedule_id = p_schedule AND p_at >= o.starts_at AND p_at < o.ends_at LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  IF s.covers = 'after_hours' AND s.business_hours_id IS NOT NULL AND public.support_is_business_time(s.business_hours_id, p_at) THEN RETURN NULL; END IF;
  IF s.covers = 'business_hours' AND s.business_hours_id IS NOT NULL AND NOT public.support_is_business_time(s.business_hours_id, p_at) THEN RETURN NULL; END IF;
  SELECT count(*) INTO n FROM public.support_oncall_participants WHERE schedule_id = p_schedule;
  IF n = 0 THEN RETURN NULL; END IF;
  idx := floor(extract(epoch FROM p_at - s.rotation_start_at) / 3600.0 / s.shift_length_hours)::int;
  idx := ((idx % n) + n) % n;
  FOR i IN 0..n - 1 LOOP                                  -- skip people who are out of office
    SELECT staff_id INTO v FROM public.support_oncall_participants WHERE schedule_id = p_schedule
     ORDER BY position OFFSET (idx + i) % n LIMIT 1;
    away := public.platform_is_away(v, 'oncall', p_at);
    IF away IS NULL THEN RETURN v; END IF;
    IF away <> v THEN RETURN away; END IF;                -- delegate covers
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE VIEW public.support_v_oncall_now WITH (security_invoker = true) AS
SELECT s.tenant_id, s.id AS schedule_id, s.name AS schedule_name, s.team_id,
       public.support_oncall_now(s.id) AS staff_id,
       (SELECT st.display_name FROM public.crm_staff st WHERE st.id = public.support_oncall_now(s.id)) AS staff_name
  FROM public.support_oncall_schedules s WHERE s.is_active;

CREATE OR REPLACE FUNCTION public.support__page_step(p_page uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE pg record; st record; v_staff uuid; v_user uuid; v_max int; pol record;
BEGIN
  SELECT * INTO pg FROM public.support_pages WHERE id = p_page FOR UPDATE;
  SELECT * INTO pol FROM public.support_escalation_policies WHERE id = pg.policy_id;
  SELECT max(step_no) INTO v_max FROM public.support_escalation_policy_steps WHERE policy_id = pg.policy_id;
  IF v_max IS NULL THEN
    UPDATE public.support_pages SET status = 'exhausted', next_escalation_at = NULL, updated_at = now() WHERE id = p_page; RETURN;
  END IF;
  IF pg.current_step > v_max THEN
    IF pg.loop_no < pol.repeat_count THEN
      UPDATE public.support_pages SET current_step = 1, loop_no = loop_no + 1 WHERE id = p_page;
      pg.current_step := 1;
    ELSE
      UPDATE public.support_pages SET status = 'exhausted', next_escalation_at = NULL, updated_at = now(),
             history = history || jsonb_build_object('at', now(), 'event', 'exhausted') WHERE id = p_page;
      RETURN;
    END IF;
  END IF;
  SELECT * INTO st FROM public.support_escalation_policy_steps WHERE policy_id = pg.policy_id AND step_no = pg.current_step;
  IF st.id IS NULL THEN           -- gap in step numbers: jump to the next defined step
    SELECT * INTO st FROM public.support_escalation_policy_steps WHERE policy_id = pg.policy_id AND step_no > pg.current_step ORDER BY step_no LIMIT 1;
  END IF;
  v_staff := CASE st.target_type
               WHEN 'schedule' THEN public.support_oncall_now(st.schedule_id)
               WHEN 'staff' THEN coalesce(nullif(public.platform_is_away(st.staff_id, 'oncall'), st.staff_id), st.staff_id)
               WHEN 'team' THEN (SELECT m.staff_id FROM public.support_team_members m
                                  WHERE m.team_id = st.team_id AND m.is_available AND public.platform_is_away(m.staff_id, 'oncall') IS NULL
                                  ORDER BY m.created_at LIMIT 1) END;
  UPDATE public.support_pages
     SET current_step = st.step_no, paged_staff_id = v_staff,
         next_escalation_at = now() + make_interval(mins => st.ack_timeout_minutes), updated_at = now(),
         history = history || jsonb_build_object('at', now(), 'event', 'paged', 'step', st.step_no, 'loop', pg.loop_no, 'staff_id', v_staff)
   WHERE id = p_page;
  IF v_staff IS NOT NULL THEN
    INSERT INTO public.support_notifications(tenant_id, recipient_staff_id, kind, channel, ticket_id, ref)
    VALUES (pg.tenant_id, v_staff, 'oncall_page', CASE WHEN 'push' = ANY (st.channels) THEN 'push' WHEN 'email' = ANY (st.channels) THEN 'email' ELSE 'in_app' END,
            pg.ticket_id, p_page::text);
    SELECT user_id INTO v_user FROM public.crm_staff WHERE id = v_staff;
    PERFORM public.platform_notify(pg.tenant_id, v_user, 'support.page', 'On-call: ' || pg.summary, NULL,
                                   '/support/oncall/pages/' || p_page, 'urgent', 'support_pages', p_page, st.channels);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.support_page(p_tenant uuid, p_summary text, p_ticket uuid DEFAULT NULL,
  p_policy uuid DEFAULT NULL, p_dedup_key text DEFAULT NULL, p_triggered_by text DEFAULT 'manual')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_policy uuid := p_policy; v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.platform_is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'not a member of this workspace'; END IF;
  IF v_policy IS NULL THEN
    SELECT id INTO v_policy FROM public.support_escalation_policies WHERE tenant_id = p_tenant AND is_active ORDER BY is_default DESC, created_at LIMIT 1;
  END IF;
  IF v_policy IS NULL THEN RAISE EXCEPTION 'no escalation policy: create one under Support > On-call'; END IF;
  IF p_dedup_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.support_pages WHERE tenant_id = p_tenant AND dedup_key = p_dedup_key AND status IN ('triggered','acknowledged');
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  INSERT INTO public.support_pages(tenant_id, policy_id, ticket_id, summary, dedup_key, triggered_by)
  VALUES (p_tenant, v_policy, p_ticket, p_summary, p_dedup_key, p_triggered_by) RETURNING id INTO v_id;
  PERFORM public.support__page_step(v_id);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.support_ack_page(p_page uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE t uuid;
BEGIN
  SELECT tenant_id INTO t FROM public.support_pages WHERE id = p_page;
  IF t IS NULL OR NOT public.platform_is_tenant_member(t) THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.support_pages SET status = 'acknowledged', acknowledged_at = now(), acknowledged_by = auth.uid(), next_escalation_at = NULL,
         updated_at = now(), history = history || jsonb_build_object('at', now(), 'event', 'acknowledged', 'user_id', auth.uid())
   WHERE id = p_page AND status = 'triggered';
END $$;

CREATE OR REPLACE FUNCTION public.support_resolve_page(p_page uuid, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE t uuid;
BEGIN
  SELECT tenant_id INTO t FROM public.support_pages WHERE id = p_page;
  IF t IS NULL OR NOT public.platform_is_tenant_member(t) THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.support_pages SET status = 'resolved', resolved_at = now(), next_escalation_at = NULL, updated_at = now(),
         history = history || jsonb_build_object('at', now(), 'event', 'resolved', 'user_id', auth.uid(), 'note', p_note)
   WHERE id = p_page AND status IN ('triggered','acknowledged');
END $$;

-- cron: escalate unacknowledged pages, stamp SLA breaches, auto-page on breach
CREATE OR REPLACE FUNCTION public.support_run_clocks() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE r record; n_esc int := 0; n_fr int := 0; n_res int := 0; n_pg int := 0; pol uuid;
BEGIN
  FOR r IN SELECT id FROM public.support_pages WHERE status = 'triggered' AND next_escalation_at <= now()
            ORDER BY next_escalation_at LIMIT 200 FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.support_pages SET current_step = current_step + 1 WHERE id = r.id;
    PERFORM public.support__page_step(r.id); n_esc := n_esc + 1;
  END LOOP;
  WITH u AS (UPDATE public.support_tickets SET first_response_breached_at = now()
              WHERE first_response_breached_at IS NULL AND first_public_reply_at IS NULL AND first_response_due_at < now()
                AND coalesce(status, '') NOT IN ('solved','resolved','closed','cancelled','merged','spam') AND NOT coalesce(on_hold, false)
              RETURNING 1) SELECT count(*) INTO n_fr FROM u;
  WITH u AS (UPDATE public.support_tickets SET resolution_breached_at = now()
              WHERE resolution_breached_at IS NULL AND resolved_at IS NULL AND resolution_due_at < now()
                AND coalesce(status, '') NOT IN ('solved','resolved','closed','cancelled','merged','spam') AND NOT coalesce(on_hold, false)
              RETURNING 1) SELECT count(*) INTO n_res FROM u;
  FOR r IN SELECT t.id, t.tenant_id, t.ticket_ref, t.subject, t.priority FROM public.support_tickets t
            WHERE (t.first_response_breached_at > now() - interval '15 minutes' OR t.resolution_breached_at > now() - interval '15 minutes')
              AND coalesce(t.status, '') NOT IN ('solved','resolved','closed','cancelled','merged','spam') LOOP
    SELECT id INTO pol FROM public.support_escalation_policies p
     WHERE p.tenant_id = r.tenant_id AND p.is_active AND 'sla_breach' = ANY (p.trigger_on) AND coalesce(r.priority, 'normal') = ANY (p.match_priorities)
     ORDER BY p.is_default DESC LIMIT 1;
    IF pol IS NOT NULL THEN
      PERFORM public.support_page(r.tenant_id, 'SLA breach: ' || coalesce(r.ticket_ref, '') || ' ' || coalesce(r.subject, ''), r.id, pol,
                                  'sla:' || r.id, 'sla_breach');
      n_pg := n_pg + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('escalated', n_esc, 'first_response_breaches', n_fr, 'resolution_breaches', n_res, 'sla_pages', n_pg);
END $$;

-- ---------------------------------------------------------------------
-- 3. auto-assignment
-- ---------------------------------------------------------------------
ALTER TABLE public.support_teams ADD COLUMN IF NOT EXISTS auto_assign boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.support_auto_assign(p_ticket uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE t record; v uuid;
BEGIN
  SELECT * INTO t FROM public.support_tickets WHERE id = p_ticket FOR UPDATE;
  IF t.id IS NULL OR t.assigned_team_id IS NULL THEN RETURN NULL; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.platform_is_tenant_member(t.tenant_id) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT m.staff_id INTO v
    FROM public.support_team_members m
    LEFT JOIN LATERAL (SELECT count(*) AS open_n, max(x.updated_at) AS last_at FROM public.support_tickets x
                        WHERE x.assigned_staff_id = m.staff_id
                          AND coalesce(x.status, '') NOT IN ('solved','resolved','closed','cancelled','merged','spam')) l ON true
   WHERE m.team_id = t.assigned_team_id AND m.is_available
     AND public.platform_is_away(m.staff_id, 'tickets') IS NULL
     AND l.open_n < coalesce(m.max_concurrent, 1000000)
   ORDER BY l.open_n, l.last_at NULLS FIRST LIMIT 1;
  IF v IS NOT NULL THEN UPDATE public.support_tickets SET assigned_staff_id = v WHERE id = p_ticket; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.support__ticket_autoassign() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.assigned_staff_id IS NULL AND NEW.assigned_team_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.support_teams st WHERE st.id = NEW.assigned_team_id AND st.auto_assign) THEN
    PERFORM public.support_auto_assign(NEW.id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_support_ticket_autoassign ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_autoassign AFTER INSERT OR UPDATE OF assigned_team_id ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support__ticket_autoassign();

-- ---------------------------------------------------------------------
-- 10. order holds / needs attention
-- ---------------------------------------------------------------------
ALTER TABLE public.erp_orders ADD COLUMN IF NOT EXISTS on_hold boolean NOT NULL DEFAULT false;
ALTER TABLE public.erp_orders ADD COLUMN IF NOT EXISTS hold_reason text;
ALTER TABLE public.erp_orders ADD COLUMN IF NOT EXISTS held_at timestamptz;
ALTER TABLE public.erp_orders ADD COLUMN IF NOT EXISTS held_by uuid;
ALTER TABLE public.erp_orders ADD COLUMN IF NOT EXISTS needs_attention boolean NOT NULL DEFAULT false;
ALTER TABLE public.erp_orders ADD COLUMN IF NOT EXISTS attention_reason text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_orders_held_by_fk') THEN
    ALTER TABLE public.erp_orders ADD CONSTRAINT erp_orders_held_by_fk FOREIGN KEY (held_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_orders_hold_reason_chk') THEN
    ALTER TABLE public.erp_orders ADD CONSTRAINT erp_orders_hold_reason_chk CHECK (NOT on_hold OR hold_reason IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS erp_orders_attention_idx ON public.erp_orders(tenant_id) WHERE on_hold OR needs_attention;

CREATE OR REPLACE FUNCTION public.erp__order_hold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.on_hold AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('shipped','partially_shipped','delivered','fulfilled','completed','in_transit') THEN
    RAISE EXCEPTION 'order % is on hold (%): release it before shipping', coalesce(NEW.order_number, NEW.id::text), NEW.hold_reason;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_erp_order_hold_guard ON public.erp_orders;
CREATE TRIGGER trg_erp_order_hold_guard BEFORE UPDATE OF status ON public.erp_orders
  FOR EACH ROW EXECUTE FUNCTION public.erp__order_hold_guard();

CREATE OR REPLACE FUNCTION public.erp_hold_order(p_order uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE t uuid;
BEGIN
  SELECT tenant_id INTO t FROM public.erp_orders WHERE id = p_order;
  IF t IS NULL OR NOT public.platform_is_tenant_member(t) THEN RAISE EXCEPTION 'not allowed'; END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'a hold reason is required'; END IF;
  UPDATE public.erp_orders SET on_hold = true, hold_reason = p_reason, held_at = now(), held_by = auth.uid(),
         needs_attention = true, attention_reason = coalesce(attention_reason, 'on hold: ' || p_reason), updated_at = now()
   WHERE id = p_order;
  PERFORM public.platform_notify_followers(t, 'erp_orders', p_order, 'order.hold', 'Order put on hold', p_reason, '/orders/' || p_order);
END $$;

CREATE OR REPLACE FUNCTION public.erp_release_order(p_order uuid, p_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE t uuid;
BEGIN
  SELECT tenant_id INTO t FROM public.erp_orders WHERE id = p_order;
  IF t IS NULL OR NOT public.platform_is_tenant_member(t) THEN RAISE EXCEPTION 'not allowed'; END IF;
  UPDATE public.erp_orders SET on_hold = false, hold_reason = NULL, held_at = NULL, held_by = NULL,
         needs_attention = false, attention_reason = NULL, updated_at = now()
   WHERE id = p_order;
  PERFORM public.platform_notify_followers(t, 'erp_orders', p_order, 'order.released', 'Order released', p_note, '/orders/' || p_order);
END $$;

-- ---------------------------------------------------------------------
-- security: tenant tables -> members of the tenant; personal tables -> the user
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_out_of_office','support_oncall_schedules','support_oncall_participants','support_oncall_overrides',
                           'support_escalation_policies','support_escalation_policy_steps'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_tenant_rw ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_tenant_rw ON public.%I FOR ALL TO authenticated
                      USING (public.platform_is_tenant_member(tenant_id)) WITH CHECK (public.platform_is_tenant_member(tenant_id))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['platform_notification_preferences','platform_record_followers','platform_reminders'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_self_rw ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_self_rw ON public.%I FOR ALL TO authenticated
                      USING (user_id = auth.uid() AND public.platform_is_tenant_member(tenant_id))
                      WITH CHECK (user_id = auth.uid() AND public.platform_is_tenant_member(tenant_id))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
  -- pages: read by members, written only through the RPCs
  ALTER TABLE public.support_pages ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS unify_tenant_read ON public.support_pages;
  CREATE POLICY unify_tenant_read ON public.support_pages FOR SELECT TO authenticated USING (public.platform_is_tenant_member(tenant_id));
  GRANT SELECT ON public.support_pages TO authenticated;
  REVOKE INSERT, UPDATE, DELETE ON public.support_pages FROM authenticated;
  -- invitations: tenant admins read; written only through the RPCs
  ALTER TABLE public.platform_member_invitations ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS unify_admin_read ON public.platform_member_invitations;
  CREATE POLICY unify_admin_read ON public.platform_member_invitations FOR SELECT TO authenticated USING (public.platform_is_tenant_admin(tenant_id));
  GRANT SELECT ON public.platform_member_invitations TO authenticated;
  REVOKE INSERT, UPDATE, DELETE ON public.platform_member_invitations FROM authenticated;
  REVOKE ALL (token_hash) ON public.platform_member_invitations FROM authenticated;
END $$;
GRANT SELECT ON public.support_v_oncall_now TO authenticated;

-- RPC grants (internal helpers and cron entry points stay private)
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['platform_follow','platform_set_reminder','platform_invite_member','platform_accept_invitation',
                           'platform_revoke_invitation','support_page','support_ack_page','support_resolve_page','support_auto_assign',
                           'support_oncall_now','support_is_business_time','support_business_add_minutes','erp_hold_order','erp_release_order',
                           'platform_is_away','platform_rrule_next'] LOOP
    EXECUTE (SELECT string_agg(format('GRANT EXECUTE ON FUNCTION %s TO authenticated', p.oid::regprocedure), '; ')
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['platform_notify','platform_notify_followers','platform_dispatch_reminders','support_run_clocks',
                           'support__page_step','crm__task_recur','support__ticket_sla','support__ticket_autoassign','erp__order_hold_guard'] LOOP
    EXECUTE (SELECT string_agg(format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', p.oid::regprocedure), '; ')
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f);
  END LOOP;
END $$;

-- polymorphic (type, id) pairs used by the new tables
INSERT INTO public.platform_polymorphic_columns(table_name, type_column, id_column)
SELECT t, 'related_type', 'related_id' FROM unnest(ARRAY['platform_record_followers','platform_reminders']) t
 WHERE NOT EXISTS (SELECT 1 FROM public.platform_polymorphic_columns p WHERE p.table_name = t AND p.id_column = 'related_id')
ON CONFLICT DO NOTHING;

SELECT count(*) AS tables_secured FROM public.platform__apply_app_security();
SELECT public.platform_classify_tables() AS tables_classified;
UPDATE public.platform_table_registry SET lifecycle = 'log', classified_at = now() WHERE table_name IN ('support_pages');

COMMIT;

-- canonical step ledger
SELECT unify.done('300');
