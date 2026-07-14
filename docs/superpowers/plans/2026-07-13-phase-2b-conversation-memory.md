# Phase 2B Conversation Memory Implementation Plan

> **For agentic workers:** This plan was executed inline because the user required the same thread and prohibited commits until all checks pass.

**Goal:** Add invisible, private, conservative conversation understanding after human-message persistence.

**Architecture:** Next.js post-response work claims one database extraction per message. A bounded provider proposes a strict patch; application validation and atomic database functions maintain immutable facts and a rebuildable snapshot.

**Tech Stack:** Next.js 16 `after`, Supabase/Postgres 17, OpenAI Responses API, `openai@6.46.0`, Zod 4, Vitest, pgTAP, Playwright.

- [x] Verify official OpenAI and Supabase guidance.
- [x] Add strict public schemas and deterministic eligibility tests.
- [x] Add bounded context, fake/OpenAI providers, and validation tests.
- [x] Add private extraction/fact migration, claim/apply/rebuild functions, and pgTAP tests.
- [x] Add post-response scheduling, retry/concurrency controls, and unit tests.
- [x] Add protected development inspection and two-user E2E coverage.
- [x] Update Build Week documentation.
- [x] Run every final quality gate and record the inclusive diff.
