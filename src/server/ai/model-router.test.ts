import { describe, expect, it } from "vitest";

import { createModelRouter } from "./model-router";

describe("ModelRouter", () => {
  const router = createModelRouter({
    conversation: "gpt-5.6-terra",
    flagship: "gpt-5.6-sol",
  });

  it("uses Terra for ordinary focused answers", () => {
    expect(
      router.route({ request: "Which month is best?", contextCharacters: 800 }),
    ).toEqual({
      model: "gpt-5.6-terra",
      tier: "conversation",
      reason: "focused_answer",
    });
  });

  it("rarely escalates explicit complex multi-constraint comparisons", () => {
    expect(
      router.route({
        request:
          "Compare driving and flying across cost, time, luggage, accessibility, weather risk, and three origins",
        contextCharacters: 9000,
      }).tier,
    ).toBe("flagship");
  });

  it("fails closed for unknown model configuration", () => {
    expect(() =>
      createModelRouter({ conversation: "", flagship: "gpt-5.6-sol" }),
    ).toThrow();
  });
});
