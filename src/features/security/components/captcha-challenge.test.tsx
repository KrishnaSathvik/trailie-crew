import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CaptchaChallenge } from "./captcha-challenge";

describe("CaptchaChallenge", () => {
  it("announces deterministic completion accessibly", async () => {
    const onToken = vi.fn();
    render(<CaptchaChallenge onToken={onToken} testMode />);
    await waitFor(() =>
      expect(onToken).toHaveBeenCalledWith("trailie-test-captcha"),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/completed/i);
  });

  it("reports unavailable configuration without exposing a secret", () => {
    render(<CaptchaChallenge onToken={vi.fn()} siteKey="" />);
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
      <CaptchaChallenge onToken={onToken} siteKey="site-key" scriptReady />,
    );
    await waitFor(() => expect(onToken).toHaveBeenLastCalledWith(""));
    expect(screen.getByRole("button", { name: /retry/i })).toBeVisible();
  });
});
