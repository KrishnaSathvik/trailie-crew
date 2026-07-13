"use client";

import {
  createTripInputSchema,
  createTripResultSchema,
  type CreateTripResult,
} from "@trailie/schemas";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { TripActionResult } from "@/features/trips/actions/action-types";
import { createTripAction } from "@/features/trips/actions/trip-actions";
import {
  Field,
  submitClassName,
} from "@/features/trips/components/form-controls";
import { useTransientInvite } from "@/features/trips/components/transient-invite-provider";
import {
  getTripErrorMessage,
  type TripErrorCode,
} from "@/features/trips/errors/trip-errors";
import { ensureAnonymousSession } from "@/lib/supabase/auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type CreateTripFormProps = {
  action?: (input: unknown) => Promise<TripActionResult<CreateTripResult>>;
  ensureSession?: () => Promise<unknown>;
  onCreated?: (result: CreateTripResult) => void;
};

function defaultEnsureSession() {
  return ensureAnonymousSession(createBrowserSupabaseClient());
}

export function CreateTripForm({
  action = createTripAction,
  ensureSession = defaultEnsureSession,
  onCreated,
}: CreateTripFormProps) {
  const router = useRouter();
  const { rememberInviteToken } = useTransientInvite();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<TripErrorCode | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const form = new FormData(event.currentTarget);
    const expectedValue = String(form.get("expectedTravelers") ?? "").trim();
    const parsed = createTripInputSchema.safeParse({
      tripName: form.get("tripName"),
      displayName: form.get("displayName"),
      expectedTravelers: expectedValue ? Number(expectedValue) : null,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0]);
        nextErrors[field] =
          field === "tripName"
            ? "Enter a Trip name."
            : field === "displayName"
              ? "Enter your display name."
              : "Expected travelers must be between 1 and 50.";
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
      await ensureSession();
      const result = await action(parsed.data);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }

      const validated = createTripResultSchema.safeParse(result.data);
      if (!validated.success) {
        setError("invalid_server_response");
        return;
      }

      if (onCreated) {
        onCreated(validated.data);
      } else {
        rememberInviteToken(validated.data.roomId, validated.data.inviteToken);
        router.push(`/trips/${encodeURIComponent(validated.data.roomId)}`);
      }
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
          <p className="font-semibold">We could not create the Trip.</p>
          <p className="text-muted-foreground">{getTripErrorMessage(error)}</p>
        </div>
      ) : null}
      <Field
        id="tripName"
        name="tripName"
        label="Trip name"
        autoComplete="off"
        maxLength={100}
        placeholder="Boundary Waters weekend"
        error={fieldErrors.tripName}
      />
      <Field
        id="displayName"
        name="displayName"
        label="Your display name"
        autoComplete="nickname"
        maxLength={50}
        placeholder="Maya"
        error={fieldErrors.displayName}
      />
      <Field
        id="expectedTravelers"
        name="expectedTravelers"
        label="Expected travelers (optional)"
        hint="A rough headcount is enough. You can leave this blank."
        type="number"
        inputMode="numeric"
        min={1}
        max={50}
        placeholder="4"
        error={fieldErrors.expectedTravelers}
      />
      <button type="submit" disabled={pending} className={submitClassName}>
        {pending ? (
          <>
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Creating Trip…
          </>
        ) : (
          <>
            Create Trip
            <ArrowRight aria-hidden="true" className="size-4" />
          </>
        )}
      </button>
    </form>
  );
}
