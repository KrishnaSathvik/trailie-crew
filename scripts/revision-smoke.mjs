import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.log("Revision smoke test: skipped (OPENAI_API_KEY is not set).");
  process.exit(0);
}
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 90_000,
  maxRetries: 0,
});
const base = {
  version: 1,
  destination: "Yosemite",
  date: "2026-09-12",
  items: [
    { id: "item:walk", start: "10:00", end: "12:00", title: "Valley walk" },
  ],
};
const analysis = await client.responses.create({
  model: "gpt-5.6-terra",
  instructions:
    "Analyze only the explicit itinerary change. Do not mutate the plan or claim approval. Return the strict schema.",
  input: `<BASE_PLAN>${JSON.stringify(base)}</BASE_PLAN><REQUEST>Move item:walk to 13:00.</REQUEST>`,
  reasoning: { effort: "medium" },
  store: false,
  max_output_tokens: 500,
  safety_identifier: "trailie_revision_smoke_analysis",
  text: {
    format: {
      type: "json_schema",
      name: "trailie_revision_analysis_smoke",
      strict: true,
      schema: {
        type: "object",
        properties: {
          targetItemId: { type: "string", const: "item:walk" },
          materiality: {
            type: "string",
            enum: ["minor", "material", "critical"],
          },
          mutatesBase: { type: "boolean", const: false },
        },
        required: ["targetItemId", "materiality", "mutatesBase"],
        additionalProperties: false,
      },
    },
  },
});
if (!analysis.output_text)
  throw new Error("Revision analysis smoke returned no structured output.");
const candidate = await client.responses.create({
  model: "gpt-5.6-sol",
  instructions:
    "Return a complete candidate version. Apply only the approved change, preserve stable IDs, and do not claim validation or publication.",
  input: `<BASE_PLAN>${JSON.stringify(base)}</BASE_PLAN><APPROVED_CHANGE>Move item:walk to 13:00.</APPROVED_CHANGE>`,
  reasoning: { effort: "high" },
  store: false,
  max_output_tokens: 600,
  safety_identifier: "trailie_revision_smoke_candidate",
  text: {
    format: {
      type: "json_schema",
      name: "trailie_revision_candidate_smoke",
      strict: true,
      schema: {
        type: "object",
        properties: {
          version: { type: "integer", const: 2 },
          targetItemId: { type: "string", const: "item:walk" },
          start: { type: "string", const: "13:00" },
          published: { type: "boolean", const: false },
        },
        required: ["version", "targetItemId", "start", "published"],
        additionalProperties: false,
      },
    },
  },
});
if (!candidate.output_text)
  throw new Error("Revision candidate smoke returned no structured output.");
console.log(
  `Revision smoke test: passed using ${analysis.model} and ${candidate.model}.`,
);
