import { describe, expect, it, vi } from "vitest";

import { createFakeFocusedAnswerProvider } from "./provider";
import { processFocusedRecovery } from "./focused-worker";
import { parseWorkflowReliabilityPolicy } from "./reliability-policy";

const invocationId = "5c000000-0000-4000-8000-000000000010";
const runId = "5c000000-0000-4000-8000-000000000011";
const sourceMessageId = "5c000000-0000-4000-8000-000000000012";

function dependencies() {
  const complete = vi.fn().mockResolvedValue(undefined);
  const executeAttempt = vi.fn(async (input) => {
    expect(input.attempt).toBe(2);
    const result = await input.execute({
      attemptId: "5c000000-0000-4000-8000-000000000013",
      leaseOwner: "5c000000-0000-4000-8000-000000000014",
    });
    await input.afterStage(result);
    await input.apply(result.value, result);
    return { status: "applied", result };
  });
  const reserve = vi.fn().mockResolvedValue(undefined);
  const reconcile = vi.fn().mockResolvedValue(undefined);
  return {
    load: vi.fn().mockResolvedValue({
      id: invocationId,
      roomId: "5c000000-0000-4000-8000-000000000015",
      sourceMessageId,
      participantId: "5c000000-0000-4000-8000-000000000016",
      userId: "5c000000-0000-4000-8000-000000000017",
      normalizedRequest: "What trail is best?",
      promptVersion: "focused-v1",
      providerAttemptCount: 1,
      status: "failed",
      model: "gpt-5.6-terra",
      messages: [
        {
          id: sourceMessageId,
          body: "@Trailie What trail is best?",
          displayName: "Maya",
          messageType: "user",
          createdAt: new Date().toISOString(),
          deletedAt: null,
        },
      ],
    }),
    start: vi.fn().mockResolvedValue(runId),
    complete,
    fail: vi.fn().mockResolvedValue(undefined),
    provider: createFakeFocusedAnswerProvider(),
    attempts: { run: executeAttempt },
    policy: parseWorkflowReliabilityPolicy({}),
    quota: () => ({
      id: invocationId,
      reserve,
      reconcile,
      release: vi.fn().mockResolvedValue(undefined),
    }),
    safetyIdentifier: () => "safe",
    correlationId: "correlation-1",
    completeSpy: complete,
    reconcileSpy: reconcile,
    executeAttempt,
  };
}

describe("focused answer recovery", () => {
  it("uses only the remaining durable attempt and applies one final message", async () => {
    const deps = dependencies();
    await expect(
      processFocusedRecovery(invocationId, deps as never),
    ).resolves.toEqual({ status: "completed" });
    expect(deps.executeAttempt).toHaveBeenCalledOnce();
    expect(deps.completeSpy).toHaveBeenCalledOnce();
    expect(deps.reconcileSpy).toHaveBeenCalledOnce();
  });

  it("does not call a provider when the durable controller loads staged output", async () => {
    const deps = dependencies();
    deps.attempts.run = vi.fn().mockResolvedValue({
      status: "applied",
      result: {},
    });
    const provider = vi.spyOn(deps.provider, "stream");
    await processFocusedRecovery(invocationId, deps as never);
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not recover past the focused two-attempt cap", async () => {
    const deps = dependencies();
    deps.policy = parseWorkflowReliabilityPolicy({
      AI_MAXIMUM_ATTEMPTS: "3",
    });
    deps.load.mockResolvedValueOnce({
      ...(await deps.load()),
      providerAttemptCount: 2,
    });
    await expect(
      processFocusedRecovery(invocationId, deps as never),
    ).rejects.toThrow("retry_exhausted");
    expect(deps.start).not.toHaveBeenCalled();
    expect(deps.executeAttempt).not.toHaveBeenCalled();
  });
});
