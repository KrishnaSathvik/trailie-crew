# Provider cost controls

Status on July 16, 2026: application controls verified; OpenAI account controls **unverified**.

OpenAI documents API rate limits at organization and project scope and describes monthly organization usage limits in the developer console. The Phase 5C session has neither an OpenAI Admin key nor an available authenticated browser, so project budget, spend-alert recipients, and a delivered notification could not be inspected or tested. Do not represent them as configured.

## Verified application controls

- `AI_GENERATION_ENABLED` provides a server-only emergency stop.
- Database policy applies bounded daily invocation/token limits per user, room, global usage, and configured model.
- A durable provider attempt ID is reused as the quota reservation ID.
- Reservations happen before provider traffic; success reconciles actual usage and terminal provider failure releases the reservation.
- Quota and emergency-switch rejection remain non-retryable. `pnpm test:quota:acceptance` proves `room_ai_limit_reached` produces zero provider calls and passes the Phase 5C quota/replay pgTAP invariants.
- Human chat, existing plans, sharing, exports, and deletion remain available while generation is disabled.

These controls reduce application-originated spend but do not replace an account-level OpenAI usage limit or spend alert.

## Required external acceptance

An OpenAI organization/project owner must inspect the project selected by the deployed `OPENAI_API_KEY`, record whether a monthly usage limit and spend alerts are configured, assign an accountable recipient, and run a safe notification test. Evidence records only configured yes/no, recipient role, alert type, delivered yes/no, and timestamp—never amounts, account IDs, or credentials.

If unexpected spend occurs, set `AI_GENERATION_ENABLED=false`, confirm a disposable request receives `ai_disabled` with zero provider traffic, review safe usage counts by workflow/model, rotate or revoke the affected project key when compromise is suspected, and re-enable only after quota/provider attempt reconciliation.

Official reference: [OpenAI API rate limits](https://developers.openai.com/api/docs/guides/rate-limits#how-do-these-rate-limits-work).
