"use client";

import {
  joinTripInputSchema,
  joinTripResultSchema,
  type JoinTripResult,
} from "@trailie/schemas";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { TripActionResult } from "@/features/trips/actions/action-types";
import { CaptchaChallenge } from "@/features/security/components/captcha-challenge";
import { joinTripAction } from "@/features/trips/actions/trip-actions";
import {
  Field,
  submitClassName,
} from "@/features/trips/components/form-controls";
import {
  getTripErrorMessage,
  type TripErrorCode,
} from "@/features/trips/errors/trip-errors";
import { parseInviteValue } from "@/features/trips/schemas/invite-value";
import { ensureAnonymousSession } from "@/lib/supabase/auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type JoinTripFormProps = {
  initialInviteValue?: string;
  action?: (input: unknown) => Promise<TripActionResult<JoinTripResult>>;
  ensureSession?: (captchaToken: string) => Promise<unknown>;
  onJoined?: (result: JoinTripResult) => void;
};

function defaultEnsureSession(captchaToken: string) {
  return ensureAnonymousSession(createBrowserSupabaseClient(), captchaToken);
}

export function JoinTripForm({
  initialInviteValue,
  action = joinTripAction,
  ensureSession = defaultEnsureSession,
  onJoined,
}: JoinTripFormProps) {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<TripErrorCode | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [captchaToken, setCaptchaToken] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = new FormData(event.currentTarget);

    let inviteValue: string;
    try {
      inviteValue = parseInviteValue(
        initialInviteValue ?? String(form.get("inviteValue") ?? ""),
      );
    } catch {
      setFieldErrors({
        inviteValue: "Enter a valid Trip code or invitation link.",
      });
      setError("invalid_input");
      return;
    }

    const parsed = joinTripInputSchema.safeParse({
      inviteValue,
      displayName: form.get("displayName"),
    });
    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        nextErrors[field] =
          field === "displayName"
            ? "Enter your display name."
            : "Enter a valid Trip code or invitation link.";
      }
      setFieldErrors(nextErrors);
      setError("invalid_input");
      return;
    }

    submitting.current = true;
    setPending(true);
    setFieldErrors({});
    setError(null);
    try {
      await ensureSession(captchaToken);
      const result = await action({ ...parsed.data, captchaToken });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      const validated = joinTripResultSchema.safeParse(result.data);
      if (!validated.success) {
        setError("invalid_server_response");
        return;
      }
      if (onJoined) onJoined(validated.data);
      else router.push(`/trips/${encodeURIComponent(validated.data.roomId)}`);
    } catch {
      setError("authentication_required");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-6">
      {error ? (
        <div
          role="alert"
          tabIndex={-1}
          className="border-foreground border-l-2 pl-4 text-sm leading-6"
        >
          <p className="font-semibold">We could not join the Trip.</p>
          <p className="text-muted-foreground">{getTripErrorMessage(error)}</p>
        </div>
      ) : null}
      {initialInviteValue ? (
        <div className="bg-subtle rounded-md px-4 py-3 text-sm">
          <p className="font-semibold">Ready to join</p>
          <p className="text-muted-foreground mt-1">
            This link opens the shared Trip. Choose the name your crew will see.
          </p>
        </div>
      ) : (
        <Field
          id="inviteValue"
          name="inviteValue"
          label="Trip code or invitation link"
          autoComplete="off"
          spellCheck={false}
          placeholder="ABCD2345 or an invitation link"
          error={fieldErrors.inviteValue}
        />
      )}
      <Field
        id="displayName"
        name="displayName"
        label="Your display name"
        autoComplete="nickname"
        maxLength={50}
        placeholder="Leo"
        error={fieldErrors.displayName}
      />
      <CaptchaChallenge onToken={setCaptchaToken} />
      <button type="submit" disabled={pending} className={submitClassName}>
        {pending ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Joining Trip…
          </>
        ) : (
          <>
            Join Trip
            <ArrowRight aria-hidden="true" className="size-4" />
          </>
        )}
      </button>
    </form>
  );
}
