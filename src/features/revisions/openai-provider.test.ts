import { describe, expect, it } from "vitest";
import {
  buildChangeAnalysisRequest,
  buildItineraryRevisionRequest,
} from "./openai-provider";

describe("OpenAI revision requests", () => {
  it("uses strict Terra structured output without storage or tools", () => {
    const request = buildChangeAnalysisRequest({
      model: "gpt-5.6-terra",
      safetyIdentifier: "safe",
      context: "bounded",
    });
    expect(request).toMatchObject({
      model: "gpt-5.6-terra",
      store: false,
      reasoning: { effort: "medium" },
      max_output_tokens: 6000,
    });
    expect(request).not.toHaveProperty("tools");
    expect(request.instructions).toContain("trailie-change-analysis-v1");
  });
  it("uses exact Sol and high reasoning for a complete candidate", () => {
    const request = buildItineraryRevisionRequest({
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "bounded",
      repair: false,
    });
    expect(request).toMatchObject({
      model: "gpt-5.6-sol",
      store: false,
      reasoning: { effort: "high" },
      max_output_tokens: 12000,
    });
    expect(request.instructions).toContain("complete candidate itinerary");
  });
});
