import { describe, expect, it } from "vitest";

import {
  generateShareToken,
  hashShareToken,
  shareTokenHashesEqual,
} from "./token";

describe("share token utilities", () => {
  it("generates URL-safe tokens with at least 256 bits of entropy", () => {
    const tokens = Array.from({ length: 64 }, () => generateShareToken());
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
    }
  });

  it("hashes deterministically without retaining the raw token", () => {
    const token = generateShareToken();
    const hash = hashShareToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(token)).toBe(hash);
    expect(hashShareToken(generateShareToken())).not.toBe(hash);
    expect(hash).not.toContain(token);
  });

  it("rejects malformed or low-entropy token input", () => {
    expect(() => hashShareToken("short")).toThrow("invalid_share_token");
    expect(() => hashShareToken("+".repeat(43))).toThrow("invalid_share_token");
  });

  it("compares only well-formed hashes with the timing-safe helper", () => {
    const first = hashShareToken(generateShareToken());
    const second = hashShareToken(generateShareToken());
    expect(shareTokenHashesEqual(first, first)).toBe(true);
    expect(shareTokenHashesEqual(first, second)).toBe(false);
    expect(shareTokenHashesEqual(first, "not-a-hash")).toBe(false);
  });
});
