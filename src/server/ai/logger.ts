import "server-only";

import { logOperation } from "@/server/operations/logger";

type SafeAiLog = {
  invocationId?: string;
  runId?: string;
  model?: string;
  promptVersion?: string;
  status?: string;
  errorCode?: string;
  latencyMs?: number;
  retryCount?: number;
};

export function logAiEvent(event: string, metadata: SafeAiLog) {
  logOperation(`trailie_ai.${event}`, {
    correlationId: metadata.invocationId ?? metadata.runId ?? "unavailable",
    status: metadata.status ?? event,
    errorCode: metadata.errorCode ?? null,
    latencyMs: metadata.latencyMs,
    model: metadata.model,
    promptVersion: metadata.promptVersion,
    runId: metadata.runId,
    retryCount: metadata.retryCount,
  });
}
