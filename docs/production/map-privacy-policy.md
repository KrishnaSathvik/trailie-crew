# Map privacy policy

## Classification

Map coordinates are classified as:

- `exact_private`: exact coordinates visible only to an authorized room member;
- `approximate_private`: a deliberately coarse location under a separately
  reviewed contract;
- `public`: an official or approved public location;
- `omitted`: no coordinates leave the server projection.

Lodging is private by category even if a provider incorrectly labels its
binding public. Public shares currently omit exact lodging coordinates rather
than approximating them.

## Public projection

Public map data is exact-version, read-only, and derived only after the existing
share-token, snapshot-integrity, expiration, and revocation checks pass.
Internal room, plan, item, day, marker, segment, evidence, request, cache, and
user identifiers do not cross the public boundary. Temporary Mapbox data,
private free text, exact lodging coordinates, raw provider payloads, and hidden
provider metadata are prohibited.

Public map rendering is optional. If the server cannot produce a valid safe
projection, the itinerary remains available without a map. Revocation removes
both itinerary and map access on the next request. Existing `noindex`,
`noarchive`, `no-store`, and no-referrer controls remain.

## Geometry

Route geometry can reveal movement. It is version-pinned evidence and is exposed
publicly only when the route is already part of the privacy-safe itinerary and
its endpoints do not disclose an omitted private location. No browser
geocoding, hidden traveler location, live position, or Realtime map-presence
payload exists.

## Telemetry

Map telemetry may record SDK/style status, bounded marker/route counts,
redaction counts, duration, and safe error class. It must not record tokens,
private queries, exact private coordinates, raw style URLs containing secrets,
or popup content. Client token exposure is expected only for the dedicated
public token.
