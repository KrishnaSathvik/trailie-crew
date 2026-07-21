import { describe, expect, it } from "vitest";
import { itineraryTerminalError } from "./terminal-state";

describe("itinerary terminal state", () => {
  it.each([
    [{ status: "published", error_code: null }, null],
    [{ status: "blocked", error_code: null }, "itinerary_validation_blocked"],
    [
      { status: "failed", error_code: "workflow_cancelled" },
      "workflow_cancelled",
    ],
    [{ status: "failed", error_code: "model_timeout" }, "model_timeout"],
    [{ status: "validating", error_code: null }, "itinerary_incomplete"],
  ])("maps %o to %s", (state, expected) => {
    expect(itineraryTerminalError(state)).toBe(expected);
  });
});
