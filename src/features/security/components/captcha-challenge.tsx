"use client";

import { Check, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type TurnstileOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  theme: "auto";
  retry: "never";
  action: "create_trip" | "join_trip" | "guest_invite";
};

type TurnstileApi = {
  render: (element: HTMLElement, options: TurnstileOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type CaptchaChallengeProps = {
  onToken: (token: string) => void;
  action: "create_trip" | "join_trip" | "guest_invite";
  siteKey?: string;
  testMode?: boolean;
  scriptReady?: boolean;
};

const scriptId = "trailie-turnstile-script";

/**
 * Deployment consoles frequently store a value with wrapping quotes or a
 * trailing newline. Turnstile rejects those outright, so normalize before use
 * and treat anything still unusable as an absent key rather than a crash.
 */
function normalizeSiteKey(value: string) {
  const trimmed = value.trim().replace(/^["']|["']$/g, "");
  return /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : "";
}

export function CaptchaChallenge({
  onToken,
  action,
  siteKey: rawSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
  testMode = process.env.NEXT_PUBLIC_CAPTCHA_TEST_MODE === "true",
  scriptReady = false,
}: CaptchaChallengeProps) {
  const siteKey = normalizeSiteKey(rawSiteKey);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [ready, setReady] = useState(scriptReady);
  const [retryNonce, setRetryNonce] = useState(0);
  const [status, setStatus] = useState<
    "checking" | "completed" | "expired" | "unavailable"
  >(() => (testMode ? "completed" : siteKey ? "checking" : "unavailable"));

  useEffect(() => {
    if (testMode) {
      onToken("trailie-test-captcha");
      return;
    }
    if (!siteKey) {
      onToken("");
      return;
    }
    if (window.turnstile) {
      queueMicrotask(() => setReady(true));
      return;
    }
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.append(script);
    }
    const handleLoad = () => setReady(true);
    const handleError = () => setStatus("unavailable");
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);
    return () => {
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
    };
  }, [onToken, retryNonce, siteKey, testMode]);

  useEffect(() => {
    if (!ready || !siteKey || !containerRef.current || !window.turnstile)
      return;
    // A rejected site key makes render() throw synchronously. Without this the
    // widget never mounts, error-callback never fires, and the form stays
    // permanently un-submittable with no explanation.
    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token) => {
          onToken(token);
          setStatus("completed");
        },
        "error-callback": () => {
          onToken("");
          setStatus("unavailable");
        },
        "expired-callback": () => {
          onToken("");
          setStatus("expired");
        },
        theme: "auto",
        retry: "never",
        action,
      });
    } catch {
      widgetIdRef.current = null;
      onToken("");
      queueMicrotask(() => setStatus("unavailable"));
      return;
    }
    return () => {
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [action, onToken, ready, siteKey]);

  function retry() {
    onToken("");
    setStatus("checking");
    if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
    else {
      document.getElementById(scriptId)?.remove();
      setReady(false);
      setRetryNonce((value) => value + 1);
    }
  }

  if (status === "unavailable")
    return (
      <div className="border-border rounded-md border p-3 text-sm">
        <p role="status" aria-live="assertive">
          The security check is unavailable. Please try again shortly.
        </p>
        <button
          type="button"
          onClick={retry}
          className="border-border mt-3 min-h-11 rounded-md border px-4 font-semibold"
        >
          Retry security check
        </button>
      </div>
    );

  return (
    <div className="space-y-2">
      <div ref={containerRef} role="group" aria-label="Security check" />
      {/* Reads as a system status line rather than a stray sentence above the
          submit button. Strings and live-region semantics are unchanged. */}
      <p
        role="status"
        aria-live="polite"
        className="text-muted-foreground flex items-center gap-1.5 text-xs leading-5"
      >
        {status === "completed" ? (
          <Check
            aria-hidden="true"
            className="text-positive size-3.5 shrink-0"
          />
        ) : (
          <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        {status === "completed"
          ? "Security check complete."
          : status === "expired"
            ? "The security check expired."
            : "Complete the security check."}
      </p>
      {status === "expired" ? (
        <button
          type="button"
          onClick={retry}
          className="border-border min-h-11 rounded-md border px-4 text-sm font-semibold"
        >
          Retry security check
        </button>
      ) : null}
    </div>
  );
}
