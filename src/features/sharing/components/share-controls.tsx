"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import {
  createPlanShareLinkAction,
  getPlanShareStatusAction,
  revokePlanShareLinkAction,
  type PlanShareStatusView,
} from "../actions";

function defaultExpiry() {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
  value.setSeconds(0, 0);
  return value.toISOString().slice(0, 16);
}

export function ShareControls({
  roomId,
  participantId,
  tripPlanId,
  version,
  isHost,
}: {
  roomId: string;
  participantId: string;
  tripPlanId: string;
  version: number;
  isHost: boolean;
}) {
  const [status, setStatus] = useState<PlanShareStatusView | null>(null);
  const [mode, setMode] = useState<"public_link" | "expiring_link">(
    "public_link",
  );
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const result = await getPlanShareStatusAction(tripPlanId, version);
    if (result.ok) setStatus(result.data);
  }, [tripPlanId, version]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initial);
  }, [refresh]);

  useEffect(() => {
    let active = true;
    let client: ReturnType<typeof createBrowserSupabaseClient>;
    try {
      client = createBrowserSupabaseClient();
    } catch {
      return;
    }
    const channel = client.channel(`room:${roomId}`, {
      config: { private: true, broadcast: { self: false, ack: true } },
    });
    channel.on("broadcast", { event: "plan_share_changed" }, () => {
      if (active) void refresh();
    });
    void (async () => {
      const { data } = await client.auth.getSession();
      if (!active) return;
      await client.realtime.setAuth(data.session?.access_token);
      if (active) channel.subscribe();
    })();
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [refresh, roomId]);

  const active = status?.status === "active";
  async function create() {
    setBusy(true);
    setMessage(null);
    setNewUrl(null);
    const parsedExpiry = mode === "expiring_link" ? new Date(expiry) : null;
    if (parsedExpiry && Number.isNaN(parsedExpiry.getTime())) {
      setMessage("Choose a valid future expiration.");
      setBusy(false);
      return;
    }
    const result = await createPlanShareLinkAction({
      tripPlanId,
      participantId,
      mode,
      expiresAt: parsedExpiry ? parsedExpiry.toISOString() : null,
    });
    if (result.ok) {
      const { shareUrl, ...safeStatus } = result.data;
      setStatus(safeStatus);
      setNewUrl(shareUrl);
      setMessage(
        "New link created. The previous link for this Version no longer works.",
      );
    } else {
      setMessage(
        result.error === "rate_limited"
          ? "Please wait a moment before creating another link."
          : "We couldn’t create the share link right now.",
      );
    }
    setBusy(false);
  }
  async function revoke() {
    if (!status || status.mode === "private" || !("id" in status)) return;
    setBusy(true);
    setNewUrl(null);
    const result = await revokePlanShareLinkAction({
      shareLinkId: status.id,
      participantId,
    });
    if (result.ok) {
      setStatus({
        tripPlanId,
        planVersion: version,
        mode: "private",
        status: "revoked",
      });
      setMessage("Public access is now off for this version.");
    } else setMessage("The link could not be revoked.");
    setBusy(false);
  }
  async function copy() {
    if (!newUrl) return;
    const absolute = new URL(newUrl, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(absolute);
      setMessage("Link copied.");
    } catch {
      setMessage("Copy is unavailable. Select the link and copy it manually.");
    }
  }

  return (
    <section
      aria-label={`Version ${version} sharing and exports`}
      className="border-border bg-background border-b px-5 py-4 sm:px-8"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Share Version {version}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {active && status
              ? `Active ${status.mode === "expiring_link" ? "expiring" : "public"} link`
              : status?.status === "expired"
                ? "Expired link · public access is off"
                : "Private · no public link is active"}
          </p>
          {!isHost ? (
            <p className="text-muted-foreground mt-1 text-xs">
              Only the active host can manage links.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/api/trips/${roomId}/plans/${version}/calendar`}
            prefetch={false}
            className="border-border inline-flex min-h-10 items-center rounded-md border px-3 text-xs font-semibold"
          >
            Download Calendar
          </Link>
          <Link
            href={`/trips/${roomId}/plans/${version}/print`}
            prefetch={false}
            target="_blank"
            rel="noreferrer"
            className="border-border inline-flex min-h-10 items-center rounded-md border px-3 text-xs font-semibold"
          >
            Print or Save PDF
          </Link>
        </div>
      </div>

      {isHost ? (
        <div className="mx-auto mt-4 max-w-5xl">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold">
              Access
              <select
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as "public_link" | "expiring_link")
                }
                className="border-border mt-1 block min-h-10 rounded-md border bg-transparent px-3"
              >
                <option value="public_link">Public link</option>
                <option value="expiring_link">Expiring link</option>
              </select>
            </label>
            {mode === "expiring_link" ? (
              <label className="text-xs font-semibold">
                Expires
                <input
                  type="datetime-local"
                  value={expiry}
                  onChange={(event) => setExpiry(event.target.value)}
                  className="border-border mt-1 block min-h-10 rounded-md border bg-transparent px-3"
                />
              </label>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void create()}
              className="bg-foreground text-background min-h-10 rounded-md px-3 text-xs font-semibold disabled:opacity-50"
            >
              {active ? "Replace link" : "Create share link"}
            </button>
            {active ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void revoke()}
                className="border-border min-h-10 rounded-md border px-3 text-xs font-semibold disabled:opacity-50"
              >
                Revoke link
              </button>
            ) : null}
          </div>
          {newUrl ? (
            <div className="border-foreground mt-4 border-l-2 pl-4">
              <label
                className="text-xs font-semibold"
                htmlFor={`share-url-${tripPlanId}`}
              >
                New link · shown once
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id={`share-url-${tripPlanId}`}
                  readOnly
                  value={newUrl}
                  className="border-border min-h-10 min-w-0 flex-1 rounded-md border bg-transparent px-3 font-mono text-base"
                />
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="border-border min-h-10 rounded-md border px-3 text-xs font-semibold"
                >
                  Copy link
                </button>
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                For privacy, this link is shown only once. You can replace it at
                any time.
              </p>
            </div>
          ) : null}
          {message ? (
            <p role="status" className="mt-3 text-xs font-semibold">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
