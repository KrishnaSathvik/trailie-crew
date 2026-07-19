# Phase 6A.2 Mapbox Cost and Compliance Plan

> Execute after the Phase 6A.1 destination contract is stable. Do not begin Phase 6B or deploy unrestricted Production.

**Goal:** Prevent accidental paid Permanent Geocoding and structurally enforce the boundary between transient Mapbox results, explicitly licensed durable results, official NPS identity, immutable evidence, and Directions.

**Design:** Add an explicit server-only geocoding storage mode. Temporary results remain in memory and are marked storage-prohibited; every durable boundary rejects them. Resolved NPS destinations persist only application-owned identity derived from official NPS data. Permanent mode is opt-in, counted, and never the default. Directions remains independently available.

## Task 1: Storage-mode tests

**Files:**

- Modify: `packages/travel-tools/src/adapters/mapbox.test.ts`
- Modify: `src/server/travel/cache.test.ts`
- Modify: `src/server/travel/repository.test.ts`
- Modify: snapshot/public projection tests

1. Add failing tests for disabled, temporary, and permanent modes.
2. Prove disabled mode makes zero geocoding requests while Directions remains available.
3. Prove temporary results cannot enter cache, evidence storage, snapshots, semantic hashes, or public sharing.
4. Prove permanent storage is allowed only under explicit permanent configuration.
5. Prove historical permanent snapshots remain immutable.

## Task 2: Explicit Mapbox configuration

**Files:**

- Modify: `src/server/env.ts`
- Modify: `.env.example`
- Modify: provider registry/configuration types
- Modify: `packages/travel-tools/src/adapters/mapbox.ts`

1. Add `MAPBOX_GEOCODING_STORAGE_MODE=disabled|temporary|permanent`.
2. Default to `disabled`; never infer permanent mode.
3. Omit the permanent request parameter in temporary mode and mark returned data storage-prohibited.
4. Add the permanent parameter only in explicitly configured permanent mode.
5. Emit safe permanent-geocoding usage counts/warnings without query text, coordinates, token, or payload.
6. Keep Directions configuration and behavior independent.

## Task 3: Structural write barriers

**Files:**

- Modify: cache, repository, snapshot, semantic-hash, and public-projection boundaries
- Modify: Phase 6A.1 database migration or add a follow-up migration

1. Reject storage-prohibited Mapbox data at cache writes.
2. Reject it at travel-evidence and canonical-resolution writes.
3. Reject it during immutable snapshot assembly.
4. Exclude it from durable semantic-hash inputs and public sharing.
5. Enforce matching database-side guards so application bypasses cannot persist prohibited fields.

## Task 4: NPS durable identity

**Files:**

- Modify: `src/server/travel/intelligence.ts`
- Modify: canonical destination tests

1. Persist NPS park code, official name/URL, official coordinates, and official region/state metadata for NPS destinations.
2. Allow Mapbox temporary candidates only as in-memory corroboration/routing input.
3. Ensure the canonical semantic hash contains no temporary Mapbox ID, label, coordinate, bound, or normalized provider field.
4. Document non-NPS behavior as disabled/transient/user-confirmed unless permanent storage is explicitly approved.

## Task 5: Diagnostics and environment

**Files:**

- Modify: `scripts/phase6a-safe-diagnose.mjs`
- Modify: provider smoke scripts

1. Remove `permanent=true` from non-storing diagnostics.
2. Make diagnostics explicitly temporary or disabled.
3. Configure local and protected hosted-acceptance for temporary mode.
4. Verify diagnostic and acceptance runs produce no permanent geocoding usage.

## Task 6: Official terms and documentation

1. Record the invoice-confirmed usage: 1 temporary, 15 permanent, 1 Directions, $5 upcoming.
2. Cite official Mapbox storage and pricing documentation.
3. Document the unresolved requirement to use geocoding results with a Mapbox map; do not claim legal compliance without written clarification.
4. Update provider inventory, cache policy, evidence contract, environment variables, operations, and Phase 6A documentation.
5. Add `docs/production/mapbox-geocoding-compliance.md`.

## Task 7: Verification and commit

1. Run targeted storage-mode and write-barrier tests.
2. Run the complete local and hosted gates required by Phase 6A.1.
3. Verify protected hosted-acceptance makes no permanent geocoding requests.
4. Commit and push only verified work.
