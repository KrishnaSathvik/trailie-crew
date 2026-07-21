import "server-only";
import OpenAI from "openai";
import { planningSummarySchema } from "@trailie/schemas";
import { createOpenAIClient } from "@/server/ai/openai-client";
import { extractUsage } from "@/server/ai/usage";
import { PLANNING_SUMMARY_PROMPT } from "./prompts/planning-summary";
import { createProviderCompatibleZodTextFormat } from "@/server/ai/provider-compatible-schema";
import {
  PlanningProviderError,
  type PlanningSummaryProvider,
} from "./provider";

export function buildPlanningSummaryRequest(input: {
  model: string;
  safetyIdentifier: string;
  context: string;
}) {
  return {
    model: input.model,
    instructions: PLANNING_SUMMARY_PROMPT,
    input: input.context,
    reasoning: { effort: "low" as const },
    text: {
      format: createProviderCompatibleZodTextFormat(
        planningSummarySchema,
        "trailie_planning_summary",
      ),
    },
    max_output_tokens: 1800,
    safety_identifier: input.safetyIdentifier,
    store: false,
  };
}
export function mapPlanningProviderError(error: unknown) {
  if (error instanceof PlanningProviderError) return error;
  if (error instanceof OpenAI.RateLimitError)
    return new PlanningProviderError("model_rate_limited", true);
  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error.name === "TimeoutError" || error.name === "AbortError"))
  )
    return new PlanningProviderError("model_timeout", true);
  if (
    error instanceof OpenAI.BadRequestError ||
    error instanceof OpenAI.UnprocessableEntityError
  )
    return new PlanningProviderError("invalid_summary_response", true);
  return new PlanningProviderError("model_unavailable", true);
}
export function createOpenAIPlanningSummaryProvider(configuration: {
  apiKey: string;
  timeoutMs: number;
}): PlanningSummaryProvider {
  const client = createOpenAIClient(configuration);
  return {
    async summarize(input) {
      try {
        const response = await client.responses.parse(
          buildPlanningSummaryRequest({
            model: input.model,
            safetyIdentifier: input.safetyIdentifier,
            context: input.context,
          }),
          { signal: input.signal },
        );
        const parsed = planningSummarySchema.safeParse(response.output_parsed);
        if (!parsed.success)
          throw new PlanningProviderError("invalid_summary_response", true);
        return {
          summary: parsed.data,
          responseId: response.id,
          requestId:
            (response as typeof response & { _request_id?: string })
              ._request_id ?? null,
          usage: extractUsage(response.usage),
        };
      } catch (error) {
        throw mapPlanningProviderError(error);
      }
    },
  };
}
