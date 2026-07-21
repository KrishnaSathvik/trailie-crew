# Public pages UI/UX pass — design

Date: 2026-07-21
Scope: the seven public pages — landing, `/join`, `/trips/create`, `/support`,
`/privacy`, `/terms`, `/accuracy`.

## Problem

The seven public pages run on three unrelated shells. The two pages where a
stranger enters data are the two with no footer and no route to the trust pages,
and the two longest legal documents can only be read by scrolling. Specifically:

1. `/join` and `/trips/create` use a bespoke header in `trip-entry-layout.tsx`
   (brand + theme toggle) and render **no footer**. Privacy, Terms, Accuracy,
   and Support are unreachable from them.
2. That layout centers its grid vertically, so on a tall window the content
   floats mid-page inside large voids.
3. Its left panel repeats landing-page marketing instead of answering the
   joiner's real question: _where do I find the trip code?_
4. "Security check complete." renders as bare body copy above the submit button
   and reads as a stray sentence rather than a status.
5. `LegalSection` emits no `id`, so no legal section can be linked or jumped to.
   Terms has 13 sections; Privacy has 9.
6. Support is not a versioned legal document but wears the legal chrome,
   including a "Last updated" badge, and its five contact routes sit below a
   warning callout inside a narrow column.
7. The landing hero stacks four text blocks before anything actionable, one of
   which restates the `h1`.
8. `Field` sets `mb-2` on its label inside a `space-y-2` wrapper — a doubled gap.
9. Long-form legal body is `text-sm`.

## Approach

A structural pass. Fix the causes rather than the symptoms, keeping the existing
design tokens, typography, and component vocabulary untouched. Three page
archetypes, all on one shell.

### 1. One shell for all seven pages

Every public page gets `MarketingHeader` + `MarketingFooter`. This alone
resolves problems 1 and 6, and it is what makes the trust nav reachable from the
entry forms. `MarketingFooter` already carries
`<nav aria-label="Trust, legal, and support">`, which is what `trust-pages.test.tsx`
asserts, so the assertion holds everywhere it is added.

### 2. Entry pages — `trip-entry-layout.tsx` rewritten

Single centered column, top-anchored.

- Delete the bespoke header and the marketing side card.
- `flex min-h-dvh flex-col` with `MarketingHeader`, a `flex-1` content region,
  and `MarketingFooter`.
- Content column: `max-w-md`, horizontally centered, `py-12 sm:py-16` — not
  `items-center`. This is what removes the dead space.
- Heading block (eyebrow / `h1` / description) centered above the form.
- The form moves into a bordered surface card
  (`border-border bg-surface-raised rounded-card shadow-soft border p-6 sm:p-8`)
  so it has presence in a centered column instead of floating.
- A muted "what happens next" line sits below the card.
- The mobile-only "Back" link is removed; the header brand now covers it.

Contextual help replaces the marketing card:

- `/join` — a `<details>` disclosure under the trip-code field: "Where do I find
  this?" explaining that the host sends a link by message or email, and that a
  Trip code is 8 characters.
- `/create` — nothing new. The `hint` prop on the crew-size field already does
  this job.

**Rejected:** styling the trip-code input as mono/uppercase. `parseInviteValue`
accepts _either_ a code or a full join URL, so a `text-transform: uppercase`
would render pasted links in caps. The field stays plain.

### 3. `Field` and the captcha status

- `form-controls.tsx` — drop `mb-2` from the label; the `space-y-2` wrapper
  already spaces it. Add an optional `trailing` slot for the disclosure.
- `captcha-challenge.tsx` — the status `<p>` becomes a compact status row: a
  small icon plus `text-xs` text, with the check mark in `text-positive` when
  complete. **The status strings, `role="status"`, and `aria-live="polite"` are
  unchanged**, so the existing assertions in `captcha-challenge.test.tsx`
  continue to hold. This is styling only.

### 4. Legal pages — `legal-page.tsx` becomes a document shell

Keep the side-heading subgrid layout; it already scans well. Add navigation:

- `LegalSection` slugifies its `title` into an `id` and gets `scroll-mt-20` so
  the sticky header does not cover the target.
- `LegalPage` takes `sections: readonly string[]` and renders an "On this page"
  jump list under the last-updated badge, using the same slugify helper.
- A "Back to top" link closes the article.
- Body type goes from `text-sm` to `text-[0.9375rem]`, keeping `leading-7`.

The jump list and the sections derive their slugs from the same helper, but they
are declared in two places and could drift. A test asserting that every jump
link resolves to a real section `id`, on every page, removes that risk.

### 5. Support gets its own layout

Support is an action page, not a versioned document.

- Same shell, but no "Last updated" badge.
- The emergency callout stays directly under the header — it is the one thing a
  reader must not miss.
- The five contact routes become the primary content: a two-column card grid at
  full article width rather than a list inside a narrow column.
- The three short prose sections (reply time, what to include, public bug
  reports) follow in the side-heading grid, since they are secondary.

### 6. Landing rhythm

- Cut the hero's bold restatement line, "Plan trips together. Ask Trailie when
  you need help." It compresses the description directly above it. The microcopy
  under the CTAs stays — it genuinely lowers friction. **This requires updating
  `page.test.tsx`, which asserts that exact string.**
- Alternate section surfaces to break the eyebrow → title → bordered-grid
  monotony: "How it works" on `bg-surface`, "Why Trailie Crew" on
  `bg-background`, the closing CTA on `bg-subtle`. Rhythm with no new
  components.

## Data flow

None. Every change is presentational. Forms, server actions, schemas, and all
captcha logic are untouched apart from the styling of the status row.

## Error handling

Unchanged. The `role="alert"` block on both forms keeps its markup and its
`tabIndex={-1}` focus target; it simply moves inside the new form card.

## Testing

- `page.test.tsx` — update the assertion for the removed hero line.
- `trust-pages.test.tsx` — continues to pass, since all four pages keep the
  footer nav. Add: every "On this page" link resolves to an existing section id.
- `captcha-challenge.test.tsx` — status strings unchanged; assertions hold.
- New: a test asserting `/join` and `/trips/create` render the trust nav, as a
  regression guard against the missing footer returning.
- `pnpm test`, `pnpm lint`, `pnpm typecheck` green.
- Visual check of all seven pages at 390px, 1280px, and 2560px, in both themes.

## Out of scope

- No new color or type tokens; no change to the green/off-white system.
- No animation or motion work.
- No changes to in-app trip surfaces beyond `/trips/create`, nor to share or
  guest pages.
- No copy rewrites beyond the one redundant hero line.
- No scroll-spy or sticky table of contents.
