import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deliverOperationalAlert } from "@/server/operations/alerts";

vi.mock("@/server/operations/alerts", async (load) => {
  const actual = await load<typeof import("@/server/operations/alerts")>();
  return { ...actual, deliverOperationalAlert: vi.fn() };
});

describe("protected operational alert delivery test", () => {
  afterEach(() => {
    delete process.env.OPERATIONAL_ALERT_WEBHOOK_URL;
    delete process.env.OPERATIONAL_ALERT_OWNER;
  });
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(deliverOperationalAlert).mockResolvedValue({
      delivered: true,
      status: 202,
    });
    process.env.RECOVERY_SECRET = "r".repeat(32);
    process.env.OPERATIONAL_ALERT_WEBHOOK_URL =
      "https://alerts.example.test/trailie";
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
