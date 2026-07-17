import { describe, expect, it } from "vitest";
import {
  approvedMoveAnalysis,
  revisionItinerary,
  revisionPlanningSummary,
} from "./test-fixtures";
import {
  deriveAllowedChangeManifest,
  hashAllowedChangeManifest,
} from "./manifest";
import {
  applyRevisionPatch,
  deriveDeterministicRevisionPatch,
  validateRevisionPatch,
} from "./patch";

function setup() {
  const basePlan = revisionItinerary();
  basePlan.days[0].items.splice(1, 0, {
    ...structuredClone(basePlan.days[0].items[0]),
    id: "item:kayaking",
    startTime: "15:15",
    endTime: "16:30",
    title: "Timed kayaking",
  });
  basePlan.days[0].travelSegments = [
    {
      ...structuredClone(basePlan.days[0].travelSegments[0]),
      id: "segment:walk-kayaking",
      fromItemId: "item:walk",
      toItemId: "item:kayaking",
    },
    {
      ...structuredClone(basePlan.days[0].travelSegments[0]),
      id: "segment:kayaking-sunset",
      fromItemId: "item:kayaking",
      toItemId: "item:sunset",
    },
  ];
  const analysis = {
    ...approvedMoveAnalysis(),
    requestedChange: {
      type: "remove_item" as const,
      targetItemIds: ["item:kayaking"],
      normalizedInstruction: "Remove kayaking.",
    },
    affectedItems: [
      {
        itemId: "item:kayaking",
        dayId: "day:2026-09-12",
        summary: "Remove kayaking.",
        direct: true,
      },
    ],
  };
  const manifest = deriveAllowedChangeManifest({
    changeRequestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
    basePlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
    baseVersion: 1,
    analysisVersion: 1,
    requestType: "remove_item",
    targetItemId: "item:kayaking",
    basePlan,
    analysis,
    approvedSummary: revisionPlanningSummary(),
  });
  return { basePlan, analysis, manifest };
}

describe("revision patch", () => {
  it("derives and validates an exact deterministic removal", () => {
    const { basePlan, analysis, manifest } = setup();
    const patch = deriveDeterministicRevisionPatch({
      basePlan,
      manifest,
      analysis,
    });
    expect(patch).toMatchObject({
      schemaVersion: "1",
      baseVersion: 1,
      manifestHash: hashAllowedChangeManifest(manifest),
      operations: [
        {
          operation: "remove",
          targetId: "item:kayaking",
          dayId: "day:2026-09-12",
          downstreamEffects: [
            "route_cleanup",
            "day_cost_recalculation",
            "evidence_refresh",
          ],
        },
      ],
    });
    expect(validateRevisionPatch(patch, manifest)).toEqual({
      status: "pass",
      issues: [],
    });
  });

  it.each([
    ["wrong manifest", (): string => "c".repeat(64)],
    ["unapproved operation", (): string => "replace"],
    ["unapproved target", (): string => "item:falls"],
    ["unapproved day", (): string => "day:2026-09-13"],
    ["unapproved downstream effect", (): string => "lodging_change"],
  ] as const)("rejects %s", (_label, invalidValue) => {
    const { basePlan, analysis, manifest } = setup();
    const patch = deriveDeterministicRevisionPatch({
      basePlan,
      manifest,
      analysis,
    });
    const invalid = structuredClone(patch);
    if (_label === "wrong manifest") invalid.manifestHash = invalidValue();
    if (_label === "unapproved operation")
      invalid.operations[0].operation = invalidValue() as "remove";
    if (_label === "unapproved target")
      invalid.operations[0].targetId = invalidValue();
    if (_label === "unapproved day")
      invalid.operations[0].dayId = invalidValue();
    if (_label === "unapproved downstream effect")
      invalid.operations[0].downstreamEffects.push(
        invalidValue() as "route_cleanup",
      );
    expect(validateRevisionPatch(invalid, manifest).status).toBe("blocked");
  });

  it("applies removal and connected route cleanup without changing unrelated content", () => {
    const { basePlan, analysis, manifest } = setup();
    const patch = deriveDeterministicRevisionPatch({
      basePlan,
      manifest,
      analysis,
    });
    const candidate = applyRevisionPatch(basePlan, patch, manifest);
    expect(candidate.days[0].items.map((item) => item.id)).toEqual([
      "item:walk",
      "item:sunset",
    ]);
    expect(candidate.days[0].travelSegments).toEqual([]);
    expect(candidate.days[0].items[1]).toEqual(basePlan.days[0].items[2]);
    expect(candidate.days[1]).toEqual(basePlan.days[1]);
    expect(applyRevisionPatch(candidate, patch, manifest)).toEqual(candidate);
  });
});
