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

const boundedRecordSchema = z
  .record(z.string().min(1).max(100), z.unknown())
  .refine((value) => JSON.stringify(value).length <= 32_000, {
    message: "Travel evidence metadata is too large.",
  });

export const travelLocationBindingSchema = z
  .object({
    coordinates: coordinatesSchema.nullable(),
    boundingBox: z
      .tuple([
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
        z.number().finite().min(-180).max(180),
        z.number().finite().min(-90).max(90),
      ])
      .nullable(),
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
export type TravelFreshnessState = z.infer<typeof travelFreshnessStateSchema>;
export type TravelVerificationState = z.infer<
  typeof travelVerificationStateSchema
>;
