import "server-only";

import type { ProviderUsage } from "@/server/ai/provider";
import { tryDeliverOperationalAlert } from "@/server/operations/alerts";
import {
  classifyProviderFailure,
  computeProviderRetryDelay,
  providerFailureCodes,
  ProviderFailure,
  remainingProviderTimeout,
  type ProviderFailureCode,
  type WorkflowProviderStage,
  type WorkflowReliabilityPolicy,
} from "@/server/ai/reliability-policy";

export type DurableProviderWorkflow =
  | "focused_answer"
  | "memory_extraction"
  | "planning_summary"
  | "itinerary_generation"
  | "itinerary_repair"
  | "revision_analysis"
  | "revision_patch"
  | "revision_candidate"
  | "revision_scope_repair"
  | "revision_repair";

export type ProviderAttemptExecutionResult<T> = {
  value: T;
  responseId: string | null;
  requestId: string | null;
  usage: ProviderUsage;
  providerDurationMs: number;
  totalDurationMs: number;
  retryCount: number;
  repairCount: number;
};

type ClaimResult = {
  attemptId: string;
  claimed: boolean;
  resultAvailable: boolean;
  applied: boolean;
  recovered: boolean;
};

export type ProviderAttemptDependencies<T> = {
  createLeaseOwner(): string;
  claim(input: {
    workflow: DurableProviderWorkflow;
    operationKey: string;
    attempt: number;
    model: string;
    leaseOwner: string;
    leaseMs: number;
    quotaReservationId: string | null;
    correlationId?: string;
  }): Promise<ClaimResult>;
  stage(
    attemptId: string,
    leaseOwner: string,
    result: ProviderAttemptExecutionResult<T>,
  ): Promise<void>;
  load(
    attemptId: string,
    leaseOwner: string,
  ): Promise<ProviderAttemptExecutionResult<unknown>>;
  markApplied(attemptId: string, leaseOwner: string): Promise<void>;
  fail(
    attemptId: string,
    leaseOwner: string,
    code: string,
    retryable: boolean,
    metadata?: {
      statusCode?: number | null;
      retryAfterMs?: number | null;
      requestId?: string | null;
      nextRetryAt?: string | null;
      providerDurationMs?: number;
      totalDurationMs?: number;
    },
  ): Promise<void>;
};

type RunInput<T> = {
  workflow: DurableProviderWorkflow;
  operationKey: string;
  attempt: number;
  model: string;
  leaseMs: number;
  quotaReservationId?: string | null;
  correlationId?: string;
  workflowStartedAt?: number;
  now?: () => number;
  execute(input: {
    attemptId: string;
    leaseOwner: string;
  }): Promise<ProviderAttemptExecutionResult<T>>;
  parse(value: unknown): T;
  afterStage?(result: ProviderAttemptExecutionResult<T>): Promise<void>;
  apply(value: T, result: ProviderAttemptExecutionResult<T>): Promise<void>;
};

export function createDurableProviderAttemptController<T>(
  dependencies: ProviderAttemptDependencies<T>,
) {
  return {
    async run(input: RunInput<T>) {
      const leaseOwner = dependencies.createLeaseOwner();
      const claim = await dependencies.claim({
        workflow: input.workflow,
        operationKey: input.operationKey,
        attempt: input.attempt,
        model: input.model,
        leaseOwner,
        leaseMs: input.leaseMs,
        quotaReservationId: input.quotaReservationId ?? null,
        correlationId: input.correlationId,
      });
      if (claim.applied)
        return { status: "already_applied" as const, recovered: false };
      if (!claim.claimed)
        return { status: "owned_elsewhere" as const, recovered: false };
      if (claim.recovered)
        await tryDeliverOperationalAlert("provider.attempt_lease_recovered", {
          workflow: input.workflow,
          status: "warning",
          counts: { recoveryCount: 1, attemptCount: input.attempt },
        });

      let staged = claim.resultAvailable;
      const now = input.now ?? Date.now;
      let providerStartedAt: number | null = null;
      try {
        let result: ProviderAttemptExecutionResult<T>;
        if (claim.resultAvailable) {
          const loaded = await dependencies.load(claim.attemptId, leaseOwner);
          result = { ...loaded, value: input.parse(loaded.value) };
        } else {
          providerStartedAt = now();
          result = await input.execute({
            attemptId: claim.attemptId,
            leaseOwner,
          });
          await dependencies.stage(claim.attemptId, leaseOwner, result);
          staged = true;
        }
        await input.afterStage?.(result);
        await input.apply(result.value, result);
        await dependencies.markApplied(claim.attemptId, leaseOwner);
        return {
          status: "applied" as const,
          recovered: claim.recovered,
          attemptId: claim.attemptId,
          result,
        };
      } catch (error) {
        if (staged) {
          await tryDeliverOperationalAlert(
            "provider.application_failed_after_success",
            {
              workflow: input.workflow,
              status: "error",
              errorCode: "recovery_required",
              counts: { attemptCount: input.attempt },
            },
          );
          throw new ProviderFailure("recovery_required", { cause: error });
        }
        const operationalCode =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string" &&
          /^[a-z][a-z0-9_]{0,79}$/.test(error.code)
            ? error.code
            : null;
        if (
          operationalCode &&
          !providerFailureCodes.includes(
            operationalCode as ProviderFailureCode,
          ) &&
          ![
            "openai_timeout",
            "openai_rate_limited",
            "openai_unavailable",
            "invalid_model_response",
          ].includes(operationalCode)
        ) {
          await dependencies.fail(
            claim.attemptId,
            leaseOwner,
            operationalCode,
            false,
            {
              statusCode: null,
              retryAfterMs: null,
              requestId: null,
              nextRetryAt: null,
              providerDurationMs:
                providerStartedAt === null
                  ? 0
                  : Math.max(now() - providerStartedAt, 0),
              totalDurationMs: Math.max(
                now() - (input.workflowStartedAt ?? providerStartedAt ?? now()),
                0,
              ),
            },
          );
          await tryDeliverOperationalAlert("quota.rejected", {
            workflow: input.workflow,
            status: "rejected",
            errorCode: operationalCode,
          });
          throw error;
        }
        const failure = classifyProviderFailure(error);
        await dependencies.fail(
          claim.attemptId,
          leaseOwner,
          failure.code,
          failure.retryable,
          {
            statusCode: failure.statusCode,
            retryAfterMs: failure.retryAfterMs,
            requestId: failure.requestId,
            nextRetryAt: failure.retryable
              ? new Date(
                  Date.now() + Math.max(failure.retryAfterMs ?? 500, 0),
                ).toISOString()
              : null,
            providerDurationMs:
              providerStartedAt === null
                ? 0
                : Math.max(now() - providerStartedAt, 0),
            totalDurationMs: Math.max(
              now() - (input.workflowStartedAt ?? providerStartedAt ?? now()),
              0,
            ),
          },
        );
        await tryDeliverOperationalAlert("provider.failed", {
          workflow: input.workflow,
          status: "error",
          errorCode: failure.code,
        });
        if (failure.statusCode === 503 && input.attempt > 1)
          await tryDeliverOperationalAlert("provider.repeated_503", {
            workflow: input.workflow,
            status: "error",
            errorCode: failure.code,
            counts: { attemptCount: input.attempt },
          });
        throw failure;
      }
    },
  };
}

export type DurableProviderAttemptController<T> = ReturnType<
  typeof createDurableProviderAttemptController<T>
>;

type DurableOperationInput<T> = {
  controller: DurableProviderAttemptController<T>;
  workflow: DurableProviderWorkflow;
  operationKey: string;
  model: string;
  stage: WorkflowProviderStage;
  policy: WorkflowReliabilityPolicy;
  initialAttempt?: number;
  quotaReservationId?: string | null;
  signal?: AbortSignal;
  correlationId?: string;
  execute(input: {
    attemptId: string;
    leaseOwner: string;
    attempt: number;
    retryCount: number;
    signal: AbortSignal;
  }): Promise<ProviderAttemptExecutionResult<T>>;
  parse(value: unknown): T;
  afterStage?(result: ProviderAttemptExecutionResult<T>): Promise<void>;
  apply(value: T, result: ProviderAttemptExecutionResult<T>): Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function runDurableProviderOperation<T>(
  input: DurableOperationInput<T>,
) {
  const now = input.now ?? Date.now;
  const startedAt = now();
  for (
    let attempt = input.initialAttempt ?? 1;
    attempt <= input.policy.maximumAttempts;
    attempt += 1
  ) {
    if (input.signal?.aborted)
      throw new ProviderFailure("workflow_cancelled", {
        cause: input.signal.reason,
      });
    const timeoutMs = remainingProviderTimeout(
      input.policy,
      input.stage,
      startedAt,
      now(),
    );
    const timeoutSignal = AbortSignal.timeout(Math.max(timeoutMs, 1));
    const signal = input.signal
      ? AbortSignal.any([input.signal, timeoutSignal])
      : timeoutSignal;
    try {
      const outcome = await input.controller.run({
        workflow: input.workflow,
        operationKey: input.operationKey,
        attempt,
        model: input.model,
        leaseMs: input.policy.recoveryLeaseMs,
        quotaReservationId: input.quotaReservationId,
        correlationId: input.correlationId,
        workflowStartedAt: startedAt,
        now,
        execute: async ({ attemptId, leaseOwner }) => {
          const result = await input.execute({
            attemptId,
            leaseOwner,
            attempt,
            retryCount: attempt - 1,
            signal,
          });
          return { ...result, retryCount: attempt - 1 };
        },
        parse: input.parse,
        afterStage: input.afterStage,
        apply: input.apply,
      });
      if (outcome.status === "applied")
        return {
          ...outcome,
          result: { ...outcome.result, retryCount: attempt - 1 },
        };
      return outcome;
    } catch (error) {
      if (input.signal?.aborted)
        throw new ProviderFailure("workflow_cancelled", {
          cause: input.signal.reason,
        });
      const failure = timeoutSignal.aborted
        ? new ProviderFailure("model_timeout", { cause: error })
        : classifyProviderFailure(error);
      if (!failure.retryable) throw failure;
      if (attempt >= input.policy.maximumAttempts) {
        await tryDeliverOperationalAlert("provider.retry_exhausted", {
          workflow: input.workflow,
          status: "error",
          errorCode: "retry_exhausted",
          counts: { attemptCount: attempt, retryCount: attempt - 1 },
        });
        throw new ProviderFailure("retry_exhausted", {
          cause: failure,
          statusCode: failure.statusCode,
          requestId: failure.requestId,
          retryAfterMs: failure.retryAfterMs,
        });
      }
      const elapsed = Math.max(now() - startedAt, 0);
      const delay = computeProviderRetryDelay({
        policy: input.policy,
        attempt,
        retryAfterMs: failure.retryAfterMs,
        remainingWorkflowMs: input.policy.totalWorkflowDeadlineMs - elapsed,
        random: input.random,
      });
      if (delay === null)
        throw new ProviderFailure("workflow_deadline_exceeded", {
          cause: failure,
        });
      await (input.sleep ?? sleep)(delay);
    }
  }
  throw new ProviderFailure("retry_exhausted");
}
