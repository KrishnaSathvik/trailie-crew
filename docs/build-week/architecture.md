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

App Router components are React Server Components by default. A file may use `"use client"` only when browser state or direct interaction requires it. In Phase 0, the theme toggle is the only Client Component.

## Package boundaries

- `@trailie/schemas` owns canonical shared schemas and inferred types.
- `@trailie/validation` consumes schemas and exposes reusable validation outcomes.
- `@trailie/travel-tools` defines honest source-attributed provider contracts, not fake implementations.
- `@trailie/trailverse-adapter` exposes read methods only and cannot mutate TrailVerse.

## Planned data flow

The Phase 1A identity and persistence path is implemented:

```text
browser -> anonymous Supabase Auth session -> authenticated JWT
        -> create_trip/join_trip RPC -> validated atomic database writes
        -> active participant membership -> RLS-scoped room/crew reads
```

PostgreSQL is the authorization boundary. `auth.uid()` links one real Auth user to participant rows in any number of Trips. The browser cannot directly insert participants, invites, or rooms; cannot delete rooms; and cannot read `private.room_memory` or invite-token hashes. Hosts can update only the safe room-setting columns `name`, `expected_travelers`, and `approval_mode`.

The following remains architectural intent and is not implemented in Phase 1A:

```text
crew action -> server application layer -> policy/invocation check
            -> model orchestration and approved tools
            -> structured validation -> versioned itinerary persistence
```

External data will retain source and retrieval metadata. Secrets and privileged provider clients remain server-only. TrailVerse access, if added, will use its service API through the read-only adapter rather than a shared database connection.

## Supabase client boundaries

- `src/lib/supabase/browser.ts` uses only public environment values.
- `src/lib/supabase/server.ts` creates a request-scoped App Router cookie client.
- `src/server/supabase/admin.ts` imports `server-only` and is the sole secret-key client.
- No proxy/middleware is present because Phase 1A has no authenticated server-rendered route requiring automatic refresh.

See [`database-security.md`](database-security.md) for the schema, RPC, invite, RLS, and local-testing details.
