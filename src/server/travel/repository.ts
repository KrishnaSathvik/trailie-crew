import "server-only";

import type { TravelEvidenceV1 } from "@trailie/schemas";

import { createAdminSupabaseClient } from "@/server/supabase/admin";
import type { Json } from "@/types/database";

type RpcClient = Readonly<{
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}>;

export interface TravelEvidenceRepository {
  store(
    evidence: TravelEvidenceV1,
    providerRequestId?: string | null,
  ): Promise<string>;
  bindSnapshot(input: {
    tripPlanId: string;
    storedEvidenceId: string;
    targetItemId: string | null;
  }): Promise<string>;
  copySnapshots(input: {
    baseTripPlanId: string;
    candidateTripPlanId: string;
    excludedTargetItemIds: string[];
    excludedEvidenceTypes: string[];
  }): Promise<number>;
}

function valueOrThrow(
  result: { data: unknown; error: { message: string } | null },
  code: string,
) {
  if (result.error || typeof result.data !== "string") throw new Error(code);
  return result.data;
}

export function createTravelEvidenceRepository(
  client: RpcClient = createAdminSupabaseClient() as unknown as RpcClient,
): TravelEvidenceRepository {
  return {
    async store(evidence, providerRequestId = null) {
      const result = await client.rpc("store_travel_evidence", {
        target_evidence: evidence as unknown as Json,
        target_provider_request_id: providerRequestId,
      });
      return valueOrThrow(result, "travel_evidence_store_failed");
    },
    async bindSnapshot(input) {
      const result = await client.rpc("bind_plan_evidence_snapshot", {
        target_trip_plan_id: input.tripPlanId,
        target_evidence_id: input.storedEvidenceId,
        target_item_id: input.targetItemId,
      });
      return valueOrThrow(result, "travel_evidence_snapshot_failed");
    },
    async copySnapshots(input) {
      const result = await client.rpc("copy_plan_evidence_snapshots", {
        target_base_trip_plan_id: input.baseTripPlanId,
        target_candidate_trip_plan_id: input.candidateTripPlanId,
        excluded_target_item_ids: input.excludedTargetItemIds,
        excluded_evidence_types: input.excludedEvidenceTypes,
      });
      if (result.error || typeof result.data !== "number")
        throw new Error("travel_evidence_snapshot_copy_failed");
      return result.data;
    },
  };
}
