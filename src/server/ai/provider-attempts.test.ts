import { describe, expect, it, vi } from "vitest";

import {
  createDurableProviderAttemptController,
  type ProviderAttemptDependencies,
} from "./provider-attempts";
import { ProviderFailure } from "./reliability-policy";

type Result = { schemaVersion: "1"; title: string };

function dependencies(
  claim: ProviderAttemptDependencies<Result>["claim"] = vi
    .fn()
    .mockResolvedValue({
      attemptId: "5c000000-0000-4000-8000-000000000001",
      claimed: true,
      resultAvailable: false,
      applied: false,
      recovered: false,
    }),
): ProviderAttemptDependencies<Result> {
  return {
    createLeaseOwner: () => "5c000000-0000-4000-8000-000000000002",
    claim,
    stage: vi.fn().mockResolvedValue(undefined),
    load: vi.fn(),
    markApplied: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}

const metadata = {
  workflow: "planning_summary" as const,
  operationKey: "planning:request-1:summary-1",
  attempt: 1,
  model: "gpt-5.6-sol",
  leaseMs: 360_000,
};

const providerResult = {
  value: { schemaVersion: "1", title: "Validated summary" } as Result,
  responseId: "response-1",
  requestId: "request-1",
  usage: {
    inputTokens: 100,
    outputTokens: 50,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    totalTokens: 150,
  },
  providerDurationMs: 1_200,
  totalDurationMs: 1_300,
  retryCount: 0,
  repairCount: 0,
};

describe("durable provider attempt controller", () => {
  it("stages validated output before applying the domain transition", async () => {
    const deps = dependencies();
    const apply = vi.fn().mockResolvedValue(undefined);
    const result = await createDurableProviderAttemptController(deps).run({
      ...metadata,
      execute: vi.fn().mockResolvedValue(providerResult),
      parse: (value) => value as Result,
      apply,
    });
    expect(result).toMatchObject({ status: "applied", recovered: false });
    expect(deps.stage).toHaveBeenCalledWith(
      "5c000000-0000-4000-8000-000000000001",
      "5c000000-0000-4000-8000-000000000002",
      providerResult,
    );
    expect(vi.mocked(deps.stage).mock.invocationCallOrder[0]).toBeLessThan(
      apply.mock.invocationCallOrder[0],
    );
    expect(apply).toHaveBeenCalledWith(providerResult.value, providerResult);
    expect(deps.markApplied).toHaveBeenCalledOnce();
  });

  it("loads a staged result during recovery without repeating the provider", async () => {
    const deps = dependencies(
      vi.fn().mockResolvedValue({
        attemptId: "5c000000-0000-4000-8000-000000000001",
        claimed: true,
        resultAvailable: true,
        applied: false,
        recovered: true,
      }),
    );
    deps.load = vi.fn().mockResolvedValue(providerResult);
    const execute = vi.fn();
    const apply = vi.fn().mockResolvedValue(undefined);
    await expect(
      createDurableProviderAttemptController(deps).run({
        ...metadata,
        execute,
        parse: (value) => value as Result,
        apply,
      }),
    ).resolves.toMatchObject({ status: "applied", recovered: true });
    expect(execute).not.toHaveBeenCalled();
    expect(deps.stage).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledOnce();
  });

  it("does nothing when another lease owns the attempt or work is applied", async () => {
    const active = dependencies(
      vi.fn().mockResolvedValue({
        attemptId: "attempt",
        claimed: false,
        resultAvailable: false,
        applied: false,
        recovered: false,
      }),
    );
    const applied = dependencies(
      vi.fn().mockResolvedValue({
        attemptId: "attempt",
        claimed: false,
        resultAvailable: false,
        applied: true,
        recovered: false,
      }),
    );
    const execute = vi.fn();
    await expect(
      createDurableProviderAttemptController(active).run({
        ...metadata,
        execute,
        parse: (value) => value as Result,
        apply: vi.fn(),
      }),
    ).resolves.toMatchObject({ status: "owned_elsewhere" });
    await expect(
      createDurableProviderAttemptController(applied).run({
        ...metadata,
        execute,
        parse: (value) => value as Result,
        apply: vi.fn(),
      }),
    ).resolves.toMatchObject({ status: "already_applied" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("records a safe failure before staging", async () => {
    const deps = dependencies();
    await expect(
      createDurableProviderAttemptController(deps).run({
        ...metadata,
        execute: vi
          .fn()
          .mockRejectedValue(new ProviderFailure("model_unavailable")),
        parse: (value) => value as Result,
        apply: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "model_unavailable" });
    expect(deps.fail).toHaveBeenCalledWith(
      "5c000000-0000-4000-8000-000000000001",
      "5c000000-0000-4000-8000-000000000002",
      "model_unavailable",
      true,
    );
  });

  it("preserves a non-provider operational rejection without making it retryable", async () => {
    const deps = dependencies();
    const quotaError = Object.assign(new Error("user_ai_limit_reached"), {
      code: "user_ai_limit_reached",
    });
    await expect(
      createDurableProviderAttemptController(deps).run({
        ...metadata,
        execute: vi.fn().mockRejectedValue(quotaError),
        parse: (value) => value as Result,
        apply: vi.fn(),
      }),
    ).rejects.toBe(quotaError);
    expect(deps.fail).toHaveBeenCalledWith(
      "5c000000-0000-4000-8000-000000000001",
      "5c000000-0000-4000-8000-000000000002",
      "user_ai_limit_reached",
      false,
    );
  });

  it("leaves staged output recoverable when domain application is interrupted", async () => {
    const deps = dependencies();
    await expect(
      createDurableProviderAttemptController(deps).run({
        ...metadata,
        execute: vi.fn().mockResolvedValue(providerResult),
        parse: (value) => value as Result,
        apply: vi.fn().mockRejectedValue(new Error("terminated")),
      }),
    ).rejects.toMatchObject({ code: "recovery_required" });
    expect(deps.fail).not.toHaveBeenCalled();
    expect(deps.markApplied).not.toHaveBeenCalled();
  });
});
