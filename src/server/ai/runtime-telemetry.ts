import { createHash } from "node:crypto";

import type { TrailieIntent } from "@trailie/schemas";

import type {
  TrailieModelRoute,
  TrailieRequestComplexity,
} from "@/server/ai/model-router";

export type TrailieResponseType =
  | "normal_chat"
  | "context_backed"
  | "tool_backed"
  | "planning_summary"
  | "full_itinerary"
  | "small_revision"
  | "large_revision"
  | "map"
  | "booking"
  | "unsupported";

export type TrailieToolClass =
  | "nps"
  | "ridb"
  | "weather"
  | "maps_geocoding"
  | "directions"
  | "booking_normalization"
  | "approved_search_handoff"
  | "database_read"
  | "database_write"
  | "recovery_workflow";

export type RuntimeSuccessState =
  "success" | "failure" | "cancelled" | "timeout" | "fallback";

type RuntimeStage =
  | "invocationDetection"
  | "permissionCheck"
  | "intentClassification"
  | "contextAssembly"
  | "conversationSummary"
  | "expansion"
  | "validation"
  | "repair"
  | "evidenceBinding"
  | "mapBinding"
  | "bookingBinding"
  | "persistence"
  | "finalRenderReady";

type ToolObservation = {
  durationMs: number;
  cache: "hit" | "miss" | "not_applicable";
  retries: number;
  state: "success" | "failure" | "timeout" | "rate_limited";
};

export type TrailieRuntimeRecord = {
  requestId: string;
  roomIdHash: string;
  responseType: TrailieResponseType;
  detectedIntent: TrailieIntent | null;
  requestComplexity: TrailieRequestComplexity | null;
  selectedModelRoute: TrailieModelRoute | null;
  toolClassesSelected: TrailieToolClass[];
  startedAt: string;
  invocationDetectionMs: number | null;
  permissionCheckMs: number | null;
  intentClassificationMs: number | null;
  contextAssemblyMs: number | null;
  conversationSummaryMs: number | null;
  modelQueueMs: number | null;
  timeToFirstModelTokenMs: number | null;
  timeToFirstVisibleOutputMs: number | null;
  modelGenerationMs: number | null;
  toolCallMs: Partial<Record<TrailieToolClass, number>>;
  toolObservations: Partial<Record<TrailieToolClass, ToolObservation>>;
  providerCallCount: number;
  expansionMs: number | null;
  validationMs: number | null;
  repairMs: number | null;
  repairCount: number;
  evidenceBindingMs: number | null;
  mapBindingMs: number | null;
  bookingBindingMs: number | null;
  persistenceMs: number | null;
  finalRenderReadyMs: number | null;
  totalDurationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCost: number | null;
  cancellationReason: string | null;
  timeoutReason: string | null;
  fallbackReason: string | null;
  successState: RuntimeSuccessState;
};

const durationFields: Record<
  RuntimeStage,
  keyof Pick<
    TrailieRuntimeRecord,
    | "invocationDetectionMs"
    | "permissionCheckMs"
    | "intentClassificationMs"
    | "contextAssemblyMs"
    | "conversationSummaryMs"
    | "expansionMs"
    | "validationMs"
    | "repairMs"
    | "evidenceBindingMs"
    | "mapBindingMs"
    | "bookingBindingMs"
    | "persistenceMs"
    | "finalRenderReadyMs"
  >
> = {
  invocationDetection: "invocationDetectionMs",
  permissionCheck: "permissionCheckMs",
  intentClassification: "intentClassificationMs",
  contextAssembly: "contextAssemblyMs",
  conversationSummary: "conversationSummaryMs",
  expansion: "expansionMs",
  validation: "validationMs",
  repair: "repairMs",
  evidenceBinding: "evidenceBindingMs",
  mapBinding: "mapBindingMs",
  bookingBinding: "bookingBindingMs",
  persistence: "persistenceMs",
  finalRenderReady: "finalRenderReadyMs",
};

function boundedDuration(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.round(value), 0), 3_600_000);
}

function safeReason(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]/g, "_");
  return /^[a-z][a-z0-9_]{0,79}$/.test(normalized) ? normalized : "other";
}

function roomIdHash(roomId: string) {
  return createHash("sha256")
    .update("trailie-runtime-room-v1:")
    .update(roomId)
    .digest("hex");
}

export function createRuntimeTrace(input: {
  requestId: string;
  roomId: string;
  responseType: TrailieResponseType;
  startedAt?: Date;
  monotonicStartedAt?: number;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const monotonicStartedAt = input.monotonicStartedAt ?? now();
  const durations = Object.fromEntries(
    Object.values(durationFields).map((field) => [field, null]),
  ) as Record<(typeof durationFields)[RuntimeStage], number | null>;
  let detectedIntent: TrailieIntent | null = null;
  let requestComplexity: TrailieRequestComplexity | null = null;
  let selectedModelRoute: TrailieModelRoute | null = null;
  let toolClassesSelected: TrailieToolClass[] = [];
  let modelRequestStartedAt: number | null = null;
  let firstModelTokenAt: number | null = null;
  let firstVisibleOutputAt: number | null = null;
  let providerCallCount = 0;
  let modelGenerationDurationMs = 0;
  let repairCount = 0;
  let fallbackReason: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let estimatedCost: number | null = null;
  const toolObservations: Partial<Record<TrailieToolClass, ToolObservation>> =
    {};

  return {
    setRouting(value: {
      intent: TrailieIntent;
      complexity: TrailieRequestComplexity;
      selectedModelRoute: TrailieModelRoute;
      toolClasses: TrailieToolClass[];
    }) {
      detectedIntent = value.intent;
      requestComplexity = value.complexity;
      selectedModelRoute = value.selectedModelRoute;
      toolClassesSelected = [...new Set(value.toolClasses)];
    },
    async measure<T>(stage: RuntimeStage, operation: () => Promise<T>) {
      const startedAt = now();
      try {
        return await operation();
      } finally {
        durations[durationFields[stage]] = boundedDuration(now() - startedAt);
      }
    },
    recordDuration(stage: RuntimeStage, durationMs: number) {
      durations[durationFields[stage]] = boundedDuration(durationMs);
    },
    addDuration(stage: RuntimeStage, durationMs: number) {
      const field = durationFields[stage];
      durations[field] = boundedDuration((durations[field] ?? 0) + durationMs);
    },
    markModelRequestStarted() {
      providerCallCount += 1;
      if (modelRequestStartedAt === null) modelRequestStartedAt = now();
    },
    markFirstModelToken() {
      if (firstModelTokenAt === null) firstModelTokenAt = now();
    },
    markFirstVisibleOutput() {
      if (firstVisibleOutputAt === null) firstVisibleOutputAt = now();
    },
    recordModelCall(
      durationMs: number,
      usage?: { inputTokens?: number | null; outputTokens?: number | null },
      callCount = 1,
    ) {
      providerCallCount += Math.max(Math.min(Math.round(callCount), 100), 1);
      modelGenerationDurationMs += boundedDuration(durationMs);
      if (usage?.inputTokens != null)
        inputTokens = (inputTokens ?? 0) + Math.max(usage.inputTokens, 0);
      if (usage?.outputTokens != null)
        outputTokens = (outputTokens ?? 0) + Math.max(usage.outputTokens, 0);
    },
    recordToolCall(
      toolClass: TrailieToolClass,
      durationMs: number,
      observation: Omit<ToolObservation, "durationMs">,
    ) {
      const previous = toolObservations[toolClass];
      toolObservations[toolClass] = {
        durationMs: boundedDuration((previous?.durationMs ?? 0) + durationMs),
        cache:
          previous?.cache === "miss" || observation.cache === "miss"
            ? "miss"
            : observation.cache,
        retries: Math.min(
          (previous?.retries ?? 0) + Math.max(observation.retries, 0),
          20,
        ),
        state:
          previous?.state && previous.state !== "success"
            ? previous.state
            : observation.state,
      };
    },
    recordRepair(durationMs: number) {
      repairCount += 1;
      durations.repairMs = boundedDuration(
        (durations.repairMs ?? 0) + durationMs,
      );
    },
    recordRepairAttempt(count = 1) {
      repairCount += Math.max(Math.min(Math.round(count), 1), 0);
    },
    recordFallback(reason: string) {
      fallbackReason = safeReason(reason);
    },
    setUsage(value: {
      inputTokens: number | null;
      outputTokens: number | null;
      estimatedCost: number | null;
    }) {
      inputTokens =
        value.inputTokens === null
          ? null
          : Math.max(Math.round(value.inputTokens), 0);
      outputTokens =
        value.outputTokens === null
          ? null
          : Math.max(Math.round(value.outputTokens), 0);
      estimatedCost =
        value.estimatedCost === null ? null : Math.max(value.estimatedCost, 0);
    },
    complete(value: {
      state: RuntimeSuccessState;
      cancellationReason?: string | null;
      timeoutReason?: string | null;
      fallbackReason?: string | null;
    }): TrailieRuntimeRecord {
      const completedAt = now();
      const toolCallMs = Object.fromEntries(
        Object.entries(toolObservations).map(([key, observation]) => [
          key,
          observation.durationMs,
        ]),
      ) as Partial<Record<TrailieToolClass, number>>;
      return {
        requestId: input.requestId,
        roomIdHash: roomIdHash(input.roomId),
        responseType: input.responseType,
        detectedIntent,
        requestComplexity,
        selectedModelRoute,
        toolClassesSelected,
        startedAt: (input.startedAt ?? new Date()).toISOString(),
        ...durations,
        modelQueueMs:
          modelRequestStartedAt !== null && firstModelTokenAt !== null
            ? boundedDuration(firstModelTokenAt - modelRequestStartedAt)
            : null,
        timeToFirstModelTokenMs:
          firstModelTokenAt === null
            ? null
            : boundedDuration(firstModelTokenAt - monotonicStartedAt),
        timeToFirstVisibleOutputMs:
          firstVisibleOutputAt === null
            ? null
            : boundedDuration(firstVisibleOutputAt - monotonicStartedAt),
        modelGenerationMs:
          modelGenerationDurationMs > 0
            ? boundedDuration(modelGenerationDurationMs)
            : modelRequestStartedAt === null
              ? null
              : boundedDuration(completedAt - modelRequestStartedAt),
        toolCallMs,
        toolObservations,
        providerCallCount,
        repairCount,
        totalDurationMs: boundedDuration(completedAt - monotonicStartedAt),
        inputTokens,
        outputTokens,
        estimatedCost,
        cancellationReason: safeReason(value.cancellationReason),
        timeoutReason: safeReason(value.timeoutReason),
        fallbackReason: safeReason(value.fallbackReason) ?? fallbackReason,
        successState: value.state,
      };
    },
  };
}

export type TrailieRuntimeTrace = ReturnType<typeof createRuntimeTrace>;

function percentile(sorted: number[], percentileValue: number) {
  if (sorted.length === 0) return null;
  const index = Math.max(
    Math.ceil((percentileValue / 100) * sorted.length) - 1,
    0,
  );
  return sorted[Math.min(index, sorted.length - 1)] ?? null;
}

export function summarizeRuntimeSamples(samples: readonly number[]) {
  const sorted = samples
    .filter((sample) => Number.isFinite(sample) && sample >= 0)
    .map(boundedDuration)
    .sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    maximum: sorted.at(-1) ?? null,
  };
}
