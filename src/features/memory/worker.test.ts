import { describe, expect, it, vi } from "vitest";

import { processMemoryExtraction } from "./worker";
import { createFakeMemoryExtractionProvider } from "./provider";
import { parseWorkflowReliabilityPolicy } from "@/server/ai/reliability-policy";

const messageId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
const participantId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3";

function context(body: string) {
  return {
    roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
    sourceMessage: { id: messageId, body },
    sourceParticipant: {
      id: participantId,
      displayName: "Maya",
      role: "member" as const,
    },
    approvalMode: "all_active" as const,
    replyTarget: null,
    recentMessages: [],
    activeFacts: [],
    participantIds: [participantId],
  };
}

function repository(
  body: string,
  claims = [{ status: "running", claimed: true, attemptCount: 1 }],
) {
  return {
    claim: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(claims.shift() ?? { status: "failed", claimed: false }),
      ),
    loadContext: vi.fn().mockResolvedValue(context(body)),
    skip: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}

describe("memory extraction worker", () => {
  it("deterministically skips chatter without calling the provider", async () => {
    const store = repository("lol");
    const provider = { extract: vi.fn() };
    await processMemoryExtraction(messageId, {
      repository: store,
      provider,
      safetyIdentifier: "safe",
      retry: { sleep: vi.fn().mockResolvedValue(undefined) },
    });
    expect(provider.extract).not.toHaveBeenCalled();
    expect(store.skip).toHaveBeenCalledWith(messageId, "non_durable_chatter");
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("validates and completes one eligible patch without creating chat output", async () => {
    const store = repository("I prefer hiking");
    await processMemoryExtraction(messageId, {
      repository: store,
      provider: createFakeMemoryExtractionProvider(),
      safetyIdentifier: "safe",
    });
    expect(store.complete).toHaveBeenCalledOnce();
    expect(store.complete.mock.calls[0][1].facts[0]).toMatchObject({
      factType: "activity_preference",
      canonicalKey: "participant:activity_preference",
    });
  });

  it("does nothing when another worker owns or completed the claim", async () => {
    const store = repository("I prefer hiking", [
      { status: "running", claimed: false, attemptCount: 1 },
    ]);
    const provider = { extract: vi.fn() };
    await processMemoryExtraction(messageId, {
      repository: store,
      provider,
      safetyIdentifier: "safe",
    });
    expect(store.loadContext).not.toHaveBeenCalled();
    expect(provider.extract).not.toHaveBeenCalled();
  });

  it("retries one retryable provider failure and never mutates memory on final failure", async () => {
    const claims = [
      { status: "running", claimed: true, attemptCount: 1 },
      { status: "running", claimed: true, attemptCount: 2 },
    ];
    const store = repository("I prefer hiking", claims);
    const provider = {
      extract: vi.fn().mockRejectedValue(
        Object.assign(new Error("nope"), {
          code: "model_timeout",
          retryable: true,
        }),
      ),
    };
    await processMemoryExtraction(messageId, {
      repository: store,
      provider,
      safetyIdentifier: "safe",
    });
    expect(provider.extract).toHaveBeenCalledTimes(2);
    expect(store.fail).toHaveBeenCalledTimes(2);
    expect(store.complete).not.toHaveBeenCalled();
  });

  it("uses the central attempt cap and bounded backoff between durable claims", async () => {
    const store = repository("I prefer hiking", [
      { status: "running", claimed: true, attemptCount: 1 },
      { status: "running", claimed: true, attemptCount: 2 },
      { status: "running", claimed: true, attemptCount: 3 },
    ]);
    const provider = {
      extract: vi.fn().mockRejectedValue(
        Object.assign(new Error("unavailable"), {
          code: "model_unavailable",
          retryable: true,
        }),
      ),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    await processMemoryExtraction(messageId, {
      repository: store,
      provider,
      safetyIdentifier: "safe",
      reliabilityPolicy: parseWorkflowReliabilityPolicy({
        AI_MAXIMUM_ATTEMPTS: "3",
      }),
      retry: { sleep, random: () => 0.5 },
    });
    expect(provider.extract).toHaveBeenCalledTimes(3);
    expect(store.claim).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 500);
    expect(sleep).toHaveBeenNthCalledWith(2, 1_000);
  });
});
