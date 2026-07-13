import { describe, expect, it } from "vitest";

import {
  mapCreateTripResult,
  mapJoinTripResult,
  mapParticipantSummary,
  mapRoomSummary,
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
