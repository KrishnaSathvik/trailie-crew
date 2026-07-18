import "server-only";

import type { TravelProviderOperationEvent } from "@trailie/travel-tools";
import { z } from "zod";

import { createAdminSupabaseClient } from "@/server/supabase/admin";

type RpcClient = Readonly<{
  rpc(
    name: string,
    parameters: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}>;

const claimSchema = z
  .object({
    allowed: z.boolean(),
    reason: z.string().nullable(),
    requestId: z.uuid().optional(),
  })
  .passthrough();

type Configuration = Readonly<{
  client?: RpcClient;
  roomId: string;
  workflowKey: string;
  environment:
    "local" | "test" | "hosted-acceptance" | "preview" | "production";
  roomDailyLimit: number;
  globalDailyLimit: number;
}>;

export function createTravelProviderOperationController(
  configuration: Configuration,
) {
  const client =
    configuration.client ??
    (createAdminSupabaseClient() as unknown as RpcClient);
  return {
    async authorize(event: TravelProviderOperationEvent) {
      const { data, error } = await client.rpc(
        "claim_travel_provider_request",
        {
          target_provider: event.provider,
          target_capability: event.capability,
          target_environment: configuration.environment,
          target_room_id: configuration.roomId,
          target_workflow_key: configuration.workflowKey,
          target_request_key: event.requestKey,
          target_room_daily_limit: configuration.roomDailyLimit,
          target_global_daily_limit: configuration.globalDailyLimit,
        },
      );
      if (error) return false;
      return claimSchema.parse(data).allowed;
    },
    async record(event: TravelProviderOperationEvent) {
      const cacheMetric =
        event.cacheStatus === "hit" ||
        event.cacheStatus === "stale_hit" ||
        event.cacheStatus === "negative_hit";
      const { error } = await client.rpc("record_travel_provider_request", {
        target_provider: event.provider,
        target_capability: event.capability,
        target_environment: configuration.environment,
        target_room_id: configuration.roomId,
        target_workflow_key: cacheMetric
          ? `${configuration.workflowKey}:cache`.slice(0, 240)
          : configuration.workflowKey,
        target_request_key: event.requestKey,
        target_status: event.status,
        target_cache_status: event.cacheStatus,
        target_safe_request_id: null,
        target_duration_ms: event.durationMs,
        target_error_class: event.errorClass,
        target_retryable:
          event.errorClass === "rate_limited" ||
          event.errorClass === "timeout" ||
          event.errorClass === "provider_unavailable",
        target_next_retry_at: null,
        target_attempt: 1,
      });
      if (error) throw new Error("travel_provider_operation_record_failed");
    },
  };
}
