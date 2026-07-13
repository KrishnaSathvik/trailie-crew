# Phase 1A Secure Persistence Implementation Plan

> **For agentic workers:** Implement inline in this thread. Do not delegate, commit, push, link a remote project, or add out-of-scope product behavior.

**Goal:** Build and verify the secure Supabase persistence foundation for anonymous Trip creation and joining.

**Architecture:** PostgreSQL RPCs own atomic writes; RLS and column grants protect direct reads/updates; Next.js utilities expose separate browser, request-scoped server, and server-only admin clients. Zod contracts and explicit mappers isolate the snake_case database boundary.

**Tech Stack:** Supabase Postgres/Auth/CLI, pgTAP, Next.js 16 App Router, TypeScript, Zod, Vitest, pnpm.

## Global constraints

- Work on `main`; do not commit or push.
- Use Supabase anonymous authentication and `auth.uid()` for authorization.
- Store only deterministic cryptographic hashes of long invite tokens.
- Keep `private.room_memory` inaccessible to browser roles.
- Do not add create/join UI, chat, realtime, AI, planning, or itinerary behavior.

### Task 1: Tooling and contracts

**Files:** `package.json`, `pnpm-lock.yaml`, `supabase/config.toml`, `packages/schemas/src/index.ts`, `packages/schemas/src/index.test.ts`

- [ ] Add current pinned Supabase dependencies and formatting/local database scripts.
- [ ] Write failing tests for all Phase 1A Zod contracts and validation bounds.
- [ ] Implement camelCase contracts and confirm the focused tests pass.

### Task 2: Application Supabase boundary

**Files:** `src/lib/env.ts`, `src/lib/env.test.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, `src/server/supabase/admin.ts`, `src/lib/supabase/auth.ts`, `src/lib/supabase/auth.test.ts`, `src/lib/supabase/mappers.ts`, `src/lib/supabase/mappers.test.ts`, `src/types/database.ts`

- [ ] Write failing tests for strict public/server environment parsing, anonymous-session reuse/sign-in, and database result mapping.
- [ ] Implement narrowly scoped client factories, auth helper, boundary types, and explicit mappers.
- [ ] Run focused and full TypeScript tests.

### Task 3: Database schema and security

**Files:** `supabase/migrations/*_create_trip_schema.sql`, `supabase/migrations/*_secure_trip_workflows.sql`

- [ ] Create both migration files through `supabase migration new`.
- [ ] Define schemas, enums, tables, checks, unique/partial indexes, timestamps, and private memory defaults.
- [ ] Define locked helpers, token/code generators, atomic RPCs, grants, RLS policies, and safe invite metadata view.
- [ ] Reset the local database and fix migration/lint failures.

### Task 4: Database tests

**Files:** `supabase/tests/phase_1a_trip_workflows.test.sql`, `supabase/tests/phase_1a_rls.test.sql`

- [ ] Write pgTAP assertions for identity, validation, atomic artifacts, token storage, join paths, invite lifecycle/limits, and room states.
- [ ] Write pgTAP assertions for outsider/member/host permissions, direct-write denial, role escalation denial, invite metadata, and private memory isolation.
- [ ] Run `supabase test db`, repair implementation defects, and retain the red-to-green evidence.

### Task 5: Documentation and final verification

**Files:** `README.md`, `docs/build-week/architecture.md`, `docs/build-week/database-security.md`, `docs/build-week/codex-collaboration-log.md`, `docs/build-week/submission-checklist.md`

- [ ] Document rationale, ownership, RPC-only workflows, token handling, RLS/private boundaries, commands, and implemented/planned scope.
- [ ] Audit security-definer paths/grants, recursion, escalation, token/secret leakage, invite atomicity, mutable columns, injection, and RPC ambiguity.
- [ ] Run every requested quality gate and report exact results, warnings, diff/status, migrations, objects, tests, and local setup commands.
