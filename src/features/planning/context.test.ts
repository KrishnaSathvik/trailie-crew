import { describe, expect, it } from "vitest";
import { buildPlanningContext } from "./context";

describe("planning context", () => {
  it("bounds evidence and excludes auth/provider metadata", () => {
    const context = buildPlanningContext({
      requestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      approvalMode: "all_active",
      memoryVersion: 2,
      memorySnapshot: {
        participantProfiles: {},
        sharedContext: {},
        confirmedDecisions: [],
        rejectedOptions: [],
        openQuestions: [],
      },
      participants: [
        {
          id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
          displayName: "Maya",
          role: "host",
        },
      ],
      activeFacts: Array.from({ length: 60 }, (_, i) => ({
        id: `${i}`,
        value: { text: "x".repeat(1000) },
      })),
      recentMessages: Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        body: "trip detail",
        messageType: "user",
        participantId: "p",
        displayName: "Maya",
        createdAt: "2026-07-13T00:00:00Z",
      })),
      reviewNotes: [],
    });
    expect(context.length).toBeLessThanOrEqual(16_000);
    expect(context).not.toContain("userId");
    expect(context).not.toContain("email");
    expect(context).not.toContain("provider");
  });
});
