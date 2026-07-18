# Provider reliability runbook

> Phase 5D: scope violations now have one dedicated repair path separate from provider availability and itinerary conflict repair. Prior protected runs published exact removal Version 2 and independent removal Version 3, but full Preview reacceptance remains blocked by real-provider availability and hosted Luna reliability. See [Revision scope contract](./revision-scope-contract.md).

Status on July 17, 2026: durable focused/Luna behavior and revision scope control are verified locally and in protected real-provider acceptance. The earlier 429 incident was exhausted OpenAI project credits.

## Reliability contract

Every provider operation has a stable workflow/operation key and a durable row in `private.ai_provider_attempts`. A claimant owns a bounded lease, reserves quota before provider traffic, and records the provider response identifier, safe usage totals, attempt/retry counts, latency, and a validated result before applying application state. Provider output and prompts are not stored in operational logs.

The state transition is `claimed → provider_completed → applied`. A provider result that arrived before an interruption can be validated and applied by recovery without calling the provider again. Lease ownership, operation identity, provider response uniqueness, and application idempotency prevent concurrent or replayed workers from double-calling, double-charging, or double-publishing. Terminal failure releases unused quota; success reconciles reserved usage to actual usage. Failed provider attempts remain immutable audit history; bounded retry is owned by the parent workflow, so those rows are not counted as directly recoverable provider results.

Only timeout, unavailable, and rate-limit failures are immediately retryable. Invalid model output, workflow deadline, quota rejection, AI disable, and application validation failures are terminal. Recovery-required state is handled from persisted state rather than blindly replayed. Focused and memory each permit at most two attempts, even when another workflow has a larger shared cap. Recovery never turns an invalid result into a publication.

HTTP 429 retains `model_rate_limited`; HTTP 500/502/503/504 retain `model_unavailable`. Safe provider status, request ID, Retry-After, and correlation ID are persisted when available. Raw bodies and provider payloads are forbidden. Retry-After is capped and constrained by the remaining workflow deadline. A future retry persists `next_retry_at`; recovery skips ineligible work.

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
- The full local Playwright suite passes 16 scenarios with 3 hosted-only scenarios skipped.
- Prior protected Phase 5D runs published exact removal Version 2 and independent removal Version 3. Phase 5E controlled first-attempt 503s recovered on the bounded second attempts for focused and Luna. A complete protected flow published immutable Version 2 and passed pinned sharing/exports; a fresh-room repeatability subset passed. Final clean recovery and all workflow backlogs are zero.

See [Timeout and retry policy](./timeout-retry-policy.md), [Monitoring and operational alerts](./monitoring-alerts.md), and [Provider cost controls](./cost-controls.md).

## Phase 6A travel providers

Travel provider calls use the same stable parent itinerary/revision recovery identity plus a capability-specific hashed cache/request key. Cache misses require a service-only durable budget claim; cache hits do not consume live-call limits. Timeout, rate limit, and unavailable failures are retryable within the existing bounded workflow. Invalid input, invalid credential/entitlement, unsupported capability, malformed response, and not found are not blindly retried. One provider failure becomes unavailable evidence and does not block unrelated evidence unless deterministic policy marks the missing fact critical.

See [travel provider operations](./travel-provider-operations.md) and [travel cache policy](./travel-cache-policy.md).
