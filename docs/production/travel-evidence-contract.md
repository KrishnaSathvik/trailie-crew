# Travel evidence contract

`TravelEvidenceV1` is the only provider evidence shape accepted by planning, validation, snapshots, and reader projections. Feature code never receives provider SDK objects or raw payloads.

Required identity and provenance fields are `schemaVersion`, `evidenceId`, `evidenceType`, `provider`, `sourceName`, `sourceUrl`, `sourceEntityId`, and `retrievedAt`. Temporal fields are `observedAt`, `validFrom`, and `validUntil`. Binding fields identify a normalized location and/or entity. `normalizedValue` contains the application value; bounded `providerMetadata` is private. `attribution`, `restrictions`, `cacheStatus`, `requestId`, and safe `errorState` complete the operational contract.

Freshness is one of `fresh`, `cached_fresh`, `stale`, `expired`, `unavailable`, or `conflicting`. Verification is one of `verified`, `partially_verified`, `unverified`, `inferred`, or `failed`. Confidence is `high`, `medium`, or `low`. Availability is independently represented as `available`, `partial`, `unavailable`, `ambiguous`, `not_found`, or `unsupported`. A single verification boolean is rejected by the strict schema.

Supported evidence types are geocode, place, route, travel duration, distance, weather forecast, temperature, precipitation, severe weather, sunrise, sunset, park, park alert, park closure, permit, reservation, operating hours, accessibility, fee, campground, visitor center, trail, food, lodging, and general official notice.

Evidence IDs are deterministic semantic fingerprints of provider, type, entity, and normalized data. Retrieval time and cache state do not change semantic identity. Published snapshot hashes omit volatile retrieval/freshness/provider-metadata fields so compare views can separate evidence-content changes from refresh-only changes.

## Priority and safety

Active official closures override generated suggestions. A reservation can be shown as required only when normalized official evidence says so; it is never shown as confirmed or booked. Forecast evidence is date-, coordinate-, and timezone-bound and never becomes a safety guarantee. Daylight evidence is not an operating or closure time. Route duration is provider evidence; straight-line distance is never presented as driving distance.

Unavailable, stale, inferred, and conflicting records remain first-class evidence. Planning may continue when policy permits, but prompts and UI must preserve those states. Only `verificationState=verified` may receive the user-facing “Verified” label.

## Privacy projection

Private tables may retain normalized coordinates needed for planning. Public/member projections expose only the evidence type, provider/source label, safe official URL, retrieval/freshness/verification state, target item, and a conditions-may-have-changed disclosure. Provider metadata, request/cache keys, raw query text, precise private lodging coordinates, and raw payloads are excluded.
