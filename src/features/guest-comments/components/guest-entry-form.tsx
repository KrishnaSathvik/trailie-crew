"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { beginGuestSessionAction } from "../actions";
import {
  buttonClassName,
  inputClassName,
} from "@/components/ui/product-controls";

export function GuestEntryForm({
  inviteToken,
  planVersion,
}: {
  inviteToken: string;
  planVersion: number;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function begin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await beginGuestSessionAction({
      inviteToken,
      displayName,
    });
    if (result.ok) router.replace(result.data.redirectTo);
    else
      setMessage(
        "This link is expired, revoked, or reached its use limit. Ask the host for a new link.",
      );
    setBusy(false);
  }

  return (
    <form onSubmit={(event) => void begin(event)} className="mt-8">
      <label className="text-sm font-semibold" htmlFor="guest-display-name">
        Your display name
      </label>
      <input
        id="guest-display-name"
        aria-label="Your display name"
        autoComplete="name"
        required
        maxLength={50}
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        className={`${inputClassName} mt-2`}
        placeholder="How the Crew will see your name"
      />
      {message ? (
        <p role="alert" className="mt-3 text-sm font-semibold">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !displayName.trim()}
        className={`${buttonClassName({ variant: "primary" })} mt-4`}
      >
        View Plan Version {planVersion}
      </button>
    </form>
  );
}
