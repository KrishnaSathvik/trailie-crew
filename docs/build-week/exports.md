# Version-Pinned Exports

## Shared input and hashes

Calendar and print exports start from one explicitly selected published version, then run the same deterministic public projection used by sharing. They never read `rooms.current_plan_version` to substitute a newer plan. Stable, recursively key-sorted hashes are namespaced by export schema (`public-share:v1`, `ics:v1`, and `print:v1`) and exclude tokens, secrets, and generated timestamps. The authenticated print document includes its input hash and the private rate record identifies the internal plan ID/version.

Phase 4B does not persist artifacts, create `plan_exports`, or create a storage bucket. That avoids stale/signed URL and public-bucket risk. If server-side artifacts are added later, they require a private bucket, short signed URLs, version/hash cache identity, independent expiry, bounded concurrency, and missing-artifact regeneration.

## Calendar

The authenticated route `/api/trips/[roomId]/plans/[version]/calendar` verifies active membership through the exact-version plan RPC, requires a PASS-published itinerary, applies the public projection, and returns one RFC 5545 `VCALENDAR` with CRLF endings. Events include stable SHA-256-derived UID containing the plan version, deterministic `DTSTAMP` from publication time, TZID-local start/end, summary, public-safe description/location, and version-specific `PRODID`.

Text escapes backslashes, commas, semicolons, and newlines; UTF-8 lines fold at 75 octets. Only items with both real start and end times become events. Trailie never invents times or reservation claims; untimed items are omitted and counted in `X-TRAILIE-OMITTED-UNTIMED`. Repeated generation is byte-identical, while Version 1 and Version 2 have distinct UIDs and content hashes.

## PDF and print

Deployment compatibility favored a dedicated authenticated print route over a fragile server Chromium dependency. `/trips/[roomId]/plans/[version]/print` loads the exact historical version, applies the public projection, and renders a professional cover, overview, days, travel, stay, food, safe warnings, validation, no-booking disclaimer, print-safe colors, controlled page breaks, page numbers, and version/generated footer. The user selects **Print or Save PDF** and uses the browser's native PDF output.

There is no public PDF/calendar amplification in Phase 4B and no claim of server-generated PDF. Active members can export published versions; outsiders receive safe unavailable responses. The print route shares the share-page noindex/referrer/cache protections. Public-share downloads may be added later only from the same public-safe snapshot.

## Operational limits

Share rotation has a database room limit. A private, forced-RLS rate ledger authorizes the exact published version before export and allows 30 calendar or 10 print requests per user/room/type per ten minutes; a transaction advisory lock closes concurrent quota races, and records older than one day are removed. The browser cannot read the ledger. ICS work is additionally schema-bounded (60 days, 40 items/segments per day), lightweight, authenticated, and generated in-process; print is authenticated HTML with no server-side PDF process. A future persisted/server-PDF implementation must retain explicit user/room generation quotas and return `rate_limited` or `export_unavailable` without exposing internal failures.

Smoke commands are `pnpm test:calendar:smoke`, `pnpm test:pdf:smoke`, and `pnpm test:share:smoke`. Calendar smoke needs no external credentials.
