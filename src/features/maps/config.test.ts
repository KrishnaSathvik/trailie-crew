import { describe, expect, it } from "vitest";
import { parseMapConfiguration } from "./config";

describe("parseMapConfiguration", () => {
  it("supports an explicit disabled map without a token", () => {
    expect(
      parseMapConfiguration({
        MAPBOX_MAPS_ENABLED: "false",
      }),
    ).toEqual({
      enabled: false,
      browserToken: null,
      styleUrl: "mapbox://styles/mapbox/standard",
      unavailableReason: "maps_disabled",
      adapter: "mapbox",
    });
  });

  it("accepts a separate public rendering token and allowlisted style", () => {
    expect(
      parseMapConfiguration({
        MAPBOX_MAPS_ENABLED: "true",
        NEXT_PUBLIC_MAPBOX_MAP_TOKEN: "pk.browser-map-only",
        MAPBOX_ACCESS_TOKEN: "sk.server-provider",
        MAPBOX_STYLE_URL: "mapbox://styles/trailie/editorial",
      }),
    ).toEqual({
      enabled: true,
      browserToken: "pk.browser-map-only",
      styleUrl: "mapbox://styles/trailie/editorial",
      unavailableReason: null,
      adapter: "mapbox",
    });
  });

  it("supports a token-free deterministic local adapter but rejects it in production", () => {
    expect(
      parseMapConfiguration({
        MAPBOX_MAPS_ENABLED: "true",
        MAPBOX_MAP_ADAPTER: "deterministic",
        NODE_ENV: "test",
      }),
    ).toEqual({
      enabled: true,
      browserToken: null,
      styleUrl: "mapbox://styles/mapbox/standard",
      unavailableReason: null,
      adapter: "deterministic",
    });
    expect(() =>
      parseMapConfiguration({
        MAPBOX_MAPS_ENABLED: "true",
        MAPBOX_MAP_ADAPTER: "deterministic",
        VERCEL_ENV: "production",
      }),
    ).toThrow(/deterministic/i);
  });

  it("fails closed when the browser token is missing or reused", () => {
    expect(
      parseMapConfiguration({
        MAPBOX_MAPS_ENABLED: "true",
        MAPBOX_ACCESS_TOKEN: "pk.server-provider",
      }),
    ).toMatchObject({
      enabled: false,
      unavailableReason: "browser_token_missing",
    });
    expect(
      parseMapConfiguration({
        MAPBOX_MAPS_ENABLED: "true",
        NEXT_PUBLIC_MAPBOX_MAP_TOKEN: "pk.same-token",
        MAPBOX_ACCESS_TOKEN: "pk.same-token",
      }),
    ).toMatchObject({
      enabled: false,
      browserToken: null,
      unavailableReason: "server_token_reused",
    });
  });

  it("fails closed when the server token is missing and never exposes it", () => {
    expect(
      parseMapConfiguration({
        MAPBOX_MAPS_ENABLED: "true",
        NEXT_PUBLIC_MAPBOX_MAP_TOKEN: "pk.browser-map-only",
      }),
    ).toMatchObject({
      enabled: false,
      browserToken: null,
      unavailableReason: "server_token_missing",
    });
    const configuration = parseMapConfiguration({
      MAPBOX_MAPS_ENABLED: "true",
      NEXT_PUBLIC_MAPBOX_MAP_TOKEN: "pk.browser-map-only",
      MAPBOX_ACCESS_TOKEN: "sk.server-only-provider-token",
    });
    expect(configuration).toMatchObject({
      enabled: true,
      browserToken: "pk.browser-map-only",
    });
    expect(JSON.stringify(configuration)).not.toContain("sk.");
  });

  it("rejects arbitrary style URLs and secret browser tokens", () => {
    expect(() =>
      parseMapConfiguration({
        MAPBOX_MAPS_ENABLED: "true",
        NEXT_PUBLIC_MAPBOX_MAP_TOKEN: "sk.secret",
      }),
    ).toThrow(/public Mapbox token/i);
    expect(() =>
      parseMapConfiguration({
        MAPBOX_MAPS_ENABLED: "true",
        NEXT_PUBLIC_MAPBOX_MAP_TOKEN: "pk.browser",
        MAPBOX_STYLE_URL: "https://attacker.example/style.json",
      }),
    ).toThrow(/style/i);
  });
});
