import "server-only";

import OpenAI from "openai";

export function createOpenAIClient(configuration: {
  apiKey: string;
  timeoutMs: number;
  maxRetries?: number;
}) {
  return new OpenAI({
    apiKey: configuration.apiKey,
    timeout: configuration.timeoutMs,
    // Workflow retries are durable and observable. Hidden SDK retries would
    // multiply attempts and can double-reserve quota or exceed the deadline.
    maxRetries: 0,
    logLevel: "off",
  });
}
