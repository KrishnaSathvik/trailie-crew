import { describe, expect, it } from "vitest";
import {
  approvedMoveAnalysis,
  revisionItinerary,
  revisionPlanningSummary,
} from "../test-fixtures";
import { deriveAllowedChangeManifest } from "../manifest";
import { applyRevisionPatch, deriveDeterministicRevisionPatch } from "../patch";
import { validateCandidatePreservation } from "./preservation-contract";

function setup() {
  const base = revisionItinerary();
  base.days[0].items.unshift({
    ...structuredClone(base.days[0].items[0]),
    id: "item:coffee",
    startTime: "09:30",
    endTime: "10:00",
    title: "Coffee stop",
  });
  base.days[0].items.splice(2, 0, {
    ...structuredClone(base.days[0].items[1]),
    id: "item:kayaking",
    startTime: "15:15",
    endTime: "16:30",
    title: "Timed kayaking",
  });
  base.days[0].travelSegments = [
    {
      ...structuredClone(base.days[0].travelSegments[0]),
      id: "segment:walk-kayaking",
      fromItemId: "item:walk",
      toItemId: "item:kayaking",
    },
    {
      ...structuredClone(base.days[0].travelSegments[0]),
      id: "segment:kayaking-sunset",
      fromItemId: "item:kayaking",
      toItemId: "item:sunset",
    },
  ];
  const analysis = {
    ...approvedMoveAnalysis(),
    requestSummary: "Remove timed kayaking and preserve everything else.",
    requestedChange: {
      type: "remove_item" as const,
      targetItemIds: ["item:kayaking"],
      normalizedInstruction: "Remove timed kayaking.",
    },
    affectedItems: [
      {
        itemId: "item:kayaking",
        dayId: "day:2026-09-12",
        summary: "Remove timed kayaking.",
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
    basePlan: base,
    analysis,
    approvedSummary: revisionPlanningSummary(),
  });
  const patch = deriveDeterministicRevisionPatch({
    basePlan: base,
    manifest,
    analysis,
  });
  const candidate = applyRevisionPatch(base, patch, manifest);
  return { base, candidate, manifest };
}

describe("candidate preservation contract", () => {
  it("accepts only the approved removal and connected route cleanup", () => {
    const { base, candidate, manifest } = setup();
    expect(
      validateCandidatePreservation({ base, candidate, manifest }),
    ).toEqual({
      validatorVersion: "trailie-revision-preservation-v1",
      status: "pass",
      issues: [],
      unauthorizedDifferences: [],
    });
  });

  it.each([
    [
      "protected description rewrite",
      (candidate: ReturnType<typeof revisionItinerary>) => {
        candidate.days[0].items.find(
          (item) => item.id === "item:walk",
        )!.description = "Rewritten.";
      },
      "protected_item_changed",
    ],
    [
      "protected item reorder",
      (candidate: ReturnType<typeof revisionItinerary>) => {
        const day = candidate.days[0];
        day.items = [day.items[1], day.items[0], ...day.items.slice(2)];
      },
      "protected_item_reordered",
    ],
    [
      "destination drift",
      (candidate: ReturnType<typeof revisionItinerary>) => {
        candidate.destinationSummary = "Zion";
      },
      "protected_top_level_changed",
    ],
    [
      "unapproved lodging drift",
      (candidate: ReturnType<typeof revisionItinerary>) => {
        candidate.lodging = [
          {
            id: "lodging:one",
            name: "Unapproved lodge",
            area: "Valley",
            checkInDate: "2026-09-12",
            checkOutDate: "2026-09-13",
            location: structuredClone(candidate.days[0].items[0].location!),
            reservation: structuredClone(
              candidate.days[0].items[0].reservation,
            ),
            cost: structuredClone(candidate.days[0].items[0].cost),
            evidenceRefs: [],
            notes: [],
          },
        ];
      },
      "protected_top_level_changed",
    ],
    [
      "unapproved downstream description",
      (candidate: ReturnType<typeof revisionItinerary>) => {
        candidate.days[0].items.find(
          (item) => item.id === "item:sunset",
        )!.description = "Rewritten.";
      },
      "item_field_not_allowed",
    ],
  ] as const)("blocks %s", (_label, mutate, code) => {
    const { base, candidate, manifest } = setup();
    mutate(candidate);
    const report = validateCandidatePreservation({ base, candidate, manifest });
    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual(expect.objectContaining({ code }));
    expect(report.unauthorizedDifferences.length).toBeGreaterThan(0);
  });

  it("allows a declared downstream timing adjustment and ignores volatile validation time", () => {
    const { base, candidate, manifest } = setup();
    const sunset = candidate.days[0].items.find(
      (item) => item.id === "item:sunset",
    )!;
    sunset.startTime = "17:45";
    sunset.endTime = "19:15";
    candidate.validationMetadata.validatedAt = "2026-07-16T20:00:00.000Z";
    expect(
      validateCandidatePreservation({ base, candidate, manifest }).status,
    ).toBe("pass");
  });

  it("blocks semantic validation metadata drift", () => {
    const { base, candidate, manifest } = setup();
    candidate.validationMetadata.validatorVersion = "unapproved-validator";
    const report = validateCandidatePreservation({ base, candidate, manifest });
    expect(report.status).toBe("blocked");
    expect(report.unauthorizedDifferences).toContain("plan.validationMetadata");
  });

  it("blocks unrelated same-day route drift during target route cleanup", () => {
    const { base, candidate, manifest } = setup();
    const unrelatedRoute = {
      id: "route:unrelated",
      fromItemId: "item:sunset",
      toItemId: null,
      mode: "walk" as const,
      origin: structuredClone(base.days[0].items[1].location!),
      destination: structuredClone(base.days[0].items[1].location!),
      distanceMeters: 100,
      durationMinutes: 5,
      bufferMinutes: 0,
      verificationStatus: "estimated" as const,
      evidenceRefs: [],
    };
    base.days[0].travelSegments.push(unrelatedRoute);
    candidate.days[0].travelSegments = structuredClone(
      base.days[0].travelSegments,
    );
    candidate.days[0].travelSegments.find(
      (segment) => segment.id === "route:unrelated",
    )!.durationMinutes = 30;
    const report = validateCandidatePreservation({ base, candidate, manifest });
    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "unrelated_route_change" }),
    );
  });
});
