# Conversation memory (Phase 2B)

Verified and implemented on 2026-07-13.

## Product boundary

Every eligible persisted human message is considered for private background understanding. The work never writes a public message, streams output, publishes typing/presence, invokes the focused-answer path, or changes the immutable human message. Memory is not yet used to generate planning summaries, approvals, itineraries, tools, maps, or unsolicited chat.

## OpenAI contract

- Model: `gpt-5.6-luna`, the cost-sensitive/high-volume GPT-5.6 tier that corresponds roughly to the earlier nano tier. [Official model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- API: Responses API with strict Structured Outputs at `text.format`, generated from a Zod schema by `zodTextFormat`. [Structured Outputs migration](https://developers.openai.com/api/docs/guides/migrate-to-responses#6-update-structured-outputs-definitions)
- Reasoning: `reasoning: { effort: "none" }`, supported by GPT-5.6 and appropriate for bounded classification. [GPT-5.6 guide](https://developers.openai.com/api/docs/guides/latest-model)
- Request: `store: false`, no tools, `max_output_tokens: 800`, a privacy-preserving `safety_identifier`, an SDK timeout, and an abort signal.
- Usage: input, output, total, cached-input, and reasoning tokens are copied only from documented Responses usage fields.
- SDK: the pinned official Node SDK `openai@6.46.0`; local typechecking and provider contract tests verify `responses.parse`, Zod helpers, request options, response IDs, request IDs, and usage fields.

The OpenAI request is synchronous inside a post-response application worker. OpenAI background mode was considered but not used because it requires `store: true` and stores response state for polling; this conflicts with the locked `store: false` privacy choice. The Batch API was also considered but its 24-hour completion window and file-oriented lifecycle are a poor fit for immediate room memory. [Background mode](https://developers.openai.com/api/docs/guides/background), [Batch API](https://developers.openai.com/api/docs/guides/batch), [data controls](https://developers.openai.com/api/docs/guides/your-data#v1responses)

Synchronous cancellation terminates the connection through the SDK abort signal. Application timeout is 20 seconds. A retryable provider/schema failure receives at most one deliberate application retry; the SDK uses zero automatic retries for memory calls.

Live smoke status: **not run**. The deterministic fake provider is the normal local/CI path. A live run requires a real `OPENAI_API_KEY` and is excluded from CI.

## Execution and reliability

1. `send_message` persists and returns the human message.
2. Next.js `after()` schedules work after the response.
3. The service worker atomically claims the message through `claim_message_extraction`.
4. A deterministic filter skips greetings, reactions, and short acknowledgements without a model call.
5. The worker loads one source message, safe participant identity, optional reply, at most six recent messages, at most twelve relevant facts, and approval mode.
6. The provider proposes a strict patch.
7. Application validation normalizes keys/values, clamps confidence, rejects spoofed sources/subjects/supersessions, removes exact duplicates, and conservatively handles decisions.
8. `complete_message_extraction` applies the patch and rebuilds the snapshot in one transaction.

The in-process concurrency cap is two. Database row locking and one row per message prevent duplicate workers. `after()` is Build Week-appropriate and preserves send latency, but it is not a durable queue: a function termination after the response can leave unscheduled work. The normalized extraction row makes a future polling/queue drain straightforward. Local/E2E work can explicitly drain a message through the protected test-only route.

## Facts, evidence, and projection

`private.message_extractions` stores only operational metadata. `private.memory_facts` is the immutable evidence ledger: corrections supersede rather than delete. Every fact retains its source message and participant. An effective patch increments `private.room_memory.memory_version`; skips, failures, and exact duplicates do not.

Participant facts, shared trip/group context, and confirmed group decisions are separate. A proposal such as “Maybe Yosemite?” remains a `destination_proposal`. A decision requires explicit consensus evidence (or a future application-owned source). In `all_active` mode, host speech has no special decision power. In `host_only`, an explicit host confirmation may qualify under application policy; ordinary host suggestions do not.

A participant can supersede only their own compatible active participant fact. Cross-participant overwrite and participant supersession of a group decision are rejected. Contradictory evidence remains historical and should be represented as unresolved rather than silently erasing a decision.

The materialized snapshot contains participant preferences/constraints/must-dos/avoids, shared destination/date/budget/transport/lodging context, confirmed decisions, rejected options, and open questions. It is deterministically rebuildable from normalized facts.

## Privacy and silence

Private tables force RLS, grant no table access to `anon`, `authenticated`, or `service_role`, and are reachable only through narrowly granted `SECURITY DEFINER` functions with `search_path = ''`. Browser Trip-shell queries do not include memory. The development/test inspection route requires `TRAILIE_TEST_MEMORY_SECRET`, returns 404 in production, and returns 404 without the secret.

No prompt, transcript duplicate, raw provider response, raw SQL/provider error, API key, HMAC input, or hidden reasoning is stored. Crew content is untrusted data and cannot override the extraction instructions.

## Testing

Unit tests cover schemas, eligibility, context bounds, provider request fields, fake scenarios, validation, retries, and scheduling. pgTAP covers private access, claim concurrency, atomic completion, projection, versioning, and zero public/Trailie messages. E2E covers two users, deterministic skip, preference/constraint extraction, correction, proposal versus decision, provider failure, duplicate drain, refresh, mobile layout, no browser OpenAI request, and protected inspection.

Deferred: durable queue recovery, historical reprocessing, planning-summary generation, approval workflows, and all downstream uses of private memory.
