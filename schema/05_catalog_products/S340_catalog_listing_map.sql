-- CANONICAL STEP 340  |  file S340_catalog_listing_map.sql  |  was unify/06f_catalog_listing_map.sql  |  internal log label '06f' (unchanged)
-- =====================================================================
-- 06f  Catalog -> Listing taxonomy map (inventory stays its own layer)
--
--   Product Catalog  global, no tenant. Every source lands here with its own names intact:
--                    POD catalogs, direct supplier APIs, feeds, marketplace sellers.
--                      suppliers                    the source
--                      catalog_source_categories    NEW: the source's own category tree, verbatim
--                      supplier_catalog_products    products (+ source_category_id / source_category_path)
--                      supplier_catalog_variants    variants
--   Listing          per tenant. The categories a business names and publishes on its site.
--                      taxonomy_nodes               the tenant's published tree (Unsaid's folder tree is one tenant's listing)
--                      product_taxonomy_links       the publish result: catalog product shown under a listing node
--   Map              per tenant. Connects the two; nobody's site has to use a supplier's names.
--                      listing_category_map         NEW: source category / source path / product pin / rule -> listing node
--                      listing_publish()            NEW: applies the map, writes links, leaves manual links alone
--   Inventory        stock + availability only, keyed by SKU. Defines no categories.
--                      listing_v_availability       NEW: what a listing can actually sell right now
--
-- Idempotent. Safe to re-run. Run after 06e.
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 340 (internal label '06f'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S340_catalog_listing_map.sql is step 340; run S200_unify_preflight.sql and every step up to 330 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('340');
END $guard$;
BEGIN;
SET LOCAL search_path = public, pg_catalog;

-- =====================================================================
-- A. Catalog layer: keep every source's category names intact
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.catalog_source_categories (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id    uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  external_id    text,                          -- the source's own id, when it has one
  name           text NOT NULL,                 -- verbatim, e.g. "Men's Clothing" or "T-Shirts"
  parent_id      uuid REFERENCES public.catalog_source_categories(id) ON DELETE CASCADE,
  path           text NOT NULL,                 -- verbatim names joined by " / ", e.g. "Men's Clothing / T-Shirts"
  depth          smallint NOT NULL DEFAULT 1 CHECK (depth BETWEEN 1 AND 12),
  product_count  integer NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  raw            jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, path)
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_source_categories_ext_uq
  ON public.catalog_source_categories(supplier_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS catalog_source_categories_parent_idx ON public.catalog_source_categories(parent_id);
COMMENT ON TABLE public.catalog_source_categories IS
  'Global product catalog: each source''s own category tree, names intact. Listing categories never live here; listing_category_map connects them.';

ALTER TABLE public.supplier_catalog_products
  ADD COLUMN IF NOT EXISTS source_category_id   uuid REFERENCES public.catalog_source_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_category_path text,     -- what the source called it; the ingest only has to set this
  ADD COLUMN IF NOT EXISTS source_product_type  text;     -- e.g. Printful "T-SHIRT", Shopify product_type
CREATE INDEX IF NOT EXISTS supplier_catalog_products_source_cat_idx ON public.supplier_catalog_products(source_category_id);
COMMENT ON COLUMN public.supplier_catalog_products.category_id IS
  'LEGACY: points at a tenant categories row from a global table (layer leak). 06f turned these into listing_category_map product pins. New code: source_category_id + listing_category_map.';

-- normalise a source path: trim each segment, keep the source's spelling and case
CREATE OR REPLACE FUNCTION public.catalog__norm_path(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, pg_catalog AS $$
  SELECT nullif(array_to_string(array(SELECT btrim(s) FROM unnest(regexp_split_to_array(coalesce(p, ''), '\s*(/|>|\|)\s*')) s
                                       WHERE btrim(s) <> ''), ' / '), '') $$;

-- find or create a source category (and its parents) from a verbatim path. APIs / feeds call this.
CREATE OR REPLACE FUNCTION public.catalog_upsert_source_category(p_supplier uuid, p_path text, p_external_id text DEFAULT NULL,
  p_raw jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE segs text[]; cur text; parent uuid; node uuid;
BEGIN
  segs := regexp_split_to_array(public.catalog__norm_path(p_path), ' / ');
  IF segs IS NULL OR array_length(segs, 1) IS NULL THEN RETURN NULL; END IF;
  FOR i IN 1 .. array_length(segs, 1) LOOP
    cur := array_to_string(segs[1:i], ' / ');
    INSERT INTO public.catalog_source_categories(supplier_id, name, parent_id, path, depth, external_id, raw)
    VALUES (p_supplier, segs[i], parent, cur, i,
            CASE WHEN i = array_length(segs, 1) THEN p_external_id END,
            CASE WHEN i = array_length(segs, 1) THEN coalesce(p_raw, '{}'::jsonb) ELSE '{}'::jsonb END)
    ON CONFLICT (supplier_id, path) DO UPDATE
      SET last_seen_at = now(), status = 'active',
          external_id = coalesce(EXCLUDED.external_id, catalog_source_categories.external_id),
          raw = CASE WHEN EXCLUDED.raw = '{}'::jsonb THEN catalog_source_categories.raw ELSE EXCLUDED.raw END
    RETURNING id INTO node;
    parent := node;
  END LOOP;
  RETURN node;
END $$;

-- any ingest path (API sync, feed import, browser catalog, manual) only has to set source_category_path
CREATE OR REPLACE FUNCTION public.catalog__product_source_category() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.source_category_path IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.source_category_path IS DISTINCT FROM OLD.source_category_path OR NEW.source_category_id IS NULL) THEN
    NEW.source_category_path := public.catalog__norm_path(NEW.source_category_path);
    NEW.source_category_id := public.catalog_upsert_source_category(NEW.supplier_id, NEW.source_category_path);
  ELSIF NEW.source_category_id IS NOT NULL AND NEW.source_category_path IS NULL THEN
    SELECT c.path INTO NEW.source_category_path FROM public.catalog_source_categories c WHERE c.id = NEW.source_category_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_source_category ON public.supplier_catalog_products;
CREATE TRIGGER trg_source_category BEFORE INSERT OR UPDATE OF source_category_path, source_category_id ON public.supplier_catalog_products
  FOR EACH ROW EXECUTE FUNCTION public.catalog__product_source_category();

-- =====================================================================
-- B. Listing layer: tenant-named, published categories
-- =====================================================================
-- node_type was a pet-store CHECK ('animal','department','subcategory','category'); now a picklist
INSERT INTO public.platform_picklist_values(tenant_id, list_code, value, label, sort_order, pack_code)
SELECT NULL, l, v, lb, o, p FROM (VALUES
  ('listing_node_type','department','Department',10,NULL),('listing_node_type','category','Category',20,NULL),
  ('listing_node_type','subcategory','Subcategory',30,NULL),('listing_node_type','collection','Collection',40,NULL),
  ('listing_node_type','audience','Audience (who it is for)',50,NULL),('listing_node_type','brand','Brand',60,NULL),
  ('listing_node_type','landing','Landing page',70,NULL),
  ('listing_node_type','animal','Animal',200,'pet_grooming')
) s(l, v, lb, o, p)
ON CONFLICT DO NOTHING;
DO $$
DECLARE n int;
BEGIN
  IF EXISTS (SELECT 1 FROM unify.settings WHERE key = '06f.listing_picklists_scoped') THEN RETURN; END IF;
  UPDATE public.platform_picklist_values SET is_active = false
   WHERE tenant_id IS NULL AND list_code = 'listing_node_type' AND pack_code IS NOT NULL;
  -- tenants already using 'animal' (Unsaid) keep it as their own value
  INSERT INTO public.platform_picklist_values(tenant_id, list_code, value, label, sort_order, pack_code)
  SELECT DISTINCT tn.tenant_id, 'listing_node_type', tn.node_type, initcap(tn.node_type), 200, NULL
    FROM public.taxonomy_nodes tn
   WHERE NOT EXISTS (SELECT 1 FROM public.platform_picklist_values v
                      WHERE v.list_code = 'listing_node_type' AND v.value = tn.node_type AND v.tenant_id IS NULL AND v.is_active)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN PERFORM unify.log('06f', 'taxonomy_nodes.node_type', 'tenant_values_kept', n || ' tenant/value pairs'); END IF;
  INSERT INTO unify.settings(key, value, note) VALUES ('06f.listing_picklists_scoped', now()::text, 'listing node types scoped');
END $$;
INSERT INTO public.platform_pack_items(pack_code, item_type, item_key, payload, sort_order)
VALUES ('pet_grooming', 'picklist', 'listing_node_type', '{"values":["animal"]}', 15)
ON CONFLICT (pack_code, item_type, item_key) DO NOTHING;

ALTER TABLE public.taxonomy_nodes DROP CONSTRAINT IF EXISTS taxonomy_nodes_node_type_check;
DROP TRIGGER IF EXISTS trg_picklist_node_type ON public.taxonomy_nodes;
CREATE TRIGGER trg_picklist_node_type BEFORE INSERT OR UPDATE OF node_type ON public.taxonomy_nodes
  FOR EACH ROW EXECUTE FUNCTION public.platform__picklist_guard('node_type', 'listing_node_type');
ALTER TABLE public.taxonomy_nodes
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS seo_title    text,
  ADD COLUMN IF NOT EXISTS seo_description text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'taxonomy_nodes_tenant_id_id_key') THEN
    ALTER TABLE public.taxonomy_nodes ADD CONSTRAINT taxonomy_nodes_tenant_id_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;
COMMENT ON TABLE public.taxonomy_nodes IS
  'Listing layer: the categories a tenant names and publishes on its own site. Never a supplier''s structure.';

-- the second tree: categories (used by products.category_id, overrides, supplier memory). Bridge each row to a listing node.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS listing_node_id uuid REFERENCES public.taxonomy_nodes(id) ON DELETE SET NULL;
DO $$
DECLARE r record; p text; nid uuid; n int := 0;
BEGIN
  FOR r IN
    WITH RECURSIVE t AS (
      SELECT c.id, c.tenant_id, c.parent_id, c.name, c.slug, c.sort_order, c.is_active, c.slug::text AS path, 1 AS d, NULL::uuid AS parent_node
        FROM public.categories c WHERE c.parent_id IS NULL
      UNION ALL
      SELECT c.id, c.tenant_id, c.parent_id, c.name, c.slug, c.sort_order, c.is_active, t.path || '/' || c.slug, t.d + 1, NULL
        FROM public.categories c JOIN t ON t.id = c.parent_id)
    SELECT * FROM t WHERE NOT EXISTS (SELECT 1 FROM public.categories x WHERE x.id = t.id AND x.listing_node_id IS NOT NULL)
    ORDER BY d
  LOOP
    INSERT INTO public.taxonomy_nodes(tenant_id, parent_id, node_type, name, slug, path, depth, sort_order, is_associated, is_featured, is_gated, status, source_text)
    VALUES (r.tenant_id, (SELECT listing_node_id FROM public.categories WHERE id = r.parent_id),
            CASE WHEN r.d = 1 THEN 'department' WHEN r.d = 2 THEN 'category' ELSE 'subcategory' END,
            r.name, r.slug, r.path, r.d, coalesce(r.sort_order, 0), false, false, false,
            CASE WHEN r.is_active THEN 'published' ELSE 'draft' END, 'categories:' || r.id)
    ON CONFLICT (tenant_id, path) DO UPDATE SET updated_at = now()
    RETURNING id INTO nid;
    UPDATE public.categories SET listing_node_id = nid WHERE id = r.id;
    n := n + 1;
  END LOOP;
  IF n > 0 THEN PERFORM unify.log('06f', 'categories', 'bridged_to_listing', n || ' rows'); END IF;
END $$;

-- =====================================================================
-- C. Publish result: product_taxonomy_links becomes tenant-safe and knows where it came from
-- =====================================================================
ALTER TABLE public.product_taxonomy_links
  ADD COLUMN IF NOT EXISTS node_id    uuid,
  ADD COLUMN IF NOT EXISTS source     text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS map_id     uuid,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_taxonomy_links_source_check') THEN
    ALTER TABLE public.product_taxonomy_links ADD CONSTRAINT product_taxonomy_links_source_check CHECK (source IN ('manual','map','import'));
  END IF;
END $$;
-- links that name a path the tenant has no node for: create the node chain (they were live, so published) and log it
DO $$
DECLARE r record; segs text[]; i int; cur text; parent uuid; nid uuid; n int := 0;
BEGIN
  FOR r IN SELECT DISTINCT l.tenant_id, l.path FROM public.product_taxonomy_links l
            WHERE l.node_id IS NULL AND btrim(coalesce(l.path, '')) <> ''
              AND NOT EXISTS (SELECT 1 FROM public.taxonomy_nodes t WHERE t.tenant_id = l.tenant_id AND t.path = l.path) LOOP
    segs := array(SELECT s FROM unnest(string_to_array(btrim(r.path, '/'), '/')) s WHERE s <> '');
    parent := NULL;
    FOR i IN 1 .. coalesce(array_length(segs, 1), 0) LOOP
      cur := array_to_string(segs[1:i], '/');
      SELECT id INTO nid FROM public.taxonomy_nodes WHERE tenant_id = r.tenant_id AND path = cur;
      IF nid IS NULL THEN
        INSERT INTO public.taxonomy_nodes(tenant_id, parent_id, node_type, name, slug, path, depth, sort_order, is_associated, is_featured, is_gated, status, source_text)
        VALUES (r.tenant_id, parent, CASE i WHEN 1 THEN 'department' WHEN 2 THEN 'category' ELSE 'subcategory' END,
                initcap(replace(segs[i], '-', ' ')), segs[i], cur, i, 0, false, false, false, 'published', 'auto: product_taxonomy_links')
        RETURNING id INTO nid;
        n := n + 1;
      END IF;
      parent := nid;
    END LOOP;
  END LOOP;
  IF n > 0 THEN PERFORM unify.log('06f', 'taxonomy_nodes', 'created_for_orphan_links', n || ' listing nodes created from link paths; rename them in Catalog > Listing'); END IF;
END $$;
UPDATE public.product_taxonomy_links l SET node_id = n.id
  FROM public.taxonomy_nodes n WHERE l.node_id IS NULL AND n.tenant_id = l.tenant_id AND n.path = l.path;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.product_taxonomy_links WHERE node_id IS NULL;
  IF n > 0 THEN PERFORM unify.log('06f', 'product_taxonomy_links', 'path_without_listing_node', n || ' links point at a path the tenant has no node for'); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_taxonomy_links_node_fk') THEN
    ALTER TABLE public.product_taxonomy_links ADD CONSTRAINT product_taxonomy_links_node_fk
      FOREIGN KEY (tenant_id, node_id) REFERENCES public.taxonomy_nodes(tenant_id, id) ON DELETE CASCADE;
  END IF;
  -- UNIQUE (path, product_id) had no tenant: two shops could not list the same catalog product under the same path
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_taxonomy_links_tenant_path_product_key') THEN
    ALTER TABLE public.product_taxonomy_links ADD CONSTRAINT product_taxonomy_links_tenant_path_product_key UNIQUE (tenant_id, path, product_id);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
              AND p.prosrc ~* 'product_taxonomy_links' AND p.prosrc ~* 'on\s+conflict\s*\(\s*path\s*,\s*product_id\s*\)') THEN
    PERFORM unify.log('06f', 'product_taxonomy_links_path_product_id_key', 'kept', 'a function still uses ON CONFLICT (path, product_id); switch it to (tenant_id, path, product_id) then drop');
  ELSE
    ALTER TABLE public.product_taxonomy_links DROP CONSTRAINT IF EXISTS product_taxonomy_links_path_product_id_key;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS product_taxonomy_links_node_idx ON public.product_taxonomy_links(node_id, sort_order);
CREATE INDEX IF NOT EXISTS product_taxonomy_links_tenant_product_idx ON public.product_taxonomy_links(tenant_id, product_id);

-- a link can be written with either path or node; the other is filled in, and both must belong to the tenant
CREATE OR REPLACE FUNCTION public.listing__link_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE n public.taxonomy_nodes;
BEGIN
  IF NEW.node_id IS NOT NULL THEN
    SELECT * INTO n FROM public.taxonomy_nodes WHERE id = NEW.node_id;
  ELSE
    SELECT * INTO n FROM public.taxonomy_nodes WHERE tenant_id = NEW.tenant_id AND path = NEW.path;
  END IF;
  IF n.id IS NULL THEN
    RAISE EXCEPTION 'listing category % does not exist for this tenant', coalesce(NEW.path, NEW.node_id::text) USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF n.tenant_id <> NEW.tenant_id THEN RAISE EXCEPTION 'listing category belongs to another tenant' USING ERRCODE = 'check_violation'; END IF;
  NEW.node_id := n.id; NEW.path := n.path; NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_listing_link_guard ON public.product_taxonomy_links;
CREATE TRIGGER trg_listing_link_guard BEFORE INSERT OR UPDATE OF node_id, path, tenant_id ON public.product_taxonomy_links
  FOR EACH ROW EXECUTE FUNCTION public.listing__link_guard();

-- renaming / moving a listing node keeps its links (and children's links) in step
CREATE OR REPLACE FUNCTION public.listing__node_path_moved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF NEW.path IS DISTINCT FROM OLD.path THEN
    UPDATE public.product_taxonomy_links SET path = NEW.path, updated_at = now() WHERE node_id = NEW.id;
  END IF;
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' AND NEW.published_at IS NULL THEN
    UPDATE public.taxonomy_nodes SET published_at = now() WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_listing_node_moved ON public.taxonomy_nodes;
CREATE TRIGGER trg_listing_node_moved AFTER UPDATE OF path, status ON public.taxonomy_nodes
  FOR EACH ROW EXECUTE FUNCTION public.listing__node_path_moved();

-- =====================================================================
-- D. The map: catalog -> listing, per tenant
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.listing_category_map (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  node_id             uuid NOT NULL,                               -- the tenant's listing category
  match_kind          text NOT NULL CHECK (match_kind IN ('source_category','source_path','product','rule')),
  source_category_id  uuid REFERENCES public.catalog_source_categories(id) ON DELETE CASCADE,
  supplier_id         uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,  -- narrows source_path / rule to one source
  source_path_prefix  text,                                        -- verbatim prefix, e.g. "Men's Clothing / T-Shirts"
  catalog_product_id  uuid REFERENCES public.supplier_catalog_products(id) ON DELETE CASCADE,
  rule                jsonb NOT NULL DEFAULT '{}'::jsonb,           -- {"brand_in":[..],"name_ilike":"%hoodie%","product_type_in":[..],"supplier_kind_in":["pod"]}
  include_descendants boolean NOT NULL DEFAULT true,
  effect              text NOT NULL DEFAULT 'include' CHECK (effect IN ('include','exclude')),
  priority            integer NOT NULL DEFAULT 100,                 -- lower wins when choosing a product's primary category
  is_primary          boolean NOT NULL DEFAULT false,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  notes               text,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, node_id) REFERENCES public.taxonomy_nodes(tenant_id, id) ON DELETE CASCADE,
  CHECK (match_kind <> 'source_category' OR source_category_id IS NOT NULL),
  CHECK (match_kind <> 'source_path' OR source_path_prefix IS NOT NULL),
  CHECK (match_kind <> 'product' OR catalog_product_id IS NOT NULL),
  CHECK (match_kind <> 'rule' OR rule <> '{}'::jsonb)
);
CREATE UNIQUE INDEX IF NOT EXISTS listing_category_map_uq ON public.listing_category_map
  (tenant_id, node_id, match_kind, effect,
   coalesce(source_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(source_path_prefix, ''), coalesce(catalog_product_id, '00000000-0000-0000-0000-000000000000'::uuid), rule);
CREATE INDEX IF NOT EXISTS listing_category_map_source_idx ON public.listing_category_map(source_category_id) WHERE source_category_id IS NOT NULL;
COMMENT ON TABLE public.listing_category_map IS
  'The taxonomy map. Connects global catalog products / source categories to a tenant''s own listing categories. listing_publish() applies it.';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_taxonomy_links_map_fk') THEN
    ALTER TABLE public.product_taxonomy_links ADD CONSTRAINT product_taxonomy_links_map_fk
      FOREIGN KEY (map_id) REFERENCES public.listing_category_map(id) ON DELETE SET NULL;
  END IF;
END $$;

-- which catalog products does one map row match?
CREATE OR REPLACE FUNCTION public.listing__map_matches(m public.listing_category_map)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT p.id
    FROM public.supplier_catalog_products p
    JOIN public.suppliers s ON s.id = p.supplier_id
    LEFT JOIN public.catalog_source_categories c ON c.id = p.source_category_id
   WHERE NOT p.is_hidden
     AND (m.supplier_id IS NULL OR p.supplier_id = m.supplier_id)
     AND CASE m.match_kind
       WHEN 'product' THEN p.id = m.catalog_product_id
       WHEN 'source_category' THEN p.source_category_id = m.source_category_id
            OR (m.include_descendants AND c.id IS NOT NULL AND EXISTS (
                  SELECT 1 FROM public.catalog_source_categories root
                   WHERE root.id = m.source_category_id AND root.supplier_id = c.supplier_id
                     AND c.path LIKE replace(replace(root.path, '%', '\%'), '_', '\_') || ' / %'))
       WHEN 'source_path' THEN lower(p.source_category_path) = lower(public.catalog__norm_path(m.source_path_prefix))
            OR (m.include_descendants AND lower(p.source_category_path) LIKE
                  lower(replace(replace(public.catalog__norm_path(m.source_path_prefix), '%', '\%'), '_', '\_')) || ' / %')
       WHEN 'rule' THEN
            (NOT (m.rule ? 'brand_in') OR p.brand_name = ANY (ARRAY(SELECT jsonb_array_elements_text(m.rule -> 'brand_in'))))
        AND (NOT (m.rule ? 'name_ilike') OR p.name ILIKE (m.rule ->> 'name_ilike'))
        AND (NOT (m.rule ? 'product_type_in') OR p.source_product_type = ANY (ARRAY(SELECT jsonb_array_elements_text(m.rule -> 'product_type_in'))))
        AND (NOT (m.rule ? 'supplier_kind_in') OR s.kind = ANY (ARRAY(SELECT jsonb_array_elements_text(m.rule -> 'supplier_kind_in'))))
        AND (NOT (m.rule ? 'source_path_like') OR p.source_category_path ILIKE (m.rule ->> 'source_path_like'))
       ELSE false END $$;

-- the publish step: apply the map for one listing node (or all of a tenant's nodes)
CREATE OR REPLACE FUNCTION public.listing_publish(p_tenant uuid, p_node uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE nd record; added int := 0; removed int := 0; kept int := 0; nodes int := 0; x int;
BEGIN
  IF NOT (public.platform__is_service() OR public.platform_has_role(p_tenant, 'manager')
          OR public.platform_has_permission(p_tenant, 'catalog.publish')) THEN
    RAISE EXCEPTION 'not allowed to publish listings for this tenant' USING ERRCODE = 'insufficient_privilege';
  END IF;
  FOR nd IN SELECT n.* FROM public.taxonomy_nodes n
             WHERE n.tenant_id = p_tenant AND (p_node IS NULL OR n.id = p_node) AND n.status <> 'archived' LOOP
    nodes := nodes + 1;
    CREATE TEMP TABLE IF NOT EXISTS _listing_want(product_id uuid PRIMARY KEY, map_id uuid, priority int, is_primary boolean) ON COMMIT DROP;
    TRUNCATE _listing_want;
    INSERT INTO _listing_want
    SELECT DISTINCT ON (x.pid) x.pid, m.id, m.priority, m.is_primary
      FROM public.listing_category_map m, LATERAL public.listing__map_matches(m) AS x(pid)
     WHERE m.tenant_id = p_tenant AND m.node_id = nd.id AND m.status = 'active' AND m.effect = 'include'
     ORDER BY x.pid, m.is_primary DESC, m.priority, m.created_at;
    DELETE FROM _listing_want w
     WHERE EXISTS (SELECT 1 FROM public.listing_category_map m, LATERAL public.listing__map_matches(m) AS x(pid)
                    WHERE m.tenant_id = p_tenant AND m.node_id = nd.id AND m.status = 'active' AND m.effect = 'exclude' AND x.pid = w.product_id);
    -- stale map links go; manual links are never touched
    DELETE FROM public.product_taxonomy_links l
     WHERE l.tenant_id = p_tenant AND l.node_id = nd.id AND l.source = 'map'
       AND NOT EXISTS (SELECT 1 FROM _listing_want w WHERE w.product_id = l.product_id);
    GET DIAGNOSTICS x = ROW_COUNT; removed := removed + x;
    SELECT count(*) INTO x FROM _listing_want w JOIN public.product_taxonomy_links l
      ON l.tenant_id = p_tenant AND l.path = nd.path AND l.product_id = w.product_id;
    kept := kept + x;
    INSERT INTO public.product_taxonomy_links(tenant_id, path, node_id, product_id, is_primary, rule, source, map_id)
    SELECT p_tenant, nd.path, nd.id, w.product_id, false, 'map:' || w.map_id, 'map', w.map_id FROM _listing_want w
    ON CONFLICT (tenant_id, path, product_id) DO UPDATE
      SET map_id = CASE WHEN product_taxonomy_links.source = 'map' THEN EXCLUDED.map_id ELSE product_taxonomy_links.map_id END,
          updated_at = now();
    GET DIAGNOSTICS x = ROW_COUNT; added := added + x;
  END LOOP;
  added := greatest(added - kept, 0);
  -- one primary listing category per product: a manual primary wins, else the is_primary / lowest-priority map, else the deepest node
  WITH ranked AS (
    SELECT l.id, row_number() OVER (PARTITION BY l.product_id
             ORDER BY (l.source = 'manual' AND l.is_primary) DESC, coalesce(m.is_primary, false) DESC,
                      coalesce(m.priority, 1000), n.depth DESC, l.created_at) AS rn
      FROM public.product_taxonomy_links l
      JOIN public.taxonomy_nodes n ON n.id = l.node_id
      LEFT JOIN public.listing_category_map m ON m.id = l.map_id
     WHERE l.tenant_id = p_tenant)
  UPDATE public.product_taxonomy_links l SET is_primary = (r.rn = 1)
    FROM ranked r WHERE r.id = l.id AND l.is_primary IS DISTINCT FROM (r.rn = 1);
  -- counts shown on the storefront
  UPDATE public.taxonomy_nodes n SET product_count = (SELECT count(*) FROM public.product_taxonomy_links l WHERE l.node_id = n.id)
   WHERE n.tenant_id = p_tenant AND (p_node IS NULL OR n.id = p_node);
  RETURN jsonb_build_object('nodes', nodes, 'added', added, 'removed', removed, 'unchanged', kept);
END $$;

-- convenience RPC for the admin UI: map one source category (or path, or product) onto a listing category
CREATE OR REPLACE FUNCTION public.listing_map_category(p_tenant uuid, p_node uuid, p_source_category uuid DEFAULT NULL,
  p_source_path text DEFAULT NULL, p_supplier uuid DEFAULT NULL, p_product uuid DEFAULT NULL, p_rule jsonb DEFAULT NULL,
  p_effect text DEFAULT 'include', p_include_descendants boolean DEFAULT true, p_priority integer DEFAULT 100,
  p_is_primary boolean DEFAULT false, p_publish boolean DEFAULT true)
RETURNS public.listing_category_map LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE m public.listing_category_map; k text;
BEGIN
  IF NOT (public.platform__is_service() OR public.platform_has_role(p_tenant, 'manager')
          OR public.platform_has_permission(p_tenant, 'catalog.publish')) THEN
    RAISE EXCEPTION 'not allowed to change listing maps for this tenant' USING ERRCODE = 'insufficient_privilege';
  END IF;
  k := CASE WHEN p_product IS NOT NULL THEN 'product' WHEN p_source_category IS NOT NULL THEN 'source_category'
            WHEN p_source_path IS NOT NULL THEN 'source_path' WHEN p_rule IS NOT NULL THEN 'rule' END;
  IF k IS NULL THEN RAISE EXCEPTION 'say what to map: a source category, a source path, a product or a rule'; END IF;
  INSERT INTO public.listing_category_map(tenant_id, node_id, match_kind, source_category_id, supplier_id, source_path_prefix,
                                          catalog_product_id, rule, effect, include_descendants, priority, is_primary, created_by)
  VALUES (p_tenant, p_node, k, p_source_category, p_supplier, public.catalog__norm_path(p_source_path), p_product,
          coalesce(p_rule, '{}'::jsonb), p_effect, p_include_descendants, p_priority, p_is_primary, auth.uid())
  ON CONFLICT (tenant_id, node_id, match_kind, effect,
               coalesce(source_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(source_path_prefix, ''), coalesce(catalog_product_id, '00000000-0000-0000-0000-000000000000'::uuid), rule)
  DO UPDATE SET status = 'active', priority = EXCLUDED.priority, is_primary = EXCLUDED.is_primary,
                include_descendants = EXCLUDED.include_descendants, updated_at = now()
  RETURNING * INTO m;
  IF p_publish THEN PERFORM public.listing_publish(p_tenant, p_node); END IF;
  RETURN m;
END $$;

CREATE OR REPLACE FUNCTION public.listing_unmap(p_map uuid, p_publish boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE m public.listing_category_map;
BEGIN
  SELECT * INTO m FROM public.listing_category_map WHERE id = p_map;
  IF m.id IS NULL THEN RAISE EXCEPTION 'unknown map row'; END IF;
  IF NOT (public.platform__is_service() OR public.platform_has_role(m.tenant_id, 'manager')
          OR public.platform_has_permission(m.tenant_id, 'catalog.publish')) THEN
    RAISE EXCEPTION 'not allowed to change listing maps for this tenant' USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM public.listing_category_map WHERE id = p_map;
  IF p_publish THEN RETURN public.listing_publish(m.tenant_id, m.node_id); END IF;
  RETURN jsonb_build_object('nodes', 0);
END $$;

-- gap report: source categories with products that this tenant has not mapped anywhere
CREATE OR REPLACE FUNCTION public.listing_unmapped(p_tenant uuid, p_supplier uuid DEFAULT NULL)
RETURNS TABLE(supplier_id uuid, supplier_name text, source_category_id uuid, source_path text, products bigint, listed bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT s.id, s.name, c.id, c.path, count(p.id),
         count(p.id) FILTER (WHERE EXISTS (SELECT 1 FROM public.product_taxonomy_links l WHERE l.tenant_id = p_tenant AND l.product_id = p.id))
    FROM public.catalog_source_categories c
    JOIN public.suppliers s ON s.id = c.supplier_id
    JOIN public.supplier_catalog_products p ON p.source_category_id = c.id AND NOT p.is_hidden
   WHERE (public.platform__is_service() OR public.platform_is_tenant_member(p_tenant))
     AND (p_supplier IS NULL OR c.supplier_id = p_supplier)
   GROUP BY s.id, s.name, c.id, c.path
  HAVING count(p.id) FILTER (WHERE EXISTS (SELECT 1 FROM public.product_taxonomy_links l WHERE l.tenant_id = p_tenant AND l.product_id = p.id)) < count(p.id)
   ORDER BY count(p.id) DESC $$;

-- storefront read, tenant-aware (the legacy taxonomy_link_products(path, ...) has no tenant filter)
CREATE OR REPLACE FUNCTION public.listing_products(p_tenant uuid, p_path text, p_limit integer DEFAULT 48, p_offset integer DEFAULT 0)
RETURNS SETOF public.supplier_catalog_products LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT p.*
    FROM public.product_taxonomy_links l
    JOIN public.taxonomy_nodes n ON n.id = l.node_id AND n.tenant_id = p_tenant AND n.status = 'published'
    JOIN public.supplier_catalog_products p ON p.id = l.product_id AND NOT p.is_hidden
   WHERE l.tenant_id = p_tenant AND l.path = p_path
   ORDER BY l.sort_order, p.created_at DESC
   LIMIT least(coalesce(p_limit, 48), 200) OFFSET greatest(coalesce(p_offset, 0), 0) $$;

-- fixed: counted products.category_id = taxonomy_nodes.id AND status = 'live' (wrong tree, a status that does not exist)
CREATE OR REPLACE FUNCTION public.recompute_category_counts() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  UPDATE public.taxonomy_nodes n
     SET product_count = (SELECT count(*) FROM public.product_taxonomy_links l
                            JOIN public.supplier_catalog_products p ON p.id = l.product_id AND NOT p.is_hidden
                           WHERE l.node_id = n.id)
   WHERE n.product_count IS DISTINCT FROM (SELECT count(*) FROM public.product_taxonomy_links l
                            JOIN public.supplier_catalog_products p ON p.id = l.product_id AND NOT p.is_hidden
                           WHERE l.node_id = n.id) $$;

-- =====================================================================
-- E. Move the old text mapping and legacy pins onto the map
-- =====================================================================
DO $$
DECLARE r record; sup uuid; src uuid; ten uuid; nd uuid; cat text; first boolean; n_src int := 0; n_map int := 0; n_miss int := 0; n_pin int := 0;
BEGIN
  SELECT id INTO ten FROM public.tenants WHERE slug = 'unsaid';
  FOR r IN SELECT * FROM public.supplier_category_mapping LOOP
    SELECT id INTO sup FROM public.suppliers WHERE lower(slug) = lower(r.supplier) OR lower(name) = lower(r.supplier) LIMIT 1;
    IF sup IS NULL THEN
      n_miss := n_miss + 1;
      PERFORM unify.log('06f', 'supplier_category_mapping', 'unknown_supplier', r.supplier || ' / ' || r.supplier_product_type);
      CONTINUE;
    END IF;
    src := public.catalog_upsert_source_category(sup, r.supplier_product_type, NULL,
             jsonb_build_object('lookup_key', r.lookup_key, 'from', 'supplier_category_mapping'));
    n_src := n_src + 1;
    UPDATE public.supplier_catalog_products SET source_product_type = coalesce(source_product_type, r.supplier_product_type),
           source_category_path = coalesce(source_category_path, public.catalog__norm_path(r.supplier_product_type))
     WHERE supplier_id = sup AND lower(source_product_type) = lower(r.supplier_product_type) AND source_category_id IS NULL;
    IF ten IS NULL THEN CONTINUE; END IF;
    first := true;
    FOREACH cat IN ARRAY (ARRAY[r.primary_category] || coalesce(r.categories, '{}'::text[])) LOOP
      CONTINUE WHEN cat IS NULL OR btrim(cat) = '';
      SELECT id INTO nd FROM public.taxonomy_nodes
       WHERE tenant_id = ten AND (path = btrim(cat) OR slug = btrim(cat) OR lower(name) = lower(btrim(cat)))
       ORDER BY (path = btrim(cat)) DESC, depth DESC LIMIT 1;
      IF nd IS NULL THEN
        n_miss := n_miss + 1;
        PERFORM unify.log('06f', 'supplier_category_mapping', 'unknown_listing_category', r.supplier || ' / ' || r.supplier_product_type || ' -> ' || cat);
      ELSE
        INSERT INTO public.listing_category_map(tenant_id, node_id, match_kind, source_category_id, is_primary, priority, notes)
        VALUES (ten, nd, 'source_category', src, first, CASE WHEN first THEN 10 ELSE 100 END, 'migrated from supplier_category_mapping')
        ON CONFLICT DO NOTHING;
        n_map := n_map + 1;
      END IF;
      first := false;
    END LOOP;
  END LOOP;
  -- supplier_catalog_products.category_id (global row -> tenant categories row) becomes a product pin for that tenant
  INSERT INTO public.listing_category_map(tenant_id, node_id, match_kind, catalog_product_id, is_primary, priority, notes)
  SELECT c.tenant_id, c.listing_node_id, 'product', p.id, true, 5, 'migrated from supplier_catalog_products.category_id'
    FROM public.supplier_catalog_products p JOIN public.categories c ON c.id = p.category_id
   WHERE c.listing_node_id IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_pin = ROW_COUNT;
  IF n_src + n_map + n_miss + n_pin > 0 THEN
    PERFORM unify.log('06f', 'listing_category_map', 'migrated',
      format('%s source categories, %s map rows, %s product pins, %s unmatched (see unify.run_log)', n_src, n_map, n_pin, n_miss));
  END IF;
END $$;
COMMENT ON TABLE public.supplier_category_mapping IS
  'LEGACY text mapping (supplier product type -> Unsaid category names). 06f moved it to catalog_source_categories + listing_category_map; read-only reference now.';
COMMENT ON TABLE public.erp_product_categories IS
  'Internal ERP classification (accounting / purchasing / reporting). Not a storefront listing; listings live in taxonomy_nodes.';
COMMENT ON TABLE public.categories IS
  'LEGACY second category tree. Each row is bridged to a listing node via listing_node_id; new listing work uses taxonomy_nodes.';

-- =====================================================================
-- F. Inventory stays separate: availability per listed product, no categories
-- =====================================================================
CREATE OR REPLACE VIEW public.listing_v_availability WITH (security_invoker = true) AS
SELECT l.tenant_id, l.node_id, l.path, l.product_id AS catalog_product_id, v.id AS catalog_variant_id,
       s.kind AS supplier_kind, sk.id AS sku_id, sk.sku,
       CASE WHEN sk.id IS NOT NULL THEN 'stocked'
            WHEN s.kind = 'pod' THEN 'made_to_order'
            ELSE 'supplier_stock' END AS availability_source,
       CASE WHEN sk.id IS NOT NULL THEN coalesce(b.available, 0) END AS available_qty,
       CASE WHEN sk.id IS NOT NULL THEN coalesce(b.available, 0) > 0 ELSE s.ordering_status <> 'catalog_only' END AS can_sell
  FROM public.product_taxonomy_links l
  JOIN public.supplier_catalog_products p ON p.id = l.product_id
  JOIN public.suppliers s ON s.id = p.supplier_id
  LEFT JOIN public.supplier_catalog_variants v ON v.supplier_catalog_product_id = p.id
  LEFT JOIN public.supplier_product_mappings spm ON spm.tenant_id = l.tenant_id AND spm.supplier_catalog_variant_id = v.id
  LEFT JOIN public.erp_product_skus sk ON sk.tenant_id = l.tenant_id AND sk.sku = spm.product_sku AND sk.is_active
  LEFT JOIN LATERAL (SELECT sum(ib.on_hand - ib.reserved - ib.allocated) AS available
                       FROM public.erp_inventory_balances ib
                      WHERE ib.tenant_id = l.tenant_id AND ib.sku_id = sk.id) b ON true;
COMMENT ON VIEW public.listing_v_availability IS
  'Inventory layer read: can a listed catalog product sell now. Local SKUs use stock balances; POD is made to order; dropship uses the supplier.';

-- =====================================================================
-- G. Module wiring, nav, security
-- =====================================================================
UPDATE public.platform_modules
   SET tables = tables || ARRAY(SELECT t FROM unnest(ARRAY['catalog_source_categories','listing_category_map','taxonomy_nodes','product_taxonomy_links']) t
                                 WHERE NOT (t = ANY (tables))),
       updated_at = now()
 WHERE code = 'products';

-- tenant tables: members read; managers (or catalog.publish) write through the RPCs or directly
ALTER TABLE public.listing_category_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS unify_tenant_rw ON public.listing_category_map;
CREATE POLICY unify_tenant_rw ON public.listing_category_map FOR ALL TO authenticated
  USING (public.platform_is_tenant_member(tenant_id))
  WITH CHECK (public.platform_has_role(tenant_id, 'manager') OR public.platform_has_permission(tenant_id, 'catalog.publish'));
-- the global catalog is written only by ingest (service role); everyone signed in may read it
REVOKE INSERT, UPDATE, DELETE ON public.catalog_source_categories FROM authenticated, anon;
INSERT INTO public.platform_table_access_overrides(table_name, access_mode, notes)
SELECT 'catalog_source_categories', 'global_read', 'unify 06f: global product catalog (source categories, names intact)'
 WHERE NOT EXISTS (SELECT 1 FROM public.platform_table_access_overrides o WHERE o.table_name = 'catalog_source_categories');

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['listing_publish','listing_map_category','listing_unmap','listing_unmapped','listing_products'] LOOP
    EXECUTE (SELECT string_agg(format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role',
                                      p.oid::regprocedure, p.oid::regprocedure), '; ')
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f);
  END LOOP;
  -- storefronts read without a login
  EXECUTE (SELECT string_agg(format('GRANT EXECUTE ON FUNCTION %s TO anon', p.oid::regprocedure), '; ')
             FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'listing_products');
  FOREACH f IN ARRAY ARRAY['catalog_upsert_source_category','catalog__product_source_category','listing__link_guard',
     'listing__node_path_moved','listing__map_matches','recompute_category_counts'] LOOP
    EXECUTE (SELECT string_agg(format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', p.oid::regprocedure), '; ')
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f);
  END LOOP;
END $$;

SELECT count(*) AS tables_secured FROM public.platform__apply_app_security();

COMMIT;

-- canonical step ledger
SELECT unify.done('340');
