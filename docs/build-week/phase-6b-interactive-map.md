# Phase 6B interactive map

Status: local implementation complete; protected hosted map acceptance pending a
separate restricted browser token. Production was not deployed.

## Baseline and scope

Phase 6B starts from `7e71983e53ae6d6b4ff8eef2b219801080f93e52` on
`main`. It adds a version-aware spatial reading surface on top of the accepted
Phase 6A evidence and Phase 5D revision boundaries. The map is a projection of
the itinerary; it is never an editing or publication authority. Phase 6C guest
collaboration and Phase 7 booking remain deferred.

## Architecture

`ItineraryMapProjectionV1` is assembled server-side from one exact published
plan version, its immutable evidence snapshots, and that version's canonical
destination resolution. Member reads use an authenticated membership-checked
RPC. Public reads use a service-only token/hash/snapshot-integrity RPC and are
redacted before the projection reaches the browser. No generic map blob table
was added.

The projection contains ordered markers, bounded verified route geometry,
textual endpoint-only/unavailable route states, warning references, an initial
viewport, privacy classes, evidence state, and explicit plan-version identity.
Temporary Mapbox geocoding data is rejected. Durable coordinates are accepted
only from official NPS/RIDB evidence, explicitly approved permanent evidence,
or a future user-confirmed contract.

The browser map uses directly imported `mapbox-gl` 3.26.0 in a lazy client
chunk. A separate public browser token renders styles and tiles. It cannot be
the server geocoding/routing token. Local deterministic acceptance has no tile
or provider requests and never draws fake route lines.

## Experience

Desktop uses an itinerary-first 58/42 split with a sticky map region. Mobile
uses explicit Map and Plan modes plus collapsed, half, and expanded place-sheet
states. Selection is local UI state: map selection focuses the matching
itinerary card; list selection centers the marker without changing the
published plan or another participant's viewport. Day filters retain visible
selection and remove filtered-out selection safely.

Markers are numbered and monochrome-first. Verification is expressed in text,
not color alone. Only verified `LineString` evidence renders as a route.
Endpoint-only and unavailable segments remain textual and no straight-line
substitute is drawn. Warning actions return the user to the evidence view.

Version 1 reads Version 1 snapshots after Version 2 publishes. History carries
the publication-time evidence label. Spatial compare uses the candidate as one
base projection with added, removed, moved, route-changed, and warning-changed
annotations; it does not overlay two noisy maps.

## Privacy and sharing

Public exact-version projections replace internal room, plan, day, marker, and
segment identifiers. Item/evidence identifiers are removed. Exact lodging
coordinates are omitted, temporary Mapbox content is prohibited, and the map is
not rendered when a safe projection cannot be assembled. Share expiration,
rotation, snapshot drift, and revocation are rechecked before every source
read. Print remains itinerary-first and text-only; ICS is unchanged and
version-pinned.

## Fallbacks and accessibility

The itinerary is the complete non-map equivalent. Disabled configuration,
missing/reused token, no coordinates, SDK/style failure, and offline state show
purpose-built copy instead of a blank panel. The SDK is not loaded outside the
Map view. There is a Skip map link, a labeled map region, keyboard-accessible
list controls, live selection announcements, 44px mobile controls, Escape sheet
collapse, reduced camera/scroll motion, and no keyboard-only dependency on the
canvas.

## Local acceptance

The implementation includes schema/projection/configuration, component, route
adapter, repository, exact-version database, public privacy, revision/history,
and deterministic Playwright coverage. The database migration adds only narrow
security-definer read functions; private source tables remain forced-RLS and
browser roles cannot call the public-share source function.

The deterministic two-user browser flow passes map/day selection, Version 2
publication, immutable Version 1 history, mobile 390×844 Map/Plan and sheet
behavior, public Version 1 privacy projection, and immediate revocation. Final
local results were 629 Vitest assertions across 132 files, 605 pgTAP assertions
across 17 files, 15 full-suite Playwright passes with three intentional
hosted-only skips, and one legacy AI test that passed on its isolated retry
after the full-suite worker timeout. The separately loaded Mapbox chunk measured
495,729 bytes gzip. Dependency audit reported no known vulnerabilities.

## Hosted acceptance boundary

The protected `hosted-acceptance` Vercel environment did not contain
`NEXT_PUBLIC_MAPBOX_MAP_TOKEN`, `MAPBOX_STYLE_URL`, or `MAPBOX_MAPS_ENABLED` at
the start of Phase 6B. Trailie does not copy `MAPBOX_ACCESS_TOKEN` into public
configuration. A real hosted map smoke therefore requires a new URL-restricted,
minimum-scope public token and a protected Preview redeployment. Until that
input exists, the accepted Phase 6A Preview remains intact and no Phase 6B
hosted acceptance is claimed.

## Mapbox compliance

Showing a Mapbox map does not automatically settle the Phase 6A Geocoding API
terms question. Some geocoding-assisted planning happens outside the map
surface, temporary results remain transient, and durable permanent mode remains
explicitly paid/configured. Written Mapbox clarification is still recommended
before unrestricted Production use. No new permanent-geocoding request is made
by map load or deterministic acceptance.
