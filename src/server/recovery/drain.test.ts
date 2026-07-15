import { describe, expect, it, vi } from "vitest";

import { runRecovery, type RecoveryCategory } from "./drain";

describe("bounded recovery drain", () => {
  it("lists bounded work and executes no more than the global job cap", async () => {
    const work: Record<RecoveryCategory, string[]> = {
      memory: ["memory-1"],
      planning: ["planning-1"],
      itinerary: ["itinerary-1"],
      revision: ["revision-1"],
      revisionPublication: ["publication-1"],
    };
    const list = vi.fn(
      async (category: RecoveryCategory, batchSize: number) => {
        expect(batchSize).toBe(1);
        return work[category];
      },
    );
    const drain = vi.fn(async () => undefined);

    const result = await runRecovery(
      { list, drain },
      { batchSize: 1, maxJobs: 2 },
    );

    expect(list).toHaveBeenCalledTimes(5);
    expect(list.mock.calls.every((call) => call[1] === 1)).toBe(true);
    expect(drain).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      selected: {
        memory: 1,
        planning: 1,
        itinerary: 0,
        revision: 0,
        revisionPublication: 0,
      },
      completed: {
        memory: 1,
        planning: 1,
        itinerary: 0,
        revision: 0,
        revisionPublication: 0,
      },
      failed: {
        memory: 0,
        planning: 0,
        itinerary: 0,
        revision: 0,
        revisionPublication: 0,
      },
      remainingEligible: 3,
    });
  });

  it("returns safe failure counts without exposing job identifiers", async () => {
    const list = vi.fn(
      async (category: RecoveryCategory, batchSize: number) => {
        expect(batchSize).toBe(1);
        return category === "itinerary" ? ["private-job-id"] : [];
      },
    );
    const drain = vi.fn(async () => {
      throw new Error("raw private provider failure");
    });
    const result = await runRecovery(
      { list, drain },
      { batchSize: 1, maxJobs: 2 },
    );
    expect(result.failed.itinerary).toBe(1);
    expect(JSON.stringify(result)).not.toContain("private-job-id");
    expect(JSON.stringify(result)).not.toContain(
      "raw private provider failure",
    );
  });
});
