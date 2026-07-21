# Demo Script

## Phase 4A

Open Version 1, choose **Change this** on Glacier Point, request a later time, and show both users receiving impact analysis. Demonstrate one `all_active` approval is insufficient. After both approve, show validation repairing an overlap, the final diff, both confirmations, Version 2, unchanged read-only Version 1, and mobile comparison.

## Phase 4B immutable sharing moment

1. Keep the private room visibly on published Version 2.
2. Open history, select read-only Version 1, and choose **Create share link**.
3. Open the one-time opaque URL in a signed-out browser. Show **Pinned Version 1**, the public-safe itinerary, validation badge, and no-booking disclaimer; point out that crew, chat, approvals, and private notes are absent.
4. Return to the private room and show it remains on Version 2. The public link has not followed it.
5. From historical Version 1, download the calendar and open **Print or Save PDF**. Show Version 1 in the calendar UIDs/content and print footer.
6. Create a separate Version 2 link. Verify the Version 1 link still displays Version 1.
7. Revoke Version 1, refresh the public browser, and show the generic unavailable state immediately.

The local demo uses real Auth, PostgreSQL, RLS, token hashing, server verification, and browser isolation. PDF is the browser's print-to-PDF path, not a claimed server-generated artifact.

## Implemented Phase 2A demo

1. Open two isolated browser contexts as Maya and Leo in the same Trip. Show the shared persisted chat, online crew state, and restrained monochrome UI.
2. Have Maya and Leo exchange ordinary planning messages. Point out that Trailie remains silent and no AI request occurs.
3. Type an inline-code mention and a fenced-code mention. Show that each persists as ordinary crew chat without invocation.
4. Type `Let's ask @Trailie to compare driving and flying`. Before sending, show the concise composer helper and that a mention works mid-message. Send once.
5. In Maya's window, show the private “Trailie is answering…” streamed state. Explain that it is not a fake Realtime presence identity and Leo does not see another user's partial stream.
6. Show the one final Trailie message appear in both windows through the existing Supabase Realtime reconciliation. Its reply preview links it to Maya's source message.
7. Refresh both windows and show exactly one persisted Trailie response. Replay/duplicate submission does not create another answer.
8. Send `Hey Trailie, can you explain what to pack?` to demonstrate direct address. Then reply normally to a persisted Trailie message to demonstrate the reply signal.
9. Trigger the deterministic fake-provider failure in local test mode. Show that Maya's original crew message remains, no fake Trailie message persists, and Retry creates one successful response without resending the crew message.
10. Open the Trip URL as an outsider and show the non-enumerating unavailable state.
11. Resize to 390×844, toggle light/dark, use keyboard send, and confirm there is no horizontal overflow or browser error.

For the repeatable demo and automated suite, only the external OpenAI provider is fake. Auth, PostgreSQL, RLS, RPCs, Realtime, two browser sessions, streaming endpoint, and persisted reconciliation are real local application behavior.

## Deferred Phase 2A product demo

Do not demonstrate itinerary generation, approval, travel research, maps, live prices/availability, memory extraction, autonomous agents, sharing, or exports. Those capabilities are not implemented in Phase 2A.

## Phase 2B silent-memory beat

1. Send “lol” and note that chat remains ordinary; the deterministic filter skips it.
2. Send “I prefer hiking and I cannot travel before Friday.” Only the human message appears.
3. Correct it with “Actually, I prefer kayaking.” Again, no Trailie response appears.
4. Have another member say “Maybe Yosemite?” and explain that it remains a proposal.
5. Send “We all decided on Yosemite” to demonstrate the conservative explicit-decision path.
6. Emphasize that private inspection is test-only; the production UI deliberately exposes none of this memory yet.

## Phase 3A approval moment

1. From Maya's desktop Plan area, select **Build Our Itinerary** and show the honest organizing state.
2. Reveal **Before I build the trip** with confirmed decisions, individual preferences, constraints, proposals, conflicts, open questions, missing information, and non-assumptions kept distinct.
3. Approve as Maya under `all_active`; show that the request remains pending for Alex.
4. Approve as Alex in the second context. Show **Summary approved** and the explicit statement that itinerary generation has not started.
5. Send a new material preference in Chat. Return to Plan and show the stale warning and blocked approval.
6. Regenerate to immutable Version 2 and show prior approvals do not carry forward.
7. Demonstrate a required change note and the host-only variant, then resize the functional Plan tab to 390×844.

The local provider is deterministic, while Auth, PostgreSQL, RLS, RPCs, private memory, polling, and both browser sessions remain real. Do not demonstrate an itinerary; Phase 3A stops at `approved_for_generation`.

## Phase 3B validation moment

1. From the genuinely approved summary, select **Generate Itinerary** twice quickly and show only Version 1.
2. Switch to Chat while semantic progress continues, then return to Plan.
3. Explain the deterministic fixture: the first draft put a 4:00 PM stop after a 3:00 PM activity with a verified two-hour drive.
4. Show the published itinerary and “Trailie adjusted the schedule after checking travel time.”
5. Open Day-by-day, Travel, Stay, Food, and Validation. Point out unknown costs, recommendation-only lodging, evidence recency, and no booking claim.
6. Refresh and show the same immutable version in both crew contexts; resize to 390×844 and confirm the Plan tab and subnavigation remain usable.

Only model and travel providers are faked locally. Auth, PostgreSQL, RLS, progress state, validation, repair state, and publication are real.

## Phase 5A protected Preview demo

Use only the Vercel Authentication-protected Preview and the dedicated non-production Supabase project. Demonstrate the accepted two-user path from ordinary silent chat through focused Trailie, memory correction, approved planning summary, published Version 1, bounded revision to Version 2, historical Version 1 sharing, ICS, print/Save as PDF, and immediate share revocation. Keep private test message content and tokens out of screenshots and logs.

Call out the controlled conditions: Mapbox evidence is unavailable rather than verified, CAPTCHA is not configured, recovery is manually invoked through the protected endpoint, and the Supabase Free project has no automatic backup/PITR. Do not describe this Preview as a Production deployment or an unrestricted public launch.
