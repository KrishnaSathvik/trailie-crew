import { z } from "zod";

export const travelEvidenceTypeSchema = z.enum([
  "geocode",
  "place",
  "route",
  "travel_duration",
  "distance",
  "weather_forecast",
  "temperature",
  "precipitation",
  "severe_weather",
  "sunrise",
  "sunset",
  "park",
  "park_alert",
  "park_closure",
  "permit",
  "reservation",
  "operating_hours",
  "accessibility",
  "fee",
  "campground",
  "visitor_center",
  "trail",
  "food",
  "lodging",
  "general_official_notice",
]);

export const travelFreshnessStateSchema = z.enum([
  "fresh",
  "cached_fresh",
  "stale",
  "expired",
  "unavailable",
  "conflicting",
]);

export const travelVerificationStateSchema = z.enum([
  "verified",
  "partially_verified",
  "unverified",
  "inferred",
  "failed",
]);

export const travelConfidenceSchema = z.enum(["high", "medium", "low"]);

export const travelAvailabilityStateSchema = z.enum([
  "available",
  "partial",
  "unavailable",
  "ambiguous",
  "not_found",
  "unsupported",
]);

export const travelCacheStatusSchema = z.enum([
  "miss",
  "hit",
  "stale_hit",
  "negative_hit",
  "bypass",
]);

const timestampSchema = z.iso.datetime({ offset: true });
const safeIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const coordinatesSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();

const boundingBoxSchema = z
  .tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
  ])
  .nullable();

const boundedRecordSchema = z
  .record(z.string().min(1).max(100), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 32_000, {
    message: "Travel evidence metadata is too large.",
  });

export const travelLocationBindingSchema = z
  .object({
    coordinates: coordinatesSchema.nullable(),
    boundingBox: boundingBoxSchema,
    timezone: z.string().trim().min(1).max(100).nullable(),
    precision: z
      .enum([
        "exact",
        "address",
        "place",
        "park",
        "region",
        "country",
        "unknown",
      ])
      .nullable(),
    privacy: z.enum(["public", "private", "sensitive"]),
  })
  .strict();

export const travelEntityBindingSchema = z
  .object({
    entityType: z
      .enum([
        "destination",
        "park",
        "trailhead",
        "lodging",
        "restaurant",
        "activity",
        "airport",
        "station",
        "visitor_center",
        "campground",
        "permit",
        "tour",
        "route_segment",
        "itinerary_day",
        "unknown",
      ])
      .default("unknown"),
    canonicalId: safeIdentifierSchema,
    name: z.string().trim().min(1).max(300),
  })
  .strict();

export const travelEvidenceV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    evidenceId: safeIdentifierSchema,
    evidenceType: travelEvidenceTypeSchema,
    provider: safeIdentifierSchema,
    sourceName: z.string().trim().min(1).max(200),
    sourceUrl: z.url().nullable(),
    sourceEntityId: safeIdentifierSchema.nullable(),
    retrievedAt: timestampSchema,
    observedAt: timestampSchema.nullable(),
    validFrom: timestampSchema.nullable(),
    validUntil: timestampSchema.nullable(),
    freshnessState: travelFreshnessStateSchema,
    verificationState: travelVerificationStateSchema,
    confidence: travelConfidenceSchema,
    availabilityState: travelAvailabilityStateSchema,
    locationBinding: travelLocationBindingSchema.nullable(),
    entityBinding: travelEntityBindingSchema.nullable(),
    normalizedValue: z
      .object({
        kind: travelEvidenceTypeSchema,
        data: boundedRecordSchema,
      })
      .strict(),
    providerMetadata: boundedRecordSchema,
    attribution: z
      .object({
        label: z.string().trim().min(1).max(300),
        url: z.url().nullable(),
        required: z.boolean(),
      })
      .strict(),
    restrictions: z
      .object({
        storage: z.enum(["permanent", "bounded", "prohibited", "unknown"]),
        display: z.string().trim().min(1).max(300),
      })
      .strict(),
    cacheStatus: travelCacheStatusSchema,
    requestId: safeIdentifierSchema.nullable(),
    errorState: z
      .object({
        code: safeIdentifierSchema,
        retryable: z.boolean(),
        httpStatus: z.number().int().min(100).max(599).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.normalizedValue.kind !== value.evidenceType)
      context.addIssue({
        code: "custom",
        path: ["normalizedValue", "kind"],
        message: "Normalized evidence kind must match its evidence type.",
      });
    if (
      value.validFrom !== null &&
      value.validUntil !== null &&
      value.validFrom > value.validUntil
    )
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "Travel evidence validity window is reversed.",
      });
  });

export const canonicalDestinationResolutionV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    originalQuery: z.string().trim().min(1).max(500),
    normalizedQuery: z.string().trim().min(1).max(500),
    status: z.enum(["resolved", "ambiguous", "not_found", "unavailable"]),
    canonicalPlaceId: safeIdentifierSchema.nullable(),
    canonicalName: z.string().trim().min(1).max(300).nullable(),
    providerPlaceId: safeIdentifierSchema.nullable(),
    npsParkCode: safeIdentifierSchema.nullable(),
    coordinates: coordinatesSchema.nullable(),
    boundingBox: boundingBoxSchema,
    locality: z.string().trim().min(1).max(200).nullable(),
    region: z.string().trim().min(1).max(200).nullable(),
    country: z.string().trim().min(1).max(200).nullable(),
    candidateCount: z.number().int().min(0).max(100),
    selectedCandidateIndex: z.number().int().min(0).max(99).nullable(),
    resolutionMethod: z.enum([
      "exact_official_match",
      "official_alias_match",
      "unique_high_confidence_match",
      "user_selected",
      "unresolved",
    ]),
    corroborationSources: z.array(safeIdentifierSchema).max(10),
    corroborationScore: z.number().finite().min(0).max(1),
    confidence: travelConfidenceSchema,
    ambiguityReasons: z.array(safeIdentifierSchema).max(20),
    evidenceIds: z.array(safeIdentifierSchema).max(100),
    semanticHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()
  .superRefine((value, context) => {
    const identityFields = [
      value.canonicalPlaceId,
      value.canonicalName,
      value.selectedCandidateIndex,
    ];
    if (
      value.status === "resolved" &&
      identityFields.some((field) => field === null)
    )
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Resolved destinations require one canonical identity.",
      });
    if (value.status !== "resolved" && value.resolutionMethod !== "unresolved")
      context.addIssue({
        code: "custom",
        path: ["resolutionMethod"],
        message: "Unresolved destinations cannot claim a resolution method.",
      });
  });

type FreshnessInput = Pick<
  z.infer<typeof travelEvidenceV1Schema>,
  "availabilityState" | "cacheStatus" | "freshnessState" | "validUntil"
>;

export function classifyTravelFreshness(
  evidence: FreshnessInput,
  now: string,
): z.infer<typeof travelFreshnessStateSchema> {
  if (evidence.freshnessState === "conflicting") return "conflicting";
  if (
    evidence.availabilityState !== "available" &&
    evidence.availabilityState !== "partial"
  )
    return "unavailable";
  if (evidence.validUntil !== null && evidence.validUntil <= now)
    return "expired";
  if (
    evidence.freshnessState === "stale" ||
    evidence.cacheStatus === "stale_hit"
  )
    return "stale";
  if (
    evidence.freshnessState === "cached_fresh" ||
    evidence.cacheStatus === "hit"
  )
    return "cached_fresh";
  return "fresh";
}

export function semanticTravelEvidenceHashInput(
  evidence: z.infer<typeof travelEvidenceV1Schema>,
) {
  const volatile = new Set([
    "evidenceId",
    "retrievedAt",
    "freshnessState",
    "cacheStatus",
    "requestId",
    "providerMetadata",
  ]);
  return Object.fromEntries(
    Object.entries(evidence).filter(([key]) => !volatile.has(key)),
  );
}

export type TravelEvidenceType = z.infer<typeof travelEvidenceTypeSchema>;
export type TravelEvidenceV1 = z.infer<typeof travelEvidenceV1Schema>;
export type CanonicalDestinationResolutionV1 = z.infer<
  typeof canonicalDestinationResolutionV1Schema
>;
export type TravelFreshnessState = z.infer<typeof travelFreshnessStateSchema>;
export type TravelVerificationState = z.infer<
  typeof travelVerificationStateSchema
>;
