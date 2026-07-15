import { describe, expect, it } from "vitest";

import {
  parseCaptchaEnv,
  parseCleanupEnv,
  parseOpenAIEnv,
  parseRecoveryEnv,
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

  it("requires hosted CAPTCHA configuration and forbids Production test mode", () => {
    expect(() => parseCaptchaEnv({ NODE_ENV: "production" })).toThrow();
    expect(
      parseCaptchaEnv({
        TURNSTILE_SECRET_KEY: "turnstile-secret",
        SUPABASE_AUTH_CAPTCHA_ENABLED: "true",
        NODE_ENV: "production",
      }),
    ).toMatchObject({ authCaptchaEnabled: true, testMode: false });
    expect(() =>
      parseCaptchaEnv({ CAPTCHA_TEST_MODE: "true", NODE_ENV: "production" }),
    ).toThrow();
    expect(
      parseCaptchaEnv({
        CAPTCHA_TEST_MODE: "true",
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toMatchObject({ testMode: true });
    expect(
      parseCaptchaEnv({ CAPTCHA_TEST_MODE: "true", NODE_ENV: "test" }),
    ).toMatchObject({ testMode: true });
  });

  it("accepts distinct or shared cron secrets and bounds cleanup settings", () => {
    expect(parseRecoveryEnv({ CRON_SECRET: "c".repeat(32) })).toEqual({
      secret: "c".repeat(32),
    });
    expect(parseCleanupEnv({ RECOVERY_SECRET: "r".repeat(32) })).toEqual({
      secret: "r".repeat(32),
      retentionDays: 30,
      batchSize: 25,
    });
    expect(
      parseCleanupEnv({
        CLEANUP_SECRET: "d".repeat(32),
        ANONYMOUS_RETENTION_DAYS: "45",
        ANONYMOUS_CLEANUP_BATCH_SIZE: "10",
      }),
    ).toEqual({ secret: "d".repeat(32), retentionDays: 45, batchSize: 10 });
    expect(() =>
      parseCleanupEnv({
        CLEANUP_SECRET: "d".repeat(32),
        ANONYMOUS_CLEANUP_BATCH_SIZE: "1000",
      }),
    ).toThrow();
  });
});
