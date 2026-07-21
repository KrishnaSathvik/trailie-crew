# Chat Mentions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `@Trailie` show a truthful activation state in the composer, and let crew members tag each other with an autocomplete picker and chip rendering.

**Architecture:** A pure parser (`chat/lib/mentions.ts`) matches `@` runs against the room's participant list at render time, longest name first, so display names containing spaces work without storing any markup. A `MentionText` component renders segments as chips; a `MentionPicker` provides autocomplete in the composer. No schema, server action, or `detect-invocation.ts` change.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, lucide-react, Vitest + Testing Library + user-event.

**Design doc:** `docs/plans/2026-07-21-chat-mentions-design.md`

> **COMMITS ARE HELD.** The user commits their own work. Every task ends with a
> verification step, never a commit.

> **BACKWARD COMPATIBILITY:** `message-composer.test.tsx` (4 tests) and
> `message-list.test.tsx` (3 tests) render these components **without** any
> participants prop. Every new prop must be optional with a safe default, or
> those seven tests break.

---

### Task 1: The mention parser

**Files:**

- Create: `src/features/chat/lib/mentions.ts`
- Test: `src/features/chat/lib/mentions.test.ts`

**Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { segmentMentions } from "./mentions";

const participants = [
  { id: "p1", displayName: "family trip" },
  { id: "p2", displayName: "Sam" },
  { id: "p3", displayName: "Sam Smith" },
];

describe("segmentMentions", () => {
  it("matches a display name containing spaces", () => {
    expect(segmentMentions("hi @family trip ok", participants, "p9")).toEqual([
      { kind: "text", text: "hi " },
      {
        kind: "person",
        text: "@family trip",
        participantId: "p1",
        isSelf: false,
      },
      { kind: "text", text: " ok" },
    ]);
  });

  it("prefers the longest matching name", () => {
    const [segment] = segmentMentions("@Sam Smith hi", participants, "p9");
    expect(segment).toMatchObject({ participantId: "p3", text: "@Sam Smith" });
  });

  it("matches case-insensitively and renders real capitalization", () => {
    const [segment] = segmentMentions("@FAMILY TRIP", participants, "p9");
    expect(segment).toMatchObject({ text: "@family trip" });
  });

  it("marks the current participant", () => {
    const [segment] = segmentMentions("@Sam hi", participants, "p2");
    expect(segment).toMatchObject({ isSelf: true });
  });

  it("ignores an @ inside a word", () => {
    expect(
      segmentMentions("mail me at sam@example.com", participants, "p9"),
    ).toEqual([{ kind: "text", text: "mail me at sam@example.com" }]);
  });

  it("requires a boundary after the name", () => {
    expect(segmentMentions("@family trips", participants, "p9")).toEqual([
      { kind: "text", text: "@family trips" },
    ]);
  });

  it("allows trailing punctuation", () => {
    const segments = segmentMentions("@Sam!", participants, "p9");
    expect(segments[0]).toMatchObject({ participantId: "p2" });
    expect(segments[1]).toEqual({ kind: "text", text: "!" });
  });

  it("recognizes Trailie with no participants", () => {
    expect(segmentMentions("@trailie plan it", [], "p9")).toEqual([
      { kind: "trailie", text: "@Trailie" },
      { kind: "text", text: " plan it" },
    ]);
  });

  it("leaves unknown names as text", () => {
    expect(segmentMentions("@nobody hi", participants, "p9")).toEqual([
      { kind: "text", text: "@nobody hi" },
    ]);
  });
});
```

**Step 2: Run to verify failure**

Run: `pnpm vitest run src/features/chat/lib/mentions.test.ts`
Expected: FAIL — module not found.

**Step 3: Implement**

```ts
export type MentionParticipant = { id: string; displayName: string };

export type MentionSegment =
  | { kind: "text"; text: string }
  | { kind: "person"; text: string; participantId: string; isSelf: boolean }
  | { kind: "trailie"; text: string };

export const TRAILIE_MENTION_NAME = "Trailie";

/**
 * Trailie is listed first so it wins a length tie against a participant who
 * happens to be named "Trailie" — the system identity takes precedence.
 * Sorting is stable, so the remaining order follows the participant list.
 */
export function buildMentionCandidates(participants: MentionParticipant[]) {
  return [
    {
      name: TRAILIE_MENTION_NAME,
      lower: TRAILIE_MENTION_NAME.toLowerCase(),
      participantId: null as string | null,
    },
    ...participants.map((participant) => ({
      name: participant.displayName,
      lower: participant.displayName.toLowerCase(),
      participantId: participant.id as string | null,
    })),
  ].sort((a, b) => b.lower.length - a.lower.length);
}

function endsAtBoundary(body: string, index: number) {
  return index === body.length || /[\s.,!?;:]/.test(body[index]);
}

export function segmentMentions(
  body: string,
  participants: MentionParticipant[],
  currentParticipantId: string,
): MentionSegment[] {
  const candidates = buildMentionCandidates(participants);
  const lower = body.toLowerCase();
  const segments: MentionSegment[] = [];
  let textStart = 0;
  let index = 0;

  while (index < body.length) {
    if (body[index] !== "@" || (index > 0 && !/\s/.test(body[index - 1]))) {
      index += 1;
      continue;
    }
    const match = candidates.find(
      (candidate) =>
        lower.startsWith(candidate.lower, index + 1) &&
        endsAtBoundary(body, index + 1 + candidate.lower.length),
    );
    if (!match) {
      index += 1;
      continue;
    }
    if (index > textStart)
      segments.push({ kind: "text", text: body.slice(textStart, index) });
    segments.push(
      match.participantId === null
        ? { kind: "trailie", text: `@${match.name}` }
        : {
            kind: "person",
            text: `@${match.name}`,
            participantId: match.participantId,
            isSelf: match.participantId === currentParticipantId,
          },
    );
    index += 1 + match.lower.length;
    textStart = index;
  }

  if (textStart < body.length)
    segments.push({ kind: "text", text: body.slice(textStart) });
  return segments;
}
```

**Step 4: Verify**

Run: `pnpm vitest run src/features/chat/lib/mentions.test.ts`
Expected: PASS, 9 tests.

---

### Task 2: Chip rendering

**Files:**

- Create: `src/features/chat/components/mention-text.tsx`
- Test: `src/features/chat/components/mention-text.test.tsx`

**Step 1: Failing test** — assert all three variants render, and that a self
mention is styled differently from another person's.

**Step 2: Implement**

```tsx
import { Route } from "lucide-react";

import {
  segmentMentions,
  type MentionParticipant,
} from "@/features/chat/lib/mentions";

export function MentionText({
  body,
  participants = [],
  currentParticipantId = "",
}: {
  body: string;
  participants?: MentionParticipant[];
  currentParticipantId?: string;
}) {
  const segments = segmentMentions(body, participants, currentParticipantId);
  return (
    <>
      {segments.map((segment, index) => {
        const key = `${segment.kind}-${index}`;
        if (segment.kind === "text")
          return <span key={key}>{segment.text}</span>;
        if (segment.kind === "trailie")
          return (
            <span
              key={key}
              className="bg-accent-soft text-accent rounded-control mx-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 text-[0.8125rem] font-semibold"
            >
              <Route aria-hidden="true" className="size-3" />
              {segment.text}
            </span>
          );
        return (
          <span
            key={key}
            className={
              segment.isSelf
                ? "bg-accent-soft text-accent rounded-control mx-0.5 px-1.5 py-0.5 font-semibold"
                : "text-accent font-medium"
            }
          >
            {segment.text}
          </span>
        );
      })}
    </>
  );
}
```

**Step 3: Verify** — `pnpm vitest run src/features/chat/components/mention-text.test.tsx`

---

### Task 3: Render chips in the message list

**Files:**

- Modify: `src/features/chat/components/message-list.tsx:110-112`
- Test: `src/features/chat/components/message-list.test.tsx`

Add optional props `participants?: MentionParticipant[]` (default `[]`) and use
`currentParticipantId`, which the component **already receives**. Replace the
body paragraph's `{message.body}` with:

```tsx
<MentionText
  body={message.body}
  participants={participants}
  currentParticipantId={currentParticipantId}
/>
```

Leave the Trailie branch (`message.trailieResponse`) untouched.

**Verify:** `pnpm vitest run src/features/chat/components/message-list.test.tsx` — the 3 existing tests must still pass, since `participants` defaults to `[]`.

---

### Task 4: Composer activation state

**Files:**

- Modify: `src/features/chat/components/message-composer.tsx`
- Test: `src/features/chat/components/message-composer.test.tsx`

**Step 1: Failing tests** for the three states and the "Move to start" fix.

**Step 2: Implement**

```tsx
const invokesTrailie = detectTrailieInvocation({ body: draft }).invoked;
const trailieMentionedInactive =
  !invokesTrailie && /(^|\s)@trailie(?=$|[\s.,!?;:])/i.test(draft);

function moveTrailieToStart() {
  const without = draft
    .replace(/(^|\s)@trailie(?=$|[\s.,!?;:])/i, "$1")
    .replace(/\s+/g, " ")
    .trim();
  setDraft(`@Trailie ${without}`);
  onDraftActivity?.(`@Trailie ${without}`);
}
```

Frame gets a conditional accent border when `invokesTrailie`. Helper region
renders the `Route` chip when invoking, and when `trailieMentionedInactive`
renders the hint plus a **Move to start** button.

**Step 3: Verify** — all 4 original tests plus the new ones pass.

---

### Task 5: Mention autocomplete

**Files:**

- Create: `src/features/chat/components/mention-picker.tsx`
- Modify: `src/features/chat/components/message-composer.tsx`

Composer gains optional `participants = []`. Derive the active query from the
draft and caret:

```ts
function findMentionQuery(value: string, caret: number, maxNameLength: number) {
  const from = Math.max(0, caret - maxNameLength - 1);
  const slice = value.slice(from, caret);
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    if (slice[i] !== "@") continue;
    const at = from + i;
    if (at > 0 && !/\s/.test(value[at - 1])) return null;
    const query = value.slice(at + 1, caret);
    if (query.includes("\n")) return null;
    return { at, query };
  }
  return null;
}
```

Open when at least one candidate's `lower` starts with `query.toLowerCase()`.
Because `family ` is still a prefix of `family trip`, spaces keep the picker
open — this is the mechanism that makes multi-word names work.

Keyboard, in `onKeyDown`, **before** the existing Enter-to-send branch:

- `ArrowDown` / `ArrowUp` — move `activeIndex`, `preventDefault`
- `Enter` or `Tab` while open — insert, `preventDefault` (**must not send**)
- `Escape` — close

Insertion replaces `value.slice(at, caret)` with `@${name} ` and restores the
caret after the trailing space.

Accessibility: textarea carries `aria-expanded`, `aria-controls`, and
`aria-activedescendant`; the list is `role="listbox"` with `role="option"`
children.

**Verify:** picker opens on `@`, filters, inserts on Enter, and — the key
regression guard — Enter does **not** send while the picker is open.

---

### Task 6: Wire participants through

**Files:**

- Modify: `src/features/chat/components/chat-experience.tsx` (`MessageComposer` at `:733`, and the `MessageList` render site)

Pass `participants={data.participants}` to both, and
`currentParticipantId={data.currentParticipant.id}` to the composer.
`ParticipantSummary` already has `id` and `displayName`, so it satisfies
`MentionParticipant` structurally.

**Verify:** `pnpm vitest run src/features/chat`

---

### Task 7: Full verification

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format:check
```

Then drive it in the browser at `localhost:3000` (dev server is running against
local Supabase): create a trip, type `@` to confirm the picker, send a message
mentioning yourself and Trailie, and confirm the three chip treatments plus the
mid-message Trailie hint.

Report actual command output. Do not claim success without it.
