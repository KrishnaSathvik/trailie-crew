# Architecture

## Phase 4A revision boundary

Published itineraries are immutable. `plan_change_requests` owns revision state; immutable analysis, versioned approvals, separate candidate confirmations, safe events, private runs, reused evidence/validation reports, and atomic publication surround it. Browser writes use verified RPCs only. Private room Broadcast carries invalidations and clients refetch safe projections.

## Phase 4B sharing boundary

Every public link and export begins with one `trip_plans.id` and its immutable `version`; no query resolves `rooms.current_plan_version` on behalf of a link. The application generates a 32-byte base64url token, stores only its SHA-256 hash, and passes the raw value back once. A service-only verifier hashes the request token, validates active/expiry state, the published plan hash, and the stored public snapshot hash, then returns only a strict redacted projection.

Host mutations use locked RPCs; active members see safe status and can export. Anonymous roles receive no direct table or verifier grants. `/share/*` is dynamic, noindex/noarchive, referrer-suppressed, and non-cacheable/revalidated. ICS and print both rebuild from the explicitly selected version. See [sharing.md](sharing.md), [exports.md](exports.md), and [public-privacy.md](public-privacy.md).

## Repository shape

The repository is a lightweight pnpm workspace. The Next.js application lives at the root; reusable domain contracts live in independently exported `packages/*` workspaces. No Turborepo or additional task runner is used.

```text
src/app                 App Router routes and layouts
src/components          shared and product-agnostic UI
src/features            vertical product feature boundaries
src/lib                 framework-neutral shared helpers
src/server              server-only application composition
src/styles              global tokens and styles
src/types               application-only shared types
packages/schemas        canonical cross-package schemas
packages/validation     reusable validation results and helpers
packages/travel-tools   provider-neutral travel tool contracts
packages/trailverse-adapter  read-only TrailVerse contracts
supabase                 local config, ordered migrations, and pgTAP tests
```

## Rendering boundary

App Router components are React Server Components by default. Phase 1B uses Client Components only for form state, anonymous-session establishment, copy feedback, the theme toggle, and the transient one-time invitation token. Trip-shell reads remain server-rendered.

## Package boundaries

- `@trailie/schemas` owns canonical shared schemas and inferred types.
- `@trailie/validation` consumes schemas and exposes reusable validation outcomes.
- `@trailie/travel-tools` defines honest source-attributed provider contracts, not fake implementations.
- `@trailie/trailverse-adapter` exposes read methods only and cannot mutate TrailVerse.

## Implemented data flow

The Phase 1B identity, mutation, and read path is implemented:

```text
browser -> anonymous Supabase Auth session -> authenticated JWT
        -> typed Server Action -> create_trip/join_trip RPC
        -> validated atomic database writes
        -> active participant membership -> RLS-scoped room/crew reads
```

PostgreSQL is the authorization boundary. `auth.uid()` links one real Auth user to participant rows in any number of Trips. The browser cannot directly insert participants, invites, or rooms; cannot delete rooms; and cannot read `private.room_memory` or invite-token hashes. Hosts can update only the safe room-setting columns `name`, `expected_travelers`, and `approval_mode`.

Phase 2A implements the focused-answer portion of the server application layer:

```text
persisted user message -> deterministic invocation + auth checks
                       -> idempotent private invocation/run RPCs
                       -> bounded untrusted context + deterministic model route
                       -> Responses API semantic stream -> strict final validation
                       -> one Trailie message -> existing Realtime reconciliation
```

The OpenAI SDK and Supabase secret client import `server-only`. The browser receives only the safe NDJSON event union and never provider events, usage, IDs, prompts, or reasoning. External travel data and itinerary persistence remain future work.

## Phase 1B feature boundaries

- `src/features/trips/actions` owns authenticated mutations and safe action results.
- `src/features/trips/errors` maps a closed database/application error set to user-safe copy.
- `src/features/trips/queries` owns the RLS-backed Trip-shell read.
- `src/features/trips/components` owns the entry forms, shell, and memory-only invite handoff.
- `src/features/crew` owns crew result types and presentation.

Create and Join forms validate shared camelCase contracts in the browser, establish or reuse an anonymous session, and then call a Server Action. Each action validates again, verifies the request user, invokes the Phase 1A RPC, and explicitly maps the snake_case response. No privileged client participates.

The Trip shell loads rooms, active participants, and host-only safe invite metadata through the request-scoped user client. A missing identity, RLS-empty result, malformed row, and inaccessible/nonexistent room all produce one non-enumerating unavailable state.

## Supabase client boundaries

- `src/lib/supabase/browser.ts` uses only public environment values.
- `src/lib/supabase/server.ts` creates a request-scoped App Router cookie client.
- `src/server/supabase/admin.ts` imports `server-only` and is the sole secret-key client.
- `src/proxy.ts` refreshes auth cookies for private Trip/join routes and applies conservative security headers to share and print routes. It does not authorize routes; every action and query independently verifies identity and relies on RLS.
- The secret client is used only by the Phase 2A invocation route for authorized reads and service-only AI RPCs. Ordinary chat still uses the request-scoped client.

## Phase 1C chat boundaries

The Trip route still authorizes and renders through a Server Component. It calls `get_room_messages` for the newest safe 30-message page alongside room, participant, and invite reads. `src/features/chat/actions` owns authenticated message, reaction, and pagination Server Actions; `src/features/chat/components` owns the live ledger, composer, reactions, scroll behavior, private channel lifecycle, presence, and typing. Pure helpers in `src/features/chat/lib` own deterministic deduplication and transient-state summaries.

```text
Server Component -> active membership -> get_room_messages -> initial safe page
Client Component -> optimistic UUID -> send_message -> RPC/Realtime reconciliation
                 -> private room:<uuid> channel -> Broadcast + Presence
                 -> cursor Server Action -> one older page
```

PostgreSQL remains the source of authorization and persisted truth. Realtime presence is display state only. The browser authenticates the socket with its current session before joining one private topic. `realtime.messages` RLS authorizes only active participants whose room UUID matches the topic. Database triggers broadcast only change kind, room ID, and message ID; clients refetch the safe newest page instead of receiving message bodies or auth IDs in transient events.

Message and reaction writes use user-scoped Server Actions and `SECURITY DEFINER` RPCs with explicit identity, participant ownership, active membership, room isolation, validation, idempotency, and rate controls.

## Phase 2A Trailie boundaries

`src/features/trailie` owns invocation parsing, the lean prompt, UI/stream contracts, and safe errors. `src/server/ai` owns the provider interface, OpenAI/fake providers, routing, context, HMAC safety identifier, usage extraction, logging, and structured-body extraction. `packages/schemas` owns every safe cross-boundary envelope.

The streaming route rechecks the Auth user, participant, source message, room, reply target, and deterministic invocation before an RPC can create work. Private tables are never Data API-readable. The completion RPC locks the invocation, validates the active run, inserts one `message_type = trailie` row, records only operational usage, and commits both changes atomically.

See [`database-security.md`](database-security.md) and [`realtime-chat.md`](realtime-chat.md) for schema, RPC, channel, RLS, reconciliation, pagination, and local-testing details.

## Phase 5A Preview runtime boundary

Browser code imports only `src/lib/env-public.ts`; server secrets, provider settings, the AI emergency switch, and recovery authentication live in `src/server/env.ts`. Production browser chunks must not contain the server schema or secret identifiers. All model drains call the server-only emergency guard before constructing a provider.

Focused streaming uses a Node.js route with a 60-second ceiling. The authenticated Trip route declares Node.js and a 300-second ceiling for Server Actions and their `after()` work; Next.js keeps `after()` work inside the route's configured platform lifetime. The internal recovery Node.js route also has a 300-second ceiling and handles at most one candidate from each job category concurrently.

Recovery remains database-led: service-only list/claim RPCs identify stale work, attempt/state guards prevent terminal reprocessing, and a private forced-RLS execution ledger provides a distributed cooldown. `POST /api/internal/recovery` adds constant-time bearer authentication, no-store safe-count responses, structured redacted logs, and no browser/CORS surface. Preview invokes it manually because Vercel Cron targets Production deployments only.

The selected Vercel project uses Pro Fluid Compute in `iad1`, matching these configured ceilings. Hosted acceptance measured planning at 46.671 seconds, itinerary generation at 160.316 seconds, its one repair at 80.633 seconds, revision analysis at 12.050 seconds, and candidate generation at 60.674 seconds. The planning deadline was raised from 45 to 90 seconds after two exact deadline aborts. Manual recovery is accepted only for this supervised Preview; durable automated execution remains production work.

## Phase 2B: silent memory pipeline

Human persistence remains the critical path. `sendMessageAction` schedules `after()` only after a successful database response. The background worker claims through a service-only RPC, deterministically filters chatter, loads bounded server-only context, calls the extraction provider, validates the proposed patch, and applies it atomically. Normalized facts are evidence history; `private.room_memory` is the rebuildable read projection. See [conversation-memory.md](conversation-memory.md).

## Phase 3A: approval-gated planning basis

The Plan tab calls an authenticated create RPC and returns immediately. A post-response worker claims the request, reads a service-only bounded context, validates Sol's strict summary, replaces model readiness with deterministic application readiness, and transactionally inserts a new immutable version. The browser polls the safe room-scoped planning view; no private memory or operational run record crosses that boundary.

Approvals and change requests use participant-owned RPCs. Database locks, one active request per room, version-scoped unique approvals, basis fingerprints, and immutable summary rows enforce concurrency and stale-version safety. A server-only recovery drain can reclaim draft/failed/stale-generating requests and abandoned Phase 2B extractions. See [planning-approval.md](planning-approval.md).

## Phase 3B: validated itinerary publication

`src/features/itinerary` owns bounded context, the Sol/fake provider boundary, semantic progress, evidence enrichment, deterministic validation, one repair, recovery, actions, and Plan UI. `@trailie/schemas` owns strict safe plan contracts; `@trailie/travel-tools` owns provider-neutral evidence. Public plan rows/events are room-readable, while runs, tool evidence, and reports are private forced-RLS records reached only through narrow service RPCs. See [itinerary-generation.md](itinerary-generation.md).
