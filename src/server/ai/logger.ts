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
  providerLatencyMs?: number;
  totalWorkflowLatencyMs?: number;
  retryCount?: number;
  attemptCount?: number;
  providerStatus?: string | number | null;
  recoveryCount?: number;
  quotaStatus?: string;
  detectedIntent?: string;
  selectedTools?: readonly string[];
  contextSections?: readonly string[];
  responseContractVersion?: string;
  validationResult?: "pass" | "failed";
  repairCount?: number;
};

export function logAiEvent(event: string, metadata: SafeAiLog) {
  logOperation(`trailie_ai.${event}`, {
    correlationId: metadata.invocationId ?? metadata.runId ?? "unavailable",
    status: metadata.status ?? event,
    errorCode: metadata.errorCode ?? null,
    latencyMs: metadata.latencyMs,
    providerLatencyMs: metadata.providerLatencyMs,
    totalWorkflowLatencyMs: metadata.totalWorkflowLatencyMs,
    model: metadata.model,
    promptVersion: metadata.promptVersion,
    runId: metadata.runId,
    retryCount: metadata.retryCount,
    attemptCount: metadata.attemptCount,
    providerStatus: metadata.providerStatus,
    recoveryCount: metadata.recoveryCount,
    quotaStatus: metadata.quotaStatus,
    detectedIntent: metadata.detectedIntent,
    selectedTools: metadata.selectedTools,
    contextSections: metadata.contextSections,
    responseContractVersion: metadata.responseContractVersion,
    validationResult: metadata.validationResult,
    repairCount: metadata.repairCount,
  });
}
