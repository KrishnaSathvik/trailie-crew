# Phase 1B Create and Join Design

## Scope

Phase 1B delivers the first complete Trailie Crew journey: landing page to authenticated create or join mutation to an RLS-protected Trip shell. Chat, realtime, Trailie, planning, itineraries, maps, and exports remain explicitly unavailable.

## Architecture

- Server Components render route shells and perform initial RLS-backed reads.
- Small Client Components own form state, inline validation, submit locking, copy feedback, and the one-time invite token.
- Server Actions validate shared camelCase inputs, use the request-scoped Supabase client, call the Phase 1A RPCs, parse their snake_case results, and return typed safe errors.
- A narrow Supabase proxy refreshes auth cookies for Trip and Join routes. It is session plumbing, not an authorization boundary.
- The Trip shell queries only `rooms`, `participants`, and safe `room_invite_metadata`. RLS remains the source of truth and outsiders receive a non-enumerating unavailable state.
- No service-secret or admin client participates in the product flow.

## Invite-token lifetime

`create_trip` returns the raw token once. The create form transfers it to an in-memory React provider immediately before navigating to the Trip shell. The host may copy `/join/<encoded-token>` during that browser lifetime. The token is never written to a URL for the host, cookies, localStorage, analytics, logs, or the database, and a refresh intentionally discards it. Safe short-code metadata remains available to the host later.

## Error model

Application errors use a closed code union. Both browser and server validation use shared Zod contracts. Server Actions translate controlled PostgreSQL/RPC failures to safe codes and never return raw database details. Phase 1A currently emits the standard PostgreSQL exception code `P0001`; mapping therefore checks that code before matching only the migration's controlled messages.

## Interface

The existing Geist, monochrome neutral, restrained-radius design remains intact. The route-line motif becomes functional wayfinding. Desktop uses a left Trip rail, central conversation placeholder, and crew panel; mobile collapses to one column with a four-item bottom navigation. Chat, Plan, and Map are visibly marked upcoming. All inputs have semantic labels, visible focus, inline errors, an error summary, and stable pending states.

## Database decision

No Phase 1B migration is planned. Existing RLS policies support room and crew reads, the safe invite metadata view supplies host-only short-code information, and the Phase 1A RPCs supply atomic mutations. A migration will be added only if tests reveal a genuine missing capability.
