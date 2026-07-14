# Phase 4A Itinerary Revisions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build explicit, approval-gated itinerary revisions that publish immutable next versions while preserving every historical plan.

**Architecture:** A distinct revision aggregate snapshots a current published plan, produces an immutable verified analysis, gathers version-scoped approval, creates a separate full candidate itinerary, reuses Phase 3B validation plus a deterministic change-boundary validator, gathers final candidate confirmation, and atomically publishes exactly the next room version. Public safe projections and semantic invalidations sit over private model/evidence/validation/run records.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Zod 4, OpenAI Node SDK 6.46, Supabase/PostgreSQL/RLS/Realtime, Vitest, pgTAP, Playwright.

## Global Constraints

- Work on `main` from `d9bce9c`; do not commit or push.
- Published trip plans and published analysis versions are immutable.
- Ordinary chat never starts a revision; only explicit application actions do.
- All model routing, materiality, validation, approvals, staleness, and publication decisions are application-owned.
- Candidate publication always requires full Phase 3B PASS, boundary PASS, analysis approval, and final confirmation.
- No raw prompts, reasoning, model outputs, provider identifiers, usage, private evidence, auth IDs, SQL errors, or validation internals cross the safe browser boundary.

---

### Task 1: Strict revision contracts and deterministic domain rules

**Files:**

- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/index.test.ts`
- Create: `src/features/revisions/materiality.ts`
- Create: `src/features/revisions/materiality.test.ts`
- Create: `src/features/revisions/diff.ts`
- Create: `src/features/revisions/diff.test.ts`
- Create: `src/features/revisions/validation/change-boundary.ts`
- Create: `src/features/revisions/validation/change-boundary.test.ts`

**Interfaces:** strict `PlanChange*` Zod schemas/types; `classifyChangeMateriality`; `buildPlanVersionDiff`; `validateChangeBoundary`.

- [ ] Add failing schema tests for enums, strict unknown-field rejection, bounded safe text, target rules, impacts, approvals, version summaries, and diff operations.
- [ ] Run the focused schema tests and confirm missing exports fail.
- [ ] Implement only the strict contracts required by the tests.
- [ ] Add failing materiality tests proving deterministic severity floors and no model downgrade, then implement the classifier.
- [ ] Add failing diff/boundary tests for stable IDs, approved moves, disclosed downstream timing, unrelated rewrites, destination/date drift, confirmed-decision removal, rejected-option addition, and unreported changes; implement and refactor green.

### Task 2: Revision database, RLS, RPCs, leases, and version publication

**Files:**

- Create: `supabase/tests/phase_4a_itinerary_revisions.test.sql`
- Create: timestamped migration from `pnpm exec supabase migration new phase_4a_itinerary_revisions`
- Modify: `src/types/database.ts`

**Interfaces:** authenticated create/review/cancel/confirm/history/version/compare RPCs; service-only analysis/candidate/validation/publication/run/evidence/recovery RPCs.

- [ ] Write pgTAP failures covering unauthenticated/outsider/spoof/inactive/current-base/target/idempotency/direct-DML/immutability/approval/stale/candidate/PASS/confirmation/version/history/private/recovery behavior.
- [ ] Reset the database and confirm Phase 4A SQL fails because objects do not exist.
- [ ] Add enums, public/private tables, foreign keys, composite/partial indexes, RLS, forced RLS, immutable triggers, safe broadcast trigger, and minimum grants in one new migration.
- [ ] Implement identity-bound creation, immutable analysis completion, deterministic approval calculation, candidate claims/attachment, final confirmation, stale checks, history/compare projections, cancellation, and leased recovery with `search_path = ''`.
- [ ] Implement atomic publication with consistent room/request/base/candidate locks, exact next-version uniqueness, prior-version preservation, and safe invalidation.
- [ ] Reset and run focused SQL until green; update generated application database types without editing prior migrations.

### Task 3: Model providers, routing, prompts, context, repository, and worker

**Files:**

- Create: `src/features/revisions/prompts/change-analysis.ts`
- Create: `src/features/revisions/prompts/itinerary-revision.ts`
- Create: `src/features/revisions/provider.ts`
- Create: `src/features/revisions/openai-provider.ts`
- Create: provider tests
- Create: `src/features/revisions/context.ts` and tests
- Create: `src/features/revisions/repository.ts`
- Create: `src/features/revisions/worker.ts` and tests
- Create: `src/features/revisions/scheduler.ts`

**Interfaces:** deterministic `routeChangeAnalysisModel`; strict analysis/generate/repair providers; `processPlanChange` recoverable state machine.

- [ ] Add failing tests for Terra/Sol routing, exact model/settings, prompt boundaries, safe usage extraction, timeout/error mapping, no tools, and fake-provider fixtures.
- [ ] Implement versioned prompts and strict Responses parsing with `store: false`, safety identifier, bounded output, timeout, and abort support.
- [ ] Add failing context tests for bounded base/analysis/evidence data and exclusion of transcript/auth/invite/private run data; implement.
- [ ] Add failing worker tests for analysis verification, approval gate, affected evidence refresh, complete candidate generation, Phase 3B validation reuse, one repair, boundary block, candidate readiness, and recovery reuse; implement state machine and scheduler.

### Task 4: Authenticated actions and safe projections

**Files:**

- Create: `src/features/revisions/actions.ts`
- Create: `src/features/revisions/actions.test.ts`
- Modify: `src/features/itinerary/actions.ts`

**Interfaces:** create/review/cancel/confirm/list/get/compare Server Actions returning a closed safe error union and scheduling only after successful RPC creation.

- [ ] Write failing action tests for strict input, identity, participant spoofing, stale/version errors, idempotent reuse, safe projections, and no model calls from browser code.
- [ ] Implement actions with the request-scoped Supabase client and explicit error mapping.
- [ ] Prove focused action tests green and no service credentials enter client bundles.

### Task 5: Revision, confirmation, history, and compare UI

**Files:**

- Create: focused components and component tests under `src/features/revisions/components/`
- Modify: `src/features/itinerary/components/itinerary-experience.tsx`
- Modify: `src/features/planning/components/plan-experience.tsx`
- Modify: `src/features/trips/components/trip-shell.tsx` only if safe Realtime invalidation wiring requires it

**Interfaces:** explicit request form; item-level target action; analysis review; progress; final diff confirmation; version rail/history; compare; read-only historical plan.

- [ ] Write failing component tests for every state, action label, approval status, blocked/stale copy, exact diff rendering, history/current badge, read-only history, keyboard behavior, and mobile layout hooks.
- [ ] Implement the explicit request form and item targets without parsing ordinary chat.
- [ ] Implement analysis approval, semantic progress, final confirmation, history/version/compare controls, and accessible read-only historical rendering.
- [ ] Add private room Broadcast invalidation refetch while retaining polling recovery; schema-validate every payload.
- [ ] Run component tests, critique responsive focus/overflow/copy, and refactor green.

### Task 6: Integration, deterministic E2E, live smoke, and documentation

**Files:**

- Create: `e2e/itinerary-revisions.spec.ts`
- Create: `scripts/revision-smoke.mjs`
- Modify: `package.json`
- Modify: requested README and Build Week documents
- Create: `docs/build-week/itinerary-revisions.md`
- Create: `docs/build-week/plan-versioning.md`

**Interfaces:** `pnpm test:revision:smoke`; deterministic fake revision and one-repair browser scenario.

- [ ] Add the failing two-user E2E covering all-active analysis approval, candidate repair, two-user confirmation, Version 2 publication/history/compare, duplicate suppression, outsider denial, stale Version 1 request, scope block, chat continuity, mobile, network boundaries, and clean console.
- [ ] Implement only the missing orchestration/fixtures needed to make the full real-local E2E green.
- [ ] Add optional live smoke that exits without claiming success when `OPENAI_API_KEY` is absent and is never included in CI.
- [ ] Update every requested document with lifecycle, security, routing, validation, recovery, versioning, deferred scope, and actual smoke status.

### Task 7: Complete verification and security review

- [ ] Run focused red-to-green tests during each task and record counts.
- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build:local`.
- [ ] Run local reset, all pgTAP, database lint, and security advisors.
- [ ] Run `pnpm test:e2e` and a real CLI browser pass at 390×844 with console/network inspection.
- [ ] Run `git diff --check`, secret scan, dependency audit, and production-build fake-control inspection.
- [ ] Run `pnpm test:revision:smoke` only when a real OpenAI key exists.
- [ ] Run final `git status` and inclusive `git diff --stat`; do not commit or push.
- [ ] Report every requested result, exact command, count, warning, skipped live gate, security finding, and uncommitted file/stat summary.
