import { describe, expect, it } from "vitest";
import { classifyChangeMateriality } from "./materiality";

describe("revision materiality", () => {
  it("classifies wording-only general edits as minor", () => {
    expect(
      classifyChangeMateriality({
        requestType: "general_revision",
        requestText: "Clarify the note wording only",
        modelSuggestion: "minor",
      }),
    ).toBe("minor");
  });
  it.each([
    "move_item",
    "change_lodging",
    "change_route",
    "adjust_budget",
  ] as const)("classifies %s as at least material", (requestType) => {
    expect(
      classifyChangeMateriality({
        requestType,
        requestText: "Please change it",
        modelSuggestion: "minor",
      }),
    ).toBe("material");
  });
  it.each([
    "Change our trip dates",
    "Switch the destination to Zion",
    "Remove our confirmed must-do",
    "Ignore the wheelchair access requirement",
  ])("classifies critical hard-boundary language: %s", (requestText) => {
    expect(
      classifyChangeMateriality({
        requestType: "general_revision",
        requestText,
        modelSuggestion: "minor",
      }),
    ).toBe("critical");
  });
});
