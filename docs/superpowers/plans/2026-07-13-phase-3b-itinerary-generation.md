# Phase 3B Itinerary Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute inline with test-driven development. Multi-agent execution is prohibited for this phase.

**Goal:** Generate, validate, repair when safe, and publish the first immutable itinerary from an approved planning summary.

**Architecture:** Public RLS-protected plan projections expose safe state while private leased workflows own generation, normalized tool evidence, deterministic validation, bounded repair, and atomic publication. The model proposes structured content; application validators and database transactions exclusively decide publication.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase/Postgres/Realtime, Zod 4, OpenAI Node SDK 6.46.0, Vitest, pgTAP, Playwright.

## Global Constraints

- Work on `main` from `c658653`; do not commit or push.
- Model `gpt-5.6-sol`; prompt `trailie-itinerary-v1`; itinerary schema `1`; validator `trailie-itinerary-validator-v1`; `reasoning.effort: high`; `store:false`.
- Maximum one structural repair and one itinerary conflict repair; no semantic review in Phase 3B.
- No model or browser publication, direct browser provider calls, booking, sharing, export, revisions, unrestricted search, or multi-agent orchestration.
- Use test-first red-green cycles and run every requested quality gate.

### Task 1: Strict itinerary contracts

**Files:** Modify `packages/schemas/src/index.ts`, `packages/schemas/src/index.test.ts`.

**Interfaces:** Produces strict `Itinerary`, `ValidationReport`, `TripPlanView`, and progress contracts consumed by all later tasks.

- [ ] Add failing tests for closed enums, timezone/date/time rules, stable IDs, evidence, cost provenance, collection limits, and unsafe fields.
- [ ] Run the focused schema test and confirm failures are caused by missing exports.
- [ ] Add the minimal strict Zod schemas and inferred types.
- [ ] Re-run focused tests and refactor only while green.

### Task 2: Secure plan persistence

**Files:** Create a timestamped migration and `supabase/tests/phase_3b_itinerary_generation.test.sql`; modify `src/types/database.ts`.

**Interfaces:** Produces public plan/event reads and narrow generation RPCs plus private leased recording/publication functions.

- [ ] Add failing pgTAP coverage for authorization, stale approval, blockers, idempotency, RLS, forced private RLS, claims, PASS-only publication, immutability, room isolation, and one room-version update.
- [ ] Reset the Phase 3A database and confirm the focused SQL test fails on absent Phase 3B objects.
- [ ] Create the migration through the Supabase CLI, then add enums, tables, indexes, policies, grants, immutable triggers, and secure transactions with `search_path=''`.
- [ ] Reset and run focused pgTAP until green; run database lint and security advisors.

### Task 3: Travel tools and validation

**Files:** Modify `packages/travel-tools/src/index.ts`; add focused tool tests; create modules/tests under `src/features/itinerary/validation/` and `src/features/itinerary/tools/`.

**Interfaces:** Produces provider-neutral result contracts, deterministic fake fixtures, evidence caching/freshness rules, and `validateItinerary(input): ValidationReport`.

- [ ] Add failing tests for attribution, failures, timeouts, stale cache, fixture cases, and every mandatory deterministic validator.
- [ ] Confirm expected red failures, then implement normalized tools and validator stages in small green slices.
- [ ] Add the route-conflict fixture and confirm it returns `needs_revision`; add an unrepairable approved-decision fixture and confirm `blocked`.
- [ ] Keep unknown provider data explicit and never synthesize live claims.

### Task 4: Provider, context, worker, repair, and recovery

**Files:** Create focused modules/tests under `src/features/itinerary/`; modify `src/lib/env.ts`, scheduler/recovery integration, and scripts.

**Interfaces:** Produces `generate`, `repair`, provider request builders, repository state transitions, one leased worker, and recoverable-stage draining.

- [ ] Add failing tests for approved-only context, strict OpenAI request shape, safe errors, usage, invalid output, one structural repair, conflict repair, retry caps, stage recovery, and publication boundary.
- [ ] Implement prompt `trailie-itinerary-v1`, fake/OpenAI providers, bounded context, timeout/abort, request metadata, and safe error mapping.
- [ ] Implement the worker state machine: claim, draft, evidence, validation, optional one repair, revalidation, publication or safe terminal state.
- [ ] Add optional credential-gated itinerary and travel-tool smoke scripts without CI execution.

### Task 5: Actions, Plan UI, and safe invalidation

**Files:** Create itinerary actions/components/tests; modify planning Plan experience, Trip shell, styles, and room query wiring.

**Interfaces:** Produces approved-only `Generate Itinerary`, safe plan polling/Realtime recovery, semantic progress, and six published subviews.

- [ ] Add failing action/component tests for authorization mapping, duplicate clicks, refresh recovery, progress, published views, repaired-conflict notice, blocked/errors, accessibility, and mobile-safe navigation.
- [ ] Implement server actions that accept only planning request and participant identity and rely on database authorization.
- [ ] Implement the itinerary experience within the existing Plan tab and preserve concurrent Chat behavior.
- [ ] Verify unsafe claims and raw internal issue/evidence/provider data never render.

### Task 6: Real local E2E

**Files:** Add `e2e/itinerary-generation.spec.ts` and local-only helper support outside the production route tree.

**Interfaces:** Exercises real local Auth, Postgres, RLS, RPCs, Realtime, deterministic validation/repair, and immutable publication with fake external providers only.

- [ ] Add the two-member approval-to-generation conflict/repair/publication scenario and confirm its initial red failure.
- [ ] Cover duplicate generation, refresh, chat continuity, outsider denial, stale summary, tool failure, hard-constraint block, and 390x844 layout.
- [ ] Assert clean consoles and no browser OpenAI or privileged travel-provider traffic.
- [ ] Confirm the production route/build manifest exposes no test-only inspection or provider control.

### Task 7: Documentation and release verification

**Files:** Update every requested Build Week document; add `docs/build-week/itinerary-generation.md` and `docs/build-week/travel-tools.md`.

**Interfaces:** Records exact verified versions, lifecycle, security, limitations, fake/live behavior, and truthful smoke status.

- [ ] Update architecture, security, Realtime, approval/memory boundaries, model routing, OpenAI integration, validation, demo, checklist, README, and collaboration log.
- [ ] Run format, lint, typecheck, unit, build, reset, pgTAP, E2E, DB lint/advisors, diff check, secret scan, dependency audit, and production-exposure checks.
- [ ] Run smoke scripts only when matching real credentials exist and report skipped status truthfully otherwise.
- [ ] Inspect final git status and inclusive diff stat; report all results without committing or pushing.
