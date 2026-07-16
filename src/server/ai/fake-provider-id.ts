import "server-only";

import { createHash } from "node:crypto";

export function createFakeProviderId(namespace: string, operationKey: string) {
  const digest = createHash("sha256")
    .update(`${namespace}:${operationKey}`)
    .digest("hex")
    .slice(0, 32);
  return `fake_${namespace}_${digest}`;
}
