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

  it("caps memory at two attempts even when a shared policy allows three", async () => {
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
    expect(provider.extract).toHaveBeenCalledTimes(2);
    expect(store.claim).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("honors a bounded provider Retry-After before the second claim", async () => {
    const store = repository("I prefer hiking", [
      { status: "running", claimed: true, attemptCount: 1 },
      { status: "running", claimed: true, attemptCount: 2 },
    ]);
    const provider = {
      extract: vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error("temporarily unavailable"), {
            code: "model_unavailable",
            retryable: true,
            retryAfterMs: 1_500,
          }),
        )
        .mockResolvedValueOnce(
          await createFakeMemoryExtractionProvider().extract({
            operationKey: messageId,
            model: "gpt-5.6-luna",
            safetyIdentifier: "safe",
            ...context("I prefer hiking"),
            signal: new AbortController().signal,
          }),
        ),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);
    await processMemoryExtraction(messageId, {
      repository: store,
      provider,
      safetyIdentifier: "safe",
      retry: { sleep, random: () => 0.5 },
    });
    expect(sleep).toHaveBeenCalledWith(1_500);
    expect(store.complete).toHaveBeenCalledOnce();
  });

  it("uses one message-scoped quota reservation across a 503 retry", async () => {
    const store = repository("I prefer hiking", [
      { status: "running", claimed: true, attemptCount: 1 },
      { status: "running", claimed: true, attemptCount: 2 },
    ]);
    const provider = {
      extract: vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error("unavailable"), {
            code: "model_unavailable",
            retryable: true,
          }),
        )
        .mockResolvedValueOnce(
          await createFakeMemoryExtractionProvider().extract({
            operationKey: messageId,
            model: "gpt-5.6-luna",
            safetyIdentifier: "safe",
            ...context("I prefer hiking"),
            signal: new AbortController().signal,
          }),
        ),
    };
    const reserve = vi.fn().mockResolvedValue(undefined);
    const reconcile = vi.fn().mockResolvedValue(undefined);
    const release = vi.fn().mockResolvedValue(undefined);
    await processMemoryExtraction(messageId, {
      repository: store,
      provider,
      safetyIdentifier: "safe",
      retry: { sleep: vi.fn().mockResolvedValue(undefined) },
      quotaReservation: {
        id: messageId,
        reserve,
        reconcile,
        release,
      },
    });
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(reconcile).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
  });

  it("stages validated memory output through the durable attempt controller", async () => {
    const store = repository("I prefer hiking");
    const run = vi.fn(async (input) => {
      const result = await input.execute({
        attemptId: "5c000000-0000-4000-8000-000000000001",
        leaseOwner: "5c000000-0000-4000-8000-000000000002",
      });
      await input.apply(result.value, result);
      return { status: "applied", recovered: false, result };
    });
    await processMemoryExtraction(messageId, {
      repository: store,
      provider: createFakeMemoryExtractionProvider(),
      safetyIdentifier: "safe",
      providerAttempts: { run } as never,
      reliabilityPolicy: parseWorkflowReliabilityPolicy({}),
    });
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        workflow: "memory_extraction",
        operationKey: `memory:${messageId}`,
        attempt: 1,
        model: "gpt-5.6-luna",
        leaseMs: 360_000,
      }),
    );
    expect(store.complete).toHaveBeenCalledOnce();
  });
});
