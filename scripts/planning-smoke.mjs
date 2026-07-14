import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.error(
    "OPENAI_API_KEY is required for the opt-in planning smoke test.",
  );
  process.exit(2);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 45_000,
  maxRetries: 0,
});

const response = await client.responses.create({
  model: process.env.OPENAI_PLANNING_MODEL ?? "gpt-5.6-sol",
  instructions:
    'Produce a crew-review planning summary only. Do not create an itinerary. Use the fixed title "Before I build the trip".',
  input:
    '<TRIP_CONTEXT>{"participants":["Maya"],"confirmedDestination":"Yosemite","dateWindow":"September 12–16"}</TRIP_CONTEXT>',
  reasoning: { effort: "high" },
  text: {
    format: {
      type: "json_schema",
      name: "trailie_planning_smoke",
      strict: true,
      schema: {
        type: "object",
        properties: {
          title: { type: "string", const: "Before I build the trip" },
          createsItinerary: { type: "boolean", const: false },
        },
        required: ["title", "createsItinerary"],
        additionalProperties: false,
      },
    },
  },
  max_output_tokens: 200,
  safety_identifier: "trailie_planning_smoke",
  store: false,
});

if (!response.output_text)
  throw new Error("Planning smoke returned no output.");
console.log(`Planning smoke succeeded with ${response.model}.`);
