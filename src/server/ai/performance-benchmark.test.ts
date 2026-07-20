import { describe, expect, it } from "vitest";

import {
  buildPhase8bBenchmarkFixtures,
  runPhase8bBenchmark,
} from "./performance-benchmark";

describe("Phase 8B bounded benchmark", () => {
  it("builds the exact non-sensitive benchmark matrix", () => {
    const fixtures = buildPhase8bBenchmarkFixtures();
    expect(
      Object.fromEntries(
        Object.entries(
          Object.groupBy(fixtures, (fixture) => fixture.category),
        ).map(([category, values]) => [category, values?.length ?? 0]),
      ),
    ).toEqual({
      simple_chat: 10,
      context_backed: 10,
      tool_backed: 5,
      planning_summary: 3,
      full_itinerary: 3,
      small_revision: 5,
      large_revision: 3,
    });
    expect(JSON.stringify(fixtures)).not.toMatch(
      /token|secret|private lodging|@/i,
    );
  });

  it("reports deterministic p50, p95, maximum, routes, failures, and cost", async () => {
    let index = 0;
    const report = await runPhase8bBenchmark({
      execute: async (fixture) => {
        index += 1;
        return {
          fixtureId: fixture.id,
          selectedRoute: fixture.expectedRoute,
          visibleStateMs: index,
          firstTokenMs: index * 2,
          totalDurationMs: index * 10,
          toolTimeMs: fixture.category === "tool_backed" ? 5 : 0,
          validationMs: fixture.structured ? 3 : 0,
          inputTokens: 100,
          outputTokens: 50,
          estimatedCost: 0.01,
          state: index === 39 ? "failure" : "success",
          fallbackReason: null,
        };
      },
    });
    expect(report.totalRequests).toBe(39);
    expect(report.failures).toBe(1);
    expect(report.estimatedCost).toBeCloseTo(0.39);
    expect(report.categories.simple_chat.totalDurationMs).toEqual({
      count: 10,
      p50: 50,
      p95: 100,
      maximum: 100,
    });
    expect(report.categories.full_itinerary.routes).toEqual({
      reasoning_planning: 3,
    });
  });
});
