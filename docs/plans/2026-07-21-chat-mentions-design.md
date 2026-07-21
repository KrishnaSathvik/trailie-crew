# Chat mentions — design

Date: 2026-07-21
Scope: the chat composer and message list in the trip room. Phase 1 of a three
phase dashboard pass (mentions → trip room shell → settings pages).

## Problem

1. `@Trailie` has no visual activation state. `message-composer.tsx:20` already
   computes `invokesTrailie`, but the only feedback is a swapped line of helper
   text; the token itself stays plain.
2. The invocation rule is invisible. Per `detect-invocation.ts:69-70`, `@trailie`
   only invokes when it is at the **start** of the message, so
   "can you ask @trailie about this" silently does nothing.
3. There is no way to tag a crew member. No parsing, rendering, or picker
   exists; `explicit_mention` in the schema refers only to Trailie.

## Constraints discovered

- **Display names contain spaces.** The live test data has a participant called
  `family trip`. Any parser that assumes a mention is one word fails.
- **Participants are already on the client.** `chat-experience.tsx:153` builds a
  map of `id → displayName`, so a picker needs no new query.
- **No persistence.** Agreed scope: no migration, no notifications, no unread
  state.

## Architecture

Three new units, no schema or server changes.

### 1. `chat/lib/mentions.ts` — pure parser

`segmentMentions(body, participants, currentParticipantId)` returns an ordered
array of segments: `{ kind: "text" | "person" | "trailie", text, participantId?,
isSelf? }`.

Matching rules:

- A candidate `@` must be at the start of the string or preceded by whitespace.
  This is what stops `email@example.com` from matching.
- At each candidate, compare the following characters against every participant
  display name plus the literal `trailie`, **case-insensitively**.
- Candidates are sorted **longest first**, so `Sam Smith` wins over `Sam`.
- A match must be followed by end-of-string, whitespace, or `.,!?;:`.
- Comparison is done with `toLowerCase()` substring equality, **not** a regex
  built from the name — display names are user input and would otherwise need
  escaping.
- The rendered chip shows the participant's real capitalization, not what was
  typed.

Unmatched `@` runs stay as plain text, so a mention of someone who has left the
trip degrades to normal prose rather than a broken chip.

### 2. `chat/components/mention-text.tsx` — chip rendering

Renders segments. Three treatments:

| Segment    | Treatment                          | Rationale                                                                 |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `@Trailie` | Accent chip + `Route` icon         | Matches how Trailie's own messages already render (`message-list.tsx:72`) |
| `@Someone` | Quiet accent text, medium weight   | Visible without shouting                                                  |
| `@You`     | `bg-accent-soft`, accent, semibold | Findable when scanning a long thread                                      |

**Activation is a composer-only concept.** In the message list, `@Trailie`
always renders as the Trailie chip — it is a reference to Trailie regardless of
whether that particular message invoked it. Trying to re-derive invocation for
historical messages would be both wrong (reply context is not in the body) and
pointless.

Per the agreed scope, a message that mentions you gets **no** row-level marker.
`message-list.tsx:66` already uses a left accent border to mean "your own
message"; a second border meaning would overload that channel.

### 3. `chat/components/mention-picker.tsx` — autocomplete

- **Opens** when the caret sits in a mention candidate: an `@` at start or after
  whitespace, with the text between it and the caret still a case-insensitive
  prefix of at least one candidate.
- **Spaces work naturally.** `@family ` is still a prefix of `family trip`, so
  the picker stays open; it closes as soon as nothing matches. Lookback is
  capped at the longest candidate name, so it never scans the whole draft.
- **Keyboard:** Up/Down move, Enter or Tab inserts, Escape closes. Enter only
  sends when the picker is closed — this is the one behavior most likely to
  regress, so it gets an explicit test.
- **Insertion** replaces the candidate with `@DisplayName ` (trailing space).
- **Accessibility:** combobox pattern — the textarea carries `aria-expanded`,
  `aria-controls`, and `aria-activedescendant`; the list is a `listbox` of
  `option`s.

### 4. Composer activation state

Driven by the existing `detectTrailieInvocation` call, so the UI cannot
disagree with the engine:

| State                           | Frame         | Helper                                                           |
| ------------------------------- | ------------- | ---------------------------------------------------------------- |
| No mention                      | default       | "Trailie joins only when someone asks · Enter to send"           |
| Invokes                         | accent border | `Route` chip + "Trailie will answer after this message is sent"  |
| `@trailie` present, mid-message | default       | "Move @Trailie to the start to ask" + a **Move to start** button |

The third row is the honest-state case: without it the UI would look identical
whether or not Trailie is going to answer.

## Data flow

`chat-experience.tsx` passes `data.participants` and
`data.currentParticipant.id` down to both `MessageComposer` and `MessageList`.
Nothing else changes. Message bodies are stored, exported, and sent to Trailie
exactly as before — clean plain text with no markup.

## Error handling

None to add. The parser is total: any input yields segments, and an unmatched
`@` is text. An empty participant list yields a single text segment.

## Testing

- `mentions.test.ts` — names with spaces; longest-match beating a shorter
  prefix; case-insensitivity; `email@example.com` not matching; trailing
  punctuation; `@trailie`; unknown names; empty participants; a name appearing
  twice.
- `mention-text.test.tsx` — the three chip variants, and real capitalization
  winning over typed capitalization.
- `message-composer.test.tsx` — existing assertions keep passing; picker opens,
  filters, inserts; Enter does not send while the picker is open; the three
  activation states; "Move to start" rewrites the draft.
- `message-list.test.tsx` — chips render inside message bodies.
- `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check` green.

## Out of scope

- Persistence, notifications, unread badges, a mentions filter.
- Any change to `detect-invocation.ts` — the start-of-message rule is surfaced,
  not altered.
- Mentioning guests, or mentioning across trips.
- The trip room shell and settings pages (phases 2 and 3).
