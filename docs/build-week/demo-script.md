# Demo Script

## Implemented Phase 1C demo

1. Open the Trailie Crew landing page and show the functional Create and Join links.
2. Toggle light/dark with the keyboard, then open Create a Trip.
3. Create “Boundary Waters weekend” using only a display name and optional headcount—no destination, dates, budget, or preferences.
4. Enter the real Trip shell. Point out the room code, current host identity, empty shared conversation, and composer.
5. Copy the one-time `/join/<token>` invitation. Explain that refresh intentionally destroys the raw token and leaves only the safe short code.
6. Open the invitation in a separate browser context, attempt the host’s display name to show safe duplicate-name handling, then join with a unique name.
7. Refresh the host shell and show both crew members. Wait for the two-person online count; show that the member has no host invite controls.
8. Type in the member window and show the host’s short-lived typing indicator. Send a message, reply from the second window, and show both arrive without refresh.
9. Add one of the five canonical reactions and show it update in both contexts. Mention that the database stores the canonical value rather than an arbitrary emoji.
10. Send `@Trailie` and show that it remains an ordinary persisted user message: Phase 1C intentionally produces no assistant response.
11. Refresh and show that messages, reply previews, and reactions persist. Use a prepared long-history Trip to show “Load earlier messages” without replacing the newest page.
12. Open the Trip URL in a third unauthenticated context and show the non-enumerating unavailable state.
13. Resize to 390×844, show the composer above navigation, open the People drawer, toggle both themes, and confirm there is no horizontal overflow.

## Planned product demo

The eventual Build Week demo is expected to continue from the implemented shared chat by explicitly invoking Trailie, approving an itinerary request, and revising or exporting a validated itinerary.

Trailie invocation through export is not implemented and must not be demonstrated as working yet.
