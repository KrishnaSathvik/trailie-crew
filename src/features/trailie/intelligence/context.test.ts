import { describe, expect, it } from "vitest";

import { buildTrailieContext } from "./context";

const base = {
  trip: {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Yellowstone Weekend",
    approvalMode: "all_active" as const,
  },
  requester: {
    participantId: "20000000-0000-4000-8000-000000000001",
    role: "member" as const,
  },
  recentMessages: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      author: "Mira",
      body: "I prefer easy hikes.",
      createdAt: "2026-07-20T12:00:00.000Z",
    },
  ],
  sharedMemory: {
    destinations: ["Yellowstone"],
    dates: ["2026-10-10 to 2026-10-13"],
    decisions: ["Keep driving under three hours a day"],
    openQuestions: ["Which entrance should we use?"],
  },
  crewSignals: {
    preferences: ["easy hikes", "wildlife"],
    constraints: ["knee pain"],
  },
  currentPlan: null,
  versionHistory: [],
  planning: null,
  revision: null,
  selectedLodging: [],
  selectedFlights: [],
  evidence: [],
};

describe("bounded Trailie context", () => {
  it("includes only named, relevant context sections", () => {
    const result = buildTrailieContext(base);
    expect(result.usedSections).toEqual([
      "trip",
      "requester_permissions",
      "shared_trip_context",
      "crew_signals",
      "recent_messages",
    ]);
    expect(result.text).toContain("<SHARED_TRIP_CONTEXT>");
  });

  it("uses anonymized crew signals without exposing private memory records", () => {
    const result = buildTrailieContext({
      ...base,
      privateMemory: {
        participants: {
          secretMemberId: { medical: "do not expose this record" },
        },
      },
    });
    expect(result.text).toContain("knee pain");
    expect(result.text).not.toContain("secretMemberId");
    expect(result.text).not.toContain("do not expose this record");
  });

  it("includes exact current plan context without older versions", () => {
    const result = buildTrailieContext({
      ...base,
      currentPlan: {
        id: "40000000-0000-4000-8000-000000000001",
        version: 2,
        status: "published",
        summary: "Yellowstone Version 2",
      },
    });
    expect(result.text).toContain("Yellowstone Version 2");
    expect(result.usedSections).toContain("current_plan");
  });

  it("includes bounded version metadata only when version history is requested", () => {
    const result = buildTrailieContext({
      ...base,
      versionHistory: [
        {
          id: "40000000-0000-4000-8000-000000000001",
          version: 1,
          publishedAt: "2026-07-19T12:00:00.000Z",
          changeSummary: "Initial plan",
          isCurrent: false,
        },
        {
          id: "40000000-0000-4000-8000-000000000002",
          version: 2,
          publishedAt: "2026-07-20T12:00:00.000Z",
          changeSummary: "Moved the hike",
          isCurrent: true,
        },
      ],
      requestedSections: ["trip", "version_history"],
    });

    expect(result.usedSections).toEqual(["trip", "version_history"]);
    expect(result.text).toContain("<VERSION_HISTORY>");
    expect(result.text).toContain("Moved the hike");
  });

  it("bounds long conversations deterministically", () => {
    const result = buildTrailieContext({
      ...base,
      recentMessages: Array.from({ length: 100 }, (_, index) => ({
        id: `message-${index}`,
        author: "Crew",
        body: "long message ".repeat(200),
        createdAt: new Date(2026, 6, 20, 12, index).toISOString(),
      })),
      maxCharacters: 4_000,
    });
    expect(result.text.length).toBeLessThanOrEqual(4_000);
    expect(result.contract.recentMessages.length).toBeLessThan(100);
  });

  it("records section names for safe observability without logging contents", () => {
    const result = buildTrailieContext(base);
    expect(
      result.usedSections.every((section) => !section.includes("easy")),
    ).toBe(true);
  });

  it("omits irrelevant sections from the provider context", () => {
    const result = buildTrailieContext({
      ...base,
      requestedSections: ["trip", "requester_permissions", "recent_messages"],
    });
    expect(result.usedSections).toEqual([
      "trip",
      "requester_permissions",
      "recent_messages",
    ]);
    expect(result.text).not.toContain("AGGREGATED_CREW_SIGNALS");
    expect(result.text).not.toContain("SHARED_TRIP_CONTEXT");
  });
});
