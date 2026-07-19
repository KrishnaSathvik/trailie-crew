# Phase 5A Preview Acceptance

> Phase 5E reacceptance update (July 17, 2026): bounded focused and Luna recovery passed direct probes, controlled first-call 503 drills, one complete protected Version 2 flow, and a fresh-room repeatability subset. Revision validation remained unchanged. Protected Preview is `accepted`; Production remains undeployed and `not_ready`.

Status: **Preview ready with controlled conditions. Production was not deployed.**

## Baseline and hosted configuration

- Phase 4C baseline: commit `3561309`, pushed to `origin/main` before deployment.
- Vercel CLI: `56.2.0`; project `trailie-crew-preview`; custom environment `hosted-acceptance` (Preview type); Git integration, custom Production domain, and Production variables absent.
- Protected Preview alias: `https://trailie-crew-preview-shadowdevil-shadowdevils-projects-ae938de8.vercel.app`.
- Current accepted deployment: `dpl_8nPBUSYFajvGxPoY2AXYGnhRcyUx` (`trailie-crew-preview-nqhcstbvs-shadowdevils-projects-ae938de8.vercel.app`); Next.js 16.2.10, Node 24.x, pnpm 10.15.1, `iad1`, Node functions, 60/300-second explicit route ceilings.
- Hosted Supabase: project `tkccksmiuucdstvvfglp`, Free plan, `us-east-1`, PostgreSQL `17.6.1.141`; anonymous Auth enabled for this protected Preview; all 11 migrations applied in order.
- Vercel Authentication remains enabled. CAPTCHA is not configured, so the URL is team-only and must not be publicly circulated.
- The temporary acceptance-automation bypass was revoked and its local Keychain entry deleted after the final deployment; an unauthenticated header check returns the Vercel SSO redirect with `no-store` and `x-robots-tag: noindex`.
- Mapbox is intentionally absent. No fake travel provider is enabled; route/coordinate evidence remains explicitly unavailable rather than verified.

## Hosted database acceptance

Hosted catalog checks found 30 application tables with RLS, forced RLS on all private tables, 25 enums, 21 triggers, empty `SECURITY DEFINER` search paths, and the expected private Realtime send/receive policies. Browser roles cannot read private AI, memory, validation, share-token, or recovery tables. Three narrow authenticated private helpers remain executable because Realtime authorization policies call them.

The Supabase Free plan provides no automatic project backup/PITR. Before representative data, manual schema and data dumps were created under ignored `output/phase-5a/backups/`, with recorded SHA-256 hashes. Automatic backup, restore testing, and supported RPO/RTO remain production blockers.

## Hosted acceptance scenario

The accepted disposable two-user room completed the product path in bounded slices after each discovered defect was fixed and redeployed:

1. anonymous create/join, private Realtime messages, reply, reaction, presence, typing, reconnect, and Trailie silence;
2. one focused Terra response streamed and persisted;
3. Luna extracted a preference and superseded its correction;
4. Sol produced one planning summary; both active participants approved it;
5. Sol generated and repaired Version 1; deterministic validation passed and publication was atomic;
6. Terra analyzed one precise, feasible revision; both participants approved it;
7. Sol generated a bounded candidate; both participants confirmed and immutable Version 2 published;
8. the host shared historical Version 1; signed-out rendering remained pinned and private names were redacted;
9. historical Version 1 ICS and print/Save-as-PDF view passed; revocation immediately removed public access; Version 2 remained current after refresh;
10. protected recovery rejected missing/wrong secrets, returned safe zero counts for a correct no-work drill, and rate-limited an immediate duplicate.

An ambiguous request against an unscheduled arrival correctly produced a blocked analysis and was not published. The acceptance selector was corrected to target a timed kayaking activity. Two later repeated identical requests against already-shortened Version 2 also blocked safely and produced no candidate.

## Runtime and model evidence

| Workflow             | Model           | Observed hosted result                                                  |
| -------------------- | --------------- | ----------------------------------------------------------------------- |
| focused answer       | `gpt-5.6-terra` | completed; 2.125s provider latency; 480 tokens                          |
| memory               | `gpt-5.6-luna`  | 7 completed extractions; 1.121–3.878s; aggregate usage stored privately |
| planning             | `gpt-5.6-sol`   | completed in 46.671s; 4,633 tokens                                      |
| itinerary generation | `gpt-5.6-sol`   | completed in 160.316s; 10,931 tokens                                    |
| itinerary repair     | `gpt-5.6-sol`   | completed in 80.633s; 15,054 tokens                                     |
| revision analysis    | `gpt-5.6-terra` | successful analysis completed in 12.050s; 6,759 tokens                  |
| revision candidate   | `gpt-5.6-sol`   | completed in 60.674s; 15,498 tokens                                     |

The initial 45-second planning deadline produced two measured 45.07-second aborts and was corrected to 90 seconds; abort deadlines are now classified as `model_timeout`. All accepted calls remained below their explicit function/workflow ceilings. Provider latency fields for itinerary/revision currently record zero even though run timestamps are correct; metric fidelity remains an observability limitation.

## Accuracy and correctness fixes found in Preview

- hosted Supabase's current `sb_secret_` key returned 401 for required server table/admin operations; Preview now uses the hosted legacy service-role JWT while the public client retains the publishable key;
- absent Mapbox evidence no longer makes a plan permanently unpublishable: missing coordinates/routes remain medium unverified warnings, while genuine overlaps/duplicates still trigger one deterministic repair;
- required public share headings removed by traveler-name redaction receive generic privacy-safe labels instead of making a valid share appear unavailable;
- planning abort deadlines map to `model_timeout`, and the measured-safe Preview deadline is 90 seconds;
- the hosted revision test targets a scheduled item with an unambiguous scope.

## Final hosted invariants

- one focused invocation, one distinct source, one final persisted Trailie response;
- 9 active memory facts, 1 superseded fact, 7 completed extractions;
- planning summary Version 1 approved by both required participants;
- immutable published plan Versions 1 and 2, both validation `pass`, both hashes present, `current_plan_version=2`;
- successful revision has 2 approvals and 2 confirmations; blocked analyses have no candidate;
- two rotated Version 1 share records are revoked, zero active shares, no Version 2 share;
- zero eligible recoverable jobs after the drill.

## Verification summary

- formatting, lint, TypeScript, 333 unit/component assertions, production build, and `git diff --check`: pass;
- local database reset, 391 pgTAP assertions, schema lint, and security advisor: pass;
- performance advisor: informational unindexed-FK/unused-index findings remain documented, with no error-level finding;
- `pnpm audit --prod --audit-level=moderate`: inconclusive because the configured npm audit endpoint returned HTTP 410 (retired endpoint); this is not recorded as a clean dependency audit;
- local Playwright: 12 passed, hosted-only spec skipped; selected axe pages report no serious/critical findings;
- hosted Realtime, OpenAI, public headers/cache, sharing, calendar, print, recovery, and invariant checks: pass in the controlled scenario;
- Mapbox live smoke, CAPTCHA, provider budget/alert console proof, automated Preview cron, automatic backup/restore, and full manual accessibility matrix: not completed.

## Verdict

**Preview ready with controlled conditions.** Keep Vercel Authentication enabled, do not circulate the URL publicly, preserve unavailable Mapbox labels, and retain a human operator for logs/recovery. This phase does not establish unrestricted Preview safety or production readiness.

## Phase 5B change notice

The acceptance above applies to the Phase 5A deployment and room, not automatically to the Phase 5B worktree. Phase 5B adds CAPTCHA-protected create/join, AI quotas/circuit breakers, cron configuration, lifecycle deletion/export, cleanup, trust pages, and accessibility changes. The accepted room must not be used for destructive tests.

Vercel Authentication must remain enabled. Vercel Cron does not run on Preview, so recovery and cleanup are invoked manually with protected secrets there. A controlled deterministic CAPTCHA adapter may be used only in the dedicated Preview acceptance environment; Production rejects it. Real public access still requires hosted Turnstile plus Supabase Auth configuration.

## Phase 5B protected-Preview drill

Phase 5B application commit `e997af4` was pushed to `origin/main`; migration `20260715032400_phase_5b_production_hardening.sql` was applied to hosted Supabase, bringing the linked Preview database to 12 migrations. The final protected custom-Preview deployment is `dpl_8c8GsghofQDoM5fueDZy5nsRmBN9` (`trailie-crew-preview-iqur5l7sh-shadowdevils-projects-ae938de8.vercel.app`). Production was not deployed.

The dedicated `hosted-acceptance` environment uses the deterministic CAPTCHA adapter with Supabase Auth CAPTCHA disabled only for this controlled Preview. Four focused hosted scenarios passed on disposable records: CAPTCHA-protected create/join plus member denial and host room deletion; sole-host account-deletion blocking plus host transfer and account deletion; database emergency AI disable with human chat preserved and no Trailie message; and protected recovery plus cleanup dry-run with safe counts. `/privacy`, `/terms`, `/accuracy`, `/support`, and `/api/health` each returned 200. The temporary Vercel automation bypass was revoked; zero bypasses remain, and an unauthenticated request again receives the Vercel SSO 302 with `no-store` and `noindex`.

The longer legacy live-provider scenario passed create/join, Realtime, focused AI, memory, planning, and eventually Version 1 publication after one bounded retry. Its first itinerary call ended `model_unavailable`; the retry published, but the run exhausted its ceiling on a model-specific activity-title selector before the revision/share tail. This is not recorded as a complete hosted re-acceptance of the Phase 5A flow. Local deterministic coverage remains green, while real-provider latency/reliability and model-variable selectors remain Preview operational findings.

## Phase 5C protected-Preview result

The Phase 5C deployment remained inside the same protected custom environment. One-run automation bypasses were revoked after every attempt and the final bypass count is zero. Real-provider create/join, Realtime/presence, chat, focused answer, memory correction, planning/approvals, and validated Version 1 publication succeeded. The final precise removal revision was feasible and approved by both participants, but its generated candidate exceeded the approved scope. The database blocked it with `change_scope_exceeded`; no Version 2 published.

This demonstrates correct fail-closed validation but is a **failed full hosted regression**. The Phase 5A historical acceptance remains evidence for its exact deployment only; Phase 5C protected Preview is `not_accepted_for_release` pending a clean full rerun after the model-output/scope issue is resolved. Production remains undeployed.

## Phase 5D protected-Preview result

Phase 5D replaced full-plan freedom for narrow revisions with an application-owned allowed-change manifest, protected snapshot, validated patch, deterministic narrow application, semantic preservation hashes, and one scope-only repair. No validator severity was reduced. Prior protected evidence published exact kayaking removal Version 2 and independent food-stop removal Version 3; Version 1 remained immutable and historical sharing stayed pinned.

The latest worktree deployed Ready as `dpl_52TpJwK7aReq9CzZJgPJHkwC8pMP` only to `hosted-acceptance`. Its complete rerun stopped before planning when focused Terra recovery returned HTTP 503. A prior credentialed 15-operation provider harness returned HTTP 429 for every operation, but the latest 503 is not overclassified as the same exact response. The failed disposable room and temporary environment file were removed, temporary bypass count was verified as zero, and count-only database verification reported zero revision, publication, and provider recovery backlog after the provider-backlog semantics migration. Preview remains `not_accepted_for_release`; Production remains undeployed.

## Phase 5E protected-Preview result

Phase 5E introduced distinct durable attempts, one focused/Luna retry, safe 429/5xx/timeout/network normalization, bounded Retry-After, staged-result recovery, partial-stream suppression, and HTTP 200 aggregate recovery summaries. Local deterministic acceptance passes. The earlier repeated 429s were exhausted OpenAI project credits; after replenishment, minimal direct Terra and Luna calls both returned HTTP 200 without an SDK retry.

The protected controlled drill then passed first-call 503 recovery for both workflows. Focused produced exactly one final response with no partial persistence; Luna extracted and superseded a correction without a visible response or duplicate fact. Quota reconciled once and both provider/recovery backlogs were zero.

One complete protected room passed create/join, Realtime behavior, focused Terra, Luna correction, planning and approvals, validated Version 1, narrow manifest revision, immutable Version 2, pinned Version 1 share/ICS/print, revocation, and refresh. A stale attempt from an older terminal repair was finalized by the service-only recovery migration without replay; the global content-free backlog audit was then zero. A fresh-room focused/Luna/planning repeatability subset also passed with no duplicate output or unresolved work.

Final clean deployment `dpl_81bc4Db2Hp4UejzooFe2Ac9arxdT` is Ready only on `hosted-acceptance`. The fault variable is absent, Vercel Authentication remains enabled, and zero bypasses remain. Protected Preview is `accepted`; Production remains undeployed and `not_ready`.

## Phase 6A acceptance addendum — July 17, 2026

Phase 6A changes do not inherit the Phase 5E hosted verdict automatically. The accepted protected deployment above must remain intact until a new hosted-acceptance-only deployment passes provider smokes and the complete live-data room flow. Credential presence and live minimal smokes were checked without exposing values: Mapbox geocoding/routing, NPS park/alerts, and RIDB recreation-area requests succeeded; OpenWeather One Call 3.0 returned HTTP 401 and is therefore an explicit degraded capability, not verified weather.

No unrestricted Production deployment is authorized. The Phase 6A protected Preview verdict remains pending until the final hosted run is recorded, Vercel Authentication is rechecked, temporary bypass count is zero, and provider/recovery backlogs are zero.

Final Phase 6A result: `not_accepted_for_release`. Deployment
`dpl_GHch4Kd2VvBg3ercSBrQSotyyTag` was Ready only on
`hosted-acceptance`, Vercel Authentication remained enabled, the
acceptance-only cache bypass forced fresh calls, and temporary bypass/provider
recovery counts returned to zero. Mapbox/NPS live diagnostics found one unique
official-name match, but itinerary validation still reported
`destination_ambiguous`; Version 1 therefore did not publish and the Version 2,
historical-share, ICS, and print tail could not run. OpenWeather One Call 3.0
also remains unusable with the supplied credential (HTTP 401). Production was
not deployed.

## Phase 6A.1/6A.2 protected-Preview result — July 18, 2026

The targeted reacceptance corrected provider-specific destination query
normalization, equivalent-entity collapse, durable canonical identity/hash
propagation, natural-language weather date normalization, and acceptance
operation telemetry. Destination ambiguity severity was not reduced; two
materially different official entities still block publication.

One Call 3.0 activation and the refreshed protected credential returned live
forecast, sunrise, and sunset evidence. Protected acceptance uses temporary
Mapbox geocoding with structural no-storage barriers; NPS is the durable park
identity. The documented Mapbox map-use requirement remains a Production
compliance blocker.

Deployment `dpl_A419ZJxdoq4U1zYbgwSiKPi7xjQk` passed the complete protected
two-user flow: planning/approvals, duplicate-content repair, validated Version
1, evidence presentation, pinned Version 1 share/ICS/print, narrow revision,
immutable Version 2, historical Version 1 preservation, and revocation.
Provider/recovery backlogs, browser provider requests, console problems, and
temporary bypasses ended at zero. Vercel Authentication remains enabled.

Protected Preview is `accepted` for Phase 6A.1 conditions. Production remains
undeployed and `not_ready`.

## Phase 6B protected-Preview status — July 18, 2026

Phase 6B adds a strict exact-version map projection, lazy Mapbox GL renderer,
deterministic local adapter, itinerary/map synchronization, mobile sheet,
spatial history/compare, and privacy-redacted public maps. Local deterministic
member and public-share flows pass, including 390×844 behavior and immediate
share revocation.

The existing accepted Phase 6A.1 protected deployment remains intact. At the
start of Phase 6B, `hosted-acceptance` had no separate
`NEXT_PUBLIC_MAPBOX_MAP_TOKEN`, style variable, or map enable flag. The
server-only Mapbox token was not copied into the browser. Real SDK/style/tile
smoke and the complete protected map flow therefore remain pending a
minimum-scope URL-restricted browser token. No Phase 6B protected acceptance and
no Production deployment are claimed yet.
