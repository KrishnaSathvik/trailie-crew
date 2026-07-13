"use client";

import { MessageCircle } from "lucide-react";

import type { ReactionType } from "@trailie/schemas";
import type { ClientRoomMessage } from "@/features/chat/lib/chat-state";

import { ReactionControls } from "./reaction-controls";

function messageTime(createdAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

export function MessageList({
  messages,
  currentParticipantId,
  onRetry,
  onReaction,
  onReply,
}: {
  messages: ClientRoomMessage[];
  currentParticipantId: string;
  onRetry: (message: ClientRoomMessage) => void;
  onReaction: (message: ClientRoomMessage, reaction: ReactionType) => void;
  onReply: (message: ClientRoomMessage) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-16 text-center">
        <div className="max-w-sm">
          <span className="bg-subtle border-border mx-auto flex size-11 items-center justify-center rounded-md border">
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
        </div>
      </div>
    );
  }

  return (
    <ol className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-7">
      {messages.map((message) => {
        const isCurrent = message.participantId === currentParticipantId;
        return (
          <li
            key={message.id}
            className={`border-border border-b py-5 first:pt-1 ${isCurrent ? "border-l-2 pl-4" : "pl-0"}`}
          >
            <article aria-label={`Message from ${message.sender.displayName}`}>
              <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="text-sm font-semibold">
                  {message.sender.displayName}
                  {isCurrent ? " (you)" : ""}
                </h3>
                <time
                  dateTime={message.createdAt}
                  className="text-muted-foreground font-mono text-[0.625rem] tracking-wide"
                >
                  {messageTime(message.createdAt)}
                </time>
                {message.deliveryState === "pending" ? (
                  <span className="text-muted-foreground text-xs" role="status">
                    Sending…
                  </span>
                ) : null}
                {message.deliveryState === "failed" ? (
                  <span className="text-xs font-semibold" role="status">
                    Not sent
                  </span>
                ) : null}
              </header>
              {message.reply ? (
                <blockquote className="border-border text-muted-foreground mt-3 border-l-2 pl-3 text-xs leading-5">
                  <span className="font-semibold">
                    {message.reply.senderDisplayName}
                  </span>
                  <span className="ml-2 line-clamp-1">
                    {message.reply.body}
                  </span>
                </blockquote>
              ) : null}
              <p className="mt-2 text-[0.9375rem] leading-6 break-words whitespace-pre-wrap">
                {message.body}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <ReactionControls
                  message={message}
                  onToggle={(reaction) => onReaction(message, reaction)}
                />
                <button
                  type="button"
                  onClick={() => onReply(message)}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-2 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none"
                >
                  Reply
                </button>
                {message.deliveryState === "failed" ? (
                  <button
                    type="button"
                    aria-label="Retry message"
                    onClick={() => onRetry(message)}
                    className="focus-visible:ring-ring mt-2 text-xs font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
