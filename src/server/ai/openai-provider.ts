import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { trailieFocusedAnswerSchema } from "@trailie/schemas";

import { FOCUSED_ANSWER_PROMPT } from "@/features/trailie/prompts/focused-answer";
import { createOpenAIClient } from "@/server/ai/openai-client";
import {
  TrailieProviderError,
  type FocusedAnswerProvider,
  type SafeAiErrorCode,
} from "@/server/ai/provider";
import { StructuredBodyExtractor } from "@/server/ai/streaming-body";
import { extractUsage } from "@/server/ai/usage";

const focusedAnswerModelSchema = trailieFocusedAnswerSchema
  .extend({
    title: trailieFocusedAnswerSchema.shape.title.unwrap().nullable(),
    comparisonItems: trailieFocusedAnswerSchema.shape.comparisonItems
      .unwrap()
      .nullable(),
    followUpQuestion: trailieFocusedAnswerSchema.shape.followUpQuestion
      .unwrap()
      .nullable(),
  })
  .strict();

export function buildFocusedAnswerRequest(input: {
  model: string;
  safetyIdentifier: string;
  context: string;
  request: string;
}) {
  return {
    model: input.model,
    instructions: FOCUSED_ANSWER_PROMPT,
    input: `${input.context}\n\n<CURRENT EXPLICIT REQUEST>\n${input.request}\n</CURRENT EXPLICIT REQUEST>`,
    reasoning: { effort: "low" as const },
    text: {
      format: zodTextFormat(focusedAnswerModelSchema, "trailie_focused_answer"),
    },
    max_output_tokens: 900,
    safety_identifier: input.safetyIdentifier,
    store: false,
  };
}

export function normalizeFocusedAnswerModelOutput(value: unknown) {
  const parsed = focusedAnswerModelSchema.parse(value);
  return trailieFocusedAnswerSchema.parse({
    responseType: parsed.responseType,
    body: parsed.body,
    ...(parsed.title === null ? {} : { title: parsed.title }),
    ...(parsed.comparisonItems === null
      ? {}
      : { comparisonItems: parsed.comparisonItems }),
    ...(parsed.followUpQuestion === null
      ? {}
      : { followUpQuestion: parsed.followUpQuestion }),
  });
}

function mapOpenAIError(error: unknown) {
  if (error instanceof TrailieProviderError) return error;
  let code: SafeAiErrorCode = "openai_unavailable";
  let retryable = true;
  if (
    error instanceof OpenAI.AuthenticationError ||
    error instanceof OpenAI.PermissionDeniedError
  ) {
    code = "openai_authentication_failed";
    retryable = false;
  } else if (error instanceof OpenAI.RateLimitError) {
    code = "openai_rate_limited";
  } else if (error instanceof OpenAI.APIConnectionTimeoutError) {
    code = "openai_timeout";
  } else if (
    error instanceof OpenAI.BadRequestError ||
    error instanceof OpenAI.UnprocessableEntityError
  ) {
    code = "invalid_model_response";
    retryable = false;
  } else if (error instanceof Error && error.name === "AbortError") {
    code = "invocation_cancelled";
    retryable = false;
  }
  return new TrailieProviderError(code, retryable);
}

export function createOpenAIFocusedAnswerProvider(configuration: {
  apiKey: string;
  timeoutMs: number;
}): FocusedAnswerProvider {
  const client = createOpenAIClient(configuration);
  return {
    async stream(input) {
      let stream;
      try {
        stream = client.responses.stream(
          buildFocusedAnswerRequest({
            model: input.model,
            safetyIdentifier: input.safetyIdentifier,
            context: input.context,
            request: input.request,
          }),
          { signal: input.signal },
        );
      } catch (error) {
        throw mapOpenAIError(error);
      }

      const completed = stream
        .finalResponse()
        .then((response) => {
          let answer;
          try {
            answer = normalizeFocusedAnswerModelOutput(response.output_parsed);
          } catch {
            throw new TrailieProviderError("invalid_model_response", true);
          }
          return {
            answer,
            responseId: response.id,
            requestId:
              (response as typeof response & { _request_id?: string })
                ._request_id ?? null,
            usage: extractUsage(response.usage),
          };
        })
        .catch((error) => {
          throw mapOpenAIError(error);
        });

      return {
        textDeltas: (async function* () {
          const extractor = new StructuredBodyExtractor();
          try {
            for await (const event of stream) {
              if (event.type !== "response.output_text.delta") continue;
              const safeDelta = extractor.push(event.delta);
              if (safeDelta) yield safeDelta;
            }
          } catch (error) {
            throw mapOpenAIError(error);
          }
        })(),
        completed,
      };
    },
  };
}
