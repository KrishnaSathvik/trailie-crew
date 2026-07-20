import { describe, expect, it, vi } from "vitest";

import { consumeFocusedStream } from "./focused-stream";

describe("focused stream completion contract", () => {
  it("waits for and consumes completion rejection when streaming fails", async () => {
    const providerError = Object.assign(new Error("provider unavailable"), {
      code: "openai_unavailable",
    });
    const completed = Promise.reject(providerError);
    const stream = {
      textDeltas: (async function* () {
        yield "partial text";
        throw providerError;
      })(),
      completed,
    };

    await expect(consumeFocusedStream(stream)).rejects.toBe(providerError);
  });

  it("prefers an authoritative completion error over generic stream termination", async () => {
    const providerError = Object.assign(new Error("rate limited"), {
      code: "openai_rate_limited",
      statusCode: 429,
    });
    await expect(
      consumeFocusedStream({
        textDeltas: (async function* () {
          yield "partial text";
          throw new Error("stream terminated");
        })(),
        completed: Promise.reject(providerError),
      }),
    ).rejects.toBe(providerError);
  });

  it("observes model deltas before completion while retaining the full buffer", async () => {
    const result = {
      answer: {
        schemaVersion: "1" as const,
        intent: "direct_question" as const,
        message: "Complete.",
        blocks: [{ type: "markdown" as const, markdown: "Complete." }],
        warnings: [],
        sources: [],
        assumptions: [],
        unresolvedQuestions: [],
        suggestedActions: [],
        persistenceDirective: "none" as const,
        approvalDirective: "not_required" as const,
        freshness: "not_applicable" as const,
        privacyLevel: "room" as const,
      },
      responseId: "resp_1",
      requestId: "req_1",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        totalTokens: 15,
      },
    };
    const onTextDelta = vi.fn();
    await expect(
      consumeFocusedStream(
        {
          textDeltas: (async function* () {
            yield "Com";
            yield "plete.";
          })(),
          completed: Promise.resolve(result),
        },
        { onTextDelta },
      ),
    ).resolves.toEqual({ bufferedDeltas: ["Com", "plete."], result });
    expect(onTextDelta.mock.calls).toEqual([["Com"], ["plete."]]);
  });
});
