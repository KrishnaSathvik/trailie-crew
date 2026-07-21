import "server-only";

import { z } from "zod";

export const captchaErrorCodes = [
  "captcha_required",
  "captcha_invalid",
  "captcha_expired",
  "captcha_unavailable",
] as const;

export type CaptchaErrorCode = (typeof captchaErrorCodes)[number];
export type CaptchaPurpose = "create_trip" | "join_trip";
export type CaptchaAction = CaptchaPurpose | "guest_invite";

export class CaptchaVerificationError extends Error {
  constructor(public readonly code: CaptchaErrorCode) {
    super(code);
    this.name = "CaptchaVerificationError";
  }
}

type VerificationInput<Action extends CaptchaAction> = {
  token: string;
  purpose: Action;
  user: { id: string; createdAt: string };
};

type ReceiptInput<Action extends CaptchaAction> = {
  userId: string;
  purpose: Action;
  verificationId: string;
  expiresAt: string;
};

type CaptchaVerifierDependencies<Action extends CaptchaAction> = {
  now: () => Date;
  fetch: typeof globalThis.fetch;
  recordReceipt: (input: ReceiptInput<Action>) => Promise<string>;
  secretKey: string;
  expectedHostname: string;
  testMode: boolean;
};

const providerResponseSchema = z.object({
  success: z.boolean(),
  challenge_ts: z.string().optional(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  "error-codes": z.array(z.string()).optional(),
});

function safeProviderError(errorCodes: string[] | undefined): CaptchaErrorCode {
  return errorCodes?.includes("timeout-or-duplicate")
    ? "captcha_expired"
    : "captcha_invalid";
}

export function createCaptchaVerifier<Action extends CaptchaAction>(
  dependencies: CaptchaVerifierDependencies<Action>,
) {
  return async ({ token, purpose, user }: VerificationInput<Action>) => {
    const normalizedToken = token.trim();
    if (!normalizedToken)
      throw new CaptchaVerificationError("captcha_required");

    const expiresAt = new Date(
      dependencies.now().getTime() + 2 * 60 * 1000,
    ).toISOString();

    if (dependencies.testMode) {
      if (normalizedToken !== "trailie-test-captcha")
        throw new CaptchaVerificationError("captcha_invalid");
      return dependencies.recordReceipt({
        userId: user.id,
        purpose,
        verificationId: `test:${user.id}:${purpose}:${dependencies.now().toISOString()}`,
        expiresAt,
      });
    }

    if (!dependencies.secretKey)
      throw new CaptchaVerificationError("captcha_unavailable");

    try {
      const body = new URLSearchParams({
        secret: dependencies.secretKey,
        response: normalizedToken,
      });
      const response = await dependencies.fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        { method: "POST", body, signal: AbortSignal.timeout(8_000) },
      );
      if (!response.ok)
        throw new CaptchaVerificationError("captcha_unavailable");
      const parsed = providerResponseSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new CaptchaVerificationError("captcha_unavailable");
      if (!parsed.data.success)
        throw new CaptchaVerificationError(
          safeProviderError(parsed.data["error-codes"]),
        );
      if (
        parsed.data.hostname !== dependencies.expectedHostname ||
        parsed.data.action !== purpose
      )
        throw new CaptchaVerificationError("captcha_invalid");
      const challengedAt = parsed.data.challenge_ts
        ? new Date(parsed.data.challenge_ts)
        : null;
      const challengeAgeMs = challengedAt
        ? dependencies.now().getTime() - challengedAt.getTime()
        : Number.NaN;
      if (
        !challengedAt ||
        !Number.isFinite(challengeAgeMs) ||
        challengeAgeMs > 5 * 60 * 1000
      )
        throw new CaptchaVerificationError("captcha_expired");
      if (challengeAgeMs < -30 * 1000)
        throw new CaptchaVerificationError("captcha_invalid");

      return await dependencies.recordReceipt({
        userId: user.id,
        purpose,
        verificationId: `${parsed.data.hostname}:${parsed.data.challenge_ts}:${user.id}:${purpose}`,
        expiresAt,
      });
    } catch (error) {
      if (error instanceof CaptchaVerificationError) throw error;
      throw new CaptchaVerificationError("captcha_unavailable");
    }
  };
}
