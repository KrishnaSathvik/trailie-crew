"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
  lifecycle_unavailable: "This change is temporarily unavailable. Try again.",
};

export function TripDangerZone({
  roomId,
  roomName,
  participants,
}: {
  roomId: string;
  roomName: string;
  participants: Participant[];
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
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
          messages[result.error] ?? "Host transfer failed safely.",
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
          messages[result.error] ?? "Trip deletion failed safely.",
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
        Host and deletion
      </h2>
      <p className="text-muted-foreground mt-3 text-sm leading-6">
        Export anything you need before deleting. Deletion immediately revokes
        invitations and public shares and cannot be undone.
      </p>

      {members.length ? (
        <div className="border-border mt-8 rounded-lg border p-5">
          <h3 className="font-semibold">Transfer host</h3>
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
            className="border-border bg-background mt-2 min-h-11 w-full rounded-md border px-3"
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
            className="border-border mt-4 min-h-11 rounded-md border px-4 text-sm font-semibold disabled:opacity-50"
          >
            Transfer host role
          </button>
        </div>
      ) : null}

      <div className="border-destructive/50 mt-8 rounded-lg border p-5">
        <h3 className="text-destructive font-semibold">Delete this trip</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          Type <strong className="text-foreground">{roomName}</strong> to
          permanently delete the trip and its room-owned data.
        </p>
        <label
          htmlFor="delete-room-confirmation"
          className="mt-4 block text-sm font-medium"
        >
          Trip name
        </label>
        <input
          id="delete-room-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          className="border-border bg-background mt-2 min-h-11 w-full rounded-md border px-3"
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending || confirmation !== roomName}
            onClick={removeRoom}
            className="bg-destructive text-destructive-foreground min-h-11 rounded-md px-4 text-sm font-semibold disabled:opacity-50"
          >
            Delete trip permanently
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmation("");
              setNotice("");
            }}
            className="border-border min-h-11 rounded-md border px-4 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm">
        {notice}
      </p>
    </section>
  );
}
