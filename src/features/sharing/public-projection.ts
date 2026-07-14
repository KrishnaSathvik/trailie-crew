import {
  publicSharedItinerarySchema,
  type Itinerary,
  type PublicLocation,
  type PublicSharedItinerary,
  type ValidationStatus,
} from "@trailie/schemas";

const sensitivePattern =
  /(^|[^a-z])(confirmation|booking reference|passport|email address|provider request|model id|api key)([^a-z]|$)/i;
const emailPattern = /[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/;
const unsafePattern = /[<>\u0000-\u001f\u007f]/;
const identifyingConstraintPattern =
  /^(?:[A-Z][\p{L}'-]{1,40})\s+(?:is|has|needs|requires|requested|cannot|can't)\b/iu;

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeText(value: string | null | undefined, names: string[]) {
  const clean = value?.trim();
  if (
    !clean ||
    unsafePattern.test(clean) ||
    sensitivePattern.test(clean) ||
    identifyingConstraintPattern.test(clean)
  )
    return undefined;
  if (emailPattern.test(clean)) return undefined;
  if (
    names.some((name) =>
      new RegExp(
        `(^|[^\\p{L}\\p{N}])${escapePattern(name)}([^\\p{L}\\p{N}]|$)`,
        "iu",
      ).test(clean),
    )
  )
    return undefined;
  return clean;
}

function location(
  value: Itinerary["days"][number]["items"][number]["location"],
  names: string[],
): PublicLocation | undefined {
  if (!value) return undefined;
  const name = safeText(value.name, names);
  if (!name) return undefined;
  return {
    name,
    timezone: value.timezone,
    verificationStatus: value.verificationStatus,
  };
}

export function projectPublicItinerary(input: {
  itinerary: Itinerary;
  version: number;
  publishedAt: string;
  validationStatus: ValidationStatus;
}): PublicSharedItinerary {
  const names = input.itinerary.travelers.map(
    (traveler) => traveler.displayName,
  );
  const title = safeText(input.itinerary.title, names) ?? "Shared itinerary";
  const destinationSummary =
    safeText(input.itinerary.destinationSummary, names) ?? "Trip itinerary";
  const projected = {
    schemaVersion: "1" as const,
    title,
    destinationSummary,
    timezone: input.itinerary.timezone,
    startDate: input.itinerary.startDate,
    endDate: input.itinerary.endDate,
    version: input.version,
    publishedAt: input.publishedAt,
    validation: { status: "pass" as const, passed: true as const },
    days: input.itinerary.days.map((day) => ({
      date: day.date,
      title: safeText(day.title, names) ?? "Itinerary day",
      ...(safeText(day.summary, names)
        ? { summary: safeText(day.summary, names) }
        : {}),
      items: day.items.flatMap((item) => {
        const itemTitle = safeText(item.title, names);
        if (!itemTitle) return [];
        const itemLocation = location(item.location, names);
        const description = safeText(item.description, names);
        return [
          {
            key: item.id,
            type: item.type,
            startTime: item.startTime,
            endTime: item.endTime,
            title: itemTitle,
            ...(description ? { description } : {}),
            ...(itemLocation ? { location: itemLocation } : {}),
            reservationStatus: item.reservation.status,
            dataStatus:
              itemLocation?.verificationStatus ?? ("unknown" as const),
          },
        ];
      }),
      travelSegments: day.travelSegments.flatMap((segment) => {
        const origin = location(segment.origin, names);
        const destination = location(segment.destination, names);
        if (!origin || !destination) return [];
        return [
          {
            mode: segment.mode,
            origin,
            destination,
            durationMinutes: segment.durationMinutes,
            bufferMinutes: segment.bufferMinutes,
            dataStatus: segment.verificationStatus,
          },
        ];
      }),
      warnings: day.warnings.flatMap((warning) => {
        const value = safeText(warning, names);
        return value ? [value] : [];
      }),
    })),
    lodging: input.itinerary.lodging.flatMap((stay) => {
      const name = safeText(stay.name, names);
      const area = safeText(stay.area, names);
      if (!name || !area) return [];
      const stayLocation = location(stay.location, names);
      return [
        {
          name,
          area,
          checkInDate: stay.checkInDate,
          checkOutDate: stay.checkOutDate,
          ...(stayLocation ? { location: stayLocation } : {}),
          reservationStatus: stay.reservation.status,
        },
      ];
    }),
    food: input.itinerary.restaurants.flatMap((restaurant) => {
      const name = safeText(restaurant.name, names);
      if (!name) return [];
      const foodLocation = location(restaurant.location, names);
      return [
        {
          name,
          mealWindow: restaurant.mealWindow,
          ...(foodLocation ? { location: foodLocation } : {}),
          ...(restaurant.dietaryAlignment.length > 0
            ? { dietaryNote: "Dietary-friendly options are included." as const }
            : {}),
          reservationStatus: restaurant.reservation.status,
        },
      ];
    }),
    disclaimer: "No bookings were made by Trailie" as const,
  };
  if (input.validationStatus !== "pass") throw new Error("plan_not_published");
  return publicSharedItinerarySchema.parse(projected);
}
