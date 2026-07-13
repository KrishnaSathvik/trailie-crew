# Database Security

## Anonymous identity

Trailie Crew uses Supabase anonymous sign-ins so a browser receives a real `auth.users` identity and authenticated JWT without collecting personal information. Authorization always derives from `auth.uid()` and participant membership. Display names, room codes, local-storage identifiers, and cookies without a valid Supabase identity are never authorization inputs.

Anonymous identities are durable only while the browser retains its session. Production setup should add CAPTCHA or Turnstile and an anonymous-user cleanup policy to limit abuse; those operational controls are not part of the local Phase 1A foundation.

## Ownership and storage

- `public.rooms` owns Trip settings and records the creating Auth user in `host_user_id`.
- `public.participants` links Auth users to Trips. One user may participate in multiple Trips, but only once per Trip.
- `public.room_invites` owns invitation lifecycle metadata. It stores a unique short code and a deterministic SHA-256 hash of the long token.
- `private.room_memory` owns future server-maintained group context. The `private` schema is not exposed through the Data API and browser roles receive neither schema nor table privileges.

The initial invite long token is 32 cryptographically random bytes encoded in a URL-safe form. `create_trip` returns it once and stores only its hash. `join_trip` hashes long input for lookup or normalizes an eight-character short code. Short codes are a convenience credential layered with a real authenticated identity, invite lifecycle checks, Trip status, and membership/name constraints; public invite URLs should use the high-entropy token.

## RPC-only workflows

`public.create_trip(text, text, integer)` validates identity and inputs, generates unique credentials, and atomically inserts the room, host participant, invite, and private memory row.

`public.join_trip(text, text)` locks both the matching invite and room before checking revocation, expiry, usage, room status, membership, and case-insensitive active names. The lock serializes joins for a Trip and prevents `max_uses` races. Participant insertion and the single usage increment share the caller transaction.

Both public RPCs are `SECURITY DEFINER`, set an empty search path, fully qualify referenced objects, reject missing `auth.uid()`, and are executable only by `authenticated`. There are no overloaded variants.

## RLS and grants

- Active members may select their rooms and crew rows.
- Hosts may update only `rooms.name`, `rooms.expected_travelers`, and `rooms.approval_mode`.
- Hosts may select `room_invite_metadata`, a security-invoker view that omits `token_hash`.
- Browser roles have no direct room insert/delete, participant write, invite write, or private-memory access.
- Private membership helpers bypass participant RLS to avoid recursive policies. They have empty search paths and only the helpers required by policies are executable by `authenticated`; `owns_participant` remains unavailable to clients until a future workflow needs it.
- `private.room_memory` has forced RLS plus an explicit restrictive deny policy for browser roles. Trusted secret-key/backend access bypasses RLS when deliberately used.

## Local commands

This project is not linked to a remote Supabase project.

```bash
pnpm install
pnpm exec supabase start
pnpm exec supabase status -o env
pnpm exec supabase db reset
pnpm exec supabase test db
pnpm exec supabase db lint --local --level warning
pnpm exec supabase db advisors --local --type security --level info
```

Map local status output into `.env.local`:

```text
API_URL        -> NEXT_PUBLIC_SUPABASE_URL
PUBLISHABLE_KEY -> NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SECRET_KEY     -> SUPABASE_SECRET_KEY
```

Stop the disposable local stack with `pnpm exec supabase stop`. Never run `supabase link`, `db push`, or secret-key commands against production as part of this local workflow.

## Implemented and planned

Phase 1A implements identity, persistence, create/join RPCs, grants, RLS, typed clients/contracts, and automated permission/workflow tests. It does not implement Create Trip or Join Trip UI, membership-management RPCs, chat, realtime, Trailie, OpenAI calls, planning, itinerary data, or production abuse controls.
