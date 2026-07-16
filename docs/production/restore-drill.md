# Hosted backup and restore drill

Status on July 16, 2026: **blocked; restore not initiated**.

## Source inventory

- Supabase project: `trailie-crew`, healthy, `us-east-1`.
- Physical/WAL backup infrastructure: enabled according to `supabase backups list`.
- Available physical backup entries: none reported.
- PITR: disabled.
- Isolated restore target: unavailable. The account lists no dedicated Trailie restore/staging project.
- Measured RPO/RTO: unavailable because no supported recovery point and target were available.

An in-place restore was not attempted because it would interrupt the only active Trailie database. A restore-to-new-project was not initiated because Supabase requires a paid plan with physical backups, creates a billable project, and the CLI reported no available backup entry to select.

## Required drill

1. Confirm a physical backup or PITR recovery point exists and record its timestamp without private data.
2. Obtain cost approval and create a protected, isolated restore target in the same region. Disable AI, cron, `pg_net`, wrappers, and other outbound operations immediately after restoration.
3. Time provisioning and database recovery separately from application validation.
4. Verify migration history, schema, selected aggregate row counts, indexes, extensions, RLS/forced RLS, function grants, service-only access, and Realtime publications/policies.
5. Configure new project API keys and Auth/Realtime settings. A database clone carries Auth records, but project Auth settings and API keys are not copied; unique project JWT signing configuration may invalidate existing sessions.
6. Confirm Storage objects/settings, Edge Functions, read replicas, and external integration settings separately because database restore does not recreate them.
7. Connect a protected application deployment and run minimal disposable create/join/chat/plan-read checks with providers disabled.
8. Record observed RPO and RTO, discrepancies, owner decision, and teardown. Delete the temporary project only after evidence review and cost confirmation.

Official references: [Database backups](https://supabase.com/docs/guides/platform/backups) and [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project).
