import "server-only";

import { after } from "next/server";
import { drainMemoryExtraction } from "./worker";
import { createMemoryRepository } from "./repository";
import { parseOpenAIEnv } from "@/server/env";

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

export function scheduleMemoryExtraction(messageId: string) {
  after(() =>
    withSlot(() => drainMemoryExtraction(messageId)).catch(() => undefined),
  );
}

export async function enqueueMemoryExtraction(messageId: string) {
  const environment = parseOpenAIEnv(process.env);
  const repository = createMemoryRepository({
    model: environment.memoryModel,
    promptVersion: environment.memoryPromptVersion,
    schemaVersion: environment.memorySchemaVersion,
  });
  if (repository.enqueue) await repository.enqueue(messageId);
}
