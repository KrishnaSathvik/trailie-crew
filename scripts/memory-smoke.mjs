import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required for the opt-in memory smoke test.");
  process.exit(2);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 20_000,
  maxRetries: 0,
});

const response = await client.responses.create({
  model: process.env.OPENAI_MEMORY_MODEL ?? "gpt-5.6-luna",
  instructions:
    "Classify the source message. Return the strict schema only and no reasoning.",
  input: '<SOURCE_MESSAGE>{"body":"lol"}</SOURCE_MESSAGE>',
  reasoning: { effort: "none" },
  text: {
    format: {
      type: "json_schema",
      name: "trailie_memory_smoke",
      strict: true,
      schema: {
        type: "object",
        properties: {
          facts: { type: "array", maxItems: 0, items: { type: "object" } },
          supersessions: {
            type: "array",
            maxItems: 0,
            items: { type: "object" },
          },
        },
        required: ["facts", "supersessions"],
        additionalProperties: false,
      },
    },
  },
  max_output_tokens: 200,
  safety_identifier: "trailie_memory_smoke",
  store: false,
});

if (!response.output_text) throw new Error("Memory smoke returned no output.");
console.log(`Memory smoke succeeded with ${response.model}.`);
