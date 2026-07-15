import "server-only";
import { after } from "next/server";
import {
  createFakeTravelProvider,
  createMapboxTravelProvider,
  createUnavailableTravelProvider,
  type FakeTravelScenario,
} from "@trailie/travel-tools";
import { parseOpenAIEnv, requireAiGeneration } from "@/server/env";
import { createSafetyIdentifier } from "@/server/ai/safety-identifier";
import { resolveAiQuotaSubject } from "@/server/ai/quota";
import { generationProviderSwitches } from "@/server/operations/provider-switches";
import { createOpenAIItineraryProvider } from "./openai-provider";
import { createFakeItineraryProvider } from "./provider";
import { createItineraryRepository } from "./repository";
import { processItineraryGeneration } from "./worker";

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
      : generationProviderSwitches().travelProvidersEnabled &&
          process.env.MAPBOX_ACCESS_TOKEN
        ? createMapboxTravelProvider({
            accessToken: process.env.MAPBOX_ACCESS_TOKEN,
          })
        : createUnavailableTravelProvider("unconfigured-live-provider");
  const quotaSubject = await resolveAiQuotaSubject("itinerary", id);
  await processItineraryGeneration(id, {
    repository: createItineraryRepository(),
    provider,
    travelProvider,
    safetyIdentifier: createSafetyIdentifier(
      `itinerary:${id}`,
      env.safetyHmacSecret,
    ),
    model: env.itineraryModel,
    quotaSubject,
    reliabilityPolicy: env.reliabilityPolicy,
  });
}

export function scheduleItineraryGeneration(id: string) {
  after(() =>
    withSlot(() => drainItineraryGeneration(id)).catch(() => undefined),
  );
}
