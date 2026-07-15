# Anonymous User Lifecycle Strategy

Supabase anonymous identities use the authenticated database role, so application RLS and RPC authorization remain mandatory. Automatic anonymous-user cleanup is not currently available as a complete Trailie operation; destructive execution is intentionally deferred.

## Eligibility proposal

An anonymous Auth user becomes a cleanup candidate only when all are true:

- the account is at least 30 days old;
- it has no active participant membership in an active Trip;
- it is not the host of an active room;
- it has no recent message, planning, itinerary, revision, share-management, or recovery activity;
- all associated jobs are completed, skipped, or terminally failed;
- the candidate was reported by a dry run at least once before deletion.

The age threshold is a proposed production default, not an active policy. Preview acceptance uses representative disposable identities and performs no destructive cleanup.

## Relationship and cascade review

Before implementation, verify Auth user references across participants, rooms, messages, private AI invocations/runs, memory facts/snapshots, planning records, immutable plans, revision records, and share audit data. Active rooms must be protected. Published immutable plans and audit history must not be silently corrupted. Existing foreign-key delete actions require an explicit catalog review and a representative restore-capable test before any cleanup job can delete users.

## Required cleanup tool

The production tool should support:

- dry-run-only default behavior;
- account-age and last-activity cutoffs;
- active-room/host protection;
- bounded batches, idempotency, and attempt caps;
- privacy-safe audit counts plus internal candidate identifiers;
- a separate confirmation step for destructive execution;
- a durable schedule, alerts, and a pause switch;
- tests for chat, memory, plan, share, and Auth cascade outcomes;
- documented backup/restore prerequisites.

## Preview behavior and remaining work

No anonymous users are deleted during Phase 5A. The controlled Preview is team-only, contains no production customer data, and may be reset or retired as a whole after acceptance. Production still requires an implemented dry-run report, reviewed cascade policy, user/room deletion product, retention disclosure, durable schedule, and restore drill.
