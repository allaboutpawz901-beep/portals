-- CANONICAL STEP 320  |  file S320_modules_and_packs.sql  |  was unify/06d_modules_and_packs.sql  |  internal log label '06d' (unchanged)
-- =====================================================================
-- S320_modules_and_packs.sql — the duplicable system.
--
--   platform_modules        catalog: 36 agnostic domains (core + add-ons)
--                           and the specialty modules, each with the nav
--                           sections and tables it owns
--   platform_tenant_modules what each client has switched on
--   platform_packs          an industry / business-model pack = a list of
--   platform_pack_items     modules + configuration rows (picklist values,
--                           record types, custom fields, pipelines,
--                           terminology, settings). No pack creates tables.
--   platform_apply_pack()   idempotent; refuses compliance packs (HIPAA) on
--                           a deployment that isn't certified for them
--   platform_provision_tenant()  new client = one call: tenant + packs +
--                           default pipeline + owner invitation
--   platform_tenant_nav() / platform_tenant_actions()  what that client sees
--   platform_module_coverage()  which modules are backed by real tables
-- =====================================================================
\set ON_ERROR_STOP on
-- canonical step 320 (internal label '06d'): stop here unless every earlier step has run
DO $guard$ BEGIN
  IF to_regprocedure('unify.require(text)') IS NULL THEN
    RAISE EXCEPTION 'OUT OF ORDER: S320_modules_and_packs.sql is step 320; run S200_unify_preflight.sql and every step up to 310 first (./run_all.sh does this).';
  END IF;
  PERFORM unify.require('320');
END $guard$;
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_modules (
  code                text PRIMARY KEY,
  name                text NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('core','addon','specialty')),
  domain_no           integer,                 -- number in the agnostic-domain list
  description         text,
  depends_on          text[] NOT NULL DEFAULT '{}',
  nav_modules         text[] NOT NULL DEFAULT '{}',   -- platform_feature_tree_coverage.module values it owns
  nav_prefixes        text[] NOT NULL DEFAULT '{}',   -- more specific path prefixes it owns
  tables              text[] NOT NULL DEFAULT '{}',   -- backing tables (coverage check)
  integration         text,                    -- outside provider the module needs, if any
  requires_compliance text[] NOT NULL DEFAULT '{}',
  sort_order          integer NOT NULL DEFAULT 100,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_modules(code, name, kind, domain_no, depends_on, nav_modules, nav_prefixes, tables, integration, sort_order)
SELECT * FROM (VALUES
 -- ---------- core: every client ----------
 ('contacts','Contact management','core',1,'{}'::text[],'{crm}'::text[],'{Contacts,Settings/CRM}'::text[],'{crm_customers,crm_households,crm_customer_contact_methods,platform_parties}'::text[],NULL::text,10),
 ('deals','Deal management','core',2,'{contacts}','{}','{Contacts/CRM tools/Deals}','{crm_deals,crm_deal_stage_history}',NULL,20),
 ('pipelines','Sales pipeline management','core',3,'{deals}','{}','{Contacts/CRM tools/Pipelines}','{crm_pipelines,crm_pipeline_stages}',NULL,30),
 ('reminders','Follow-up reminders','core',4,'{}','{}','{Tasks/Reminders}','{platform_reminders,crm_tasks}',NULL,40),
 ('lead_scoring','Lead prioritization','core',5,'{contacts}','{}','{Contacts/CRM tools/Lead scoring}','{crm_leads,crm_lead_scoring_rules,crm_lead_score_bands}',NULL,50),
 ('sales_tracking','Sales tracking','core',6,'{deals}','{}','{Reports/Sales tracking}','{crm_v_sales_tracking,crm_v_pipeline_summary,platform_kpi_targets}',NULL,60),
 ('segments','Customer segmentation','core',7,'{contacts}','{}','{Contacts/CRM tools/Segments,Settings/CRM/Segments & lists}','{crm_segments,crm_segment_memberships}',NULL,70),
 ('email_sync','Two-way email sync','core',8,'{contacts}','{}','{Contacts/CRM tools/Inbox,Settings/System/Mailboxes}','{platform_mailboxes,platform_email_threads,platform_email_messages}','gmail / outlook',80),
 ('workspace','Central workspace','core',9,'{}','{platform}','{Pinned}','{platform_quick_links,platform_create_favorites,platform_saved_views}',NULL,90),
 ('dashboard','Simple CRM dashboard','core',10,'{}','{reports}','{Dashboard}','{platform_dashboards,platform_dashboard_widgets}',NULL,100),
 ('collaboration','Teamwork & collaboration','core',11,'{}','{}','{Tasks/Following,Tasks/Personal chat,Tasks/Team announcements,Settings/Workspace/Teammates,Settings/Workspace/Invitations}','{platform_chat_threads,platform_chat_messages,platform_record_followers,crm_task_comments}',NULL,110),
 ('calls','Click-to-call','core',12,'{contacts}','{}','{Contacts/CRM tools/Calls}','{crm_calls}','twilio / voice provider',120),
 ('lead_capture','Instant lead capture','core',13,'{contacts}','{}','{Contacts/CRM tools/Leads,Settings/CRM/Lead capture}','{crm_leads,crm_lead_sources,platform_webform_submissions}',NULL,130),
 ('workflows','Workflow automation','core',14,'{}','{}','{Settings/Automations}','{crm_automation_workflows,crm_automation_runs,acct_workflows}',NULL,140),
 ('sequences','Email sequences','core',15,'{email_sync}','{}','{Marketing/Sequences}','{crm_sequences,crm_sequence_steps,crm_sequence_enrollments}',NULL,150),
 ('support','Customer support','core',16,'{contacts}','{support}','{Support,Settings/Support}','{support_tickets,support_teams,support_sla_policies,support_oncall_schedules}',NULL,160),
 ('backups','Data backups','core',18,'{}','{}','{Settings/System/Backups}','{platform_backups}','supabase pitr',180),
 ('customization','Customization & personalization','core',19,'{}','{settings}','{Settings/Customization,Settings/Modules}','{platform_custom_fields,platform_picklist_values,platform_terminology,platform_lenses}',NULL,190),
 ('reporting','Reporting & analytics','core',20,'{}','{}','{Reports,Settings/Analytics}','{platform_report_definitions,analytics_events}',NULL,200),
 ('integrations','Integrations','core',21,'{}','{}','{Settings/System/Integrations}','{integration_connections,integration_providers,integration_webhook_inbox}',NULL,210),
 ('webforms','Webforms','core',22,'{lead_capture}','{}','{Marketing/Webforms}','{platform_webforms,platform_webform_submissions}',NULL,220),
 ('appointments','Appointment scheduling','core',24,'{contacts}','{}','{Contacts/CRM tools/Appointments}','{crm_appointments,crm_services,crm_staff_availability}',NULL,240),
 ('marketing_automation','Marketing automation','core',25,'{contacts}','{marketing}','{Marketing}','{crm_campaigns,crm_campaign_members,marketing_suppressions}',NULL,250),
 ('calendar','Calendar management','core',28,'{}','{}','{Tasks/Calendar}','{platform_calendars,platform_calendar_events,platform_v_agenda}','google / outlook calendar',280),
 ('bookkeeping','Bookkeeping / accounting','core',27,'{}','{finance,business_tax,sales_tax}','{Finance,Business tax,Sales Tax,Settings/Accounting}','{acct_journal_entries,acct_ar_invoices,acct_ap_bills,acct_chart_of_accounts}',NULL,270),
 ('quotes','Sales quotes','core',29,'{bookkeeping}','{}','{Finance/Sales/Estimates}','{acct_estimates,acct_estimate_lines}',NULL,290),
 ('api','API','core',30,'{}','{}','{Settings/System/API tokens}','{api_keys,platform_idempotency_keys}',NULL,300),
 ('products','Inventory / products','core',31,'{}','{catalog,inventory}','{Catalog,Inventory,Settings/Catalog,Settings/Suppliers}','{products,erp_product_variants,erp_warehouses}',NULL,310),
 ('orders','Order management','core',32,'{products}','{orders}','{Orders,Settings/Operations}','{erp_orders,erp_order_lines}',NULL,320),
 ('documents','Document management','core',33,'{}','{}','{Contacts/CRM tools/Documents}','{crm_documents,crm_document_versions,acct_attachments}',NULL,330),
 ('custom_fields','Custom fields','core',34,'{}','{}','{Settings/Customization/Custom fields}','{platform_custom_fields,platform_custom_field_values}',NULL,340),
 ('activity','Activity logging','core',35,'{}','{}','{Contacts/CRM tools/Activity,Settings/Workspace/Activity log,Settings/System/Audit log,Settings/Privacy}','{crm_activity,platform_audit_events}',NULL,350),
 ('cms','CMS / website','core',36,'{}','{}','{Settings/Website,Marketing/CMS pages,Marketing/Content blocks,Marketing/Banners,Marketing/Popups,Catalog/Channels/Website / CMS}','{cms_pages,cms_navigation,cms_media_assets}',NULL,360),
 ('tasks','Tasks','core',NULL,'{}','{tasks}','{Tasks}','{crm_tasks}',NULL,370),
 ('tracked_records','Tracked records','core',NULL,'{contacts}','{}','{Contacts/CRM tools/Records,Settings/Customization/Record types}','{crm_dependents,crm_record_types,crm_record_events,crm_record_parties}',NULL,380),
 -- ---------- add-ons: agnostic but not every client wants them ----------
 ('routes','Route planning','addon',23,'{appointments}','{}','{Contacts/CRM tools/Routes}','{crm_routes,crm_route_stops}','google routes / mapbox',230),
 ('social_sync','Social media sync','addon',26,'{}','{social}','{Social Publishing,Settings/Marketing/Social channels}','{social_accounts,social_posts,social_post_targets}','meta / tiktok / x',260),
 ('payroll','Payroll','addon',NULL,'{bookkeeping}','{payroll}','{Payroll}','{acct_employees,acct_payroll_runs}',NULL,400),
 ('time','Time tracking','addon',NULL,'{}','{time}','{Time}','{acct_time_entries}',NULL,410),
 ('cap_table','Cap table','addon',NULL,'{bookkeeping}','{cap_table}','{Cap Table}','{cap_share_classes,cap_equity_events}',NULL,420),
 -- ---------- specialty ----------
 ('ecommerce','Ecommerce storefront','specialty',NULL,'{products,orders}','{}','{Catalog/Channels/Ecommerce,Orders/Returns/Customer return requests}','{commerce_carts,commerce_checkout_sessions,commerce_promotions,commerce_gift_cards}',NULL,500),
 ('design_studio','Design studio','specialty',NULL,'{ecommerce}','{studio}','{Studio,Catalog/Design Studio}','{design_files,design_assets,design_publications,product_canvas_templates}',NULL,510),
 ('marketplace','Marketplace','specialty',NULL,'{ecommerce}','{}','{Marketplace,Contacts/Seller relationships,Sales Tax/Marketplace remittance,Catalog/Products & Variants/Suppliers / vendors / sellers}','{sellers,seller_settlements,seller_stripe_accounts}','stripe connect',520),
 ('marketplace_trust_safety','Marketplace seller trust & safety','specialty',NULL,'{marketplace}','{}','{Marketplace/Trust & safety}','{seller_violations,seller_investigations,seller_appeals,seller_policy_enforcement,trust_policies}',NULL,530),
 ('ad_center','Ad center','specialty',NULL,'{}','{advertising}','{Advertising}','{ad_campaigns,ad_creatives,ad_placements,ad_events}',NULL,540),
 ('social_platform','Social platform (UGC)','specialty',NULL,'{}','{}','{Community}','{ugc_posts,ugc_comments,ugc_reactions,ugc_media}',NULL,550),
 ('social_trust_safety','Social trust & safety','specialty',NULL,'{social_platform}','{}','{Community/Trust & safety}','{ugc_reports,trust_policies}',NULL,560),
 ('healthcare','Healthcare (HIPAA)','specialty',NULL,'{tracked_records,appointments}','{}','{}','{crm_record_types,platform_sensitive_access_log,platform_data_classes}',NULL,600),
 ('financial_services','Financial services','specialty',NULL,'{tracked_records,deals}','{}','{}','{crm_record_types,crm_record_events}',NULL,610),
 ('real_estate','Real estate','specialty',NULL,'{tracked_records,deals}','{}','{}','{crm_record_types,crm_record_events}',NULL,620),
 ('auto_dealer','Auto dealer','specialty',NULL,'{tracked_records,deals,appointments}','{}','{}','{crm_record_types,crm_record_events}',NULL,630),
 ('edtech','EdTech','specialty',NULL,'{tracked_records}','{}','{}','{crm_record_types,crm_record_events}',NULL,640)
) v(code, name, kind, domain_no, depends_on, nav_modules, nav_prefixes, tables, integration, sort_order)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, domain_no = EXCLUDED.domain_no, depends_on = EXCLUDED.depends_on,
  nav_modules = EXCLUDED.nav_modules, nav_prefixes = EXCLUDED.nav_prefixes, tables = EXCLUDED.tables, integration = EXCLUDED.integration,
  sort_order = EXCLUDED.sort_order, updated_at = now();
UPDATE public.platform_modules SET requires_compliance = ARRAY['hipaa'] WHERE code = 'healthcare';

CREATE TABLE IF NOT EXISTS public.platform_tenant_modules (
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  module_code text NOT NULL REFERENCES public.platform_modules(code) ON DELETE CASCADE,
  enabled     boolean NOT NULL DEFAULT true,
  config      jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  enabled_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, module_code)
);

CREATE TABLE IF NOT EXISTS public.platform_packs (
  code                text PRIMARY KEY,
  name                text NOT NULL,
  kind                text NOT NULL CHECK (kind IN ('base','industry','business_model')),
  description         text,
  modules             text[] NOT NULL DEFAULT '{}',
  requires_compliance text[] NOT NULL DEFAULT '{}',
  version             integer NOT NULL DEFAULT 1,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.platform_pack_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_code  text NOT NULL REFERENCES public.platform_packs(code) ON DELETE CASCADE,
  item_type  text NOT NULL CHECK (item_type IN ('picklist','record_type','custom_field','pipeline','terminology','setting','data_class','scoring_rule')),
  item_key   text NOT NULL,
  payload    jsonb NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  UNIQUE (pack_code, item_type, item_key)
);
CREATE TABLE IF NOT EXISTS public.platform_tenant_packs (
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pack_code  text NOT NULL REFERENCES public.platform_packs(code) ON DELETE RESTRICT,
  version    integer NOT NULL,
  applied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  result     jsonb,
  PRIMARY KEY (tenant_id, pack_code)
);

-- ---------------------------------------------------------------------
-- pack catalog
-- ---------------------------------------------------------------------
INSERT INTO public.platform_packs(code, name, kind, description, modules, requires_compliance) VALUES
 ('core','Core','base','Every client: the 36 agnostic domains minus add-ons.',
   (SELECT array_agg(code ORDER BY sort_order) FROM public.platform_modules WHERE kind = 'core'), '{}'),
 ('services','Service business','business_model','Appointments, routes, quotes for any service business.', '{appointments,routes,quotes}', '{}'),
 ('pet_grooming','Pet grooming','industry','Keeps the original grooming vocabulary (pets, groom categories, matting surcharges).', '{appointments,tracked_records}', '{}'),
 ('ecommerce','Ecommerce','business_model','Storefront, carts, coupons, orders and inventory.', '{ecommerce,products,orders}', '{}'),
 ('design_studio','Design studio','business_model','Print-on-demand design tools and render queue.', '{ecommerce,design_studio}', '{}'),
 ('marketplace','Marketplace','business_model','Multi-seller marketplace with seller trust & safety and ad center.', '{ecommerce,marketplace,marketplace_trust_safety,ad_center}', '{}'),
 ('social_platform','Social platform','business_model','User-generated content with trust & safety and ad center.', '{social_platform,social_trust_safety,ad_center,social_sync}', '{}'),
 ('healthcare','Healthcare','industry','Patients (MRN), providers (NPI), visits; PHI controls. Needs a HIPAA deployment.', '{healthcare,tracked_records,appointments}', '{hipaa}'),
 ('financial_services','Financial services','industry','Policies (policy numbers), claims history, policyholders and beneficiaries.', '{financial_services,tracked_records,deals,pipelines}', '{}'),
 ('real_estate','Real estate','industry','Properties (MLS #, address, listing status), showings, buyer and listing pipelines.', '{real_estate,tracked_records,deals,pipelines,calendar}', '{}'),
 ('auto_dealer','Auto dealer','industry','Vehicles (validated VIN), service records, recalls, vehicle sales pipeline.', '{auto_dealer,tracked_records,deals,pipelines,appointments}', '{}'),
 ('edtech','EdTech','industry','Students (student ID), enrollment history, guardians, admissions pipeline.', '{edtech,tracked_records,deals,pipelines}', '{}')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, description = EXCLUDED.description, modules = EXCLUDED.modules,
  requires_compliance = EXCLUDED.requires_compliance, updated_at = now();

-- items: (pack, type, key, payload)
INSERT INTO public.platform_pack_items(pack_code, item_type, item_key, payload, sort_order)
SELECT p, t, k, j::jsonb, o FROM (VALUES
 -- core
 ('core','pipeline','Sales','{"is_default":true,"stages":[["New",10,"open"],["Qualified",25,"open"],["Proposal",50,"open"],["Negotiation",75,"open"],["Won",100,"won"],["Lost",0,"lost"]]}',10),
 ('core','scoring_rule','has_email','{"field":"email","operator":"is_set","points":10}',20),
 ('core','scoring_rule','has_phone','{"field":"phone","operator":"is_set","points":10}',21),
 ('core','scoring_rule','inbound','{"field":"lead_type","operator":"eq","value":"inbound","points":20}',22),
 ('core','scoring_rule','engaged_7d','{"field":"activity_count_7d","operator":"gt","value":"2","points":25}',23),
 ('core','scoring_rule','stale','{"field":"days_since_activity","operator":"gt","value":"30","points":-20}',24),
 -- pet grooming
 ('pet_grooming','picklist','service_category','{"values":["full_groom","bath_and_brush"]}',10),
 ('pet_grooming','picklist','surcharge_type','{"values":["severe_matting","senior_pet","aggressive_pet","de_shedding","flea_treatment"]}',11),
 ('pet_grooming','picklist','refund_reason','{"values":["pet_health"]}',12),
 ('pet_grooming','picklist','duplicate_entity','{"values":["pet"]}',13),
 ('pet_grooming','picklist','dependent_type','{"values":["pet"]}',14),
 ('pet_grooming','record_type','pet','{"label":"Pet","plural_label":"Pets","dependent_type":"pet","statuses":["active","inactive","deceased"],"party_roles":["owner"],"event_types":["groom","vaccination","incident","note"]}',20),
 ('pet_grooming','custom_field','crm_dependents.breed','{"label":"Breed","field_type":"text","record_type_code":"pet"}',30),
 ('pet_grooming','custom_field','crm_dependents.weight_lbs','{"label":"Weight (lbs)","field_type":"number","record_type_code":"pet"}',31),
 ('pet_grooming','custom_field','crm_dependents.rabies_expires','{"label":"Rabies vaccine expires","field_type":"date","record_type_code":"pet"}',32),
 ('pet_grooming','terminology','dependent','{"singular":"Pet","plural":"Pets"}',40),
 -- healthcare
 ('healthcare','picklist','dependent_type','{"values":["patient"]}',10),
 ('healthcare','picklist','onboarding_type','{"values":["pharmacy","healthcare_provider"]}',11),
 ('healthcare','record_type','patient','{"label":"Patient chart","plural_label":"Patient charts","dependent_type":"patient","identifier_label":"MRN","identifier_required":true,"statuses":["active","inactive","discharged","deceased"],"party_roles":["patient","guardian","guarantor","emergency_contact"],"event_types":["visit","referral","lab_result","prescription","insurance_verified","note"],"sensitivity":"phi"}',20),
 ('healthcare','custom_field','crm_staff.npi','{"label":"NPI","field_type":"text","validator":"npi","is_unique":true,"help_text":"10-digit National Provider Identifier"}',30),
 ('healthcare','custom_field','crm_staff.license_number','{"label":"License number","field_type":"text"}',31),
 ('healthcare','custom_field','crm_staff.license_state','{"label":"License state","field_type":"text","validation_pattern":"^[A-Z]{2}$"}',32),
 ('healthcare','custom_field','crm_staff.taxonomy_code','{"label":"Taxonomy code","field_type":"text","validation_pattern":"^[0-9A-Z]{10}$"}',33),
 ('healthcare','custom_field','crm_staff.specialty','{"label":"Specialty","field_type":"text"}',34),
 ('healthcare','custom_field','crm_dependents.insurance_payer','{"label":"Insurance payer","field_type":"text","record_type_code":"patient","sensitivity":"phi"}',35),
 ('healthcare','custom_field','crm_dependents.insurance_member_id','{"label":"Member ID","field_type":"text","record_type_code":"patient","sensitivity":"phi"}',36),
 ('healthcare','custom_field','crm_dependents.primary_provider_npi','{"label":"Primary provider NPI","field_type":"text","validator":"npi","record_type_code":"patient","sensitivity":"phi"}',37),
 ('healthcare','terminology','customer','{"singular":"Patient","plural":"Patients"}',40),
 ('healthcare','terminology','appointment','{"singular":"Visit","plural":"Visits"}',41),
 ('healthcare','terminology','staff','{"singular":"Provider","plural":"Providers"}',42),
 ('healthcare','terminology','dependent','{"singular":"Chart","plural":"Charts"}',43),
 ('healthcare','pipeline','Patient intake','{"stages":[["Referral received",10,"open"],["Insurance verified",40,"open"],["Scheduled",70,"open"],["Seen",100,"won"],["Declined",0,"lost"]]}',50),
 ('healthcare','data_class','crm_customers.date_of_birth','{"data_class":"phi","mask":"full"}',60),
 ('healthcare','data_class','crm_dependents.notes','{"data_class":"phi","mask":"full"}',61),
 ('healthcare','data_class','crm_dependents.identifier','{"data_class":"phi","mask":"partial"}',62),
 ('healthcare','data_class','crm_appointments.customer_notes','{"data_class":"phi","mask":"full"}',63),
 ('healthcare','data_class','crm_appointments.internal_notes','{"data_class":"phi","mask":"full"}',64),
 ('healthcare','setting','compliance','{"hipaa":true,"session_timeout_minutes":15,"require_mfa":true,"log_phi_access":true}',70),
 -- financial services
 ('financial_services','picklist','dependent_type','{"values":["policy"]}',10),
 ('financial_services','picklist','onboarding_type','{"values":["agency"]}',11),
 ('financial_services','record_type','policy','{"label":"Policy","plural_label":"Policies","dependent_type":"policy","identifier_label":"Policy number","identifier_required":true,"statuses":["quoted","bound","active","lapsed","cancelled","expired","renewed"],"default_status":"quoted","party_roles":["policyholder","insured","beneficiary","payer"],"event_types":["claim_filed","claim_paid","claim_denied","endorsement","renewal","payment_missed","note"],"sensitivity":"financial"}',20),
 ('financial_services','custom_field','crm_dependents.carrier','{"label":"Carrier","field_type":"text","record_type_code":"policy"}',30),
 ('financial_services','custom_field','crm_dependents.line_of_business','{"label":"Line of business","field_type":"select","record_type_code":"policy","options":["auto","home","life","health","commercial","umbrella","annuity"]}',31),
 ('financial_services','custom_field','crm_dependents.premium','{"label":"Annual premium","field_type":"currency","record_type_code":"policy"}',32),
 ('financial_services','custom_field','crm_dependents.effective_date','{"label":"Effective date","field_type":"date","record_type_code":"policy"}',33),
 ('financial_services','custom_field','crm_dependents.expiration_date','{"label":"Expiration date","field_type":"date","record_type_code":"policy"}',34),
 ('financial_services','terminology','customer','{"singular":"Client","plural":"Clients"}',40),
 ('financial_services','pipeline','New business','{"is_default":true,"stages":[["Lead",10,"open"],["Needs analysis",25,"open"],["Quoted",50,"open"],["Application",70,"open"],["Underwriting",85,"open"],["Bound",100,"won"],["Lost",0,"lost"]]}',50),
 ('financial_services','pipeline','Renewals','{"stages":[["Up for renewal",50,"open"],["Re-quoted",75,"open"],["Renewed",100,"won"],["Lapsed",0,"lost"]]}',51),
 -- real estate
 ('real_estate','record_type','property','{"label":"Property","plural_label":"Properties","dependent_type":"property","identifier_label":"MLS #","statuses":["coming_soon","active","pending","under_contract","sold","withdrawn","expired","off_market"],"default_status":"coming_soon","party_roles":["seller","buyer","landlord","tenant","listing_agent","buyer_agent"],"event_types":["listed","price_change","showing","open_house","offer","inspection","closing","note"]}',20),
 ('real_estate','custom_field','crm_dependents.list_price','{"label":"List price","field_type":"currency","record_type_code":"property"}',30),
 ('real_estate','custom_field','crm_dependents.beds','{"label":"Beds","field_type":"number","record_type_code":"property"}',31),
 ('real_estate','custom_field','crm_dependents.baths','{"label":"Baths","field_type":"number","record_type_code":"property"}',32),
 ('real_estate','custom_field','crm_dependents.sqft','{"label":"Square feet","field_type":"number","record_type_code":"property"}',33),
 ('real_estate','custom_field','crm_dependents.year_built','{"label":"Year built","field_type":"number","record_type_code":"property"}',34),
 ('real_estate','custom_field','crm_dependents.parcel_number','{"label":"Parcel / APN","field_type":"text","record_type_code":"property"}',35),
 ('real_estate','terminology','customer','{"singular":"Client","plural":"Clients"}',40),
 ('real_estate','terminology','dependent','{"singular":"Property","plural":"Properties"}',41),
 ('real_estate','pipeline','Buyers','{"is_default":true,"stages":[["New",10,"open"],["Showing",30,"open"],["Offer made",60,"open"],["Under contract",85,"open"],["Closed",100,"won"],["Lost",0,"lost"]]}',50),
 ('real_estate','pipeline','Listings','{"stages":[["Appointment set",10,"open"],["Listing signed",40,"open"],["Active",60,"open"],["Under contract",85,"open"],["Sold",100,"won"],["Withdrawn",0,"lost"]]}',51),
 -- auto dealer
 ('auto_dealer','picklist','onboarding_type','{"values":["dealership"]}',10),
 ('auto_dealer','record_type','vehicle','{"label":"Vehicle","plural_label":"Vehicles","dependent_type":"vehicle","identifier_label":"VIN","identifier_validator":"vin","identifier_required":true,"statuses":["in_stock","reserved","sold","delivered","customer_owned","in_service","wholesaled"],"default_status":"in_stock","party_roles":["owner","co_buyer","trade_in_owner"],"event_types":["service_visit","recall","warranty_claim","test_drive","sale","trade_in","note"]}',20),
 ('auto_dealer','custom_field','crm_dependents.make','{"label":"Make","field_type":"text","record_type_code":"vehicle"}',30),
 ('auto_dealer','custom_field','crm_dependents.model','{"label":"Model","field_type":"text","record_type_code":"vehicle"}',31),
 ('auto_dealer','custom_field','crm_dependents.model_year','{"label":"Year","field_type":"number","record_type_code":"vehicle"}',32),
 ('auto_dealer','custom_field','crm_dependents.trim','{"label":"Trim","field_type":"text","record_type_code":"vehicle"}',33),
 ('auto_dealer','custom_field','crm_dependents.mileage','{"label":"Mileage","field_type":"number","record_type_code":"vehicle"}',34),
 ('auto_dealer','custom_field','crm_dependents.stock_number','{"label":"Stock #","field_type":"text","record_type_code":"vehicle","is_unique":true}',35),
 ('auto_dealer','terminology','dependent','{"singular":"Vehicle","plural":"Vehicles"}',40),
 ('auto_dealer','pipeline','Vehicle sales','{"is_default":true,"stages":[["Up",10,"open"],["Test drive",30,"open"],["Desking",50,"open"],["F&I",80,"open"],["Delivered",100,"won"],["Lost",0,"lost"]]}',50),
 ('auto_dealer','pipeline','Service','{"stages":[["Appointment",20,"open"],["Write-up",40,"open"],["In shop",60,"open"],["Ready",90,"open"],["Closed RO",100,"won"],["Declined",0,"lost"]]}',51),
 -- edtech
 ('edtech','picklist','dependent_type','{"values":["student"]}',10),
 ('edtech','picklist','onboarding_type','{"values":["school"]}',11),
 ('edtech','record_type','student','{"label":"Student","plural_label":"Students","dependent_type":"student","identifier_label":"Student ID","identifier_required":true,"statuses":["applicant","admitted","enrolled","on_leave","withdrawn","graduated"],"default_status":"applicant","party_roles":["student","guardian","payer"],"event_types":["enrollment","course_added","course_dropped","grade_posted","attendance","completion","note"],"sensitivity":"pii"}',20),
 ('edtech','custom_field','crm_dependents.program','{"label":"Program","field_type":"text","record_type_code":"student"}',30),
 ('edtech','custom_field','crm_dependents.cohort','{"label":"Cohort / term","field_type":"text","record_type_code":"student"}',31),
 ('edtech','custom_field','crm_dependents.grade_level','{"label":"Grade level","field_type":"text","record_type_code":"student"}',32),
 ('edtech','custom_field','crm_dependents.expected_completion','{"label":"Expected completion","field_type":"date","record_type_code":"student"}',33),
 ('edtech','terminology','customer','{"singular":"Family","plural":"Families"}',40),
 ('edtech','terminology','dependent','{"singular":"Student","plural":"Students"}',41),
 ('edtech','pipeline','Admissions','{"is_default":true,"stages":[["Inquiry",10,"open"],["Application",30,"open"],["Interview",50,"open"],["Accepted",80,"open"],["Enrolled",100,"won"],["Lost",0,"lost"]]}',50),
 ('edtech','setting','compliance','{"ferpa":true,"coppa_under_13":true}',60)
) v(p, t, k, j, o)
ON CONFLICT (pack_code, item_type, item_key) DO UPDATE SET payload = EXCLUDED.payload, sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------
-- functions
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform__can_admin(p_tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT auth.uid() IS NULL AND current_user IN ('postgres','service_role','supabase_admin')
      OR public.platform_is_admin() OR public.platform_is_tenant_admin(p_tenant) $$;

CREATE OR REPLACE FUNCTION public.platform_module_enabled(p_tenant uuid, p_module text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT coalesce((SELECT enabled FROM public.platform_tenant_modules WHERE tenant_id = p_tenant AND module_code = p_module), false) $$;

CREATE OR REPLACE FUNCTION public.platform_enable_module(p_tenant uuid, p_module text, p_enabled boolean DEFAULT true) RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE m record; d text; done text[] := '{}'; dep_by text;
BEGIN
  IF NOT public.platform__can_admin(p_tenant) THEN RAISE EXCEPTION 'only workspace admins can change modules'; END IF;
  SELECT * INTO m FROM public.platform_modules WHERE code = p_module;
  IF m.code IS NULL THEN RAISE EXCEPTION 'unknown module %', p_module; END IF;
  IF p_enabled THEN
    FOREACH d IN ARRAY m.requires_compliance LOOP
      IF NOT public.platform_deployment_allows(d) THEN
        RAISE EXCEPTION 'module % needs a % deployment; provision this client on a dedicated % project', m.name, upper(d), upper(d);
      END IF;
    END LOOP;
    FOREACH d IN ARRAY m.depends_on LOOP
      IF NOT public.platform_module_enabled(p_tenant, d) THEN done := done || public.platform_enable_module(p_tenant, d, true); END IF;
    END LOOP;
  ELSE
    SELECT string_agg(x.name, ', ') INTO dep_by FROM public.platform_modules x
      JOIN public.platform_tenant_modules t ON t.module_code = x.code AND t.tenant_id = p_tenant AND t.enabled
     WHERE p_module = ANY (x.depends_on);
    IF dep_by IS NOT NULL THEN RAISE EXCEPTION 'turn off % first (they need %)', dep_by, m.name; END IF;
  END IF;
  INSERT INTO public.platform_tenant_modules(tenant_id, module_code, enabled, enabled_by)
  VALUES (p_tenant, p_module, p_enabled, auth.uid())
  ON CONFLICT (tenant_id, module_code) DO UPDATE SET enabled = EXCLUDED.enabled, enabled_by = EXCLUDED.enabled_by, enabled_at = now();
  RETURN done || p_module;
END $$;

CREATE OR REPLACE FUNCTION public.platform_apply_pack(p_tenant uuid, p_pack text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE pk record; it record; m text; c text; n jsonb := '{}'::jsonb; v text; rt uuid; pl uuid; st jsonb; i int; ent text; fkey text;
        cnt int;
BEGIN
  IF NOT public.platform__can_admin(p_tenant) THEN RAISE EXCEPTION 'only workspace admins can apply packs'; END IF;
  SELECT * INTO pk FROM public.platform_packs WHERE code = p_pack;
  IF pk.code IS NULL THEN RAISE EXCEPTION 'unknown pack %', p_pack; END IF;
  FOREACH c IN ARRAY pk.requires_compliance LOOP
    IF NOT public.platform_deployment_allows(c) THEN
      RAISE EXCEPTION 'pack % needs a % deployment (Supabase HIPAA add-on + signed BAA + High Compliance project). Provision this client there.',
        pk.name, upper(c);
    END IF;
  END LOOP;
  FOREACH m IN ARRAY pk.modules LOOP PERFORM public.platform_enable_module(p_tenant, m, true); END LOOP;
  n := jsonb_build_object('modules', to_jsonb(pk.modules));

  FOR it IN SELECT * FROM public.platform_pack_items WHERE pack_code = p_pack ORDER BY sort_order, item_key LOOP
    CASE it.item_type
    WHEN 'picklist' THEN
      FOR v IN SELECT jsonb_array_elements_text(it.payload -> 'values') LOOP
        INSERT INTO public.platform_picklist_values(tenant_id, list_code, value, label, sort_order, pack_code)
        SELECT p_tenant, it.item_key, v, coalesce((SELECT label FROM public.platform_picklist_values g WHERE g.tenant_id IS NULL AND g.list_code = it.item_key AND g.value = v),
                                                  initcap(replace(v, '_', ' '))), 200, p_pack
        ON CONFLICT DO NOTHING;
        UPDATE public.platform_picklist_values SET is_active = true WHERE tenant_id = p_tenant AND list_code = it.item_key AND value = v;
      END LOOP;
    WHEN 'record_type' THEN
      INSERT INTO public.platform_picklist_values(tenant_id, list_code, value, label, sort_order, pack_code)
      VALUES (p_tenant, 'dependent_type', coalesce(it.payload ->> 'dependent_type', 'other'), initcap(coalesce(it.payload ->> 'dependent_type', 'other')), 200, p_pack)
      ON CONFLICT DO NOTHING;
      INSERT INTO public.crm_record_types(tenant_id, code, label, plural_label, dependent_type, identifier_label, identifier_pattern, identifier_validator,
                                          identifier_required, statuses, default_status, party_roles, event_types, sensitivity, pack_code)
      VALUES (p_tenant, it.item_key, it.payload ->> 'label', it.payload ->> 'plural_label', coalesce(it.payload ->> 'dependent_type', 'other'),
              it.payload ->> 'identifier_label', it.payload ->> 'identifier_pattern', it.payload ->> 'identifier_validator',
              coalesce((it.payload ->> 'identifier_required')::boolean, false),
              coalesce(ARRAY(SELECT jsonb_array_elements_text(it.payload -> 'statuses')), ARRAY['active','inactive']),
              coalesce(it.payload ->> 'default_status', (it.payload -> 'statuses') ->> 0, 'active'),
              coalesce(ARRAY(SELECT jsonb_array_elements_text(it.payload -> 'party_roles')), ARRAY['owner']),
              coalesce(ARRAY(SELECT jsonb_array_elements_text(it.payload -> 'event_types')), ARRAY['note']),
              coalesce(it.payload ->> 'sensitivity', 'normal'), p_pack)
      ON CONFLICT (tenant_id, code) DO UPDATE SET label = EXCLUDED.label, plural_label = EXCLUDED.plural_label,
        identifier_label = EXCLUDED.identifier_label, identifier_pattern = EXCLUDED.identifier_pattern, identifier_validator = EXCLUDED.identifier_validator,
        identifier_required = EXCLUDED.identifier_required,
        statuses = (SELECT array_agg(DISTINCT s) FROM unnest(public.crm_record_types.statuses || EXCLUDED.statuses) s),   -- never remove a status in use
        party_roles = EXCLUDED.party_roles, event_types = EXCLUDED.event_types, sensitivity = EXCLUDED.sensitivity, updated_at = now();
    WHEN 'custom_field' THEN
      ent := split_part(it.item_key, '.', 1); fkey := split_part(it.item_key, '.', 2);
      INSERT INTO public.platform_custom_fields(tenant_id, entity_type, field_key, label, field_type, options, is_required, sort_order, is_active,
                                                sensitivity, validation_pattern, validator, is_unique, record_type_code, help_text, pack_code)
      VALUES (p_tenant, ent, fkey, it.payload ->> 'label', coalesce(it.payload ->> 'field_type', 'text'), coalesce(it.payload -> 'options', '[]'::jsonb),
              coalesce((it.payload ->> 'is_required')::boolean, false), it.sort_order, true, coalesce(it.payload ->> 'sensitivity', 'normal'),
              it.payload ->> 'validation_pattern', it.payload ->> 'validator', coalesce((it.payload ->> 'is_unique')::boolean, false),
              it.payload ->> 'record_type_code', it.payload ->> 'help_text', p_pack)
      ON CONFLICT (tenant_id, entity_type, field_key) DO UPDATE SET label = EXCLUDED.label, options = EXCLUDED.options,
        validation_pattern = EXCLUDED.validation_pattern, validator = EXCLUDED.validator, is_unique = EXCLUDED.is_unique,
        record_type_code = EXCLUDED.record_type_code, help_text = EXCLUDED.help_text, sensitivity = EXCLUDED.sensitivity, is_active = true, updated_at = now();
    WHEN 'pipeline' THEN
      INSERT INTO public.crm_pipelines(tenant_id, name, pack_code) VALUES (p_tenant, it.item_key, p_pack)
      ON CONFLICT (tenant_id, name) DO UPDATE SET is_active = true, updated_at = now() RETURNING id INTO pl;
      IF coalesce((it.payload ->> 'is_default')::boolean, false) THEN
        UPDATE public.crm_pipelines SET is_default = false WHERE tenant_id = p_tenant AND is_default AND id <> pl;
        UPDATE public.crm_pipelines SET is_default = true WHERE id = pl;
      END IF;
      i := 0;
      FOR st IN SELECT * FROM jsonb_array_elements(it.payload -> 'stages') LOOP
        i := i + 10;
        INSERT INTO public.crm_pipeline_stages(tenant_id, pipeline_id, name, sort_order, probability, stage_kind)
        VALUES (p_tenant, pl, st ->> 0, i, (st ->> 1)::numeric, st ->> 2)
        ON CONFLICT (pipeline_id, name) DO NOTHING;     -- never reorder or delete stages the client edited
      END LOOP;
    WHEN 'terminology' THEN
      INSERT INTO public.platform_terminology(tenant_id, term_key, singular, plural, pack_code)
      VALUES (p_tenant, it.item_key, it.payload ->> 'singular', it.payload ->> 'plural', p_pack)
      ON CONFLICT (tenant_id, term_key) DO NOTHING;     -- a label the client changed wins
    WHEN 'setting' THEN
      UPDATE public.tenants SET settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(it.item_key,
             coalesce(settings -> it.item_key, '{}'::jsonb) || it.payload), updated_at = now() WHERE id = p_tenant;
    WHEN 'data_class' THEN
      INSERT INTO public.platform_data_classes(table_name, column_name, data_class, mask, notes)
      VALUES (split_part(it.item_key, '.', 1), split_part(it.item_key, '.', 2), it.payload ->> 'data_class', coalesce(it.payload ->> 'mask', 'partial'), 'pack ' || p_pack)
      ON CONFLICT (table_name, column_name) DO UPDATE SET data_class = EXCLUDED.data_class, mask = EXCLUDED.mask, notes = EXCLUDED.notes;
    WHEN 'scoring_rule' THEN
      IF NOT EXISTS (SELECT 1 FROM public.crm_lead_scoring_rules WHERE tenant_id = p_tenant AND name = it.item_key) THEN
        INSERT INTO public.crm_lead_scoring_rules(tenant_id, name, field, operator, value, points)
        VALUES (p_tenant, it.item_key, it.payload ->> 'field', it.payload ->> 'operator', it.payload ->> 'value', (it.payload ->> 'points')::int);
      END IF;
    END CASE;
    n := jsonb_set(n, ARRAY[it.item_type], to_jsonb(coalesce((n ->> it.item_type)::int, 0) + 1));
  END LOOP;

  INSERT INTO public.platform_tenant_packs(tenant_id, pack_code, version, applied_by, result)
  VALUES (p_tenant, p_pack, pk.version, auth.uid(), n)
  ON CONFLICT (tenant_id, pack_code) DO UPDATE SET version = EXCLUDED.version, applied_by = EXCLUDED.applied_by, applied_at = now(), result = EXCLUDED.result;
  RETURN n;
END $$;

-- one call per new client
CREATE OR REPLACE FUNCTION public.platform_provision_tenant(p_name text, p_slug text, p_packs text[] DEFAULT ARRAY['core'],
  p_owner_email text DEFAULT NULL, p_type text DEFAULT 'seller') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE t uuid; p text; res jsonb := '{}'::jsonb; tok text; inv uuid;
BEGIN
  IF NOT (public.platform_is_admin() OR (auth.uid() IS NULL AND current_user IN ('postgres','service_role','supabase_admin'))) THEN
    RAISE EXCEPTION 'only platform admins can provision clients';
  END IF;
  -- fail before creating anything if a pack can't be applied here
  FOREACH p IN ARRAY p_packs LOOP
    IF NOT EXISTS (SELECT 1 FROM public.platform_packs WHERE code = p) THEN RAISE EXCEPTION 'unknown pack %', p; END IF;
    IF EXISTS (SELECT 1 FROM public.platform_packs k, unnest(k.requires_compliance) c WHERE k.code = p AND NOT public.platform_deployment_allows(c)) THEN
      RAISE EXCEPTION 'pack % needs a compliance deployment this database is not', p;
    END IF;
  END LOOP;
  INSERT INTO public.tenants(name, slug, type, tenant_kind, status) VALUES (p_name, p_slug, p_type, 'organization', 'active') RETURNING id INTO t;
  IF NOT ('core' = ANY (p_packs)) THEN p_packs := ARRAY['core'] || p_packs; END IF;
  FOREACH p IN ARRAY p_packs LOOP res := res || jsonb_build_object(p, public.platform_apply_pack(t, p)); END LOOP;
  PERFORM public.crm_ensure_default_pipeline(t);
  IF p_owner_email IS NOT NULL THEN
    tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.platform_member_invitations(tenant_id, email, role, token_hash, invited_by)
    VALUES (t, lower(btrim(p_owner_email)), 'owner', encode(sha256(convert_to(tok, 'UTF8')), 'hex'), auth.uid()) RETURNING id INTO inv;
    INSERT INTO public.platform_outbox(tenant_id, channel, event_type, aggregate_type, aggregate_ref, payload, status, attempts, available_at, source_table, source_id)
    VALUES (t, 'email', 'platform.invitation.created', 'platform_member_invitations', inv::text,
            jsonb_build_object('email', lower(btrim(p_owner_email)), 'role', 'owner', 'token', tok), 'pending', 0, now(), 'platform_member_invitations', inv::text);
  END IF;
  RETURN jsonb_build_object('tenant_id', t, 'packs', res, 'owner_invite_token', tok);
END $$;

-- what a client sees: a nav path is owned by the module with the longest matching prefix,
-- otherwise by the modules that own its nav section
CREATE OR REPLACE FUNCTION public.platform_tenant_nav(p_tenant uuid)
RETURNS TABLE(feature_path text, module_code text, is_implemented boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  WITH own AS (
    SELECT f.feature_path, f.is_implemented,
           (SELECT m.code FROM public.platform_modules m, unnest(m.nav_prefixes) px
             WHERE f.feature_path = px OR f.feature_path LIKE px || '/%' ORDER BY length(px) DESC, m.sort_order LIMIT 1) AS by_prefix,
           f.module AS nav_module
      FROM public.platform_feature_tree_coverage f)
  SELECT o.feature_path, coalesce(o.by_prefix, (SELECT m.code FROM public.platform_modules m WHERE o.nav_module = ANY (m.nav_modules) ORDER BY m.sort_order LIMIT 1)),
         o.is_implemented
    FROM own o
   WHERE public.platform_is_tenant_member(p_tenant)
     AND (CASE WHEN o.by_prefix IS NOT NULL THEN public.platform_module_enabled(p_tenant, o.by_prefix)
               ELSE EXISTS (SELECT 1 FROM public.platform_modules m WHERE o.nav_module = ANY (m.nav_modules) AND public.platform_module_enabled(p_tenant, m.code)) END)
   ORDER BY 1 $$;

CREATE OR REPLACE FUNCTION public.platform_tenant_actions(p_tenant uuid)
RETURNS TABLE(action_code text, display_name text, module text, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT a.action_code, a.display_name, a.module, a.kind FROM public.platform_quick_action_registry a
   WHERE a.is_active AND public.platform_is_tenant_member(p_tenant)
     AND (a.module = 'platform' OR EXISTS (SELECT 1 FROM public.platform_modules m
            WHERE (a.module = ANY (m.nav_modules) OR a.module = m.code) AND public.platform_module_enabled(p_tenant, m.code)))
   ORDER BY a.sort_order $$;

CREATE OR REPLACE FUNCTION public.platform_module_coverage()
RETURNS TABLE(code text, name text, kind text, domain_no int, tables_expected int, tables_missing text[], integration text, status text)
LANGUAGE sql STABLE SET search_path = public, pg_catalog AS $$
  SELECT m.code, m.name, m.kind, m.domain_no, cardinality(m.tables),
         ARRAY(SELECT t FROM unnest(m.tables) t WHERE to_regclass('public.' || t) IS NULL),
         m.integration,
         CASE WHEN EXISTS (SELECT 1 FROM unnest(m.tables) t WHERE to_regclass('public.' || t) IS NULL) THEN 'missing_tables'
              WHEN m.integration IS NOT NULL THEN 'ready_needs_provider' ELSE 'ready' END
    FROM public.platform_modules m ORDER BY m.sort_order $$;

-- existing tenants: everything they can already reach stays on
DO $$
DECLARE t record; used_grooming boolean;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    IF NOT EXISTS (SELECT 1 FROM public.platform_tenant_packs WHERE tenant_id = t.id AND pack_code = 'core') THEN
      PERFORM public.platform_apply_pack(t.id, 'core');
      INSERT INTO public.platform_tenant_modules(tenant_id, module_code, enabled)
      SELECT t.id, code, true FROM public.platform_modules
       WHERE kind <> 'specialty'
          -- business-model modules the current platform already runs (storefront, studio, marketplace, ads, UGC);
          -- industry packs (healthcare, insurance, real estate, auto, edtech) stay off until a client asks for them
          OR code IN ('ecommerce','design_studio','marketplace','marketplace_trust_safety','ad_center','social_platform','social_trust_safety')
      ON CONFLICT DO NOTHING;
      used_grooming := EXISTS (SELECT 1 FROM public.crm_services WHERE tenant_id = t.id AND service_category IN ('full_groom','bath_and_brush'))
                    OR EXISTS (SELECT 1 FROM public.crm_dependents WHERE tenant_id = t.id AND dependent_type = 'pet');
      IF used_grooming THEN PERFORM public.platform_apply_pack(t.id, 'pet_grooming'); END IF;
      PERFORM unify.log('06d', t.id::text, 'tenant_modules_backfilled', CASE WHEN used_grooming THEN 'core + pet_grooming' ELSE 'core' END);
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- security
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_modules','platform_packs','platform_pack_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_read_all ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_read_all ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['platform_tenant_modules','platform_tenant_packs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS unify_tenant_read ON public.%I', t);
    EXECUTE format('CREATE POLICY unify_tenant_read ON public.%I FOR SELECT TO authenticated USING (public.platform_is_tenant_member(tenant_id))', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
  END LOOP;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['platform_module_enabled','platform_enable_module','platform_apply_pack','platform_tenant_nav','platform_tenant_actions',
                           'platform_module_coverage'] LOOP
    EXECUTE (SELECT string_agg(format('GRANT EXECUTE ON FUNCTION %s TO authenticated', p.oid::regprocedure), '; ')
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['platform_provision_tenant'] LOOP     -- platform admins call it through the admin app; it checks platform_is_admin()
    EXECUTE (SELECT string_agg(format('GRANT EXECUTE ON FUNCTION %s TO authenticated', p.oid::regprocedure), '; ')
               FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = f);
  END LOOP;
  EXECUTE (SELECT string_agg(format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', p.oid::regprocedure), '; ')
             FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'platform__can_admin');
END $$;

-- 06c + 06d entry points: signed-in users only (Supabase grants anon EXECUTE on new functions by default).
-- The one public door is the webform submit. Cron/internal functions stay closed to everyone.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace
              AND p.proname IN ('platform_deployment_allows','platform_picklist_ok','platform_validate_identifier','platform_get_custom_fields',
                                'platform_set_custom_fields','crm_ensure_default_pipeline','crm_move_deal','crm_convert_lead','crm_score_lead',
                                'crm_start_call','platform_send_email','crm_enroll_in_sequence','crm_build_route','platform_log_access',
                                'platform_module_enabled','platform_enable_module','platform_apply_pack','platform_provision_tenant',
                                'platform_tenant_nav','platform_tenant_actions','platform_module_coverage','platform_submit_webform') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    IF r.proname = 'platform_submit_webform' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig); END IF;
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
            WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('crm_run_sequences','platform__can_admin') LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

INSERT INTO public.platform_table_access_overrides(table_name, access_mode, notes)
SELECT t, 'global_read', 'unify 06d: global reference data, readable by every signed-in user'
  FROM (VALUES ('platform_modules'),('platform_packs'),('platform_pack_items')) v(t)
 WHERE NOT EXISTS (SELECT 1 FROM public.platform_table_access_overrides o WHERE o.table_name = v.t);
SELECT count(*) AS tables_secured FROM public.platform__apply_app_security();
SELECT public.platform_classify_tables() AS tables_classified;
COMMIT;

-- report
SELECT kind, count(*) AS modules, count(*) FILTER (WHERE status = 'missing_tables') AS missing,
       count(*) FILTER (WHERE status = 'ready_needs_provider') AS needs_provider
  FROM public.platform_module_coverage() GROUP BY kind ORDER BY kind;
SELECT code, tables_missing FROM public.platform_module_coverage() WHERE status = 'missing_tables';

-- canonical step ledger
SELECT unify.done('320');
