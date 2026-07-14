# Phase 4B Sharing and Exports Design

## Goal

Add secure, revocable public sharing plus print/PDF and calendar exports for one exact immutable published itinerary version.

## Architecture

`public.plan_share_links` stores only a SHA-256 token hash, safe prefix, pinned room/plan/version identifiers, the immutable plan hash, a deterministic public snapshot and its hash, lifecycle metadata, and creator identity. A partial unique index permits one active link per plan version. Host-only RPCs lock the plan/version scope for rotation and revocation; active members can read safe status. Public verification is server-only and returns the stored strict public projection only after checking token status, expiry, publication, version, plan hash, and snapshot hash.

The application generates 256-bit base64url tokens and sends only their hashes to PostgreSQL. The raw token is returned once by the create/rotate Server Action and is never stored, logged, broadcast, or recoverable. Public pages are dynamic, `no-store`, and `noindex, nofollow, noarchive`.

All exports consume a selected published `trip_plan_id` and version. Phase 4B generates RFC 5545 ICS dynamically for authenticated active members. PDF support is a version-specific print route and browser Print / Save as PDF because the repository has no production Chromium or PDF runtime and storage is disabled. No export artifact table or storage bucket is added.

## Public projection and privacy

A strict Zod projection exposes title, destination summary, dates, timezone, version, publication timestamp, days/items, general public locations, travel durations, lodging area/recommendations, food suggestions, reservation requirements, public warnings, validation status, and the no-booking disclaimer. Deterministic redaction removes traveler/member/auth identity, origins, coordinates, exact addresses, evidence IDs, private notes, confirmation references, raw validation objects, provider/model metadata, approval/chat/memory/revision data, and private budget ceilings. HTML and unsafe URLs are rejected or omitted.

## Lifecycle and authorization

- `private`: no active link.
- `public_link`: anyone holding the active token can read the pinned snapshot.
- `expiring_link`: public access ends deterministically at `expires_at`.
- Only the active host whose participant row belongs to `auth.uid()` can create, rotate, expire, or revoke.
- All active room members can read safe status, but never the token hash, raw token, URL, or visitor details.
- Rotation revokes the prior active same-version row in the same locked transaction.
- Historical published versions are shareable and exportable; all other plan states fail closed.

## Hashes and concurrency

The existing immutable `trip_plans.plan_hash` protects the source. A deterministic public projection hash protects the stored snapshot. PDF/print and ICS input hashes are schema-versioned and exclude generated timestamps. Row/advisory locks and the partial unique index prevent two active links. Revoke is idempotent; deterministic ICS generation returns identical bytes for identical versioned input.

## Realtime, caching, and indexing

A private room broadcast sends only `kind`, `roomId`, `tripPlanId`, `planVersion`, and event type. It never contains tokens, URLs, paths, signed URLs, or access telemetry. Share and print responses use `Cache-Control: private, no-store, max-age=0`; invalid, expired, revoked, and malformed tokens share one unavailable state. Share URLs are absent from sitemap and public navigation.

## Testing and production safety

Test-first coverage spans pgTAP authorization/grants/rotation/version/hash behavior, Vitest token/projection/hash/ICS/action/component contracts, and real local Supabase/Auth/RLS/Next.js Playwright scenarios. Final gates include format, lint, typecheck, unit, build, reset, all SQL, E2E, database lint/advisors, diff/secret/audit/manifest/robots/fake-control reviews, smoke tests, browser console/network checks, status, and inclusive diff stat.

## Deferred

Password protection, invited viewers, organization access, guest collaboration, public indexing, live-latest aliases, server-generated/persisted PDFs, public ICS generation, and visitor analytics remain deferred.
