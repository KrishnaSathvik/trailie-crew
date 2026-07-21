import { describe, expect, it } from "vitest";
import { ITINERARY_PROMPT, ITINERARY_REPAIR_PROMPT } from "./itinerary";

describe("itinerary prompts", () => {
  it.each([ITINERARY_PROMPT, ITINERARY_REPAIR_PROMPT])(
    "requires meaningful proposed content without inventing operational facts",
    (prompt) => {
      expect(prompt).toMatch(/at least one meaningful/i);
      expect(prompt).toMatch(/free.time/i);
      expect(prompt).toMatch(/unknown/i);
      expect(prompt).toMatch(/compact/i);
      expect(prompt).not.toMatch(/full strict itinerary schema/i);
    },
  );
});
