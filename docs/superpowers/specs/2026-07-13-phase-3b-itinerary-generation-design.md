# Phase 3B Itinerary Generation Design

## Scope

Phase 3B turns one current, non-stale, blocker-free approved planning summary into the first immutable, crew-visible itinerary. Planning approval remains unchanged. A model may propose and repair a draft, but only deterministic application validation may authorize publication.

## Lifecycle and persistence

`trip_plans` owns a separate lifecycle: `generating -> validating -> needs_revision -> published`, with `blocked`, `failed`, and `superseded` terminal alternatives. The first plan is version 1. `(planning_request_id, basis_summary_version)` is unique so duplicate generation reuses the same plan, while `(planning_request_id, version)` preserves immutable version identity. Persisted semantic `trip_plan_events`, private run records, normalized tool evidence, and validation reports allow safe recovery without replaying successful stages. A published plan is trigger-protected from mutation.

## Contracts and evidence

The strict itinerary schema uses stable application IDs, ISO dates, local `HH:mm` values, an IANA timezone, explicit coordinates, source-attributed evidence, and costs classified as `verified`, `estimated`, or `unknown`. It rejects unknown fields, HTML, executable Markdown, arbitrary components, auth identifiers, provider secrets, booking claims, and model-owned validation results. Provider-neutral geocoding, routing, place, destination-fact, and daylight contracts return normalized success or explicit unavailable states with retrieval and freshness metadata.

## Generation, validation, and repair

The server independently verifies approval, summary version/hash, staleness, readiness, room state, membership, and idempotency. A claimed worker loads only the approved summary plus bounded safe traveler context, obtains available evidence, calls `gpt-5.6-sol` through Responses API strict `text.format`, enriches the draft with normalized tool evidence, and runs deterministic validators in a fixed order. Critical/high issues prevent publication. Correctable conflicts allow one repair call followed by a full revalidation; contradictions, missing critical evidence, or changes to approved decisions block the plan. Semantic model review is deferred.

## Publication and recovery

The model never publishes. One private transaction requires a persisted PASS report, rechecks the plan and approved basis, stores the validated final itinerary, marks it published, advances `rooms.current_plan_version` exactly once, and emits a safe room invalidation. Database state distinguishes unclaimed generation, draft, evidence, validation, and repair stages so restart recovery resumes the safest unfinished stage under lease and attempt caps.

## UI and testing

The existing Plan tab gains an approved-only `Generate Itinerary` action, reconnect-safe semantic progress, and published Overview, Day-by-day, Travel, Stay, Food, and Validation views. Desktop retains the Trip rails; mobile retains the Plan bottom tab with overflow-safe subnavigation and day selection. Tests proceed schema/database/tools/validators/provider/worker/UI/E2E in red-green slices. Local E2E uses real Auth, Postgres, RLS, RPCs, Realtime invalidation, validation, repair, and publication; only OpenAI and external travel providers are deterministic fakes.

## Official OpenAI decision

Verified 2026-07-13 from official OpenAI documentation: exact model `gpt-5.6-sol`; OpenAI Node SDK `6.46.0`; Responses API `responses.parse` with `zodTextFormat` strict `text.format`; standard mode with `reasoning.effort: "high"`; `store:false`; bounded output; SDK timeout and request abort signal. The model supports streaming, structured outputs, and function calling. This workflow does not stream model output or use tools inside the model call; semantic progress comes from application stages. Programmatic Tool Calling, persisted reasoning, pro/max reasoning, hosted tools, web search, and multi-agent orchestration are deferred.
