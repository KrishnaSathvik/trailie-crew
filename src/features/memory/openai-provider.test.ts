import { describe, expect, it } from "vitest";

import { buildMemoryExtractionRequest } from "./openai-provider";

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
});
