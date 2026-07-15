import { z } from "zod";

type EnvironmentSource = Record<string, string | undefined>;

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

export function parsePublicSupabaseEnv(source: EnvironmentSource) {
  const values = publicSupabaseEnvSchema.parse(source);
  return {
    url: values.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
