# Phase 3A Planning Approval Design

## Scope

Phase 3A turns silent crew understanding into a visible, approval-gated planning summary. It stops at `approved_for_generation`; it never generates itinerary content, calls travel tools, or posts a Trailie chat message.

## Lifecycle and data model

One active `planning_requests` row per room owns the lifecycle `draft → generating_summary → awaiting_review / changes_requested → approved_for_generation`, with terminal `superseded`, `cancelled`, and `failed` states. `planning_summaries` are immutable, monotonically versioned JSON documents. `planning_approvals` stores one current decision per participant and version; immutable summary versions preserve the review basis while version scoping prevents approval carryover.

## Summary and readiness

The strict summary separates confirmed decisions, traveler preferences, constraints, proposals, rejected options, conflicts, open questions, missing critical information, and non-assumptions. The model reconstructs evidence; application code computes readiness. A destination or explicitly unresolved destination choice, a usable date range or explicit flexible-date state, active travelers, major hard constraints, and absence of schedule-breaking contradictions are required for approval. Optional dining, activity, property, packing, and purchase details are warnings at most.

## Approval and staleness

`all_active` requires every current active participant. `host_only` requires the current active host; deterministic readiness blockers still prevent approval. A summary is stale when memory version, latest eligible planning-message basis, active-participant fingerprint, or room approval mode changes. Stale summaries remain readable, reject new approvals, and require a new immutable version. A change request requires a bounded note and moves the request to `changes_requested`.

## AI execution

The verified model is `gpt-5.6-sol`, Responses API strict `text.format`, standard mode with `reasoning.effort: high`, `store: false`, no tools, bounded output, timeout/abort, and at most one schema-repair retry. Prompt `trailie-planning-summary-v1` treats private memory and bounded recent messages as untrusted evidence, preserves uncertainty, and forbids itinerary generation or consensus invention.

## Boundaries, recovery, and UI

Authenticated members read safe public request, summary, and approval projections. Browser mutations use narrow identity-verifying RPCs/Server Actions. Private memory, normalized facts, generation claims, provider metadata, and recovery are service-only. Next `after()` is the best-effort fast path; database leases allow a server-only drain to reclaim abandoned summary work and stale Phase 2B queued/running extractions. The old test memory route is removed from the App Router and E2E uses a local test helper outside the production route tree.

Desktop and mobile Plan views support empty, generating, review, stale, changes-requested, failed, and approved states. Minimal room invalidations cause safe refetches. No UI claims itinerary planning has begun before approval.
