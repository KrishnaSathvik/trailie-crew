import { describe, expect, it } from "vitest";
import { validateChangeBoundary } from "./change-boundary";
import { approvedMoveAnalysis, revisionItinerary } from "../test-fixtures";

describe("change-boundary validation", () => {
  it("allows the approved move with a disclosed downstream route shift", () => {
    const base = revisionItinerary();
    const candidate = structuredClone(base);
    candidate.days[0].items[1].startTime = "18:00";
    candidate.days[0].items[1].endTime = "19:30";
    const result = validateChangeBoundary({
      base,
      candidate,
      analysis: approvedMoveAnalysis(),
      baseVersion: 1,
      candidateVersion: 2,
    });
    expect(result.status).toBe("pass");
  });
  it.each([
    [
      "destination drift",
      (plan: ReturnType<typeof revisionItinerary>) => {
        plan.destinationSummary = "Zion";
      },
    ],
    [
      "date drift",
      (plan: ReturnType<typeof revisionItinerary>) => {
        plan.startDate = "2026-09-11";
      },
    ],
    [
      "unrelated day rewrite",
      (plan: ReturnType<typeof revisionItinerary>) => {
        plan.days[1].items[0].title = "Casino day";
      },
    ],
  ] as const)("blocks %s", (_label, mutate) => {
    const base = revisionItinerary();
    const candidate = structuredClone(base);
    mutate(candidate);
    const result = validateChangeBoundary({
      base,
      candidate,
      analysis: approvedMoveAnalysis(),
      baseVersion: 1,
      candidateVersion: 2,
    });
    expect(result.status).toBe("blocked");
  });
});
