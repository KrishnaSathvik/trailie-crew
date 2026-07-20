import { describe, expect, it } from "vitest";

import { getTripErrorMessage, mapTripOperationError } from "./trip-errors";

describe("Trip application errors", () => {
  it.each([
    ["Invite is invalid.", "invite_invalid"],
    ["Invite is revoked.", "invite_revoked"],
    ["Invite has expired.", "invite_expired"],
    ["Invite has reached its usage limit.", "invite_exhausted"],
    ["You are already a member of this Trip.", "duplicate_membership"],
    [
      "That display name is already active in this Trip.",
      "duplicate_display_name",
    ],
    ["Trip is not active.", "trip_unavailable"],
  ])("maps the controlled P0001 message %s", (message, code) => {
    expect(mapTripOperationError({ code: "P0001", message })).toBe(code);
  });

  it("does not expose uncontrolled database details", () => {
    expect(
      mapTripOperationError({ code: "XX000", message: "secret relation name" }),
    ).toBe("unknown_error");
    expect(getTripErrorMessage("unknown_error")).not.toContain("relation");
  });

  it("maps network failures and malformed results safely", () => {
    expect(mapTripOperationError(new TypeError("fetch failed"))).toBe(
      "network_error",
    );
    expect(getTripErrorMessage("invalid_server_response")).toMatch(
      /could not complete/i,
    );
  });
});
