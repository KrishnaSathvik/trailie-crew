"use client";

import { useEffect, useState, useTransition } from "react";

import {
  assessAccountDeletionAction,
  deleteAccountAction,
  type AccountDeletionAssessment,
} from "./actions";

export function AccountDangerZone() {
  const [assessment, setAssessment] =
    useState<AccountDeletionAssessment | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void assessAccountDeletionAction().then((result) => {
      if (!active) return;
      if (result.ok) setAssessment(result.data);
      else setNotice("Account deletion status is temporarily unavailable.");
    });
    return () => {
      active = false;
    };
  }, []);

  const blocked = Boolean(
    assessment?.soleHostRooms.length || assessment?.hostRooms.length,
  );
  function removeAccount() {
    setNotice("");
    startTransition(async () => {
      const result = await deleteAccountAction({ confirmation });
      if (!result.ok) {
        setNotice(
          result.error === "host_transfer_or_room_deletion_required"
            ? "Transfer or delete every trip you host first."
            : "Account deletion failed safely. Try again.",
        );
        return;
      }
      window.location.assign("/");
    });
  }

  return (
    <section
      aria-labelledby="account-deletion-heading"
      className="border-destructive/50 mt-10 rounded-lg border p-5"
    >
      <h2
        id="account-deletion-heading"
        className="text-destructive text-lg font-semibold"
      >
        Delete account
      </h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        This removes your anonymous account, memberships, private participant
        memory, and active access. Shared history is de-attributed where
        retained.
      </p>
      {assessment?.hostRooms.length ? (
        <div role="alert" className="bg-subtle mt-4 rounded-md p-4 text-sm">
          <p className="font-semibold">Resolve hosted trips first:</p>
          <ul className="mt-2 list-disc pl-5">
            {assessment.hostRooms.map((room) => (
              <li key={room.id}>{room.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <label
        htmlFor="delete-account-confirmation"
        className="mt-5 block text-sm font-medium"
      >
        Type DELETE MY ACCOUNT
      </label>
      <input
        id="delete-account-confirmation"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        autoComplete="off"
        className="border-border bg-background mt-2 min-h-11 w-full rounded-md border px-3"
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending || blocked || confirmation !== "DELETE MY ACCOUNT"}
          onClick={removeAccount}
          className="bg-destructive text-destructive-foreground min-h-11 rounded-md px-4 text-sm font-semibold disabled:opacity-50"
        >
          Delete my account
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
      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm">
        {notice}
      </p>
    </section>
  );
}
