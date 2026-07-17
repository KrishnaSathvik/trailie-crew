# Phase 5E — Provider resilience and protected Preview reacceptance

Date: July 17, 2026

Baseline: `614cf336d65966c9ae63f34bc756ac31b03a0ccb` on `main`

Vercel CLI: `56.3.1`

## Outcome

Phase 5E implemented bounded, durable provider recovery for focused Terra answers and Luna memory extraction without changing revision validation. Local deterministic acceptance passes. After exhausted OpenAI project credits were replenished, direct Terra and Luna probes, the controlled protected resilience drill, one complete protected Version 2 flow, and a fresh-room repeatability subset all passed.

Verdicts:

1. Focused provider resilience: `pass`.
2. Luna memory resilience: `pass`.
3. Protected Preview acceptance: `accepted`.
4. Production readiness: `not_ready`.

No unrestricted Production deployment occurred. Phase 6 did not begin.

## 503 root cause and normalization

The Phase 5D 503 originated upstream during a real focused Terra provider call. The call was attempted, no validated provider result was staged, and the old SDK-internal retry occurred inside one durable attempt row. Recovery then failed independently during recovery preparation and returned an aggregate HTTP 503.

Phase 5E now normalizes SDK errors and application provider wrappers consistently:

- 429 becomes `model_rate_limited`.
- 500, 502, 503, and 504 become `model_unavailable`.
- connection/fetch/network failures become `model_unavailable`.
- provider timeouts become `model_timeout`.
- caller abort becomes `recovery_required`.
- total deadline exhaustion becomes `workflow_deadline_exceeded`.
- malformed strict output becomes `invalid_model_output`.
- exhausted bounded retries become `retry_exhausted`.

Safe status, request ID, bounded Retry-After, and correlation ID are retained where available. Raw response bodies are never stored. A defect found during the hosted drill—provider wrappers use `statusCode`, `requestId`, and `retryAfterMs` rather than SDK `status` and headers—was fixed test-first. Streaming now prefers the authoritative `finalResponse()` error over a generic iterator termination when both reject.

## Focused retry and streaming behavior

Focused work has one logical invocation and operation key, with at most two distinct durable provider attempts. One quota reservation is reused; actual usage is reconciled once after validated result staging. Backoff is exponential, jittered, Retry-After-aware, bounded by the configured cap, and never exceeds the remaining workflow or 55-second route budget.

Provider deltas remain in memory until complete structured output validates. No partial assistant message is persisted. Browser disconnect does not cancel server-side durable completion. A staged provider result is applied by recovery without another provider call. Completion, message persistence, and Realtime invalidation remain idempotent, yielding at most one final Trailie message.

The UI exposes accessible live-region states for retrying, recovering, and bounded terminal failure. Human chat and the rest of the room remain usable after provider failure.

## Durable focused and Luna recovery

Focused invocation identity, room/user/participant/source binding, prompt/schema/model versions, quota identity, run state, leases, attempts, and validated results are private durable state. Recovery distinguishes:

- no provider result and retry budget remaining;
- validated provider result awaiting application;
- final message already persisted;
- retry budget exhausted.

Luna continues to enqueue an eligible extraction row before `after()` scheduling. `after()` is only an optimization. Luna uses the same two-attempt cap and safe provider metadata, persists validated result before fact application, reuses one message-scoped quota reservation, and preserves correction/supersession idempotency. A failed extraction never blocks chat or creates a visible Trailie message.

See [Focused and memory recovery](../production/focused-memory-recovery.md) for operator state and interruption semantics.

## Recovery endpoint

The protected endpoint no longer converts a retryable job failure into aggregate HTTP 503:

- 200 means the drain ran; jobs may be completed, safely failed, or deferred.
- 401 means authentication failed.
- 429 means the distributed cooldown rejected overlap.
- 500 means recovery infrastructure itself failed.

The response contains only `claimed`, `completed`, `deferred`, `retry_exhausted`, `failed`, `skipped`, and `remaining_eligible`. The final clean protected deployment returned HTTP 200 with every count at zero.

## Database changes and invariants

Migrations:

- `20260717154645_phase_5e_provider_resilience.sql`
- `20260717181900_phase_5e_failure_metrics.sql`
- `20260717200000_phase_5e_failure_latency.sql`
- `20260717232500_phase_5e_terminal_attempt_cleanup.sql`

Private attempts now retain bounded provider status, Retry-After, next retry eligibility, correlation identity, recovery count, and success/failure latency. Service-only functions load bounded focused context, list eligible work, and expose a content-free acceptance aggregate. A failed second attempt records one retry. Recovery also finalizes an expired generation/repair attempt whose parent plan is already terminal, preventing a completed failure from remaining in the provider-attempt backlog. Existing forced RLS and direct browser denial remain in place. Provider response identity, operation/attempt uniqueness, quota reconciliation, message insertion, and fact application remain exactly once.

No raw provider response was added. Revision validator source and Phase 5D validator tests were not changed or deleted.

## Local verification

- formatting, lint, typecheck, and local production build: pass;
- Vitest: 108 files, 527 tests passed;
- database reset: pass;
- pgTAP: 15 files, 539 assertions passed;
- Playwright: 16 passed, 3 hosted-only skipped;
- interruption acceptance: 9 checkpoints, exactly once;
- quota acceptance: pass, zero provider calls after rejection;
- dependency audit: no known moderate-or-higher vulnerability;
- database lint/advisors: no error-level finding; documented informational findings remain;
- route manifest contains no provider fault route;
- revision/validation source and tests are unchanged.

The earlier real credentialed harness ended every bounded operation at HTTP 429 while the OpenAI project credit balance was exhausted. After credits propagated, a `maxRetries: 0` minimal Terra probe returned HTTP 200 in 1.943 seconds with request ID `req_5a1b0d57df554ab385710e1ee9099f7f` and 22 tokens. A minimal structured Luna probe returned HTTP 200 in 1.146 seconds with request ID `req_ea611a74b6384d0bbb4c55536b4f3048` and 100 tokens. Neither returned `insufficient_quota`, `billing_hard_limit_reached`, or `rate_limit_exceeded`. The earlier 429 incident is therefore classified as exhausted API credits, not an OpenAI service outage or Trailie defect.

## Protected hosted evidence

All deployments used only the Vercel-Authentication-protected `hosted-acceptance` custom target. A marker-gated server-side fault mode was temporarily configured only for the drill; there is no public fault route.

The controlled protected drill injected one server-side, marker-gated 503 for focused work and one for memory without exposing a public fault route. Focused completed on attempt two with one final response, no partial message, one quota reconciliation, provider latency 4.591 seconds, workflow latency 5.201 seconds, and zero unresolved work. Luna completed extraction and correction with four total attempts, one retry, no duplicate facts, preserved supersession, provider latency 6.588 seconds, and zero unresolved work. The recovery endpoint returned HTTP 200 safe counts.

The complete protected room `8bdec7e4-b428-49ca-82c7-85937d34e07d` then passed create/join, Realtime chat/presence/typing/reaction/reconnect, focused Terra, Luna extraction and correction, planning and approvals, validated Version 1, a narrow manifest revision, immutable Version 2 publication, pinned Version 1 sharing/ICS/print, revocation, and refresh. It contained seven user messages and exactly one Trailie message. Focused used one attempt, 471 tokens, 1.802 seconds provider latency, and no retry. Memory used eight attempts across eligible human messages, one retry, 9,533 tokens, preserved correction supersession, and no duplicate application. Versions 1 and 2 remained distinct, published, and immutable; the only share was revoked.

That run exposed one unrelated stale provider-attempt row from a previously interrupted terminal itinerary repair. The terminal-attempt cleanup migration finalized it without replaying provider work. A post-migration global content-free audit reported zero focused, memory, planning, itinerary, revision, publication, provider-attempt, and recovery backlog.

A fresh-room repeatability subset passed focused Terra, Luna extraction, Luna correction, and planning summary in 78.325 seconds. Focused used one attempt; memory used four attempts with no retries; both had zero unresolved work and exactly one focused output.

The final clean deployment is `dpl_81bc4Db2Hp4UejzooFe2Ac9arxdT`, Ready only on `hosted-acceptance`. `HOSTED_ACCEPTANCE_PROVIDER_FAULT` is absent. Vercel Authentication remains enabled for deployments, the protection-bypass inventory is empty, and no public domain or unrestricted Production deployment was created.

## Remaining blockers

- Preview has no scheduled Vercel Cron execution; recovery is manually invoked there.
- Real Turnstile, WAF/bot controls, external alert delivery, provider monetary cap evidence, restore/RPO/RTO acceptance, and the manual accessibility matrix remain outstanding Production controls.
