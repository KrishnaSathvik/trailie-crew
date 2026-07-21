# Public Pages UI/UX Pass — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Put all seven public pages on one shell, rebuild the entry pages as a centered single column, and make the legal documents navigable.

**Architecture:** Three page archetypes over a single `MarketingHeader`/`MarketingFooter` shell. `trip-entry-layout.tsx` is rewritten from a vertically-centered two-column split to a top-anchored centered column. `legal-page.tsx` grows section anchors and a jump list. Support keeps the legal shell but drops the version badge and promotes its contact routes to full article width. All changes are presentational — no server actions, schemas, or captcha logic change.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Tailwind v4 (CSS-first `@theme`), lucide-react, Vitest + Testing Library, pnpm.

**Design doc:** `docs/plans/2026-07-21-public-pages-ux-design.md`

> **COMMITS ARE HELD.** The user asked that nothing be committed yet. Each task
> ends with a verification step, not a commit. Task 9 does the commit, and only
> after the user gives the word.

---

### Task 1: Entry pages get the shared shell

**Files:**

- Modify: `src/features/trips/components/trip-entry-layout.tsx` (full rewrite)
- Modify: `src/app/join/page.tsx`
- Modify: `src/app/trips/create/page.tsx`
- Test: `src/features/trips/components/trip-entry-layout.test.tsx` (create)

**Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TripEntryLayout } from "./trip-entry-layout";

describe("TripEntryLayout", () => {
  it("gives entry pages the shared trust navigation", () => {
    render(
      <TripEntryLayout
        eyebrow="Join a Trip"
        title="Find your crew."
        description="Use the invitation link your host shared."
        footnote="Next: pick the name your crew will see."
      >
        <form aria-label="Join" />
      </TripEntryLayout>,
    );

    expect(
      screen.getByRole("navigation", { name: /trust, legal/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "Find your crew." }),
    ).toBeVisible();
    expect(screen.getByRole("form", { name: "Join" })).toBeVisible();
  });
});
```

**Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/features/trips/components/trip-entry-layout.test.tsx`
Expected: FAIL — no `navigation` named "Trust, legal, and support", because the current layout renders no footer.

**Step 3: Rewrite the layout**

Replace the whole of `trip-entry-layout.tsx`:

```tsx
import type { ReactNode } from "react";

import { MarketingFooter } from "@/components/shared/marketing-footer";
import { MarketingHeader } from "@/components/shared/marketing-header";

export function TripEntryLayout({
  eyebrow,
  title,
  description,
  footnote,
  showCreateCta = true,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  footnote: string;
  showCreateCta?: boolean;
  children: ReactNode;
}) {
  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col">
      <a href="#entry-heading" className="skip-link">
        Skip to form
      </a>
      <MarketingHeader showCreateCta={showCreateCta} />

      {/* Top-anchored, not vertically centered: centering parks the form in the
          middle of a tall window with large voids above and below it. */}
      <div className="mx-auto w-full max-w-md flex-1 px-5 py-12 sm:py-16">
        <p className="eyebrow text-center">{eyebrow}</p>
        <h1
          id="entry-heading"
          className="mt-4 text-center text-4xl font-semibold tracking-[-0.055em] text-balance sm:text-5xl"
        >
          {title}
        </h1>
        <p className="text-muted-foreground mt-4 text-center text-sm leading-6 text-pretty">
          {description}
        </p>

        <div className="border-border bg-surface-raised rounded-card shadow-soft mt-9 border p-6 sm:p-8">
          {children}
        </div>

        <p className="text-muted-foreground mt-5 text-center text-xs leading-5">
          {footnote}
        </p>
      </div>

      <MarketingFooter />
    </main>
  );
}
```

Note what is deliberately gone: the bespoke `<header>`, the `ThemeToggle` (the shared header owns it now), the `Route` icon marketing card, and the mobile-only "Back" link (the header brand replaces it).

**Step 4: Pass the new `footnote` prop from both pages**

`src/app/join/page.tsx`:

```tsx
import { JoinTripForm } from "@/features/trips/components/join-trip-form";
import { TripEntryLayout } from "@/features/trips/components/trip-entry-layout";

export default function JoinTripPage() {
  return (
    <TripEntryLayout
      eyebrow="Join a Trip"
      title="Find your crew."
      description="Use the private invitation link or Trip code your host shared, then choose the name your crew will see."
      footnote="Next: your crew's chat, with everything they have planned so far."
    >
      <JoinTripForm />
    </TripEntryLayout>
  );
}
```

`src/app/trips/create/page.tsx` — same shape, plus `showCreateCta={false}` so the header does not offer the action you are already taking:

```tsx
    <TripEntryLayout
      eyebrow="Create a Trip"
      title="Start with a trip name."
      description="That is all you need for now. Your crew can work out destinations, dates, and priorities together."
      footnote="Next: invite your crew and start talking it through."
      showCreateCta={false}
    >
```

**Step 5: Run the test and make sure it passes**

Run: `pnpm vitest run src/features/trips/components/trip-entry-layout.test.tsx`
Expected: PASS, 1 test.

---

### Task 2: Fix the doubled label gap and add a `trailing` slot

**Files:**

- Modify: `src/features/trips/components/form-controls.tsx:32` and the `Field` signature

**Step 1: Change the label class**

`mb-2` on the label duplicates the parent's `space-y-2`. Drop it:

```tsx
<label htmlFor={id} className="block text-sm font-semibold">
  {label}
</label>
```

**Step 2: Add the `trailing` slot**

Add `trailing` to the destructure and the type:

```tsx
export function Field({
  id,
  label,
  hint,
  error,
  trailing,
  ...inputProps
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  trailing?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
```

Render it as the last child of the wrapper, after the error paragraph:

```tsx
      {error ? (
        <p
          id={`${id}-error`}
          className="text-destructive text-sm font-medium"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {trailing}
    </div>
```

**Step 3: Verify nothing regressed**

Run: `pnpm vitest run src/features/trips`
Expected: PASS — `trailing` is optional, so every existing call site is unaffected.

---

### Task 3: Answer "where do I find the trip code?"

**Files:**

- Modify: `src/features/trips/components/join-trip-form.tsx:134-142`

**Step 1: Attach the disclosure to the invite field**

This is the help the old marketing card should have been giving. Add `trailing` to the existing `Field`:

```tsx
<Field
  id="inviteValue"
  name="inviteValue"
  label="Trip code or invitation link"
  autoComplete="off"
  spellCheck={false}
  placeholder="ABCD2345 or an invitation link"
  error={fieldErrors.inviteValue}
  trailing={
    <details className="text-muted-foreground text-xs leading-5">
      <summary className="hover:text-foreground focus-visible:ring-ring cursor-pointer rounded-sm font-medium focus-visible:ring-2 focus-visible:outline-none">
        Where do I find this?
      </summary>
      <p className="mt-2">
        Your host sends an invitation link by message or email. A Trip code is 8
        characters, like ABCD2345. Either one works here.
      </p>
    </details>
  }
/>
```

Leave the input itself plain. `parseInviteValue` accepts a code _or_ a full join
URL, so a mono/uppercase treatment would render pasted links in capitals.

**Step 2: Verify**

Run: `pnpm vitest run src/features/trips`
Expected: PASS.

---

### Task 4: Make the captcha status read as a status

**Files:**

- Modify: `src/features/security/components/captcha-challenge.tsx:160-175`

**Step 1: Check what the existing test asserts**

Run: `pnpm vitest run src/features/security/components/captcha-challenge.test.tsx`
Expected: PASS. Note which strings it matches — this task must not change any of them.

**Step 2: Restyle the status paragraph**

Add `Check` and `ShieldCheck` to the lucide import at the top of the file, then replace the status `<p>`:

```tsx
<p
  role="status"
  aria-live="polite"
  className="text-muted-foreground flex items-center gap-1.5 text-xs leading-5"
>
  {status === "completed" ? (
    <Check aria-hidden="true" className="text-positive size-3.5 shrink-0" />
  ) : (
    <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
  )}
  {status === "completed"
    ? "Security check complete."
    : status === "expired"
      ? "The security check expired."
      : "Complete the security check."}
</p>
```

The three strings, `role="status"`, and `aria-live="polite"` are all unchanged.
Only the type size, the icon, and the layout change.

**Step 3: Run the test again**

Run: `pnpm vitest run src/features/security/components/captcha-challenge.test.tsx`
Expected: PASS, same count as Step 1. If anything fails, the assertion depended on layout rather than text — fix the style, not the test.

---

### Task 5: Legal pages get anchors and a jump list

**Files:**

- Modify: `src/components/shared/legal-page.tsx`
- Modify: `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/accuracy/page.tsx`
- Test: `src/app/trust-pages.test.tsx`

**Step 1: Write the failing drift test**

Append inside the existing `describe` in `trust-pages.test.tsx`:

```tsx
it.each([
  ["Privacy notice", PrivacyPage],
  ["Terms of use", TermsPage],
  ["Accuracy and availability", AccuracyPage],
])("points every jump-list link at a real section on %s", (_title, Page) => {
  const { container } = render(<Page />);

  const nav = container.querySelector('nav[aria-label="On this page"]');
  expect(nav).not.toBeNull();

  const links = [...nav!.querySelectorAll("a")];
  expect(links.length).toBeGreaterThan(1);

  for (const link of links) {
    const id = link.getAttribute("href")?.slice(1) ?? "";
    expect(id).not.toBe("");
    expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
  }
});
```

**Step 2: Run it to make sure it fails**

Run: `pnpm vitest run src/app/trust-pages.test.tsx`
Expected: FAIL — `nav[aria-label="On this page"]` is null; no jump list exists yet.

**Step 3: Add the slug helper and section anchors**

In `legal-page.tsx`, add above `LegalPage`:

```tsx
/** Shared by the jump list and the sections so both derive the same anchor. */
export function slugifySectionTitle(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
```

Curly quotes matter here: `What “Verified” means` must slug to
`what-verified-means`. The `\p{Letter}` class handles that.

Give `LegalSection` the id and a scroll offset clearing the sticky header:

```tsx
    <section
      id={slugifySectionTitle(title)}
      className="border-border grid scroll-mt-20 gap-3 border-t pt-5 sm:col-span-2 sm:grid-cols-subgrid"
    >
```

**Step 4: Add the jump list, the intro slot, and the back-to-top link**

`LegalPage` gains three optional props. `lastUpdated` becomes optional so
Support can omit the version badge, and `intro` renders full-width content
between the header and the section grid.

```tsx
export function LegalPage({
  title,
  summary,
  lastUpdated,
  sections,
  intro,
  children,
}: {
  title: string;
  summary: string;
  lastUpdated?: string;
  sections?: readonly string[];
  intro?: ReactNode;
  children: ReactNode;
}) {
```

Make the badge conditional:

```tsx
{
  lastUpdated ? (
    <p className="text-muted-foreground border-border mt-6 inline-flex rounded-full border px-3 py-1 font-mono text-[0.6875rem]">
      Last updated {lastUpdated}
    </p>
  ) : null;
}
```

Then, directly after it:

```tsx
{
  sections && sections.length > 1 ? (
    <nav
      aria-label="On this page"
      className="border-border bg-surface rounded-card mt-8 border p-4"
    >
      <p className="eyebrow">On this page</p>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {sections.map((sectionTitle) => (
          <li key={sectionTitle}>
            <a
              href={`#${slugifySectionTitle(sectionTitle)}`}
              className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              {sectionTitle}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  ) : null;
}

{
  intro;
}
```

Bump the reading size on the grid wrapper (`text-sm` → 15px):

```tsx
<div className="legal-copy mt-10 grid gap-8 text-[0.9375rem] leading-7 sm:grid-cols-[13rem_minmax(0,1fr)]">
  {children}
</div>
```

And close the article with back-to-top, after the grid:

```tsx
<a
  href="#legal-content"
  className="text-muted-foreground hover:text-foreground mt-10 inline-flex items-center gap-1.5 text-xs font-medium"
>
  <ArrowUp aria-hidden="true" className="size-3.5" />
  Back to top
</a>
```

Add `import { ArrowUp } from "lucide-react";` at the top.

**Step 5: Declare the section lists on the three document pages**

Each page gets a `const sections` above its component, listing its
`LegalSection` titles **verbatim** and in order, then passes `sections={sections}`.

`src/app/accuracy/page.tsx`:

```tsx
const sections = [
  "What “Verified” means",
  "Check with the official source",
  "No booking",
  "Availability",
  "Report a problem",
] as const;
```

`src/app/privacy/page.tsx`:

```tsx
const sections = [
  "What this covers",
  "Information we use",
  "Companies that process data for us",
  "Cookies and analytics",
  "Where data is handled",
  "How long we keep it",
  "Your choices",
  "Sharing",
  "Protection and contact",
] as const;
```

`src/app/terms/page.tsx`:

```tsx
const sections = [
  "Who can use Trailie Crew",
  "Trips and ownership",
  "Acceptable use",
  "Sharing with guests and the public",
  "Planning only",
  "Your responsibilities",
  "Trailie’s limits",
  "Content and intellectual property",
  "Availability and changes",
  "Ending your use",
  "No warranty",
  "Limits on liability",
  "Contact",
] as const;
```

Copy these from the source rather than retyping — the curly apostrophe in
"Trailie’s limits" and the curly quotes in "What “Verified” means" must match
the `LegalSection title` exactly or the drift test will catch it.

**Step 6: Run the test and make sure it passes**

Run: `pnpm vitest run src/app/trust-pages.test.tsx`
Expected: PASS. The original four-page assertion still passes because every page keeps `MarketingFooter` and its trust nav.

---

### Task 6: Support becomes an action page

**Files:**

- Modify: `src/app/support/page.tsx`
- Test: `src/app/trust-pages.test.tsx` (existing assertion must keep passing)

**Step 1: Restructure the page**

The five contact routes are the payload; move them out of a narrow column into
a full-width card grid via the new `intro` slot, drop `lastUpdated`, and delete
the now-redundant "Where to write" section (its lead sentence moves above the
cards). Keep `routes` and `tracker` exactly as they are.

```tsx
const sections = [
  "When to expect a reply",
  "What to include",
  "Public bug reports",
] as const;

export default function SupportPage() {
  return (
    <LegalPage
      title="Support"
      summary="Get help with Trailie Crew, report a concern, or ask about your privacy."
      sections={sections}
      intro={
        <>
          <LegalCallout>
            Trailie Crew is not an emergency or safety service. For urgent
            situations, contact local emergency services, official
            transportation or park authorities, or your travel booking company
            directly.
          </LegalCallout>

          <p className="text-muted-foreground mt-8 max-w-2xl text-[0.9375rem] leading-7">
            Email is the fastest route. Pick the address that matches what you
            need so it reaches the right place.
          </p>

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {routes.map(({ need, address, detail }) => (
              <li
                key={need}
                className="border-border bg-surface rounded-card border p-4"
              >
                <p className="text-foreground text-sm font-semibold">{need}</p>
                <p className="text-muted-foreground mt-1 text-sm leading-6">
                  {detail}
                </p>
                <p className="mt-3 text-sm">
                  <ContactLink address={address} />
                </p>
              </li>
            ))}
          </ul>
        </>
      }
    >
      <LegalSection title="When to expect a reply">…unchanged…</LegalSection>

      <LegalSection title="What to include">…unchanged…</LegalSection>

      <LegalSection title="Public bug reports">…unchanged…</LegalSection>
    </LegalPage>
  );
}
```

`LegalCallout` carries `sm:col-span-2`, which is inert outside a grid — reusing
it here keeps one callout style across all four trust pages.

**Step 2: Verify the trust-page contract still holds**

Run: `pnpm vitest run src/app/trust-pages.test.tsx`
Expected: PASS. Support keeps `MarketingFooter`, so
`getByRole("navigation", { name: /trust, legal/i })` still resolves — and it
stays unambiguous because the jump-list nav is named "On this page".

---

### Task 7: Landing hero and section rhythm

**Files:**

- Modify: `src/app/page.tsx:91-93`, `:132`, `:193`
- Modify: `src/app/page.test.tsx:21-23`

**Step 1: Delete the redundant hero line**

Remove this block entirely — it compresses the description directly above it:

```tsx
<p className="mt-5 text-sm font-semibold">
  Plan trips together. Ask Trailie when you need help.
</p>
```

**Step 2: Update the test that asserts it**

Delete this assertion from `page.test.tsx`:

```tsx
expect(
  screen.getByText("Plan trips together. Ask Trailie when you need help."),
).toBeInTheDocument();
```

**Step 3: Run the test to confirm it fails without the fix, then passes**

Run: `pnpm vitest run src/app/page.test.tsx`
Expected: PASS. (If run before Step 2, expected FAIL with "Unable to find an element with the text".)

**Step 4: Alternate the section surfaces**

Three consecutive sections currently share one background, so they read as one
undifferentiated column. Two class edits fix the rhythm.

`page.tsx:132` — "How it works" onto the raised surface:

```tsx
className = "border-border bg-surface scroll-mt-16 border-y";
```

`page.tsx:193` — the closing CTA onto the subtle surface:

```tsx
        <section className="border-border bg-subtle border-t">
```

"Why Trailie Crew" stays on `bg-background`, giving background → surface →
background → subtle down the page.

**Step 5: Verify**

Run: `pnpm vitest run src/app`
Expected: PASS.

---

### Task 8: Full verification sweep

**Step 1: Run everything**

```bash
pnpm test && pnpm lint && pnpm typecheck
```

Expected: all three green. Report actual output — do not claim success without it.

**Step 2: Visual check**

Start the app (`pnpm dev`) and walk all seven routes — `/`, `/join`,
`/trips/create`, `/support`, `/privacy`, `/terms`, `/accuracy` — at 390px,
1280px, and 2560px wide, in both light and dark themes.

Confirm specifically:

- `/join` and `/trips/create` show the full header nav and the footer trust links.
- Neither entry page has a large empty band above or below the form.
- "Security check complete." reads as a status row, not a sentence.
- Every "On this page" link jumps to its section, and the sticky header does not cover the heading it lands on.
- Support shows no "Last updated" badge and its five contact cards sit two-across from `sm` up.

**Step 3: Report**

State what passed and what did not, with the command output. If anything fails, fix it before Task 9.

---

### Task 9: Commit — ONLY after the user says so

Commits are held at the user's request. When they give the word:

```bash
git add docs/plans/2026-07-21-public-pages-ux-design.md \
        docs/plans/2026-07-21-public-pages-ux-plan.md \
        src/app/page.tsx src/app/page.test.tsx \
        src/app/join/page.tsx src/app/trips/create/page.tsx \
        src/app/support/page.tsx src/app/privacy/page.tsx \
        src/app/terms/page.tsx src/app/accuracy/page.tsx \
        src/app/trust-pages.test.tsx \
        src/components/shared/legal-page.tsx \
        src/features/trips/components/trip-entry-layout.tsx \
        src/features/trips/components/trip-entry-layout.test.tsx \
        src/features/trips/components/form-controls.tsx \
        src/features/trips/components/join-trip-form.tsx \
        src/features/security/components/captcha-challenge.tsx
```

Note the working tree already carries an unrelated in-flight refresh
(`marketing-header.tsx`, `marketing-footer.tsx`, `product-preview.tsx`,
`site-configuration.ts`, and others). Ask the user whether those belong in the
same commit before staging them.
