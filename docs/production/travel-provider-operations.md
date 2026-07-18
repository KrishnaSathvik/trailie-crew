# Travel provider operations

All provider adapters validate inputs, use HTTPS host allowlists, enforce bounded response size and timeout, normalize errors, redact credentials, and return unavailable evidence instead of throwing raw provider details into user flows.

Each cache miss is authorized through a service-only durable provider-request claim before network traffic. Identity includes provider, capability, environment, workflow, safe hashed request key, and bounded attempt. The claim prevents duplicate workflow calls and enforces per-room and global daily limits. Cache hits are recorded separately and do not consume live-call budgets.

Stored operation metadata is limited to provider, capability, safe environment/workflow/request identity, status, cache status, safe request ID when supplied, duration, normalized error class, retryability, next retry time, and bounded cost metadata. Query text, coordinates, credentials, authorization headers, and raw payloads are forbidden.

Retryable classes are timeout, rate limit, and provider unavailable. Invalid input, invalid credentials/entitlement, not found, malformed response, unsupported capability, and policy rejection are not blindly retried. Multi-provider itinerary and revision work inherits the existing durable workflow claim/recovery boundary; provider cache identity prevents a recovered parent workflow from charging again for a completed call. Travel refresh jobs add bounded leases, `next_retry_at`, three-attempt ceilings, and exactly-once snapshot binding for explicit refresh work.

`TRAVEL_PROVIDERS_ENABLED=false` is the global emergency switch. `TRAVEL_DISABLED_PROVIDERS` is a comma-separated allowlisted subset of `mapbox`, `openweather`, `nps`, and `ridb`. Historical snapshots remain readable and human/AI planning degrades with explicit unavailable evidence.

Operator metrics are provider/capability status, latency, cache status, normalized error class, and bounded retry state. Alert on sustained failure/rate-limit rate, invalid credentials, high latency, limit rejection, or nonzero recoverable backlog. Never log raw provider errors.

Hosted acceptance must keep Vercel Authentication enabled, use server-only Preview credentials, create disposable rooms, use a one-run automation bypass only when necessary, and revoke it in `finally`. Production deployment is not authorized by Phase 6A.
