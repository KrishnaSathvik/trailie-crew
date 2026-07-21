"use server";

import { cookies } from "next/headers";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  guestCommentSchema,
  guestDisplayNameSchema,
  guestInviteMetadataSchema,
  guestRoleSchema,
  guestSuggestionDetailsSchema,
  guestSuggestionSchema,
  guestSuggestionTargetTypeSchema,
  guestSuggestionTitleSchema,
  guestSuggestionTypeSchema,
  plainTextCommentSchema,
} from "./contracts";
import {
  createGuestComment,
  createGuestSuggestion,
  createScopedGuestSession,
  deleteGuestComment,
  deleteGuestSuggestion,
  updateGuestComment,
  updateGuestSuggestion,
} from "./repository";
import { generateGuestToken, hashGuestToken } from "./token";
import { schedulePlanChange } from "@/features/revisions/scheduler";
import { verifyCaptchaForGuestInvite } from "@/features/security/captcha-server";

const GUEST_SESSION_COOKIE = "trailie_guest_session";
const timestamp = z.iso.datetime({ offset: true });

type GuestActionError =
  | "invalid_invite"
  | "invalid_expiration"
  | "permission_denied"
  | "host_required"
  | "rate_limited"
  | "guest_unavailable"
  | "invalid_comment"
  | "comment_unavailable"
  | "invalid_suggestion"
  | "suggestion_unavailable"
  | "suggestion_immutable"
  | "suggestion_no_longer_applies";
type Result<T> = { ok: true; data: T } | { ok: false; error: GuestActionError };

async function authenticatedClient() {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.auth.getUser();
  return !error && data.user ? client : null;
}

function mapError(error: { message?: string } | null): GuestActionError {
  const message = error?.message ?? "";
  if (/host required/i.test(message)) return "host_required";
  if (/rate limited/i.test(message)) return "rate_limited";
  if (/membership|authentication/i.test(message)) return "permission_denied";
  if (/expiration/i.test(message)) return "invalid_expiration";
  if (/no longer applies/i.test(message)) return "suggestion_no_longer_applies";
  if (/immutable/i.test(message)) return "suggestion_immutable";
  return "guest_unavailable";
}

async function memberRpc(name: string, args: Record<string, unknown>) {
  const client = await authenticatedClient();
  if (!client)
    return { data: null, error: { message: "Authentication required." } };
  return client.rpc(name as never, args as never) as unknown as Promise<{
    data: unknown;
    error: { message?: string } | null;
  }>;
}

const createInviteInputSchema = z
  .object({
    planVersionId: z.uuid(),
    participantId: z.uuid(),
    role: guestRoleSchema,
    expiresAt: timestamp,
  })
  .strict()
  .refine(
    ({ expiresAt }) => {
      const value = Date.parse(expiresAt);
      return (
        Number.isFinite(value) &&
        value > Date.now() &&
        value <= Date.now() + 90 * 24 * 60 * 60 * 1000
      );
    },
    { path: ["expiresAt"] },
  );

async function createOrRotateInvite(input: {
  rpcName: "create_guest_invite" | "rotate_guest_invite";
  rpcArgs: Record<string, unknown>;
}) {
  const token = generateGuestToken();
  const { data, error } = await memberRpc(input.rpcName, {
    ...input.rpcArgs,
    target_token_hash: hashGuestToken(token),
    target_token_prefix: token.slice(0, 8),
  });
  if (error) return { ok: false, error: mapError(error) } as const;
  const parsed = guestInviteMetadataSchema.safeParse(data);
  if (!parsed.success)
    return { ok: false, error: "guest_unavailable" } as const;
  return {
    ok: true,
    data: { ...parsed.data, guestUrl: `/guest/${token}` },
  } as const;
}

export async function createGuestInviteAction(
  input: unknown,
): Promise<
  Result<z.infer<typeof guestInviteMetadataSchema> & { guestUrl: string }>
> {
  const parsed = createInviteInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_expiration" };
  return createOrRotateInvite({
    rpcName: "create_guest_invite",
    rpcArgs: {
      target_plan_version_id: parsed.data.planVersionId,
      participant_id: parsed.data.participantId,
      target_role: parsed.data.role,
      target_expires_at: parsed.data.expiresAt,
      target_max_uses: 25,
    },
  });
}

const rotateInputSchema = z
  .object({ inviteId: z.uuid(), participantId: z.uuid() })
  .strict();

export async function rotateGuestInviteAction(
  input: unknown,
): Promise<
  Result<z.infer<typeof guestInviteMetadataSchema> & { guestUrl: string }>
> {
  const parsed = rotateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_invite" };
  return createOrRotateInvite({
    rpcName: "rotate_guest_invite",
    rpcArgs: {
      invite_id: parsed.data.inviteId,
      participant_id: parsed.data.participantId,
    },
  });
}

export async function listGuestInvitesAction(
  roomId: string,
  planVersion: number,
): Promise<Result<z.infer<typeof guestInviteMetadataSchema>[]>> {
  const parsed = z
    .object({
      roomId: z.uuid(),
      planVersion: z.number().int().positive(),
    })
    .safeParse({ roomId, planVersion });
  if (!parsed.success) return { ok: false, error: "invalid_invite" };
  const { data, error } = await memberRpc("list_guest_invites", {
    target_room_id: parsed.data.roomId,
    target_plan_version: parsed.data.planVersion,
  });
  if (error) return { ok: false, error: mapError(error) };
  const result = guestInviteMetadataSchema.array().safeParse(data);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: "guest_unavailable" };
}

const revokedInviteSchema = z
  .object({
    id: z.uuid(),
    planVersionId: z.uuid(),
    planVersion: z.number().int().positive(),
    status: z.literal("revoked"),
  })
  .strict();

export async function revokeGuestInviteAction(
  input: unknown,
): Promise<Result<z.infer<typeof revokedInviteSchema>>> {
  const parsed = rotateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_invite" };
  const { data, error } = await memberRpc("revoke_guest_invite", {
    invite_id: parsed.data.inviteId,
    participant_id: parsed.data.participantId,
  });
  if (error) return { ok: false, error: mapError(error) };
  const result = revokedInviteSchema.safeParse(data);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: "guest_unavailable" };
}

const beginSessionInputSchema = z
  .object({
    inviteToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    displayName: guestDisplayNameSchema,
    captchaToken: z.string().trim().min(1).max(4096),
  })
  .strict();

export async function beginGuestSessionAction(
  input: unknown,
): Promise<Result<{ redirectTo: "/guest/plan" }>> {
  const parsed = beginSessionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "guest_unavailable" };
  try {
    await verifyCaptchaForGuestInvite({
      token: parsed.data.captchaToken,
      inviteFingerprint: hashGuestToken(parsed.data.inviteToken),
    });
  } catch {
    return { ok: false, error: "guest_unavailable" };
  }
  const sessionToken = generateGuestToken();
  const session = await createScopedGuestSession({
    inviteToken: parsed.data.inviteToken,
    sessionToken,
    displayName: parsed.data.displayName,
  });
  if (!session) return { ok: false, error: "guest_unavailable" };
  const cookieStore = await cookies();
  cookieStore.set(GUEST_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_ENV === "production",
    path: "/guest",
    expires: new Date(session.expiresAt),
  });
  return { ok: true, data: { redirectTo: "/guest/plan" } };
}

async function guestSessionToken() {
  const cookieStore = await cookies();
  return cookieStore.get(GUEST_SESSION_COOKIE)?.value ?? null;
}

const commentTargetSchema = z
  .object({
    dayKey: z.string().trim().min(1).max(200).nullable(),
    itemKey: z.string().trim().min(1).max(200).nullable(),
    body: plainTextCommentSchema,
  })
  .strict()
  .refine((value) => value.itemKey === null || value.dayKey !== null);

function mutationError(error: unknown): GuestActionError {
  return error instanceof Error && /rate_limited/.test(error.message)
    ? "rate_limited"
    : "comment_unavailable";
}

export async function createGuestCommentAction(
  input: unknown,
): Promise<Result<z.infer<typeof guestCommentSchema>>> {
  const parsed = commentTargetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_comment" };
  const token = await guestSessionToken();
  if (!token) return { ok: false, error: "guest_unavailable" };
  try {
    return {
      ok: true,
      data: await createGuestComment(token, parsed.data),
    };
  } catch (error) {
    return { ok: false, error: mutationError(error) };
  }
}

const editCommentSchema = z
  .object({ commentId: z.uuid(), body: plainTextCommentSchema })
  .strict();

export async function updateGuestCommentAction(
  input: unknown,
): Promise<Result<z.infer<typeof guestCommentSchema>>> {
  const parsed = editCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_comment" };
  const token = await guestSessionToken();
  if (!token) return { ok: false, error: "guest_unavailable" };
  try {
    return {
      ok: true,
      data: await updateGuestComment(
        token,
        parsed.data.commentId,
        parsed.data.body,
      ),
    };
  } catch (error) {
    return { ok: false, error: mutationError(error) };
  }
}

export async function deleteGuestCommentAction(
  input: unknown,
): Promise<Result<z.infer<typeof guestCommentSchema>>> {
  const parsed = z.object({ commentId: z.uuid() }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_comment" };
  const token = await guestSessionToken();
  if (!token) return { ok: false, error: "guest_unavailable" };
  try {
    return {
      ok: true,
      data: await deleteGuestComment(token, parsed.data.commentId),
    };
  } catch (error) {
    return { ok: false, error: mutationError(error) };
  }
}

export async function listMemberCommentsAction(
  roomId: string,
  planVersion: number,
): Promise<Result<z.infer<typeof guestCommentSchema>[]>> {
  const parsed = z
    .object({ roomId: z.uuid(), planVersion: z.number().int().positive() })
    .safeParse({ roomId, planVersion });
  if (!parsed.success) return { ok: false, error: "comment_unavailable" };
  const { data, error } = await memberRpc("list_member_plan_comments", {
    target_room_id: parsed.data.roomId,
    target_plan_version: parsed.data.planVersion,
  });
  if (error) return { ok: false, error: mapError(error) };
  const result = guestCommentSchema.array().safeParse(data);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: "comment_unavailable" };
}

const memberCommentSchema = commentTargetSchema.extend({
  roomId: z.uuid(),
  planVersion: z.number().int().positive(),
  participantId: z.uuid(),
});

export async function createMemberCommentAction(
  input: unknown,
): Promise<Result<z.infer<typeof guestCommentSchema>>> {
  const parsed = memberCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_comment" };
  const { data, error } = await memberRpc("create_member_plan_comment", {
    target_room_id: parsed.data.roomId,
    target_plan_version: parsed.data.planVersion,
    participant_id: parsed.data.participantId,
    target_body: parsed.data.body,
    target_day_key: parsed.data.dayKey,
    target_item_key: parsed.data.itemKey,
  });
  if (error) return { ok: false, error: mapError(error) };
  const result = guestCommentSchema.safeParse(data);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: "comment_unavailable" };
}

export async function resolvePlanCommentAction(
  input: unknown,
): Promise<Result<z.infer<typeof guestCommentSchema>>> {
  const parsed = z
    .object({ commentId: z.uuid(), participantId: z.uuid() })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_comment" };
  const { data, error } = await memberRpc("resolve_plan_comment", {
    target_comment_id: parsed.data.commentId,
    participant_id: parsed.data.participantId,
  });
  if (error) return { ok: false, error: mapError(error) };
  const result = guestCommentSchema.safeParse(data);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: "comment_unavailable" };
}

const optionalTime = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
const suggestionDetailsSchema = z
  .object({
    title: guestSuggestionTitleSchema,
    details: guestSuggestionDetailsSchema,
    proposedDate: z.iso.date().nullable(),
    proposedStartTime: optionalTime,
    proposedEndTime: optionalTime,
  })
  .refine(
    ({ proposedStartTime, proposedEndTime }) =>
      !proposedStartTime ||
      !proposedEndTime ||
      proposedEndTime > proposedStartTime,
    { path: ["proposedEndTime"] },
  );
const createSuggestionSchema = suggestionDetailsSchema
  .extend({
    targetType: guestSuggestionTargetTypeSchema,
    targetKey: z.string().trim().min(1).max(200).nullable(),
    suggestionType: guestSuggestionTypeSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.targetType === "plan" && value.targetKey !== null)
      context.addIssue({
        code: "custom",
        path: ["targetKey"],
        message: "Plan suggestions do not accept a target key.",
      });
    if (value.targetType !== "plan" && value.targetKey === null)
      context.addIssue({
        code: "custom",
        path: ["targetKey"],
        message: "A scoped target is required.",
      });
    if (
      [
        "remove_item",
        "replace_item",
        "reschedule_item",
        "move_item",
        "update_note",
      ].includes(value.suggestionType) &&
      value.targetType !== "item"
    )
      context.addIssue({
        code: "custom",
        path: ["targetType"],
        message: "This suggestion type requires an item.",
      });
    if (
      value.suggestionType === "add_item" &&
      !["plan", "day"].includes(value.targetType)
    )
      context.addIssue({
        code: "custom",
        path: ["targetType"],
        message: "Add-item suggestions target a plan or day.",
      });
    if (
      value.suggestionType === "change_route" &&
      !["item", "route"].includes(value.targetType)
    )
      context.addIssue({
        code: "custom",
        path: ["targetType"],
        message: "Route suggestions require a route anchor.",
      });
  });

function suggestionMutationError(error: unknown): GuestActionError {
  if (!(error instanceof Error)) return "suggestion_unavailable";
  if (/rate_limited/.test(error.message)) return "rate_limited";
  if (/immutable/.test(error.message)) return "suggestion_immutable";
  return "suggestion_unavailable";
}

export async function createGuestSuggestionAction(
  input: unknown,
): Promise<Result<z.infer<typeof guestSuggestionSchema>>> {
  const parsed = createSuggestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_suggestion" };
  const token = await guestSessionToken();
  if (!token) return { ok: false, error: "guest_unavailable" };
  try {
    return {
      ok: true,
      data: await createGuestSuggestion(token, parsed.data),
    };
  } catch (error) {
    return { ok: false, error: suggestionMutationError(error) };
  }
}

const updateSuggestionSchema = suggestionDetailsSchema
  .extend({ suggestionId: z.uuid() })
  .strict();

export async function updateGuestSuggestionAction(
  input: unknown,
): Promise<Result<z.infer<typeof guestSuggestionSchema>>> {
  const parsed = updateSuggestionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_suggestion" };
  const token = await guestSessionToken();
  if (!token) return { ok: false, error: "guest_unavailable" };
  try {
    return {
      ok: true,
      data: await updateGuestSuggestion(token, parsed.data),
    };
  } catch (error) {
    return { ok: false, error: suggestionMutationError(error) };
  }
}

export async function deleteGuestSuggestionAction(
  input: unknown,
): Promise<Result<{ id: string; deleted: true }>> {
  const parsed = z.object({ suggestionId: z.uuid() }).strict().safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_suggestion" };
  const token = await guestSessionToken();
  if (!token) return { ok: false, error: "guest_unavailable" };
  try {
    return {
      ok: true,
      data: await deleteGuestSuggestion(token, parsed.data.suggestionId),
    };
  } catch (error) {
    return { ok: false, error: suggestionMutationError(error) };
  }
}

export async function listMemberGuestSuggestionsAction(
  roomId: string,
): Promise<Result<z.infer<typeof guestSuggestionSchema>[]>> {
  if (!z.uuid().safeParse(roomId).success)
    return { ok: false, error: "suggestion_unavailable" };
  const { data, error } = await memberRpc("list_member_guest_suggestions", {
    target_room_id: roomId,
  });
  if (error) return { ok: false, error: mapError(error) };
  const parsed = guestSuggestionSchema.array().safeParse(data);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: "suggestion_unavailable" };
}

export async function dismissGuestSuggestionAction(
  input: unknown,
): Promise<Result<z.infer<typeof guestSuggestionSchema>>> {
  const parsed = z
    .object({ suggestionId: z.uuid(), participantId: z.uuid() })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_suggestion" };
  const { data, error } = await memberRpc("dismiss_guest_suggestion", {
    target_suggestion_id: parsed.data.suggestionId,
    participant_id: parsed.data.participantId,
  });
  if (error) return { ok: false, error: mapError(error) };
  const result = guestSuggestionSchema.safeParse(data);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, error: "suggestion_unavailable" };
}

const conversionSchema = z
  .object({
    suggestion: guestSuggestionSchema,
    requiresRebaseConfirmation: z.boolean(),
    originalPlanVersion: z.number().int().positive().optional(),
    currentPlanVersion: z.number().int().positive().optional(),
    warning: z.string().max(500).optional(),
    revisionRequestId: z.uuid().nullable(),
    created: z.boolean(),
  })
  .strict();
export type GuestSuggestionConversion = z.infer<typeof conversionSchema>;

export async function convertGuestSuggestionAction(
  input: unknown,
): Promise<Result<GuestSuggestionConversion>> {
  const parsed = z
    .object({
      suggestionId: z.uuid(),
      participantId: z.uuid(),
      confirmRebase: z.boolean(),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_suggestion" };
  const { data, error } = await memberRpc("convert_guest_suggestion", {
    target_suggestion_id: parsed.data.suggestionId,
    participant_id: parsed.data.participantId,
    confirm_rebase: parsed.data.confirmRebase,
  });
  if (error) return { ok: false, error: mapError(error) };
  const result = conversionSchema.safeParse(data);
  if (!result.success) return { ok: false, error: "suggestion_unavailable" };
  if (result.data.revisionRequestId && result.data.created)
    schedulePlanChange(result.data.revisionRequestId);
  return { ok: true, data: result.data };
}
