# Map accessibility

The itinerary is the complete non-map equivalent. Every marker has a matching
ordered list entry, every route has distance/duration/state text, and every
warning remains available in the evidence view. No task requires manipulating
the map canvas.

Implemented controls:

- Skip map link and labeled itinerary/map regions;
- keyboard-accessible day filters and itinerary selection;
- DOM marker buttons for ordinary marker counts;
- live selected-place announcement;
- text verification/freshness/privacy status rather than color-only meaning;
- 44px mobile mode and sheet controls;
- Map/Plan modes with collapsed, half, and expanded sheet states;
- Escape collapses the sheet, then clears selection;
- no map focus trap, compass, pitch, or rotation dependency;
- reduced motion for camera, scrolling, and sheet transitions;
- explicit offline, no-coordinate, disabled, and SDK failure text.

Mapbox clustered markers are a visual density aid; the itinerary list remains
the keyboard and screen-reader equivalent. Popups contain concise safe text,
use the SDK close control, and selection already focuses the matching card.

Acceptance includes automated axe coverage, component keyboard/focus coverage,
390×844 browser coverage, and horizontal-overflow checks. Manual release review
must still cover VoiceOver, keyboard-only traversal, 200%/400% zoom, high
contrast, sheet scroll/pan isolation, and real-device safe areas before
unrestricted Production.
