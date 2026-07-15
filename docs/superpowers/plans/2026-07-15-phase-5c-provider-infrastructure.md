# Phase 5C Provider Reliability and Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish bounded provider reliability, durable recovery, and truthful protected infrastructure acceptance without launching unrestricted Production.

**Architecture:** Centralize server-only timeout/retry/deadline policy and safe provider attempt telemetry, keep claims and publication database-atomic, and exercise external controls only in protected non-production environments. Separate implemented, configured, tested, and accepted states in every report.

**Tech Stack:** Next.js 16 App Router, TypeScript 6, OpenAI SDK 6, Supabase Auth/PostgreSQL/Realtime, Vercel Fluid Compute/Cron/Firewall, Cloudflare Turnstile, Vitest, pgTAP, Playwright, axe-core.

## Global Constraints

- Work on `main` from `a9e076815f8bb9406ec05930545b860660f3f2d0`.
- Do not add Phase 6 travel intelligence, maps, guest collaboration, booking, or other major product features.
- Do not deploy unrestricted Production traffic or remove Vercel Authentication.
- Use disposable rooms and isolated non-production infrastructure; never use the accepted demo room or production customer data.
- Never record raw prompts, user content, credentials, cookies, share tokens, provider payloads, or raw IP addresses.
- All behavioral changes use test-first red-green-refactor cycles; commits contain only freshly verified concern groups.

---

### Task 1: Central workflow reliability policy

**Files:**

- Create: `src/server/ai/reliability-policy.ts`
- Test: `src/server/ai/reliability-policy.test.ts`
- Modify: `src/server/env.ts`
- Test: `src/server/env.test.ts`
- Modify: `src/server/ai/openai-client.ts`

**Interfaces:** Produces `parseWorkflowReliabilityPolicy(source)`, `classifyProviderFailure(error)`, `computeRetryDelay(policy, attempt, random)`, and `runProviderAttempt(input, operation)` with stage and total abort propagation.

- [ ] Write failing tests for defaults, environment lower/upper bounds, every workflow stage, total deadline, lease duration, attempt caps, retryable/non-retryable classes, timeout classification, capped exponential delay, injected jitter, exhausted retries, and caller abort.
- [ ] Run `pnpm test src/server/ai/reliability-policy.test.ts src/server/env.test.ts` and confirm failures are caused by the absent centralized policy.
- [ ] Implement the minimal typed policy/executor, set OpenAI SDK `maxRetries: 0`, and remove duplicate timeout parsing from the OpenAI environment result.
- [ ] Rerun the focused tests and `pnpm typecheck`; refactor only while green.
- [ ] Commit the verified reliability-policy slice.

### Task 2: Workflow integration and provider-safe errors

**Files:**

- Modify: `src/server/ai/provider.ts`, `src/server/ai/openai-provider.ts`
- Modify: `src/features/memory/{provider,openai-provider,worker,scheduler}.ts`
- Modify: `src/features/planning/{provider,openai-provider,worker,scheduler}.ts`
- Modify: `src/features/itinerary/{provider,openai-provider,worker,scheduler}.ts`
- Modify: `src/features/revisions/{provider,openai-provider,worker,scheduler}.ts`
- Test: corresponding `*.test.ts` files under those directories.

**Interfaces:** All provider stages consume the central policy, stable operation keys, total deadlines, and the shared safe failure taxonomy; provider timeout is distinct from invalid output and deterministic validation.

- [ ] Add failing fault-injection tests for provider 5xx/unavailable, reset, rate limit, timeout, invalid schema, hard validation, stale basis, quota rejection, disabled AI, attempt exhaustion, and insufficient remaining deadline.
- [ ] Verify red failures with focused Vitest commands.
- [ ] Integrate the executor with focused, memory, planning, itinerary generation/repair, revision analysis/candidate/repair paths and remove `AbortSignal.timeout` magic numbers.
- [ ] Verify one bounded application retry at most, no nested SDK retries, and safe error copy with human chat/published plans still available.
- [ ] Commit the verified workflow-integration slice.

### Task 3: Durable attempts, quota reconciliation, and exactly-once state

**Files:**

- Create through `pnpm exec supabase migration new phase_5c_provider_infrastructure`: one Phase 5C migration under `supabase/migrations/`
- Create: `supabase/tests/phase_5c_provider_infrastructure.test.sql`
- Modify: `src/types/database.ts`
- Modify: workflow repositories under `src/features/{memory,planning,itinerary,revisions}/repository.ts`
- Modify: `src/server/ai/quota.ts`

**Interfaces:** Database functions provide unique workflow-attempt identity, lease ownership/expiry, idempotent provider-result persistence, one-time usage reconciliation, and atomic publication.

- [ ] Write pgTAP failures for attempt uniqueness, concurrent claims, lease expiry, capped attempts, result replay, one reservation/reconciliation, release on terminal failure, duplicate recovery, one plan Version N, one revision Version N+1, stale-base fail-closed, cron/cleanup lease overlap, safe alert payload, and private-table denial.
- [ ] Run the focused pgTAP file and confirm failures reflect missing Phase 5C objects or invariants.
- [ ] Generate the migration with the Supabase CLI, implement locked functions/indexes/grants with empty `search_path`, and update repository calls/types.
- [ ] Run database reset, focused/full pgTAP, schema lint, security advisors, performance advisors, and query plans before retaining any new index.
- [ ] Commit the verified durability/database slice.

### Task 4: Safe telemetry and alert delivery

**Files:**

- Create: `src/server/operations/alerts.ts`
- Test: `src/server/operations/alerts.test.ts`
- Modify: `src/server/operations/logger.ts`, `src/server/operations/logger.test.ts`
- Modify: `src/server/ai/logger.ts`
- Modify: `src/app/api/internal/{recovery,anonymous-cleanup}/route.ts`

**Interfaces:** Produces an allowlisted `OperationalAlert`, environment-separated delivery adapter, owner/severity/escalation metadata, and per-attempt safe metrics without content.

- [ ] Add failing tests for PII/token/cookie/share/provider-payload redaction, metric classifications, environment separation, delivery success/failure, health/cron/recovery/quota/CAPTCHA/abuse events, and no alert recursion.
- [ ] Implement the minimal alert adapter and instrument provider attempts, backlog age, failed recovery, quota rejection, CAPTCHA failure, abuse spike, database/Realtime failure, share anomaly, cron failure, and health failure.
- [ ] Run synthetic local delivery to a test adapter; configure a real destination only when its endpoint and owner are available.
- [ ] Commit only after focused tests and a genuine hosted delivery receipt where the commit claims hosted acceptance.

### Task 5: Reliability and interruption acceptance harnesses

**Files:**

- Create: `scripts/provider-reliability-acceptance.mjs`
- Create: `scripts/workflow-interruption-acceptance.mjs`
- Create: `scripts/quota-acceptance.mjs`
- Add focused tests under `src/server/ai/` for report aggregation/redaction.

**Interfaces:** Harnesses accept protected base URL and disposable identifiers, emit redacted JSON evidence, enforce bounded run counts, and refuse the accepted demo room.

- [ ] Add failing tests for exact sample ceilings, required evidence fields, no content fields, range-vs-percentile reporting, disposable-room guard, quota no-call proof, and concurrent recovery exactly-once checks.
- [ ] Implement the bounded harnesses for focused 3, memory 3, planning 2, itinerary 2, forced repair 1, revision analysis 2, and revision candidate 2 runs.
- [ ] Add interruption points after claim, after provider persistence, before candidate-ready, and concurrent recovery invocation.
- [ ] Run deterministic local harness tests before any real OpenAI invocation.

### Task 6: Turnstile, cron, WAF, and environment acceptance

**Files:**

- Modify: `src/features/security/captcha.ts`, `src/features/security/captcha-server.ts`, and their tests only if acceptance reveals a defect.
- Modify: `vercel.json` or migrate to `vercel.ts` only when official Vercel configuration and the current project support the selected control.
- Create: `scripts/infrastructure-acceptance.mjs`
- Update: `docs/production/waf-bot-protection.md`, `docs/production/monitoring-alerts.md`.

**Interfaces:** The harness proves real Turnstile create/join/single-use behavior, cron secret/overlap/summaries, WAF burst rejection, and legitimate two-user success without exposing secrets.

- [ ] Inventory Preview/custom/Production environment variables and protections without printing values; verify test bypass is absent from hosted real-Turnstile environments.
- [ ] Configure a domain-restricted Turnstile widget and Supabase Auth CAPTCHA only for protected Preview/staging, then test valid, invalid, expired, reused, and direct-RPC bypass cases on desktop, mobile, and keyboard.
- [ ] Use an isolated protected Production-type project with separate Supabase data for cron only if it can be created without public traffic; otherwise retain manual invocation as unaccepted cron evidence.
- [ ] Configure least-privilege Vercel Firewall/bot/rate/request controls, test burst and false-positive recovery, and preserve Vercel Authentication.
- [ ] Teardown or disable temporary infrastructure and record status.

### Task 7: Provider budget, backup, restore, and external operations

**Files:**

- Create: `docs/production/cost-controls.md`
- Create: `docs/production/restore-drill.md`
- Modify: `docs/production/backup-restore.md`, `docs/production/incident-response.md`, `docs/production/operations-runbook.md`.

**Interfaces:** Evidence records configured yes/no, owner, alert type, tested delivery, retention, backup time, PITR availability, measured RPO/RTO, restore target, Auth limitation, and teardown without sensitive amounts or credentials.

- [ ] Inspect OpenAI project budget/usage alerts and run a safe notification test; record no provider call after application quota rejection and the emergency response.
- [ ] Inspect hosted Supabase plan/backup/PITR status; initiate restore only to an isolated non-production target supported by the plan.
- [ ] Verify schema, migrations, selected data, RLS/grants, Realtime policies, Auth implications, application connection, and minimal create/join/chat/plan-read smoke.
- [ ] Leave each unavailable or unperformed external operation explicitly blocked.

### Task 8: Bounded load and manual accessibility

**Files:**

- Create: `scripts/load-acceptance.mjs`
- Create: `docs/production/load-test-report.md`
- Create: `docs/production/manual-accessibility-report.md`
- Modify: `e2e/accessibility.spec.ts` and affected components only for reproduced defects.

**Interfaces:** Load results contain tested envelope, throughput/latency/error/connection/lock/rate-limit evidence; accessibility results contain browser/OS, result, defect, severity, fix, and retest.

- [ ] Implement bounded deterministic-provider scenarios for 1,000 chat messages, Realtime churn, concurrent planning/itinerary/revision/share/lifecycle races, and provider-disabled quota paths.
- [ ] Capture p50/p95/p99 only for meaningful sample sizes and inspect slow queries/connections/locks before adding indexes.
- [ ] Run VoiceOver, keyboard-only, 200%/400% zoom, reduced motion, themes, 390x844, public share/print/CAPTCHA/deletion/revision/progress/focus matrix.
- [ ] Fix critical/serious issues test-first; document medium/low findings honestly.

### Task 9: Security and full quality gates

**Files:** All Phase 5C changes.

- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:local`, local Supabase reset/full pgTAP, `pnpm test:e2e`, accessibility tests, database lint, linked/local security and performance advisors, functioning dependency audit, and `git diff --check`.
- [ ] Run secret, client-bundle, source-route, and built-route manifest scans; inspect service-role use and health/log/alert payloads.
- [ ] Re-review Turnstile/RPC bypass, cron secret, alert leakage, quota/double-charge, recovery/double-publication, protected staging, backup exposure, WAF bypass, load containment, share-token leakage, and client secrets.
- [ ] Reproduce every discovered defect with a focused failing test before fixing it, then rerun affected and full gates.

### Task 10: Hosted regression, documentation, commits, and verdicts

**Files:**

- Create: `docs/build-week/phase-5c-provider-infrastructure.md`
- Create: `docs/production/provider-reliability.md`, `docs/production/timeout-retry-policy.md`, `docs/production/waf-bot-protection.md`, `docs/production/monitoring-alerts.md`
- Modify: requested build-week acceptance/audit/checklist/collaboration files and Phase 5B hardening record.

- [ ] Run the bounded real OpenAI suite, real Turnstile flow, interruption recovery, cron, budget alert, external alert, WAF, restore smoke, load, manual accessibility, and full protected acceptance regression only in their authorized protected environments.
- [ ] Record every environment's purpose, Vercel project/type, Supabase project, data class, access protection, secret scope, and teardown status.
- [ ] Report observed ranges when samples are too small for percentiles and never promote planned/configured controls to accepted evidence.
- [ ] Commit verified changes by concern, push `main` after fresh validation, report every commit, and leave unrestricted Production undeployed.
- [ ] Return the complete 23-item report and the four independent verdicts with final `git status` and diff stat.
