import { describe, expect, it } from "vitest";

import { recoveryRequestIsAuthorized } from "./auth";

describe("recovery request authentication", () => {
  const secret = "r".repeat(48);

  it("accepts only an exact bearer secret", () => {
    expect(
      recoveryRequestIsAuthorized(
        new Request("https://preview.example/api/internal/recovery", {
          headers: { authorization: `Bearer ${secret}` },
        }),
        secret,
      ),
    ).toBe(true);
    expect(
      recoveryRequestIsAuthorized(
        new Request("https://preview.example/api/internal/recovery"),
        secret,
      ),
    ).toBe(false);
    expect(
      recoveryRequestIsAuthorized(
        new Request("https://preview.example/api/internal/recovery", {
          headers: { authorization: `Bearer ${"x".repeat(48)}` },
        }),
        secret,
      ),
    ).toBe(false);
  });
});
