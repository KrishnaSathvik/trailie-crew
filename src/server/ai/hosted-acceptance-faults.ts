import "server-only";

import {
  TrailieProviderError,
  type FocusedAnswerProvider,
} from "@/server/ai/provider";
import {
  MemoryProviderError,
  type MemoryExtractionProvider,
} from "@/features/memory/provider";

const focusedFailures = new Set<string>();
const memoryFailures = new Set<string>();

function enabled(mode: "focused_503_once" | "memory_503_once") {
  const configured = new Set(
    (process.env.HOSTED_ACCEPTANCE_PROVIDER_FAULT ?? "")
      .split(",")
      .map((item) => item.trim()),
  );
  return process.env.VERCEL_ENV === "preview" && configured.has(mode);
}

export function withHostedFocusedFault(
  provider: FocusedAnswerProvider,
): FocusedAnswerProvider {
  return {
    async stream(input) {
      if (
        enabled("focused_503_once") &&
        input.request.includes("[[trailie-acceptance:focused-503-once]]") &&
        !focusedFailures.has(input.operationKey)
      ) {
        focusedFailures.add(input.operationKey);
        throw new TrailieProviderError("openai_unavailable", true, {
          statusCode: 503,
        });
      }
      return provider.stream(input);
    },
  };
}

export function withHostedMemoryFault(
  provider: MemoryExtractionProvider,
): MemoryExtractionProvider {
  return {
    async extract(input) {
      if (
        enabled("memory_503_once") &&
        input.sourceMessage.body.includes(
          "[[trailie-acceptance:memory-503-once]]",
        ) &&
        !memoryFailures.has(input.operationKey)
      ) {
        memoryFailures.add(input.operationKey);
        throw new MemoryProviderError("model_unavailable", true, {
          statusCode: 503,
        });
      }
      return provider.extract(input);
    },
  };
}
