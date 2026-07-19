# Mapbox client token

Official references reviewed July 18, 2026:

- <https://docs.mapbox.com/accounts/guides/tokens/>
- <https://docs.mapbox.com/mapbox-gl-js/guides/security-and-testing/>
- <https://docs.mapbox.com/help/glossary/attribution/>

## Contract

`NEXT_PUBLIC_MAPBOX_MAP_TOKEN` is a dedicated public browser token. It may
render approved styles and tiles only. It must never be copied from
`MAPBOX_ACCESS_TOKEN`, which remains server-only for separately configured
geocoding/routing. Runtime configuration rejects a non-public token and disables
maps when the browser and server token values match.

`MAPBOX_STYLE_URL` accepts only a `mapbox://styles/{owner}/{style}` URL or an
HTTPS Mapbox Styles API path. `MAPBOX_MAPS_ENABLED` is an explicit boolean.
`MAPBOX_MAP_ADAPTER=deterministic` is local/test-only and is rejected in Vercel
Production.

## Hosted acceptance setup

Create a separate minimum-scope public token in the Mapbox console. Restrict its
allowed URLs to the exact protected Preview host(s). Do not add the Production
domain until Production approval. Add the token only to the Vercel
`hosted-acceptance` custom environment, add the allowlisted style, set maps
enabled, and redeploy that protected Preview. Verify presence without printing,
hashing, downloading, or exporting the value.

Expected client bundle checks:

- the public `pk.` token is expected;
- no server token or provider API key appears;
- no geocoding endpoint is called from the browser;
- map load produces no Permanent Geocoding request;
- attribution remains visible.

## Rotation and monitoring

Create and restrict the replacement token first, update only the intended
environment, redeploy, run a style/tile smoke, then revoke the former token.
Monitor Map Loads and style/tile usage separately from Geocoding and Directions.
Unexpected browser geocoding or a Permanent Geocoding line item is an incident,
not normal map load.
