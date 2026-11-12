# Unified Platform

One platform surface serving every audience. Two portals only:

- **Admin** — the administrator portal.
- **Portal** — every other user type on the same surface. The only difference
  between audiences is the sidebar, generated from role and module assignment.

## Architecture

- **Monorepo.** The core is packages; each business capability is a module
  package under `packages/modules/`. A tenant is the core plus its assigned
  modules. Module assignment is what makes the SaaS composable: a provider is
  core + marketplace + finance; a course writer is core + LMS + marketplace.
- **Data.** `schema/` holds the core schema: 33 domains, finance spine
  (ledger, banking, receivables, payables, taxes, cap table) included. Each
  tenant lives in its own database on its own structure; the schema here is
  the platform core, not a tenant's copy.
- **One record, lifecycle stages.** A booking, a CRM entry, and an appointment
  are the same record at different stages — never three systems handing off.
  The same rule holds for a buyer landing in the CRM.

## Layout

- `apps/platform/` — the platform application (both portals, one surface).
- `packages/modules/` — module packages, carved out of the app as each
  module's boundary is drawn.
- `schema/` — core schema by domain.
- `docs/` — scope notes and the API contract map.

## Status

Scaffolded 2026-11-11 from the ERP platform source and schema. Built
separately; it ports in behind All About Pawz when its time comes. The live
AAPawZ app is untouched by this repo.
