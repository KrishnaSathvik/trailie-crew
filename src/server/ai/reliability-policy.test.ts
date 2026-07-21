import { describe, expect, it, vi } from "vitest";

import {
  ProviderFailure,
  classifyProviderFailure,
  computeProviderRetryDelay,
  computeRetryDelay,
  normalizeProviderError,
  parseRetryAfter,
  parseWorkflowReliabilityPolicy,
  performanceStageTimeout,
  remainingProviderTimeout,
  runProviderOperation,
} from "./reliability-policy";

describe("workflow reliability policy", () => {
  it("caps planning critical-path stages to bounded product recovery windows", () => {
    expect(performanceStageTimeout("planningProvider", 90_000)).toBe(18_000);
    expect(performanceStageTimeout("itineraryGeneration", 180_000)).toBe(
      45_000,
    );
    expect(performanceStageTimeout("itineraryRepair", 120_000)).toBe(20_000);
    expect(performanceStageTimeout("focusedProvider", 30_000)).toBe(30_000);
  });

  it("provides bounded workflow-specific defaults", () => {
    expect(parseWorkflowReliabilityPolicy({})).toEqual({
      timeoutsMs: {
        focusedProvider: 30_000,
        memoryProvider: 20_000,
        planningProvider: 90_000,
        itineraryGeneration: 180_000,
        itineraryRepair: 120_000,
        revisionAnalysis: 60_000,
        revisionGeneration: 180_000,
      },
      totalWorkflowDeadlineMs: 300_000,
      recoveryLeaseMs: 360_000,
      maximumAttempts: 2,
      backoff: { baseMs: 500, maximumMs: 5_000, jitterRatio: 0.2 },
    });
  });

  it("accepts validated environment overrides and rejects unsafe bounds", () => {
    expect(
      parseWorkflowReliabilityPolicy({
        AI_TIMEOUT_FOCUSED_MS: "15000",
        AI_TIMEOUT_MEMORY_MS: "10000",
        AI_TIMEOUT_PLANNING_MS: "80000",
        AI_TIMEOUT_ITINERARY_GENERATION_MS: "200000",
        AI_TIMEOUT_ITINERARY_REPAIR_MS: "150000",
        AI_TIMEOUT_REVISION_ANALYSIS_MS: "45000",
        AI_TIMEOUT_REVISION_GENERATION_MS: "190000",
        AI_TOTAL_WORKFLOW_DEADLINE_MS: "299000",
        AI_RECOVERY_LEASE_MS: "400000",
        AI_MAXIMUM_ATTEMPTS: "3",
        AI_RETRY_BASE_MS: "750",
        AI_RETRY_MAXIMUM_MS: "6000",
        AI_RETRY_JITTER_RATIO: "0.1",
      }),
    ).toMatchObject({
      timeoutsMs: {
        focusedProvider: 15_000,
        memoryProvider: 10_000,
        planningProvider: 80_000,
        itineraryGeneration: 200_000,
        itineraryRepair: 150_000,
        revisionAnalysis: 45_000,
        revisionGeneration: 190_000,
      },
      maximumAttempts: 3,
      backoff: { baseMs: 750, maximumMs: 6_000, jitterRatio: 0.1 },
    });
    expect(() =>
      parseWorkflowReliabilityPolicy({ AI_MAXIMUM_ATTEMPTS: "20" }),
    ).toThrow();
    expect(() =>
      parseWorkflowReliabilityPolicy({
        AI_TIMEOUT_MEMORY_MS: "1000",
      }),
    ).toThrow();
    expect(() =>
      parseWorkflowReliabilityPolicy({
        AI_TIMEOUT_ITINERARY_GENERATION_MS: "400000",
      }),
    ).toThrow();
    expect(() =>
      parseWorkflowReliabilityPolicy({
        AI_RETRY_BASE_MS: "6000",
        AI_RETRY_MAXIMUM_MS: "5000",
      }),
    ).toThrow();
  });

  it("honors legacy hosted timeout names until environment migration completes", () => {
    expect(
      parseWorkflowReliabilityPolicy({
        OPENAI_TIMEOUT_MS: "12000",
        OPENAI_MEMORY_TIMEOUT_MS: "9000",
        OPENAI_PLANNING_TIMEOUT_MS: "70000",
        OPENAI_ITINERARY_TIMEOUT_MS: "170000",
      }),
    ).toMatchObject({
      timeoutsMs: {
        focusedProvider: 12_000,
        memoryProvider: 9_000,
        planningProvider: 70_000,
        itineraryGeneration: 170_000,
        itineraryRepair: 170_000,
        revisionGeneration: 170_000,
      },
    });
    expect(
      parseWorkflowReliabilityPolicy({
        OPENAI_TIMEOUT_MS: "12000",
        AI_TIMEOUT_FOCUSED_MS: "15000",
      }).timeoutsMs.focusedProvider,
    ).toBe(15_000);
  });

  it.each([
    ["model_timeout", true],
    ["model_unavailable", true],
    ["model_rate_limited", true],
    ["invalid_model_output", false],
    ["workflow_deadline_exceeded", false],
    ["retry_exhausted", false],
    ["recovery_required", false],
    ["workflow_cancelled", false],
  ] as const)("classifies %s retryability safely", (code, retryable) => {
    expect(classifyProviderFailure(new ProviderFailure(code))).toMatchObject({
      code,
      retryable,
    });
  });

  it("maps abort deadlines to timeout without calling them validation errors", () => {
    const error = new DOMException("The operation timed out", "TimeoutError");
    expect(classifyProviderFailure(error)).toMatchObject({
      code: "model_timeout",
      retryable: true,
    });
  });

  it.each([
    [429, "model_rate_limited"],
    [500, "model_unavailable"],
    [502, "model_unavailable"],
    [503, "model_unavailable"],
    [504, "model_unavailable"],
  ] as const)(
    "normalizes HTTP %s with safe provider metadata",
    (status, code) => {
      const headers = new Headers({
        "x-request-id": "req_safe_123",
        "retry-after": "2",
      });
      expect(
        normalizeProviderError({
          status,
          headers,
          requestID: "req_safe_123",
          error: { message: "must not persist" },
        }),
      ).toMatchObject({
        code,
        retryable: true,
        statusCode: status,
        requestId: "req_safe_123",
        retryAfterMs: 2_000,
      });
    },
  );

  it("preserves safe metadata already normalized by a provider wrapper", () => {
    expect(
      normalizeProviderError({
        code: "openai_unavailable",
        statusCode: 503,
        requestId: "req_wrapper_503",
        retryAfterMs: 1_250,
        rawBody: "must not persist",
      }),
    ).toMatchObject({
      code: "model_unavailable",
      retryable: true,
      statusCode: 503,
      requestId: "req_wrapper_503",
      retryAfterMs: 1_250,
    });
  });

  it.each([
    [
      Object.assign(new TypeError("fetch failed"), {
        cause: { code: "ECONNRESET" },
      }),
      "model_unavailable",
    ],
    [new DOMException("cancelled", "AbortError"), "recovery_required"],
    [new DOMException("timed out", "TimeoutError"), "model_timeout"],
  ] as const)("normalizes transport failure %s", (error, code) => {
    expect(normalizeProviderError(error)).toMatchObject({ code });
  });

  it("parses and bounds Retry-After seconds or dates", () => {
    const now = Date.parse("2026-07-17T15:00:00.000Z");
    expect(parseRetryAfter("2", { now, maximumMs: 5_000 })).toBe(2_000);
    expect(
      parseRetryAfter("Fri, 17 Jul 2026 15:00:03 GMT", {
        now,
        maximumMs: 5_000,
      }),
    ).toBe(3_000);
    expect(parseRetryAfter("0", { now, maximumMs: 5_000 })).toBe(0);
    expect(parseRetryAfter("-1", { now, maximumMs: 5_000 })).toBeNull();
    expect(
      parseRetryAfter("not-a-delay", { now, maximumMs: 5_000 }),
    ).toBeNull();
    expect(parseRetryAfter("60", { now, maximumMs: 5_000 })).toBe(5_000);
  });

  it("honors bounded Retry-After without exceeding the workflow deadline", () => {
    const policy = parseWorkflowReliabilityPolicy({});
    expect(
      computeProviderRetryDelay({
        policy,
        attempt: 1,
        retryAfterMs: 2_000,
        remainingWorkflowMs: 10_000,
        random: () => 0.5,
      }),
    ).toBe(2_000);
    expect(
      computeProviderRetryDelay({
        policy,
        attempt: 1,
        retryAfterMs: 20_000,
        remainingWorkflowMs: 1_500,
        random: () => 0.5,
      }),
    ).toBeNull();
  });

  it("uses capped exponential backoff with injectable jitter", () => {
    const policy = parseWorkflowReliabilityPolicy({});
    expect(computeRetryDelay(policy, 1, () => 0.5)).toBe(500);
    expect(computeRetryDelay(policy, 2, () => 0.5)).toBe(1_000);
    expect(computeRetryDelay(policy, 20, () => 0.5)).toBe(5_000);
    expect(computeRetryDelay(policy, 1, () => 0)).toBe(400);
    expect(computeRetryDelay(policy, 1, () => 1)).toBe(600);
  });

  it("caps each stage by the remaining total workflow deadline", () => {
    const policy = parseWorkflowReliabilityPolicy({});
    expect(
      remainingProviderTimeout(policy, "itineraryGeneration", 0, 250_000),
    ).toBe(50_000);
    expect(
      remainingProviderTimeout(policy, "itineraryRepair", 0, 100_000),
    ).toBe(120_000);
    expect(() =>
      remainingProviderTimeout(policy, "revisionGeneration", 0, 300_001),
    ).toThrow("workflow_deadline_exceeded");
  });

  it("retries a transient failure once and exposes safe attempt metadata", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ProviderFailure("model_unavailable"))
      .mockResolvedValueOnce("ok");
    const attempts: Array<{ attempt: number; retryCount: number }> = [];
    const result = await runProviderOperation({
      policy: parseWorkflowReliabilityPolicy({}),
      stage: "focusedProvider",
      operation: async ({ signal, attempt, retryCount }) => {
        expect(signal.aborted).toBe(false);
        attempts.push({ attempt, retryCount });
        return operation();
      },
      sleep: vi.fn().mockResolvedValue(undefined),
      random: () => 0.5,
      now: (() => {
        let now = 0;
        return () => (now += 10);
      })(),
    });
    expect(result).toMatchObject({
      value: "ok",
      attemptCount: 2,
      retryCount: 1,
    });
    expect(attempts).toEqual([
      { attempt: 1, retryCount: 0 },
      { attempt: 2, retryCount: 1 },
    ]);
  });

  it("does not retry invalid output and reports exhaustion safely", async () => {
    const invalid = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(new ProviderFailure("invalid_model_output"));
    await expect(
      runProviderOperation({
        policy: parseWorkflowReliabilityPolicy({}),
        stage: "memoryProvider",
        operation: invalid,
      }),
    ).rejects.toMatchObject({ code: "invalid_model_output" });
    expect(invalid).toHaveBeenCalledTimes(1);

    const unavailable = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(new ProviderFailure("model_unavailable"));
    await expect(
      runProviderOperation({
        policy: parseWorkflowReliabilityPolicy({}),
        stage: "memoryProvider",
        operation: unavailable,
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toMatchObject({ code: "retry_exhausted" });
    expect(unavailable).toHaveBeenCalledTimes(2);
  });

  it("preserves quota rejection without a provider retry", async () => {
    const rejection = Object.assign(new Error("ai_disabled"), {
      code: "ai_disabled",
    });
    const operation = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(rejection);

    await expect(
      runProviderOperation({
        policy: parseWorkflowReliabilityPolicy({}),
        stage: "focusedProvider",
        operation,
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toBe(rejection);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("stops before retry when the total workflow deadline is exhausted", async () => {
    const unavailable = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(new ProviderFailure("model_unavailable"));
    let calls = 0;
    await expect(
      runProviderOperation({
        policy: parseWorkflowReliabilityPolicy({
          AI_TOTAL_WORKFLOW_DEADLINE_MS: "30000",
        }),
        stage: "focusedProvider",
        operation: unavailable,
        now: () => (calls++ === 0 ? 0 : 30_001),
      }),
    ).rejects.toMatchObject({ code: "workflow_deadline_exceeded" });
    expect(unavailable).toHaveBeenCalledTimes(1);
  });

  it("propagates caller cancellation without a retry", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    const operation = vi.fn();
    await expect(
      runProviderOperation({
        policy: parseWorkflowReliabilityPolicy({}),
        stage: "planningProvider",
        signal: controller.signal,
        operation,
      }),
    ).rejects.toMatchObject({ code: "workflow_cancelled" });
    expect(operation).not.toHaveBeenCalled();
  });

  it.each([
    ["openai_timeout", "model_timeout"],
    ["openai_rate_limited", "model_rate_limited"],
    ["invalid_model_response", "invalid_model_output"],
    ["openai_unavailable", "model_unavailable"],
  ])("normalizes legacy provider code %s to %s", (source, expected) => {
    expect(classifyProviderFailure({ code: source })).toMatchObject({
      code: expected,
    });
  });
});
