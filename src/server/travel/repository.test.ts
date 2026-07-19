import { describe, expect, it, vi } from "vitest";
import { createFakeTravelProviderAdapter } from "@trailie/travel-tools";

import type { CanonicalDestinationResolutionV1 } from "@trailie/schemas";
import { createTravelEvidenceRepository } from "./repository";

const destinationResolution = {
  schemaVersion: "1",
  originalQuery: "Yosemite National Park",
  normalizedQuery: "Yosemite",
  status: "resolved",
  canonicalPlaceId: "nps:yose",
  canonicalName: "Yosemite National Park",
  providerPlaceId: null,
  npsParkCode: "yose",
  coordinates: { latitude: 37.8651, longitude: -119.5383 },
  boundingBox: null,
  locality: null,
  region: "California",
  country: "United States",
  candidateCount: 3,
  selectedCandidateIndex: 0,
  resolutionMethod: "exact_official_match",
  corroborationSources: ["mapbox", "nps"],
  corroborationScore: 1,
  confidence: "high",
  ambiguityReasons: [],
  evidenceIds: ["evidence:nps:yose"],
  semanticHash: "a".repeat(64),
} satisfies CanonicalDestinationResolutionV1;

describe("travel evidence repository", () => {
  it("rejects storage-prohibited evidence before any database call", async () => {
    const rpc = vi.fn();
    const evidence = (
      await createFakeTravelProviderAdapter({
        scenario: "baseline",
      }).getPark({ parkCode: "yose", locale: "en-US" })
    ).evidence[0];
    const repository = createTravelEvidenceRepository({ rpc });

    await expect(
      repository.store({
        ...evidence,
        restrictions: { ...evidence.restrictions, storage: "prohibited" },
      }),
    ).rejects.toThrow("travel_evidence_storage_prohibited");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stores normalized evidence and binds an immutable plan snapshot through narrow RPCs", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: "6a000000-0000-4000-8000-000000000001",
        error: null,
      })
      .mockResolvedValueOnce({
        data: "6a000000-0000-4000-8000-000000000002",
        error: null,
      })
      .mockResolvedValueOnce({
        data: 3,
        error: null,
      });
    const fixture = (
      await createFakeTravelProviderAdapter({
        scenario: "baseline",
        now: "2026-07-17T20:00:00.000Z",
      }).getPark({ parkCode: "yose", locale: "en-US" })
    ).evidence[0];
    const evidence = {
      ...fixture,
      restrictions: { ...fixture.restrictions, storage: "permanent" as const },
    };
    const repository = createTravelEvidenceRepository({ rpc });

    const storedId = await repository.store(evidence);
    const snapshotId = await repository.bindSnapshot({
      tripPlanId: "6a000000-0000-4000-8000-000000000010",
      storedEvidenceId: storedId,
      targetItemId: null,
    });
    const copied = await repository.copySnapshots({
      baseTripPlanId: "6a000000-0000-4000-8000-000000000010",
      candidateTripPlanId: "6a000000-0000-4000-8000-000000000011",
      excludedTargetItemIds: ["item:sunset"],
      excludedEvidenceTypes: ["route"],
    });

    expect(snapshotId).toBe("6a000000-0000-4000-8000-000000000002");
    expect(copied).toBe(3);
    expect(rpc).toHaveBeenNthCalledWith(1, "store_travel_evidence", {
      target_evidence: evidence,
      target_provider_request_id: null,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "bind_plan_evidence_snapshot", {
      target_trip_plan_id: "6a000000-0000-4000-8000-000000000010",
      target_evidence_id: storedId,
      target_item_id: null,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "copy_plan_evidence_snapshots", {
      target_base_trip_plan_id: "6a000000-0000-4000-8000-000000000010",
      target_candidate_trip_plan_id: "6a000000-0000-4000-8000-000000000011",
      excluded_target_item_ids: ["item:sunset"],
      excluded_evidence_types: ["route"],
    });
  });

  it("stores, reloads, and evidence-binds one immutable canonical resolution", async () => {
    const resolutionId = "6a000000-0000-4000-8000-000000000020";
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: resolutionId, error: null })
      .mockResolvedValueOnce({ data: destinationResolution, error: null })
      .mockResolvedValueOnce({
        data: "6a000000-0000-4000-8000-000000000021",
        error: null,
      });
    const repository = createTravelEvidenceRepository({ rpc });

    expect(
      await repository.storeDestinationResolution({
        tripPlanId: "6a000000-0000-4000-8000-000000000010",
        resolution: destinationResolution,
      }),
    ).toBe(resolutionId);
    expect(
      await repository.loadDestinationResolution({
        resolutionId,
        semanticHash: destinationResolution.semanticHash,
      }),
    ).toEqual(destinationResolution);
    await repository.bindDestinationResolutionEvidence({
      resolutionId,
      storedEvidenceId: "6a000000-0000-4000-8000-000000000001",
    });

    expect(rpc).toHaveBeenNthCalledWith(
      1,
      "store_canonical_destination_resolution",
      {
        target_trip_plan_id: "6a000000-0000-4000-8000-000000000010",
        target_resolution: destinationResolution,
      },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "get_canonical_destination_resolution",
      {
        target_resolution_id: resolutionId,
        target_semantic_hash: destinationResolution.semanticHash,
      },
    );
  });
});
