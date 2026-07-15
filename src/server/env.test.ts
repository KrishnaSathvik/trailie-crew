import { describe, expect, it } from "vitest";

import {
  parseOpenAIEnv,
  parseServerSupabaseEnv,
  requireAiGeneration,
} from "./env";

const publicValues = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    "sb_publishable_example-value-long-enough",
};

describe("server environment validation", () => {
  it("requires a distinct Supabase server secret", () => {
    expect(
      parseServerSupabaseEnv({
        ...publicValues,
        SUPABASE_SECRET_KEY: "sb_secret_example-value-long-enough",
      }),
    ).toMatchObject({ secretKey: "sb_secret_example-value-long-enough" });
    expect(() => parseServerSupabaseEnv(publicValues)).toThrow();
    expect(() =>
      parseServerSupabaseEnv({
        ...publicValues,
        SUPABASE_SECRET_KEY: publicValues.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      }),
    ).toThrow();
  });

  it("uses verified model defaults and exposes an enabled kill switch", () => {
    expect(
      parseOpenAIEnv({
        OPENAI_API_KEY: "sk-test",
        OPENAI_SAFETY_HMAC_SECRET: "x".repeat(32),
      }),
    ).toMatchObject({
      generationEnabled: true,
      provider: "openai",
      conversationModel: "gpt-5.6-terra",
      memoryModel: "gpt-5.6-luna",
      planningModel: "gpt-5.6-sol",
      itineraryModel: "gpt-5.6-sol",
    });
  });

  it("allows generation to be disabled without provider credentials", () => {
    const environment = parseOpenAIEnv({ AI_GENERATION_ENABLED: "false" });
    expect(environment).toMatchObject({
      generationEnabled: false,
      provider: "openai",
      apiKey: null,
    });
    expect(() => requireAiGeneration(environment)).toThrow(
      "ai_generation_disabled",
    );
  });

  it("fails closed for missing enabled credentials and production fake providers", () => {
    expect(() => parseOpenAIEnv({})).toThrow();
    expect(() =>
      parseOpenAIEnv({ TRAILIE_AI_PROVIDER: "fake", NODE_ENV: "production" }),
    ).toThrow();
  });
});
