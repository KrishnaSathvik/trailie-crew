// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createOpenAIClient } from "./openai-client";

describe("OpenAI client retry ownership", () => {
  it("disables SDK retries so the workflow policy owns every attempt", () => {
    const client = createOpenAIClient({ apiKey: "sk-test", timeoutMs: 30_000 });
    expect(client.maxRetries).toBe(0);
  });

  it("does not allow callers to re-enable hidden SDK retries", () => {
    const client = createOpenAIClient({
      apiKey: "sk-test",
      timeoutMs: 30_000,
      maxRetries: 2,
    });
    expect(client.maxRetries).toBe(0);
  });
});
