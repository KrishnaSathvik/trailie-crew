# Mapbox geocoding cost and compliance boundary

Reviewed against official Mapbox documentation and pricing on July 18, 2026.
This is an engineering control record, not legal advice.

## Invoice-confirmed usage

The account console showed 1 Temporary Geocoding request, 15 Permanent
Geocoding requests, 1 Directions request, and a $5 upcoming invoice. Mapbox's
pricing page lists Temporary Geocoding with a free monthly allowance and
Permanent Geocoding from $5 per 1,000 requests with no free tier. One permanent
request in a billing period can therefore create a paid line item.

Official references:

- <https://docs.mapbox.com/api/search/geocoding/>
- <https://docs.mapbox.com/help/dive-deeper/understand-temporary-vs-permanent-geocoding/>
- <https://www.mapbox.com/pricing/>

## Official restrictions reviewed

Mapbox documents Temporary as the default and says temporary results cannot be
cached. Permanent results may be cached/stored indefinitely and require an
eligible billing relationship. The Geocoding API documentation also says
responses may only be used with a Mapbox map.

Trailie does not claim that Phase 6A's planning-only use satisfies the map-use
restriction. Phase 6B is outside this work, and future map rendering does not
retroactively authorize prior storage or non-map use. Written provider/legal
confirmation is required before unrestricted non-map geocoding use.

## Storage-mode architecture

`MAPBOX_GEOCODING_STORAGE_MODE` is server-only and accepts:

- `disabled`: zero Mapbox geocoding calls;
- `temporary`: no `permanent=true`; response is in-memory only and marked
  `restrictions.storage=prohibited`;
- `permanent`: sends `permanent=true` and invokes a safe request counter hook.

There is no implicit permanent default. Local and protected hosted acceptance
use `disabled` or explicitly approved `temporary`. Permanent mode requires an
explicit environment decision and a reviewed durable-use need.

## Write barriers

Temporary Mapbox provider IDs, labels, coordinates, bounds, locality, region,
country, payloads, and evidence IDs cannot enter:

- the durable provider cache;
- normalized travel-evidence rows;
- canonical destination durable fields or semantic hashes;
- immutable plan evidence snapshots;
- public shares or member evidence projections.

Application repositories reject storage-prohibited evidence. Database cache,
evidence, and snapshot RPCs independently reject it. Acceptance bypass skips
both cache reads and writes. The non-storing diagnostic no longer requests
Permanent Geocoding.

## Durable identity

For supported NPS destinations, the durable canonical identity is the NPS park
code, official NPS name/URL, NPS state metadata, and official public NPS
coordinates. Temporary Mapbox geocoding may corroborate the entity during the
active workflow but does not become the durable identity.

For non-NPS destinations, Trailie must use one explicitly reviewed option:
application/user-confirmed identity, a provider with compatible storage/use
terms, or paid Permanent Geocoding for a genuinely approved durable use. If none
applies, Mapbox geocoding is disabled and the destination remains unresolved or
requires user selection.

## Directions separation and cost behavior

Mapbox Directions is separately configured and unaffected by geocoding storage
mode. It may use transient coordinates during the active workflow when provider
terms permit. Current acceptance usage is within the documented free allowance,
but pricing is not an availability or future-cost guarantee.

With protected acceptance on temporary mode, no Permanent Geocoding request is
expected. Permanent spend can occur only after an explicit permanent-mode
configuration. Safe counters make that invocation observable without logging
query text, coordinates, or credentials.

## Open question

Production use of Mapbox Geocoding remains blocked until the “in conjunction
with a Mapbox map” restriction is satisfied for the exact Trailie workflow or
Mapbox provides written clarification. The current implementation prevents
prohibited storage; it does not convert an unresolved contractual question into
a compliance claim.
