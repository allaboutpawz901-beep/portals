# AAPawZ API Route Ledger — per-route, evidence-based

Date: 2026-11-11. Companion file: `api-route-ledger.csv` (one row per route).
This ledger supersedes the group-level verdicts in `api-contract-map.md`:
every route below was classified from its own evidence, not its group's.

## Final totals (1,284 routes)

- **MAPS: 834**
- **PRESERVABLE: 435**
- **NOT PRESERVABLE: 8**
- **NEEDS REVIEW: 7**

## Method

1. **Core index.** Every `CREATE TABLE` in `schema/*/10_tables.sql` was indexed:
   887 distinct table names mapped to their core domain, zero name collisions.
2. **Per-route evidence.** For each of the 1,284 `route.ts` files: exported HTTP
   methods; SQL table names in the file (import and comment lines stripped);
   supabase `.from('…')` table arguments; `TABLE` constants and admin-CRUD first
   arguments; and the same evidence unioned from the local libraries the route
   directly imports (one hop — most AAPawZ routes are thin handlers over
   `src/lib`). Evidence tier per route: own file 862 · imported lib 345 · none 77.
3. **Rules, applied in order** (full rule text in `ledger-scripts/classify3.py`):
   core tables behind supabase-js with no pg path → PRESERVABLE (re-point the
   data layer); supabase-js-only data whose tables are not in the core →
   NOT PRESERVABLE; all tables in core → MAPS; core tables via pg → MAPS;
   pg path with non-core tables → PRESERVABLE; external-service contracts →
   PRESERVABLE; no evidence → NEEDS REVIEW. 16 routes were hand-set after
   reading the files (auth session plumbing, the booking-wizard payload, the
   hello-world root stub, and similar); each is marked HAND-SET in the CSV.

## Verification

- Self-consistency audit: all 2,654 table references claimed for own-evidence
  routes were re-grepped against their files — **0 phantom references**.
- Three extraction defects were found and fixed during the run, and the ledger
  was regenerated after each: import lines masquerading as SQL (`from 'next/…'`),
  delegated routes whose tables live in imported libraries, and a shared CRM
  library's footprint being inherited by every route that imports it.
- The NOT PRESERVABLE (8) and NEEDS REVIEW (7) lists were read by hand, in full.

## What the ledger shows

- **NOT PRESERVABLE (8):** the knowledge/RAG pair (`knowledgechunk`), the
  professor surface (a foreign LMS schema: `course`, `classroommeeting`), the
  developer-dashboard's usage/webhook half (`usage_daily`,
  `webhook_subscriptions`), and the root hello-world stub.
- **NEEDS REVIEW (7):** five documentation-serving routes, `knowledge/search`,
  and `site/tenant` — no data evidence within one hop; left unclassified rather
  than forced.
- **The PRESERVABLE mass is the vertical plus renames.** The most frequent
  non-core tables are the appointments family (`crm_appointments` 239 routes,
  `crm_pets` 236, `crm_appointment_pets` 216, `crm_appointment_status_history`
  207, `crm_customer_pets` 206) and the telemed family
  (`consultation_sessions` 115, `veterinarians` 111, `prescriptions` 75,
  `pharmacy_profiles` 70) — the Pawz modules, exactly where the rethink says
  they belong. A `crm_`-prefix correspondence to core domain 03 is likely for
  part of this family but was **not** assumed; it is a named question for the
  build phase, not a verdict input.
- **Correction to the group census:** the group pass estimated MAPS 953 /
  PRESERVABLE 320 / NOT PRESERVABLE 11. Per-route evidence moves ~120 routes
  from MAPS to PRESERVABLE (their own tables are not core-named) and clears
  most of the dashboard group into PRESERVABLE (its `api_keys` table is core
  domain 27). The census's structural findings stand: the API is raw-pg through
  shared helpers, Supabase is the host rather than the shape, and the CRM
  capture / customer+money conclusion is unchanged.

## Reproduce

`docs/ledger-scripts/` holds the pipeline: `build_index.py` (core index),
`extract.py` / `extract2.py` (evidence), `classify3.py` (rules + overrides).
Inputs: `~/workspace/aapawz/repo/src` and `schema/` in this repo.
