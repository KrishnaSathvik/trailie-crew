import "server-only";

import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function contentHash(schema: string, value: unknown) {
  if (!/^[a-z][a-z0-9_-]*:v\d+$/.test(schema))
    throw new Error("invalid_content_hash_schema");
  return createHash("sha256")
    .update(`${schema}\n${stableJson(value)}`, "utf8")
    .digest("hex");
}
