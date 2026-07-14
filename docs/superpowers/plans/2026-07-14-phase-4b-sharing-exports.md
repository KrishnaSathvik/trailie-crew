# Phase 4B Sharing and Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure immutable-version share links, a public read-only itinerary, print/PDF support, and deterministic calendar export.

**Architecture:** PostgreSQL owns authorization, lifecycle, concurrency, immutable source/snapshot checks, and narrow projections. Next.js owns token generation, strict redaction contracts, server-only public verification, route rendering, and on-demand version-specific exports.

**Tech Stack:** PostgreSQL 17, Supabase Auth/RLS/Realtime, Next.js 16 App Router, React 19, TypeScript 6, Zod 4, Vitest, pgTAP, Playwright.

## Global Constraints

- Every share and export identifies one immutable published `trip_plan_id` and version; never resolve a mutable latest alias.
- Raw share tokens are returned once, never stored or logged, and contain at least 256 bits of entropy.
- Only the active host manages links; all active room members may read safe status and export published versions.
- Public access returns only the strict redacted projection and collapses all token failures to one generic unavailable state.
- Public responses are `no-store`, `noindex`, `nofollow`, and `noarchive`.
- No server-generated PDF dependency, persisted artifacts, public storage bucket, public ICS generation, or visitor analytics.
- Do not commit or push.

---

### Task 1: Database sharing contract

**Files:**

- Create: `supabase/tests/phase_4b_sharing_exports.test.sql`
- Create: `supabase/migrations/<timestamp>_phase_4b_sharing_exports.sql`
- Modify: `src/types/database.ts`

**Interfaces:**

- Produces: `plan_share_links`, share enums, `create_plan_share_link`, `revoke_plan_share_link`, `get_plan_share_status`, `verify_plan_share_token_hash`, and safe Realtime invalidations.

- [ ] Write pgTAP tests for object shape, grants, host/participant binding, published/historical acceptance, unpublished rejection, rotation, idempotent revoke, expiration, snapshot mismatch, cross-room isolation, and pinned Version 1 after Version 2.
- [ ] Run the focused SQL test and confirm it fails because Phase 4B objects do not exist.
- [ ] Create the timestamped imperative migration with RLS, explicit grants, constraints, indexes, locks, hashes, narrow functions, and safe notifications.
- [ ] Reset the local database and run the focused SQL test until green.
- [ ] Extend generated-style TypeScript database declarations and rerun typecheck.

### Task 2: Token, projection, and content hashes

**Files:**

- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/index.test.ts`
- Create: `src/features/sharing/token.test.ts`
- Create: `src/features/sharing/token.ts`
- Create: `src/features/sharing/public-projection.test.ts`
- Create: `src/features/sharing/public-projection.ts`
- Create: `src/features/sharing/content-hash.test.ts`
- Create: `src/features/sharing/content-hash.ts`

**Interfaces:**

- Produces: strict `PublicSharedItinerary` schemas/types, `generateShareToken()`, `hashShareToken()`, `projectPublicItinerary()`, and schema-versioned deterministic hashes.

- [ ] Write failing schema/token/redaction/hash tests, including identities, origins, coordinates, evidence, private constraints, HTML, unsafe URLs, and version retention.
- [ ] Run focused Vitest and confirm failures are caused by missing contracts.
- [ ] Implement minimum strict schemas and deterministic utilities using Node crypto and stable JSON serialization.
- [ ] Run focused tests until green, then run package tests and typecheck.

### Task 3: Share server workflows

**Files:**

- Create: `src/features/sharing/errors.ts`
- Create: `src/features/sharing/actions.test.ts`
- Create: `src/features/sharing/actions.ts`
- Create: `src/features/sharing/repository.ts`

**Interfaces:**

- Consumes: database RPCs and token/projection utilities.
- Produces: create/rotate/revoke/status actions and a server-only token verifier.

- [ ] Write failing action tests for validation, one-time raw token return, host errors, generic public errors, and no token logging/persistence surface.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement authenticated user-client management RPC calls and server-only secret-client verification.
- [ ] Run focused tests, typecheck, and lint until green.

### Task 4: Deterministic calendar export

**Files:**

- Create: `src/features/exports/ics.test.ts`
- Create: `src/features/exports/ics.ts`
- Create: `src/app/api/trips/[roomId]/plans/[version]/calendar/route.test.ts`
- Create: `src/app/api/trips/[roomId]/plans/[version]/calendar/route.ts`
- Create: `scripts/calendar-smoke.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces: `generateIcs(projection)`, stable UIDs, CRLF/folding/escaping, omission count header, and authenticated version-specific download.

- [ ] Write failing unit/route tests for RFC structure, timezone, stable version UIDs, escaping, 75-octet folding, untimed omission, privacy, deterministic bytes, and V1/V2 distinction.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement the generator, authenticated route, bounds, headers, and credential-free smoke script.
- [ ] Run focused tests and `pnpm test:calendar:smoke` until green.

### Task 5: Public and print routes

**Files:**

- Create: `src/features/sharing/components/public-itinerary.test.tsx`
- Create: `src/features/sharing/components/public-itinerary.tsx`
- Create: `src/features/sharing/components/print-button.tsx`
- Create: `src/app/share/[token]/page.test.tsx`
- Create: `src/app/share/[token]/page.tsx`
- Create: `src/app/share/[token]/layout.tsx`
- Create: `src/app/trips/[roomId]/plans/[version]/print/page.tsx`
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Modify: `src/styles/globals.css`
- Create: `scripts/share-smoke.mjs`
- Create: `scripts/pdf-smoke.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: public verifier and projection.
- Produces: anonymous `/share/[token]`, authenticated pinned print route, generic unavailable state, robots/sitemap exclusion, and browser Save as PDF.

- [ ] Write failing component/route tests for valid/unavailable pages, version labels, sections, privacy, metadata, no private navigation, and print content/footer.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement responsive semantic layouts, explicit headers/metadata, dynamic/no-store behavior, print styles, page breaks, and print action.
- [ ] Run focused tests, smoke checks, typecheck, and accessibility-oriented assertions until green.

### Task 6: Authenticated controls and history integration

**Files:**

- Create: `src/features/sharing/components/share-controls.test.tsx`
- Create: `src/features/sharing/components/share-controls.tsx`
- Modify: `src/features/revisions/components/revision-experience.tsx`
- Modify: `src/features/planning/components/plan-experience.tsx`
- Modify: `src/features/trips/components/trip-shell.tsx`
- Modify: affected component tests.

**Interfaces:**

- Consumes: share actions, selected `TripPlanView`, current participant role.
- Produces: host-only create/rotate/expiry/revoke/copy controls plus member-safe status and version-specific ICS/print actions for current and historical views.

- [ ] Write failing tests for host visibility, member-safe status, one-time copy state, lost-token rotation, active/revoked/expired state, and historical version URLs.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement controls and safe Realtime refresh without token/URL broadcasts.
- [ ] Integrate current/historical views and rerun component tests, typecheck, and lint.

### Task 7: End-to-end and documentation

**Files:**

- Create: `e2e/sharing-exports.spec.ts`
- Modify: `README.md`
- Modify: required `docs/build-week/*.md` files.
- Create: `docs/build-week/sharing.md`
- Create: `docs/build-week/exports.md`
- Create: `docs/build-week/public-privacy.md`

**Interfaces:**

- Produces: deterministic two-user/public-browser proof and complete Phase 4B operational/security documentation.

- [ ] Add real local Auth/PostgreSQL/RLS/Next.js E2E for V1/V2 pinning, host/member permissions, public privacy, revoke/rotate/expiry, ICS, print, mobile, network, and console behavior.
- [ ] Run the focused E2E and fix only production behavior or deterministic fixture setup.
- [ ] Update all requested documentation with architecture, lifecycle, privacy, caching, hashes, limits, deferred scope, security boundary, and demo flow.
- [ ] Run documentation format and link/path review.

### Task 8: Full verification and report evidence

**Files:**

- Modify only files required to fix discovered Phase 4B defects.

**Interfaces:**

- Produces: complete quality-gate evidence and final uncommitted report.

- [ ] Run format, lint, typecheck, unit, local build, database reset, all pgTAP, E2E, database lint, and security advisors.
- [ ] Run diff check, secret scan, dependency audit, route manifest, robots/sitemap, production fake-control, share/PDF/calendar smoke, browser, status, and inclusive diff-stat reviews.
- [ ] Fix failures test-first and rerun affected gates plus the full relevant suite.
- [ ] Report architecture, files/routes, red-green evidence, counts, commands, smoke/browser/security results, unresolved warnings, exact git status, and inclusive diff stat without committing or pushing.
