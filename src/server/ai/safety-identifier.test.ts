import { describe, expect, it } from "vitest";

import { createSafetyIdentifier } from "./safety-identifier";

describe("privacy-preserving safety identifiers", () => {
  it("is stable, scoped, and does not contain the auth user id", () => {
    const id = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
    const first = createSafetyIdentifier(
      id,
      "a-secret-at-least-32-characters-long",
    );
    expect(first).toBe(
      createSafetyIdentifier(id, "a-secret-at-least-32-characters-long"),
    );
    expect(first).toMatch(/^trailie_[a-f0-9]{64}$/);
    expect(first).not.toContain(id);
  });

  it("rejects weak secrets", () => {
    expect(() => createSafetyIdentifier("user", "short")).toThrow();
  });
});
