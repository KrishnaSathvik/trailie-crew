"use client";

import { MessageCircle, Route } from "lucide-react";
import { Fragment } from "react";

import type { ReactionType } from "@trailie/schemas";
import type { ClientRoomMessage } from "@/features/chat/lib/chat-state";
import type { MentionParticipant } from "@/features/chat/lib/mentions";
import { TrailieResponse } from "@/features/trailie/rendering/trailie-response";

import { MentionText } from "./mention-text";
import { MessageActions, ReactionBadge } from "./reaction-controls";

/** Messages closer together than this from one sender read as a single turn. */
const groupingWindowMs = 5 * 60 * 1000;

/**
 * Avatar tints, assigned per participant so a crew stays distinguishable at a
 * glance. Written as static class strings because Tailwind cannot see class
 * names built at runtime. Bubbles stay neutral — only the avatar carries hue.
 */
const participantPalettes = [
  "bg-[#e4ede8] text-[#2b5a48] dark:bg-[#21372d] dark:text-[#a8c7b8]",
  "bg-[#e7e5f5] text-[#4a3f7a] dark:bg-[#2b2740] dark:text-[#bdb4e6]",
  "bg-[#dfe9f5] text-[#2f5279] dark:bg-[#1f2c3d] dark:text-[#a8c6e6]",
  "bg-[#f5ead9] text-[#785a1d] dark:bg-[#392f1f] dark:text-[#dfc27e]",
  "bg-[#f7e3e3] text-[#8a3a3a] dark:bg-[#3a2525] dark:text-[#f0a3a0]",
  "bg-[#e2eeee] text-[#2c5a5a] dark:bg-[#1e3333] dark:text-[#9ecccc]",
];

function paletteFor(participantId: string) {
  let hash = 0;
  for (let index = 0; index < participantId.length; index += 1)
    hash = (hash * 31 + participantId.charCodeAt(index)) >>> 0;
  return participantPalettes[hash % participantPalettes.length];
}

function messageTime(createdAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function dayLabel(createdAt: string) {
  const date = new Date(createdAt);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function MessageList({
  messages,
  currentParticipantId,
  onRetry,
  onReaction,
  onReply,
  onSelect,
  participants = [],
  selectedMessageId = null,
}: {
  messages: ClientRoomMessage[];
  currentParticipantId: string;
  onRetry: (message: ClientRoomMessage) => void;
  onReaction: (message: ClientRoomMessage, reaction: ReactionType) => void;
  /** Chosen from the action menu — clicking a message does not reply. */
  onReply: (message: ClientRoomMessage) => void;
  /** Clicking a message opens its action menu. */
  onSelect: (message: ClientRoomMessage) => void;
  participants?: MentionParticipant[];
  selectedMessageId?: string | null;
}) {
  if (messages.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-16 text-center">
        <div className="max-w-sm">
          <span className="bg-subtle border-border rounded-control mx-auto flex size-11 items-center justify-center border">
            <MessageCircle
              aria-hidden="true"
              className="size-4.5"
              strokeWidth={1.5}
            />
          </span>
          <h2 className="mt-5 text-xl font-semibold tracking-[-0.035em]">
            Start the conversation
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Share the first note, question, or decision with your crew.
          </p>
          <p className="text-muted-foreground mt-4 text-xs">
            Trailie joins only when someone asks.
          </p>
        </div>
      </div>
    );
  }

  return (
    // Same column as the composer, so messages and the input line up.
    <ol className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      {messages.map((message, index) => {
        const isTrailie = message.messageType === "trailie";
        // The core rule: your own messages go right, everything else — other
        // participants and Trailie — goes left.
        const alignRight =
          !isTrailie && message.participantId === currentParticipantId;
        const senderName = isTrailie ? "Trailie" : message.sender.displayName;
        const previous = messages[index - 1];
        const grouped =
          Boolean(previous) &&
          !isTrailie &&
          previous.messageType === message.messageType &&
          previous.participantId === message.participantId &&
          !message.reply &&
          new Date(message.createdAt).getTime() -
            new Date(previous.createdAt).getTime() <
            groupingWindowMs;
        const startsNewDay =
          !previous ||
          !sameDay(new Date(previous.createdAt), new Date(message.createdAt));

        const selected = selectedMessageId === message.id;

        const bubble = isTrailie
          ? "bg-accent-soft border-accent/30 border"
          : alignRight
            ? "bg-accent text-background"
            : "bg-surface-raised border-border border";

        return (
          <Fragment key={message.id}>
            {startsNewDay ? (
              <li className="my-4 flex items-center gap-3" aria-hidden="true">
                <span className="border-border flex-1 border-t" />
                <span
                  suppressHydrationWarning
                  className="text-muted-foreground text-xs font-medium"
                >
                  {dayLabel(message.createdAt)}
                </span>
                <span className="border-border flex-1 border-t" />
              </li>
            ) : null}

            <li
              className={`message-row relative flex ${selected ? "is-selected" : ""} ${alignRight ? "justify-end" : "justify-start"} ${grouped ? "mt-1" : "mt-4"}`}
            >
              <div
                className={`flex min-w-0 flex-col ${isTrailie ? "max-w-[92%]" : "max-w-[80%]"} ${alignRight ? "items-end" : "items-start"}`}
              >
                {grouped || alignRight ? null : (
                  <p className="text-muted-foreground mb-1 flex items-center gap-1.5 pl-10 text-xs font-medium">
                    {senderName}
                    {isTrailie ? (
                      <span className="bg-accent-soft text-accent rounded-full px-1.5 py-0.5 text-[0.5625rem] font-bold tracking-wide">
                        AI
                      </span>
                    ) : null}
                  </p>
                )}

                {/* Avatar shares a row with the bubble so it stays beside the
                    message instead of sinking to the bottom of the column when
                    reactions or the toolbar appear. */}
                <div className="flex w-full min-w-0 items-end gap-2">
                  {alignRight ? null : (
                    <div className="w-8 shrink-0 pb-1">
                      {grouped ? null : isTrailie ? (
                        <span className="bg-accent-soft text-accent flex size-8 items-center justify-center rounded-full">
                          <Route aria-hidden="true" className="size-4" />
                        </span>
                      ) : (
                        <span
                          aria-hidden="true"
                          className={`flex size-8 items-center justify-center rounded-full text-[0.625rem] font-semibold uppercase ${paletteFor(message.participantId)}`}
                        >
                          {senderName.slice(0, 2)}
                        </span>
                      )}
                    </div>
                  )}

                  <article
                    aria-label={`Message from ${senderName}`}
                    onClick={() => onSelect(message)}
                    className={`rounded-card relative min-w-0 px-3.5 pb-2 ${
                      // Reserve a sliver of space so the floating reaction
                      // badge overlaps the corner without covering the text.
                      message.reactions.length > 0 ? "pt-4" : "pt-2"
                    } ${bubble}`}
                  >
                    {message.reply ? (
                      <blockquote
                        className={`mb-1.5 border-l-2 pl-2 text-xs leading-5 ${alignRight ? "border-background/40 text-background/80" : "border-border text-muted-foreground"}`}
                      >
                        <span className="font-semibold">
                          {message.reply.senderDisplayName}
                        </span>
                        <span className="ml-2 line-clamp-1">
                          {message.reply.body}
                        </span>
                      </blockquote>
                    ) : null}

                    {isTrailie && message.trailieResponse ? (
                      <TrailieResponse response={message.trailieResponse} />
                    ) : (
                      <p className="text-[0.9375rem] leading-6 break-words whitespace-pre-wrap">
                        <MentionText
                          body={message.body}
                          participants={participants}
                          currentParticipantId={currentParticipantId}
                          onAccent={alignRight}
                        />
                      </p>
                    )}

                    <div
                      className={`mt-0.5 flex items-center justify-end gap-2 ${alignRight ? "text-background/70" : "text-muted-foreground"}`}
                    >
                      {message.deliveryState === "pending" ? (
                        <span className="text-[0.625rem]" role="status">
                          Sending…
                        </span>
                      ) : null}
                      {message.deliveryState === "failed" ? (
                        <span
                          className="text-[0.625rem] font-semibold"
                          role="status"
                        >
                          Not sent
                        </span>
                      ) : null}
                      <time
                        suppressHydrationWarning
                        dateTime={message.createdAt}
                        className="font-mono text-[0.5625rem] tracking-wide"
                      >
                        {messageTime(message.createdAt)}
                      </time>
                    </div>

                    <ReactionBadge
                      message={message}
                      onToggle={(reaction) => onReaction(message, reaction)}
                      alignRight={alignRight}
                    />

                    <MessageActions
                      onToggle={(reaction) => onReaction(message, reaction)}
                      onReply={() => onReply(message)}
                      onCopy={() => {
                        void navigator.clipboard?.writeText(message.body);
                      }}
                      alignRight={alignRight}
                    />
                  </article>
                </div>

                {/* Sits under the bubble, offset past the avatar gutter and
                    pushed to the bubble's trailing edge. */}
                <div
                  className={`flex w-full flex-col ${alignRight ? "items-end" : "items-start pl-10"}`}
                >
                  {message.deliveryState === "failed" ? (
                    <button
                      type="button"
                      aria-label="Retry message"
                      onClick={() => onRetry(message)}
                      className="focus-visible:ring-ring mt-1 text-xs font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
