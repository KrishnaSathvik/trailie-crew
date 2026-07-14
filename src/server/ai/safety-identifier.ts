import { createHmac } from "node:crypto";

export function createSafetyIdentifier(userId: string, secret: string) {
  if (secret.length < 32)
    throw new Error(
      "OPENAI_SAFETY_HMAC_SECRET must be at least 32 characters.",
    );
  const digest = createHmac("sha256", secret)
    .update(`trailie-safety:v1:${userId}`)
    .digest("hex")
    .slice(0, 56);
  return `trailie_${digest}`;
}
