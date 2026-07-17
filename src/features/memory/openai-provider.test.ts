import { describe, expect, it } from "vitest";

import OpenAI from "openai";

import {
  buildMemoryExtractionRequest,
  mapMemoryProviderError,
} from "./openai-provider";

describe("OpenAI memory extraction request", () => {
  it("uses the verified lightweight model and privacy/cost controls", () => {
    const request = buildMemoryExtractionRequest({
      model: "gpt-5.6-luna",
      safetyIdentifier: "trailie_safe",
      context: "<SOURCE_MESSAGE>I prefer hiking</SOURCE_MESSAGE>",
    });
    expect(request).toMatchObject({
      model: "gpt-5.6-luna",
      reasoning: { effort: "none" },
      store: false,
      safety_identifier: "trailie_safe",
      max_output_tokens: 800,
    });
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("background");
    expect(request.text?.format).toMatchObject({
      type: "json_schema",
      strict: true,
    });
  });

  it("classifies HTTP 503 as unavailable and preserves safe metadata", () => {
    const error = new OpenAI.InternalServerError(
      503,
      { error: { message: "private provider body" } },
      "unavailable",
      new Headers({
        "x-request-id": "req_memory_503",
        "retry-after": "1",
      }),
    );
    expect(mapMemoryProviderError(error)).toMatchObject({
      code: "model_unavailable",
      retryable: true,
      statusCode: 503,
      requestId: "req_memory_503",
      retryAfterMs: 1_000,
    });
  });

  it("does not retry malformed provider output", () => {
    expect(
      mapMemoryProviderError(
        new OpenAI.BadRequestError(
          400,
          { error: { message: "bad output" } },
          "bad output",
          new Headers(),
        ),
      ),
    ).toMatchObject({
      code: "invalid_extraction_response",
      retryable: false,
    });
  });
});
