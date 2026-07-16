import { describe, expect, it } from "vitest";

import { createFakeProviderId } from "./fake-provider-id";

describe("fake provider identifiers", () => {
  it("are deterministic, bounded, and unique per operation and stage", () => {
    const first = createFakeProviderId("planning_response", "request:one");

    expect(first).toBe(
      createFakeProviderId("planning_response", "request:one"),
    );
    expect(first).not.toBe(
      createFakeProviderId("planning_response", "request:two"),
    );
    expect(first).not.toBe(
      createFakeProviderId("planning_request", "request:one"),
    );
    expect(first.length).toBeLessThanOrEqual(200);
    expect(first).toMatch(/^fake_[a-z_]+_[a-f0-9]{32}$/);
  });
});
