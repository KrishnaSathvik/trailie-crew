"use client";

import { useState } from "react";

import {
  createGuestSuggestionAction,
  deleteGuestSuggestionAction,
  updateGuestSuggestionAction,
} from "../actions";
import type {
  GuestSuggestion,
  GuestSuggestionTargetType,
  GuestSuggestionType,
} from "../contracts";

const labels: Record<GuestSuggestionType, string> = {
  add_item: "Add an item",
  remove_item: "Remove this item",
  replace_item: "Replace this item",
  reschedule_item: "Reschedule this item",
  move_item: "Move this item",
  update_note: "Update its note",
  change_route: "Change the route",
  general: "General suggestion",
};

function allowedTypes(targetType: GuestSuggestionTargetType) {
  if (targetType === "plan")
    return ["add_item", "general"] satisfies GuestSuggestionType[];
  if (targetType === "day")
    return ["add_item", "general"] satisfies GuestSuggestionType[];
  return [
    "remove_item",
    "replace_item",
    "reschedule_item",
    "move_item",
    "update_note",
    "change_route",
    "general",
  ] satisfies GuestSuggestionType[];
}

export function SuggestionThread({
  target,
  initialSuggestions,
}: {
  target: {
    type: GuestSuggestionTargetType;
    key: string | null;
    label: string;
  };
  initialSuggestions: GuestSuggestion[];
}) {
  const options = allowedTypes(target.type);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GuestSuggestion | null>(null);
  const [suggestionType, setSuggestionType] = useState<GuestSuggestionType>(
    options[0],
  );
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [proposedDate, setProposedDate] = useState("");
  const [proposedStartTime, setProposedStartTime] = useState("");
  const [proposedEndTime, setProposedEndTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function reset() {
    setEditing(null);
    setFormOpen(false);
    setTitle("");
    setDetails("");
    setProposedDate("");
    setProposedStartTime("");
    setProposedEndTime("");
  }

  function edit(value: GuestSuggestion) {
    setEditing(value);
    setTitle(value.title);
    setDetails(value.details);
    setProposedDate(value.proposedDate ?? "");
    setProposedStartTime(value.proposedStartTime ?? "");
    setProposedEndTime(value.proposedEndTime ?? "");
    setFormOpen(true);
    setMessage(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const shared = {
      title,
      details,
      proposedDate: proposedDate || null,
      proposedStartTime: proposedStartTime || null,
      proposedEndTime: proposedEndTime || null,
    };
    const result = editing
      ? await updateGuestSuggestionAction({
          suggestionId: editing.id,
          ...shared,
        })
      : await createGuestSuggestionAction({
          targetType: target.type,
          targetKey: target.key,
          suggestionType,
          ...shared,
        });
    if (result.ok) {
      setSuggestions((current) =>
        editing
          ? current.map((value) =>
              value.id === result.data.id ? result.data : value,
            )
          : [result.data, ...current],
      );
      reset();
      setMessage(
        editing ? "Suggestion updated." : "Suggestion sent for crew review.",
      );
    } else {
      setMessage(
        result.error === "rate_limited"
          ? "Suggestions are being sent too quickly. Try again shortly."
          : "This suggestion could not be saved.",
      );
    }
    setBusy(false);
  }

  async function remove(value: GuestSuggestion) {
    setBusy(true);
    setMessage(null);
    const result = await deleteGuestSuggestionAction({
      suggestionId: value.id,
    });
    if (result.ok) {
      setSuggestions((current) =>
        current.filter((candidate) => candidate.id !== value.id),
      );
      setMessage("Suggestion deleted.");
    } else {
      setMessage("Only your open suggestions can be deleted.");
    }
    setBusy(false);
  }

  return (
    <section
      aria-label={`Suggestions for ${target.label}`}
      className="border-border mt-4 rounded-md border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] uppercase">
          Guest suggestions
        </p>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen((value) => !value);
            setMessage(null);
          }}
          className="border-border min-h-9 rounded-md border px-3 text-xs font-semibold"
        >
          Suggest a change
        </button>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Suggestions never change the trip directly. The crew must convert one
        into its normal approval workflow.
      </p>
      {formOpen ? (
        <form className="mt-4 space-y-3" onSubmit={(event) => void save(event)}>
          {!editing ? (
            <label className="block text-xs font-semibold">
              Suggestion type
              <select
                aria-label={`Suggestion type for ${target.label}`}
                value={suggestionType}
                onChange={(event) =>
                  setSuggestionType(event.target.value as GuestSuggestionType)
                }
                className="border-border mt-1 min-h-10 w-full rounded-md border bg-transparent px-3"
              >
                {options.map((value) => (
                  <option key={value} value={value}>
                    {labels[value]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="block text-xs font-semibold">
            Concise title
            <input
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="border-border mt-1 min-h-10 w-full rounded-md border bg-transparent px-3"
            />
          </label>
          <label className="block text-xs font-semibold">
            Details
            <textarea
              required
              maxLength={2000}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              className="border-border mt-1 min-h-24 w-full rounded-md border bg-transparent p-3"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold">
              Proposed date
              <input
                type="date"
                value={proposedDate}
                onChange={(event) => setProposedDate(event.target.value)}
                className="border-border mt-1 min-h-10 w-full rounded-md border bg-transparent px-2"
              />
            </label>
            <label className="text-xs font-semibold">
              Start time
              <input
                type="time"
                value={proposedStartTime}
                onChange={(event) => setProposedStartTime(event.target.value)}
                className="border-border mt-1 min-h-10 w-full rounded-md border bg-transparent px-2"
              />
            </label>
            <label className="text-xs font-semibold">
              End time
              <input
                type="time"
                value={proposedEndTime}
                onChange={(event) => setProposedEndTime(event.target.value)}
                className="border-border mt-1 min-h-10 w-full rounded-md border bg-transparent px-2"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="bg-foreground text-background min-h-9 rounded-md px-3 text-xs font-semibold disabled:opacity-50"
            >
              {editing ? "Save suggestion" : "Submit suggestion"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="min-h-9 px-2 text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {suggestions.length ? (
        <ul className="border-border mt-4 divide-y border-t">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{suggestion.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {labels[suggestion.suggestionType]} · Version{" "}
                    {suggestion.originalPlanVersion} · {suggestion.status}
                  </p>
                </div>
                {suggestion.isOwn && suggestion.status === "open" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => edit(suggestion)}
                      className="min-h-8 text-xs font-semibold"
                    >
                      Edit suggestion
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(suggestion)}
                      className="min-h-8 text-xs font-semibold"
                    >
                      Delete suggestion
                    </button>
                  </div>
                ) : null}
              </div>
              <p className="mt-2 text-sm">{suggestion.details}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className="mt-3 text-xs font-semibold" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
