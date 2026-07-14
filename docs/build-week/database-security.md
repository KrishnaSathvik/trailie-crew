# Database Security

## Anonymous identity

Trailie Crew uses Supabase anonymous sign-ins so a browser receives a real `auth.users` identity and authenticated JWT without collecting personal information. Authorization always derives from `auth.uid()` and participant membership. Display names, room codes, local-storage identifiers, and cookies without a valid Supabase identity are never authorization inputs.

Anonymous identities are durable only while the browser retains its session. Production setup should add CAPTCHA or Turnstile and an anonymous-user cleanup policy to limit abuse; those operational controls are not part of the local persistence foundation.

## Ownership and storage

- `public.rooms` owns Trip settings and records the creating Auth user in `host_user_id`.
- `public.participants` links Auth users to Trips. One user may participate in multiple Trips, but only once per Trip.
- `public.room_invites` owns invitation lifecycle metadata. It stores a unique short code and a deterministic SHA-256 hash of the long token.
- `private.room_memory` owns future server-maintained group context. The `private` schema is not exposed through the Data API and browser roles receive neither schema nor table privileges.
- `private.ai_invocations` and `private.ai_runs` own Phase 2A workflow state and operational provider metadata. They contain no prompt, transcript copy, raw provider response, secret, or hidden reasoning.

The initial invite long token is 32 cryptographically random bytes encoded in a URL-safe form. `create_trip` returns it once and stores only its hash. `join_trip` hashes long input for lookup or normalizes an eight-character short code. Short codes are a convenience credential layered with a real authenticated identity, invite lifecycle checks, Trip status, and membership/name constraints; public invite URLs should use the high-entropy token.

In Phase 1B, the create Server Action returns the raw token to the initiating form exactly once. The form places it in an in-memory React provider immediately before navigating to the Trip shell. The host may display or copy `/join/<encoded-token>` during that page lifetime. The token is not written to localStorage, cookies, analytics, application logs, a host URL, or a database row; refresh destroys it. Later host access exposes only the safe short code through `room_invite_metadata`.

## RPC-only workflows

`public.create_trip(text, text, integer)` validates identity and inputs, generates unique credentials, and atomically inserts the room, host participant, invite, and private memory row.

`public.join_trip(text, text)` locks both the matching invite and room before checking revocation, expiry, usage, room status, membership, and case-insensitive active names. The lock serializes joins for a Trip and prevents `max_uses` races. Participant insertion and the single usage increment share the caller transaction.

Both public RPCs are `SECURITY DEFINER`, set an empty search path, fully qualify referenced objects, reject missing `auth.uid()`, and are executable only by `authenticated`. There are no overloaded variants.

Phase 1B calls those RPCs only from Server Actions using the request-scoped user client. Browser validation improves feedback, but every action repeats schema validation and identity verification. Controlled `P0001` messages from the committed Phase 1A migration map to a closed application error union; unknown database details are discarded.

## RLS and grants

- Active members may select their rooms and crew rows.
- Hosts may update only `rooms.name`, `rooms.expected_travelers`, and `rooms.approval_mode`.
- Hosts may select `room_invite_metadata`, a security-invoker view that omits `token_hash`.
- Browser roles have no direct room insert/delete, participant write, invite write, or private-memory access.
- Private membership helpers bypass participant RLS to avoid recursive policies. They have empty search paths and only the helpers required by policies are executable by `authenticated`; `owns_participant` remains unavailable to clients until a future workflow needs it.
- `private.room_memory` has forced RLS plus an explicit restrictive deny policy for browser roles. Trusted secret-key/backend access bypasses RLS when deliberately used.
- The Trip shell performs ordinary user-scoped reads. An outsider, missing session, or inaccessible identifier receives the same safe unavailable state.
- The session-refresh proxy changes cookies only. It is not an authorization boundary.
- The server-only secret client is limited to the Phase 2A invocation route. It receives SELECT on existing public messages/participants and EXECUTE on four server-only AI RPCs; it receives no direct private AI-table privilege.

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
pnpm dev:local
pnpm build:local
pnpm test:e2e
```

The `dev:local`, `build:local`, and Playwright launchers map these public local values in process memory:

```text
API_URL        -> NEXT_PUBLIC_SUPABASE_URL
PUBLISHABLE_KEY -> NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

The local launcher passes the local `SECRET_KEY` only to the server process for Phase 2A. A real OpenAI run additionally requires server-only OpenAI variables; the browser bundle never receives either secret.

Stop the disposable local stack with `pnpm exec supabase stop`. Never run `supabase link`, `db push`, or secret-key commands against production as part of this local workflow.

## Phase 1C messages and reactions

`public.messages` binds `(participant_id, room_id, sender_user_id)` to a composite participant identity, so database integrity prevents cross-room participants and sender spoofing. A composite reply foreign key keeps replies in the same room. User bodies are trimmed and constrained to 1–4000 characters. The partial unique reconciliation index on `(room_id, sender_user_id, client_message_id)` makes retries idempotent.

`public.message_reactions` accepts only `like`, `love`, `laugh`, `celebrate`, or `thinking`; a trigger enforces that the reacting participant belongs to the message room. Authenticated clients receive SELECT only. Active-member policies isolate both tables by room, and no direct insert, update, or delete privileges or policies exist.

`send_message` validates identity, active membership, participant ownership, body, reply visibility, idempotency, and an eight-messages-per-ten-seconds rolling limit before forcing `message_type = user`. `toggle_message_reaction` validates the canonical value and ownership, then uses a transaction advisory lock to serialize the exact toggle. `get_room_messages` caps pages at 50, uses `(created_at, id)` cursor order, and constructs only safe sender/reply/reaction summaries. None returns email, auth metadata, or sender user IDs.

Phase 2A redefines only the `send_message` rate-count predicate so server-created Trailie rows do not consume the human sender allowance.

Realtime Broadcast and Presence use the same active membership helper against a parsed `room:<uuid>` topic. Database notifications contain no body or user identity. Client-sent typing and presence payloads contain participant ID, display name, timestamps, and optional `chat` area only; receivers schema-validate them against the server-provided active crew. Presence never grants access.

## Phase 2A private AI workflow

Both AI tables have forced RLS, deny policies, and revoked browser/service table privileges. `create_ai_invocation`, `start_ai_run`, `complete_ai_run`, and `fail_ai_run` are `SECURITY DEFINER`, set an empty search path, fully qualify objects, and grant EXECUTE only to `service_role`. Creation validates the active room/participant/source relationship and reply target, hashes the deterministic idempotency input, and enforces ten invocations per user/room/ten minutes. Start/completion/failure lock the invocation row and enforce the closed state machine.

Completion inserts the Trailie message and marks the run/invocation complete in one transaction. The unique idempotency key, unique response-message reference, row locks, active-run state, and completed-state reuse prevent duplicate successful answers across tabs, retries, reconnects, and workers. A failed invocation can start at most one additional run. Browser roles cannot read the private tables, execute the AI RPCs, or create `message_type = trailie` rows.

## Implemented and planned

Phase 2A adds deterministic Trailie invocation, private AI workflow/usage records, server-only OpenAI access, and one persisted focused response. It does not implement membership-management RPCs, planning, itinerary data, live tools, uploads, message editing/deletion, moderation, or production CAPTCHA/anonymous-user cleanup.
