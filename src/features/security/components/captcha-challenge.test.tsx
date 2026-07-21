import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaptchaChallenge } from "./captcha-challenge";

describe("CaptchaChallenge", () => {
  it("announces deterministic completion accessibly", async () => {
    const onToken = vi.fn();
    render(
      <CaptchaChallenge onToken={onToken} action="create_trip" testMode />,
    );
    await waitFor(() =>
      expect(onToken).toHaveBeenCalledWith("trailie-test-captcha"),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/complete/i);
  });

  it("reports unavailable configuration without exposing a secret", () => {
    render(
      <CaptchaChallenge onToken={vi.fn()} action="create_trip" siteKey="" />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/unavailable/i);
    expect(document.body.textContent).not.toContain("secret");
  });

  it("clears expired tokens and supports provider retry", async () => {
    const onToken = vi.fn();
    const reset = vi.fn();
    window.turnstile = {
      render: vi.fn((_element, options) => {
        options.callback("provider-token");
        options["expired-callback"]();
        return "widget-id";
      }),
      reset,
      remove: vi.fn(),
    };
    render(
      <CaptchaChallenge
        onToken={onToken}
        action="join_trip"
        siteKey="site-key"
        scriptReady
      />,
    );
    await waitFor(() => expect(onToken).toHaveBeenLastCalledWith(""));
    expect(window.turnstile.render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ action: "join_trip" }),
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeVisible();
  });

  it("degrades to unavailable when the site key is rejected", async () => {
    const onToken = vi.fn();
    window.turnstile = {
      render: vi.fn(() => {
        throw new Error(
          '[Cloudflare Turnstile] Invalid input for parameter "sitekey".',
        );
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    render(
      <CaptchaChallenge
        onToken={onToken}
        action="create_trip"
        siteKey="0x4AAAAAAAlivekey"
        scriptReady
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/unavailable/i),
    );
    expect(onToken).toHaveBeenLastCalledWith("");
  });

  it("treats a quoted or padded site key as unconfigured", () => {
    const onToken = vi.fn();
    window.turnstile = {
      render: vi.fn(),
      reset: vi.fn(),
      remove: vi.fn(),
    };
    render(
      <CaptchaChallenge
        onToken={onToken}
        action="create_trip"
        siteKey={'  "0x4AAAAAAAlivekey"  '}
        scriptReady
      />,
    );
    expect(window.turnstile.render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ sitekey: "0x4AAAAAAAlivekey" }),
    );
  });
});
