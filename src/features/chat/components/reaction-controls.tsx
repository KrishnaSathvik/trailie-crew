"use client";

import { SmilePlus } from "lucide-react";

import type { ReactionType, RoomMessage } from "@trailie/schemas";

const reactions: Array<{
  value: ReactionType;
  label: string;
  symbol: string;
}> = [
  { value: "like", label: "Like", symbol: "👍" },
  { value: "love", label: "Love", symbol: "♥" },
  { value: "laugh", label: "Laugh", symbol: "◡" },
  { value: "celebrate", label: "Celebrate", symbol: "✦" },
  { value: "thinking", label: "Thinking", symbol: "…" },
];

export function ReactionControls({
  message,
  onToggle,
}: {
  message: RoomMessage;
  onToggle: (reaction: ReactionType) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
            onClick={() => onToggle(summary.reaction)}
            className={`border-border focus-visible:ring-ring inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-xs focus-visible:ring-2 focus-visible:outline-none ${summary.reactedByCurrentParticipant ? "bg-subtle font-semibold" : "text-muted-foreground"}`}
          >
            <span aria-hidden="true">{definition.symbol}</span>
            <span>{summary.count}</span>
          </button>
        );
      })}
      <details className="relative">
        <summary
          aria-label="Add reaction"
          className="border-border text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-7 cursor-pointer list-none items-center justify-center rounded-full border focus-visible:ring-2 focus-visible:outline-none"
        >
          <SmilePlus aria-hidden="true" className="size-3.5" />
        </summary>
        <div className="border-border bg-background absolute bottom-9 left-0 z-20 flex gap-1 rounded-md border p-1.5 shadow-lg">
          {reactions.map((reaction) => (
            <button
              key={reaction.value}
              type="button"
              aria-label={`React with ${reaction.label}`}
              title={reaction.label}
              onClick={(event) => {
                onToggle(reaction.value);
                event.currentTarget.closest("details")?.removeAttribute("open");
              }}
              className="hover:bg-subtle focus-visible:ring-ring flex size-8 items-center justify-center rounded-sm text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <span aria-hidden="true">{reaction.symbol}</span>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
