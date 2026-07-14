import "server-only";
import { z } from "zod";
import type {
  PlanningReadinessStatus,
  PlanningSummary,
} from "@trailie/schemas";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import type { PlanningProviderContext } from "./context";
import type { PlanningSummaryOutput } from "./provider";

const claimSchema = z
  .object({
    claimed: z.boolean(),
    status: z.string(),
    attemptCount: z.number().int().optional().default(0),
    summaryVersion: z.number().int().optional(),
  })
  .passthrough();
const contextSchema = z.object({
  requestId: z.uuid(),
  roomId: z.uuid(),
  approvalMode: z.enum(["all_active", "host_only"]),
  memoryVersion: z.number().int(),
  memorySnapshot: z.record(z.string(), z.unknown()),
  participants: z.array(
    z.object({
      id: z.uuid(),
      displayName: z.string(),
      role: z.enum(["host", "member"]),
    }),
  ),
  activeFacts: z.array(z.record(z.string(), z.unknown())),
  recentMessages: z.array(z.record(z.string(), z.unknown())),
  reviewNotes: z.array(z.record(z.string(), z.unknown())),
});
export interface PlanningRepository {
  claim(id: string): Promise<z.infer<typeof claimSchema>>;
  loadContext(id: string): Promise<PlanningProviderContext>;
  complete(
    id: string,
    summary: PlanningSummary,
    readiness: PlanningReadinessStatus,
    hash: string,
    result: PlanningSummaryOutput,
    latencyMs: number,
  ): Promise<void>;
  fail(id: string, code: string): Promise<void>;
}
function ensure(error: { message: string } | null, code: string) {
  if (error) throw new Error(code);
}
export function createPlanningRepository(config: {
  model: string;
  promptVersion: string;
  schemaVersion: string;
}): PlanningRepository {
  const admin = createAdminSupabaseClient();
  return {
    async claim(id) {
      const { data, error } = await admin.rpc(
        "claim_planning_summary_generation",
        {
          target_request_id: id,
          target_model: config.model,
          target_prompt_version: config.promptVersion,
          target_schema_version: config.schemaVersion,
        },
      );
      ensure(error, "planning_request_unavailable");
      return claimSchema.parse(data);
    },
    async loadContext(id) {
      const { data, error } = await admin.rpc("get_planning_summary_context", {
        target_request_id: id,
      });
      ensure(error, "planning_request_unavailable");
      return contextSchema.parse(data) as PlanningProviderContext;
    },
    async complete(id, summary, readiness, hash, result, latencyMs) {
      const { error } = await admin.rpc("complete_planning_summary", {
        target_request_id: id,
        validated_summary: summary,
        readiness,
        target_summary_hash: hash,
        target_provider_response_id: result.responseId,
        target_provider_request_id: result.requestId,
        target_model: config.model,
        target_prompt_version: config.promptVersion,
        target_schema_version: config.schemaVersion,
        target_input_tokens: result.usage.inputTokens,
        target_output_tokens: result.usage.outputTokens,
        target_reasoning_tokens: result.usage.reasoningTokens,
        target_cached_input_tokens: result.usage.cachedInputTokens,
        target_total_tokens: result.usage.totalTokens,
        target_latency_ms: latencyMs,
      });
      ensure(error, "invalid_summary_response");
    },
    async fail(id, code) {
      const { error } = await admin.rpc("fail_planning_summary", {
        target_request_id: id,
        target_error_code: code,
      });
      ensure(error, "summary_generation_failed");
    },
  };
}
