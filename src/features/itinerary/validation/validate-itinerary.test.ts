import { describe, expect, it } from "vitest";
import type { Itinerary, PlanningSummary } from "@trailie/schemas";
import { validateItinerary } from "./validate-itinerary";

const evidenceId = "evidence:route-1";
const location = {
  name: "Yosemite Valley",
  address: null,
  latitude: 37.7459,
  longitude: -119.5936,
  timezone: "America/Los_Angeles",
  verificationStatus: "verified" as const,
};
const unknownCost = {
  status: "unknown" as const,
  currency: "USD",
  amount: null,
  minAmount: null,
  maxAmount: null,
  retrievedAt: null,
  evidenceRef: null,
};
const reservation = {
  status: "unknown" as const,
  details: null,
  evidenceRefs: [] as string[],
};

function itinerary(): Itinerary {
  return {
    schemaVersion: "1",
    title: "Yosemite crew escape",
    destinationSummary: "Yosemite Valley",
    timezone: "America/Los_Angeles",
    startDate: "2026-09-12",
    endDate: "2026-09-13",
    travelers: [
      {
        id: "traveler:maya",
        displayName: "Maya",
        origin: "Chicago",
        accessibilityNotes: [],
        dietaryNotes: ["vegetarian"],
      },
    ],
    arrivals: [
      {
        id: "arrival:maya",
        travelerIds: ["traveler:maya"],
        date: "2026-09-12",
        localTime: "09:00",
        location,
        mode: "flight",
        reference: null,
        notes: [],
      },
    ],
    departures: [
      {
        id: "departure:maya",
        travelerIds: ["traveler:maya"],
        date: "2026-09-13",
        localTime: "20:00",
        location,
        mode: "flight",
        reference: null,
        notes: [],
      },
    ],
    lodging: [],
    days: [
      {
        id: "day:2026-09-12",
        date: "2026-09-12",
        title: "Valley arrival",
        summary: "Arrival and two confirmed Yosemite activities.",
        items: [
          {
            id: "item:valley-walk",
            type: "activity",
            startTime: "11:00",
            endTime: "15:00",
            title: "Yosemite Valley walk",
            description: "A relaxed Yosemite orientation walk.",
            location,
            reservation,
            cost: { ...unknownCost, status: "estimated", amount: 25 },
            evidenceRefs: [],
            notes: [],
          },
          {
            id: "item:sunset",
            type: "activity",
            startTime: "17:30",
            endTime: "19:00",
            title: "Glacier Point sunset",
            description: "The confirmed sunset stop.",
            location: { ...location, name: "Glacier Point" },
            reservation,
            cost: unknownCost,
            evidenceRefs: [],
            notes: [],
          },
        ],
        travelSegments: [
          {
            id: "segment:walk-sunset",
            fromItemId: "item:valley-walk",
            toItemId: "item:sunset",
            mode: "drive",
            origin: location,
            destination: { ...location, name: "Glacier Point" },
            distanceMeters: 104000,
            durationMinutes: 120,
            bufferMinutes: 30,
            verificationStatus: "verified",
            evidenceRefs: [evidenceId],
          },
        ],
        estimatedDailyCost: {
          ...unknownCost,
          status: "estimated",
          amount: 25,
        },
        warnings: [],
      },
      {
        id: "day:2026-09-13",
        date: "2026-09-13",
        title: "Falls and departure",
        summary: "A final easy morning.",
        items: [
          {
            id: "item:falls",
            type: "activity",
            startTime: "10:00",
            endTime: "12:00",
            title: "Yosemite Falls",
            description: "An easy final walk.",
            location,
            reservation,
            cost: unknownCost,
            evidenceRefs: [],
            notes: [],
          },
        ],
        travelSegments: [],
        estimatedDailyCost: unknownCost,
        warnings: [],
      },
    ],
    restaurants: [],
    unresolvedItems: [],
    assumptions: [],
    validationMetadata: {
      validatorVersion: "trailie-itinerary-validator-v1",
      validatedAt: null,
    },
  };
}

function approvedSummary(): PlanningSummary {
  const item = (id: string, label: string, detail: string) => ({
    id,
    label,
    detail,
    sourceMessageIds: [],
  });
  return {
    schemaVersion: "1",
    title: "Before I build the trip",
    tripSnapshot: {
      destinations: ["Yosemite"],
      dateWindows: ["2026-09-12 to 2026-09-13"],
      travelerCount: 1,
      origins: ["Chicago"],
      budget: ["Budget ceiling USD 500"],
      approvalMode: "host_only",
    },
    confirmedDecisions: [
      item("confirmed:destination", "Destination", "Yosemite"),
      item("confirmed:sunset", "Must do", "Glacier Point sunset"),
    ],
    travelerPreferences: [],
    constraints: [
      item("constraint:start", "Schedule", "No activity before 10:00"),
    ],
    proposals: [],
    rejectedOptions: [item("rejected:vegas", "Rejected", "Las Vegas casino")],
    conflicts: [],
    openQuestions: [],
    missingCriticalInformation: [],
    nonAssumptions: [],
    readiness: { status: "ready_for_review", blockers: [], warnings: [] },
    evidence: { memoryVersion: 1, latestMessageId: null, sourceMessageIds: [] },
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  return [
    {
      id: evidenceId,
      itemId: "segment:walk-sunset",
      provider: "trailie-fake",
      toolName: "route",
      status: "verified" as const,
      retrievedAt: "2026-07-13T18:00:00.000Z",
      expiresAt: "2026-07-14T18:00:00.000Z",
      normalizedResult: { durationMinutes: 120, distanceMeters: 104000 },
      sourceReference: { label: "Fixture route", url: null },
      ...overrides,
    },
  ];
}

function validate(plan = itinerary(), facts = evidence()) {
  return validateItinerary({
    itinerary: plan,
    approvedSummary: approvedSummary(),
    evidence: facts,
    now: "2026-07-13T19:00:00.000Z",
    minimumTravelBufferMinutes: 15,
    maximumDailyDriveMinutes: 360,
  });
}

describe("deterministic itinerary validation", () => {
  it("passes a valid itinerary while keeping unknown costs unknown", () => {
    const report = validate();
    expect(report.status).toBe("pass");
    expect(report.issues).toEqual([]);
    expect(report.passedChecks).toContain("route_duration");
  });

  it("detects overlapping items", () => {
    const plan = itinerary();
    plan.days[0].items[1].startTime = "14:30";
    expect(validate(plan).issues).toContainEqual(
      expect.objectContaining({ code: "item_overlap", severity: "high" }),
    );
  });

  it("marks an empty itinerary day as repairable", () => {
    const plan = itinerary();
    plan.days[0].items = [];
    plan.days[0].travelSegments = [];
    const summary = approvedSummary();
    summary.confirmedDecisions = [];
    const report = validateItinerary({
      itinerary: plan,
      approvedSummary: summary,
      evidence: evidence(),
      now: "2026-07-13T19:00:00.000Z",
      minimumTravelBufferMinutes: 15,
      maximumDailyDriveMinutes: 360,
    });
    expect(report.status).toBe("needs_revision");
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "day_empty", repairable: true }),
    );
  });

  it("does not accept free time as the only content for a day", () => {
    const plan = itinerary();
    plan.days[0].items = [
      {
        ...plan.days[0].items[0],
        id: "item:free-time",
        type: "free_time",
        title: "Unscheduled free time",
        location: null,
      },
    ];
    plan.days[0].travelSegments = [];
    const summary = approvedSummary();
    summary.confirmedDecisions = [];
    const report = validateItinerary({
      itinerary: plan,
      approvedSummary: summary,
      evidence: evidence(),
      now: "2026-07-13T19:00:00.000Z",
      minimumTravelBufferMinutes: 15,
      maximumDailyDriveMinutes: 360,
    });
    expect(report.status).toBe("needs_revision");
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "day_without_planned_activity",
        repairable: true,
      }),
    );
  });

  it("marks impossible route timing and insufficient buffers repairable", () => {
    const plan = itinerary();
    plan.days[0].items[1].startTime = "16:00";
    plan.days[0].travelSegments[0].bufferMinutes = 0;
    const report = validate(plan);
    expect(report.status).toBe("needs_revision");
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "route_timing_impossible",
        "travel_buffer_insufficient",
      ]),
    );
  });

  it("blocks arrival and departure infeasibility", () => {
    const plan = itinerary();
    plan.arrivals[0].localTime = "12:00";
    plan.departures[0].localTime = "11:00";
    const codes = validate(plan).issues.map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining(["arrival_infeasible", "departure_infeasible"]),
    );
  });

  it("detects daily drive overload", () => {
    const plan = itinerary();
    plan.days[0].travelSegments[0].durationMinutes = 400;
    const report = validate(
      plan,
      evidence({ normalizedResult: { durationMinutes: 400 } }),
    );
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "daily_drive_overload" }),
    );
  });

  it("detects missing coordinates and stale route evidence", () => {
    const plan = itinerary();
    plan.days[0].items[0].location = {
      ...location,
      latitude: null,
      longitude: null,
    };
    const report = validate(
      plan,
      evidence({ status: "stale", expiresAt: "2026-07-12T18:00:00.000Z" }),
    );
    expect(
      [...report.issues, ...report.warnings].map((issue) => issue.code),
    ).toEqual(
      expect.arrayContaining(["missing_coordinates", "evidence_stale"]),
    );
  });

  it("keeps an itinerary usable when the optional travel provider is unavailable", () => {
    const plan = itinerary();
    plan.days[0].items[0].location = {
      ...location,
      latitude: null,
      longitude: null,
      verificationStatus: "unknown",
    };
    plan.days[0].travelSegments[0].verificationStatus = "unknown";
    const report = validate(plan, evidence({ status: "unavailable" }));

    expect(report.status).toBe("pass");
    expect(report.issues).toEqual([]);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_coordinates",
          severity: "medium",
        }),
        expect.objectContaining({
          code: "route_unavailable",
          severity: "medium",
        }),
      ]),
    );
    expect(report.passedChecks).not.toContain("coordinates");
    expect(report.passedChecks).not.toContain("route_duration");
  });

  it("surfaces closure and reservation evidence", () => {
    const plan = itinerary();
    plan.days[0].items[0].evidenceRefs = ["evidence:place-1"];
    const report = validateItinerary({
      itinerary: plan,
      approvedSummary: approvedSummary(),
      evidence: [
        ...evidence(),
        {
          ...evidence()[0],
          id: "evidence:place-1",
          itemId: "item:valley-walk",
          toolName: "place_details",
          normalizedResult: {
            openStatus: "closed",
            reservationStatus: "required",
          },
        },
      ],
      now: "2026-07-13T19:00:00.000Z",
      minimumTravelBufferMinutes: 15,
      maximumDailyDriveMinutes: 360,
    });
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["location_closed", "reservation_required"]),
    );
  });

  it("blocks hard constraints and missing confirmed decisions", () => {
    const plan = itinerary();
    plan.days[0].items[0].startTime = "09:00";
    plan.days[0].items[1].title = "Mountain overlook";
    const report = validate(plan);
    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "hard_constraint_violation",
        "confirmed_decision_missing",
      ]),
    );
  });

  it("blocks rejected options reintroduced into the draft", () => {
    const plan = itinerary();
    plan.assumptions = ["Add a Las Vegas casino stop"];
    expect(validate(plan).issues).toContainEqual(
      expect.objectContaining({
        code: "rejected_option_reintroduced",
        repairable: false,
      }),
    );
  });

  it("detects budget ceilings, duplicate activities, and bad references", () => {
    const plan = itinerary();
    plan.days[0].estimatedDailyCost = {
      ...unknownCost,
      status: "estimated",
      amount: 600,
    };
    plan.days[1].items[0].title = "Yosemite Valley walk";
    plan.days[0].travelSegments[0].toItemId = "item:missing";
    const codes = validate(plan).issues.map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "budget_ceiling_exceeded",
        "duplicate_item",
        "invalid_item_reference",
      ]),
    );
  });

  it("blocks unsafe public rendering", () => {
    const plan = itinerary();
    plan.days[0].items[0].description = "<script>alert(1)</script>";
    expect(validate(plan).issues).toContainEqual(
      expect.objectContaining({
        code: "unsafe_render_content",
        severity: "critical",
      }),
    );
  });
});
