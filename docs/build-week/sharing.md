# Version-Pinned Sharing

## Governing invariant

Every link names one immutable `trip_plans` row and its numeric version. There is no latest-version alias. If Version 2 publishes, an active Version 1 link continues returning its stored Version 1 public snapshot until its host revokes it or its expiration passes.

## Lifecycle and policy

Phase 4B supports `private`, `public_link`, and `expiring_link`. Private means no active row. Public and expiring links have deterministic active, revoked, or computed-expired behavior. Only the active room host may create, rotate, expire, or revoke; active members may see safe status. The host may select any published historical version, but candidates and generating, validating, failed, blocked, or superseded rows cannot be shared.

The policy is one active link per `trip_plan_id`. Creation takes an advisory transaction lock, revokes any prior active same-version row, preserves that audit row, and inserts a new row. Revoke is locked and idempotent. Creation is limited to five attempts per room in ten minutes.

## Tokens and verification

Trusted Node code creates 32 random bytes and base64url-encodes them (43 URL-safe characters, 256 bits). The raw token is returned once as `/share/<token>` and is never written to PostgreSQL, local/session storage, analytics, Realtime, structured logs, or an artifact path. PostgreSQL stores SHA-256 plus an eight-character non-secret display prefix. Losing the raw token requires rotation.

Anonymous roles cannot select plan/share tables or call verification. The server-only secret client hashes the supplied token and calls the narrow verifier. It accepts one active unexpired row only, verifies the exact plan is still published, compares the immutable plan hash and public-snapshot hash, and returns only the snapshot. Unknown, malformed, revoked, expired, or drifted inputs all render the same unavailable page.

## Runtime behavior

`/share/[token]` is dynamic server rendering with no privileged client query. Metadata and headers set `noindex`, `nofollow`, `noarchive`, `no-referrer`, and `nosniff`. Production configuration requests `private, no-store, max-age=0`; Next development may emit `no-cache, must-revalidate`, which still forces validation before reuse. Share URLs are absent from sitemap, robots-allowed paths, application navigation, and canonical discovery pages.

Safe room Realtime broadcasts only room/plan/version/event identifiers. It prompts authenticated clients to refetch status and never carries tokens, public URLs, snapshots, visitor details, signed URLs, or storage paths.

Deferred modes are password protection, invited viewers, and organization-only access. Public indexing, custom domains, latest aliases, public editing/comments, and guest collaboration are deliberately out of scope.
