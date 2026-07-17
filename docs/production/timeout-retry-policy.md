# Timeout and retry policy

Status on July 17, 2026: implemented and verified locally for focused and memory durable recovery.

## Default ceilings

| Provider stage       | Default timeout |
| -------------------- | --------------: |
| Focused answer       |      30 seconds |
| Memory extraction    |      20 seconds |
| Planning summary     |      90 seconds |
| Itinerary generation |     180 seconds |
| Itinerary repair     |     120 seconds |
| Revision analysis    |      60 seconds |
| Revision generation  |     180 seconds |

All stages also share a 300-second total workflow deadline. A provider attempt receives the lesser of its stage timeout and the remaining workflow time. Recovery leases default to 360 seconds, longer than the workflow ceiling, and are still bounded to 60–900 seconds by configuration validation.

The default maximum is two attempts: one initial call and at most one retry. Focused and memory clamp to two attempts even if a shared setting is higher for another workflow. Exponential backoff starts at 500 ms, caps at 5 seconds, and applies up to ±20% jitter. Configuration rejects values outside the bounded ranges and rejects a base delay greater than its maximum.

## Classification and retry rules

`model_timeout`, `model_unavailable`, and `model_rate_limited` may retry while both the attempt and workflow budgets remain. `invalid_model_output`, `workflow_deadline_exceeded`, `retry_exhausted`, and `recovery_required` do not retry in the same worker. AI-disable and user/room/global/provider-budget quota errors pass through unchanged and never call or retry the provider.

An outer request abort becomes `recovery_required`; recovery examines durable state instead of blindly repeating the call. When the provider completed but application work did not, the recorded validated result is applied without another provider request. A retry uses the same logical operation key and a distinct bounded attempt.

Retry-After may be non-negative seconds or an HTTP date. It is first capped at 30 seconds, then constrained by the configured 5-second retry cap and the remaining workflow deadline. Missing, malformed, or negative values use bounded exponential backoff. A delay that cannot fit before the workflow deadline becomes `workflow_deadline_exceeded`. Deferred recovery persists `next_retry_at`, and drains skip work before that time.

The focused route further caps total workflow time at 55 seconds beneath its 60-second function ceiling. Memory work is durable before `after()` scheduling and may continue through the protected recovery drain rather than sleeping beyond a route ceiling.

Legacy `OPENAI_*_TIMEOUT_MS` variables remain supported as fallbacks. The stage-specific `AI_TIMEOUT_*`, `AI_TOTAL_WORKFLOW_DEADLINE_MS`, `AI_RECOVERY_LEASE_MS`, `AI_MAXIMUM_ATTEMPTS`, and `AI_RETRY_*` variables take precedence and are the production contract.

## Change procedure

Do not increase a ceiling from a single slow example. First capture several safe duration samples by workflow/model, compare them with Vercel function ceilings and the recovery lease, then run timeout, retry, interruption, quota, and full workflow acceptance. Record observed ranges when the sample is too small for percentiles. A timeout change requires a rollback value, cost-impact review, and confirmation that no caller can exceed the 300-second workflow ceiling.
