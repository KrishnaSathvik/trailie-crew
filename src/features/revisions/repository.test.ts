import { describe, expect, it } from "vitest";
import { parseRevisionContext } from "./repository";
import { revisionItinerary, revisionPlanningSummary } from "./test-fixtures";

describe("revision repository context", () => {
  it("preserves the immutable base identity required by manifest derivation", () => {
    const context = parseRevisionContext({
      request: {
        id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
        roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
        baseTripPlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
        basePlanHash: "a".repeat(64),
        status: "approved",
        requestType: "remove_item",
        targetItemId: "item:walk",
        requestText: "Remove the walk.",
        basePlanVersion: 1,
        currentAnalysisVersion: 1,
        approvedAnalysisVersion: 1,
        candidateTripPlanId: null,
        candidateAttemptCount: 0,
        scopeRepairCount: 0,
        conflictRepairCount: 0,
      },
      basePlan: revisionItinerary(),
      approvedSummary: revisionPlanningSummary(),
      analysis: null,
      candidatePlan: null,
      manifest: null,
      patch: null,
      evidence: [],
    });

    expect(context.request).toEqual(
      expect.objectContaining({
        baseTripPlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
        basePlanHash: "a".repeat(64),
      }),
    );
  });
});
