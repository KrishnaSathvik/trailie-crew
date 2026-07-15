import "server-only";

type OperationalMetadata = Record<string, unknown>;

const forbiddenKeys = new Set([
  "apikey",
  "authorization",
  "authheader",
  "body",
  "chatmessage",
  "cookie",
  "cookies",
  "hiddenreasoning",
  "email",
  "ip",
  "ipaddress",
  "memory",
  "message",
  "messages",
  "payload",
  "prompt",
  "providerpayload",
  "providerresponse",
  "rawprompt",
  "reasoning",
  "refreshtoken",
  "secret",
  "session",
  "sessionid",
  "sharetoken",
  "token",
  "url",
  "shareurl",
]);

function normalizedKey(key: string) {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function sanitize(value: unknown, key = "", parentKey = ""): unknown {
  if (
    forbiddenKeys.has(normalizedKey(key)) &&
    !(normalizedKey(parentKey) === "counts" && typeof value === "number")
  )
    return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item, "", key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitize(entryValue, entryKey, key),
      ]),
    );
  }
  if (["string", "number", "boolean"].includes(typeof value) || value === null)
    return value;
  return undefined;
}

export function createCorrelationId() {
  return crypto.randomUUID();
}

const alertEvents = [
  /\.configuration_failed$/,
  /\.failed$/,
  /^auth\.session_refresh_failed$/,
  /^recovery\.stale_jobs_remaining$/,
  /^security\./,
  /^quota\.global_limit_reached$/,
];

export function classifyOperationalEvent(event: string) {
  return alertEvents.some((pattern) => pattern.test(event)) ? "alert" : "info";
}

export function logOperation(event: string, metadata: OperationalMetadata) {
  const safeMetadata = sanitize(metadata) as OperationalMetadata;
  console.info(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      classification: classifyOperationalEvent(event),
      ...safeMetadata,
      event,
    }),
  );
}
