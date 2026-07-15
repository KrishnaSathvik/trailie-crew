import { describe, expect, it, vi } from "vitest";
import { processPlanningSummary } from "./worker";
import { createFakePlanningSummaryProvider } from "./provider";
import { PlanningProviderError } from "./provider";
import { parseWorkflowReliabilityPolicy } from "@/server/ai/reliability-policy";

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

  it("uses central retry limits and backoff for retryable durable attempts", async () => {
    const repository = {
      claim: vi
        .fn()
        .mockResolvedValueOnce({
          claimed: true,
          status: "generating_summary",
          attemptCount: 1,
          summaryVersion: 1,
        })
        .mockResolvedValueOnce({
          claimed: true,
          status: "generating_summary",
          attemptCount: 2,
          summaryVersion: 1,
        })
        .mockResolvedValueOnce({
          claimed: true,
          status: "generating_summary",
          attemptCount: 3,
          summaryVersion: 1,
        }),
      loadContext: vi.fn().mockResolvedValue(context),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const provider = {
      summarize: vi
        .fn()
        .mockRejectedValue(
          new PlanningProviderError("model_rate_limited", true),
        ),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    await processPlanningSummary(context.requestId, {
      repository,
      provider,
      safetyIdentifier: "safe",
      reliabilityPolicy: parseWorkflowReliabilityPolicy({
        AI_MAXIMUM_ATTEMPTS: "3",
      }),
      retry: { sleep, random: () => 0.5 },
    });
    expect(provider.summarize).toHaveBeenCalledTimes(3);
    expect(repository.fail).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 500);
    expect(sleep).toHaveBeenNthCalledWith(2, 1_000);
  });
});
