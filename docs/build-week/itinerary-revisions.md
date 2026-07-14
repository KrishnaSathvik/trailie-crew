# Itinerary revisions

Phase 4A adds an explicit, approval-gated revision aggregate around immutable published itineraries. A chat message never creates a revision. A member starts one through **Request a Change**, an item’s **Change this** action, or the application-owned action contract.

## Lifecycle

`draft → analyzing → awaiting_review → approved → applying → validating → awaiting_confirmation → published`

`changes_requested`, `blocked`, `failed`, `cancelled`, and `superseded` are closed detours. The request snapshots the current published plan ID, room-level itinerary version, plan hash, approval mode, and active-membership fingerprint. A mismatch blocks review or publication; Phase 4A never rebases automatically.

Impact analysis uses `trailie-change-analysis-v1`, strict `PlanChangeAnalysis`, and deterministic routing. Terra handles bounded single-day changes. Sol handles cross-day, route-chain, lodging, logistics, critical, or confirmed-decision impact. The model suggests impact and materiality; application code verifies references and enforces a deterministic materiality floor.

All changes require the request’s approval-mode snapshot. Under `all_active`, every active participant approves the current analysis version. Under `host_only`, the active host approves, while other members can request changes. Analysis-version changes invalidate earlier approval semantics.

Candidate generation uses `trailie-itinerary-revision-v1` with `gpt-5.6-sol`. It returns a complete itinerary, refreshes affected evidence, runs the complete Phase 3B validator, and permits one bounded repair. A separate change-boundary validator compares base and candidate, classifies every difference, preserves stable unaffected IDs, blocks unrelated drift, and emits the human-readable `PlanVersionDiff`.

Even a passing candidate is not published immediately. Required members review the exact diff and confirm the candidate. Publication locks room, request, base, and candidate rows; verifies current base, PASS validation, PASS boundary report, and confirmations; and publishes exactly `base + 1`. The base remains untouched.

## Materiality and safety

- Minor: wording or isolated timing changes with no dependent route, reservation, constraint, or item impact.
- Material: item moves/replacements, route/lodging/day/budget/logistics changes.
- Critical: date/destination changes, confirmed must-do removal, or hard accessibility, dietary, or approved-constraint impact.

Model output cannot downgrade deterministic classification. Raw prompts, provider identifiers, token usage, evidence, and validation internals remain in forced-RLS private tables. Public progress is semantic only.

## Recovery and deferred scope

Lease-backed claims recover abandoned analysis, generation, validation, and publication without duplicating completed work. Attempts are capped, approvals remain mandatory, and stale bases are never rebased. Rollback is only a future new request; sharing, exports, purchasing, branching variants, and automatic rollback remain deferred.
