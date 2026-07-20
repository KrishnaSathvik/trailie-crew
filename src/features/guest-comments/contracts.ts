import { z } from "zod";

import { publicSharedItinerarySchema } from "@trailie/schemas";

const timestamp = z.iso.datetime({ offset: true });
const safePlainText = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    "Plain text only.",
  );

export const guestRoleSchema = z.enum([
  "guest_viewer",
  "guest_commenter",
  "guest_suggester",
]);
export type GuestRole = z.infer<typeof guestRoleSchema>;

export const plainTextCommentSchema = safePlainText.max(2000);
export const guestDisplayNameSchema = safePlainText.max(50);
export const guestSuggestionTargetTypeSchema = z.enum([
  "plan",
  "day",
  "item",
  "route",
]);
export type GuestSuggestionTargetType = z.infer<
  typeof guestSuggestionTargetTypeSchema
>;
export const guestSuggestionTypeSchema = z.enum([
  "add_item",
  "remove_item",
  "replace_item",
  "reschedule_item",
  "move_item",
  "update_note",
  "change_route",
  "general",
]);
export type GuestSuggestionType = z.infer<typeof guestSuggestionTypeSchema>;
export const guestSuggestionStatusSchema = z.enum([
  "open",
  "dismissed",
  "converted",
]);
export type GuestSuggestionStatus = z.infer<typeof guestSuggestionStatusSchema>;
export const guestSuggestionTitleSchema = safePlainText.max(120);
export const guestSuggestionDetailsSchema = safePlainText.max(2000);

export const guestSuggestionSchema = z
  .object({
    id: z.uuid(),
    originalPlanVersionId: z.uuid(),
    originalPlanVersion: z.number().int().positive(),
    rebasedToPlanVersionId: z.uuid().nullable(),
    rebasedToPlanVersion: z.number().int().positive().nullable(),
    targetType: guestSuggestionTargetTypeSchema,
    targetKey: z.string().trim().min(1).max(200).nullable(),
    targetLabel: z.string().trim().min(1).max(200).nullable(),
    suggestionType: guestSuggestionTypeSchema,
    title: guestSuggestionTitleSchema,
    details: guestSuggestionDetailsSchema,
    proposedDate: z.iso.date().nullable(),
    proposedStartTime: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    proposedEndTime: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    status: guestSuggestionStatusSchema,
    guestDisplayName: guestDisplayNameSchema,
    dismissedAt: timestamp.nullable(),
    convertedAt: timestamp.nullable(),
    revisionRequestId: z.uuid().nullable().optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
    isOwn: z.boolean().optional(),
  })
  .strict();
export type GuestSuggestion = z.infer<typeof guestSuggestionSchema>;

export const guestInviteMetadataSchema = z
  .object({
    id: z.uuid(),
    planVersionId: z.uuid(),
    planVersion: z.number().int().positive(),
    role: guestRoleSchema,
    tokenPrefix: z.string().regex(/^[A-Za-z0-9_-]{6,12}$/),
    expiresAt: timestamp,
    maxUses: z.number().int().min(1).max(100),
    useCount: z.number().int().nonnegative(),
    createdAt: timestamp,
  })
  .strict();
export type GuestInviteMetadata = z.infer<typeof guestInviteMetadataSchema>;

export const guestCommentSchema = z
  .object({
    id: z.uuid(),
    planVersionId: z.uuid(),
    planVersion: z.number().int().positive(),
    dayKey: z.string().min(1).nullable().optional(),
    itemKey: z.string().min(1).nullable().optional(),
    authorType: z.enum(["member", "guest"]),
    authorDisplayName: z.string().trim().min(1).max(50),
    body: z.string().max(2000).nullable(),
    resolved: z.boolean(),
    resolvedAt: timestamp.nullable().optional(),
    deleted: z.boolean(),
    deletedAt: timestamp.nullable().optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
    isOwn: z.boolean().optional(),
  })
  .strict();
export type GuestComment = z.infer<typeof guestCommentSchema>;

export const guestInviteVerificationSchema = z
  .object({
    inviteId: z.uuid(),
    roomId: z.uuid(),
    planVersionId: z.uuid(),
    planVersion: z.number().int().positive(),
    role: guestRoleSchema,
    expiresAt: timestamp,
    itinerary: publicSharedItinerarySchema,
  })
  .strict();
export type GuestInviteVerification = z.infer<
  typeof guestInviteVerificationSchema
>;

export const guestSessionMetadataSchema = z
  .object({
    role: guestRoleSchema,
    displayName: guestDisplayNameSchema,
    planVersionId: z.uuid(),
    planVersion: z.number().int().positive(),
    expiresAt: timestamp,
  })
  .strict();

export const guestSessionContextSchema = guestSessionMetadataSchema
  .extend({
    itinerary: publicSharedItinerarySchema,
    comments: z.array(guestCommentSchema.extend({ isOwn: z.boolean() })),
    suggestions: z
      .array(guestSuggestionSchema.extend({ isOwn: z.literal(true) }))
      .default([]),
  })
  .strict();
export type GuestSessionContext = z.infer<typeof guestSessionContextSchema>;
