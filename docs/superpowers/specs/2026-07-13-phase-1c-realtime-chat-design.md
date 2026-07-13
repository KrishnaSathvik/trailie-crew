# Phase 1C Realtime Chat Design

## Scope

Phase 1C turns the existing Trip shell into one persistent crew conversation. Active members can load history, send immutable user messages, reply, react with five canonical reactions, see online crew, and see expiring typing indicators. Trailie mentions remain ordinary user text. Planning, model calls, maps, files, exports, moderation, editing, and deletion stay deferred.

## Database

Add `public.message_type`, `public.messages`, and `public.message_reactions` in a new timestamped imperative migration. Messages enforce a trimmed 1–4000 character body for user rows, same-room participant and reply references, sender ownership, and uniqueness of `(room_id, sender_user_id, client_message_id)` when the client identifier exists. User rows are immutable and soft-delete columns are reserved. Reactions use canonical values `like`, `love`, `laugh`, `celebrate`, and `thinking` with one row per message, participant, and reaction.

Authenticated clients receive table SELECT privileges only. RLS permits reads only while `auth.uid()` owns an active participant in the message room. Direct table inserts, updates, and deletes are not granted. `send_message`, `toggle_message_reaction`, and `get_room_messages` are `SECURITY DEFINER`, use an empty search path, explicitly validate `auth.uid()`, active membership, participant ownership, room isolation, and inputs, and are executable only by `authenticated`.

`send_message` is idempotent by `client_message_id` and limits a participant to eight new messages in a rolling ten-second window. `toggle_message_reaction` serializes toggles using an advisory transaction lock derived from the message, participant, and reaction. `get_room_messages` caps pages at 50 and orders by `(created_at DESC, id DESC)`, returning sender summaries, reply previews, grouped reaction counts, whether the current participant reacted, and a next cursor without auth data.

## Realtime

Every Trip uses one private channel named `room:<roomId>`. RLS on `realtime.messages` allows active room members to receive Presence and Broadcast events for only that topic and to publish transient events only to that topic. Database triggers emit minimal persisted-change Broadcast notifications containing room/message identifiers, never sender auth IDs or message bodies. The client responds by fetching the newest safe page and merging it, so server RPC output remains the canonical rendering contract.

Presence tracks `{ participantId, displayName, connectedAt, currentArea: "chat" }`. The UI accepts only payloads matching shared schemas and known active participants, collapses duplicate tabs by participant ID, and never treats presence as authorization. Typing broadcasts `{ participantId, displayName, isTyping, expiresAt }`, are debounced, ignored for the current participant, and expire locally after three seconds. Channel construction authenticates Realtime, uses `private: true`, occurs once per mounted room, refetches on subscription/reconnect, and removes the channel on cleanup.

## Application boundaries

The Trip route remains a Server Component. It verifies the caller through the existing RLS-backed shell query and loads the initial message page through `get_room_messages`. Server Actions validate camelCase Zod inputs, invoke message/reaction RPCs with snake_case arguments, map controlled errors to a closed safe union, and parse safe RPC output. They never use the admin client.

The client chat boundary owns pagination, optimistic state, Realtime, presence, typing, scroll behavior, and the composer. Pure helpers implement stable merging, optimistic reconciliation, reaction rollback, typing expiry/summarization, presence summarization, and near-bottom detection so behavior is unit-testable without a socket.

## Optimism and history

Sending creates a UUID `clientMessageId`, inserts a pending local row, and invokes the action. RPC and Realtime records reconcile first by database ID and then by `clientMessageId`. A database event arriving before the RPC cannot duplicate the message. A failed send remains visible with Retry; retry uses the same UUID. Composer text clears only on accepted success and is restored if the user has not begun a newer draft.

The initial newest 30 rows render oldest-to-newest and scroll once to the bottom. Earlier pages prepend and preserve the viewport by applying the change in scroll height. Page merges deduplicate by message ID. Incoming updates auto-scroll only when already near the bottom; otherwise a New messages affordance appears.

## Interface

The existing monochrome Trip shell remains. The main column becomes an editorial conversation ledger: compact sender/timestamp metadata, unboxed body copy, reply rule, restrained reaction pills, and clear pending/failed annotations. Desktop retains both rails. Mobile uses a full-width history and sticky composer above the existing navigation; People opens a safe crew drawer. The composer is labelled, multiline, Enter-to-send, Shift+Enter-to-newline, capped at 4000 characters, and announces errors and near-limit counts.

## Verification

pgTAP covers all RPC validation, idempotency, cursor ordering, aggregation, room isolation, grants, policies, and direct-mutation denial. Vitest covers schemas, mappers, actions, reducers/helpers, composer behavior, empty state, retry, reaction rollback, typing expiry, presence summaries, pagination, and the absence of Trailie output. Playwright uses two independent authenticated browser contexts for real database and socket delivery, reactions, presence, typing, persistence, pagination, outsider isolation, responsive layout, keyboard behavior, themes, and console cleanliness.
