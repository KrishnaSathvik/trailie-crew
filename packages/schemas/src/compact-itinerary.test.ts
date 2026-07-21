import { describe, expect, it } from "vitest";

import { compactItineraryCandidateV1Schema } from "./index";

function candidate() {
  return {
    schemaVersion: "1" as const,
    title: "Yosemite long weekend",
    summary: "A measured trip centered on Yosemite Valley.",
    assumptions: ["Drive times still need verified route evidence."],
    warnings: ["Check official closure notices before departure."],
    days: [
      {
        date: "2026-09-12",
        theme: "Valley arrival",
        locationArea: "Yosemite Valley",
        items: [
          {
            clientKey: "valley-walk",
            type: "activity" as const,
            title: "Valley orientation walk",
            startTime: "11:00",
            endTime: "13:00",
            locationText: "Yosemite Valley",
            sourceEntityHint: null,
            shortDescription: "Take an easy orientation walk.",
            rationale: "Matches the crew's accessible first-day pace.",
            bookingRequirement: "not_required" as const,
            importantWarning: null,
          },
          {
            clientKey: "glacier-sunset",
            type: "activity" as const,
            title: "Glacier Point sunset",
            startTime: "17:30",
            endTime: "19:30",
            locationText: "Glacier Point",
            sourceEntityHint: "nps:yose-glacier-point",
            shortDescription: "Watch sunset from the overlook.",
            rationale: "Preserves the approved must-do.",
            bookingRequirement: "unknown" as const,
            importantWarning: "Road access may be seasonal.",
          },
        ],
        travelSegments: [
          {
            mode: "drive" as const,
            fromItemKey: "valley-walk",
            toItemKey: "glacier-sunset",
            estimatedMinutes: 90,
          },
        ],
      },
    ],
  };
}

describe("CompactItineraryCandidateV1", () => {
  it("accepts only model-decision fields and preserves warnings and booking requirements", () => {
    const parsed = compactItineraryCandidateV1Schema.parse(candidate());
    expect(parsed.days[0].items[1]).toMatchObject({
      clientKey: "glacier-sunset",
      bookingRequirement: "unknown",
      importantWarning: "Road access may be seasonal.",
    });
    expect(JSON.stringify(parsed)).not.toMatch(
      /databaseId|roomId|versionId|evidenceId|latitude|providerMetadata|validatedAt/,
    );
  });

  it("rejects duplicate temporary keys and unknown segment references", () => {
    const duplicate = candidate();
    duplicate.days[0].items[1].clientKey = "valley-walk";
    expect(compactItineraryCandidateV1Schema.safeParse(duplicate).success).toBe(
      false,
    );

    const missingReference = candidate();
    missingReference.days[0].travelSegments[0].toItemKey = "missing-item";
    expect(
      compactItineraryCandidateV1Schema.safeParse(missingReference).success,
    ).toBe(false);
  });

  it("rejects invalid times, partial timing, out-of-order items, and overlaps", () => {
    const invalidEnd = candidate();
    invalidEnd.days[0].items[0].endTime = "10:30";
    expect(
      compactItineraryCandidateV1Schema.safeParse(invalidEnd).success,
    ).toBe(false);

    const partial = candidate();
    Reflect.set(partial.days[0].items[0], "endTime", null);
    expect(compactItineraryCandidateV1Schema.safeParse(partial).success).toBe(
      false,
    );

    const overlap = candidate();
    overlap.days[0].items[1].startTime = "12:30";
    expect(compactItineraryCandidateV1Schema.safeParse(overlap).success).toBe(
      false,
    );

    const reversed = candidate();
    reversed.days[0].items.reverse();
    expect(compactItineraryCandidateV1Schema.safeParse(reversed).success).toBe(
      false,
    );
  });

  it("bounds compact narrative fields to 240 characters", () => {
    const verbose = candidate();
    verbose.days[0].items[0].rationale = "r".repeat(241);
    expect(compactItineraryCandidateV1Schema.safeParse(verbose).success).toBe(
      false,
    );
  });
});
