# Revision scope contract

Status: Phase 5D implementation verified locally; protected hosted result is conditional.

## Contract

Application code—not the model—owns `RevisionAllowedChangeManifestV1`. The manifest binds one approved analysis version to an immutable base plan ID/version/hash and declares targets, operations, editable fields, downstream effects, protected content, required preservation, forbidden changes, evidence refresh targets, and maximum affected item/day counts.

Generation receives separate editable fragments and protected hashes. Narrow changes are patch-first. `RevisionPatchV1` must reference the manifest hash and contain only allowed operations. Exact removal and other mechanically safe edits are applied deterministically with stable IDs; Sol is reserved for semantic replacement, lodging/logistics, multi-day rebalance, complex route chains, and general revision.

## Preservation and comparison

Canonical semantic hashes cover protected items, days, and top-level fields. Whitespace/format normalization and volatile evidence retrieval timestamps do not create drift. Destination, dates, confirmed decisions, hard constraints, rejected options, stable IDs, protected order/content, allowed fields, declared downstream timing, and maximum scope are checked before the existing boundary/full validators.

Diff generation and boundary validation use the same normalized comparison source. Every semantic change must be represented once; timestamp-only evidence changes are not user-facing changes.

## Scope repair

A first boundary failure is persisted safely and may start one `candidate_scope_violation` repair. The repair receives the immutable base, manifest, invalid candidate, exact unauthorized differences, and required preservation hashes. It may remove unauthorized drift but cannot add targets, operations, fields, days, or items. A second violation blocks with `change_scope_exceeded`. Conflict repair is a different counter and prompt.

## Durability

`private.plan_change_manifests`, `private.plan_change_patches`, and `private.change_scope_repair_reports` use forced RLS and service-only RPC access. Completed artifacts are immutable. Identity includes request, analysis version, base hash, manifest hash, and candidate. Recovery reuses durable patches/candidates, does not apply a patch twice, and relies on existing exactly-once publication/quota controls.

## Operator rule

Never suppress `change_scope_exceeded`, lower unrelated-drift severity, edit a manifest after approval, use general repair to expand scope, or publish a candidate whose preservation/boundary/full validation did not pass.

## Phase 6A evidence refresh

Evidence refresh targets remain subordinate to the approved change manifest. Route/timing changes refresh only affected segment evidence; broader destination/item changes may refresh destination, official park, alert, weather, daylight, reservation, and operating-hours evidence. Unaffected snapshots are copied explicitly to the candidate version. Metadata-only refresh does not expand itinerary scope or require a new plan version; a new closure proposes a normal revision and never silently rewrites the published plan.

## Phase 6B spatial reading

Map selection, filters, camera, and mobile sheet state are local presentation
state and never enter a revision manifest. Spatial compare is derived from the
same immutable base/candidate versions and may annotate added, removed, moved,
route-changed, or warning-changed elements; it cannot authorize a change.
Version 2 geometry or marker refresh is bound to Version 2 snapshots. Version 1
map data is not mutated or silently refreshed.
