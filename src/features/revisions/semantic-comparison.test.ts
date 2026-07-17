import { describe, expect, it } from "vitest";
import { revisionItinerary } from "./test-fixtures";
import {
  canonicalizeRevisionValue,
  semanticHash,
  semanticPlanIndex,
} from "./semantic-comparison";

describe("revision semantic comparison", () => {
  it("stabilizes key order, harmless formatting, and volatile evidence timestamps", () => {
    const left = {
      title: "Kayaking   afternoon",
      evidence: { retrievedAt: "2026-07-16T10:00:00.000Z", status: "verified" },
      nested: { b: 2, a: 1 },
    };
    const right = {
      nested: { a: 1, b: 2 },
      evidence: { status: "verified", retrievedAt: "2026-07-16T11:00:00.000Z" },
      title: " Kayaking afternoon ",
    };
    expect(canonicalizeRevisionValue(left)).toEqual(
      canonicalizeRevisionValue(right),
    );
    expect(semanticHash(left)).toBe(semanticHash(right));
  });

  it("retains stable item order and user-visible semantic content", () => {
    const base = revisionItinerary();
    const reordered = structuredClone(base);
    reordered.days[0].items.reverse();
    const rewritten = structuredClone(base);
    rewritten.days[0].items[0].description = "A different walk.";
    expect(semanticHash(base)).not.toBe(semanticHash(reordered));
    expect(semanticHash(base)).not.toBe(semanticHash(rewritten));
  });

  it("indexes item, day, and top-level preservation hashes", () => {
    const index = semanticPlanIndex(revisionItinerary());
    expect(index.itemHashes["item:sunset"]).toMatch(/^[a-f0-9]{64}$/);
    expect(index.dayHashes["day:2026-09-13"]).toMatch(/^[a-f0-9]{64}$/);
    expect(index.topLevelHashes.destinationSummary).toMatch(/^[a-f0-9]{64}$/);
    expect(index.itemOrderByDay["day:2026-09-12"]).toEqual([
      "item:walk",
      "item:sunset",
    ]);
  });
});
