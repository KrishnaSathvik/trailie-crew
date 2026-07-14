# Codex Collaboration Log

## July 13, 2026 — Phase 0 bootstrap

Human direction established the product boundaries, lightweight pnpm workspace, technology choices, visual constraints, and stop conditions. Codex translated those decisions into the repository foundation, internal package contracts, design tokens, a test-first landing shell, CI, and initial documentation.

The landing test was written against an empty shell and observed failing before the branding implementation was added. All Phase 0 verification results are reported in the session handoff; no commit or push was created.

Future entries should identify the human decisions, Codex contributions, verification evidence, and any external sources used for each phase.

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
