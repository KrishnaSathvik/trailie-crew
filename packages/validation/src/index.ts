import { tripIdSchema, type TripId } from "@trailie/schemas";

export type ValidationResult<T> =
  { success: true; data: T } | { success: false; issues: readonly string[] };

export function validateTripId(value: unknown): ValidationResult<TripId> {
  const result = tripIdSchema.safeParse(value);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    issues: result.error.issues.map((issue) => issue.message),
  };
}
