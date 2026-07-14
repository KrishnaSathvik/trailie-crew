# Phase 2A Trailie AI Implementation Plan

> **For agentic workers:** Execute inline in this thread. Do not commit or push.

**Goal:** Add deterministic, silence-by-default Trailie invocation with secure streamed Responses API answers that persist once for the crew.

**Architecture:** Parse invocation in shared deterministic code, then re-verify authorization and invocation eligibility in a Next.js route. Use private, forced-RLS AI tables and owner-only security-definer functions for transactional state changes; stream only semantic text events while the final validated envelope becomes one ordinary Realtime-visible `trailie` message.

**Tech stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, OpenAI Node SDK 6.46.0, Supabase/Postgres, Vitest, pgTAP, Playwright.

## Global constraints

- Work on `main` at base `e24034f3042747d12d5376c86e70dfd78a5b6d4d`.
- No commit or push.
- No AI call for an ordinary message.
- No prompt, reasoning, raw provider event, provider error, or secret reaches the browser or public tables.
- Maximum one repair retry and one persisted Trailie response per invocation.

### Task 1: Contract and invocation parser

- [ ] Add strict Phase 2A schemas to `packages/schemas/src/index.ts`.
- [ ] Write and run failing parser/schema tests.
- [ ] Implement Markdown masking, request-directed mention/direct-address heuristics, reply and application-action decisions.
- [ ] Run focused tests green.

### Task 2: Provider-neutral focused-answer core

- [ ] Write failing tests for routing, bounded context, HMAC safety identifiers, usage extraction, errors, and safe streams.
- [ ] Implement versioned prompt, deterministic router, context assembly, provider interface/fake provider, OpenAI Responses adapter, and redacted logger.
- [ ] Pin `openai@6.46.0`; use `gpt-5.6-terra`, rare `gpt-5.6-sol`, low reasoning, `store:false`, bounded output, abort, and SDK retries.
- [ ] Run focused tests green.

### Task 3: Transactional database boundary

- [ ] Create a timestamped imperative migration and failing pgTAP suites.
- [ ] Add private forced-RLS invocation/run tables, indexes, state checks, and owner/service-only functions.
- [ ] Enforce source ownership, room isolation, idempotency, rate limits, valid transitions, and one response.
- [ ] Reset the local database and run all SQL tests.

### Task 4: Authorized streaming route

- [ ] Write failing route/orchestrator tests for auth, duplicates, failure, cancellation, and validated persistence.
- [ ] Implement authenticated source-message lookup, create/reuse, run lifecycle, safe NDJSON semantic events, and final persistence.
- [ ] Add a tiny opt-in live smoke test that skips without a real key.

### Task 5: Chat integration and UI

- [ ] Write failing composer, chat, and Trailie rendering tests.
- [ ] Invoke only after `send_message` returns its persisted source ID.
- [ ] Show a private streamed answer/cancel/retry state, distinct final Trailie rendering, and mention helper.
- [ ] Reconcile through existing Realtime refresh without duplicate permanent fragments.

### Task 6: E2E, documentation, and gates

- [ ] Add fake-provider E2E for silence, mention/direct/reply, two contexts, duplicate suppression, failure/retry, outsider, code masking, and mobile.
- [ ] Update every requested build-week document.
- [ ] Run format, lint, typecheck, unit, build, DB reset/tests/lint/advisors, E2E, secret scan, audit, diff check, status, and stat.
- [ ] Report exact evidence and do not commit.
