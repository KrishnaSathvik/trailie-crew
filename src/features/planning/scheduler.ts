import "server-only";
import { after } from "next/server";
import { parseOpenAIEnv } from "@/lib/env";
import { createSafetyIdentifier } from "@/server/ai/safety-identifier";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { drainMemoryExtraction } from "@/features/memory/worker";
import { drainItineraryGeneration } from "@/features/itinerary/scheduler";
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
  const env = parseOpenAIEnv(process.env);
  const provider =
    env.provider === "fake"
      ? createFakePlanningSummaryProvider()
      : createOpenAIPlanningSummaryProvider({
          apiKey: env.apiKey!,
          timeoutMs: env.planningTimeoutMs,
        });
  await processPlanningSummary(id, {
    repository: createPlanningRepository({
      model: env.planningModel,
      promptVersion: env.planningPromptVersion,
      schemaVersion: env.planningSchemaVersion,
    }),
    provider,
    safetyIdentifier: createSafetyIdentifier(
      `planning:${id}`,
      env.safetyHmacSecret,
    ),
    model: env.planningModel,
    timeoutMs: env.planningTimeoutMs,
  });
}
export function schedulePlanningSummary(id: string) {
  after(() => withSlot(() => drainPlanningSummary(id)).catch(() => undefined));
}
export async function recoverAbandonedWork() {
  const admin = createAdminSupabaseClient();
  const [{ data: planning }, { data: memory }, { data: itinerary }] =
    await Promise.all([
      admin.rpc("list_recoverable_planning_requests", { batch_size: 10 }),
      admin.rpc("list_recoverable_message_extractions", { batch_size: 20 }),
      admin.rpc("list_recoverable_itinerary_generations", { batch_size: 10 }),
    ]);
  for (const id of (planning ?? []) as string[])
    await withSlot(() => drainPlanningSummary(id));
  for (const id of (memory ?? []) as string[])
    await withSlot(() => drainMemoryExtraction(id));
  for (const id of (itinerary ?? []) as string[])
    await withSlot(() => drainItineraryGeneration(id));
  return {
    planning: (planning ?? []).length,
    memory: (memory ?? []).length,
    itinerary: (itinerary ?? []).length,
  };
}
