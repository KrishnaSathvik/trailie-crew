# Map performance

## Budgets

Phase 6B budgets are:

- Mapbox SDK excluded from the initial itinerary render and loaded in a separate
  client chunk only when Map is opened;
- map JavaScript chunk: target no more than 650 KiB gzip, measured from the
  production build rather than claimed from source size;
- projection payload: target no more than 250 KiB for the accepted itinerary;
- route geometry: no more than 1,000 positions and 24 KiB per stored provider
  evidence item;
- ordinary DOM markers: up to 40, then visual clustering;
- deterministic test ceiling: 200 markers and 1,000 route positions;
- selection/day-filter response: target under 100 ms on acceptance hardware.

These are release budgets, not a Production-scale claim.

The Phase 6B local production build measured the separately loaded Mapbox chunk
at 1,816,920 bytes raw and 495,729 bytes gzip (about 484 KiB). It is below the
650 KiB gzip budget and is not part of the initial itinerary render.

## Loading and updates

The itinerary renders before map source loading. Map code is absent from routes
where it is not visible. One map instance serves the mounted view. Projection,
filters, compare emphasis, route GeoJSON, and item lookup are memoized or
updated as bounded batches. Chat activity does not rebuild the map. The map is
not resized in a sheet feedback loop.

## Offline and caching

Trailie does not implement offline tile storage. Normal provider/browser caching
is left to the Mapbox SDK and provider terms. The current PWA may retain
itinerary text according to its app-shell policy; when offline, the interactive
map disables explicitly so stale tiles cannot be confused with current evidence.
Historical evidence labels remain publication-time labels.

Official performance reference:
<https://docs.mapbox.com/help/troubleshooting/mapbox-gl-js-performance/>.
Map tile/style caching behavior must continue to follow the current Mapbox SDK
and account terms.
