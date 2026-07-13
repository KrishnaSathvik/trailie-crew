"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useState } from "react";

import { useTransientInvite } from "@/features/trips/components/transient-invite-provider";

export function InvitePanel({
  roomId,
  shortCode,
}: {
  roomId: string;
  shortCode: string;
}) {
  const { getInviteToken } = useTransientInvite();
  const token = getInviteToken(roomId);
  const inviteUrl = token ? `/join/${encodeURIComponent(token)}` : null;
  const [copied, setCopied] = useState(false);

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section
      aria-labelledby="invite-heading"
      className="border-border border-t pt-5"
    >
      <div className="flex items-center gap-2">
        <Link2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
        <h2 id="invite-heading" className="text-sm font-semibold">
          Invite Your Crew
        </h2>
      </div>
      <div className="mt-4">
        <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.14em] uppercase">
          Room code
        </p>
        <p className="mt-1 font-mono text-lg font-semibold tracking-[0.12em]">
          {shortCode}
        </p>
      </div>
      {inviteUrl ? (
        <div className="mt-4">
          <label
            htmlFor="invite-url"
            className="text-muted-foreground text-xs font-medium"
          >
            One-time invitation URL
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="invite-url"
              readOnly
              value={inviteUrl}
              className="border-border bg-background min-h-10 min-w-0 flex-1 rounded-md border px-3 text-xs outline-none focus-visible:ring-2"
            />
            <button
              type="button"
              onClick={copyInvite}
              className="border-border hover:bg-subtle focus-visible:ring-ring inline-flex size-10 shrink-0 items-center justify-center rounded-md border focus-visible:ring-2 focus-visible:outline-none"
              aria-label="Copy invitation URL"
            >
              {copied ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
          <p
            aria-live="polite"
            className="text-muted-foreground mt-2 text-xs leading-5"
          >
            {copied
              ? "Invitation URL copied."
              : "Shown from the creation response only. It may not be recoverable after refresh."}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground mt-4 text-xs leading-5">
          The original private invitation URL is no longer available. Share the
          room code instead.
        </p>
      )}
    </section>
  );
}
