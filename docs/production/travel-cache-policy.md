# Travel cache policy

Travel cache keys are SHA-256 identities over environment, provider, capability, schema version, normalized input, date/time window, route mode, and locale. Credential-like keys are removed before canonicalization. Keys never contain raw credentials or cross environments.

| Capability                                          |  Fresh TTL | Stale use                                                                  |
| --------------------------------------------------- | ---------: | -------------------------------------------------------------------------- |
| geocode / reverse geocode / place search            |    30 days | allowed only for noncritical display with explicit stale state             |
| route                                               | 30 minutes | not used stale for timing validation                                       |
| weather / park alerts                               | 10 minutes | not used stale for critical decisions                                      |
| daylight                                            |   365 days | allowed because fixed date/location calculations are stable, still labeled |
| park metadata / operating hours / reservation links |    6 hours | allowed for noncritical display with explicit stale state                  |
| health                                              | 60 seconds | no reader-facing stale use                                                 |
| negative result                                     |  2 minutes | explicit unavailable/not-found only                                        |

Mapbox geocoding uses permanent-result mode because the cache is durable. Provider rules take precedence over these initial TTLs; a more restrictive provider rule shortens or disables storage.

Fresh hits become `cached_fresh`. Safe stale hits become `stale`. Negative hits remain unavailable. Acceptance can use `TRAVEL_CACHE_BYPASS=true`; Production should not. `TRAVEL_PROVIDERS_ENABLED=false` stops live calls but still permits environment-isolated cached records and immutable historical snapshots to be read.

The database cache is forced-RLS, service-only, response-size bounded, and keyed by environment. Upsert cannot change another environment. Short-lived in-process deduplication prevents identical calls within a workflow. OpenWeather also shares one One Call payload across weather, alerts, timezone, sunrise, and sunset for the same coordinates.

Cleanup removes expired cache records, old completed provider operations, completed refresh jobs, and only evidence that is neither cached nor referenced by an immutable plan snapshot. Cleanup is bounded and service-only.
