# Preview Operations

## Ownership and access

Phase 5A uses the dedicated Vercel project `trailie-crew-preview` under the `ShadowDevil's projects` account. Vercel Authentication protects all deployment URLs except custom domains; no custom domain is configured and the URL must remain team-only while CAPTCHA is unresolved. The repository owner is the initial on-call owner for Preview failures and manually reviews Vercel function/build logs after every acceptance run.

## Structured logging contract

Server operations emit one JSON object per event through `src/server/operations/logger.ts`:

- ISO timestamp, event name, correlation ID, safe status, safe error code, and latency;
- model, prompt version, internal run identifier, retry count, and aggregate job counts only when operationally useful;
- recursive redaction of prompts, message bodies, chat messages, memory, share tokens, authorization headers, cookies, API keys, provider payloads, tokens, and hidden reasoning.

Tests verify the safe shape and recursive redaction. Logs must never contain raw prompts, full messages, memory facts, share URLs/tokens, auth headers/cookies, credentials, provider payloads, or model reasoning. Preview logs should be retained only under the Vercel account's configured retention period; that period must be verified before production. Access is limited to project members.

## Error reporting

Preview initially uses structured Vercel function logs rather than adding a new observability vendor. Server routes return stable safe codes; raw provider/database exceptions are not returned or logged. Client Trailie failures use controlled copy. A synthetic recovery failure is covered locally and must be observed once in hosted logs before acceptance. Source-map and third-party error-reporting policy remain production work.

## AI emergency control and spend

Set Preview-scoped `AI_GENERATION_ENABLED=false` and redeploy to stop focused answers, memory extraction, planning, itinerary generation, and AI revision work before provider construction. Human chat continues. Publication-only completion is not an AI provider call. Re-enable only after the incident/cost condition is understood and stale work can be recovered deliberately.

Current database functions enforce per-user/room AI rate controls and attempt caps. The switch behavior is covered by server-side tests; the final accepted hosted deployment remains enabled. OpenAI project usage-alert threshold/owner proof was not available through the repository or CLI and remains a controlled Preview condition. No hard spending cap is claimed.

## Recovery

`POST /api/internal/recovery` requires an exact server-only bearer secret compared through SHA-256 digests with constant-time equality. It has no UI, no permissive CORS header, no-store responses, at most one selected job from each of the five recovery categories per invocation, database claim/attempt guards, a distributed 10-second execution lease, safe count-only output, and structured logs. Invoke manually from an authorized operator environment; never put the secret in a URL or browser.

Vercel Cron invokes only Production deployments, so Phase 5A does not attach a cron schedule to this Preview. The hosted drill returned 401 for missing/wrong secrets, 200 with zero eligible jobs for the correct secret, and 429 for an immediate duplicate. Unit/pgTAP coverage exercises stale queued/running work, terminal-row preservation, and attempt caps. Durable automated queue/cron execution remains a production blocker.

## Incident procedure

1. Restrict or disable the Preview deployment if privacy, auth, or cross-room isolation is in doubt.
2. Set `AI_GENERATION_ENABLED=false` and redeploy for provider/cost incidents.
3. Record correlation IDs, safe error codes, route/function durations, and affected internal job IDs outside public reports; do not copy private content.
4. Inspect hosted Supabase health, Auth, Realtime, migration history, RLS/grants, and Vercel logs.
5. Apply a tested forward fix. Do not assume down migrations or destructive database rollback.
6. Run the protected recovery drain in small batches and verify no completed/skipped work was reprocessed.
7. Repeat the relevant hosted acceptance slice before reopening team access.
