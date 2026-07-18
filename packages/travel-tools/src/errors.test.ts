import { describe, expect, it } from "vitest";

import {
  normalizeTravelProviderError,
  TravelProviderHttpError,
} from "./errors";

describe("travel provider error normalization", () => {
  it.each([
    [400, "invalid_input", false],
    [401, "invalid_key", false],
    [403, "invalid_key", false],
    [404, "not_found", false],
    [429, "rate_limited", true],
    [500, "provider_unavailable", true],
    [503, "provider_unavailable", true],
  ] as const)(
    "normalizes HTTP %s without raw provider text",
    (status, code, retryable) => {
      expect(
        normalizeTravelProviderError(
          new TravelProviderHttpError(status, "raw body must not escape"),
        ),
      ).toEqual({ code, retryable, httpStatus: status });
    },
  );

  it("normalizes timeouts and malformed responses", () => {
    expect(
      normalizeTravelProviderError(
        Object.assign(new Error("secret-bearing URL"), {
          name: "TimeoutError",
        }),
      ),
    ).toEqual({
      code: "timeout",
      retryable: true,
      httpStatus: null,
    });
    expect(
      normalizeTravelProviderError(new SyntaxError("raw response")),
    ).toEqual({
      code: "malformed_response",
      retryable: false,
      httpStatus: null,
    });
  });
});
