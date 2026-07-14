import { expect, it } from "vitest";

import { extractUsage } from "./usage";

it("extracts only documented Responses API usage fields", () => {
  expect(
    extractUsage({
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 3 },
      output_tokens: 8,
      output_tokens_details: { reasoning_tokens: 2 },
      total_tokens: 18,
    }),
  ).toEqual({
    inputTokens: 10,
    cachedInputTokens: 3,
    outputTokens: 8,
    reasoningTokens: 2,
    totalTokens: 18,
  });
});
