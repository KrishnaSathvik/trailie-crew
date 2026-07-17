# Provider reliability runbook

> Phase 5D: scope violations now have one dedicated repair path separate from provider availability and itinerary conflict repair. Prior protected runs published exact removal Version 2 and independent removal Version 3, but full Preview reacceptance remains blocked by real-provider availability and hosted Luna reliability. See [Revision scope contract](./revision-scope-contract.md).

Status on July 17, 2026: durable application behavior and revision scope control are verified locally, and prior protected runs published constrained Versions 2 and 3. The latest complete hosted rerun stopped earlier at focused-answer provider/recovery availability. Production is not accepted.

## Reliability contract

Every provider operation has a stable workflow/operation key and a durable row in `private.ai_provider_attempts`. A claimant owns a bounded lease, reserves quota before provider traffic, and records the provider response identifier, safe usage totals, attempt/retry counts, latency, and a validated result before applying application state. Provider output and prompts are not stored in operational logs.

The state transition is `claimed → provider_completed → applied`. A provider result that arrived before an interruption can be validated and applied by recovery without calling the provider again. Lease ownership, operation identity, provider response uniqueness, and application idempotency prevent concurrent or replayed workers from double-calling, double-charging, or double-publishing. Terminal failure releases unused quota; success reconciles reserved usage to actual usage. Failed provider attempts remain immutable audit history; bounded retry is owned by the parent workflow, so those rows are not counted as directly recoverable provider results.

Only timeout, unavailable, and rate-limit failures are retryable. Invalid model output, workflow deadline, quota rejection, AI disable, and application validation failures are terminal. Recovery never turns an invalid result into a publication.

## Operator response

1. Use the safe correlation ID to inspect structured application logs and `ai_provider_attempts` metadata. Do not retrieve prompts or raw model output into an incident channel.
2. Classify the state: no provider result, completed result awaiting application, retry exhausted, quota rejection, or validation rejection.
3. For abandoned/expired leases, invoke the bearer-protected recovery endpoint once. An immediate repeat must be rejected by the distributed cooldown.
4. Confirm one durable attempt and one application-side result. For plans and revisions, confirm publication is immutable and validation passed.
5. If attempts or cost rise unexpectedly, set `AI_GENERATION_ENABLED=false`. Human chat, existing plans, shares, exports, and deletion must remain available.
6. Escalate repeated provider failures or recovery backlog through the configured external alert channel. Hosted delivery is not yet configured, so current logs do not satisfy this step.

Never manually edit an attempt into `applied`, reuse a provider response for a different operation, bypass quota reservation, or publish a failed validation result. A failed-closed workflow is preferable to guessed recovery.

## Verification

- `pnpm test:provider:acceptance` covers fail-once recovery, retry exhaustion, timeout/deadline behavior, usage reconciliation, and durable replay.
- `pnpm test:interruption:acceptance` covers 9 workflow checkpoints, including all five Phase 5D patch/candidate/scope-report/publication boundaries, plus six provider-attempt Vitest scenarios and 35 pgTAP assertions.
- `pnpm test:quota:acceptance` proves quota rejection produces zero provider calls across 27 Vitest scenarios and 35 pgTAP assertions.
- The full local Playwright suite passes 16 scenarios with the hosted-only scenario skipped.
- Prior protected Phase 5D runs published exact removal Version 2 and independent removal Version 3. The latest complete rerun on `dpl_52TpJwK7aReq9CzZJgPJHkwC8pMP` stopped when focused-answer recovery returned HTTP 503; a prior credentialed harness returned HTTP 429 for all 15 bounded operations. The full hosted regression therefore remains unaccepted.

See [Timeout and retry policy](./timeout-retry-policy.md), [Monitoring and operational alerts](./monitoring-alerts.md), and [Provider cost controls](./cost-controls.md).
