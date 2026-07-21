import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("public route aliases", () => {
  it("serves the create-trip page at /create", async () => {
    const rewrites = await nextConfig.rewrites?.();

    expect(rewrites).toContainEqual({
      source: "/create",
      destination: "/trips/create",
    });
  });
});
