import "server-only";

import {
  captchaErrorCodes,
  CaptchaVerificationError,
  createCaptchaVerifier,
  type CaptchaPurpose,
} from "./captcha";

import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { parseCaptchaEnv } from "@/server/env";
import { createCorrelationId, logOperation } from "@/server/operations/logger";
import { tryDeliverOperationalAlert } from "@/server/operations/alerts";

type ActionUser = { id: string; created_at?: string };

async function recordReceipt(input: {
  userId: string;
  purpose: CaptchaPurpose;
  verificationId: string;
  expiresAt: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("record_captcha_receipt", {
    target_user_id: input.userId,
    target_purpose: input.purpose,
    verification_id: input.verificationId,
    target_expires_at: input.expiresAt,
  });
  if (error || !data) throw new Error("captcha_unavailable");
  return data;
}

export async function verifyCaptchaForAction(input: {
  token: string;
  purpose: CaptchaPurpose;
  user: ActionUser;
}) {
  const correlationId = createCorrelationId();
  const startedAt = Date.now();
  try {
    const environment = parseCaptchaEnv({
      TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
      SUPABASE_AUTH_CAPTCHA_ENABLED: process.env.SUPABASE_AUTH_CAPTCHA_ENABLED,
      CAPTCHA_TEST_MODE: process.env.CAPTCHA_TEST_MODE,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    });
    const now = new Date();
    const createdAt = input.user.created_at
      ? new Date(input.user.created_at)
      : null;

    // A just-created anonymous identity has already consumed this token through
    // Supabase Auth. Trust that event only when hosted Auth CAPTCHA is explicitly
    // declared configured; all older sessions are verified directly with Turnstile.
    if (
      environment.authCaptchaEnabled &&
      createdAt &&
      now.getTime() - createdAt.getTime() >= 0 &&
      now.getTime() - createdAt.getTime() <= 2 * 60 * 1000
    ) {
      if (!input.token.trim()) throw new Error("captcha_required");
      return await recordReceipt({
        userId: input.user.id,
        purpose: input.purpose,
        // One hosted Auth challenge authorizes exactly one subsequent create OR
        // join receipt. The database makes this verification identifier unique.
        verificationId: `supabase-auth:${input.user.id}:${input.user.created_at}`,
        expiresAt: new Date(now.getTime() + 2 * 60 * 1000).toISOString(),
      });
    }

    return await createCaptchaVerifier({
      now: () => now,
      fetch: globalThis.fetch,
      recordReceipt,
      secretKey: environment.secretKey,
      testMode: environment.testMode,
    })({
      token: input.token,
      purpose: input.purpose,
      user: { id: input.user.id, createdAt: input.user.created_at ?? "" },
    });
  } catch (error) {
    const errorCode =
      error instanceof CaptchaVerificationError
        ? error.code
        : error instanceof Error &&
            captchaErrorCodes.includes(error.message as never)
          ? error.message
          : "captcha_unavailable";
    const metadata = {
      correlationId,
      workflow: input.purpose,
      status: "rejected",
      errorCode,
      latencyMs: Date.now() - startedAt,
    };
    logOperation("captcha.failed", metadata);
    await tryDeliverOperationalAlert("captcha.failed", metadata);
    throw error;
  }
}
