import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  trailieResponseDraftV1Schema,
  type TrailieIntent,
} from "@trailie/schemas";

import { FOCUSED_ANSWER_PROMPT } from "@/features/trailie/prompts/focused-answer";
import { getTrailieIntentPolicy } from "@/features/trailie/intelligence/intent";
import { createOpenAIClient } from "@/server/ai/openai-client";
import {
  TrailieProviderError,
  type FocusedAnswerProvider,
  type SafeAiErrorCode,
} from "@/server/ai/provider";
import { StructuredBodyExtractor } from "@/server/ai/streaming-body";
import { extractUsage } from "@/server/ai/usage";
import { normalizeProviderError } from "@/server/ai/reliability-policy";

const focusedAnswerModelSchema = trailieResponseDraftV1Schema;

export function buildFocusedAnswerRequest(input: {
  model: string;
  safetyIdentifier: string;
  context: string;
  request: string;
  intent: TrailieIntent;
}) {
  const policy = getTrailieIntentPolicy(input.intent);
  return {
    model: input.model,
    instructions: FOCUSED_ANSWER_PROMPT,
    input: [
      input.context,
      `<DETECTED_INTENT>${input.intent}</DETECTED_INTENT>`,
      `<INTENT_POLICY>${JSON.stringify({
        permittedTools: policy.permittedTools,
        outputBlocks: policy.outputBlocks,
        persistence: policy.persistence,
        approvalRequired: policy.approvalRequired,
        externalEvidence: policy.externalEvidence,
        safeFallback: policy.safeFallback,
      })}</INTENT_POLICY>`,
      `<CURRENT_EXPLICIT_REQUEST>${input.request}</CURRENT_EXPLICIT_REQUEST>`,
    ].join("\n\n"),
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
  return focusedAnswerModelSchema.parse(value);
}

export function mapFocusedProviderError(error: unknown) {
  if (error instanceof TrailieProviderError) return error;
  let code: SafeAiErrorCode | null = null;
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
  } else if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "TimeoutError"
  ) {
    code = "openai_timeout";
  } else if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  ) {
    code = "openai_timeout";
  }
  if (code) {
    const normalized = normalizeProviderError(error);
    return new TrailieProviderError(code, retryable, normalized);
  }
  const normalized = normalizeProviderError(error);
  return new TrailieProviderError(
    normalized.code === "model_rate_limited"
      ? "openai_rate_limited"
      : normalized.code === "model_timeout"
        ? "openai_timeout"
        : normalized.code === "invalid_model_output"
          ? "invalid_model_response"
          : "openai_unavailable",
    normalized.retryable,
    normalized,
  );
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
            intent: input.intent,
          }),
          { signal: input.signal },
        );
      } catch (error) {
        throw mapFocusedProviderError(error);
      }

      const completed = stream
        .finalResponse()
        .then((response) => {
          let answer;
          try {
            answer = normalizeFocusedAnswerModelOutput(response.output_parsed);
          } catch {
            throw new TrailieProviderError("invalid_model_response", false);
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
          throw mapFocusedProviderError(error);
        });

      return {
        textDeltas: (async function* () {
          const extractor = new StructuredBodyExtractor("message");
          try {
            for await (const event of stream) {
              if (event.type !== "response.output_text.delta") continue;
              const safeDelta = extractor.push(event.delta);
              if (safeDelta) yield safeDelta;
            }
          } catch (error) {
            throw mapFocusedProviderError(error);
          }
        })(),
        completed,
      };
    },
  };
}
