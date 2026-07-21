import "server-only";

import { z } from "zod";

/**
 * Deployment platforms materialize an unset variable as an empty string rather
 * than omitting it, so `.optional()` alone would reject the very value that
 * means "not configured". Every optional hosted variable must go through this.
 *
 * This lives apart from `@/server/env` so that consumers can share one guard
 * without depending on a module that tests routinely replace wholesale.
 */
export function absentWhenEmpty<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  ) as z.ZodType<z.infer<T> | undefined>;
}
