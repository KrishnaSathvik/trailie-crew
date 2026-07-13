import type { PresenceState, RoomMessage, TypingEvent } from "@trailie/schemas";
import { describe, expect, it } from "vitest";

import {
  applyOptimisticReaction,
  isNearMessageListBottom,
  mergeRoomMessages,
  summarizePresence,
  summarizeTyping,
  visibleTypingParticipants,
  type ClientRoomMessage,
} from "./chat-state";

const roomId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
const mayaId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3";
const leoId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4";

function message(overrides: Partial<RoomMessage> = {}): RoomMessage {
  return {
    id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a5",
    roomId,
    participantId: mayaId,
    messageType: "user",
    body: "North trailhead at eight.",
    clientMessageId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a6",
    replyToMessageId: null,
    sender: { participantId: mayaId, displayName: "Maya", role: "host" },
    reply: null,
    reactions: [],
    createdAt: "2026-07-13T18:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe("chat state", () => {
  it("reconciles a pending message with an RPC or Realtime row by client id", () => {
    const optimistic: ClientRoomMessage = {
      ...message({ id: "client:one" }),
      deliveryState: "pending",
    };
    const accepted = message({
      id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950af",
    });
    expect(mergeRoomMessages([optimistic], [accepted])).toEqual([
      { ...accepted, deliveryState: "sent" },
    ]);
  });

  it("deduplicates RPC and Realtime delivery and keeps chronological order", () => {
    const first = message();
    const second = message({
      id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950b0",
      clientMessageId: null,
      createdAt: "2026-07-13T18:01:00.000Z",
    });
    expect(
      mergeRoomMessages([second], [first, second, first]).map((row) => row.id),
    ).toEqual([first.id, second.id]);
  });

  it("optimistically toggles a canonical reaction without losing rollback input", () => {
    const original = message({
      reactions: [
        { reaction: "like", count: 1, reactedByCurrentParticipant: false },
      ],
    });
    const toggled = applyOptimisticReaction(original, "like");
    expect(toggled.reactions).toEqual([
      { reaction: "like", count: 2, reactedByCurrentParticipant: true },
    ]);
    expect(original.reactions[0]?.count).toBe(1);
    expect(applyOptimisticReaction(toggled, "like").reactions).toEqual([
      { reaction: "like", count: 1, reactedByCurrentParticipant: false },
    ]);
  });

  it("expires typing, excludes the current participant, and summarizes names", () => {
    const events: TypingEvent[] = [
      {
        participantId: mayaId,
        displayName: "Maya",
        isTyping: true,
        expiresAt: "2026-07-13T18:00:03.000Z",
      },
      {
        participantId: leoId,
        displayName: "Leo",
        isTyping: true,
        expiresAt: "2026-07-13T18:00:03.000Z",
      },
    ];
    expect(
      visibleTypingParticipants(
        events,
        mayaId,
        Date.parse("2026-07-13T18:00:02.000Z"),
      ),
    ).toEqual([events[1]]);
    expect(
      visibleTypingParticipants(
        events,
        mayaId,
        Date.parse("2026-07-13T18:00:04.000Z"),
      ),
    ).toEqual([]);
    expect(summarizeTyping(["Maya"])).toBe("Maya is typing…");
    expect(summarizeTyping(["Maya", "Leo"])).toBe("Maya and Leo are typing…");
    expect(summarizeTyping(["Maya", "Leo", "Nia"])).toBe(
      "Several people are typing…",
    );
  });

  it("deduplicates presence by participant and reports the current online count", () => {
    const state: PresenceState[] = [
      {
        participantId: mayaId,
        displayName: "Maya",
        connectedAt: "2026-07-13T18:00:00.000Z",
        currentArea: "chat",
      },
      {
        participantId: mayaId,
        displayName: "Maya",
        connectedAt: "2026-07-13T18:00:01.000Z",
        currentArea: "chat",
      },
      {
        participantId: leoId,
        displayName: "Leo",
        connectedAt: "2026-07-13T18:00:00.000Z",
        currentArea: "chat",
      },
    ];
    expect(
      summarizePresence(state).map((entry) => entry.participantId),
    ).toEqual([leoId, mayaId]);
  });

  it("detects whether incoming messages may auto-scroll", () => {
    expect(
      isNearMessageListBottom({
        scrollHeight: 1000,
        scrollTop: 650,
        clientHeight: 300,
      }),
    ).toBe(true);
    expect(
      isNearMessageListBottom({
        scrollHeight: 1000,
        scrollTop: 300,
        clientHeight: 300,
      }),
    ).toBe(false);
  });
});
