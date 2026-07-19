"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { beginGuestSessionAction } from "../actions";

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
        Guest display name
      </label>
      <input
        id="guest-display-name"
        aria-label="Guest display name"
        autoComplete="name"
        required
        maxLength={50}
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        className="border-border mt-2 min-h-11 w-full rounded-md border bg-transparent px-3"
        placeholder="How your comments will appear"
      />
      {message ? (
        <p role="alert" className="mt-3 text-sm font-semibold">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy || !displayName.trim()}
        className="bg-foreground text-background mt-4 min-h-11 rounded-md px-4 text-sm font-semibold disabled:opacity-50"
      >
        Open Version {planVersion}
      </button>
    </form>
  );
}
