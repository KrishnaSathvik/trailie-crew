import { describe, expect, it } from "vitest";
import {
  itinerarySchema,
  type CompactItineraryCandidateV1,
  type PlanningSummary,
} from "@trailie/schemas";

import {
  combineCompactItineraryChunks,
  compactItineraryOutputTokenLimit,
  expandCompactItineraryCandidate,
  planCompactItineraryGeneration,
  scopeCompactItineraryChunkKeys,
  validateCompactItineraryCandidate,
} from "./compact-candidate";
import { projectPublicItinerary } from "@/features/sharing/public-projection";

const summary: PlanningSummary = {
  schemaVersion: "1",
  title: "Before I build the trip",
  tripSnapshot: {
    destinations: ["Yosemite National Park"],
    dateWindows: ["2026-09-12 to 2026-09-13"],
    travelerCount: 2,
    origins: ["Chicago"],
    budget: ["USD 1200"],
    approvalMode: "host_only",
  },
  confirmedDecisions: [],
  travelerPreferences: [],
  constraints: [],
  proposals: [],
  rejectedOptions: [],
  conflicts: [],
  openQuestions: [],
  missingCriticalInformation: [],
  nonAssumptions: [],
  readiness: { status: "ready_for_review", blockers: [], warnings: [] },
  evidence: { memoryVersion: 1, latestMessageId: null, sourceMessageIds: [] },
};

function makeCandidate(
  dates = ["2026-09-12", "2026-09-13"],
): CompactItineraryCandidateV1 {
  return {
    schemaVersion: "1" as const,
    title: "Yosemite crew escape",
    summary: "A private core itinerary for Yosemite Valley.",
    assumptions: ["Route times remain estimates until verified."],
    warnings: ["Check current park alerts."],
    days: dates.map((date, index) => ({
      date,
      theme: index === 0 ? "Arrival and valley" : `Yosemite day ${index + 1}`,
      locationArea: "Yosemite Valley",
      items: [
        {
          clientKey: `activity-${index + 1}`,
          type: index === 0 ? ("lodging" as const) : ("activity" as const),
          title: index === 0 ? "Yosemite Valley lodging area" : "Valley walk",
          startTime: "10:00",
          endTime: "12:00",
          locationText: "Yosemite Valley",
          sourceEntityHint: null,
          shortDescription: "A bounded, accessible activity.",
          rationale: "Matches the approved pace and destination.",
          bookingRequirement:
            index === 0 ? ("required" as const) : ("not_required" as const),
          importantWarning:
            index === 0 ? "No reservation has been made." : null,
        },
      ],
      travelSegments: [],
    })),
  } satisfies CompactItineraryCandidateV1;
}

describe("compact itinerary deterministic expansion", () => {
  it("converts stable temporary keys into the existing full itinerary contract", () => {
    const candidate = makeCandidate();
    const input = {
      candidate,
      approvedSummary: {
        ...summary,
        confirmedDecisions: [
          {
            id: "confirmed:sunset",
            label: "Must do",
            detail: "Glacier Point sunset",
            sourceMessageIds: [],
          },
        ],
      },
      travelers: [
        { id: "traveler:one", displayName: "Riley", role: "host" as const },
        { id: "traveler:two", displayName: "Sam", role: "member" as const },
      ],
      liveEvidence: [],
      now: "2026-07-20T12:00:00.000Z",
    };
    const first = expandCompactItineraryCandidate(input);
    const second = expandCompactItineraryCandidate(input);

    expect(second).toEqual(first);
    expect(itinerarySchema.safeParse(first).success).toBe(true);
    expect(first).toMatchObject({
      schemaVersion: "1",
      startDate: "2026-09-12",
      endDate: "2026-09-13",
      timezone: "UTC",
      validationMetadata: {
        validatorVersion: "trailie-itinerary-validator-v1",
        validatedAt: null,
      },
    });
    expect(first.days.map((day) => day.id)).toEqual([
      "day:2026-09-12",
      "day:2026-09-13",
    ]);
    expect(first.days[0].items[0]).toMatchObject({
      id: "item:activity-1",
      reservation: {
        status: "required",
        details: "No reservation has been made.",
        evidenceRefs: [],
      },
      evidenceRefs: [],
    });
    expect(first.days[0].items[0]).not.toHaveProperty("sourceEntityId");
    expect(first.days[0].items[0].notes).toContain(
      "No reservation has been made.",
    );
    expect(first.days[0].items[0].location).toMatchObject({
      latitude: null,
      longitude: null,
      verificationStatus: "unknown",
    });
    expect(first.lodging[0]).toMatchObject({
      id: "lodging:activity-1",
      area: "Yosemite Valley",
      checkInDate: "2026-09-12",
      checkOutDate: "2026-09-13",
    });
    expect(first.assumptions).toContain("Glacier Point sunset");
  });

  it("derives route endpoints, durations, ordering, and empty evidence/map state", () => {
    const candidate = makeCandidate(["2026-09-12"]);
    candidate.days[0].items.push({
      ...candidate.days[0].items[0],
      clientKey: "sunset",
      type: "activity",
      title: "Glacier Point sunset",
      startTime: "17:00",
      endTime: "19:00",
      locationText: "Glacier Point",
      bookingRequirement: "unknown",
      importantWarning: null,
    });
    candidate.days[0].travelSegments.push({
      mode: "drive",
      fromItemKey: "activity-1",
      toItemKey: "sunset",
      estimatedMinutes: 90,
    });
    const expanded = expandCompactItineraryCandidate({
      candidate,
      approvedSummary: {
        ...summary,
        tripSnapshot: {
          ...summary.tripSnapshot,
          dateWindows: ["2026-09-12"],
        },
      },
      travelers: [{ id: "traveler:one", displayName: "Riley", role: "host" }],
      liveEvidence: [],
      now: "2026-07-20T12:00:00.000Z",
    });
    expect(expanded.days[0].travelSegments[0]).toMatchObject({
      id: "segment:activity-1-sunset",
      fromItemId: "item:activity-1",
      toItemId: "item:sunset",
      durationMinutes: 90,
      distanceMeters: null,
      verificationStatus: "estimated",
      evidenceRefs: [],
    });
    expect(expanded.days[0].estimatedDailyCost.status).toBe("unknown");
  });

  it("normalizes long compact rationale and warnings into full-contract short projections", () => {
    const candidate = makeCandidate(["2026-09-12"]);
    candidate.days[0].items[0].rationale = "r".repeat(240);
    candidate.days[0].items[0].importantWarning = "w".repeat(240);
    candidate.warnings = ["c".repeat(240)];

    const expanded = expandCompactItineraryCandidate({
      candidate,
      approvedSummary: {
        ...summary,
        tripSnapshot: {
          ...summary.tripSnapshot,
          dateWindows: ["2026-09-12"],
        },
      },
      travelers: [{ id: "traveler:one", displayName: "Riley", role: "host" }],
      liveEvidence: [],
      now: "2026-07-20T12:00:00.000Z",
    });

    expect(itinerarySchema.safeParse(expanded).success).toBe(true);
    expect(expanded.days[0].items[0].notes[0]).toHaveLength(200);
    expect(
      expanded.days[0].warnings.every((value) => value.length <= 200),
    ).toBe(true);
    expect(expanded.days[0].items[0].description).toContain("r".repeat(240));
    expect(expanded.days[0].items[0].reservation.details).toHaveLength(240);
  });

  it("keeps private lodging details out of the published projection", () => {
    const candidate = makeCandidate();
    candidate.days[0].items[0].importantWarning =
      "Private lodging confirmation ABC123 for Riley.";
    const expanded = expandCompactItineraryCandidate({
      candidate,
      approvedSummary: summary,
      travelers: [{ id: "traveler:one", displayName: "Riley", role: "host" }],
      liveEvidence: [],
      now: "2026-07-20T12:00:00.000Z",
    });
    const publicProjection = projectPublicItinerary({
      itinerary: expanded,
      version: 1,
      publishedAt: "2026-07-20T12:01:00.000Z",
      validationStatus: "pass",
    });

    expect(JSON.stringify(publicProjection)).not.toMatch(
      /ABC123|Riley|confirmation|traveler|latitude|longitude/i,
    );
  });

  it("validates exact date coverage before expansion", () => {
    const candidate = makeCandidate();
    expect(
      validateCompactItineraryCandidate(candidate, ["2026-09-12", "2026-09-13"])
        .success,
    ).toBe(true);
    expect(
      validateCompactItineraryCandidate(candidate, [
        "2026-09-12",
        "2026-09-13",
        "2026-09-14",
      ]).success,
    ).toBe(false);
    candidate.days[0].items[0].sourceEntityHint = "nps:invented";
    expect(
      validateCompactItineraryCandidate(
        candidate,
        ["2026-09-12", "2026-09-13"],
        new Set(),
      ).success,
    ).toBe(false);
  });
});

describe("compact itinerary sizing and bounded long-trip generation", () => {
  it.each([2, 4, 7, 10])(
    "accepts a complete %i-day compact fixture within its bounded generation plan",
    (dayCount) => {
      const dates = Array.from({ length: dayCount }, (_, index) =>
        new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10),
      );
      const candidate = makeCandidate(dates);
      const plan = planCompactItineraryGeneration(dates);

      expect(validateCompactItineraryCandidate(candidate, dates).success).toBe(
        true,
      );
      expect(plan.groups.flat()).toEqual(dates);
      expect(plan.groups.length).toBe(dayCount <= 7 ? 1 : 3);
      expect(JSON.stringify(candidate).length / 4).toBeLessThanOrEqual(
        plan.groups.reduce(
          (total, group) =>
            total +
            compactItineraryOutputTokenLimit({
              dayCount: group.length,
              itemCount: group.length,
            }),
          0,
        ),
      );
    },
  );

  it("uses evidence-based increasing caps without an oversized universal cap", () => {
    const limits = [2, 4, 7, 10].map((dayCount) =>
      compactItineraryOutputTokenLimit({ dayCount, itemCount: dayCount * 4 }),
    );
    expect(limits).toEqual([1_500, 2_200, 3_200, 3_200]);
    expect(Math.max(...limits)).toBeLessThan(8_000);
    expect(
      compactItineraryOutputTokenLimit({ dayCount: 2, itemCount: 12 }),
    ).toBe(1_900);
  });

  it("keeps one call through seven days and bounds ten days to three groups", () => {
    const dates = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10),
      );
    expect(planCompactItineraryGeneration(dates(7))).toMatchObject({
      mode: "single",
      groups: [dates(7)],
    });
    expect(planCompactItineraryGeneration(dates(10))).toMatchObject({
      mode: "chunked",
      groups: [
        dates(4),
        dates(4).map((_, i) => dates(10)[i + 4]),
        dates(10).slice(8),
      ],
    });
  });

  it("combines bounded chunks deterministically and rejects incomplete or duplicate days", () => {
    const first = makeCandidate(["2026-09-12"]);
    const second = makeCandidate(["2026-09-13"]);
    second.days[0].items[0].clientKey = "activity-2";
    const combined = combineCompactItineraryChunks(
      [first, second],
      ["2026-09-12", "2026-09-13"],
    );
    expect(combined.days.map((day) => day.date)).toEqual([
      "2026-09-12",
      "2026-09-13",
    ]);
    expect(() =>
      combineCompactItineraryChunks([first], ["2026-09-12", "2026-09-13"]),
    ).toThrow("compact_itinerary_date_coverage_invalid");
    expect(() =>
      combineCompactItineraryChunks(
        [first, first],
        ["2026-09-12", "2026-09-13"],
      ),
    ).toThrow("compact_itinerary_duplicate_key");

    const scoped = combineCompactItineraryChunks(
      [
        scopeCompactItineraryChunkKeys(first, 0),
        scopeCompactItineraryChunkKeys(makeCandidate(["2026-09-13"]), 1),
      ],
      ["2026-09-12", "2026-09-13"],
    );
    expect(scoped.days.map((day) => day.items[0].clientKey)).toEqual([
      "g1-d1-i1",
      "g2-d1-i1",
    ]);
  });
});
