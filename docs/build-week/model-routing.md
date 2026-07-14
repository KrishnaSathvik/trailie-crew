# Model Routing

## Revision routing

Impact analysis routes deterministically to `gpt-5.6-terra` for bounded one-day changes and `gpt-5.6-sol` for multi-day, route-chain, lodging, traveler-logistics, critical, or confirmed-decision work. Complete candidate generation and its one bounded repair use `gpt-5.6-sol`. Models never choose routing or publication.

## Implemented Phase 2A policy

Current official OpenAI guidance was verified on July 13, 2026. Focused answers default to explicit `gpt-5.6-terra`; rare deterministic escalation uses `gpt-5.6-sol`. See [`openai-integration.md`](openai-integration.md) for the sources, SDK, API fields, and exclusions.

Every user-visible Trailie turn must first pass an invocation policy. Eligible signals are an explicit `@Trailie` mention, direct address, reply to Trailie, or application action. Ordinary crew messages do not invoke the model and produce no assistant response.

The router selects Sol only when bounded context is at least 8,000 characters and the request is explicitly comparative with at least four recognized constraint terms. Otherwise it selects Terra. Mentioning an itinerary never escalates by itself. Unknown or identical model configuration fails closed. No model selects another model, delegates, calls tools, or runs in the background.

The versioned focused prompt is `trailie-focused-v1`. It forbids itinerary generation and unsupported current-data claims. Every final answer must validate against the strict safe envelope. One failed invocation may be deliberately retried; the second call is a separate private run and no third run is allowed.

## Evaluation requirements

Unit coverage proves default routing, the exact escalation threshold, and invalid configuration. Parser, provider, SQL, component, and real two-context E2E coverage prove silence, explicit invocation, safe provider failure, one retry, and duplicate suppression. Travel tools and itinerary routing remain deferred.

## Phase 2B route

Ordinary memory extraction always routes to `gpt-5.6-luna` with `reasoning.effort: "none"`. It never escalates to Terra or Sol. Validation failure prefers one bounded retry and then a private safe failure. Prompt version is `trailie-memory-v1`; schema version is `1`. Focused Phase 2A answers retain their existing Terra/Sol routing independently.

## Phase 3A planning-summary route

The explicit Build Our Itinerary action routes summary reconstruction directly to exact `gpt-5.6-sol`. It uses `reasoning.effort: "high"`, strict structured output, prompt `trailie-planning-summary-v1`, schema `1`, no tools, and no model-selected routing. The model proposes a review summary only; deterministic application code owns readiness, staleness, and approvals. One schema/provider repair retry is the maximum, and no itinerary model call exists in Phase 3A.

## Phase 3B itinerary route

The approved-only Generate Itinerary action routes generation and its single optional conflict repair to exact `gpt-5.6-sol` with `reasoning.effort: "high"`, prompt `trailie-itinerary-v1`, schema `1`, strict Responses `text.format`, `store: false`, and a 12,000-token cap. There is no model router, streaming draft, autonomous tool choice, or model-owned publish step. Application code calls travel providers, validates deterministically with `trailie-itinerary-validator-v1`, and atomically publishes only PASS.

The optional semantic-review call is deferred to control scope and cost. `xhigh`/`max`, function calling, Programmatic Tool Calling, background Responses, Batch, and multi-agent orchestration were verified/considered but are not used.
