# Trailie Crew

> Plan trips together. Ask Trailie when you need help.

Trailie Crew is a standalone collaborative AI trip-planning app being built for OpenAI Build Week 2026 in the **Apps for Your Life** category.

## The problem

Group trip planning is fragmented across chats, notes, links, polls, and spreadsheets. The logistics are difficult, but the harder problem is shared context: everyone needs room to contribute, the group must know what has actually been decided, and an assistant should help without taking over the conversation.

## The proposed solution

Trailie Crew will give friends a shared Trip with a natural group conversation. The crew will be able to mention or directly invoke Trailie for focused help and explicitly request an itinerary only when the group is ready. Planned itineraries will be structured, validated, versioned, revisable, shareable, and exportable.

Those collaborative and AI capabilities are the product direction. Phase 1A now contains the secure persistence and anonymous-identity foundation, while the landing shell remains the only product UI.

## Relationship to TrailVerse

Trailie Crew is a separate application, repository, deployment, and database from TrailVerse. Existing TrailVerse park data or services may be consumed later only through a read-only adapter/API boundary. Trailie Crew must not write to or directly couple itself to the TrailVerse database.

## Technology stack

- Next.js 16 App Router and React 19
- TypeScript in strict mode
- Tailwind CSS 4 with Geist Sans and Geist Mono
- pnpm workspaces with typed internal `@trailie/*` packages
- Vitest, React Testing Library, and jsdom
- ESLint and Prettier
- GitHub Actions CI
- Supabase Auth/Postgres persistence with RPC-only writes, RLS, and pgTAP tests
- OpenAI API integration remains planned and is not connected in Phase 1A

## Local setup

Prerequisites: Node.js 22 or newer, pnpm 10, and a Docker-compatible container runtime for local Supabase.

```bash
pnpm install
cp .env.example .env.local
pnpm exec supabase start
pnpm exec supabase status -o env
```

Copy the local `API_URL`, `PUBLISHABLE_KEY`, and `SECRET_KEY` values into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. Never commit `.env.local` or expose the secret key through a `NEXT_PUBLIC_*` variable. The local config uses ports `55320`–`55329` to avoid collisions with other Supabase projects and enables anonymous sign-ins.

Reset and test the local database, then run the app:

```bash
pnpm exec supabase db reset
pnpm exec supabase test db
pnpm dev
```

Run the quality checks with:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec supabase db reset
pnpm exec supabase test db
```

## Current implementation status

Implemented through Phase 1A:

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

Not yet implemented:

- Create Trip and Join Trip UI, crew presence, or shared chat
- Trailie invocation, OpenAI model orchestration, or application tools
- itinerary planning, approval, generation, validation, revisions, sharing, or export
- Supabase persistence or any live travel-data provider

## Build Week timing

Trailie Crew development began with Phase 0 on July 13, 2026. Work completed before Build Week is recorded separately in [`docs/build-week/prior-work.md`](docs/build-week/prior-work.md); subsequent implementation will be logged as it is built.

## Codex collaboration

Codex collaboration decisions and Build Week development checkpoints are recorded in [`docs/build-week/codex-collaboration-log.md`](docs/build-week/codex-collaboration-log.md). This section will be expanded with concrete contributions as the project develops.
