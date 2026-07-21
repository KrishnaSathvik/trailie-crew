import { describe, expect, it } from "vitest";

import {
  assertHostedAcceptanceTarget,
  assertLocalDatabaseTarget,
  assertProductionLaunchConfiguration,
  assertProductionReleaseTarget,
} from "./deployment-safety.mjs";

const preview = {
  APP_ENV: "preview",
  VERCEL_PROJECT_NAME: "trailie-crew-preview",
  SUPABASE_PROJECT_REF: "tkccksmiuucdstvvfglp",
  PRODUCTION_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
};

describe("deployment command safety", () => {
  it("allows hosted acceptance only against the exact Preview stack", () => {
    expect(() => assertHostedAcceptanceTarget(preview)).not.toThrow();
    expect(() =>
      assertHostedAcceptanceTarget({
        ...preview,
        APP_ENV: "production",
        SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      }),
    ).toThrow(/Preview/i);
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
      SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      PRODUCTION_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      PRODUCTION_RELEASE_APPROVED: "true",
      PRODUCTION_RELEASE_COMMIT: "8d54b14bcfa9dfef0e9592437e5cb34db4ead3e5",
      GIT_COMMIT_SHA: "8d54b14bcfa9dfef0e9592437e5cb34db4ead3e5",
    };
    expect(() => assertProductionReleaseTarget(release)).not.toThrow();
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
});
