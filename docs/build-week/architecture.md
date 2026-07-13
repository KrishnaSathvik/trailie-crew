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
supabase                 future migrations and database tests
```

## Rendering boundary

App Router components are React Server Components by default. A file may use `"use client"` only when browser state or direct interaction requires it. In Phase 0, the theme toggle is the only Client Component.

## Package boundaries

- `@trailie/schemas` owns canonical shared schemas and inferred types.
- `@trailie/validation` consumes schemas and exposes reusable validation outcomes.
- `@trailie/travel-tools` defines honest source-attributed provider contracts, not fake implementations.
- `@trailie/trailverse-adapter` exposes read methods only and cannot mutate TrailVerse.

## Planned data flow

The following is architectural intent and is not implemented in Phase 0:

```text
crew action -> server application layer -> policy/invocation check
            -> model orchestration and approved tools
            -> structured validation -> versioned itinerary persistence
```

External data will retain source and retrieval metadata. Secrets and privileged provider clients remain server-only. TrailVerse access, if added, will use its service API through the read-only adapter rather than a shared database connection.
