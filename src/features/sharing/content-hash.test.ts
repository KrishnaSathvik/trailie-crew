import { describe, expect, it } from "vitest";

import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { contentHash, stableJson } from "./content-hash";
import { projectPublicItinerary } from "./public-projection";

describe("version-specific content hashes", () => {
  it("is stable across object insertion order", () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe(
      stableJson({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(contentHash("public:v1", { b: 2, a: 1 })).toBe(
      contentHash("public:v1", { a: 1, b: 2 }),
    );
  });

  it("changes with schema, selected version, or immutable content", () => {
    const itinerary = revisionItinerary();
    const v1 = projectPublicItinerary({
      itinerary,
      version: 1,
      publishedAt: "2026-07-14T00:00:00.000Z",
      validationStatus: "pass",
    });
    const v2 = { ...v1, version: 2 };
    expect(contentHash("public:v1", v1)).not.toBe(contentHash("public:v1", v2));
    expect(contentHash("public:v1", v1)).not.toBe(contentHash("ics:v1", v1));
  });

  it("does not require or include secrets and raw tokens", () => {
    const token = "A".repeat(43);
    const hash = contentHash("public:v1", { version: 1, title: "Trip" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });
});
