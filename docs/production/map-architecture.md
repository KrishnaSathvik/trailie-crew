# Map architecture

## Ownership boundary

The published itinerary and immutable evidence snapshots are authoritative.
`ItineraryMapProjectionV1` is a reader projection, not a second plan model.
Map interaction cannot edit, reorder, publish, approve, repair, refresh, or
geocode itinerary content.

## Source path

Member source:

1. authenticate the anonymous Supabase user;
2. require active room membership;
3. select one published `room_id + version`;
4. assemble the exact itinerary, publication-time evidence snapshots, target
   bindings, and canonical destination resolution;
5. validate and project on the server;
6. send only the bounded browser projection.

Public source:

1. hash the opaque share token;
2. require active, unexpired, unrevoked link state;
3. recheck plan ID/version/hash and public snapshot identity/hash;
4. assemble that exact plan version;
5. apply public coordinate and identifier redaction;
6. send no internal room/user/provider metadata.

The RPCs are narrow security-definer functions with an empty search path.
Member execution is `authenticated` only. Public execution is `service_role`
only. Existing private tables remain forced-RLS.

## Projection contract

The versioned projection declares destination/viewport, dated days, ordered
markers, route segments, warnings, privacy mode, evidence state, and generation
time. Geometry is a bounded GeoJSON `LineString` with at most 1,000 positions.
Only `verified_geometry` can carry geometry. Other states must carry `null`.

Coordinate priority is official NPS, official RIDB, approved permanent
provider, future user-confirmed coordinates, then unavailable. Snapshot
normalized coordinates are accepted only for those durable sources and only
when storage is not prohibited. Temporary Mapbox evidence never reaches a
snapshot or projection.

## Rendering

`mapbox-gl` is dynamically imported only when a Map view is opened and the
configuration is enabled. One map instance is retained for that view. Verified
routes are one GeoJSON source with mode-specific dash patterns. Up to 40
markers use accessible DOM buttons; denser sets use Mapbox clustering with an
accessible itinerary-list equivalent. Popup text is created with DOM
`textContent`; arbitrary HTML and arbitrary style URLs are not accepted.

The current application has no site-wide Content Security Policy. Before
unrestricted release, the nonce-based application CSP must explicitly review
Mapbox GL's connection, style/image/font, and `worker-src blob:` needs against
the Supabase Realtime and Turnstile sources already used by Trailie. A broad
map-only CSP was not added to the protected Preview because an incomplete
policy could silently break authentication, Realtime, CAPTCHA, or workers. This
is a recorded Production security task, not a claim that CSP is complete.

The initial camera uses canonical destination bounds, then visible markers, then
an unavailable state. It fits once, centers a selected item with restrained
motion, disables pitch/rotation, and never persists exact viewport data to the
server.

## Realtime and revisions

Selection, day filter, sheet state, and viewport are local. Realtime plan
publication may refresh version metadata but never forces a viewer away from a
historical version. Version 2 route refresh creates Version 2 evidence; Version
1 continues to read its own snapshot. Spatial compare is annotation-only and
does not change revision scope.
