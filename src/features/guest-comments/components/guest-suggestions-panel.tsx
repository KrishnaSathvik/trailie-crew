"use client";

import { useCallback, useEffect, useState } from "react";

import {
  convertGuestSuggestionAction,
  dismissGuestSuggestionAction,
  listMemberGuestSuggestionsAction,
} from "../actions";
import type { GuestSuggestion, GuestSuggestionStatus } from "../contracts";

const filters: Array<{ value: GuestSuggestionStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "converted", label: "Converted" },
  { value: "dismissed", label: "Dismissed" },
];

export function GuestSuggestionsPanel({
  roomId,
  participantId,
  currentPlanVersion,
  onConverted,
}: {
  roomId: string;
  participantId: string;
  currentPlanVersion: number;
  onConverted: () => Promise<void>;
}) {
  const [suggestions, setSuggestions] = useState<GuestSuggestion[]>([]);
  const [filter, setFilter] = useState<GuestSuggestionStatus>("open");
  const [confirming, setConfirming] = useState<{
    suggestion: GuestSuggestion;
    warning: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listMemberGuestSuggestionsAction(roomId);
    if (result.ok) setSuggestions(result.data);
  }, [roomId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function convert(suggestion: GuestSuggestion, confirmRebase: boolean) {
    setBusy(true);
    setMessage(null);
    const result = await convertGuestSuggestionAction({
      suggestionId: suggestion.id,
      participantId,
      confirmRebase,
    });
    if (!result.ok) {
      setMessage(
        result.error === "suggestion_no_longer_applies"
          ? "This suggestion no longer applies cleanly. Rewrite or dismiss it."
          : "This suggestion could not be converted.",
      );
    } else if (result.data.requiresRebaseConfirmation) {
      setConfirming({
        suggestion,
        warning:
          result.data.warning ??
          `This suggestion was made on Version ${suggestion.originalPlanVersion}. The trip is now on Version ${currentPlanVersion}. Convert it into a new revision request based on the current version?`,
      });
    } else {
      setConfirming(null);
      setSuggestions((current) =>
        current.map((value) =>
          value.id === result.data.suggestion.id
            ? result.data.suggestion
            : value,
        ),
      );
      setMessage("Converted into the normal crew revision workflow.");
      await onConverted();
    }
    setBusy(false);
  }

  async function dismiss(suggestion: GuestSuggestion) {
    setBusy(true);
    setMessage(null);
    const result = await dismissGuestSuggestionAction({
      suggestionId: suggestion.id,
      participantId,
    });
    if (result.ok) {
      setSuggestions((current) =>
        current.map((value) =>
          value.id === result.data.id ? result.data : value,
        ),
      );
      setMessage("Suggestion dismissed.");
    } else {
      setMessage("This suggestion could not be dismissed.");
    }
    setBusy(false);
  }

  const visible = suggestions.filter(
    (suggestion) => suggestion.status === filter,
  );
  return (
    <section
      aria-label="Guest suggestions"
      className="border-border border-b px-5 py-4 sm:px-8"
    >
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Guest suggestions</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Review exact-version suggestions before converting one into the
              existing crew revision workflow.
            </p>
          </div>
          <div className="flex gap-1" aria-label="Suggestion filters">
            {filters.map((value) => (
              <button
                key={value.value}
                type="button"
                aria-pressed={filter === value.value}
                onClick={() => setFilter(value.value)}
                className={`min-h-9 rounded-md px-3 text-xs font-semibold ${
                  filter === value.value
                    ? "bg-foreground text-background"
                    : "border-border border"
                }`}
              >
                {value.label}
              </button>
            ))}
          </div>
        </div>
        {confirming ? (
          <div className="border-foreground mt-4 rounded-md border-2 p-4">
            <p className="text-sm font-semibold" role="alert">
              {confirming.warning}
            </p>
            <p className="text-muted-foreground mt-2 text-xs">
              Trailie will re-resolve the target and stop safely if it no longer
              applies.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void convert(confirming.suggestion, true)}
                className="bg-foreground text-background min-h-10 rounded-md px-3 text-xs font-semibold disabled:opacity-50"
              >
                Confirm and create revision
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="min-h-10 px-2 text-xs font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {visible.length ? (
          <ul className="border-border mt-4 divide-y border-y">
            {visible.map((suggestion) => {
              const stale =
                suggestion.originalPlanVersion !== currentPlanVersion;
              return (
                <li key={suggestion.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-2xl">
                      <p className="text-sm font-semibold">
                        {suggestion.title}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {suggestion.guestDisplayName} · Version{" "}
                        {suggestion.originalPlanVersion} ·{" "}
                        {suggestion.suggestionType.replaceAll("_", " ")} ·{" "}
                        {suggestion.targetLabel ?? "whole plan"}
                      </p>
                      <p className="mt-2 text-sm">{suggestion.details}</p>
                      {stale && suggestion.status === "open" ? (
                        <p className="border-foreground mt-3 border-l-2 pl-3 text-xs font-semibold">
                          Stale-version warning: current trip is Version{" "}
                          {currentPlanVersion}. Explicit rebase confirmation is
                          required.
                        </p>
                      ) : null}
                      {suggestion.status === "converted" ? (
                        <p className="mt-3 text-xs font-semibold">
                          Converted from Version{" "}
                          {suggestion.originalPlanVersion} to revision base
                          Version {suggestion.rebasedToPlanVersion}.
                        </p>
                      ) : null}
                    </div>
                    {suggestion.status === "open" ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void convert(suggestion, false)}
                          className="bg-foreground text-background min-h-9 rounded-md px-3 text-xs font-semibold disabled:opacity-50"
                        >
                          Convert to revision
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void dismiss(suggestion)}
                          className="min-h-9 px-2 text-xs font-semibold"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : suggestion.revisionRequestId ? (
                      <button
                        type="button"
                        onClick={() => void onConverted()}
                        className="border-border min-h-9 rounded-md border px-3 text-xs font-semibold"
                      >
                        Open revision request
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-4 text-xs">
            No {filter} guest suggestions.
          </p>
        )}
        {message ? (
          <p className="mt-3 text-xs font-semibold" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
