import {
  trailieFocusedAnswerSchema,
  type TrailieFocusedAnswer,
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
  safetyIdentifier: string;
  signal: AbortSignal;
};

export type FocusedAnswerProviderResult = {
  answer: TrailieFocusedAnswer;
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
      const comparison = /compare|versus|\bvs\.?\b/i.test(input.request);
      const answer = trailieFocusedAnswerSchema.parse(
        comparison
          ? {
              responseType: "comparison",
              body: "Driving offers flexibility and room for gear; flying is usually faster over long distances. Compare total door-to-door time and shared costs before deciding.",
              comparisonItems: [
                {
                  label: "Driving",
                  detail: "Flexible stops and easier gear handling.",
                },
                {
                  label: "Flying",
                  detail: "Faster for long distances, with airport overhead.",
                },
              ],
              followUpQuestion:
                "What are your origins and preferred travel dates?",
            }
          : {
              responseType: "plain_answer",
              body: "I can help with that focused question. Share the key dates or constraints that matter most to the crew.",
            },
      );
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
          for (const delta of chunks(answer.body)) {
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
