# Portal ship scope — AAPawZ on the one design (started 2026-11-11)

Sunny's direction (2026-11-11): stop patching architecture. The Supabase exit folds
into the ERP consolidation; all portals ride one design (role views on one shell,
the /ads pattern); the customer portal is cleaned up to look like Unsaid.
ERP migrations/standard = Sunny's work; Muse's side = AAPawZ plumbing + census.

## What exists today (counted 2026-11-11, ~/workspace/aapawz/repo/src/app)

- (portals): 505 pages — admin 170, seller 201, customer 66, vet 32, employee 29, telemed 7
- (adportal) /ads: 313 pages — the role-view pattern Sunny cites as the model
- (affiliate): 2 pages; public/storefront: 12 pages
- API routes: 1,284
- Sunny's verdict on this mass: views without a real accounting system underneath
  mean nothing; many of these views are one view in the ERP.

## The delta (Sunny, 2026-11-11)

- Between the ERP core and All About Pawz there is essentially ONE module of
  difference: appointments (pet-care vertical).
- That module was built wrong: booking → CRM → appointment chained as three
  things. They are one record through lifecycle stages (same doctrine as the
  buyer landing in CRM at a lifecycle stage). The module rebuild treats them
  as one canonical record.

## Workstreams the scope must price

1. Portal-by-portal mapping: each AAPawZ portal surface → ERP core domain it
   duplicates, collapses into, or extends. (ERP-side read against the
   dealerpartners/ERP copy is the next pass.)
2. The appointments module as the single vertical delta, remodeled as one
   record: booking = CRM entry = appointment, lifecycle stages.
3. Accounting: name the real accounting functions the business needs
   (the gap Sunny called out) and where they live in the ERP core.
4. Supabase exit (inside the consolidation, no separate patch): database move
   (most app data access is direct SQL — connection-string work), the REST/auth
   rind, and the storage copy-out (32 files reference Supabase storage; the
   live homepage serves hero images from it). Paid plan canceled 2026-11-11;
   free tier continues; renewal ~Nov 13-14 — no cutover rush.
5. "Ship" per portal = the user-level journeys a person in that role must be
   able to complete end to end — to be enumerated per portal in the next pass.

## Architecture rethink (Sunny, 2026-11-11 20:11 CST)

Sunny: "We've scaled this the wrong way" — each thing should be a module,
probably a monorepo serving the modules; the SaaS program is shaky because
modules cannot be assigned. Model stack: SaaS → marketplace → marketplace
serving providers, educators, sellers. Unbuilt: enterprise view for providers
and for course writers.

Evidence from his own schema export (schema.zip, 2026-11-11): 33 domains,
902 tables — the finance spine (11–19) and 31_lms already exist as schema;
assignment tables exist in embryo (platform_module_permissions,
portal_module_permissions, commerce_modules, subscription_plans).
The mismatch: the DATA model is modular; the APPLICATION (505 portal pages,
1,284 API routes, cross-importing monolith) is not packaged as modules, so
there is nothing clean to assign to a tenant.

Shape this implies for the scope: monorepo — core as packages; each module a
package (pages + API + its domain migrations); a tenant = core + an assigned
module set; the shell renders role views FROM the assigned modules (the /ads
pattern generalized). Provider enterprise view and educator view become
compositions (provider = core + marketplace/seller + finance; educator =
core + LMS + marketplace), not new portals. Sequencing: data first (his ERP
migrations), module packaging second, portal views last (views are the cheap
layer — the AAPawZ admin is the proof).

## Two portals only (Sunny's ruling, 2026-11-11 20:15 CST)

- Portal 1: the administrator.
- Portal 2: every other user type — one unified surface, the ERP platform
  surface, serving all audiences the same way. The only difference between
  audiences is the SIDEBAR, generated from the role/module assignment.
- Build separately on a branch; push when the time comes.
- Consequence for the census above: customer (66) + employee (29) + seller
  (201) + telemed (7) + vet (32) + affiliate (2) + /ads (313) stop being
  separate portals/shells and become module assignments inside portal 2;
  admin (170) is portal 1. The sidebar follows the standing Musicosy
  standard, with its contents driven by assignment.

## Open for Sunny

- Which accounting functions are in scope for the ERP core at ship time.
- Sequencing: which portal ships first on the one design.
