import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const hashPattern = /^[0-9a-f]{64}$/;

export function generateShareToken() {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string) {
  if (
    !tokenPattern.test(token) ||
    Buffer.from(token, "base64url").length !== 32
  )
    throw new Error("invalid_share_token");
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function shareTokenHashesEqual(left: string, right: string) {
  if (!hashPattern.test(left) || !hashPattern.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
