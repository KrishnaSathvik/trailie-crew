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
import { resolveAiQuotaSubject } from "@/server/ai/quota";
import { createDurableProviderAttemptController } from "@/server/ai/provider-attempts";
import { createProviderAttemptRepository } from "@/server/ai/provider-attempt-repository";
import {
  assertStructuredItineraryRoute,
  createTrailieRuntimeRouter,
} from "@/server/ai/model-router";
import { runStructuredRuntime } from "@/server/ai/structured-runtime";
import { createCorrelationId } from "@/server/operations/logger";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import type { CompactItineraryCandidateV1 } from "@trailie/schemas";
import { createOpenAIItineraryProvider } from "./openai-provider";
import { createFakeItineraryProvider } from "./provider";
import { createItineraryRepository } from "./repository";
import { processItineraryGeneration } from "./worker";
import { withCancellationPolling } from "./cancellation-monitor";
import { itineraryTerminalError } from "./terminal-state";
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

export async function drainItineraryGeneration(id: string) {
  const env = requireAiGeneration(parseOpenAIEnv(process.env));
  const route = assertStructuredItineraryRoute(
    createTrailieRuntimeRouter({
      fast: env.conversationModel,
      reasoning: env.flagshipModel,
      planning: env.planningModel,
      itinerary: env.itineraryModel,
    }).route({
      intent: "create_itinerary",
      request: "compact itinerary",
      complexity: "full_itinerary",
    }),
  );
  const selectedModel = route.model;
  if (!selectedModel) throw new Error("itinerary_model_route_unavailable");
  const travelEnvironment = parseTravelProviderEnv(process.env);
  const quotaSubject = await resolveAiQuotaSubject("itinerary", id);
  const provider =
    env.provider === "fake"
      ? createFakeItineraryProvider({
          scenario:
            process.env.TRAILIE_FAKE_ITINERARY_SCENARIO === "unrepairable"
              ? "unrepairable"
              : process.env.TRAILIE_FAKE_ITINERARY_SCENARIO ===
                  "provider_failure"
                ? "provider_failure"
                : "conflict",
        })
      : createOpenAIItineraryProvider({
          apiKey: env.apiKey!,
          timeoutMs: Math.max(
            env.reliabilityPolicy.timeoutsMs.itineraryGeneration,
            env.reliabilityPolicy.timeoutsMs.itineraryRepair,
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
    workflowKey: `itinerary:${id}`,
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
  await runStructuredRuntime(
    {
      requestId: createCorrelationId(),
      roomId: quotaSubject.roomId,
      responseType: "full_itinerary",
      intent: "create_itinerary",
      complexity: route.complexity,
      selectedModelRoute: route.route,
      toolClasses: [
        "nps",
        "ridb",
        "weather",
        "maps_geocoding",
        "directions",
        "booking_normalization",
        "database_read",
        "database_write",
      ],
    },
    async (runtimeTrace) => {
      await withCancellationPolling({
        intervalMs: 750,
        isCancelled: async () => {
          const { data } = await createAdminSupabaseClient()
            .from("trip_plans")
            .select("status,error_code")
            .eq("id", id)
            .maybeSingle();
          return (
            data?.status === "failed" &&
            data.error_code === "workflow_cancelled"
          );
        },
        run: (cancellationSignal) =>
          processItineraryGeneration(id, {
            repository: createItineraryRepository(),
            provider,
            travelProvider,
            travelIntelligence,
            safetyIdentifier: createSafetyIdentifier(
              `itinerary:${id}`,
              env.safetyHmacSecret,
            ),
            model: selectedModel,
            quotaSubject,
            reliabilityPolicy: env.reliabilityPolicy,
            providerAttempts: createDurableProviderAttemptController(
              createProviderAttemptRepository<CompactItineraryCandidateV1>(),
            ),
            cancellationSignal,
            runtimeTrace,
          }),
      });
      const { data } = await createAdminSupabaseClient()
        .from("trip_plans")
        .select("status,error_code")
        .eq("id", id)
        .maybeSingle();
      if (!data) throw new Error("itinerary_terminal_state_missing");
      const terminalError = itineraryTerminalError(data);
      if (terminalError) throw new Error(terminalError);
    },
  );
}

export function scheduleItineraryGeneration(id: string) {
  after(() =>
    withSlot(() => drainItineraryGeneration(id)).catch(() => undefined),
  );
}
