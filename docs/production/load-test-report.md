# Phase 5C bounded load report

Date: July 16, 2026. Result: **pass for the tested local database envelope only**.

`pnpm test:load:acceptance` ran against the isolated local Supabase/Postgres stack. All inserted data was inside a transaction that rolled back. AI/provider traffic was disabled; provider call count was zero.

## Tested envelope and observed aggregates

| Measure                        |              Observation |
| ------------------------------ | -----------------------: |
| Simulated users                |                       10 |
| Chat messages                  |                    1,000 |
| Reactions                      |                    1,000 |
| Message-history pages          |             50 × 20 rows |
| Message insert aggregate       |                101.45 ms |
| Message insert throughput      | 9,856.98 messages/second |
| Reaction insert aggregate      |                 82.24 ms |
| Fifty page reads aggregate     |                  8.42 ms |
| Database connections after run |                       11 |
| Waiting locks after run        |                        0 |

Twenty-eight deterministic integration tests also passed for planning, itinerary, revision, sharing, lifecycle, and provider-disabled quota behavior. The run retained no new index because it observed no waiting locks and did not produce query evidence that justified one.

## Claim boundary

These are aggregate timings from one local database transaction, not independent request latency samples. No p50/p95/p99 values are reported. This run does not measure HTTP, browser, Realtime fan-out/churn, Vercel CPU/memory/concurrency, hosted Supabase connection limits, provider latency, or Production capacity. It therefore cannot set a public traffic envelope.

Protected hosted load, Realtime churn, and firewall/rate-limit recovery remain blocked until an isolated environment, WAF policy, access owner, and approved load window exist.
