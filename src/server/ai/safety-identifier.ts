import { createHmac } from "node:crypto";

export function createSafetyIdentifier(userId: string, secret: string) {
  if (secret.length < 32)
    throw new Error(
      "OPENAI_SAFETY_HMAC_SECRET must be at least 32 characters.",
    );
  return `trailie_${createHmac("sha256", secret).update(`trailie-safety:v1:${userId}`).digest("hex")}`;
}
