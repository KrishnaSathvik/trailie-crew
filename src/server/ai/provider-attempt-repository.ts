import "server-only";

import { z } from "zod";

import type {
  ProviderAttemptDependencies,
  ProviderAttemptExecutionResult,
} from "@/server/ai/provider-attempts";
import { createAdminSupabaseClient } from "@/server/supabase/admin";

type Rpc = (
  name: string,
  parameters: Record<string, unknown>,
) => Promise<unknown>;

const claimSchema = z
  .object({
    attemptId: z.uuid(),
    claimed: z.boolean(),
    resultAvailable: z.boolean(),
    applied: z.boolean(),
    recovered: z.boolean().optional().default(false),
  })
  .passthrough();

const nullableCount = z.number().int().nonnegative().nullable().default(null);
const stagedSchema = z
  .object({
    validatedResult: z.unknown(),
    providerResponseId: z.string().nullable().default(null),
    providerRequestId: z.string().nullable().default(null),
    inputTokens: nullableCount,
    outputTokens: nullableCount,
    reasoningTokens: nullableCount,
    cachedInputTokens: nullableCount,
    totalTokens: nullableCount,
    providerDurationMs: z.number().int().nonnegative(),
    totalDurationMs: z.number().int().nonnegative(),
    retryCount: z.number().int().min(0).max(2),
    repairCount: z.number().int().min(0).max(1),
  })
  .passthrough();

function productionRpc(): Rpc {
  const admin = createAdminSupabaseClient();
  return async (name, parameters) => {
    const invoke = admin.rpc as unknown as (
      functionName: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data, error } = await invoke(name, parameters);
    if (error) throw new Error(error.message);
    return data;
  };
}

export function createProviderAttemptRepository<T>(
  dependencies: {
    rpc?: Rpc;
    createLeaseOwner?: () => string;
  } = {},
): ProviderAttemptDependencies<T> {
  const rpc = dependencies.rpc ?? productionRpc();
  return {
    createLeaseOwner:
      dependencies.createLeaseOwner ?? (() => crypto.randomUUID()),
    async claim(input) {
      return claimSchema.parse(
        await rpc("claim_ai_provider_attempt", {
          target_workflow: input.workflow,
          target_operation_key: input.operationKey,
          target_attempt: input.attempt,
          target_model: input.model,
          target_lease_owner: input.leaseOwner,
          target_lease_ms: input.leaseMs,
          target_quota_reservation_id: input.quotaReservationId,
        }),
      );
    },
    async stage(attemptId, leaseOwner, result) {
      await rpc("complete_ai_provider_attempt", {
        target_attempt_id: attemptId,
        target_lease_owner: leaseOwner,
        target_provider_response_id: result.responseId,
        target_provider_request_id: result.requestId,
        target_validated_result: result.value,
        target_input_tokens: result.usage.inputTokens,
        target_output_tokens: result.usage.outputTokens,
        target_reasoning_tokens: result.usage.reasoningTokens,
        target_cached_input_tokens: result.usage.cachedInputTokens,
        target_total_tokens: result.usage.totalTokens,
        target_provider_duration_ms: result.providerDurationMs,
        target_total_duration_ms: result.totalDurationMs,
        target_retry_count: result.retryCount,
        target_repair_count: result.repairCount,
      });
    },
    async load(attemptId, leaseOwner) {
      const staged = stagedSchema.parse(
        await rpc("get_staged_ai_provider_result", {
          target_attempt_id: attemptId,
          target_lease_owner: leaseOwner,
        }),
      );
      return {
        value: staged.validatedResult,
        responseId: staged.providerResponseId,
        requestId: staged.providerRequestId,
        usage: {
          inputTokens: staged.inputTokens,
          outputTokens: staged.outputTokens,
          reasoningTokens: staged.reasoningTokens,
          cachedInputTokens: staged.cachedInputTokens,
          totalTokens: staged.totalTokens,
        },
        providerDurationMs: staged.providerDurationMs,
        totalDurationMs: staged.totalDurationMs,
        retryCount: staged.retryCount,
        repairCount: staged.repairCount,
      } satisfies ProviderAttemptExecutionResult<unknown>;
    },
    async markApplied(attemptId, leaseOwner) {
      await rpc("mark_ai_provider_attempt_applied", {
        target_attempt_id: attemptId,
        target_lease_owner: leaseOwner,
      });
    },
    async fail(
      attemptId: string,
      leaseOwner: string,
      code: string,
      retryable: boolean,
    ) {
      await rpc("fail_ai_provider_attempt", {
        target_attempt_id: attemptId,
        target_lease_owner: leaseOwner,
        target_error_code: code,
        target_retryable: retryable,
      });
    },
  };
}
