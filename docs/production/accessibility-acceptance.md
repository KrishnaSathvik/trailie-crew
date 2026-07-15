# Accessibility acceptance

Automated coverage uses axe WCAG 2 A/AA and WCAG 2.1 AA tags for landing, create, join, authenticated chat, and selected public/settings flows. Components cover CAPTCHA status/retry, form errors, live progress, streaming, destructive confirmations, reduced motion, and modal focus behavior.

Manual acceptance matrix (must be dated and signed before Production):

- [ ] Keyboard-only create, join, chat, plan, itinerary navigation, version history, revisions, shares, host transfer, room deletion, export, and account deletion.
- [ ] VoiceOver on macOS/iOS (or equivalent) for landmarks, streaming announcements, progress, modal initial focus/trap/Escape/restoration, CAPTCHA, errors, and destructive confirmations.
- [ ] 390×844 layout without horizontal overflow or clipped controls.
- [ ] 200% and 400% browser zoom with reflow.
- [ ] Light/dark contrast review, including destructive and disabled states.
- [ ] Reduced-motion preference: animations/transitions suppressed without removing state feedback.
- [ ] Touch targets at least 44 CSS pixels on primary controls.
- [ ] Public share, print, privacy, terms, accuracy, and support pages.

Remaining gap: automated checks do not replace assistive-technology usability. The complete manual record and any WCAG exceptions are not yet professionally accepted, so Production remains blocked.
