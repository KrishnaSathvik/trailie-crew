import { afterEach, describe, expect, it, vi } from "vitest";

import { logOperation } from "./logger";

describe("structured operational logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits the safe contract as one JSON record", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logOperation("recovery.completed", {
      correlationId: "correlation-1",
      status: "ok",
      errorCode: null,
      latencyMs: 42,
      model: "gpt-5.6-sol",
      counts: { memory: 1 },
    });
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toEqual({
      timestamp: expect.any(String),
      classification: "info",
      event: "recovery.completed",
      correlationId: "correlation-1",
      status: "ok",
      errorCode: null,
      latencyMs: 42,
      model: "gpt-5.6-sol",
      counts: { memory: 1 },
    });
  });

  it("classifies synthetic failures as alert-worthy", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logOperation("recovery.failed", {
      correlationId: "synthetic",
      errorCode: "synthetic_failure",
    });
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
      classification: "alert",
      errorCode: "synthetic_failure",
    });
  });

  it("recursively redacts forbidden fields and never serializes their values", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logOperation("ai.failed", {
      correlationId: "correlation-2",
      status: "error",
      prompt: "private prompt",
      body: "private message",
      shareToken: "private share token",
      authorization: "Bearer secret",
      nested: { cookie: "private cookie", safeCode: "provider_timeout" },
    } as never);
    const serialized = String(info.mock.calls[0]?.[0]);
    expect(serialized).not.toContain("private prompt");
    expect(serialized).not.toContain("private message");
    expect(serialized).not.toContain("private share token");
    expect(serialized).not.toContain("Bearer secret");
    expect(serialized).not.toContain("private cookie");
    expect(JSON.parse(serialized)).toMatchObject({
      prompt: "[REDACTED]",
      body: "[REDACTED]",
      nested: { cookie: "[REDACTED]", safeCode: "provider_timeout" },
    });
  });
});
