import "server-only";
import OpenAI from "openai";
import { itinerarySchema } from "@trailie/schemas";
import { createOpenAIClient } from "@/server/ai/openai-client";
import { extractUsage } from "@/server/ai/usage";
import { ITINERARY_PROMPT, ITINERARY_REPAIR_PROMPT } from "./prompts/itinerary";
import { createProviderCompatibleZodTextFormat } from "@/server/ai/provider-compatible-schema";
import {
  ItineraryProviderError,
  type ItineraryProvider,
  type ItineraryProviderInput,
} from "./provider";

export function buildItineraryRequest(input: {
  model: string;
  safetyIdentifier: string;
  context: string;
  repair?: boolean;
  structuralRepair?: boolean;
}) {
  return {
    model: input.model,
    instructions: `${input.repair ? ITINERARY_REPAIR_PROMPT : ITINERARY_PROMPT}${
      input.structuralRepair
        ? "\nThe previous response did not match the required schema. Return one complete schema-valid itinerary without commentary."
        : ""
    }`,
    input: input.context,
    reasoning: { effort: "low" as const },
    text: {
      format: createProviderCompatibleZodTextFormat(
        itinerarySchema,
        "trailie_itinerary",
      ),
    },
    max_output_tokens: 8_000,
    safety_identifier: input.safetyIdentifier,
    store: false,
  };
}

export async function runWithOneStructuralRepair<T>(
  operation: (attempt: 0 | 1) => Promise<T>,
) {
  try {
    return await operation(0);
  } catch (error) {
    const code =
      error instanceof ItineraryProviderError
        ? error.code
        : error instanceof Error
          ? error.message
          : "";
    if (code !== "invalid_itinerary_response" && code !== "repair_failed")
      throw error;
    return operation(1);
  }
}

export function mapItineraryProviderError(error: unknown, repair: boolean) {
  if (error instanceof ItineraryProviderError) return error;
  if (error instanceof OpenAI.RateLimitError)
    return new ItineraryProviderError("model_rate_limited", true);
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return new ItineraryProviderError("model_timeout", true);
  if (error instanceof OpenAI.APIUserAbortError)
    return new ItineraryProviderError("model_timeout", true);
  if (
    error instanceof OpenAI.BadRequestError ||
    error instanceof OpenAI.UnprocessableEntityError
  )
    return new ItineraryProviderError(
      repair ? "repair_failed" : "invalid_itinerary_response",
      !repair,
    );
  const errorName =
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
      ? error.name
      : null;
  if (errorName === "AbortError" || errorName === "TimeoutError")
    return new ItineraryProviderError("model_timeout", true);
  return new ItineraryProviderError(
    repair ? "repair_failed" : "model_unavailable",
    true,
  );
}

export function createOpenAIItineraryProvider(configuration: {
  apiKey: string;
  timeoutMs: number;
}): ItineraryProvider {
  const client = createOpenAIClient(configuration);
  async function callOnce(
    input: ItineraryProviderInput,
    repair: boolean,
    structuralRepair: boolean,
  ) {
    try {
      const response = await client.responses.parse(
        buildItineraryRequest({
          model: input.model,
          safetyIdentifier: input.safetyIdentifier,
          context: input.context,
          repair,
          structuralRepair,
        }),
        { signal: input.signal },
      );
      const parsed = itinerarySchema.safeParse(response.output_parsed);
      if (!parsed.success)
        throw new ItineraryProviderError(
          repair ? "repair_failed" : "invalid_itinerary_response",
          !repair,
        );
      return {
        itinerary: parsed.data,
        responseId: response.id,
        requestId:
          (response as typeof response & { _request_id?: string })
            ._request_id ?? null,
        usage: extractUsage(response.usage),
      };
    } catch (error) {
      throw mapItineraryProviderError(error, repair);
    }
  }
  function call(input: ItineraryProviderInput, repair: boolean) {
    let structuralRepairCount = 0;
    return runWithOneStructuralRepair(async (attempt) => {
      structuralRepairCount = attempt;
      const output = await callOnce(input, repair, attempt === 1);
      return { ...output, structuralRepairCount };
    });
  }
  return {
    generate: (input) => call(input, false),
    repair: (input) => call(input, true),
  };
}
