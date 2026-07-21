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
  });
});
