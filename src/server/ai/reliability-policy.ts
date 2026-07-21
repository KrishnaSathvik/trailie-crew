import "server-only";

import { z } from "zod";

type EnvironmentSource = Record<string, string | undefined>;

export const providerFailureCodes = [
  "model_timeout",
  "model_unavailable",
  "model_rate_limited",
  "invalid_model_output",
  "workflow_deadline_exceeded",
  "retry_exhausted",
  "recovery_required",
  "workflow_cancelled",
] as const;

export type ProviderFailureCode = (typeof providerFailureCodes)[number];

export type ProviderFailureMetadata = {
  statusCode: number | null;
  requestId: string | null;
  retryAfterMs: number | null;
};

const retryableFailureCodes = new Set<ProviderFailureCode>([
  "model_timeout",
  "model_unavailable",
  "model_rate_limited",
]);

const quotaRejectionCodes = new Set([
  "ai_disabled",
  "user_ai_limit_reached",
  "room_ai_limit_reached",
  "global_ai_limit_reached",
  "provider_budget_unavailable",
]);

function isQuotaRejection(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    quotaRejectionCodes.has(error.code)
  );
}

export class ProviderFailure extends Error {
  readonly retryable: boolean;
  readonly statusCode: number | null;
  readonly requestId: string | null;
  readonly retryAfterMs: number | null;

  constructor(
    readonly code: ProviderFailureCode,
    options: {
      cause?: unknown;
      statusCode?: number | null;
      requestId?: string | null;
      retryAfterMs?: number | null;
    } = {},
  ) {
    super(code, options);
    this.name = "ProviderFailure";
    this.retryable = retryableFailureCodes.has(code);
    this.statusCode = options.statusCode ?? null;
    this.requestId = options.requestId ?? null;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

const boundedInteger = (minimum: number, maximum: number, fallback: number) =>
  z.coerce.number().int().min(minimum).max(maximum).default(fallback);

const reliabilityEnvironmentSchema = z
  .object({
    AI_TIMEOUT_FOCUSED_MS: boundedInteger(5_000, 120_000, 30_000),
    AI_TIMEOUT_MEMORY_MS: boundedInteger(5_000, 60_000, 20_000),
    AI_TIMEOUT_PLANNING_MS: boundedInteger(10_000, 120_000, 90_000),
    AI_TIMEOUT_ITINERARY_GENERATION_MS: boundedInteger(
      30_000,
      240_000,
      180_000,
    ),
    AI_TIMEOUT_ITINERARY_REPAIR_MS: boundedInteger(30_000, 240_000, 120_000),
    AI_TIMEOUT_REVISION_ANALYSIS_MS: boundedInteger(10_000, 120_000, 60_000),
    AI_TIMEOUT_REVISION_GENERATION_MS: boundedInteger(30_000, 240_000, 180_000),
    AI_TOTAL_WORKFLOW_DEADLINE_MS: boundedInteger(30_000, 300_000, 300_000),
    AI_RECOVERY_LEASE_MS: boundedInteger(60_000, 900_000, 360_000),
    AI_MAXIMUM_ATTEMPTS: boundedInteger(1, 3, 2),
    AI_RETRY_BASE_MS: boundedInteger(100, 5_000, 500),
    AI_RETRY_MAXIMUM_MS: boundedInteger(100, 30_000, 5_000),
    AI_RETRY_JITTER_RATIO: z.coerce.number().min(0).max(0.5).default(0.2),
  })
  .refine((value) => value.AI_RETRY_BASE_MS <= value.AI_RETRY_MAXIMUM_MS, {
    message: "AI retry base must not exceed the maximum.",
  });

export type WorkflowReliabilityPolicy = ReturnType<
  typeof parseWorkflowReliabilityPolicy
>;
export type WorkflowProviderStage =
  keyof WorkflowReliabilityPolicy["timeoutsMs"];

const planningPerformanceCapsMs: Partial<
  Record<WorkflowProviderStage, number>
> = {
  planningProvider: 18_000,
  itineraryGeneration: 45_000,
  itineraryRepair: 20_000,
};

export function performanceStageTimeout(
  stage: WorkflowProviderStage,
  configuredTimeoutMs: number,
) {
  return Math.min(
    configuredTimeoutMs,
    planningPerformanceCapsMs[stage] ?? configuredTimeoutMs,
  );
}

export function parseWorkflowReliabilityPolicy(source: EnvironmentSource) {
  const values = reliabilityEnvironmentSchema.parse({
    ...source,
    AI_TIMEOUT_FOCUSED_MS:
      source.AI_TIMEOUT_FOCUSED_MS ?? source.OPENAI_TIMEOUT_MS,
    AI_TIMEOUT_MEMORY_MS:
      source.AI_TIMEOUT_MEMORY_MS ?? source.OPENAI_MEMORY_TIMEOUT_MS,
    AI_TIMEOUT_PLANNING_MS:
      source.AI_TIMEOUT_PLANNING_MS ?? source.OPENAI_PLANNING_TIMEOUT_MS,
    AI_TIMEOUT_ITINERARY_GENERATION_MS:
      source.AI_TIMEOUT_ITINERARY_GENERATION_MS ??
      source.OPENAI_ITINERARY_TIMEOUT_MS,
    AI_TIMEOUT_ITINERARY_REPAIR_MS:
      source.AI_TIMEOUT_ITINERARY_REPAIR_MS ??
      source.OPENAI_ITINERARY_TIMEOUT_MS,
    AI_TIMEOUT_REVISION_GENERATION_MS:
      source.AI_TIMEOUT_REVISION_GENERATION_MS ??
      source.OPENAI_ITINERARY_TIMEOUT_MS,
  });
  return {
    timeoutsMs: {
      focusedProvider: values.AI_TIMEOUT_FOCUSED_MS,
      memoryProvider: values.AI_TIMEOUT_MEMORY_MS,
      planningProvider: values.AI_TIMEOUT_PLANNING_MS,
      itineraryGeneration: values.AI_TIMEOUT_ITINERARY_GENERATION_MS,
      itineraryRepair: values.AI_TIMEOUT_ITINERARY_REPAIR_MS,
      revisionAnalysis: values.AI_TIMEOUT_REVISION_ANALYSIS_MS,
      revisionGeneration: values.AI_TIMEOUT_REVISION_GENERATION_MS,
    },
    totalWorkflowDeadlineMs: values.AI_TOTAL_WORKFLOW_DEADLINE_MS,
    recoveryLeaseMs: values.AI_RECOVERY_LEASE_MS,
    maximumAttempts: values.AI_MAXIMUM_ATTEMPTS,
    backoff: {
      baseMs: values.AI_RETRY_BASE_MS,
      maximumMs: values.AI_RETRY_MAXIMUM_MS,
      jitterRatio: values.AI_RETRY_JITTER_RATIO,
    },
  } as const;
}

function safeStatus(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  const record = error as Record<string, unknown>;
  const status =
    typeof record.status === "number"
      ? record.status
      : typeof record.statusCode === "number"
        ? record.statusCode
        : null;
  if (
    status !== null &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
  )
    return status;
  return null;
}

function safeRequestId(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  const record = error as Record<string, unknown>;
  const value =
    typeof record.requestID === "string"
      ? record.requestID
      : typeof record.request_id === "string"
        ? record.request_id
        : typeof record.requestId === "string"
          ? record.requestId
          : null;
  return value && value.length <= 200 && /^[a-zA-Z0-9_.:-]+$/.test(value)
    ? value
    : null;
}

function safeRetryAfterMs(error: unknown) {
  if (typeof error !== "object" || error === null) return null;
  const value = (error as Record<string, unknown>).retryAfterMs;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(Math.round(value), 30_000)
    : null;
}

function safeProviderIdentifier(value: unknown) {
  return typeof value === "string" &&
    value.length <= 200 &&
    /^[a-zA-Z0-9_.:-]+$/.test(value)
    ? value
    : null;
}

function errorHeaders(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "headers" in error &&
    error.headers instanceof Headers
  )
    return error.headers;
  return null;
}

export function parseRetryAfter(
  value: string | null | undefined,
  options: { now?: number; maximumMs: number },
) {
  if (value === null || value === undefined || !value.trim()) return null;
  const now = options.now ?? Date.now();
  const seconds = Number(value);
  const rawDelay = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(value) - now;
  if (!Number.isFinite(rawDelay) || rawDelay < 0) return null;
  return Math.min(Math.round(rawDelay), Math.max(options.maximumMs, 0));
}

export function normalizeProviderError(error: unknown): ProviderFailure {
  if (error instanceof ProviderFailure) return error;
  const statusCode = safeStatus(error);
  const headers = errorHeaders(error);
  const retryAfterMilliseconds = Number(headers?.get("retry-after-ms"));
  const retryAfterMs = headers?.get("retry-after-ms")
    ? Number.isFinite(retryAfterMilliseconds) && retryAfterMilliseconds >= 0
      ? Math.min(Math.round(retryAfterMilliseconds), 30_000)
      : null
    : (parseRetryAfter(headers?.get("retry-after"), {
        maximumMs: 30_000,
      }) ?? safeRetryAfterMs(error));
  const metadata = {
    statusCode,
    requestId:
      safeRequestId(error) ??
      safeProviderIdentifier(headers?.get("x-request-id")),
    retryAfterMs,
  };
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : null;
  if (statusCode === 429)
    return new ProviderFailure("model_rate_limited", {
      cause: error,
      ...metadata,
    });
  if (statusCode !== null && statusCode >= 500)
    return new ProviderFailure("model_unavailable", {
      cause: error,
      ...metadata,
    });
  if (code === "openai_timeout")
    return new ProviderFailure("model_timeout", { cause: error, ...metadata });
  if (code === "openai_rate_limited")
    return new ProviderFailure("model_rate_limited", {
      cause: error,
      ...metadata,
    });
  if (code === "invalid_model_response")
    return new ProviderFailure("invalid_model_output", {
      cause: error,
      ...metadata,
    });
  if (code === "openai_unavailable")
    return new ProviderFailure("model_unavailable", {
      cause: error,
      ...metadata,
    });
  if (providerFailureCodes.includes(code as ProviderFailureCode))
    return new ProviderFailure(code as ProviderFailureCode, {
      cause: error,
      ...metadata,
    });
  const errorName =
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
      ? error.name
      : null;
  if (errorName === "TimeoutError")
    return new ProviderFailure("model_timeout", { cause: error, ...metadata });
  if (errorName === "AbortError")
    return new ProviderFailure("recovery_required", {
      cause: error,
      ...metadata,
    });
  return new ProviderFailure("model_unavailable", {
    cause: error,
    ...metadata,
  });
}

export const classifyProviderFailure = normalizeProviderError;

export function computeRetryDelay(
  policy: WorkflowReliabilityPolicy,
  attempt: number,
  random: () => number = Math.random,
) {
  const exponential = Math.min(
    policy.backoff.baseMs * 2 ** Math.max(attempt - 1, 0),
    policy.backoff.maximumMs,
  );
  const jitterMultiplier =
    1 +
    (Math.min(Math.max(random(), 0), 1) * 2 - 1) * policy.backoff.jitterRatio;
  return Math.round(exponential * jitterMultiplier);
}

export function computeProviderRetryDelay(input: {
  policy: WorkflowReliabilityPolicy;
  attempt: number;
  retryAfterMs?: number | null;
  remainingWorkflowMs: number;
  random?: () => number;
}) {
  const advised =
    input.retryAfterMs === null || input.retryAfterMs === undefined
      ? null
      : Math.min(
          Math.max(Math.round(input.retryAfterMs), 0),
          input.policy.backoff.maximumMs,
        );
  const delay =
    advised ??
    computeRetryDelay(input.policy, input.attempt, input.random ?? Math.random);
  return delay >= input.remainingWorkflowMs ? null : delay;
}

export function remainingProviderTimeout(
  policy: WorkflowReliabilityPolicy,
  stage: WorkflowProviderStage,
  workflowStartedAt: number,
  now = Date.now(),
) {
  const remaining =
    policy.totalWorkflowDeadlineMs - Math.max(now - workflowStartedAt, 0);
  if (remaining <= 0) throw new ProviderFailure("workflow_deadline_exceeded");
  return Math.min(policy.timeoutsMs[stage], remaining);
}

type ProviderOperationInput<T> = {
  policy: WorkflowReliabilityPolicy;
  stage: WorkflowProviderStage;
  operation: (metadata: {
    signal: AbortSignal;
    attempt: number;
    retryCount: number;
  }) => Promise<T>;
  signal?: AbortSignal;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function runProviderOperation<T>(
  input: ProviderOperationInput<T>,
) {
  const now = input.now ?? Date.now;
  const startedAt = now();
  let attempt = 0;

  while (attempt < input.policy.maximumAttempts) {
    if (input.signal?.aborted)
      throw new ProviderFailure("workflow_cancelled", {
        cause: input.signal.reason,
      });

    attempt += 1;
    const elapsedBeforeAttempt = attempt === 1 ? 0 : now() - startedAt;
    const remainingMs = remainingProviderTimeout(
      input.policy,
      input.stage,
      startedAt,
      startedAt + elapsedBeforeAttempt,
    );

    const timeoutSignal = AbortSignal.timeout(Math.max(1, remainingMs));
    const signal = input.signal
      ? AbortSignal.any([input.signal, timeoutSignal])
      : timeoutSignal;

    try {
      const value = await input.operation({
        signal,
        attempt,
        retryCount: attempt - 1,
      });
      return {
        value,
        attemptCount: attempt,
        retryCount: attempt - 1,
        totalDurationMs: Math.max(now() - startedAt, 0),
      };
    } catch (error) {
      if (input.signal?.aborted)
        throw new ProviderFailure("workflow_cancelled", {
          cause: input.signal.reason,
        });
      if (isQuotaRejection(error)) throw error;
      const failure = timeoutSignal.aborted
        ? new ProviderFailure("model_timeout", { cause: error })
        : classifyProviderFailure(error);
      if (!failure.retryable) throw failure;
      if (attempt >= input.policy.maximumAttempts)
        throw new ProviderFailure("retry_exhausted", { cause: failure });

      const elapsed = Math.max(now() - startedAt, 0);
      const delay = computeRetryDelay(
        input.policy,
        attempt,
        input.random ?? Math.random,
      );
      if (elapsed + delay >= input.policy.totalWorkflowDeadlineMs)
        throw new ProviderFailure("workflow_deadline_exceeded", {
          cause: failure,
        });
      await (input.sleep ?? defaultSleep)(delay);
    }
  }

  throw new ProviderFailure("retry_exhausted");
}
