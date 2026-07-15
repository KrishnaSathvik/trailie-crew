import "server-only";
import { after } from "next/server";
import { parseOpenAIEnv, requireAiGeneration } from "@/server/env";
import { createSafetyIdentifier } from "@/server/ai/safety-identifier";
import { resolveAiQuotaSubject } from "@/server/ai/quota";
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
  const provider =
    env.provider === "fake"
      ? createFakePlanningSummaryProvider()
      : createOpenAIPlanningSummaryProvider({
          apiKey: env.apiKey!,
          timeoutMs: env.planningTimeoutMs,
        });
  const quotaSubject = await resolveAiQuotaSubject("planning", id);
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
    quotaSubject,
  });
}
export function schedulePlanningSummary(id: string) {
  after(() => withSlot(() => drainPlanningSummary(id)).catch(() => undefined));
}
