"use client";

import { useCallback, useEffect, useState } from "react";

import type { GuestInviteMetadata, GuestRole } from "../contracts";
import {
  createGuestInviteAction,
  listGuestInvitesAction,
  revokeGuestInviteAction,
  rotateGuestInviteAction,
} from "../actions";

function defaultExpiry() {
  const value = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  value.setSeconds(0, 0);
  return value.toISOString().slice(0, 16);
}

function roleLabel(role: GuestRole) {
  return role === "guest_commenter" ? "Commenter" : "Viewer";
}

export function GuestInviteControls({
  roomId,
  planVersionId,
  planVersion,
  participantId,
  isHost,
}: {
  roomId: string;
  planVersionId: string;
  planVersion: number;
  participantId: string;
  isHost: boolean;
}) {
  const [invites, setInvites] = useState<GuestInviteMetadata[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [role, setRole] = useState<GuestRole>("guest_viewer");
  const [expiry, setExpiry] = useState(defaultExpiry);
  const [newUrl, setNewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listGuestInvitesAction(roomId, planVersion);
    if (result.ok) setInvites(result.data);
  }, [planVersion, roomId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function create() {
    const parsedExpiry = new Date(expiry);
    if (Number.isNaN(parsedExpiry.getTime())) {
      setMessage("Choose a valid future expiration.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setNewUrl(null);
    const result = await createGuestInviteAction({
      planVersionId,
      participantId,
      role,
      expiresAt: parsedExpiry.toISOString(),
    });
    if (result.ok) {
      const { guestUrl, ...metadata } = result.data;
      setInvites((current) => [metadata, ...current]);
      setNewUrl(guestUrl);
      setFormOpen(false);
      setMessage(
        `${roleLabel(metadata.role)} link created for Version ${metadata.planVersion}.`,
      );
    } else {
      setMessage(
        result.error === "rate_limited"
          ? "Guest links are being created too quickly. Try again shortly."
          : "The guest link could not be created.",
      );
    }
    setBusy(false);
  }

  async function rotate(invite: GuestInviteMetadata) {
    setBusy(true);
    setMessage(null);
    setNewUrl(null);
    const result = await rotateGuestInviteAction({
      inviteId: invite.id,
      participantId,
    });
    if (result.ok) {
      const { guestUrl, ...metadata } = result.data;
      setInvites((current) =>
        current.map((value) => (value.id === invite.id ? metadata : value)),
      );
      setNewUrl(guestUrl);
      setMessage("Link rotated. The previous link and its sessions are off.");
    } else {
      setMessage("The guest link could not be rotated.");
    }
    setBusy(false);
  }

  async function revoke(invite: GuestInviteMetadata) {
    setBusy(true);
    setMessage(null);
    setNewUrl(null);
    const result = await revokeGuestInviteAction({
      inviteId: invite.id,
      participantId,
    });
    if (result.ok) {
      setInvites((current) =>
        current.filter((value) => value.id !== invite.id),
      );
      setMessage("Guest access is now off for this link.");
    } else {
      setMessage("The guest link could not be revoked.");
    }
    setBusy(false);
  }

  async function copy() {
    if (!newUrl) return;
    try {
      const absolute = new URL(newUrl, window.location.origin).toString();
      await navigator.clipboard.writeText(absolute);
      setMessage("Guest link copied.");
    } catch {
      setMessage("Copy is unavailable. Select the link and copy it manually.");
    }
  }

  return (
    <section
      aria-label={`Guest access for Version ${planVersion}`}
      className="border-border border-b px-5 py-4 sm:px-8"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">
              Guest access · Version {planVersion}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Viewer links can only read. Commenter links can add plain-text
              comments to this exact version.
            </p>
            {!isHost ? (
              <p className="text-muted-foreground mt-1 text-xs">
                Only the host can create, rotate, or revoke links.
              </p>
            ) : null}
          </div>
          {isHost ? (
            <button
              type="button"
              onClick={() => setFormOpen((value) => !value)}
              className="border-border min-h-10 rounded-md border px-3 text-xs font-semibold"
            >
              Invite guest
            </button>
          ) : null}
        </div>

        {isHost && formOpen ? (
          <div className="bg-subtle mt-4 grid gap-3 rounded-md p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-xs font-semibold">
              Guest permission
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as GuestRole)}
                className="border-border mt-1 block min-h-10 w-full rounded-md border bg-transparent px-3"
              >
                <option value="guest_viewer">Viewer</option>
                <option value="guest_commenter">Commenter</option>
              </select>
            </label>
            <label className="text-xs font-semibold">
              Guest link expires
              <input
                type="datetime-local"
                value={expiry}
                onChange={(event) => setExpiry(event.target.value)}
                className="border-border mt-1 block min-h-10 w-full rounded-md border bg-transparent px-3"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void create()}
              className="bg-foreground text-background min-h-10 rounded-md px-3 text-xs font-semibold disabled:opacity-50"
            >
              Create guest link
            </button>
          </div>
        ) : null}

        {invites.length ? (
          <ul className="border-border mt-4 divide-y border-y">
            {invites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {roleLabel(invite.role)} · {invite.tokenPrefix}…
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Expires {new Date(invite.expiresAt).toLocaleString()} ·{" "}
                    {invite.useCount}/{invite.maxUses} sessions
                  </p>
                </div>
                {isHost ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void rotate(invite)}
                      className="border-border min-h-9 rounded-md border px-3 text-xs font-semibold"
                    >
                      Rotate guest link
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void revoke(invite)}
                      className="min-h-9 px-2 text-xs font-semibold"
                    >
                      Revoke guest link
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {newUrl ? (
          <div className="border-foreground mt-4 border-l-2 pl-4">
            <label className="text-xs font-semibold" htmlFor="new-guest-url">
              New guest link · shown once
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="new-guest-url"
                readOnly
                value={newUrl}
                className="border-border min-h-10 min-w-0 flex-1 rounded-md border bg-transparent px-3 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => void copy()}
                className="border-border min-h-10 rounded-md border px-3 text-xs font-semibold"
              >
                Copy link
              </button>
            </div>
          </div>
        ) : null}
        {message ? (
          <p role="status" className="mt-3 text-xs font-semibold">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
