"use client";

import { useEffect, useState, useTransition } from "react";

import {
  buttonClassName,
  inputClassName,
} from "@/components/ui/product-controls";

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
      else setNotice("We couldn’t check account deletion right now.");
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
            : "We couldn’t delete your account right now. Try again.",
        );
        return;
      }
      window.location.assign("/");
    });
  }

  return (
    <section
      aria-labelledby="account-deletion-heading"
      className="border-destructive/40 bg-surface-raised rounded-card mt-8 border p-5"
    >
      <p className="eyebrow text-destructive">Danger zone</p>
      <h2
        id="account-deletion-heading"
        className="text-destructive mt-2 text-lg font-semibold"
      >
        Delete account
      </h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">
        This permanently removes your account and access to every Trip. Your
        name is removed from shared Trip history where it must be retained.
      </p>
      {assessment?.hostRooms.length ? (
        <div
          role="alert"
          className="bg-subtle rounded-control mt-4 p-4 text-sm"
        >
          <p className="font-semibold">
            Take care of the Trips you host first:
          </p>
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
        className={`${inputClassName} mt-2`}
      />
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending || blocked || confirmation !== "DELETE MY ACCOUNT"}
          onClick={removeAccount}
          className={buttonClassName({ variant: "destructive" })}
        >
          Delete my account
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmation("");
            setNotice("");
          }}
          className={buttonClassName({ variant: "secondary" })}
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
