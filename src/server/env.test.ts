import { describe, expect, it } from "vitest";

import {
  parseCaptchaEnv,
  parseCleanupEnv,
  parseOpenAIEnv,
  parseRecoveryEnv,
  parseServerSupabaseEnv,
  parseTravelProviderEnv,
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
      reliabilityPolicy: {
        timeoutsMs: {
          focusedProvider: 30_000,
          memoryProvider: 20_000,
          planningProvider: 90_000,
          itineraryGeneration: 180_000,
          itineraryRepair: 120_000,
          revisionAnalysis: 60_000,
          revisionGeneration: 180_000,
        },
        maximumAttempts: 2,
      },
    });
  });

  it("passes legacy hosted timeouts through the central reliability policy", () => {
    expect(
      parseOpenAIEnv({
        OPENAI_API_KEY: "sk-test",
        OPENAI_SAFETY_HMAC_SECRET: "x".repeat(32),
        OPENAI_PLANNING_TIMEOUT_MS: "70000",
        AI_TIMEOUT_ITINERARY_REPAIR_MS: "140000",
        AI_MAXIMUM_ATTEMPTS: "3",
      }).reliabilityPolicy,
    ).toMatchObject({
      timeoutsMs: {
        planningProvider: 70_000,
        itineraryRepair: 140_000,
      },
      maximumAttempts: 3,
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

  it("requires every selected travel credential when live providers are enabled", () => {
    expect(
      parseTravelProviderEnv({
        TRAVEL_PROVIDERS_ENABLED: "true",
        MAPBOX_ACCESS_TOKEN: "mapbox-test",
        NPS_API_KEY: "nps-test",
        OPENWEATHER_API_KEY: "openweather-test",
        RIDB_API_KEY: "ridb-test",
      }),
    ).toMatchObject({
      enabled: true,
      mapboxAccessToken: "mapbox-test",
      npsApiKey: "nps-test",
      openWeatherApiKey: "openweather-test",
      ridbApiKey: "ridb-test",
      disabledProviders: [],
      roomDailyLimit: 200,
      globalDailyLimit: 5000,
    });
    expect(() =>
      parseTravelProviderEnv({
        TRAVEL_PROVIDERS_ENABLED: "true",
        MAPBOX_ACCESS_TOKEN: "mapbox-test",
        NPS_API_KEY: "nps-test",
        OPENWEATHER_API_KEY: "openweather-test",
      }),
    ).toThrow("Travel provider server configuration is incomplete.");
  });

  it("keeps planning available with null travel credentials when providers are disabled", () => {
    expect(
      parseTravelProviderEnv({ TRAVEL_PROVIDERS_ENABLED: "false" }),
    ).toEqual({
      enabled: false,
      mapboxAccessToken: null,
      npsApiKey: null,
      openWeatherApiKey: null,
      ridbApiKey: null,
      disabledProviders: [],
      roomDailyLimit: 200,
      globalDailyLimit: 5000,
    });
  });

  it("supports bounded limits and individual provider emergency disables", () => {
    expect(
      parseTravelProviderEnv({
        TRAVEL_PROVIDERS_ENABLED: "true",
        MAPBOX_ACCESS_TOKEN: "mapbox-test",
        NPS_API_KEY: "nps-test",
        OPENWEATHER_API_KEY: "openweather-test",
        RIDB_API_KEY: "ridb-test",
        TRAVEL_DISABLED_PROVIDERS: "openweather,nps",
        TRAVEL_PROVIDER_ROOM_DAILY_LIMIT: "50",
        TRAVEL_PROVIDER_GLOBAL_DAILY_LIMIT: "100",
      }),
    ).toMatchObject({
      disabledProviders: ["openweather", "nps"],
      roomDailyLimit: 50,
      globalDailyLimit: 100,
    });
    expect(() =>
      parseTravelProviderEnv({
        TRAVEL_DISABLED_PROVIDERS: "unknown",
      }),
    ).toThrow("Unknown disabled travel provider.");
  });
});
