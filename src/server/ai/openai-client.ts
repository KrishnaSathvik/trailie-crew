import "server-only";

import OpenAI from "openai";

export function createOpenAIClient(configuration: {
  apiKey: string;
  timeoutMs: number;
}) {
  return new OpenAI({
    apiKey: configuration.apiKey,
    timeout: configuration.timeoutMs,
    maxRetries: 2,
    logLevel: "off",
  });
}
