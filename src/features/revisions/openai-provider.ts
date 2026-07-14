import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { itinerarySchema, planChangeAnalysisSchema } from "@trailie/schemas";
import { createOpenAIClient } from "@/server/ai/openai-client";
import { extractUsage } from "@/server/ai/usage";
import { CHANGE_ANALYSIS_PROMPT } from "./prompts/change-analysis";
import {
  ITINERARY_REVISION_PROMPT,
  ITINERARY_REVISION_REPAIR_PROMPT,
} from "./prompts/itinerary-revision";
import {
  RevisionProviderError,
  type RevisionProvider,
  type RevisionProviderInput,
} from "./provider";

export function buildChangeAnalysisRequest(input: {
  model: string;
  safetyIdentifier: string;
  context: string;
}) {
  return {
    model: input.model,
    instructions: CHANGE_ANALYSIS_PROMPT,
    input: input.context,
    reasoning: { effort: "medium" as const },
    text: {
      format: zodTextFormat(
        planChangeAnalysisSchema,
        "trailie_change_analysis",
      ),
    },
    max_output_tokens: 6000,
    safety_identifier: input.safetyIdentifier,
    store: false,
  };
}
export function buildItineraryRevisionRequest(input: {
  model: string;
  safetyIdentifier: string;
  context: string;
  repair: boolean;
}) {
  return {
    model: input.model,
    instructions: input.repair
      ? ITINERARY_REVISION_REPAIR_PROMPT
      : ITINERARY_REVISION_PROMPT,
    input: input.context,
    reasoning: { effort: "high" as const },
    text: {
      format: zodTextFormat(itinerarySchema, "trailie_itinerary_revision"),
    },
    max_output_tokens: 12000,
    safety_identifier: input.safetyIdentifier,
    store: false,
  };
}
function mapped(error: unknown, code: "analysis" | "candidate") {
  if (error instanceof RevisionProviderError) return error;
  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    (error instanceof Error && error.name === "AbortError")
  )
    return new RevisionProviderError("model_timeout", true);
  if (
    error instanceof OpenAI.BadRequestError ||
    error instanceof OpenAI.UnprocessableEntityError
  )
    return new RevisionProviderError(
      code === "analysis" ? "invalid_change_analysis" : "invalid_candidate",
      false,
    );
  return new RevisionProviderError("model_unavailable", true);
}
export function createOpenAIRevisionProvider(configuration: {
  apiKey: string;
  timeoutMs: number;
}): RevisionProvider {
  const client = createOpenAIClient({ ...configuration, maxRetries: 0 });
  async function call(
    input: RevisionProviderInput,
    mode: "analysis" | "generate" | "repair",
  ) {
    try {
      const response = await client.responses.parse(
        mode === "analysis"
          ? buildChangeAnalysisRequest(input)
          : buildItineraryRevisionRequest({
              ...input,
              repair: mode === "repair",
            }),
        { signal: input.signal },
      );
      const parsed =
        mode === "analysis"
          ? planChangeAnalysisSchema.safeParse(response.output_parsed)
          : itinerarySchema.safeParse(response.output_parsed);
      if (!parsed.success)
        throw new RevisionProviderError(
          mode === "analysis" ? "invalid_change_analysis" : "invalid_candidate",
          false,
        );
      const meta = {
        responseId: response.id,
        requestId:
          (response as typeof response & { _request_id?: string })
            ._request_id ?? null,
        usage: extractUsage(response.usage),
      };
      return mode === "analysis"
        ? { analysis: parsed.data, ...meta }
        : { itinerary: parsed.data, ...meta };
    } catch (error) {
      throw mapped(error, mode === "analysis" ? "analysis" : "candidate");
    }
  }
  return {
    analyze: (input) =>
      call(input, "analysis") as ReturnType<RevisionProvider["analyze"]>,
    generate: (input) =>
      call(input, "generate") as ReturnType<RevisionProvider["generate"]>,
    repair: (input) =>
      call(input, "repair") as ReturnType<RevisionProvider["repair"]>,
  };
}
