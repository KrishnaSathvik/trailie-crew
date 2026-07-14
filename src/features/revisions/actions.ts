"use server";
import { z } from "zod";
import {
  candidateConfirmationDecisionSchema,
  planChangeDecisionSchema,
  planChangeRequestSchema,
  planChangeTypeSchema,
  planVersionDiffSchema,
  planVersionSummarySchema,
  tripPlanViewSchema,
  type PlanChangeRequest,
  type PlanVersionDiff,
  type PlanVersionSummary,
  type TripPlanView,
} from "@trailie/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { schedulePlanChange, schedulePlanChangePublication } from "./scheduler";

export type RevisionActionError =
  | "change_request_not_allowed"
  | "base_plan_not_current"
  | "base_plan_not_found"
  | "target_item_not_found"
  | "change_request_active"
  | "change_request_stale"
  | "analysis_version_mismatch"
  | "change_approval_not_allowed"
  | "change_note_required"
  | "candidate_confirmation_required"
  | "membership_required"
  | "permission_denied"
  | "plan_not_found"
  | "unknown_error";
type Result<T> =
  { ok: true; data: T } | { ok: false; error: RevisionActionError };

async function client() {
  const value = await createServerSupabaseClient();
  const { data, error } = await value.auth.getUser();
  return !error && data.user ? value : null;
}
function map(error: { message?: string } | null): RevisionActionError {
  const message = error?.message ?? "";
  if (/stale|not current/i.test(message)) return "change_request_stale";
  if (/base plan not found/i.test(message)) return "base_plan_not_found";
  if (/target item/i.test(message)) return "target_item_not_found";
  if (/analysis version/i.test(message)) return "analysis_version_mismatch";
  if (/note required/i.test(message)) return "change_note_required";
  if (/candidate confirmation/i.test(message))
    return "candidate_confirmation_required";
  if (/membership|authentication/i.test(message)) return "membership_required";
  if (/plan not found/i.test(message)) return "plan_not_found";
  if (/approval not allowed/i.test(message))
    return "change_approval_not_allowed";
  if (/not allowed/i.test(message)) return "change_request_not_allowed";
  return "unknown_error";
}
async function rpc(name: string, args: Record<string, unknown>) {
  const supabase = await client();
  if (!supabase)
    return { data: null, error: { message: "Membership required." } };
  return supabase.rpc(name as never, args as never);
}

const createSchema = z
  .object({
    baseTripPlanId: z.uuid(),
    participantId: z.uuid(),
    requestType: planChangeTypeSchema,
    targetItemId: z.string().trim().min(1).max(200).nullable(),
    requestText: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .refine((value) => !/[<>]/.test(value)),
  })
  .strict();
export async function createPlanChangeRequestAction(input: unknown): Promise<
  Result<{
    id: string;
    status: string;
    basePlanVersion: number;
    reused: boolean;
  }>
> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "change_request_not_allowed" };
  const { data, error } = await rpc("create_plan_change_request", {
    base_trip_plan_id: parsed.data.baseTripPlanId,
    participant_id: parsed.data.participantId,
    request_type: parsed.data.requestType,
    target_item_id: parsed.data.targetItemId,
    request_text: parsed.data.requestText,
  });
  if (error) return { ok: false, error: map(error) };
  const value = z
    .object({
      id: z.uuid(),
      status: z.string(),
      basePlanVersion: z.number().int().positive(),
      created: z.boolean(),
    })
    .passthrough()
    .parse(data);
  schedulePlanChange(value.id);
  return {
    ok: true,
    data: {
      id: value.id,
      status: value.status,
      basePlanVersion: value.basePlanVersion,
      reused: !value.created,
    },
  };
}

const reviewSchema = z
  .object({
    changeRequestId: z.uuid(),
    analysisVersion: z.number().int().positive(),
    participantId: z.uuid(),
    decision: planChangeDecisionSchema,
    note: z.string().trim().min(1).max(500).nullable(),
  })
  .strict();
export async function reviewPlanChangeAction(
  input: unknown,
): Promise<Result<{ id: string; status: string; complete: boolean }>> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "change_approval_not_allowed" };
  const { data, error } = await rpc("review_plan_change", {
    target_change_request_id: parsed.data.changeRequestId,
    target_analysis_version: parsed.data.analysisVersion,
    target_participant_id: parsed.data.participantId,
    target_decision: parsed.data.decision,
    note: parsed.data.note,
  });
  if (error) return { ok: false, error: map(error) };
  const value = z
    .object({ id: z.uuid(), status: z.string(), complete: z.boolean() })
    .parse(data);
  if (value.complete && value.status === "approved")
    schedulePlanChange(value.id);
  return { ok: true, data: value };
}

const confirmationSchema = z
  .object({
    changeRequestId: z.uuid(),
    candidateTripPlanId: z.uuid(),
    participantId: z.uuid(),
    decision: candidateConfirmationDecisionSchema,
    note: z.string().trim().min(1).max(500).nullable(),
  })
  .strict();
export async function confirmPlanChangeAction(
  input: unknown,
): Promise<Result<{ id: string; status: string; complete: boolean }>> {
  const parsed = confirmationSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "candidate_confirmation_required" };
  const { data, error } = await rpc("confirm_plan_change_candidate", {
    target_change_request_id: parsed.data.changeRequestId,
    target_candidate_trip_plan_id: parsed.data.candidateTripPlanId,
    target_participant_id: parsed.data.participantId,
    target_decision: parsed.data.decision,
    note: parsed.data.note,
  });
  if (error) return { ok: false, error: map(error) };
  const value = z
    .object({ id: z.uuid(), status: z.string(), complete: z.boolean() })
    .parse(data);
  if (value.complete) schedulePlanChangePublication(value.id);
  return { ok: true, data: value };
}

export async function cancelPlanChangeAction(
  input: unknown,
): Promise<Result<{ id: string; status: string }>> {
  const parsed = z
    .object({ changeRequestId: z.uuid(), participantId: z.uuid() })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "change_request_not_allowed" };
  const { data, error } = await rpc("cancel_plan_change_request", {
    target_change_request_id: parsed.data.changeRequestId,
    target_participant_id: parsed.data.participantId,
  });
  if (error) return { ok: false, error: map(error) };
  return {
    ok: true,
    data: z.object({ id: z.uuid(), status: z.string() }).parse(data),
  };
}

export async function getPlanChangeRequestAction(
  roomId: string,
): Promise<Result<PlanChangeRequest | null>> {
  if (!z.uuid().safeParse(roomId).success)
    return { ok: false, error: "unknown_error" };
  const { data, error } = await rpc("get_plan_change_request", {
    target_room_id: roomId,
  });
  if (error) return { ok: false, error: map(error) };
  const value = planChangeRequestSchema.nullable().safeParse(data);
  return value.success
    ? { ok: true, data: value.data }
    : { ok: false, error: "unknown_error" };
}
export async function listPlanVersionsAction(
  roomId: string,
): Promise<Result<PlanVersionSummary[]>> {
  if (!z.uuid().safeParse(roomId).success)
    return { ok: false, error: "unknown_error" };
  const { data, error } = await rpc("list_plan_versions", {
    target_room_id: roomId,
  });
  if (error) return { ok: false, error: map(error) };
  const value = z.array(planVersionSummarySchema).safeParse(data);
  return value.success
    ? { ok: true, data: value.data }
    : { ok: false, error: "unknown_error" };
}
export async function getPlanVersionAction(
  roomId: string,
  version: number,
): Promise<Result<TripPlanView>> {
  const parsed = z
    .object({ roomId: z.uuid(), version: z.number().int().positive() })
    .safeParse({ roomId, version });
  if (!parsed.success) return { ok: false, error: "unknown_error" };
  const { data, error } = await rpc("get_trip_plan_version", {
    target_room_id: roomId,
    target_version: version,
  });
  if (error) return { ok: false, error: map(error) };
  const value = tripPlanViewSchema.safeParse(data);
  return value.success
    ? { ok: true, data: value.data }
    : { ok: false, error: "unknown_error" };
}
export async function comparePlanVersionsAction(
  roomId: string,
  baseVersion: number,
  candidateVersion: number,
): Promise<Result<PlanVersionDiff>> {
  const parsed = z
    .object({
      roomId: z.uuid(),
      baseVersion: z.number().int().positive(),
      candidateVersion: z.number().int().positive(),
    })
    .safeParse({ roomId, baseVersion, candidateVersion });
  if (!parsed.success) return { ok: false, error: "unknown_error" };
  const { data, error } = await rpc("compare_plan_versions", {
    target_room_id: roomId,
    base_version: baseVersion,
    candidate_version: candidateVersion,
  });
  if (error) return { ok: false, error: map(error) };
  const value = planVersionDiffSchema.safeParse(data);
  return value.success
    ? { ok: true, data: value.data }
    : { ok: false, error: "unknown_error" };
}
