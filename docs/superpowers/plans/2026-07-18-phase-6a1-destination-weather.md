# Phase 6A.1 Destination and Weather Acceptance Plan

> Execute on `main` from baseline `e3dcdf8`. Do not begin Phase 6B or deploy unrestricted Production.

**Goal:** Preserve one application-owned canonical destination resolution through generation, repair, validation, publication, and revision while restoring authorized OpenWeather One Call 3.0 access in protected hosted-acceptance.

**Design:** Collapse provider representations into canonical entities before ambiguity classification. Persist a versioned canonical resolution bound to the approved planning summary, pass its durable ID and semantic hash through application-owned workflow context, and make validation load and verify that resolution instead of reconstructing identity from model display text. Keep provider evidence and immutable version snapshots fail-closed and append-only.

## Task 1: Destination regression tests

**Files:**

- Modify: `src/server/travel/intelligence.test.ts`
- Modify: `src/features/itinerary/validation/validate-itinerary.test.ts`
- Modify: `src/server/itinerary/worker.test.ts`

1. Add a failing test where two Mapbox representations match the same NPS park.
2. Add a failing negative test where two materially distinct official entities remain ambiguous.
3. Add failing generation/repair tests proving application-owned destination identity survives duplicate-content repair.
4. Run the targeted tests and record the expected failures.

## Task 2: Canonical destination contract and equivalence

**Files:**

- Modify: `packages/schemas/src/travel-evidence.ts`
- Modify: `packages/schemas/src/index.ts`
- Modify: `src/server/travel/intelligence.ts`
- Modify: `src/server/travel/intelligence.test.ts`

1. Add `CanonicalDestinationResolutionV1` with deterministic status, method, identity, corroboration, ambiguity, evidence, and semantic-hash fields.
2. Implement entity equivalence using NPS park code, normalized official name, provider identity, region/country, and geographic binding.
3. Collapse duplicate representations before ambiguity classification.
4. Prefer official NPS identity and coordinates for a resolved NPS destination.
5. Verify exact, duplicate, irrelevant-lower-rank, and true-ambiguity cases.

## Task 3: Durable authoritative resolution

**Files:**

- Create: `supabase/migrations/*_phase_6a1_destination_resolution.sql`
- Modify: `supabase/tests/phase_6a_live_travel_intelligence.test.sql`
- Modify: `src/server/travel/repository.ts`
- Modify: `src/server/travel/repository.test.ts`
- Modify: generated database types if required by repository conventions

1. Add a private, forced-RLS canonical-resolution table bound to room/trip plan/planning summary.
2. Add service-only store/load functions with idempotent operation identity and semantic-hash verification.
3. Reject mutation, stale hashes, cross-room access, duplicate operation rows, and prohibited provider-derived durable fields.
4. Bind evidence and plan-version snapshots to the resolution ID/hash without mutating historical versions.
5. Add pgTAP coverage for privacy, immutability, idempotency, snapshot retention, and stale-hash rejection.

## Task 4: Workflow propagation and safe trace

**Files:**

- Modify: `src/server/itinerary/worker.ts`
- Modify: `src/server/itinerary/context.ts`
- Modify: `src/features/itinerary/validation/validate-itinerary.ts`
- Modify: related schemas and tests

1. Store the canonical resolution after provider collection and load it by durable ID for later stages.
2. Pass resolution ID, canonical place ID, NPS park code, and semantic hash through generation and repair context.
3. Normalize model display labels from canonical identity and reject material destination drift.
4. Make final validation verify the durable resolution/hash; do not reclassify raw candidates unless resolution is missing, stale, or contradicted.
5. Emit safe stage traces containing only stage, resolution ID, status, hash prefix, entity type, counts, and result.
6. Verify repair preserves identity and real ambiguity remains blocking.

## Task 5: Cache versioning

**Files:**

- Modify: `src/server/travel/cache.ts`
- Modify: `src/server/travel/cache.test.ts`
- Modify: relevant cache-key helpers

1. Separate provider candidate cache identity from canonical-resolution identity.
2. Include contract and algorithm versions in cache keys.
3. Ensure acceptance bypass skips reads and writes.
4. Invalidate pre-contract ambiguity results.
5. Verify no cross-environment cache reuse.

## Task 6: OpenWeather hosted credential acceptance

1. Confirm the protected custom environment contains `OPENWEATHER_API_KEY` without exposing it.
2. Replace only the hosted-acceptance value with the confirmed active account key.
3. Redeploy protected hosted-acceptance after code and environment changes.
4. Run a minimal One Call 3.0 probe and record only status, duration, safe classification, and normalized field presence.
5. Run forecast/daylight adapter smokes, including timezone, horizon, attribution, and cache behavior.
6. Delete temporary environment files and scan logs/repository for secret exposure.

## Task 7: Verification and protected reacceptance

1. Run targeted unit and database tests.
2. Run all repository quality gates requested in the Phase 6A.1 specification.
3. Deploy only protected hosted-acceptance.
4. Run provider smokes and the clean two-user national-park flow through Versions 1 and 2, historical share, evidence drawer, ICS, print, revocation, zero backlogs, and zero bypasses.
5. Record conditional acceptance if OpenWeather remains externally unauthorized; never fabricate verification.

## Task 8: Documentation and commits

1. Update all Phase 6A.1 production and build-week documents named in the specification.
2. Add `docs/build-week/phase-6a1-destination-weather-acceptance.md`.
3. Commit verified implementation, tests, and documentation separately where practical.
4. Push only after local and protected evidence pass.
