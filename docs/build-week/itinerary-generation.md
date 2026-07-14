# Itinerary Generation

A revision always produces a complete candidate from the current published base; it never patches the base in place. Candidate content stays unpublished until full validation, boundary validation, and final confirmation complete.

## Approved-summary boundary

Phase 3B starts only from `planning_requests.status = approved_for_generation`. The authenticated `create_itinerary_generation` RPC independently verifies participant ownership, active membership and room state, the current approved summary version, deterministic staleness, readiness, and blockers. It snapshots the immutable summary ID, version, and hash; browser-supplied itinerary content is never accepted.

The idempotency unit is `(planning_request_id, basis_summary_version)`. The first publication is plan version 1. Approval remains unchanged and does not mean a plan exists.

## Lifecycle and worker

`generating → validating → needs_revision → validating → published` is the successful conflict-demo path. `blocked` and `failed` are terminal; `superseded` is reserved for a future revision phase. Atomic claims allow one running worker, reclaim leases older than five minutes, and cap private runs at three. Recovery derives the safest stage from persisted draft, report, and evidence state instead of repeating completed work.

The server builds a bounded context from the approved summary and safe active traveler labels. It excludes the full transcript, auth/invite data, unrelated memory, emails, prompts, and operational history. `gpt-5.6-sol` proposes strict schema only. It never validates or publishes.

## Validation and repair

Validator `trailie-itinerary-validator-v1` checks schema, IDs/references, date range, timezone, ordering, overlap, travel buffers, arrivals/departures, verified routes, daily drive load, hard constraints, confirmed decisions, rejected options, opening/reservations when evidenced, coordinates, evidence freshness, budget, duplicates, and public-safe rendering. Critical/high issues block publication. Correctable blocking issues return `needs_revision`; contradictions or unsafe approved-decision changes return `blocked`.

At most one schema repair and one itinerary conflict repair may run. The repair receives only the approved summary, draft, structured issues, and verified evidence. The demo deliberately schedules a 4:00 PM stop after a 3:00 PM activity with a verified two-hour drive; the single repair moves the stop to 5:30 PM without changing the approved destination or must-do.

## Publication and visibility

`complete_itinerary_publication` locks the plan, requires the latest private report to be `pass`, persists the final validated itinerary, sets `published_at`, updates `rooms.current_plan_version`, and emits a safe invalidation atomically. A trigger rejects every later update or delete of a published plan.

The Plan tab polls the safe room projection and resumes after refresh. It shows real semantic events only, then Overview, Day-by-day, Travel, Stay, Food, and Validation views. It never shows raw validation JSON, prompts, model reasoning, token counts, provider IDs, or private evidence payloads.

## Versions and limitations

- Itinerary schema: `1`
- Prompt: `trailie-itinerary-v1`
- Validator: `trailie-itinerary-validator-v1`
- Model: `gpt-5.6-sol`
- SDK: `openai@6.46.0`

Booking, purchase, autonomous browsing, weather, semantic-review calls, and multi-agent orchestration are deferred. Live itinerary smoke was not run unless the final verification report explicitly says otherwise.

Phase 4B exports never rerun generation and never resolve a mutable current pointer. They consume the selected PASS-published `itinerary_json`, apply the deterministic public projection, and pin the result to that plan's immutable hash and version. The Phase 4B migration also ensures initial Phase 3B publications receive a plan hash at write time, closing the gap between historical backfill and newly published Version 1 rows.
