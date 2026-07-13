import type { TripErrorCode } from "@/features/trips/errors/trip-errors";

export type TripActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: TripErrorCode;
      fieldErrors?: Record<string, string>;
    };
