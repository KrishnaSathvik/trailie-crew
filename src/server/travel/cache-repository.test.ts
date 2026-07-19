import { describe, expect, it, vi } from "vitest";
import { createFakeTravelProviderAdapter } from "@trailie/travel-tools";

import { createTravelProviderCacheRepository } from "./cache-repository";

describe("travel cache repository", () => {
  it("reads and writes only normalized bounded cache responses", async () => {
    const response = await createFakeTravelProviderAdapter({
      scenario: "baseline",
      now: "2026-07-17T20:00:00.000Z",
    }).geocode({ query: "Yosemite", locale: "en-US" });
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: "6a000000-0000-4000-8000-000000000001",
        error: null,
      });
    const repository = createTravelProviderCacheRepository({ rpc });
    const key = `travel:2:test:mapbox:geocode:${"a".repeat(64)}`;

    await expect(repository.get(key)).resolves.toBeNull();
    await repository.put(key, {
      response,
      expiresAt: "2026-07-17T21:00:00.000Z",
      staleUntil: null,
      negative: false,
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "get_travel_cache_response", {
      target_environment: "test",
      target_provider: "mapbox",
      target_capability: "geocode",
      target_cache_key: key,
    });
    expect(rpc.mock.calls[1][1]).toMatchObject({
      target_response: response,
      target_negative_result: false,
    });
  });
});
