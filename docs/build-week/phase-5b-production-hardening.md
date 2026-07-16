# Phase 5B — Production hardening

Date: July 14–15, 2026. Base: `90e8296`, `main`. Production was not deployed.

## Implemented locally

- Cloudflare Turnstile/Supabase Auth CAPTCHA boundary with accessible widget states, deterministic non-Production adapter, server verification, short-lived single-use database receipts, and protected create/join RPCs. Original workflows are no longer executable by browser or service roles.
- Layered authenticated workflow limits plus transactional per-user, per-room, global, token, invocation, workflow, and configurable model quota reservations. Allowance is reserved before provider calls, reconciled to actual use, and released on failure. Environment and database emergency switches fail before provider traffic.
- Vercel Cron configuration for bounded recovery every 10 minutes and anonymous cleanup daily. Both are bearer-protected, leased, idempotent/overlap-safe, and log safe counts; Vercel runs these schedules only in Production, so protected Preview verification is manual.
- Host transfer and exact-name host-only room deletion with row locks, cascade removal, invite/share invalidation, content-free audit events, and idempotent repeats.
- Account assessment/deletion preparation, hosted-room blocking, membership de-identification, private-memory removal, global refresh-session revocation, trusted Auth soft deletion, and local sign-out.
- Conservative anonymous cleanup with retention, dry-run, bounded batch, leases, recoverable-job/active-room/share exclusions, retryable failures, and content-free outcomes.
- Version 1 personal-data JSON export restricted to the authenticated participant’s profile/memberships/messages/actions and published plan versions accessible under RLS.
- Structured redacted logs with correlation IDs and alert classification; safe recovery/cleanup/share/deletion/quota dimensions; a minimal non-infrastructure health route; service-only usage reporting by model/workflow.
- Draft `/privacy`, `/terms`, `/accuracy`, `/support`, account `/settings`, trust links, no-booking/accuracy disclosures, accessible destructive UI, CAPTCHA retry/expiry status, and mobile People-dialog focus/Escape/restoration.
- Production deployment, environment, operations, incident, backup, retention, deletion, accessibility, and security runbooks.

## Configuration state

Local development and E2E use the deterministic CAPTCHA adapter through the local Supabase wrapper. Protected Preview must either configure real Turnstile plus hosted Supabase Auth CAPTCHA or use the controlled equivalent only in a non-Production acceptance environment. Production test mode is rejected by server configuration.

The accepted hosted Supabase project is on the Free plan. It does not establish the selected Production plan, automatic backup/PITR, retention, or a restore drill. Existing local dumps are not counted as Production backups.

## Security boundaries

Private CAPTCHA, quota, lifecycle, and deletion tables force RLS and grant no browser access. Service-only mutation/report RPCs have empty `search_path`; destructive account administration remains server-only. Room deletion relies on reviewed `ON DELETE CASCADE` room ownership and explicitly deletes public shares before the room row. Short-lived access JWTs can remain cryptographically valid after global sign-out, but active membership is removed and trusted routes revalidate Auth, so private RLS access fails.

## Evidence

Phase-specific pgTAP: 46 assertions pass. The fresh local gate passes 12 database files / 437 assertions, 85 unit/component files / 371 tests, and 16 local E2E scenarios with the protected-hosted scenario skipped by design. Formatting, lint, TypeScript, optimized build, schema lint, security/performance advisor invocation, diff/secret/client-bundle scans, and the supported npm production dependency audit also pass.

Commit `e997af4` is pushed to `origin/main`. Its migration is applied to the linked Preview Supabase project and the matching application is deployed only to protected custom Preview as `dpl_8c8GsghofQDoM5fueDZy5nsRmBN9`. The focused hosted Phase 5B drill passes four disposable lifecycle/security scenarios plus trust/health route smokes. The temporary automation bypass was revoked and the deployment again returns the Vercel SSO redirect to unauthenticated requests.

## Remaining Production blockers

- Real hosted Turnstile/Supabase Auth CAPTCHA acceptance on the final public domain.
- Platform/WAF IP-derived abuse limits with reviewed hashing/retention; no raw-IP mechanism was added in application storage.
- Named log/incident/alert owners, tested Vercel/Supabase/OpenAI alert delivery, and a verified provider-side monetary cap. Application token limits are not represented as a hard currency cap.
- Selected paid Supabase Production plan, automatic backup/PITR evidence, isolated restore drill, and approved RPO/RTO.
- Professional privacy/terms/support review and private security-reporting channel.
- Complete dated VoiceOver, 200%/400% zoom, contrast, and assistive-technology acceptance.
- Limited-public load/abuse exercise and real-provider reliability acceptance; the focused protected-Preview lifecycle/controlled-CAPTCHA drill passes, but real Turnstile on a final public domain remains unverified.

Verdict remains **not Production ready** until these external and manual requirements are cleared. The implementation materially reduces the blocker set but does not justify unrestricted public access.

## Phase 5C reliability addendum — July 16, 2026

Phase 5C closes the code-level durable provider/retry/recovery, quota replay, bounded-load, and safe-alert gaps described above. The exact local release gates pass. External alert delivery, OpenAI monetary-budget evidence, real Turnstile, Vercel WAF/bot controls, isolated backup restore, and manual accessibility remain blocked.

The protected real-provider regression reached a feasible two-person-approved removal revision, but candidate validation rejected the generated result as `change_scope_exceeded`; no Version 2 published. This preserves the fail-closed contract but means protected Preview is not accepted for release. See [Phase 5C provider infrastructure](./phase-5c-provider-infrastructure.md).
