import { describe, expect, it, vi } from "vitest";
import { processPlanningSummary } from "./worker";
import { createFakePlanningSummaryProvider } from "./provider";

const context = {
  requestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  approvalMode: "all_active" as const,
  memoryVersion: 1,
  memorySnapshot: {
    participantProfiles: {},
    sharedContext: {
      destinationsUnderConsideration: [{ value: { text: "Yosemite" } }],
      dateWindows: [{ value: { text: "Sep 12–16" } }],
    },
    confirmedDecisions: [],
    rejectedOptions: [],
    openQuestions: [],
  },
  participants: [
    {
      id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      displayName: "Maya",
      role: "host" as const,
    },
  ],
  activeFacts: [],
  recentMessages: [],
  reviewNotes: [],
};

describe("planning worker", () => {
  it("claims once, validates readiness, and completes without itinerary persistence", async () => {
    const repository = {
      claim: vi.fn().mockResolvedValue({
        claimed: true,
        status: "generating_summary",
        attemptCount: 1,
        summaryVersion: 1,
      }),
      loadContext: vi.fn().mockResolvedValue(context),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    await processPlanningSummary(context.requestId, {
      repository,
      provider: createFakePlanningSummaryProvider(),
      safetyIdentifier: "safe",
      model: "gpt-5.6-sol",
      timeoutMs: 1000,
    });
    expect(repository.complete).toHaveBeenCalledOnce();
    expect(repository.complete.mock.calls[0][2]).toBe("ready_for_review");
    expect(repository).not.toHaveProperty("createItinerary");
  });
  it("does nothing when a duplicate schedule cannot claim", async () => {
    const repository = {
      claim: vi.fn().mockResolvedValue({
        claimed: false,
        status: "generating_summary",
        attemptCount: 1,
      }),
      loadContext: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    await processPlanningSummary(context.requestId, {
      repository,
      provider: createFakePlanningSummaryProvider(),
      safetyIdentifier: "safe",
    });
    expect(repository.loadContext).not.toHaveBeenCalled();
  });
});
