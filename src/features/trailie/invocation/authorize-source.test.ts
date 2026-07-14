import { describe, expect, it } from "vitest";

import { authorizeTrailieSource } from "./authorize-source";

const participant = {
  id: "p1",
  roomId: "r1",
  userId: "u1",
  status: "active" as const,
};
const source = {
  id: "m1",
  roomId: "r1",
  participantId: "p1",
  senderUserId: "u1",
  messageType: "user" as const,
  deletedAt: null,
};

describe("Trailie source authorization", () => {
  it("accepts an owned source message for an active room member", () => {
    expect(
      authorizeTrailieSource({
        authUserId: "u1",
        roomId: "r1",
        participant,
        source,
      }),
    ).toBe(true);
  });

  it.each([
    { authUserId: "outsider" },
    { participant: { ...participant, status: "left" as const } },
    { participant: { ...participant, userId: "spoof" } },
    { source: { ...source, roomId: "r2" } },
    { source: { ...source, senderUserId: "u2" } },
    { source: { ...source, messageType: "system" as const } },
    { source: { ...source, deletedAt: "2026-01-01" } },
  ])("rejects unauthorized or invalid sources %#", (override) => {
    expect(
      authorizeTrailieSource({
        authUserId: "u1",
        roomId: "r1",
        participant,
        source,
        ...override,
      }),
    ).toBe(false);
  });
});
