# Phase 5A Preview Acceptance

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
