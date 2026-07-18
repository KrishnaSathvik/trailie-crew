# Phase 6A Live Travel Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add official, current, immutable, and honestly degraded travel evidence to itinerary planning and revisions.

**Architecture:** Server-only provider adapters emit one strict `TravelEvidenceV1` contract into a provider-aware cache and durable request workflow. Published plans bind immutable evidence snapshots; itinerary generation, validation, revisions, member UI, public sharing, print, and ICS consume normalized snapshot projections rather than raw provider payloads.

**Tech Stack:** TypeScript 6, Zod 4, Next.js 16 App Router, React 19, Supabase/PostgreSQL 17, Vitest 4, pgTAP, Playwright, Mapbox Geocoding v6/Directions v5, OpenWeather One Call 3.0, NPS Data API, RIDB API.

## Global Constraints

- Work on `main` from `8c1e9c7`.
- Do not deploy unrestricted Production or weaken any Phase 5 control.
- Do not add Phase 6B maps, Phase 6C guests, Phase 7 booking/purchasing, payment data, scraping, or an undocumented provider.
- Never print, hash, export, persist, or include provider credential values in evidence.
- Use official current provider sources and lawful storage semantics.
- Treat unavailable, stale, inferred, ambiguous, and conflicting evidence explicitly.
- Use test-first red-green-refactor for production behavior.
- Group verified commits by evidence/adapters, integration, tests, and documentation.

---

### Task 1: Provider inventory and server environment contract

**Files:**

- Modify: `src/server/env.ts`
- Modify: `src/server/env.test.ts`
- Modify: `.env.example`
- Create: `docs/production/travel-provider-inventory.md`
- Modify: `docs/production/environment-variables.md`

**Interfaces:**

- Produces: `parseTravelProviderEnv(source)` returning enabled state and nullable server-only credentials.
- Produces: provider inventory entries with API, auth, limits, storage, attribution, freshness, browser/server, and availability guarantees.

- [ ] Write environment tests that accept all four credentials when enabled, reject incomplete enabled configuration, and allow disabled operation without credentials.
- [ ] Run `pnpm test src/server/env.test.ts` and confirm the new tests fail because `parseTravelProviderEnv` does not exist.
- [ ] Implement `parseTravelProviderEnv` with Zod, no `NEXT_PUBLIC_*` aliases, and no returned diagnostic string containing a credential.
- [ ] Run the environment tests and confirm they pass.
- [ ] Record the verified official provider inventory, including Mapbox `permanent=true`, OpenWeather's eight-day horizon, NPS's default 1,000/hour limit, RIDB's contract-defined dynamic limits, and the current OpenWeather 401 acceptance state.

### Task 2: Versioned normalized evidence contract

**Files:**

- Create: `packages/schemas/src/travel-evidence.ts`
- Create: `packages/schemas/src/travel-evidence.test.ts`
- Modify: `packages/schemas/src/index.ts`
- Create: `docs/production/travel-evidence-contract.md`

**Interfaces:**

- Produces: `travelEvidenceV1Schema`, `TravelEvidenceV1`, type-specific normalized value schemas, freshness/verification/confidence/availability enums, and location/entity bindings.
- Produces: `classifyTravelFreshness(evidence, now)` and `semanticTravelEvidenceHashInput(evidence)`.

- [ ] Write failing schema tests for every evidence/freshness/verification/confidence/availability enum and reject a single `isVerified` flag.
- [ ] Write failing freshness tests for fresh, cached fresh, stale, expired, unavailable, and conflicting evidence.
- [ ] Run `pnpm test packages/schemas/src/travel-evidence.test.ts` and confirm missing exports fail.
- [ ] Implement strict schemas with bounded URLs, metadata, text, coordinates, timestamps, and discriminated normalized values.
- [ ] Run the targeted schema tests and existing schema suite.
- [ ] Document the contract, semantic hashing exclusions, source precedence, and compatibility mapping from legacy tool evidence.

### Task 3: Provider adapter core, cache keys, and fake provider

**Files:**

- Create: `packages/travel-tools/src/contracts.ts`
- Create: `packages/travel-tools/src/cache-policy.ts`
- Create: `packages/travel-tools/src/errors.ts`
- Create: `packages/travel-tools/src/fake-provider.ts`
- Create: `packages/travel-tools/src/contracts.test.ts`
- Create: `packages/travel-tools/src/cache-policy.test.ts`
- Modify: `packages/travel-tools/src/index.ts`
- Modify: `packages/travel-tools/src/index.test.ts`
- Create: `docs/production/travel-cache-policy.md`

**Interfaces:**

- Produces: `TravelProviderAdapter`, capability request/result types, `normalizeTravelProviderError`, `buildTravelCacheKey`, `travelCachePolicy`, and `createFakeTravelProviderAdapter`.
- Preserves: legacy `TravelProvider` exports through a compatibility adapter until Task 8.

- [ ] Write failing tests for input validation, secret removal, cache-key determinism/environment isolation, TTL categories, negative caching, timeout/rate-limit/auth/no-result classification, and every fake scenario.
- [ ] Run the targeted tests and verify expected failures.
- [ ] Implement the adapter contract, canonical key builder, documented TTL policy, and deterministic fake results without raw SDK/provider objects.
- [ ] Run targeted tests and `pnpm test packages/travel-tools`.
- [ ] Document cache keys, TTL rationale, stale policy, invalidation, cleanup, private-data exclusions, and acceptance bypass.

### Task 4: Official provider adapters

**Files:**

- Create: `packages/travel-tools/src/http.ts`
- Create: `packages/travel-tools/src/adapters/mapbox.ts`
- Create: `packages/travel-tools/src/adapters/openweather.ts`
- Create: `packages/travel-tools/src/adapters/nps.ts`
- Create: `packages/travel-tools/src/adapters/ridb.ts`
- Create: `packages/travel-tools/src/adapters/mapbox.test.ts`
- Create: `packages/travel-tools/src/adapters/openweather.test.ts`
- Create: `packages/travel-tools/src/adapters/nps.test.ts`
- Create: `packages/travel-tools/src/adapters/ridb.test.ts`
- Modify: `packages/travel-tools/src/index.ts`

**Interfaces:**

- Produces: `createMapboxAdapter`, `createOpenWeatherAdapter`, `createNpsAdapter`, and `createRidbAdapter`.
- Consumes: `TravelProviderAdapter`, `TravelEvidenceV1`, error normalization, cache policy, and an injected `fetcher`.

- [ ] Write failing adapter tests for success, ambiguity, no route, unsupported transit, traffic basis, forecast horizon, polar daylight, NPS closure normalization, RIDB official links, rate limit, timeout, invalid key, malformed payload, partial capability, stale timestamps, and attribution.
- [ ] Run each adapter test and confirm it fails for the missing implementation.
- [ ] Implement one allowlisted HTTP helper that strips credential-bearing URLs/errors and enforces timeouts and bounded JSON bodies.
- [ ] Implement Mapbox permanent geocoding and Directions profiles without storing temporary results or fabricating a route.
- [ ] Implement OpenWeather daily/weather/alert/daylight normalization with timezone and eight-day horizon enforcement.
- [ ] Implement NPS park/alert/campground/visitor-center/fee/hour/accessibility normalization with official-source precedence.
- [ ] Implement RIDB recreation-area/facility/campsite/tour/permit/link normalization without inferring inventory.
- [ ] Run all adapter tests and the full travel-tools suite.

### Task 5: TrailVerse read-only boundary

**Files:**

- Modify: `packages/trailverse-adapter/src/index.ts`
- Create: `packages/trailverse-adapter/src/index.test.ts`
- Modify: `docs/production/travel-provider-inventory.md`

**Interfaces:**

- Produces: `TrailVerseKnowledgeAdapter`, provenance-bearing park/entity/link mapping types, and `createUnavailableTrailVerseKnowledgeAdapter`.

- [ ] Write failing tests proving TrailVerse mappings cannot claim live status, override active official evidence, contain private user data, or return administrative URLs.
- [ ] Run `pnpm test packages/trailverse-adapter` and confirm missing behavior fails.
- [ ] Implement the read-only mapping contract and unavailable adapter without a direct database dependency.
- [ ] Run targeted tests and document that no stable deployable TrailVerse API exists in this repository.

### Task 6: Forced-RLS evidence, cache, request, snapshot, and refresh persistence

**Files:**

- Create via CLI: `supabase/migrations/*_phase_6a_live_travel_intelligence.sql`
- Create: `supabase/tests/phase_6a_live_travel_intelligence.test.sql`
- Modify: `src/types/database.ts`
- Create: `src/server/travel/repository.ts`
- Create: `src/server/travel/repository.test.ts`

**Interfaces:**

- Produces: service-only RPCs for cache read/write, provider request claim/complete/fail, evidence upsert/bind, refresh claim, snapshot assembly, and privacy-safe plan evidence reads.
- Produces: immutable `private.plan_evidence_snapshots` bound to a published `trip_plan_id`.

- [ ] Run `pnpm exec supabase migration new phase_6a_live_travel_intelligence` to obtain the timestamped filename.
- [ ] Write pgTAP tests first for private denial, forced RLS, search paths, grants, request uniqueness, cache environment isolation, safe claims, snapshot immutability, exactly-once binding, Version 1 preservation, affected-only refresh, retention cleanup, and no browser grants.
- [ ] Run the Phase 6A pgTAP file and confirm it fails because the schema is absent.
- [ ] Implement enums, six private tables, constraints, indexes matching repository queries, immutable triggers, and narrow service RPCs.
- [ ] Regenerate or manually update checked database types to match the verified local catalog.
- [ ] Implement and unit-test the TypeScript repository mapping.
- [ ] Reset the local database, run the Phase 6A pgTAP file, schema lint, and security advisors.

### Task 7: Durable travel workflow and operational controls

**Files:**

- Create: `src/server/travel/service.ts`
- Create: `src/server/travel/service.test.ts`
- Create: `src/server/travel/scheduler.ts`
- Create: `src/server/travel/scheduler.test.ts`
- Modify: `src/server/recovery/drain.ts`
- Modify: `src/server/recovery/drain.test.ts`
- Modify: `src/server/operations/provider-switches.ts`
- Modify: `src/server/operations/provider-switches.test.ts`
- Create: `docs/production/travel-provider-operations.md`

**Interfaces:**

- Produces: `TravelEvidenceService.resolveBundle(input)`, `drainTravelRefreshJob(id)`, and recovery category `travel`.

- [ ] Write failing tests for cache hits, call deduplication, provider/room/global limits, kill switch, bounded fan-out, one-provider isolation, retry classes, next retry time, no duplicate evidence/charge, and safe metrics.
- [ ] Run the targeted tests and confirm expected failures.
- [ ] Implement provider orchestration with durable request claims and cache persistence.
- [ ] Add travel recovery without changing existing category semantics or aggregate safety.
- [ ] Run service, scheduler, recovery, quota, interruption, and provider acceptance tests.
- [ ] Document health checks, error classes, safe evidence, emergency disable, recovery, retention, and incident response.

### Task 8: Itinerary generation and deterministic validation

**Files:**

- Modify: `src/features/itinerary/context.ts`
- Modify: `src/features/itinerary/context.test.ts`
- Modify: `src/features/itinerary/prompts/itinerary.ts`
- Modify: `src/features/itinerary/worker.ts`
- Modify: `src/features/itinerary/worker.test.ts`
- Modify: `src/features/itinerary/scheduler.ts`
- Modify: `src/features/itinerary/repository.ts`
- Modify: `src/features/itinerary/repository.test.ts`
- Modify: `src/features/itinerary/validation/validate-itinerary.ts`
- Modify: `src/features/itinerary/validation/validate-itinerary.test.ts`

**Interfaces:**

- Consumes: `TravelEvidenceService`, normalized evidence bundles, immutable bindings, and snapshot assembly.
- Preserves: Phase 5A unavailable-route warning and all Phase 5 validators.

- [ ] Write failing tests for normalized prompt groups, closure precedence, date-bound hours, false reservation confirmation, ambiguous destination, unresolved location, route conflict, daylight concern, severe-weather caution, unsupported horizon, stale critical evidence, and conflicting official sources.
- [ ] Run targeted tests and confirm failures before implementation.
- [ ] Replace raw/legacy provider enrichment with normalized bundle resolution while retaining compatibility for existing evidence fixtures.
- [ ] Update prompts to enumerate verified/stale/missing/conflicting evidence and required user confirmation.
- [ ] Add deterministic validator rules with the specified blocker/repairable/warning severities.
- [ ] Assemble the evidence snapshot atomically before publication.
- [ ] Run itinerary worker, provider, validator, repository, and generation E2E tests.

### Task 9: Revision refresh and immutable version evidence

**Files:**

- Modify: `src/features/revisions/worker.ts`
- Modify: `src/features/revisions/worker.test.ts`
- Modify: `src/features/revisions/repository.ts`
- Modify: `src/features/revisions/repository.test.ts`
- Modify: `src/features/revisions/context.ts`
- Modify: `src/features/revisions/diff.ts`
- Modify: `src/features/revisions/diff.test.ts`
- Modify: `src/features/revisions/validation/preservation-contract.test.ts`

**Interfaces:**

- Consumes: manifest `evidenceRefreshTargets`.
- Produces: evidence-only diff entries and affected-only refresh behavior without changing Phase 5D scope validation.

- [ ] Write failing tests for route/weather/place/reservation refresh targets, unaffected evidence preservation, timestamp-only semantic equality, closure-triggered proposal, and metadata-only refresh without Version N+1.
- [ ] Run targeted tests and confirm failures.
- [ ] Resolve only manifest-selected bindings and preserve every other snapshot reference.
- [ ] Include evidence changes separately in compare output while keeping itinerary semantic hashes stable for retrieval-time-only changes.
- [ ] Require normal approval only when content changes; never silently rewrite after a new closure.
- [ ] Run revision, scope, interruption, and revision smoke suites.

### Task 10: Member/public evidence presentation and version-pinned exports

**Files:**

- Modify: `packages/schemas/src/index.ts`
- Modify: `src/features/itinerary/components/itinerary-experience.tsx`
- Modify: `src/features/itinerary/components/itinerary-experience.test.tsx`
- Create: `src/features/itinerary/components/evidence-details.tsx`
- Create: `src/features/itinerary/components/evidence-details.test.tsx`
- Modify: `src/features/sharing/public-projection.ts`
- Modify: `src/features/sharing/public-projection.test.ts`
- Modify: `src/features/sharing/components/public-itinerary.tsx`
- Modify: `src/features/exports/ics.ts`
- Modify: `src/features/exports/ics.test.ts`

**Interfaces:**

- Produces: compact member evidence summary/details and privacy-safe public snapshot sources.
- Preserves: selected-version print/ICS content and current public redaction.

- [ ] Write failing tests for Verified label eligibility, provider/last-checked copy, unavailable/stale/conflict states, safe official links, conditions-changed disclaimer, private query/request/coordinate redaction, and exact-version exports.
- [ ] Run targeted tests and confirm failures.
- [ ] Implement accessible details disclosure and compact card badges.
- [ ] Extend public projection with allowlisted labels/links and snapshot publication state only.
- [ ] Keep print and ICS pinned and free of live fetches.
- [ ] Run component, sharing, calendar, print, and accessibility tests.

### Task 11: Deterministic and hosted acceptance harnesses

**Files:**

- Create: `e2e/live-travel-intelligence.spec.ts`
- Create: `scripts/travel-provider-acceptance.mjs`
- Create: `scripts/evidence-snapshot-acceptance.mjs`
- Create: `scripts/revision-evidence-refresh-acceptance.mjs`
- Modify: `package.json`
- Modify: `scripts/with-hosted-acceptance-secrets.mjs`

**Interfaces:**

- Produces: local fake-provider happy/negative E2E and value-redacted live provider smoke records.

- [ ] Write the provider-disabled E2E first and confirm no fake verification appears while publication remains policy-compliant.
- [ ] Add the deterministic national-park flow with closure, route adjustment, weather/daylight warnings, reservation requirement, immutable Version 1 share, refresh, and Version 2.
- [ ] Add bounded acceptance scripts that record only provider, capability, safe request ID, duration, cache status, verification, error class, and attribution requirement.
- [ ] Ensure all scripts use `finally` for acceptance-bypass revocation and disposable-room cleanup.
- [ ] Run local E2E and all three acceptance harnesses against fakes.

### Task 12: Documentation, local gates, commits, and protected acceptance

**Files:**

- Create: `docs/build-week/phase-6a-live-travel-intelligence.md`
- Modify: `README.md`
- Modify: `docs/build-week/preview-acceptance.md`
- Modify: `docs/build-week/production-readiness-audit.md`
- Modify: `docs/build-week/submission-checklist.md`
- Modify: `docs/build-week/codex-collaboration-log.md`
- Modify: `docs/production/provider-reliability.md`
- Modify: `docs/production/revision-scope-contract.md`

**Interfaces:**

- Produces: complete Phase 6A evidence, unsupported-capability list, hosted result, and four verdicts.

- [ ] Update all required documents with implemented providers, terms, freshness, cache, source priority, privacy, operations, unsupported capabilities, Phase 6B deferral, and OpenWeather entitlement status.
- [ ] Run formatting, lint, typecheck, unit tests, local build, database reset, all pgTAP, all Playwright, provider/snapshot/revision/interruption/quota/accessibility acceptance, database lint/advisors, dependency audit, diff check, secret scan, client-bundle scan, and route-manifest review.
- [ ] Commit verified changes by evidence/adapters, integration, tests, and documentation; push only after each concern's relevant gates pass.
- [ ] Configure only the protected `hosted-acceptance` environment and deploy no Production target or unrestricted domain.
- [ ] Run value-redacted live provider smokes and the complete protected two-user flow; preserve degraded weather if OpenWeather still returns unauthorized.
- [ ] Revoke temporary bypass in `finally`, confirm provider/recovery backlogs and bypass count are zero, and record the exact protected deployment evidence.
- [ ] Return the requested 29-part report, four verdicts, git status, and diff stat; stop before Phase 6B.
