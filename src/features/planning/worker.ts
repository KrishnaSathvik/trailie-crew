import "server-only";
import { createHash } from "node:crypto";
import { planningSummarySchema, type PlanningSummary } from "@trailie/schemas";
import { computePlanningReadiness } from "./readiness";
import { buildPlanningContext } from "./context";
import {
  PlanningProviderError,
  type PlanningSummaryProvider,
} from "./provider";
import type { PlanningRepository } from "./repository";
import {
  AiQuotaError,
  runWithAiQuota,
  type AiQuotaSubject,
} from "@/server/ai/quota";
import {
  computeRetryDelay,
  parseWorkflowReliabilityPolicy,
  remainingProviderTimeout,
  type WorkflowReliabilityPolicy,
} from "@/server/ai/reliability-policy";
import {
  type DurableProviderAttemptController,
  type ProviderAttemptExecutionResult,
} from "@/server/ai/provider-attempts";

type Dependencies = {
  repository: PlanningRepository;
  provider: PlanningSummaryProvider;
  safetyIdentifier: string;
  model?: string;
  timeoutMs?: number;
  quotaSubject?: AiQuotaSubject;
  reliabilityPolicy?: WorkflowReliabilityPolicy;
  retry?: {
    sleep: (milliseconds: number) => Promise<void>;
    random?: () => number;
  };
  providerAttempts?: DurableProviderAttemptController<PlanningSummary>;
};
const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
export async function processPlanningSummary(id: string, deps: Dependencies) {
  const policy = deps.reliabilityPolicy ?? parseWorkflowReliabilityPolicy({});
  const workflowStartedAt = Date.now();
  for (;;) {
    const claim = await deps.repository.claim(id);
    if (!claim.claimed) return;
    const context = await deps.repository.loadContext(id);
    const started = Date.now();
    try {
      const summarize = () =>
        deps.provider.summarize({
          operationKey: `${id}:${claim.summaryVersion}`,
          model: deps.model ?? "gpt-5.6-sol",
          safetyIdentifier: deps.safetyIdentifier,
          context: buildPlanningContext(context),
          signal: AbortSignal.timeout(
            Math.min(
              deps.timeoutMs ?? Number.POSITIVE_INFINITY,
              remainingProviderTimeout(
                policy,
                "planningProvider",
                workflowStartedAt,
              ),
            ),
          ),
        });
      const execute = async (reservationId?: string) => {
        const providerStartedAt = Date.now();
        const result = deps.quotaSubject
          ? await runWithAiQuota(
              {
                ...deps.quotaSubject,
                workflow: "planning_summary",
                model: deps.model ?? "gpt-5.6-sol",
                estimatedTokens: 8_000,
                ...(reservationId ? { reservationId } : {}),
              },
              summarize,
            )
          : await summarize();
        const providerDurationMs = Date.now() - providerStartedAt;
        const readiness = computePlanningReadiness({
          destinations: result.summary.tripSnapshot.destinations,
          destinationUnresolved: result.summary.proposals.some((i) =>
            /destination/i.test(`${i.label} ${i.detail}`),
          ),
          dateWindows: result.summary.tripSnapshot.dateWindows,
          flexibleDates: result.summary.tripSnapshot.dateWindows.some((v) =>
            /flexible/i.test(v),
          ),
          activeTravelerCount: context.participants.length,
          hardConstraints: result.summary.constraints.map((i) => i.detail),
          conflicts: result.summary.conflicts.map((i) => ({
            detail: i.detail,
            schedulingImpossible: /impossible|no overlap|contradict/i.test(
              i.detail,
            ),
          })),
          optionalMissing: result.summary.readiness.warnings,
        });
        const summary = planningSummarySchema.parse({
          ...result.summary,
          tripSnapshot: {
            ...result.summary.tripSnapshot,
            travelerCount: context.participants.length,
            approvalMode: context.approvalMode,
          },
          readiness,
          evidence: {
            ...result.summary.evidence,
            memoryVersion: context.memoryVersion,
          },
        });
        return {
          value: summary,
          responseId: result.responseId,
          requestId: result.requestId,
          usage: result.usage,
          providerDurationMs,
          totalDurationMs: Date.now() - started,
          retryCount: Math.max(claim.attemptCount - 1, 0),
          repairCount: 0,
        } satisfies ProviderAttemptExecutionResult<PlanningSummary>;
      };
      const apply = (
        summary: PlanningSummary,
        result: ProviderAttemptExecutionResult<PlanningSummary>,
      ) => {
        const hash = createHash("sha256")
          .update(JSON.stringify(summary))
          .digest("hex");
        return deps.repository.complete(
          id,
          summary,
          summary.readiness.status,
          hash,
          { summary, ...result },
          result.totalDurationMs,
        );
      };
      if (deps.providerAttempts) {
        const outcome = await deps.providerAttempts.run({
          workflow: "planning_summary",
          operationKey: `${id}:summary:${claim.summaryVersion}`,
          attempt: claim.attemptCount,
          model: deps.model ?? "gpt-5.6-sol",
          leaseMs: policy.recoveryLeaseMs,
          execute: ({ attemptId }) => execute(attemptId),
          parse: (value) => planningSummarySchema.parse(value),
          apply,
        });
        if (outcome.status !== "applied") return;
      } else {
        const result = await execute();
        await apply(result.value, result);
      }
      return;
    } catch (error) {
      const failure =
        error instanceof AiQuotaError
          ? new PlanningProviderError(error.code as never, false)
          : error instanceof PlanningProviderError
            ? error
            : new PlanningProviderError("unknown_error", false);
      if (!failure.retryable) {
        await deps.repository.fail(id, failure.code);
        return;
      }
      if (claim.attemptCount >= policy.maximumAttempts) {
        await deps.repository.fail(id, "retry_exhausted");
        return;
      }
      const delay = computeRetryDelay(
        policy,
        claim.attemptCount,
        deps.retry?.random,
      );
      if (
        Date.now() - workflowStartedAt + delay >=
        policy.totalWorkflowDeadlineMs
      ) {
        await deps.repository.fail(id, "workflow_deadline_exceeded");
        return;
      }
      await deps.repository.fail(id, failure.code);
      await (deps.retry?.sleep ?? sleep)(delay);
    }
  }
}
