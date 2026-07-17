import {
  itinerarySchema,
  planChangeAnalysisSchema,
  revisionPatchV1Schema,
  type Itinerary,
  type PlanChangeAnalysis,
  type RevisionAllowedChangeManifestV1,
  type RevisionPatchV1,
} from "@trailie/schemas";
import { createFakeProviderId } from "@/server/ai/fake-provider-id";
import type { ProviderUsage } from "@/server/ai/provider";

export type RevisionProviderErrorCode =
  | "change_analysis_failed"
  | "invalid_change_analysis"
  | "candidate_generation_failed"
  | "invalid_candidate"
  | "model_timeout"
  | "model_rate_limited"
  | "model_unavailable"
  | "invalid_model_output"
  | "workflow_deadline_exceeded"
  | "recovery_required"
  | "retry_exhausted";
export class RevisionProviderError extends Error {
  constructor(
    readonly code: RevisionProviderErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "RevisionProviderError";
  }
}
export type RevisionProviderInput = {
  operationKey: string;
  model: string;
  safetyIdentifier: string;
  context: string;
  signal: AbortSignal;
  basePlan?: Itinerary;
  analysis?: PlanChangeAnalysis;
  manifest?: RevisionAllowedChangeManifestV1;
  manifestHash?: string;
};
export type ProviderMeta = {
  responseId: string | null;
  requestId: string | null;
  usage: ProviderUsage;
};
export type AnalysisOutput = ProviderMeta & { analysis: PlanChangeAnalysis };
export type CandidateOutput = ProviderMeta & { itinerary: Itinerary };
export type PatchOutput = ProviderMeta & { patch: RevisionPatchV1 };
export interface RevisionProvider {
  analyze(input: RevisionProviderInput): Promise<AnalysisOutput>;
  generatePatch(input: RevisionProviderInput): Promise<PatchOutput>;
  generate(input: RevisionProviderInput): Promise<CandidateOutput>;
  repairScope(input: RevisionProviderInput): Promise<CandidateOutput>;
  repair(input: RevisionProviderInput): Promise<CandidateOutput>;
}

const usage: ProviderUsage = {
  inputTokens: 500,
  outputTokens: 700,
  reasoningTokens: 100,
  cachedInputTokens: 0,
  totalTokens: 1300,
};

function applyFakeApprovedChange(
  itinerary: Itinerary,
  input: RevisionProviderInput,
) {
  const targetId = input.analysis?.requestedChange.targetItemIds[0];
  const target = itinerary.days
    .flatMap((day) => day.items)
    .find((item) => item.id === targetId);
  if (!target) return;
  target.startTime = "18:00";
  target.endTime = "19:30";
  if (input.manifest?.requestType === "replace_item") {
    target.title = `${target.title} alternative`;
    target.description =
      "An approved semantic replacement that preserves the original must-do.";
  }
}

export function createFakeRevisionProvider(): RevisionProvider {
  return {
    async analyze(input) {
      const explicitTarget = input.context.match(
        /<EXPLICIT_CHANGE_REQUEST>.*?"targetItemId":"([^"]+)"/,
      )?.[1];
      const explicitType =
        input.context.match(
          /<EXPLICIT_CHANGE_REQUEST>.*?"type":"([^"]+)"/,
        )?.[1] ?? "move_item";
      const target = input.basePlan?.days
        .flatMap((day) => day.items)
        .find((item) => item.id === explicitTarget);
      return {
        analysis: planChangeAnalysisSchema.parse({
          schemaVersion: "1",
          title: "Move an itinerary item later",
          requestSummary: "Move the selected item later.",
          requestedChange: {
            type: explicitType,
            targetItemIds: target ? [target.id] : [],
            normalizedInstruction: "Move the selected item later.",
          },
          affectedDays:
            input.basePlan?.days
              .filter((day) => day.items.some((item) => item.id === target?.id))
              .map((day) => day.date) ?? [],
          affectedItems: target
            ? [
                {
                  itemId: target.id,
                  dayId: input.basePlan!.days.find((day) =>
                    day.items.some((item) => item.id === target.id),
                  )!.id,
                  summary: `${target.title} moves later.`,
                  direct: true,
                },
              ]
            : [],
          impacts: {
            schedule: ["The selected item moves later"],
            routes: ["Dependent route timing must be refreshed"],
            budget: [],
            reservations: [],
            lodging: [],
            food: [],
            travelerConstraints: [],
            confirmedDecisions: [],
          },
          proposedApproach: ["Shift the item and dependent timing"],
          preservedItems: ["All other itinerary content"],
          risks: [],
          missingInformation: [],
          materiality: "material",
          feasibility: "feasible",
          blockers: [],
          approvalSummary: "Configured crew approval is required.",
        }),
        responseId: createFakeProviderId(
          "revision_analysis_response",
          input.operationKey,
        ),
        requestId: createFakeProviderId(
          "revision_analysis_request",
          input.operationKey,
        ),
        usage,
      };
    },
    async generatePatch(input) {
      const manifest = input.manifest;
      if (!manifest)
        throw new RevisionProviderError("invalid_candidate", false);
      const targetId = manifest.targetItemIds[0];
      const dayId = manifest.affectedDayIds[0];
      const operation = manifest.allowedOperations[0];
      const fieldChanges =
        operation === "move" || operation === "reschedule"
          ? { startTime: "18:00", endTime: "19:30" }
          : {};
      return {
        patch: revisionPatchV1Schema.parse({
          schemaVersion: "1",
          status: targetId && dayId ? "ready" : "blocked",
          blockers:
            targetId && dayId ? [] : ["Approved target is unavailable."],
          baseVersion: manifest.baseVersion,
          manifestHash: input.manifestHash ?? "0".repeat(64),
          operations:
            targetId && dayId
              ? [
                  {
                    operation,
                    targetId,
                    dayId,
                    fieldChanges,
                    reason:
                      input.analysis?.requestSummary ?? "Approved revision",
                    downstreamEffects: manifest.allowedDownstreamEffects.map(
                      (effect) => effect.effect,
                    ),
                  },
                ]
              : [],
          preservedItemIds: manifest.protectedItemIds,
          evidenceRefreshTargets: manifest.evidenceRefreshTargets,
        }),
        responseId: createFakeProviderId(
          "revision_patch_response",
          input.operationKey,
        ),
        requestId: createFakeProviderId(
          "revision_patch_request",
          input.operationKey,
        ),
        usage,
      };
    },
    async generate(input) {
      const itinerary = structuredClone(input.basePlan!);
      applyFakeApprovedChange(itinerary, input);
      if (
        process.env.TRAILIE_FAKE_REVISION_SCENARIO === "scope_drift_once" ||
        process.env.TRAILIE_FAKE_REVISION_SCENARIO === "scope_drift_always"
      ) {
        const protectedItem = itinerary.days
          .flatMap((day) => day.items)
          .find((item) => input.manifest?.protectedItemIds.includes(item.id));
        if (protectedItem)
          protectedItem.description = "Unauthorized fake-provider drift.";
      }
      return {
        itinerary: itinerarySchema.parse(itinerary),
        responseId: createFakeProviderId(
          "revision_candidate_response",
          input.operationKey,
        ),
        requestId: createFakeProviderId(
          "revision_candidate_request",
          input.operationKey,
        ),
        usage,
      };
    },
    async repair(input) {
      const itinerary = structuredClone(input.basePlan!);
      applyFakeApprovedChange(itinerary, input);
      return {
        itinerary: itinerarySchema.parse(itinerary),
        responseId: createFakeProviderId(
          "revision_repair_response",
          input.operationKey,
        ),
        requestId: createFakeProviderId(
          "revision_repair_request",
          input.operationKey,
        ),
        usage,
      };
    },
    async repairScope(input) {
      const itinerary = structuredClone(input.basePlan!);
      applyFakeApprovedChange(itinerary, input);
      if (process.env.TRAILIE_FAKE_REVISION_SCENARIO === "scope_drift_always") {
        const protectedItem = itinerary.days
          .flatMap((day) => day.items)
          .find((item) => input.manifest?.protectedItemIds.includes(item.id));
        if (protectedItem)
          protectedItem.description = "Unauthorized fake-provider drift.";
      }
      return {
        itinerary: itinerarySchema.parse(itinerary),
        responseId: createFakeProviderId(
          "revision_scope_repair_response",
          input.operationKey,
        ),
        requestId: createFakeProviderId(
          "revision_scope_repair_request",
          input.operationKey,
        ),
        usage,
      };
    },
  };
}
