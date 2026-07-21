# Trailie Invocation

Revision invocation is explicit. **Request a Change** and **Change this** call an application-owned action and secure RPC. Speculative ordinary chat remains conversation and cannot create a request. Analysis and generation run server-side after persisted claims.

## Silence by default

Trailie answers only an explicit, deterministic application decision. No model decides whether to respond, and ordinary persisted crew messages make zero provider requests.

Canonical invocation types are `explicit_mention`, `direct_address`, `reply_to_trailie`, and `application_action`. Phase 2A recognizes the `answer_question` application action in the shared parser contract; itinerary, revision, comparison-action, and summarization actions remain reserved and unimplemented.

## Plain-text rules

The parser masks fenced code, inline code, and Markdown quote lines before checking text. It recognizes case-insensitive `@Trailie` and beginning-of-message forms such as `Trailie:`, `Trailie,`, and `Hey Trailie,`. Mention boundaries reject emails and longer handles such as `@TrailieCrew`. Multiple valid mentions create one decision and are removed only from the normalized request; the persisted crew body is never changed.

An explicit `@Trailie` mention invokes from any position in ordinary prose, including the middle or end of a message. Unprefixed product references such as `Should we ask Trailie later?` remain ordinary chat. Empty direct invocation is normalized to the clarifying request `Ask what help the crew needs.` Replies invoke only when the persisted reply target is a visible same-room Trailie message.

Both the composer and server run the parser, but only the server decision has authority. The server also proves the authenticated user owns the active participant and source user message in the same room.

## Idempotency, rate, and retry

The database hashes room ID, source message ID, invocation type, and prompt version into a unique idempotency key. Row locking and constrained state transitions serialize workers. A completed invocation returns its existing response identity; a queued/running invocation cannot start another run; at most one failed run may be retried deliberately. A unique response-message reference and locked completion transaction prevent two persisted answers.

Limits are ten AI invocations per user per room per ten minutes, one active invocation per source message, at most twelve recent messages/12,000 characters of context, 900 model output tokens, 30 seconds per provider request, SDK retry only for retryable transport/provider conditions, and one deliberate failed-run retry. Trailie rows do not consume the human eight-messages-per-ten-seconds chat allowance.

## Deferred

Phase 2A does not extract memory, update `room_memory`, build itineraries, research travel data, call tools, create approvals, use maps, export content, run autonomous agents, or respond without an invocation.

## Independent private extraction

Phase 2B understanding is not a Trailie invocation. Every eligible human message may be privately processed whether or not it mentions Trailie. It produces no stream card, typing state, presence, or response message. Explicit Phase 2A invocation detection and focused answers remain unchanged.

## Phase 3A application action

**Build Our Itinerary** is an explicit application action, but it does not reuse focused-answer chat persistence. It creates a planning request and review summary only. No synthetic user or Trailie message appears, and approval never triggers an itinerary provider in this phase.

## Phase 3B application action

**Generate Itinerary** is a separate approved-only application action. The server derives authority from the persisted planning request and current immutable summary, reuses an existing generation idempotently, and schedules the server worker. It neither resends approval nor creates a chat message. Model/tool work stays behind the server boundary and semantic progress contains no reasoning.
