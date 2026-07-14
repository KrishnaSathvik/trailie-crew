type ResponsesUsage =
  | {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
      output_tokens_details?: { reasoning_tokens?: number };
    }
  | null
  | undefined;

export function extractUsage(usage: ResponsesUsage) {
  return {
    inputTokens: usage?.input_tokens ?? null,
    cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? null,
    outputTokens: usage?.output_tokens ?? null,
    reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
  };
}
