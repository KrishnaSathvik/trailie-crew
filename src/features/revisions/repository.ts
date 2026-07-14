import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  itinerarySchema,
  planChangeAnalysisSchema,
  planChangeStatusSchema,
  planningSummarySchema,
  validationReportSchema,
  type Itinerary,
  type PlanChangeAnalysis,
  type ValidationReport,
} from "@trailie/schemas";
import { createAdminSupabaseClient } from "@/server/supabase/admin";
import type { Json } from "@/types/database";
import { routeChangeAnalysisModel } from "./routing";
import type { ProviderMeta } from "./provider";
import type { RevisionContext, RevisionRepository } from "./worker";
import type { NormalizedToolEvidence } from "@/features/itinerary/validation/validate-itinerary";

const claimSchema = z.object({ claimed: z.boolean() }).passthrough();
const candidateSchema = z
  .object({ id: z.uuid(), version: z.number().int().positive() })
  .passthrough();
const evidenceSchema = z.object({
  id: z.string(),
  itemId: z.string().nullable(),
  provider: z.string(),
  toolName: z.string(),
  requestFingerprint: z.string(),
  status: z.enum(["verified", "unavailable", "stale", "failed"]),
  retrievedAt: z.string(),
  expiresAt: z.string().nullable(),
  normalizedResult: z.record(z.string(), z.unknown()),
  sourceReference: z
    .object({ label: z.string(), url: z.string().nullable() })
    .nullable(),
});
const contextSchema = z.object({
  request: z.object({
    id: z.uuid(),
    roomId: z.uuid(),
    status: planChangeStatusSchema,
    requestType: z.enum([
      "add_item",
      "remove_item",
      "replace_item",
      "move_item",
      "reschedule_item",
      "shorten_item",
      "extend_item",
      "change_route",
      "change_lodging",
      "change_food",
      "rebalance_day",
      "update_traveler_logistics",
      "adjust_budget",
      "general_revision",
    ]),
    targetItemId: z.string().nullable(),
    requestText: z.string(),
    basePlanVersion: z.number().int().positive(),
    currentAnalysisVersion: z.number().int().nonnegative(),
    approvedAnalysisVersion: z.number().int().positive().nullable(),
    candidateTripPlanId: z.uuid().nullable(),
  }),
  basePlan: itinerarySchema,
  approvedSummary: planningSummarySchema,
  analysis: planChangeAnalysisSchema.nullable(),
  candidatePlan: itinerarySchema.nullable(),
  evidence: z.array(evidenceSchema),
});

function ensure(error: { message: string } | null, code: string) {
  if (error) throw new Error(code);
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function usageArgs(id: string, runType: string, output: ProviderMeta) {
  return {
    target_change_request_id: id,
    target_run_type: runType,
    target_provider_response_id: output.responseId,
    target_provider_request_id: output.requestId,
    target_input_tokens: output.usage.inputTokens,
    target_output_tokens: output.usage.outputTokens,
    target_reasoning_tokens: output.usage.reasoningTokens,
    target_cached_input_tokens: output.usage.cachedInputTokens,
    target_total_tokens: output.usage.totalTokens,
    target_latency_ms: 0,
  };
}

export function createRevisionRepository(): RevisionRepository {
  const admin = createAdminSupabaseClient();
  return {
    async loadContext(id): Promise<RevisionContext> {
      const { data, error } = await admin.rpc("get_plan_change_context", {
        target_change_request_id: id,
      });
      ensure(error, "change_request_not_allowed");
      return contextSchema.parse(data) as RevisionContext;
    },
    async claimAnalysis(id, model) {
      const { data, error } = await admin.rpc("claim_change_analysis", {
        target_change_request_id: id,
        target_model: model,
        target_prompt_version: "trailie-change-analysis-v1",
        target_schema_version: "1",
      });
      ensure(error, "change_analysis_failed");
      return claimSchema.parse(data);
    },
    async completeAnalysis(id, analysis) {
      const model = routeChangeAnalysisModel({
        requestType: analysis.requestedChange.type,
        affectedItemCount: analysis.affectedItems.length,
        affectedDayCount: analysis.affectedDays.length,
        materiality: analysis.materiality,
        touchesConfirmedDecision:
          analysis.impacts.confirmedDecisions.length > 0,
      });
      const { error } = await admin.rpc("complete_change_analysis", {
        target_change_request_id: id,
        validated_analysis: analysis as unknown as Json,
        target_materiality: analysis.materiality,
        target_feasibility: analysis.feasibility,
        target_analysis_hash: hash(analysis),
        target_model: model,
        target_prompt_version: "trailie-change-analysis-v1",
        target_schema_version: "1",
      });
      ensure(error, "invalid_change_analysis");
    },
    async claimCandidate(id) {
      const { data, error } = await admin.rpc("claim_candidate_generation", {
        target_change_request_id: id,
      });
      ensure(error, "candidate_generation_failed");
      return claimSchema.parse(data);
    },
    async attachCandidate(id, itinerary) {
      const { data, error } = await admin.rpc("attach_candidate_trip_plan", {
        target_change_request_id: id,
        validated_itinerary: itinerary as unknown as Json,
        target_model: "gpt-5.6-sol",
        target_prompt_version: "trailie-itinerary-revision-v1",
        target_schema_version: "1",
      });
      ensure(error, "invalid_candidate");
      return candidateSchema.parse(data);
    },
    async recordEvidence(id, evidence) {
      const { data, error } = await admin.rpc("record_tool_evidence", {
        target_trip_plan_id: id,
        target_provider: evidence.provider,
        target_tool_name: evidence.toolName,
        target_request_fingerprint:
          evidence.requestFingerprint ??
          `${evidence.toolName}:${evidence.itemId ?? "plan"}`,
        target_retrieved_at: evidence.retrievedAt,
        target_expires_at: evidence.expiresAt,
        target_status: evidence.status,
        target_normalized_result: evidence.normalizedResult as Json,
        target_source_reference: evidence.sourceReference as Json | null,
        target_itinerary_item_id: evidence.itemId ?? null,
      });
      ensure(error, "tool_unavailable");
      return `evidence:${String(data)}`;
    },
    async updateCandidate(id, itinerary) {
      const { error } = await admin.rpc("update_plan_change_candidate", {
        target_candidate_trip_plan_id: id,
        validated_itinerary: itinerary as unknown as Json,
      });
      ensure(error, "invalid_candidate");
    },
    async recordValidation(id, report, version) {
      const value = validationReportSchema.parse(report);
      const { error } = await admin.rpc("record_validation_report", {
        target_trip_plan_id: id,
        target_plan_version: version,
        target_validator_version: value.validatorVersion,
        target_status: value.status,
        target_issues: value.issues as unknown as Json,
        target_warnings: value.warnings as unknown as Json,
      });
      ensure(error, "candidate_validation_failed");
    },
    async startRepair(id) {
      const { data, error } = await admin.rpc("start_plan_change_repair", {
        target_change_request_id: id,
      });
      ensure(error, "candidate_blocked");
      return claimSchema.parse(data);
    },
    async recordRunUsage(id, runType, output) {
      const { error } = await admin.rpc(
        "record_plan_change_run_usage",
        usageArgs(id, runType, output),
      );
      ensure(error, "unknown_error");
    },
    async completeCandidate(id, boundary, diff) {
      const { error } = await admin.rpc("complete_plan_change_candidate", {
        target_change_request_id: id,
        boundary_report: boundary as unknown as Json,
        candidate_diff: diff as unknown as Json,
      });
      ensure(error, "candidate_validation_failed");
    },
    async block(id, code) {
      const { error } = await admin.rpc("block_plan_change", {
        target_change_request_id: id,
        target_error_code: code,
      });
      ensure(error, "candidate_blocked");
    },
    async fail(id, code) {
      const { error } = await admin.rpc("fail_plan_change", {
        target_change_request_id: id,
        target_error_code: code,
      });
      if (error && !/not allowed/i.test(error.message))
        throw new Error("change_analysis_failed");
    },
  };
}

export function parseRevisionContext(value: unknown) {
  return contextSchema.parse(value);
}

export type RevisionEvidence = NormalizedToolEvidence;
export type RevisionPlan = Itinerary;
export type RevisionAnalysis = PlanChangeAnalysis;
export type RevisionValidation = ValidationReport;
