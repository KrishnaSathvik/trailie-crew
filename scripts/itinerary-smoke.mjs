import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.log("Itinerary smoke test: skipped (OPENAI_API_KEY is not set).");
  process.exit(0);
}

const model = process.env.OPENAI_ITINERARY_MODEL ?? "gpt-5.6-sol";
const response = await new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 90_000,
  maxRetries: 0,
}).responses.create({
  model,
  instructions:
    "Propose an itinerary draft only. Do not claim validation passed or a reservation exists.",
  input:
    '<APPROVED_SUMMARY>{"destination":"Yosemite","dates":["2026-09-12","2026-09-13"]}</APPROVED_SUMMARY>',
  reasoning: { effort: "high" },
  text: {
    format: {
      type: "json_schema",
      name: "trailie_itinerary_smoke",
      strict: true,
      schema: {
        type: "object",
        properties: {
          schemaVersion: { type: "string", const: "1" },
          title: { type: "string" },
          modelValidated: { type: "boolean", const: false },
        },
        required: ["schemaVersion", "title", "modelValidated"],
        additionalProperties: false,
      },
    },
  },
  max_output_tokens: 300,
  safety_identifier: "trailie_itinerary_smoke",
  store: false,
});

if (!response.output_text)
  throw new Error("Itinerary smoke returned no structured output.");
console.log(`Itinerary smoke test: passed using ${response.model}.`);
