# Planning Summary and Approval

Planning-summary approval authorizes Version 1 only. It never approves a later change. Each revision snapshots approval mode, requires fresh analysis approval, then separate final candidate confirmation.

Phase 3A turns the crew's conversation into a reviewable planning basis. An active member explicitly selects **Build Our Itinerary**; this creates an idempotent planning request, not an itinerary. A server worker reconstructs the private memory snapshot, active normalized facts, active participants, bounded recent conversation, and prior revision notes into the immutable summary **Before I build the trip**.

## Lifecycle and versions

Requests use the closed states `draft`, `generating_summary`, `awaiting_review`, `changes_requested`, `approved_for_generation`, `superseded`, `cancelled`, and `failed`. Each successful generation inserts a new immutable `planning_summaries` version. Reviews are scoped to one version, so approvals never carry forward. `approved_for_generation` means only that the reviewed basis is ready for the next phase; Phase 3A has no itinerary schema, tool call, message, or generation path.

The public request, summary, approval, and review-event tables are room-readable through RLS. Browsers receive only the safe summary and participant display identities. All creates, reviews, and regeneration requests use identity-checking RPCs. Generation claims, private context, usage records, and recovery drains are service-only. Every definer function uses `search_path = ''` and narrow grants.

## Summary contract and readiness

Schema version `1` separates confirmed decisions, individual traveler preferences, hard constraints, proposals, rejected options, conflicts, open questions, missing critical information, and non-assumptions. Visible item IDs are stable application-safe strings and evidence contains bounded source message IDs, never private fact JSON, confidence, Auth IDs, emails, prompts, or provider details.

Application code—not the model—computes readiness. A destination or explicit unresolved destination choice, a usable or explicitly flexible date state, an active traveler set, and schedulable hard constraints are required for `ready_for_review`. Missing required information yields `needs_information`; impossible contradictions yield `blocked`. Restaurants, exact hotels, optional activities, packing, and purchase details are warnings at most. Only `ready_for_review` can become approved.

## Approval and staleness

`all_active` requires every currently active participant. `host_only` requires the active host; other members may still request changes. Removed members stop blocking, and a new active member becomes required before completion. The mode is snapshotted on the request, while a later room-mode change makes the current summary stale and requires regeneration.

Staleness is deterministic: a newer effective memory version, newer completed eligible planning message, changed active-member fingerprint, or changed approval mode blocks new approvals. Presence, typing, reactions, and deterministically skipped chatter do not change the basis. Existing review history remains intact.

A change request requires a bounded note, moves the request to `changes_requested`, and preserves the published version. Regeneration claims the same request and creates the next immutable version from current evidence plus review notes.

## Model and execution

Official OpenAI documentation was reverified on July 13, 2026. Summary reconstruction uses exact `gpt-5.6-sol`, `openai@6.46.0`, Responses API strict `text.format`, `reasoning.effort: "high"`, `store: false`, no tools, a 3,000-token cap, a 45-second abort timeout, and prompt `trailie-planning-summary-v1`. One retry is allowed for retryable provider/schema failures. The deterministic fake provider is used in normal tests; the live planning smoke was not run and no live success is claimed.

Next.js `after()` starts work after the request response and an in-process semaphore caps concurrency at two. Claims, immutable versions, and unique approvals make duplicate schedules harmless. Because `after()` is best effort, the server-only recovery drain reclaims draft/failed/stale-generating planning requests and Phase 2B queued/stale-running extractions under retry caps. Production hardening should schedule that drain through a durable cron/queue.

The former memory-inspection API route was removed. E2E inspection now uses a Node-side local Supabase fixture, so the production route manifest contains no private-memory inspection endpoint.

## Phase 3B handoff

`approved_for_generation` still means only that the current summary is approved. The separate itinerary lifecycle snapshots its summary ID/version/hash and never updates the approval or summary. **Generate Itinerary** is visible only in this state; the server rechecks approval, staleness, readiness, membership, room state, and idempotency before Version 1 can exist. See [itinerary-generation.md](itinerary-generation.md).
