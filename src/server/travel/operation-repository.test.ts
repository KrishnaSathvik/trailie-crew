import { describe, expect, it, vi } from "vitest";

import { createTravelProviderOperationController } from "./operation-repository";

describe("travel provider operation controller", () => {
  it("claims provider budget before work and records only safe metadata", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          allowed: true,
          reason: null,
          requestId: "6a000000-0000-4000-8000-000000000001",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: "6a000000-0000-4000-8000-000000000001",
        error: null,
      });
    const controller = createTravelProviderOperationController({
      client: { rpc },
      roomId: "6a000000-0000-4000-8000-000000000010",
      workflowKey: "itinerary:plan-1",
      environment: "hosted-acceptance",
      roomDailyLimit: 200,
      globalDailyLimit: 5000,
    });
    const event = {
      provider: "nps",
      capability: "park_alerts" as const,
      requestKey: `travel:1:hosted-acceptance:nps:park_alerts:${"a".repeat(64)}`,
      cacheStatus: "miss" as const,
      status: "running" as const,
      durationMs: 0,
      errorClass: null,
    };

    await expect(controller.authorize(event)).resolves.toBe(true);
    await controller.record({
      ...event,
      status: "succeeded",
      durationMs: 123,
    });

    expect(JSON.stringify(rpc.mock.calls)).not.toMatch(
      /api.?key|access.?token|authorization/i,
    );
    expect(rpc.mock.calls[1][1]).toMatchObject({
      target_provider: "nps",
      target_capability: "park_alerts",
      target_status: "succeeded",
      target_duration_ms: 123,
    });
  });
});
