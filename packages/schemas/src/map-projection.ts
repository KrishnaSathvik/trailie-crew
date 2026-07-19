import { z } from "zod";
import {
  travelFreshnessStateSchema,
  travelVerificationStateSchema,
} from "./travel-evidence";

const identifierSchema = z.string().trim().min(1).max(200);
const timestampSchema = z.iso.datetime({ offset: true });
const coordinatesSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();
const boundsSchema = z
  .tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
  ])
  .nullable();

export const mapCoordinateSourceSchema = z.enum([
  "official_nps",
  "official_ridb",
  "approved_permanent_provider",
  "user_confirmed",
  "unavailable",
]);

export const mapPrivacyLevelSchema = z.enum([
  "exact_private",
  "approximate_private",
  "public",
  "omitted",
]);

export const mapGeometryStateSchema = z.enum([
  "verified_geometry",
  "endpoint_only",
  "unavailable",
  "prohibited",
]);

export const mapWarningTypeSchema = z.enum([
  "official_closure",
  "severe_weather",
  "route_unavailable",
  "daylight_concern",
  "reservation_required",
  "ambiguous_place",
  "stale_evidence",
]);

export const itineraryMapMarkerV1Schema = z
  .object({
    markerId: identifierSchema,
    itemId: identifierSchema.nullable(),
    dayId: identifierSchema.nullable(),
    sequence: z.number().int().min(0).max(999),
    category: z.enum([
      "destination",
      "activity",
      "trailhead",
      "lodging",
      "food",
      "visitor_center",
      "campground",
      "airport_station",
      "warning_closure",
      "reservation_required",
    ]),
    label: z.string().trim().min(1).max(300),
    shortLabel: z.string().trim().min(1).max(12),
    coordinates: coordinatesSchema.nullable(),
    coordinateSource: mapCoordinateSourceSchema,
    verificationState: travelVerificationStateSchema,
    freshnessState: travelFreshnessStateSchema,
    privacyLevel: mapPrivacyLevelSchema,
    warningTypes: z.array(mapWarningTypeSchema).max(10),
    timeLabel: z.string().trim().min(1).max(80).nullable(),
    clusterGroup: identifierSchema.nullable(),
  })
  .strict()
  .superRefine((marker, context) => {
    if (
      marker.coordinateSource === "unavailable" &&
      marker.coordinates !== null
    )
      context.addIssue({
        code: "custom",
        path: ["coordinates"],
        message: "Unavailable coordinates must not contain a location.",
      });
    if (
      marker.coordinateSource !== "unavailable" &&
      marker.coordinates === null &&
      marker.privacyLevel !== "omitted"
    )
      context.addIssue({
        code: "custom",
        path: ["coordinates"],
        message: "A visible coordinate source requires coordinates.",
      });
  });

const routeGeometrySchema = z
  .object({
    type: z.literal("LineString"),
    coordinates: z
      .array(
        z.tuple([
          z.number().finite().min(-180).max(180),
          z.number().finite().min(-90).max(90),
        ]),
      )
      .min(2)
      .max(1_000),
  })
  .strict();

export const itineraryMapRouteSegmentV1Schema = z
  .object({
    segmentId: identifierSchema,
    dayId: identifierSchema,
    fromMarkerId: identifierSchema,
    toMarkerId: identifierSchema,
    mode: z.enum([
      "driving",
      "walking",
      "cycling",
      "transit",
      "shuttle",
      "unknown",
    ]),
    distanceMeters: z.number().int().nonnegative().nullable(),
    durationMinutes: z.number().int().nonnegative().nullable(),
    geometry: routeGeometrySchema.nullable(),
    geometryState: mapGeometryStateSchema,
    verificationState: travelVerificationStateSchema,
    freshnessState: travelFreshnessStateSchema,
    warningTypes: z.array(mapWarningTypeSchema).max(10),
  })
  .strict()
  .superRefine((segment, context) => {
    if (
      segment.geometryState === "verified_geometry" &&
      segment.geometry === null
    )
      context.addIssue({
        code: "custom",
        path: ["geometry"],
        message: "Verified route geometry requires a bounded line.",
      });
    if (
      segment.geometryState !== "verified_geometry" &&
      segment.geometry !== null
    )
      context.addIssue({
        code: "custom",
        path: ["geometry"],
        message: "Unverified route states cannot carry geometry.",
      });
  });

export const itineraryMapProjectionV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    roomId: identifierSchema,
    planVersionId: identifierSchema,
    planVersion: z.number().int().positive(),
    destination: z
      .object({
        label: z.string().trim().min(1).max(300),
        coordinates: coordinatesSchema.nullable(),
        bounds: boundsSchema,
        coordinateSource: mapCoordinateSourceSchema,
      })
      .strict(),
    viewport: z
      .object({
        bounds: boundsSchema,
        source: z.enum([
          "destination_bounds",
          "visible_markers",
          "unavailable",
        ]),
      })
      .strict(),
    days: z
      .array(
        z
          .object({
            dayId: identifierSchema,
            date: z.iso.date(),
            label: z.string().trim().min(1).max(80),
            markerIds: z.array(identifierSchema).max(500),
            routeSegmentIds: z.array(identifierSchema).max(500),
          })
          .strict(),
      )
      .max(100),
    markers: z.array(itineraryMapMarkerV1Schema).max(1_000),
    routeSegments: z.array(itineraryMapRouteSegmentV1Schema).max(1_000),
    warnings: z
      .array(
        z
          .object({
            warningId: identifierSchema,
            type: mapWarningTypeSchema,
            label: z.string().trim().min(1).max(300),
            markerId: identifierSchema.nullable(),
            segmentId: identifierSchema.nullable(),
            evidenceId: identifierSchema.nullable(),
          })
          .strict(),
      )
      .max(500),
    privacyMode: z.enum(["member", "public_share"]),
    evidenceState: z.enum([
      "fresh",
      "mixed",
      "stale",
      "unavailable",
      "historical",
    ]),
    generatedAt: timestampSchema,
  })
  .strict()
  .superRefine((projection, context) => {
    if (
      projection.privacyMode === "public_share" &&
      projection.markers.some(
        (marker) => marker.privacyLevel === "exact_private",
      )
    )
      context.addIssue({
        code: "custom",
        path: ["markers"],
        message: "A public map cannot contain exact private markers.",
      });

    const serialized = JSON.stringify(projection);
    if (/temporary_mapbox/i.test(serialized))
      context.addIssue({
        code: "custom",
        path: [],
        message: "Temporary Mapbox data is prohibited in map projections.",
      });
  });

export type MapCoordinateSource = z.infer<typeof mapCoordinateSourceSchema>;
export type MapPrivacyLevel = z.infer<typeof mapPrivacyLevelSchema>;
export type MapGeometryState = z.infer<typeof mapGeometryStateSchema>;
export type MapWarningType = z.infer<typeof mapWarningTypeSchema>;
export type ItineraryMapMarkerV1 = z.infer<typeof itineraryMapMarkerV1Schema>;
export type ItineraryMapRouteSegmentV1 = z.infer<
  typeof itineraryMapRouteSegmentV1Schema
>;
export type ItineraryMapProjectionV1 = z.infer<
  typeof itineraryMapProjectionV1Schema
>;
