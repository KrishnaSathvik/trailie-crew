# Submission Checklist

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
- [ ] Structured, validated, versioned itinerary revisions
- [ ] Sharing and export
- [ ] Honest source handling for live data
- [ ] Read-only TrailVerse adapter integration, if used

## Submission readiness

- [x] Accessibility and responsive review for landing, entry forms, and Trip shell
- [x] Real two-context Realtime collaboration and outsider-isolation coverage
- [x] Two-context focused-answer demo rehearsal with deterministic fake provider
- [ ] Production deployment and environment review
- [ ] Final validation commands pass
- [x] Demo script reflects only implemented behavior through Phase 3A
- [ ] Submission copy makes no unsupported claims

## Phase 2B conversation memory

- [x] Silent post-response extraction with deterministic prefilter
- [x] `gpt-5.6-luna`, strict output, no tools, `store: false`, safety identifier
- [x] Normalized immutable facts plus rebuildable private snapshot
- [x] Conservative decision evidence and safe self-correction
- [x] Forced RLS, minimum RPC grants, no browser memory reads
- [x] One retry, claim idempotency, concurrency/output/context bounds
- [x] Fake provider, unit/SQL/E2E silence coverage
- [ ] Live OpenAI memory smoke test (not run; requires a real key)
- [x] Bounded recovery drain for abandoned extraction rows
- [ ] Durable production queue/cron scheduling for recovery

## Phase 3A planning approval

- [x] Explicit Build Our Itinerary action on desktop and mobile Plan
- [x] Immutable Before I build the trip summary versions
- [x] Deterministic readiness and stale-basis protection
- [x] `all_active` and `host_only` approval calculation
- [x] Required review notes and version-scoped approval reset
- [x] Sol strict output with fake-provider E2E
- [x] No itinerary generation path or synthetic Trailie message
- [ ] Live OpenAI planning smoke test (not run; requires a real key)

## Phase 3B validated itinerary

- [x] Approved-current-summary-only idempotent generation RPC
- [x] Strict itinerary schema and deterministic validator
- [x] Provider-attributed cached travel evidence and fake fixtures
- [x] One route-conflict repair and PASS-only publication
- [x] Immutable published version and current room pointer
- [x] Persisted semantic progress with refresh recovery
- [x] Overview/day/travel/stay/food/validation Plan experience
- [x] Real PostgreSQL/RLS/publication E2E with fake external providers
- [ ] Live itinerary smoke (requires `OPENAI_API_KEY`)
- [ ] Live travel-tools smoke (requires `MAPBOX_ACCESS_TOKEN`)
- [ ] Durable production queue/cron scheduling for recovery
