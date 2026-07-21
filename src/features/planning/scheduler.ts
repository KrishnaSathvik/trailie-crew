import "server-only";
import { after } from "next/server";
import { parseOpenAIEnv, requireAiGeneration } from "@/server/env";
import { createSafetyIdentifier } from "@/server/ai/safety-identifier";
import { resolveAiQuotaSubject } from "@/server/ai/quota";
import { createDurableProviderAttemptController } from "@/server/ai/provider-attempts";
import { createProviderAttemptRepository } from "@/server/ai/provider-attempt-repository";
import { createTrailieRuntimeRouter } from "@/server/ai/model-router";
import { runStructuredRuntime } from "@/server/ai/structured-runtime";
import { performanceStageTimeout } from "@/server/ai/reliability-policy";
import { createCorrelationId } from "@/server/operations/logger";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import type { PlanningSummary } from "@trailie/schemas";
import { createOpenAIPlanningSummaryProvider } from "./openai-provider";
import { createFakePlanningSummaryProvider } from "./provider";
import { createPlanningRepository } from "./repository";
import { processPlanningSummary } from "./worker";

const MAX_CONCURRENCY = 2;
let active = 0;
const pending: Array<() => void> = [];
async function withSlot(task: () => Promise<void>) {
  if (active >= MAX_CONCURRENCY)
    await new Promise<void>((resolve) => pending.push(resolve));
  active += 1;
  try {
    await task();
  } finally {
    active -= 1;
    pending.shift()?.();
  }
}
export async function drainPlanningSummary(id: string) {
  const env = requireAiGeneration(parseOpenAIEnv(process.env));
  const route = createTrailieRuntimeRouter({
    fast: env.conversationModel,
    reasoning: env.flagshipModel,
    planning: env.planningModel,
    itinerary: env.itineraryModel,
  }).route({
    intent: "create_itinerary",
    request: "planning summary",
    complexity: "planning_summary",
  });
  const selectedModel = route.model;
  if (!selectedModel) throw new Error("planning_model_route_unavailable");
  const provider =
    env.provider === "fake"
      ? createFakePlanningSummaryProvider()
      : createOpenAIPlanningSummaryProvider({
          apiKey: env.apiKey!,
          timeoutMs: performanceStageTimeout(
            "planningProvider",
            env.reliabilityPolicy.timeoutsMs.planningProvider,
          ),
        });
  const quotaSubject = await resolveAiQuotaSubject("planning", id);
  await runStructuredRuntime(
    {
      requestId: createCorrelationId(),
      roomId: quotaSubject.roomId,
      responseType: "planning_summary",
      intent: "create_itinerary",
      complexity: route.complexity,
      selectedModelRoute: route.route,
      toolClasses: ["database_read", "database_write"],
    },
    async (runtimeTrace) => {
      await processPlanningSummary(id, {
        repository: createPlanningRepository({
          model: selectedModel,
          promptVersion: env.planningPromptVersion,
          schemaVersion: env.planningSchemaVersion,
        }),
        provider,
        safetyIdentifier: createSafetyIdentifier(
          `planning:${id}`,
          env.safetyHmacSecret,
        ),
        model: selectedModel,
        quotaSubject,
        reliabilityPolicy: env.reliabilityPolicy,
        providerAttempts: createDurableProviderAttemptController(
          createProviderAttemptRepository<PlanningSummary>(),
        ),
        runtimeTrace,
      });
      const { data } = await createAdminSupabaseClient()
        .from("planning_requests")
        .select("status,generation_error_code")
        .eq("id", id)
        .maybeSingle();
      if (data?.status === "cancelled") throw new Error("workflow_cancelled");
      if (data?.status === "failed")
        throw new Error(data.generation_error_code ?? "planning_failed");
    },
  );
}
export function schedulePlanningSummary(id: string) {
  after(() => withSlot(() => drainPlanningSummary(id)).catch(() => undefined));
}
