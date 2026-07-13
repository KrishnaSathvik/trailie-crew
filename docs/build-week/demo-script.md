# Demo Script

## Implemented Phase 1B demo

1. Open the Trailie Crew landing page and show the functional Create and Join links.
2. Toggle light/dark with the keyboard, then open Create a Trip.
3. Create “Boundary Waters weekend” using only a display name and optional headcount—no destination, dates, budget, or preferences.
4. Enter the real Trip shell. Point out the room code, current host identity, crew list, and honest “Chat is coming next” state.
5. Copy the one-time `/join/<token>` invitation. Explain that refresh intentionally destroys the raw token and leaves only the safe short code.
6. Open the invitation in a separate browser context, attempt the host’s display name to show safe duplicate-name handling, then join with a unique name.
7. Refresh the host shell and show both crew members. Show that the member has no host invite controls.
8. Open the Trip URL in a third unauthenticated context and show the non-enumerating unavailable state.
9. Resize to 390px and show the single-column shell and Chat/Plan/Map/People navigation placeholders.

## Planned product demo

The eventual Build Week demo is expected to continue with friends discussing a trip in shared chat, observing that Trailie remains silent during ordinary conversation, explicitly invoking `@Trailie`, approving an itinerary request, and revising or exporting a validated itinerary.

That conversation-through-export continuation is not implemented and must not be demonstrated as working yet.
