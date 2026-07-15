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
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { resolveAiQuotaSubject } from "@/server/ai/quota";
import { generationProviderSwitches } from "@/server/operations/provider-switches";
import { createOpenAIRevisionProvider } from "./openai-provider";
import { createFakeRevisionProvider } from "./provider";
import { createRevisionRepository } from "./repository";
import { processPlanChange } from "./worker";

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
  const provider =
    env.provider === "fake"
      ? createFakeRevisionProvider()
      : createOpenAIRevisionProvider({
          apiKey: env.apiKey!,
          timeoutMs: env.itineraryTimeoutMs,
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
  const quotaSubject = await resolveAiQuotaSubject("revision", id);
  await processPlanChange(id, {
    repository: createRevisionRepository(),
    provider,
    travelProvider,
    safetyIdentifier: createSafetyIdentifier(
      `revision:${id}`,
      env.safetyHmacSecret,
    ),
    timeoutMs: env.itineraryTimeoutMs,
    quotaSubject,
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
