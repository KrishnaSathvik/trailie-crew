import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  itinerarySchema,
  planChangeAnalysisSchema,
  revisionPatchV1Schema,
} from "@trailie/schemas";
import { createOpenAIClient } from "@/server/ai/openai-client";
import { extractUsage } from "@/server/ai/usage";
import { CHANGE_ANALYSIS_PROMPT } from "./prompts/change-analysis";
import {
  ITINERARY_REVISION_PROMPT,
  ITINERARY_REVISION_REPAIR_PROMPT,
  REVISION_SCOPE_REPAIR_PROMPT,
} from "./prompts/itinerary-revision";
import { REVISION_PATCH_PROMPT } from "./prompts/revision-patch";
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
  mode: "generate" | "scope_repair" | "conflict_repair";
}) {
  return {
    model: input.model,
    instructions:
      input.mode === "scope_repair"
        ? REVISION_SCOPE_REPAIR_PROMPT
        : input.mode === "conflict_repair"
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
export function buildRevisionPatchRequest(input: {
  model: string;
  safetyIdentifier: string;
  context: string;
}) {
  return {
    model: input.model,
    instructions: REVISION_PATCH_PROMPT,
    input: input.context,
    reasoning: { effort: "medium" as const },
    text: {
      format: zodTextFormat(revisionPatchV1Schema, "trailie_revision_patch"),
    },
    max_output_tokens: 6000,
    safety_identifier: input.safetyIdentifier,
    store: false,
  };
}
export function mapRevisionProviderError(
  error: unknown,
  code: "analysis" | "candidate",
) {
  if (error instanceof RevisionProviderError) return error;
  if (
    error instanceof OpenAI.APIConnectionTimeoutError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
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
  const client = createOpenAIClient(configuration);
  async function call(
    input: RevisionProviderInput,
    mode:
      "analysis" | "patch" | "generate" | "scope_repair" | "conflict_repair",
  ) {
    try {
      const response = await client.responses.parse(
        mode === "analysis"
          ? buildChangeAnalysisRequest(input)
          : mode === "patch"
            ? buildRevisionPatchRequest(input)
            : buildItineraryRevisionRequest({ ...input, mode }),
        { signal: input.signal },
      );
      const parsed =
        mode === "analysis"
          ? planChangeAnalysisSchema.safeParse(response.output_parsed)
          : mode === "patch"
            ? revisionPatchV1Schema.safeParse(response.output_parsed)
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
        : mode === "patch"
          ? { patch: parsed.data, ...meta }
          : { itinerary: parsed.data, ...meta };
    } catch (error) {
      throw mapRevisionProviderError(
        error,
        mode === "analysis" ? "analysis" : "candidate",
      );
    }
  }
  return {
    analyze: (input) =>
      call(input, "analysis") as ReturnType<RevisionProvider["analyze"]>,
    generatePatch: (input) =>
      call(input, "patch") as ReturnType<RevisionProvider["generatePatch"]>,
    generate: (input) =>
      call(input, "generate") as ReturnType<RevisionProvider["generate"]>,
    repairScope: (input) =>
      call(input, "scope_repair") as ReturnType<
        RevisionProvider["repairScope"]
      >,
    repair: (input) =>
      call(input, "conflict_repair") as ReturnType<RevisionProvider["repair"]>,
  };
}
