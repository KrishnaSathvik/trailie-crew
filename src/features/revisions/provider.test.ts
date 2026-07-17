import { describe, expect, it } from "vitest";
import { createFakeRevisionProvider } from "./provider";
import {
  approvedMoveAnalysis,
  revisionItinerary,
  revisionPlanningSummary,
} from "./test-fixtures";
import {
  deriveAllowedChangeManifest,
  hashAllowedChangeManifest,
} from "./manifest";

describe("fake revision provider", () => {
  it("returns an in-scope time patch for the canonical move fixture", async () => {
    const basePlan = revisionItinerary();
    const analysis = approvedMoveAnalysis();
    const manifest = deriveAllowedChangeManifest({
      changeRequestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      basePlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
      baseVersion: 1,
      basePlanHash: "a".repeat(64),
      analysisVersion: 1,
      requestType: "move_item",
      targetItemId: "item:sunset",
      basePlan,
      analysis,
      approvedSummary: revisionPlanningSummary(),
    });

    const output = await createFakeRevisionProvider().generatePatch({
      operationKey: "revision:patch:1",
      model: "gpt-5.6-terra",
      safetyIdentifier: "safe",
      context: "bounded",
      signal: new AbortController().signal,
      basePlan,
      analysis,
      manifest,
      manifestHash: hashAllowedChangeManifest(manifest),
    });

    expect(output.patch.operations[0]).toMatchObject({
      operation: "move",
      targetId: "item:sunset",
      fieldChanges: { startTime: "18:00", endTime: "19:30" },
    });
  });

  it("returns a semantic replacement rather than only rescheduling a replace request", async () => {
    const basePlan = revisionItinerary();
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
      basePlanHash: "a".repeat(64),
      analysisVersion: 1,
      requestType: "replace_item",
      targetItemId: "item:sunset",
      basePlan,
      analysis,
      approvedSummary: revisionPlanningSummary(),
    });
    const output = await createFakeRevisionProvider().repairScope({
      operationKey: "revision:scope-repair:1",
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "bounded",
      signal: new AbortController().signal,
      basePlan,
      analysis,
      manifest,
      manifestHash: hashAllowedChangeManifest(manifest),
    });
    const target = output.itinerary.days[0].items.find(
      (item) => item.id === "item:sunset",
    );
    expect(target?.title).not.toBe("Glacier Point sunset");
    expect(target?.description).not.toBe("The confirmed sunset stop.");
  });
});
