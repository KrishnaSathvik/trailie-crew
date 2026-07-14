import { describe, expect, it } from "vitest";
import { buildPlanningSummaryRequest } from "./openai-provider";

describe("planning OpenAI request", () => {
  it("uses verified Sol structured output without tools or storage", () => {
    const request = buildPlanningSummaryRequest({
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "bounded",
    });
    expect(request.model).toBe("gpt-5.6-sol");
    expect(request.reasoning).toEqual({ effort: "high" });
    expect(request.store).toBe(false);
    expect(request.max_output_tokens).toBe(3000);
    expect(request).not.toHaveProperty("tools");
    expect(request.text.format.type).toBe("json_schema");
  });
});
