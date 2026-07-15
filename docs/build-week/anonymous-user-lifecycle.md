# Anonymous user lifecycle

Supabase anonymous identities use the authenticated role, so CAPTCHA never replaces RLS or RPC authorization.

Phase 5B implements a scheduled-capable cleanup route with dry-run default for manual POSTs, an explicit retention threshold (30-day default), a batch cap, a distributed lease, soft Auth deletion, retryable failure records, and safe audit counts. A candidate must be anonymous, older than retention, and have no active membership, active hosted room, active share-management obligation, queued/running focused invocation, active planning generation, recoverable itinerary work, or active revision work. Tests prove inactive eligibility and active-room exclusion.

Room deletion is host-only and cascade-reviewed. Account deletion blocks any active host, removes participant-attributed private memory, de-identifies memberships, revokes refresh sessions, soft-deletes Auth through a trusted server client, and signs out locally. A personal export is offered first. Existing room history is retained only in de-attributed shared form.

Production cleanup is configured separately from recovery in `vercel.json`. Vercel Cron runs only on Production deployments; protected Preview uses an authorized manual dry-run and disposable destructive drill. The hosted Free Preview does not provide a Production restore guarantee, so destructive Production scheduling remains blocked until the paid plan, backup/PITR, restore drill, retention policy, and alert owner are approved. See [`../production/data-retention.md`](../production/data-retention.md) and [`../production/deletion-runbook.md`](../production/deletion-runbook.md).
