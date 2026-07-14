import type {
  Itinerary,
  PlanChangeAnalysis,
  PlanningSummary,
} from "@trailie/schemas";

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

export function revisionItinerary(): Itinerary {
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
    arrivals: [],
    departures: [],
    lodging: [],
    days: [
      {
        id: "day:2026-09-12",
        date: "2026-09-12",
        title: "Valley arrival",
        summary: "Arrival and sunset.",
        items: [
          {
            id: "item:walk",
            type: "activity",
            startTime: "11:00",
            endTime: "15:00",
            title: "Valley walk",
            description: "A relaxed orientation walk.",
            location,
            reservation,
            cost: unknownCost,
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
            fromItemId: "item:walk",
            toItemId: "item:sunset",
            mode: "drive",
            origin: location,
            destination: { ...location, name: "Glacier Point" },
            distanceMeters: 104000,
            durationMinutes: 120,
            bufferMinutes: 30,
            verificationStatus: "verified",
            evidenceRefs: ["evidence:route-1"],
          },
        ],
        estimatedDailyCost: unknownCost,
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
      validatedAt: "2026-07-13T18:00:00.000Z",
    },
  };
}

export function approvedMoveAnalysis(): PlanChangeAnalysis {
  return {
    schemaVersion: "1",
    title: "Move Glacier Point later",
    requestSummary: "Move the sunset stop later.",
    requestedChange: {
      type: "move_item",
      targetItemIds: ["item:sunset"],
      normalizedInstruction: "Move Glacier Point later.",
    },
    affectedDays: ["2026-09-12"],
    affectedItems: [
      {
        itemId: "item:sunset",
        dayId: "day:2026-09-12",
        summary: "Glacier Point sunset moves later.",
        direct: true,
      },
    ],
    impacts: {
      schedule: ["Later start and end time"],
      routes: ["Inbound segment shifts with the activity"],
      budget: [],
      reservations: [],
      lodging: [],
      food: [],
      travelerConstraints: [],
      confirmedDecisions: ["Preserve Glacier Point sunset"],
    },
    proposedApproach: ["Shift the activity and inbound route timing"],
    preservedItems: ["All other days"],
    risks: [],
    missingInformation: [],
    materiality: "material",
    feasibility: "feasible",
    blockers: [],
    approvalSummary: "All active members approve.",
  };
}

export function revisionPlanningSummary(): PlanningSummary {
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
      budget: [],
      approvalMode: "all_active",
    },
    confirmedDecisions: [
      item("confirmed:destination", "Destination", "Yosemite"),
      item("confirmed:sunset", "Must do", "Glacier Point sunset"),
    ],
    travelerPreferences: [],
    constraints: [],
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
