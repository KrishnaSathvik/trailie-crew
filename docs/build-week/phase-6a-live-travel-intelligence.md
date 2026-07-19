# Phase 6A — live travel intelligence

Baseline: `8c1e9c7` on `main`.

Phase 6A adds a strict evidence layer between external travel providers and itinerary generation. The selected provider set is Mapbox, OpenWeather One Call 3.0, NPS, and RIDB; TrailVerse is a read-only mapping boundary only. No Phase 6B interactive map, guest collaboration, booking, purchasing, or unrestricted Production deployment is included.

## Implemented

- strict versioned `TravelEvidenceV1` with independent freshness, verification, confidence, availability, binding, provenance, attribution, restriction, and safe error states;
- server-only provider adapters, input validation, HTTPS host allowlists, timeouts, response bounds, safe error classification, deterministic fixtures, and explicit unavailable adapters;
- explicit disabled/temporary/permanent Mapbox geocoding modes, storage barriers, deterministic ambiguity handling, and separate Directions route evidence for driving/walking/cycling;
- OpenWeather forecast/alerts/timezone/sunrise/sunset normalization with horizon and polar unavailable states and one-call workflow deduplication;
- official NPS park, alert/closure, operating-hours, fee, accessibility, contact, directions, weather-summary, and URL evidence;
- RIDB recreation-area and trusted official reservation/entity links without availability claims;
- environment-isolated provider cache, negative cache, safe stale rules, per-provider/workflow deduplication, room/global daily limits, and global/individual emergency switches;
- forced-RLS service tables/RPCs for normalized evidence, bindings, operations, cache, immutable published snapshots, and refresh jobs;
- Sol prompt input using normalized evidence only, deterministic official-closure/route/daylight/weather/reservation/location validation, and narrow revision refresh/copy behavior;
- privacy-safe member/public evidence projection, exact-version sharing, and compact itinerary evidence presentation.

## Acceptance state

Phase 6A.1/6A.2 reacceptance passed on July 18, 2026. Destination normalization
now preserves the official entity type for Mapbox while using the distinctive
name stem for NPS. Duplicate Mapbox representations of one NPS park collapse to
one canonical NPS identity; materially different official entities remain
ambiguous. The application-owned `CanonicalDestinationResolutionV1` is stored
once, reloaded by durable ID and semantic hash, and preserved through generation,
repair, validation, snapshots, and revision copying.

OpenWeather One Call 3.0 activation and the refreshed protected credential were
accepted with live forecast, timezone-bound daylight, sunrise, and sunset
evidence. A deterministic parser now converts supported natural-language date
ranges to bounded ISO dates before requesting weather.

Protected deployment `dpl_A419ZJxdoq4U1zYbgwSiKPi7xjQk` remained behind Vercel
Authentication on the `hosted-acceptance` target. The complete two-user flow
published immutable Versions 1 and 2, preserved Version 1 evidence, rendered
evidence safely, kept Version 1 sharing/ICS/print pinned, revoked the share, and
ended with zero provider/recovery backlog, zero browser provider requests, zero
console problems, and zero temporary bypasses. Production remains undeployed.

Mapbox geocoding is `temporary` in protected acceptance and no temporary Mapbox
result enters the durable cache, canonical resolution fields, semantic hashes,
evidence rows, snapshots, or public projections. NPS supplies the durable park
identity and coordinates. Mapbox's documented map-use restriction remains an
external compliance question, so unrestricted use and Production remain blocked
pending provider/legal confirmation or a compatible map surface.

## Deferred or unsupported

- Mapbox transit and Geocoding-v6 POI search;
- live reservation inventory, booking, purchasing, or payment credentials;
- complete RIDB facility/campground/tour/permit entity normalization beyond reviewed recreation-area and official-link paths;
- a live TrailVerse service dependency until a stable, documented read-only API exists;
- Phase 6B interactive map UI.

See [provider inventory](../production/travel-provider-inventory.md), [evidence contract](../production/travel-evidence-contract.md), [cache policy](../production/travel-cache-policy.md), and [provider operations](../production/travel-provider-operations.md).
