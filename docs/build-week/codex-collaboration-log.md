# Codex Collaboration Log

## 2026-07-19 — Phase 6C.1 guest comments

Started from clean `main` baseline `29627d6`. Human direction kept the phase to
scoped Viewer/Commenter links, exact-version plain-text comments, immediate
expiration/revocation, and privacy-safe guest projection; suggestions, activity,
email/password invitations, direct editing, Production, and Phase 6C.2 remained
out of scope. Codex added one focused migration with forced RLS, hashed invite
and session tokens, narrow empty-`search_path` functions, member/guest ownership
rules, rate limits, exact-version foreign keys, and host-only link lifecycle.
The monochrome member and guest surfaces cover link management, display-name
entry, plan/day/item threads, own-comment editing/deletion, member resolution,
collapsed resolved comments, and explicit unavailable states without exposing
chat, memory, participants, approvals, revisions, unpublished plans, or private
lodging coordinates.

Final evidence is 44 focused unit/component tests, 77 Phase 6C.1 pgTAP
assertions, one passing local full guest/revision Playwright flow, a passing
production build and static/security gates, and one passing protected hosted
guest flow against Ready deployment `dpl_4VT6Qjzf7oiSjVNPx13A3fWjNVyH`.
Hosted setup used deterministic published-version fixtures through existing
member and service-only workflows so no broad AI or map suite was rerun.
Vercel Authentication remained enabled, all temporary bypasses returned to
zero, the linked non-production migration was applied, and Production was not
deployed.

## 2026-07-18 — Phase 6A.1 destination/weather and Phase 6A.2 Mapbox boundary

Started from `e3dcdf8` on `main`. Human direction kept the work narrow:
preserve strict ambiguity, repair canonical destination propagation, accept
OpenWeather One Call 3.0, contain Permanent Geocoding cost/storage risk, deploy
only to protected hosted acceptance, and do not begin Phase 6B.

Test-first diagnosis found three connected seams: official destination
normalization sent only `Yosemite` to Mapbox while NPS needed that stem;
duplicate Mapbox representations needed entity collapse by NPS park code; and
the acceptance cache-bypass telemetry sentinel violated the database minimum
length. A natural-language planning date range also prevented weather lookup.
Codex added provider-specific normalization, immutable
`CanonicalDestinationResolutionV1`, durable ID/hash propagation through repair
and revision, safe stage traces, cache version 2, temporary Mapbox write
barriers, explicit storage modes, natural date normalization, and schema-valid
operation telemetry without weakening ambiguity or model-drift validation.

One temporary live smoke resolved one canonical NPS park with two corroboration
sources and returned verified Mapbox, NPS, OpenWeather forecast/daylight, and
RIDB evidence. Protected deployment `dpl_A419ZJxdoq4U1zYbgwSiKPi7xjQk`
completed Versions 1 and 2, immutable historical evidence, share/ICS/print,
revocation, and zero backlogs/bypasses. Production was not deployed. The
Mapbox-map use restriction remains an explicit compliance blocker.

## 2026-07-17 — Phase 5E provider resilience

Started from clean `main` baseline `614cf33`. Upgraded the Vercel CLI to 56.3.1, diagnosed the Phase 5D upstream focused 503 plus independent aggregate recovery failure, and implemented test-first provider normalization, distinct durable focused attempts, stream completion joining, staged focused recovery, Luna retry eligibility, one logical quota reservation, safe recovery summaries, reliability UI, content-free metrics, and private migrations. Revision validation was not changed.

Final local evidence is 527 Vitest tests, 539 pgTAP assertions, 16 local Playwright passes, a successful production build, 9 exactly-once interruption checkpoints, and quota rejection with zero provider calls. Protected drills exposed and fixed wrapper-metadata, stream-error selection, public-share label, hosted-harness, and terminal-attempt cleanup defects. The earlier 429s were traced to exhausted project credits; after replenishment direct probes passed, controlled focused/Luna 503 retries passed, a complete protected flow published immutable Version 2, and a fresh-room repeatability subset passed. The final deployment remained protected on `hosted-acceptance`; the fault variable was removed, all backlogs were zero, and all temporary bypasses were revoked. Production was not deployed.

## 2026-07-16–17 — Phase 5D revision scope reliability

Starting from `c388ab2` on `main`, Codex diagnosed the Phase 5C failure as excess full-plan model freedom rather than a validator, stable-ID, or diff defect. Test-first work added a strict application-owned allowed-change manifest, protected base snapshot/hashes, patch-first deterministic narrow routing, constrained/versioned prompts, canonical diff comparison, one scope-only repair, durable forced-RLS artifacts, separate counters, safe UX, and interruption recovery. The validator was not weakened.

Local gates passed: 493 unit/component tests, 511 pgTAP assertions, 16 passing local E2E scenarios with one hosted-only skip, positive/negative scope-repair E2E, 9 exactly-once interruption checkpoints, quota/load acceptance, and build/static/security/advisor/dependency checks. The exact protected kayaking removal published immutable Version 2, and a fresh food-stop removal published immutable Version 3; an earlier completed run also passed pinned Version 1 share/history. A durable service-only memory enqueue was added before scheduling the worker. The latest complete rerun deployed Ready as `dpl_52TpJwK7aReq9CzZJgPJHkwC8pMP` only to `hosted-acceptance` but stopped at a focused-answer prerequisite when bounded recovery returned HTTP 503; the prior separate 15-operation provider harness returned HTTP 429 throughout. Failed provider audit rows were removed from the direct recovery backlog because parent workflows own retry; protected revision/publication/provider backlog counts are zero. The newest disposable room, temporary env file, and bypass were removed. Unrestricted Production was never deployed. Verdicts: revision `conditional_pass`, Preview `not_accepted_for_release`, Production `not_ready`.

## 2026-07-16 — Phase 5C provider reliability and infrastructure

Human direction required complete reliability/infrastructure evidence without promoting configured controls to accepted claims and kept unrestricted Production out of scope. Codex implemented central stage/workflow deadlines, bounded retry classification, durable provider attempt leases and validated-result replay, exactly-once quota/application reconciliation, safe alert delivery, deterministic provider/interruption/quota/load harnesses, protected infrastructure inventory, and operational runbooks. Test-first work exposed and fixed a detached Supabase RPC receiver in the Next runtime and globally colliding fake provider response IDs.

The exact local gates pass, including 436 unit/component tests, 472 pgTAP assertions, 16 local Playwright scenarios, dependency/security/build checks, and a 1,000-message/1,000-reaction local load envelope. The protected real-provider run reached Version 1 and an approved removal revision, then correctly failed closed because the candidate exceeded approved scope; Version 2 was not published, so hosted acceptance failed. Temporary Vercel automation bypasses were revoked and Production remained undeployed. External Turnstile/WAF/alerts/budget/restore/manual-accessibility gates remain blocked.

## 2026-07-14 — Phase 5A Preview hardening and hosted acceptance

Phase 4C was reverified, committed as `3561309`, and pushed before hosted work. Codex upgraded Vercel CLI to 56.2.0; created the isolated, Vercel-Authentication-protected `trailie-crew-preview` project and custom `hosted-acceptance` environment; left Git integration, custom domains, Production variables, and Production deployment absent; linked the dedicated hosted Supabase project; applied and verified all migrations/RLS/grants; and completed a protected two-user hosted flow. Test-first hardening split public/server environment validation, added an AI disable switch, recursive log redaction, protected bounded recovery, a distributed cooldown, measured-safe planning timeout/classification, provider-unavailable itinerary warnings, and privacy-safe share heading fallbacks. Hosted Realtime, real OpenAI, immutable Versions 1/2, historical sharing/ICS/print/revocation, and recovery passed. CAPTCHA, live Mapbox, automated scheduling, automatic backup/restore, provider budget-console proof, and production operations remain unresolved; the verdict is Preview ready with controlled conditions, not production-ready.

## 2026-07-14 — Live OpenAI hardening

After Phase 4B was committed as `72fe749`, the five credentialed OpenAI smoke scripts passed without skips for focused answers, memory, planning, itinerary generation, and revisions. A real two-browser local trip then exercised silence-by-default chat, a streamed and persisted Terra answer, Luna preference correction/supersession, a Sol planning summary, two-user approval, Sol itinerary publication, Terra revision analysis, a Sol candidate, and two-user Version 2 publication.

The live run exposed boundaries that deterministic providers could not: OpenAI limits `safety_identifier` to 64 characters; strict focused-answer fields must be required-and-nullable rather than optional; the memory smoke schema needed `additionalProperties: false`; full Sol itinerary responses need more than the prior 90-second ceiling; empty model-generated days crashed daylight enrichment; validation-only recovery incorrectly consumed an AI attempt; vague itinerary prompts permitted empty/free-time-only days; and Terra could reclassify the explicit revision type. Test-first fixes added a 64-character HMAC identifier, a model-only focused-answer wire schema with null normalization, a 180-second bounded itinerary timeout, authenticated transient retry, safe empty-day validation/recovery, meaningful-day prompt/validator rules, and exact revision-type instructions. No key, raw prompt, message body, token, or provider credential was added to source or logs.

## 2026-07-14 — Phase 4B

Started from clean `main` commit `0e2182c`. Human direction locked exact-version sharing/export, host-only link management, 256-bit opaque tokens, deterministic public redaction, conservative indexing/cache behavior, and no server-PDF claim without a compatible runtime. Codex implemented the database, application, route, UI, ICS, print, privacy, and test boundaries. Red-to-green work exposed and fixed two cross-runtime issues: newly published initial Version 1 rows lacked `plan_hash` after the one-time Phase 4A backfill, and a type re-export failed under Next's development Server Action loader despite a green production build. The real-stack browser proof showed Version 1 while the room remained on Version 2, then immediate generic unavailability after revocation. No commit or push was made.

## 2026-07-13 — Phase 4A

Started from clean `d9bce9c` on `main`. Implemented explicit immutable itinerary revisions, deterministic materiality/routing/diffs, two-stage crew review, reused full validation with bounded repair, stale-base protection, recovery claims, safe Realtime invalidation, and history/compare UI with test-first SQL/domain coverage. No commit or push was created.

## July 13, 2026 — Phase 0 bootstrap

Human direction established the product boundaries, lightweight pnpm workspace, technology choices, visual constraints, and stop conditions. Codex translated those decisions into the repository foundation, internal package contracts, design tokens, a test-first landing shell, CI, and initial documentation.

The landing test was written against an empty shell and observed failing before the branding implementation was added. All Phase 0 verification results are reported in the session handoff; no commit or push was created.

Future entries should identify the human decisions, Codex contributions, verification evidence, and any external sources used for each phase.

## July 14, 2026 — Phase 5B production hardening

Started from clean `main` commit `90e8296`. Human direction fixed the sequence, kept the accepted Preview functional, prohibited Production and Phase 6/7 scope, and required truthful external-infrastructure blockers. Codex verified current official Supabase CAPTCHA/anonymous Auth/admin deletion/backup guidance and Vercel Cron semantics, then implemented single-use CAPTCHA receipts and protected trip entry, transactional AI quota reservations, emergency switches, leased recovery/cleanup, host/account/room lifecycle controls, personal export, redacted alert-classified logs, draft trust pages, accessibility improvements, and the Production runbook set.

Test-first database work initially exposed an ambiguous quota reconciliation parameter and later a qualified participant fixture issue; both were corrected before the Phase 5B suite reached 46 passing assertions. Unit/component work began with missing CAPTCHA/quota/lifecycle modules and now covers deterministic verification, expiry/retry, server actions, destructive phrases, quota release/reconciliation, provider switches, redaction/classification, and trust pages. The clean local release gate reached 437 database assertions, 371 unit/component tests, and 16 passing local E2E scenarios with one hosted-only skip.

Commit `e997af4` was pushed, the Phase 5B migration was applied to the linked Preview database, and application deployment `dpl_8c8GsghofQDoM5fueDZy5nsRmBN9` completed in the protected custom Preview only. Four focused hosted Phase 5B scenarios passed, as did all trust/health route smokes. A longer live-provider run published Version 1 only after one bounded retry and then exhausted its ceiling on a model-specific selector, so it was recorded as partial rather than complete Phase 5A re-acceptance. The temporary automation bypass was revoked and protection was rechecked.

## July 13, 2026 — Phase 1A secure persistence

Human direction locked anonymous Supabase identity, the four-table data model, invite security, RPC-only create/join workflows, RLS boundaries, test coverage, and the explicit exclusion of UI/chat/AI/planning work. Codex inspected the Phase 0 baseline, proposed the migration/client design, verified current official Supabase guidance, and implemented the migrations, typed clients/contracts/mappers, pgTAP suites, and security documentation.

Tests were written first. The initial TypeScript run failed on missing modules and the initial pgTAP run failed on missing RPCs. Subsequent local reset/lint/test evidence and all final quality-gate results are reported in the Phase 1A session handoff. No commit, push, remote link, or production database change was made.

## July 13, 2026 — Phase 1B create and join journey

Human direction locked the minimal Create/Join fields, routes, anonymous-auth lifecycle, invite-token lifetime, Server/Client boundaries, honest Trip-shell placeholders, test scenarios, and explicit exclusion of chat/realtime/AI/planning work. Codex selected authenticated Server Actions plus RLS-backed Server Component reads, retained the raw invite token only in React memory, and found that no database migration was needed.

Tests were written first: the initial run had five intended failing suites while all 21 previous assertions remained green. The implemented suite reached 58 unit/component assertions. The first real Playwright run exposed blocked Next development hydration at the local `127.0.0.1` origin; one scoped `allowedDevOrigins` fix restored client behavior. The final two-scenario browser suite verified two anonymous users, copy behavior, duplicate-name rejection, shared crew reads, outsider denial, mobile layout, keyboard operation, themes, and clean browser consoles. Local database reset and all 44 existing pgTAP assertions also passed. No commit, push, remote project, admin-client usage, or production change was made.

## July 13, 2026 — Phase 1C realtime group chat

Human direction locked persisted group messages, canonical reactions, cursor history, optimistic reconciliation, one private room channel, presence/typing privacy, responsive chat behavior, RLS, abuse controls, and explicit deferral of Trailie and planning. Codex inspected the Phase 1A/1B boundaries, verified current official Supabase Realtime authorization/Presence guidance, and selected safe RPC payloads plus minimal database Broadcast notifications.

Every layer began red: missing Zod/state modules, missing database objects across 49 new pgTAP checks, missing action/mappers, missing components, rejected-network behavior, and a real browser run with no Realtime container. The database reached 94 passing pgTAP assertions; unit/component work covered contracts, mapping, actions, reconciliation, reactions, typing, presence, pagination, composer behavior, failure/retry, and Trailie silence. The real two-context browser flow exposed and fixed a pre-subscription cleanup race, then verified presence, typing expiry, live send/reply, cross-context reactions, refresh persistence, outsider denial, 390×844 People UI, and a 35-message pagination fixture without mocking Realtime. No commit, push, remote link, admin-client chat use, or production change was made.

## July 13, 2026 — Phase 2A focused Trailie answers

Human direction locked deterministic invocation, silence by default, official-doc verification, GPT-5.6 workload routing, Responses streaming/structured output, private run accounting, strict authorization, idempotency, safe failure, and explicit deferral of planning/tools/agents. Codex verified official OpenAI model/API/SDK guidance, selected exact `openai@6.46.0`, Terra for conversation and rare Sol escalation, and documented the exact fields used.

Tests began red for missing parser, router, context, safety, usage, provider, authorization, stream, component, and database objects. The first real E2E run exposed missing `service_role` SELECT on persisted source messages; the next expansion exposed Trailie rows incorrectly consuming the invoking human's chat rate limit. Narrow service reads and a user-only rate predicate fixed those boundaries. The final deterministic two-context scenario covers silence, mention, direct address, reply, private streaming, Realtime persistence, refresh/duplicate suppression, code silence, safe failure/one retry, outsider denial, mobile/dark layout, clean browser consoles, and no browser OpenAI traffic. No commit, push, remote database change, or live OpenAI claim was made.

## 2026-07-13 — Phase 2B

Started from clean `main` commit `c0e9f17`. Verified current official OpenAI model, Structured Outputs, reasoning, retention, background, Batch, and SDK guidance before implementation. Selected Luna/none/strict/store-false and Next.js `after()` with database claims. Implemented test-first schemas, eligibility, provider, validation, private migration/functions, worker/retry/concurrency, fake provider, protected test inspection, E2E, and documentation. No commit or push was made. GitHub CLI reauthentication reported success but a subsequent `gh auth status` still reported the local token invalid; Vercel CLI was upgraded to `56.1.0` through npm after pnpm lacked a global bin directory.

## 2026-07-13 — Phase 3A

Started from clean `main` commit `b0f1330`. Human direction locked the explicit trigger, immutable review summary, deterministic readiness/staleness, all-active and host-only approvals, Sol-only reconstruction, Phase 2B recovery, and the no-itinerary boundary. Codex reverified official OpenAI guidance, designed the lifecycle and data boundary, implemented schemas/RPCs/RLS/workers/Plan UI/fake-provider coverage, removed the production memory-inspection route, and added a server-only recovery drain. Focused tests began red for absent planning contracts and database objects; browser verification later exposed and fixed optimistic-send synchronization and a completed-summary UI flag that never reset. No commit or push was made.

## 2026-07-13 — Phase 3B

Started from clean `main` commit `c658653`. Human direction locked approved-summary-only generation, strict Sol output, provider-neutral evidence, deterministic validation, bounded repair, immutable PASS-only publication, semantic progress, and no revision/sharing/export/booking work. Codex reverified official OpenAI guidance, implemented the database/schema/provider/worker/UI boundaries test-first, and added deterministic external-provider doubles plus a live Mapbox seam. Browser integration exposed unnamed public SQL wrapper parameters that direct pgTAP calls could not reveal; named PostgREST-safe wrappers fixed the real worker. No commit or push was made.

## 2026-07-17 — Phase 6A

Started from clean `main` commit `8c1e9c7`. Human direction selected Mapbox, OpenWeather One Call 3.0, NPS, and RIDB; required evidence-backed planning, exact-version snapshots, official-source precedence, protected hosted acceptance, and no Production/Phase 6B/6C/7 work. Codex verified official provider documentation and credential usability without exposing values, then implemented the strict normalized evidence model, provider adapters, cache/budget boundary, private database contract, itinerary/revision validation, source UI, and deterministic tests. Live Mapbox, NPS, and RIDB smokes succeeded; OpenWeather returned HTTP 401 and remains explicitly unavailable pending entitlement.

Local release gates passed, including 589 unit/component and 577 pgTAP
assertions. Hosted diagnosis found and fixed exact official-name handling,
provider-query normalization, and Mapbox candidate depth without weakening
generic ambiguity. The final protected fresh-provider run still failed closed
with `destination_ambiguous`, so Version 1/2 snapshot and share/export acceptance
did not complete. Vercel Authentication remained enabled, bypass and recovery
backlogs returned to zero, and Production was not deployed.

## 2026-07-18 — Phase 6B

Started from `7e71983e53ae6d6b4ff8eef2b219801080f93e52` on `main`.
Human direction required an editorial itinerary-first map, exact historical
versions, privacy-redacted public sharing, complete non-map equivalence,
separate browser/server tokens, verified-only routes, and no Phase 6C/7 or
Production deployment.

Codex implemented the versioned map schema and projection, narrow member/public
database source functions, bounded route geometry normalization, lazy
`mapbox-gl` rendering, deterministic local rendering, desktop/mobile
itinerary-map synchronization, history/compare annotations, public redaction,
offline/failure states, accessibility controls, and documentation. Browser
testing first exposed an unrelated application already occupying port 3000,
then a non-async export in a Server Actions module, and finally a mismatch
between live evidence and the intentionally reduced immutable evidence
snapshot. Each was corrected without widening public data or mutating history.
The protected environment lacks a separate restricted browser token, so hosted
map acceptance remains explicitly pending and the accepted Phase 6A.1 Preview
was left intact.

## 2026-07-19 — Phase 6C.2 protected acceptance

Started from commits `d169cfe` and `91d9e68` on `main`. The guest-suggestion
migration was applied to the linked Supabase project and local/remote migration
state matched. Focused Vitest (37 tests), focused pgTAP (5 tests), lint,
typecheck, formatting, and the network-enabled production build passed. The
protected Vercel deployment `dpl_ERLVqTMtjZGsguKhH4EWoQdHDPtN` reached READY
with Authentication enabled and zero bypasses afterward. The hosted E2E could
not start because this environment lacks a Supabase access token for retrieving
the hosted test keys; no bypass was retained and unrestricted Production was
not deployed.

## 2026-07-20 — Phase 7 booking handoffs

Implemented the narrow booking-discovery boundary: exact-version private
handoffs, forced RLS, safe click metadata, HTTPS/allowlisted provider URL
validation, and a compact booking-options drawer with official/approved
disclosure. Trailie does not complete bookings and never claims guaranteed
price or inventory. Handoffs are server-created from trusted evidence; private
traveler data is excluded from search URLs. Focused contract tests and 8 pgTAP
assertions pass. Hosted acceptance and Production deployment remain pending;
checkout, payments, reservations, notifications, and booking confirmation are
out of scope.
