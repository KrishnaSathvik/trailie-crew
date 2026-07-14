import { describe, expect, it } from "vitest";

import {
  approvalModeSchema,
  createTripInputSchema,
  createTripResultSchema,
  getRoomMessagesInputSchema,
  getRoomMessagesResultSchema,
  joinTripInputSchema,
  memoryFactTypeSchema,
  memoryPatchSchema,
  memorySubjectTypeSchema,
  messageExtractionResultSchema,
  messageTypeSchema,
  participantRoleSchema,
  participantStatusSchema,
  presenceStateSchema,
  reactionTypeSchema,
  roomMessageSchema,
  roomStatusSchema,
  sendMessageInputSchema,
  toggleReactionInputSchema,
  typingEventSchema,
  evidenceStrengthSchema,
  extractionStatusSchema,
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

describe("Phase 2B conversation-memory schemas", () => {
  it("locks extraction, subject, evidence, and fact-type values", () => {
    expect(extractionStatusSchema.options).toEqual([
      "queued",
      "running",
      "completed",
      "failed",
      "skipped",
    ]);
    expect(memorySubjectTypeSchema.options).toEqual([
      "participant",
      "group",
      "trip",
    ]);
    expect(evidenceStrengthSchema.options).toEqual([
      "explicit",
      "strong",
      "tentative",
    ]);
    expect(memoryFactTypeSchema.options).toContain("group_decision");
    expect(memoryFactTypeSchema.options).not.toContain("custom");
  });

  it("accepts the smallest strict patch and rejects generated database ids", () => {
    const fact = {
      factType: "activity_preference",
      subjectType: "participant",
      subjectParticipantId: uuid,
      canonicalKey: "ignored-by-application",
      value: { text: "hiking" },
      status: "active",
      confidence: 0.92,
      evidenceStrength: "explicit",
      sourceMessageId: uuid,
    };
    expect(
      memoryPatchSchema.parse({ facts: [fact], supersessions: [] }),
    ).toEqual({
      facts: [fact],
      supersessions: [],
    });
    expect(
      memoryPatchSchema.safeParse({
        facts: [{ ...fact, id: uuid }],
        supersessions: [],
      }).success,
    ).toBe(false);
    expect(
      messageExtractionResultSchema.parse({
        status: "completed",
        patch: { facts: [], supersessions: [] },
      }),
    ).toMatchObject({ status: "completed" });
  });

  it("requires participant subjects and caps patch size and confidence", () => {
    const base = {
      factType: "activity_preference",
      subjectType: "participant",
      canonicalKey: "activity_preference:hiking",
      value: { text: "hiking" },
      status: "active",
      confidence: 0.8,
      evidenceStrength: "explicit",
      sourceMessageId: uuid,
    };
    expect(
      memoryPatchSchema.safeParse({ facts: [base], supersessions: [] }).success,
    ).toBe(false);
    expect(
      memoryPatchSchema.safeParse({
        facts: [{ ...base, subjectParticipantId: uuid, confidence: 1.1 }],
        supersessions: [],
      }).success,
    ).toBe(false);
    expect(
      memoryPatchSchema.safeParse({
        facts: Array.from({ length: 13 }, () => ({
          ...base,
          subjectParticipantId: uuid,
        })),
        supersessions: [],
      }).success,
    ).toBe(false);
  });
});

describe("Phase 1C chat schemas", () => {
  it("locks message and reaction values", () => {
    expect(messageTypeSchema.options).toEqual(["user", "system", "trailie"]);
    expect(reactionTypeSchema.options).toEqual([
      "like",
      "love",
      "laugh",
      "celebrate",
      "thinking",
    ]);
  });

  it("trims valid send input and enforces the 4000 character boundary", () => {
    expect(
      sendMessageInputSchema.parse({
        roomId: uuid,
        participantId: uuid,
        body: "  @Trailie find a campsite  ",
        clientMessageId: uuid,
        replyToMessageId: null,
      }),
    ).toMatchObject({ body: "@Trailie find a campsite" });
    expect(
      sendMessageInputSchema.safeParse({
        roomId: uuid,
        participantId: uuid,
        body: "   ",
        clientMessageId: uuid,
      }).success,
    ).toBe(false);
    expect(
      sendMessageInputSchema.safeParse({
        roomId: uuid,
        participantId: uuid,
        body: "x".repeat(4001),
        clientMessageId: uuid,
      }).success,
    ).toBe(false);
  });

  it("validates safe message pages without private auth fields", () => {
    const message = {
      id: uuid,
      roomId: uuid,
      participantId: uuid,
      messageType: "user",
      body: "Meet at the north trailhead.",
      clientMessageId: uuid,
      replyToMessageId: null,
      sender: { participantId: uuid, displayName: "Maya", role: "host" },
      reply: null,
      reactions: [
        { reaction: "like", count: 2, reactedByCurrentParticipant: true },
      ],
      createdAt: "2026-07-13T18:00:00.000Z",
      editedAt: null,
      deletedAt: null,
    };
    expect(roomMessageSchema.parse(message)).toEqual(message);
    expect(
      getRoomMessagesResultSchema.parse({
        messages: [message],
        hasMore: true,
        nextCursor: { createdAt: message.createdAt, id: uuid },
      }),
    ).toMatchObject({ hasMore: true });
    expect(
      roomMessageSchema.safeParse({ ...message, email: "hidden@x.test" })
        .success,
    ).toBe(false);
  });

  it("requires paired cursors, caps page requests, and validates reactions", () => {
    expect(
      getRoomMessagesInputSchema.safeParse({ roomId: uuid, pageSize: 51 })
        .success,
    ).toBe(false);
    expect(
      getRoomMessagesInputSchema.safeParse({
        roomId: uuid,
        beforeCreatedAt: "2026-07-13T18:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      toggleReactionInputSchema.safeParse({
        messageId: uuid,
        participantId: uuid,
        reaction: "fire",
      }).success,
    ).toBe(false);
  });

  it("accepts privacy-minimal presence and expiring typing events", () => {
    expect(
      presenceStateSchema.parse({
        participantId: uuid,
        displayName: "Maya",
        connectedAt: "2026-07-13T18:00:00.000Z",
        currentArea: "chat",
      }),
    ).not.toHaveProperty("userId");
    expect(
      typingEventSchema.parse({
        participantId: uuid,
        displayName: "Maya",
        isTyping: true,
        expiresAt: "2026-07-13T18:00:03.000Z",
      }),
    ).toMatchObject({ isTyping: true });
  });
});
