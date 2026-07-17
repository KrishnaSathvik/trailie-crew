# Monitoring and operational alerts

Status on July 17, 2026: provider-resilience signals are verified locally and through protected hosted acceptance; external alert delivery remains a Production blocker.

The server emits allowlisted operational alerts for provider failure, quota rejection, CAPTCHA failure, recovery backlog/failure, cron failure, and related health/security events. Payloads contain safe codes, environment, owner, severity, correlation ID, latency/age, and numeric counts only. Unit tests cover recursive content/credential rejection and delivery failure isolation.

Phase 5E adds signals for repeated 503, retry exhaustion, focused/Luna backlog, attempt-lease recovery, and application failure after provider success. Focused/Luna logs include provider latency when a result exists, total workflow latency, attempt/retry/recovery counts, safe provider status, quota reconciliation state, and final safe error code. Failed calls correctly report zero provider-result latency rather than fabricating duration. Prompts, message/memory values, cookies, headers, provider bodies, and raw outputs remain prohibited.

## Hosted configuration

The protected `hosted-acceptance` inventory does not contain `OPERATIONAL_ALERT_WEBHOOK_URL`, `OPERATIONAL_ALERT_WEBHOOK_SECRET`, `OPERATIONAL_ALERT_OWNER`, or `ALERT_ENVIRONMENT`. No accountable recipient or genuine delivery receipt is available, so hosted alerting is not accepted.

Required variables are documented in `.env.example`. The webhook must use HTTPS, the owner must name an accountable role or person, and Production/staging destinations must remain environment-separated. A webhook secret is recommended and must never appear in logs or evidence.

## Acceptance drill

1. Configure a non-production destination and owner in the protected staging environment.
2. Invoke `/api/internal/alerts/test` with the protected recovery credential and temporary Vercel automation bypass.
3. Confirm one delivered notification at the destination and match it using only its safe correlation ID.
4. Send a synthetic payload containing prompt, cookie, authorization, share-token, provider-payload, and raw-IP fields; confirm none arrive.
5. Simulate destination rejection and timeout; confirm workflow state remains intact and alert delivery does not recurse.
6. Revoke the temporary bypass and retain only a redacted receipt timestamp, event, environment, owner, and delivery status.

Until a real destination and receipt exist, logs remain useful operational evidence but are not a substitute for external alert delivery.
