import "server-only";

import { after } from "next/server";
import { drainMemoryExtraction } from "./worker";

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
