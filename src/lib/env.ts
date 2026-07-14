import { z } from "zod";

const publicSupabaseEnvSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  })
  .superRefine((value, context) => {
    if (value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_secret_")) {
      context.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
        message:
          "A Supabase secret key must never be exposed through NEXT_PUBLIC_*.",
      });
    }
  });

const serverSupabaseEnvSchema = publicSupabaseEnvSchema.and(
  z.object({ SUPABASE_SECRET_KEY: z.string().min(20) }),
);

type EnvironmentSource = Record<string, string | undefined>;

const openAIEnvSchema = z.object({
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
  TRAILIE_AI_PROVIDER: z.enum(["openai", "fake"]).default("openai"),
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
});

export function parsePublicSupabaseEnv(source: EnvironmentSource) {
  const values = publicSupabaseEnvSchema.parse(source);

  return {
    url: values.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function parseServerSupabaseEnv(source: EnvironmentSource) {
  const values = serverSupabaseEnvSchema.parse(source);

  if (
    values.SUPABASE_SECRET_KEY === values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    throw new Error(
      "SUPABASE_SECRET_KEY must differ from the browser publishable key.",
    );
  }

  return {
    url: values.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secretKey: values.SUPABASE_SECRET_KEY,
  };
}

export function parseOpenAIEnv(source: EnvironmentSource) {
  const values = openAIEnvSchema.parse(source);
  if (values.TRAILIE_AI_PROVIDER === "fake") {
    if (values.NODE_ENV === "production")
      throw new Error("The fake AI provider is disabled in production.");
  } else if (!values.OPENAI_API_KEY || !values.OPENAI_SAFETY_HMAC_SECRET) {
    throw new Error("OpenAI server configuration is incomplete.");
  }
  return {
    provider: values.TRAILIE_AI_PROVIDER,
    apiKey: values.OPENAI_API_KEY ?? null,
    conversationModel: values.OPENAI_MODEL_CONVERSATION,
    flagshipModel: values.OPENAI_MODEL_FLAGSHIP,
    promptVersion: values.OPENAI_PROMPT_VERSION,
    safetyHmacSecret:
      values.OPENAI_SAFETY_HMAC_SECRET ??
      "fake-provider-development-only-secret",
    timeoutMs: values.OPENAI_TIMEOUT_MS,
    memoryModel: values.OPENAI_MEMORY_MODEL,
    memoryPromptVersion: values.OPENAI_MEMORY_PROMPT_VERSION,
    memorySchemaVersion: values.OPENAI_MEMORY_SCHEMA_VERSION,
    memoryTimeoutMs: values.OPENAI_MEMORY_TIMEOUT_MS,
  } as const;
}
