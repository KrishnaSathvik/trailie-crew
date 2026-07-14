# Phase 4C Product Audit Implementation Plan

> **For agentic workers:** Execute this audit inline and preserve an evidence trail. Do not deploy, commit, or push.

**Goal:** Determine Trailie Crew's feature completeness, travel-planning accuracy, Vercel Preview readiness, and production readiness from the current repository at base commit `8bafcdd`.

**Architecture:** Treat the repository, final migration state, generated route manifest, client bundles, and fresh local test output as primary evidence. Cross-reference implementation paths, authorization boundaries, failure behavior, and tests into three durable Build Week reports, then correct only clear low-risk documentation inaccuracies found during the audit.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Auth/Postgres/Realtime, OpenAI Responses API, Vitest, Playwright, pgTAP, pnpm.

## Global Constraints

- Work on `main` from base commit `8bafcdd`.
- Do not deploy, commit, or push.
- Do not add major features.
- Modify product code only for clear low-risk correctness defects uncovered by evidence.
- Do not claim live-provider or hosted results that were not measured.
- Use the six readiness labels and four final-verdict vocabularies specified in the Phase 4C request.

---

### Task 1: Establish the Evidence Baseline

**Files:**

- Inspect: `README.md`, `package.json`, `.env.example`, `next.config.ts`, `playwright.config.ts`
- Inspect: `src/app/**`, `src/features/**`, `src/server/**`, `packages/**`
- Inspect: `supabase/migrations/**`, `supabase/tests/**`, `supabase/config.toml`
- Inspect: `docs/build-week/**`

- [ ] Confirm branch, HEAD, dirty state, runtime/tool versions, environment-variable presence without printing secret values, and available local services.
- [ ] Inventory user-visible features, application routes, server mutations, database objects, authorization boundaries, providers, recovery paths, tests, and documentation.
- [ ] Inventory production routes and flag any test, fake-provider, debug, admin, token-inspection, prompt, or private-memory exposure.
- [ ] Map automated test types and identify production behavior covered only by mocks or prior live evidence.

### Task 2: Audit Product Completeness and Trust Boundaries

**Files:**

- Create: `docs/build-week/feature-completeness-audit.md`
- Inspect: all implementation and test paths inventoried in Task 1

- [ ] Trace landing/entry, collaboration, focused Trailie, silent memory, planning, itinerary generation, revisions, sharing/exports, security/privacy, and operations end to end.
- [ ] Record each user-visible feature's entry point, UI, backend, database dependency, authorization, provider dependency, failure behavior, test evidence, live-verification state, limitation, and readiness label.
- [ ] Separate technically present features from fully connected features and list Preview and production blockers without upgrading local evidence into hosted claims.

### Task 3: Audit Travel and Decision Accuracy

**Files:**

- Create: `docs/build-week/accuracy-audit.md`
- Inspect: `src/features/itinerary/**`, `src/features/planning/**`, `src/features/memory/**`, `src/features/revisions/**`, `src/features/sharing/**`, `packages/travel-tools/**`, `packages/schemas/**`, `packages/validation/**`

- [ ] Trace provenance and labels for verified, estimated, user-supplied, model-suggested, unknown, stale, and unavailable data.
- [ ] Verify approval/staleness/version invariants and that individual preferences cannot become group decisions or leak through public projections.
- [ ] Catalogue every deterministic itinerary validator with severity, provider dependency, false-positive/negative risk, tests, and confidence.
- [ ] Exercise existing mutation-style tests and document absent cases for dates, timezones, feasibility, closures, reservations, accessibility, diet, budgets, evidence, must-dos, rejected options, and revision drift.

### Task 4: Audit Production Readiness

**Files:**

- Create: `docs/build-week/production-readiness-audit.md`
- Inspect: application, database, auth, AI/provider, recovery, performance, privacy/security, abuse, lifecycle, observability, accessibility, deployment, rollback, backup, disclosure, and support paths

- [ ] Create a risk register with status, evidence, severity, required action, Preview/production blocker flags, owner, and verification method.
- [ ] Review migrations, RLS, grants, `SECURITY DEFINER` search paths, immutable artifacts, constraints, indexes, private returns, and deletion behavior.
- [ ] Assess runtime/timeouts, durable recovery, rate/cost limits, CAPTCHA, anonymous cleanup, backups, rollback, logs/alerts, policies/disclaimers, deletion, abuse reporting, and hosted acceptance.
- [ ] Evaluate unmeasured scale risks at the requested participant/message/itinerary/version/concurrency envelopes and label them as estimates.
- [ ] Review keyboard, focus, semantics, announcements, contrast, motion, zoom, public share, and print accessibility using automation where available and record manual gaps.

### Task 5: Run Fresh Verification

**Files:**

- Verify: the full repository

- [ ] Run formatting, lint, typecheck, unit/component tests, and local production build.
- [ ] Reset local Supabase, run pgTAP, database lint, and security advisors using CLI help-verified commands.
- [ ] Run Playwright E2E and every credential-free local smoke script.
- [ ] Run live OpenAI smoke only if the existing key is present; reuse documented genuine results when provider-path code has not changed.
- [ ] Run dependency audit, `git diff --check`, repository secret scan, production route-manifest review, and client-bundle secret review.
- [ ] Record exact commands, exit codes, pass/fail/skip counts, and environmental blockers.

### Task 6: Reconcile Documentation and Issue Verdicts

**Files:**

- Modify: `README.md`
- Modify as evidence requires: `docs/build-week/*.md`
- Finalize: the three audit reports

- [ ] Correct only demonstrably stale implementation, live-smoke, test-count, checklist, model, timeout, prompt, and deferred/completed claims.
- [ ] Review all report rows against source paths or fresh command evidence and scan for unsupported benchmark, hosted, provider, and production claims.
- [ ] Re-run formatting and targeted tests after documentation or low-risk correctness edits, then run `git diff --check`.
- [ ] Report executive assessment, matrices/findings, blockers, fixes, changed files, verification results, the four required verdicts, `git status`, and diff stat.
