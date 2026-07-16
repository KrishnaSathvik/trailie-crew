# Incident response

Status: owner and paging channel must be assigned before Production.

| Severity | Definition                                                                                         | Initial action                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| SEV-1    | cross-room/private-data exposure, credential exposure, destructive deletion of active data         | disable affected surface, rotate credentials, preserve safe evidence, notify accountable owner immediately |
| SEV-2    | sustained auth/generation outage, quota bypass, recovery backlog, abusive traffic with cost impact | disable AI/provider surface if relevant, rate-limit, begin incident log                                    |
| SEV-3    | degraded workflow, repeated provider failure, stale jobs within recovery bounds                    | investigate during staffed support window, monitor trend                                                   |
| SEV-4    | cosmetic/documentation issue without access or data impact                                         | normal backlog                                                                                             |

Record timestamps, safe error codes, correlation IDs, counts, decisions, and responders. Do not record messages, prompts, memory, raw model responses, share/invite tokens, auth headers, cookies, keys, IP addresses, or private traveler data.

Contain first; then determine scope, rotate/revoke, restore service conservatively, verify isolation, and write a no-secret retrospective. Use the Support page for ordinary/abuse reports. A private security-reporting channel and on-call owner remain Production requirements.

For unexpected provider spend, disable application generation first, confirm quota rejection causes zero provider calls, and rotate the OpenAI project key if compromise is possible. Account-level budget and spend-alert configuration remains unverified; see `cost-controls.md`.

For database loss or corruption, do not restore over the only active project without an approved outage plan. Prefer restore-to-new-project, disable outbound operations on the clone, validate security/application behavior, and measure RPO/RTO before any cutover. The July 16 inventory found no available backup entry or isolated restore target; see `restore-drill.md`.
