import {
  modelRouteDecisionSchema,
  type TrailieIntent,
  type ModelRouteDecision,
} from "@trailie/schemas";

type ModelConfiguration = { conversation: string; flagship: string };
type RouteInput = { request: string; contextCharacters: number };

export type TrailieRequestComplexity =
  | "instant"
  | "simple"
  | "context_backed"
  | "tool_backed"
  | "planning_summary"
  | "full_itinerary"
  | "small_revision"
  | "large_revision"
  | "evidence_refresh"
  | "map_resolution"
  | "booking_guidance"
  | "unsupported";

export type TrailieModelRoute =
  "deterministic" | "fast" | "reasoning_planning" | "tool_pipeline";

export type RevisionImpact = {
  affectedItemCount: number;
  affectedDayCount: number;
  changesDates: boolean;
  changesDestination: boolean;
  changesLodgingArea: boolean;
  changesMajorRoute: boolean;
};

export type TrailieRuntimeRouteDecision = {
  complexity: TrailieRequestComplexity;
  route: TrailieModelRoute;
  model: string | null;
  reason: string;
  structuredContract: boolean;
};

export function assertStructuredItineraryRoute(
  decision: TrailieRuntimeRouteDecision,
) {
  if (!decision.model || !decision.structuredContract)
    throw new Error("itinerary_model_route_incompatible");
  return decision;
}

type RuntimeModelConfiguration = {
  fast: string;
  reasoning: string;
  planning: string;
  itinerary: string;
};

const contextBackedIntents = new Set<TrailieIntent>([
  "trip_context_question",
  "preference_capture",
  "constraint_capture",
  "itinerary_question",
  "approval_question",
  "version_question",
]);

const toolBackedIntents = new Set<TrailieIntent>([
  "route_question",
  "evidence_question",
  "weather_question",
  "permit_question",
  "reservation_question",
]);

const bookingIntents = new Set<TrailieIntent>([
  "lodging_recommendation",
  "lodging_search",
  "flight_guidance",
  "flight_search",
  "booking_handoff",
]);

export function classifyRequestComplexity(input: {
  intent: TrailieIntent;
  request: string;
  revisionImpact?: RevisionImpact;
}): TrailieRequestComplexity {
  if (input.intent === "unsupported_action") return "unsupported";
  if (input.intent === "itinerary_revision") {
    const impact = input.revisionImpact;
    if (!impact) {
      const broadRequest =
        /\b(?:dates?|destination|airport|hotel area|lodging area|multiple days?|every day|all days?|major route)\b/i.test(
          input.request,
        );
      return broadRequest ? "large_revision" : "small_revision";
    }
    return impact.changesDates ||
      impact.changesDestination ||
      impact.changesLodgingArea ||
      impact.changesMajorRoute ||
      impact.affectedItemCount > 2 ||
      impact.affectedDayCount > 1
      ? "large_revision"
      : "small_revision";
  }
  if (input.intent === "create_itinerary") return "planning_summary";
  if (
    input.intent === "planning_readiness" ||
    input.intent === "group_conflict"
  )
    return "planning_summary";
  if (input.intent === "map_question") return "map_resolution";
  if (bookingIntents.has(input.intent)) return "booking_guidance";
  if (toolBackedIntents.has(input.intent)) return "tool_backed";
  if (contextBackedIntents.has(input.intent)) return "context_backed";
  return "simple";
}

function assertRuntimeConfiguration(configuration: RuntimeModelConfiguration) {
  if (Object.values(configuration).some((model) => !model.trim()))
    throw new Error("AI runtime model configuration is incomplete.");
}

export function createTrailieRuntimeRouter(
  configuration: RuntimeModelConfiguration,
) {
  assertRuntimeConfiguration(configuration);
  return {
    route(input: {
      intent: TrailieIntent;
      request: string;
      complexity?: TrailieRequestComplexity;
      revisionImpact?: RevisionImpact;
    }): TrailieRuntimeRouteDecision {
      const complexity =
        input.complexity ??
        classifyRequestComplexity({
          intent: input.intent,
          request: input.request,
          revisionImpact: input.revisionImpact,
        });
      if (complexity === "instant" || complexity === "unsupported") {
        return {
          complexity,
          route: "deterministic",
          model: null,
          reason:
            complexity === "unsupported"
              ? "unsupported_local_response"
              : "deterministic_local_response",
          structuredContract: false,
        };
      }
      if (complexity === "full_itinerary") {
        return {
          complexity,
          route: "fast",
          model: configuration.fast,
          reason: "compact_itinerary_fast_path",
          structuredContract: true,
        };
      }
      if (complexity === "planning_summary") {
        return {
          complexity,
          route: "fast",
          model: configuration.fast,
          reason: "planning_summary_fast_path",
          structuredContract: true,
        };
      }
      if (
        complexity === "large_revision" ||
        input.intent === "destination_comparison" ||
        input.intent === "destination_discovery" ||
        input.intent === "group_conflict"
      ) {
        return {
          complexity,
          route: "reasoning_planning",
          model: configuration.reasoning,
          reason:
            complexity === "large_revision"
              ? "large_revision_scope"
              : "complex_recommendation",
          structuredContract: true,
        };
      }
      if (
        complexity === "tool_backed" ||
        complexity === "evidence_refresh" ||
        complexity === "map_resolution" ||
        complexity === "booking_guidance"
      ) {
        return {
          complexity,
          route: "tool_pipeline",
          model: configuration.fast,
          reason: "provider_evidence_pipeline",
          structuredContract: true,
        };
      }
      return {
        complexity,
        route: "fast",
        model: configuration.fast,
        reason:
          complexity === "small_revision"
            ? "small_revision_scope"
            : complexity === "context_backed"
              ? "bounded_context_answer"
              : "simple_answer",
        structuredContract: complexity === "small_revision",
      };
    },
  };
}

const constraintPattern =
  /\b(cost|time|luggage|accessibility|weather|origin|route|schedule|budget)\b/gi;

export function createModelRouter(configuration: ModelConfiguration) {
  if (!configuration.conversation.trim() || !configuration.flagship.trim()) {
    throw new Error("AI model configuration is incomplete.");
  }
  return {
    route(input: RouteInput): ModelRouteDecision {
      const constraints = new Set(
        input.request
          .match(constraintPattern)
          ?.map((value) => value.toLowerCase()),
      );
      const complex =
        input.contextCharacters >= 8000 &&
        constraints.size >= 4 &&
        /\b(compare|versus|vs\.?|trade-?offs?)\b/i.test(input.request);
      return modelRouteDecisionSchema.parse(
        complex
          ? {
              model: configuration.flagship,
              tier: "flagship",
              reason: "complex_multi_constraint",
            }
          : {
              model: configuration.conversation,
              tier: "conversation",
              reason: "focused_answer",
            },
      );
    },
  };
}
