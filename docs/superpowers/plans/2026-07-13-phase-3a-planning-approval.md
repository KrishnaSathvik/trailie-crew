# Phase 3A Planning Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute inline with test-driven development. Multi-agent execution is prohibited for this phase.

**Goal:** Build a secure, immutable, approval-gated “Before I build the trip” summary workflow without itinerary generation.

**Architecture:** Public RLS-protected review records expose safe state while private SECURITY DEFINER claims and server-only workers assemble private context and call OpenAI. Deterministic application/database rules own readiness, staleness, identity, and approval completion.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase/Postgres/Realtime, Zod, OpenAI Node SDK 6.46, Vitest, pgTAP, Playwright.

## Global Constraints

- Work on `main` from `b0f1330`; do not commit or push.
- Model `gpt-5.6-sol`; prompt `trailie-planning-summary-v1`; strict schema version `1`; `store:false`; no tools or itinerary calls.
- Use test-first red-green cycles and run all requested quality gates.
- Private memory and AI operations remain server-only; all SECURITY DEFINER functions use `search_path=''` and minimum grants.

### Task 1: Strict planning contracts and deterministic policy

**Files:** Modify `packages/schemas/src/index.ts`, `packages/schemas/src/index.test.ts`; create `src/features/planning/readiness.ts`, `staleness.ts`, `context.ts` and focused tests.

- [ ] Add failing strict-schema tests for every required status, section, evidence, approval, and public request view.
- [ ] Verify red, then add closed Zod contracts with bounded arrays/text and fixed title.
- [ ] Add failing readiness/staleness/context tests, verify red, then implement deterministic code that cannot be overridden by model readiness.
- [ ] Verify focused tests green.

### Task 2: Secure planning persistence

**Files:** Create a timestamped migration and `supabase/tests/phase_3a_planning_approval.test.sql`; update `src/types/database.ts`.

- [ ] Write pgTAP tests first for RLS, identity, idempotency, immutable versions, approval modes, staleness, and zero itinerary/message effects.
- [ ] Verify SQL red against the Phase 2B schema.
- [ ] Add enums, tables, indexes, explicit grants/policies, secure public RPCs, private service wrappers, row locking, immutable-summary triggers, and planning run metadata.
- [ ] Extend Phase 2B claim semantics for stale queued/running recovery within the retry cap.
- [ ] Reset the database and make focused SQL tests green; run lint/advisors.

### Task 3: Provider, worker, recovery, and actions

**Files:** Create focused modules under `src/features/planning/`; modify environment, OpenAI client integration, and memory repository/worker as required.

- [ ] Write failing fake-provider, OpenAI request-shape, worker, retry, duplicate-claim, recovery, and action tests.
- [ ] Implement bounded context, versioned prompt, strict `text.format`, high reasoning, timeout, safe errors, usage capture, and one schema-repair retry.
- [ ] Implement create/review/revise/query Server Actions and best-effort `after()` scheduling with server-only drain utilities.
- [ ] Verify no itinerary provider path or Trailie message persistence is referenced.

### Task 4: Plan UI and safe updates

**Files:** Create Plan components/tests; modify `src/features/trips/components/trip-shell.tsx` and its tests.

- [ ] Write failing component tests for empty, generating, review sections, approvals, change note, stale, failed/retry, approved, keyboard labels, and mobile navigation.
- [ ] Implement a responsive Plan experience with desktop sidebar and mobile Plan tab, polling/minimal Realtime invalidation, sticky mobile review controls, and safe copy.
- [ ] Verify Chat and focused Trailie behavior remains unchanged.

### Task 5: Test tooling and E2E

**Files:** Remove `src/app/api/test/memory/[roomId]`; add local test helper utilities and Phase 3A Playwright coverage.

- [ ] Write/adjust tests proving production route manifests contain no private-memory inspection route.
- [ ] Move deterministic inspection/drain to the local E2E harness outside the production route tree.
- [ ] Add two-context all-active, host-only, stale/regenerate, failure, duplicate, outsider, refresh, desktop/mobile, light/dark E2E scenarios.
- [ ] Verify no browser OpenAI request, no private-memory browser access, and no itinerary output.

### Task 6: Documentation and release verification

**Files:** Update all requested Build Week docs and add `docs/build-week/planning-approval.md`; add optional smoke script.

- [ ] Document official OpenAI findings, exact versions, lifecycle, readiness, recovery, privacy, limitations, and truthful smoke status.
- [ ] Run format, lint, typecheck, unit, build, reset, pgTAP, E2E, DB lint/advisors, diff check, secret scan, dependency audit, route-manifest check, and smoke only with a real key.
- [ ] Inspect final status and inclusive diff stat; report all evidence without committing or pushing.
