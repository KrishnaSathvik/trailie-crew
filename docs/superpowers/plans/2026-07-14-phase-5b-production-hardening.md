# Phase 5B Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Trailie Crew from controlled Preview acceptance toward limited-public Production readiness by adding abuse protection, lifecycle controls, durable operations, trust copy, and production evidence without deploying Production.

**Architecture:** Keep authorization and lifecycle invariants in locked PostgreSQL functions, expose only narrow authenticated or service-only RPCs, and orchestrate trusted provider/admin work from Next.js server boundaries. Use Cloudflare Turnstile through Supabase Auth plus a short-lived server-issued database receipt for create/join, database leases for scheduled work, transactional AI allowance reservations, and structured allowlisted operational events.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Auth/PostgreSQL/Realtime, Vercel Fluid Compute and Cron configuration, OpenAI provider boundary, Vitest, pgTAP, Playwright, axe-core.

## Global Constraints

- Work on `main` from base `90e8296`; preserve the accepted Preview flow.
- Do not deploy Production or add travel providers, maps, booking, guest collaboration, or public comments.
- Never expose CAPTCHA secrets, Supabase secret keys, provider keys, cron secrets, share tokens, prompts, private memory, or raw traveler content.
- All new behavior follows test-first red-green-refactor cycles and uses disposable lifecycle data.
- Hosted scheduling, backups, paid monitoring, and legal review remain blocked unless genuine external evidence exists.

---

### Task 1: Database security, CAPTCHA receipts, lifecycle, cleanup, and quotas

**Files:**

- Create: `supabase/migrations/<generated>_phase_5b_production_hardening.sql`
- Create: `supabase/tests/phase_5b_production_hardening.test.sql`
- Modify: `src/types/database.ts`

**Interfaces:**

- Produces authenticated `create_trip`/`join_trip` challenge enforcement, host-only room deletion, account-deletion assessment/finalization, cleanup candidate/lease RPCs, and service-only AI allowance reserve/reconcile RPCs.

- [ ] Write pgTAP failures for CAPTCHA bypass, outsider/member room deletion, share revocation, sole-host deletion block, cleanup eligibility/idempotency, quota concurrency/reconciliation, private-table grants, and global disable.
- [ ] Run the focused pgTAP file and confirm failures are caused by missing Phase 5B objects.
- [ ] Create the migration using `supabase migration new phase_5b_production_hardening`, implement locked functions with `search_path=''`, explicit grants, forced RLS, and conservative cascades.
- [ ] Reset the database, run focused and full pgTAP suites, then regenerate/review database types.
- [ ] Commit the independently passing database slice.

### Task 2: CAPTCHA and trip-entry abuse boundary

**Files:**

- Create: `src/features/security/captcha.ts`
- Create: `src/features/security/captcha.test.ts`
- Create: `src/features/security/components/captcha-challenge.tsx`
- Create: `src/features/security/components/captcha-challenge.test.tsx`
- Modify: `src/lib/supabase/auth.ts`
- Modify: `src/features/trips/actions/trip-actions.ts`
- Modify: `src/features/trips/components/create-trip-form.tsx`
- Modify: `src/features/trips/components/join-trip-form.tsx`
- Modify: `src/features/trips/errors/trip-errors.ts`

**Interfaces:**

- Produces `verifyCaptchaChallenge(token, purpose, userId)` and browser challenge tokens passed to `signInAnonymously({ options: { captchaToken } })` and create/join actions.

- [ ] Add failing tests for required, invalid, expired, unavailable, retry, accessible error, and deterministic adapter states.
- [ ] Verify failures, implement a lazy Turnstile component and server verifier, then pass only a short-lived receipt into protected RPCs.
- [ ] Verify no secret is browser-visible and run trip form/action regressions.
- [ ] Commit the independently passing CAPTCHA slice.

### Task 3: AI emergency controls and transactional quotas

**Files:**

- Create: `src/server/ai/quota.ts`
- Create: `src/server/ai/quota.test.ts`
- Modify: `src/server/env.ts`
- Modify: every focused, memory, planning, itinerary, repair, analysis, and candidate provider-call boundary under `src/features/**`
- Modify: safe error mappers and affected UI tests.

**Interfaces:**

- Produces `reserveAiAllowance`, `reconcileAiAllowance`, and `releaseAiAllowance`; consumes workflow/model/user/room/token estimates and returns safe quota errors.

- [ ] Add failing tests proving disabled generation never calls a provider while chat remains writable, quota categories map safely, and failed calls release reservations.
- [ ] Implement pre-call reservation and post-call reconciliation at each provider boundary with demo-friendly environment defaults.
- [ ] Run focused AI suites and verify model/workflow reporting contains no raw billing or prompt data.
- [ ] Commit the independently passing cost-control slice.

### Task 4: Recovery cron and anonymous cleanup orchestration

**Files:**

- Modify: `src/app/api/internal/recovery/route.ts`
- Modify: `src/server/recovery/drain.ts`
- Create: `src/app/api/internal/anonymous-cleanup/route.ts`
- Create: `src/app/api/internal/anonymous-cleanup/route.test.ts`
- Create: `src/server/lifecycle/cleanup.ts`
- Create: `src/server/lifecycle/cleanup.test.ts`
- Create: `vercel.ts`

**Interfaces:**

- Recovery accepts `CRON_SECRET` or the existing recovery secret in constant time; cleanup supports dry-run and bounded deletion with independent leases.

- [ ] Add failing route/drain tests for GET cron auth, duplicate invocation, one-category failure isolation, stale remainder alert classification, cleanup dry-run, active-user exclusion, and failed deletion retry.
- [ ] Implement bounded drains and typed Vercel cron declarations without activating a Production deployment.
- [ ] Run route, drain, and pgTAP recovery/cleanup tests.
- [ ] Commit the independently passing scheduling slice.

### Task 5: Room deletion, account deletion, and personal export

**Files:**

- Create: `src/features/lifecycle/actions.ts`
- Create: `src/features/lifecycle/actions.test.ts`
- Create: `src/features/lifecycle/components/trip-danger-zone.tsx`
- Create: `src/features/lifecycle/components/trip-danger-zone.test.tsx`
- Create: `src/app/settings/page.tsx`
- Create: `src/features/lifecycle/export.ts`
- Modify: `src/features/trips/components/trip-shell.tsx`

**Interfaces:**

- Server actions enforce exact confirmation phrases, fresh trusted user checks, host rules, admin session revocation/user deletion, idempotency, and a versioned entitled-data JSON export.

- [ ] Add failing unit/component tests for destructive confirmation, cancellation, host/member/outsider paths, sole-host block, transfer/delete resolution, repeat calls, session invalidation, and export allowlisting.
- [ ] Implement server-only actions and accessible danger-zone UI; never serialize other users' private memory or operational records.
- [ ] Run lifecycle unit, component, pgTAP, and disposable E2E coverage.
- [ ] Commit the independently passing lifecycle slice.

### Task 6: Observability and safe health signals

**Files:**

- Modify: `src/server/operations/logger.ts`
- Modify: `src/server/operations/logger.test.ts`
- Create: `src/server/operations/events.ts`
- Create: `src/app/api/internal/health/route.ts`
- Add correlation and alert-worthy metadata to changed routes/actions/workers.

**Interfaces:**

- Produces typed safe event categories with request correlation, workflow/state, latency, usage, retries, recovery age, failures, limits, deletions, and cleanup counts.

- [ ] Add failing redaction and synthetic-failure tests, including nested aliases for messages, prompts, tokens, headers, cookies, and private traveler data.
- [ ] Implement typed classifications and a no-detail health response; instrument changed paths.
- [ ] Inspect serialized test output and commit the independently passing observability slice.

### Task 7: Legal/trust pages and accessibility acceptance

**Files:**

- Create: `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/accuracy/page.tsx`, `src/app/support/page.tsx`
- Create: shared legal footer/navigation components and tests.
- Modify: landing, trip shell, public share, and print layouts/pages.
- Modify: modal/live-region components and `e2e/accessibility.spec.ts`.

**Interfaces:**

- Public pages are explicitly draft/legal-review-required and state planning-only, no-booking, freshness, verification, privacy, retention, deletion, and support boundaries.

- [ ] Add failing route/link and accessibility tests for public copy, focus trap/initial focus/Escape/restoration, live status, reduced motion, touch targets, themes, zoom, and selected axe flows.
- [ ] Implement pages, shared links, focus management, and announcements with no fabricated certification.
- [ ] Run component and selected Playwright/axe coverage; record manual VoiceOver/zoom gaps.
- [ ] Commit the independently passing trust/accessibility slice.

### Task 8: Production operations documentation and evidence

**Files:**

- Create all requested files under `docs/production/`.
- Create: `docs/build-week/phase-5b-production-hardening.md`
- Modify: `README.md` and requested build-week audit/acceptance/checklist/log files.

**Interfaces:**

- Documents exact variable names without values, ownership, cadence, incident levels, key rotation, AI shutdown, retention, deletion, migration/forward-fix, RPO/RTO, and Preview/Production evidence distinctions.

- [ ] Record current Vercel deployment/configuration and Supabase hosted evidence without secrets.
- [ ] Verify backup/PITR plan capabilities from official documentation; keep restore and paid alerts blocked unless actually configured and drilled.
- [ ] Add legal-review and manual accessibility status, then commit the documentation slice.

### Task 9: Full security and quality gates

**Files:** All Phase 5B changes.

- [ ] Run formatting, lint, typecheck, Vitest, local build, database reset, full pgTAP, Playwright, security/performance advisors, dependency audit, diff check, secret scan, client-bundle scan, and route-manifest review.
- [ ] For every failure, add/reproduce with a focused test before repairing it, then rerun the affected and full gates.
- [ ] Review CAPTCHA/RPC bypass, deletion and transfer races, quota races, cleanup safety, cron overlap/leakage, export/log privacy, grants, `SECURITY DEFINER`, and post-deletion share access.

### Task 10: Protected Preview verification and release evidence

**Files:** Phase 5B evidence documents only after fresh hosted checks.

- [ ] Deploy only to the protected Preview and verify legal pages, controlled CAPTCHA, manual recovery, cleanup dry-run, AI disable, disposable room/account deletion, share invalidation, redacted logs, alert signal, accessibility, and bundle secrecy.
- [ ] Do not claim automatic Preview cron execution because Vercel Cron targets Production deployments.
- [ ] Update the production verdict with implemented/configured/paid/review-required/blocker distinctions.
- [ ] Run final fresh verification, commit, push `main`, and report commit IDs, status, diff stat, counts, hosted evidence, paid requirements, and remaining blockers.
