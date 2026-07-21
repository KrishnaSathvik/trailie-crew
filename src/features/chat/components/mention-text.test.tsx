import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MentionText } from "./mention-text";

const participants = [
  { id: "p1", displayName: "family trip" },
  { id: "p2", displayName: "Sam" },
];

describe("MentionText", () => {
  it("renders a crew mention and a Trailie mention as distinct chips", () => {
    render(
      <MentionText
        body="@Sam ask @trailie about it"
        participants={participants}
        currentParticipantId="p9"
      />,
    );
    expect(screen.getByText("@Sam")).toBeVisible();
    expect(screen.getByText("@Trailie")).toBeVisible();
  });

  it("styles your own mention more strongly than someone else's", () => {
    const { rerender } = render(
      <MentionText
        body="@Sam hi"
        participants={participants}
        currentParticipantId="p9"
      />,
    );
    const other = screen.getByText("@Sam").className;

    rerender(
      <MentionText
        body="@Sam hi"
        participants={participants}
        currentParticipantId="p2"
      />,
    );
    const self = screen.getByText("@Sam").className;

    expect(self).not.toEqual(other);
    expect(self).toContain("bg-accent-soft");
  });

  it("renders the participant's real capitalization", () => {
    render(
      <MentionText
        body="@FAMILY TRIP"
        participants={participants}
        currentParticipantId="p9"
      />,
    );
    expect(screen.getByText("@family trip")).toBeVisible();
  });

  it("renders plain bodies unchanged without participants", () => {
    render(<MentionText body="no mentions here" />);
    expect(screen.getByText("no mentions here")).toBeVisible();
  });
});
