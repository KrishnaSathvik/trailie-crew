import "server-only";

import { z } from "zod";

import { parsePublicSupabaseEnv } from "@/lib/env-public";
import { parseWorkflowReliabilityPolicy } from "@/server/ai/reliability-policy";
import { absentWhenEmpty } from "@/server/env-values";

type EnvironmentSource = Record<string, string | undefined>;

export const PRODUCTION_SUPABASE_PROJECT_REF = "tkccksmiuucdstvvfglp";
export const PREVIEW_VERCEL_PROJECT_NAME = "trailie-crew-preview";
export const PRODUCTION_VERCEL_PROJECT_NAME = "trailie-crew-production";
export const PREVIEW_SITE_URL = "https://preview.trailiecrew.com";
export const PRODUCTION_SITE_URL = "https://app.trailiecrew.com";

const deploymentEnvironmentSchema = z.object({
  APP_ENV: z.enum(["local", "preview", "production"]).optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  DEPLOYMENT_PROJECT_NAME: z.string().trim().min(1).optional(),
  SUPABASE_PROJECT_REF: z
    .string()
    .regex(/^[a-z]{20}$/)
    .optional(),
  PRODUCTION_SUPABASE_PROJECT_REF: z
    .string()
    .regex(/^[a-z]{20}$/)
    .optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  AI_GENERATION_ENABLED: z.enum(["true", "false"]).optional(),
  TRAVEL_PROVIDERS_ENABLED: z.enum(["true", "false"]).optional(),
  MAPBOX_MAPS_ENABLED: z.enum(["true", "false"]).optional(),
  MAPBOX_GEOCODING_STORAGE_MODE: z
    .enum(["disabled", "temporary", "permanent"])
    .optional(),
  MAPBOX_MAP_ADAPTER: z.string().trim().min(1).optional(),
  NEXT_PUBLIC_MAPBOX_MAP_TOKEN: z.string().trim().min(1).optional(),
  MAPBOX_ACCESS_TOKEN: z.string().trim().min(1).optional(),
  TRAVEL_DISABLED_PROVIDERS: z.string().trim().optional(),
});

type DeploymentEnvironmentValues = z.infer<typeof deploymentEnvironmentSchema>;

export function parseDisabledTravelProviders(value: string | undefined) {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((provider) => provider.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Browser maps are permitted in Production only as a complete, separately
 * credentialed Mapbox surface. Every condition here is independently sufficient
 * to disable maps, so a partially configured map can never reach a real user.
 */
function assertProductionMapSafety(values: DeploymentEnvironmentValues) {
  const browserToken = values.NEXT_PUBLIC_MAPBOX_MAP_TOKEN;
  const serverToken = values.MAPBOX_ACCESS_TOKEN;
  if (!browserToken?.startsWith("pk."))
    throw new Error("Production maps require a public Mapbox browser token.");
  if (!serverToken)
    throw new Error("Production maps require the server Mapbox token.");
  if (browserToken === serverToken)
    throw new Error("Production maps require distinct Mapbox tokens.");
  if (values.MAPBOX_MAP_ADAPTER && values.MAPBOX_MAP_ADAPTER !== "mapbox")
    throw new Error("Production maps require the Mapbox renderer.");
  if (values.MAPBOX_GEOCODING_STORAGE_MODE === "permanent")
    throw new Error("Production permanent geocoding is disabled.");
  if (
    parseDisabledTravelProviders(values.TRAVEL_DISABLED_PROVIDERS).includes(
      "mapbox",
    )
  )
    throw new Error("Production maps require an enabled Mapbox provider.");
}

const productionForbiddenVariables = [
  "CAPTCHA_TEST_MODE",
  "NEXT_PUBLIC_CAPTCHA_TEST_MODE",
  "TRAVEL_CACHE_BYPASS",
  "HOSTED_ACCEPTANCE",
  "HOSTED_ACCEPTANCE_PROVIDER_FAULT",
  "HOSTED_ACCEPTANCE_PROVIDER_FAULT_ENABLED",
  "TRAILIE_FAKE_ITINERARY_SCENARIO",
  "TRAILIE_FAKE_REVISION_SCENARIO",
  "TRAILIE_FAKE_TRAVEL_SCENARIO",
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "ACCEPTED_DEMO_ROOM_ID",
  "DISPOSABLE_ROOM_ID",
  "CRON_EVIDENCE",
  "TURNSTILE_EVIDENCE",
  "WAF_EVIDENCE",
  "LOAD_DATABASE_URL",
] as const;

const productionCredentialVariables = [
  "OPENAI_API_KEY",
  "MAPBOX_ACCESS_TOKEN",
  "NEXT_PUBLIC_MAPBOX_MAP_TOKEN",
  "NPS_API_KEY",
  "OPENWEATHER_API_KEY",
  "RIDB_API_KEY",
  "TURNSTILE_SECRET_KEY",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "EMAIL_PROVIDER_API_KEY",
  "ANALYTICS_WRITE_KEY",
] as const;

function configured(value: string | undefined) {
  return Boolean(value && !["0", "false"].includes(value.toLowerCase()));
}

function projectRefFromUrl(value: string) {
  return new URL(value).hostname.split(".")[0] ?? "";
}

export function parseDeploymentEnvironment(source: EnvironmentSource) {
  const values = deploymentEnvironmentSchema.parse(source);
  if (values.VERCEL_ENV && !values.APP_ENV)
    throw new Error("APP_ENV is required for every Vercel deployment.");

  const appEnv = values.APP_ENV ?? "local";
  if (appEnv === "local") {
    if (values.VERCEL_ENV)
      throw new Error("Local APP_ENV cannot run as a Vercel deployment.");
    return {
      appEnv,
      projectName: null,
      supabaseProjectRef: values.SUPABASE_PROJECT_REF ?? null,
      siteUrl: values.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000",
    } as const;
  }

  if (appEnv === "preview") {
    if (values.VERCEL_ENV !== "preview")
      throw new Error("Preview APP_ENV requires VERCEL_ENV=preview.");
    if (values.DEPLOYMENT_PROJECT_NAME !== PREVIEW_VERCEL_PROJECT_NAME)
      throw new Error("Preview must use the Preview Vercel project.");
    if (values.NEXT_PUBLIC_SITE_URL !== PREVIEW_SITE_URL)
      throw new Error("Preview must use the Preview hostname.");
    const previewDatabaseVariables = [
      "SUPABASE_PROJECT_REF",
      "PRODUCTION_SUPABASE_PROJECT_REF",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
    ];
    for (const name of previewDatabaseVariables) {
      if (source[name]?.trim())
        throw new Error(
          `Preview database access is disabled until a staging project exists: ${name}.`,
        );
    }
  } else {
    if (
      !values.DEPLOYMENT_PROJECT_NAME ||
      !values.SUPABASE_PROJECT_REF ||
      !values.PRODUCTION_SUPABASE_PROJECT_REF ||
      !values.NEXT_PUBLIC_SUPABASE_URL ||
      !values.NEXT_PUBLIC_SITE_URL
    )
      throw new Error("Production environment identity is incomplete.");
    if (
      projectRefFromUrl(values.NEXT_PUBLIC_SUPABASE_URL) !==
      values.SUPABASE_PROJECT_REF
    )
      throw new Error("Supabase URL and project reference do not match.");
    if (values.VERCEL_ENV !== "production")
      throw new Error("Production APP_ENV requires VERCEL_ENV=production.");
    if (values.DEPLOYMENT_PROJECT_NAME !== PRODUCTION_VERCEL_PROJECT_NAME)
      throw new Error("Production must use the Production Vercel project.");
    if (
      values.SUPABASE_PROJECT_REF !== PRODUCTION_SUPABASE_PROJECT_REF ||
      values.PRODUCTION_SUPABASE_PROJECT_REF !== PRODUCTION_SUPABASE_PROJECT_REF
    )
      throw new Error("Production must use the promoted Supabase project.");
    if (values.NEXT_PUBLIC_SITE_URL !== PRODUCTION_SITE_URL)
      throw new Error("Production must use the Production hostname.");
    for (const name of productionForbiddenVariables) {
      if (configured(source[name]))
        throw new Error(`Production-only configuration forbids ${name}.`);
    }
    for (const name of productionCredentialVariables) {
      const value = source[name]?.trim();
      if (
        value &&
        /(^|[-_])(dummy|example|fake|replace|test)([-_]|$)/i.test(value)
      )
        throw new Error(`Production credential ${name} is not real.`);
    }
    if (source.TRAILIE_AI_PROVIDER === "fake")
      throw new Error("Production-only configuration forbids fake AI.");
    if (source.MAPBOX_MAP_ADAPTER === "fake")
      throw new Error("Production-only configuration forbids fake maps.");
    if (!values.AI_GENERATION_ENABLED || !values.TRAVEL_PROVIDERS_ENABLED)
      throw new Error("Production provider switches are required.");
    if (!values.MAPBOX_MAPS_ENABLED)
      throw new Error("Production map switch is required.");
    if (!values.MAPBOX_GEOCODING_STORAGE_MODE)
      throw new Error("Production geocoding storage mode is required.");
    if (values.MAPBOX_GEOCODING_STORAGE_MODE === "permanent")
      throw new Error("Production permanent geocoding is disabled.");
    if (values.MAPBOX_MAPS_ENABLED === "true")
      assertProductionMapSafety(values);
  }

  return {
    appEnv,
    projectName: values.DEPLOYMENT_PROJECT_NAME,
    supabaseProjectRef: values.SUPABASE_PROJECT_REF,
    siteUrl: values.NEXT_PUBLIC_SITE_URL,
  } as const;
}

const serverSupabaseEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(20),
});

const enabledSchema = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const openAIEnvSchema = z.object({
  AI_GENERATION_ENABLED: enabledSchema,
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL_CONVERSATION: z.string().trim().min(1).default("gpt-5.6-terra"),
  OPENAI_MODEL_FLAGSHIP: z.string().trim().min(1).default("gpt-5.6-sol"),
  OPENAI_PROMPT_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("trailie-focused-v1"),
  OPENAI_SAFETY_HMAC_SECRET: z.string().min(32).optional(),
  OPENAI_MEMORY_MODEL: z.string().trim().min(1).default("gpt-5.6-luna"),
  OPENAI_MEMORY_PROMPT_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("trailie-memory-v1"),
  OPENAI_MEMORY_SCHEMA_VERSION: z.string().trim().min(1).max(100).default("1"),
  OPENAI_PLANNING_MODEL: z.string().trim().min(1).default("gpt-5.6-sol"),
  OPENAI_PLANNING_PROMPT_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("trailie-planning-summary-v1"),
  OPENAI_PLANNING_SCHEMA_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("1"),
  OPENAI_ITINERARY_MODEL: z.string().trim().min(1).default("gpt-5.6-sol"),
  OPENAI_ITINERARY_PROMPT_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("trailie-itinerary-compact-v1"),
  OPENAI_ITINERARY_SCHEMA_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("1"),
  ITINERARY_VALIDATOR_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("trailie-itinerary-validator-v1"),
  TRAILIE_AI_PROVIDER: z.enum(["openai", "fake"]).default("openai"),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
});

const recoveryEnvSchema = z
  .object({
    RECOVERY_SECRET: absentWhenEmpty(z.string().min(32)),
    CRON_SECRET: absentWhenEmpty(z.string().min(16)),
  })
  .refine((value) => value.RECOVERY_SECRET || value.CRON_SECRET);

const cleanupEnvSchema = z
  .object({
    CLEANUP_SECRET: absentWhenEmpty(z.string().min(32)),
    CRON_SECRET: absentWhenEmpty(z.string().min(16)),
    RECOVERY_SECRET: absentWhenEmpty(z.string().min(32)),
    ANONYMOUS_RETENTION_DAYS: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.coerce.number().int().min(1).max(3650).default(30),
    ),
    ANONYMOUS_CLEANUP_BATCH_SIZE: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.coerce.number().int().min(1).max(100).default(25),
    ),
  })
  .refine(
    (value) =>
      value.CLEANUP_SECRET || value.CRON_SECRET || value.RECOVERY_SECRET,
  );

const captchaEnvSchema = z.object({
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  TURNSTILE_EXPECTED_HOSTNAME: z.string().trim().min(1).optional(),
  SUPABASE_AUTH_CAPTCHA_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  CAPTCHA_TEST_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  APP_ENV: z.enum(["local", "preview", "production"]).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
});

const travelProviderEnvSchema = z.object({
  TRAVEL_PROVIDERS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  MAPBOX_MAPS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  MAPBOX_ACCESS_TOKEN: z.string().trim().min(1).optional(),
  MAPBOX_GEOCODING_STORAGE_MODE: z
    .enum(["disabled", "temporary", "permanent"])
    .default("disabled"),
  NPS_API_KEY: z.string().trim().min(1).optional(),
  OPENWEATHER_API_KEY: z.string().trim().min(1).optional(),
  RIDB_API_KEY: z.string().trim().min(1).optional(),
  TRAVEL_DISABLED_PROVIDERS: z.string().trim().default(""),
  TRAVEL_PROVIDER_ROOM_DAILY_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .default(200),
  TRAVEL_PROVIDER_GLOBAL_DAILY_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .default(5_000),
});

export function parseServerSupabaseEnv(source: EnvironmentSource) {
  const publicValues = parsePublicSupabaseEnv(source);
  const values = serverSupabaseEnvSchema.parse(source);
  if (values.SUPABASE_SECRET_KEY === publicValues.publishableKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY must differ from the browser publishable key.",
    );
  }
  return { ...publicValues, secretKey: values.SUPABASE_SECRET_KEY };
}

export function parseOpenAIEnv(source: EnvironmentSource) {
  const values = openAIEnvSchema.parse(source);
  const reliabilityPolicy = parseWorkflowReliabilityPolicy(source);
  if (values.TRAILIE_AI_PROVIDER === "fake" && values.NODE_ENV === "production")
    throw new Error("The fake AI provider is disabled in production.");
  if (
    values.AI_GENERATION_ENABLED &&
    values.TRAILIE_AI_PROVIDER === "openai" &&
    (!values.OPENAI_API_KEY || !values.OPENAI_SAFETY_HMAC_SECRET)
  )
    throw new Error("OpenAI server configuration is incomplete.");
  return {
    generationEnabled: values.AI_GENERATION_ENABLED,
    provider: values.TRAILIE_AI_PROVIDER,
    apiKey: values.OPENAI_API_KEY ?? null,
    conversationModel: values.OPENAI_MODEL_CONVERSATION,
    flagshipModel: values.OPENAI_MODEL_FLAGSHIP,
    promptVersion: values.OPENAI_PROMPT_VERSION,
    safetyHmacSecret:
      values.OPENAI_SAFETY_HMAC_SECRET ??
      "generation-disabled-or-fake-provider-secret",
    memoryModel: values.OPENAI_MEMORY_MODEL,
    memoryPromptVersion: values.OPENAI_MEMORY_PROMPT_VERSION,
    memorySchemaVersion: values.OPENAI_MEMORY_SCHEMA_VERSION,
    planningModel: values.OPENAI_PLANNING_MODEL,
    planningPromptVersion: values.OPENAI_PLANNING_PROMPT_VERSION,
    planningSchemaVersion: values.OPENAI_PLANNING_SCHEMA_VERSION,
    itineraryModel: values.OPENAI_ITINERARY_MODEL,
    itineraryPromptVersion: values.OPENAI_ITINERARY_PROMPT_VERSION,
    itinerarySchemaVersion: values.OPENAI_ITINERARY_SCHEMA_VERSION,
    itineraryValidatorVersion: values.ITINERARY_VALIDATOR_VERSION,
    reliabilityPolicy,
  } as const;
}

export class AiGenerationDisabledError extends Error {
  constructor() {
    super("ai_generation_disabled");
    this.name = "AiGenerationDisabledError";
  }
}

export function requireAiGeneration(
  environment: ReturnType<typeof parseOpenAIEnv>,
) {
  if (!environment.generationEnabled) throw new AiGenerationDisabledError();
  return environment;
}

export function parseRecoveryEnv(source: EnvironmentSource) {
  const values = recoveryEnvSchema.parse(source);
  return { secret: values.RECOVERY_SECRET ?? values.CRON_SECRET! };
}

export function parseCleanupEnv(source: EnvironmentSource) {
  const values = cleanupEnvSchema.parse(source);
  return {
    secret:
      values.CLEANUP_SECRET ?? values.CRON_SECRET ?? values.RECOVERY_SECRET!,
    retentionDays: values.ANONYMOUS_RETENTION_DAYS,
    batchSize: values.ANONYMOUS_CLEANUP_BATCH_SIZE,
  };
}

export function parseCaptchaEnv(source: EnvironmentSource) {
  const values = captchaEnvSchema.parse(source);
  if (
    values.CAPTCHA_TEST_MODE &&
    (values.VERCEL_ENV === "production" ||
      (values.NODE_ENV === "production" && values.VERCEL_ENV !== "preview"))
  )
    throw new Error("CAPTCHA test mode is disabled in production.");
  if (
    !values.CAPTCHA_TEST_MODE &&
    (!values.TURNSTILE_SECRET_KEY ||
      !values.TURNSTILE_EXPECTED_HOSTNAME ||
      !values.SUPABASE_AUTH_CAPTCHA_ENABLED)
  )
    throw new Error("CAPTCHA server configuration is incomplete.");
  const requiredHostname =
    values.APP_ENV === "production"
      ? "app.trailiecrew.com"
      : values.APP_ENV === "preview"
        ? "preview.trailiecrew.com"
        : null;
  if (
    !values.CAPTCHA_TEST_MODE &&
    requiredHostname &&
    values.TURNSTILE_EXPECTED_HOSTNAME !== requiredHostname
  )
    throw new Error("CAPTCHA hostname does not match APP_ENV.");
  return {
    secretKey: values.TURNSTILE_SECRET_KEY ?? "test-mode-secret",
    expectedHostname: values.TURNSTILE_EXPECTED_HOSTNAME ?? "test-mode.invalid",
    authCaptchaEnabled: values.SUPABASE_AUTH_CAPTCHA_ENABLED,
    testMode: values.CAPTCHA_TEST_MODE,
  };
}

export function parseTravelProviderEnv(source: EnvironmentSource) {
  const values = travelProviderEnvSchema.parse(source);
  const disabledProviders = parseDisabledTravelProviders(
    values.TRAVEL_DISABLED_PROVIDERS,
  );
  if (
    disabledProviders.some(
      (provider) =>
        !["mapbox", "openweather", "nps", "ridb"].includes(provider),
    )
  )
    throw new Error("Unknown disabled travel provider.");
  // Browser maps and the Mapbox provider are one enablement decision: a rendered
  // map with a disabled provider would show markers it can never verify.
  if (values.MAPBOX_MAPS_ENABLED && disabledProviders.includes("mapbox"))
    throw new Error("Enabled maps require an enabled Mapbox provider.");
  if (values.MAPBOX_MAPS_ENABLED && !values.MAPBOX_ACCESS_TOKEN)
    throw new Error("Enabled maps require the server Mapbox token.");
  if (
    values.TRAVEL_PROVIDER_ROOM_DAILY_LIMIT >
    values.TRAVEL_PROVIDER_GLOBAL_DAILY_LIMIT
  )
    throw new Error("Travel provider limits are invalid.");
  if (
    values.TRAVEL_PROVIDERS_ENABLED &&
    ((!disabledProviders.includes("mapbox") && !values.MAPBOX_ACCESS_TOKEN) ||
      (!disabledProviders.includes("nps") && !values.NPS_API_KEY) ||
      (!disabledProviders.includes("openweather") &&
        !values.OPENWEATHER_API_KEY) ||
      (!disabledProviders.includes("ridb") && !values.RIDB_API_KEY))
  )
    throw new Error("Travel provider server configuration is incomplete.");
  return {
    enabled: values.TRAVEL_PROVIDERS_ENABLED,
    mapboxAccessToken: values.MAPBOX_ACCESS_TOKEN ?? null,
    mapboxGeocodingStorageMode: values.MAPBOX_GEOCODING_STORAGE_MODE,
    npsApiKey: values.NPS_API_KEY ?? null,
    openWeatherApiKey: values.OPENWEATHER_API_KEY ?? null,
    ridbApiKey: values.RIDB_API_KEY ?? null,
    disabledProviders: disabledProviders as ReadonlyArray<
      "mapbox" | "openweather" | "nps" | "ridb"
    >,
    roomDailyLimit: values.TRAVEL_PROVIDER_ROOM_DAILY_LIMIT,
    globalDailyLimit: values.TRAVEL_PROVIDER_GLOBAL_DAILY_LIMIT,
  } as const;
}
