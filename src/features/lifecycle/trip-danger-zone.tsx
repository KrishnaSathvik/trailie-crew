"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";

import {
  buttonClassName,
  inputClassName,
} from "@/components/ui/product-controls";
import { deleteRoomAction, transferRoomHostAction } from "./actions";

type Participant = {
  id: string;
  displayName: string;
  status: string;
  role: string;
};

const messages: Record<string, string> = {
  host_required: "Only the current host can make this change.",
  confirmation_required: "Enter the trip name exactly to confirm deletion.",
  active_member_required: "Choose an active crew member.",
  lifecycle_unavailable: "We couldn’t complete that right now. Try again.",
};

export function TripDangerZone({
  roomId,
  roomName,
  roomCode,
  participants,
  onOpenPlan,
  onOpenAccount,
}: {
  roomId: string;
  roomName: string;
  roomCode?: string;
  participants: Participant[];
  onOpenPlan?: () => void;
  /** Opens account settings inside the dashboard rather than navigating away. */
  onOpenAccount?: () => void;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const members = participants.filter(
    (participant) =>
      participant.status === "active" && participant.role !== "host",
  );

  function transfer() {
    setNotice("");
    startTransition(async () => {
      const result = await transferRoomHostAction({
        roomId,
        participantId: transferTarget,
      });
      if (!result.ok)
        return setNotice(
          messages[result.error] ?? "We couldn’t transfer the host role.",
        );
      setNotice("Host role transferred. Refreshing trip access…");
      router.refresh();
    });
  }

  function removeRoom() {
    setNotice("");
    startTransition(async () => {
      const result = await deleteRoomAction({ roomId, confirmation });
      if (!result.ok)
        return setNotice(
          messages[result.error] ?? "We couldn’t delete this Trip.",
        );
      window.location.assign("/");
    });
  }

  return (
    <section
      aria-labelledby="danger-zone-heading"
      className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8"
    >
      <p className="text-muted-foreground font-mono text-xs tracking-[0.14em] uppercase">
        Trip settings
      </p>
      <h2 id="danger-zone-heading" className="mt-3 text-2xl font-semibold">
        Manage this Trip
      </h2>
      <p className="text-muted-foreground mt-3 text-sm leading-6">
        Everything here affects only this Trip.
      </p>

      <div className="border-border bg-surface-raised rounded-card mt-8 border p-5">
        <p className="eyebrow">Trip details</p>
        <h3 className="mt-2 font-semibold">{roomName}</h3>
        {roomCode ? (
          <p className="text-muted-foreground mt-2 text-sm">
            Trip code{" "}
            <strong className="text-foreground font-mono tracking-[0.12em]">
              {roomCode}
            </strong>
          </p>
        ) : null}
      </div>

      <div className="border-border bg-surface-raised rounded-card mt-6 border p-5">
        <p className="eyebrow">Access &amp; sharing</p>
        <h3 className="mt-2 font-semibold">Share a published Plan</h3>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Create guest links, choose permissions, and manage public sharing from
          the published Plan.
        </p>
        {onOpenPlan ? (
          <button
            type="button"
            onClick={onOpenPlan}
            className={buttonClassName({
              variant: "secondary",
              className: "mt-4",
            })}
          >
            Open Plan sharing
          </button>
        ) : null}
      </div>

      {members.length ? (
        <div className="border-border bg-surface-raised rounded-card mt-6 border p-5">
          <p className="eyebrow">Crew management</p>
          <h3 className="mt-2 font-semibold">Transfer host</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            The new host gains deletion and invitation controls. Your role
            becomes member.
          </p>
          <label
            htmlFor="transfer-host"
            className="mt-4 block text-sm font-medium"
          >
            New host
          </label>
          <select
            id="transfer-host"
            value={transferTarget}
            onChange={(event) => setTransferTarget(event.target.value)}
            className={`${inputClassName} mt-2`}
          >
            <option value="">Choose a crew member</option>
            {members.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.displayName}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !transferTarget}
            onClick={transfer}
            className={buttonClassName({
              variant: "secondary",
              className: "mt-4",
            })}
          >
            Transfer host role
          </button>
        </div>
      ) : (
        <div className="border-border bg-surface-raised rounded-card mt-6 border p-5">
          <p className="eyebrow">Crew management</p>
          <h3 className="mt-2 font-semibold">Host role</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            Invite another crew member before transferring the host role.
          </p>
        </div>
      )}

      <div className="border-destructive/50 rounded-card mt-10 border p-5">
        <p className="eyebrow text-destructive">Danger zone</p>
        <h3 className="text-destructive mt-2 font-semibold">
          Delete this trip
        </h3>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Permanently deletes this Trip, its conversation, itinerary, saved
          places, and sharing links.
        </p>

        {/* The confirmation only appears once deletion is requested. Leaving a
            destructive button and a text field permanently on screen made the
            page read as hostile. */}
        {confirmingDelete ? (
          <>
            <label
              htmlFor="delete-room-confirmation"
              className="mt-4 block text-sm font-medium"
            >
              Type <strong className="text-foreground">{roomName}</strong> to
              confirm
            </label>
            <input
              id="delete-room-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              autoFocus
              className={`${inputClassName} mt-2`}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pending || confirmation !== roomName}
                onClick={removeRoom}
                className={buttonClassName({ variant: "destructive" })}
              >
                Delete permanently
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(false);
                  setConfirmation("");
                  setNotice("");
                }}
                className={buttonClassName({ variant: "secondary" })}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className={buttonClassName({
              variant: "destructive",
              className: "mt-4",
            })}
          >
            Delete trip
          </button>
        )}
      </div>

      <p className="text-muted-foreground mt-8 text-sm">
        Looking for profile or account data settings?{" "}
        {onOpenAccount ? (
          <button
            type="button"
            onClick={onOpenAccount}
            className="text-foreground font-medium underline underline-offset-4"
          >
            Open Account Settings
          </button>
        ) : (
          <Link
            href="/settings"
            className="text-foreground font-medium underline underline-offset-4"
          >
            Open Account Settings
          </Link>
        )}
      </p>
      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm">
        {notice}
      </p>
    </section>
  );
}
