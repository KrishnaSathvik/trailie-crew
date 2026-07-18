# Phase 4C Production Readiness Audit

## Phase 5E addendum — July 17, 2026

Focused and Luna provider recovery now use at most two distinct durable attempts, one logical quota reservation, safe provider metadata, bounded Retry-After/next eligibility, validated-result staging, exactly-once application, and content-free operational metrics. The recovery endpoint returns HTTP 200 after a successful drain even when a job is safely deferred or exhausted; infrastructure failure alone is 500. Revision validation was not changed.

Local gates pass with 527 Vitest tests, 539 pgTAP assertions, 16 local Playwright scenarios, a production build, interruption exactly-once acceptance, and quota zero-call rejection. The earlier protected 429s were exhausted OpenAI project credits. After replenishment, minimal direct Terra and Luna calls returned HTTP 200; the controlled 503-recovery drill, complete protected Version 2 flow, and fresh-room repeatability subset passed.

The final clean protected deployment is `dpl_81bc4Db2Hp4UejzooFe2Ac9arxdT`. Recovery and all workflow backlogs are zero, the fault variable is absent, Vercel Authentication is enabled, and zero Vercel bypasses remain. Protected Preview is `accepted`. Production is still `not_ready` because the documented Turnstile, WAF/budget, scheduled recovery/external-alert, restore/RPO/RTO, and manual-accessibility controls remain; it was not deployed.

## Phase 5D addendum — July 16–17, 2026

Revision generation now uses an application-owned manifest, protected hashes, patch-first deterministic routing, and one scope-only repair. Local quality/security gates pass; prior protected evidence published the exact removal as Version 2 and an independent removal as Version 3. This does not change the production verdict: `not_ready`. The complete protected regression remains incomplete, and existing real Turnstile, WAF/budget, cron/external-alert, restore/RPO/RTO, and manual-accessibility blockers remain.

Audit date: 2026-07-14

Base commit: `8bafcdd` on `main`

Audit boundary: local repository and local Supabase only. No Vercel deployment, hosted Supabase project, production traffic, remote logs, backup, or restore operation was inspected.

## Executive assessment

Trailie Crew is suitable for a **bounded Vercel Preview after the Preview blockers below are cleared**. The application builds as a production Next.js 16 app, migrations reset cleanly on PostgreSQL 17.6, 380 pgTAP checks pass, schema lint/security advisors are clean, 318 unit/component assertions pass after the audit regression test, and all 11 local real-stack Chromium scenarios pass after correcting the fake travel-evidence clock.

It is **not ready for unrestricted production users**. The highest risks are absent durable recovery invocation, missing CAPTCHA and anonymous-account lifecycle, no hosted runtime/provider acceptance, no configured observability/alerts/budget caps, no verified backup/restore or rollback runbook, incomplete privacy/legal/deletion operations, and unmeasured scale. Local security evidence is strong but cannot substitute for hosted configuration review.

Severity means `critical`, `high`, `medium`, `low`, or `informational`. Owners are role assignments for the next phase, not evidence that work is scheduled.

## Production readiness matrix

| Area / item                                    | Current status and evidence                                                                                            | Risk                                                                                                                                            | Severity | Required action                                                                               | Preview blocker?                   | Production blocker? | Owner               | Verification method                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------- | ------------------- | ------------------------------------------- |
| Application architecture                       | Next.js App Router with server-only provider/repository boundaries; production build passes                            | Hosted behavior not exercised                                                                                                                   | Medium   | Deploy only after env review; run route-level acceptance                                      | Yes                                | Yes                 | App                 | Vercel Preview build and E2E                |
| Runtime duration                               | itinerary timeout is 180s; focused 30s, memory 20s, planning 45s                                                       | 180s model call plus validation/repair overhead may exceed the desired 180-second hosted compatibility target despite platform max being higher | High     | Measure full generate/repair requests; split durable work if acceptance exceeds target        | Yes                                | Yes                 | App/AI              | Hosted timing traces and interruption drill |
| Database migrations                            | all migrations apply from empty DB; PostgreSQL 17.6                                                                    | Hosted extensions/settings and migration time unverified                                                                                        | Medium   | Link non-production project, dry-run migration, record rollback/forward-fix                   | Yes                                | Yes                 | Database            | Preview project reset/migration checklist   |
| RLS and grants                                 | all 29 app tables have RLS; 12 private tables force RLS; 380 pgTAP pass                                                | Hosted Data API exposure settings may differ; current Supabase defaults no longer auto-expose tables                                            | Medium   | Review hosted API schemas/grants and rerun pgTAP remotely/non-production                      | Yes                                | Yes                 | Database/Security   | Hosted grants query + RLS tests             |
| `SECURITY DEFINER`                             | 113 app functions inspected; all have `search_path=""`; browser/service grants are narrow                              | Large privileged surface requires change control                                                                                                | Medium   | Add generated grant snapshot review to CI                                                     | No                                 | Yes                 | Database/Security   | Catalog diff and advisors                   |
| Authentication                                 | anonymous Supabase auth, SSR refresh, server `getUser` checks                                                          | CAPTCHA/session policy and hosted auth settings absent                                                                                          | High     | Configure CAPTCHA, anonymous limits, JWT/session policy, allowed origins                      | Yes                                | Yes                 | Security            | Abuse and session acceptance tests          |
| Authorization                                  | participant/user/room binding, host checks, RLS/RPC-only writes, spoofing tests                                        | Hosted configuration not verified                                                                                                               | Medium   | Rerun outsider/host/participant tests on Preview                                              | Yes                                | Yes                 | Security            | Hosted E2E and pgTAP                        |
| Focused AI reliability                         | strict schemas, idempotency, retry, safe errors, prior live pass                                                       | No hosted rate/timeout/error/cost observation                                                                                                   | High     | Run one bounded live Preview smoke and configure provider failure monitoring                  | Yes                                | Yes                 | AI/Operations       | Hosted smoke + log assertions               |
| Memory/planning/itinerary/revision reliability | leases, capped attempts, safe state machines, local tests                                                              | request-tail `after()` work can die without recovery                                                                                            | High     | Add durable scheduled recovery for every recoverable job type                                 | No, for supervised Preview         | Yes                 | App/Operations      | kill-process recovery drill                 |
| Recovery drain                                 | list/claim/drain RPCs and indexes exist; only planning exposes an aggregate recovery function                          | no cron/queue/secured route invokes full recovery set                                                                                           | High     | Implement authenticated cron/queue drain with idempotent bounded batches and alerts           | No, conditionally                  | Yes                 | App/Database        | forced stale jobs converge once             |
| AI rate limiting                               | focused invocation and selected share/export DB limits exist                                                           | no global/user daily token cap or OpenAI budget alert                                                                                           | High     | add per-user/room/global spend caps and alert thresholds                                      | Yes                                | Yes                 | AI/Operations       | quota tests and billing alert proof         |
| Cost control                                   | model routing and token accounting are private                                                                         | no dashboard, anomaly alert, or hard budget                                                                                                     | High     | configure OpenAI/Vercel spend budgets and an operational stop switch                          | Yes                                | Yes                 | Operations          | budget screenshot/config export + drill     |
| Optional providers                             | missing Mapbox becomes unavailable; fake rejected in production                                                        | live behavior and token restriction not verified                                                                                                | High     | run Mapbox smoke; restrict token; verify quota/timeout/failure copy                           | Yes if demo claims verified routes | Yes                 | App/Operations      | hosted smoke and provider console           |
| Performance                                    | pagination/caps, bounded schemas, evidence cache, concurrency slots                                                    | no benchmark/load test; performance advisor reports many unindexed FKs                                                                          | Medium   | index measured hot FKs; profile realistic rooms; set budgets                                  | No                                 | Yes                 | App/Database        | query plans and load test                   |
| Scalability                                    | one private Realtime channel/room/client; server actions/RPCs are bounded                                              | 50-participant/50k-message and concurrent-room behavior unknown                                                                                 | High     | run staged load/reconnect tests and document capacity                                         | No                                 | Yes                 | App/Operations      | load test with error/latency targets        |
| Public share abuse                             | opaque tokens, host-only rotation, 5/10m limit, fail-closed lookup                                                     | no edge/IP rate control or abuse reporting                                                                                                      | Medium   | add platform rate/firewall controls and report/revoke support path                            | No                                 | Yes                 | Security/Support    | abuse simulation                            |
| CAPTCHA                                        | not implemented                                                                                                        | automated anonymous account/room/spend abuse                                                                                                    | High     | enable supported CAPTCHA on anonymous sign-in/create/join                                     | Yes                                | Yes                 | Security            | automated bot-flow rejection                |
| Anonymous lifecycle                            | no cleanup or user-facing deletion                                                                                     | indefinite auth users/rooms/messages/private memory                                                                                             | High     | define retention; implement cleanup and safe export/delete workflow                           | No for test data Preview           | Yes                 | Product/Database    | lifecycle integration tests                 |
| Privacy boundary                               | forced-RLS private data; public allowlist/redaction tests                                                              | no formal privacy review, DPA inventory, or hosted log review                                                                                   | High     | data inventory, privacy review, adversarial redaction/log tests                               | Yes                                | Yes                 | Privacy/Security    | signed checklist and log sampling           |
| Logging                                        | AI logger has safe metadata allowlist; raw prompts/provider errors not persisted by design                             | no structured application-wide logging contract or production sink review                                                                       | High     | define event schema, request correlation, redaction, retention                                | Yes                                | Yes                 | Operations/Security | hosted log inspection                       |
| Error reporting                                | safe user error codes                                                                                                  | no error tracker, alert routing, or escalation policy                                                                                           | High     | configure server/client reporting with PII scrubbing                                          | Yes                                | Yes                 | Operations          | synthetic failure creates alert             |
| Observability                                  | semantic progress stored                                                                                               | no SLOs, dashboards, queue-age, failure-rate, latency, cost, auth-abuse metrics                                                                 | High     | create minimal Preview dashboard and alerts                                                   | Yes                                | Yes                 | Operations          | dashboard/alert test                        |
| Data retention                                 | no documented retention schedule                                                                                       | privacy/cost exposure                                                                                                                           | High     | set periods for auth users, chat, AI runs, evidence, shares, exports                          | No                                 | Yes                 | Product/Privacy     | policy plus cleanup dry run                 |
| User/room deletion                             | cascades exist but no authorized product operation                                                                     | users cannot exercise deletion; orphan/auth handling unspecified                                                                                | High     | implement and test account/room deletion and session invalidation                             | No                                 | Yes                 | Product/Database    | cross-table deletion test                   |
| Backup                                         | no hosted project inspected                                                                                            | data loss and no recovery objective                                                                                                             | High     | select plan/PITR, document RPO/RTO, verify backup status                                      | Yes                                | Yes                 | Database/Operations | restore to isolated project                 |
| Restore                                        | not tested                                                                                                             | backups may be unusable                                                                                                                         | High     | perform and time a full restore, then application smoke                                       | No                                 | Yes                 | Database/Operations | recorded restore drill                      |
| Deployment config                              | env schema/example exist; fake mode rejected in production                                                             | no Vercel project/env/runtime configuration reviewed; CLI is outdated                                                                           | High     | upgrade CLI, configure scoped envs, pin runtime, inspect deployment output                    | Yes                                | Yes                 | App/Operations      | Preview config export and build             |
| Rollback                                       | immutable data helps; no deployment/migration rollback runbook                                                         | application/database mismatch during rollback                                                                                                   | High     | document forward-fix vs rollback per migration; test prior app against migrated DB where safe | Yes                                | Yes                 | App/Database        | tabletop and non-prod drill                 |
| Dependency security                            | `pnpm audit --audit-level=moderate`: no known vulnerabilities                                                          | registry result is point-in-time; broad caret ranges exist for some packages                                                                    | Low      | retain lockfile, enable recurring dependency/secret scanning                                  | No                                 | No                  | Security            | CI audit and update policy                  |
| Secret handling                                | no tracked credential/private-key match; server-only modules; client bundle contains names/schema but no secret values | client imports the combined env schema, increasing disclosure and accidental-bundle risk                                                        | Medium   | split public and server env modules; scan exact built values on Preview                       | No                                 | Yes                 | App/Security        | bundle grep and source graph                |
| Route exposure                                 | build has only two API routes; no debug/admin/memory/test/token-inspection routes                                      | future accidental route exposure                                                                                                                | Low      | add route-manifest denylist check to CI                                                       | No                                 | No                  | App/Security        | manifest assertion                          |
| Accessibility                                  | semantic labels/headings, visible focus styles, mobile/keyboard/theme E2E                                              | incomplete focus trapping/restoration, live regions, contrast, screen reader, reduced motion, zoom review                                       | Medium   | run axe plus manual keyboard/screen-reader/contrast/print checklist                           | Yes                                | Yes                 | Design/QA           | recorded WCAG acceptance                    |
| Legal/product disclosures                      | no booking disclaimer in exported/public itinerary                                                                     | no privacy policy, terms, availability/accuracy policy, support/abuse route                                                                     | High     | publish reviewed privacy/terms/accuracy/availability disclosures                              | No for private team Preview        | Yes                 | Product/Legal       | link/copy acceptance                        |
| Support operations                             | no incident, abuse, deletion, or provider-outage runbook                                                               | failures have no owner or response path                                                                                                         | High     | define contacts, severity, disable switches, user messaging, incident log                     | No                                 | Yes                 | Support/Operations  | tabletop exercise                           |
| Documentation                                  | implementation docs are detailed; stale README/checklist corrected in audit                                            | reports can drift again                                                                                                                         | Low      | treat audit matrices as release gates and update after Preview                                | No                                 | No                  | Product/Engineering | release review                              |

## Preview blockers

These block safe hosted acceptance testing, not merely public launch:

1. Upgrade Vercel CLI from `56.1.0` to the current release before configuration.
2. Create a non-production Vercel project and hosted Supabase project; review environment scoping and ensure no secret uses `NEXT_PUBLIC_*`.
3. Apply migrations to the non-production database, inspect Data API exposure/grants/RLS/advisors, and run hosted create/join/outsider tests.
4. Configure CAPTCHA or an equivalent bounded-access control before exposing anonymous create/join beyond the team. For a private, access-controlled Preview, this may be a documented condition rather than a code blocker.
5. Configure minimum structured logs, error reporting, OpenAI spend/rate alerts, and a human owner for Preview failures.
6. Verify Vercel request duration for focused, planning, itinerary repair, and revision flows; specifically measure the 180-second itinerary boundary.
7. Run one live Mapbox smoke if the Preview/demo will show routes as verified; otherwise keep provider data explicitly unavailable.
8. Verify backup status and document migration/rollback handling before writing representative hosted data.
9. Run hosted accessibility acceptance for keyboard, dialogs, progress/stream announcements, contrast, zoom, mobile share, and print.
10. Review Preview copy so it makes no production, booking, availability, comprehensive validation, or live-provider claim.

## Production blockers

In addition to all unresolved Preview blockers:

1. Durable cron/queue recovery and alerting for memory, planning, itinerary, revision generation, and revision publication.
2. CAPTCHA, IP/platform abuse controls, global/user/room OpenAI quotas, hard budget caps, anomaly alerts, and an emergency disable switch.
3. Anonymous-user/room retention, cleanup, data export, account deletion, room deletion, session invalidation, and deletion audit evidence.
4. Production privacy/log review, privacy policy, terms, accuracy/availability/no-booking disclosures, and abuse/support contact paths.
5. Hosted backup plus successful isolated restore; documented RPO/RTO and forward-fix/rollback runbook.
6. Production observability: structured redacted logs, error reporting, latency/failure/queue-age/cost/auth-abuse dashboards, paging thresholds, and incident runbook.
7. Live provider accuracy/failure verification and explicit UX for verified, estimated, user-supplied, suggested, stale, unavailable, and unknown data.
8. Accessibility conformance review and remediation.
9. Measured performance/capacity targets, database index/query-plan review, and concurrency/load acceptance.
10. Hosted end-to-end testing across the complete flow, public cache/revocation checks, and at least the supported browser matrix.

## Production route and bundle audit

Fresh `next build` produced only:

- pages: `/`, `/join`, `/join/[inviteValue]`, `/trips/create`, `/trips/[roomId]`, `/share/[token]`, `/trips/[roomId]/plans/[version]/print`
- APIs: `/api/trailie/invoke`, `/api/trips/[roomId]/plans/[version]/calendar`
- metadata/static: `/_not-found`, `/icon.svg`, `/robots.txt`, `/sitemap.xml`

No production route exists for test inspection, fake-provider control, recovery debug, database administration, token testing, raw prompts, or private memory. Fake scenarios are server environment switches used by local/E2E startup; production env parsing rejects the fake AI provider.

A tracked-source scan found no real OpenAI, Supabase secret/service-role, Mapbox, HMAC, recovery, or private-key value. The client bundle does include the literal server variable names and Zod rules because `src/lib/env.ts` combines public and server schemas and a public import reaches the bundle. It does **not** include the corresponding secret values. Splitting public/server env modules is recommended hardening and exact deployed values must be scanned after Preview build.

## Database audit

- Local PostgreSQL is 17.6; this avoids the ended PostgreSQL 14 support boundary.
- Every app table in `public` and `private` has RLS; every private table uses forced RLS.
- All inspected app functions have an empty `search_path`; browser/service execution grants match the intended wrapper/RPC split in the catalog and pgTAP suite.
- Security advisors report no issues and schema lint reports no warning/error.
- Published plans, ready candidates, planning summaries, and analyses have immutability triggers; share/export rows are version-pinned and plan hashes protect drift.
- Foreign keys and delete behavior are mostly restrictive for published/versioned artifacts and cascading for room-owned data. There is no user-facing deletion orchestration or restore evidence.
- Idempotency/uniqueness exists for client message IDs, active invocations/runs, planning/version rows, evidence cache identity, revision requests/candidates, shares, and validation attempts.
- Recovery indexes exist for message extractions, planning requests, trip plans, and change requests.
- Performance advisors report many unindexed FKs across private AI/memory/run tables and public message/planning/revision/share tables. These are informational locally but must be query-plan reviewed before scale claims.
- No views are present in the inspected application schemas, avoiding a view/RLS bypass class. Hosted Data API schema exposure remains unverified.

## Performance risk assessment

No benchmark result is claimed.

| Envelope                          | Expected behavior from code                           | Primary risk                                                                                            | Readiness                                  |
| --------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 2 participants / 100 messages     | 30-message pages, one channel/client, bounded context | low local risk; covered near this scale                                                                 | Preview-suitable                           |
| 10 participants / 5,000 messages  | cursor reads remain bounded; presence fan-out grows   | Realtime churn, planning context selection, unindexed FK maintenance                                    | Must measure before production             |
| 50 participants / 50,000 messages | DB page size still bounded                            | presence/typing fan-out, approval UX, connection counts, pagination latency, context representativeness | Unsupported/unmeasured                     |
| 30-day itinerary                  | schema caps 60 days and 40 items/segments/day         | rendering size, O(days × items/evidence) validation/enrichment, print pagination, model tokens          | Unit-bounded but unmeasured                |
| Multiple versions                 | exact-version queries and immutable rows              | storage growth, compare/diff CPU, evidence duplication, history UI                                      | Locally functional; retention/scale absent |
| Concurrent rooms                  | per-process worker slot limits only                   | no distributed queue/backpressure; provider/database concurrency and spend                              | Production blocker                         |

## Accessibility audit

Verified from source/tests: semantic page headings, form labels, named navs, reaction/send/theme controls, focus-visible styles, mobile keyboard entry flow, 390×844 overflow checks, both themes, public/print semantic rendering, and text-based React output. The native button/textarea controls preserve zoom and keyboard basics.

Manual/automation gaps:

- mobile People and revision/share dialogs do not demonstrate focus trapping, initial focus, Escape dismissal, or focus restoration;
- streaming Trailie output, typing state, itinerary progress, and Realtime updates do not have a comprehensively tested `aria-live`/status strategy;
- color contrast was not measured, and dark-mode contrast was only visually exercised;
- reduced-motion behavior is not explicitly implemented/tested;
- 200%/400% zoom, screen-reader reading order/labels, touch targets across every view, long itinerary mobile rendering, public share, and print/PDF output need manual review;
- axe or another automated WCAG scanner is not installed in the repository.

## Documentation consistency changes

The audit corrected the README's present-tense Phase 2A claim that planning/itinerary functionality was unavailable and its stale statement that the memory live smoke had not run. The submission checklist was reconciled with fresh Phase 4B/local verification while preserving live-provider, deployment, durable recovery, and intentionally deferred items as incomplete. The audit does not convert prior credentialed evidence into a fresh live result.

## Test coverage and verification record

| Command                                                  | Result                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                                      | pass                                                                                                             |
| `pnpm lint`                                              | pass                                                                                                             |
| `pnpm typecheck`                                         | pass                                                                                                             |
| `pnpm test`                                              | pass: 68 files / 318 tests                                                                                       |
| `pnpm build:local`                                       | pass; production route manifest reviewed                                                                         |
| `HOME=/tmp/trailie-supabase pnpm exec supabase db reset` | pass; all 10 migrations apply                                                                                    |
| `HOME=/tmp/trailie-supabase pnpm exec supabase test db`  | pass: 10 files / 380 tests                                                                                       |
| database lint                                            | pass: no schema errors                                                                                           |
| security advisors                                        | pass: no issues                                                                                                  |
| performance advisors                                     | pass command; informational unindexed-FK/unused-index findings recorded                                          |
| initial `pnpm test:e2e`                                  | 8 pass / 3 fail because fixed fake evidence had expired; root cause recorded                                     |
| targeted affected E2E after fix                          | pass: 3 / 3                                                                                                      |
| final full `pnpm test:e2e`                               | pass: 11 / 11 Chromium scenarios in 2.0 minutes                                                                  |
| OpenAI smokes                                            | unavailable: key absent; focused/itinerary/revision explicitly skipped, memory/planning exited 2 for missing key |
| travel-tools smoke                                       | skipped: Mapbox key absent                                                                                       |
| share/PDF/calendar smokes                                | pass: 23 / 5 / 6 assertions                                                                                      |
| `pnpm audit --audit-level=moderate`                      | pass: no known vulnerabilities                                                                                   |
| tracked secret/private-key scan                          | no real credential found; test/example placeholders only                                                         |
| client bundle scan                                       | env names/schema present; no secret value found                                                                  |
| `git diff --check`                                       | pass                                                                                                             |

## Fix made during the audit

The deterministic fake travel provider defaulted evidence retrieval to `2026-07-13T18:00:00Z`. Once the audit clock passed its 24-hour expiry, the real validator correctly blocked itinerary generation, revision, and sharing E2E flows as stale. A regression test was added first and observed failing; the provider now uses the current clock when `now` is omitted while retaining explicit deterministic timestamps for unit fixtures. The regression and all three affected E2E scenarios pass.

## Files changed and final worktree

Product/test correction:

- `packages/travel-tools/src/index.ts`
- `packages/travel-tools/src/index.test.ts`

Documentation correction and audit output:

- `README.md`
- `docs/build-week/submission-checklist.md`
- `docs/build-week/feature-completeness-audit.md`
- `docs/build-week/accuracy-audit.md`
- `docs/build-week/production-readiness-audit.md`
- `docs/superpowers/plans/2026-07-14-phase-4c-product-audit.md`

Final `git status --short --branch` is clean relative to the starting branch except for those eight intended, uncommitted files: four modified and four untracked. The tracked diff stat is 4 files changed, 27 insertions, and 8 deletions. The four new reports/plan contain 492 lines. No commit, push, or deployment was performed.

## Final verdicts

1. **Feature completeness: `complete_for_current_scope`.** All intended Build Week Phase 4B user workflows are connected and locally tested; explicitly deferred modes and production operations are excluded.
2. **Local product quality: `pass`.** Formatting, lint, typecheck, production build, 318 unit/component assertions, 380 pgTAP assertions, schema/security checks, and all 11 real-stack Chromium scenarios pass. This is local evidence only; live provider and hosted quality are covered by the next verdicts.
3. **Vercel Preview readiness: `ready_with_conditions`.** Proceed only after the Preview blocker list is addressed in a non-production environment; do not expose an unrestricted anonymous Preview.
4. **Production readiness: `not_ready`.** Durable recovery, abuse/cost controls, lifecycle/privacy/legal operations, observability, backup/restore, accessibility, load, and hosted/live acceptance are blocking.

## Phase 5B remediation update — July 14, 2026

Implemented locally: officially supported Turnstile/Supabase Auth CAPTCHA boundary; non-bypassable receipt-protected create/join RPCs; transactionally reserved user/room/global/model AI token and invocation limits; environment/database AI disable; scheduled recovery and cleanup configuration with leases; conservative anonymous cleanup; locked host transfer; room/account deletion; personal export; structured redacted logs; health signal; trust pages; accessible lifecycle UI; and Production runbooks.

The following are no longer code-absence blockers but still require final hosted evidence: real CAPTCHA configuration, disposable share-revoking room deletion, account/session deletion, cleanup dry-run/destructive synthetic case, AI-disable no-provider proof, cron manual invocation, log redaction/alert signal, and selected axe/manual accessibility flows.

Production remains `not_ready`. Blocking external/manual work: platform/WAF abuse configuration; named alert/incident owners and delivered Vercel/Supabase/OpenAI alerts; provider-level monetary cap evidence; selected paid Supabase Production backup/PITR plan and isolated restore drill with approved RPO/RTO; professional legal/privacy/support review; private security-reporting path; full manual VoiceOver/zoom/contrast record; and limited-public load/abuse acceptance. Local dumps and token budgets are not described as automatic backups or hard monetary caps.

## Phase 5A release update

The dedicated protected custom Preview environment and non-production hosted Supabase project completed controlled acceptance. Cleared Preview blockers include hosted migrations/RLS/grants, scoped environment configuration, server/client env separation, structured redacted logs, real hosted OpenAI/Realtime workflow verification, explicit runtime ceilings, manual protected recovery, public header/cache behavior, and historical sharing/exports. Local final gates are 333 unit/component assertions, 391 pgTAP assertions, and 12 passing Playwright scenarios with the hosted-only spec skipped locally.

The Preview verdict is **`ready_with_conditions`**: Vercel Authentication must remain enabled; CAPTCHA and unrestricted anonymous exposure are not accepted; Mapbox remains unavailable; OpenAI usage-alert ownership is not independently verified; recovery is manual; Supabase Free has no automatic backup/PITR; and the full manual accessibility matrix is incomplete. Production remains **`not_ready`** and was not deployed.

## Phase 5C audit addendum — July 16, 2026

The Phase 5C exact local gate passes: formatting, lint, typecheck, production build, 98 unit/component files with 436 tests, 13 pgTAP files with 472 assertions, 16 local Playwright scenarios, dependency audit, route/client-secret scans, database lint/advisors, interruption/quota harnesses, and a bounded local load exercise. The linked database has no error-level advisor finding; its documented warnings remain review items rather than silently cleared controls.

The protected hosted regression did not pass. Real providers reached validated Version 1 and an approved revision candidate attempt, but deterministic scope validation rejected that candidate with `change_scope_exceeded`. No Version 2 was published. Real Turnstile, WAF/bot controls, external alert receipt, provider monetary budget evidence, isolated restore/RPO/RTO, and the manual accessibility matrix remain blocked.

Updated independent verdicts: feature completeness `complete_for_phase_5c_implementation`; local product quality `pass`; protected Preview `not_accepted_for_release`; Production `not_ready`. See the [complete 23-gate Phase 5C report](./phase-5c-provider-infrastructure.md).

## Phase 5D audit addendum — July 17, 2026

Revision scope reliability is `conditional_pass`: application-owned manifests, protected snapshots, validated patches, deterministic narrow routing, preservation hashes, top-level classification, canonical diffs, and one scope-only repair now prevent the full-plan drift observed in Phase 5C without weakening `change_scope_exceeded`. Prior protected runs published exact removal Version 2 and independent removal Version 3 while preserving Version 1.

The latest complete regression worktree deployed Ready as `dpl_52TpJwK7aReq9CzZJgPJHkwC8pMP` only to the Vercel-Authentication-protected `hosted-acceptance` target, then stopped at a focused-answer prerequisite when bounded recovery returned HTTP 503. A prior independent credentialed harness returned HTTP 429 for all 15 operations. This is not accepted as a successful full rerun. The failed disposable room and temporary environment file were deleted, bypass count is zero, linked migrations match local, and revision/publication/provider recovery backlogs are zero. Protected Preview remains `not_accepted_for_release`; Production remains `not_ready` and was not deployed.

## Phase 6A audit addendum — July 17, 2026

The implementation adds strict normalized travel evidence, selected official-provider adapters, provider-aware caching and budgets, forced-RLS evidence/operation/snapshot storage, exact-version source projections, and deterministic live-evidence validation without weakening Phase 5 controls. OpenWeather One Call 3.0 entitlement is a current external blocker, and RIDB live inventory/availability plus a stable TrailVerse service are intentionally not claimed. Production readiness cannot advance until all local gates and a protected hosted-acceptance flow pass with those limitations represented honestly.
