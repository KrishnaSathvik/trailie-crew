import { describe, expect, it, vi } from "vitest";

import { ensureAnonymousSession } from "./auth";

const session = {
  access_token: "access",
  refresh_token: "refresh",
  user: { id: "user-id" },
};

describe("ensureAnonymousSession", () => {
  it("reuses an existing session", async () => {
    const signInAnonymously = vi.fn();
    const client = {
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session }, error: null }),
        signInAnonymously,
      },
    };

    await expect(ensureAnonymousSession(client, "captcha-token")).resolves.toBe(
      session,
    );
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it("creates an anonymous identity when no session exists", async () => {
    const client = {
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: null }, error: null }),
        signInAnonymously: vi
          .fn()
          .mockResolvedValue({ data: { session }, error: null }),
      },
    };

    await expect(ensureAnonymousSession(client, "captcha-token")).resolves.toBe(
      session,
    );
    expect(client.auth.signInAnonymously).toHaveBeenCalledWith({
      options: { captchaToken: "captcha-token" },
    });
  });

  it("surfaces authentication failures", async () => {
    const error = new Error("anonymous auth disabled");
    const client = {
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: null }, error: null }),
        signInAnonymously: vi
          .fn()
          .mockResolvedValue({ data: { session: null }, error }),
      },
    };

    await expect(
      ensureAnonymousSession(client, "captcha-token"),
    ).rejects.toThrow("anonymous auth disabled");
  });

  it("requires CAPTCHA before creating an anonymous identity", async () => {
    const client = {
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: null }, error: null }),
        signInAnonymously: vi.fn(),
      },
    };

    await expect(ensureAnonymousSession(client, "")).rejects.toThrow(
      "captcha_required",
    );
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
  });
});
