import { describe, expect, it } from "vitest";
import {
  buildPlanningSummaryRequest,
  mapPlanningProviderError,
} from "./openai-provider";

describe("planning OpenAI request", () => {
  it("uses a bounded low-latency structured request without tools or storage", () => {
    const request = buildPlanningSummaryRequest({
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "bounded",
    });
    expect(request.model).toBe("gpt-5.6-sol");
    expect(request.reasoning).toEqual({ effort: "low" });
    expect(request.store).toBe(false);
    expect(request.max_output_tokens).toBe(1800);
    expect(request).not.toHaveProperty("tools");
    expect(request.text.format.type).toBe("json_schema");
    expect(JSON.stringify(request.text.format.schema)).not.toContain(
      '"format"',
    );
  });

  it("classifies an AbortSignal deadline as a retryable timeout", () => {
    expect(
      mapPlanningProviderError(new DOMException("Timed out", "TimeoutError")),
    ).toMatchObject({ code: "model_timeout", retryable: true });
  });
});
