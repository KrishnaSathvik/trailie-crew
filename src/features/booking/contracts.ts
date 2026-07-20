import { z } from "zod";

export const bookingCategorySchema = z.enum([
  "park_entry",
  "permit",
  "campground",
  "tour",
  "activity",
  "shuttle",
  "ferry",
  "lodging",
  "restaurant",
  "flight",
  "hotel_search",
  "general_reservation",
]);
export const availabilityStateSchema = z.enum([
  "available",
  "unavailable",
  "limited",
  "unknown",
  "unsupported",
  "stale",
]);
export const priceStateSchema = z.enum([
  "verified_current",
  "observed",
  "starting_from",
  "stale",
  "unavailable",
  "unsupported",
]);
export const bookingRequirementSchema = z.enum([
  "required",
  "recommended",
  "optional",
  "unknown",
]);

export const bookingHandoffV1Schema = z
  .object({
    handoffId: z.string().min(16).max(240),
    roomId: z.uuid(),
    planVersionId: z.uuid(),
    itineraryItemId: z.string().nullable().optional(),
    category: bookingCategorySchema,
    provider: z.string().min(1).max(80),
    providerEntityId: z.string().nullable().optional(),
    title: z.string().min(1).max(240),
    officialOrApproved: z.boolean(),
    destinationUrl: z.string().url(),
    availabilityState: availabilityStateSchema,
    priceState: priceStateSchema,
    observedPrice: z.number().nonnegative().nullable().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    retrievedAt: z.iso.datetime({ offset: true }).nullable().optional(),
    validUntil: z.iso.datetime({ offset: true }).nullable().optional(),
    bookingRequirement: bookingRequirementSchema,
    sourceEvidenceId: z.uuid().nullable().optional(),
    attribution: z.string().max(500).nullable().optional(),
    warning: z.string().max(500).nullable().optional(),
    privacyLevel: z.enum(["public", "room"]),
  })
  .strict();

export type BookingHandoffV1 = z.infer<typeof bookingHandoffV1Schema>;

export function allowedProviderHosts(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function validateBookingUrl(raw: string, hosts: string[]) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (
      !hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export function buildApprovedSearchUrl(
  rawBase: string | undefined,
  params: Record<string, string | number | undefined>,
  hosts: string[],
) {
  if (!rawBase) return null;
  const url = validateBookingUrl(rawBase, hosts);
  if (!url) return null;
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "")
      url.searchParams.set(key, String(value));
  return url.toString();
}
