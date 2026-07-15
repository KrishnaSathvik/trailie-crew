import "server-only";
import type {
  ChangeMateriality,
  Itinerary,
  PlanChangeAnalysis,
  PlanChangeStatus,
  PlanChangeType,
  PlanningSummary,
  ValidationReport,
} from "@trailie/schemas";
import type { TravelProvider } from "@trailie/travel-tools";
import { enrichWithTravelEvidence } from "@/features/itinerary/worker";
import {
  AiQuotaError,
  runWithAiQuota,
  type AiQuotaSubject,
} from "@/server/ai/quota";
import {
  validateItinerary,
  type NormalizedToolEvidence,
} from "@/features/itinerary/validation/validate-itinerary";
import { classifyChangeMateriality } from "./materiality";
import { routeChangeAnalysisModel } from "./routing";
import {
  buildChangeAnalysisContext,
  buildRevisionCandidateContext,
  buildRevisionRepairContext,
} from "./context";
import type {
  AnalysisOutput,
  CandidateOutput,
  ProviderMeta,
  RevisionProvider,
} from "./provider";
import { RevisionProviderError } from "./provider";
import {
  validateChangeBoundary,
  type ChangeBoundaryReport,
} from "./validation/change-boundary";

export type RevisionContext = {
  request: {
    id: string;
    roomId: string;
    status: PlanChangeStatus;
    requestType: PlanChangeType;
    targetItemId: string | null;
    requestText: string;
    basePlanVersion: number;
    currentAnalysisVersion: number;
    approvedAnalysisVersion: number | null;
    candidateTripPlanId: string | null;
  };
  basePlan: Itinerary;
  approvedSummary: PlanningSummary;
  analysis: PlanChangeAnalysis | null;
  candidatePlan: Itinerary | null;
  evidence: NormalizedToolEvidence[];
};

export interface RevisionRepository {
  loadContext(id: string): Promise<RevisionContext>;
  claimAnalysis(id: string, model: string): Promise<{ claimed: boolean }>;
  completeAnalysis(
    id: string,
    analysis: PlanChangeAnalysis,
    output: ProviderMeta,
  ): Promise<void>;
  claimCandidate(id: string): Promise<{ claimed: boolean }>;
  attachCandidate(
    id: string,
    itinerary: Itinerary,
    output: ProviderMeta,
  ): Promise<{ id: string; version: number }>;
  recordEvidence(
    id: string,
    evidence: Omit<NormalizedToolEvidence, "id">,
  ): Promise<string>;
  updateCandidate(id: string, itinerary: Itinerary): Promise<void>;
  recordValidation(
    id: string,
    report: ValidationReport,
    version: number,
  ): Promise<void>;
  startRepair(id: string): Promise<{ claimed: boolean }>;
  recordRunUsage(
    id: string,
    runType: "impact_analysis" | "candidate_generation" | "candidate_repair",
    output: ProviderMeta,
  ): Promise<void>;
  completeCandidate(
    id: string,
    boundary: ChangeBoundaryReport,
    diff: ChangeBoundaryReport["diff"],
  ): Promise<void>;
  block(id: string, code: string): Promise<void>;
  fail(id: string, code: string): Promise<void>;
}

type Dependencies = {
  repository: RevisionRepository;
  provider: RevisionProvider;
  travelProvider: TravelProvider;
  safetyIdentifier: string;
  timeoutMs?: number;
  now?: string;
  quotaSubject?: AiQuotaSubject;
};

function callProvider<T extends { usage?: { totalTokens?: number | null } }>(
  dependencies: Dependencies,
  workflow: "revision_analysis" | "revision_candidate",
  model: string,
  operation: () => Promise<T>,
) {
  return dependencies.quotaSubject
    ? runWithAiQuota(
        {
          ...dependencies.quotaSubject,
          workflow,
          model,
          estimatedTokens: workflow === "revision_analysis" ? 5_000 : 12_000,
        },
        operation,
      )
    : operation();
}

function targetLocation(base: Itinerary, targetId: string | null) {
  for (const day of base.days) {
    if (day.items.some((item) => item.id === targetId)) return day;
  }
  return null;
}

function verifyAnalysis(
  proposed: PlanChangeAnalysis,
  context: RevisionContext,
) {
  if (proposed.requestedChange.type !== context.request.requestType)
    throw new RevisionProviderError("invalid_change_analysis", false);
  const ids = new Set(
    context.basePlan.days.flatMap((day) => day.items.map((item) => item.id)),
  );
  if (
    proposed.requestedChange.targetItemIds.some((id) => !ids.has(id)) ||
    proposed.affectedItems.some((item) => !ids.has(item.itemId))
  )
    throw new RevisionProviderError("invalid_change_analysis", false);
  if (
    context.request.targetItemId &&
    !proposed.requestedChange.targetItemIds.includes(
      context.request.targetItemId,
    )
  )
    throw new RevisionProviderError("invalid_change_analysis", false);
  const materiality = classifyChangeMateriality({
    requestType: context.request.requestType,
    requestText: context.request.requestText,
    modelSuggestion: proposed.materiality,
  });
  return { ...proposed, materiality };
}

async function validateCandidate(
  requestId: string,
  candidateId: string,
  version: number,
  source: Itinerary,
  context: RevisionContext,
  dependencies: Dependencies,
  existingEvidence: NormalizedToolEvidence[],
) {
  const enriched = await enrichWithTravelEvidence(
    candidateId,
    source,
    existingEvidence,
    {
      repository: dependencies.repository,
      travelProvider: dependencies.travelProvider,
      now: dependencies.now,
    },
  );
  await dependencies.repository.updateCandidate(
    candidateId,
    enriched.itinerary,
  );
  const validation = validateItinerary({
    itinerary: enriched.itinerary,
    approvedSummary: context.approvedSummary,
    evidence: enriched.evidence,
    now: dependencies.now ?? new Date().toISOString(),
    minimumTravelBufferMinutes: 15,
    maximumDailyDriveMinutes: 360,
  });
  await dependencies.repository.recordValidation(
    candidateId,
    validation,
    version,
  );
  const boundary = context.analysis
    ? validateChangeBoundary({
        base: context.basePlan,
        candidate: enriched.itinerary,
        analysis: context.analysis,
        baseVersion: context.request.basePlanVersion,
        candidateVersion: version,
      })
    : null;
  if (!boundary) throw new RevisionProviderError("invalid_candidate", false);
  return { ...enriched, validation, boundary, requestId };
}

function meta(output: AnalysisOutput | CandidateOutput): ProviderMeta {
  return {
    responseId: output.responseId,
    requestId: output.requestId,
    usage: output.usage,
  };
}

export async function processPlanChange(
  id: string,
  dependencies: Dependencies,
) {
  try {
    const context = await dependencies.repository.loadContext(id);
    if (
      ["draft", "changes_requested", "failed", "analyzing"].includes(
        context.request.status,
      )
    ) {
      const day = targetLocation(
        context.basePlan,
        context.request.targetItemId,
      );
      const preliminary: ChangeMateriality = classifyChangeMateriality({
        requestType: context.request.requestType,
        requestText: context.request.requestText,
      });
      const model = routeChangeAnalysisModel({
        requestType: context.request.requestType,
        affectedItemCount: context.request.targetItemId ? 1 : 0,
        affectedDayCount: day ? 1 : 0,
        materiality: preliminary,
        touchesConfirmedDecision: false,
      });
      const claim = await dependencies.repository.claimAnalysis(id, model);
      if (!claim.claimed) return;
      const output = await callProvider(
        dependencies,
        "revision_analysis",
        model,
        () =>
          dependencies.provider.analyze({
            operationKey: `${id}:analysis:${context.request.currentAnalysisVersion + 1}`,
            model,
            safetyIdentifier: dependencies.safetyIdentifier,
            context: buildChangeAnalysisContext({
              requestType: context.request.requestType,
              targetItemId: context.request.targetItemId,
              requestText: context.request.requestText,
              basePlan: context.basePlan,
            }),
            basePlan: context.basePlan,
            signal: AbortSignal.timeout(dependencies.timeoutMs ?? 60_000),
          }),
      );
      await dependencies.repository.completeAnalysis(
        id,
        verifyAnalysis(output.analysis, context),
        meta(output),
      );
      await dependencies.repository.recordRunUsage(
        id,
        "impact_analysis",
        meta(output),
      );
      return;
    }
    if (context.request.status !== "approved" || !context.analysis) return;
    const approvedAnalysis = context.analysis;
    const claim = await dependencies.repository.claimCandidate(id);
    if (!claim.claimed) return;
    const generated = await callProvider(
      dependencies,
      "revision_candidate",
      "gpt-5.6-sol",
      () =>
        dependencies.provider.generate({
          operationKey: `${id}:candidate:${context.request.currentAnalysisVersion}`,
          model: "gpt-5.6-sol",
          safetyIdentifier: dependencies.safetyIdentifier,
          context: buildRevisionCandidateContext({
            basePlan: context.basePlan,
            approvedSummary: context.approvedSummary,
            analysis: approvedAnalysis,
            evidence: context.evidence,
          }),
          basePlan: context.basePlan,
          analysis: approvedAnalysis,
          signal: AbortSignal.timeout(dependencies.timeoutMs ?? 90_000),
        }),
    );
    const candidate = await dependencies.repository.attachCandidate(
      id,
      generated.itinerary,
      meta(generated),
    );
    await dependencies.repository.recordRunUsage(
      id,
      "candidate_generation",
      meta(generated),
    );
    let result = await validateCandidate(
      id,
      candidate.id,
      candidate.version,
      generated.itinerary,
      context,
      dependencies,
      context.evidence,
    );
    if (
      result.validation.status === "pass" &&
      result.boundary.status === "pass"
    ) {
      await dependencies.repository.completeCandidate(
        id,
        result.boundary,
        result.boundary.diff,
      );
      return;
    }
    if (
      result.validation.status !== "needs_revision" ||
      result.boundary.status === "blocked"
    ) {
      await dependencies.repository.block(
        id,
        result.boundary.status === "blocked"
          ? "change_scope_exceeded"
          : "candidate_blocked",
      );
      return;
    }
    const repairClaim = await dependencies.repository.startRepair(id);
    if (!repairClaim.claimed) return;
    const repaired = await callProvider(
      dependencies,
      "revision_candidate",
      "gpt-5.6-sol",
      () =>
        dependencies.provider.repair({
          operationKey: `${id}:repair:1`,
          model: "gpt-5.6-sol",
          safetyIdentifier: dependencies.safetyIdentifier,
          context: buildRevisionRepairContext({
            basePlan: context.basePlan,
            approvedSummary: context.approvedSummary,
            analysis: approvedAnalysis,
            evidence: result.evidence,
            candidate: result.itinerary,
            validation: result.validation,
            boundary: result.boundary,
          }),
          basePlan: result.itinerary,
          analysis: approvedAnalysis,
          signal: AbortSignal.timeout(dependencies.timeoutMs ?? 90_000),
        }),
    );
    await dependencies.repository.recordRunUsage(
      id,
      "candidate_repair",
      meta(repaired),
    );
    result = await validateCandidate(
      id,
      candidate.id,
      candidate.version,
      repaired.itinerary,
      context,
      dependencies,
      result.evidence,
    );
    if (
      result.validation.status === "pass" &&
      result.boundary.status === "pass"
    )
      await dependencies.repository.completeCandidate(
        id,
        result.boundary,
        result.boundary.diff,
      );
    else await dependencies.repository.block(id, "candidate_blocked");
  } catch (error) {
    await dependencies.repository.fail(
      id,
      error instanceof AiQuotaError
        ? error.code
        : error instanceof RevisionProviderError
          ? error.code
          : "unknown_error",
    );
  }
}
