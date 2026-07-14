import { describe, expect, it } from "vitest";
import {
  buildChangeAnalysisContext,
  buildRevisionCandidateContext,
} from "./context";
import {
  approvedMoveAnalysis,
  revisionItinerary,
  revisionPlanningSummary,
} from "./test-fixtures";

describe("revision model context", () => {
  it("includes only the explicit request and bounded published plan for analysis", () => {
    const context = buildChangeAnalysisContext({
      requestType: "move_item",
      targetItemId: "item:sunset",
      requestText: "Move it later",
      basePlan: revisionItinerary(),
    });
    expect(context).toContain("<EXPLICIT_CHANGE_REQUEST>");
    expect(context).toContain("item:sunset");
    expect(context).not.toContain("inviteToken");
    expect(context.length).toBeLessThanOrEqual(36_000);
  });
  it("includes the approved analysis and complete base but no transcript", () => {
    const context = buildRevisionCandidateContext({
      basePlan: revisionItinerary(),
      approvedSummary: revisionPlanningSummary(),
      analysis: approvedMoveAnalysis(),
      evidence: [],
    });
    expect(context).toContain("<APPROVED_CHANGE_ANALYSIS>");
    expect(context).toContain("<BASE_PUBLISHED_ITINERARY>");
    expect(context).not.toContain("conversationTranscript");
    expect(context.length).toBeLessThanOrEqual(64_000);
  });
});
