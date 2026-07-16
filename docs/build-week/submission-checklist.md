# Submission Checklist

- [x] Phase 4B SQL, unit, integration, and deterministic two-user/public-browser E2E gates pass locally.
- [x] Version 1 remains readable, shareable, and exportable unchanged after Version 2.
- [x] Stale request, outsider, spoofing, duplicate publication, private leakage, and production fake controls are verified locally.
- [x] `pnpm test:revision:smoke` status is recorded; prior credentialed smoke passed and Phase 4C skipped without a key.

## Foundation

- [x] Standalone Trailie Crew repository
- [x] Lightweight pnpm workspace without Turborepo
- [x] Next.js App Router, strict TypeScript, Tailwind, ESLint, and tests
- [x] Locked brand and theme foundation
- [x] CI for lint, typecheck, tests, and build
- [x] Prior-work attribution documented

## Product implementation

- [x] Anonymous Supabase identity and secure Trip persistence foundation
- [x] Atomic create/join RPCs, hashed invite tokens, RLS, and database permission tests
- [x] Create and join flows without destination, dates, budget, or preference intake
- [x] RLS-protected responsive Trip shell with honest upcoming sections
- [x] Shared persisted crew conversation with realtime delivery and pagination
- [x] Crew presence, typing indicators, replies, and canonical reactions
- [x] Optimistic idempotent sends with explicit failure/retry reconciliation
- [x] Silence-by-default Trailie invocation policy
- [x] GPT-5.6 focused-answer orchestration verified against current OpenAI documentation
- [x] Explicit planning-summary and approval workflow (no itinerary generation)
- [x] Structured, validated, versioned itinerary revisions
- [x] Version-pinned sharing, ICS, and print/PDF export
- [x] Honest verified/estimated/unknown/unavailable/stale source handling is implemented and locally tested.
- [ ] Read-only TrailVerse adapter integration, if used

## Submission readiness

- [x] Accessibility and responsive review for landing, entry forms, and Trip shell
- [x] Real two-context Realtime collaboration and outsider-isolation coverage
- [x] Two-context focused-answer demo rehearsal with deterministic fake provider
- [ ] Production deployment and environment review
- [x] Phase 4C local validation commands pass; hosted acceptance and credentialed provider checks remain separate gates.
- [x] Demo script reflects implemented behavior through Phase 4B
- [x] Submission copy makes no unsupported production, booking, availability, or live-provider claims

## Phase 5A controlled Preview

- [x] Phase 4C audit baseline committed and pushed (`3561309`)
- [x] Vercel CLI 56.2.0 and dedicated `trailie-crew-preview` project
- [x] Next.js/pnpm/Node configuration and Pro Fluid Compute compatibility verified
- [x] Vercel Authentication protects deployment URLs; no custom domain or Git-triggered Production deployment
- [x] Browser/server environment schemas split; local production bundle contains no server env schema identifiers
- [x] Structured log contract and forbidden-field redaction tests
- [x] Server-only AI generation emergency switch and provider-construction guard
- [x] Protected bounded recovery route plus distributed service-only cooldown
- [x] Anonymous-user lifecycle and forward-fix deployment runbooks documented
- [x] Axe critical/serious checks pass for landing, create, join, and authenticated chat
- [x] Dedicated hosted Supabase project authenticated, configured, migrated, and catalog-verified
- [x] Preview-only environment variables configured; Production remains empty
- [ ] OpenAI usage alert/budget ownership verified
- [x] Hosted recovery, Realtime, OpenAI, sharing, export, header/cache, and controlled scenario acceptance
- [x] Mapbox absent; explicit unavailable-evidence Preview condition confirmed
- [x] Free-plan backup limitation verified; manual pre-acceptance schema/data dumps recorded
- [x] Final verdict: Preview ready with controlled conditions; Production remains undeployed

## Phase 2B conversation memory

- [x] Silent post-response extraction with deterministic prefilter
- [x] `gpt-5.6-luna`, strict output, no tools, `store: false`, safety identifier
- [x] Normalized immutable facts plus rebuildable private snapshot
- [x] Conservative decision evidence and safe self-correction
- [x] Forced RLS, minimum RPC grants, no browser memory reads
- [x] One retry, claim idempotency, concurrency/output/context bounds
- [x] Fake provider, unit/SQL/E2E silence coverage
- [x] Live OpenAI memory smoke test passed with Luna correction/supersession
- [x] Bounded recovery drain for abandoned extraction rows
- [ ] Durable production queue/cron scheduling for recovery

## Phase 5B Production-hardening checklist

- [x] CAPTCHA-protected anonymous sign-in/create/join application boundary with deterministic local adapter
- [x] Direct create/join RPC bypass revoked and single-use CAPTCHA receipt tests
- [x] User/room/global/model AI quota reservation and emergency disable
- [x] Recovery and cleanup cron configuration, bounded leases, and safe logs
- [x] Host transfer, disposable room deletion path, account deletion path, and personal export
- [x] Draft privacy, terms, accuracy, support, retention, incident, backup, and deletion documentation
- [ ] Final protected-Preview Phase 5B acceptance on disposable records
- [ ] Real Turnstile plus hosted Supabase Auth CAPTCHA on final domain
- [ ] Platform abuse controls and alert owner/delivery evidence
- [ ] Paid Production automatic backup/PITR and isolated restore drill
- [ ] Professional legal/privacy review and manual assistive-technology acceptance
- [ ] Production deployment (explicitly forbidden in Phase 5B)

## Phase 5C provider reliability

- [x] Central bounded timeout/retry/deadline policy and failure classification
- [x] Durable provider attempts, leases, validated-result replay, and exactly-once application
- [x] Provider, interruption, quota, bounded-load, and protected-infrastructure harnesses
- [x] Full local static, unit, database, browser, security, dependency, and bounded-load gates
- [x] One-run hosted automation bypass isolation and verified revocation
- [ ] Passing full protected real-provider regression (`change_scope_exceeded` blocked Version 2)
- [ ] Real Turnstile, WAF/bot/rate-limit, external alert, and provider-budget acceptance
- [ ] Isolated hosted restore with measured RPO/RTO and complete manual accessibility acceptance
- [ ] Production deployment (not authorized; remains undeployed)

## Phase 4B sharing and exports

- [x] Host-only create, rotate, expire, and idempotent revoke
- [x] 256-bit URL-safe token; database stores SHA-256 hash and safe prefix only
- [x] One active link per immutable plan version; Version 1 never follows Version 2
- [x] Strict public schema and deterministic private-data redaction
- [x] Generic invalid/revoked/expired public state and snapshot-drift fail-closed behavior
- [x] `noindex`, `nofollow`, `noarchive`, referrer suppression, and conservative cache headers
- [x] Exact-version RFC 5545 ICS with CRLF, escaping, folding, timezones, and stable UIDs
- [x] Exact-version print route with page breaks, footer/version, and browser Save as PDF
- [x] Real local Auth/Postgres/RLS E2E at desktop and 390×844
- [ ] Server-generated or persisted PDF artifacts (intentionally deferred; no compatible runtime dependency added)
- [ ] Password protection, invited viewers, organizations, and public indexing (deferred)

## Phase 3A planning approval

- [x] Explicit Build Our Itinerary action on desktop and mobile Plan
- [x] Immutable Before I build the trip summary versions
- [x] Deterministic readiness and stale-basis protection
- [x] `all_active` and `host_only` approval calculation
- [x] Required review notes and version-scoped approval reset
- [x] Sol strict output with fake-provider E2E
- [x] No itinerary generation path or synthetic Trailie message
- [x] Live OpenAI planning smoke and two-user summary approval passed

## Phase 3B validated itinerary

- [x] Approved-current-summary-only idempotent generation RPC
- [x] Strict itinerary schema and deterministic validator
- [x] Provider-attributed cached travel evidence and fake fixtures
- [x] One route-conflict repair and PASS-only publication
- [x] Immutable published version and current room pointer
- [x] Persisted semantic progress with refresh recovery
- [x] Overview/day/travel/stay/food/validation Plan experience
- [x] Real PostgreSQL/RLS/publication E2E with fake external providers
- [x] Live itinerary smoke and full-schema Version 1 publication passed
- [ ] Live travel-tools smoke (requires `MAPBOX_ACCESS_TOKEN`)
- [ ] Durable production queue/cron scheduling for recovery
