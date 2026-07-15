import {
  itinerarySchema,
  planChangeAnalysisSchema,
  type Itinerary,
  type PlanChangeAnalysis,
} from "@trailie/schemas";
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
};
export type ProviderMeta = {
  responseId: string | null;
  requestId: string | null;
  usage: ProviderUsage;
};
export type AnalysisOutput = ProviderMeta & { analysis: PlanChangeAnalysis };
export type CandidateOutput = ProviderMeta & { itinerary: Itinerary };
export interface RevisionProvider {
  analyze(input: RevisionProviderInput): Promise<AnalysisOutput>;
  generate(input: RevisionProviderInput): Promise<CandidateOutput>;
  repair(input: RevisionProviderInput): Promise<CandidateOutput>;
}

const usage: ProviderUsage = {
  inputTokens: 500,
  outputTokens: 700,
  reasoningTokens: 100,
  cachedInputTokens: 0,
  totalTokens: 1300,
};
export function createFakeRevisionProvider(): RevisionProvider {
  return {
    async analyze(input) {
      const explicitTarget = input.context.match(
        /<EXPLICIT_CHANGE_REQUEST>.*?"targetItemId":"([^"]+)"/,
      )?.[1];
      const target = input.basePlan?.days
        .flatMap((day) => day.items)
        .find((item) => item.id === explicitTarget);
      return {
        analysis: planChangeAnalysisSchema.parse({
          schemaVersion: "1",
          title: "Move an itinerary item later",
          requestSummary: "Move the selected item later.",
          requestedChange: {
            type: "move_item",
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
        responseId: "fake_change_analysis",
        requestId: "fake_change_request",
        usage,
      };
    },
    async generate(input) {
      const itinerary = structuredClone(input.basePlan!);
      const targetId = input.analysis?.requestedChange.targetItemIds[0];
      const target = itinerary.days
        .flatMap((day) => day.items)
        .find((item) => item.id === targetId);
      if (target) {
        target.startTime = "16:00";
        target.endTime = "19:30";
      }
      return {
        itinerary: itinerarySchema.parse(itinerary),
        responseId: "fake_revision_candidate",
        requestId: "fake_revision_request",
        usage,
      };
    },
    async repair(input) {
      const itinerary = structuredClone(input.basePlan!);
      const targetId = input.analysis?.requestedChange.targetItemIds[0];
      const target = itinerary.days
        .flatMap((day) => day.items)
        .find((item) => item.id === targetId);
      if (target) {
        target.startTime = "18:00";
        target.endTime = "19:30";
      }
      return {
        itinerary: itinerarySchema.parse(itinerary),
        responseId: "fake_revision_repair",
        requestId: "fake_revision_repair_request",
        usage,
      };
    },
  };
}
