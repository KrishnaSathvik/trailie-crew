import { describe, expect, it, vi } from "vitest";

import { createFakeTravelProviderAdapter } from "./adapters/fake";
import { createCachedTravelProviderAdapter } from "./cached-adapter";

describe("cached TravelProviderAdapter", () => {
  it("deduplicates calls and marks a fresh cache hit without changing verification", async () => {
    const source = createFakeTravelProviderAdapter({
      scenario: "baseline",
      now: "2026-07-17T20:00:00.000Z",
    });
    const geocode = vi.spyOn(source, "geocode");
    const entries = new Map();
    const cache = {
      get: vi.fn(async (key) => entries.get(key) ?? null),
      put: vi.fn(async (key, value) => {
        entries.set(key, value);
      }),
    };
    const adapter = createCachedTravelProviderAdapter({
      adapter: source,
      cache,
      environment: "test",
      now: () => "2026-07-17T20:00:00.000Z",
    });

    await adapter.geocode({ query: "Yosemite", locale: "en-US" });
    const cached = await adapter.geocode({
      query: "Yosemite",
      locale: "en-US",
    });

    expect(geocode).toHaveBeenCalledOnce();
    expect(cached.evidence[0]).toMatchObject({
      cacheStatus: "hit",
      freshnessState: "cached_fresh",
      verificationState: "verified",
    });
  });

  it("bypasses cache deterministically for acceptance", async () => {
    const source = createFakeTravelProviderAdapter({ scenario: "baseline" });
    const geocode = vi.spyOn(source, "geocode");
    const cache = { get: vi.fn(), put: vi.fn() };
    const adapter = createCachedTravelProviderAdapter({
      adapter: source,
      cache,
      environment: "test",
      bypass: true,
    });

    await adapter.geocode({ query: "Yosemite", locale: "en-US" });
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(geocode).toHaveBeenCalledOnce();
  });

  it("enforces a provider budget before a cache-miss network call", async () => {
    const source = createFakeTravelProviderAdapter({ scenario: "baseline" });
    const geocode = vi.spyOn(source, "geocode");
    const adapter = createCachedTravelProviderAdapter({
      adapter: source,
      cache: { get: async () => null, put: async () => undefined },
      environment: "test",
      authorizeRequest: vi.fn(async () => false),
    });

    const response = await adapter.geocode({
      query: "Yosemite",
      locale: "en-US",
    });
    expect(geocode).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      state: "unavailable",
      evidence: [
        {
          verificationState: "failed",
          errorState: { code: "provider_limit_reached" },
        },
      ],
    });
  });
});
