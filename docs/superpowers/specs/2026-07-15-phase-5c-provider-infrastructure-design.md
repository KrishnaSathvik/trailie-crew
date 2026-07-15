# Phase 5C Provider Reliability and Infrastructure Design

Date: July 15, 2026. Approved input: the Phase 5C provider-infrastructure specification supplied in the Codex thread. Base: `a9e076815f8bb9406ec05930545b860660f3f2d0` on `main`.

## Scope and truth boundary

Phase 5C improves provider reliability and collects infrastructure acceptance evidence. It adds no travel intelligence, maps, guest collaboration, booking, or other major product feature. Vercel Authentication remains enabled, disposable non-production data is used, and unrestricted Production traffic is never launched. A configured control is not an accepted control until its required hosted or manual drill has passed.

## Architecture

Provider calls use one server-only typed policy for stage timeouts, total workflow deadlines, leases, attempt ceilings, retry classification, and bounded exponential backoff with jitter. OpenAI SDK retries are disabled so the application owns the retry count and prevents nested retry storms. Every provider attempt uses a stable workflow operation key, records safe request/response identifiers and token counts, and classifies timeouts separately from schema or validation failures.

Durability remains database-owned. A workflow records its durable state and claims a lease before provider traffic. Provider output and attempt metadata are persisted before the next state transition when replay could duplicate work. Row locks, uniqueness constraints, attempt caps, and atomic publication prevent duplicate Trailie messages, quota reservations, plan versions, and revision publications. Recovery may be invoked concurrently; only one worker continues a job.

Operational events use an allowlisted, recursively redacted schema. No raw prompt, message, token, cookie, share URL token, provider payload, or raw IP is sent to logs or alerts. An external alert adapter is environment-separated and fail-safe; alert delivery failures do not expose content or corrupt workflow state.

Acceptance is split into four evidence classes: deterministic local tests, linked non-production database tests, protected hosted Preview tests, and isolated protected Production-type infrastructure tests. OpenAI tests are bounded to the requested sample. High-volume load uses deterministic or disabled provider paths. Restore, cron, WAF, budget, Turnstile, external alert delivery, and assistive-technology claims require direct evidence from the relevant environment.

## Error and retry model

The shared public-safe failure classes are `model_timeout`, `model_unavailable`, `model_rate_limited`, `invalid_model_output`, `workflow_deadline_exceeded`, `retry_exhausted`, and `recovery_required`. Authentication, authorization, CAPTCHA, quota, stale basis, hard validation, disabled-provider, and exhausted-repair failures are not retried. Transient connection, provider 5xx/unavailability, rate limit, and timeout failures may retry only when the workflow policy allows another attempt and sufficient total deadline remains.

Backoff is exponential and capped, with injectable jitter for deterministic tests. Abort signals combine caller cancellation, stage timeout, and total workflow deadline. A timeout is never remapped to model validation.

## Acceptance and release decision

The hosted reliability report records workflow, model, safe request ID, provider/application status, provider and total duration, token counts, retry and repair counts, final safe error code, and recovery use. Small samples report observed ranges rather than p95.

The final report contains four independent verdicts: provider reliability, infrastructure readiness, protected release readiness, and unrestricted Production readiness. Any missing paid plan, credential, domain, alert recipient, protected staging project, restore target, manual tester, or delivered notification remains an explicit blocker. Phase 5C can end with conditional or failed verdicts while still delivering verified code and accurate evidence.

## Security review

Release review covers Turnstile/RPC bypass, cron secrets, alert redaction, quota races, retry double charging, duplicate completion/publication, protected staging access, backup artifacts, restore-project exposure, WAF bypass, load-test containment, health leakage, client secrets, share-token leakage, and service-role use. Database changes retain empty `search_path`, forced RLS for private tables, explicit grants, and service-only privileged functions.
