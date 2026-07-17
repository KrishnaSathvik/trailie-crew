import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { memoryPatchSchema } from "@trailie/schemas";
import { z } from "zod";

import { EXTRACT_MEMORY_PROMPT } from "./prompts/extract-memory";
import { buildMemoryContext } from "./context";
import { MemoryProviderError, type MemoryExtractionProvider } from "./provider";
import { createOpenAIClient } from "@/server/ai/openai-client";
import { extractUsage } from "@/server/ai/usage";

const modelFactValueSchema = z
  .object({
    text: z.string().max(500).nullable(),
    question: z.string().max(500).nullable(),
    startDate: z.string().max(40).nullable(),
    endDate: z.string().max(40).nullable(),
    amount: z.number().nonnegative().nullable(),
    currency: z.string().max(3).nullable(),
  })
  .strict();
const modelMemoryPatchSchema = z
  .object({
    facts: z
      .array(
        z
          .object({
            factType: z.enum([
              "destination_preference",
              "destination_proposal",
              "destination_constraint",
              "date_preference",
              "date_constraint",
              "budget_preference",
              "budget_constraint",
              "transport_preference",
              "lodging_preference",
              "food_preference",
              "accessibility_need",
              "activity_preference",
              "must_do",
              "avoid",
              "availability",
              "traveler_origin",
              "group_decision",
              "rejected_option",
              "open_question",
              "general_constraint",
            ]),
            subjectType: z.enum(["participant", "group", "trip"]),
            subjectParticipantId: z.uuid().nullable().optional(),
            canonicalKey: z.string().max(160),
            value: modelFactValueSchema,
            status: z.enum(["active", "superseded", "rejected", "unresolved"]),
            confidence: z.number().min(0).max(1),
            evidenceStrength: z.enum(["explicit", "strong", "tentative"]),
            sourceMessageId: z.uuid().nullable().optional(),
            supersedesFactId: z.uuid().nullable(),
          })
          .strict(),
      )
      .max(12),
    supersessions: z
      .array(
        z
          .object({
            factId: z.uuid(),
            replacementFactIndex: z.number().int().min(0).max(11),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();

export function buildMemoryExtractionRequest(input: {
  model: string;
  safetyIdentifier: string;
  context: string;
}) {
  return {
    model: input.model,
    instructions: EXTRACT_MEMORY_PROMPT,
    input: input.context,
    reasoning: { effort: "none" as const },
    text: {
      format: zodTextFormat(modelMemoryPatchSchema, "trailie_memory_patch"),
    },
    max_output_tokens: 800,
    safety_identifier: input.safetyIdentifier,
    store: false,
  };
}

function mapped(error: unknown) {
  if (error instanceof MemoryProviderError) return error;
  if (error instanceof OpenAI.RateLimitError)
    return new MemoryProviderError("model_rate_limited", true);
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return new MemoryProviderError("model_timeout", true);
  if (
    error instanceof OpenAI.BadRequestError ||
    error instanceof OpenAI.UnprocessableEntityError
  )
    return new MemoryProviderError("invalid_extraction_response", true);
  return new MemoryProviderError("model_unavailable", true);
}

export function createOpenAIMemoryExtractionProvider(configuration: {
  apiKey: string;
  timeoutMs: number;
}): MemoryExtractionProvider {
  const client = createOpenAIClient(configuration);
  return {
    async extract(input) {
      try {
        const response = await client.responses.parse(
          buildMemoryExtractionRequest({
            model: input.model,
            safetyIdentifier: input.safetyIdentifier,
            context: buildMemoryContext(input),
          }),
          { signal: input.signal },
        );
        const raw = modelMemoryPatchSchema.safeParse(response.output_parsed);
        const patch = raw.success
          ? memoryPatchSchema.safeParse({
              facts: raw.data.facts.map((fact) => ({
                ...fact,
                sourceMessageId: fact.sourceMessageId ?? input.sourceMessage.id,
                subjectParticipantId:
                  fact.subjectParticipantId ??
                  (fact.subjectType === "participant"
                    ? input.sourceParticipant.id
                    : null),
                value: Object.fromEntries(
                  Object.entries(fact.value).filter(
                    ([, value]) => value !== null,
                  ),
                ),
              })),
              supersessions: raw.data.supersessions,
            })
          : raw;
        if (!patch.success)
          throw new MemoryProviderError("invalid_extraction_response", true);
        return {
          patch: patch.data,
          responseId: response.id,
          requestId:
            (response as typeof response & { _request_id?: string })
              ._request_id ?? null,
          usage: extractUsage(response.usage),
        };
      } catch (error) {
        throw mapped(error);
      }
    },
  };
}
