import "server-only";

import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { generationProviderSwitches } from "@/server/operations/provider-switches";

export const aiQuotaErrorCodes = [
  "ai_disabled",
  "user_ai_limit_reached",
  "room_ai_limit_reached",
  "global_ai_limit_reached",
  "provider_budget_unavailable",
] as const;
export type AiQuotaErrorCode = (typeof aiQuotaErrorCodes)[number];
export type AiWorkflow =
  | "focused_answer"
  | "memory_extraction"
  | "planning_summary"
  | "itinerary_generation"
  | "itinerary_repair"
  | "revision_analysis"
  | "revision_candidate";
export type AiQuotaSubject = { userId: string; roomId: string };

export class AiQuotaError extends Error {
  constructor(public readonly code: AiQuotaErrorCode) {
    super(code);
    this.name = "AiQuotaError";
  }
}

type QuotaMetadata = AiQuotaSubject & {
  workflow: AiWorkflow;
  model: string;
  estimatedTokens: number;
};

type QuotaDependencies = {
  reserve: (id: string, metadata: QuotaMetadata) => Promise<void>;
  reconcile: (
    id: string,
    actualTokens: number,
    status: "used" | "released",
  ) => Promise<void>;
  createId: () => string;
};

function quotaCode(error: unknown): AiQuotaErrorCode | null {
  const message = error instanceof Error ? error.message : String(error);
  return aiQuotaErrorCodes.find((code) => message.includes(code)) ?? null;
}

export function createAiQuotaController(dependencies: QuotaDependencies) {
  return {
    async run<T extends { usage?: { totalTokens?: number | null } }>(
      metadata: QuotaMetadata,
      operation: () => Promise<T>,
    ) {
      const id = dependencies.createId();
      try {
        await dependencies.reserve(id, metadata);
      } catch (error) {
        throw new AiQuotaError(
          quotaCode(error) ?? "provider_budget_unavailable",
        );
      }
      try {
        const result = await operation();
        const actual = result.usage?.totalTokens;
        await dependencies.reconcile(
          id,
          typeof actual === "number" && actual >= 0
            ? actual
            : metadata.estimatedTokens,
          "used",
        );
        return result;
      } catch (error) {
        await dependencies.reconcile(id, 0, "released").catch(() => undefined);
        throw error;
      }
    },
  };
}

function productionController() {
  const admin = createAdminSupabaseClient();
  return createAiQuotaController({
    createId: () => crypto.randomUUID(),
    async reserve(id, metadata) {
      const { error } = await admin.rpc("reserve_ai_quota", {
        reservation_id: id,
        target_user_id: metadata.userId,
        target_room_id: metadata.roomId,
        target_workflow: metadata.workflow,
        target_model: metadata.model,
        estimated_tokens: metadata.estimatedTokens,
      });
      if (error) throw new Error(error.message);
    },
    async reconcile(id, actualTokens, status) {
      const { error } = await admin.rpc("reconcile_ai_quota", {
        reservation_id: id,
        actual_tokens: actualTokens,
        result_status: status,
      });
      if (error) throw new Error(error.message);
    },
  });
}

export function runWithAiQuota<
  T extends { usage?: { totalTokens?: number | null } },
>(metadata: QuotaMetadata, operation: () => Promise<T>) {
  if (!generationProviderSwitches().aiGenerationEnabled)
    throw new AiQuotaError("ai_disabled");
  return productionController().run(metadata, operation);
}

export async function resolveAiQuotaSubject(
  kind: "memory" | "planning" | "itinerary" | "revision",
  id: string,
): Promise<AiQuotaSubject> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("get_ai_quota_subject", {
    target_kind: kind,
    target_id: id,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data))
    throw new AiQuotaError("provider_budget_unavailable");
  const row = data as Record<string, unknown>;
  if (typeof row.roomId !== "string" || typeof row.userId !== "string")
    throw new AiQuotaError("provider_budget_unavailable");
  return { roomId: row.roomId, userId: row.userId };
}
