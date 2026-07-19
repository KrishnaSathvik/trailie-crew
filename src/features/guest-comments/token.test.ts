import { describe, expect, it } from "vitest";

import { generateGuestToken, hashGuestToken } from "./token";

describe("guest credentials", () => {
  it("generates 256-bit URL-safe invite and session credentials", () => {
    const first = generateGuestToken();
    const second = generateGuestToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("hashes credentials with deterministic SHA-256 without retaining raw values", () => {
    const raw = "A".repeat(43);
    const digest = hashGuestToken(raw);

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(hashGuestToken(raw)).toBe(digest);
    expect(digest).not.toContain(raw);
    expect(() => hashGuestToken("not a credential")).toThrow();
  });
});
