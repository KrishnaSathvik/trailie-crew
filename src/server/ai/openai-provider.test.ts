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

  it("classifies a caller-aborted request as cancellation instead of timeout", async () => {
    const { mapFocusedProviderError } = await import("./openai-provider");
    const abortController = new AbortController();
    abortController.abort("user_stopped");
    expect(
      mapFocusedProviderError(
        new DOMException("The operation was aborted", "AbortError"),
        abortController.signal,
      ),
    ).toMatchObject({
      code: "invocation_cancelled",
      retryable: false,
    });
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

  it("builds the strict TrailieResponseV1 draft schema", async () => {
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
        intent: string;
      }) => {
        store: boolean;
        input: string;
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
      intent: "direct_question",
    });

    expect(request.store).toBe(false);
    expect(request.input).toContain("<DETECTED_INTENT>direct_question");
    expect(request.text.format.schema.required).toEqual(
      expect.arrayContaining([
        "schemaVersion",
        "intent",
        "message",
        "blocks",
        "sources",
        "persistenceDirective",
        "approvalDirective",
      ]),
    );
  });

  it("normalizes a schema-valid response draft", async () => {
    const providerModule = (await import("./openai-provider")) as Record<
      string,
      unknown
    >;
    const normalize = providerModule.normalizeFocusedAnswerModelOutput;

    expect(normalize).toBeTypeOf("function");
    expect(
      (
        normalize as (value: unknown) => {
          intent: string;
          message: string;
        }
      )({
        schemaVersion: "1",
        intent: "direct_question",
        message: "Pack layers.",
        blocks: [{ type: "markdown", markdown: "Pack layers." }],
        warnings: [],
        sources: [],
        assumptions: [],
        unresolvedQuestions: [],
        suggestedActions: [],
        persistenceDirective: "none",
        approvalDirective: "not_required",
        freshness: "not_applicable",
        privacyLevel: "room",
      }),
    ).toMatchObject({
      schemaVersion: "1",
      intent: "direct_question",
      message: "Pack layers.",
    });
  });
});
