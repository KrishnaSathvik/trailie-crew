import type {
  PresenceState,
  ReactionType,
  RoomMessage,
  TypingEvent,
} from "@trailie/schemas";

export type MessageDeliveryState = "pending" | "sent" | "failed";

export type ClientRoomMessage = RoomMessage & {
  deliveryState: MessageDeliveryState;
};

function asSent(message: RoomMessage): ClientRoomMessage {
  return { ...message, deliveryState: "sent" };
}

function sameLogicalMessage(
  left: Pick<RoomMessage, "id" | "clientMessageId">,
  right: Pick<RoomMessage, "id" | "clientMessageId">,
) {
  return (
    left.id === right.id ||
    (left.clientMessageId !== null &&
      left.clientMessageId === right.clientMessageId)
  );
}

export function mergeRoomMessages(
  current: readonly (ClientRoomMessage | RoomMessage)[],
  incoming: readonly RoomMessage[],
): ClientRoomMessage[] {
  const merged = current.map((message) =>
    "deliveryState" in message ? message : asSent(message),
  );

  for (const message of incoming) {
    const next = asSent(message);
    const index = merged.findIndex((candidate) =>
      sameLogicalMessage(candidate, message),
    );
    if (index >= 0) merged[index] = next;
    else merged.push(next);
  }

  return merged
    .filter(
      (message, index, all) =>
        all.findIndex((candidate) => sameLogicalMessage(candidate, message)) ===
        index,
    )
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
}

const reactionOrder: ReactionType[] = [
  "like",
  "love",
  "laugh",
  "celebrate",
  "thinking",
];

export function applyOptimisticReaction(
  message: RoomMessage,
  reaction: ReactionType,
): RoomMessage {
  const existing = message.reactions.find(
    (summary) => summary.reaction === reaction,
  );
  const reactions = message.reactions.filter(
    (summary) => summary.reaction !== reaction,
  );

  if (!existing) {
    reactions.push({
      reaction,
      count: 1,
      reactedByCurrentParticipant: true,
    });
  } else {
    const reactedByCurrentParticipant = !existing.reactedByCurrentParticipant;
    const count = Math.max(
      0,
      existing.count + (reactedByCurrentParticipant ? 1 : -1),
    );
    if (count > 0) {
      reactions.push({ reaction, count, reactedByCurrentParticipant });
    }
  }

  reactions.sort(
    (left, right) =>
      reactionOrder.indexOf(left.reaction) -
      reactionOrder.indexOf(right.reaction),
  );
  return { ...message, reactions };
}

export function visibleTypingParticipants(
  events: readonly TypingEvent[],
  currentParticipantId: string,
  now: number = Date.now(),
): TypingEvent[] {
  const latestByParticipant = new Map<string, TypingEvent>();
  for (const event of events)
    latestByParticipant.set(event.participantId, event);
  return [...latestByParticipant.values()]
    .filter(
      (event) =>
        event.participantId !== currentParticipantId &&
        event.isTyping &&
        Date.parse(event.expiresAt) > now,
    )
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function summarizeTyping(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

export function summarizePresence(
  presences: readonly PresenceState[],
): PresenceState[] {
  const latestByParticipant = new Map<string, PresenceState>();
  for (const presence of presences) {
    const current = latestByParticipant.get(presence.participantId);
    if (!current || current.connectedAt < presence.connectedAt) {
      latestByParticipant.set(presence.participantId, presence);
    }
  }
  return [...latestByParticipant.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}

export function isNearMessageListBottom(
  metrics: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  threshold = 80,
): boolean {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
  );
}
