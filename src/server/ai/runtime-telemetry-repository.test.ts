import { describe, expect, it, vi } from "vitest";

import type { TrailieRuntimeRecord } from "./runtime-telemetry";
import { createRuntimeTelemetryRepository } from "./runtime-telemetry-repository";

const record: TrailieRuntimeRecord = {
  requestId: "8b000000-0000-4000-8000-000000000001",
  roomIdHash: "a".repeat(64),
  responseType: "normal_chat",
  detectedIntent: "direct_question",
  requestComplexity: "simple",
  selectedModelRoute: "fast",
  toolClassesSelected: [],
  startedAt: "2026-07-20T18:00:00.000Z",
  invocationDetectionMs: 1,
  permissionCheckMs: 2,
  intentClassificationMs: 1,
  contextAssemblyMs: 3,
  conversationSummaryMs: null,
  modelQueueMs: 8,
  timeToFirstModelTokenMs: 15,
  timeToFirstVisibleOutputMs: 4,
  modelGenerationMs: 30,
  toolCallMs: {},
  toolObservations: {},
  providerCallCount: 1,
  validationMs: 2,
  expansionMs: null,
  repairMs: null,
  repairCount: 0,
  evidenceBindingMs: null,
  mapBindingMs: null,
  bookingBindingMs: null,
  persistenceMs: 3,
  finalRenderReadyMs: 1,
  totalDurationMs: 40,
  inputTokens: 100,
  outputTokens: 30,
  estimatedCost: null,
  cancellationReason: null,
  timeoutReason: null,
  fallbackReason: null,
  successState: "success",
};

describe("runtime telemetry repository", () => {
  it("passes only the typed record to the narrow service RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const repository = createRuntimeTelemetryRepository({ rpc });
    await repository.record(record);
    expect(rpc).toHaveBeenCalledWith("record_ai_runtime_telemetry", {
      payload: record,
    });
  });

  it("fails closed without including database details in the error", async () => {
    const repository = createRuntimeTelemetryRepository({
      rpc: vi.fn().mockResolvedValue({
        error: { message: "raw database details" },
      }),
    });
    await expect(repository.record(record)).rejects.toThrow(
      "runtime_telemetry_unavailable",
    );
  });

  it("records a bounded Phase 8D expansion duration after the base telemetry row", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const repository = createRuntimeTelemetryRepository({ rpc });
    await repository.record({ ...record, expansionMs: 7 });
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "record_ai_runtime_expansion_metric",
      {
        target_request_id: record.requestId,
        target_expansion_ms: 7,
      },
    );
  });
});
