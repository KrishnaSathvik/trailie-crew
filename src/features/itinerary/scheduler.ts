import "server-only";
import { after } from "next/server";
import {
  createFakeTravelProvider,
  createMapboxTravelProvider,
  createUnavailableTravelProvider,
  type FakeTravelScenario,
} from "@trailie/travel-tools";
import { parseOpenAIEnv } from "@/lib/env";
import { createSafetyIdentifier } from "@/server/ai/safety-identifier";
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
  const env = parseOpenAIEnv(process.env);
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
          timeoutMs: env.itineraryTimeoutMs,
        });
  const travelProvider =
    env.provider === "fake"
      ? createFakeTravelProvider({
          scenario: (process.env.TRAILIE_FAKE_TRAVEL_SCENARIO ??
            "valid") as FakeTravelScenario,
        })
      : process.env.MAPBOX_ACCESS_TOKEN
        ? createMapboxTravelProvider({
            accessToken: process.env.MAPBOX_ACCESS_TOKEN,
          })
        : createUnavailableTravelProvider("unconfigured-live-provider");
  await processItineraryGeneration(id, {
    repository: createItineraryRepository(),
    provider,
    travelProvider,
    safetyIdentifier: createSafetyIdentifier(
      `itinerary:${id}`,
      env.safetyHmacSecret,
    ),
    model: env.itineraryModel,
    timeoutMs: env.itineraryTimeoutMs,
  });
}

export function scheduleItineraryGeneration(id: string) {
  after(() =>
    withSlot(() => drainItineraryGeneration(id)).catch(() => undefined),
  );
}
