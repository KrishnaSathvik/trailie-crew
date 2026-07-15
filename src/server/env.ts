import "server-only";

import { z } from "zod";

import { parsePublicSupabaseEnv } from "@/lib/env-public";

type EnvironmentSource = Record<string, string | undefined>;

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
  OPENAI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(120_000)
    .default(30_000),
  OPENAI_MEMORY_MODEL: z.string().trim().min(1).default("gpt-5.6-luna"),
  OPENAI_MEMORY_PROMPT_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("trailie-memory-v1"),
  OPENAI_MEMORY_SCHEMA_VERSION: z.string().trim().min(1).max(100).default("1"),
  OPENAI_MEMORY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(60_000)
    .default(20_000),
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
  OPENAI_PLANNING_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(120_000)
    .default(90_000),
  OPENAI_ITINERARY_MODEL: z.string().trim().min(1).default("gpt-5.6-sol"),
  OPENAI_ITINERARY_PROMPT_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default("trailie-itinerary-v1"),
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
  OPENAI_ITINERARY_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(5_000)
    .max(240_000)
    .default(180_000),
  TRAILIE_AI_PROVIDER: z.enum(["openai", "fake"]).default("openai"),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
});

const recoveryEnvSchema = z
  .object({
    RECOVERY_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    CRON_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(16).optional(),
    ),
  })
  .refine((value) => value.RECOVERY_SECRET || value.CRON_SECRET);

const cleanupEnvSchema = z
  .object({
    CLEANUP_SECRET: z.string().min(32).optional(),
    CRON_SECRET: z.string().min(16).optional(),
    RECOVERY_SECRET: z.string().min(32).optional(),
    ANONYMOUS_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3650)
      .default(30),
    ANONYMOUS_CLEANUP_BATCH_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25),
  })
  .refine(
    (value) =>
      value.CLEANUP_SECRET || value.CRON_SECRET || value.RECOVERY_SECRET,
  );

const captchaEnvSchema = z.object({
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_AUTH_CAPTCHA_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  CAPTCHA_TEST_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
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
    timeoutMs: values.OPENAI_TIMEOUT_MS,
    memoryModel: values.OPENAI_MEMORY_MODEL,
    memoryPromptVersion: values.OPENAI_MEMORY_PROMPT_VERSION,
    memorySchemaVersion: values.OPENAI_MEMORY_SCHEMA_VERSION,
    memoryTimeoutMs: values.OPENAI_MEMORY_TIMEOUT_MS,
    planningModel: values.OPENAI_PLANNING_MODEL,
    planningPromptVersion: values.OPENAI_PLANNING_PROMPT_VERSION,
    planningSchemaVersion: values.OPENAI_PLANNING_SCHEMA_VERSION,
    planningTimeoutMs: values.OPENAI_PLANNING_TIMEOUT_MS,
    itineraryModel: values.OPENAI_ITINERARY_MODEL,
    itineraryPromptVersion: values.OPENAI_ITINERARY_PROMPT_VERSION,
    itinerarySchemaVersion: values.OPENAI_ITINERARY_SCHEMA_VERSION,
    itineraryValidatorVersion: values.ITINERARY_VALIDATOR_VERSION,
    itineraryTimeoutMs: values.OPENAI_ITINERARY_TIMEOUT_MS,
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
    (!values.TURNSTILE_SECRET_KEY || !values.SUPABASE_AUTH_CAPTCHA_ENABLED)
  )
    throw new Error("CAPTCHA server configuration is incomplete.");
  return {
    secretKey: values.TURNSTILE_SECRET_KEY ?? "test-mode-secret",
    authCaptchaEnabled: values.SUPABASE_AUTH_CAPTCHA_ENABLED,
    testMode: values.CAPTCHA_TEST_MODE,
  };
}
