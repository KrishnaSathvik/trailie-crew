"use client";

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

export function CaptchaChallenge({
  onToken,
  action,
  siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
  testMode = process.env.NEXT_PUBLIC_CAPTCHA_TEST_MODE === "true",
  scriptReady = false,
}: CaptchaChallengeProps) {
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
      <p
        role="status"
        aria-live="polite"
        className="text-muted-foreground text-sm"
      >
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
