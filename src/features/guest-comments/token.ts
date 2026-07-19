import { createHash, randomBytes } from "node:crypto";

const guestTokenPattern = /^[A-Za-z0-9_-]{43}$/;

export function generateGuestToken() {
  return randomBytes(32).toString("base64url");
}

export function hashGuestToken(token: string) {
  if (!guestTokenPattern.test(token)) throw new Error("invalid_guest_token");
  return createHash("sha256").update(token, "utf8").digest("hex");
}
