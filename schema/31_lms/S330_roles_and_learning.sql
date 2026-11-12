-- CANONICAL STEP 330  |  file S330_roles_and_learning.sql  |  was unify/06e_roles_and_learning.sql  |  internal log label '06e' (unchanged)
-- =====================================================================
-- S330_roles_and_learning.sql — agnostic roles + a learning module that
-- serves EdTech without an `lms` schema.
--
-- A. Roles       A role decides what someone may do, and a title says what
--                the business calls them. The two are kept apart:
--                  groomer    -> role provider,    title "Groomer"
--                  front_desk -> role coordinator, title "Front desk"
--                Every client gets the same 9 roles. Packs give the
--                provider and coordinator roles their local names
--                (Groomer, Instructor, Clinician, Agent, Technician ...).
--                Old values the app still sends are mapped on write, so
--                nothing breaks.
-- B. Grants      platform_member_roles holds extra and scoped role grants
--                (one user can be a provider for one program and a
--                participant in another). It replaces lms.lms_roles and
--                lms.lms_role_assignments, which were never created.
-- C. lms         34 functions had search_path = lms, public, pg_catalog,
--                but there is no lms schema. They are reset to
--                public, pg_catalog; name lookups behave exactly as today.
--                assign_lms_role / revoke_lms_role wrote to lms.* tables
--                that don't exist, so every call failed. They are now thin
--                wrappers over the agnostic grants (same signatures).
-- D. Learning    programs, units, cohorts, cohort staff, enrollments,
--                progress, certificates. Generic enough for staff
--                training, customer classes, CE credits and
--                certifications; the EdTech pack names them Course / Term /
--                Student and ties enrollments to the student record.
-- Idempotent; RLS on everything; FKs on every *_id.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 330 (internal label '06e'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S330_roles_and_learning.sql is step 330; run S200_unify_preflight.sql and every step up to 320 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('330');
END $guard$;
BEGIN;

-- =====================================================================
-- A. roles
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.platform_roles (
  code        text PRIMARY KEY,
  label       text NOT NULL,                 -- default label; packs rename via platform_terminology 'role.<code>'
  plural      text NOT NULL,
  rank        integer NOT NULL,              -- higher = more authority (used when one user holds several grants)
  role_kind   text NOT NULL CHECK (role_kind IN ('staff','participant','platform')),
  description text,
  sort_order  integer NOT NULL DEFAULT 100
);
INSERT INTO public.platform_roles(code, label, plural, rank, role_kind, description, sort_order) VALUES
 ('owner',          'Owner',          'Owners',          100,'staff',      'Owns the workspace: billing, deletion, all settings.', 10),
 ('admin',          'Admin',          'Admins',           90,'staff',      'Manages settings, modules, packs and team.', 20),
 ('manager',        'Manager',        'Managers',         70,'staff',      'Runs day-to-day operations and approves work.', 30),
 ('provider',       'Provider',       'Providers',        50,'staff',      'Delivers the service: groomer, instructor, clinician, technician, agent, advisor.', 40),
 ('coordinator',    'Coordinator',    'Coordinators',     40,'staff',      'Front of house: scheduling, check-in, intake, client support.', 50),
 ('staff',          'Staff',          'Staff',            30,'staff',      'General team member.', 60),
 ('viewer',         'Viewer',         'Viewers',          10,'staff',      'Read-only team member.', 70),
 ('participant',    'Participant',    'Participants',      5,'participant','Outside person taking part: learner, student, client portal user. Not a workspace member; sees only their own records.', 80),
 ('platform_admin', 'Platform admin', 'Platform admins', 1000,'platform',  'Operates the whole platform (platform_admins).', 90)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, plural = EXCLUDED.plural, rank = EXCLUDED.rank,
  role_kind = EXCLUDED.role_kind, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

-- old / vertical values -> agnostic role (+ the title to keep)
CREATE TABLE IF NOT EXISTS public.platform_role_aliases (
  alias     text PRIMARY KEY,
  role_code text NOT NULL REFERENCES public.platform_roles(code) ON DELETE CASCADE,
  title     text,                         -- what the business called it
  source    text NOT NULL DEFAULT 'unify 06e'
);
INSERT INTO public.platform_role_aliases(alias, role_code, title, source) VALUES
 ('groomer','provider','Groomer','tenant_memberships (pet grooming)'),
 ('front_desk','coordinator','Front desk','tenant_memberships (pet grooming)'),
 ('instructor','provider','Instructor','lms'),
 ('support_navigator','coordinator','Support navigator','lms'),
 ('learner','participant','Learner','lms'),
 ('student','participant','Student','edtech'),
 ('org_admin','admin','Admin','lms'),
 ('administrator','admin',NULL,'legacy'),
 ('tenant_admin','admin',NULL,'user_tenants'),
 ('super_admin','owner',NULL,'legacy policies')
ON CONFLICT (alias) DO UPDATE SET role_code = EXCLUDED.role_code, title = EXCLUDED.title, source = EXCLUDED.source;

CREATE OR REPLACE FUNCTION public.platform_resolve_role(p_role text) RETURNS text
LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT coalesce((SELECT code FROM public.platform_roles WHERE code = lower(btrim(p_role))),
                  (SELECT role_code FROM public.platform_role_aliases WHERE alias = lower(btrim(p_role)))) $$;

-- what this tenant calls a role (pack terminology wins, then the default label)
CREATE OR REPLACE FUNCTION public.platform_role_label(p_tenant uuid, p_role text, p_plural boolean DEFAULT false) RETURNS text
LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT coalesce((SELECT CASE WHEN p_plural THEN t.plural ELSE t.singular END FROM public.platform_terminology t
                    WHERE t.tenant_id = p_tenant AND t.term_key = 'role.' || public.platform_resolve_role(p_role)),
                  (SELECT CASE WHEN p_plural THEN r.plural ELSE r.label END FROM public.platform_roles r
                    WHERE r.code = public.platform_resolve_role(p_role)), p_role) $$;

-- job title is separate from the role
ALTER TABLE public.tenant_memberships ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.platform_member_invitations ADD COLUMN IF NOT EXISTS title text;

-- map aliases on write (the app may still send 'groomer' / 'front_desk')
CREATE OR REPLACE FUNCTION public.platform__role_alias() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE a record; col text := TG_ARGV[0];
BEGIN
  IF col = 'role' THEN
    SELECT * INTO a FROM public.platform_role_aliases WHERE alias = lower(btrim(NEW.role));
    IF a.alias IS NOT NULL THEN
      NEW.role := a.role_code;
      IF TG_TABLE_NAME IN ('tenant_memberships','platform_member_invitations') AND NEW.title IS NULL THEN NEW.title := a.title; END IF;
    ELSIF NEW.role IS NOT NULL THEN
      NEW.role := lower(btrim(NEW.role));
    END IF;
  ELSE  -- platform_member_roles.role_code
    SELECT * INTO a FROM public.platform_role_aliases WHERE alias = lower(btrim(NEW.role_code));
    IF a.alias IS NOT NULL THEN
      NEW.role_code := a.role_code;
      IF NEW.title IS NULL THEN NEW.title := a.title; END IF;
    ELSE
      NEW.role_code := lower(btrim(NEW.role_code));
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- migrate existing rows, then replace the hard-coded CHECKs with a real FK
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('tenant_memberships','tenant_memberships_role_check'),
                                 ('platform_member_invitations','platform_member_invitations_role_check')) v(tbl, con) LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.tbl, r.con);
    EXECUTE format($f$UPDATE public.%I x SET title = coalesce(x.title, a.title), role = a.role_code
                        FROM public.platform_role_aliases a WHERE a.alias = lower(x.role)$f$, r.tbl);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN PERFORM unify.log('06e', r.tbl, 'roles_renamed', n || ' rows moved to agnostic roles'); END IF;
    -- anything still unknown is kept as staff with its old value as the title (never silently dropped)
    EXECUTE format($f$UPDATE public.%I x SET title = coalesce(x.title, initcap(replace(x.role, '_', ' '))), role = 'staff'
                        WHERE x.role IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.platform_roles p WHERE p.code = x.role)$f$, r.tbl);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN PERFORM unify.log('06e', r.tbl, 'unknown_roles_to_staff', n || ' rows'); END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_role_alias ON public.%I', r.tbl);
    EXECUTE format('CREATE TRIGGER trg_role_alias BEFORE INSERT OR UPDATE OF role ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform__role_alias(%L)', r.tbl, 'role');
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.tbl || '_role_fk') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (role) REFERENCES public.platform_roles(code) ON UPDATE CASCADE', r.tbl, r.tbl || '_role_fk');
    END IF;
    -- a membership is a staff seat; participants and platform admins are granted elsewhere
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = r.tbl || '_staff_role_chk') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (role NOT IN (''participant'',''platform_admin''))', r.tbl, r.tbl || '_staff_role_chk');
    END IF;
  END LOOP;
END $$;

-- the role registry records the rename
INSERT INTO public.platform_role_values(tenant_id, value, source, status, canonical, reason)
SELECT NULL, v, 'tenant_memberships.role', 'retired', c, 'unify 06e: vertical role renamed to agnostic role; title keeps the old name'
  FROM (VALUES ('groomer','provider'),('front_desk','coordinator')) x(v, c)
ON CONFLICT (value, source) DO UPDATE SET status = EXCLUDED.status, canonical = EXCLUDED.canonical, reason = EXCLUDED.reason, changed_at = now();

-- pack terminology for roles
INSERT INTO public.platform_pack_items(pack_code, item_type, item_key, payload, sort_order)
SELECT p, 'terminology', k, j::jsonb, o FROM (VALUES
 ('pet_grooming','role.provider','{"singular":"Groomer","plural":"Groomers"}',90),
 ('pet_grooming','role.coordinator','{"singular":"Front desk","plural":"Front desk"}',91),
 ('services','role.provider','{"singular":"Technician","plural":"Technicians"}',90),
 ('services','role.coordinator','{"singular":"Dispatcher","plural":"Dispatchers"}',91),
 ('healthcare','role.provider','{"singular":"Clinician","plural":"Clinicians"}',90),
 ('healthcare','role.coordinator','{"singular":"Front desk","plural":"Front desk"}',91),
 ('healthcare','role.participant','{"singular":"Patient","plural":"Patients"}',92),
 ('financial_services','role.provider','{"singular":"Advisor","plural":"Advisors"}',90),
 ('financial_services','role.coordinator','{"singular":"Client service rep","plural":"Client service reps"}',91),
 ('real_estate','role.provider','{"singular":"Agent","plural":"Agents"}',90),
 ('real_estate','role.coordinator','{"singular":"Transaction coordinator","plural":"Transaction coordinators"}',91),
 ('auto_dealer','role.provider','{"singular":"Technician","plural":"Technicians"}',90),
 ('auto_dealer','role.coordinator','{"singular":"Service advisor","plural":"Service advisors"}',91),
 ('edtech','role.provider','{"singular":"Instructor","plural":"Instructors"}',90),
 ('edtech','role.coordinator','{"singular":"Student support","plural":"Student support"}',91),
 ('edtech','role.participant','{"singular":"Learner","plural":"Learners"}',92),
 ('marketplace','role.participant','{"singular":"Buyer","plural":"Buyers"}',90),
 ('social_platform','role.participant','{"singular":"Member","plural":"Members"}',90)
) v(p, k, j, o)
WHERE EXISTS (SELECT 1 FROM public.platform_packs k WHERE k.code = v.p)
ON CONFLICT (pack_code, item_type, item_key) DO UPDATE SET payload = EXCLUDED.payload, sort_order = EXCLUDED.sort_order;

-- tenants that already run pet grooming keep "Groomer" / "Front desk" on screen
INSERT INTO public.platform_terminology(tenant_id, term_key, singular, plural, pack_code)
SELECT tp.tenant_id, i.item_key, i.payload ->> 'singular', i.payload ->> 'plural', i.pack_code
  FROM public.platform_tenant_packs tp JOIN public.platform_pack_items i ON i.pack_code = tp.pack_code
 WHERE i.item_type = 'terminology' AND i.item_key LIKE 'role.%'
ON CONFLICT (tenant_id, term_key) DO NOTHING;

-- =====================================================================
-- B. role grants (extra / scoped roles)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.platform_member_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_code     text NOT NULL REFERENCES public.platform_roles(code) ON UPDATE CASCADE,
  title         text,
  scope_type    text NOT NULL DEFAULT 'tenant' CHECK (scope_type IN ('tenant','location','team','program','cohort')),
  scope_id      uuid,                                           -- the location / team / program / cohort
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
  assigned_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope_type = 'tenant') = (scope_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_member_roles_uq
  ON public.platform_member_roles(tenant_id, user_id, role_code, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS platform_member_roles_user_idx ON public.platform_member_roles(user_id, status);
DROP TRIGGER IF EXISTS trg_role_alias ON public.platform_member_roles;
CREATE TRIGGER trg_role_alias BEFORE INSERT OR UPDATE OF role_code ON public.platform_member_roles
  FOR EACH ROW EXECUTE FUNCTION public.platform__role_alias('role_code');
-- scope_id points at a location / team / program / cohort depending on scope_type
INSERT INTO public.platform_polymorphic_columns(table_name, type_column, id_column)
SELECT 'platform_member_roles', 'scope_type', 'scope_id'
 WHERE NOT EXISTS (SELECT 1 FROM public.platform_polymorphic_columns p WHERE p.table_name = 'platform_member_roles' AND p.id_column = 'scope_id')
ON CONFLICT DO NOTHING;

-- does this user hold this role (or higher) here? internal: callers use platform_has_role
CREATE OR REPLACE FUNCTION public.platform__user_has_role(p_tenant uuid, p_user uuid, p_role text, p_scope_type text DEFAULT 'tenant', p_scope_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  WITH want AS (SELECT r.rank, r.role_kind FROM public.platform_roles r WHERE r.code = public.platform_resolve_role(p_role))
  SELECT EXISTS (SELECT 1 FROM public.tenant_memberships tm JOIN public.platform_roles r ON r.code = tm.role, want w
                  WHERE tm.tenant_id = p_tenant AND tm.user_id = p_user AND tm.active AND tm.status = 'active'
                    AND w.role_kind = 'staff' AND r.rank >= w.rank)
      OR EXISTS (SELECT 1 FROM public.platform_member_roles g JOIN public.platform_roles r ON r.code = g.role_code, want w
                  WHERE g.tenant_id = p_tenant AND g.user_id = p_user AND g.status = 'active'
                    AND (g.expires_at IS NULL OR g.expires_at > now())
                    AND r.role_kind = w.role_kind AND r.rank >= w.rank
                    AND (g.scope_type = 'tenant' OR (g.scope_type = p_scope_type AND g.scope_id = p_scope_id))) $$;

-- does the current user hold this role (or higher) here?
CREATE OR REPLACE FUNCTION public.platform_has_role(p_tenant uuid, p_role text, p_scope_type text DEFAULT 'tenant', p_scope_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT public.platform_is_admin() OR coalesce(public.platform__user_has_role(p_tenant, auth.uid(), p_role, p_scope_type, p_scope_id), false) $$;

CREATE OR REPLACE FUNCTION public.platform__is_service() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT auth.uid() IS NULL AND current_user IN ('postgres','service_role','supabase_admin') $$;

-- keep the membership's role in step with its tenant-wide staff grants
CREATE OR REPLACE FUNCTION public.platform__sync_membership(p_tenant uuid, p_user uuid, p_title text DEFAULT NULL, p_dropped text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE best text; cur record;
BEGIN
  SELECT g.role_code INTO best FROM public.platform_member_roles g JOIN public.platform_roles r ON r.code = g.role_code
   WHERE g.tenant_id = p_tenant AND g.user_id = p_user AND g.status = 'active' AND g.scope_type = 'tenant' AND r.role_kind = 'staff'
     AND (g.expires_at IS NULL OR g.expires_at > now())
   ORDER BY r.rank DESC LIMIT 1;
  SELECT tm.*, r.rank AS cur_rank INTO cur FROM public.tenant_memberships tm JOIN public.platform_roles r ON r.code = tm.role
   WHERE tm.tenant_id = p_tenant AND tm.user_id = p_user;
  IF cur.user_id IS NULL THEN
    IF best IS NULL THEN RETURN NULL; END IF;
    INSERT INTO public.tenant_memberships(tenant_id, user_id, role, title, active, status)
    VALUES (p_tenant, p_user, best, p_title, true, 'active');
    RETURN best;
  END IF;
  IF best IS NOT NULL AND (SELECT rank FROM public.platform_roles WHERE code = best) > cur.cur_rank THEN
    UPDATE public.tenant_memberships SET role = best, title = coalesce(p_title, title), active = true, status = 'active', updated_at = now()
     WHERE tenant_id = p_tenant AND user_id = p_user;
    RETURN best;
  ELSIF best IS NOT NULL AND NOT (cur.active AND cur.status = 'active') THEN
    UPDATE public.tenant_memberships SET active = true, status = 'active', updated_at = now() WHERE tenant_id = p_tenant AND user_id = p_user;
  ELSIF p_dropped IS NOT NULL AND cur.role = p_dropped THEN
    -- the grant that set this role is gone: fall back to the next grant, else plain staff
    UPDATE public.tenant_memberships SET role = coalesce(best, 'staff'), updated_at = now() WHERE tenant_id = p_tenant AND user_id = p_user;
    RETURN coalesce(best, 'staff');
  END IF;
  RETURN cur.role;
END $$;

CREATE OR REPLACE FUNCTION public.platform_assign_role(p_tenant uuid, p_user uuid, p_role text, p_scope_type text DEFAULT 'tenant',
  p_scope_id uuid DEFAULT NULL, p_expires_at timestamptz DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb,
  p_title text DEFAULT NULL, p_assigned_by uuid DEFAULT NULL)
RETURNS public.platform_member_roles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_code text := public.platform_resolve_role(p_role); rr record; g public.platform_member_roles; v_by uuid;
BEGIN
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'unknown role %', p_role USING ERRCODE = 'check_violation',
      DETAIL = 'roles: ' || (SELECT string_agg(code, ', ' ORDER BY sort_order) FROM public.platform_roles);
  END IF;
  SELECT * INTO rr FROM public.platform_roles WHERE platform_roles.code = v_code;
  v_by := CASE WHEN public.platform__is_service() THEN p_assigned_by ELSE auth.uid() END;
  IF rr.role_kind = 'platform' THEN
    IF NOT (public.platform__is_service() OR public.platform_is_admin()) THEN RAISE EXCEPTION 'only platform admins can grant platform_admin'; END IF;
    INSERT INTO public.platform_admins(user_id, granted_by, expires_at, reason, tenant_id)
    VALUES (p_user, v_by, p_expires_at, coalesce(p_metadata ->> 'reason', 'granted via platform_assign_role'), p_tenant)
    ON CONFLICT (user_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, granted_by = EXCLUDED.granted_by, granted_at = now();
  ELSIF NOT public.platform__can_admin(p_tenant) THEN
    RAISE EXCEPTION 'only workspace admins can assign roles';
  END IF;
  IF v_code = 'owner' AND NOT (public.platform__is_service() OR public.platform_is_admin() OR public.platform_has_role(p_tenant, 'owner')) THEN
    RAISE EXCEPTION 'only an owner can make someone an owner';
  END IF;
  IF p_scope_type <> 'tenant' AND rr.role_kind = 'staff' AND rr.rank >= 90 THEN
    RAISE EXCEPTION '% is a workspace-wide role; it cannot be limited to one %', rr.label, p_scope_type;
  END IF;
  INSERT INTO public.platform_member_roles AS m(tenant_id, user_id, role_code, title, scope_type, scope_id, status, assigned_by, assigned_at, expires_at, metadata)
  VALUES (p_tenant, p_user, v_code, p_title, p_scope_type, CASE WHEN p_scope_type = 'tenant' THEN NULL ELSE p_scope_id END,
          'active', v_by, now(), p_expires_at, coalesce(p_metadata, '{}'::jsonb))
  ON CONFLICT (tenant_id, user_id, role_code, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO UPDATE
     SET status = 'active', assigned_by = EXCLUDED.assigned_by, assigned_at = now(), expires_at = EXCLUDED.expires_at,
         revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL, title = coalesce(EXCLUDED.title, m.title),
         metadata = m.metadata || EXCLUDED.metadata, updated_at = now()
  RETURNING * INTO g;
  IF rr.role_kind = 'staff' AND p_scope_type = 'tenant' THEN PERFORM public.platform__sync_membership(p_tenant, p_user, g.title); END IF;
  RETURN g;
END $$;

CREATE OR REPLACE FUNCTION public.platform_revoke_role(p_tenant uuid, p_user uuid, p_role text, p_scope_type text DEFAULT 'tenant',
  p_scope_id uuid DEFAULT NULL, p_reason text DEFAULT 'revoked by admin', p_revoked_by uuid DEFAULT NULL)
RETURNS public.platform_member_roles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_code text := public.platform_resolve_role(p_role); g public.platform_member_roles; v_by uuid;
BEGIN
  IF v_code IS NULL THEN RAISE EXCEPTION 'unknown role %', p_role USING ERRCODE = 'check_violation'; END IF;
  IF NOT public.platform__can_admin(p_tenant) THEN RAISE EXCEPTION 'only workspace admins can revoke roles'; END IF;
  v_by := CASE WHEN public.platform__is_service() THEN p_revoked_by ELSE auth.uid() END;
  IF v_code = 'owner' AND (SELECT count(*) FROM public.tenant_memberships WHERE tenant_id = p_tenant AND role = 'owner' AND active) <= 1
     AND EXISTS (SELECT 1 FROM public.tenant_memberships WHERE tenant_id = p_tenant AND user_id = p_user AND role = 'owner') THEN
    RAISE EXCEPTION 'a workspace needs at least one owner; make someone else owner first';
  END IF;
  UPDATE public.platform_member_roles m
     SET status = 'revoked', revoked_at = now(), revoked_by = v_by, revoke_reason = p_reason, updated_at = now()
   WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.role_code = v_code AND m.scope_type = p_scope_type
     AND m.scope_id IS NOT DISTINCT FROM CASE WHEN p_scope_type = 'tenant' THEN NULL ELSE p_scope_id END
     AND m.status = 'active'
  RETURNING * INTO g;
  IF v_code = 'platform_admin' AND (public.platform__is_service() OR public.platform_is_admin()) THEN
    DELETE FROM public.platform_admins WHERE user_id = p_user;
  END IF;
  IF p_scope_type = 'tenant' THEN PERFORM public.platform__sync_membership(p_tenant, p_user, NULL, v_code); END IF;
  RETURN g;
END $$;

-- owners and admins hold every module permission; managers can write everywhere
CREATE OR REPLACE FUNCTION public.platform_has_permission(p_tenant_id uuid, p_permission text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  RETURN public.platform_is_admin()
      OR public.platform_has_role(p_tenant_id, 'manager')
      OR EXISTS (
        SELECT 1 FROM public.platform_module_permissions pmp
          JOIN public.crm_staff cs ON cs.id = pmp.staff_id
         WHERE cs.user_id = auth.uid()
           AND pmp.tenant_id = p_tenant_id
           AND pmp.module_code = (SELECT module FROM public.platform_permission_registry WHERE permission_code = p_permission LIMIT 1)
           AND pmp.access_level IN ('write', 'full'));
END $$;

-- =====================================================================
-- C. the missing lms schema
-- =====================================================================
DO $$
DECLARE f record; cfg text; newpath text; n int := 0;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig, c AS setting
             FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace, unnest(p.proconfig) c
            WHERE s.nspname NOT IN ('pg_catalog','information_schema') AND c LIKE 'search_path=%'
              AND 'lms' = ANY (string_to_array(replace(replace(substr(c, 13), '"', ''), ' ', ''), ',')) LOOP
    IF to_regnamespace('lms') IS NOT NULL THEN EXIT; END IF;   -- if an lms schema ever exists, leave these alone
    SELECT string_agg(x, ', ') INTO newpath
      FROM unnest(string_to_array(replace(replace(substr(f.setting, 13), '"', ''), ' ', ''), ',')) x WHERE x <> 'lms';
    EXECUTE format('ALTER FUNCTION %s SET search_path = %s', f.sig, coalesce(newpath, 'public, pg_catalog'));
    n := n + 1;
  END LOOP;
  IF n > 0 THEN PERFORM unify.log('06e', 'search_path', 'lms_removed', n || ' functions'); END IF;
END $$;

-- =====================================================================
-- D. learning (agnostic; EdTech is a pack on top)
-- =====================================================================
INSERT INTO public.platform_picklist_values(tenant_id, list_code, value, label, sort_order, pack_code)
SELECT NULL, l, v, lb, o, p FROM (VALUES
  ('learning_kind','course','Course',10,NULL),('learning_kind','program','Program',20,NULL),('learning_kind','class','Class',30,NULL),
  ('learning_kind','workshop','Workshop',40,NULL),('learning_kind','training','Training',50,NULL),
  ('learning_kind','certification','Certification',60,NULL),('learning_kind','onboarding','Onboarding',70,NULL),
  ('learning_kind','webinar','Webinar',80,NULL),('learning_kind','continuing_education','Continuing education',90,NULL),
  ('learning_kind','degree','Degree program',200,'edtech'),('learning_kind','term_course','Term course',210,'edtech')
) s(l, v, lb, o, p)
ON CONFLICT DO NOTHING;
-- vertical values start inactive globally (the pack switches them on per tenant), same rule as 06c
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM unify.settings WHERE key = '06e.learning_picklists_scoped') THEN RETURN; END IF;
  UPDATE public.platform_picklist_values SET is_active = false WHERE tenant_id IS NULL AND list_code = 'learning_kind' AND pack_code IS NOT NULL;
  INSERT INTO unify.settings(key, value, note) VALUES ('06e.learning_picklists_scoped', now()::text, 'edtech learning kinds scoped to the pack');
END $$;

CREATE TABLE IF NOT EXISTS public.learn_programs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code                   text NOT NULL,
  title                  text NOT NULL,
  kind                   text NOT NULL DEFAULT 'course',                    -- picklist learning_kind
  description            text,
  status                 text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  audience               text NOT NULL DEFAULT 'customer' CHECK (audience IN ('internal','customer','public')),  -- staff training / clients / anyone
  delivery               text NOT NULL DEFAULT 'self_paced' CHECK (delivery IN ('self_paced','live','in_person','hybrid')),
  duration_minutes       integer CHECK (duration_minutes IS NULL OR duration_minutes > 0),
  credits                numeric(8,2) CHECK (credits IS NULL OR credits >= 0),
  credit_type            text,                                               -- credit hours, CEU, CE, PDH ...
  passing_score          numeric(5,2) CHECK (passing_score IS NULL OR passing_score BETWEEN 0 AND 100),
  certificate_valid_days integer CHECK (certificate_valid_days IS NULL OR certificate_valid_days > 0),
  catalog_item_id        uuid,                                               -- sold as a catalog item (optional)
  owner_user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pack_code              text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, catalog_item_id) REFERENCES public.commerce_catalog_items(tenant_id, id) ON DELETE SET NULL (catalog_item_id)
);
DROP TRIGGER IF EXISTS trg_picklist_kind ON public.learn_programs;
CREATE TRIGGER trg_picklist_kind BEFORE INSERT OR UPDATE OF kind ON public.learn_programs
  FOR EACH ROW EXECUTE FUNCTION public.platform__picklist_guard('kind', 'learning_kind');

CREATE TABLE IF NOT EXISTS public.learn_units (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  program_id       uuid NOT NULL,
  parent_id        uuid REFERENCES public.learn_units(id) ON DELETE CASCADE,   -- sections
  seq              integer NOT NULL DEFAULT 10,
  title            text NOT NULL,
  unit_type        text NOT NULL DEFAULT 'lesson'
                   CHECK (unit_type IN ('section','lesson','video','reading','quiz','assignment','live_session','exam','lab','external')),
  is_required      boolean NOT NULL DEFAULT true,
  content          jsonb NOT NULL DEFAULT '{}'::jsonb,                          -- body, media URL, external link, quiz definition
  max_score        numeric(8,2) CHECK (max_score IS NULL OR max_score > 0),
  passing_score    numeric(5,2) CHECK (passing_score IS NULL OR passing_score BETWEEN 0 AND 100),
  duration_minutes integer,
  release_offset_days integer NOT NULL DEFAULT 0 CHECK (release_offset_days >= 0),  -- drip: days after enrollment / cohort start
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, program_id) REFERENCES public.learn_programs(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS learn_units_program_idx ON public.learn_units(program_id, seq);

CREATE TABLE IF NOT EXISTS public.learn_cohorts (           -- a scheduled offering: term, section, class date, intake
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  program_id       uuid NOT NULL,
  code             text NOT NULL,
  name             text NOT NULL,
  starts_on        date,
  ends_on          date,
  enroll_opens_at  timestamptz,
  enroll_closes_at timestamptz,
  capacity         integer CHECK (capacity IS NULL OR capacity > 0),
  allow_waitlist   boolean NOT NULL DEFAULT true,
  location_id      uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  calendar_id      uuid REFERENCES public.platform_calendars(id) ON DELETE SET NULL,
  timezone         text,
  status           text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','open','in_progress','completed','cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, program_id) REFERENCES public.learn_programs(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.learn_cohort_staff (       -- who teaches / grades / supports a cohort
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  cohort_id   uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_role  text NOT NULL DEFAULT 'lead' CHECK (staff_role IN ('lead','assistant','grader','support')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, user_id, staff_role),
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, cohort_id) REFERENCES public.learn_cohorts(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.learn_enrollments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  program_id             uuid NOT NULL,
  cohort_id              uuid,
  -- who is learning: a login, a CRM contact, a tracked record (student), or several
  user_id                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id            uuid,
  dependent_id           uuid,
  status                 text NOT NULL DEFAULT 'enrolled'
                         CHECK (status IN ('invited','applied','waitlisted','enrolled','in_progress','completed','failed','withdrawn','expired')),
  source                 text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin','self','order','deal','import','api')),
  progress_pct           numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  score                  numeric(6,2),
  grade                  text,
  enrolled_at            timestamptz NOT NULL DEFAULT now(),
  started_at             timestamptz,
  completed_at           timestamptz,
  withdrawn_at           timestamptz,
  withdraw_reason        text,
  expires_at             timestamptz,
  certificate_number     text,
  certificate_issued_at  timestamptz,
  certificate_expires_at timestamptz,
  order_id               uuid REFERENCES public.erp_orders(id) ON DELETE SET NULL,
  deal_id                uuid REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  enrolled_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (user_id IS NOT NULL OR customer_id IS NOT NULL OR dependent_id IS NOT NULL),
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, program_id) REFERENCES public.learn_programs(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, cohort_id) REFERENCES public.learn_cohorts(tenant_id, id) ON DELETE SET NULL (cohort_id),
  FOREIGN KEY (customer_id) REFERENCES public.crm_customers(id) ON DELETE SET NULL,
  FOREIGN KEY (dependent_id) REFERENCES public.crm_dependents(id) ON DELETE SET NULL
);
-- one live enrollment per person per program (or per cohort when there is one)
CREATE UNIQUE INDEX IF NOT EXISTS learn_enrollments_live_uq ON public.learn_enrollments
  (program_id, coalesce(cohort_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(user_id, customer_id, dependent_id), coalesce(dependent_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('invited','applied','waitlisted','enrolled','in_progress');
CREATE UNIQUE INDEX IF NOT EXISTS learn_enrollments_cert_uq ON public.learn_enrollments(tenant_id, certificate_number) WHERE certificate_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS learn_enrollments_user_idx ON public.learn_enrollments(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS learn_enrollments_dependent_idx ON public.learn_enrollments(dependent_id) WHERE dependent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.learn_progress (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  enrollment_id      uuid NOT NULL,
  unit_id            uuid NOT NULL,
  status             text NOT NULL DEFAULT 'not_started'
                     CHECK (status IN ('not_started','in_progress','completed','passed','failed','attended','absent','excused')),
  score              numeric(8,2),
  attempts           integer NOT NULL DEFAULT 0,
  time_spent_seconds integer NOT NULL DEFAULT 0,
  last_activity_at   timestamptz,
  completed_at       timestamptz,
  graded_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feedback           text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, unit_id),
  FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, enrollment_id) REFERENCES public.learn_enrollments(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, unit_id) REFERENCES public.learn_units(tenant_id, id) ON DELETE CASCADE
);

-- the participant on an enrollment must belong to the same workspace
CREATE OR REPLACE FUNCTION public.learn__enrollment_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.crm_customers c WHERE c.id = NEW.customer_id AND c.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'customer belongs to another workspace';
  END IF;
  IF NEW.dependent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.crm_dependents d WHERE d.id = NEW.dependent_id AND d.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'record belongs to another workspace';
  END IF;
  IF NEW.cohort_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.learn_cohorts c WHERE c.id = NEW.cohort_id AND c.program_id = NEW.program_id) THEN
    RAISE EXCEPTION 'cohort is not an offering of this program';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_learn_enrollment_guard ON public.learn_enrollments;
CREATE TRIGGER trg_learn_enrollment_guard BEFORE INSERT OR UPDATE ON public.learn_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.learn__enrollment_guard();

-- log onto the student's tracked record when its record type allows that event
CREATE OR REPLACE FUNCTION public.learn__record_event(p_enrollment uuid, p_event text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE e record;
BEGIN
  SELECT en.tenant_id, en.dependent_id, p.title, p.code, rt.event_types INTO e
    FROM public.learn_enrollments en JOIN public.learn_programs p ON p.id = en.program_id
    JOIN public.crm_dependents d ON d.id = en.dependent_id
    LEFT JOIN public.crm_record_types rt ON rt.id = d.record_type_id
   WHERE en.id = p_enrollment;
  IF e.dependent_id IS NULL THEN RETURN; END IF;
  IF e.event_types IS NOT NULL AND NOT p_event = ANY (e.event_types) THEN RETURN; END IF;
  INSERT INTO public.crm_record_events(tenant_id, dependent_id, event_type, reference_number, details, created_by)
  VALUES (e.tenant_id, e.dependent_id, p_event, e.code,
          jsonb_build_object('program', e.title, 'enrollment_id', p_enrollment) || coalesce(p_details, '{}'::jsonb), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.learn_enroll(p_program uuid, p_cohort uuid DEFAULT NULL, p_user uuid DEFAULT NULL,
  p_customer uuid DEFAULT NULL, p_dependent uuid DEFAULT NULL, p_source text DEFAULT 'admin',
  p_order uuid DEFAULT NULL, p_deal uuid DEFAULT NULL)
RETURNS public.learn_enrollments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE pr public.learn_programs; co public.learn_cohorts; en public.learn_enrollments; taken int; st text := 'enrolled'; self boolean;
BEGIN
  SELECT * INTO pr FROM public.learn_programs WHERE id = p_program;
  IF pr.id IS NULL THEN RAISE EXCEPTION 'unknown program'; END IF;
  IF NOT public.platform_module_enabled(pr.tenant_id, 'learning') THEN RAISE EXCEPTION 'turn on the Learning module first'; END IF;
  self := p_user IS NOT NULL AND p_user = auth.uid() AND p_customer IS NULL AND p_dependent IS NULL;
  IF NOT (public.platform__is_service() OR public.platform_is_tenant_member(pr.tenant_id)) THEN
    -- outside people may only enroll themselves in a published public program
    IF NOT (self AND pr.status = 'published' AND pr.audience = 'public') THEN RAISE EXCEPTION 'not allowed to enroll in this program'; END IF;
    p_source := 'self';
  END IF;
  IF pr.status = 'archived' THEN RAISE EXCEPTION 'program is archived'; END IF;
  IF p_cohort IS NOT NULL THEN
    SELECT * INTO co FROM public.learn_cohorts WHERE id = p_cohort AND program_id = p_program FOR UPDATE;
    IF co.id IS NULL THEN RAISE EXCEPTION 'cohort is not an offering of this program'; END IF;
    IF co.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'cohort is %', co.status; END IF;
    IF p_source = 'self' AND ((co.enroll_opens_at IS NOT NULL AND now() < co.enroll_opens_at) OR (co.enroll_closes_at IS NOT NULL AND now() > co.enroll_closes_at)) THEN
      RAISE EXCEPTION 'enrollment for % is closed', co.name;
    END IF;
    SELECT count(*) INTO taken FROM public.learn_enrollments WHERE cohort_id = co.id AND status IN ('enrolled','in_progress','completed');
    IF co.capacity IS NOT NULL AND taken >= co.capacity THEN
      IF NOT co.allow_waitlist THEN RAISE EXCEPTION '% is full', co.name; END IF;
      st := 'waitlisted';
    END IF;
  END IF;
  INSERT INTO public.learn_enrollments(tenant_id, program_id, cohort_id, user_id, customer_id, dependent_id, status, source, order_id, deal_id, enrolled_by,
                                       expires_at)
  VALUES (pr.tenant_id, p_program, p_cohort, p_user, p_customer, p_dependent, st, p_source, p_order, p_deal, auth.uid(), NULL)
  RETURNING * INTO en;
  INSERT INTO public.learn_progress(tenant_id, enrollment_id, unit_id)
  SELECT pr.tenant_id, en.id, u.id FROM public.learn_units u WHERE u.program_id = p_program AND u.status = 'active' AND u.unit_type <> 'section'
  ON CONFLICT DO NOTHING;
  -- a login gets a participant grant scoped to this program (it is not a workspace seat)
  IF p_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships WHERE tenant_id = pr.tenant_id AND user_id = p_user AND active) THEN
    INSERT INTO public.platform_member_roles(tenant_id, user_id, role_code, scope_type, scope_id, assigned_by, metadata)
    VALUES (pr.tenant_id, p_user, 'participant', 'program', p_program, auth.uid(), jsonb_build_object('enrollment_id', en.id))
    ON CONFLICT (tenant_id, user_id, role_code, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET status = 'active', revoked_at = NULL, revoke_reason = NULL, updated_at = now();
  END IF;
  PERFORM public.learn__record_event(en.id, CASE WHEN st = 'waitlisted' THEN 'note' ELSE 'course_added' END,
                                     jsonb_build_object('status', st, 'cohort', co.name));
  RETURN en;
END $$;

-- recompute progress; complete + issue a certificate when every required unit is done and the score passes
CREATE OR REPLACE FUNCTION public.learn__recompute(p_enrollment uuid) RETURNS public.learn_enrollments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE en public.learn_enrollments; pr public.learn_programs; req int; done int; avg_score numeric; failed int;
BEGIN
  SELECT * INTO en FROM public.learn_enrollments WHERE id = p_enrollment FOR UPDATE;
  SELECT * INTO pr FROM public.learn_programs WHERE id = en.program_id;
  SELECT count(*), count(*) FILTER (WHERE lp.status IN ('completed','passed','attended','excused')),
         avg(CASE WHEN lp.score IS NOT NULL AND u.max_score IS NOT NULL THEN 100 * lp.score / u.max_score END),
         count(*) FILTER (WHERE lp.status = 'failed')
    INTO req, done, avg_score, failed
    FROM public.learn_progress lp JOIN public.learn_units u ON u.id = lp.unit_id
   WHERE lp.enrollment_id = p_enrollment AND u.is_required;
  en.progress_pct := CASE WHEN req = 0 THEN 0 ELSE round(100.0 * done / req, 2) END;
  en.score := round(avg_score, 2);
  IF en.status IN ('enrolled','invited') AND done > 0 THEN en.status := 'in_progress'; en.started_at := coalesce(en.started_at, now()); END IF;
  IF req > 0 AND done = req AND en.status IN ('enrolled','in_progress') THEN
    IF pr.passing_score IS NOT NULL AND coalesce(avg_score, 0) < pr.passing_score THEN
      en.status := 'failed';
    ELSE
      en.status := 'completed'; en.completed_at := now();
      en.certificate_number := coalesce(en.certificate_number,
        upper(pr.code) || '-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(en.id::text, '-', ''), 1, 8)));
      en.certificate_issued_at := coalesce(en.certificate_issued_at, now());
      en.certificate_expires_at := CASE WHEN pr.certificate_valid_days IS NOT NULL THEN now() + make_interval(days => pr.certificate_valid_days) END;
    END IF;
  END IF;
  UPDATE public.learn_enrollments SET progress_pct = en.progress_pct, score = en.score, status = en.status, started_at = en.started_at,
         completed_at = en.completed_at, certificate_number = en.certificate_number, certificate_issued_at = en.certificate_issued_at,
         certificate_expires_at = en.certificate_expires_at
   WHERE id = p_enrollment;
  RETURN en;
END $$;

CREATE OR REPLACE FUNCTION public.learn_record_progress(p_enrollment uuid, p_unit uuid, p_status text, p_score numeric DEFAULT NULL,
  p_seconds integer DEFAULT NULL, p_feedback text DEFAULT NULL)
RETURNS public.learn_enrollments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE en public.learn_enrollments; staff boolean; before text; after public.learn_enrollments;
BEGIN
  SELECT * INTO en FROM public.learn_enrollments WHERE id = p_enrollment;
  IF en.id IS NULL THEN RAISE EXCEPTION 'unknown enrollment'; END IF;
  staff := public.platform__is_service() OR public.platform_is_tenant_member(en.tenant_id);
  IF NOT staff THEN
    IF en.user_id IS DISTINCT FROM auth.uid() OR auth.uid() IS NULL THEN RAISE EXCEPTION 'not your enrollment'; END IF;
    -- learners report their own activity; grades, pass/fail and attendance come from staff
    IF p_status NOT IN ('in_progress','completed') OR p_score IS NOT NULL OR p_feedback IS NOT NULL THEN
      RAISE EXCEPTION 'only staff can grade or take attendance';
    END IF;
  END IF;
  IF en.status NOT IN ('enrolled','in_progress') THEN RAISE EXCEPTION 'enrollment is %', en.status; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learn_units u WHERE u.id = p_unit AND u.program_id = en.program_id) THEN
    RAISE EXCEPTION 'unit is not part of this program';
  END IF;
  SELECT status INTO before FROM public.learn_progress WHERE enrollment_id = p_enrollment AND unit_id = p_unit;
  INSERT INTO public.learn_progress AS lp(tenant_id, enrollment_id, unit_id, status, score, attempts, time_spent_seconds, last_activity_at,
                                          completed_at, graded_by, feedback)
  VALUES (en.tenant_id, p_enrollment, p_unit, p_status, p_score, 1, coalesce(p_seconds, 0), now(),
          CASE WHEN p_status IN ('completed','passed','attended') THEN now() END,
          CASE WHEN staff AND p_score IS NOT NULL THEN auth.uid() END, p_feedback)
  ON CONFLICT (enrollment_id, unit_id) DO UPDATE
     SET status = EXCLUDED.status, score = coalesce(EXCLUDED.score, lp.score), attempts = lp.attempts + 1,
         time_spent_seconds = lp.time_spent_seconds + coalesce(p_seconds, 0), last_activity_at = now(),
         completed_at = CASE WHEN EXCLUDED.status IN ('completed','passed','attended') THEN coalesce(lp.completed_at, now()) END,
         graded_by = coalesce(EXCLUDED.graded_by, lp.graded_by), feedback = coalesce(EXCLUDED.feedback, lp.feedback), updated_at = now();
  IF p_score IS NOT NULL THEN PERFORM public.learn__record_event(p_enrollment, 'grade_posted', jsonb_build_object('unit_id', p_unit, 'score', p_score)); END IF;
  IF p_status IN ('attended','absent','excused') THEN PERFORM public.learn__record_event(p_enrollment, 'attendance', jsonb_build_object('unit_id', p_unit, 'status', p_status)); END IF;
  after := public.learn__recompute(p_enrollment);
  IF after.status = 'completed' AND en.status <> 'completed' THEN
    PERFORM public.learn__record_event(p_enrollment, 'completion', jsonb_build_object('certificate', after.certificate_number, 'score', after.score));
  END IF;
  RETURN after;
END $$;

CREATE OR REPLACE FUNCTION public.learn_withdraw(p_enrollment uuid, p_reason text DEFAULT NULL)
RETURNS public.learn_enrollments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE en public.learn_enrollments; nxt uuid;
BEGIN
  SELECT * INTO en FROM public.learn_enrollments WHERE id = p_enrollment FOR UPDATE;
  IF en.id IS NULL THEN RAISE EXCEPTION 'unknown enrollment'; END IF;
  IF NOT (public.platform__is_service() OR public.platform_is_tenant_member(en.tenant_id) OR en.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF en.status IN ('completed','withdrawn') THEN RAISE EXCEPTION 'enrollment is already %', en.status; END IF;
  UPDATE public.learn_enrollments SET status = 'withdrawn', withdrawn_at = now(), withdraw_reason = p_reason WHERE id = p_enrollment RETURNING * INTO en;
  PERFORM public.learn__record_event(p_enrollment, 'course_dropped', jsonb_build_object('reason', p_reason));
  -- a freed seat goes to the first person on the waitlist
  IF en.cohort_id IS NOT NULL THEN
    SELECT id INTO nxt FROM public.learn_enrollments WHERE cohort_id = en.cohort_id AND status = 'waitlisted' ORDER BY enrolled_at LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF nxt IS NOT NULL THEN
      UPDATE public.learn_enrollments SET status = 'enrolled' WHERE id = nxt;
      PERFORM public.learn__record_event(nxt, 'course_added', jsonb_build_object('from_waitlist', true));
    END IF;
  END IF;
  RETURN en;
END $$;

CREATE OR REPLACE VIEW public.learn_v_roster WITH (security_invoker = true) AS
SELECT e.tenant_id, e.id AS enrollment_id, p.id AS program_id, p.code AS program_code, p.title AS program, c.id AS cohort_id, c.name AS cohort,
       e.status, e.progress_pct, e.score, e.grade, e.enrolled_at, e.completed_at, e.certificate_number, e.certificate_expires_at,
       e.user_id, e.customer_id, e.dependent_id,
       coalesce(d.name, nullif(btrim(concat_ws(' ', cu.first_name, cu.last_name)), ''), cu.email) AS participant_name,
       d.identifier AS participant_identifier
  FROM public.learn_enrollments e
  JOIN public.learn_programs p ON p.id = e.program_id
  LEFT JOIN public.learn_cohorts c ON c.id = e.cohort_id
  LEFT JOIN public.crm_dependents d ON d.id = e.dependent_id
  LEFT JOIN public.crm_customers cu ON cu.id = e.customer_id;

-- =====================================================================
-- lms compatibility: same signatures, now backed by agnostic grants
-- =====================================================================
CREATE OR REPLACE FUNCTION public.assign_lms_role(p_tenant_id uuid, p_user_id uuid, p_role text, p_assigned_by uuid DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(assignment_id uuid, role_id uuid, role text, status text, is_active boolean, assigned_at timestamptz, expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT g.id, g.id, p_role, g.status, g.status = 'active', g.assigned_at, g.expires_at
    FROM public.platform_assign_role(p_tenant_id, p_user_id, p_role, 'tenant', NULL, p_expires_at,
                                     coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('via', 'assign_lms_role', 'lms_role', p_role),
                                     NULL, p_assigned_by) g $$;

CREATE OR REPLACE FUNCTION public.revoke_lms_role(p_tenant_id uuid, p_user_id uuid, p_role text, p_revoked_by uuid DEFAULT NULL,
  p_revoke_reason text DEFAULT 'revoked by admin')
RETURNS TABLE(assignment_id uuid, role_id uuid, role text, revoked_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT g.id, g.id, p_role, g.revoked_at
    FROM public.platform_revoke_role(p_tenant_id, p_user_id, p_role, 'tenant', NULL, p_revoke_reason, p_revoked_by) g
   WHERE g.id IS NOT NULL $$;

-- =====================================================================
-- module + pack wiring
-- =====================================================================
INSERT INTO public.platform_modules(code, name, kind, domain_no, description, depends_on, nav_modules, nav_prefixes, tables, integration, sort_order)
VALUES ('learning', 'Learning (courses, training & certifications)', 'addon', NULL,
        'Programs, units, cohorts, enrollments, progress and certificates. Staff training, customer classes, CE credits; EdTech renames it.',
        '{contacts}', '{}', '{Learning}',
        '{learn_programs,learn_units,learn_cohorts,learn_cohort_staff,learn_enrollments,learn_progress}', NULL, 300)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, description = EXCLUDED.description, depends_on = EXCLUDED.depends_on,
  nav_prefixes = EXCLUDED.nav_prefixes, tables = EXCLUDED.tables, sort_order = EXCLUDED.sort_order, updated_at = now();
UPDATE public.platform_modules SET depends_on = depends_on || '{learning}'::text[], updated_at = now()
 WHERE code = 'edtech' AND NOT ('learning' = ANY (depends_on));
UPDATE public.platform_modules SET tables = tables || '{learn_enrollments}'::text[], updated_at = now()
 WHERE code = 'edtech' AND NOT ('learn_enrollments' = ANY (tables));
UPDATE public.platform_packs SET modules = modules || '{learning}'::text[], updated_at = now()
 WHERE code = 'edtech' AND NOT ('learning' = ANY (modules));
-- roles belong to Teamwork & collaboration (every client has it)
UPDATE public.platform_modules SET tables = tables || '{platform_roles,platform_member_roles}'::text[], updated_at = now()
 WHERE code = 'collaboration' AND NOT ('platform_member_roles' = ANY (tables));

INSERT INTO public.platform_pack_items(pack_code, item_type, item_key, payload, sort_order)
SELECT p, t, k, j::jsonb, o FROM (VALUES
 ('edtech','picklist','learning_kind','{"values":["degree","term_course"]}',70),
 ('edtech','terminology','program','{"singular":"Course","plural":"Courses"}',71),
 ('edtech','terminology','cohort','{"singular":"Term","plural":"Terms"}',72),
 ('edtech','terminology','enrollment','{"singular":"Enrollment","plural":"Enrollments"}',73),
 ('healthcare','terminology','program','{"singular":"Care program","plural":"Care programs"}',95),
 ('financial_services','terminology','program','{"singular":"CE course","plural":"CE courses"}',95),
 ('auto_dealer','terminology','program','{"singular":"Certification","plural":"Certifications"}',95)
) v(p, t, k, j, o)
WHERE EXISTS (SELECT 1 FROM public.platform_packs k WHERE k.code = v.p)
ON CONFLICT (pack_code, item_type, item_key) DO UPDATE SET payload = EXCLUDED.payload, sort_order = EXCLUDED.sort_order;

-- tenants already on edtech get learning
INSERT INTO public.platform_tenant_modules(tenant_id, module_code, enabled)
SELECT tp.tenant_id, 'learning', true FROM public.platform_tenant_packs tp WHERE tp.pack_code = 'edtech' ON CONFLICT DO NOTHING;

-- =====================================================================
-- security
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  -- staff of the workspace read/write
  FOREACH t IN ARRAY ARRAY['learn_programs','learn_units','learn_cohorts','learn_cohort_staff'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_tenant_rw ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_tenant_rw ON public.%I FOR ALL TO authenticated
                      USING (public.platform_is_tenant_member(tenant_id)) WITH CHECK (public.platform_is_tenant_member(tenant_id))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
  -- enrollments / progress: staff read and edit; writes that change status go through the RPCs
  FOREACH t IN ARRAY ARRAY['learn_enrollments','learn_progress'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_tenant_read ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_tenant_read ON public.%I FOR SELECT TO authenticated USING (public.platform_is_tenant_member(tenant_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_tenant_update ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_tenant_update ON public.%I FOR UPDATE TO authenticated
                      USING (public.platform_is_tenant_member(tenant_id)) WITH CHECK (public.platform_is_tenant_member(tenant_id))', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE INSERT, DELETE ON public.%I FROM authenticated', t);
  END LOOP;
  REVOKE UPDATE ON public.learn_enrollments FROM authenticated;
  GRANT UPDATE (grade, expires_at, cohort_id) ON public.learn_enrollments TO authenticated;
  REVOKE UPDATE ON public.learn_progress FROM authenticated;
  GRANT UPDATE (feedback) ON public.learn_progress TO authenticated;

  -- participants (not workspace members) see only their own enrollments, progress and the programs they're in
  DROP POLICY IF EXISTS unify_self_read ON public.learn_enrollments;
  CREATE POLICY unify_self_read ON public.learn_enrollments FOR SELECT TO authenticated USING (user_id = auth.uid());
  DROP POLICY IF EXISTS unify_self_read ON public.learn_progress;
  CREATE POLICY unify_self_read ON public.learn_progress FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.learn_enrollments e WHERE e.id = learn_progress.enrollment_id AND e.user_id = auth.uid()));
  DROP POLICY IF EXISTS unify_participant_read ON public.learn_programs;
  CREATE POLICY unify_participant_read ON public.learn_programs FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.learn_enrollments e WHERE e.program_id = learn_programs.id AND e.user_id = auth.uid())
           OR (status = 'published' AND audience = 'public'));
  DROP POLICY IF EXISTS unify_participant_read ON public.learn_units;
  CREATE POLICY unify_participant_read ON public.learn_units FOR SELECT TO authenticated
    USING (status = 'active' AND EXISTS (SELECT 1 FROM public.learn_enrollments e WHERE e.program_id = learn_units.program_id AND e.user_id = auth.uid()
                                          AND e.status IN ('enrolled','in_progress','completed')));
  DROP POLICY IF EXISTS unify_participant_read ON public.learn_cohorts;
  CREATE POLICY unify_participant_read ON public.learn_cohorts FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.learn_enrollments e WHERE e.cohort_id = learn_cohorts.id AND e.user_id = auth.uid()));

  -- role grants: members read their workspace's grants, everyone reads their own; writes only via RPC
  ALTER TABLE public.platform_member_roles ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS unify_tenant_read ON public.platform_member_roles;
  CREATE POLICY unify_tenant_read ON public.platform_member_roles FOR SELECT TO authenticated
    USING (public.platform_is_tenant_member(tenant_id) OR user_id = auth.uid());
  GRANT SELECT ON public.platform_member_roles TO authenticated;
  REVOKE INSERT, UPDATE, DELETE ON public.platform_member_roles FROM authenticated;

  -- global reference tables
  FOREACH t IN ARRAY ARRAY['platform_roles','platform_role_aliases'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_read_all ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_read_all ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
  END LOOP;
END $$;
GRANT SELECT ON public.learn_v_roster TO authenticated;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['platform_resolve_role','platform_role_label','platform_has_role','platform_assign_role','platform_revoke_role',
     'platform_has_permission','assign_lms_role','revoke_lms_role','learn_enroll','learn_record_progress','learn_withdraw'] LOOP
    EXECUTE (SELECT string_agg(format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role',
                                      p.oid::regprocedure, p.oid::regprocedure), '; ')
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['platform__role_alias','platform__sync_membership','platform__is_service','platform__user_has_role','learn__enrollment_guard',
     'learn__record_event','learn__recompute'] LOOP
    EXECUTE (SELECT string_agg(format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', p.oid::regprocedure), '; ')
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f);
  END LOOP;
END $$;

INSERT INTO public.platform_table_access_overrides(table_name, access_mode, notes)
SELECT t, 'global_read', 'unify 06e: global reference data, readable by every signed-in user'
  FROM (VALUES ('platform_roles'),('platform_role_aliases')) v(t)
 WHERE NOT EXISTS (SELECT 1 FROM public.platform_table_access_overrides o WHERE o.table_name = v.t);
SELECT count(*) AS tables_secured FROM public.platform__apply_app_security();
SELECT public.platform_classify_tables() AS tables_classified;
COMMIT;

-- canonical step ledger
SELECT unify.done('330');
