import { planningSummarySchema, type PlanningSummary } from "@trailie/schemas";
import type { ProviderUsage } from "@/server/ai/provider";

export type PlanningErrorCode =
  | "summary_generation_failed"
  | "invalid_summary_response"
  | "model_unavailable"
  | "model_timeout"
  | "model_rate_limited"
  | "retry_exhausted"
  | "unknown_error";
export class PlanningProviderError extends Error {
  constructor(
    readonly code: PlanningErrorCode,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "PlanningProviderError";
  }
}
export type PlanningSummaryInput = {
  operationKey: string;
  model: string;
  safetyIdentifier: string;
  context: string;
  signal: AbortSignal;
};
export type PlanningSummaryOutput = {
  summary: PlanningSummary;
  responseId: string | null;
  requestId: string | null;
  usage: ProviderUsage;
};
export interface PlanningSummaryProvider {
  summarize(input: PlanningSummaryInput): Promise<PlanningSummaryOutput>;
}

const sourceId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
const item = (id: string, label: string, detail: string) => ({
  id,
  label,
  detail,
  sourceMessageIds: [sourceId],
});
export function createFakePlanningSummaryProvider(): PlanningSummaryProvider {
  return {
    async summarize(input) {
      if (/simulate planning failure/i.test(input.context))
        throw new PlanningProviderError("summary_generation_failed", true);
      if (/simulate invalid planning schema/i.test(input.context))
        throw new PlanningProviderError("invalid_summary_response", true);
      const hasYosemite = /yosemite/i.test(input.context);
      const confirmedYosemite =
        /"confirmedDecisions"\s*:\s*\[\s*\{[^\]]*yosemite/i.test(input.context);
      const hasDates = /sep|september|datewindows/i.test(input.context);
      const summary = planningSummarySchema.parse({
        schemaVersion: "1",
        title: "Before I build the trip",
        tripSnapshot: {
          destinations: hasYosemite ? ["Yosemite"] : [],
          dateWindows: hasDates ? ["September 12–16"] : [],
          travelerCount: 2,
          origins: [],
          budget: [],
          approvalMode: /host_only/i.test(input.context)
            ? "host_only"
            : "all_active",
        },
        confirmedDecisions: confirmedYosemite
          ? [item("confirmed:0", "Destination", "Yosemite")]
          : [],
        travelerPreferences: /hiking/i.test(input.context)
          ? [item("preference:0", "Activity preference", "Hiking")]
          : [],
        constraints: [],
        proposals:
          hasYosemite && !confirmedYosemite
            ? [item("proposal:0", "Destination proposal", "Yosemite")]
            : [],
        rejectedOptions: [],
        conflicts: /conflict/i.test(input.context)
          ? [
              item(
                "conflict:0",
                "Conflict",
                "Crew members described conflicting constraints",
              ),
            ]
          : [],
        openQuestions: /open question/i.test(input.context)
          ? [
              item(
                "question:0",
                "Open question",
                "A crew question remains unresolved",
              ),
            ]
          : [],
        missingCriticalInformation: [],
        nonAssumptions: [
          item(
            "non_assumption:0",
            "No silent choices",
            "Trailie will not choose unresolved details",
          ),
        ],
        readiness: { status: "ready_for_review", blockers: [], warnings: [] },
        evidence: {
          memoryVersion: 1,
          latestMessageId: null,
          sourceMessageIds: [sourceId],
        },
      });
      return {
        summary,
        responseId: "fake_planning_response",
        requestId: "fake_planning_request",
        usage: {
          inputTokens: 120,
          outputTokens: 80,
          reasoningTokens: 12,
          cachedInputTokens: 0,
          totalTokens: 212,
        },
      };
    },
  };
}
