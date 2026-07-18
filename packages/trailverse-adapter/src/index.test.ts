import { describe, expect, it } from "vitest";

import {
  createUnavailableTrailVerseKnowledgeAdapter,
  normalizeTrailVerseKnowledgeRecord,
  preferOfficialTravelKnowledge,
} from "./index";

describe("TrailVerseKnowledgeAdapter boundary", () => {
  it("normalizes only curated, read-only mappings and filters unsafe links", () => {
    const record = normalizeTrailVerseKnowledgeRecord({
      parkId: "yosemite",
      parkCode: "yose",
      displayName: "Yosemite National Park",
      providerEntityIds: { nps: "yose", ridb: "2991" },
      officialLinks: [
        "https://www.nps.gov/yose/index.htm",
        "https://admin.trailverse.example/private",
        "javascript:alert(1)",
      ],
      lastCuratedAt: "2026-07-01T00:00:00.000Z",
      live: true,
      userEmail: "private@example.com",
    });

    expect(record).toEqual({
      parkId: "yosemite",
      parkCode: "yose",
      displayName: "Yosemite National Park",
      providerEntityIds: { nps: "yose", ridb: "2991" },
      officialLinks: ["https://www.nps.gov/yose/index.htm"],
      lastCuratedAt: "2026-07-01T00:00:00.000Z",
      provenance: {
        source: "trailverse_curated_mapping",
        liveStatus: "not_live_evidence",
      },
    });
    expect(JSON.stringify(record)).not.toContain("private@example.com");
  });

  it("never lets curated knowledge override current official evidence", () => {
    expect(
      preferOfficialTravelKnowledge({
        official: { activeClosure: true, title: "Official road closure" },
        trailVerse: {
          activeClosure: false,
          title: "Curated seasonal guidance",
        },
      }),
    ).toEqual({
      value: { activeClosure: true, title: "Official road closure" },
      source: "official",
    });
  });

  it("has an explicit unavailable implementation when no stable API exists", async () => {
    const adapter = createUnavailableTrailVerseKnowledgeAdapter();

    await expect(adapter.getParkMapping("yosemite")).resolves.toEqual({
      state: "unavailable",
      record: null,
      reason: "stable_api_not_configured",
    });
    await expect(adapter.searchParkMappings("yosemite")).resolves.toEqual({
      state: "unavailable",
      records: [],
      reason: "stable_api_not_configured",
    });
  });
});
