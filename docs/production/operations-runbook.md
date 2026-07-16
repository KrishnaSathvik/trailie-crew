# Production operations runbook

## Schedules

- Recovery: `GET /api/internal/recovery` every 10 minutes in Vercel Production; Preview is manual because Vercel Cron does not run on Preview deployments.
- Anonymous cleanup: `GET /api/internal/anonymous-cleanup` daily at 04:17 UTC in Production. Always run `POST ...?dryRun=true` and review safe counts before first destructive enablement in a new environment.
- Both routes require bearer authorization, use distributed leases, bound work, return safe counts only, and tolerate an individual job failure.

## Daily view

Review Vercel structured logs for alert-classified events, recovery remaining/failed counts, cleanup failures, auth refresh failures, rate-limit events, share verification failures, and deletion events. Review Supabase Auth/database/API usage and provider usage grouped by model/workflow through the service-only `get_ai_usage_report` RPC. Never paste prompts, room content, tokens, or user identifiers into an incident record.

Review OpenAI usage limits/spend alerts and Supabase backup availability from their owner dashboards during the staffed operations review. Application quota evidence is available through `pnpm test:quota:acceptance`; it does not substitute for provider billing controls. Escalate immediately if the latest expected backup is absent or PITR/retention differs from the approved recovery target.

## Emergency AI shutdown

1. Set `AI_GENERATION_ENABLED=false` in the affected server environment and redeploy.
2. If deploy control is impaired, set `private.ai_quota_settings.generation_enabled=false` through an audited administrator connection.
3. Confirm a disposable generation receives `ai_disabled` and that no provider request occurs.
4. Confirm human chat, create/join, historical plans, shares, exports, and deletion remain available.
5. Re-enable only after provider usage and quota state reconcile.

Travel-provider work is not part of Phase 5B; keep `TRAVEL_PROVIDERS_ENABLED=false` until Phase 6A acceptance.

## Smoke sequence

Check `/api/health`; create and join a disposable room through CAPTCHA; send human chat; request a focused answer; build/review/generate a disposable plan; rotate/revoke a share; export personal data; run recovery; run cleanup dry-run; transfer host; delete the disposable room and confirm the share fails. Inspect logs and the client bundle for secrets.
