import "server-only";

import type { ProviderUsage } from "@/server/ai/provider";
import {
  classifyProviderFailure,
  providerFailureCodes,
  ProviderFailure,
  type ProviderFailureCode,
} from "@/server/ai/reliability-policy";

export type DurableProviderWorkflow =
  | "focused_answer"
  | "memory_extraction"
  | "planning_summary"
  | "itinerary_generation"
  | "itinerary_repair"
  | "revision_analysis"
  | "revision_candidate"
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
  ): Promise<void>;
};

type RunInput<T> = {
  workflow: DurableProviderWorkflow;
  operationKey: string;
  attempt: number;
  model: string;
  leaseMs: number;
  quotaReservationId?: string | null;
  execute(input: {
    attemptId: string;
    leaseOwner: string;
  }): Promise<ProviderAttemptExecutionResult<T>>;
  parse(value: unknown): T;
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
      });
      if (claim.applied)
        return { status: "already_applied" as const, recovered: false };
      if (!claim.claimed)
        return { status: "owned_elsewhere" as const, recovered: false };

      let staged = claim.resultAvailable;
      try {
        let result: ProviderAttemptExecutionResult<T>;
        if (claim.resultAvailable) {
          const loaded = await dependencies.load(claim.attemptId, leaseOwner);
          result = { ...loaded, value: input.parse(loaded.value) };
        } else {
          result = await input.execute({
            attemptId: claim.attemptId,
            leaseOwner,
          });
          await dependencies.stage(claim.attemptId, leaseOwner, result);
          staged = true;
        }
        await input.apply(result.value, result);
        await dependencies.markApplied(claim.attemptId, leaseOwner);
        return {
          status: "applied" as const,
          recovered: claim.recovered,
          attemptId: claim.attemptId,
          result,
        };
      } catch (error) {
        if (staged)
          throw new ProviderFailure("recovery_required", { cause: error });
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
          );
          throw error;
        }
        const failure = classifyProviderFailure(error);
        await dependencies.fail(
          claim.attemptId,
          leaseOwner,
          failure.code,
          failure.retryable,
        );
        throw failure;
      }
    },
  };
}

export type DurableProviderAttemptController<T> = ReturnType<
  typeof createDurableProviderAttemptController<T>
>;
