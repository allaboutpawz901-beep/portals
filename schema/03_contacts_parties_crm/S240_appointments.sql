-- CANONICAL STEP 240  |  file S240_appointments.sql  |  was unify/04_appointments.sql  |  internal log label '04' (unchanged)
-- =====================================================================
-- S240_appointments.sql — the missing Appointments domain, plus the other
-- parent tables that existing columns already point at but that were never
-- created:
--
--   crm_dependents               <- 23 dangling dependent_id columns (pet, child, vehicle, property ...)
--   crm_appointments             <- 14 dangling appointment_id columns; outbox_emit already has branches for it
--   crm_appointment_resources    rooms / stations / chairs / equipment
--   crm_appointment_status_history
--   crm_staff_blocked_times      canonical for legacy blocked_times (+ date-specific availability)
--   crm_booking_policies         notice, horizon, slot size, cancellation window, deposit, auto-confirm
--   commerce_register_sessions   <- 3 dangling register_session_id columns (POS)
--   platform_report_definitions  <- analytics_export_runs.definition_id
--
-- RPCs: crm_available_slots, crm_book_appointment, crm_reschedule_appointment,
--       crm_cancel_appointment, crm_set_appointment_status
-- Customer rollups kept current: next_appointment_at, last_visit_at, total_visits, no_show_rate.
-- Staff and resource double-booking is impossible (GiST exclusion constraints).
-- Idempotent.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 240 (internal label '04'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S240_appointments.sql is step 240; run S200_unify_preflight.sql and every step up to 230 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('240');
END $guard$;
CREATE EXTENSION IF NOT EXISTS btree_gist;
BEGIN;

-- ------------------------------------------------------------ dependents
CREATE TABLE IF NOT EXISTS public.crm_dependents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  primary_customer_id uuid REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  dependent_type      text NOT NULL DEFAULT 'person'
                      CHECK (dependent_type IN ('person','child','pet','vehicle','property','equipment','other')),
  name                text NOT NULL,
  date_of_birth       date,
  attributes          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- species/breed/weight, make/model/VIN, address ...
  notes               text,
  photo_url           text,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_dependents_customer_idx ON public.crm_dependents(tenant_id, primary_customer_id);

-- ------------------------------------------------------------ resources
CREATE TABLE IF NOT EXISTS public.crm_appointment_resources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id   uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  name          text NOT NULL,
  resource_type text NOT NULL DEFAULT 'station'
                CHECK (resource_type IN ('room','station','chair','table','equipment','vehicle','other')),
  capacity      integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, location_id, name)
);

-- ------------------------------------------------------------ policies
CREATE TABLE IF NOT EXISTS public.crm_booking_policies (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id               uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  service_id                uuid REFERENCES public.crm_services(id) ON DELETE CASCADE,
  slot_interval_minutes     integer NOT NULL DEFAULT 15 CHECK (slot_interval_minutes BETWEEN 5 AND 240),
  min_notice_minutes        integer NOT NULL DEFAULT 60 CHECK (min_notice_minutes >= 0),
  max_advance_days          integer NOT NULL DEFAULT 90 CHECK (max_advance_days > 0),
  buffer_before_minutes     integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes      integer NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
  cancellation_window_hours integer NOT NULL DEFAULT 24 CHECK (cancellation_window_hours >= 0),
  late_cancel_fee           numeric(12,2) NOT NULL DEFAULT 0,
  no_show_fee               numeric(12,2) NOT NULL DEFAULT 0,
  deposit_required          boolean NOT NULL DEFAULT false,
  deposit_amount            numeric(12,2),
  allow_online_booking      boolean NOT NULL DEFAULT true,
  auto_confirm              boolean NOT NULL DEFAULT true,
  default_timezone          text NOT NULL DEFAULT 'America/Chicago',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_booking_policies_scope_uq
  ON public.crm_booking_policies(tenant_id, location_id, service_id) NULLS NOT DISTINCT;

-- ------------------------------------------------------------ appointments
CREATE TABLE IF NOT EXISTS public.crm_appointments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  appointment_number    text NOT NULL,
  customer_id           uuid NOT NULL REFERENCES public.crm_customers(id) ON DELETE RESTRICT,
  dependent_id          uuid REFERENCES public.crm_dependents(id) ON DELETE SET NULL,
  location_id           uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  staff_id              uuid REFERENCES public.crm_staff(id) ON DELETE SET NULL,
  resource_id           uuid REFERENCES public.crm_appointment_resources(id) ON DELETE SET NULL,
  service_id            uuid REFERENCES public.crm_services(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('requested','scheduled','confirmed','checked_in','in_progress',
                                          'completed','cancelled','no_show','rescheduled')),
  starts_at             timestamptz NOT NULL,
  ends_at               timestamptz NOT NULL,
  buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes  integer NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
  block_starts_at       timestamptz,          -- starts_at - buffer (maintained by trigger)
  block_ends_at         timestamptz,          -- ends_at + buffer
  timezone              text NOT NULL DEFAULT 'America/Chicago',
  source_channel        text NOT NULL DEFAULT 'staff'
                        CHECK (source_channel IN ('staff','online','phone','walk_in','portal','api','import')),
  customer_notes        text,
  internal_notes        text,
  cancellation_reason   text,
  cancelled_at          timestamptz,
  cancelled_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  late_cancel           boolean NOT NULL DEFAULT false,
  confirmed_at          timestamptz,
  checked_in_at         timestamptz,
  started_at            timestamptz,
  completed_at          timestamptz,
  no_show_at            timestamptz,
  rescheduled_from_id   uuid REFERENCES public.crm_appointments(id) ON DELETE SET NULL,
  deposit_id            uuid REFERENCES public.commerce_deposits(id) ON DELETE SET NULL,
  estimate_id           uuid REFERENCES public.acct_estimates(id) ON DELETE SET NULL,
  invoice_id            uuid REFERENCES public.acct_ar_invoices(id) ON DELETE SET NULL,
  sale_id               uuid REFERENCES public.commerce_sales(id) ON DELETE SET NULL,
  erp_order_id          uuid REFERENCES public.erp_orders(id) ON DELETE SET NULL,
  estimated_total       numeric(12,2),
  idempotency_key       text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_appointments_time_ck CHECK (ends_at > starts_at),
  CONSTRAINT crm_appointments_number_uq UNIQUE (tenant_id, appointment_number),
  CONSTRAINT crm_appointments_idem_uq UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT crm_appointments_no_staff_overlap EXCLUDE USING gist
    (staff_id WITH =, tstzrange(block_starts_at, block_ends_at, '[)') WITH &&)
    WHERE (staff_id IS NOT NULL AND status IN ('requested','scheduled','confirmed','checked_in','in_progress')),
  CONSTRAINT crm_appointments_no_resource_overlap EXCLUDE USING gist
    (resource_id WITH =, tstzrange(block_starts_at, block_ends_at, '[)') WITH &&)
    WHERE (resource_id IS NOT NULL AND status IN ('requested','scheduled','confirmed','checked_in','in_progress'))
);
CREATE INDEX IF NOT EXISTS crm_appointments_calendar_idx ON public.crm_appointments(tenant_id, starts_at);
CREATE INDEX IF NOT EXISTS crm_appointments_customer_idx ON public.crm_appointments(customer_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS crm_appointments_staff_idx ON public.crm_appointments(staff_id, starts_at);

CREATE TABLE IF NOT EXISTS public.crm_appointment_status_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.crm_appointments(id) ON DELETE CASCADE,
  from_status    text,
  to_status      text NOT NULL,
  reason         text,
  changed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_appointment_status_history_appt_idx ON public.crm_appointment_status_history(appointment_id, changed_at);

CREATE TABLE IF NOT EXISTS public.crm_staff_blocked_times (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_id    uuid REFERENCES public.crm_staff(id) ON DELETE CASCADE,       -- NULL = whole location/business closed
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  block_type  text NOT NULL DEFAULT 'blocked' CHECK (block_type IN ('blocked','time_off','holiday','break','extra_availability')),
  reason      text,
  legacy_source text,
  legacy_id   text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (legacy_source, legacy_id)
);
CREATE INDEX IF NOT EXISTS crm_staff_blocked_times_idx ON public.crm_staff_blocked_times(tenant_id, staff_id, starts_at);

-- ------------------------------------------------------------ POS + reports
CREATE TABLE IF NOT EXISTS public.commerce_register_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_id    uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  register_code  text NOT NULL DEFAULT 'main',
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','reconciled')),
  opened_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_by_staff_id uuid REFERENCES public.crm_staff(id) ON DELETE SET NULL,
  opened_at      timestamptz NOT NULL DEFAULT now(),
  opening_float  numeric(12,2) NOT NULL DEFAULT 0,
  closed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at      timestamptz,
  expected_cash  numeric(12,2),
  counted_cash   numeric(12,2),
  cash_variance  numeric(12,2) GENERATED ALWAYS AS (counted_cash - expected_cash) STORED,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_register_sessions_one_open
  ON public.commerce_register_sessions(tenant_id, location_id, register_code) NULLS NOT DISTINCT WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.platform_report_definitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  data_source   text NOT NULL,              -- table/view/RPC the report reads
  definition    jsonb NOT NULL DEFAULT '{}'::jsonb,
  columns       jsonb,
  filters       jsonb,
  schedule      text,                       -- cron text; NULL = on demand
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_shared     boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- ------------------------------------------------------------ triggers
CREATE OR REPLACE FUNCTION public.crm__appointment_before() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.appointment_number IS NULL OR NEW.appointment_number = '' THEN
    NEW.appointment_number := public.erp_next_document_number(NEW.tenant_id, 'appointment');
  END IF;
  NEW.block_starts_at := NEW.starts_at - make_interval(mins => NEW.buffer_before_minutes);
  NEW.block_ends_at   := NEW.ends_at   + make_interval(mins => NEW.buffer_after_minutes);
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    CASE NEW.status
      WHEN 'confirmed'   THEN NEW.confirmed_at  := coalesce(NEW.confirmed_at, now());
      WHEN 'checked_in'  THEN NEW.checked_in_at := coalesce(NEW.checked_in_at, now());
      WHEN 'in_progress' THEN NEW.started_at    := coalesce(NEW.started_at, now());
      WHEN 'completed'   THEN NEW.completed_at  := coalesce(NEW.completed_at, now());
      WHEN 'cancelled'   THEN NEW.cancelled_at  := coalesce(NEW.cancelled_at, now());
      WHEN 'no_show'     THEN NEW.no_show_at    := coalesce(NEW.no_show_at, now());
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_appointments_before ON public.crm_appointments;
CREATE TRIGGER crm_appointments_before BEFORE INSERT OR UPDATE ON public.crm_appointments
  FOR EACH ROW EXECUTE FUNCTION public.crm__appointment_before();

CREATE OR REPLACE FUNCTION public.crm__refresh_customer_visits(p_customer uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.crm_customers c SET
    next_appointment_at = s.next_at, last_visit_at = coalesce(s.last_at, c.last_visit_at),
    total_visits = s.visits, no_show_rate = coalesce(s.no_show_rate, 0),
    cancellation_rate = coalesce(s.cancel_rate, 0), updated_at = now()
  FROM (SELECT min(starts_at) FILTER (WHERE status IN ('requested','scheduled','confirmed') AND starts_at > now()) AS next_at,
               max(coalesce(completed_at, starts_at)) FILTER (WHERE status = 'completed') AS last_at,
               count(*) FILTER (WHERE status = 'completed')::int AS visits,
               round(count(*) FILTER (WHERE status = 'no_show')::numeric
                     / nullif(count(*) FILTER (WHERE status IN ('completed','no_show')), 0), 4) AS no_show_rate,
               round(count(*) FILTER (WHERE status = 'cancelled')::numeric
                     / nullif(count(*) FILTER (WHERE status <> 'rescheduled'), 0), 4) AS cancel_rate
          FROM public.crm_appointments WHERE customer_id = p_customer) s
  WHERE c.id = p_customer $$;

CREATE OR REPLACE FUNCTION public.crm__appointment_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.crm_appointment_status_history(tenant_id, appointment_id, from_status, to_status, reason, changed_by)
    VALUES (NEW.tenant_id, NEW.id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END, NEW.status,
            CASE WHEN NEW.status = 'cancelled' THEN NEW.cancellation_reason END, auth.uid());
  END IF;
  PERFORM public.crm__refresh_customer_visits(NEW.customer_id);
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM public.crm__refresh_customer_visits(OLD.customer_id);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS crm_appointments_after ON public.crm_appointments;
CREATE TRIGGER crm_appointments_after AFTER INSERT OR UPDATE ON public.crm_appointments
  FOR EACH ROW EXECUTE FUNCTION public.crm__appointment_after();

-- event bus: outbox_emit / outbox_emit_lifecycle already contain crm_appointments branches
DROP TRIGGER IF EXISTS trg_outbox_appointment_created ON public.crm_appointments;
CREATE TRIGGER trg_outbox_appointment_created AFTER INSERT ON public.crm_appointments
  FOR EACH ROW EXECUTE FUNCTION public.outbox_emit();
DROP TRIGGER IF EXISTS trg_outbox_appointment_closed ON public.crm_appointments;
CREATE TRIGGER trg_outbox_appointment_closed AFTER UPDATE OF status ON public.crm_appointments
  FOR EACH ROW EXECUTE FUNCTION public.outbox_emit();
DROP TRIGGER IF EXISTS trg_outbox_appointment_lifecycle ON public.crm_appointments;
CREATE TRIGGER trg_outbox_appointment_lifecycle AFTER UPDATE OF status ON public.crm_appointments
  FOR EACH ROW EXECUTE FUNCTION public.outbox_emit_lifecycle();

-- ------------------------------------------------------------ RPCs
CREATE OR REPLACE FUNCTION public.crm__assert_member(p_tenant uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_user IN ('postgres','service_role','supabase_admin') OR auth.role() = 'service_role' THEN RETURN; END IF;
  IF NOT public.platform_is_tenant_member(p_tenant) THEN
    RAISE EXCEPTION 'not a member of tenant %', p_tenant USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.crm__policy(p_tenant uuid, p_location uuid, p_service uuid)
RETURNS public.crm_booking_policies LANGUAGE sql STABLE AS $$
  SELECT p FROM (
    SELECT p, (p.location_id IS NOT NULL)::int + (p.service_id IS NOT NULL)::int * 2 AS score
      FROM public.crm_booking_policies p
     WHERE p.tenant_id = p_tenant
       AND (p.location_id IS NULL OR p.location_id = p_location)
       AND (p.service_id IS NULL OR p.service_id = p_service)
    UNION ALL
    SELECT ROW(NULL, p_tenant, NULL, NULL, 15, 60, 90, 0, 0, 24, 0, 0, false, NULL, true, true,
               'America/Chicago', now(), now())::public.crm_booking_policies, -1
  ) x ORDER BY score DESC LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.crm__service_minutes(p_service uuid, p_location uuid) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT coalesce((SELECT a.duration_minutes FROM public.crm_service_location_availability a
                    WHERE a.service_id = p_service AND a.location_id = p_location AND a.is_active IS NOT FALSE LIMIT 1),
                  (SELECT s.default_duration_minutes FROM public.crm_services s WHERE s.id = p_service), 60) $$;

CREATE OR REPLACE FUNCTION public.crm_available_slots(p_tenant uuid, p_service uuid, p_date date,
                                                      p_location uuid DEFAULT NULL, p_staff uuid DEFAULT NULL)
RETURNS TABLE(staff_id uuid, staff_name text, starts_at timestamptz, ends_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE pol public.crm_booking_policies; tz text; mins int;
BEGIN
  PERFORM public.crm__assert_member(p_tenant);
  pol  := public.crm__policy(p_tenant, p_location, p_service);
  tz   := coalesce((SELECT l.timezone FROM public.locations l WHERE l.id = p_location), pol.default_timezone);
  mins := public.crm__service_minutes(p_service, p_location);
  IF p_date > (now() AT TIME ZONE tz)::date + pol.max_advance_days THEN RETURN; END IF;
  RETURN QUERY
  WITH windows AS (
    SELECT st.id AS sid, st.display_name,
           (p_date + av.available_from) AT TIME ZONE tz AS w_from,
           (p_date + av.available_to)   AT TIME ZONE tz AS w_to
      FROM public.crm_staff st
      JOIN public.crm_staff_availability av ON av.staff_id = st.id
     WHERE st.tenant_id = p_tenant AND st.is_active IS NOT FALSE AND st.is_service_staff IS NOT FALSE
       AND (p_staff IS NULL OR st.id = p_staff)
       AND av.day_of_week = extract(dow FROM p_date)::int
       AND coalesce(av.availability_type, 'available') <> 'unavailable'
       AND (av.effective_from IS NULL OR av.effective_from <= p_date)
       AND (av.effective_to IS NULL OR av.effective_to >= p_date)
       AND (p_location IS NULL OR av.location_id IS NULL OR av.location_id = p_location)
    UNION ALL   -- one-off extra availability
    SELECT st.id, st.display_name, b.starts_at, b.ends_at
      FROM public.crm_staff_blocked_times b JOIN public.crm_staff st ON st.id = b.staff_id
     WHERE b.tenant_id = p_tenant AND b.block_type = 'extra_availability'
       AND (p_staff IS NULL OR st.id = p_staff)
       AND (b.starts_at AT TIME ZONE tz)::date = p_date
  ), cand AS (
    SELECT w.sid, w.display_name, g AS s, g + make_interval(mins => mins) AS e
      FROM windows w,
           generate_series(w.w_from, w.w_to - make_interval(mins => mins), make_interval(mins => pol.slot_interval_minutes)) g
  )
  SELECT DISTINCT c.sid, c.display_name, c.s, c.e
    FROM cand c
   WHERE c.s >= now() + make_interval(mins => pol.min_notice_minutes)
     AND NOT EXISTS (SELECT 1 FROM public.crm_appointments a
                      WHERE a.staff_id = c.sid
                        AND a.status IN ('requested','scheduled','confirmed','checked_in','in_progress')
                        AND tstzrange(a.block_starts_at, a.block_ends_at, '[)')
                            && tstzrange(c.s - make_interval(mins => pol.buffer_before_minutes),
                                         c.e + make_interval(mins => pol.buffer_after_minutes), '[)'))
     AND NOT EXISTS (SELECT 1 FROM public.crm_staff_blocked_times b
                      WHERE b.tenant_id = p_tenant AND b.block_type <> 'extra_availability'
                        AND (b.staff_id = c.sid OR (b.staff_id IS NULL AND (b.location_id IS NULL OR b.location_id = p_location)))
                        AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(c.s, c.e, '[)'))
   ORDER BY c.s, c.display_name;
END $$;

CREATE OR REPLACE FUNCTION public.crm_book_appointment(
  p_tenant uuid, p_customer uuid, p_service uuid, p_starts_at timestamptz,
  p_staff uuid DEFAULT NULL, p_location uuid DEFAULT NULL, p_dependent uuid DEFAULT NULL,
  p_resource uuid DEFAULT NULL, p_source_channel text DEFAULT 'staff', p_customer_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL, p_duration_minutes integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pol public.crm_booking_policies; v uuid; mins int; v_staff uuid := p_staff; tz text; price numeric;
BEGIN
  PERFORM public.crm__assert_member(p_tenant);
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v FROM public.crm_appointments WHERE tenant_id = p_tenant AND idempotency_key = p_idempotency_key;
    IF v IS NOT NULL THEN RETURN v; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_customers WHERE id = p_customer AND tenant_id = p_tenant) THEN
    RAISE EXCEPTION 'customer % not found in tenant', p_customer;
  END IF;
  pol  := public.crm__policy(p_tenant, p_location, p_service);
  IF p_source_channel IN ('online','portal') AND NOT pol.allow_online_booking THEN
    RAISE EXCEPTION 'online booking is disabled for this service/location';
  END IF;
  tz   := coalesce((SELECT timezone FROM public.locations WHERE id = p_location), pol.default_timezone);
  mins := coalesce(p_duration_minutes, public.crm__service_minutes(p_service, p_location));
  IF v_staff IS NULL THEN   -- first free qualified staff member for that exact start
    SELECT s.staff_id INTO v_staff FROM public.crm_available_slots(p_tenant, p_service, (p_starts_at AT TIME ZONE tz)::date, p_location) s
     WHERE s.starts_at = p_starts_at LIMIT 1;
  END IF;
  SELECT coalesce(a.price, s.default_price) INTO price FROM public.crm_services s
    LEFT JOIN public.crm_service_location_availability a ON a.service_id = s.id AND a.location_id = p_location
   WHERE s.id = p_service;
  BEGIN
    INSERT INTO public.crm_appointments(tenant_id, appointment_number, customer_id, dependent_id, location_id, staff_id, resource_id,
                                        service_id, status, starts_at, ends_at, buffer_before_minutes, buffer_after_minutes,
                                        timezone, source_channel, customer_notes, estimated_total, idempotency_key, created_by)
    VALUES (p_tenant, '', p_customer, p_dependent, p_location, v_staff, p_resource, p_service,
            CASE WHEN pol.auto_confirm THEN 'confirmed' ELSE 'requested' END,
            p_starts_at, p_starts_at + make_interval(mins => mins), pol.buffer_before_minutes, pol.buffer_after_minutes,
            tz, coalesce(p_source_channel, 'staff'), p_customer_notes, price, p_idempotency_key, auth.uid())
    RETURNING id INTO v;
  EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'that time is no longer available for this staff member or resource' USING ERRCODE = 'P0001';
  END;
  IF p_service IS NOT NULL THEN
    INSERT INTO public.crm_appointment_services(tenant_id, appointment_id, dependent_id, service_id, staff_id, quantity,
                                                duration_minutes, unit_price, total, status)
    VALUES (p_tenant, v, p_dependent, p_service, v_staff, 1, mins, price, price, 'scheduled');
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.crm_reschedule_appointment(p_appointment uuid, p_new_starts_at timestamptz,
                                                             p_new_staff uuid DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.crm_appointments; v uuid;
BEGIN
  SELECT * INTO a FROM public.crm_appointments WHERE id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment % not found', p_appointment; END IF;
  PERFORM public.crm__assert_member(a.tenant_id);
  IF a.status NOT IN ('requested','scheduled','confirmed') THEN
    RAISE EXCEPTION 'cannot reschedule an appointment that is %', a.status;
  END IF;
  UPDATE public.crm_appointments SET status = 'rescheduled', internal_notes = concat_ws(E'\n', internal_notes, p_reason)
   WHERE id = a.id;
  v := public.crm_book_appointment(a.tenant_id, a.customer_id, a.service_id, p_new_starts_at,
                                   coalesce(p_new_staff, a.staff_id), a.location_id, a.dependent_id, a.resource_id,
                                   a.source_channel, a.customer_notes, NULL,
                                   (extract(epoch FROM a.ends_at - a.starts_at) / 60)::int);
  UPDATE public.crm_appointments SET rescheduled_from_id = a.id, deposit_id = a.deposit_id, estimate_id = a.estimate_id
   WHERE id = v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.crm_cancel_appointment(p_appointment uuid, p_reason text DEFAULT NULL)
RETURNS public.crm_appointments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.crm_appointments; pol public.crm_booking_policies;
BEGIN
  SELECT * INTO a FROM public.crm_appointments WHERE id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment % not found', p_appointment; END IF;
  PERFORM public.crm__assert_member(a.tenant_id);
  IF a.status IN ('completed','cancelled','no_show','rescheduled') THEN
    RAISE EXCEPTION 'appointment is already %', a.status;
  END IF;
  pol := public.crm__policy(a.tenant_id, a.location_id, a.service_id);
  UPDATE public.crm_appointments
     SET status = 'cancelled', cancellation_reason = p_reason, cancelled_by = auth.uid(),
         late_cancel = (a.starts_at - now()) < make_interval(hours => pol.cancellation_window_hours)
   WHERE id = a.id RETURNING * INTO a;
  UPDATE public.crm_appointment_services SET status = 'cancelled' WHERE appointment_id = a.id AND status = 'scheduled';
  RETURN a;
END $$;

CREATE OR REPLACE FUNCTION public.crm_set_appointment_status(p_appointment uuid, p_status text, p_note text DEFAULT NULL)
RETURNS public.crm_appointments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.crm_appointments; ok boolean;
BEGIN
  SELECT * INTO a FROM public.crm_appointments WHERE id = p_appointment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment % not found', p_appointment; END IF;
  PERFORM public.crm__assert_member(a.tenant_id);
  ok := (a.status, p_status) IN (('requested','scheduled'), ('requested','confirmed'), ('scheduled','confirmed'),
                                 ('scheduled','checked_in'), ('confirmed','checked_in'), ('checked_in','in_progress'),
                                 ('scheduled','in_progress'), ('confirmed','in_progress'), ('in_progress','completed'),
                                 ('checked_in','completed'), ('scheduled','no_show'), ('confirmed','no_show'),
                                 ('requested','no_show'));
  IF NOT ok THEN RAISE EXCEPTION 'invalid appointment transition % -> %', a.status, p_status; END IF;
  UPDATE public.crm_appointments SET status = p_status,
         internal_notes = CASE WHEN p_note IS NULL THEN internal_notes ELSE concat_ws(E'\n', internal_notes, p_note) END
   WHERE id = a.id RETURNING * INTO a;
  UPDATE public.crm_appointment_services SET status = CASE p_status WHEN 'in_progress' THEN 'in_progress'
                                                                     WHEN 'completed' THEN 'completed'
                                                                     WHEN 'no_show' THEN 'skipped' ELSE status END
   WHERE appointment_id = a.id AND status NOT IN ('completed','cancelled');
  RETURN a;
END $$;

REVOKE ALL ON FUNCTION public.crm_available_slots(uuid,uuid,date,uuid,uuid), public.crm_book_appointment(uuid,uuid,uuid,timestamptz,uuid,uuid,uuid,uuid,text,text,text,integer),
  public.crm_reschedule_appointment(uuid,timestamptz,uuid,text), public.crm_cancel_appointment(uuid,text),
  public.crm_set_appointment_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_available_slots(uuid,uuid,date,uuid,uuid), public.crm_book_appointment(uuid,uuid,uuid,timestamptz,uuid,uuid,uuid,uuid,text,text,text,integer),
  public.crm_reschedule_appointment(uuid,timestamptz,uuid,text), public.crm_cancel_appointment(uuid,text),
  public.crm_set_appointment_status(uuid,text,text) TO authenticated, service_role;

-- crm_appointment_services has no primary key, so crm_notes.service_record_id cannot reference it
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.crm_appointment_services'::regclass AND contype = 'p') THEN
    UPDATE public.crm_appointment_services SET id = gen_random_uuid() WHERE id IS NULL;
    ALTER TABLE public.crm_appointment_services ADD CONSTRAINT crm_appointment_services_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- ------------------------------------------------------------ dependents link table
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.crm_party_dependents'::regclass
                  AND contype = 'f' AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.crm_party_dependents'::regclass AND attname = 'dependent_id')]::int2[]) THEN
    ALTER TABLE public.crm_party_dependents ADD CONSTRAINT crm_party_dependents_dependent_id_fk
      FOREIGN KEY (dependent_id) REFERENCES public.crm_dependents(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

-- ------------------------------------------------------------ legacy calendar data
-- blocked_times / availability use text staffId and text date/time. Resolve
-- staff by crm_staff id, legacy staff email, or legacy staff name.
CREATE OR REPLACE FUNCTION unify.resolve_staff(p_tenant uuid, p_legacy text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    (SELECT id FROM public.crm_staff WHERE tenant_id = p_tenant AND id::text = p_legacy),
    (SELECT c.id FROM public.staff s JOIN public.crm_staff c ON c.tenant_id = p_tenant
            AND lower(c.email) = lower(s.email) WHERE s.id = p_legacy LIMIT 1),
    (SELECT c.id FROM public.staff s JOIN public.crm_staff c ON c.tenant_id = p_tenant
            AND lower(c.display_name) = lower(s.name) WHERE s.id = p_legacy LIMIT 1)) $$;

DO $$
DECLARE tz text := 'America/Chicago'; n int := 0; r record;
BEGIN
  IF to_regclass('public.blocked_times') IS NOT NULL THEN
    FOR r IN SELECT b.*, unify.resolve_staff(b.tenant_id, b."staffId") AS sid FROM public.blocked_times b LOOP
      BEGIN
        INSERT INTO public.crm_staff_blocked_times(tenant_id, staff_id, starts_at, ends_at, block_type, reason, legacy_source, legacy_id)
        VALUES (r.tenant_id, r.sid,
                (r.date::date + coalesce(nullif(r."startTime", ''), '00:00')::time) AT TIME ZONE tz,
                (r.date::date + coalesce(nullif(r."endTime", ''), '23:59')::time) AT TIME ZONE tz,
                'blocked', r.reason, 'blocked_times', r.id)
        ON CONFLICT (legacy_source, legacy_id) DO NOTHING;
        IF r."staffId" IS NOT NULL AND r.sid IS NULL THEN
          PERFORM unify.log('blocked_times', r.id, 'staff_unresolved', r."staffId" || ' -> saved as business-wide block');
        END IF;
        n := n + 1;
      EXCEPTION WHEN others THEN PERFORM unify.log('blocked_times', r.id, 'migrate_failed', SQLERRM);
      END;
    END LOOP;
  END IF;
  IF to_regclass('public.availability') IS NOT NULL THEN
    FOR r IN SELECT a.*, unify.resolve_staff(a.tenant_id, a."staffId") AS sid FROM public.availability a LOOP
      BEGIN
        IF r.sid IS NULL THEN
          PERFORM unify.log('availability', r.id, 'staff_unresolved', coalesce(r."staffId", '(null)')); CONTINUE;
        END IF;
        INSERT INTO public.crm_staff_blocked_times(tenant_id, staff_id, starts_at, ends_at, block_type, reason, legacy_source, legacy_id)
        VALUES (r.tenant_id, r.sid,
                (r.date::date + r."startTime"::time) AT TIME ZONE tz, (r.date::date + r."endTime"::time) AT TIME ZONE tz,
                CASE WHEN lower(coalesce(r.status, 'available')) IN ('available','open') THEN 'extra_availability' ELSE 'blocked' END,
                'legacy availability: ' || coalesce(r.status, ''), 'availability', r.id)
        ON CONFLICT (legacy_source, legacy_id) DO NOTHING;
        n := n + 1;
      EXCEPTION WHEN others THEN PERFORM unify.log('availability', r.id, 'migrate_failed', SQLERRM);
      END;
    END LOOP;
  END IF;
  PERFORM unify.log('calendar', NULL, 'legacy_calendar_migrated', n::text);
END $$;

-- ------------------------------------------------------------ RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_dependents','crm_appointment_resources','crm_booking_policies','crm_appointments',
                           'crm_appointment_status_history','crm_staff_blocked_times','commerce_register_sessions',
                           'platform_report_definitions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_tenant_rw ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_tenant_rw ON public.%I FOR ALL TO authenticated
                      USING (public.platform_is_tenant_member(tenant_id)) WITH CHECK (public.platform_is_tenant_member(tenant_id))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;
-- history is append-only from the app's point of view
REVOKE INSERT, UPDATE, DELETE ON public.crm_appointment_status_history FROM authenticated;

COMMIT;

SELECT 'appointments domain ready' AS status,
       (SELECT count(*) FROM public.crm_staff_blocked_times) AS calendar_blocks_migrated,
       (SELECT count(*) FROM unify.run_log WHERE action = 'staff_unresolved') AS legacy_calendar_rows_unresolved;

-- canonical step ledger
SELECT unify.done('240');
