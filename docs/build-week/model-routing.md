# Model Routing

## Implemented Phase 2A policy

Current official OpenAI guidance was verified on July 13, 2026. Focused answers default to explicit `gpt-5.6-terra`; rare deterministic escalation uses `gpt-5.6-sol`. See [`openai-integration.md`](openai-integration.md) for the sources, SDK, API fields, and exclusions.

Every user-visible Trailie turn must first pass an invocation policy. Eligible signals are an explicit `@Trailie` mention, direct address, reply to Trailie, or application action. Ordinary crew messages do not invoke the model and produce no assistant response.

The router selects Sol only when bounded context is at least 8,000 characters and the request is explicitly comparative with at least four recognized constraint terms. Otherwise it selects Terra. Mentioning an itinerary never escalates by itself. Unknown or identical model configuration fails closed. No model selects another model, delegates, calls tools, or runs in the background.

The versioned focused prompt is `trailie-focused-v1`. It forbids itinerary generation and unsupported current-data claims. Every final answer must validate against the strict safe envelope. One failed invocation may be deliberately retried; the second call is a separate private run and no third run is allowed.

## Evaluation requirements

Unit coverage proves default routing, the exact escalation threshold, and invalid configuration. Parser, provider, SQL, component, and real two-context E2E coverage prove silence, explicit invocation, safe provider failure, one retry, and duplicate suppression. Travel tools and itinerary routing remain deferred.
