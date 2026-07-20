import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  convertGuestSuggestionAction,
  dismissGuestSuggestionAction,
  listMemberGuestSuggestionsAction,
} from "../actions";
import { GuestSuggestionsPanel } from "./guest-suggestions-panel";

vi.mock("../actions", () => ({
  convertGuestSuggestionAction: vi.fn(),
  dismissGuestSuggestionAction: vi.fn(),
  listMemberGuestSuggestionsAction: vi.fn(),
}));

const ids = {
  room: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
  participant: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  suggestion: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
  versionOne: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
};
const suggestion = {
  id: ids.suggestion,
  originalPlanVersionId: ids.versionOne,
  originalPlanVersion: 1,
  rebasedToPlanVersionId: null,
  rebasedToPlanVersion: null,
  targetType: "item" as const,
  targetKey: "item:one",
  targetLabel: "Glacier Point sunset",
  suggestionType: "remove_item" as const,
  title: "Skip sunset",
  details: "Use the evening for dinner.",
  proposedDate: null,
  proposedStartTime: null,
  proposedEndTime: null,
  status: "open" as const,
  guestDisplayName: "Jordan",
  dismissedAt: null,
  convertedAt: null,
  revisionRequestId: null,
  createdAt: "2026-07-19T00:10:00.000Z",
  updatedAt: "2026-07-19T00:10:00.000Z",
};

describe("member guest suggestions panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listMemberGuestSuggestionsAction).mockResolvedValue({
      ok: true,
      data: [suggestion],
    });
  });

  it("requires the explicit stale-version rebase confirmation", async () => {
    const warning =
      "This suggestion was made on Version 1. The trip is now on Version 2. Convert it into a new revision request based on the current version?";
    vi.mocked(convertGuestSuggestionAction).mockResolvedValue({
      ok: true,
      data: {
        suggestion,
        requiresRebaseConfirmation: true,
        originalPlanVersion: 1,
        currentPlanVersion: 2,
        warning,
        revisionRequestId: null,
        created: false,
      },
    });

    render(
      <GuestSuggestionsPanel
        roomId={ids.room}
        participantId={ids.participant}
        currentPlanVersion={2}
        onConverted={vi.fn()}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Convert to revision" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(warning);
    expect(convertGuestSuggestionAction).toHaveBeenCalledWith({
      suggestionId: ids.suggestion,
      participantId: ids.participant,
      confirmRebase: false,
    });
  });

  it("dismisses an open suggestion and makes it terminal", async () => {
    vi.mocked(dismissGuestSuggestionAction).mockResolvedValue({
      ok: true,
      data: {
        ...suggestion,
        status: "dismissed",
        dismissedAt: "2026-07-19T00:20:00.000Z",
      },
    });
    render(
      <GuestSuggestionsPanel
        roomId={ids.room}
        participantId={ids.participant}
        currentPlanVersion={1}
        onConverted={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(dismissGuestSuggestionAction).toHaveBeenCalledWith({
        suggestionId: ids.suggestion,
        participantId: ids.participant,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Suggestion dismissed.",
    );
  });
});
