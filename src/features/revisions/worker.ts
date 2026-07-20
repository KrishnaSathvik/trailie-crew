import "server-only";
import type {
  ChangeMateriality,
  Itinerary,
  PlanChangeAnalysis,
  PlanChangeStatus,
  PlanChangeType,
  PlanningSummary,
  RevisionAllowedChangeManifestV1,
  RevisionPatchV1,
  TravelEvidenceV1,
  ValidationReport,
} from "@trailie/schemas";
import {
  itinerarySchema,
  planChangeAnalysisSchema,
  revisionAllowedChangeManifestV1Schema,
  revisionPatchV1Schema,
} from "@trailie/schemas";
import type { TravelProvider } from "@trailie/travel-tools";
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
import { routeChangeAnalysisModel, routeRevisionExecution } from "./routing";
import {
  buildChangeAnalysisContext,
  buildRevisionCandidateContext,
  buildRevisionRepairContext,
  buildRevisionScopeRepairContext,
} from "./context";
import {
  buildProtectedRevisionSnapshot,
  deriveAllowedChangeManifest,
  hashAllowedChangeManifest,
} from "./manifest";
import {
  applyRevisionPatch,
  deriveDeterministicRevisionPatch,
  validateRevisionPatch,
} from "./patch";
import type { ProviderMeta, RevisionProvider } from "./provider";
import { RevisionProviderError } from "./provider";
import {
  validateChangeBoundary,
  type ChangeBoundaryReport,
} from "./validation/change-boundary";
import {
  classifyProviderFailure,
  parseWorkflowReliabilityPolicy,
  remainingProviderTimeout,
  type WorkflowReliabilityPolicy,
} from "@/server/ai/reliability-policy";
import {
  type DurableProviderAttemptController,
  type ProviderAttemptExecutionResult,
} from "@/server/ai/provider-attempts";
import type { TravelProviderRegistry } from "@/server/travel/intelligence";
import type { TravelEvidenceRepository } from "@/server/travel/repository";
import { refreshRevisionTravelEvidence } from "@/server/travel/revision-refresh";
import { createTrailieRuntimeRouter } from "@/server/ai/model-router";

export type RevisionContext = {
  request: {
    id: string;
    roomId: string;
    baseTripPlanId: string;
    basePlanHash: string;
    status: PlanChangeStatus;
    requestType: PlanChangeType;
    targetItemId: string | null;
    requestText: string;
    basePlanVersion: number;
    currentAnalysisVersion: number;
    approvedAnalysisVersion: number | null;
    candidateTripPlanId: string | null;
    candidateAttemptCount: number;
    scopeRepairCount: number;
    conflictRepairCount: number;
  };
  basePlan: Itinerary;
  approvedSummary: PlanningSummary;
  analysis: PlanChangeAnalysis | null;
  candidatePlan: Itinerary | null;
  manifest: RevisionAllowedChangeManifestV1 | null;
  patch: RevisionPatchV1 | null;
  evidence: NormalizedToolEvidence[];
};

export interface RevisionRepository {
  loadContext(id: string): Promise<RevisionContext>;
  claimAnalysis(
    id: string,
    model: string,
  ): Promise<{ claimed: boolean; attemptCount?: number }>;
  completeAnalysis(
    id: string,
    analysis: PlanChangeAnalysis,
    output: ProviderMeta,
    model: string,
  ): Promise<void>;
  claimCandidate(
    id: string,
  ): Promise<{ claimed: boolean; attemptCount?: number }>;
  persistManifest?(
    id: string,
    manifest: RevisionAllowedChangeManifestV1,
    manifestHash: string,
  ): Promise<void>;
  persistPatch?(id: string, patch: RevisionPatchV1): Promise<void>;
  attachCandidate(
    id: string,
    itinerary: Itinerary,
    output: ProviderMeta,
    provenance: {
      model: string;
      promptVersion:
        "trailie-revision-patch-v1" | "trailie-itinerary-revision-v2";
    },
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
  startScopeRepair?(
    id: string,
    report: ChangeBoundaryReport,
  ): Promise<{ claimed: boolean }>;
  completeScopeRepair?(id: string): Promise<void>;
  recordRunUsage(
    id: string,
    runType:
      | "impact_analysis"
      | "patch_generation"
      | "candidate_generation"
      | "candidate_scope_repair"
      | "candidate_repair",
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
  reliabilityPolicy?: WorkflowReliabilityPolicy;
  analysisAttempts?: DurableProviderAttemptController<PlanChangeAnalysis>;
  candidateAttempts?: DurableProviderAttemptController<Itinerary>;
  patchAttempts?: DurableProviderAttemptController<RevisionPatchV1>;
  models: { fast: string; reasoning: string };
  travelIntelligence?: {
    providers: TravelProviderRegistry;
    evidenceRepository: TravelEvidenceRepository;
    maximumCallsPerProvider: number;
  };
};

function callProvider<T extends { usage?: { totalTokens?: number | null } }>(
  dependencies: Dependencies,
  workflow: "revision_analysis" | "revision_candidate",
  model: string,
  operation: () => Promise<T>,
  reservationId?: string,
) {
  return dependencies.quotaSubject
    ? runWithAiQuota(
        {
          ...dependencies.quotaSubject,
          workflow,
          model,
          estimatedTokens: workflow === "revision_analysis" ? 5_000 : 12_000,
          ...(reservationId ? { reservationId } : {}),
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
  manifest: RevisionAllowedChangeManifestV1,
  liveEvidence: TravelEvidenceV1[],
) {
  const enriched = { itinerary: source, evidence: existingEvidence };
  await dependencies.repository.updateCandidate(candidateId, source);
  const validation = validateItinerary({
    itinerary: enriched.itinerary,
    approvedSummary: context.approvedSummary,
    evidence: enriched.evidence,
    liveEvidence,
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
        manifest,
        baseVersion: context.request.basePlanVersion,
        candidateVersion: version,
      })
    : null;
  if (!boundary) throw new RevisionProviderError("invalid_candidate", false);
  return { ...enriched, validation, boundary, requestId };
}

function meta(output: ProviderMeta): ProviderMeta {
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
  const policy =
    dependencies.reliabilityPolicy ?? parseWorkflowReliabilityPolicy({});
  const environmentModels = dependencies.models;
  const workflowStartedAt = Date.now();
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
      const model = routeChangeAnalysisModel(
        {
          requestType: context.request.requestType,
          affectedItemCount: context.request.targetItemId ? 1 : 0,
          affectedDayCount: day ? 1 : 0,
          materiality: preliminary,
          touchesConfirmedDecision: false,
        },
        environmentModels,
      );
      const claim = await dependencies.repository.claimAnalysis(id, model);
      if (!claim.claimed) return;
      const operationKey = `${id}:analysis:${context.request.currentAnalysisVersion + 1}`;
      const execute = async (reservationId?: string) => {
        const providerStartedAt = Date.now();
        const output = await callProvider(
          dependencies,
          "revision_analysis",
          model,
          () =>
            dependencies.provider.analyze({
              operationKey,
              model,
              safetyIdentifier: dependencies.safetyIdentifier,
              context: buildChangeAnalysisContext({
                requestType: context.request.requestType,
                targetItemId: context.request.targetItemId,
                requestText: context.request.requestText,
                basePlan: context.basePlan,
              }),
              basePlan: context.basePlan,
              signal: AbortSignal.timeout(
                Math.min(
                  dependencies.timeoutMs ?? Number.POSITIVE_INFINITY,
                  remainingProviderTimeout(
                    policy,
                    "revisionAnalysis",
                    workflowStartedAt,
                  ),
                ),
              ),
            }),
          reservationId,
        );
        return {
          value: verifyAnalysis(output.analysis, context),
          responseId: output.responseId,
          requestId: output.requestId,
          usage: output.usage,
          providerDurationMs: Date.now() - providerStartedAt,
          totalDurationMs: Date.now() - workflowStartedAt,
          retryCount: Math.max((claim.attemptCount ?? 1) - 1, 0),
          repairCount: 0,
        } satisfies ProviderAttemptExecutionResult<PlanChangeAnalysis>;
      };
      const apply = async (
        analysis: PlanChangeAnalysis,
        result: ProviderAttemptExecutionResult<PlanChangeAnalysis>,
      ) => {
        const output = { analysis, ...result };
        await dependencies.repository.completeAnalysis(
          id,
          analysis,
          meta(output),
          model,
        );
        await dependencies.repository.recordRunUsage(
          id,
          "impact_analysis",
          meta(output),
        );
      };
      if (dependencies.analysisAttempts) {
        const outcome = await dependencies.analysisAttempts.run({
          workflow: "revision_analysis",
          operationKey,
          attempt: claim.attemptCount ?? 1,
          model,
          leaseMs: policy.recoveryLeaseMs,
          execute: ({ attemptId }) => execute(attemptId),
          parse: (value) => planChangeAnalysisSchema.parse(value),
          apply,
        });
        if (outcome.status !== "applied") return;
      } else {
        const output = await execute();
        await apply(output.value, output);
      }
      return;
    }
    if (
      !["approved", "applying", "validating"].includes(
        context.request.status,
      ) ||
      !context.analysis
    )
      return;
    const approvedAnalysis = context.analysis;
    const derivedManifest = deriveAllowedChangeManifest({
      changeRequestId: context.request.id,
      basePlanId: context.request.baseTripPlanId,
      baseVersion: context.request.basePlanVersion,
      basePlanHash: context.request.basePlanHash,
      analysisVersion: context.request.currentAnalysisVersion,
      requestType: context.request.requestType,
      targetItemId: context.request.targetItemId,
      basePlan: context.basePlan,
      analysis: approvedAnalysis,
      approvedSummary: context.approvedSummary,
    });
    const manifest = context.manifest
      ? revisionAllowedChangeManifestV1Schema.parse(context.manifest)
      : derivedManifest;
    const manifestHash = hashAllowedChangeManifest(manifest);
    if (
      manifest.changeRequestId !== context.request.id ||
      manifest.basePlanId !== context.request.baseTripPlanId ||
      manifest.basePlanHash !== context.request.basePlanHash ||
      manifest.analysisVersion !== context.request.currentAnalysisVersion ||
      manifest.requestType !== context.request.requestType ||
      (context.manifest &&
        hashAllowedChangeManifest(derivedManifest) !== manifestHash)
    ) {
      await dependencies.repository.block(id, "change_scope_exceeded");
      return;
    }
    const protectedSnapshot = buildProtectedRevisionSnapshot(
      context.basePlan,
      manifest,
    );
    await dependencies.repository.persistManifest?.(id, manifest, manifestHash);
    const claim =
      context.request.status === "approved"
        ? await dependencies.repository.claimCandidate(id)
        : {
            claimed: true,
            attemptCount: context.request.candidateAttemptCount,
          };
    if (!claim.claimed) return;
    const route = routeRevisionExecution({
      requestType: manifest.requestType,
      affectedItemCount: manifest.maximumAffectedItems,
      affectedDayCount: manifest.maximumAffectedDays,
    });
    const runtimeRoute = createTrailieRuntimeRouter({
      ...environmentModels,
      planning: environmentModels.reasoning,
      itinerary: environmentModels.reasoning,
    }).route({
      intent: "itinerary_revision",
      request: manifest.requestType,
      complexity:
        route === "constrained_sol" ? "large_revision" : "small_revision",
    });
    const model = runtimeRoute.model ?? "trailie-deterministic";
    const candidateProvenance =
      route === "constrained_sol"
        ? {
            model: environmentModels.reasoning,
            promptVersion: "trailie-itinerary-revision-v2" as const,
          }
        : route === "constrained_terra"
          ? {
              model: environmentModels.fast,
              promptVersion: "trailie-revision-patch-v1" as const,
            }
          : {
              model: "trailie-deterministic" as const,
              promptVersion: "trailie-revision-patch-v1" as const,
            };
    let patch: RevisionPatchV1;
    if (context.patch) {
      patch = revisionPatchV1Schema.parse(context.patch);
    } else {
      try {
        patch = deriveDeterministicRevisionPatch({
          basePlan: context.basePlan,
          manifest,
          analysis: approvedAnalysis,
        });
      } catch {
        if (!dependencies.provider.generatePatch) {
          await dependencies.repository.block(id, "change_scope_exceeded");
          return;
        }
        const patchOperationKey = `${id}:patch:${context.request.currentAnalysisVersion}`;
        const executePatch = async (reservationId?: string) => {
          const providerStartedAt = Date.now();
          const output = await callProvider(
            dependencies,
            "revision_candidate",
            model,
            () =>
              dependencies.provider.generatePatch({
                operationKey: patchOperationKey,
                model,
                safetyIdentifier: dependencies.safetyIdentifier,
                context: buildRevisionCandidateContext({
                  approvedSummary: context.approvedSummary,
                  analysis: approvedAnalysis,
                  evidence: context.evidence,
                  manifest,
                  manifestHash,
                  protectedSnapshot,
                }),
                basePlan: context.basePlan,
                analysis: approvedAnalysis,
                manifest,
                manifestHash,
                signal: AbortSignal.timeout(
                  Math.min(
                    dependencies.timeoutMs ?? Number.POSITIVE_INFINITY,
                    remainingProviderTimeout(
                      policy,
                      "revisionGeneration",
                      workflowStartedAt,
                    ),
                  ),
                ),
              }),
            reservationId,
          );
          return {
            value: output.patch,
            responseId: output.responseId,
            requestId: output.requestId,
            usage: output.usage,
            providerDurationMs: Date.now() - providerStartedAt,
            totalDurationMs: Date.now() - workflowStartedAt,
            retryCount: 0,
            repairCount: 0,
          } satisfies ProviderAttemptExecutionResult<RevisionPatchV1>;
        };
        if (dependencies.patchAttempts) {
          const outcome = await dependencies.patchAttempts.run({
            workflow: "revision_patch",
            operationKey: patchOperationKey,
            attempt: 1,
            model,
            leaseMs: policy.recoveryLeaseMs,
            execute: ({ attemptId }) => executePatch(attemptId),
            parse: (value) => revisionPatchV1Schema.parse(value),
            apply: async (value, result) => {
              const validation = validateRevisionPatch(value, manifest);
              if (value.status !== "ready" || validation.status !== "pass")
                throw new Error("change_scope_exceeded");
              await dependencies.repository.persistPatch?.(id, value);
              await dependencies.repository.recordRunUsage(
                id,
                "patch_generation",
                meta(result),
              );
            },
          });
          if (outcome.status !== "applied") return;
          patch = outcome.result.value;
        } else {
          const output = await executePatch();
          patch = output.value;
          await dependencies.repository.recordRunUsage(
            id,
            "patch_generation",
            meta(output),
          );
        }
      }
    }
    const patchValidation = validateRevisionPatch(patch, manifest);
    if (patch.status !== "ready" || patchValidation.status !== "pass") {
      await dependencies.repository.block(id, "change_scope_exceeded");
      return;
    }
    await dependencies.repository.persistPatch?.(id, patch);

    let generatedItinerary: Itinerary;
    let durablyAttachedCandidate: { id: string; version: number } | null = null;
    let generatedMeta: ProviderMeta = {
      responseId: null,
      requestId: null,
      usage: {
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        cachedInputTokens: null,
        totalTokens: null,
      },
    };
    if (context.candidatePlan && context.request.candidateTripPlanId) {
      generatedItinerary = context.candidatePlan;
    } else if (route !== "constrained_sol") {
      generatedItinerary = applyRevisionPatch(
        context.basePlan,
        patch,
        manifest,
      );
    } else {
      const operationKey = `${id}:candidate:${context.request.currentAnalysisVersion}`;
      const generate = async (reservationId?: string) => {
        const providerStartedAt = Date.now();
        const output = await callProvider(
          dependencies,
          "revision_candidate",
          model,
          () =>
            dependencies.provider.generate({
              operationKey,
              model,
              safetyIdentifier: dependencies.safetyIdentifier,
              context: buildRevisionCandidateContext({
                approvedSummary: context.approvedSummary,
                analysis: approvedAnalysis,
                evidence: context.evidence,
                manifest,
                manifestHash,
                protectedSnapshot,
                patch,
              }),
              basePlan: context.basePlan,
              analysis: approvedAnalysis,
              manifest,
              manifestHash,
              signal: AbortSignal.timeout(
                Math.min(
                  dependencies.timeoutMs ?? Number.POSITIVE_INFINITY,
                  remainingProviderTimeout(
                    policy,
                    "revisionGeneration",
                    workflowStartedAt,
                  ),
                ),
              ),
            }),
          reservationId,
        );
        return {
          value: output.itinerary,
          responseId: output.responseId,
          requestId: output.requestId,
          usage: output.usage,
          providerDurationMs: Date.now() - providerStartedAt,
          totalDurationMs: Date.now() - workflowStartedAt,
          retryCount: Math.max((claim.attemptCount ?? 1) - 1, 0),
          repairCount: 0,
        } satisfies ProviderAttemptExecutionResult<Itinerary>;
      };
      if (dependencies.candidateAttempts) {
        const outcome = await dependencies.candidateAttempts.run({
          workflow: "revision_candidate",
          operationKey,
          attempt: claim.attemptCount ?? 1,
          model,
          leaseMs: policy.recoveryLeaseMs,
          execute: ({ attemptId }) => generate(attemptId),
          parse: (value) => itinerarySchema.parse(value),
          apply: async (value, result) => {
            durablyAttachedCandidate =
              await dependencies.repository.attachCandidate(
                id,
                value,
                meta(result),
                candidateProvenance,
              );
            await dependencies.repository.recordRunUsage(
              id,
              "candidate_generation",
              meta(result),
            );
          },
        });
        if (outcome.status !== "applied") return;
        generatedItinerary = outcome.result.value;
        generatedMeta = meta(outcome.result);
      } else {
        const output = await generate();
        generatedItinerary = output.value;
        generatedMeta = meta(output);
      }
    }
    const candidate =
      context.candidatePlan && context.request.candidateTripPlanId
        ? {
            id: context.request.candidateTripPlanId,
            version: context.request.basePlanVersion + 1,
          }
        : durablyAttachedCandidate
          ? durablyAttachedCandidate
          : await dependencies.repository.attachCandidate(
              id,
              generatedItinerary,
              generatedMeta,
              candidateProvenance,
            );
    if (
      route === "constrained_sol" &&
      !context.candidatePlan &&
      !dependencies.candidateAttempts
    )
      await dependencies.repository.recordRunUsage(
        id,
        "candidate_generation",
        generatedMeta,
      );
    const refreshed = dependencies.travelIntelligence
      ? await refreshRevisionTravelEvidence({
          requestType: manifest.requestType,
          evidenceRefreshTargets: manifest.evidenceRefreshTargets,
          baseTripPlanId: context.request.baseTripPlanId,
          candidateTripPlanId: candidate.id,
          candidate: generatedItinerary,
          providers: dependencies.travelIntelligence.providers,
          repository: dependencies.travelIntelligence.evidenceRepository,
          locale: "en-US",
          maximumCallsPerProvider:
            dependencies.travelIntelligence.maximumCallsPerProvider,
        })
      : { evidence: [] as TravelEvidenceV1[] };
    let result = await validateCandidate(
      id,
      candidate.id,
      candidate.version,
      generatedItinerary,
      context,
      dependencies,
      context.evidence,
      manifest,
      refreshed.evidence,
    );

    if (result.boundary.status === "blocked") {
      const scopeClaim =
        context.request.scopeRepairCount === 1
          ? { claimed: true }
          : await dependencies.repository.startScopeRepair?.(
              id,
              result.boundary,
            );
      if (!scopeClaim?.claimed) {
        await dependencies.repository.block(id, "change_scope_exceeded");
        return;
      }
      const scopeOperationKey = `${id}:scope-repair:1`;
      const repairScope = async (reservationId?: string) => {
        const providerStartedAt = Date.now();
        const output = await callProvider(
          dependencies,
          "revision_candidate",
          model,
          () =>
            dependencies.provider.repairScope({
              operationKey: scopeOperationKey,
              model,
              safetyIdentifier: dependencies.safetyIdentifier,
              context: buildRevisionScopeRepairContext({
                basePlan: context.basePlan,
                approvedSummary: context.approvedSummary,
                analysis: approvedAnalysis,
                evidence: result.evidence,
                manifest,
                manifestHash,
                protectedSnapshot,
                patch,
                candidate: result.itinerary,
                unauthorizedDifferences:
                  result.boundary.preservation.unauthorizedDifferences,
              }),
              basePlan: context.basePlan,
              analysis: approvedAnalysis,
              manifest,
              manifestHash,
              signal: AbortSignal.timeout(
                Math.min(
                  dependencies.timeoutMs ?? Number.POSITIVE_INFINITY,
                  remainingProviderTimeout(
                    policy,
                    "revisionGeneration",
                    workflowStartedAt,
                  ),
                ),
              ),
            }),
          reservationId,
        );
        return {
          value: output.itinerary,
          responseId: output.responseId,
          requestId: output.requestId,
          usage: output.usage,
          providerDurationMs: Date.now() - providerStartedAt,
          totalDurationMs: Date.now() - workflowStartedAt,
          retryCount: 0,
          repairCount: 1,
        } satisfies ProviderAttemptExecutionResult<Itinerary>;
      };
      let scopeResult: ProviderAttemptExecutionResult<Itinerary>;
      if (dependencies.candidateAttempts) {
        const scopeOutput = await dependencies.candidateAttempts.run({
          workflow: "revision_scope_repair",
          operationKey: scopeOperationKey,
          attempt: 1,
          model,
          leaseMs: policy.recoveryLeaseMs,
          execute: ({ attemptId }) => repairScope(attemptId),
          parse: (value) => itinerarySchema.parse(value),
          apply: async (value, appliedResult) => {
            await dependencies.repository.updateCandidate(candidate.id, value);
            await dependencies.repository.recordRunUsage(
              id,
              "candidate_scope_repair",
              meta(appliedResult),
            );
          },
        });
        if (scopeOutput.status !== "applied") return;
        scopeResult = scopeOutput.result;
      } else {
        scopeResult = await repairScope();
        await dependencies.repository.updateCandidate(
          candidate.id,
          scopeResult.value,
        );
        await dependencies.repository.recordRunUsage(
          id,
          "candidate_scope_repair",
          meta(scopeResult),
        );
      }
      const repairedItinerary = scopeResult.value;
      result = await validateCandidate(
        id,
        candidate.id,
        candidate.version,
        repairedItinerary,
        context,
        dependencies,
        result.evidence,
        manifest,
        refreshed.evidence,
      );
      if (result.boundary.status === "blocked") {
        await dependencies.repository.block(id, "change_scope_exceeded");
        return;
      }
      await dependencies.repository.completeScopeRepair?.(id);
    }

    if (result.validation.status === "pass") {
      await dependencies.repository.completeCandidate(
        id,
        result.boundary,
        result.boundary.diff,
      );
      return;
    }
    if (result.validation.status !== "needs_revision") {
      await dependencies.repository.block(id, "candidate_blocked");
      return;
    }
    const repairClaim =
      context.request.conflictRepairCount === 1
        ? { claimed: true }
        : await dependencies.repository.startRepair(id);
    if (!repairClaim.claimed) return;
    const repairOperationKey = `${id}:repair:1`;
    const repairConflict = async (reservationId?: string) => {
      const providerStartedAt = Date.now();
      const output = await callProvider(
        dependencies,
        "revision_candidate",
        model,
        () =>
          dependencies.provider.repair({
            operationKey: repairOperationKey,
            model,
            safetyIdentifier: dependencies.safetyIdentifier,
            context: buildRevisionRepairContext({
              basePlan: context.basePlan,
              approvedSummary: context.approvedSummary,
              analysis: approvedAnalysis,
              evidence: result.evidence,
              manifest,
              manifestHash,
              protectedSnapshot,
              patch,
              candidate: result.itinerary,
              validation: result.validation,
              boundary: result.boundary,
            }),
            basePlan: result.itinerary,
            analysis: approvedAnalysis,
            manifest,
            manifestHash,
            signal: AbortSignal.timeout(
              Math.min(
                dependencies.timeoutMs ?? Number.POSITIVE_INFINITY,
                remainingProviderTimeout(
                  policy,
                  "revisionGeneration",
                  workflowStartedAt,
                ),
              ),
            ),
          }),
        reservationId,
      );
      return {
        value: output.itinerary,
        responseId: output.responseId,
        requestId: output.requestId,
        usage: output.usage,
        providerDurationMs: Date.now() - providerStartedAt,
        totalDurationMs: Date.now() - workflowStartedAt,
        retryCount: 0,
        repairCount: 1,
      } satisfies ProviderAttemptExecutionResult<Itinerary>;
    };
    let repairResult: ProviderAttemptExecutionResult<Itinerary>;
    if (dependencies.candidateAttempts) {
      const outcome = await dependencies.candidateAttempts.run({
        workflow: "revision_repair",
        operationKey: repairOperationKey,
        attempt: 1,
        model,
        leaseMs: policy.recoveryLeaseMs,
        execute: ({ attemptId }) => repairConflict(attemptId),
        parse: (value) => itinerarySchema.parse(value),
        apply: async (value, appliedResult) => {
          await dependencies.repository.updateCandidate(candidate.id, value);
          await dependencies.repository.recordRunUsage(
            id,
            "candidate_repair",
            meta(appliedResult),
          );
        },
      });
      if (outcome.status !== "applied") return;
      repairResult = outcome.result;
    } else {
      repairResult = await repairConflict();
      await dependencies.repository.updateCandidate(
        candidate.id,
        repairResult.value,
      );
      await dependencies.repository.recordRunUsage(
        id,
        "candidate_repair",
        meta(repairResult),
      );
    }
    result = await validateCandidate(
      id,
      candidate.id,
      candidate.version,
      repairResult.value,
      context,
      dependencies,
      result.evidence,
      manifest,
      refreshed.evidence,
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
    else
      await dependencies.repository.block(
        id,
        result.boundary.status === "blocked"
          ? "change_scope_exceeded"
          : "candidate_blocked",
      );
  } catch (error) {
    await dependencies.repository.fail(
      id,
      error instanceof AiQuotaError
        ? error.code
        : error instanceof RevisionProviderError
          ? error.code
          : classifyProviderFailure(error).code,
    );
  }
}
