import { describe, expect, it } from "vitest";
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

const requestId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
const basePlanId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3";

function removalInput() {
  const basePlan = revisionItinerary();
  const kayaking = {
    ...structuredClone(basePlan.days[0].items[0]),
    id: "item:kayaking",
    startTime: "15:15",
    endTime: "16:30",
    title: "Timed kayaking",
    description: "A timed paddling reservation.",
  };
  basePlan.days[0].items.splice(1, 0, kayaking);
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
    title: "Remove timed kayaking",
    requestSummary: "Remove timed kayaking and keep everything else unchanged.",
    requestedChange: {
      type: "remove_item" as const,
      targetItemIds: ["item:kayaking"],
      normalizedInstruction: "Remove timed kayaking.",
    },
    affectedItems: [
      {
        itemId: "item:kayaking",
        dayId: "day:2026-09-12",
        summary: "Remove the timed kayaking activity.",
        direct: true,
      },
    ],
  };
  return {
    changeRequestId: requestId,
    basePlanId,
    baseVersion: 1,
    analysisVersion: 1,
    requestType: "remove_item" as const,
    targetItemId: "item:kayaking",
    basePlan,
    analysis,
    approvedSummary: revisionPlanningSummary(),
  };
}

describe("allowed-change manifest", () => {
  it("derives the narrow kayaking removal scope deterministically", () => {
    const manifest = deriveAllowedChangeManifest(removalInput());
    expect(manifest).toMatchObject({
      schemaVersion: "1",
      requestType: "remove_item",
      targetItemIds: ["item:kayaking"],
      affectedDayIds: ["day:2026-09-12"],
      maximumAffectedItems: 2,
      maximumAffectedDays: 1,
      editableTopLevelFields: [],
      maximumAffectedTopLevelEntries: 0,
    });
    expect(manifest.allowedOperations).toEqual([
      "remove",
      "route_adjustment",
      "reschedule",
      "cost_recalculation",
      "evidence_refresh",
    ]);
    expect(manifest.allowedFieldsByItem).toEqual({
      "item:kayaking": [],
      "item:sunset": ["startTime", "endTime"],
    });
    expect(manifest.protectedItemIds).toEqual(["item:falls", "item:walk"]);
    expect(manifest.protectedDayIds).toEqual(["day:2026-09-13"]);
    expect(manifest.forbiddenChanges).toContain("whole_plan_rewrite");
  });

  it("does not let model analysis change request type or expand maxima", () => {
    const input = removalInput();
    Object.assign(input.analysis.requestedChange, { type: "general_revision" });
    input.analysis.affectedDays = ["2026-09-12", "2026-09-13"];
    input.analysis.affectedItems.push({
      itemId: "item:falls",
      dayId: "day:2026-09-13",
      summary: "Rewrite an unrelated day.",
      direct: false,
    });
    const manifest = deriveAllowedChangeManifest(input);
    expect(manifest.requestType).toBe("remove_item");
    expect(manifest.maximumAffectedDays).toBe(1);
    expect(manifest.maximumAffectedItems).toBe(2);
    expect(manifest.protectedItemIds).toContain("item:falls");
  });

  it("produces a stable manifest hash and explicit protected snapshot", () => {
    const input = removalInput();
    const first = deriveAllowedChangeManifest(input);
    const second = deriveAllowedChangeManifest(structuredClone(input));
    expect(hashAllowedChangeManifest(first)).toBe(
      hashAllowedChangeManifest(second),
    );
    const snapshot = buildProtectedRevisionSnapshot(input.basePlan, first);
    expect(snapshot.protectedItemHashes["item:walk"]).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.protectedDayHashes["day:2026-09-13"]).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(snapshot.editableItems.map((item) => item.id)).toEqual([
      "item:kayaking",
      "item:sunset",
    ]);
    expect(snapshot.protectedTopLevelHashes.destinationSummary).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(snapshot.protectedDays.map((day) => day.id)).toEqual([
      "day:2026-09-13",
    ]);
    expect(snapshot.protectedTopLevelContent).toMatchObject({
      destinationSummary: "Yosemite Valley",
      startDate: "2026-09-12",
      endDate: "2026-09-13",
    });
  });

  it.each([
    ["change_lodging", ["lodging"]],
    ["change_food", ["restaurants"]],
    ["update_traveler_logistics", ["travelers", "arrivals", "departures"]],
  ] as const)(
    "classifies %s top-level fields as editable rather than protected",
    (requestType, editableFields) => {
      const input = removalInput();
      const manifest = deriveAllowedChangeManifest({
        ...input,
        requestType,
        analysis: {
          ...input.analysis,
          requestedChange: {
            ...input.analysis.requestedChange,
            type: requestType,
          },
        },
      });
      for (const field of editableFields)
        expect(manifest.protectedTopLevelFields).not.toContain(field);
      expect(manifest.editableTopLevelFields).toEqual(editableFields);
      expect(manifest.maximumAffectedTopLevelEntries).toBe(
        editableFields.length,
      );
      expect(manifest.protectedTopLevelFields).toContain("destinationSummary");
      expect(manifest.protectedTopLevelFields).toContain("startDate");
      expect(manifest.protectedTopLevelFields).toContain("endDate");
    },
  );

  it("does not let model-proposed affected items broaden a targeted replacement", () => {
    const input = removalInput();
    const manifest = deriveAllowedChangeManifest({
      ...input,
      requestType: "replace_item",
      analysis: {
        ...input.analysis,
        requestedChange: {
          ...input.analysis.requestedChange,
          type: "replace_item",
        },
        affectedItems: [
          ...input.analysis.affectedItems,
          {
            itemId: "item:sunset",
            dayId: "day:2026-09-12",
            summary: "Model-proposed unrelated rewrite.",
            direct: false,
          },
        ],
      },
    });
    expect(Object.keys(manifest.allowedFieldsByItem)).toEqual([
      "item:kayaking",
    ]);
    expect(manifest.maximumAffectedItems).toBe(1);
  });
});
