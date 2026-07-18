import { describe, expect, it, vi } from "vitest";
import { createFakeTravelProviderAdapter } from "@trailie/travel-tools";

import { createTravelEvidenceRepository } from "./repository";

describe("travel evidence repository", () => {
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
    const evidence = (
      await createFakeTravelProviderAdapter({
        scenario: "baseline",
        now: "2026-07-17T20:00:00.000Z",
      }).getPark({ parkCode: "yose", locale: "en-US" })
    ).evidence[0];
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
});
