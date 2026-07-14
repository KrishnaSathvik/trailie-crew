"use server";

import { z } from "zod";

import { planShareModeSchema, planShareStatusSchema } from "@trailie/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapShareError, type ShareActionError } from "./errors";
import { generateShareToken, hashShareToken } from "./token";

type Result<T> = { ok: true; data: T } | { ok: false; error: ShareActionError };

const timestamp = z.iso.datetime({ offset: true });
const shareMetadataSchema = z
  .object({
    id: z.uuid(),
    tripPlanId: z.uuid(),
    planVersion: z.number().int().positive(),
    mode: planShareModeSchema.exclude(["private"]),
    status: planShareStatusSchema,
    tokenPrefix: z.string().regex(/^[A-Za-z0-9_-]{6,12}$/),
    snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
    expiresAt: timestamp.nullable(),
    createdAt: timestamp,
    revokedAt: timestamp.nullable().optional(),
  })
  .strict();
const privateStatusSchema = z
  .object({
    tripPlanId: z.uuid(),
    planVersion: z.number().int().positive(),
    mode: z.literal("private"),
    status: z.enum(["revoked", "expired"]),
  })
  .strict();
export type PlanShareStatusView =
  z.infer<typeof shareMetadataSchema> | z.infer<typeof privateStatusSchema>;

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getUser();
  return !error && data.user ? client : null;
}

const createInputSchema = z
  .object({
    tripPlanId: z.uuid(),
    participantId: z.uuid(),
    mode: planShareModeSchema.exclude(["private"]),
    expiresAt: timestamp.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === "public_link" && value.expiresAt !== null)
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "Public links do not expire.",
      });
    if (
      value.mode === "expiring_link" &&
      (value.expiresAt === null || Date.parse(value.expiresAt) <= Date.now())
    )
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "A future expiration is required.",
      });
  });

export async function createPlanShareLinkAction(
  input: unknown,
): Promise<Result<z.infer<typeof shareMetadataSchema> & { shareUrl: string }>> {
  const parsed = createInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_expiration" };
  const client = await authenticatedClient();
  if (!client) return { ok: false, error: "permission_denied" };
  const token = generateShareToken();
  const { data, error } = await client.rpc("create_plan_share_link", {
    target_trip_plan_id: parsed.data.tripPlanId,
    participant_id: parsed.data.participantId,
    share_mode: parsed.data.mode,
    target_token_hash: hashShareToken(token),
    target_token_prefix: token.slice(0, 8),
    target_expires_at: parsed.data.expiresAt,
  });
  if (error) return { ok: false, error: mapShareError(error) };
  const result = shareMetadataSchema.safeParse(data);
  if (!result.success) return { ok: false, error: "unknown_error" };
  return {
    ok: true,
    data: { ...result.data, shareUrl: `/share/${token}` },
  };
}

export async function getPlanShareStatusAction(
  tripPlanId: string,
  planVersion: number,
): Promise<Result<PlanShareStatusView>> {
  const parsed = z
    .object({ tripPlanId: z.uuid(), planVersion: z.number().int().positive() })
    .safeParse({ tripPlanId, planVersion });
  if (!parsed.success) return { ok: false, error: "unknown_error" };
  const client = await authenticatedClient();
  if (!client) return { ok: false, error: "permission_denied" };
  const { data, error } = await client.rpc("get_plan_share_status", {
    target_trip_plan_id: parsed.data.tripPlanId,
    target_plan_version: parsed.data.planVersion,
  });
  if (error) return { ok: false, error: mapShareError(error) };
  const result = z
    .union([shareMetadataSchema, privateStatusSchema])
    .safeParse(data);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: "unknown_error" };
}

const revokeInputSchema = z
  .object({ shareLinkId: z.uuid(), participantId: z.uuid() })
  .strict();
const revokedSchema = z
  .object({
    id: z.uuid(),
    tripPlanId: z.uuid(),
    planVersion: z.number().int().positive(),
    status: z.literal("revoked"),
  })
  .strict();
export async function revokePlanShareLinkAction(
  input: unknown,
): Promise<Result<z.infer<typeof revokedSchema>>> {
  const parsed = revokeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "share_not_allowed" };
  const client = await authenticatedClient();
  if (!client) return { ok: false, error: "permission_denied" };
  const { data, error } = await client.rpc("revoke_plan_share_link", {
    share_link_id: parsed.data.shareLinkId,
    participant_id: parsed.data.participantId,
  });
  if (error) return { ok: false, error: mapShareError(error) };
  const result = revokedSchema.safeParse(data);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: "unknown_error" };
}
