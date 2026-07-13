# Trailie Crew

> Plan trips together. Ask Trailie when you need help.

Trailie Crew is a standalone collaborative AI trip-planning app being built for OpenAI Build Week 2026 in the **Apps for Your Life** category.

## The problem

Group trip planning is fragmented across chats, notes, links, polls, and spreadsheets. The logistics are difficult, but the harder problem is shared context: everyone needs room to contribute, the group must know what has actually been decided, and an assistant should help without taking over the conversation.

## The proposed solution

Trailie Crew will give friends a shared Trip with a natural group conversation. The crew will be able to mention or directly invoke Trailie for focused help and explicitly request an itinerary only when the group is ready. Planned itineraries will be structured, validated, versioned, revisable, shareable, and exportable.

Those collaborative and AI capabilities are the product direction, not the current implementation. Phase 0 contains the repository foundation and a minimal, non-functional landing shell only.

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
- Supabase and the OpenAI API are planned integrations; neither is connected in Phase 0

## Local setup

Prerequisites: Node.js 22 or newer and pnpm 10.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Phase 0 does not require live credentials to render or test the landing shell. Keep all real secrets in local environment files; never commit them.

Run the quality checks with:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Current implementation status

Implemented in Phase 0:

- production-oriented Next.js and pnpm workspace foundation
- strict TypeScript, Tailwind design tokens, linting, formatting, tests, and CI
- typed package boundaries for schemas, validation, travel tools, and read-only TrailVerse access
- monochrome responsive landing shell with an accessible theme toggle
- initial Build Week product and architecture documentation

Not yet implemented:

- accounts, Trips, joining, invitations, crew presence, or shared chat
- Trailie invocation, OpenAI model orchestration, or application tools
- itinerary planning, approval, generation, validation, revisions, sharing, or export
- Supabase persistence or any live travel-data provider

## Build Week timing

Trailie Crew development began with Phase 0 on July 13, 2026. Work completed before Build Week is recorded separately in [`docs/build-week/prior-work.md`](docs/build-week/prior-work.md); subsequent implementation will be logged as it is built.

## Codex collaboration

Codex collaboration decisions and Build Week development checkpoints are recorded in [`docs/build-week/codex-collaboration-log.md`](docs/build-week/codex-collaboration-log.md). This section will be expanded with concrete contributions as the project develops.
