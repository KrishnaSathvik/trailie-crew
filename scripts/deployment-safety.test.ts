import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assertHostedAcceptanceTarget,
  assertLocalDatabaseTarget,
  assertProductionLaunchConfiguration,
  assertProductionReleaseTarget,
} from "./deployment-safety.mjs";

describe("deployment command safety", () => {
  it("disables hosted acceptance until a staging database exists", () => {
    expect(() => assertHostedAcceptanceTarget({ APP_ENV: "preview" })).toThrow(
      /disabled.*staging/i,
    );
  });

  it("allows database reset only for a loopback local target", () => {
    expect(() =>
      assertLocalDatabaseTarget({
        APP_ENV: "local",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
      }),
    ).not.toThrow();
    expect(() =>
      assertLocalDatabaseTarget({
        APP_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      }),
    ).toThrow(/local/i);
  });

  it("requires an explicit approved commit for Production release", () => {
    const release = {
      APP_ENV: "production",
      VERCEL_PROJECT_NAME: "trailie-crew-production",
      SUPABASE_PROJECT_REF: "tkccksmiuucdstvvfglp",
      PRODUCTION_SUPABASE_PROJECT_REF: "tkccksmiuucdstvvfglp",
      PRODUCTION_RELEASE_APPROVED: "true",
      PRODUCTION_RELEASE_COMMIT: "8d54b14bcfa9dfef0e9592437e5cb34db4ead3e5",
      GIT_COMMIT_SHA: "8d54b14bcfa9dfef0e9592437e5cb34db4ead3e5",
    };
    expect(() => assertProductionReleaseTarget(release)).not.toThrow();
    expect(() =>
      assertProductionReleaseTarget({
        ...release,
        SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
        PRODUCTION_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      }),
    ).toThrow(/promoted Supabase/i);
    expect(() =>
      assertProductionReleaseTarget({
        ...release,
        PRODUCTION_RELEASE_COMMIT: "0000000000000000000000000000000000000000",
      }),
    ).toThrow(/commit/i);
  });

  it("keeps Production release blocked until launch-critical configuration exists", () => {
    expect(() =>
      assertProductionLaunchConfiguration({
        APP_ENV: "production",
        SUPABASE_AUTH_CAPTCHA_ENABLED: "false",
      }),
    ).toThrow(/missing|CAPTCHA/i);
  });

  describe("deferred delivery channels", () => {
    const launch = {
      APP_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://tkccksmiuucdstvvfglp.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_live_value",
      SUPABASE_SECRET_KEY: "sb_secret_live_value",
      NEXT_PUBLIC_SITE_URL: "https://app.trailiecrew.com",
      RECOVERY_SECRET: "recovery-secret-value-long-enough-for-launch",
      CRON_SECRET: "cron-secret-value-long-enough",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAAlive",
      TURNSTILE_SECRET_KEY: "0x4AAAAAAAliveSecret",
      TURNSTILE_EXPECTED_HOSTNAME: "app.trailiecrew.com",
      SUPPORT_EMAIL: "support@trailiecrew.com",
      PRIVACY_EMAIL: "privacy@trailiecrew.com",
      SECURITY_EMAIL: "security@trailiecrew.com",
      SUPABASE_AUTH_CAPTCHA_ENABLED: "true",
      MAPBOX_MAPS_ENABLED: "true",
      MAPBOX_GEOCODING_STORAGE_MODE: "temporary",
      OUTBOUND_EMAIL_ENABLED: "false",
      OPERATIONAL_ALERTS_ENABLED: "false",
    };

    it("accepts either map declaration but never permanent geocoding", () => {
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          MAPBOX_MAPS_ENABLED: "false",
          MAPBOX_GEOCODING_STORAGE_MODE: "disabled",
        }),
      ).not.toThrow();
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          MAPBOX_GEOCODING_STORAGE_MODE: "permanent",
        }),
      ).toThrow(/disabled or temporary/i);
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          MAPBOX_MAPS_ENABLED: undefined,
        }),
      ).toThrow(/MAPBOX_MAPS_ENABLED must be declared/i);
    });

    it("allows launch while outbound email and webhook alerts stay deferred", () => {
      expect(() => assertProductionLaunchConfiguration(launch)).not.toThrow();
    });

    it("requires an explicit declaration for each deferred channel", () => {
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          OUTBOUND_EMAIL_ENABLED: undefined,
        }),
      ).toThrow(/OUTBOUND_EMAIL_ENABLED must be declared/i);
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          OPERATIONAL_ALERTS_ENABLED: "yes",
        }),
      ).toThrow(/OPERATIONAL_ALERTS_ENABLED must be declared/i);
    });

    it("enforces outbound email credentials once email is enabled", () => {
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          OUTBOUND_EMAIL_ENABLED: "true",
        }),
      ).toThrow(
        /Outbound email is enabled but missing: EMAIL_PROVIDER_API_KEY, EMAIL_FROM_ADDRESS/,
      );
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          OUTBOUND_EMAIL_ENABLED: "true",
          EMAIL_PROVIDER_API_KEY: "re_live_value",
          EMAIL_FROM_ADDRESS: "crew@trailiecrew.com",
        }),
      ).not.toThrow();
    });

    it("enforces webhook URL, secret, and owner once alerts are enabled", () => {
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          OPERATIONAL_ALERTS_ENABLED: "true",
          OPERATIONAL_ALERT_WEBHOOK_URL: "https://alerts.example.net/hook",
        }),
      ).toThrow(
        /enabled but missing: OPERATIONAL_ALERT_WEBHOOK_SECRET, OPERATIONAL_ALERT_OWNER/,
      );
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          OPERATIONAL_ALERTS_ENABLED: "true",
          OPERATIONAL_ALERT_WEBHOOK_URL: "https://alerts.trailiecrew.com/hook",
          OPERATIONAL_ALERT_WEBHOOK_SECRET: "alert-signing-secret-value",
          OPERATIONAL_ALERT_OWNER: "Krishna Sathvik",
        }),
      ).not.toThrow();
    });

    it("rejects credentials left behind by a disabled channel", () => {
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          EMAIL_PROVIDER_API_KEY: "re_live_value",
        }),
      ).toThrow(
        /Outbound email is disabled but still configured: EMAIL_PROVIDER_API_KEY/,
      );
    });

    it("rejects placeholder launch credentials", () => {
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          TURNSTILE_SECRET_KEY: "turnstile-test-key",
        }),
      ).toThrow(/TURNSTILE_SECRET_KEY is not real/);
      expect(() =>
        assertProductionLaunchConfiguration({
          ...launch,
          OUTBOUND_EMAIL_ENABLED: "true",
          EMAIL_PROVIDER_API_KEY: "replace-me",
          EMAIL_FROM_ADDRESS: "crew@trailiecrew.com",
        }),
      ).toThrow(/EMAIL_PROVIDER_API_KEY is not real/);
    });
  });

  it("pins Production release to a clean commit reachable from origin/main", () => {
    const workflow = readFileSync(
      ".github/workflows/production-release.yml",
      "utf8",
    );
    expect(workflow).toContain('test "$GITHUB_REF" = "refs/heads/main"');
    expect(workflow).toContain(
      'git merge-base --is-ancestor "$PRODUCTION_RELEASE_COMMIT" origin/main',
    );
    expect(workflow).toContain("git diff --exit-code");
    expect(workflow).toContain("git diff --cached --exit-code");
    expect(workflow).toContain('OUTBOUND_EMAIL_ENABLED: "false"');
    expect(workflow).toContain('OPERATIONAL_ALERTS_ENABLED: "false"');
    // The local Supabase shim forces APP_ENV=local, fake AI, CAPTCHA test mode,
    // and the deterministic map adapter, so it can never gate a Production build.
    expect(workflow).toContain("run: pnpm build\n");
    expect(workflow).not.toContain("pnpm build:local");
  });
});
