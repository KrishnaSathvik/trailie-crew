import { describe, expect, it } from "vitest";

import {
  approvalModeSchema,
  createTripInputSchema,
  createTripResultSchema,
  joinTripInputSchema,
  participantRoleSchema,
  participantStatusSchema,
  roomStatusSchema,
} from "./index";

const uuid = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";

describe("Phase 1A schemas", () => {
  it("accepts the locked database enum values", () => {
    expect(approvalModeSchema.options).toEqual(["all_active", "host_only"]);
    expect(roomStatusSchema.options).toEqual(["active", "archived", "deleted"]);
    expect(participantRoleSchema.options).toEqual(["host", "member"]);
    expect(participantStatusSchema.options).toEqual([
      "active",
      "left",
      "removed",
    ]);
  });

  it("validates and trims create Trip input", () => {
    expect(
      createTripInputSchema.parse({
        tripName: "  Boundary Waters  ",
        displayName: "  Maya  ",
        expectedTravelers: 6,
      }),
    ).toEqual({
      tripName: "Boundary Waters",
      displayName: "Maya",
      expectedTravelers: 6,
    });
  });

  it.each([
    { tripName: "", displayName: "Maya" },
    { tripName: "x".repeat(101), displayName: "Maya" },
    { tripName: "Boundary Waters", displayName: "" },
    { tripName: "Boundary Waters", displayName: "x".repeat(51) },
    { tripName: "Boundary Waters", displayName: "Maya", expectedTravelers: 0 },
    { tripName: "Boundary Waters", displayName: "Maya", expectedTravelers: 51 },
    {
      tripName: "Boundary Waters",
      displayName: "Maya",
      expectedTravelers: 2.5,
    },
  ])("rejects invalid create Trip input %#", (input) => {
    expect(createTripInputSchema.safeParse(input).success).toBe(false);
  });

  it("validates join input and safe create results", () => {
    expect(
      joinTripInputSchema.parse({
        inviteValue: "  ABCD2345  ",
        displayName: "  Leo  ",
      }),
    ).toEqual({ inviteValue: "ABCD2345", displayName: "Leo" });

    expect(
      createTripResultSchema.parse({
        roomId: uuid,
        roomName: "Boundary Waters",
        participantId: uuid,
        roomCode: "ABCD2345",
        inviteToken: "a".repeat(43),
        createdAt: "2026-07-13T18:00:00.000Z",
      }),
    ).toMatchObject({ roomCode: "ABCD2345" });
  });
});
