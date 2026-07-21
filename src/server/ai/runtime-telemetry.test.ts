import { describe, expect, it } from "vitest";

import {
  createRuntimeTrace,
  summarizeRuntimeSamples,
} from "./runtime-telemetry";

describe("Trailie runtime telemetry", () => {
  it("records bounded stage timings without retaining private request content", async () => {
    const roomId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
    let clock = 1_000;
    const trace = createRuntimeTrace({
      requestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
      roomId,
      responseType: "normal_chat",
      startedAt: new Date("2026-07-20T18:00:00.000Z"),
      now: () => clock,
    });

    trace.setRouting({
      intent: "trip_context_question",
      complexity: "context_backed",
      selectedModelRoute: "fast",
      toolClasses: ["database_read"],
    });
    await trace.measure("permissionCheck", async () => {
      clock += 12;
    });
    await trace.measure("contextAssembly", async () => {
      clock += 23;
    });
    trace.recordDuration("expansion", 7);
    trace.markModelRequestStarted();
    clock += 40;
    trace.markFirstModelToken();
    clock += 5;
    trace.markFirstVisibleOutput();
    trace.recordToolCall("database_read", 17, {
      cache: "miss",
      retries: 0,
      state: "success",
    });
    trace.setUsage({
      inputTokens: 120,
      outputTokens: 40,
      estimatedCost: null,
    });
    clock += 20;

    const record = trace.complete({ state: "success" });
    expect(record).toMatchObject({
      requestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
      responseType: "normal_chat",
      detectedIntent: "trip_context_question",
      requestComplexity: "context_backed",
      selectedModelRoute: "fast",
      toolClassesSelected: ["database_read"],
      permissionCheckMs: 12,
      contextAssemblyMs: 23,
      expansionMs: 7,
      modelQueueMs: 40,
      timeToFirstModelTokenMs: 75,
      timeToFirstVisibleOutputMs: 80,
      toolCallMs: { database_read: 17 },
      providerCallCount: 1,
      inputTokens: 120,
      outputTokens: 40,
      successState: "success",
      totalDurationMs: 100,
    });
    expect(record.roomIdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(record)).not.toContain(roomId);
    expect(JSON.stringify(record)).not.toMatch(
      /hidden prompt|private memory|conversation body/i,
    );
  });

  it("records cancellation, timeout, and fallback reasons as bounded identifiers", () => {
    let clock = 5_000;
    const trace = createRuntimeTrace({
      requestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      responseType: "full_itinerary",
      now: () => clock,
    });
    clock += 75;
    const record = trace.complete({
      state: "cancelled",
      cancellationReason: "user_stop",
      timeoutReason: null,
      fallbackReason: "preferred_route_unavailable",
    });
    expect(record).toMatchObject({
      successState: "cancelled",
      cancellationReason: "user_stop",
      timeoutReason: null,
      fallbackReason: "preferred_route_unavailable",
      totalDurationMs: 75,
    });
  });

  it("retains a safely classified fallback reason on successful completion", () => {
    const trace = createRuntimeTrace({
      requestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a7",
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      responseType: "full_itinerary",
    });
    trace.recordFallback("model_unavailable");

    expect(trace.complete({ state: "success" })).toMatchObject({
      successState: "success",
      fallbackReason: "model_unavailable",
    });
  });

  it("counts provider fallbacks without resetting the first model start", () => {
    let clock = 2_000;
    const trace = createRuntimeTrace({
      requestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a5",
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      responseType: "normal_chat",
      monotonicStartedAt: 1_950,
      now: () => clock,
    });
    trace.markModelRequestStarted();
    clock += 10;
    trace.markModelRequestStarted();
    clock += 15;
    trace.markFirstModelToken();
    expect(trace.complete({ state: "success" })).toMatchObject({
      providerCallCount: 2,
      timeToFirstModelTokenMs: 75,
      modelQueueMs: 25,
    });
  });

  it("counts compact structural repair separately from semantic repair duration", () => {
    const trace = createRuntimeTrace({
      requestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a6",
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      responseType: "full_itinerary",
    });

    trace.recordRepairAttempt();
    trace.recordRepair(25);

    expect(trace.complete({ state: "success" })).toMatchObject({
      repairCount: 2,
      repairMs: 25,
    });
  });

  it("calculates deterministic p50, p95, and maximum summaries", () => {
    expect(summarizeRuntimeSamples([10, 20, 30, 40, 100])).toEqual({
      count: 5,
      p50: 30,
      p95: 100,
      maximum: 100,
    });
    expect(summarizeRuntimeSamples([])).toEqual({
      count: 0,
      p50: null,
      p95: null,
      maximum: null,
    });
  });
});
