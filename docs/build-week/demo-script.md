# Demo Script

## Implemented Phase 2A demo

1. Open two isolated browser contexts as Maya and Leo in the same Trip. Show the shared persisted chat, online crew state, and restrained monochrome UI.
2. Have Maya and Leo exchange ordinary planning messages. Point out that Trailie remains silent and no AI request occurs.
3. Type `We can ask @Trailie later`, an inline-code mention, or a fenced-code mention. Show that each persists as ordinary crew chat without invocation.
4. Type `@Trailie help us compare driving and flying`. Before sending, show the concise composer helper. Send once.
5. In Maya's window, show the private “Trailie is answering…” streamed state. Explain that it is not a fake Realtime presence identity and Leo does not see another user's partial stream.
6. Show the one final Trailie message appear in both windows through the existing Supabase Realtime reconciliation. Its reply preview links it to Maya's source message.
7. Refresh both windows and show exactly one persisted Trailie response. Replay/duplicate submission does not create another answer.
8. Send `Hey Trailie, can you explain what to pack?` to demonstrate direct address. Then reply normally to a persisted Trailie message to demonstrate the reply signal.
9. Trigger the deterministic fake-provider failure in local test mode. Show that Maya's original crew message remains, no fake Trailie message persists, and Retry creates one successful response without resending the crew message.
10. Open the Trip URL as an outsider and show the non-enumerating unavailable state.
11. Resize to 390×844, toggle light/dark, use keyboard send, and confirm there is no horizontal overflow or browser error.

For the repeatable demo and automated suite, only the external OpenAI provider is fake. Auth, PostgreSQL, RLS, RPCs, Realtime, two browser sessions, streaming endpoint, and persisted reconciliation are real local application behavior.

## Deferred product demo

Do not demonstrate itinerary generation, approval, travel research, maps, live prices/availability, memory extraction, autonomous agents, sharing, or exports. Those capabilities are not implemented in Phase 2A.
