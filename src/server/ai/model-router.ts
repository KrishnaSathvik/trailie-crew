import {
  modelRouteDecisionSchema,
  type ModelRouteDecision,
} from "@trailie/schemas";

type ModelConfiguration = { conversation: string; flagship: string };
type RouteInput = { request: string; contextCharacters: number };

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
