import { describe, expect, it, vi } from "vitest";

import {
  createDurableProviderAttemptController,
  runDurableProviderOperation,
  type ProviderAttemptDependencies,
} from "./provider-attempts";
import {
  ProviderFailure,
  parseWorkflowReliabilityPolicy,
} from "./reliability-policy";

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
    const afterStage = vi.fn().mockResolvedValue(undefined);
    const apply = vi.fn().mockResolvedValue(undefined);
    const result = await createDurableProviderAttemptController(deps).run({
      ...metadata,
      execute: vi.fn().mockResolvedValue(providerResult),
      parse: (value) => value as Result,
      afterStage,
      apply,
    });
    expect(result).toMatchObject({ status: "applied", recovered: false });
    expect(deps.stage).toHaveBeenCalledWith(
      "5c000000-0000-4000-8000-000000000001",
      "5c000000-0000-4000-8000-000000000002",
      providerResult,
    );
    expect(vi.mocked(deps.stage).mock.invocationCallOrder[0]).toBeLessThan(
      afterStage.mock.invocationCallOrder[0],
    );
    expect(afterStage.mock.invocationCallOrder[0]).toBeLessThan(
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
    const afterStage = vi.fn().mockResolvedValue(undefined);
    const apply = vi.fn().mockResolvedValue(undefined);
    await expect(
      createDurableProviderAttemptController(deps).run({
        ...metadata,
        execute,
        parse: (value) => value as Result,
        afterStage,
        apply,
      }),
    ).resolves.toMatchObject({ status: "applied", recovered: true });
    expect(execute).not.toHaveBeenCalled();
    expect(deps.stage).not.toHaveBeenCalled();
    expect(afterStage).toHaveBeenCalledWith(providerResult);
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
    const times = [1_000, 1_250, 1_250];
    await expect(
      createDurableProviderAttemptController(deps).run({
        ...metadata,
        workflowStartedAt: 900,
        now: () => times.shift() ?? 1_250,
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
      expect.objectContaining({
        statusCode: null,
        requestId: null,
        providerDurationMs: 250,
        totalDurationMs: 350,
      }),
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
      expect.objectContaining({ nextRetryAt: null }),
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

describe("durable provider retry orchestration", () => {
  it("uses distinct attempt rows for one transient retry", async () => {
    const calls: number[] = [];
    const controller = {
      run: vi.fn(async (input) => {
        calls.push(input.attempt);
        if (input.attempt === 1)
          throw new ProviderFailure("model_unavailable", {
            statusCode: 503,
            retryAfterMs: 100,
          });
        return {
          status: "applied" as const,
          recovered: false,
          attemptId: "5c000000-0000-4000-8000-000000000002",
          result: {
            ...providerResult,
            value: { schemaVersion: "1" as const, title: "Recovered" },
          },
        };
      }),
    };
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      runDurableProviderOperation({
        controller: controller as never,
        workflow: "focused_answer",
        operationKey: "focused:invocation-1",
        model: "gpt-5.6-terra",
        stage: "focusedProvider",
        policy: parseWorkflowReliabilityPolicy({}),
        execute: vi.fn(),
        parse: vi.fn(),
        apply: vi.fn(),
        sleep,
        random: () => 0.5,
      }),
    ).resolves.toMatchObject({
      status: "applied",
      result: { value: { title: "Recovered" }, retryCount: 1 },
    });
    expect(calls).toEqual([1, 2]);
    expect(controller.run.mock.calls[0]?.[0].operationKey).toBe(
      controller.run.mock.calls[1]?.[0].operationKey,
    );
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("never calls the provider when a validated result is recovered", async () => {
    const execute = vi.fn();
    const staged = {
      ...providerResult,
      value: { schemaVersion: "1" as const, title: "Staged" },
    };
    const controller = {
      run: vi.fn(async (input) => {
        await input.apply(staged.value, staged);
        return {
          status: "applied" as const,
          recovered: true,
          attemptId: "5c000000-0000-4000-8000-000000000001",
          result: staged,
        };
      }),
    };
    await expect(
      runDurableProviderOperation({
        controller: controller as never,
        workflow: "focused_answer",
        operationKey: "focused:invocation-1",
        model: "gpt-5.6-terra",
        stage: "focusedProvider",
        policy: parseWorkflowReliabilityPolicy({}),
        execute,
        parse: vi.fn(),
        apply: vi.fn(),
      }),
    ).resolves.toMatchObject({ status: "applied", recovered: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it("resumes with the next durable attempt after interruption", async () => {
    const controller = {
      run: vi.fn(async (input) => ({
        status: "applied" as const,
        recovered: true,
        attemptId: "5c000000-0000-4000-8000-000000000002",
        result: {
          ...providerResult,
          value: { schemaVersion: "1" as const, title: "Recovered" },
        },
        input,
      })),
    };
    await runDurableProviderOperation({
      controller: controller as never,
      workflow: "focused_answer",
      operationKey: "focused:invocation-1",
      model: "gpt-5.6-terra",
      stage: "focusedProvider",
      policy: parseWorkflowReliabilityPolicy({}),
      initialAttempt: 2,
      execute: vi.fn(),
      parse: vi.fn(),
      apply: vi.fn(),
    });
    expect(controller.run).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: 2 }),
    );
    expect(controller.run).toHaveBeenCalledTimes(1);
  });
});
