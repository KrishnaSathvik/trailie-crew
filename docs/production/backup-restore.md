# Backup and restore

Status: Production blocker until verified on the selected hosted Supabase plan.

Supabase capabilities and retention depend on the hosted plan and enabled add-ons. Local `db dump` or `db reset` evidence is not an automatic backup and must not be represented as one. The intended Production project must enable and verify the plan’s automatic backup or PITR capability before launch.

## Required decision record

- Selected hosted plan and region: unselected.
- Automatic backup/PITR mode and retention: unverified.
- Target RPO and RTO: owner must approve after plan selection and a timed drill.
- Restore isolation project and drill date: not yet completed.

## Migration and restore procedure

1. Preserve the exact application commit and migration set associated with the recovery point.
2. Restore or clone into an isolated non-Production project using the hosted plan’s supported mechanism.
3. Apply only migrations newer than the recovery point; never rewrite applied migrations.
4. Configure isolated server credentials and keep outbound providers/AI disabled.
5. Run schema tests, RLS/security checks, a create/join/chat/plan/share smoke, and row-count sanity checks without private-content logging.
6. Measure restore plus application validation time. Record achieved RPO/RTO and discrepancies.
7. Promote only through a reviewed provider-supported process; otherwise forward-fix Production.

Application rollback is permitted only when the prior build is compatible with the current schema. Prefer additive migrations and forward fixes.
