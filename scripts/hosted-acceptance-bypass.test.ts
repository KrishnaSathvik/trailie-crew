import { describe, expect, it } from "vitest";

import { selectGeneratedAutomationBypass } from "./hosted-acceptance-bypass.mjs";

describe("hosted acceptance automation bypass", () => {
  it("selects only a newly generated automation bypass", () => {
    const existing = {
      persistent: { scope: "automation-bypass" },
      unrelated: { scope: "shareable-link" },
    };
    const generated = {
      ...existing,
      temporary: { scope: "automation-bypass" },
    };

    expect(selectGeneratedAutomationBypass(existing, generated)).toEqual([
      "temporary",
      { scope: "automation-bypass" },
    ]);
    expect(() => selectGeneratedAutomationBypass(existing, existing)).toThrow(
      "Temporary Vercel automation bypass is unavailable.",
    );
  });
});
