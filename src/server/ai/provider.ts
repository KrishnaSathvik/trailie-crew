import {
  trailieResponseDraftV1Schema,
  type TrailieIntent,
  type TrailieResponseDraftV1,
} from "@trailie/schemas";

import { createFakeProviderId } from "@/server/ai/fake-provider-id";

export type SafeAiErrorCode =
  | "openai_authentication_failed"
  | "openai_rate_limited"
  | "openai_timeout"
  | "openai_unavailable"
  | "invalid_model_response"
  | "invocation_cancelled";

export class TrailieProviderError extends Error {
  readonly statusCode: number | null;
  readonly requestId: string | null;
  readonly retryAfterMs: number | null;

  constructor(
    readonly code: SafeAiErrorCode,
    readonly retryable: boolean,
    metadata: {
      statusCode?: number | null;
      requestId?: string | null;
      retryAfterMs?: number | null;
    } = {},
  ) {
    super(code);
    this.name = "TrailieProviderError";
    this.statusCode = metadata.statusCode ?? null;
    this.requestId = metadata.requestId ?? null;
    this.retryAfterMs = metadata.retryAfterMs ?? null;
  }
}

export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
};

export type FocusedAnswerProviderInput = {
  operationKey: string;
  request: string;
  context: string;
  model: string;
  intent: TrailieIntent;
  safetyIdentifier: string;
  signal: AbortSignal;
};

export type FocusedAnswerProviderResult = {
  answer: TrailieResponseDraftV1;
  responseId: string | null;
  requestId: string | null;
  usage: ProviderUsage;
};

export type FocusedAnswerProviderStream = {
  textDeltas: AsyncIterable<string>;
  completed: Promise<FocusedAnswerProviderResult>;
};

export interface FocusedAnswerProvider {
  stream(
    input: FocusedAnswerProviderInput,
  ): Promise<FocusedAnswerProviderStream>;
}

function chunks(value: string, size = 18) {
  return Array.from({ length: Math.ceil(value.length / size) }, (_, index) =>
    value.slice(index * size, (index + 1) * size),
  );
}

const failedFakeOperations = new Set<string>();

function fakeDraft(input: FocusedAnswerProviderInput): TrailieResponseDraftV1 {
  const common = {
    schemaVersion: "1" as const,
    intent: input.intent,
    warnings: [] as string[],
    sources: [],
    assumptions: [],
    unresolvedQuestions: [],
    suggestedActions: [],
    persistenceDirective: "none" as const,
    approvalDirective: "not_required" as const,
    freshness: "not_applicable" as const,
    privacyLevel: "room" as const,
  };

  switch (input.intent) {
    case "destination_comparison":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message:
          "Yellowstone offers geothermal landscapes and broad wildlife viewing, while Grand Teton is stronger for mountain scenery and compact day hikes.",
        blocks: [
          {
            type: "destination_comparison",
            criteria: ["Scenery", "Wildlife", "Driving"],
            options: [
              {
                id: "destination:yellowstone",
                name: "Yellowstone",
                summary: "Broad geothermal and wildlife variety.",
                strengths: ["Wildlife", "Geothermal features"],
                tradeoffs: ["Longer drives"],
                evidenceState: "partial",
              },
              {
                id: "destination:grand-teton",
                name: "Grand Teton",
                summary: "Compact mountain scenery and lake access.",
                strengths: ["Mountain views", "Shorter park drives"],
                tradeoffs: ["Fewer geothermal features"],
                evidenceState: "partial",
              },
            ],
          },
        ],
        warnings: [
          "Seasonal access and current conditions still need verification.",
        ],
        freshness: "unavailable",
      });
    case "destination_discovery":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "These options are a useful starting point for the crew.",
        blocks: [
          {
            type: "destination_options",
            options: [
              {
                id: "destination:yellowstone",
                name: "Yellowstone",
                summary: "Best for wildlife and geothermal landscapes.",
                strengths: ["Wildlife", "Scenic drives"],
                tradeoffs: ["Long distances"],
                evidenceState: "partial",
              },
            ],
          },
        ],
        freshness: "unavailable",
      });
    case "create_itinerary":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message:
          "Before I build the trip, here is what I understand for the crew to review.",
        blocks: [
          {
            type: "understanding_summary",
            title: "Before we build the trip",
            rows: [
              {
                label: "Trip",
                detail: "Use the shared Trip context and crew constraints.",
                status: "confirmed",
              },
            ],
          },
          {
            type: "approval_status",
            status: "not_started",
            approvedBy: [],
            pending: ["Crew"],
          },
        ],
        approvalDirective: "required",
      });
    case "itinerary_revision":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message:
          "I can propose that scoped change for the crew to review before the plan is updated.",
        blocks: [
          {
            type: "itinerary_change_summary",
            request: input.request,
            impact: ["The affected day and travel timing need review."],
            status: "ready_for_review",
          },
          {
            type: "approval_status",
            status: "not_started",
            approvedBy: [],
            pending: ["Crew"],
          },
        ],
        persistenceDirective: "propose_revision",
        approvalDirective: "required",
        freshness: "unavailable",
      });
    case "map_question":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "I could not verify an exact map location from this request.",
        blocks: [{ type: "map_locations", locations: [] }],
        freshness: "unavailable",
      });
    case "route_question":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "The route could not be verified right now.",
        blocks: [
          {
            type: "route_summary",
            origin: "Trip origin",
            destination: "Trip destination",
            mode: "unknown",
            durationMinutes: null,
            distanceMeters: null,
            verification: "unavailable",
          },
        ],
        freshness: "unavailable",
      });
    case "lodging_recommendation":
    case "lodging_search":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message:
          "Start with an area that keeps the crew close to the planned activities.",
        blocks: [
          {
            type: "hotel_options",
            options: [
              {
                id: "area:central",
                name: "Central trip area",
                area: "Near the main activity cluster",
                reason: "This should reduce daily driving.",
                driveTimeImpact: "Exact drive times need verification.",
                priceState: "unavailable",
                availabilityState: "unknown",
                sourceId: null,
              },
            ],
          },
        ],
        freshness: "unavailable",
      });
    case "flight_guidance": {
      const comparesDriving =
        /\bdriv(?:e|ing)\b/i.test(input.request) &&
        /\b(?:fly|flying|flight)\b/i.test(input.request);
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: comparesDriving
          ? "Driving offers flexibility and room for gear, while flying can reduce travel time. Compare the full door-to-door time, cost, and ground transfer before deciding."
          : "Compare the closest practical airports by ground-transfer time and schedule fit.",
        blocks: [
          {
            type: "flight_guidance",
            airports: [],
            recommendedWindow: comparesDriving
              ? null
              : "Arrive early enough to preserve a buffer before the first planned activity.",
          },
        ],
        freshness: "unavailable",
      });
    }
    case "flight_search":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message:
          "Compare the closest practical airports by ground-transfer time and schedule fit.",
        blocks: [
          {
            type: "flight_guidance",
            airports: [],
            recommendedWindow:
              "Arrive early enough to preserve a buffer before the first planned activity.",
          },
        ],
        freshness: "unavailable",
      });
    case "reservation_question":
    case "permit_question":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "I could not verify the current requirement.",
        blocks: [
          {
            type: "reservation_requirements",
            requirements: [
              {
                label: "Current requirement",
                requirement: "unknown",
                details: "Check the official source before the trip.",
                sourceId: null,
              },
            ],
          },
        ],
        freshness: "unavailable",
      });
    case "booking_handoff":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message:
          "I can help you find an approved provider, but I cannot complete the reservation.",
        blocks: [{ type: "booking_options", options: [] }],
        freshness: "unavailable",
      });
    case "weather_question":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "Current weather could not be verified right now.",
        blocks: [
          {
            type: "weather_summary",
            location: "Trip destination",
            period: "Trip dates",
            summary: "Current forecast information is unavailable.",
            state: "unavailable",
            checkedAt: null,
          },
        ],
        freshness: "unavailable",
      });
    case "evidence_question":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "I could not verify that information.",
        blocks: [{ type: "evidence_summary", items: [] }],
        freshness: "unavailable",
      });
    case "planning_readiness":
    case "trip_context_question":
    case "group_conflict":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "Here is the shared understanding I can use.",
        blocks: [
          {
            type: "understanding_summary",
            title: "Crew understanding",
            rows: [
              {
                label: "Status",
                detail: "Review the shared Trip context before planning.",
                status: "open",
              },
            ],
          },
        ],
      });
    case "approval_question":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "The crew review status is shown below.",
        blocks: [
          {
            type: "approval_status",
            status: "pending",
            approvedBy: [],
            pending: ["Crew"],
          },
        ],
      });
    case "version_question":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message:
          "I couldn’t verify the exact changes from the available plan details.",
        blocks: [
          {
            type: "markdown",
            markdown:
              "Open Version 1 alongside the current plan to compare the exact changes.",
          },
        ],
      });
    case "unsupported_action":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "I cannot complete that action.",
        blocks: [
          {
            type: "error_state",
            title: "That action is not available",
            detail: "I can help you prepare the next step instead.",
            actionLabel: null,
          },
        ],
      });
    case "preference_capture":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "I’ll keep that preference in mind for this Trip.",
        blocks: [
          {
            type: "markdown",
            markdown: "I’ll keep that preference in mind for this Trip.",
          },
        ],
        persistenceDirective: "capture_preference",
      });
    case "constraint_capture":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "I’ll treat that as a constraint throughout the Trip.",
        blocks: [
          {
            type: "markdown",
            markdown: "I’ll treat that as a constraint throughout the Trip.",
          },
        ],
        persistenceDirective: "capture_constraint",
      });
    case "direct_question":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message:
          "I couldn’t verify current details from the information available.",
        blocks: [
          {
            type: "markdown",
            markdown:
              "I couldn’t verify current details from the information available.",
          },
        ],
        freshness: "unavailable",
      });
    case "itinerary_question":
      return trailieResponseDraftV1Schema.parse({
        ...common,
        message: "I couldn’t verify that detail from the current plan.",
        blocks: [
          {
            type: "markdown",
            markdown: "I couldn’t verify that detail from the current plan.",
          },
        ],
        freshness: "unavailable",
      });
  }
}

export function createFakeFocusedAnswerProvider(
  options: { failOnce?: boolean } = {},
): FocusedAnswerProvider {
  return {
    async stream(input) {
      if (/simulate (?:persistent )?provider failure/i.test(input.request)) {
        const persistent = /simulate persistent provider failure/i.test(
          input.request,
        );
        const shouldFail =
          persistent ||
          !options.failOnce ||
          !failedFakeOperations.has(input.operationKey);
        failedFakeOperations.add(input.operationKey);
        if (!shouldFail) {
          // Continue into the normal deterministic response on a deliberate retry.
        } else {
          const error = new TrailieProviderError("openai_unavailable", true);
          const completed = Promise.reject(error);
          void completed.catch(() => undefined);
          return {
            textDeltas: (async function* () {
              throw error;
            })(),
            completed,
          };
        }
      }
      const answer = fakeDraft(input);
      const result = {
        answer,
        responseId: createFakeProviderId(
          "focused_response",
          input.operationKey,
        ),
        requestId: createFakeProviderId("focused_request", input.operationKey),
        usage: {
          inputTokens: 20,
          outputTokens: 30,
          reasoningTokens: 4,
          cachedInputTokens: 0,
          totalTokens: 50,
        },
      };
      return {
        textDeltas: (async function* () {
          for (const delta of chunks(answer.message)) {
            if (input.signal.aborted)
              throw new TrailieProviderError("invocation_cancelled", false);
            await new Promise((resolve) => setTimeout(resolve, 30));
            yield delta;
          }
        })(),
        completed: Promise.resolve(result),
      };
    },
  };
}
