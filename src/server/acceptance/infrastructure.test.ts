import { describe, expect, it } from "vitest";

import {
  buildInfrastructureAcceptanceReport,
  parseFirstJsonValue,
} from "./infrastructure";

describe("protected infrastructure acceptance report", () => {
  it("parses JSON surrounded by Vercel CLI status output", () => {
    expect(
      parseFirstJsonValue(
        'Retrieving project…\n{"envs":[{"key":"SAFE"}]}\nVercel CLI 56.2.0',
      ),
    ).toEqual({ envs: [{ key: "SAFE" }] });
  });

  it("keeps configured controls distinct from accepted evidence and strips values", () => {
    const report = buildInfrastructureAcceptanceReport({
      environment: "hosted-acceptance",
      envVariables: [
        {
          key: "NEXT_PUBLIC_SUPABASE_URL",
          type: "encrypted",
          value: "credential-material",
        },
        { key: "CAPTCHA_TEST_MODE", type: "encrypted", value: "true" },
        {
          key: "NEXT_PUBLIC_CAPTCHA_TEST_MODE",
          type: "encrypted",
          value: "true",
        },
        {
          key: "RECOVERY_SECRET",
          type: "sensitive",
          value: "credential-material",
        },
      ],
      protection: {
        ssoDeploymentType: "all_except_custom_domains",
        bypassCount: 0,
      },
      firewall: { configured: false, ruleCount: 0 },
      cronPaths: ["/api/internal/recovery", "/api/internal/anonymous-cleanup"],
      evidence: { turnstile: "not_run", cron: "not_run", waf: "not_run" },
    });
    expect(report).toMatchObject({
      schemaVersion: "1",
      environment: "hosted-acceptance",
      protected: true,
      turnstile: {
        configured: false,
        testModeVariablesPresent: true,
        accepted: false,
      },
      cron: { configured: true, accepted: false },
      waf: { configured: false, accepted: false },
      verdict: "blocked",
    });
    expect(report.environmentVariables).toEqual([
      { key: "CAPTCHA_TEST_MODE", type: "encrypted" },
      { key: "NEXT_PUBLIC_CAPTCHA_TEST_MODE", type: "encrypted" },
      { key: "NEXT_PUBLIC_SUPABASE_URL", type: "encrypted" },
      { key: "RECOVERY_SECRET", type: "sensitive" },
    ]);
    expect(JSON.stringify(report)).not.toMatch(/"value"|credential-material/i);
  });

  it("accepts each control only after direct passing evidence", () => {
    const report = buildInfrastructureAcceptanceReport({
      environment: "protected-staging",
      envVariables: [
        { key: "NEXT_PUBLIC_TURNSTILE_SITE_KEY", type: "encrypted" },
        { key: "TURNSTILE_SECRET_KEY", type: "sensitive" },
        { key: "SUPABASE_AUTH_CAPTCHA_ENABLED", type: "encrypted" },
        { key: "CRON_SECRET", type: "sensitive" },
      ],
      protection: {
        ssoDeploymentType: "all_except_custom_domains",
        bypassCount: 0,
      },
      firewall: { configured: true, ruleCount: 2 },
      cronPaths: ["/api/internal/recovery"],
      evidence: { turnstile: "pass", cron: "pass", waf: "pass" },
    });
    expect(report).toMatchObject({
      protected: true,
      turnstile: { configured: true, accepted: true },
      cron: { configured: true, accepted: true },
      waf: { configured: true, accepted: true },
      verdict: "accepted",
    });
  });
});
