import { z } from "zod";

export const trailieIntentSchema = z.enum([
  "direct_question",
  "destination_discovery",
  "destination_comparison",
  "trip_context_question",
  "preference_capture",
  "constraint_capture",
  "planning_readiness",
  "create_itinerary",
  "itinerary_question",
  "itinerary_revision",
  "map_question",
  "route_question",
  "lodging_recommendation",
  "lodging_search",
  "flight_guidance",
  "flight_search",
  "reservation_question",
  "booking_handoff",
  "evidence_question",
  "weather_question",
  "permit_question",
  "group_conflict",
  "approval_question",
  "version_question",
  "unsupported_action",
]);

const text = (maximum = 1_000) => z.string().trim().min(1).max(maximum);
const nullableText = (maximum = 1_000) => text(maximum).nullable();
const safeUrl = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "HTTPS is required.",
  );
const itemId = z.string().trim().min(1).max(200);

const markdownBlock = z
  .object({
    type: z.literal("markdown"),
    markdown: text(4_000),
  })
  .strict();

const destinationOption = z
  .object({
    id: itemId,
    name: text(160),
    summary: text(500),
    strengths: z.array(text(200)).max(6),
    tradeoffs: z.array(text(200)).max(6),
    evidenceState: z.enum(["verified", "partial", "unavailable"]),
  })
  .strict();
const destinationOptionsBlock = z
  .object({
    type: z.literal("destination_options"),
    options: z.array(destinationOption).min(1).max(6),
  })
  .strict();
const destinationComparisonBlock = z
  .object({
    type: z.literal("destination_comparison"),
    criteria: z.array(text(100)).min(1).max(8),
    options: z.array(destinationOption).min(2).max(6),
  })
  .strict();

const summaryRow = z
  .object({
    label: text(120),
    detail: text(500),
    status: z.enum(["confirmed", "open", "conflict", "assumption"]),
  })
  .strict();
const understandingSummaryBlock = z
  .object({
    type: z.literal("understanding_summary"),
    title: text(120),
    rows: z.array(summaryRow).min(1).max(24),
  })
  .strict();
const clarificationBlock = z
  .object({
    type: z.literal("clarification"),
    question: text(300),
    reason: text(300),
  })
  .strict();

const itineraryPreviewBlock = z
  .object({
    type: z.literal("itinerary_preview"),
    title: text(160),
    days: z
      .array(
        z
          .object({
            date: z.iso.date(),
            title: text(160),
            highlights: z.array(text(200)).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(14),
  })
  .strict();
const itineraryBlock = z
  .object({
    type: z.literal("itinerary"),
    planId: z.uuid(),
    version: z.number().int().positive(),
    status: z.enum(["candidate", "published"]),
  })
  .strict();
const itineraryChangeSummaryBlock = z
  .object({
    type: z.literal("itinerary_change_summary"),
    request: text(500),
    impact: z.array(text(300)).max(12),
    status: z.enum(["needs_clarification", "ready_for_review", "blocked"]),
  })
  .strict();
const approvalStatusBlock = z
  .object({
    type: z.literal("approval_status"),
    status: z.enum(["not_started", "pending", "approved", "changes_requested"]),
    approvedBy: z.array(text(80)).max(50),
    pending: z.array(text(80)).max(50),
  })
  .strict();

const mapLocationsBlock = z
  .object({
    type: z.literal("map_locations"),
    locations: z
      .array(
        z
          .object({
            label: text(200),
            latitude: z.number().finite().min(-90).max(90).nullable(),
            longitude: z.number().finite().min(-180).max(180).nullable(),
            verification: z.enum(["verified", "ambiguous", "unverified"]),
            sourceId: itemId.nullable(),
            privacyLevel: z.enum(["public", "room", "omitted"]),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
const routeSummaryBlock = z
  .object({
    type: z.literal("route_summary"),
    origin: text(200),
    destination: text(200),
    mode: z.enum(["drive", "walk", "bike", "transit", "shuttle", "unknown"]),
    durationMinutes: z.number().int().nonnegative().max(2_880).nullable(),
    distanceMeters: z.number().int().nonnegative().nullable(),
    verification: z.enum(["verified", "unavailable"]),
  })
  .strict();

const hotelOption = z
  .object({
    id: itemId,
    name: text(200),
    area: text(200),
    reason: text(500),
    driveTimeImpact: nullableText(200),
    priceState: z.enum(["current", "observed", "unavailable"]),
    availabilityState: z.enum(["available", "limited", "unknown"]),
    sourceId: itemId.nullable(),
  })
  .strict();
const hotelOptionsBlock = z
  .object({
    type: z.literal("hotel_options"),
    options: z.array(hotelOption).min(1).max(8),
  })
  .strict();
const flightGuidanceBlock = z
  .object({
    type: z.literal("flight_guidance"),
    airports: z
      .array(
        z
          .object({
            code: z
              .string()
              .trim()
              .regex(/^[A-Z0-9]{3,4}$/),
            name: text(200),
            tradeoff: text(500),
            groundTransfer: nullableText(200),
          })
          .strict(),
      )
      .max(8),
    recommendedWindow: nullableText(300),
  })
  .strict();
const bookingOptionsBlock = z
  .object({
    type: z.literal("booking_options"),
    options: z
      .array(
        z
          .object({
            label: text(200),
            url: safeUrl,
            requirement: z.enum([
              "required",
              "recommended",
              "optional",
              "unknown",
            ]),
            availability: z.enum([
              "available",
              "limited",
              "unknown",
              "unavailable",
            ]),
            price: z.enum([
              "current",
              "observed",
              "starting_from",
              "unavailable",
            ]),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
const reservationRequirementsBlock = z
  .object({
    type: z.literal("reservation_requirements"),
    requirements: z
      .array(
        z
          .object({
            label: text(200),
            requirement: z.enum([
              "required",
              "recommended",
              "optional",
              "unknown",
            ]),
            details: text(500),
            sourceId: itemId.nullable(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();

const weatherSummaryBlock = z
  .object({
    type: z.literal("weather_summary"),
    location: text(200),
    period: text(200),
    summary: text(800),
    state: z.enum(["verified", "historical", "unavailable"]),
    checkedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
const evidenceSummaryBlock = z
  .object({
    type: z.literal("evidence_summary"),
    items: z
      .array(
        z
          .object({
            label: text(200),
            status: z.enum(["verified", "stale", "unavailable", "conflicting"]),
            checkedAt: z.iso.datetime({ offset: true }).nullable(),
            sourceId: itemId.nullable(),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();
const warningBlock = z
  .object({
    type: z.literal("warning"),
    title: text(160),
    detail: text(800),
  })
  .strict();
const stateBlock = (type: "empty_state" | "error_state") =>
  z
    .object({
      type: z.literal(type),
      title: text(160),
      detail: text(500),
      actionLabel: nullableText(100),
    })
    .strict();

export const trailieResponseBlockV1Schema = z.discriminatedUnion("type", [
  markdownBlock,
  destinationOptionsBlock,
  destinationComparisonBlock,
  understandingSummaryBlock,
  clarificationBlock,
  itineraryPreviewBlock,
  itineraryBlock,
  itineraryChangeSummaryBlock,
  approvalStatusBlock,
  mapLocationsBlock,
  routeSummaryBlock,
  hotelOptionsBlock,
  flightGuidanceBlock,
  bookingOptionsBlock,
  reservationRequirementsBlock,
  weatherSummaryBlock,
  evidenceSummaryBlock,
  warningBlock,
  stateBlock("empty_state"),
  stateBlock("error_state"),
]);
type TrailieResponseBlockSchema =
  (typeof trailieResponseBlockV1Schema.options)[number];
const trailieResponseBlockSchemasV1 = {
  markdown: markdownBlock,
  destination_options: destinationOptionsBlock,
  destination_comparison: destinationComparisonBlock,
  understanding_summary: understandingSummaryBlock,
  clarification: clarificationBlock,
  itinerary_preview: itineraryPreviewBlock,
  itinerary: itineraryBlock,
  itinerary_change_summary: itineraryChangeSummaryBlock,
  approval_status: approvalStatusBlock,
  map_locations: mapLocationsBlock,
  route_summary: routeSummaryBlock,
  hotel_options: hotelOptionsBlock,
  flight_guidance: flightGuidanceBlock,
  booking_options: bookingOptionsBlock,
  reservation_requirements: reservationRequirementsBlock,
  weather_summary: weatherSummaryBlock,
  evidence_summary: evidenceSummaryBlock,
  warning: warningBlock,
  empty_state: stateBlock("empty_state"),
  error_state: stateBlock("error_state"),
} satisfies Record<
  z.infer<typeof trailieResponseBlockV1Schema>["type"],
  TrailieResponseBlockSchema
>;

export const trailieResponseSourceV1Schema = z
  .object({
    sourceId: itemId,
    label: text(200),
    url: safeUrl.nullable(),
    checkedAt: z.iso.datetime({ offset: true }).nullable(),
    status: z.enum(["verified", "stale", "unavailable", "conflicting"]),
  })
  .strict();

export const trailieSuggestedActionV1Schema = z
  .object({
    id: itemId,
    label: text(100),
    action: z.enum([
      "open_planning_review",
      "open_revision",
      "open_map",
      "open_evidence",
      "open_booking",
      "answer_clarification",
      "retry",
    ]),
    style: z.enum(["primary", "secondary", "text"]),
  })
  .strict();

export const trailieResponseDraftV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    intent: trailieIntentSchema,
    message: text(4_000),
    blocks: z.array(trailieResponseBlockV1Schema).max(12),
    warnings: z.array(text(500)).max(12),
    sources: z.array(trailieResponseSourceV1Schema).max(20),
    assumptions: z.array(text(500)).max(12),
    unresolvedQuestions: z.array(text(300)).max(6),
    suggestedActions: z.array(trailieSuggestedActionV1Schema).max(3),
    persistenceDirective: z.enum([
      "none",
      "capture_preference",
      "capture_constraint",
      "propose_revision",
      "publish_plan",
    ]),
    approvalDirective: z.enum([
      "not_required",
      "required",
      "pending",
      "complete",
    ]),
    freshness: z.enum([
      "current",
      "historical",
      "stale",
      "unavailable",
      "not_applicable",
    ]),
    privacyLevel: z.enum(["room", "public"]),
  })
  .strict();

export function createTrailieResponseDraftV1SchemaForBlocks(
  blockTypes: readonly TrailieResponseBlockV1["type"][],
) {
  const uniqueTypes = [...new Set(blockTypes)];
  if (uniqueTypes.length === 0)
    throw new Error("At least one Trailie response block is required.");
  const blockSchemas = uniqueTypes.map(
    (blockType) => trailieResponseBlockSchemasV1[blockType],
  ) as [TrailieResponseBlockSchema, ...TrailieResponseBlockSchema[]];
  return trailieResponseDraftV1Schema
    .extend({
      blocks: z.array(z.discriminatedUnion("type", blockSchemas)).max(12),
    })
    .strict();
}

export const trailieResponseV1Schema = trailieResponseDraftV1Schema
  .extend({
    responseId: z.uuid(),
    sourceMessageId: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type TrailieIntent = z.infer<typeof trailieIntentSchema>;
export type TrailieResponseBlockV1 = z.infer<
  typeof trailieResponseBlockV1Schema
>;
export type TrailieResponseDraftV1 = z.infer<
  typeof trailieResponseDraftV1Schema
>;
export type TrailieResponseV1 = z.infer<typeof trailieResponseV1Schema>;
