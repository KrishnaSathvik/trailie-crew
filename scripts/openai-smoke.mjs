import { createHmac } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

if (!process.env.OPENAI_API_KEY) {
  console.log("OpenAI smoke test: skipped (OPENAI_API_KEY is not set).");
  process.exit(0);
}

const model = process.env.OPENAI_MODEL_CONVERSATION ?? "gpt-5.6-terra";
const schema = z
  .object({
    responseType: z.literal("plain_answer"),
    body: z.string().min(1).max(80),
  })
  .strict();
const safetyIdentifier = `trailie_${createHmac(
  "sha256",
  process.env.OPENAI_SAFETY_HMAC_SECRET ??
    "trailie-openai-smoke-test-only-secret",
)
  .update("openai-smoke-test")
  .digest("hex")}`;

try {
  const response = await new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }).responses.parse({
    model,
    instructions:
      "Return a short confirmation that the structured response works.",
    input: "Confirm with five words or fewer.",
    reasoning: { effort: "low" },
    text: { format: zodTextFormat(schema, "trailie_smoke") },
    max_output_tokens: 80,
    safety_identifier: safetyIdentifier,
    store: false,
  });
  if (!response.output_parsed)
    throw new Error("No parsed response was returned.");
  schema.parse(response.output_parsed);
  console.log(`OpenAI smoke test: passed using ${model}.`);
} catch (error) {
  const status =
    error instanceof OpenAI.APIError ? ` (HTTP ${error.status})` : "";
  console.error(
    `OpenAI smoke test: failed${status}. Verify model access and server configuration.`,
  );
  process.exit(1);
}
