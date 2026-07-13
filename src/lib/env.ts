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
