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

## 2026-07-20 — Phase 8A Trailie intelligence audit

Started from clean `main` baseline `6167045`; the unfinished visual-polish pass
was preserved separately so this audit could trace the actual intelligence
path without mixing redesign changes. The implemented pipeline is now:
authorized explicit invocation → deterministic intent/policy → safe reference
resolution → intent-bounded Trip context → strict Structured Output → contract,
scope, evidence, privacy, and booking validation → one safe repair → durable
staging → persisted Trailie message → purpose-built response blocks with safe
Markdown fallback. Planning, itinerary generation, revisions, publication,
exact-version maps, evidence, and booking handoffs remain their existing
application-owned workflows; chat cannot silently bypass them.

The gap matrix found invocation, memory extraction, planning approval,
itinerary validation/repair, immutable version publication, map privacy, and
non-executing booking handoffs implemented correctly. Focused chat was missing
typed intent, bounded Trip/plan context, versioned response persistence,
structured rendering, reference safety, and response observability; those gaps
are fixed. Prompt-dependent facts, unsupported coordinates, live inventory,
passive booking-completion claims, unsafe Markdown links/HTML, and premature
planning are now rejected or reduced to explicit unavailable/clarification
states. Recovery and request orchestration still duplicate some code; recent
structured-option references are not yet stored as a reusable entity ledger;
and focused chat defines tool permissions but does not yet dispatch the live
travel-evidence adapters. Live hotel/flight inventory remains unavailable by
design. Suggested actions are rendered as a clear next step, but app-shell
navigation for those actions is not yet connected.

`TrailieResponseV1` now provides discriminated blocks for recommendations,
comparisons, understanding, itinerary/revision state, approvals, maps/routes,
hotels, flights, booking/reservation requirements, weather, evidence, warnings,
and safe states. The database stores only the validated room-private contract
plus intent, context-section names, validation result, repair count, and
existing latency/usage/provider metadata; it does not log prompts, private
memory contents, secrets, or full conversations. The UI renders these as
semantic components and supports sanitized headings, lists, emphasis, HTTPS
links, tables, and blockquotes without raw HTML or Markdown-to-itinerary
parsing.

Verification passed the full 149-file, 734-test Vitest suite, the isolated 12-assertion
Trailie database contract, focused lint/type/format/diff/security gates, a
production build, and browser flows for Trailie silence/streaming/persistence,
private memory, planning approvals/failure, repaired itinerary generation,
exact current/version context, immutable revision publication, and privacy-safe sharing. One combined browser
run hit the existing deterministic itinerary provider's transient
`model_unavailable` path and passed when rerun in isolation. The full pgTAP run
reached 706 passing assertions but exits nonzero after the pre-existing
guest-comments fixture attempts to read an ungranted temporary table; the new
Trailie suite itself passes. A separate existing public deterministic-map
server/client hydration mismatch was observed during sharing coverage. The
repository-wide formatting command also still reports three pre-existing,
unchanged itinerary/sharing files; every file changed here passes formatting.
No hosted or Production deployment was performed.

## 2026-07-20 — Phase 8 product experience refinement

The route and state audit found eight recurring problems:

1. **Inconsistent:** one-off controls, radii, spacing, status treatments, and
   mixed Trip/room, Plan/itinerary, and crew/traveler terminology.
2. **Developer-looking:** internal phase/model/provider language, deterministic
   adapter labels, technical map terms, and implementation-oriented errors.
3. **Confusing:** Trailie silence, the planning gate, stale revisions, guest
   permissions, map behavior before a Plan exists, and share-version context.
4. **Visually weak:** a generic landing page, flat hierarchy, dense nested
   itinerary surfaces, and unfinished empty/error states.
5. **Mobile problems:** cramped navigation, horizontal Plan tabs, composer and
   safe-area pressure, map-control overlap, and long-content handling.
6. **Missing states:** first-message/first-Plan/first-map states, unavailable
   evidence and routes, no stays/food/bookings/comments/suggestions, and
   expired, revoked, offline, denied, deleted, and retry paths.
7. **Copy problems:** internal vocabulary, inconsistent capitalization, vague
   actions, repeated disclaimers, and role descriptions that did not explain
   guest capability.
8. **Accessibility problems:** no dependable skip-link treatment, incomplete
   dialog focus containment/return, ambiguous labels, and insufficient
   non-visual map/status equivalents.

The polish pass consolidated monochrome-first light/dark tokens, type and
spacing hierarchy, surface/border/shadow/radius scales, focus rings, status
styles, five button variants, shared inputs, empty states, reduced motion,
safe-area behavior, and print rules. Geist and Lucide remain the only product
type/icon languages. The landing page now presents the real collaboration,
Trailie, Plan, and map experience; create/join and guest entry explain only the
necessary choices; the Trip shell uses compact desktop navigation and
mobile-first bottom navigation; chat, planning, itinerary, evidence, maps,
history/compare, revisions, guest comments/suggestions, booking handoffs,
sharing, settings, trust pages, and lifecycle states share one visual and copy
system. Public booking handoffs now include an intentional empty state.

The itinerary received the strongest hierarchy: clear days and dates, timeline
rhythm, distinct travel segments, progressive detail, evidence and booking
states, useful stay/food/free-time treatment, exact-version context, and
responsive Plan-view selection instead of compressed tabs. Maps preserve a
complete list equivalent, verified/omitted location states, a calm unavailable
message, a mobile Plan/Map switch, and privacy-safe public projection. A
server/client hydration mismatch caused by Node's partial `navigator` object
was fixed by using a deterministic initial online state and checking real
connectivity after hydration.

Visible copy was scanned across user-facing TSX and browser chunks. No Build
Week, hackathon, hosted-acceptance, internal model, provider-recovery, private
memory, raw error-code, or `sk-proj` language remains in the shipped UI. Product
terms are standardized around Trip, Crew, Trailie, Plan, Version, Comment,
Suggestion, Booking option, and Guest. Trailie uses the Phase 8A structured
response components and safe Markdown renderer, with intentional silence and
plain thinking/checking/retry states.

### Route and state checklist

- [x] Landing, create, join, valid/invalid invite, guest entry, and inaccessible
      Trip states.
- [x] Trip shell, chat, Trailie streaming/failure, planning/approvals,
      itinerary, evidence, map/list/fallback, history/compare, and revisions.
- [x] Guest comments/suggestions, member attribution/resolution/conversion,
      sharing, public share, print/export, booking options, settings, and danger
      confirmations.
- [x] Privacy, terms, accuracy, support, expired/revoked/deleted, loading,
      empty, error, offline, unavailable-provider, denied, and retry states.
- [x] Desktop, 390×844, 430×932, tablet portrait/landscape, long content,
      keyboard focus, dark mode, reduced motion, and print.
- [x] Skip links, landmarks, heading order, live status, named controls, modal
      focus containment/return, touch targets, and non-visual map access.

Local verification passed formatting, lint, typecheck, `git diff --check`, a
738-test Vitest suite across 150 files, focused map/share tests, 12 focused
end-to-end product flows, a final accessibility/revision/sharing trio, and a
production build of all 17 application pages. Required visual review covered
desktop, both mobile widths, both tablet orientations, dark mode, create/join,
Trip chat/Plan/Map/settings, trust pages, long layouts, and keyboard skip-link
focus. The client bundle contains zero matches for server keys, recovery
secrets, project keys, or internal model names; the largest shared browser
chunk remains approximately 1.7 MB and the map implementation stays lazy.

Protected deployment `dpl_2mZMBCr3uo5weqZXcfZNVajDaCVq` is Ready only on the
custom `hosted-acceptance` target. Vercel Authentication remains enabled,
Production was not deployed, and the final bypass count is zero. The hosted
tour passed landing/create/join, two-person presence, chat, reply, reaction,
explicit Trailie invocation, and the polished recoverable-error state. The
external provider remained unavailable and bounded recovery timed out twice
before hosted planning, publication, and downstream guest/share screens could
be replayed; those surfaces remain covered locally rather than being
misrepresented as a complete hosted pass. The recovery credential visible in
the failed transport trace was immediately rotated, the temporary environment
file and trace were removed, and the harness now catches transport failures
without printing authorization headers. It also uses the current Supabase CLI
`--reveal` contract without logging key values.

Remaining polish limitations are operational rather than visual: the full
live-provider hosted tour must be repeated when provider recovery is healthy;
support should move from the current issue-form transport to an owned support
channel before a public launch; live hotel/flight inventory and booking
execution remain intentionally unavailable; and some structured suggested
actions still describe the next step instead of navigating directly. Vercel
CLI 56.4.0 is available while the verified local CLI is 56.3.2; upgrading is
recommended before the next hosted operations session.

Verdict: the local product experience and Trailie response architecture are
coherent, polished, responsive, accessible, and production-build clean.
Protected Preview is suitable for continued product review. A public
Production release is not claimed until the live-provider hosted tour
completes and the remaining operational launch items are closed.

Implementation commits: `454b0f8` (product experience refinement),
`c93b5ef`/`116a60b` (Trailie intelligence and audit), and the hosted harness
hardening commit recorded with this entry.

## 2026-07-20 — Phase 8B runtime performance

Started from accepted Phase 8A commit `ff4a8b3` on `main`. The traced runtime is:
authorized source receipt → deterministic invocation detection → intent and
complexity classification → bounded Trip/context reads → server-only route and
tool selection → provider/model call → sentence-buffered safe text streaming
or atomic structured buffering → schema/feasibility validation and bounded
repair → evidence/map/booking binding → validated persistence → final UI
reconciliation. Stop, timeout, retry, recovery, and fallback now terminate or
resume at durable boundaries without publishing cancelled itinerary/revision
state.

Routing has one server-side source of truth. Instant and unsupported work is
local/deterministic. Simple and context-backed answers use the configured fast
route; small targeted revisions use that route or a deterministic constrained
patch. Destination comparison, planning summaries, full itineraries, group
conflicts, and large revisions use the configured reasoning/planning route.
Weather, NPS/RIDB, geocoding/directions, map, hotel/flight, and booking guidance
use the tool pipeline before an approved model route. Repository/acceptance
configuration maps these to Terra for fast answers, Luna for memory, and Sol
for reasoning/planning/itinerary work; the hosted run directly observed Terra
and Luna, while Sol routes were not reached.

Safe private telemetry records salted room references, route/complexity, stage
timings, tool classes, cache/retry/failure observations, usage/cost when
available, and terminal reasons. Prompts, conversations, memory bodies,
credentials, invite/session tokens, private lodging, and generated private
URLs are excluded. A service-only aggregate report returns percentiles and
counts without raw rows. The deterministic benchmark defines exactly 39
non-sensitive fixtures (10 simple, 10 context-backed, 5 tool-backed, 3 planning
summaries, 3 itineraries, 5 small revisions, and 3 large revisions) and proves
the expected routes and aggregation. It does not substitute synthetic fixture
timings for live performance.

Normal chat now shows an immediate real stage, streams sanitized sentence-safe
text without duplicate reconciliation, preserves only understandable partial
text after Stop, and exposes retryable stopped/failed states. Structured
planning, itinerary, map, booking, and revision payloads remain buffered,
validated, atomically revealed, and persisted only after validation. Planning,
itinerary, and revision UI uses stage-specific, accessible progress and
longer-than-usual copy. Cancellation is idempotent; focused retries receive
fresh quota/provider identities; cancelled plans cannot publish; and small
revisions retain their affected-item/day path instead of rebuilding the full
Plan.

Local focused verification passed the routing, telemetry, streaming,
cancellation, concurrency, timeout, itinerary, revision, provider, mobile, and
accessibility suites, the 31-case Phase 8B pgTAP contract, formatting, lint,
typecheck, production build, bundle/secret scans, and `git diff --check`.
Context is capped at 12 relevant recent messages and 12,000 characters, with
current Trip facts and current versions prioritized. Provider calls use the
existing cache, per-room/global limits, bounded concurrency, typed failure
classes, and independent-call parallelism.

Protected hosted acceptance found and fixed four real defects. Fresh rooms
initially rejected simple chat before the first memory extraction; stopped
focused requests advertised a retry that durable state rejected; the focused
response-block union was broader than the detected intent allowed; and the
configured fast route rejected provider-facing `format` annotations inside the
strict JSON schema. The provider schema now omits only those incompatible
annotations while retaining the complete Zod application validation contract
and the SDK's non-enumerable parser hooks. Safe contract diagnostics record
only bounded error identifiers and schema-key hints, never provider bodies or
private request content.

The final successful fast/context sample set on protected acceptance contained
three normal-chat and two context-backed requests. Normal chat completed at
p50/p95/max 2.508/4.455/4.671 seconds (**pass**) with first-token
p50/p95 1.705/3.809 seconds (**close/miss**) and visible-state p50/p95
593/722 ms (**miss**). Context-backed responses completed at p50/p95/max
2.136/2.294/2.312 seconds (**pass**), with first-token p50/p95
1.067/1.163 seconds and visible-state p50/p95 311/385 ms. Normal-chat
database/context tool time was p50/p95 369/610 ms; context-backed tool time was
185/228 ms. Route usage was fast-only for these requests, with 7,422 input and
632 output tokens in aggregate. Cost remained unavailable from the configured
provider response.

Planning-summary wall time was 42.633 seconds (**miss** against 12/20 seconds).
Full itinerary generation entered the reasoning/planning route, generated a
candidate in 161.260 seconds, validated in under one second, ran one bounded
93.110-second repair, and still required revision. Aggregate itinerary
telemetry, which includes the recovery claim, reported p50/p95/max
128.129/243.350/256.152 seconds; browser wall time exceeded the 300-second
bound (**miss** against 45/75 seconds). No partial itinerary was published.
The hosted run exposed two itinerary state defects: an omitted approved
decision was incorrectly considered non-repairable, and exhausted repair left
the plan indefinitely active. Missing decisions now enter the single existing
repair path, while a still-invalid repaired draft terminates as blocked. Both
changes have deterministic worker/validation regressions; the terminal-state
fix was made after the bounded hosted run and was not redeployed or presented
as a hosted pass.

The bounded hosted benchmark stopped at the full-itinerary miss, so no hosted
p50/p95 is claimed for tool-backed chat, small or large revisions,
cancellation/retry, two-user concurrency, or mobile streaming. Their routing,
state, cancellation, concurrency, slow-network, and accessibility behavior
remains covered by deterministic focused suites. The dominant hosted
bottleneck is reasoning-provider generation and repair, not local validation;
structured provider token/cost timing is also still incomplete. The final
candidate `dpl_23EZkQZG9XAJgi9v7UEJjNLhEwQZ` is Ready on the protected
`hosted-acceptance` target only. Vercel Authentication remains enabled,
temporary bypass count is zero, and Production was not deployed.

Phase 8B verdict: **local architecture and focused verification pass; protected
hosted performance acceptance misses**. Fast and context-backed responses are
functional, but immediate-state/TTFT targets need improvement and the
reasoning/planning route is far outside the itinerary target. Production
hardening is not authorized; the next optimization is reducing
reasoning-provider generation/repair latency and completing a fresh bounded
hosted matrix after the terminal-state fix.

## 2026-07-20 — Phase 8C planning performance optimization

Started from accepted Phase 8B commit `b2bf92c`. The fresh pre-change hosted
trace measured normal chat at 1.648-second p50 total and 1.019-second p50 first
token, planning summary at 46.834 seconds, and itinerary generation failing
after a 181.644-second main-model call. The critical path was delayed by a
server-acknowledged activity card, unconditional broad focused-answer reads, a
high-reasoning planning-summary contract, sequential evidence follow-ups, and
a high-reasoning 12,000-token itinerary contract with up to another full
repair call.

Phase 8C now renders Trailie activity optimistically and reconciles the durable
request ID; a missing stream terminal event becomes a retryable failure. Simple
answers load only intent-required context. Planning summary uses the configured
fast route, a 9,000-character context, low reasoning, an 1,800-token strict
contract, one bounded provider call where available, and 750 ms result polling.
Itinerary generation uses low reasoning, an 8,000-token/28,000-character
generation context, a 44,000-character repair context, and one total repair
budget across structural and semantic repair. Planning, generation, and repair
calls have 18/45/20-second product recovery bounds; abort timeouts are reported
as timeouts, not provider outages.

Independent NPS/RIDB/weather/daylight follow-ups, geocoding, routes, and
evidence stores are parallelized. Required route feasibility now
precedes a membership-only validated core preview; optional place, map, and
booking enrichment follows without exposing draft evidence publicly or moving
the room's published version. Cancellation polls durable state every 750 ms and
aborts active model/provider work. Structured telemetry now records actual
context, model, validation, repair, map/evidence, persistence, usage, and final
render-ready stages. Generation, cancellation, blocked, failed, and timeout
paths all end in an explicit terminal state.

Focused verification passed 146 Vitest cases plus the worker/telemetry follow-up
set, 36 Phase 8B/8C pgTAP checks, formatting, lint, typecheck, production build,
client-bundle/secret scans, and `git diff --check`. Context and output reductions
preserve approval, schema, feasibility, evidence, privacy, version, and
publication gates. No raw structured draft is published; private preview data
is unavailable to anonymous/public share projections.

The bounded protected-hosted sample contains exactly 10 simple answers, five
planning summaries, and three itineraries. Simple answers completed at
p50/p95/max 1.644/2.816/3.131 seconds, with first token at
0.844/1.245 seconds and conservative server-visible state at 156/288 ms. Thus
first token passes; immediate state is **close** (p50 misses by 6 ms, p95
passes). Simple usage was 17,398 input and 978 output tokens; cost was not
reported. Planning summaries completed at p50/p95/max
4.794/8.926/8.926 seconds (**pass**), using 10,402 input and 3,576 output tokens
in total, with no failures, fallbacks, or external travel-provider calls.

All three itineraries reached a terminal failure at 46.430–47.004 seconds,
before validation or repair and without publication. The selected
reasoning/planning route did not return its strict structured response within
the 45-second main-model bound; the browser no longer waits beyond 300 seconds,
but a fast failure is not itinerary acceptance. The smallest next fix is a
materially more compact generation contract or an approved structured-capable
route that reliably returns the complete schema inside the remaining latency
budget—not weaker validation or a longer hidden wait.

The benchmark ran on protected candidate
`dpl_XpweBzN1aFWF47ybAGBfsy6fT4i4`. Final protected candidate
`dpl_7eYQehqmENcCvDqXCyJEoTBe4Wp5` additionally classifies the observed
provider abort as a timeout; that safe error-label correction was not used to
claim new performance data. It is Ready on `hosted-acceptance`. Vercel
Authentication remains enabled, temporary bypass count returned to zero, and
Production was untouched. Phase 8C verdict:
**startup, first-token, and planning-summary optimization pass; full-itinerary
acceptance fails at the main structured-model stage.** Production hardening and
Production readiness remain blocked on a successful hosted itinerary sample.

## 2026-07-20 — Phase 8D compact itinerary generation contract

The former one-shot generation contract exposed 167 fields, 23 nested objects,
167 required fields, 20 enums, and about 19,172 schema characters (roughly
4,793 schema tokens). `CompactItineraryCandidateV1` reduces model generation to
26 decision/connection fields, three nested objects, 26 required fields, three
enums, and about 2,893 schema characters (roughly 724 schema tokens), an 85%
schema reduction. Database/version/evidence IDs, coordinates, provider and
persistence metadata, timestamps, privacy/map/booking projections, derived
durations/order/day numbers, and UI-only fields are now added by deterministic
server expansion into the unchanged full itinerary contract. Only the expanded
full contract is persisted or sent to clients.

Generation uses a concise approved-summary/evidence prompt, 2–3 essential
items per day, 240-character narrative bounds, and day-based output caps of
1,500/2,200/2,800/3,200 tokens. The approved structured itinerary route is
primary and a distinct approved structured fast route is started as a bounded
2.5-second hedge inside the existing 45-second deadline; the loser is
cancelled and use is logged safely. Structural validation precedes expansion,
the complete existing semantic validator follows expansion, and at most one
single-model compact repair remains available. Repeated meals no longer cause
false duplicate-activity repair, while exact repeated activities remain
blocked. Validated core preview persists before optional map, route, evidence,
and booking enrichment; compact JSON and partial drafts are never exposed.

On protected hosted acceptance deployment
`dpl_BK5oy54jc22aGSW6xfvSFF9tG7Tq`, all eight ordinary 3-, 5-, and 7-day
itineraries completed (100%). Telemetry total was p50/p95/max
18.613/23.200/23.200 seconds; preview-ready was
18.593/23.180/23.180 seconds; model generation was
16.710/21.371/21.371 seconds. Expansion was p50/p95/max 4/11/11 ms and semantic
validation 36/49/49 ms. Input tokens were p50/p95 2,163/2,183 and output tokens
1,685/2,155; all eight used zero repairs. Browser preview-ready was
p50/p95/max 18.660/23.572/23.572 seconds. The prior full contract failed 3/3 at
46.430–47.004 seconds before validation, so ordinary itinerary acceptance now
passes with no main-generation timeout.

The separately bounded 10-day chunk case terminated safely with
`model_timeout` at 46.076 seconds before draft persistence, making the complete
matrix 8/9 (88.9%). This is the remaining documented long-trip limitation;
ordinary Phase 8D acceptance passes, but 10-day hosted chunk completion remains
for later work. Vercel Authentication stayed enabled, temporary bypass count
returned to zero, and Production was untouched. Phase 8D verdict: **the ordinary
itinerary release blocker is cleared; Production hardening was not started.**

## 2026-07-21 — Phase 9A Production infrastructure bootstrap

The environment topology is now explicit: Local uses the local application and
local Supabase; Preview uses Vercel `trailie-crew-preview`
(`prj_8VfR8A6S4G63mZIVNVuCUPQKWLwi`) and Supabase
`tkccksmiuucdstvvfglp`; Production uses the new empty Vercel project
`trailie-crew-production` (`prj_UHv658VeaSYiLnK629s9XbkETBS8`) and still
awaits an independently billed Supabase project. Both Vercel projects require
Vercel Authentication and have zero bypasses. Production has no Git link and
no deployment; release remains an exact-commit, manually approved workflow
whose migration and deployment steps are deliberately disabled in Phase 9A.

`app.trailiecrew.com` is associated with Production and
`preview.trailiecrew.com` with Preview. Vercel DNS now has explicit `A` records
for `app` and `preview` to `76.76.21.21`; DNS resolution/hostname smoke remains
pending propagation. Root landing and `www` redirect routing are not attached.
Production URL, legal URL, contact-address, CSP/origin, secure-cookie, and
Turnstile hostname/action/expiry contracts are implemented. The role mailboxes
are not claimed operational; delivery verification is a launch blocker.

The typed environment inventory covers Public, Server-only, Provider, Auth,
Security, Observability, Recovery, Email, and Database variables without
values. Production has only 15 independent non-secret bootstrap controls;
Supabase keys, recovery/cron secrets, provider credentials, real Turnstile
keys, email credentials, analytics, and alert webhooks were not copied from
Preview. Startup and command guards reject Preview/Production project mixing,
test fixtures and bypasses, fake/dummy provider credentials, Production reset,
and hosted acceptance outside the exact Preview stack.

The repository has 36 ordered migrations, state checksum
`6d8e5ef6dbf1ae4dd8afc858d67425d791b0daa3b5b13dcc2aa747d85f363af2`,
and two reviewed historical constraint drops. Preview has all 36 migrations,
55 RLS-enabled application tables (38 private tables also forced), 203 safe
`SECURITY DEFINER` functions with no unsafe `search_path`, no storage objects,
no Edge Functions, and no Edge Function secrets. Production migrations, Auth
redirects, RLS/grant checks, emptiness checks, and backup verification remain
blocked on Production Supabase creation. PITR remains disabled/unapproved;
the initial decision is paid daily backups plus off-site logical dumps and a
timed restore drill (RPO up to 24 hours), unless stronger paid PITR is approved.

Verification passed format, lint, typecheck, 844/844 Vitest tests, 24 pgTAP
files with 775 assertions, migration verification, production build, client
bundle/server-secret scan, and `git diff --check`. Remaining Phase 9A blockers
are Production Supabase billing/password storage, independent Production
database/Auth secrets, real Turnstile keys, GitHub authentication and protected
environment approval, DNS propagation smoke, external alerts, mailbox delivery,
and the later controlled Production smoke/rollback gate. Production exposure
status: **no Production deployment and no invited traffic**.
