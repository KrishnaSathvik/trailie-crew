import { describe, expect, it } from "vitest";
import { validateChangeBoundary } from "./change-boundary";
import { approvedMoveAnalysis, revisionItinerary } from "../test-fixtures";
import { revisionPlanningSummary } from "../test-fixtures";
import { deriveAllowedChangeManifest } from "../manifest";

function moveManifest() {
  return deriveAllowedChangeManifest({
    changeRequestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
    basePlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
    baseVersion: 1,
    analysisVersion: 1,
    requestType: "move_item",
    targetItemId: "item:sunset",
    basePlan: revisionItinerary(),
    analysis: approvedMoveAnalysis(),
    approvedSummary: revisionPlanningSummary(),
  });
}

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
      manifest: moveManifest(),
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
      manifest: moveManifest(),
      baseVersion: 1,
      candidateVersion: 2,
    });
    expect(result.status).toBe("blocked");
  });

  it("blocks protected item reordering even when stable IDs and content remain", () => {
    const base = revisionItinerary();
    const candidate = structuredClone(base);
    candidate.days[1].items.push({
      ...structuredClone(candidate.days[1].items[0]),
      id: "item:lunch",
      title: "Lunch",
    });
    const manifest = moveManifest();
    manifest.protectedItemIds.push("item:lunch");
    const candidateReordered = structuredClone(candidate);
    candidateReordered.days[1].items.reverse();
    const result = validateChangeBoundary({
      base: candidate,
      candidate: candidateReordered,
      analysis: approvedMoveAnalysis(),
      manifest,
      baseVersion: 1,
      candidateVersion: 2,
    });
    expect(result.status).toBe("blocked");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "protected_item_reordered" }),
    );
  });

  it("blocks a replacement request that only reschedules the target", () => {
    const base = revisionItinerary();
    const candidate = structuredClone(base);
    candidate.days[0].items[1].startTime = "18:00";
    candidate.days[0].items[1].endTime = "19:30";
    const analysis = {
      ...approvedMoveAnalysis(),
      requestedChange: {
        type: "replace_item" as const,
        targetItemIds: ["item:sunset"],
        normalizedInstruction: "Replace the sunset stop.",
      },
    };
    const manifest = deriveAllowedChangeManifest({
      changeRequestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      basePlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
      baseVersion: 1,
      analysisVersion: 1,
      requestType: "replace_item",
      targetItemId: "item:sunset",
      basePlan: base,
      analysis,
      approvedSummary: revisionPlanningSummary(),
    });
    const result = validateChangeBoundary({
      base,
      candidate,
      analysis,
      manifest,
      baseVersion: 1,
      candidateVersion: 2,
    });
    expect(result.status).toBe("blocked");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "approved_operation_not_applied" }),
    );
  });
});
