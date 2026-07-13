import { describe, expect, it } from "vitest";

import { parseInviteValue } from "./invite-value";

describe("parseInviteValue", () => {
  it.each([
    ["ABCD2345", "ABCD2345"],
    ["  token-value  ", "token-value"],
    ["/join/a%2Fb", "a/b"],
    ["https://trailie.example/join/long-token", "long-token"],
  ])("normalizes %s", (input, expected) => {
    expect(parseInviteValue(input)).toBe(expected);
  });

  it.each(["", "https://trailie.example/trips/not-an-invite", "/join/"])(
    "rejects %s",
    (input) => {
      expect(() => parseInviteValue(input)).toThrow();
    },
  );
});
