import { describe, expect, it, vi } from "vitest";

import {
  buildOperationalAlert,
  deliverOperationalAlert,
  parseOperationalAlertEnv,
} from "./alerts";

describe("external operational alerts", () => {
  it("builds an environment-separated allowlisted payload", () => {
    const payload = buildOperationalAlert(
      "recovery.failed",
      {
        correlationId: "correlation-1",
        workflow: "recovery",
        status: "error",
        errorCode: "recovery_unavailable",
        latencyMs: 42,
        counts: { failed: 2, nested: { stale: 1 } },
        prompt: "private prompt",
        message: "private message",
        cookie: "private cookie",
        shareUrl: "https://example.test/share/private-token",
        providerPayload: { raw: "private provider response" },
        email: "person@example.test",
      },
      { environment: "preview", owner: "on-call" },
    );
    expect(payload).toEqual({
      schemaVersion: "1",
      event: "recovery.failed",
      severity: "error",
      environment: "preview",
      owner: "on-call",
      correlationId: "correlation-1",
      workflow: "recovery",
      status: "error",
      errorCode: "recovery_unavailable",
      latencyMs: 42,
      counts: { failed: 2, nested: { stale: 1 } },
      occurredAt: expect.any(String),
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /private|person@example|share\/|cookie/i,
    );
  });

  it("requires an HTTPS destination and explicit owner", () => {
    expect(
      parseOperationalAlertEnv({
        OPERATIONAL_ALERT_WEBHOOK_URL: "https://alerts.example.test/trailie",
        OPERATIONAL_ALERT_OWNER: "platform-on-call",
        VERCEL_ENV: "preview",
      }),
    ).toMatchObject({
      enabled: true,
      environment: "preview",
      owner: "platform-on-call",
    });
    expect(() =>
      parseOperationalAlertEnv({
        OPERATIONAL_ALERT_WEBHOOK_URL: "http://alerts.example.test/trailie",
        OPERATIONAL_ALERT_OWNER: "platform-on-call",
      }),
    ).toThrow();
  });

  it("includes only the canonical application link in Production alerts", () => {
    const configuration = parseOperationalAlertEnv({
      OPERATIONAL_ALERT_WEBHOOK_URL: "https://alerts.example.test/trailie",
      OPERATIONAL_ALERT_OWNER: "platform-on-call",
      ALERT_ENVIRONMENT: "production",
      NEXT_PUBLIC_SITE_URL: "https://app.trailiecrew.com",
    });
    expect(
      buildOperationalAlert("database.failed", {}, configuration),
    ).toMatchObject({
      environment: "production",
      applicationUrl: "https://app.trailiecrew.com",
    });
    expect(() =>
      parseOperationalAlertEnv({
        OPERATIONAL_ALERT_WEBHOOK_URL: "https://alerts.example.test/trailie",
        OPERATIONAL_ALERT_OWNER: "platform-on-call",
        ALERT_ENVIRONMENT: "production",
        NEXT_PUBLIC_SITE_URL: "https://preview.trailiecrew.com",
      }),
    ).toThrow(/canonical/i);
  });

  it("does not treat a local optimized runtime as a Production deployment", () => {
    expect(
      parseOperationalAlertEnv({
        APP_ENV: "local",
        NODE_ENV: "production",
        NEXT_PUBLIC_SITE_URL: "https://local.example.test",
      }),
    ).toMatchObject({
      enabled: false,
      applicationUrl: "https://local.example.test",
    });
  });

  it("delivers once with bounded headers and never forwards metadata", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    await expect(
      deliverOperationalAlert(
        "monitoring.synthetic_failure",
        {
          correlationId: "synthetic",
          errorCode: "synthetic_failure",
          body: "must not leave the process",
        },
        {
          configuration: {
            enabled: true,
            webhookUrl: "https://alerts.example.test/trailie",
            webhookSecret: "secret-header-value",
            environment: "preview",
            owner: "platform-on-call",
            applicationUrl: "https://preview.trailiecrew.com",
          },
          fetcher,
        },
      ),
    ).resolves.toEqual({ delivered: true, status: 202 });
    expect(fetcher).toHaveBeenCalledOnce();
    const [, init] = fetcher.mock.calls[0]!;
    expect(init.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer secret-header-value",
    });
    expect(String(init.body)).not.toContain("must not leave");
  });

  it("returns a safe result when disabled or rejected", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      deliverOperationalAlert(
        "recovery.failed",
        {},
        {
          configuration: {
            enabled: false,
            webhookUrl: null,
            webhookSecret: null,
            environment: "development",
            owner: "unassigned",
            applicationUrl: null,
          },
          fetcher,
        },
      ),
    ).resolves.toEqual({ delivered: false, reason: "disabled" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
