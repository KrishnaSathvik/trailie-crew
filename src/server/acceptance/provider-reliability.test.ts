import { describe, expect, it } from "vitest";

import {
  buildProviderAcceptanceReport,
  providerAcceptanceCases,
  providerAcceptanceRunCount,
} from "./provider-reliability";

describe("bounded provider reliability acceptance", () => {
  it("uses the required bounded sample envelope", () => {
    expect(providerAcceptanceRunCount).toBe(15);
    expect(
      Object.fromEntries(
        providerAcceptanceCases.map((item) => [item.workflow, item.runs]),
      ),
    ).toEqual({
      focused_answer: 3,
      memory_extraction: 3,
      planning_summary: 2,
      itinerary_generation: 2,
      itinerary_repair: 1,
      revision_analysis: 2,
      revision_candidate: 2,
    });
  });

  it("reports observed ranges without content fields or percentile claims", () => {
    const report = buildProviderAcceptanceReport([
      {
        workflow: "focused_answer",
        model: "gpt-5.6-terra",
        requestId: "request-1",
        providerStatus: "completed",
        applicationStatus: "completed",
        providerDurationMs: 1_000,
        totalDurationMs: 1_100,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        retryCount: 0,
        repairCount: 0,
        finalErrorCode: null,
        recoveryNeeded: false,
      },
      {
        workflow: "focused_answer",
        model: "gpt-5.6-terra",
        requestId: "request-2",
        providerStatus: "completed",
        applicationStatus: "completed",
        providerDurationMs: 2_000,
        totalDurationMs: 2_100,
        inputTokens: 12,
        outputTokens: 6,
        totalTokens: 18,
        retryCount: 0,
        repairCount: 0,
        finalErrorCode: null,
        recoveryNeeded: false,
      },
    ]);
    expect(report.summary.focused_answer).toMatchObject({
      samples: 2,
      successes: 2,
      observedProviderDurationMs: { minimum: 1_000, maximum: 2_000 },
      observedTotalDurationMs: { minimum: 1_100, maximum: 2_100 },
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/prompt|message|body|inputText|outputText/i);
    expect(serialized).not.toMatch(/p95|percentile/i);
  });
});
