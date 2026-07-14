import { itinerarySchema, type Itinerary } from "@trailie/schemas";
import type { ProviderUsage } from "@/server/ai/provider";

export type ItineraryErrorCode =
  | "invalid_itinerary_response"
  | "model_timeout"
  | "model_rate_limited"
  | "model_unavailable"
  | "repair_failed"
  | "unknown_error";

export class ItineraryProviderError extends Error {
  constructor(
    readonly code: ItineraryErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "ItineraryProviderError";
  }
}

export type ItineraryProviderInput = {
  operationKey: string;
  model: string;
  safetyIdentifier: string;
  context: string;
  signal: AbortSignal;
};
export type ItineraryProviderOutput = {
  itinerary: Itinerary;
  responseId: string | null;
  requestId: string | null;
  usage: ProviderUsage;
};
export interface ItineraryProvider {
  generate(input: ItineraryProviderInput): Promise<ItineraryProviderOutput>;
  repair(input: ItineraryProviderInput): Promise<ItineraryProviderOutput>;
}

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
const yosemite = {
  name: "Yosemite Valley",
  address: null,
  latitude: 37.7459,
  longitude: -119.5936,
  timezone: "America/Los_Angeles",
  verificationStatus: "estimated" as const,
};

function fixture(secondStart: string, unrepairable = false) {
  return itinerarySchema.parse({
    schemaVersion: "1",
    title: "Yosemite crew escape",
    destinationSummary: "A validated-base itinerary for Yosemite Valley.",
    timezone: "America/Los_Angeles",
    startDate: "2026-09-12",
    endDate: "2026-09-13",
    travelers: [
      {
        id: "traveler:crew",
        displayName: "Trailie Crew",
        origin: null,
        accessibilityNotes: [],
        dietaryNotes: [],
      },
    ],
    arrivals: [],
    departures: [],
    lodging: [
      {
        id: "lodging:valley",
        name: "Yosemite Valley lodging area",
        area: "Yosemite Valley",
        checkInDate: "2026-09-12",
        checkOutDate: "2026-09-14",
        location: yosemite,
        reservation,
        cost: unknownCost,
        evidenceRefs: [],
        notes: ["Recommendation only; no reservation has been made."],
      },
    ],
    days: [
      {
        id: "day:2026-09-12",
        date: "2026-09-12",
        title: "Valley and sunset",
        summary: "A measured first day with a verified drive between stops.",
        items: [
          {
            id: "item:valley-walk",
            type: "activity",
            startTime: "11:00",
            endTime: "15:00",
            title: "Yosemite Valley walk",
            description: "A relaxed orientation walk in Yosemite.",
            location: yosemite,
            reservation,
            cost: { ...unknownCost, status: "estimated", amount: 25 },
            evidenceRefs: [],
            notes: [],
          },
          {
            id: "item:glacier-sunset",
            type: "activity",
            startTime: secondStart,
            endTime: "19:30",
            title: "Glacier Point sunset",
            description: "The crew's confirmed sunset stop.",
            location: { ...yosemite, name: "Glacier Point" },
            reservation,
            cost: unknownCost,
            evidenceRefs: [],
            notes: [],
          },
        ],
        travelSegments: [
          {
            id: "segment:valley-glacier",
            fromItemId: "item:valley-walk",
            toItemId: "item:glacier-sunset",
            mode: "drive",
            origin: yosemite,
            destination: { ...yosemite, name: "Glacier Point" },
            distanceMeters: null,
            durationMinutes: null,
            bufferMinutes: 30,
            verificationStatus: "unknown",
            evidenceRefs: [],
          },
        ],
        estimatedDailyCost: { ...unknownCost, status: "estimated", amount: 25 },
        warnings: [],
      },
      {
        id: "day:2026-09-13",
        date: "2026-09-13",
        title: "Falls morning",
        summary: "An easy final morning.",
        items: [
          {
            id: "item:yosemite-falls",
            type: "activity",
            startTime: "10:00",
            endTime: "12:00",
            title: "Yosemite Falls",
            description: "An easy walk before departure.",
            location: yosemite,
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
    assumptions: unrepairable ? ["Add a Las Vegas casino stop"] : [],
    validationMetadata: {
      validatorVersion: "trailie-itinerary-validator-v1",
      validatedAt: null,
    },
  });
}

export function createFakeItineraryProvider(configuration?: {
  scenario?: "conflict" | "unrepairable" | "provider_failure";
}): ItineraryProvider {
  const scenario = configuration?.scenario ?? "conflict";
  const output = (
    itinerary: Itinerary,
    suffix: string,
  ): ItineraryProviderOutput => ({
    itinerary,
    responseId: `fake_itinerary_${suffix}`,
    requestId: `fake_request_${suffix}`,
    usage: {
      inputTokens: 800,
      outputTokens: 1200,
      reasoningTokens: 180,
      cachedInputTokens: 0,
      totalTokens: 2180,
    },
  });
  return {
    async generate() {
      if (scenario === "provider_failure")
        throw new ItineraryProviderError("model_unavailable", true);
      return output(
        fixture("16:00", scenario === "unrepairable"),
        "generation",
      );
    },
    async repair() {
      if (scenario === "provider_failure")
        throw new ItineraryProviderError("repair_failed", false);
      return output(fixture("17:30", scenario === "unrepairable"), "repair");
    },
  };
}
