import "server-only";
import { createHash } from "node:crypto";
import { computePlanningReadiness } from "./readiness";
import { buildPlanningContext } from "./context";
import {
  PlanningProviderError,
  type PlanningSummaryProvider,
} from "./provider";
import type { PlanningRepository } from "./repository";

type Dependencies = {
  repository: PlanningRepository;
  provider: PlanningSummaryProvider;
  safetyIdentifier: string;
  model?: string;
  timeoutMs?: number;
};
export async function processPlanningSummary(id: string, deps: Dependencies) {
  for (let pass = 0; pass < 2; pass += 1) {
    const claim = await deps.repository.claim(id);
    if (!claim.claimed) return;
    const context = await deps.repository.loadContext(id);
    const started = Date.now();
    try {
      const result = await deps.provider.summarize({
        operationKey: `${id}:${claim.summaryVersion}`,
        model: deps.model ?? "gpt-5.6-sol",
        safetyIdentifier: deps.safetyIdentifier,
        context: buildPlanningContext(context),
        signal: AbortSignal.timeout(deps.timeoutMs ?? 45_000),
      });
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
        error instanceof PlanningProviderError
          ? error
          : new PlanningProviderError("unknown_error", false);
      await deps.repository.fail(id, failure.code);
      if (!failure.retryable || claim.attemptCount >= 2) return;
    }
  }
}
