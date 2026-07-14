# Phase 4A Itinerary Revisions Design

## Scope and invariant

Phase 4A adds explicit, approval-gated itinerary revisions. A published itinerary is never edited or replaced in place. Each accepted request produces a separately validated candidate `trip_plans` row and, after final crew confirmation, publishes it as exactly the next room-level itinerary version. Ordinary chat does not create revision work.

Public sharing, exports, booking, free-form collaborative editing, automatic application, mutating rollback, external browsing, autonomous agents, hidden reasoning, branching variants, and automatic request merging remain out of scope.

## Lifecycle

An active member starts a request through **Request a Change**, **Change this**, or the application-owned `request_plan_change` action. The request snapshots the current plan ID, version, hash, approval mode, and active-member fingerprint. The closed lifecycle is:

`draft → analyzing → awaiting_review → approved → applying → validating → awaiting_confirmation → published`

`changes_requested`, `blocked`, `failed`, `cancelled`, and `superseded` are retained terminal or recovery states. Analysis and candidate state remain independently represented by immutable analysis versions, a separate candidate plan, validation reports, and candidate confirmations.

## Persistence and security

`plan_change_requests` owns lifecycle and immutable base identity. `plan_change_analyses` stores safe immutable structured analyses. `plan_change_approvals` stores one analysis decision per participant/version. `plan_change_confirmations` stores one final candidate decision per participant/candidate. `plan_change_events` stores safe semantic progress. `private.plan_change_runs` stores operational claims, model/provider identifiers, usage, latency, attempts, leases, and safe errors.

Public tables use room-member SELECT RLS and deny browser DML. Private records use forced RLS and no browser grants. Browser writes use narrow `SECURITY DEFINER` RPCs with `search_path = ''`, explicit `auth.uid()` ownership, active membership, room/base/target/version checks, and minimum grants. Service-only claims and completion wrappers are not executable by browser roles.

## Materiality and impact

Application code owns materiality. Request type establishes a deterministic floor; dates, destination, confirmed must-dos, accessibility/dietary requirements, and hard-constraint changes are critical. Item moves/replacements, routes, lodging, day structure, budget, and traveler logistics are material. Only bounded wording/note or isolated timing changes with no dependency impact may remain minor. Model output may raise but never lower the deterministic result.

The model proposes only the explicit change impact. Deterministic verification checks target/day existence, route chains, downstream timing, arrivals/departures, reservations, opening evidence, lodging windows, budget, constraints, confirmed decisions, rejected options, daily load, and evidence refresh requirements. Invalid references or blockers prevent review.

## Models and prompts

Impact analysis uses exact `gpt-5.6-terra` for one-day, one/two-item changes without lodging, dates, arrivals, route chains, or confirmed-decision effects. Exact `gpt-5.6-sol` is selected deterministically for broader or critical work. Candidate generation and bounded repair use exact `gpt-5.6-sol`.

Both use the Responses API through pinned `openai@6.46.0`, native Zod Structured Outputs, `store: false`, explicit reasoning effort, bounded output, timeout, abort signal, safety identifier, no tools, and no model-owned routing or publication. Prompts are `trailie-change-analysis-v1` and `trailie-itinerary-revision-v1`.

## Approval and staleness

Analysis approval is version-scoped. `all_active` requires every active participant; `host_only` requires the active host, while other members may request changes. A blocker prevents completion and `changes_requested` requires a note. Final confirmation is a separate approval over the exact validated candidate and diff, using the same snapshotted mode and current required voters.

Every approval, claim, confirmation, and publication rechecks base plan ID/version/hash, room current version, target existence, approval mode, and active-member fingerprint. Drift blocks the workflow without rebasing. Stale history remains readable and the user must create a new request against the latest plan.

## Candidate, validation, and publication

After analysis approval, a worker refreshes only affected evidence and asks Sol for a complete candidate itinerary based on the current published plan. Unaffected stable IDs and content must be preserved. The complete Phase 3B validator runs, followed by a change-boundary validator that classifies every actual difference and checks the approved scope, confirmed/rejected decisions, hard constraints, evidence, target outcome, and disclosed downstream changes.

At most one bounded conflict repair may run. Repair receives the base, candidate, approved analysis, validation and boundary reports, and verified evidence. It cannot expand scope. A PASS candidate is exposed as **Ready to publish Version N** with a human-readable diff, repairs, and remaining warnings. Required final confirmation is always used in Phase 4A.

Publication locks the room, request, base, and candidate in a consistent order. It verifies current approvals, candidate confirmation, PASS validation, boundary PASS, exact `base + 1`, and uniqueness; then marks the previous plan historical, publishes the candidate, advances `rooms.current_plan_version`, completes the request, and emits one safe invalidation atomically.

## UI and Realtime

The Plan experience adds explicit request entry, item target context, analysis review, crew approval, semantic candidate progress, final diff confirmation, history, read-only historical views, and compare-to-previous. The existing visual language remains; a compact version rail provides lineage, source, current state, and comparison entry points. Raw JSON, prompts, reasoning, provider IDs, usage, evidence payloads, and private reports never render.

Database events broadcast only safe invalidation metadata on the existing private room topic. The client refetches safe projections and retains polling as a recovery fallback, so refresh and reconnect resume from persisted state.

## Testing and recovery

Schemas, materiality, deterministic diff, boundary validation, model routing/providers, workers, actions, components, SQL workflows, RLS, concurrency, recovery, and full two-user browser flow are test-first. E2E uses real local PostgreSQL, Auth, RLS, Realtime, validation, and publication while faking only external AI/travel providers.

Leased `SKIP LOCKED` recovery claims reclaim abandoned draft analysis, analyzing, candidate generation, validation, and interrupted publication work. Completed analyses, evidence, drafts, validation reports, approvals, and confirmations are reused; attempts are bounded and recovery never publishes without every current gate.
