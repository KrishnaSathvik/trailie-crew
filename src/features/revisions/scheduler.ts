import "server-only";
import { after } from "next/server";
import {
  createFakeTravelProvider,
  createUnavailableTravelProvider,
  type FakeTravelScenario,
} from "@trailie/travel-tools";
import {
  parseOpenAIEnv,
  parseTravelProviderEnv,
  requireAiGeneration,
} from "@/server/env";
import { createSafetyIdentifier } from "@/server/ai/safety-identifier";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { resolveAiQuotaSubject } from "@/server/ai/quota";
import { createDurableProviderAttemptController } from "@/server/ai/provider-attempts";
import { createProviderAttemptRepository } from "@/server/ai/provider-attempt-repository";
import type {
  Itinerary,
  PlanChangeAnalysis,
  RevisionPatchV1,
} from "@trailie/schemas";
import { createOpenAIRevisionProvider } from "./openai-provider";
import { createFakeRevisionProvider } from "./provider";
import { createRevisionRepository } from "./repository";
import { processPlanChange } from "./worker";
import {
  createTravelProviderRegistry,
  withTravelProviderCache,
} from "@/server/travel/provider-registry";
import { createTravelEvidenceRepository } from "@/server/travel/repository";
import { createTravelProviderCacheRepository } from "@/server/travel/cache-repository";
import { createTravelProviderOperationController } from "@/server/travel/operation-repository";

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

export async function drainPlanChange(id: string) {
  const env = requireAiGeneration(parseOpenAIEnv(process.env));
  const travelEnvironment = parseTravelProviderEnv(process.env);
  const quotaSubject = await resolveAiQuotaSubject("revision", id);
  const provider =
    env.provider === "fake"
      ? createFakeRevisionProvider()
      : createOpenAIRevisionProvider({
          apiKey: env.apiKey!,
          timeoutMs: Math.max(
            env.reliabilityPolicy.timeoutsMs.revisionAnalysis,
            env.reliabilityPolicy.timeoutsMs.revisionGeneration,
          ),
        });
  const travelProvider =
    env.provider === "fake"
      ? createFakeTravelProvider({
          scenario: (process.env.TRAILIE_FAKE_TRAVEL_SCENARIO ??
            "valid") as FakeTravelScenario,
        })
      : createUnavailableTravelProvider("normalized-live-provider");
  const providerRegistry =
    env.provider === "fake"
      ? createTravelProviderRegistry({
          mode: "fake",
          environment: travelEnvironment,
          scenario:
            process.env.TRAILIE_FAKE_TRAVEL_SCENARIO === "closed_location"
              ? "active_closure"
              : process.env.TRAILIE_FAKE_TRAVEL_SCENARIO === "provider_failure"
                ? "providers_disabled"
                : "baseline",
        })
      : createTravelProviderRegistry({
          mode: "live",
          environment: travelEnvironment,
        });
  const operationController = createTravelProviderOperationController({
    roomId: quotaSubject.roomId,
    workflowKey: `revision:${id}`,
    environment:
      process.env.VERCEL_ENV === "production"
        ? "production"
        : process.env.VERCEL_ENV === "preview"
          ? "hosted-acceptance"
          : process.env.NODE_ENV === "test"
            ? "test"
            : "local",
    roomDailyLimit: travelEnvironment.roomDailyLimit,
    globalDailyLimit: travelEnvironment.globalDailyLimit,
  });
  const travelIntelligence = {
    providers: withTravelProviderCache(providerRegistry, {
      cache: createTravelProviderCacheRepository(),
      environment:
        process.env.VERCEL_ENV === "production"
          ? "production"
          : process.env.VERCEL_ENV === "preview"
            ? "hosted-acceptance"
            : process.env.NODE_ENV === "test"
              ? "test"
              : "local",
      bypass: process.env.TRAVEL_CACHE_BYPASS === "true",
      authorizeRequest: operationController.authorize,
      recordRequest: operationController.record,
    }),
    evidenceRepository: createTravelEvidenceRepository(),
    maximumCallsPerProvider: env.provider === "fake" ? 8 : 20,
  };
  await processPlanChange(id, {
    repository: createRevisionRepository(),
    provider,
    travelProvider,
    travelIntelligence,
    safetyIdentifier: createSafetyIdentifier(
      `revision:${id}`,
      env.safetyHmacSecret,
    ),
    quotaSubject,
    reliabilityPolicy: env.reliabilityPolicy,
    analysisAttempts: createDurableProviderAttemptController(
      createProviderAttemptRepository<PlanChangeAnalysis>(),
    ),
    candidateAttempts: createDurableProviderAttemptController(
      createProviderAttemptRepository<Itinerary>(),
    ),
    patchAttempts: createDurableProviderAttemptController(
      createProviderAttemptRepository<RevisionPatchV1>(),
    ),
  });
}

export async function publishPlanChange(id: string) {
  const { error } = await createAdminSupabaseClient().rpc(
    "complete_plan_change_publication",
    { target_change_request_id: id },
  );
  if (error) throw new Error("publication_failed");
}

export function schedulePlanChange(id: string) {
  after(() => withSlot(() => drainPlanChange(id)).catch(() => undefined));
}
export function schedulePlanChangePublication(id: string) {
  after(() => withSlot(() => publishPlanChange(id)).catch(() => undefined));
}
