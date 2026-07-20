import { describe, expect, it } from "vitest";

import {
  mapCreateTripResult,
  mapGetRoomMessagesResult,
  mapJoinTripResult,
  mapParticipantSummary,
  mapRoomSummary,
  mapRoomMessage,
  mapToggleReactionResult,
} from "./mappers";

const roomId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
const participantId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3";
const userId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4";
const createdAt = "2026-07-13T18:00:00.000Z";

describe("Supabase database mappers", () => {
  it("maps room and participant rows to camelCase summaries", () => {
    expect(
      mapRoomSummary({
        id: roomId,
        name: "Boundary Waters",
        room_code: "ABCD2345",
        expected_travelers: null,
        approval_mode: "all_active",
        status: "active",
        current_plan_version: null,
        created_at: createdAt,
        updated_at: createdAt,
      }),
    ).toMatchObject({ roomCode: "ABCD2345", expectedTravelers: null });

    expect(
      mapParticipantSummary({
        id: participantId,
        room_id: roomId,
        user_id: userId,
        display_name: "Maya",
        role: "host",
        status: "active",
        joined_at: createdAt,
        last_seen_at: null,
      }),
    ).toMatchObject({ roomId, userId, displayName: "Maya" });
  });

  it("maps RPC results without leaking a token hash", () => {
    const created = mapCreateTripResult({
      room_id: roomId,
      room_name: "Boundary Waters",
      participant_id: participantId,
      room_code: "ABCD2345",
      invite_token: "a".repeat(43),
      created_at: createdAt,
    });
    expect(created).toEqual({
      roomId,
      roomName: "Boundary Waters",
      participantId,
      roomCode: "ABCD2345",
      inviteToken: "a".repeat(43),
      createdAt,
    });
    expect(created).not.toHaveProperty("tokenHash");

    expect(
      mapJoinTripResult({
        room_id: roomId,
        room_name: "Boundary Waters",
        participant_id: participantId,
        member_display_name: "Leo",
        participant_role: "member",
        room_code: "ABCD2345",
        joined_at: createdAt,
      }),
    ).toMatchObject({
      roomId,
      participantId,
      displayName: "Leo",
      role: "member",
    });
  });
});

describe("Phase 1C message mappers", () => {
  const rawMessage = {
    id: participantId,
    room_id: roomId,
    participant_id: participantId,
    message_type: "user" as const,
    body: "Meet at the north trailhead.",
    client_message_id: userId,
    reply_to_message_id: null,
    sender: {
      participant_id: participantId,
      display_name: "Maya",
      role: "host" as const,
    },
    reply: null,
    reactions: [
      {
        reaction: "celebrate" as const,
        count: 2,
        reacted_by_current_participant: true,
      },
    ],
    created_at: createdAt,
    edited_at: null,
    deleted_at: null,
  };

  it("maps a safe message and nested reaction summaries to camelCase", () => {
    expect(mapRoomMessage(rawMessage)).toEqual({
      id: participantId,
      roomId,
      participantId,
      messageType: "user",
      body: "Meet at the north trailhead.",
      clientMessageId: userId,
      replyToMessageId: null,
      sender: { participantId, displayName: "Maya", role: "host" },
      reply: null,
      reactions: [
        {
          reaction: "celebrate",
          count: 2,
          reactedByCurrentParticipant: true,
        },
      ],
      createdAt,
      editedAt: null,
      deletedAt: null,
      trailieResponse: null,
    });
  });

  it("maps the validated Trailie contract without exposing invocation metadata", () => {
    expect(
      mapRoomMessage({
        ...rawMessage,
        message_type: "trailie",
        trailie_response: {
          schemaVersion: "1",
          responseId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950c0",
          sourceMessageId: rawMessage.id,
          createdAt: rawMessage.created_at,
          intent: "direct_question",
          message: "October can work, with seasonal tradeoffs.",
          blocks: [
            {
              type: "markdown",
              markdown: "October can work, with seasonal tradeoffs.",
            },
          ],
          warnings: [],
          sources: [],
          assumptions: [],
          unresolvedQuestions: [],
          suggestedActions: [],
          persistenceDirective: "none",
          approvalDirective: "not_required",
          freshness: "not_applicable",
          privacyLevel: "room",
        },
      }).trailieResponse,
    ).toMatchObject({
      intent: "direct_question",
      message: "October can work, with seasonal tradeoffs.",
    });
  });

  it("maps page cursors and reaction toggle results", () => {
    expect(
      mapGetRoomMessagesResult({
        messages: [rawMessage],
        has_more: true,
        next_cursor: { created_at: createdAt, id: participantId },
      }),
    ).toMatchObject({
      hasMore: true,
      nextCursor: { createdAt, id: participantId },
    });
    expect(
      mapToggleReactionResult({
        message_id: participantId,
        reaction: "like",
        active: true,
        count: 1,
      }),
    ).toEqual({
      messageId: participantId,
      reaction: "like",
      active: true,
      count: 1,
    });
  });
});
