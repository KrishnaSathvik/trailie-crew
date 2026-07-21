import { describe, expect, it, vi } from "vitest";

import { CaptchaVerificationError, createCaptchaVerifier } from "./captcha";

const user = {
  id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  createdAt: "2026-07-15T03:00:00.000Z",
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    now: () => new Date("2026-07-15T03:10:00.000Z"),
    fetch: vi.fn(),
    recordReceipt: vi
      .fn()
      .mockResolvedValue("0198a0b2-07f0-7c80-9d5f-7f9cf7a950b3"),
    secretKey: "turnstile-secret",
    expectedHostname: "preview.trailiecrew.com",
    testMode: false,
    ...overrides,
  };
}

describe("CAPTCHA verifier", () => {
  it("rejects a missing token with a safe required code", async () => {
    const verify = createCaptchaVerifier(dependencies());
    await expect(
      verify({ token: "", purpose: "create_trip", user }),
    ).rejects.toMatchObject({
      code: "captcha_required",
    } satisfies Partial<CaptchaVerificationError>);
  });

  it("uses a deterministic adapter only when explicitly enabled", async () => {
    const deps = dependencies({ testMode: true });
    const verify = createCaptchaVerifier(deps);
    await expect(
      verify({ token: "trailie-test-captcha", purpose: "join_trip", user }),
    ).resolves.toBe("0198a0b2-07f0-7c80-9d5f-7f9cf7a950b3");
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("maps rejected and expired provider tokens safely", async () => {
    const invalid = dependencies({
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["invalid-input-response"],
          }),
          { status: 200 },
        ),
      ),
    });
    await expect(
      createCaptchaVerifier(invalid)({
        token: "bad",
        purpose: "create_trip",
        user,
      }),
    ).rejects.toMatchObject({ code: "captcha_invalid" });

    const expired = dependencies({
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["timeout-or-duplicate"],
          }),
          { status: 200 },
        ),
      ),
    });
    await expect(
      createCaptchaVerifier(expired)({
        token: "old",
        purpose: "join_trip",
        user,
      }),
    ).rejects.toMatchObject({ code: "captcha_expired" });
  });

  it("records a short-lived receipt after provider verification", async () => {
    const deps = dependencies({
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            challenge_ts: "2026-07-15T03:09:30.000Z",
            hostname: "preview.trailiecrew.com",
            action: "create_trip",
          }),
          { status: 200 },
        ),
      ),
    });
    const verify = createCaptchaVerifier(deps);
    await expect(
      verify({ token: "valid", purpose: "create_trip", user }),
    ).resolves.toBe("0198a0b2-07f0-7c80-9d5f-7f9cf7a950b3");
    expect(deps.recordReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        purpose: "create_trip",
        verificationId: expect.stringContaining("preview.trailiecrew.com"),
      }),
    );
  });

  it("rejects hostname and action substitution", async () => {
    for (const response of [
      {
        success: true,
        challenge_ts: "2026-07-15T03:09:30.000Z",
        hostname: "attacker.example",
        action: "create_trip",
      },
      {
        success: true,
        challenge_ts: "2026-07-15T03:09:30.000Z",
        hostname: "preview.trailiecrew.com",
        action: "join_trip",
      },
    ]) {
      const verify = createCaptchaVerifier(
        dependencies({
          fetch: vi
            .fn()
            .mockResolvedValue(
              new Response(JSON.stringify(response), { status: 200 }),
            ),
        }),
      );
      await expect(
        verify({ token: "substituted", purpose: "create_trip", user }),
      ).rejects.toMatchObject({ code: "captcha_invalid" });
    }
  });

  it("rejects an expired challenge even when the provider reports success", async () => {
    const verify = createCaptchaVerifier(
      dependencies({
        fetch: vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              success: true,
              challenge_ts: "2026-07-15T03:04:59.000Z",
              hostname: "preview.trailiecrew.com",
              action: "create_trip",
            }),
            { status: 200 },
          ),
        ),
      }),
    );
    await expect(
      verify({ token: "old", purpose: "create_trip", user }),
    ).rejects.toMatchObject({ code: "captcha_expired" });
  });

  it("fails closed when the provider is unavailable", async () => {
    const verify = createCaptchaVerifier(
      dependencies({
        fetch: vi.fn().mockRejectedValue(new TypeError("network")),
      }),
    );
    await expect(
      verify({ token: "valid", purpose: "create_trip", user }),
    ).rejects.toMatchObject({ code: "captcha_unavailable" });
  });
});
