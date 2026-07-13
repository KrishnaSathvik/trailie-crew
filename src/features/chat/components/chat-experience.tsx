"use client";

import { ChevronDown, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  presenceStateSchema,
  typingEventSchema,
  type PresenceState,
  type ReactionType,
  type TypingEvent,
} from "@trailie/schemas";
import {
  getRoomMessagesAction,
  sendMessageAction,
  toggleReactionAction,
} from "@/features/chat/actions/chat-actions";
import { MessageComposer } from "@/features/chat/components/message-composer";
import { MessageList } from "@/features/chat/components/message-list";
import {
  getChatErrorMessage,
  type ChatErrorCode,
} from "@/features/chat/errors/chat-errors";
import {
  applyOptimisticReaction,
  isNearMessageListBottom,
  mergeRoomMessages,
  summarizePresence,
  summarizeTyping,
  visibleTypingParticipants,
  type ClientRoomMessage,
} from "@/features/chat/lib/chat-state";
import type { TripShellData } from "@/features/crew/queries/trip-crew";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

function privacySafePresence(value: unknown): PresenceState | null {
  if (typeof value !== "object" || value === null) return null;
  const source = value as Record<string, unknown>;
  const parsed = presenceStateSchema.safeParse({
    participantId: source.participantId,
    displayName: source.displayName,
    connectedAt: source.connectedAt,
    currentArea: source.currentArea,
  });
  return parsed.success ? parsed.data : null;
}

function scrollToBottom(element: HTMLDivElement, behavior?: ScrollBehavior) {
  if (typeof element.scrollTo === "function") {
    element.scrollTo({ top: element.scrollHeight, behavior });
  } else {
    element.scrollTop = element.scrollHeight;
  }
}

export function ChatExperience({
  data,
  onPresenceChange,
}: {
  data: TripShellData;
  onPresenceChange: (participantIds: string[]) => void;
}) {
  const initialChronological = useMemo(
    () => [...data.initialMessages.messages].reverse(),
    [data.initialMessages.messages],
  );
  const [messages, setMessages] = useState<ClientRoomMessage[]>(() =>
    mergeRoomMessages([], initialChronological),
  );
  const [hasMore, setHasMore] = useState(data.initialMessages.hasMore);
  const [nextCursor, setNextCursor] = useState(data.initialMessages.nextCursor);
  const [error, setError] = useState<ChatErrorCode | null>(
    data.initialHistoryError ? "history_load_failed" : null,
  );
  const [typingEvents, setTypingEvents] = useState<TypingEvent[]>([]);
  const [typingClock, setTypingClock] = useState(0);
  const [replyingTo, setReplyingTo] = useState<ClientRoomMessage | null>(null);
  const [newMessagesAvailable, setNewMessagesAvailable] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const historyRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createBrowserSupabaseClient>["channel"]
  > | null>(null);
  const typingStopTimer = useRef<number | null>(null);
  const lastTypingSentAt = useRef(0);

  const refreshLatest = useCallback(async () => {
    const wasNearBottom = historyRef.current
      ? isNearMessageListBottom(historyRef.current)
      : true;
    let result;
    try {
      result = await getRoomMessagesAction({
        roomId: data.room.id,
        pageSize: 30,
      });
    } catch {
      setError("history_load_failed");
      return;
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessages((current) =>
      mergeRoomMessages(current, [...result.data.messages].reverse()),
    );
    if (wasNearBottom) {
      window.requestAnimationFrame(() => {
        if (historyRef.current) scrollToBottom(historyRef.current);
      });
    } else if (result.data.messages.length > 0) {
      setNewMessagesAvailable(true);
    }
  }, [data.room.id]);

  useEffect(() => {
    const interval = window.setInterval(() => setTypingClock(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const knownParticipants = new Map(
      data.participants.map((participant) => [
        participant.id,
        participant.displayName,
      ]),
    );
    let active = true;
    let subscribed = false;
    let client: ReturnType<typeof createBrowserSupabaseClient>;
    try {
      client = createBrowserSupabaseClient();
    } catch {
      queueMicrotask(() => {
        if (active) setError("realtime_unavailable");
      });
      return;
    }

    const channel = client.channel(`room:${data.room.id}`, {
      config: {
        private: true,
        presence: { key: crypto.randomUUID() },
        broadcast: { self: false, ack: true },
      },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "chat_changed" }, () => void refreshLatest())
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const parsed = typingEventSchema.safeParse(payload);
        if (
          !parsed.success ||
          knownParticipants.get(parsed.data.participantId) !==
            parsed.data.displayName
        )
          return;
        setTypingEvents((current) => [
          ...current.filter(
            (event) => event.participantId !== parsed.data.participantId,
          ),
          parsed.data,
        ]);
      })
      .on("presence", { event: "sync" }, () => {
        const raw = channel.presenceState();
        const presences = Object.values(raw)
          .flat()
          .map(privacySafePresence)
          .filter((presence): presence is PresenceState =>
            Boolean(
              presence &&
              knownParticipants.get(presence.participantId) ===
                presence.displayName,
            ),
          );
        onPresenceChange(
          summarizePresence(presences).map(
            (presence) => presence.participantId,
          ),
        );
      });

    void (async () => {
      const { data: sessionData } = await client.auth.getSession();
      if (!active) return;
      await client.realtime.setAuth(sessionData.session?.access_token);
      if (!active) return;
      channel.subscribe(async (status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") {
          subscribed = true;
          await channel.track({
            participantId: data.currentParticipant.id,
            displayName: data.currentParticipant.displayName,
            connectedAt: new Date().toISOString(),
            currentArea: "chat",
          });
          setError((current) =>
            current === "realtime_unavailable" ? null : current,
          );
          await refreshLatest();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError("realtime_unavailable");
        }
      });
    })().catch(() => setError("realtime_unavailable"));

    return () => {
      active = false;
      channelRef.current = null;
      if (subscribed) void channel.untrack().catch(() => undefined);
      void client.removeChannel(channel);
      if (typingStopTimer.current) window.clearTimeout(typingStopTimer.current);
      onPresenceChange([]);
    };
  }, [
    data.currentParticipant.displayName,
    data.currentParticipant.id,
    data.participants,
    data.room.id,
    onPresenceChange,
    refreshLatest,
  ]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      if (historyRef.current) scrollToBottom(historyRef.current);
    });
  }, []);

  async function send(
    body: string,
    retry?: ClientRoomMessage,
  ): Promise<boolean> {
    const clientMessageId = retry?.clientMessageId ?? crypto.randomUUID();
    if (!clientMessageId) return false;
    const optimistic: ClientRoomMessage = retry
      ? { ...retry, deliveryState: "pending" }
      : {
          id: clientMessageId,
          roomId: data.room.id,
          participantId: data.currentParticipant.id,
          messageType: "user",
          body,
          clientMessageId,
          replyToMessageId: replyingTo?.id ?? null,
          sender: {
            participantId: data.currentParticipant.id,
            displayName: data.currentParticipant.displayName,
            role: data.currentParticipant.role,
          },
          reply: replyingTo
            ? {
                id: replyingTo.id,
                body: replyingTo.body,
                senderDisplayName: replyingTo.sender.displayName,
              }
            : null,
          reactions: [],
          createdAt: new Date().toISOString(),
          editedAt: null,
          deletedAt: null,
          deliveryState: "pending",
        };

    setMessages((current) => {
      const withoutRetry = current.filter(
        (message) => message.id !== optimistic.id,
      );
      return [...withoutRetry, optimistic];
    });
    setReplyingTo(null);
    let result;
    try {
      result = await sendMessageAction({
        roomId: data.room.id,
        participantId: data.currentParticipant.id,
        body,
        clientMessageId,
        replyToMessageId: optimistic.replyToMessageId,
      });
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.clientMessageId === clientMessageId
            ? { ...message, deliveryState: "failed" }
            : message,
        ),
      );
      setError("message_send_failed");
      return false;
    }
    if (!result.ok) {
      setMessages((current) =>
        current.map((message) =>
          message.clientMessageId === clientMessageId
            ? { ...message, deliveryState: "failed" }
            : message,
        ),
      );
      setError(result.error);
      return false;
    }
    setMessages((current) => mergeRoomMessages(current, [result.data]));
    setError(null);
    return true;
  }

  async function retry(message: ClientRoomMessage) {
    if (await send(message.body, message)) setComposerKey((key) => key + 1);
  }

  async function toggleReaction(
    message: ClientRoomMessage,
    reaction: ReactionType,
  ) {
    const original = message;
    setMessages((current) =>
      current.map((candidate) =>
        candidate.id === message.id
          ? {
              ...applyOptimisticReaction(candidate, reaction),
              deliveryState: candidate.deliveryState,
            }
          : candidate,
      ),
    );
    let result;
    try {
      result = await toggleReactionAction({
        messageId: message.id,
        participantId: data.currentParticipant.id,
        reaction,
      });
    } catch {
      setMessages((current) =>
        current.map((candidate) =>
          candidate.id === original.id ? original : candidate,
        ),
      );
      setError("reaction_failed");
      return;
    }
    if (!result.ok) {
      setMessages((current) =>
        current.map((candidate) =>
          candidate.id === original.id ? original : candidate,
        ),
      );
      setError(result.error);
    } else {
      setError(null);
    }
  }

  async function loadEarlier() {
    if (!nextCursor || !historyRef.current) return;
    const viewport = historyRef.current;
    const previousHeight = viewport.scrollHeight;
    const previousTop = viewport.scrollTop;
    let result;
    try {
      result = await getRoomMessagesAction({
        roomId: data.room.id,
        beforeCreatedAt: nextCursor.createdAt,
        beforeId: nextCursor.id,
        pageSize: 30,
      });
    } catch {
      setError("history_load_failed");
      return;
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessages((current) =>
      mergeRoomMessages(current, [...result.data.messages].reverse()),
    );
    setHasMore(result.data.hasMore);
    setNextCursor(result.data.nextCursor);
    window.requestAnimationFrame(() => {
      viewport.scrollTop = previousTop + viewport.scrollHeight - previousHeight;
    });
  }

  function publishTyping(body: string) {
    const channel = channelRef.current;
    if (!channel) return;
    const now = Date.now();
    if (body.trim() && now - lastTypingSentAt.current > 500) {
      lastTypingSentAt.current = now;
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: {
          participantId: data.currentParticipant.id,
          displayName: data.currentParticipant.displayName,
          isTyping: true,
          expiresAt: new Date(now + 3000).toISOString(),
        },
      });
    }
    if (typingStopTimer.current) window.clearTimeout(typingStopTimer.current);
    typingStopTimer.current = window.setTimeout(() => {
      void channel.send({
        type: "broadcast",
        event: "typing",
        payload: {
          participantId: data.currentParticipant.id,
          displayName: data.currentParticipant.displayName,
          isTyping: false,
          expiresAt: new Date().toISOString(),
        },
      });
    }, 1500);
  }

  const typing = visibleTypingParticipants(
    typingEvents,
    data.currentParticipant.id,
    typingClock,
  );
  const typingSummary = summarizeTyping(
    typing.map((event) => event.displayName),
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={historyRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        aria-label="Trip conversation"
      >
        {hasMore ? (
          <div className="flex justify-center px-4 pt-4">
            <button
              type="button"
              onClick={() => void loadEarlier()}
              className="border-border hover:bg-subtle focus-visible:ring-ring rounded-full border px-4 py-2 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none"
            >
              Load earlier messages
            </button>
          </div>
        ) : null}
        <MessageList
          messages={messages}
          currentParticipantId={data.currentParticipant.id}
          onRetry={(message) => void retry(message)}
          onReaction={(message, reaction) =>
            void toggleReaction(message, reaction)
          }
          onReply={setReplyingTo}
        />
      </div>
      {newMessagesAvailable ? (
        <button
          type="button"
          onClick={() => {
            if (historyRef.current)
              scrollToBottom(historyRef.current, "smooth");
            setNewMessagesAvailable(false);
          }}
          className="bg-foreground text-background focus-visible:ring-ring absolute right-5 bottom-32 z-10 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold shadow-lg focus-visible:ring-2 focus-visible:outline-none"
        >
          New messages <ChevronDown aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
      <div className="min-h-6 px-5 py-1 text-xs" aria-live="polite">
        {typingSummary ? (
          <p className="text-muted-foreground">{typingSummary}</p>
        ) : null}
        {error ? <p role="alert">{getChatErrorMessage(error)}</p> : null}
      </div>
      {replyingTo ? (
        <div className="border-border bg-subtle mx-4 flex items-center gap-3 rounded-t-md border border-b-0 px-3 py-2 text-xs sm:mx-6">
          <p className="min-w-0 flex-1 truncate">
            Replying to <strong>{replyingTo.sender.displayName}</strong>:{" "}
            {replyingTo.body}
          </p>
          <button
            type="button"
            aria-label="Cancel reply"
            onClick={() => setReplyingTo(null)}
            className="focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}
      <MessageComposer
        key={composerKey}
        onSend={send}
        onDraftActivity={publishTyping}
      />
    </div>
  );
}
