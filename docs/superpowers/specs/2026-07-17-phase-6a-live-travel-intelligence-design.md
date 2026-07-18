# Phase 6A Live Travel Intelligence Design

Date: July 17, 2026

Baseline: `8c1e9c7dadb67f7e66d1bbd55a884956608ace3c` on `main`

## Outcome

Trailie Crew will ground trip planning in current, attributable travel evidence while preserving every Phase 5 validation, revision, privacy, quota, recovery, and publication invariant. Live data is additive: a provider failure produces an explicit unavailable or stale state and never causes fabricated verification.

Phase 6A does not add an interactive map, guest collaboration, booking, purchasing, payment storage, or unrestricted Production deployment.

## Provider boundary

The selected provider set is intentionally closed:

- Mapbox Geocoding API v6 for permanent forward/reverse geocoding and Mapbox Directions API v5 for driving, traffic-aware driving when requested, walking, and cycling.
- OpenWeather One Call 3.0 for current conditions, eight-day daily forecasts, government alert references, timezone, sunrise, and sunset.
- National Park Service Data API for authoritative park records, alerts, closures, campgrounds, visitor centers, fees, hours, accessibility, directions, and official URLs.
- Recreation Information Database for federal recreation areas, facilities, campsites, tours, permit entrances, and official Recreation.gov or agency links.
- TrailVerse through a read-only knowledge adapter for curated park-code, provider-entity, and official-link mappings only.

Mapbox Geocoding v6 no longer returns points of interest. Generic restaurant, lodging, airport, and station POI search therefore remains unavailable unless a selected provider has an official matching entity. No additional provider is introduced in Phase 6A. Mapbox geocoding calls that are persisted use `permanent=true`; temporary results are not cached or stored.

RIDB reservation records and Recreation.gov links are discovery metadata. Trailie never treats a listing, campground, tour, permit entrance, or link as proof of live inventory or a completed booking.

## Evidence contract

`TravelEvidenceV1` is the only provider-facing value consumed by feature code:

- identity: schema version, evidence ID, evidence type, provider, source name/URL/entity ID;
- time: retrieval, observation, validity window, freshness state;
- trust: verification state, confidence, availability state, conflict state;
- binding: location and entity binding with canonical IDs and bounded coordinates;
- value: type-specific normalized application value;
- operations: safe request ID, cache status, attribution, storage/use restrictions, normalized error.

Freshness and verification remain separate. `fresh` does not imply `verified`; `verified` does not imply `fresh`. Availability is not represented by a boolean. Existing `tool_evidence` values are translated into the new contract until all feature reads use snapshots.

Provider payloads, credentials, private place queries, exact private lodging coordinates, payment data, and booking credentials are never stored in evidence or operational logs.

## Request and cache flow

Every adapter call follows one path:

1. validate a capability-specific input;
2. create a canonical, environment-scoped cache key without private text;
3. check provider emergency disable, room/global limits, and a safe cache entry;
4. claim a unique provider request with a bounded lease;
5. call an allowlisted HTTPS host with a provider-specific timeout;
6. classify response, rate limit, timeout, invalid input, authorization, no-result, malformed payload, or upstream failure;
7. normalize and persist evidence before application;
8. apply the evidence binding idempotently;
9. record only safe status, duration, cache state, cost units, and request identity.

Positive and negative TTLs are defined by capability and documented provider constraints. Stale-while-revalidate is allowed only for noncritical metadata. Active alerts, closures, routes used for timed feasibility, and forecast data do not silently serve stale values as live.

## Persistence

Phase 6A adds private, forced-RLS tables:

- `private.travel_evidence`
- `private.travel_evidence_bindings`
- `private.travel_provider_requests`
- `private.travel_cache_entries`
- `private.plan_evidence_snapshots`
- `private.travel_refresh_jobs`

All browser roles are denied. Service RPCs have `search_path = ''`, narrow arguments, idempotency keys, bounded result sizes, and explicit grants. Cache entries are mutable current state; published plan snapshot rows are immutable. The publication transaction binds the exact evidence semantics used by that version. Refreshing current evidence cannot mutate Version 1.

## Itinerary integration

Destination resolution and official constraints run before Sol generation where the approved summary provides enough location information. Draft enrichment resolves remaining item locations and gathers routes, weather/daylight, park data, alerts, hours, and reservation links. Sol sees normalized evidence separated into verified, stale, conflicting, inferred, and unavailable groups.

Official active closures override generated activities. Required reservations appear as requirements, never confirmations. Weather creates cautions or alternatives, not certainty. Dates outside the provider horizon remain unavailable. Missing route evidence preserves the Phase 5A medium warning, while actual time overlap and impossible verified travel remain failures.

## Validation and revisions

The deterministic validator adds:

- official closure conflict;
- activity outside date-bound operating hours;
- required reservation falsely represented as confirmed;
- ambiguous or unresolved destination;
- verified route conflict and unavailable-route warning;
- daylight timing concern;
- severe-weather caution;
- unsupported forecast horizon;
- stale critical evidence;
- conflicting official evidence.

Phase 5D scope manifests remain application-owned. Declared evidence refresh targets select affected bindings only. Metadata-only refresh updates current evidence without publishing a new itinerary version. A closure that invalidates a plan creates an alert and a proposed normal revision; it never silently rewrites the plan.

## Presentation and privacy

Member itinerary views show compact verification, source, last-checked, route/weather availability, reservation requirement, and official alert states. A details disclosure presents the bounded evidence ledger. Public shares expose only safe source labels, official links, snapshot freshness, and a conditions-may-have-changed disclaimer. Private query text, request fingerprints, provider request IDs, and precise private lodging coordinates are excluded.

Print and ICS remain bound to the selected published version and its evidence snapshot. They do not refresh live data during rendering.

## Recovery and cost

Travel refresh jobs use durable claims, provider-specific retry classes, bounded attempts, `next_retry_at`, and request uniqueness. Invalid input, ambiguous identity, and invalid credentials do not retry. Timeout, rate limit, and upstream unavailable may retry within a workflow deadline. One provider failure does not block unrelated evidence.

`TRAVEL_PROVIDERS_ENABLED=false` prevents new provider calls while preserving cache rows, immutable snapshots, chat, generation, existing plans, shares, and exports. The application records per-provider requests, room/global limits, latency, failure class, cache hits, and known request cost units without logging payloads.

## Acceptance constraints

All adapters have deterministic fake implementations and test success, timeout, rate limit, invalid key, unavailable, malformed, partial, stale, and attribution behavior. Database tests prove forced RLS, browser denial, immutable snapshots, request uniqueness, cache isolation, safe refresh claims, exactly-once binding, and historical-version preservation.

Hosted acceptance uses only the Vercel-Authentication-protected `hosted-acceptance` environment. Credentials remain server-only. Automation bypass is temporary and revoked in `finally`. No unrestricted Production deployment is allowed.

At design time, Mapbox permanent geocoding, Mapbox routing, NPS parks/alerts, and RIDB recreation-area requests passed value-redacted credential smokes. The OpenWeather credential was present but One Call 3.0 returned HTTP 401, so live weather/daylight acceptance is blocked until the key has One Call 3.0 entitlement.
