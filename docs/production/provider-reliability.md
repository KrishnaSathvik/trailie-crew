# Provider reliability runbook

Status on July 16, 2026: durable application behavior is verified locally; the full protected hosted regression failed at revision candidate scope validation. Production is not accepted.

## Reliability contract

Every provider operation has a stable workflow/operation key and a durable row in `private.ai_provider_attempts`. A claimant owns a bounded lease, reserves quota before provider traffic, and records the provider response identifier, safe usage totals, attempt/retry counts, latency, and a validated result before applying application state. Provider output and prompts are not stored in operational logs.

The state transition is `claimed → provider_completed → applied`. A provider result that arrived before an interruption can be validated and applied by recovery without calling the provider again. Lease ownership, operation identity, provider response uniqueness, and application idempotency prevent concurrent or replayed workers from double-calling, double-charging, or double-publishing. Terminal failure releases unused quota; success reconciles reserved usage to actual usage.

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
- `pnpm test:interruption:acceptance` covers interruption after provider completion and exactly-once application across six Vitest scenarios and 35 pgTAP assertions.
- `pnpm test:quota:acceptance` proves quota rejection produces zero provider calls across 27 Vitest scenarios and 35 pgTAP assertions.
- The full local Playwright suite passes 16 scenarios with the hosted-only scenario skipped.
- The protected hosted run reached real revision generation, then rejected the candidate with `change_scope_exceeded`; no Version 2 was published. That fail-closed invariant passed, but the full hosted regression did not.

See [Timeout and retry policy](./timeout-retry-policy.md), [Monitoring and operational alerts](./monitoring-alerts.md), and [Provider cost controls](./cost-controls.md).
