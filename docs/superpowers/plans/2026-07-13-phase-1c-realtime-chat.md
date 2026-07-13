# Phase 1C Realtime Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure persisted and realtime crew chat to the existing Trip shell without adding Trailie behavior.

**Architecture:** PostgreSQL RPCs and RLS remain the authorization boundary; a Server Component loads the safe initial page, while one private room channel and a focused Client Component own live collaboration. Pure state helpers reconcile RPC, broadcast, optimistic, pagination, presence, and typing inputs deterministically.

**Tech Stack:** PostgreSQL 17, Supabase Auth/Database/Realtime, Next.js 16 App Router, React 19, TypeScript, Zod 4, Vitest, pgTAP, Playwright.

## Global Constraints

- Work on `main`; do not commit or push.
- Add timestamped migrations and do not edit committed migrations.
- Store only canonical reaction values and never expose auth/private fields.
- Use test-first red-green-refactor cycles.
- Do not implement Trailie, planning, maps, exports, uploads, AI calls, or memory.

---

### Task 1: Shared contracts and pure chat state

**Files:**

- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/index.test.ts`
- Create: `src/features/chat/lib/chat-state.ts`
- Create: `src/features/chat/lib/chat-state.test.ts`

**Interfaces:** Produces the requested Zod contracts plus merge, reconciliation, typing, presence, and scrolling helpers consumed by later UI and boundary tasks.

- [ ] Write schema and helper tests for canonical enums, limits, database-to-application shapes, duplicate merging, RPC/Realtime races, retry state, reaction rollback, cursor prepending, typing expiry, presence deduplication, and near-bottom behavior.
- [ ] Run the focused tests and confirm failures are caused by missing Phase 1C exports.
- [ ] Add the minimal schemas, inferred types, and pure helpers.
- [ ] Run the focused tests until green, then refactor without changing behavior.

### Task 2: Secure database workflows

**Files:**

- Create: `supabase/tests/phase_1c_chat_workflows.test.sql`
- Create: `supabase/tests/phase_1c_chat_rls.test.sql`
- Create: `supabase/migrations/<timestamp>_add_realtime_crew_chat.sql`
- Modify: `supabase/config.toml`

**Interfaces:** Produces `send_message`, `toggle_message_reaction`, `get_room_messages`, private Realtime topic authorization, persisted-change notifications, and read-only RLS table access.

- [ ] Write pgTAP fixtures and assertions for every locked RPC, pagination, aggregation, grant, RLS, spoofing, isolation, idempotency, direct-mutation, and rate-limit behavior.
- [ ] Run pgTAP on the pre-migration database and confirm Phase 1C tests fail for missing objects.
- [ ] Create the migration through the Supabase CLI, implement the minimal schema/RPC/policy/trigger SQL, and enable local Realtime.
- [ ] Reset the database and run pgTAP until all Phase 1A and Phase 1C tests are green.

### Task 3: Typed database and server boundaries

**Files:**

- Modify: `src/types/database.ts`
- Modify: `src/lib/supabase/mappers.ts`
- Modify: `src/lib/supabase/mappers.test.ts`
- Create: `src/features/chat/errors/chat-errors.ts`
- Create: `src/features/chat/errors/chat-errors.test.ts`
- Create: `src/features/chat/actions/chat-actions.ts`
- Create: `src/features/chat/actions/chat-actions.test.ts`
- Create: `src/features/chat/queries/get-room-messages.ts`
- Modify: `src/features/trips/queries/get-trip-shell.ts`
- Modify: `src/features/crew/queries/trip-crew.ts`

**Interfaces:** Maps JSON RPC payloads at the snake_case boundary and exposes safe action results plus initial server-rendered history.

- [ ] Write mapper, safe-error, action, and initial-query tests first and verify expected failures.
- [ ] Add database row/function types, explicit mappers, safe error mapping, message/reaction Server Actions, and the initial query.
- [ ] Run focused tests until green and confirm the admin client is absent from normal chat paths.

### Task 4: Collaborative chat client and responsive shell

**Files:**

- Create: `src/features/chat/components/chat-experience.tsx`
- Create: `src/features/chat/components/message-list.tsx`
- Create: `src/features/chat/components/message-composer.tsx`
- Create: `src/features/chat/components/reaction-controls.tsx`
- Create: `src/features/chat/components/chat-experience.test.tsx`
- Modify: `src/features/trips/components/trip-shell.tsx`
- Modify: `src/features/trips/components/trip-shell.test.tsx`
- Modify: `src/features/crew/components/crew-list.tsx`
- Modify: `src/styles/globals.css`

**Interfaces:** Consumes verified shell/current participant data and the initial safe page; owns one private room channel and accessible optimistic collaboration UI.

- [ ] Write component tests for empty state, keyboard send/newline, character limit, pending/failure/retry, reaction rollback, typing timeout, presence labels, pagination, and no Trailie response.
- [ ] Verify the focused tests fail against the placeholder shell.
- [ ] Implement the client state boundary, composer, message ledger, reactions, crew presence, mobile People drawer, subscription cleanup, reconnect reconciliation, and scroll rules.
- [ ] Run focused tests to green and refactor components by responsibility.

### Task 5: Real collaboration E2E

**Files:**

- Create: `e2e/realtime-chat.spec.ts`
- Modify: `playwright.config.ts` only if Realtime startup requires it.

**Interfaces:** Exercises the real local Supabase Auth, Database, and Realtime services through two independent browser contexts.

- [ ] Write the two-user chat/reply/reaction/presence/typing/history/outsider test and a seeded multi-page history test.
- [ ] Run it against the incomplete UI and record the expected red result.
- [ ] Complete only the implementation required for real socket delivery and deterministic testability.
- [ ] Run E2E until green without mocking Realtime.

### Task 6: Documentation, security review, and full gates

**Files:**

- Modify: `README.md`
- Modify: `docs/build-week/architecture.md`
- Modify: `docs/build-week/codex-collaboration-log.md`
- Modify: `docs/build-week/submission-checklist.md`
- Modify: `docs/build-week/database-security.md`
- Modify: `docs/build-week/demo-script.md`
- Create: `docs/build-week/realtime-chat.md`

**Interfaces:** Records persisted/transient boundaries, channel authorization, pagination, idempotency, reconciliation, security findings, demo flow, and deferred behavior.

- [ ] Update documentation and run a targeted secret/service-role/raw-error/XSS/subscription/cross-room review.
- [ ] Run formatting, lint, typecheck, unit tests, local build, database reset, pgTAP, database lint, security advisors, E2E, diff check, secret scan, status, and diff stat.
- [ ] Manually verify desktop, 390×844 mobile, both themes, keyboard behavior, failure/retry, presence changes, typing expiry, reconnect, pagination position, and console cleanliness.
- [ ] Report exact evidence, counts, warnings, commands, status, and diff stat; stop without committing or pushing.
