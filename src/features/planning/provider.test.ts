import { describe, expect, it } from "vitest";
import { createFakePlanningSummaryProvider } from "./provider";

const input = {
  operationKey: "request:1",
  model: "gpt-5.6-sol",
  safetyIdentifier: "safe",
  context: "Yosemite Sep 12–16 hiking conflict open question",
  signal: AbortSignal.timeout(1000),
};
describe("fake planning provider", () => {
  it("returns a review summary rather than an itinerary", async () => {
    const result = await createFakePlanningSummaryProvider().summarize(input);
    expect(result.summary.title).toBe("Before I build the trip");
    expect(result.summary.confirmedDecisions).toBeDefined();
    expect(JSON.stringify(result.summary)).not.toMatch(
      /day\s*1|itinerary activity/i,
    );
  });
  it("supports deterministic failure and invalid schema scenarios", async () => {
    await expect(
      createFakePlanningSummaryProvider().summarize({
        ...input,
        context: "simulate planning failure",
      }),
    ).rejects.toMatchObject({ code: "summary_generation_failed" });
    await expect(
      createFakePlanningSummaryProvider().summarize({
        ...input,
        context: "simulate invalid planning schema",
      }),
    ).rejects.toMatchObject({ code: "invalid_summary_response" });
  });
  it("does not convert a single Yosemite proposal into a confirmed decision", async () => {
    const result = await createFakePlanningSummaryProvider().summarize({
      ...input,
      context:
        '"confirmedDecisions":[], "destinationsUnderConsideration":["Yosemite"]',
    });
    expect(result.summary.confirmedDecisions).toEqual([]);
    expect(result.summary.proposals).toHaveLength(1);
  });
});
