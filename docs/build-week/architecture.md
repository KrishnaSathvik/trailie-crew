# Architecture

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

The following remains architectural intent and is not implemented in Phase 1C:

```text
crew action -> server application layer -> policy/invocation check
            -> model orchestration and approved tools
            -> structured validation -> versioned itinerary persistence
```

External data will retain source and retrieval metadata. Secrets and privileged provider clients remain server-only. TrailVerse access, if added, will use its service API through the read-only adapter rather than a shared database connection.

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
- `src/proxy.ts` refreshes auth cookies only for `/trips/*` and `/join/*`. It does not authorize routes; every action and query independently verifies identity and relies on RLS.
- The admin client is not used by the Phase 1B product flow.

## Phase 1C chat boundaries

The Trip route still authorizes and renders through a Server Component. It calls `get_room_messages` for the newest safe 30-message page alongside room, participant, and invite reads. `src/features/chat/actions` owns authenticated message, reaction, and pagination Server Actions; `src/features/chat/components` owns the live ledger, composer, reactions, scroll behavior, private channel lifecycle, presence, and typing. Pure helpers in `src/features/chat/lib` own deterministic deduplication and transient-state summaries.

```text
Server Component -> active membership -> get_room_messages -> initial safe page
Client Component -> optimistic UUID -> send_message -> RPC/Realtime reconciliation
                 -> private room:<uuid> channel -> Broadcast + Presence
                 -> cursor Server Action -> one older page
```

PostgreSQL remains the source of authorization and persisted truth. Realtime presence is display state only. The browser authenticates the socket with its current session before joining one private topic. `realtime.messages` RLS authorizes only active participants whose room UUID matches the topic. Database triggers broadcast only change kind, room ID, and message ID; clients refetch the safe newest page instead of receiving message bodies or auth IDs in transient events.

Message and reaction writes use user-scoped Server Actions and `SECURITY DEFINER` RPCs with explicit identity, participant ownership, active membership, room isolation, validation, idempotency, and rate controls. The admin client remains unused.

See [`database-security.md`](database-security.md) and [`realtime-chat.md`](realtime-chat.md) for schema, RPC, channel, RLS, reconciliation, pagination, and local-testing details.
