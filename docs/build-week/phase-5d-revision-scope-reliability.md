# Phase 5D — Revision scope reliability

Date: July 16–17, 2026. Baseline: `c388ab2` on `main`. Unrestricted Production was not deployed.

## Outcome

The Phase 5C scope failure is fixed without weakening validation. Narrow removals now use an application-owned allowed-change manifest, an immutable protected snapshot, a validated patch, deterministic application, semantic preservation hashes, and the existing strict boundary/full-itinerary validators. The protected real-provider kayaking scenario repeatedly published immutable Version 2 and retained Version 1. History/share pinning passed in a completed Version 2 run.

The revision reliability result is conditional pending the complete protected regression. The exact timed-item removal published immutable Version 2, and a fresh food-stop removal published immutable Version 3 with recovery backlog zero. The latest protected attempts were blocked earlier in the flow by transient focused-answer and Version 1 itinerary-generation provider timeouts; no new revision verdict was claimed.

## Root cause and architecture

Phase 4A represented scope mainly through model-authored analysis target/affected IDs while sending a complete itinerary to Sol. Stable IDs, diff classification, and `change_scope_exceeded` behaved correctly; excessive freedom existed in the generation input, prompt/schema contract, and lack of a dedicated scope-repair path.

Phase 5D adds:

- `RevisionAllowedChangeManifestV1`, deterministically derived from the explicit request, approved analysis, immutable base plan/hash, confirmed decisions, and hard constraints;
- `RevisionPatchV1`, validated against manifest operations, targets, editable fields, downstream effects, and maximum affected item/day counts;
- deterministic remove/move/reschedule/shorten/extend/note application where semantics do not require Sol;
- constrained Sol generation only for semantic replacement/general work;
- protected item/day/top-level hashes that exclude volatile evidence timestamps;
- one dedicated `candidate_scope_violation` repair attempt with exact unauthorized differences, separate from itinerary conflict repair;
- one canonical semantic comparison source for diff and boundary validation;
- durable manifest, patch, and scope-repair state with forced RLS, service-only RPCs, immutable completion, and replay-safe identity.

## Validator policy

No severity was lowered. `change_scope_exceeded` remains terminal after one scope repair, unrelated drift is not accepted, narrow requests cannot become general revisions, and blocked candidates cannot publish. Destination, dates, stable IDs, confirmed decisions, hard constraints, rejected options, protected order/content, and declared downstream effects are checked before the existing change-boundary and full itinerary validators.

## Verification

- Formatting, lint, typecheck, production build, route review, `git diff --check`, and dependency audit passed.
- 105 unit/component files and 493 tests passed.
- Fresh local database reset: 14 pgTAP files and 511 assertions passed.
- Full local Playwright: 16 passed, 1 hosted-only skipped (17 scenarios collected).
- Scope drift once: repair restored protected content and Version 2 published.
- Scope drift twice: safe block, no Version 2, no third/general repair.
- Interruption: all 9 workflow checkpoints passed exactly-once verification, backed by 6 provider-attempt Vitest scenarios and 35 SQL assertions.
- Quota: 27 Vitest plus 35 SQL assertions passed with zero provider calls after quota rejection.
- Database lint/security advisors had no error-level finding; the patch-to-manifest foreign key has a covering index. Existing informational findings remain.
- Failed provider attempts remain safe audit history but no longer appear as directly recoverable work; parent workflows own bounded retry. Protected revision, publication, and provider recovery backlogs are all zero.
- `pnpm audit --prod --audit-level=moderate`: no known vulnerabilities.
- The credentialed provider harness completed 15/15 operations but every operation ended HTTP 429 after its bounded retry. This is recorded as `model_rate_limited`, not a scope-validation result.

## Hosted evidence

Protected deployments used only the `hosted-acceptance` custom environment and non-production Supabase project `tkccksmiuucdstvvfglp`. Vercel Authentication remained enabled. Each automation bypass was created for one run and revoked in `finally`. The Phase 5D migration is recorded remotely. No unrestricted Production deployment occurred.

The exact kayaking removal reached feasible Terra analysis, two approvals, manifest/patch-constrained deterministic application, boundary/full validation PASS, two confirmations, immutable Version 2 publication, unchanged Version 1, refresh persistence, and pinned Version 1 share/history behavior. Later runs reproduced Version 2 publication before independent upstream or fixture failures.

Repeatability is demonstrated by prior protected runs: the exact kayaking removal published Version 2 and the independent food-stop removal published Version 3. The latest verified worktree deployment `dpl_52TpJwK7aReq9CzZJgPJHkwC8pMP` was Ready on the custom `hosted-acceptance` target, but its complete rerun stopped at the prerequisite focused Terra answer when bounded recovery returned HTTP 503. No plan or revision was created. The newest disposable room and temporary environment file were deleted, the bypass count was verified as zero, and count-only database verification reported zero revision, publication, and provider recovery backlog. Unrestricted Production remained untouched. A prior credentialed harness returned HTTP 429 for all 15 bounded calls; the latest 503 is recorded conservatively as upstream provider/recovery unavailability rather than assumed to be the same exact rate-limit response. Preview cron scheduling is still absent; the controlled harness invokes the authenticated recovery endpoint after its normal eligibility guard.

## Verdicts

1. Revision scope reliability: `conditional_pass`.
2. Protected Preview acceptance: `not_accepted_for_release`.
3. Production readiness: `not_ready`.

Remaining blockers are a clean complete real-provider rerun after the current rate-limit condition clears, reliable hosted Luna extraction, scheduled recovery/cron, real Turnstile, WAF/provider budget controls, external alerts, restore/RPO/RTO, and manual accessibility. A durable service-only enqueue now persists memory work before the serverless `after()` worker is scheduled.
