# Travel Tools and Evidence

Revision generation refreshes affected route/place/daylight/destination evidence through the existing server-only provider boundary. Unaffected evidence follows current freshness rules. Browsers never call privileged providers, and unknown live facts remain unknown.

`@trailie/travel-tools` defines provider-neutral geocoding, routing, place-detail, destination-fact, and daylight contracts. Every result carries provider, tool name, credential-free request fingerprint, retrieval/expiry timestamps, status, normalized data, and an optional source reference.

Private evidence rows are unique by plan, tool, and fingerprint. A verified unexpired match is reused; stale, unavailable, and failed results remain explicit and are never relabeled as live facts. Browser roles cannot read this table. Stored results contain no keys, authorization headers, raw provider responses, or copied prompts.

The live MVP adapter uses Mapbox geocoding and driving/walking/cycling routes only when `MAPBOX_ACCESS_TOKEN` exists. Transit/shuttle routing, place opening hours/reservations, destination alerts, and daylight remain unavailable through that adapter; missing data is evaluated by validation according to claim criticality. The existing read-only `@trailie/trailverse-adapter` remains the park-service seam; a production TrailVerse/NPS implementation is deferred.

The deterministic fake provider covers valid and impossible routes, closed locations, missing coordinates, reservation requirements, unknown cost, stale evidence, provider failure, and multi-day facts. Tests fake only external providers: PostgreSQL, RLS, validation, repair state, and publication remain real. Production configuration rejects the fake AI/tool path.

`pnpm test:travel-tools:smoke` is opt-in, skips without `MAPBOX_ACCESS_TOKEN`, performs one minimal synthetic geocode when configured, and prints no credential.
