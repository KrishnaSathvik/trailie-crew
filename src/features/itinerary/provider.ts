import {
  itinerarySchema,
  type CompactItineraryCandidateV1,
} from "@trailie/schemas";
import { createFakeProviderId } from "@/server/ai/fake-provider-id";
import type { ProviderUsage } from "@/server/ai/provider";
import { compactItineraryCandidateFromItinerary } from "./compact-candidate";

export type ItineraryErrorCode =
  | "invalid_itinerary_response"
  | "model_timeout"
  | "model_rate_limited"
  | "model_unavailable"
  | "repair_failed"
  | "invalid_model_output"
  | "workflow_deadline_exceeded"
  | "retry_exhausted"
  | "recovery_required"
  | "workflow_cancelled"
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
  dayCount?: number;
  allowStructuralRepair?: boolean;
  signal: AbortSignal;
};
export type ItineraryProviderOutput = {
  candidate: CompactItineraryCandidateV1;
  responseId: string | null;
  requestId: string | null;
  usage: ProviderUsage;
  structuralRepairCount?: number;
  providerCallCount?: number;
};
export interface ItineraryProvider {
  generate(input: ItineraryProviderInput): Promise<ItineraryProviderOutput>;
  repair(input: ItineraryProviderInput): Promise<ItineraryProviderOutput>;
}

export function withCompatibleItineraryFallback(
  provider: ItineraryProvider,
  input: {
    fallbackModel: string;
    hedgeDelayMs?: number;
    onFallback?: (reason: string) => void;
  },
): ItineraryProvider {
  async function generate(request: ItineraryProviderInput) {
    if (input.fallbackModel === request.model)
      return provider.generate(request);
    const primaryController = new AbortController();
    const fallbackController = new AbortController();
    let fallbackStarted = false;
    const withRequestSignal = (controller: AbortController) =>
      AbortSignal.any([request.signal, controller.signal]);
    const primary = provider
      .generate({
        ...request,
        signal: withRequestSignal(primaryController),
      })
      .then((output) => ({ output }));
    const fallback = (async () => {
      const delayMs = Math.max(0, input.hedgeDelayMs ?? 2_500);
      if (delayMs > 0)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          fallbackController.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      if (fallbackController.signal.aborted)
        throw new DOMException("Aborted", "AbortError");
      fallbackStarted = true;
      input.onFallback?.("hedged_compatible_route");
      return {
        output: await provider.generate({
          ...request,
          model: input.fallbackModel,
          allowStructuralRepair: false,
          signal: withRequestSignal(fallbackController),
        }),
      };
    })();
    try {
      const winner = await Promise.any([primary, fallback]);
      return {
        ...winner.output,
        providerCallCount:
          (winner.output.providerCallCount ?? 1) + (fallbackStarted ? 1 : 0),
      };
    } catch (error) {
      if (error instanceof AggregateError) {
        const providerError = error.errors.find(
          (entry) => entry instanceof ItineraryProviderError,
        );
        if (providerError) throw providerError;
      }
      throw error;
    } finally {
      primaryController.abort();
      fallbackController.abort();
    }
  }
  return {
    generate,
    repair: (request) => provider.repair(request),
  };
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
    candidate: CompactItineraryCandidateV1,
    suffix: string,
    operationKey: string,
  ): ItineraryProviderOutput => ({
    candidate,
    responseId: createFakeProviderId(
      `itinerary_${suffix}_response`,
      operationKey,
    ),
    requestId: createFakeProviderId(
      `itinerary_${suffix}_request`,
      operationKey,
    ),
    usage: {
      inputTokens: 800,
      outputTokens: 500,
      reasoningTokens: 180,
      cachedInputTokens: 0,
      totalTokens: 1480,
    },
  });
  return {
    async generate(input) {
      if (scenario === "provider_failure")
        throw new ItineraryProviderError("model_unavailable", true);
      return output(
        compactItineraryCandidateFromItinerary(
          fixture("16:00", scenario === "unrepairable"),
        ),
        "generation",
        input.operationKey,
      );
    },
    async repair(input) {
      if (scenario === "provider_failure")
        throw new ItineraryProviderError("repair_failed", false);
      return output(
        compactItineraryCandidateFromItinerary(
          fixture("17:30", scenario === "unrepairable"),
        ),
        "repair",
        input.operationKey,
      );
    },
  };
}
