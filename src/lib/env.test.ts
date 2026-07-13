import { describe, expect, it } from "vitest";

import { parsePublicSupabaseEnv, parseServerSupabaseEnv } from "./env";

const publicValues = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    "sb_publishable_example-value-long-enough",
};

describe("Supabase environment validation", () => {
  it("accepts complete public and server configuration", () => {
    expect(parsePublicSupabaseEnv(publicValues)).toEqual({
      url: publicValues.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: publicValues.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });

    expect(
      parseServerSupabaseEnv({
        ...publicValues,
        SUPABASE_SECRET_KEY: "sb_secret_example-value-long-enough",
      }),
    ).toMatchObject({ secretKey: "sb_secret_example-value-long-enough" });
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

  it("requires a distinct server secret", () => {
    expect(() => parseServerSupabaseEnv(publicValues)).toThrow();
    expect(() =>
      parseServerSupabaseEnv({
        ...publicValues,
        SUPABASE_SECRET_KEY: publicValues.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      }),
    ).toThrow();
  });
});
