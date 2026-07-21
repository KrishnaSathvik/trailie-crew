"use client";

import { Check, ChevronDown, Copy, Link2 } from "lucide-react";
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
    await navigator.clipboard.writeText(
      new URL(inviteUrl, window.location.origin).toString(),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section
      aria-labelledby="invite-heading"
      className="border-border border-t pt-5"
    >
      {/* Collapsed by default: the Trip code is all anyone needs to join, so
          leaving it on screen exposes it in every screenshot and screen share. */}
      <details className="group">
        <summary className="focus-visible:ring-ring rounded-control flex cursor-pointer list-none items-center gap-2 marker:content-none focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <Link2 aria-hidden="true" className="size-4" strokeWidth={1.75} />
          <h2 id="invite-heading" className="text-sm font-semibold">
            Invite your crew
          </h2>
          <ChevronDown
            aria-hidden="true"
            className="text-muted-foreground ml-auto size-4 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="mt-4">
          <p className="text-muted-foreground font-mono text-[0.625rem] tracking-[0.14em] uppercase">
            Trip code
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
              Private invitation link
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="invite-url"
                readOnly
                value={inviteUrl}
                className="border-border bg-background rounded-control focus-visible:ring-ring min-h-10 min-w-0 flex-1 border px-3 text-xs outline-none focus-visible:ring-2"
              />
              <button
                type="button"
                onClick={copyInvite}
                className="border-border hover:bg-subtle focus-visible:ring-ring rounded-control inline-flex size-10 shrink-0 items-center justify-center border focus-visible:ring-2 focus-visible:outline-none"
                aria-label="Copy invitation link"
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
                ? "Invitation link copied."
                : "Copy this private link now, or share the Trip code above."}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-xs leading-5">
            The original invitation link is no longer shown. Share the Trip code
            instead.
          </p>
        )}
      </details>
    </section>
  );
}
