import { describe, expect, it } from "vitest";

import { resolveTrailieReference } from "./reference-resolution";

const hotel = {
  id: "hotel:one",
  kind: "hotel" as const,
  label: "Canyon Lodge",
};
const hike = {
  id: "item:hike",
  kind: "itinerary_item" as const,
  label: "Lake Trail",
};

describe("Trailie reference resolution", () => {
  it("prefers an explicit structured entity ID", () => {
    expect(
      resolveTrailieReference({
        request: "move this",
        explicitEntityId: hike.id,
        materialChange: true,
        currentEntities: [hotel, hike],
        recentEntities: [],
        versionEntities: [],
      }),
    ).toEqual({ status: "resolved", entity: hike, source: "explicit_id" });
  });

  it("resolves the second option from recent structured options", () => {
    const second = { ...hotel, id: "hotel:two", label: "Lake Hotel" };
    expect(
      resolveTrailieReference({
        request: "Tell me more about the second option",
        materialChange: false,
        currentEntities: [],
        recentEntities: [hotel, second],
        versionEntities: [],
      }),
    ).toMatchObject({ status: "resolved", entity: second });
  });

  it("resolves an exact version before the current plan", () => {
    const version = {
      id: "plan:v1",
      kind: "plan_version" as const,
      label: "Version 1",
      version: 1,
    };
    expect(
      resolveTrailieReference({
        request: "Show the earlier plan, Version 1",
        materialChange: false,
        currentEntities: [],
        recentEntities: [],
        versionEntities: [version],
      }),
    ).toMatchObject({ status: "resolved", entity: version });
  });

  it("does not guess an ambiguous material change", () => {
    expect(
      resolveTrailieReference({
        request: "Move the hike",
        materialChange: true,
        currentEntities: [
          hike,
          { ...hike, id: "item:hike-two", label: "Ridge Hike" },
        ],
        recentEntities: [],
        versionEntities: [],
      }),
    ).toMatchObject({ status: "ambiguous" });
  });

  it("asks for clarification when a vague reference has no safe match", () => {
    expect(
      resolveTrailieReference({
        request: "Move that to Tuesday",
        materialChange: true,
        currentEntities: [],
        recentEntities: [],
        versionEntities: [],
      }),
    ).toEqual({ status: "unresolved", reason: "no_safe_match" });
  });
});
