import { z } from "zod";

const compactTextSchema = z.string().trim().min(1).max(240);
const compactShortTextSchema = z.string().trim().min(1).max(120);
const compactClientKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[a-z][a-z0-9-]*$/);
const compactLocalTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  .nullable();

export const compactItineraryItemTypeSchema = z.enum([
  "activity",
  "meal",
  "travel",
  "lodging",
  "arrival",
  "departure",
  "free_time",
]);

export const compactBookingRequirementSchema = z.enum([
  "required",
  "recommended",
  "not_required",
  "unknown",
]);

export const compactTravelModeSchema = z.enum([
  "walk",
  "drive",
  "transit",
  "bike",
  "shuttle",
  "flight",
  "train",
  "unknown",
]);

export const compactItineraryItemV1Schema = z
  .object({
    clientKey: compactClientKeySchema,
    type: compactItineraryItemTypeSchema,
    title: compactShortTextSchema,
    startTime: compactLocalTimeSchema,
    endTime: compactLocalTimeSchema,
    locationText: compactShortTextSchema,
    sourceEntityHint: z.string().trim().min(1).max(200).nullable(),
    shortDescription: compactTextSchema,
    rationale: compactTextSchema,
    bookingRequirement: compactBookingRequirementSchema,
    importantWarning: compactTextSchema.nullable(),
  })
  .strict();

export const compactTravelSegmentV1Schema = z
  .object({
    mode: compactTravelModeSchema,
    fromItemKey: compactClientKeySchema,
    toItemKey: compactClientKeySchema,
    estimatedMinutes: z.number().int().positive().max(1_440).nullable(),
  })
  .strict();

export const compactItineraryDayV1Schema = z
  .object({
    date: z.iso.date(),
    theme: compactShortTextSchema,
    locationArea: compactShortTextSchema,
    items: z.array(compactItineraryItemV1Schema).min(1).max(6),
    travelSegments: z.array(compactTravelSegmentV1Schema).max(6),
  })
  .strict();

function timeMinutes(value: string | null) {
  if (value === null) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export const compactItineraryCandidateV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    title: compactShortTextSchema,
    summary: compactTextSchema,
    assumptions: z.array(compactTextSchema).max(8),
    warnings: z.array(compactTextSchema).max(8),
    days: z.array(compactItineraryDayV1Schema).min(1).max(12),
  })
  .strict()
  .superRefine((candidate, context) => {
    const keys = new Set<string>();
    const dates = new Set<string>();
    for (const [dayIndex, day] of candidate.days.entries()) {
      if (dates.has(day.date))
        context.addIssue({
          code: "custom",
          path: ["days", dayIndex, "date"],
          message: "Compact itinerary dates must be unique.",
        });
      dates.add(day.date);
      const dayKeys = new Set(day.items.map((item) => item.clientKey));
      let previousEnd: number | null = null;
      for (const [itemIndex, item] of day.items.entries()) {
        if (keys.has(item.clientKey))
          context.addIssue({
            code: "custom",
            path: ["days", dayIndex, "items", itemIndex, "clientKey"],
            message: "Compact itinerary item keys must be unique.",
          });
        keys.add(item.clientKey);
        const start = timeMinutes(item.startTime);
        const end = timeMinutes(item.endTime);
        if ((start === null) !== (end === null))
          context.addIssue({
            code: "custom",
            path: ["days", dayIndex, "items", itemIndex, "endTime"],
            message: "Item timing must be fully specified or fully untimed.",
          });
        if (start !== null && end !== null) {
          if (end <= start)
            context.addIssue({
              code: "custom",
              path: ["days", dayIndex, "items", itemIndex, "endTime"],
              message: "Item end time must be after its start time.",
            });
          if (previousEnd !== null && start < previousEnd)
            context.addIssue({
              code: "custom",
              path: ["days", dayIndex, "items", itemIndex, "startTime"],
              message: "Items must be ordered without overlap.",
            });
          previousEnd = end;
        }
      }
      for (const [segmentIndex, segment] of day.travelSegments.entries()) {
        if (
          !dayKeys.has(segment.fromItemKey) ||
          !dayKeys.has(segment.toItemKey) ||
          segment.fromItemKey === segment.toItemKey
        )
          context.addIssue({
            code: "custom",
            path: ["days", dayIndex, "travelSegments", segmentIndex],
            message: "Travel segments must connect two items in the same day.",
          });
        const fromIndex = day.items.findIndex(
          (item) => item.clientKey === segment.fromItemKey,
        );
        const toIndex = day.items.findIndex(
          (item) => item.clientKey === segment.toItemKey,
        );
        if (fromIndex >= 0 && toIndex >= 0 && fromIndex >= toIndex)
          context.addIssue({
            code: "custom",
            path: ["days", dayIndex, "travelSegments", segmentIndex],
            message: "Travel segments must follow item order.",
          });
      }
    }
  });

export type CompactItineraryCandidateV1 = z.infer<
  typeof compactItineraryCandidateV1Schema
>;
export type CompactItineraryDayV1 = z.infer<typeof compactItineraryDayV1Schema>;
export type CompactItineraryItemV1 = z.infer<
  typeof compactItineraryItemV1Schema
>;
export type CompactTravelSegmentV1 = z.infer<
  typeof compactTravelSegmentV1Schema
>;
