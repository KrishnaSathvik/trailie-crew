import { describe, expect, it } from "vitest";

import { createFakeFocusedAnswerProvider } from "./provider";

describe("deterministic fake provider", () => {
  it("streams ordered safe text and returns a validated answer", async () => {
    const stream = await createFakeFocusedAnswerProvider().stream({
      operationKey: "success",
      request: "compare driving and flying",
      context: "context",
      model: "gpt-5.6-terra",
      safetyIdentifier: "trailie_test",
      signal: new AbortController().signal,
    });
    let text = "";
    for await (const delta of stream.textDeltas) text += delta;
    const result = await stream.completed;
    expect(text).toBe(result.answer.body);
    expect(result.answer.responseType).toBe("comparison");
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });

  it("fails deterministically without leaking a raw provider error", async () => {
    const stream = await createFakeFocusedAnswerProvider().stream({
      operationKey: "failure",
      request: "simulate provider failure",
      context: "",
      model: "gpt-5.6-terra",
      safetyIdentifier: "trailie_test",
      signal: new AbortController().signal,
    });
    await expect(async () => {
      for await (const _ of stream.textDeltas) void _;
    }).rejects.toMatchObject({ code: "openai_unavailable" });
  });

  it("fails once and succeeds on a deliberate retry when configured", async () => {
    const provider = createFakeFocusedAnswerProvider({ failOnce: true });
    const input = {
      operationKey: "retryable-operation",
      request: "simulate provider failure",
      context: "",
      model: "gpt-5.6-terra",
      safetyIdentifier: "trailie_test",
      signal: new AbortController().signal,
    };
    const first = await provider.stream(input);
    await expect(async () => {
      for await (const _ of first.textDeltas) void _;
    }).rejects.toMatchObject({ code: "openai_unavailable" });

    const second = await provider.stream(input);
    let body = "";
    for await (const delta of second.textDeltas) body += delta;
    expect(body).toMatch(/focused question/i);
  });
});
