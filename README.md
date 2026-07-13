# Trailie Crew

> Plan trips together. Ask Trailie when you need help.

Trailie Crew is a standalone collaborative AI trip-planning app being built for OpenAI Build Week 2026 in the **Apps for Your Life** category.

## The problem

Group trip planning is fragmented across chats, notes, links, polls, and spreadsheets. The logistics are difficult, but the harder problem is shared context: everyone needs room to contribute, the group must know what has actually been decided, and an assistant should help without taking over the conversation.

## The proposed solution

Trailie Crew will give friends a shared Trip with a natural group conversation. The crew will be able to mention or directly invoke Trailie for focused help and explicitly request an itinerary only when the group is ready. Planned itineraries will be structured, validated, versioned, revisable, shareable, and exportable.

Those collaborative and AI capabilities are the product direction. Phase 1C now provides a real RLS-protected Trip shell with persisted realtime crew conversation, presence, typing, reactions, replies, and paginated history. Trailie and all AI planning capabilities remain intentionally unavailable.

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
- OpenAI API integration remains planned and is not connected in Phase 1C

## Local setup

Prerequisites: Node.js 22 or newer, pnpm 10, PostgreSQL client tools (`psql` for the pagination E2E fixture), and a Docker-compatible container runtime for local Supabase.

```bash
pnpm install
pnpm exec supabase start
```

For ordinary local product work, no environment file is required: `dev:local`, `build:local`, and the Playwright launcher read only `API_URL` and `PUBLISHABLE_KEY` from the local CLI into child-process memory. The admin client remains available for future trusted backend work but is not used by the chat path. If you create `.env.local` manually, never commit it or expose a secret key through a `NEXT_PUBLIC_*` variable. The local config uses ports `55320`–`55329`, enables anonymous sign-ins, and starts Realtime. If the stack was first started before Realtime was enabled, run `pnpm exec supabase stop` once and start it again.

Reset and test the local database, then run the app:

```bash
pnpm exec supabase db reset
pnpm exec supabase test db
pnpm dev:local
pnpm test:e2e
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

Implemented through Phase 1C:

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

Not yet implemented:

- Trailie invocation, OpenAI model orchestration, or application tools
- itinerary planning, approval, generation, validation, revisions, sharing, or export
- live travel-data providers or TrailVerse service integration

## Build Week timing

Trailie Crew development began with Phase 0 on July 13, 2026. Work completed before Build Week is recorded separately in [`docs/build-week/prior-work.md`](docs/build-week/prior-work.md); subsequent implementation will be logged as it is built.

## Codex collaboration

Codex collaboration decisions and Build Week development checkpoints are recorded in [`docs/build-week/codex-collaboration-log.md`](docs/build-week/codex-collaboration-log.md). This section will be expanded with concrete contributions as the project develops.
