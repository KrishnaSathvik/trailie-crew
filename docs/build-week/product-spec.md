# Trailie Crew Product Spec

## Product

**Trailie Crew** — “Plan trips together. Ask Trailie when you need help.”

Build Week category: **Apps for Your Life**.

## Problem

Friends plan trips in scattered conversations and documents. Decisions lose context, quieter participants get missed, and generic AI planners often produce an answer before the group has agreed on the question.

## Product direction

Trailie Crew is planned as a standalone collaborative planning space. Friends create or join a Trip, talk naturally in a shared chat, and involve Trailie only through an explicit signal. The group explicitly asks Trailie to build an itinerary when it is ready.

Create Trip and Join Trip must stay lightweight. They must not ask for destination, dates, budget, or preferences; those details emerge in the shared conversation.

## Locked assistant behavior

Trailie stays silent unless someone:

- mentions `@Trailie`;
- directly addresses Trailie;
- replies to a Trailie message; or
- invokes an explicit application action.

Silence is the default. Background summarization, if introduced, must not publish unsolicited assistant messages.

## Itinerary requirements

The planned final itinerary must be structured, schema-validated, versioned, revisable, shareable, and exportable. Claims involving price or availability must come from identified live sources; the application must not invent either.

## System boundary

Trailie Crew is separate from TrailVerse in code, deployment, and data. A future TrailVerse integration is read-only and must pass through `@trailie/trailverse-adapter` or an equivalent API boundary.

## Phase 0 status

Implemented: repository tooling, typed package boundaries, design tokens, the minimal landing shell, one branding test, CI, and foundation documentation.

Planned: every collaborative, persistence, AI, planning, itinerary, sharing, export, map, places, parks, pricing, and availability capability described above.
