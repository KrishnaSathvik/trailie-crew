import { describe, expect, it } from "vitest";

import { parsePublicSupabaseEnv } from "./env-public";

const publicValues = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    "sb_publishable_example-value-long-enough",
};

describe("public environment validation", () => {
  it("returns only browser-safe Supabase values", () => {
    expect(
      parsePublicSupabaseEnv({
        ...publicValues,
        OPENAI_API_KEY: "must-not-be-returned",
        SUPABASE_SECRET_KEY: "must-not-be-returned",
      }),
    ).toEqual({
      url: publicValues.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: publicValues.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it.each([
    {},
    { ...publicValues, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" },
    { ...publicValues, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
    {
      ...publicValues,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        "sb_secret_do-not-expose-this-value",
    },
  ])("rejects unsafe or incomplete public configuration %#", (values) => {
    expect(() => parsePublicSupabaseEnv(values)).toThrow();
  });
});
