# Phase 5D Revision Scope Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Constrain every approved revision to an application-owned manifest, publish a safe immutable Version 2 in protected Preview, and preserve the existing fail-closed validator.

**Architecture:** Derive and persist a canonical manifest and patch from the immutable base; deterministically apply narrow operations and send only semantic gaps through constrained model generation. Feed canonical comparison into preservation, diff, and boundary checks, with one separately persisted scope-restoration attempt before terminal blocking.

**Tech Stack:** TypeScript, Zod, Vitest, Next.js App Router, PostgreSQL/pgTAP, Supabase, Playwright, OpenAI Responses API, Vercel protected custom Preview.

## Global Constraints

- Work on `main` from `c388ab2`.
- Do not weaken `change_scope_exceeded` or accept unrelated drift.
- Do not reclassify or broaden an approved request.
- Do not mutate a published plan or publish a blocked candidate.
- Do not begin Phase 6 or deploy unrestricted Production.
- Use one bounded scope repair and one independently bounded conflict repair.
- Persist safe structured artifacts only; never raw prompts, raw model output, or private messages.

---

### Task 1: Schemas and canonical semantic comparison

**Files:**

- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/index.test.ts`
- Create: `src/features/revisions/semantic-comparison.ts`
- Create: `src/features/revisions/semantic-comparison.test.ts`

**Interfaces:**

- Produces: `revisionAllowedChangeManifestV1Schema`, `revisionPatchV1Schema`, their inferred types, `canonicalizeRevisionValue`, `semanticHash`, and plan/item/day/top-level comparison helpers.

- [ ] Write failing schema tests for exact versions, operations, bounds, field maps, patch operations, and strict rejection of unknown/expanded values.
- [ ] Run `pnpm vitest run packages/schemas/src/index.test.ts src/features/revisions/semantic-comparison.test.ts` and confirm failures are caused by missing exports.
- [ ] Implement strict Zod schemas plus deterministic key ordering and volatile-evidence timestamp removal.
- [ ] Verify the focused tests pass and refactor only while green.

### Task 2: Manifest derivation, protected snapshot, and patch application

**Files:**

- Create: `src/features/revisions/manifest.ts`
- Create: `src/features/revisions/manifest.test.ts`
- Create: `src/features/revisions/patch.ts`
- Create: `src/features/revisions/patch.test.ts`
- Modify: `src/features/revisions/test-fixtures.ts`

**Interfaces:**

- Produces: `deriveAllowedChangeManifest`, `buildProtectedRevisionSnapshot`, `deriveDeterministicRevisionPatch`, `validateRevisionPatch`, and `applyRevisionPatch`.

- [ ] Write failing tests for the canonical kayaking removal, request-type/maxima ownership, protected IDs/hashes, connected route cleanup, allowed timing/cost changes, and forbidden item/day/top-level changes.
- [ ] Run focused tests and confirm missing-interface failures.
- [ ] Implement deterministic derivation and patch application for remove/move/reschedule/duration/note operations with stable-ID preservation.
- [ ] Run focused tests and retain the smallest passing implementation.

### Task 3: Preservation contract, diff consistency, and boundary coverage

**Files:**

- Create: `src/features/revisions/validation/preservation-contract.ts`
- Create: `src/features/revisions/validation/preservation-contract.test.ts`
- Modify: `src/features/revisions/diff.ts`
- Modify: `src/features/revisions/diff.test.ts`
- Modify: `src/features/revisions/validation/change-boundary.ts`
- Modify: `src/features/revisions/validation/change-boundary.test.ts`

**Interfaces:**

- Produces: `validateCandidatePreservation`; updates `validateChangeBoundary` to consume a manifest and the shared semantic comparison.

- [ ] Write failing tests for protected description rewrite, reorder, destination/date/logistics/lodging/food/routes/cost/public-summary drift, timestamp-only evidence, formatting normalization, declared timing effects, and exact diff parity.
- [ ] Run focused tests and confirm the new assertions fail against v1 behavior.
- [ ] Implement the preservation report and boundary v2 without removing or lowering existing checks.
- [ ] Run focused tests and confirm both legacy and new cases pass.

### Task 4: Prompt/context contracts and revision routing

**Files:**

- Modify: `src/features/revisions/prompts/itinerary-revision.ts`
- Create: `src/features/revisions/prompts/revision-patch.ts`
- Create: `src/features/revisions/prompts/revision-prompts.test.ts`
- Modify: `src/features/revisions/context.ts`
- Modify: `src/features/revisions/context.test.ts`
- Modify: `src/features/revisions/routing.ts`
- Modify: `src/features/revisions/routing.test.ts`
- Modify: `src/features/revisions/openai-provider.ts`
- Modify: `src/features/revisions/openai-provider.test.ts`
- Modify: `src/features/revisions/provider.ts`

**Interfaces:**

- Produces prompt versions `trailie-revision-patch-v1`, `trailie-itinerary-revision-v2`, and `trailie-revision-scope-repair-v1`; adds deterministic/constrained-Sol routing and strict patch/scope-repair provider calls.

- [ ] Write failing tests for explicit manifest/hash/base hash/protected IDs/editable fragments, no unnecessary chat/private memory, blocked-within-scope behavior, and deterministic removal routing.
- [ ] Run focused tests and observe expected version/context/routing failures.
- [ ] Implement versioned prompts, bounded contexts, provider schemas, and route selection.
- [ ] Verify all revision provider/context/routing tests pass.

### Task 5: Worker flow and separate scope repair

**Files:**

- Modify: `src/features/revisions/worker.ts`
- Modify: `src/features/revisions/worker.test.ts`
- Modify: `src/features/revisions/scheduler.ts`
- Modify: `src/features/revisions/repository.ts`

**Interfaces:**

- Consumes: manifest/patch/preservation APIs from Tasks 1–4.
- Produces: patch-first deterministic candidate construction, one scope-repair path, separate counters, and durable replay checkpoints.

- [ ] Write failing worker tests for deterministic no-Sol removal, first drift/restoration, second drift/block, conflict repair separation, provider-result replay, patch replay, and no duplicate application.
- [ ] Run `pnpm vitest run src/features/revisions/worker.test.ts` and confirm behavioral failures.
- [ ] Refactor generation into durable manifest → patch → candidate → preservation → boundary/full validation stages; use the base plan for scope restoration.
- [ ] Verify focused worker/repository tests pass with no third attempt.

### Task 6: Immutable database artifacts and recovery

**Files:**

- Create: the timestamped `phase_5d_revision_scope_reliability.sql` path returned by `pnpm exec supabase migration new phase_5d_revision_scope_reliability`
- Create: `supabase/tests/phase_5d_revision_scope_reliability.test.sql`
- Modify: `src/types/database.ts`

**Interfaces:**

- Produces: forced-RLS private manifest/patch/scope-report tables and narrow service RPCs for immutable completion, claims, counters, and replay.

- [ ] Use `pnpm exec supabase migration new phase_5d_revision_scope_reliability` to obtain the migration name.
- [ ] Write failing pgTAP coverage for immutable artifacts, base/hash/analysis identity, stale rejection, one patch, one scope repair, private denial, concurrency-safe claims, quota-once, candidate-once, and publication-once.
- [ ] Run a fresh local reset/test and confirm Phase 5D assertions fail for missing objects.
- [ ] Implement tables, forced RLS, narrow grants, empty-search-path functions, and immutable triggers/RPC updates.
- [ ] Regenerate database types using the repository’s established command and verify fresh reset plus all pgTAP tests.

### Task 7: Failure UX and deterministic browser acceptance

**Files:**

- Modify: `src/features/revisions/components/revision-experience.tsx`
- Create or modify: `src/features/revisions/components/revision-experience.test.tsx`
- Modify: `e2e/itinerary-revisions.spec.ts`
- Modify: `e2e/hosted-acceptance.spec.ts`

**Interfaces:**

- Produces safe exhausted/success copy and canonical remove-item positive/negative E2E scenarios.

- [ ] Write failing component and E2E assertions for safe copy/actions, repair success notice, exact removal diff, two confirmations, Version 1 immutability, and second-violation blocking.
- [ ] Run focused component/E2E tests and confirm expected failures.
- [ ] Implement the UI projections and deterministic fake-provider drift/repair fixtures.
- [ ] Verify the focused component and revision Playwright scenarios.

### Task 8: Interruption, quota, and provider acceptance harnesses

**Files:**

- Modify: `scripts/provider-reliability-acceptance.mjs`
- Modify: `scripts/revision-smoke.mjs`
- Modify: `src/server/acceptance/provider-reliability.test.ts`
- Modify: relevant interruption/quota acceptance tests discovered from `package.json`.

**Interfaces:**

- Produces safe counts for candidate attempts, scope/conflict repair, durations/tokens/diffs/hashes, and recovery checkpoints without private content.

- [ ] Add failing acceptance assertions for all five interruption points and separate scope/provider failure classification.
- [ ] Run the focused harness tests and confirm missing metadata/state failures.
- [ ] Implement bounded safe telemetry and replay behavior.
- [ ] Verify provider, interruption, and quota acceptance commands pass locally.

### Task 9: Full local release gates

**Files:**

- Modify only files required by failures attributable to Phase 5D.

- [ ] Run formatting, lint, typecheck, unit/component, fresh database reset/tests, full and revision E2E, provider/interruption/quota/accessibility acceptance, build, database lint/advisors, dependency audit, diff check, secret/client-bundle scans, and route-manifest review.
- [ ] Fix each attributable failure test-first and rerun its focused proof before rerunning the complete gate.
- [ ] Record exact counts and remaining informational findings.

### Task 10: Protected Preview reacceptance and repeatability

**Files:**

- Modify: `e2e/hosted-acceptance.spec.ts` only if a test defect is proved locally first.

- [ ] Confirm environment scope and Vercel Authentication, create a one-run bypass, and ensure revocation in `finally`.
- [ ] Deploy only to the custom protected `hosted-acceptance` Preview and inspect readiness.
- [ ] Run the complete 23-step real-provider regression and record safe calls/attempts/repairs/durations/tokens/diffs/hashes/database invariants.
- [ ] Run a fresh second narrow revision case, verify Version 2 and no drift, then check zero recovery backlog, share/history, logs/privacy, and bypass count zero.

### Task 11: Documentation, commits, and final report

**Files:**

- Create: `docs/build-week/phase-5d-revision-scope-reliability.md`
- Create: `docs/production/revision-scope-contract.md`
- Modify: `docs/build-week/phase-5c-provider-infrastructure.md`
- Modify: `docs/build-week/preview-acceptance.md`
- Modify: `docs/build-week/production-readiness-audit.md`
- Modify: `docs/build-week/submission-checklist.md`
- Modify: `docs/build-week/codex-collaboration-log.md`

- [ ] Update documentation with architecture, unchanged-validator statement, exact local/hosted evidence, blockers, and three verdicts.
- [ ] Run the final complete verification gate plus `git status`, `git diff --check`, diff stat, secret scan, and deployment/bypass checks.
- [ ] Create logical commits only from verified changes, report every commit, push `main`, and confirm local/remote equality and clean status.
- [ ] Return the requested 21-part report and stop without Phase 6 or Production deployment.
