# AAPawZ API Contract Map

> **Superseded in part (2026-11-11):** the per-route ledger in
> `api-route-ledger.md` re-classified every route from its own evidence.
> Final per-route totals: MAPS 834 · PRESERVABLE 435 · NOT PRESERVABLE 8 ·
> NEEDS REVIEW 7. This document's structural findings stand; its group
> verdict totals (953/320/11) do not.

 — measured against the unified platform core

Census date: 2026-11-11. Read-only census of `~/workspace/aapawz/repo/src/app/api/**`
measured against (a) the platform SRC Sunny supplied
(`platform/apps/platform/src/app/api/**`, 139 routes) and (b) the 33 core schema
domains in `platform/schema/`. No code was changed.

## Headline totals

- **AAPawZ API routes counted: 1,284** (`route.ts` files under `src/app/api`)
- **Groups: 85 top-level groups; the `admin` group (632 routes) is broken out
  into 87 sub-groups — 172 group rows in the tables below.**
- **Platform SRC contracts: 139 routes** — `/api/crm` (63), `/api/v1` (41, the
  Unsaid POD surface), `/api/cap` (11), `/api/sellers` (6), `/api/val` (5),
  `/api/products` (4), `/api/parties` (2), plus invoices/estimates/receipts/
  equity/queue/variants singles.
- **Verdicts by route: MAPS 953 · PRESERVABLE 320 · NOT PRESERVABLE 11**
- **Verdicts by group: MAPS 97 · PRESERVABLE 71 · NOT PRESERVABLE 4**

Verdict key:
- **MAPS** — a core schema domain and/or an existing platform SRC contract covers it.
- **PRESERVABLE** — the contract shape survives; the data layer re-points to the core.
- **NOT PRESERVABLE** — AAPawZ-product-specific or Supabase-shaped with no core home.

## The coupling finding (why so much survives)

AAPawZ's API is **not** a supabase-js API. Only 10 route files import a Supabase
client/`@supabase` directly and only 64 mention "supabase" at all. The dominant
pattern is raw Postgres through shared helpers against the multi-schema
database (schemas `public`, `lms`, `crm`, `commerce`, …):

- 616 route files route through `@/lib/admin-api` (generic tenant-scoped table
  CRUD built on `pgQuery` from `@/lib/pg`)
- 607 import `@/lib/crm/enterprise` helpers (`withPg`, `ensureCrmCustomer`, …)
- 246 import `@/lib/pg` directly
- External services: Stripe appears in 99 route files, Twilio in 11.

`@/lib/pg` connects to the Supabase-*hosted* Postgres (Supavisor pooler env
vars), so most contracts are coupled to Supabase as a **host**, not as an API
shape — the SQL and contract shapes re-point to any Postgres running the core
schema. The genuinely Supabase-shaped residue is small: the dashboard group
(8 routes, 100% supabase-js `.from()`), `/api/checkout` (built on the
`@/lib/repo` Supabase CRUD), the Next.js revalidate pair, and the Supabase Auth
API calls inside the auth group (11 files) — customer auth itself is Sunny's
custom Google flow (`@/lib/pawz-auth`), not Supabase Auth.

The platform SRC, for its part, already carries the target CRM contract set:
`/api/crm` = customers, leads, households, dependents, deals, pipelines,
appointments (+slots/lookups), services, documents, notes, tasks, campaigns,
sequences, segments, conversations/messages, calls, waitlist, locations,
staff, tags, templates, **bills, payments, payment-links, sales_orders**, stats
— backed there by `supabaseAdmin` over the same party/CRM model the core
schema defines in `03_contacts_parties_crm`.

## Group table — top-level groups (excluding `admin`, broken out below)

| Group | Routes | Maps to | Coupling | Verdict | Reason |
|---|---|---|---|---|---|
| seller | 100 | 04_marketplace_sellers | pg via sellers lib (75 pg-ish, 12 `.from()`) | MAPS | Platform `/api/sellers` + seller store cover the seller surface |
| telemed | 99 | 30_agnostic_business_modules (vertical) | pg via telemedicine lib (only 10 route files touch pg directly) | PRESERVABLE | No core telemedicine domain; survives as the Pawz vertical module |
| customer | 98 | 03_contacts_parties_crm (+31_lms, vertical telemed) | pg (44 pg-ish, 3 `.from()`) | MAPS | Customer self-service over parties/CRM; telemedicine subfamily (43) rides the vertical module |
| ads | 50 | 22_advertising | pg (46) | MAPS | Ad Center contracts sit on the advertising domain |
| employee | 46 | 16_team_payroll_contractors_time | pg (45); 29 routes are `employee/modules/*` mirrors of admin module surfaces | MAPS | Staff surface is role/module assignment over the same core, not a separate system |
| cron | 27 | 27_integrations_jobs_events | pg (12), 2 `.from()`, 2 auth | PRESERVABLE | Job triggers survive; each job's target re-points to core services |
| shop | 21 | 07_storefront_checkout_channels | pg (6) | MAPS | Storefront read/cart surface over catalog + orders domains |
| auth | 21 | 02_identity_access_security | Supabase Auth API in 11 files; custom pawz-auth elsewhere | PRESERVABLE | Shapes survive on platform identity; the Supabase Auth API calls must be replaced, not re-pointed |
| vet | 14 | 30 (vertical) | pg (12) | PRESERVABLE | Vet portal is a Pawz vertical role view over parties/appointments |
| affiliates | 14 | 21_marketing_social_email_promotions | pg (14) | MAPS | Affiliate program contracts sit on the marketing domain |
| onboarding | 12 | 01_platform_workspace / 02 | pg (3) | PRESERVABLE | Tenant/user onboarding flow; shape survives, steps re-point |
| partner-applications | 11 | 04_marketplace_sellers | pg (4), 1 `.from()` | MAPS | Partner intake is seller onboarding on the marketplace domain |
| dashboard | 8 | 26_reports_analytics | supabase-js `.from()` in all 8 | NOT PRESERVABLE | The one group built entirely on PostgREST query shapes; rebuild on the analytics domain |
| support | 7 | 23_support_trust_safety | pg (5) | MAPS | Ticket contracts on the support domain; also a CRM-capture caller (see CRM section) |
| pawzly | 5 | 28_ai | pg (3) | PRESERVABLE | Product AI assistant; capability covered by the AI domain, surface is Pawz-specific |
| docs | 5 | 27_integrations_jobs_events | none (static/devportal lib) | PRESERVABLE | Developer-docs portal surface; no data coupling to break |
| bookings | 5 | 03 (appointments) | pg (2) | MAPS | Booking writes land in the CRM appointment registry (crm_customers/crm_pets) — platform has `crm/appointments` |
| subscriptions | 4 | 01_platform_workspace | pg (1) | MAPS | Core schema carries platform subscription tables |
| paypal | 4 | 27 / 13_finance_sales_receivables | pg (1) + PayPal API | PRESERVABLE | Provider integration shape survives behind the receivables domain |
| automations | 4 | 27 / 25_tasks_chat_notifications | pg (3) | PRESERVABLE | Automation triggers re-point to core jobs/notifications |
| perks | 3 | 21 | none direct | PRESERVABLE | Loyalty/perks surface over marketing domain |
| learn | 3 | 31_lms | pg (3) | MAPS | Learner surface on the LMS domain |
| gift-cards | 3 | 07 / 21 | none direct | PRESERVABLE | Gift-card contracts re-point to checkout/marketing |
| customers | 3 | 03 | pg via crm/enterprise | MAPS | Lookup + pay: the customer+money sample — see CRM section |
| cms | 3 | 20_website_cms | pg (3) | MAPS | CMS contracts on the website domain; also a CRM-capture caller |
| catalog | 3 | 05_catalog_products | pg (3) | MAPS | Platform `/api/products` covers the shape |
| account | 3 | 02 | none direct | PRESERVABLE | Self-service account settings over identity domain |
| workspace | 2 | 01 | pg (2) | MAPS | Workspace surface on the platform-workspace domain |
| webhooks | 2 | 27 | pg (1), 1 `.from()` | PRESERVABLE | Inbound provider webhooks re-point to core event handling |
| tenant | 2 | 00_foundation | none direct | MAPS | Tenant resolution belongs to the foundation domain |
| stripe | 2 | 27 / 13 | pg (1) + Stripe API | PRESERVABLE | Webhook route delegates to `lib/stripe-webhook/handlers` (which posts journal entries — see CRM section) |
| shipping-club | 2 | 30 / 07 | pg (2) | PRESERVABLE | Membership shipping program; vertical flavor over checkout domain |
| promos | 2 | 21 | none direct | MAPS | Promotions on the marketing domain |
| orders | 2 | 08_orders_fulfillment | pg (2) | MAPS | Platform `v1/orders` + `crm/sales_orders` cover the shape |
| newsletter | 2 | 21 | pg (1) | MAPS | Newsletter on the marketing domain |
| knowledge | 2 | 23 / 20 | none direct | PRESERVABLE | Knowledge-base surface; re-point to support/CMS content |
| inventory | 2 | 09_purchasing_inventory | pg (2) | MAPS | Platform `v1/inventory` covers the shape |
| internal | 2 | — (ops) | none direct | PRESERVABLE | Internal tooling endpoints; survive as ops utilities |
| instructor | 2 | 31_lms | pg (2) | MAPS | Instructor surface on the LMS domain |
| geocode | 2 | 27 (external) | pg (1) | PRESERVABLE | External geocoding proxy; provider swap only |
| dogs | 2 | 03 (pets as party dependents) | 1 `.from()` | MAPS | Pet records belong to the party model — platform `crm/dependents` is the analog |
| directory | 2 | 04 / 20 | pg (2) | PRESERVABLE | Public provider directory over marketplace + CMS |
| book | 2 | 03 (appointments) | pg (2) | MAPS | Public booking entry into CRM appointments |
| analytics | 2 | 26 | pg (2) | MAPS | Analytics reads on the reports domain |
| ai | 2 | 28_ai | pg (2) | MAPS | AI endpoints on the AI domain |
| wizard | 1 | 01 | none | PRESERVABLE | Setup wizard flow shape survives |
| vet-leads | 1 | 03 | pg (1) | MAPS | A lead is a CRM lead |
| vet-authorize | 1 | 30 (vertical) | none | PRESERVABLE | Vet authorization check for the vertical module |
| twilio | 1 | 27 | pg (1) + Twilio | PRESERVABLE | Verify/voice integration endpoint; provider-side only |
| site | 1 | 20 | none | MAPS | Site config read on the website domain |
| shipping | 1 | 08 | pg (1) | MAPS | Shipping rates/labels under fulfillment |
| session | 1 | 02 | pg (1), auth (1) | PRESERVABLE | Session read over platform identity |
| send-email | 1 | 21 / 27 | none (Resend) | PRESERVABLE | Transactional send endpoint (Resend is the standing provider) |
| school | 1 | 31_lms | pg (1) | MAPS | School/educator surface on LMS |
| route.ts (root) | 1 | — | none | PRESERVABLE | Root API index/health surface |
| revalidate-shop | 1 | — | Next.js cache API | NOT PRESERVABLE | Framework cache plumbing, no domain home |
| revalidate | 1 | — | Next.js cache API | NOT PRESERVABLE | Framework cache plumbing, no domain home |
| professor | 1 | 31_lms | none | MAPS | Educator role on LMS |
| portal | 1 | 01 | none | PRESERVABLE | Portal bootstrap read over workspace domain |
| pdp-delivery | 1 | 07 | pg (1) | PRESERVABLE | Product-page delivery estimate over checkout domain |
| opt-out | 1 | 21 / 03 | pg (1), touches crm_customers | MAPS | Marketing opt-out is a party-consent write |
| notify | 1 | 25 | none | MAPS | Notification dispatch on the tasks/chat/notifications domain |
| mux | 1 | 27 | pg (1) + Mux | PRESERVABLE | Video provider webhook/sync endpoint |
| me | 1 | 02 | none | PRESERVABLE | Current-user read over platform identity |
| locations | 1 | 03 / 01 | 1 `.from()` | MAPS | Locations exist in both core CRM and workspace domains |
| livekit | 1 | 27 | pg (1) + LiveKit | PRESERVABLE | Video-room token provider endpoint |
| live | 1 | 30 | none | PRESERVABLE | Live-selling surface for the vertical/marketplace module |
| learner-professor | 1 | 31_lms | none | MAPS | LMS role link on the LMS domain |
| invites | 1 | 02 | pg (1) | MAPS | Invites are identity-domain writes |
| impersonation | 1 | 02 | pg (1) | PRESERVABLE | Admin impersonation tooling over platform identity |
| identity | 1 | 02 | none | MAPS | Identity read on the identity domain |
| generate | 1 | 28_ai | none | PRESERVABLE | AI generation endpoint shape survives |
| franchise | 1 | 30 | pg (1) | PRESERVABLE | Franchise surface as an agnostic business module |
| feedback | 1 | 24_community_reviews_ugc | none | MAPS | Feedback on the community/reviews domain |
| devdocs | 1 | 27 | none | PRESERVABLE | Developer docs surface |
| day | 1 | 03 (appointments) | pg (1) | MAPS | Day-sheet is an appointment view |
| courses | 1 | 31_lms | none | MAPS | Course read on LMS |
| consultations | 1 | 30 (vertical) | none | PRESERVABLE | Consultation intake for the telemed vertical |
| commitments | 1 | 03 | pg (1) | PRESERVABLE | Commitment/recurring-booking shape re-points to CRM services |
| classroom | 1 | 31_lms | pg (1) | MAPS | Classroom surface on LMS |
| checkout | 1 | 07 / 08 | `@/lib/repo` Supabase CRUD + Stripe price IDs | NOT PRESERVABLE | Storefront checkout is Supabase-repo-shaped, links no CRM customer, posts no journal entry — rebuild on platform orders |
| capabilities | 1 | 01 | pg (1) | PRESERVABLE | Capability/permission read over workspace domain |
| booking | 1 | 03 (appointments) | none | MAPS | Single booking entry into CRM appointments |
| availability | 1 | 03 (appointments) | none | MAPS | Slot availability — platform has `crm/appointments/slots` |
| atlas | 1 | — (reference data) | static lib data | PRESERVABLE | Static US-states reference endpoint; data, not a contract dependency |

## Group table — `admin/*` sub-groups (632 routes)

All admin sub-groups ride the same two couplings: `@/lib/admin-api` generic
pg CRUD (587 import sites) and module gates (`@/lib/admin/modules`, 339).
None uses Supabase storage from route files; 9 route files use `.from()`.

| Sub-group | Routes | Maps to | Verdict | Reason |
|---|---|---|---|---|
| lms | 225 | 31_lms | MAPS | Generic table CRUD over the `lms` schema; the domain is the core's LMS |
| crm | 52 | 03_contacts_parties_crm | MAPS | Near-1:1 with platform `/api/crm` (customers, appointments, pets, lifecycle, waitlist, documents) |
| support | 36 | 23_support_trust_safety | MAPS | Support desk family on the support domain |
| telemed | 23 | 30 (vertical) | PRESERVABLE | Admin side of the Pawz telemedicine vertical |
| ai-ops | 22 | 28_ai | MAPS | AI operations on the AI domain |
| settings | 19 | 01 / 00 | MAPS | Tenant/platform settings on workspace/foundation |
| orders | 19 | 08_orders_fulfillment | MAPS | Order admin on the orders domain |
| accounting | 16 | 11 / 13 / 14 finance | MAPS | Real double-entry exists (`postBalancedJournalEntry`, `acct_*` tables in `public`) — the tables are AAPawZ-local; the contracts re-point to the core finance domains |
| trust-safety | 14 | 23 | MAPS | Trust & safety on the support/trust domain |
| sellers | 14 | 04 | MAPS | Seller admin on the marketplace domain |
| ads | 11 | 22_advertising | MAPS | Ad admin on the advertising domain |
| docs | 10 | 27 | PRESERVABLE | Developer-portal docs admin |
| payroll | 8 | 16_team_payroll_contractors_time | MAPS | Payroll admin (incl. GL lifecycle hooks in lib) on the team/payroll domain |
| analytics | 7 | 26_reports_analytics | MAPS | Analytics admin on the reports domain |
| notifications | 6 | 25 | MAPS | Notification admin on the notifications domain |
| banking | 6 | 12_finance_banking_treasury | MAPS | Bank accounts/reconcile on the banking domain |
| filters | 6 | 01 | PRESERVABLE | Saved-filter UI state; generic shape survives |
| products | 5 | 05 | MAPS | Product admin — platform `/api/products` |
| inventory | 5 | 09 | MAPS | Inventory admin on the purchasing/inventory domain |
| catalog | 5 | 05 | MAPS | Catalog admin on the catalog domain |
| suppliers | 4 | 09 | MAPS | Supplier admin on purchasing |
| purchase-orders | 4 | 09 | MAPS | Purchase orders on purchasing |
| payments | 4 | 13 / 12 | MAPS | Payment admin on receivables/banking |
| policies | 4 | 23 / 02 | PRESERVABLE | Policy document admin; shape survives |
| brand-registry | 4 | 21 / 23 | PRESERVABLE | Brand registry admin; marketplace-adjacent |
| users | 3 | 02 | MAPS | User admin on identity |
| taxes | 3 | 17_sales_tax | MAPS | Tax admin on the sales-tax domain |
| stripe-connections | 3 | 27 | PRESERVABLE | Connected-account admin; integration shape survives |
| shipping | 3 | 08 | MAPS | Shipping admin under fulfillment |
| reports | 3 | 26 | MAPS | Reports admin on the reports domain |
| promotions | 3 | 21 | MAPS | Promotions admin on marketing |
| pos | 3 | 07 | MAPS | Point-of-sale on the checkout/channels domain |
| packages | 3 | 30 / 07 | PRESERVABLE | Service packages (grooming bundles) — vertical flavor |
| invoices | 3 | 13 | MAPS | Invoice admin; platform has `/api/invoices` |
| franchise | 3 | 30 | PRESERVABLE | Franchise admin as agnostic module |
| disputes | 3 | 23 / 13 | MAPS | Disputes across trust & safety and receivables |
| dashboard | 3 | 26 | PRESERVABLE | Admin dashboard aggregates; rebuild reads on reports domain |
| website | 2 | 20 | MAPS | Website admin on CMS domain |
| tenants | 2 | 00 / 01 | MAPS | Tenant admin on foundation |
| telemedicine | 2 | 30 (vertical) | PRESERVABLE | Duplicate telemed admin surface |
| system-health | 2 | — (ops) | PRESERVABLE | Ops health endpoints |
| social | 2 | 21 | MAPS | Social admin on marketing |
| returns | 2 | 10_returns_claims | MAPS | Returns admin on the returns domain |
| promos | 2 | 21 | MAPS | Promo admin on marketing |
| partners | 2 | 04 | MAPS | Partner admin on marketplace |
| onboarding | 2 | 01 / 02 | MAPS | Onboarding admin on workspace/identity |
| my-website | 2 | 20 | PRESERVABLE | Tenant website self-edit surface |
| locations | 2 | 03 / 01 | MAPS | Location admin exists in CRM + workspace |
| impersonation | 2 | 02 | PRESERVABLE | Impersonation tooling over identity |
| gift-cards | 2 | 07 / 21 | MAPS | Gift-card admin on checkout/marketing |
| coupons | 2 | 21 | MAPS | Coupons on marketing |
| cms | 2 | 20 | MAPS | CMS admin on website domain |
| categories | 2 | 05 | MAPS | Category admin on catalog |
| brands | 2 | 05 / 21 | MAPS | Brand admin on catalog/marketing |
| vendors | 1 | 09 | MAPS | Vendor read on purchasing |
| system | 1 | — (ops) | PRESERVABLE | System endpoint |
| sync-jobs | 1 | 27 | PRESERVABLE | Sync job trigger |
| supplier-orders | 1 | 09 | MAPS | Supplier orders on purchasing |
| subscriptions | 1 | 01 | MAPS | Subscription admin on workspace |
| staff | 1 | 16 / 03 | MAPS | Staff — platform `crm/staff` covers it |
| seller-advertising | 1 | 22 | MAPS | Seller ads on advertising |
| security-posture | 1 | 02 | PRESERVABLE | Security posture read |
| search | 1 | — | PRESERVABLE | Global admin search shape survives |
| refunds | 1 | 10 / 13 | MAPS | Refunds post journal entries (`postBalancedJournalEntry` caller) |
| purchasing | 1 | 09 | MAPS | Purchasing action endpoint |
| policy-settings | 1 | 23 | PRESERVABLE | Policy settings shape survives |
| permissions | 1 | 02 | PRESERVABLE | Permission admin over identity |
| payouts | 1 | 13 / 12 | MAPS | Payout execution posts to GL via lib |
| overrides | 1 | — | PRESERVABLE | Admin override action shape survives |
| mux | 1 | 27 | PRESERVABLE | Video provider admin |
| media | 1 | 20 / 27 | PRESERVABLE | Media library admin |
| listings | 1 | 04 / 05 | MAPS | Listing admin on marketplace/catalog |
| leads | 1 | 03 | MAPS | Lead admin — platform `crm/leads` |
| identity-grants | 1 | 02 | PRESERVABLE | Grant admin over identity |
| gift-card-designs | 1 | 21 | PRESERVABLE | Gift-card design assets |
| finance | 1 | 11 | MAPS | Finance actions post journal entries |
| fees | 1 | 11 / 13 | PRESERVABLE | Fee schedule admin |
| feature-flags | 1 | 01 | PRESERVABLE | Core schema carries `platform_feature_flags` |
| email-templates | 1 | 21 | PRESERVABLE | Template admin on marketing |
| deposits | 1 | 13 / 03 | MAPS | Deposit handling on receivables/CRM |
| course-architect | 1 | 31 / 28 | PRESERVABLE | AI course builder on LMS/AI |
| commerce | 1 | 07 / 08 | MAPS | Commerce actions post journal entries |
| catalog-review | 1 | 05 | PRESERVABLE | Review-queue shape survives |
| card-payments | 1 | 13 | MAPS | Card payment admin on receivables |
| audit-logs | 1 | 02 / 00 | PRESERVABLE | Audit log reads |
| audit | 1 | 02 / 00 | PRESERVABLE | Audit action endpoint |
| affiliates | 1 | 21 | MAPS | Affiliate admin on marketing |

Admin sub-group totals: MAPS 546 routes · PRESERVABLE 86 routes · NOT PRESERVABLE 0.

## CRM capture — and the customer + money wire

### The one live capability: CRM capture holds a customer

Today's working capability is exactly the one Sunny named: **a customer can be
captured and held in the CRM.** The contracts that implement it:

- **The writer:** `lib/crm/capture-contact.ts` — `captureCrmContact()`, the one
  writer that turns a public submission into a `crm_customers` person record,
  deduped one-per-(tenant, email), never throwing into the caller's intake.
- **Its only two callers:** `POST /api/cms/messages` (contact form) and
  `POST /api/support/tickets` (support family). Every other public intake
  (leads, partner applications, vet leads) lands in its own table and does
  **not** create the person record.
- **The holding surface:** the `admin/crm` family (52 routes) — customers
  CRUD + directory, lifecycle, activity, communications, cases, flags,
  metrics, tags, notes, documents — plus `customers/lookup` and the
  appointments/pets families that hang off the same registry. 84 route files
  reference `crm_customers` in total.
- **Lifecycle movement that exists:** `POST /api/admin/crm/customers/lifecycle`
  recalculates `crm_customers.lifecycle_stage` in batch from a scorer
  (`scoreLifecycleBatch`) — stage movement driven by CRM data, not by money.

This maps cleanly: core domain `03_contacts_parties_crm`, and the platform SRC
already exposes the equivalent contract set (`/api/crm/customers`,
`/api/parties`, households, dependents — pets' analog).

### Moving a customer AND money into the CRM — the wire that was never built end-to-end

Pieces of the money wire exist as contracts; they were never connected into
one flow. What exists:

- **`/api/customers/pay`** — the closest thing to the wire: resolves the salon
  record to the `crm_customers` registry row, calls `ensureCrmCustomer` +
  `writeCommercePayment` (via `@/lib/crm/enterprise`). One route.
- **`/api/admin/crm/checkout`** and **`/api/admin/crm/customers/[id]/payments`**
  — staff-side checkout/payment reads-writes inside the CRM family; the
  checkout route is a `postBalancedJournalEntry` caller.
- **Manual GL posting exists:** `lib/accounting/journal.ts`
  (`postBalancedJournalEntry`) is called from admin accounting actions,
  journal-entries, invoices/`[id]`/payments, refunds, finance actions,
  employee invoice payments, and seller/telemed payout execution in lib.
- **Stripe webhook → GL exists in lib:** `lib/stripe-webhook/handlers.ts`
  posts journal entries and is wired to `POST /api/stripe/webhook`. But the
  orders it settles are commerce orders — the handler does not move the
  *customer's* CRM lifecycle or attach the payment to a `crm_customers` record.
- **Bookings carry a payment status string** (`paymentStatus` on the
  appointment record in `/api/bookings`) — a label on the appointment, not a
  payment record in the CRM or a GL entry.

### The gaps (named, not coded)

1. **The public storefront checkout is disconnected from the CRM.**
   `POST /api/checkout` creates a PENDING order + order_items through
   `@/lib/repo` (Supabase-shaped CRUD) keyed to Stripe price IDs. It creates
   no `crm_customers` record, links no customer to the order, and posts no
   journal entry. A buying customer never enters the CRM by buying.
2. **No order→CRM attach contract.** Nothing in `orders`, `shop`, `stripe`,
   or `webhooks` route families references `crm_customers` (only `shop/bag`
   sync and `bookings` touch the registry). There is no contract whose job is
   "this order/payment belongs to this CRM customer."
3. **No payment→lifecycle contract.** Lifecycle stage movement is driven by
   the batch scorer over CRM activity; no payment, invoice-paid, or
   order-completed event is a lifecycle input. Money arriving does not move
   the customer.
4. **The GL is an island.** Journal posting works, but its callers are staff
   actions (accounting, invoices, refunds, payouts). Commerce events
   (checkout completed, booking paid) do not call it — the one exception,
   the Stripe webhook handler, settles to GL without touching the customer
   record, so money and customer still never meet in one transaction.
5. **Capture is intake-only.** `captureCrmContact` has exactly two callers
   (contact form, support tickets). Checkout, booking, and shop flows do not
   call it — capture holds people who *wrote in*, not people who *paid*.

**Conclusion:** CRM capture (hold a customer) is real, mapped, and portable —
domain 03, platform contracts already written. The customer+money wire is not
a missing feature inside one route; it is a missing *connection* between four
contract families that each exist separately (capture, orders/checkout,
payments/GL, lifecycle). On the unified platform that connection is small
because the platform's `/api/crm` already co-locates customers, bills,
payments, payment-links, and sales_orders in one contract family — the shape
AAPawZ scattered across `customers/pay`, `admin/crm/checkout`, `checkout`,
and `lib/accounting/journal` without ever joining them.

## Appendix — commands used (reproducibility)

```bash
# Totals
find ~/workspace/aapawz/repo/src/app/api -name route.ts | wc -l            # 1284
find ~/workspace/aapawz/platform/apps/platform/src/app/api -name route.ts | wc -l  # 139

# Group counts (top-level; same awk with path admin/ for sub-groups)
find . -name route.ts | awk -F/ '{print $2}' | sort | uniq -c | sort -rn

# Coupling tallies
grep -rl "admin-api" app/api --include=route.ts | wc -l        # 617 files
grep -rl "lib/pg" app/api --include=route.ts | wc -l           # 250 files
grep -rl "createClient\|@supabase" app/api --include=route.ts | wc -l   # 10
grep -rl "supabase" app/api --include=route.ts | wc -l         # 64
grep -rhoE 'from "@/lib/[a-z0-9/_-]+' app/api --include=route.ts | sort | uniq -c | sort -rn
grep -rl "crm_customers" app/api --include=route.ts | wc -l    # 84
grep -rl "postBalancedJournalEntry" src/app src/lib --include=*.ts
grep -rl "captureCrmContact\|capture-contact" app/api --include=route.ts
```

Per-group `.from()` / pg-ish / auth / storage counts were taken with a
per-directory `grep -rl` loop over each top-level group (storage: zero route
files under `src/app/api` call `.storage.` directly — storage access lives in
lib helpers).
