# Trailie Crew

Phase 4B supports host-managed, version-pinned public links plus authenticated calendar and print/PDF exports for immutable published itineraries. See [sharing](docs/build-week/sharing.md), [exports](docs/build-week/exports.md), and [public privacy](docs/build-week/public-privacy.md).

Phase 5A hosted acceptance is complete with controlled conditions. A dedicated Vercel custom Preview environment is backed by a non-production hosted Supabase project; the two-user Realtime/OpenAI/planning/itinerary/revision/share/export path passed after measured timeout, provider-unavailable, and public-redaction fixes. Vercel Authentication remains required because CAPTCHA is not configured, Mapbox evidence remains unavailable, and Production has not been deployed. This repository does not claim production readiness. See [Preview acceptance](docs/build-week/preview-acceptance.md), [deployment](docs/build-week/deployment.md), and [operations](docs/build-week/operations.md).

> Plan trips together. Ask Trailie when you need help.

Trailie Crew is a standalone collaborative AI trip-planning app being built for OpenAI Build Week 2026 in the **Apps for Your Life** category.

## The problem

Group trip planning is fragmented across chats, notes, links, polls, and spreadsheets. The logistics are difficult, but the harder problem is shared context: everyone needs room to contribute, the group must know what has actually been decided, and an assistant should help without taking over the conversation.

## The proposed solution

Trailie Crew will give friends a shared Trip with a natural group conversation. The crew will be able to mention or directly invoke Trailie for focused help and explicitly request an itinerary only when the group is ready. Planned itineraries will be structured, validated, versioned, revisable, shareable, and exportable.

Phase 2A added silence-by-default focused Trailie answers: explicit mentions, beginning-of-message direct address, and replies to persisted Trailie messages are checked by deterministic code, streamed privately to the invoking browser, validated, persisted once, and delivered to the crew through Realtime. Planning and itinerary capabilities were intentionally unavailable at that phase boundary; Phases 3A through 4B now provide approval-gated planning, validated itineraries, revisions, sharing, and exports.

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

Set `AI_GENERATION_ENABLED=false` to stop all model-backed generation before provider construction while leaving ordinary crew chat available. The protected recovery route and every hosted variable are operational boundaries documented in [`docs/build-week/environment-variables.md`](docs/build-week/environment-variables.md); do not expose its bearer secret to a browser.

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

Implemented through Phase 5B locally (hosted Phase 5B acceptance is reported separately):

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
- silent normalized conversation memory with stale-job recovery and no browser inspection route
- explicit Build Our Itinerary action, immutable planning summaries, deterministic readiness, stale protection, and all-active/host-only approval
- immutable published-plan history, approval-gated revisions, comparison, and exact historical reads
- 256-bit opaque share tokens with SHA-256-only persistence, host-only rotation/revocation, expiration, and one active link per version
- server-only public projection with deterministic identity, preference, operational, evidence, coordinate, and cost redaction
- anonymous noindex/noarchive `/share/[token]` rendering that fails closed on revocation, expiration, or snapshot drift
- exact-version RFC 5545 calendar downloads and print-optimized browser Save-as-PDF routes
- single-use CAPTCHA-protected anonymous create/join workflows and deterministic local acceptance adapter
- transactional AI invocation/token quotas with user, room, global, workflow, and model controls plus emergency disable
- leased recovery and anonymous-cleanup cron routes with bounded privacy-safe summaries
- host transfer, room deletion, account deletion preparation/session revocation, and personal-data export
- structured redacted operational logging, draft public trust pages, lifecycle settings, and Production runbooks

Not yet implemented:

- booking, public editing/comments, external guest collaboration, password-protected links, and public indexing
- live place/reservation, hotel/flight, weather, and TrailVerse/NPS service integration
- paid Production backup/PITR and restore proof, provider/platform alert ownership, professional legal review, and final manual accessibility acceptance

Phase 5B details and the intentionally blocked Production verdict are in [`docs/build-week/phase-5b-production-hardening.md`](docs/build-week/phase-5b-production-hardening.md). Operational release documents are under [`docs/production/`](docs/production/).

## Build Week timing

Trailie Crew development began with Phase 0 on July 13, 2026. Work completed before Build Week is recorded separately in [`docs/build-week/prior-work.md`](docs/build-week/prior-work.md); subsequent implementation will be logged as it is built.

## Codex collaboration

Codex collaboration decisions and Build Week development checkpoints are recorded in [`docs/build-week/codex-collaboration-log.md`](docs/build-week/codex-collaboration-log.md). This section will be expanded with concrete contributions as the project develops.
Phase 2B adds invisible, private conversation understanding. Persisted human messages return immediately; eligible messages are processed after the response into normalized private facts and a rebuildable room snapshot. Extraction never creates chat output. See [conversation memory](docs/build-week/conversation-memory.md).

Memory configuration uses `OPENAI_MEMORY_MODEL=gpt-5.6-luna`, prompt `trailie-memory-v1`, schema `1`, and a 20-second timeout. Local and E2E runs use the deterministic fake provider. The opt-in live Luna smoke later passed during the credentialed Phase 4B verification recorded in the collaboration log; it was not rerun during the Phase 4C audit because no key was available.

Phase 3A adds the approval-gated **Before I build the trip** workflow. Sol reconstructs a bounded review summary from private memory and recent conversation; application code owns readiness, staleness, and approval completion. `approved_for_generation` is the stopping point—no itinerary is generated. See [planning approval](docs/build-week/planning-approval.md).

Phase 3B adds the explicit **Generate Itinerary** action, strict itinerary schema, source-attributed travel evidence, deterministic validation, one bounded conflict repair, immutable PASS-only publication, semantic progress, and the crew-visible Plan experience. Local/E2E work uses deterministic external-provider doubles while exercising real PostgreSQL, RLS, validation, and publication. See [itinerary generation](docs/build-week/itinerary-generation.md) and [travel tools](docs/build-week/travel-tools.md).

Phase 4A adds explicit crew-approved revisions and immutable historical comparison. Phase 4B adds exact-version sharing and exports: the room may be on Version 2 while a Version 1 link, calendar, or print view remains Version 1 until its host revokes it. Raw share tokens are shown once and never stored. Public pages are strict, read-only, non-indexed projections with conservative cache headers.

Phase 6A adds server-only live travel intelligence from Mapbox, OpenWeather One Call 3.0, NPS, and RIDB. Every external fact is normalized as versioned evidence with provenance, freshness, verification, confidence, bindings, and explicit unavailable/conflicting states before Sol or deterministic validation can use it. Published plan versions pin immutable privacy-safe evidence snapshots. See [Phase 6A](docs/build-week/phase-6a-live-travel-intelligence.md) and the [travel provider inventory](docs/production/travel-provider-inventory.md).
