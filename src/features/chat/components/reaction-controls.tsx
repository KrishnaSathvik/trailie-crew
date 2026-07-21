"use client";

import { Check, CornerUpLeft, Copy, SmilePlus } from "lucide-react";
import { useState } from "react";

import type { ReactionType, RoomMessage } from "@trailie/schemas";

const reactions: Array<{
  value: ReactionType;
  label: string;
  symbol: string;
}> = [
  // Emoji presentation throughout. The heart carries an explicit U+FE0F
  // variation selector; without it U+2764 falls back to a monochrome text
  // glyph beside the colour emoji, which is what made this row look broken.
  { value: "like", label: "Like", symbol: "👍" },
  { value: "love", label: "Love", symbol: "❤️" },
  { value: "laugh", label: "Laugh", symbol: "😄" },
  { value: "celebrate", label: "Celebrate", symbol: "🎉" },
  { value: "thinking", label: "Thinking", symbol: "🤔" },
];

/**
 * Reactions already on a message, as one floating badge overlapping the
 * bubble's upper corner — top-right for incoming, top-left for your own.
 *
 * Absolutely positioned so it adds no height and never pushes the next
 * message down, and grouped into a single badge rather than one row per
 * reaction.
 */
export function ReactionBadge({
  message,
  onToggle,
  alignRight,
}: {
  message: RoomMessage;
  onToggle: (reaction: ReactionType) => void;
  alignRight: boolean;
}) {
  if (message.reactions.length === 0) return null;

  return (
    <div
      className={`border-border bg-surface-raised absolute -top-3 z-10 flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 shadow-sm ${alignRight ? "left-2" : "right-2"}`}
    >
      {message.reactions.map((summary) => {
        const definition = reactions.find(
          (reaction) => reaction.value === summary.reaction,
        );
        if (!definition) return null;
        return (
          <button
            key={summary.reaction}
            type="button"
            aria-label={`${definition.label}: ${summary.count}${summary.reactedByCurrentParticipant ? ", selected" : ""}`}
            aria-pressed={summary.reactedByCurrentParticipant}
            onClick={(event) => {
              // The bubble behind this opens the action bar on click.
              event.stopPropagation();
              onToggle(summary.reaction);
            }}
            className={`focus-visible:ring-ring inline-flex items-center gap-0.5 rounded-full text-[0.6875rem] leading-none focus-visible:ring-2 focus-visible:outline-none ${summary.reactedByCurrentParticipant ? "text-accent font-bold" : "text-muted-foreground"}`}
          >
            <span aria-hidden="true">{definition.symbol}</span>
            <span>{summary.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact actions beside a bubble, revealed on hover (pointer devices) or by
 * tapping the message (touch). Absolutely positioned so revealing them never
 * shifts the conversation.
 *
 * Visibility is driven by CSS in globals.css; the picker is parent-controlled
 * via `pickerOpen`/`onTogglePicker` so only one can be open at a time.
 */
export function MessageActions({
  onToggle,
  onReply,
  onCopy,
  alignRight,
}: {
  onToggle: (reaction: ReactionType) => void;
  onReply: () => void;
  onCopy: () => void;
  alignRight: boolean;
}) {
  const [copied, setCopied] = useState(false);
  // Local, so revealing actions (hover or tap) never implies an open picker.
  const [pickerOpen, setPickerOpen] = useState(false);

  const action =
    "text-muted-foreground/60 hover:text-foreground hover:bg-subtle focus-visible:ring-ring rounded-control flex size-7 items-center justify-center transition-colors focus-visible:ring-2 focus-visible:outline-none";

  return (
    <div
      className={`message-actions absolute top-1/2 z-20 flex -translate-y-1/2 items-center gap-0.5 ${
        alignRight ? "right-full mr-1" : "left-full ml-1"
      }`}
    >
      <button
        type="button"
        aria-label="Add reaction"
        aria-expanded={pickerOpen}
        title="React"
        onClick={() => setPickerOpen((open) => !open)}
        className={action}
      >
        <SmilePlus aria-hidden="true" className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Reply"
        title="Reply"
        onClick={onReply}
        className={action}
      >
        <CornerUpLeft aria-hidden="true" className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Copy"
        title="Copy"
        onClick={() => {
          onCopy();
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }}
        className={action}
      >
        {copied ? (
          <Check aria-hidden="true" className="text-positive size-3.5" />
        ) : (
          <Copy aria-hidden="true" className="size-3.5" />
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>

      {pickerOpen ? (
        <div
          role="group"
          aria-label="Choose a reaction"
          className={`border-border bg-surface-raised rounded-card shadow-soft absolute bottom-full z-30 mb-1 flex w-max gap-0.5 border p-1 ${alignRight ? "right-0" : "left-0"}`}
        >
          {reactions.map((reaction) => (
            <button
              key={reaction.value}
              type="button"
              aria-label={`React with ${reaction.label}`}
              title={reaction.label}
              onClick={() => {
                onToggle(reaction.value);
                setPickerOpen(false);
              }}
              className="hover:bg-subtle focus-visible:ring-ring rounded-control flex size-7 items-center justify-center text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <span aria-hidden="true">{reaction.symbol}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
