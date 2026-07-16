import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

import OpenAI from "openai";

import {
  buildProviderAcceptanceReport,
  providerAcceptanceCases,
} from "../src/server/acceptance/provider-reliability.ts";

if (!process.env.OPENAI_API_KEY)
  throw new Error("OPENAI_API_KEY is required for provider acceptance.");

const models = {
  focused_answer: process.env.OPENAI_MODEL_CONVERSATION ?? "gpt-5.6-terra",
  memory_extraction: process.env.OPENAI_MEMORY_MODEL ?? "gpt-5.6-luna",
  planning_summary: process.env.OPENAI_PLANNING_MODEL ?? "gpt-5.6-sol",
  itinerary_generation: process.env.OPENAI_ITINERARY_MODEL ?? "gpt-5.6-sol",
  itinerary_repair: process.env.OPENAI_ITINERARY_MODEL ?? "gpt-5.6-sol",
  revision_analysis: process.env.OPENAI_MODEL_CONVERSATION ?? "gpt-5.6-terra",
  revision_candidate: process.env.OPENAI_MODEL_FLAGSHIP ?? "gpt-5.6-sol",
};

const timeouts = {
  focused_answer: 30_000,
  memory_extraction: 20_000,
  planning_summary: 90_000,
  itinerary_generation: 180_000,
  itinerary_repair: 120_000,
  revision_analysis: 60_000,
  revision_candidate: 180_000,
};

const safetyIdentifier = `trailie_${createHmac(
  "sha256",
  process.env.OPENAI_SAFETY_HMAC_SECRET ??
    "trailie-provider-acceptance-isolated-secret",
)
  .update("phase-5c-provider-acceptance")
  .digest("hex")
  .slice(0, 56)}`;

const objectSchema = (
  name,
  properties,
  required = Object.keys(properties),
) => ({
  type: "json_schema",
  name,
  strict: true,
  schema: {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  },
});

function contract(workflow, index) {
  if (workflow === "focused_answer")
    return {
      instructions:
        "Return one concise, non-booking travel-safety answer using the strict schema.",
      input:
        "What should a crew verify before a late-summer Yosemite day trip?",
      format: objectSchema("focused_acceptance", {
        responseType: { type: "string", const: "plain_answer" },
        answer: { type: "string", minLength: 1, maxLength: 300 },
      }),
      maxOutputTokens: 180,
      reasoning: "low",
    };
  if (workflow === "memory_extraction") {
    const correction = index === 1;
    return {
      instructions:
        "Extract only explicit durable trip memory. Return the strict schema and no chat response.",
      input: correction
        ? "Correction: kayaking replaces hiking as my preferred activity."
        : index === 0
          ? "I prefer hiking and require peanut-free meals."
          : "Thanks, that works for me.",
      format: objectSchema("memory_acceptance", {
        visibleChatOutput: { type: "boolean", const: false },
        factCount: { type: "integer", minimum: 0, maximum: 3 },
        supersedesPriorFact: { type: "boolean", const: correction },
      }),
      maxOutputTokens: 160,
      reasoning: "low",
    };
  }
  if (workflow === "planning_summary")
    return {
      instructions:
        'Create a review summary only with title "Before I build the trip". Do not create an itinerary.',
      input:
        "Destination Yosemite; dates August 10–13, 2026; two travelers; moderate budget; peanut-free meals; accessible alternatives.",
      format: objectSchema("planning_acceptance", {
        title: { type: "string", const: "Before I build the trip" },
        readiness: {
          type: "string",
          enum: ["ready_for_review", "needs_information", "blocked"],
        },
        createsItinerary: { type: "boolean", const: false },
      }),
      maxOutputTokens: 220,
      reasoning: "medium",
    };
  if (workflow === "itinerary_generation")
    return {
      instructions:
        "Create an itinerary draft from the approved summary. Do not claim validation, publication, booking, or live availability.",
      input:
        "Approved: Yosemite, August 10–13 2026, two travelers, moderate budget, accessible alternatives, peanut-free meals.",
      format: objectSchema("itinerary_acceptance", {
        schemaVersion: { type: "string", const: "1" },
        title: { type: "string", minLength: 1, maxLength: 120 },
        dayCount: { type: "integer", const: 4 },
        validationClaimed: { type: "boolean", const: false },
        published: { type: "boolean", const: false },
      }),
      maxOutputTokens: 220,
      reasoning: "medium",
    };
  if (workflow === "itinerary_repair")
    return {
      instructions:
        "Repair the forced overlap only. Return a complete corrected draft without claiming validation or publication.",
      input:
        "Draft has lunch 12:00–13:00 and transit 12:30–13:15. Move transit after lunch and preserve all other items.",
      format: objectSchema("itinerary_repair_acceptance", {
        repaired: { type: "boolean", const: true },
        overlapRemaining: { type: "boolean", const: false },
        repairCount: { type: "integer", const: 1 },
        published: { type: "boolean", const: false },
      }),
      maxOutputTokens: 180,
      reasoning: "medium",
    };
  if (workflow === "revision_analysis")
    return {
      instructions:
        "Analyze only the explicit plan change. Do not mutate, validate, or publish a plan.",
      input:
        "Base Version 1 has item:sunset at 17:00. Request: move item:sunset to 18:00 without changing another day.",
      format: objectSchema("revision_analysis_acceptance", {
        targetItemId: { type: "string", const: "item:sunset" },
        mutatesBase: { type: "boolean", const: false },
        staleBaseAccepted: { type: "boolean", const: false },
      }),
      maxOutputTokens: 180,
      reasoning: "medium",
    };
  return {
    instructions:
      "Generate a complete Version 2 candidate applying only the approved change. Do not claim publication.",
    input:
      "Approved change on Version 1: move item:sunset from 17:00 to 18:00 and preserve stable item ID.",
    format: objectSchema("revision_candidate_acceptance", {
      version: { type: "integer", const: 2 },
      targetItemId: { type: "string", const: "item:sunset" },
      startTime: { type: "string", const: "18:00" },
      published: { type: "boolean", const: false },
    }),
    maxOutputTokens: 180,
    reasoning: "medium",
  };
}

function errorCode(error) {
  if (error instanceof OpenAI.RateLimitError) return "model_rate_limited";
  if (error instanceof OpenAI.APIConnectionTimeoutError) return "model_timeout";
  if (
    error instanceof OpenAI.APIConnectionError ||
    (error instanceof OpenAI.APIError && (error.status ?? 0) >= 500)
  )
    return "model_unavailable";
  if (error instanceof SyntaxError) return "invalid_model_output";
  return "provider_acceptance_failed";
}

const retryable = (error) =>
  ["model_rate_limited", "model_timeout", "model_unavailable"].includes(
    errorCode(error),
  );

const runs = [];
for (const definition of providerAcceptanceCases) {
  for (let index = 0; index < definition.runs; index += 1) {
    const workflow = definition.workflow;
    const model = models[workflow];
    const details = contract(workflow, index);
    const startedAt = performance.now();
    let providerDurationMs = 0;
    let retryCount = 0;
    let requestId = null;
    try {
      let response;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const providerStartedAt = performance.now();
        try {
          response = await new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: timeouts[workflow],
            maxRetries: 0,
          }).responses.create({
            model,
            instructions: details.instructions,
            input: details.input,
            reasoning: { effort: details.reasoning },
            text: { format: details.format },
            max_output_tokens: details.maxOutputTokens,
            safety_identifier: safetyIdentifier,
            store: false,
          });
          providerDurationMs += Math.round(
            performance.now() - providerStartedAt,
          );
          break;
        } catch (error) {
          providerDurationMs += Math.round(
            performance.now() - providerStartedAt,
          );
          requestId = error?.request_id ?? null;
          if (attempt === 2 || !retryable(error)) throw error;
          retryCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
      if (!response?.output_text) throw new SyntaxError("missing_output");
      JSON.parse(response.output_text);
      runs.push({
        workflow,
        model: response.model ?? model,
        requestId: response._request_id ?? requestId,
        providerStatus: response.status ?? "completed",
        applicationStatus: "completed",
        providerDurationMs,
        totalDurationMs: Math.round(performance.now() - startedAt),
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
        retryCount,
        repairCount: workflow === "itinerary_repair" ? 1 : 0,
        finalErrorCode: null,
        recoveryNeeded: false,
      });
    } catch (error) {
      runs.push({
        workflow,
        model,
        requestId,
        providerStatus:
          error instanceof OpenAI.APIError
            ? `http_${error.status ?? "unknown"}`
            : "failed",
        applicationStatus: "failed",
        providerDurationMs,
        totalDurationMs: Math.round(performance.now() - startedAt),
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        retryCount,
        repairCount: workflow === "itinerary_repair" ? 1 : 0,
        finalErrorCode: errorCode(error),
        recoveryNeeded: retryable(error),
      });
    }
  }
}

const report = {
  ...buildProviderAcceptanceReport(runs),
  surface: "openai_provider_contract",
  generatedAt: new Date().toISOString(),
};
const outputPath =
  process.env.PROVIDER_ACCEPTANCE_OUTPUT ??
  "output/phase-5c/provider-reliability.json";
await mkdir(new URL("../output/phase-5c/", import.meta.url), {
  recursive: true,
});
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    status: runs.every((run) => run.applicationStatus === "completed")
      ? "pass"
      : "fail",
    completedRunCount: runs.length,
    expectedRunCount: report.expectedRunCount,
    failures: runs.filter((run) => run.applicationStatus !== "completed")
      .length,
    outputPath,
  }),
);
if (runs.some((run) => run.applicationStatus !== "completed")) process.exit(1);
