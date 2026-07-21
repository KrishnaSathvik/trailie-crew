import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deliverOperationalAlert } from "@/server/operations/alerts";

vi.mock("@/server/operations/alerts", async (load) => {
  const actual = await load<typeof import("@/server/operations/alerts")>();
  return { ...actual, deliverOperationalAlert: vi.fn() };
});

// Every alert variable is assigned or cleared explicitly. A deployment platform
// exports an unset secret as an empty string, so inheriting ambient values would
// let the surrounding environment decide whether alerts look configured.
const alertVariables = [
  "OPERATIONAL_ALERT_WEBHOOK_URL",
  "OPERATIONAL_ALERT_WEBHOOK_SECRET",
  "OPERATIONAL_ALERT_OWNER",
  "ALERT_ENVIRONMENT",
] as const;

describe("protected operational alert delivery test", () => {
  afterEach(() => {
    for (const name of alertVariables) delete process.env[name];
  });
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(deliverOperationalAlert).mockResolvedValue({
      delivered: true,
      status: 202,
    });
    for (const name of alertVariables) delete process.env[name];
    process.env.RECOVERY_SECRET = "r".repeat(32);
    process.env.OPERATIONAL_ALERT_WEBHOOK_URL =
      "https://alerts.example.test/trailie";
    process.env.OPERATIONAL_ALERT_WEBHOOK_SECRET = "s".repeat(32);
    process.env.OPERATIONAL_ALERT_OWNER = "platform-on-call";
  });

  it("rejects a request without the recovery secret before delivery", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://preview.example/api/internal/alerts/test", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(401);
    expect(deliverOperationalAlert).not.toHaveBeenCalled();
  });

  it("reports unavailable while alert delivery stays deferred", async () => {
    delete process.env.OPERATIONAL_ALERT_WEBHOOK_URL;
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://preview.example/api/internal/alerts/test", {
        method: "POST",
        headers: { authorization: `Bearer ${"r".repeat(32)}` },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "alert_delivery_unavailable",
    });
    expect(deliverOperationalAlert).not.toHaveBeenCalled();
  });

  it("treats an empty webhook secret as unconfigured, not as a parse failure", async () => {
    process.env.OPERATIONAL_ALERT_WEBHOOK_SECRET = "";
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://preview.example/api/internal/alerts/test", {
        method: "POST",
        headers: { authorization: `Bearer ${"r".repeat(32)}` },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("delivers one content-free synthetic alert", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://preview.example/api/internal/alerts/test", {
        method: "POST",
        headers: { authorization: `Bearer ${"r".repeat(32)}` },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      delivered: true,
    });
    expect(deliverOperationalAlert).toHaveBeenCalledWith(
      "monitoring.synthetic_failure",
      expect.objectContaining({
        errorCode: "synthetic_failure",
        correlationId: expect.any(String),
      }),
    );
  });
});
