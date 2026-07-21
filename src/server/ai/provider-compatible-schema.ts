import { zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";

function omitProviderFormatAnnotations(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((item) => omitProviderFormatAnnotations(item));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "format")
      .map(([key, entryValue]) => [
        key,
        omitProviderFormatAnnotations(entryValue),
      ]),
  );
}

export function createProviderCompatibleZodTextFormat(
  schema: ZodType,
  name: string,
) {
  const format = zodTextFormat(schema, name);
  format.schema = omitProviderFormatAnnotations(
    format.schema,
  ) as typeof format.schema;
  return format;
}
