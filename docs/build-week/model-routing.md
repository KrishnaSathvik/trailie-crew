# Model Routing

## Status

Model routing is planned; no OpenAI request is made in Phase 0.

## Planned policy

GPT-5.6 orchestration is Build Week scope. Before implementation, the exact model identifier, API surface, tool definitions, limits, and fallback behavior must be checked against current official OpenAI documentation and captured in code-level configuration.

Every user-visible Trailie turn must first pass an invocation policy. Eligible signals are an explicit `@Trailie` mention, direct address, reply to Trailie, or application action. Ordinary crew messages do not invoke the model and produce no assistant response.

Planned routing should separate conversational assistance from structured itinerary generation. Itinerary generation must request a versioned schema, validate the result, and fail visibly rather than silently accepting malformed output. Provider tools must return source-attributed real data; model text must never be treated as live price or availability.

## Evaluation requirements

Routing work will require tests for silence-by-default behavior, explicit invocation, structured-output failures, tool failures, and safe retry boundaries before it can be marked implemented.
