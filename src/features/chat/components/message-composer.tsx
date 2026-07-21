"use client";

import { Route, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  buildMentionCandidates,
  TRAILIE_MENTION_NAME,
  type MentionParticipant,
} from "@/features/chat/lib/mentions";
import { detectTrailieInvocation } from "@/features/trailie/invocation/detect-invocation";

/** Mirrors the mention branch of detect-invocation, for the inactive hint. */
const trailieMentionPattern = /(^|\s)@trailie(?=$|[\s.,!?;:])/i;

/**
 * Finds the mention being typed at the caret, or null.
 *
 * The lookback is capped at the longest candidate name so this never scans the
 * whole draft. The query may contain spaces, which is what lets a multi-word
 * display name keep the picker open past its first space.
 */
function findMentionQuery(value: string, caret: number, maxNameLength: number) {
  const from = Math.max(0, caret - maxNameLength - 1);
  const slice = value.slice(from, caret);
  for (let index = slice.length - 1; index >= 0; index -= 1) {
    if (slice[index] !== "@") continue;
    const at = from + index;
    if (at > 0 && !/\s/.test(value[at - 1])) return null;
    const query = value.slice(at + 1, caret);
    if (query.includes("\n")) return null;
    return { at, query };
  }
  return null;
}

export function MessageComposer({
  onSend,
  onDraftActivity,
  disabled = false,
  participants = [],
  focusToken = 0,
}: {
  onSend: (body: string) => Promise<boolean> | boolean;
  onDraftActivity?: (body: string) => void;
  disabled?: boolean;
  participants?: MentionParticipant[];
  /** Bumped by the parent to pull focus here, e.g. after selecting a message. */
  focusToken?: number;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<{ at: number; query: string } | null>(
    null,
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const remaining = 4000 - draft.length;
  const invokesTrailie = detectTrailieInvocation({ body: draft }).invoked;
  const trailieInactive = !invokesTrailie && trailieMentionPattern.test(draft);

  const candidates = buildMentionCandidates(participants);
  const maxNameLength = candidates.reduce(
    (longest, candidate) => Math.max(longest, candidate.name.length),
    0,
  );
  const matches = mention
    ? candidates
        .filter((candidate) =>
          candidate.lower.startsWith(mention.query.toLowerCase()),
        )
        .slice(0, 6)
    : [];
  const pickerOpen = matches.length > 0;
  const active = matches[Math.min(activeIndex, matches.length - 1)];

  useEffect(() => {
    if (focusToken > 0) textareaRef.current?.focus();
  }, [focusToken]);

  function updateDraft(value: string) {
    setDraft(value);
    onDraftActivity?.(value);
  }

  async function submit() {
    const body = draft.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    try {
      const accepted = await onSend(body);
      if (accepted) {
        setDraft("");
        setMention(null);
        onDraftActivity?.("");
      }
    } finally {
      setSending(false);
    }
  }

  function insertMention(name: string) {
    if (!mention) return;
    const before = draft.slice(0, mention.at);
    const after = draft.slice(mention.at + 1 + mention.query.length);
    const next = `${before}@${name} ${after}`;
    updateDraft(next);
    setMention(null);
    const caret = before.length + name.length + 2;
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  }

  function moveTrailieToStart() {
    const without = draft
      .replace(trailieMentionPattern, "$1")
      .replace(/\s+/g, " ")
      .trim();
    updateDraft(`@${TRAILIE_MENTION_NAME} ${without}`);
  }

  return (
    <div className="border-border bg-background border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      {/* Matches MessageList's max-w-3xl column: without it the input spanned
          the full pane while messages sat inset, so they never lined up. */}
      <div className="mx-auto w-full max-w-3xl">
        <div className="relative">
          {pickerOpen ? (
            <ul
              id="mention-picker"
              role="listbox"
              aria-label="Mention someone"
              className="border-border bg-surface-raised rounded-card shadow-soft absolute bottom-full left-0 z-20 mb-2 w-[min(20rem,100%)] overflow-hidden border py-1"
            >
              {matches.map((candidate, index) => {
                const isActive = candidate === active;
                return (
                  <li key={candidate.name}>
                    <button
                      type="button"
                      id={`mention-option-${index}`}
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        insertMention(candidate.name);
                      }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                        isActive
                          ? "bg-subtle text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {candidate.participantId === null ? (
                        <Route
                          aria-hidden="true"
                          className="text-accent size-3.5 shrink-0"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="bg-subtle text-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[0.5625rem] font-semibold"
                        >
                          {candidate.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="truncate font-medium">
                        {candidate.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {/* Activation is a fill change, not a border change: the focus ring is
            already accent-coloured, so tinting the border here would read as
            weaker than plain focus rather than stronger. */}
          <div
            className={`focus-within:ring-ring rounded-card flex items-end gap-2 border p-2 transition-[background-color,border-color,box-shadow] focus-within:ring-2 ${
              invokesTrailie
                ? "border-accent bg-accent-soft/60"
                : "border-border bg-surface focus-within:border-foreground"
            }`}
          >
            <label htmlFor="crew-message" className="sr-only">
              Message your crew
            </label>
            <textarea
              id="crew-message"
              ref={textareaRef}
              value={draft}
              maxLength={4000}
              rows={1}
              disabled={disabled}
              role="combobox"
              aria-expanded={pickerOpen}
              aria-controls="mention-picker"
              aria-autocomplete="list"
              aria-activedescendant={
                pickerOpen && active
                  ? `mention-option-${matches.indexOf(active)}`
                  : undefined
              }
              placeholder="Message your crew or ask @Trailie"
              onChange={(event) => {
                const value = event.target.value.slice(0, 4000);
                updateDraft(value);
                setMention(
                  findMentionQuery(
                    value,
                    event.target.selectionStart ?? value.length,
                    maxNameLength,
                  ),
                );
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (pickerOpen) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveIndex((index) => (index + 1) % matches.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveIndex(
                      (index) => (index - 1 + matches.length) % matches.length,
                    );
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    if (active) insertMention(active.name);
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setMention(null);
                    return;
                  }
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              className="text-foreground placeholder:text-muted-foreground max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none disabled:opacity-50"
            />
            <button
              type="button"
              aria-label="Send message"
              disabled={!draft.trim() || sending || disabled}
              onClick={() => void submit()}
              className="bg-foreground text-background focus-visible:ring-ring rounded-control inline-flex size-11 shrink-0 items-center justify-center focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
            >
              <SendHorizontal aria-hidden="true" className="size-4" />
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex min-h-4 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-[0.6875rem]">
          {invokesTrailie ? (
            <p className="text-accent inline-flex items-center gap-1.5 font-semibold">
              <Route aria-hidden="true" className="size-3.5" />
              Trailie will answer after this message is sent
            </p>
          ) : trailieInactive ? (
            <p className="text-muted-foreground inline-flex flex-wrap items-center gap-2">
              <span>@Trailie needs to be at the start to ask.</span>
              <button
                type="button"
                onClick={moveTrailieToStart}
                className="text-foreground focus-visible:ring-ring rounded-sm font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
              >
                Move to start
              </button>
            </p>
          ) : (
            <p className="text-muted-foreground">
              Trailie joins only when someone asks · Enter to send
            </p>
          )}
          {remaining <= 200 ? (
            <p
              className="text-muted-foreground tabular-nums"
              aria-live="polite"
            >
              {remaining} characters remaining
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
