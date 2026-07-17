import { describe, expect, it } from "vitest";
import OpenAI from "openai";

describe("focused-answer OpenAI boundary", () => {
  it("classifies a provider deadline as timeout instead of unavailable", async () => {
    const providerModule = (await import("./openai-provider")) as Record<
      string,
      unknown
    >;
    const mapError = providerModule.mapFocusedProviderError as (
      error: unknown,
    ) => { code: string; retryable: boolean };
    expect(mapError).toBeTypeOf("function");
    expect(
      mapError(new DOMException("The operation timed out", "TimeoutError")),
    ).toMatchObject({ code: "openai_timeout", retryable: true });
  });

  it("classifies HTTP 503 as model unavailable with safe metadata", async () => {
    const { mapFocusedProviderError } = await import("./openai-provider");
    const failure = mapFocusedProviderError(
      new OpenAI.InternalServerError(
        503,
        { error: { message: "private provider body" } },
        "unavailable",
        new Headers({
          "x-request-id": "req_focused_503",
          "retry-after": "1",
        }),
      ),
    );
    expect(failure).toMatchObject({
      code: "openai_unavailable",
      retryable: true,
      statusCode: 503,
      requestId: "req_focused_503",
      retryAfterMs: 1_000,
    });
  });

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
