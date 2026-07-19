import { z } from "zod";
import {
  canonicalDestinationResolutionV1Schema,
  itinerarySchema,
  travelEvidenceSnapshotV1Schema,
} from "@trailie/schemas";
import { buildItineraryMapProjection } from "./projection";

export const mapProjectionSourceSchema = z
  .object({
    roomId: z.uuid(),
    tripPlanId: z.uuid(),
    planVersion: z.number().int().positive(),
    currentPlanVersion: z.number().int().positive().nullable(),
    publishedAt: z.iso.datetime({ offset: true }),
    itinerary: itinerarySchema,
    evidenceSnapshots: z
      .array(
        z
          .object({
            evidence: travelEvidenceSnapshotV1Schema,
            targetItemId: z.string().trim().min(1).max(200).nullable(),
          })
          .strict(),
      )
      .max(200),
    destinationResolution: canonicalDestinationResolutionV1Schema.nullable(),
  })
  .strict();

export type MapProjectionSource = z.infer<typeof mapProjectionSourceSchema>;

export function projectMapSource(
  source: MapProjectionSource,
  privacyMode: "member" | "public_share",
  generatedAt: string,
) {
  return buildItineraryMapProjection({
    roomId: source.roomId,
    planVersionId: source.tripPlanId,
    planVersion: source.planVersion,
    itinerary: source.itinerary,
    evidence: source.evidenceSnapshots.map((snapshot) => snapshot.evidence),
    evidenceBindings: source.evidenceSnapshots.map((snapshot) => ({
      evidenceId: snapshot.evidence.evidenceId,
      targetItemId: snapshot.targetItemId,
    })),
    destinationResolution: source.destinationResolution,
    privacyMode,
    publishedAt: source.publishedAt,
    historical:
      privacyMode === "public_share" ||
      source.currentPlanVersion !== source.planVersion,
    generatedAt,
  });
}
