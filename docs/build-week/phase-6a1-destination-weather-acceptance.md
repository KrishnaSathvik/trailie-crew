# Phase 6A.1 — destination and weather acceptance

Date: July 18, 2026
Base: `e3dcdf8` on `main`
Scope: protected hosted acceptance only; no Phase 6B or Production deployment

## Root cause and correction

The destination was first uniquely resolvable after Mapbox geocoding and NPS
park lookup. Two defects prevented that result from reaching publication:

1. duplicate Mapbox representations of the same official NPS entity were
   counted as different matches; and
2. query normalization removed `National Park`, causing Mapbox to receive only
   `Yosemite`, while NPS needs that distinctive stem and Mapbox needs the
   official entity type.

The correction uses provider-specific queries, collapses equivalent matches by
NPS park code with official-name/location checks, and stores one application-owned
`CanonicalDestinationResolutionV1`. Final validation reloads that resolution by
durable ID and semantic hash. It does not rebuild identity from raw candidates,
itinerary titles, display labels, or model output. A material model destination
change remains a separate blocking drift finding; genuinely different official
entities remain `destination_ambiguous`.

## Propagation and trace

The canonical resolution carries the canonical NPS identity, official name,
NPS park code, public official coordinates, candidate count, selected candidate,
resolution method, corroboration sources, confidence, evidence IDs, and semantic
hash. It is preserved through provider resolution, planning input, generation,
normalization, bounded repair, final validation, snapshot publication, and
revision copying.

The safe runtime trace records only stage, resolution ID, status, semantic-hash
prefix, canonical entity type, candidate count, corroboration-source count, and
validation result. It excludes provider keys, raw payloads, private free text,
and private lodging coordinates.

## Cache and evidence

Travel cache identity is version 2 and includes environment, provider,
capability, normalized input, and schema version. Acceptance bypass skips both
reads and writes. Temporary Mapbox evidence is marked storage-prohibited and is
rejected by application, cache, database evidence, snapshot, and public
projection boundaries. Canonical NPS evidence and OpenWeather evidence remain
durable and exact-version bound.

## OpenWeather diagnosis

The One Call 3.0 adapter already used the documented
`https://api.openweathermap.org/data/3.0/onecall` endpoint and valid parameters.
The earlier HTTP 401 was an account/deployment credential state, not an endpoint
or normalization defect. After One Call 3.0 activation, hosted credential
replacement, and protected redeployment, live forecast/daylight calls succeeded.
No key value, request URL containing a key, or credential hash was logged or
stored.

Natural-language planning ranges such as `July 22 through July 25, 2026` are
now deterministically normalized to bounded ISO dates before weather lookup.
Forecasts remain limited to provider-returned dates; absent/polar values remain
explicitly unavailable.

## Protected result

Deployment `dpl_A419ZJxdoq4U1zYbgwSiKPi7xjQk` is Ready only on
`hosted-acceptance`.

- one canonical NPS park survived generation, duplicate-content repair, final
  validation, publication, and revision;
- Version 1 published with 20 immutable evidence snapshots, including NPS,
  RIDB, OpenWeather forecast, sunrise, and sunset evidence;
- Version 2 published after one narrow item-removal revision;
- Version 1 evidence keys and semantic hashes remained unchanged;
- pinned Version 1 sharing, ICS, print, and revocation passed;
- Mapbox, NPS, RIDB, and OpenWeather operation telemetry was present;
- weather and daylight returned successful live operation states;
- provider and recovery backlogs were zero;
- browser provider request count and console problem count were zero;
- the one-run Vercel automation bypass was revoked.

The acceptance run reported 431,073 ms total duration. It included one bounded
memory extraction retry exhaustion with no unresolved recovery work; that did
not alter travel evidence or publication.

## Verdicts

1. Destination resolution: `pass`
2. Weather/daylight integration: `pass`
3. Provider integration: `pass`
4. Protected Preview acceptance: `accepted`
5. Production readiness: `not_ready`

Production remains blocked by the broader production-readiness audit and the
unresolved Mapbox map-use/provider-compliance question. No unrestricted
Production deployment was performed.
