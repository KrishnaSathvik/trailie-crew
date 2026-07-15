import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RecoveryRateLimitedError,
  runDefaultRecovery,
} from "@/server/recovery/drain";
import { GET, POST } from "./route";

vi.mock("@/server/recovery/drain", () => ({
  RecoveryRateLimitedError: class RecoveryRateLimitedError extends Error {},
  runDefaultRecovery: vi.fn(),
}));

const secret = "r".repeat(48);

describe("internal recovery route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RECOVERY_SECRET", secret);
  });

  it("rejects missing and incorrect secrets without running work", async () => {
    const missing = await POST(
      new Request("https://preview.example/api/internal/recovery", {
        method: "POST",
      }),
    );
    const wrong = await POST(
      new Request("https://preview.example/api/internal/recovery", {
        method: "POST",
        headers: { authorization: `Bearer ${"x".repeat(48)}` },
      }),
    );
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(runDefaultRecovery).not.toHaveBeenCalled();
  });

  it("runs bounded recovery and returns only safe counts", async () => {
    vi.mocked(runDefaultRecovery).mockResolvedValue({
      selected: {
        memory: 1,
        planning: 0,
        itinerary: 0,
        revision: 0,
        revisionPublication: 0,
      },
      completed: {
        memory: 1,
        planning: 0,
        itinerary: 0,
        revision: 0,
        revisionPublication: 0,
      },
      failed: {
        memory: 0,
        planning: 0,
        itinerary: 0,
        revision: 0,
        revisionPublication: 0,
      },
      remainingEligible: 0,
    });
    const response = await POST(
      new Request("https://preview.example/api/internal/recovery", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  it("accepts Vercel Cron GET authentication through CRON_SECRET", async () => {
    vi.stubEnv("RECOVERY_SECRET", "");
    vi.stubEnv("CRON_SECRET", secret);
    vi.mocked(runDefaultRecovery).mockResolvedValue({
      selected: {
        memory: 0,
        planning: 0,
        itinerary: 0,
        revision: 0,
        revisionPublication: 0,
      },
      completed: {
        memory: 0,
        planning: 0,
        itinerary: 0,
        revision: 0,
        revisionPublication: 0,
      },
      failed: {
        memory: 0,
        planning: 0,
        itinerary: 0,
        revision: 0,
        revisionPublication: 0,
      },
      remainingEligible: 0,
    });
    const response = await GET(
      new Request("https://production.example/api/internal/recovery", {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("maps internal failures to a safe operational error", async () => {
    vi.mocked(runDefaultRecovery).mockRejectedValue(
      new Error("raw database contents"),
    );
    const response = await POST(
      new Request("https://preview.example/api/internal/recovery", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "error",
      code: "recovery_unavailable",
    });
  });

  it("rate limits a duplicate valid invocation", async () => {
    vi.mocked(runDefaultRecovery).mockRejectedValue(
      new RecoveryRateLimitedError(),
    );
    const response = await POST(
      new Request("https://preview.example/api/internal/recovery", {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      }),
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      status: "error",
      code: "recovery_rate_limited",
    });
  });
});
