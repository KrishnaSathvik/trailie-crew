import { describe, expect, it } from "vitest";

import {
  parseDeploymentEnvironment,
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
  it("defaults only non-Vercel execution to local", () => {
    expect(parseDeploymentEnvironment({})).toMatchObject({
      appEnv: "local",
      siteUrl: "http://127.0.0.1:3000",
    });
    expect(() => parseDeploymentEnvironment({ VERCEL_ENV: "preview" })).toThrow(
      "APP_ENV is required",
    );
  });

  it("keeps Preview database-free until staging exists", () => {
    expect(
      parseDeploymentEnvironment({
        APP_ENV: "preview",
        VERCEL_ENV: "preview",
        DEPLOYMENT_PROJECT_NAME: "trailie-crew-preview",
        NEXT_PUBLIC_SITE_URL: "https://preview.trailiecrew.com",
      }),
    ).toMatchObject({
      appEnv: "preview",
      projectName: "trailie-crew-preview",
      supabaseProjectRef: undefined,
      siteUrl: "https://preview.trailiecrew.com",
    });
    expect(() =>
      parseDeploymentEnvironment({
        APP_ENV: "preview",
        VERCEL_ENV: "preview",
        DEPLOYMENT_PROJECT_NAME: "trailie-crew-preview",
        SUPABASE_PROJECT_REF: "tkccksmiuucdstvvfglp",
        NEXT_PUBLIC_SITE_URL: "https://preview.trailiecrew.com",
      }),
    ).toThrow("Preview database access is disabled");
  });

  it("requires the exact locked-down Production identity", () => {
    const production = {
      APP_ENV: "production",
      VERCEL_ENV: "production",
      DEPLOYMENT_PROJECT_NAME: "trailie-crew-production",
      SUPABASE_PROJECT_REF: "tkccksmiuucdstvvfglp",
      PRODUCTION_SUPABASE_PROJECT_REF: "tkccksmiuucdstvvfglp",
      NEXT_PUBLIC_SUPABASE_URL: "https://tkccksmiuucdstvvfglp.supabase.co",
      NEXT_PUBLIC_SITE_URL: "https://app.trailiecrew.com",
      AI_GENERATION_ENABLED: "false",
      TRAVEL_PROVIDERS_ENABLED: "false",
      MAPBOX_MAPS_ENABLED: "false",
      MAPBOX_GEOCODING_STORAGE_MODE: "disabled",
    };

    expect(parseDeploymentEnvironment(production)).toMatchObject({
      appEnv: "production",
      projectName: "trailie-crew-production",
      supabaseProjectRef: "tkccksmiuucdstvvfglp",
      siteUrl: "https://app.trailiecrew.com",
    });
    expect(() =>
      parseDeploymentEnvironment({
        ...production,
        SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
        PRODUCTION_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      }),
    ).toThrow("Production must use the promoted Supabase project");
    expect(() =>
      parseDeploymentEnvironment({
        ...production,
        CAPTCHA_TEST_MODE: "true",
      }),
    ).toThrow("Production-only configuration forbids CAPTCHA_TEST_MODE");
    expect(() =>
      parseDeploymentEnvironment({
        ...production,
        CRON_EVIDENCE: "fixture",
      }),
    ).toThrow("Production-only configuration forbids CRON_EVIDENCE");
    expect(() =>
      parseDeploymentEnvironment({
        ...production,
        OPENAI_API_KEY: "dummy-provider-key",
      }),
    ).toThrow("Production credential OPENAI_API_KEY is not real");
  });

  it("allows controlled Production providers while preserving launch kill switches", () => {
    const production = {
      APP_ENV: "production",
      VERCEL_ENV: "production",
      DEPLOYMENT_PROJECT_NAME: "trailie-crew-production",
      SUPABASE_PROJECT_REF: "tkccksmiuucdstvvfglp",
      PRODUCTION_SUPABASE_PROJECT_REF: "tkccksmiuucdstvvfglp",
      NEXT_PUBLIC_SUPABASE_URL: "https://tkccksmiuucdstvvfglp.supabase.co",
      NEXT_PUBLIC_SITE_URL: "https://app.trailiecrew.com",
      AI_GENERATION_ENABLED: "true",
      TRAVEL_PROVIDERS_ENABLED: "true",
      MAPBOX_MAPS_ENABLED: "false",
      MAPBOX_GEOCODING_STORAGE_MODE: "temporary",
    };

    expect(parseDeploymentEnvironment(production)).toMatchObject({
      appEnv: "production",
      projectName: "trailie-crew-production",
    });
    expect(() =>
      parseDeploymentEnvironment({
        ...production,
        MAPBOX_MAPS_ENABLED: "true",
      }),
    ).toThrow("Production maps must remain disabled");
    expect(() =>
      parseDeploymentEnvironment({
        ...production,
        MAPBOX_GEOCODING_STORAGE_MODE: "permanent",
      }),
    ).toThrow("Production permanent geocoding is disabled");
    expect(() =>
      parseDeploymentEnvironment({
        ...production,
        AI_GENERATION_ENABLED: undefined,
      }),
    ).toThrow("Production provider switches are required");
    expect(
      parseDeploymentEnvironment({
        ...production,
        AI_GENERATION_ENABLED: "false",
        TRAVEL_PROVIDERS_ENABLED: "false",
        MAPBOX_GEOCODING_STORAGE_MODE: "disabled",
      }),
    ).toMatchObject({ appEnv: "production" });
  });

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
        TURNSTILE_EXPECTED_HOSTNAME: "app.trailiecrew.com",
        SUPABASE_AUTH_CAPTCHA_ENABLED: "true",
        APP_ENV: "production",
        NODE_ENV: "production",
      }),
    ).toMatchObject({
      authCaptchaEnabled: true,
      expectedHostname: "app.trailiecrew.com",
      testMode: false,
    });
    expect(() =>
      parseCaptchaEnv({
        TURNSTILE_SECRET_KEY: "turnstile-secret",
        TURNSTILE_EXPECTED_HOSTNAME: "preview.trailiecrew.com",
        SUPABASE_AUTH_CAPTCHA_ENABLED: "true",
        APP_ENV: "production",
      }),
    ).toThrow();
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
      mapboxGeocodingStorageMode: "disabled",
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

  it("requires explicit Mapbox geocoding storage mode and never defaults to permanent", () => {
    const configured = parseTravelProviderEnv({
      TRAVEL_PROVIDERS_ENABLED: "true",
      MAPBOX_ACCESS_TOKEN: "mapbox-test",
      MAPBOX_GEOCODING_STORAGE_MODE: "temporary",
      NPS_API_KEY: "nps-test",
      OPENWEATHER_API_KEY: "openweather-test",
      RIDB_API_KEY: "ridb-test",
    });
    expect(configured.mapboxGeocodingStorageMode).toBe("temporary");
    expect(
      parseTravelProviderEnv({
        MAPBOX_GEOCODING_STORAGE_MODE: "permanent",
      }).mapboxGeocodingStorageMode,
    ).toBe("permanent");
  });

  it("keeps planning available with null travel credentials when providers are disabled", () => {
    expect(
      parseTravelProviderEnv({ TRAVEL_PROVIDERS_ENABLED: "false" }),
    ).toEqual({
      enabled: false,
      mapboxAccessToken: null,
      mapboxGeocodingStorageMode: "disabled",
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

  it("requires credentials only for travel providers that are enabled", () => {
    expect(
      parseTravelProviderEnv({
        TRAVEL_PROVIDERS_ENABLED: "true",
        MAPBOX_GEOCODING_STORAGE_MODE: "temporary",
        NPS_API_KEY: "nps-test",
        OPENWEATHER_API_KEY: "openweather-test",
        RIDB_API_KEY: "ridb-test",
        TRAVEL_DISABLED_PROVIDERS: "mapbox",
      }),
    ).toMatchObject({
      enabled: true,
      mapboxAccessToken: null,
      mapboxGeocodingStorageMode: "temporary",
      disabledProviders: ["mapbox"],
    });
    expect(() =>
      parseTravelProviderEnv({
        TRAVEL_PROVIDERS_ENABLED: "true",
        OPENWEATHER_API_KEY: "openweather-test",
        RIDB_API_KEY: "ridb-test",
        TRAVEL_DISABLED_PROVIDERS: "mapbox",
      }),
    ).toThrow("Travel provider server configuration is incomplete.");
  });
});
