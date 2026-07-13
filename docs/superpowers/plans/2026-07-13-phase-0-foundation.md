# Trailie Crew Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap a production-ready Trailie Crew workspace and prove its design foundation with a tested minimal landing shell.

**Architecture:** Use a Next.js App Router application at the repository root inside a lightweight pnpm workspace. Keep four real internal packages independently typed and expose only narrow contracts; use Server Components except for the interactive theme toggle.

**Tech Stack:** Current stable Next.js, React, TypeScript strict mode, Tailwind CSS, Geist, Lucide React, Vitest, React Testing Library, jsdom, Prettier, pnpm, GitHub Actions.

## Global Constraints

- Work directly on `main`; do not commit or push.
- Do not use Turborepo.
- React Server Components are the default; add `"use client"` only where interaction requires it.
- Internal packages must expose real typed contracts and package entry points.
- Do not add destination, dates, budget, or preferences to Create Trip or Join Trip.
- Do not implement fake APIs, prices, availability, or product interactions.
- Documentation must distinguish implemented behavior from planned behavior.
- Skip Husky and lint-staged if they introduce avoidable setup friction.

---

### Task 1: Workspace and Package Boundaries

**Files:** Create root package/tooling configuration, `packages/*/package.json`, and typed `src/index.ts` entry points for all four internal packages.

**Interfaces:** `@trailie/schemas` exports `tripIdSchema` and `TripId`; `@trailie/validation` exports `ValidationResult<T>` and `validateTripId`; `@trailie/travel-tools` exports provider-neutral request/result contracts; `@trailie/trailverse-adapter` exports a read-only park summary and adapter contract.

- [ ] Scaffold the latest stable Next.js App Router project with pnpm, TypeScript, Tailwind, ESLint, `src/`, and `@/*`.
- [ ] Add `pnpm-workspace.yaml`, root scripts, strict compiler settings, Prettier, and Vitest configuration.
- [ ] Create each package manifest with explicit exports and dependencies.
- [ ] Add the minimal typed interfaces described above and ensure workspace typechecking includes them.

### Task 2: Landing Shell Test-First Cycle

**Files:** Create `src/app/page.test.tsx`; then create or modify `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/shared/theme-toggle.tsx`, and `src/styles/globals.css`.

**Interfaces:** `Home` is a Server Component. `ThemeToggle` is a Client Component using the browser DOM and local storage.

- [ ] Write a test that renders `Home` and requires the Trailie Crew wordmark, exact headline, experiment label, and Create/Join controls.
- [ ] Run `pnpm test -- src/app/page.test.tsx` and record the expected assertion failure caused by the missing branding.
- [ ] Implement only the required landing content and design tokens.
- [ ] Re-run `pnpm test -- src/app/page.test.tsx` and record the passing result.
- [ ] Keep Create and Join as inert visual controls so Phase 0 does not imply functional flows.

### Task 3: Canonical Directories, CI, and Documentation

**Files:** Create feature/server/type directory sentinels, `.github/workflows/ci.yml`, `.env.example`, and all requested `docs/build-week/*.md` files; replace `README.md`.

**Interfaces:** CI uses `pnpm install --frozen-lockfile`, then runs the same lint, typecheck, test, and build scripts used locally.

- [ ] Create every requested architectural directory with a concise README or typed entry file describing its boundary.
- [ ] Add placeholder-only environment variable names from the Phase 0 brief.
- [ ] Add CI with pinned pnpm setup and a supported Node release.
- [ ] Document product scope, architecture, prior work, model routing, validation, demo, submission, and the collaboration log without overstating implementation.
- [ ] Explain local setup, standalone TrailVerse relationship, current status, timing, and collaboration in the root README.

### Task 4: Verification and Handoff

**Files:** Review all files changed by Tasks 1–3.

- [ ] Run `pnpm lint` and require exit code 0.
- [ ] Run `pnpm typecheck` and require exit code 0.
- [ ] Run `pnpm test` and require exit code 0 with the landing test passing.
- [ ] Run `pnpm build` and require exit code 0.
- [ ] Run `git status --short` and `git diff --stat`.
- [ ] Check the final tree against every Phase 0 requirement and report warnings or gaps without committing or pushing.
