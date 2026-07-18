# Phase 6A — live travel intelligence

Baseline: `8c1e9c7` on `main`.

Phase 6A adds a strict evidence layer between external travel providers and itinerary generation. The selected provider set is Mapbox, OpenWeather One Call 3.0, NPS, and RIDB; TrailVerse is a read-only mapping boundary only. No Phase 6B interactive map, guest collaboration, booking, purchasing, or unrestricted Production deployment is included.

## Implemented

- strict versioned `TravelEvidenceV1` with independent freshness, verification, confidence, availability, binding, provenance, attribution, restriction, and safe error states;
- server-only provider adapters, input validation, HTTPS host allowlists, timeouts, response bounds, safe error classification, deterministic fixtures, and explicit unavailable adapters;
- permanent Mapbox geocoding with ambiguity handling and Directions route evidence for driving/walking/cycling;
- OpenWeather forecast/alerts/timezone/sunrise/sunset normalization with horizon and polar unavailable states and one-call workflow deduplication;
- official NPS park, alert/closure, operating-hours, fee, accessibility, contact, directions, weather-summary, and URL evidence;
- RIDB recreation-area and trusted official reservation/entity links without availability claims;
- environment-isolated provider cache, negative cache, safe stale rules, per-provider/workflow deduplication, room/global daily limits, and global/individual emergency switches;
- forced-RLS service tables/RPCs for normalized evidence, bindings, operations, cache, immutable published snapshots, and refresh jobs;
- Sol prompt input using normalized evidence only, deterministic official-closure/route/daylight/weather/reservation/location validation, and narrow revision refresh/copy behavior;
- privacy-safe member/public evidence projection, exact-version sharing, and compact itinerary evidence presentation.

## Acceptance state

Local gates pass: formatting, lint, type checking, 589 unit/component
assertions, the local production build, 60 travel-provider assertions, 577
pgTAP assertions, local Playwright, database lint, dependency audit, diff/secret
checks, and the focused provider/snapshot/revision/recovery/quota suites. Live
credential presence and capability smokes were checked without printing,
hashing, exporting, or logging credential values. Mapbox geocoding/routing, NPS
park/alerts, and RIDB recreation-area smokes returned HTTP 200. OpenWeather One
Call 3.0 returned HTTP 401, so weather/daylight remain explicit unavailable
evidence.

Protected hosted acceptance is **not accepted for release**. The final
acceptance-only deployment `dpl_GHch4Kd2VvBg3ercSBrQSotyyTag` remained behind
Vercel Authentication, used `TRAVEL_CACHE_BYPASS=true`, and left zero temporary
bypasses and zero provider/recovery backlog. Fresh provider diagnostics found
one unique Mapbox/NPS official-name match, but the assembled itinerary still
failed closed with `destination_ambiguous`; repairable duplicate-item findings
could not run while that critical identity blocker remained. Version 1 did not
publish, so immutable Version 1/2 hosted evidence, sharing, print, and ICS were
not accepted. Production remains undeployed.

## Deferred or unsupported

- Mapbox transit and Geocoding-v6 POI search;
- live reservation inventory, booking, purchasing, or payment credentials;
- complete RIDB facility/campground/tour/permit entity normalization beyond reviewed recreation-area and official-link paths;
- a live TrailVerse service dependency until a stable, documented read-only API exists;
- Phase 6B interactive map UI.

See [provider inventory](../production/travel-provider-inventory.md), [evidence contract](../production/travel-evidence-contract.md), [cache policy](../production/travel-cache-policy.md), and [provider operations](../production/travel-provider-operations.md).
