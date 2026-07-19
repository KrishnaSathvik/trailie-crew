import { describe, expect, it, vi } from "vitest";
import { createFakeTravelProviderAdapter } from "@trailie/travel-tools";
import { revisionItinerary } from "@/features/revisions/test-fixtures";

import { refreshRevisionTravelEvidence } from "./revision-refresh";

describe("refreshRevisionTravelEvidence", () => {
  it("refreshes only affected routes for a narrow route revision and preserves other snapshots", async () => {
    const candidate = revisionItinerary();
    const target = candidate.days[0]!.items[1]!.id;
    const affectedSegment = candidate.days[0]!.travelSegments[0]!.id;
    const fixture = createFakeTravelProviderAdapter({
      scenario: "baseline",
      now: "2026-07-17T20:00:00.000Z",
    });
    const copySnapshots = vi.fn(async () => 4);
    const store = vi.fn(async () => crypto.randomUUID());
    const bindSnapshot = vi.fn(async () => crypto.randomUUID());
    const destinationRepository = {
      storeDestinationResolution: vi.fn(async () => crypto.randomUUID()),
      loadDestinationResolution: vi.fn(),
      bindDestinationResolutionEvidence: vi.fn(async () => crypto.randomUUID()),
    };

    const result = await refreshRevisionTravelEvidence({
      requestType: "change_route",
      evidenceRefreshTargets: [target],
      baseTripPlanId: "6a000000-0000-4000-8000-000000000001",
      candidateTripPlanId: "6a000000-0000-4000-8000-000000000002",
      candidate,
      providers: {
        geocoding: fixture,
        weather: fixture,
        parks: fixture,
        recreation: fixture,
      },
      repository: {
        copySnapshots,
        store,
        bindSnapshot,
        ...destinationRepository,
      },
      locale: "en-US",
      maximumCallsPerProvider: 8,
    });

    expect(copySnapshots).toHaveBeenCalledWith({
      baseTripPlanId: "6a000000-0000-4000-8000-000000000001",
      candidateTripPlanId: "6a000000-0000-4000-8000-000000000002",
      excludedTargetItemIds: [target, affectedSegment],
      excludedEvidenceTypes: [],
    });
    expect(
      result.evidence.every((entry) => entry.evidenceType === "route"),
    ).toBe(true);
    expect(store).toHaveBeenCalledTimes(result.evidence.length);
    expect(bindSnapshot).toHaveBeenCalledTimes(result.evidence.length);
  });

  it("does not create a new itinerary version for metadata-only refresh work", async () => {
    const fixture = createFakeTravelProviderAdapter({
      scenario: "baseline",
    });
    const store = vi.fn();
    const bindSnapshot = vi.fn();
    await refreshRevisionTravelEvidence({
      requestType: "update_note",
      evidenceRefreshTargets: [],
      baseTripPlanId: "6a000000-0000-4000-8000-000000000001",
      candidateTripPlanId: "6a000000-0000-4000-8000-000000000002",
      candidate: revisionItinerary(),
      providers: {
        geocoding: fixture,
        weather: fixture,
        parks: fixture,
        recreation: fixture,
      },
      repository: {
        copySnapshots: vi.fn(async () => 4),
        store,
        bindSnapshot,
        storeDestinationResolution: vi.fn(async () => crypto.randomUUID()),
        loadDestinationResolution: vi.fn(),
        bindDestinationResolutionEvidence: vi.fn(async () =>
          crypto.randomUUID(),
        ),
      },
      locale: "en-US",
      maximumCallsPerProvider: 8,
    });

    expect(store).not.toHaveBeenCalled();
    expect(bindSnapshot).not.toHaveBeenCalled();
  });
});
