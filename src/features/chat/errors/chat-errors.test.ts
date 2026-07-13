import { describe, expect, it } from "vitest";

import { getChatErrorMessage, mapChatOperationError } from "./chat-errors";

describe("chat error model", () => {
  it.each([
    ["Message cannot be empty.", "message_empty"],
    ["Message is too long.", "message_too_long"],
    ["Invalid reply target.", "invalid_reply_target"],
    ["Reaction is invalid.", "reaction_invalid"],
    ["Membership required.", "membership_required"],
    ["Participant mismatch.", "participant_mismatch"],
    ["Rate limit exceeded.", "rate_limited"],
  ] as const)("maps %s to %s", (message, code) => {
    expect(mapChatOperationError({ code: "P0001", message }, "message")).toBe(
      code,
    );
  });

  it("never returns raw unknown database details", () => {
    expect(
      mapChatOperationError(
        { code: "XX000", message: "private.messages leaked" },
        "reaction",
      ),
    ).toBe("reaction_failed");
    expect(getChatErrorMessage("unknown_error")).not.toContain("SQL");
  });
});
