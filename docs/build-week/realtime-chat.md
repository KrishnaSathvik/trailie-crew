# Realtime Crew Chat

## Persisted and transient events

Messages, reactions, and participant membership/status are persisted in PostgreSQL. Messages and reactions are mutated only through authenticated RPCs. Database triggers publish minimal `chat_changed` notifications after commit so connected clients know which safe page to reconcile.

Presence and typing are transient. They share the room channel but never enter an application table. Presence contains only participant ID, display name, connection time, and `chat` area. Typing contains participant ID, display name, boolean state, and expiration. Neither contains email, Auth user ID, invite data, or private metadata.

## Private channel

Each mounted Trip chat creates exactly one `room:<roomId>` channel with `private: true`. The browser obtains its current authenticated session and calls Realtime `setAuth` before subscribing. `realtime.messages` SELECT/INSERT policies parse the topic UUID and require the JWT owner to have an active participant in that room. The component untracks only after a successful subscription and always removes the channel on cleanup.

Database Broadcast events use the same topic and contain only `{ kind, roomId, messageId }`. The client refetches the newest safe page through the history Server Action, which avoids exposing raw message-table rows or sender Auth IDs through transient payloads. Subscription success and reconnect both trigger this reconciliation fetch.

## Optimistic reconciliation

Every outgoing message receives a UUID `clientMessageId`. The ledger inserts a pending local row before calling `send_message`. RPC and Realtime results merge by database ID or non-null client message ID, so either arrival order produces one rendered message. A database uniqueness index makes retrying the same ID safe.

RPC or transport failure marks the row `failed`, keeps the composer draft, and exposes Retry. Retry reuses the same ID. Acceptance replaces the pending/failed row with the validated server row and clears the retained draft. Reactions snapshot the current message, apply a local canonical toggle, and restore the snapshot on failure.

## History and scroll behavior

`get_room_messages` orders by `(created_at DESC, id DESC)`, returns 30 by default, and caps requests at 50. Each result includes a cursor for its oldest returned row and a `has_more` flag. The application reverses each database page for chronological display, deduplicates IDs while merging, and prepends only the requested older page.

The initial entry scrolls to the newest message once. Prepending records the old scroll height/top and restores the same visual anchor. Incoming messages scroll only if the reader is near the bottom; otherwise a New messages button appears.

## Presence and typing

Presence state is schema-validated and filtered against the active crew loaded by the Trip shell. Multiple tabs collapse to one online participant. The crew rail/drawer shows role, current user, online/offline state, and online count. Presence is presentation only; database membership remains authorization.

Typing broadcasts are sent at most twice per second while input changes, followed by an automatic stop event. Receivers exclude the current participant and discard states after three seconds, producing one-name, two-name, or several-people summaries.

## Deferred behavior

`@Trailie` is ordinary message text in Phase 1C. There are no assistant rows, OpenAI calls, planning tools, uploads, editing/deletion, AI memory, maps, itinerary generation, exports, or moderation workflows.
