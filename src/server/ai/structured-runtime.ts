import type { TrailieIntent } from "@trailie/schemas";

import type {
  TrailieModelRoute,
  TrailieRequestComplexity,
} from "./model-router";
import {
  createRuntimeTrace,
  type TrailieResponseType,
  type TrailieRuntimeRecord,
  type TrailieToolClass,
} from "./runtime-telemetry";
import { createRuntimeTelemetryRepository } from "./runtime-telemetry-repository";

type RuntimeRecorder = {
  record(record: TrailieRuntimeRecord): Promise<void>;
};

function safeErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  )
    return error.code;
  return error instanceof Error ? error.message : "unknown_failure";
}

export async function runStructuredRuntime<T>(
  input: {
    requestId: string;
    roomId: string;
    responseType: TrailieResponseType;
    intent: TrailieIntent;
    complexity: TrailieRequestComplexity;
    selectedModelRoute: TrailieModelRoute;
    toolClasses: TrailieToolClass[];
  },
  operation: () => Promise<T>,
  recorder: RuntimeRecorder = createRuntimeTelemetryRepository(),
) {
  const startedAt = Date.now();
  const trace = createRuntimeTrace({
    requestId: input.requestId,
    roomId: input.roomId,
    responseType: input.responseType,
    startedAt: new Date(startedAt),
    monotonicStartedAt: startedAt,
  });
  trace.setRouting({
    intent: input.intent,
    complexity: input.complexity,
    selectedModelRoute: input.selectedModelRoute,
    toolClasses: input.toolClasses,
  });
  try {
    const result = await operation();
    await recorder.record(trace.complete({ state: "success" })).catch(() => {});
    return result;
  } catch (error) {
    const code = safeErrorCode(error);
    const cancelled =
      code === "workflow_cancelled" || code === "invocation_cancelled";
    const timedOut =
      code === "model_timeout" || code === "workflow_deadline_exceeded";
    await recorder
      .record(
        trace.complete({
          state: cancelled ? "cancelled" : timedOut ? "timeout" : "failure",
          cancellationReason: cancelled ? "user_stop" : null,
          timeoutReason: timedOut ? code : null,
        }),
      )
      .catch(() => {});
    throw error;
  }
}
