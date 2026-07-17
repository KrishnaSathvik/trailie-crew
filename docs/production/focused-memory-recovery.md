# Focused and memory recovery

Status on July 17, 2026: deterministic and real-provider protected recovery are verified. The earlier HTTP 429 incident was exhausted project credit capacity, not an application or provider-service outage.

## Focused answer state

One focused invocation owns one operation key, quota reservation, source-message binding, and at most two provider attempts. The effective states are:

`invoking → provider_retrying → provider_completed → applying → completed`

An expired lease or interrupted application may enter `recovering`. Exhausted or non-retryable work enters `failed`. These UI labels do not replace the private durable invocation, run, and attempt records.

Before a provider call, the application persists invocation/source/room/user/participant identity, model and prompt versions, quota reservation, attempt number, and lease. After provider success it persists the validated structured result, immutable provider identity, usage, durations, and completion time before application.

Recovery rules:

1. No provider result: claim only the next eligible attempt when the two-attempt and workflow-deadline budgets allow it.
2. Provider result exists: validate/load and apply it without another provider request.
3. Final message exists: mark application complete without inserting or broadcasting again.
4. Retry exhausted: record a safe terminal failure and release unreconciled quota.

Provider text deltas are buffered until `finalResponse()` succeeds and strict output validates. A partial stream is never chat history. Browser disconnect does not authorize replay. Reconnect/refresh reads the persisted final state.

## Luna extraction state

The human message transaction durably creates eligible extraction work. Next.js `after()` starts an opportunistic worker, but the protected recovery drain is the durable fallback.

Each source message has one extraction application and one message-scoped quota reservation. At most two provider attempts are recorded. Retryable 429, 5xx, network, and timeout failures receive bounded delay or a persisted `next_retry_at`. Invalid structured output and workflow-deadline exhaustion are terminal.

Validated memory output is staged privately before fact application. Recovery can apply that result without recalling Luna. Fact uniqueness, source identity, and correction/supersession rules prevent duplicate active facts. Memory never creates a visible assistant message, and extraction failure never blocks human chat.

## Retry eligibility

Retry-After accepts non-negative seconds or an HTTP date. It is capped at 30 seconds and then constrained by the configured backoff maximum and remaining workflow time. Missing, malformed, negative, or excessive values fall back safely or are capped. Recovery skips work whose `next_retry_at` is still in the future and never busy-loops.

Focused and Luna are capped at two attempts even if a shared policy permits more attempts for a different workflow.

## Operator procedure

1. Locate the safe correlation ID and inspect status, attempt count, safe provider status, retry count, recovery count, quota state, and backlog age.
2. Do not copy prompts, message bodies, memory values, cookies, headers, or provider payloads into incident evidence.
3. If a validated result exists, run protected recovery once and confirm application without a new provider response ID.
4. If no result exists, confirm retry eligibility and `next_retry_at` before invoking recovery.
5. If retry is exhausted, leave the terminal record intact. Do not reset the attempt number or quota identity.
6. Confirm exactly one final focused message or one memory application and zero unresolved work.

The recovery endpoint returns HTTP 200 after a successful drain even when an individual job was deferred or failed safely. Authentication is 401, cooldown is 429, and recovery-infrastructure failure is 500.

## Acceptance evidence

Local coverage includes 503 then success, repeated unavailability, timeout recovery, staged-result application, duplicate recovery, quota reconciliation, correction supersession, stream termination, browser disconnect, and exactly-once SQL invariants.

Protected evidence on July 17 recorded controlled first-attempt 503s followed by successful focused and Luna retries. Focused produced exactly one final message and one usage reconciliation; Luna preserved correction supersession without a visible response or duplicate fact. A complete protected Version 2 flow and fresh-room focused/Luna/planning subset passed with zero unresolved provider attempts and zero recovery backlog.
