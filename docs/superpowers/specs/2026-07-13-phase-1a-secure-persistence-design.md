# Phase 1A Secure Persistence Design

## Scope

Phase 1A adds anonymous Supabase identities, Trip persistence, crew membership, secure invite lookup, RPC-only create/join workflows, RLS, typed application boundaries, and automated database/application tests. It deliberately excludes create/join UI, chat, realtime, Trailie, OpenAI, planning, and itineraries.

## Database

Two imperative migrations keep the audit surface clear. The schema migration creates the `public` and `private` objects, enum types, constraints, indexes, and timestamp maintenance. The security migration creates locked-search-path helpers and RPCs, grants, RLS policies, and the safe invite metadata view.

`create_trip` generates an unambiguous eight-character room code and a 32-byte URL-safe invite token. Only the token's SHA-256 digest is stored. `join_trip` resolves either representation and locks the invite row before checking limits and incrementing usage. All work occurs in the caller's transaction, so exceptions roll back every artifact.

Active participant membership controls room and crew reads. Hosts can update only safe room-setting columns and read invite metadata that excludes token hashes. There are no client grants for direct participant/invite writes or private room memory access. Private security-definer helpers use `SET search_path = ''`, fully qualified references, explicit `auth.uid()` checks, and minimal execution grants.

## Application boundary

The Next.js application uses current `@supabase/supabase-js` and `@supabase/ssr` packages. Browser and per-request server clients use only the publishable key. A `server-only` admin factory is the sole consumer of `SUPABASE_SECRET_KEY`. Environment values are parsed with Zod, and database-shaped results are converted to idiomatic camelCase through explicit mappers. A browser helper reuses a valid session or calls `signInAnonymously()`.

No proxy or middleware is added because this phase introduces no authenticated server-rendered route that needs automatic token refresh.

## Verification

Vitest covers schemas, environment validation, mappers, and anonymous-session behavior. pgTAP covers schema invariants, create/join success and rejection paths, invite storage/usage, and RLS boundaries. Local Supabase configuration enables anonymous sign-ins without linking a remote project.
