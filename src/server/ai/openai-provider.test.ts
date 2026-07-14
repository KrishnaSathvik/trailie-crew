import { describe, expect, it } from "vitest";

describe("focused-answer OpenAI boundary", () => {
  it("builds a strict model schema with nullable optional app fields", async () => {
    const providerModule = (await import("./openai-provider")) as Record<
      string,
      unknown
    >;
    const buildRequest = providerModule.buildFocusedAnswerRequest;

    expect(buildRequest).toBeTypeOf("function");
    const request = (
      buildRequest as (input: {
        model: string;
        safetyIdentifier: string;
        context: string;
        request: string;
      }) => {
        text: {
          format: {
            schema: {
              required: string[];
              properties: Record<string, unknown>;
            };
          };
        };
      }
    )({
      model: "gpt-5.6-terra",
      safetyIdentifier: "trailie_safe",
      context: "bounded context",
      request: "What should we pack?",
    });

    expect(request.text.format.schema.required).toEqual([
      "responseType",
      "body",
      "title",
      "comparisonItems",
      "followUpQuestion",
    ]);
    expect(request.text.format.schema.properties).toHaveProperty("title");
  });

  it("normalizes model nulls back to omitted app fields", async () => {
    const providerModule = (await import("./openai-provider")) as Record<
      string,
      unknown
    >;
    const normalize = providerModule.normalizeFocusedAnswerModelOutput;

    expect(normalize).toBeTypeOf("function");
    expect(
      (
        normalize as (value: unknown) => {
          responseType: string;
          body: string;
        }
      )({
        responseType: "plain_answer",
        body: "Pack layers.",
        title: null,
        comparisonItems: null,
        followUpQuestion: null,
      }),
    ).toEqual({ responseType: "plain_answer", body: "Pack layers." });
  });
});
