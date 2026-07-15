# Phase 5A Preview Hardening and Hosted Acceptance Plan

> Execute on `main` from the pushed Phase 4C baseline `3561309`. Deploy Preview only; never deploy Production.

## Outcome

Clear repository-controlled Preview blockers, configure isolated hosted services, deploy a protected Vercel Preview, and verify the complete product workflow against real hosted boundaries without claiming production readiness.

## 1. Harden environment boundaries

- Add `src/lib/env-public.ts` containing only browser-safe Supabase validation.
- Add `src/server/env.ts` containing Supabase secrets, OpenAI/provider configuration, recovery authentication, and the server-only AI generation switch.
- Update browser Supabase imports to use the public module and server imports to use the server module.
- Replace `src/lib/env.test.ts` with focused public and server tests, including production fake-provider rejection and disabled-AI behavior.
- Update `.env.example` and document every consumed variable without values.

## 2. Add structured, redacting operational logs

- Add failing tests for allow-listed fields, correlation IDs, safe error codes, latency, and recursive forbidden-field redaction.
- Replace the current AI-only logger with a general server logger that never serializes prompts, message bodies, tokens, cookies, authorization data, provider payloads, or hidden reasoning.
- Preserve model and operation identifiers only where useful for operations.

## 3. Add emergency AI disable behavior

- Add tests showing disabled generation returns safe user-facing behavior and never constructs or invokes a provider.
- Gate focused responses, memory, planning, itinerary generation, and revision analysis/candidate generation from server-only configuration.
- Leave ordinary human chat unaffected and keep publication-only revision completion available.

## 4. Add protected Preview recovery execution

- Refactor aggregate recovery into a dependency-injectable bounded service with safe per-category counts.
- Add tests for empty work, stale queued/running work delegation, duplicate-safe invocation, completed work exclusion through existing claim semantics, and bounded batch sizes.
- Add `/api/internal/recovery` as a Node.js POST-only route using constant-time secret verification, no CORS exposure, safe structured logs, no raw job data, and an explicit duration limit.
- Add route tests for missing, wrong, and correct secrets plus safe failures.
- Do not configure Vercel Cron for Preview because Vercel invokes cron only on Production deployments; document manual protected invocation and retain automated durable scheduling as a production blocker.

## 5. Runtime, security, and accessibility verification

- Add explicit route durations for focused AI and recovery within the selected Vercel plan limits.
- Add selected-page automated accessibility coverage if it can run without weakening the existing suite; fix critical or serious findings.
- Review the production route manifest and built browser chunks for test routes, server environment identifiers, and secret values.
- Run format, lint, typecheck, unit/component tests, build, local database reset and pgTAP, E2E, database lint/advisors, dependency audit, smoke suites, diff check, secret scan, bundle scan, and route review.

## 6. Hosted Preview configuration

- Create a dedicated Vercel project under the authenticated account, linked only to this repository and configured for Preview.
- Enable Vercel Authentication before sharing any URL unless hosted CAPTCHA is fully configured and verified.
- Create or select a dedicated non-production Supabase project only after authenticated access is available; verify Auth, anonymous sign-in policy, Realtime authorization, API schemas, backups, extensions, migrations, RLS, grants, and security advisors.
- Configure only Preview-scoped environment variables. Keep fake providers, test controls, local endpoints, and Production variables absent.
- Configure OpenAI usage alerts and ownership in the provider console when account access permits; describe alerts accurately and never call them a hard budget unless enforcement exists.
- Configure a restricted server-only Mapbox token if available; otherwise preserve explicit unavailable evidence and record the controlled condition.

## 7. Hosted acceptance and release record

- Deploy with a Preview-only CLI command and record project/runtime metadata without secrets.
- Run two-context Realtime acceptance, one controlled real OpenAI workflow, Mapbox smoke when configured, recovery drill, sharing/header/cache verification, historical ICS/print checks, database invariants, logs/privacy review, and the complete 28-step scenario.
- Record measured durations and usage only from observed hosted results.
- Update Build Week documentation and all three Phase 4C audit reports with cleared blockers, accepted conditions, evidence, remaining production blockers, and an explicit statement that Production was not deployed.
- Commit and push only verified logical fixes after all applicable local and hosted gates pass, then report the final Preview verdict and clean git status.
