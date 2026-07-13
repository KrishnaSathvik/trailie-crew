import { z } from "zod";

export const tripIdSchema = z.string().trim().min(1).brand("TripId");

export type TripId = z.infer<typeof tripIdSchema>;

export const approvalModeSchema = z.enum(["all_active", "host_only"]);
export const roomStatusSchema = z.enum(["active", "archived", "deleted"]);
export const participantRoleSchema = z.enum(["host", "member"]);
export const participantStatusSchema = z.enum(["active", "left", "removed"]);

const tripNameSchema = z.string().trim().min(1).max(100);
const displayNameSchema = z.string().trim().min(1).max(50);
const roomCodeSchema = z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/);
const timestampSchema = z.iso.datetime({ offset: true });

export const createTripInputSchema = z.object({
  tripName: tripNameSchema,
  displayName: displayNameSchema,
  expectedTravelers: z.number().int().min(1).max(50).nullable().optional(),
});

export const createTripResultSchema = z.object({
  roomId: z.uuid(),
  roomName: tripNameSchema,
  participantId: z.uuid(),
  roomCode: roomCodeSchema,
  inviteToken: z.string().min(43).max(128),
  createdAt: timestampSchema,
});

export const joinTripInputSchema = z.object({
  inviteValue: z.string().trim().min(1).max(128),
  displayName: displayNameSchema,
});

export const joinTripResultSchema = z.object({
  roomId: z.uuid(),
  roomName: tripNameSchema,
  participantId: z.uuid(),
  displayName: displayNameSchema,
  role: participantRoleSchema,
  roomCode: roomCodeSchema,
  joinedAt: timestampSchema,
});

export const roomSummarySchema = z.object({
  id: z.uuid(),
  name: tripNameSchema,
  roomCode: roomCodeSchema,
  expectedTravelers: z.number().int().min(1).max(50).nullable(),
  approvalMode: approvalModeSchema,
  status: roomStatusSchema,
  currentPlanVersion: z.number().int().positive().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const participantSummarySchema = z.object({
  id: z.uuid(),
  roomId: z.uuid(),
  userId: z.uuid(),
  displayName: displayNameSchema,
  role: participantRoleSchema,
  status: participantStatusSchema,
  joinedAt: timestampSchema,
  lastSeenAt: timestampSchema.nullable(),
});

export type ApprovalMode = z.infer<typeof approvalModeSchema>;
export type RoomStatus = z.infer<typeof roomStatusSchema>;
export type ParticipantRole = z.infer<typeof participantRoleSchema>;
export type ParticipantStatus = z.infer<typeof participantStatusSchema>;
export type CreateTripInput = z.infer<typeof createTripInputSchema>;
export type CreateTripResult = z.infer<typeof createTripResultSchema>;
export type JoinTripInput = z.infer<typeof joinTripInputSchema>;
export type JoinTripResult = z.infer<typeof joinTripResultSchema>;
export type RoomSummary = z.infer<typeof roomSummarySchema>;
export type ParticipantSummary = z.infer<typeof participantSummarySchema>;
