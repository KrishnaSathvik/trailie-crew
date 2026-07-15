import "server-only";
import { createHash } from "node:crypto";
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
      const result = deps.quotaSubject
        ? await runWithAiQuota(
            {
              ...deps.quotaSubject,
              workflow: "planning_summary",
              model: deps.model ?? "gpt-5.6-sol",
              estimatedTokens: 8_000,
            },
            summarize,
          )
        : await summarize();
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
      const summary = {
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
      };
      const hash = createHash("sha256")
        .update(JSON.stringify(summary))
        .digest("hex");
      await deps.repository.complete(
        id,
        summary,
        readiness.status,
        hash,
        result,
        Date.now() - started,
      );
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
