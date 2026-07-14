# Trailie Crew

> Plan trips together. Ask Trailie when you need help.

Trailie Crew is a standalone collaborative AI trip-planning app being built for OpenAI Build Week 2026 in the **Apps for Your Life** category.

## The problem

Group trip planning is fragmented across chats, notes, links, polls, and spreadsheets. The logistics are difficult, but the harder problem is shared context: everyone needs room to contribute, the group must know what has actually been decided, and an assistant should help without taking over the conversation.

## The proposed solution

Trailie Crew will give friends a shared Trip with a natural group conversation. The crew will be able to mention or directly invoke Trailie for focused help and explicitly request an itinerary only when the group is ready. Planned itineraries will be structured, validated, versioned, revisable, shareable, and exportable.

Phase 2A now adds silence-by-default focused Trailie answers: explicit mentions, beginning-of-message direct address, and replies to persisted Trailie messages are checked by deterministic code, streamed privately to the invoking browser, validated, persisted once, and delivered to the crew through Realtime. Planning and itinerary capabilities remain intentionally unavailable.

## Relationship to TrailVerse

Trailie Crew is a separate application, repository, deployment, and database from TrailVerse. Existing TrailVerse park data or services may be consumed later only through a read-only adapter/API boundary. Trailie Crew must not write to or directly couple itself to the TrailVerse database.

## Technology stack

- Next.js 16 App Router and React 19
- TypeScript in strict mode
- Tailwind CSS 4 with Geist Sans and Geist Mono
- pnpm workspaces with typed internal `@trailie/*` packages
- Vitest, React Testing Library, jsdom, and Playwright
- ESLint and Prettier
- GitHub Actions CI
- Supabase Auth/Postgres persistence and Realtime with RPC-only writes, private room channels, RLS, and pgTAP tests
- OpenAI Responses API through exact `openai@6.46.0`, strict structured output, GPT-5.6 Terra/Sol routing, and a deterministic fake provider for tests

## Local setup

Prerequisites: Node.js 22 or newer, pnpm 10, PostgreSQL client tools (`psql` for the pagination E2E fixture), and a Docker-compatible container runtime for local Supabase.

```bash
pnpm install
pnpm exec supabase start
```

For ordinary local product work, no environment file is required: `dev:local`, `build:local`, and Playwright map the local public/secret keys into child-process memory and select the deterministic fake AI provider. Real OpenAI requests require the server-only variables shown in `.env.example`. Never commit them or expose a secret through a `NEXT_PUBLIC_*` variable. The local config uses ports `55320`–`55329`, enables anonymous sign-ins, and starts Realtime.

Reset and test the local database, then run the app:

```bash
pnpm exec supabase db reset
pnpm exec supabase test db
pnpm dev:local
pnpm test:e2e
pnpm test:openai:smoke # skips unless OPENAI_API_KEY exists
```

Run the quality checks with:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build:local
pnpm test:e2e
pnpm exec supabase db reset
pnpm exec supabase test db
```

## Current implementation status

Implemented through Phase 2A:

- production-oriented Next.js and pnpm workspace foundation
- strict TypeScript, Tailwind design tokens, linting, formatting, tests, and CI
- typed package boundaries for schemas, validation, travel tools, and read-only TrailVerse access
- monochrome responsive landing shell with an accessible theme toggle
- initial Build Week product and architecture documentation
- real anonymous Supabase identities with browser/server/admin client boundaries
- Trip, participant, invite, and private room-memory persistence
- atomic `create_trip` and `join_trip` RPCs with hashed long invite tokens
- active-membership/host RLS, field-limited room updates, and safe invite metadata
- pgTAP workflow/permission coverage and TypeScript contract/env/mapper tests
- functional landing links and accessible Create Trip and Join Trip forms
- anonymous-session reuse/creation before authenticated Server Action mutations
- typed safe application errors for validation, auth, invite, network, and response failures
- RLS-backed Trip shell with current identity, crew membership, host invite controls, and responsive navigation
- memory-only one-time invitation path display/copy with safe short-code fallback
- multi-context Playwright verification for host, member, duplicate-name, and outsider workflows
- immutable persisted user messages with safe replies and idempotent client message IDs
- stable 30-message cursor pagination with a database cap of 50 and scroll-preserving prepend
- one authenticated private Realtime channel per Trip with RLS-backed topic membership
- live cross-context delivery, optimistic reconciliation, explicit failure/retry, and reconnect refresh
- canonical accessible reactions with optimistic rollback
- privacy-minimal presence, online crew state, and expiring typing indicators
- desktop editorial conversation ledger and mobile People drawer with a composer above navigation
- pgTAP, unit/component, and real multi-context browser coverage for chat collaboration
- deterministic invocation parsing with silence for ordinary references, code, quotes, email-like text, and longer handles
- authenticated streamed Trailie answers with private optimistic state and Realtime-persisted final messages
- private forced-RLS invocation/run accounting, transactional idempotency, one safe retry, usage metadata, and rate controls
- exact GPT-5.6 Terra/Sol model routing, HMAC safety identifiers, bounded untrusted context, and versioned focused prompt
- strict safe response/stream schemas, server-only OpenAI provider, deterministic fake provider, and optional live smoke test

Not yet implemented:

- itinerary planning, approval, generation, validation, revisions, sharing, or export
- live travel-data providers or TrailVerse service integration

## Build Week timing

Trailie Crew development began with Phase 0 on July 13, 2026. Work completed before Build Week is recorded separately in [`docs/build-week/prior-work.md`](docs/build-week/prior-work.md); subsequent implementation will be logged as it is built.

## Codex collaboration

Codex collaboration decisions and Build Week development checkpoints are recorded in [`docs/build-week/codex-collaboration-log.md`](docs/build-week/codex-collaboration-log.md). This section will be expanded with concrete contributions as the project develops.
Phase 2B adds invisible, private conversation understanding. Persisted human messages return immediately; eligible messages are processed after the response into normalized private facts and a rebuildable room snapshot. Extraction never creates chat output. See [conversation memory](docs/build-week/conversation-memory.md).

Memory configuration uses `OPENAI_MEMORY_MODEL=gpt-5.6-luna`, prompt `trailie-memory-v1`, schema `1`, and a 20-second timeout. Local and E2E runs use the deterministic fake provider. Live smoke testing is opt-in and was not run for this phase.
