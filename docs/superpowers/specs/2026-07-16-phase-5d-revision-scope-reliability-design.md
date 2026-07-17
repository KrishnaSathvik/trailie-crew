# Phase 5D Revision Scope Reliability Design

## Scope and invariants

Phase 5D makes approved itinerary revisions reliably remain inside their exact approved boundary. It does not relax `change_scope_exceeded`, broaden narrow requests, mutate published versions, auto-publish blocked candidates, deploy unrestricted Production, or begin Phase 6.

The application—not the model—owns the final allowed-change manifest. Published Version 1 remains immutable. A Version 2 candidate reaches confirmation only after patch validation, preservation validation, the existing full itinerary validator, and an expanded change-boundary validator all pass.

## Application-owned manifest

`RevisionAllowedChangeManifestV1` binds one approved analysis version to the request ID, immutable base plan ID/version/hash, request type, exact target and affected IDs, allowed operations and fields, declared downstream effects, protected IDs and top-level fields, preservation requirements, forbidden changes, evidence targets, and maximum affected item/day counts. Canonical JSON hashing makes the identity stable.

Application code derives the manifest from the request type, explicit target, approved analysis, immutable base plan, confirmed decisions, and hard constraints. Model analysis can identify risks and candidate effects but cannot change the request type, raise item/day maxima, or expand the application-owned scope.

## Protected snapshot and semantic hashes

Candidate generation receives separate editable fragments and protected contracts. Semantic normalization excludes volatile evidence retrieval timestamps and formatting-only noise while retaining item order, IDs, user-visible content, dates, destination, logistics, lodging, food, routes, costs, confirmed decisions, constraints, and public summary fields according to their manifest classification.

The preservation contract computes item, day, and top-level hashes. Before the existing boundary validator runs, it rejects missing/reordered/rewritten protected items, changed protected days or top-level values, undeclared downstream effects, and affected item/day counts above the manifest maxima.

## Patch-first routing

`RevisionPatchV1` is generated or derived before a candidate exists. Each operation references an allowed target/day, exact field changes, reason, downstream effects, preserved IDs, and evidence refresh targets. Patch validation rejects any operation, target, field, effect, or cardinality outside the manifest.

One-item removal, within-day move, reschedule, duration change, note update, and simple connected-route cleanup use deterministic patch application. Semantic replacements, lodging or traveler-logistics changes, multi-day rebalancing, complex route chains, and general revisions use Sol, but still begin with a validated constrained patch and protected snapshot. Narrow removal does not invoke Sol merely to rewrite the full plan.

## Validation and diff

A single canonical semantic comparison feeds preservation checks, the human-readable diff, and boundary classification. Every semantic change maps to an actual diff operation and every diff operation maps to a semantic change. Timestamp-only evidence refreshes and formatting normalization do not create user-facing drift.

Top-level fields are explicitly classified as protected, manifest-editable, derived/recalculable, or volatile. Unauthorized changes remain blocking. The existing full itinerary validator and `change_scope_exceeded` behavior remain fail-closed and are not weakened.

## Scope repair and conflict repair

Scope repair is distinct from provider retry and itinerary conflict repair. If a model candidate violates preservation or boundary scope, one `candidate_scope_violation` repair receives the immutable base, manifest/hash, invalid candidate, exact unauthorized differences, and required hashes. It may only restore unauthorized content while retaining approved changes. A second violation terminates with `change_scope_exceeded`; there is no third attempt and no general repair expansion.

Conflict repair remains independently bounded to one attempt for full-itinerary validation conflicts after scope passes. Durable counters track candidate attempts, scope repairs, and conflict repairs separately.

## Persistence and recovery

New forced-RLS private manifest, patch, and scope-repair records are service-only and immutable after completion. They store structured safe artifacts, hashes, versions, counters, and usage/attempt metadata—never raw prompts or model output. Unique request/analysis and candidate constraints prevent duplicate artifacts.

Recovery reuses a durable validated patch or provider candidate, resumes missing preservation/boundary/full validation, and publishes a passing candidate exactly once. It does not repeat provider calls, apply patches twice, reconcile quota twice, change manifest identity, or publish Version 2 twice.

## User experience

After exhausted scope repair, the UI says: “Trailie could not make this change without altering more of the trip than the crew approved. The current itinerary was not changed.” It offers retry analysis, edit request, cancel, and the protected current plan without exposing reports or provider output. A successful repair says: “Trailie removed unrelated changes and kept the revision within the approved scope.”

## Acceptance

Test-first coverage includes schemas, manifest derivation/hash stability, patch validation/application, semantic normalization, preservation/top-level enforcement, scope repair, database immutability/concurrency/exactly-once behavior, deterministic two-user E2E, interruption recovery, and negative blocking.

After all local gates pass, only the protected `hosted-acceptance` Preview is deployed. The complete real-provider two-user flow must publish immutable Version 2 for the Phase 5C timed-item removal case, preserve Version 1/share/history, leave zero recovery backlog, and revoke the one-run bypass. A second fresh narrow revision proves repeatability. Failure leaves Preview unaccepted and Phase 6 blocked.
