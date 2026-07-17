import { describe, expect, it } from "vitest";
import {
  buildChangeAnalysisContext,
  buildRevisionCandidateContext,
  buildRevisionScopeRepairContext,
} from "./context";
import {
  approvedMoveAnalysis,
  revisionItinerary,
  revisionPlanningSummary,
} from "./test-fixtures";
import {
  buildProtectedRevisionSnapshot,
  deriveAllowedChangeManifest,
  hashAllowedChangeManifest,
} from "./manifest";

function constrainedInput() {
  const basePlan = revisionItinerary();
  const analysis = approvedMoveAnalysis();
  const manifest = deriveAllowedChangeManifest({
    changeRequestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
    basePlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
    baseVersion: 1,
    analysisVersion: 1,
    requestType: "move_item",
    targetItemId: "item:sunset",
    basePlan,
    analysis,
    approvedSummary: revisionPlanningSummary(),
  });
  return {
    basePlan,
    approvedSummary: revisionPlanningSummary(),
    analysis,
    evidence: [],
    manifest,
    manifestHash: hashAllowedChangeManifest(manifest),
    protectedSnapshot: buildProtectedRevisionSnapshot(basePlan, manifest),
  };
}

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
  it("separates editable fragments from protected contracts without a full-plan rewrite input", () => {
    const context = buildRevisionCandidateContext(constrainedInput());
    expect(context).toContain("<APPROVED_CHANGE_ANALYSIS>");
    expect(context).toContain("<ALLOWED_CHANGE_MANIFEST>");
    expect(context).toContain("<PROTECTED_CONTENT_CONTRACT>");
    expect(context).toContain("<PROTECTED_ITEM_FRAGMENTS>");
    expect(context).toContain("<PROTECTED_DAY_FRAGMENTS>");
    expect(context).toContain('"title":"Falls and departure"');
    expect(context).toContain("<EDITABLE_ITEM_FRAGMENTS>");
    expect(context).not.toContain("<BASE_PUBLISHED_ITINERARY>");
    expect(context).not.toContain("conversationTranscript");
    expect(context.length).toBeLessThanOrEqual(64_000);
  });

  it("supplies exact unauthorized differences and the immutable base only to scope repair", () => {
    const input = constrainedInput();
    const context = buildRevisionScopeRepairContext({
      ...input,
      candidate: structuredClone(input.basePlan),
      unauthorizedDifferences: ["items.item:walk.description"],
    });
    expect(context).toContain("<BASE_PUBLISHED_ITINERARY>");
    expect(context).toContain("<UNAUTHORIZED_DIFFERENCES>");
    expect(context).toContain("items.item:walk.description");
    expect(context).toContain(input.manifestHash);
    expect(context.length).toBeLessThanOrEqual(96_000);
  });

  it("retains exact unauthorized differences when protected content reaches the context bound", () => {
    const input = constrainedInput();
    for (const [dayIndex, day] of input.basePlan.days.entries())
      day.items.push(
        ...Array.from({ length: 120 }, (_, index) => ({
          ...structuredClone(day.items[0]),
          id: `item:protected-${dayIndex}-${index}`,
          description: "Protected itinerary content. ".repeat(35),
        })),
      );
    input.manifest = deriveAllowedChangeManifest({
      changeRequestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      basePlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
      baseVersion: 1,
      analysisVersion: 1,
      requestType: "move_item",
      targetItemId: "item:sunset",
      basePlan: input.basePlan,
      analysis: input.analysis,
      approvedSummary: input.approvedSummary,
    });
    input.manifestHash = hashAllowedChangeManifest(input.manifest);
    input.protectedSnapshot = buildProtectedRevisionSnapshot(
      input.basePlan,
      input.manifest,
    );
    const context = buildRevisionScopeRepairContext({
      ...input,
      candidate: structuredClone(input.basePlan),
      unauthorizedDifferences: ["items.item:walk.description"],
    });
    expect(context).toContain(
      '<UNAUTHORIZED_DIFFERENCES>["items.item:walk.description"]</UNAUTHORIZED_DIFFERENCES>',
    );
  });

  it("keeps the validated patch and every context block as valid JSON at the size bound", () => {
    const input = constrainedInput();
    for (const day of input.protectedSnapshot.protectedDays)
      day.summary = "Protected content. ".repeat(5_000);
    const context = buildRevisionCandidateContext({
      ...input,
      patch: { schemaVersion: "1", marker: "must-keep" },
    });
    expect(context.length).toBeLessThanOrEqual(64_000);
    expect(context).toContain("<VALIDATED_REVISION_PATCH>");
    expect(context).toContain("must-keep");
    expect(context).toContain("<PROTECTED_CONTENT_CONTRACT>");
    for (const match of context.matchAll(/<[^>]+>([\s\S]*?)<\/[^>]+>/g))
      expect(() => JSON.parse(match[1])).not.toThrow();
  });
});
